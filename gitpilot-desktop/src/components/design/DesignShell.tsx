import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Archive, ArrowDown, ArrowLeft, BookOpen, CaretDown as ChevronDown, CaretLeft as ChevronLeft, CaretRight as ChevronRight, ChatCircleDots, Check, ClockCounterClockwise as History, Code as Code2, CursorClick, FileText, FloppyDisk as Save, Folder, FrameCorners, Hand, Image as ImageIcon, ListChecks, CircleNotch as Loader2, Monitor, Paperclip, PenNib, PencilSimple, Plus, SelectionAll, SidebarSimple, PaperPlaneTilt as Send, Sparkle as Sparkles, Square, Trash as Trash2, X } from '@phosphor-icons/react';
import { TargetTitleBar } from '@/src/components/desktop/TargetTitleBar';
import { ModelPicker } from '@/src/components/ModelPicker';
import { Button } from '@/src/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createDefaultProjectGuidelines, type DesignProjectGuidelines } from '@/src/design/design-types';
import { getCanvasDocument } from '@/src/design/canvas-document';
import type { CanvasNode, CanvasNodeType, CanvasPathSpec, CanvasTransform } from '@/src/design/canvas-types';
import { isTauriEnv, rpc } from '@/src/rpc/bridge';
import type { AttachmentInput, PreparedAttachment } from '@/src/rpc/types';
import { listDesignProjectHistory, useDesignStore } from '@/src/store/design';
import { useThemeStore } from '@/src/store/theme';
import { DesignLandingBackground } from './DesignLandingBackground';
import { DesignLandingLogo } from './DesignLandingLogo';
import { DesignPlanProgressStatus } from './DesignPlanProgressStatus';
import { DesignPresetPicker } from './DesignPresetPicker';
import { DesignVersionManager } from './DesignVersionManager';
import { DesignCanvasKitBoard, type DesignCanvasTool } from './DesignCanvasKitBoard';
import styles from './DesignShell.module.css';

function formatProjectHistoryTime(timestamp: number | null): string {
	if (!timestamp) return '暂无活动';
	const elapsed = Math.max(0, Date.now() - timestamp);
	if (elapsed < 60_000) return '刚刚打开';
	if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
	if (elapsed < 86_400_000) return '今天打开';
	return new Date(timestamp).toLocaleDateString('zh-CN');
}

const FOLLOW_LATEST_THRESHOLD_PX = 64;
const DESIGN_RIGHT_WIDTH_LIMITS = { min: 280, max: 520 } as const;

/**
 * Design 两个输出面板分别维护跟随状态，用户查看历史时不被后续 token 抢回视口。
 * 流式内容更新只触发仍处于跟随状态的面板，回到最新按钮会重新启用跟随。
 */
function useFollowOutputScroll<T extends HTMLElement>({ trigger, resetKey }: { trigger: string | number; resetKey: string | number | null }) {
	const viewportRef = useRef<T | null>(null);
	const followingRef = useRef(true);
	const programmaticScrollRef = useRef(false);
	const [isFollowing, setIsFollowing] = useState(true);

	const updateFollowing = useCallback((next: boolean) => {
		followingRef.current = next;
		setIsFollowing((current) => current === next ? current : next);
	}, []);

	const scrollToLatest = useCallback(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		updateFollowing(true);
		programmaticScrollRef.current = true;
		viewport.scrollTo({ top: Math.max(0, viewport.scrollHeight - viewport.clientHeight), behavior: 'smooth' });
		window.setTimeout(() => {
			programmaticScrollRef.current = false;
			const current = viewportRef.current;
			if (!current) return;
			updateFollowing(current.scrollHeight - current.scrollTop - current.clientHeight <= FOLLOW_LATEST_THRESHOLD_PX);
		}, 700);
	}, [updateFollowing]);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const updateFromScroll = () => {
			if (programmaticScrollRef.current) return;
			updateFollowing(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= FOLLOW_LATEST_THRESHOLD_PX);
		};
		const stopProgrammaticScroll = () => {
			if (!programmaticScrollRef.current) return;
			programmaticScrollRef.current = false;
			updateFollowing(false);
		};
		viewport.addEventListener('scroll', updateFromScroll, { passive: true });
		viewport.addEventListener('wheel', stopProgrammaticScroll, { passive: true });
		viewport.addEventListener('touchstart', stopProgrammaticScroll, { passive: true });
		return () => {
			viewport.removeEventListener('scroll', updateFromScroll);
			viewport.removeEventListener('wheel', stopProgrammaticScroll);
			viewport.removeEventListener('touchstart', stopProgrammaticScroll);
		};
	}, [updateFollowing]);

	useEffect(() => {
		updateFollowing(true);
		const frame = window.requestAnimationFrame(() => {
			const viewport = viewportRef.current;
			if (viewport) viewport.scrollTop = viewport.scrollHeight;
		});
		return () => window.cancelAnimationFrame(frame);
	}, [resetKey, updateFollowing]);

	useEffect(() => {
		if (!followingRef.current) return;
		const frame = window.requestAnimationFrame(() => {
			const viewport = viewportRef.current;
			if (viewport && followingRef.current) viewport.scrollTop = viewport.scrollHeight;
		});
		return () => window.cancelAnimationFrame(frame);
	}, [trigger]);

	return { viewportRef, isFollowing, scrollToLatest };
}

function getDesignLiveStatus(execution: ReturnType<typeof useDesignStore.getState>['execution'], isGenerating: boolean, queuedPrompts: unknown[]): string | null {
	if (queuedPrompts.length > 0) return `${queuedPrompts.length} 条消息排队中`;
	if (!isGenerating && execution.phase !== 'awaiting_approval') return null;
	if (execution.phase === 'tool') return `正在调用 ${execution.steps.at(-1)?.toolName ?? '设计工具'}`;
	if (execution.phase === 'applying_patch') return '正在应用设计修改';
	if (execution.phase === 'awaiting_clarification') return '等待需求澄清';
	if (execution.phase === 'awaiting_approval') return '等待确认设计修改';
	if (execution.phase === 'responding') return '正在组织回答';
	return '正在思考';
}

function DesignLanding() {
	const startProject = useDesignStore((state) => state.startProject);
	const applyPreset = useDesignStore((state) => state.applyPreset);
	const selectedPresetId = useDesignStore((state) => state.selectedPresetId);
	const currentProjectPath = useDesignStore((state) => state.projectPath);
	const projects = useDesignStore((state) => state.projects);
	const addProject = useDesignStore((state) => state.addProject);
	const openProjectHistory = useDesignStore((state) => state.openProjectHistory);
	const theme = useThemeStore((state) => state.theme);
	const history = useMemo(() => listDesignProjectHistory(projects), [projects]);
	const [prompt, setPrompt] = useState('');
	const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const landingRef = useRef<HTMLDivElement>(null);

	// 滚动条只在入口实际滚动时短暂显示，避免项目较少时常驻一条视觉噪声。
	useEffect(() => {
		const landing = landingRef.current;
		if (!landing) return;
		let hideTimer: ReturnType<typeof setTimeout> | undefined;
		const onScroll = () => {
			landing.classList.add(styles.landingScrolling);
			if (hideTimer) clearTimeout(hideTimer);
			hideTimer = setTimeout(() => landing.classList.remove(styles.landingScrolling), 700);
		};
		landing.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			landing.removeEventListener('scroll', onScroll);
			if (hideTimer) clearTimeout(hideTimer);
			landing.classList.remove(styles.landingScrolling);
		};
	}, []);

	/** 设计入口的附件仅作为上下文素材，先在前端展示并把文件名交给 Design Agent。 */
	const addInputs = async (items: AttachmentInput[]) => {
		if (items.length === 0) return;
		setPreparing(true);
		setPrepareError(null);
		try {
			const response = await rpc.prepareAttachments(items);
			if (response.success && response.command === 'prepare_attachments') {
				setAttachments((previous) => {
					const next = [...previous, ...response.data.attachments];
					return next.filter((item, index, all) => all.findIndex((candidate) => candidate.name === item.name) === index);
				});
			} else if (!response.success) {
				setPrepareError(response.error || '附件解析失败');
			}
		} catch (error) {
			setPrepareError(error instanceof Error ? error.message : String(error));
		} finally {
			setPreparing(false);
		}
	};

	const pickFiles = async () => {
		if (isTauriEnv()) {
			try {
				const { open } = await import('@tauri-apps/plugin-dialog');
				const selected = await open({ multiple: true, directory: false });
				if (!selected) return;
				const paths = Array.isArray(selected) ? selected : [selected];
				await addInputs(paths.map((path) => ({ path })));
			} catch (error) {
				setPrepareError(error instanceof Error ? error.message : String(error));
			}
			return;
		}
		fileInputRef.current?.click();
	};

	const onFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		if (files.length === 0) return;
		// 浏览器预览没有文件系统权限，使用本地元数据完成附件 chip 展示。
		setAttachments((previous) => {
			const next: PreparedAttachment[] = [...previous, ...files.map((file): PreparedAttachment => ({
				name: file.name,
				kind: file.type.startsWith('image/') ? 'image' : 'document',
				mimeType: file.type || 'application/octet-stream',
				sizeBytes: file.size,
				warnings: [],
			}))];
			return next.filter((item, index, all) => all.findIndex((candidate) => candidate.name === item.name) === index);
		});
		event.target.value = '';
	};

	const removeAttachment = (name: string) => setAttachments((previous) => previous.filter((item) => item.name !== name));
	const submit = (event?: FormEvent) => {
		event?.preventDefault();
		const text = prompt.trim() || (attachments.length > 0 ? '请参考附件素材设计页面' : '');
		if (!text) return;
		const attachmentContext = attachments.length > 0 ? `\n\n参考附件：${attachments.map((item) => item.name).join('、')}` : '';
		void startProject(`${text}${attachmentContext}`);
	};
	/** Design 首页以回车快速开始设计，Shift+Enter 留给用户输入多行需求，输入法组字期间不抢占回车。 */
	const submitOnEnter = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
		event.preventDefault();
		submit();
	};

	return <div ref={landingRef} className={styles.landing} data-landing-theme={theme}><DesignLandingBackground theme={theme} /><input ref={fileInputRef} type="file" multiple className={styles.hiddenFileInput} onChange={onFileInputChange} /><div className={styles.landingContent} data-mode-animation-content><div className={styles.landingLogo}><span className={styles.landingLogoMark} aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M6.5 23.5h4.75a3.25 3.25 0 0 0 3.25-3.25v-1.5a3.25 3.25 0 0 1 3.25-3.25H24" /><path d="m20 11.5 4.5 4-4.5 4" /><circle cx="6.5" cy="23.5" r="2.1" /><circle cx="14.5" cy="7.5" r="2.1" /></svg></span><DesignLandingLogo theme={theme} /></div><p className={styles.landingSubtitle}>用自然语言，把想法变成可运行的界面</p><form className={styles.landingComposer} onSubmit={submit}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={submitOnEnter} placeholder="例如：设计一个简洁的注册流程" aria-label="设计需求" autoFocus />{attachments.length > 0 && <div className={styles.landingAttachments}>{attachments.map((attachment) => <span key={attachment.name} className={styles.landingAttachment} title={attachment.name}>{attachment.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}<span>{attachment.name}</span><button type="button" onClick={() => removeAttachment(attachment.name)} aria-label={`移除附件 ${attachment.name}`}><X size={11} /></button></span>)}</div>}<div className={styles.landingComposerBar}><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={styles.landingRoundButton} aria-label="更多入口" disabled={preparing}>{preparing ? <Loader2 size={16} className={styles.spin} /> : <Plus size={16} />}</button></DropdownMenuTrigger><DropdownMenuContent align="start" className={styles.landingRoundMenu}><DropdownMenuItem disabled={preparing} onSelect={() => void pickFiles()}><Paperclip size={13} />上传附件</DropdownMenuItem></DropdownMenuContent></DropdownMenu><button type="button" className={styles.landingProjectContext} onClick={() => void addProject()} title="添加或切换工作空间" aria-label={currentProjectPath ? `当前工作空间 ${currentProjectPath.split(/[\\/]/).pop()}` : '添加工作空间'}><Folder size={14} /><strong>{currentProjectPath ? currentProjectPath.split(/[\\/]/).pop() : '未选择工作空间'}</strong><ChevronDown size={13} /></button><DesignPresetPicker className={styles.landingPreset} selectedPresetId={selectedPresetId} onApply={applyPreset} /><span className={styles.landingBarGrow} /><div className={styles.landingModelPicker}><ModelPicker showThinkingLevel={false} /></div><button type="submit" className={styles.landingSend} disabled={!prompt.trim() && attachments.length === 0} aria-label="开始设计"><Send size={18} /></button></div></form>{prepareError && <div className={styles.landingPrepareError}>{prepareError}<button type="button" onClick={() => setPrepareError(null)} aria-label="关闭附件错误"><X size={12} /></button></div>}<section className={styles.projectHistory} aria-labelledby="design-project-history-title"><div className={styles.projectHistoryHeader}><div className={styles.projectHistoryTitle}><h2 id="design-project-history-title">工作空间</h2><button type="button" className={styles.projectHistoryAdd} onClick={() => void addProject()}><Plus size={13} />添加工作空间</button></div><span className={styles.projectHistoryCount}>{history.length}</span></div>{history.length > 0 ? <div className={styles.projectHistoryList}>{history.map((item) => <button type="button" key={item.path} data-sidebar-menu-kind="design-project" data-project-path={item.path} className={`${styles.projectHistoryCard} ${item.path === currentProjectPath ? styles.projectHistoryCardActive : ''}`} onClick={() => void openProjectHistory(item.path)} aria-current={item.path === currentProjectPath ? 'true' : undefined}><span className={styles.projectHistoryIcon}><Folder size={17} /></span><span className={styles.projectHistoryBody}><strong>{item.name}</strong><span className={styles.projectHistoryMeta}><span>{item.pageCount} 页面</span><span>{item.fileCount} 文件</span><span>{item.revisionCount} 修订</span><span>{item.messageCount} 消息</span></span></span><time className={styles.projectHistoryTime} dateTime={item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : undefined}>{formatProjectHistoryTime(item.lastActivityAt)}</time></button>)}</div> : <p className={styles.projectHistoryEmpty}>添加工作空间后，已创建的设计工作区会显示在这里</p>}</section></div></div>;
}

/**
 * 业务意图：只有 Agent 判断需求存在关键歧义时才显示这张卡，
 * 回答会通过 RPC 回到暂停中的同一次工具调用，不会重新开启固定首轮流程。
 */
function DesignClarificationCard() {
	const request = useDesignStore((state) => state.pendingClarification);
	const respondClarification = useDesignStore((state) => state.respondClarification);
	const [answer, setAnswer] = useState('');
	useEffect(() => setAnswer(''), [request?.clarificationId]);
	if (!request) return null;
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!answer.trim()) return;
		void respondClarification(answer);
	};
	return <form className={styles.clarificationCard} onSubmit={submit} aria-label="设计需求澄清">
		<header className={styles.clarificationHeader}><span className={styles.clarificationIcon}><Sparkles size={15} /></span><div><strong>需要确认一个关键问题</strong><p>设计智能体发现这个选择会影响后续设计，回答后会继续当前任务。</p></div></header>
		{request.context && <p className={styles.clarificationContext}>{request.context}</p>}
		<p className={styles.clarificationQuestion}>{request.question}</p>
		{request.options.length > 0 && <div className={styles.clarificationOptions}>{request.options.map((option) => <button type="button" key={option} className={styles.clarificationOption} onClick={() => setAnswer(option)} aria-pressed={answer === option}>{option}</button>)}</div>}
		<textarea className={styles.clarificationInput} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="输入你的回答，也可以补充其他约束" rows={3} autoFocus />
		<footer className={styles.clarificationFooter}><span>回答后继续执行</span><Button type="submit" size="sm" disabled={!answer.trim()}>确认并继续</Button></footer>
	</form>;
}

function Conversation() {
	const messages = useDesignStore((state) => state.messages).filter((message) => message.kind !== 'plan');
	const projects = useDesignStore((state) => state.projects);
	const projectPath = useDesignStore((state) => state.projectPath);
	const switchProject = useDesignStore((state) => state.switchProject);
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const execution = useDesignStore((state) => state.execution);
	const pendingApproval = useDesignStore((state) => state.pendingApproval);
	const pendingClarification = useDesignStore((state) => state.pendingClarification);
	const queuedPrompts = useDesignStore((state) => state.queuedPrompts);
	const sendPrompt = useDesignStore((state) => state.sendPrompt);
	const stop = useDesignStore((state) => state.stop);
	const approve = useDesignStore((state) => state.approve);
	// 返回入口属于设计会话上下文，放在会话标题行内避免占用原生窗口标题栏。
	const resetProject = useDesignStore((state) => state.resetProject);
	const currentProject = projects.find((project) => project.path === projectPath);
	const currentProjectName = currentProject?.name ?? projectPath?.split(/[\\/]/).pop() ?? '未选择工作空间';
	// 当前项目可能来自旧版本缓存，未及时写入 Design 项目索引；仍要保证标题和下拉入口可用。
	const projectOptions = projectPath && !projects.some((project) => project.path === projectPath) ? [{ name: currentProjectName, path: projectPath, hasWorkspace: false }, ...projects] : projects;
	const [text, setText] = useState('');
	const latestMessage = messages.at(-1);
	// sequence 用于去重流事件，不代表会话内容变化；滚动只跟随实际可见输出，避免思考事件让会话区反复跳动。
	const latestMessageTrigger = latestMessage ? `${latestMessage.id}:${latestMessage.kind}:${latestMessage.kind === 'result' ? latestMessage.summary.length : latestMessage.text.length}:${latestMessage.kind === 'user' ? latestMessage.status ?? '' : ''}` : '';
	const scrollTrigger = `${execution.runId ?? 'idle'}:${messages.length}:${latestMessageTrigger}:${pendingClarification?.clarificationId ?? ''}:${pendingApproval ? 'approval' : ''}`;
	const { viewportRef, isFollowing, scrollToLatest } = useFollowOutputScroll<HTMLDivElement>({ trigger: scrollTrigger, resetKey: execution.runId });
	const liveStatus = getDesignLiveStatus(execution, isGenerating, queuedPrompts);
	const submit = (event?: FormEvent) => { event?.preventDefault(); if (isGenerating) { void stop(); return; } if (!text.trim()) return; void sendPrompt(text); setText(''); };
	// 兼容桌面端输入法：普通回车发送，Shift+Enter 保留换行。
	useEffect(() => {
		const textarea = document.querySelector<HTMLTextAreaElement>(`.${styles.composer} textarea`);
		if (!textarea) return;
		const onNativeKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
			const value = textarea.value.trim();
			if (!value || isGenerating) return;
			event.preventDefault();
			void sendPrompt(value);
			setText('');
		};
		textarea.addEventListener('keydown', onNativeKeyDown);
		return () => textarea.removeEventListener('keydown', onNativeKeyDown);
	}, [isGenerating, sendPrompt]);
	return <aside className={styles.conversation} aria-label="设计对话"><header className={styles.conversationHeader}><div className={styles.conversationHeading}><Button type="button" variant="ghost" size="icon-sm" className={styles.backButton} onClick={resetProject} title="返回设计入口" aria-label="返回设计入口"><ArrowLeft size={16} /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className={`${styles.projectSwitcher} focus-visible:outline-none focus-visible:ring-0`} aria-label={`当前工作空间：${currentProjectName}，切换工作空间`}><Folder size={14} aria-hidden="true" /><span>{currentProjectName}</span><ChevronDown size={13} aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className={styles.projectSwitcherMenu}>{projectOptions.length > 0 ? projectOptions.map((project) => <DropdownMenuItem key={project.path} className={`${styles.projectSwitcherItem} ${project.path === projectPath ? styles.projectSwitcherItemActive : ""}`} onSelect={() => { if (project.path !== projectPath) void switchProject(project.path); }}><Folder size={14} aria-hidden="true" /><span className={styles.projectSwitcherItemCopy}><strong>{project.name}</strong><small>{project.hasWorkspace ? "设计工作区" : "尚未创建设计工作区"}</small></span>{project.path === projectPath && <Check size={13} className={styles.projectSwitcherItemCheck} aria-label="当前工作空间" />}</DropdownMenuItem>) : <DropdownMenuItem disabled>暂无可切换工作空间</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div></header><div className={styles.conversationScrollFrame}><div ref={viewportRef} className={`${styles.messageList} gp-scrollbar`}>{messages.map((message) => <article key={message.id} className={`${styles.message} ${styles[`message_${message.kind}`]}`}><div className={styles.messageMeta}>{message.kind === 'user' ? `你${message.status === 'queued' ? ' · 排队中' : message.status === 'cancelled' ? ' · 已取消' : ''}` : message.kind === 'error' ? '错误' : 'GITPILOT'}</div>{message.kind === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown> : <p>{message.kind === 'result' ? message.summary : message.text}</p>}{message.kind === 'result' && <span className={styles.revision}>修订版 {message.revisionId}</span>}</article>)}<DesignClarificationCard />{liveStatus && <div className={styles.liveStatus} role="status" aria-live="polite"><span className={styles.pulse} /><span>{liveStatus}</span></div>}{pendingApproval && <div className={styles.approvalCard}><strong>需要确认高风险设计修改</strong><p>{pendingApproval.reason}</p><div><Button size="sm" onClick={() => void approve(true)}><Check size={13} />继续</Button><Button size="sm" variant="ghost" onClick={() => void approve(false)}><X size={13} />拒绝</Button></div></div>}</div>{!isFollowing && <button type="button" className={styles.scrollToLatest} onClick={scrollToLatest} title="回到最新位置" aria-label="回到最新位置"><ArrowDown size={13} /><span>回到最新</span></button>}</div><DesignPlanProgressStatus /><form className={styles.composer} onSubmit={submit}><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(); }} placeholder="描述你想设计的页面…" aria-label="设计需求" /><div className={styles.composerFooter}><div className={styles.composerModelPicker}><ModelPicker showThinkingLevel={false} /></div><div className={styles.composerActions}><Button type={isGenerating ? 'button' : 'submit'} size="icon" variant={isGenerating ? 'ghost' : 'default'} onClick={isGenerating ? () => void stop() : undefined} disabled={!isGenerating && !text.trim()} className={`${styles.composerButton} ${isGenerating ? styles.composerStop : ''}`} aria-label={isGenerating ? '停止设计任务' : '发送设计需求'} title={isGenerating ? '停止' : '发送'}>{isGenerating ? <Square size={14} /> : <Send size={15} />}</Button></div></div></form></aside>;
}

function DesignNavigator({ onClose }: { onClose?: () => void }) {
	const getRenderScene = useDesignStore((state) => state.getRenderScene);
	const activePageId = useDesignStore((state) => state.activePageId);
	const selectedElementId = useDesignStore((state) => state.selectedElementId);
	const setActivePage = useDesignStore((state) => state.setActivePage);
	const selectElement = useDesignStore((state) => state.selectElement);
	const applyCanvasTransaction = useDesignStore((state) => state.applyCanvasTransaction);
	const exportDesign = useDesignStore((state) => state.exportDesign);
	const canvas = getRenderScene();
	const activePage = canvas.pages.find((page) => page.id === activePageId) ?? canvas.pages[0];
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	const visibleLayers = useMemo(() => {
		if (!activePage) return [] as Array<{ node: CanvasNode; depth: number }>;
		const result: Array<{ node: CanvasNode; depth: number }> = [];
		const visit = (id: string, depth: number) => {
			const node = canvas.nodes[id];
			if (!node) return;
			result.push({ node, depth });
			if (expanded[id] !== false) node.childIds.forEach((childId) => visit(childId, depth + 1));
		};
		visit(activePage.rootNodeId, 0);
		return result;
	}, [activePage, canvas, expanded]);

	const addNode = (type: CanvasNodeType) => {
		if (!activePage) return;
		const parent = canvas.nodes[activePage.rootNodeId];
		if (!parent) return;
		const id = `${type}-${Date.now()}`;
		const size = type === 'text' ? { width: 360, height: 64 } : { width: 220, height: 120 };
		const node: CanvasNode = {
			id, type, name: type === 'text' ? '文本' : type === 'ellipse' ? '椭圆' : '矩形', parentId: parent.id, childIds: [], visible: true, locked: false, opacity: 1,
			transform: { x: 80 + parent.childIds.length * 12, y: 80 + parent.childIds.length * 12, ...size, rotation: 0, scaleX: 1, scaleY: 1 },
			layout: { mode: 'absolute', width: size.width, height: size.height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' },
			...(type === 'text' ? { text: { text: '双击编辑文本', fontFamily: 'Inter', fontSize: 24, fontWeight: 500, lineHeight: 32, letterSpacing: 0, color: '#f5f4ed', align: 'left' as const, verticalAlign: 'top' as const, wrap: 'wrap' as const } } : { paint: { fill: { kind: 'solid' as const, color: type === 'ellipse' ? '#5eead4' : '#2f6feb' }, cornerRadius: type === 'rect' ? 12 : 0 } }),
		};
		void applyCanvasTransaction({ transactionId: `desktop-create-${id}`, baseRevision: canvas.revision, source: 'user', operations: [{ op: 'create_node', node, parentId: parent.id }], summary: `创建${node.name}`, createdAt: new Date().toISOString() });
		selectElement(id);
	};
	const updateNode = (node: CanvasNode, changes: Partial<CanvasNode>) => void applyCanvasTransaction({ transactionId: `desktop-update-${node.id}-${Date.now()}`, baseRevision: canvas.revision, source: 'user', operations: [{ op: 'update_node', nodeId: node.id, changes }], summary: `更新${node.name}`, createdAt: new Date().toISOString() });
	const deleteSelected = () => {
		const node = selectedElementId ? canvas.nodes[selectedElementId] : null;
		if (!node || !node.parentId) return;
		void applyCanvasTransaction({ transactionId: `desktop-delete-${node.id}-${Date.now()}`, baseRevision: canvas.revision, source: 'user', operations: [{ op: 'delete_node', nodeId: node.id }], summary: `删除${node.name}`, createdAt: new Date().toISOString() });
		selectElement(null);
	};
	const typeLabel: Record<CanvasNodeType, string> = { page: '页面', frame: '画框', group: '组', rect: '矩形', ellipse: '椭圆', line: '线段', path: '路径', text: '文本', image: '图片', icon: '图标', instance: '实例' };
	return <aside className={styles.navigator} aria-label="页面与图层">
		<div className={styles.navigatorTopbar}><span>页面与图层</span><div className={styles.navigatorTopbarActions}><button type="button" onClick={() => void exportDesign()} title="导出 Canvas 场景" aria-label="导出 Canvas 场景"><Archive size={13} /></button>{onClose && <button type="button" onClick={onClose} title="收起目录" aria-label="收起目录">×</button>}</div></div>
		<div className={styles.navigatorSection}><div className={styles.navigatorHeading}><div className={styles.navigatorHeadingCopy}><span>页面</span><span className={styles.navigatorCount}>{canvas.pages.length}</span></div><div className={styles.navigatorHeadingActions}><button type="button" onClick={() => addNode('frame')} title="在当前页面添加画框" aria-label="在当前页面添加画框"><FrameCorners size={12} /></button></div></div>{canvas.pages.map((page) => <button type="button" key={page.id} className={`${styles.navigatorPage} ${page.id === activePage?.id ? styles.navigatorActive : ''}`} onClick={() => { setActivePage(page.id); onClose?.(); }}><Monitor size={13} /><span>{page.name}</span><small>{page.route || '自由画布'}</small></button>)}</div>
		<div className={styles.navigatorSection}><div className={styles.navigatorHeading}><div className={styles.navigatorHeadingCopy}><span>图层</span><span className={styles.navigatorCount}>{visibleLayers.length}</span></div><div className={styles.navigatorHeadingActions}><button type="button" onClick={() => addNode('rect')} title="添加矩形" aria-label="添加矩形"><Square size={12} /></button><button type="button" onClick={() => addNode('text')} title="添加文本" aria-label="添加文本"><PencilSimple size={12} /></button><button type="button" onClick={deleteSelected} title="删除选中图层" aria-label="删除选中图层" disabled={!selectedElementId}><Trash2 size={12} /></button></div></div>{visibleLayers.map(({ node, depth }) => <div key={node.id} className={`${styles.navigatorFileRow} ${selectedElementId === node.id ? styles.navigatorActive : ''}`} style={{ paddingLeft: `${8 + depth * 14}px` }}><button type="button" className={styles.navigatorFile} onClick={() => selectElement(node.id)}><span onClick={(event) => { event.stopPropagation(); setExpanded((current) => ({ ...current, [node.id]: current[node.id] === false })); }}>{node.childIds.length > 0 ? (expanded[node.id] === false ? '▸' : '▾') : '·'}</span><span title={node.name}>{node.name}</span><small>{typeLabel[node.type]}</small></button><button type="button" onClick={() => updateNode(node, { visible: !node.visible })} title={node.visible ? '隐藏图层' : '显示图层'} aria-label={node.visible ? '隐藏图层' : '显示图层'}>{node.visible ? '◉' : '○'}</button><button type="button" onClick={() => updateNode(node, { locked: !node.locked })} title={node.locked ? '解锁图层' : '锁定图层'} aria-label={node.locked ? '解锁图层' : '锁定图层'}>{node.locked ? '⊘' : '⌑'}</button></div>)}</div>
	</aside>;
}

function DesignExecutionInspector() {
	const execution = useDesignStore((state) => state.execution);
	const pendingApproval = useDesignStore((state) => state.pendingApproval);
	const queuedPrompts = useDesignStore((state) => state.queuedPrompts);
	const isGenerating = useDesignStore((state) => state.isGenerating);
	// 思考正文属于过程详情，默认收起，避免流式输出时占满右侧面板；新一轮执行重新从收起状态开始。
	const [thinkingExpanded, setThinkingExpanded] = useState(false);
	useEffect(() => setThinkingExpanded(false), [execution.runId]);
	const stepTrigger = execution.steps.map((step) => `${step.id}:${step.toolName}:${step.status}`).join('|');
	// sequence 只服务于事件排序；右侧只在自身内容变化时滚动，避免无可见更新的事件抢占视口。
	const scrollTrigger = `${execution.runId ?? 'idle'}:${execution.status}:${execution.phase}:${isGenerating}:${execution.thinking.length}:${execution.thinking.slice(-64)}:${stepTrigger}:${queuedPrompts.length}:${pendingApproval?.approvalId ?? ''}:${pendingApproval?.reason.length ?? 0}`;
	const { viewportRef, isFollowing, scrollToLatest } = useFollowOutputScroll<HTMLDivElement>({ trigger: scrollTrigger, resetKey: execution.runId });
	const phaseLabel = execution.phase === 'compacting' ? '正在压缩上下文' : execution.compactionNotice === 'success' ? '上下文已压缩' : execution.compactionNotice === 'failure' ? '上下文压缩失败' : execution.status === 'failed' ? '执行失败' : execution.phase === 'awaiting_clarification' ? '等待需求澄清' : execution.phase === 'awaiting_approval' ? '等待确认设计修改' : execution.phase === 'tool' ? '执行设计工具' : execution.phase === 'thinking' ? '思考中' : isGenerating ? '处理中' : '已就绪';
	const showStatus = phaseLabel !== '已就绪';
	return <div className={styles.executionInspectorFrame}><div ref={viewportRef} className={styles.executionInspector}>
		{showStatus && <div className={styles.inspectorStatus}><span className={`${styles.inspectorStatusDot} ${isGenerating ? styles.inspectorStatusRunning : ''}`} /><div><strong title={execution.compactionError}>{phaseLabel}</strong>{queuedPrompts.length > 0 && <span>{queuedPrompts.length} 条消息排队中</span>}</div></div>}
		{execution.thinking && <section className={styles.inspectorSection}>
			<button type="button" className={styles.inspectorSectionHeadingButton} onClick={() => setThinkingExpanded((expanded) => !expanded)} aria-expanded={thinkingExpanded}>
				<span className={styles.inspectorSectionHeading}><ChevronRight size={13} className={`${styles.inspectorSectionChevron} ${thinkingExpanded ? styles.inspectorSectionChevronExpanded : ''}`} aria-hidden="true" /><span>思考过程</span></span>
			</button>
			{thinkingExpanded && <p className={styles.inspectorThinking}>{execution.thinking}</p>}
		</section>}
		<section className={styles.inspectorSection}><div className={styles.inspectorSectionHeading}><span>工具步骤</span><span className={styles.inspectorCount}>{execution.steps.length}</span></div>{execution.steps.length > 0 ? <div className={styles.inspectorSteps}>{execution.steps.map((step) => <div key={step.id} className={styles.inspectorStep}><span className={step.status === 'running' ? styles.stepRunning : step.status === 'failed' ? styles.stepFailed : styles.stepDone}>{step.status === 'running' ? '执行中' : step.status === 'failed' ? '失败' : '完成'}</span><code title={step.summary ?? step.toolName}>{step.summary ?? step.toolName}</code></div>)}</div> : <p className={styles.inspectorEmpty}>发送设计需求后，工具步骤会显示在这里。</p>}</section>
		{pendingApproval && <section className={`${styles.inspectorSection} ${styles.inspectorApproval}`}><div className={styles.inspectorSectionHeading}><span>待确认变更</span><span className={styles.inspectorCount}>高风险</span></div><p>{pendingApproval.reason}</p></section>}
	</div>{!isFollowing && <button type="button" className={styles.scrollToLatest} onClick={scrollToLatest} title="回到最新位置" aria-label="回到最新位置"><ArrowDown size={13} /><span>回到最新</span></button>}</div>;
}

type GuidelineTokenGroup = keyof DesignProjectGuidelines['tokens'];

function GuidelineMapEditor({ title, values, onChange, valuePlaceholder }: { title: string; values: Record<string, string>; onChange: (values: Record<string, string>) => void; valuePlaceholder: string }) {
	const entries = Object.entries(values);
	const addEntry = () => {
		let index = entries.length + 1;
		let key = `token-${index}`;
		while (Object.prototype.hasOwnProperty.call(values, key)) { index += 1; key = `token-${index}`; }
		onChange({ ...values, [key]: '' });
	};
	return <section className={styles.guidelinesSection}><div className={styles.guidelinesSectionHeading}><span>{title}</span><button type="button" onClick={addEntry} title={`添加${title}`} aria-label={`添加${title}`}><Plus size={12} /></button></div>{entries.length > 0 ? <div className={styles.guidelinesMap}>{entries.map(([key, value]) => <div className={styles.guidelinesMapRow} key={key}><input value={key} aria-label={`${title}名称`} onChange={(event) => { const next = Object.fromEntries(Object.entries(values).map(([entryKey, entryValue]) => [entryKey === key ? event.target.value : entryKey, entryValue])); onChange(next); }} /><input value={value} placeholder={valuePlaceholder} aria-label={`${key}值`} onChange={(event) => onChange({ ...values, [key]: event.target.value })} /><button type="button" className={styles.guidelinesRemove} onClick={() => { const next = { ...values }; delete next[key]; onChange(next); }} title="删除" aria-label={`删除${key}`}><X size={11} /></button></div>)}</div> : <p className={styles.inspectorEmpty}>暂无条目</p>}</section>;
}

function DesignGuidelinesInspector() {
	const snapshot = useDesignStore((state) => state.snapshot);
	const saveProjectGuidelines = useDesignStore((state) => state.saveProjectGuidelines);
	const applyPreset = useDesignStore((state) => state.applyPreset);
	const selectedPresetId = useDesignStore((state) => state.selectedPresetId);
	const [draft, setDraft] = useState<DesignProjectGuidelines>(() => snapshot.guidelines ?? createDefaultProjectGuidelines());
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		if (snapshot.guidelines) setDraft(snapshot.guidelines);
	}, [snapshot.guidelines]);

	const updateTokenGroup = (group: GuidelineTokenGroup, values: Record<string, string>) => setDraft((current) => ({ ...current, tokens: { ...current.tokens, [group]: values } }));
	const updateBrand = (field: 'name' | 'tone', value: string) => setDraft((current) => ({ ...current, brand: { ...current.brand, [field]: value } }));
	const updateComponents = (values: Record<string, string>) => setDraft((current) => ({ ...current, components: values }));
	const save = async () => {
		setSaving(true);
		setSaved(false);
		try {
			await saveProjectGuidelines({ ...draft, updatedAt: new Date().toISOString() });
			setSaved(true);
		} catch {
			// Store 已把 sidecar 错误写入全局错误提示，这里只结束按钮 loading。
		} finally {
			setSaving(false);
		}
	};

	return <div className={`${styles.guidelinesInspector} gp-scrollbar`}><header className={styles.guidelinesHeader}><div><strong>工作空间规范</strong><span>设计智能体会遵循这些约束</span></div><div className={styles.guidelinesActions}><DesignPresetPicker className={styles.guidelinesPreset} selectedPresetId={selectedPresetId} onApply={applyPreset} /><button type="button" className={styles.guidelinesSave} onClick={() => void save()} disabled={saving}><Save size={13} />{saving ? '保存中' : '保存'}</button></div></header><div className={styles.guidelinesForm}><label className={styles.guidelinesField}><span>品牌名称</span><input value={draft.brand.name} onChange={(event) => updateBrand('name', event.target.value)} placeholder="例如：GitPilot" /></label><label className={styles.guidelinesField}><span>设计语气</span><input value={draft.brand.tone} onChange={(event) => updateBrand('tone', event.target.value)} placeholder="清晰、专业、易使用" /></label><label className={styles.guidelinesField}><span>最低对比度</span><select value={draft.accessibility.minContrast} onChange={(event) => setDraft((current) => ({ ...current, accessibility: { minContrast: event.target.value === 'AAA' ? 'AAA' : 'AA' } }))}><option value="AA">AA</option><option value="AAA">AAA</option></select></label><GuidelineMapEditor title="颜色 Token" values={draft.tokens.colors} valuePlaceholder="#0f766e" onChange={(values) => updateTokenGroup('colors', values)} /><GuidelineMapEditor title="字体 Token" values={draft.tokens.typography} valuePlaceholder="例如：16px / 1.5" onChange={(values) => updateTokenGroup('typography', values)} /><GuidelineMapEditor title="间距 Token" values={draft.tokens.spacing} valuePlaceholder="例如：16px" onChange={(values) => updateTokenGroup('spacing', values)} /><GuidelineMapEditor title="圆角 Token" values={draft.tokens.radius} valuePlaceholder="例如：8px" onChange={(values) => updateTokenGroup('radius', values)} /><GuidelineMapEditor title="阴影 Token" values={draft.tokens.shadows} valuePlaceholder="例如：0 8px 24px #0002" onChange={(values) => updateTokenGroup('shadows', values)} /><GuidelineMapEditor title="组件规则" values={draft.components} valuePlaceholder="例如：主按钮使用品牌色" onChange={updateComponents} /><label className={styles.guidelinesField}><span>设计规则</span><textarea value={draft.rules.join('\n')} onChange={(event) => setDraft((current) => ({ ...current, rules: event.target.value.split('\n').map((rule) => rule.trim()).filter(Boolean) }))} placeholder="每行一条规则" rows={5} /></label>{saved && <span className={styles.guidelinesSaved}>已保存到当前工作空间</span>}</div></div>;
}

type DesignInspectorTabId = 'execution' | 'files' | 'guidelines';

/** Design 右侧栏沿用 Code/Work 的拖拽语义：鼠标实时调整宽度，键盘方向键和 Home/End 支持无障碍操作。 */
function DesignRightResizeHandle({ value, onChange }: { value: number; onChange: (value: number) => void }) {
	const pointerId = useRef<number | null>(null);
	const resize = (delta: number) => onChange(Math.max(DESIGN_RIGHT_WIDTH_LIMITS.min, Math.min(DESIGN_RIGHT_WIDTH_LIMITS.max, value + delta)));
	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		pointerId.current = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (pointerId.current !== event.pointerId) return;
		resize(-event.movementX);
	};
	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (pointerId.current !== event.pointerId) return;
		pointerId.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
	};
	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'ArrowLeft') { event.preventDefault(); resize(16); }
		if (event.key === 'ArrowRight') { event.preventDefault(); resize(-16); }
		if (event.key === 'Home') { event.preventDefault(); onChange(DESIGN_RIGHT_WIDTH_LIMITS.min); }
		if (event.key === 'End') { event.preventDefault(); onChange(DESIGN_RIGHT_WIDTH_LIMITS.max); }
	};
	return <div className={styles.rightResizeHandle} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuemin={DESIGN_RIGHT_WIDTH_LIMITS.min} aria-valuemax={DESIGN_RIGHT_WIDTH_LIMITS.max} aria-valuenow={value} aria-label="调整 Design 右侧面板宽度" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onKeyDown}><span /></div>;
}

/** 右侧 Inspector 保持挂载，通过 aria-hidden 和 CSS 合成层过渡完成展开/收起。 */
function DesignRightInspector({ open }: { open: boolean }) {
	// 右侧栏默认先展示文件，再展示规范和执行过程，符合 Design 的日常浏览优先级。
	const [openTabs, setOpenTabs] = useState<DesignInspectorTabId[]>(['files', 'guidelines', 'execution']);
	const [activeTab, setActiveTab] = useState<DesignInspectorTabId>('files');
	const tabDefinitions: Array<{ id: DesignInspectorTabId; label: string; icon: typeof ListChecks }> = [{ id: 'files', label: '文件', icon: Folder }, { id: 'guidelines', label: '规范', icon: BookOpen }, { id: 'execution', label: '执行过程', icon: ListChecks }];
	const openTab = (tab: DesignInspectorTabId) => { setOpenTabs((tabs) => tabs.includes(tab) ? tabs : [...tabs, tab]); setActiveTab(tab); };
	const closeTab = (tab: DesignInspectorTabId) => {
		setOpenTabs((tabs) => {
			const index = tabs.indexOf(tab);
			const nextTabs = tabs.filter((item) => item !== tab);
			if (activeTab === tab) setActiveTab(nextTabs[index] ?? nextTabs[index - 1] ?? (nextTabs[0] ?? 'files'));
			return nextTabs;
		});
	};
	return <aside className={`${styles.rightInspector} ${open ? styles.rightInspectorOpen : styles.rightInspectorClosed}`} aria-label="Design 右侧面板" aria-hidden={!open} inert={!open}>
		<nav className={styles.inspectorTabs} aria-label="Design 功能页签" onMouseDown={(event) => event.stopPropagation()}>
			<div className={styles.inspectorTabScroller}>
				{openTabs.map((tabId) => { const tab = tabDefinitions.find((item) => item.id === tabId)!; const Icon = tab.icon; return <div key={tab.id} className={`${styles.inspectorTab} ${activeTab === tab.id ? styles.inspectorTabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveTab(tab.id); } }}><Icon size={13} /><span>{tab.label}</span><button type="button" className={styles.inspectorTabClose} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} aria-label={`关闭${tab.label}`}><X size={11} /></button></div>; })}
			</div>
			<div className={styles.inspectorTabActions}>
				<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={`${styles.inspectorTabAdd} focus-visible:outline-none focus-visible:ring-0`} aria-label="打开 Design 功能页签"><Plus size={15} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{tabDefinitions.map((tab) => { const Icon = tab.icon; return <DropdownMenuItem key={tab.id} onSelect={() => openTab(tab.id)}><Icon />{tab.label}</DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu>
			</div>
		</nav>
		{openTabs.length === 0 ? <div className={styles.inspectorEmptyPanel}><ListChecks size={20} /><span>右侧面板已关闭</span><small>点击上方 + 重新打开一个面板。</small></div> : activeTab === 'files' ? <DesignNavigator /> : activeTab === 'guidelines' ? <DesignGuidelinesInspector /> : <DesignExecutionInspector />}
	</aside>;
}

/**
 * 画板工具栏放在右侧浮层，避免顶部横条把无限画布切成普通页面布局。
 * 业务意图：选择、画框、编辑、拖动和设计是画布工具状态，后续元素编辑能力可以在同一事实源上继续扩展。
 */
function DesignCanvasToolRail({ activeTool, onToolChange, onOpenVersions, rightPanelOpen, onToggleRightPanel }: { activeTool: DesignCanvasTool; onToolChange: (tool: DesignCanvasTool) => void; onOpenVersions: () => void; rightPanelOpen: boolean; onToggleRightPanel: () => void }) {
	const activeTab = useDesignStore((state) => state.activeTab);
	const setTab = useDesignStore((state) => state.setTab);
	const tools: Array<{ id: DesignCanvasTool; label: string; icon: typeof CursorClick }> = [
		{ id: 'select', label: '点击选择', icon: CursorClick },
		{ id: 'frame', label: '框选区域', icon: SelectionAll },
		{ id: 'edit', label: '编辑元素', icon: PencilSimple },
		{ id: 'pan', label: '拖动画布', icon: Hand },
		{ id: 'design', label: '设计画框', icon: FrameCorners },
		{ id: 'pen', label: '自由绘制（实时预览）', icon: PenNib },
	];
	return <aside className={styles.designV2ToolRail} aria-label="画布工具栏">
		<div className={styles.designV2ToolRailGroup} role="toolbar" aria-label="画布工具">
			{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeTool === id ? styles.designV2ToolRailButtonActive : styles.designV2ToolRailButton} onClick={() => onToolChange(id)} aria-label={label} aria-pressed={activeTool === id} title={label}><Icon size={19} /></button>)}
			<span className={styles.designV2ToolRailDivider} />
			<button type="button" className={activeTab === 'code' ? styles.designV2ToolRailButtonActive : styles.designV2ToolRailButton} onClick={() => setTab(activeTab === 'code' ? 'preview' : 'code')} aria-pressed={activeTab === 'code'} title={activeTab === 'code' ? '返回 Canvas 画布' : '查看场景数据'} aria-label={activeTab === 'code' ? '返回 Canvas 画布' : '查看场景数据'}><Code2 size={19} /></button>
			<button type="button" className={styles.designV2ToolRailButton} onClick={onOpenVersions} title="打开版本历史" aria-label="打开版本历史"><History size={19} /></button>
			<button type="button" className={styles.designV2ToolRailButton} title="评论" aria-label="评论"><ChatCircleDots size={19} /></button>
			<button type="button" className={rightPanelOpen ? styles.designV2ToolRailButtonActive : styles.designV2ToolRailButton} title={rightPanelOpen ? '收起工作区规范' : '展开工作区规范'} aria-label={rightPanelOpen ? '收起工作区规范' : '展开工作区规范'} aria-pressed={rightPanelOpen} onClick={onToggleRightPanel}><SidebarSimple size={19} /></button>
		</div>
	</aside>;
}

/**
 * 会话导航独立成一张浮层卡片：返回入口、工作空间切换和运行状态不再嵌在 AI 输出面板头部。
 * 业务意图：把“会话级操作”和“本轮输出”拆开，收起输出面板后仍能返回入口或切换工作空间。
 */
function DesignSessionBar() {
	const projects = useDesignStore((state) => state.projects);
	const projectPath = useDesignStore((state) => state.projectPath);
	const switchProject = useDesignStore((state) => state.switchProject);
	const resetProject = useDesignStore((state) => state.resetProject);
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const execution = useDesignStore((state) => state.execution);
	const queuedPrompts = useDesignStore((state) => state.queuedPrompts);
	const currentProject = projects.find((project) => project.path === projectPath);
	const currentProjectName = currentProject?.name ?? projectPath?.split(/[\\/]/).pop() ?? '未选择工作空间';
	// 当前项目可能来自旧版本缓存，未及时写入 Design 项目索引；仍要保证标题和下拉入口可用。
	const projectOptions = projectPath && !projects.some((project) => project.path === projectPath) ? [{ name: currentProjectName, path: projectPath, hasWorkspace: false }, ...projects] : projects;
	const liveStatus = getDesignLiveStatus(execution, isGenerating, queuedPrompts);
	return <header className={styles.designV2SessionBar} aria-label="设计会话导航">
		<div className={styles.designV2PanelHeaderMain}>
			<button type="button" className={styles.designV2BackButton} onClick={resetProject} aria-label="返回设计入口" title="返回设计入口"><ArrowLeft size={15} /></button>
			<DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={styles.designV2ProjectSwitcher} aria-label={`当前工作空间：${currentProjectName}`}><Folder size={14} /><span><strong>{currentProjectName}</strong><small>设计工作区</small></span><ChevronDown size={13} /></button></DropdownMenuTrigger><DropdownMenuContent align="start">{projectOptions.length > 0 ? projectOptions.map((project) => <DropdownMenuItem key={project.path} onSelect={() => { if (project.path !== projectPath) void switchProject(project.path); }}><Folder size={14} /><span>{project.name}</span>{project.path === projectPath && <Check size={13} aria-label="当前工作空间" />}</DropdownMenuItem>) : <DropdownMenuItem disabled>暂无可切换工作空间</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
		</div>
		<span className={styles.designV2PanelStatus}>{liveStatus ?? '已就绪'}</span>
	</header>;
}

/**
 * AI 输出过程中的思考摘要：压缩在一小块固定高度区域内滚动跟随。
 * Store 每轮 startPrompt 都会重置 execution.thinking，因此这里天然只显示当前这轮的思考；
 * 运行结束后整体收起，把空间还给输出正文。
 */
function DesignThinkingStrip() {
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const thinking = useDesignStore((state) => state.execution.thinking);
	const viewportRef = useRef<HTMLDivElement>(null);
	// 思考流持续贴底跟随，用户不需要手动滚动就能看到最新一段推理。
	useEffect(() => {
		const viewport = viewportRef.current;
		if (viewport) viewport.scrollTop = viewport.scrollHeight;
	}, [thinking, isGenerating]);
	if (!isGenerating) return null;
	return <div ref={viewportRef} className={styles.designV2Thinking} aria-label="思考过程">{thinking || '正在思考…'}</div>;
}

/**
 * 左上角只展示最近一次 Design 输出，完整消息仍保留在左下历史区。
 * 业务意图：把“结果理解”和“历史回看”拆开，避免流式输出把页面画布挤到一侧。
 */
function DesignOutputPanel({ onCollapse }: { onCollapse: () => void }) {
	const messages = useDesignStore((state) => state.messages).filter((message) => message.kind !== 'plan');
	const pendingApproval = useDesignStore((state) => state.pendingApproval);
	const draftMetadata = useDesignStore((state) => state.draftMetadata);
	const recoverDraft = useDesignStore((state) => state.recoverDraft);
	const approve = useDesignStore((state) => state.approve);
	const latestOutput = [...messages].reverse().find((message) => message.kind === 'assistant' || message.kind === 'result' || message.kind === 'error');

	return <section className={styles.designV2Output} aria-label="AI 输出">
		<header className={styles.designV2PanelHeader}>
			<span className={styles.designV2OutputTitle}>AI 输出</span>
			<div className={styles.designV2PanelHeaderActions}><button type="button" className={styles.designV2PanelCollapse} onClick={onCollapse} aria-label="收起 AI 输出" title="收起 AI 输出"><ChevronLeft size={14} /></button></div>
		</header>
		<DesignThinkingStrip />
		<div className={`${styles.designV2OutputScroll} gp-scrollbar`}>
			{latestOutput?.kind === 'assistant' && <ReactMarkdown remarkPlugins={[remarkGfm]}>{latestOutput.text}</ReactMarkdown>}
			{latestOutput?.kind === 'result' && <div className={styles.designV2OutputResult}><Check size={15} /><div><strong>设计修改已完成</strong><span>{latestOutput.summary}</span><small>修订版 {latestOutput.revisionId}</small></div></div>}
			{latestOutput?.kind === 'error' && <div className={styles.designV2OutputError}><strong>本轮设计未完成</strong><span>{latestOutput.text}</span></div>}
			{!latestOutput && <div className={styles.designV2OutputEmpty}><Sparkles size={18} /><strong>等待你的设计需求</strong><span>中央画布会展示当前工作区的全部页面。</span></div>}
			<DesignClarificationCard />
			{draftMetadata?.status === 'orphaned' && <section className={styles.designV2Approval}><div><strong>发现未收口草稿</strong><span>已接受 {draftMetadata.operationCount} 批绘制，{draftMetadata.lastSummary ?? '等待恢复操作'}</span></div><div><button type="button" onClick={() => void recoverDraft('keep')}>保留为中断版本</button><button type="button" onClick={() => void recoverDraft('discard')}>放弃草稿</button></div></section>}
			{pendingApproval && <section className={styles.designV2Approval}><div><strong>需要确认设计修改</strong><span>{pendingApproval.reason}</span></div><div><button type="button" onClick={() => void approve(true)}>继续</button><button type="button" onClick={() => void approve(false)}>拒绝</button></div></section>}
		</div>
	</section>;
}

/** 左下角的历史区只保留可定位的摘要，完整正文由上方输出区展示，降低视觉噪声。 */
function DesignConversationHistory({ onCollapse }: { onCollapse: () => void }) {
	const messages = useDesignStore((state) => state.messages).filter((message) => message.kind !== 'plan');
	const [selectedId, setSelectedId] = useState<string | null>(messages.at(-1)?.id ?? null);
	const history = messages.slice(-7).reverse();

	return <section className={styles.designV2History} aria-label="对话历史">
		<header className={styles.designV2HistoryHeader}><span>对话历史</span><span>{messages.length} 条</span><button type="button" className={styles.designV2PanelCollapse} onClick={onCollapse} aria-label="收起对话历史" title="收起对话历史"><ChevronLeft size={14} /></button></header>
		<div className={styles.designV2HistoryList}>
			{history.length > 0 ? history.map((message) => {
				const label = message.kind === 'user' ? '你的需求' : message.kind === 'result' ? '设计结果' : message.kind === 'error' ? '错误信息' : '设计回复';
				const summary = message.kind === 'result' ? message.summary : message.text;
				return <button type="button" key={message.id} className={`${styles.designV2HistoryItem} ${selectedId === message.id ? styles.designV2HistoryItemActive : ''}`} onClick={() => setSelectedId(message.id)} aria-pressed={selectedId === message.id}><span className={styles.designV2HistoryDot} /><span><strong>{label}</strong><small>{summary.slice(0, 42)}{summary.length > 42 ? '…' : ''}</small></span></button>;
			}) : <p className={styles.designV2HistoryEmpty}>还没有对话记录</p>}
		</div>
	</section>;
}

/** 中央画布只接收结构化 CanvasDesignDocument，页面视觉内容不再从文件拼装。 */
function DesignPagesCanvas({ canvasTool }: { canvasTool: DesignCanvasTool }) {
	const getRenderScene = useDesignStore((state) => state.getRenderScene);
	const activePageId = useDesignStore((state) => state.activePageId);
	const activeTab = useDesignStore((state) => state.activeTab);
	const selectedElementId = useDesignStore((state) => state.selectedElementId);
	const selectedElementIds = useDesignStore((state) => state.selectedElementIds);
	const draft = useDesignStore((state) => state.draft);
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const execution = useDesignStore((state) => state.execution);
	const zoom = useDesignStore((state) => state.zoom);
	const selectElement = useDesignStore((state) => state.selectElement);
	const selectElements = useDesignStore((state) => state.selectElements);
	const applyCanvasTransaction = useDesignStore((state) => state.applyCanvasTransaction);
	const setTransient = useDesignStore((state) => state.setTransient);
	const setZoom = useDesignStore((state) => state.setZoom);
	const canvasDocument = getRenderScene();
	const activePage = canvasDocument.pages.find((page) => page.id === activePageId) ?? canvasDocument.pages[0];

	const commitTransform = useCallback((nodeId: string, transform: CanvasNode['transform']) => {
		void applyCanvasTransaction({ transactionId: `desktop-move-${nodeId}-${Date.now()}`, baseRevision: canvasDocument.revision, source: 'user', operations: [{ op: 'update_node', nodeId, changes: { transform } }], summary: '移动图层', createdAt: new Date().toISOString() });
	}, [applyCanvasTransaction, canvasDocument.revision]);
	const commitTransforms = useCallback((changes: Array<{ nodeId: string; transform: CanvasNode['transform'] }>) => {
		if (changes.length === 0) return;
		void applyCanvasTransaction({ transactionId: `desktop-transform-${Date.now()}`, baseRevision: canvasDocument.revision, source: 'user', operations: changes.map(({ nodeId, transform }) => ({ op: 'update_node' as const, nodeId, changes: { transform } })), summary: changes.length > 1 ? '变换多个图层' : '变换图层', createdAt: new Date().toISOString() });
	}, [applyCanvasTransaction, canvasDocument.revision]);
	const commitText = useCallback((nodeId: string, text: string) => {
		const node = canvasDocument.nodes[nodeId];
		if (!node?.text || node.text.text === text) return;
		void applyCanvasTransaction({ transactionId: `desktop-text-${nodeId}-${Date.now()}`, baseRevision: canvasDocument.revision, source: 'user', operations: [{ op: 'update_text', nodeId, text: { ...node.text, text } }], summary: '编辑文本', createdAt: new Date().toISOString() });
	}, [applyCanvasTransaction, canvasDocument]);
	const commitPath = useCallback((path: CanvasPathSpec, transform: CanvasTransform) => {
		const page = canvasDocument.pages.find((candidate) => candidate.id === activePageId) ?? canvasDocument.pages[0];
		const parent = page ? canvasDocument.nodes[page.rootNodeId] : undefined;
		if (!page || !parent || path.commands.length < 2) return;
		const id = `path-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		const node: CanvasNode = {
			id, type: 'path', name: '自由路径', parentId: parent.id, childIds: [], visible: true, locked: false, opacity: 1,
			transform, layout: { mode: 'absolute', width: transform.width, height: transform.height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' },
			paint: { fill: { kind: 'solid', color: '#ffffff', alpha: 0 }, stroke: { paint: { kind: 'solid', color: '#65e0c5' }, width: 2, cap: 'round', join: 'round' } }, path,
		};
		void applyCanvasTransaction({ transactionId: `desktop-pen-${id}`, baseRevision: canvasDocument.revision, source: 'user', operations: [{ op: 'create_node', node, parentId: parent.id }], summary: '自由绘制路径', createdAt: new Date().toISOString() });
		selectElement(id);
	}, [activePageId, applyCanvasTransaction, canvasDocument, selectElement]);

	return <main className={styles.designV2Canvas} aria-label="设计页面画布">
		<div className={styles.designV2CanvasBody}>
			<DesignCanvasKitBoard document={canvasDocument} activePageId={activePage?.id ?? canvasDocument.entryPageId} selectedElementId={selectedElementId} selectedElementIds={selectedElementIds} zoomPercent={zoom} canvasTool={canvasTool} aiRendering={isGenerating && execution.phase !== 'applying_patch'} aiFocusNodeIds={draft?.lastPatchNodeIds ?? []} onSelectElement={selectElement} onSelectElements={selectElements} onTransformChange={commitTransform} onTransformChanges={commitTransforms} onTextChange={commitText} onPathChange={commitPath} onTransientChange={setTransient} onZoomChange={(nextZoom) => setZoom(Math.min(250, Math.max(20, nextZoom)))} />
			{activeTab === 'code' && <div className={styles.designV2CodeView}><CodePanel /></div>}
		</div>
	</main>;
}

/**
 * 对话输入固定在中央画布底部，输入行为复用 Design Store 的队列、停止和审批状态。
 * 业务意图：输入属于画布上下文，不再占用左侧输出与历史的垂直空间。
 */
function DesignCanvasComposer() {
	const [text, setText] = useState('');
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const sendPrompt = useDesignStore((state) => state.sendPrompt);
	const stop = useDesignStore((state) => state.stop);
	const submit = (event?: FormEvent) => {
		event?.preventDefault();
		if (isGenerating) { void stop(); return; }
		const prompt = text.trim();
		if (!prompt) return;
		void sendPrompt(prompt);
		setText('');
	};
	const submitOnEnter = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
		event.preventDefault();
		submit();
	};

	return <form className={styles.designV2Composer} onSubmit={submit}><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={submitOnEnter} placeholder="描述你想修改或创建的内容…" aria-label="设计需求" /><div className={styles.designV2ComposerFooter}><button type="button" className={styles.designV2ComposerTool} aria-label="添加内容">＋</button><button type="button" className={styles.designV2ComposerTool} aria-label="输入命令">/</button><span className={styles.designV2ComposerHint}>Shift + Enter 换行</span><span className={styles.designV2ComposerGrow} /><div className={styles.designV2ComposerModel}><ModelPicker showThinkingLevel={false} /></div><button type={isGenerating ? 'button' : 'submit'} className={`${styles.designV2ComposerSend} ${isGenerating ? styles.designV2ComposerStop : ''}`} onClick={isGenerating ? () => void stop() : undefined} disabled={!isGenerating && !text.trim()} aria-label={isGenerating ? '停止设计任务' : '发送设计需求'}>{isGenerating ? <Square size={14} /> : <Send size={15} />}</button></div></form>;
}

/** 新版 Design 详情布局：左侧输出/历史，中间页面集合与输入，右侧项目级规范。 */
function DesignWorkspaceV2({ onOpenVersions }: { onOpenVersions: () => void }) {
	const [outputOpen, setOutputOpen] = useState(true);
	const [historyOpen, setHistoryOpen] = useState(true);
	const [rightPanelOpen, setRightPanelOpen] = useState(false);
	const [activeTool, setActiveTool] = useState<DesignCanvasTool>('select');
	return <div className={styles.designV2Frame} data-layout="output-history-pages-guidelines" data-right-panel={rightPanelOpen ? 'open' : 'closed'}>
		<div className={styles.designV2Body}>
			<div className={styles.designV2Left} aria-label="Design 左侧浮层">
				<DesignSessionBar />
				{outputOpen ? <DesignOutputPanel onCollapse={() => setOutputOpen(false)} /> : <button type="button" className={styles.designV2CollapsedWindow} onClick={() => setOutputOpen(true)} title="展开 AI 输出"><Sparkles size={15} /><span>输出</span></button>}
				{historyOpen ? <DesignConversationHistory onCollapse={() => setHistoryOpen(false)} /> : <button type="button" className={styles.designV2CollapsedWindow} onClick={() => setHistoryOpen(true)} title="展开对话历史"><History size={15} /><span>历史</span></button>}
			</div>
			<div className={styles.designV2Center}><DesignPagesCanvas canvasTool={activeTool} /><DesignCanvasComposer /></div>
			<aside className={`${styles.designV2Guidelines} ${rightPanelOpen ? styles.designV2GuidelinesOpen : styles.designV2GuidelinesClosed}`} aria-label="项目级设计规范" aria-hidden={!rightPanelOpen} inert={!rightPanelOpen}><DesignGuidelinesInspector /></aside>
			<DesignCanvasToolRail activeTool={activeTool} onToolChange={setActiveTool} onOpenVersions={onOpenVersions} rightPanelOpen={rightPanelOpen} onToggleRightPanel={() => setRightPanelOpen((open) => !open)} />
		</div>
	</div>;
}

// 旧版详情面板暂时保留，便于兼容历史布局数据；新版工作台不再挂载这些入口。
void Conversation;
void DesignRightResizeHandle;
void DesignRightInspector;

function CodePanel() {
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const canvasDocument = getCanvasDocument(snapshot);
	const page = canvasDocument.pages.find((candidate) => candidate.id === activePageId) ?? canvasDocument.pages[0];
	const sceneSummary = useMemo(() => JSON.stringify({ schemaVersion: canvasDocument.schemaVersion, id: canvasDocument.id, revision: canvasDocument.revision, entryPageId: canvasDocument.entryPageId, activePageId: page?.id ?? null, pages: canvasDocument.pages.map((item) => ({ id: item.id, name: item.name, route: item.route, width: item.width, height: item.height, rootNodeId: item.rootNodeId })), nodeCount: Object.keys(canvasDocument.nodes).length, assetCount: Object.keys(canvasDocument.assets).length, nodes: canvasDocument.nodes }, null, 2), [canvasDocument, page?.id]);
	const copy = async () => { await navigator.clipboard?.writeText(sceneSummary); };
	return <div className={styles.codePanel}><div className={styles.codeToolbar}><div className={styles.fileTabs}><span>Canvas 场景检查</span><span>{Object.keys(canvasDocument.nodes).length} 节点</span><span>修订 {canvasDocument.revision}</span></div><button type="button" onClick={() => void copy()} title="复制场景数据">复制场景</button></div><pre className={`${styles.codeContent} gp-scrollbar`}><code>{sceneSummary}</code></pre></div>;
}

export function DesignShell() {
	const isProjectStarted = useDesignStore((state) => state.isProjectStarted);
	const hydrateSnapshot = useDesignStore((state) => state.hydrateSnapshot);
	const currentProjectPath = useDesignStore((state) => state.projectPath);
	const snapshot = useDesignStore((state) => state.snapshot);
	const error = useDesignStore((state) => state.error);
	const clearError = useDesignStore((state) => state.clearError);
	const messages = useDesignStore((state) => state.messages);
	const [versionManagerOpen, setVersionManagerOpen] = useState(false);
	const hasGeneratedDesign = snapshot.document.version > 1 || messages.some((message) => message.kind === 'result');
	// 项目切换后重新读取该项目的 Design bucket；sidecar snapshot 是权威来源，缓存只负责首屏占位。
	// 只在项目目录变化时恢复；首次发送会直接把 design_create 返回的快照切入工作页，
	// 不应因 isProjectStarted 变化再次发起 design_open。
	useEffect(() => { void hydrateSnapshot(); }, [currentProjectPath, hydrateSnapshot]);
	return <div className={styles.shell} data-ui-version="design-v2" data-design-empty={!hasGeneratedDesign} data-design-landing={!isProjectStarted}><TargetTitleBar />{!isProjectStarted ? <DesignLanding /> : <DesignWorkspaceV2 onOpenVersions={() => setVersionManagerOpen(true)} />}<DesignVersionManager open={versionManagerOpen} onOpenChange={setVersionManagerOpen} />{error && <div className={styles.error}><span>{error}</span><button type="button" onClick={clearError} aria-label="关闭错误提示"><X size={14} /></button></div>}</div>;
}
