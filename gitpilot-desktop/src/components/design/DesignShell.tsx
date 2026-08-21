import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Archive, ArrowClockwise as RotateCcw, ArrowDown, ArrowLeft, ArrowSquareOut as ExternalLink, BookOpen, CaretDown as ChevronDown, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Check, ClipboardText as Clipboard, ClockCounterClockwise as History, Code as Code2, DeviceMobile as Smartphone, DeviceTablet as Tablet, DotsThree as MoreHorizontal, FileText, FloppyDisk as Save, Folder, Globe as Globe2, Image as ImageIcon, ListChecks, CircleNotch as Loader2, LockKey as LockKeyhole, Monitor, Paperclip, Plus, PaperPlaneTilt as Send, SidebarSimple as PanelRightClose, SidebarSimple as PanelRightOpen, Sparkle as Sparkles, Square, Star, Trash as Trash2, UploadSimple as Upload, X } from '@phosphor-icons/react';
import { TargetTitleBar } from '@/src/components/desktop/TargetTitleBar';
import { ModelPicker } from '@/src/components/ModelPicker';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/src/components/ui/context-menu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createDefaultProjectGuidelines, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignFile, type DesignPreviewMode, type DesignProjectGuidelines, type DesignSnapshot, type DesignTarget } from '@/src/design/design-types';
import { isTauriEnv, rpc } from '@/src/rpc/bridge';
import type { AttachmentInput, DesignPatchOperation, PreparedAttachment } from '@/src/rpc/types';
import { listDesignProjectHistory, useDesignStore } from '@/src/store/design';
import { useThemeStore } from '@/src/store/theme';
import { DesignLandingBackground } from './DesignLandingBackground';
import { DesignLandingLogo } from './DesignLandingLogo';
import { DesignPlanProgressStatus } from './DesignPlanProgressStatus';
import { DesignPresetPicker } from './DesignPresetPicker';
import { DesignVersionManager } from './DesignVersionManager';
import { formatDesignCode } from '@/src/design/code-format';
import styles from './DesignShell.module.css';

function filesForPage(snapshot: DesignSnapshot, pageId: string) {
	const page = snapshot.document.pages.find((candidate) => candidate.id === pageId) ?? snapshot.document.pages[0];
	if (!page) return [];
	const ids = new Set(page.fileIds ?? []);
	return snapshot.files.filter((file) => (file.id && ids.has(file.id)) || file.path.startsWith(`pages/${page.id}/`));
}

function previewDocument(snapshot: DesignSnapshot, pageId: string): string {
	const page = snapshot.document.pages.find((candidate) => candidate.id === pageId) ?? snapshot.document.pages[0];
	const pageFiles = filesForPage(snapshot, page?.id ?? pageId);
	// sidecar 返回前，客户端兜底预览也要把 shared/ 资源加载进来，避免页面依赖公共库时直接空白。
	const sharedFiles = snapshot.files.filter((file) => file.scope === 'shared' || file.scope === 'asset');
	const files = pageFiles.concat(sharedFiles);
	const html = files.find((file) => file.id === page?.entryFileId || file.path.endsWith('/index.html') || file.path === 'index.html')?.content ?? '';
	const css = files.filter((file) => file.language === 'css').map((file) => file.content ?? '').join('\n');
	const js = files.filter((file) => file.language === 'javascript').map((file) => file.content ?? '').join('\n');
	return html.replace('</head>', `<style>${css}</style></head>`).replace('</body>', `<script>${js}</script></body>`);
}

/** 预览窗口复用 iframe 的最终 HTML，确保“新窗口”看到的内容与当前画布完全一致。 */
function openDesignPreview(html: string): void {
	const previewWindow = window.open('', 'gitpilot-design-preview', 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes');
	if (!previewWindow) return;
	previewWindow.document.open();
	previewWindow.document.write(html);
	previewWindow.document.close();
	previewWindow.focus();
}

function designLanguageForPath(path: string): DesignFile['language'] {
	const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
	if (extension === '.html' || extension === '.htm') return 'html';
	if (extension === '.css') return 'css';
	if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'javascript';
	if (extension === '.json') return 'json';
	return 'unknown';
}

function designImportFileName(name: string): string {
	const basename = name.split(/[\\/]/).pop()?.trim() ?? '';
	const cleaned = basename.replace(/[\\/]/g, '_').replace(/\.\.+/g, '_').replace(/[\u0000-\u001f<>:"|?*]/g, '_');
	return (!cleaned || cleaned === '.' ? 'imported-file' : cleaned).slice(0, 180);
}

type NavigatorDialogState =
	| { kind: 'create-page'; value: string }
	| { kind: 'create-file'; pageId: string; value: string }
	| { kind: 'rename-file'; file: DesignFile; value: string }
	| { kind: 'delete-file'; file: DesignFile; highRisk: boolean };

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
		<header className={styles.clarificationHeader}><span className={styles.clarificationIcon}><Sparkles size={15} /></span><div><strong>需要确认一个关键问题</strong><p>Agent 发现这个选择会影响后续设计，回答后会继续当前任务。</p></div></header>
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

function DeviceButton({ target, active, onClick }: { target: DesignTarget; active: boolean; onClick: () => void }) {
	const Icon = target === 'mobile' ? Smartphone : target === 'tablet' ? Tablet : Monitor;
	return <button type="button" className={`${styles.deviceButton} ${active ? styles.deviceActive : ''}`} onClick={onClick}><Icon size={14} />{DESIGN_TARGETS[target].label}</button>;
}

function DesignNavigator({ onClose }: { onClose?: () => void }) {
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const activeFile = useDesignStore((state) => state.activeFile);
	const setActivePage = useDesignStore((state) => state.setActivePage);
	const setActiveFile = useDesignStore((state) => state.setActiveFile);
	const setTab = useDesignStore((state) => state.setTab);
	const applyPatch = useDesignStore((state) => state.applyPatch);
	const renamePage = useDesignStore((state) => state.renamePage);
	const exportDesign = useDesignStore((state) => state.exportDesign);
	const setError = useDesignStore((state) => state.setError);
	const importInputRef = useRef<HTMLInputElement>(null);
	const renameInputRef = useRef<HTMLInputElement>(null);
	const renameSubmittingRef = useRef<string | null>(null);
	const renameCancelRef = useRef<string | null>(null);
	const [importing, setImporting] = useState(false);
	const [dialog, setDialog] = useState<NavigatorDialogState | null>(null);
	const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
	const [pageNameDraft, setPageNameDraft] = useState('');
	const activePage = snapshot.document.pages.find((page) => page.id === activePageId) ?? snapshot.document.pages[0];
	const pageFiles = activePage ? filesForPage(snapshot, activePage.id) : [];
	const sharedFiles = snapshot.files.filter((file) => file.scope === 'shared' || file.scope === 'asset');
	const baseRevisionId = snapshot.document.revisions.at(-1)?.id ?? '';
	const beginPageRename = (page: DesignSnapshot['document']['pages'][number]) => {
		setError(null);
		renameCancelRef.current = null;
		setRenamingPageId(page.id);
		setPageNameDraft(page.name);
	};
	const cancelPageRename = () => {
		renameCancelRef.current = renamingPageId;
		setRenamingPageId(null);
		setPageNameDraft('');
	};
	useEffect(() => {
		if (!renamingPageId) return;
		const frame = window.requestAnimationFrame(() => {
			renameInputRef.current?.focus();
			renameInputRef.current?.select();
		});
		return () => window.cancelAnimationFrame(frame);
	}, [renamingPageId]);
	const commitPageRename = async (page: DesignSnapshot['document']['pages'][number]) => {
		if (renameCancelRef.current === page.id) {
			renameCancelRef.current = null;
			return;
		}
		if (renameSubmittingRef.current === page.id) return;
		const nextName = pageNameDraft.trim();
		if (!nextName) {
			setError('页面名称不能为空');
			renameInputRef.current?.focus();
			return;
		}
		if (nextName === page.name) {
			cancelPageRename();
			return;
		}
		renameSubmittingRef.current = page.id;
		try {
			await renamePage(page.id, nextName);
			cancelPageRename();
		} catch {
			renameInputRef.current?.focus();
		} finally {
			renameSubmittingRef.current = null;
		}
	};
	const submitDialog = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!dialog) return;
		if (dialog.kind === 'create-page') {
			const pageId = dialog.value.trim();
			if (!/^[a-zA-Z0-9_-]+$/.test(pageId)) { setError('页面标识只能使用字母、数字、- 或 _'); return; }
			if (snapshot.document.pages.some((page) => page.id === pageId)) { setError(`页面已存在：${pageId}`); return; }
			const path = `pages/${pageId}/index.html`;
			setDialog(null);
			void applyPatch(pageId, { baseRevisionId, operationId: `desktop-page-${Date.now()}`, affectedPaths: [path], operations: [{ op: 'create_file', path, language: 'html', content: '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main data-design-id="root"></main></body></html>' }], summary: `创建页面 ${pageId}` });
			return;
		}
		if (dialog.kind === 'create-file') {
			const input = dialog.value.trim();
			if (!input) { setError('请输入文件路径'); return; }
			const path = input.includes('/') ? input : `pages/${dialog.pageId}/${input}`;
			if (snapshot.files.some((file) => file.path === path)) { setError(`文件已存在：${path}`); return; }
			setDialog(null);
			void applyPatch(dialog.pageId, { baseRevisionId, operationId: `desktop-file-${Date.now()}`, affectedPaths: [path], operations: [{ op: 'create_file', path, language: designLanguageForPath(path), content: '' }], summary: `创建 ${path}` });
			return;
		}
		if (dialog.kind === 'rename-file') {
			const nextPath = dialog.value.trim();
			if (!nextPath || nextPath === dialog.file.path) { setDialog(null); return; }
			if (snapshot.files.some((file) => file.path === nextPath)) { setError(`文件已存在：${nextPath}`); return; }
			setDialog(null);
			void applyPatch(activePage?.id ?? activePageId, { baseRevisionId, operationId: `desktop-rename-${Date.now()}`, affectedPaths: [dialog.file.path, nextPath], risk: 'high', operations: [{ op: 'rename_file', path: dialog.file.path, newPath: nextPath }], summary: `重命名 ${dialog.file.path}` });
			return;
		}
		setDialog(null);
		void applyPatch(activePage?.id ?? activePageId, { baseRevisionId, operationId: `desktop-delete-${Date.now()}`, affectedPaths: [dialog.file.path], risk: dialog.highRisk ? 'high' : 'safe', operations: [{ op: 'delete_file', path: dialog.file.path }], summary: `删除 ${dialog.file.path}` });
	};
	/**
	 * 文件导入一次提交一个 patch，保持 revision 原子递增；同名文件按替换处理，
	 * 这样导入后的文件立即进入 canonical manifest 和右侧文件树。
	 */
	const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(event.target.files ?? []);
		event.target.value = '';
		const currentState = useDesignStore.getState();
		const targetPage = currentState.snapshot.document.pages.find((page) => page.id === currentState.activePageId) ?? currentState.snapshot.document.pages[0];
		if (!selectedFiles.length || !targetPage) return;
		if (selectedFiles.length > 20) {
			setError('一次最多导入 20 个文件');
			return;
		}
		setImporting(true);
		try {
			const existing = new Map(currentState.snapshot.files.map((file) => [file.path, file]));
			const seen = new Set<string>();
			const operations: DesignPatchOperation[] = [];
			for (const file of selectedFiles) {
				if (file.size > 2_000_000) throw new Error(`文件过大，无法导入：${file.name}`);
				const path = `pages/${targetPage.id}/${designImportFileName(file.name)}`;
				if (seen.has(path)) continue;
				seen.add(path);
				const content = await file.text();
				if (content.length > 2_000_000) throw new Error(`文件过大，无法导入：${file.name}`);
				if (existing.has(path)) operations.push({ op: 'replace_file', path, content });
				else operations.push({ op: 'create_file', path, language: designLanguageForPath(path), content });
			}
			if (!operations.length) return;
			const affectedPaths = operations.map((operation) => operation.path);
			await applyPatch(targetPage.id, {
				baseRevisionId: currentState.snapshot.document.revisions.at(-1)?.id ?? '',
				operationId: `desktop-import-${Date.now()}`,
				affectedPaths,
				operations,
				summary: `导入 ${operations.length} 个文件`,
			});
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		} finally {
			setImporting(false);
		}
	};
	// 页面数量与文件数量和各自操作分组，保证数量贴近标题、操作始终靠右，避免被 flex 均分到中间。
	return <aside className={styles.navigator} aria-label="页面与文件">
		<div className={styles.navigatorTopbar}><span>页面与文件</span><div className={styles.navigatorTopbarActions}><button type="button" onClick={() => void exportDesign()} title="导出 ZIP" aria-label="导出 ZIP"><Archive size={13} /></button>{onClose && <button type="button" onClick={onClose} title="收起目录" aria-label="收起目录">×</button>}</div></div>
		<div className={styles.navigatorSection}><div className={styles.navigatorHeading}><div className={styles.navigatorHeadingCopy}><span>页面</span><span className={styles.navigatorCount}>{snapshot.document.pages.length}</span></div><div className={styles.navigatorHeadingActions}><button type="button" onClick={() => setDialog({ kind: 'create-page', value: 'dashboard' })} title="新建页面" aria-label="新建页面"><Plus size={12} /></button></div></div>
			{snapshot.document.pages.map((page) => <ContextMenu key={page.id}>
				<ContextMenuTrigger asChild>
					{/* 页面菜单嵌在桌面级菜单中，右键事件只允许当前页面菜单处理，避免全局编辑菜单叠加出现。 */}
					{renamingPageId === page.id ? <div onContextMenu={(event) => event.stopPropagation()} className={`${styles.navigatorPage} ${page.id === activePageId ? styles.navigatorActive : ''}`}><Monitor size={13} /><input ref={renameInputRef} className={styles.navigatorPageRenameInput} value={pageNameDraft} onChange={(event) => setPageNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelPageRename(); } if (event.key === 'Enter') { event.preventDefault(); void commitPageRename(page); } }} onBlur={() => void commitPageRename(page)} aria-label={`重命名页面：${page.name}`} /><small>{page.route}</small></div> : <button type="button" onContextMenu={(event) => event.stopPropagation()} className={`${styles.navigatorPage} ${page.id === activePageId ? styles.navigatorActive : ''}`} onClick={() => { setActivePage(page.id); onClose?.(); }}><Monitor size={13} /><span>{page.name}</span><small>{page.route}</small></button>}
				</ContextMenuTrigger>
				<ContextMenuContent className={styles.navigatorContextMenu}><ContextMenuItem onSelect={() => beginPageRename(page)}><span aria-hidden="true">✎</span>重命名</ContextMenuItem></ContextMenuContent>
			</ContextMenu>)}
		</div>
		<div className={styles.navigatorSection}><input ref={importInputRef} type="file" multiple className={styles.hiddenFileInput} onChange={(event) => void importFiles(event)} /><div className={styles.navigatorHeading}><div className={styles.navigatorHeadingCopy}><span>{activePage?.name ?? '当前页面'} 文件</span><span className={styles.navigatorCount}>{pageFiles.length}</span></div><div className={styles.navigatorHeadingActions}><button type="button" onClick={() => importInputRef.current?.click()} title="导入文件" aria-label="导入文件" disabled={!activePage || importing}><Upload size={12} /></button><button type="button" onClick={() => activePage && setDialog({ kind: 'create-file', pageId: activePage.id, value: 'components.js' })} title="新建文件" aria-label="新建文件" disabled={!activePage}><Plus size={12} /></button></div></div>
			{pageFiles.map((file) => <div key={file.path} className={styles.navigatorFileRow}><button type="button" className={`${styles.navigatorFile} ${file.path === activeFile ? styles.navigatorActive : ''}`} onClick={() => { setActiveFile(file.path); setTab('code'); onClose?.(); }}><FileText size={12} /><span title={file.path}>{file.path.split('/').pop()}</span></button><button type="button" onClick={() => setDialog({ kind: 'rename-file', file, value: file.path })} title="重命名文件"><span>↗</span></button><button type="button" onClick={() => setDialog({ kind: 'delete-file', file, highRisk: file.id === activePage?.entryFileId || file.scope === 'shared' })} title="删除文件"><Trash2 size={11} /></button></div>)}
		</div>
		{sharedFiles.length > 0 && <div className={styles.navigatorSection}><div className={styles.navigatorHeading}><span>共享与资源</span><span className={styles.navigatorCount}>{sharedFiles.length}</span></div>{sharedFiles.map((file) => <div key={file.path} className={styles.navigatorFileRow}><button type="button" className={`${styles.navigatorFile} ${file.path === activeFile ? styles.navigatorActive : ''}`} onClick={() => { setActiveFile(file.path); setTab('code'); onClose?.(); }}><Folder size={12} /><span title={file.path}>{file.path}</span></button><button type="button" onClick={() => setDialog({ kind: 'rename-file', file, value: file.path })} title="重命名文件"><span>↗</span></button><button type="button" onClick={() => setDialog({ kind: 'delete-file', file, highRisk: true })} title="删除共享文件"><Trash2 size={11} /></button></div>)}</div>}
		{dialog && <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent className={styles.navigatorDialog} aria-describedby="design-navigator-dialog-description"><form onSubmit={submitDialog}><DialogHeader><DialogTitle>{dialog.kind === 'create-page' ? '新建页面' : dialog.kind === 'create-file' ? '新建文件' : dialog.kind === 'rename-file' ? '重命名文件' : '确认删除文件'}</DialogTitle><DialogDescription id="design-navigator-dialog-description">{dialog.kind === 'create-page' ? '页面标识会作为页面目录和访问路由使用。' : dialog.kind === 'create-file' ? '页面文件可只填文件名，也可填写完整相对路径。' : dialog.kind === 'rename-file' ? '重命名会影响页面中的引用路径，请确认后继续。' : `${dialog.highRisk ? '该文件会影响页面入口或共享依赖。' : '删除后可通过修订记录恢复。'}\n${dialog.file.path}`}</DialogDescription></DialogHeader>{dialog.kind !== 'delete-file' && <div className={styles.navigatorDialogBody}><label className={styles.navigatorDialogField}><span>{dialog.kind === 'create-page' ? '页面标识' : '文件路径'}</span><input autoFocus value={dialog.value} onChange={(event) => setDialog((current) => current && current.kind !== 'delete-file' ? { ...current, value: event.target.value } : current)} /></label><p>{dialog.kind === 'create-page' ? '仅支持字母、数字、- 和 _。' : dialog.kind === 'create-file' ? '同名文件已存在时不会被覆盖。' : '将由 Design 变更确认流程继续校验引用影响。'}</p></div>}<DialogFooter><Button type="button" variant="ghost" onClick={() => setDialog(null)}>取消</Button><Button type="submit" variant={dialog.kind === 'delete-file' ? 'destructive' : 'default'}>{dialog.kind === 'create-page' || dialog.kind === 'create-file' ? '创建' : dialog.kind === 'rename-file' ? '保存' : '删除'}</Button></DialogFooter></form></DialogContent></Dialog>}
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

	return <div className={`${styles.guidelinesInspector} gp-scrollbar`}><header className={styles.guidelinesHeader}><div><strong>工作空间规范</strong><span>Design Agent 会遵循这些约束</span></div><div className={styles.guidelinesActions}><DesignPresetPicker className={styles.guidelinesPreset} selectedPresetId={selectedPresetId} onApply={applyPreset} /><button type="button" className={styles.guidelinesSave} onClick={() => void save()} disabled={saving}><Save size={13} />{saving ? '保存中' : '保存'}</button></div></header><div className={styles.guidelinesForm}><label className={styles.guidelinesField}><span>品牌名称</span><input value={draft.brand.name} onChange={(event) => updateBrand('name', event.target.value)} placeholder="例如：GitPilot" /></label><label className={styles.guidelinesField}><span>设计语气</span><input value={draft.brand.tone} onChange={(event) => updateBrand('tone', event.target.value)} placeholder="清晰、专业、易使用" /></label><label className={styles.guidelinesField}><span>最低对比度</span><select value={draft.accessibility.minContrast} onChange={(event) => setDraft((current) => ({ ...current, accessibility: { minContrast: event.target.value === 'AAA' ? 'AAA' : 'AA' } }))}><option value="AA">AA</option><option value="AAA">AAA</option></select></label><GuidelineMapEditor title="颜色 Token" values={draft.tokens.colors} valuePlaceholder="#0f766e" onChange={(values) => updateTokenGroup('colors', values)} /><GuidelineMapEditor title="字体 Token" values={draft.tokens.typography} valuePlaceholder="例如：16px / 1.5" onChange={(values) => updateTokenGroup('typography', values)} /><GuidelineMapEditor title="间距 Token" values={draft.tokens.spacing} valuePlaceholder="例如：16px" onChange={(values) => updateTokenGroup('spacing', values)} /><GuidelineMapEditor title="圆角 Token" values={draft.tokens.radius} valuePlaceholder="例如：8px" onChange={(values) => updateTokenGroup('radius', values)} /><GuidelineMapEditor title="阴影 Token" values={draft.tokens.shadows} valuePlaceholder="例如：0 8px 24px #0002" onChange={(values) => updateTokenGroup('shadows', values)} /><GuidelineMapEditor title="组件规则" values={draft.components} valuePlaceholder="例如：主按钮使用品牌色" onChange={updateComponents} /><label className={styles.guidelinesField}><span>设计规则</span><textarea value={draft.rules.join('\n')} onChange={(event) => setDraft((current) => ({ ...current, rules: event.target.value.split('\n').map((rule) => rule.trim()).filter(Boolean) }))} placeholder="每行一条规则" rows={5} /></label>{saved && <span className={styles.guidelinesSaved}>已保存到当前工作空间</span>}</div></div>;
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

function parseViewportDimension(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5000) : fallback;
}

function ResolutionPicker() {
	const target = useDesignStore((state) => state.target);
	const viewport = useDesignStore((state) => state.viewport);
	const setViewport = useDesignStore((state) => state.setViewport);
	const [widthText, setWidthText] = useState(String(viewport.width));
	const [heightText, setHeightText] = useState(String(viewport.height));
	const presets = DESIGN_VIEWPORT_PRESETS[target];
	const presetId = presets.find((preset) => preset.width === viewport.width && preset.height === viewport.height)?.id ?? 'custom';

	useEffect(() => {
		setWidthText(String(viewport.width));
		setHeightText(String(viewport.height));
	}, [viewport.height, viewport.width]);

	const commit = () => {
		const width = parseViewportDimension(widthText, viewport.width);
		const height = parseViewportDimension(heightText, viewport.height);
		setWidthText(String(width));
		setHeightText(String(height));
		setViewport({ width, height });
	};
	const applyPreset = (id: string) => {
		const preset = presets.find((candidate) => candidate.id === id);
		if (!preset) return;
		setViewport({ width: preset.width, height: preset.height });
	};
	const commitOnEnter = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') { event.preventDefault(); commit(); }
	};
	const currentPreset = presets.find((preset) => preset.id === presetId);
	const currentPresetLabel = currentPreset ? `${currentPreset.label} ${currentPreset.width} × ${currentPreset.height}` : '自定义';

	return <div className={styles.viewportControls} aria-label="预览分辨率"><span className={styles.viewportLabel}>画布尺寸</span><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className={`${styles.viewportPresetTrigger} focus-visible:outline-none focus-visible:ring-0`} aria-label={`选择画布尺寸：${currentPresetLabel}`}><span>{currentPresetLabel}</span><ChevronDown size={13} aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent side="top" align="start" className={styles.viewportPresetMenu}><DropdownMenuItem className={`${styles.viewportPresetItem} ${presetId === 'custom' ? styles.viewportPresetItemActive : ''}`} onSelect={() => undefined}><span>自定义</span>{presetId === 'custom' && <Check size={13} className={styles.viewportPresetCheck} aria-hidden="true" />}</DropdownMenuItem>{presets.map((preset) => <DropdownMenuItem key={preset.id} className={`${styles.viewportPresetItem} ${preset.id === presetId ? styles.viewportPresetItemActive : ''}`} onSelect={() => applyPreset(preset.id)}><span>{preset.label} {preset.width} × {preset.height}</span>{preset.id === presetId && <Check size={13} className={styles.viewportPresetCheck} aria-hidden="true" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><input className={styles.viewportInput} inputMode="numeric" value={widthText} onChange={(event) => setWidthText(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter} aria-label="画布宽度" /><span>×</span><input className={styles.viewportInput} inputMode="numeric" value={heightText} onChange={(event) => setHeightText(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter} aria-label="画布高度" /></div>;
}

const PREVIEW_DISPLAY_MODES: Array<{ id: DesignPreviewMode; label: string }> = [
	{ id: 'original', label: '原始尺寸' },
	{ id: 'fit', label: '自适应屏幕' },
	{ id: 'browser', label: '浏览器模式' },
];

/** 预览模式统一放在工具栏右侧，避免再次使用系统原生下拉菜单。 */
function PreviewDisplayPicker({ mode, onChange }: { mode: DesignPreviewMode; onChange: (mode: DesignPreviewMode) => void }) {
	const current = PREVIEW_DISPLAY_MODES.find((item) => item.id === mode) ?? PREVIEW_DISPLAY_MODES[0];
	return <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className={`${styles.previewModeTrigger} focus-visible:outline-none focus-visible:ring-0`} aria-label={`预览显示设置：${current.label}`}><span>{current.label}</span><ChevronDown size={13} aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className={styles.previewModeMenu}>{PREVIEW_DISPLAY_MODES.map((item) => <DropdownMenuItem key={item.id} className={`${styles.previewModeItem} ${item.id === mode ? styles.previewModeItemActive : ''}`} onSelect={() => onChange(item.id)}><span>{item.label}</span>{item.id === mode && <Check size={13} className={styles.previewModeCheck} />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

/** 浏览器模式只模拟查看器外壳，页面仍在隔离 iframe 中运行，不接管系统浏览器。 */
function BrowserFrame({ route, children }: { route: string; children: ReactNode }) {
	return <div className={styles.browserFrame}><div className={styles.browserTabStrip}><div className={styles.browserTrafficLights} aria-hidden="true"><span /><span /><span /></div><div className={styles.browserTab}><Globe2 size={12} /><span>GitPilot Preview</span><X size={11} /></div><span className={styles.browserNewTab} aria-hidden="true"><Plus size={13} /></span><span className={styles.browserTabSpacer} /></div><div className={styles.browserToolbar}><div className={styles.browserNavControls} aria-hidden="true"><ChevronLeft size={14} /><ChevronRight size={14} /><RotateCcw size={13} /></div><div className={styles.browserAddress}><LockKeyhole size={12} /><span>gitpilot.local{route}</span></div><div className={styles.browserToolbarActions} aria-hidden="true"><Star size={13} /><MoreHorizontal size={14} /></div></div><div className={styles.browserBookmarks}><span className={styles.browserBookmarkActive}>GitPilot</span><span>设计工作区</span><span>常用页面</span></div><div className={styles.browserViewport}>{children}</div></div>;
}

function PreviewPanel() {
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const target = useDesignStore((state) => state.target);
	const viewport = useDesignStore((state) => state.viewport);
	const previewMode = useDesignStore((state) => state.previewMode);
	const setTarget = useDesignStore((state) => state.setTarget);
	const setPreviewMode = useDesignStore((state) => state.setPreviewMode);
	const selectElement = useDesignStore((state) => state.selectElement);
	const projectPath = useDesignStore((state) => state.projectPath);
	const designId = snapshot.context?.designId ?? snapshot.document.id;
	const activePage = snapshot.document.pages.find((page) => page.id === activePageId) ?? snapshot.document.pages[0];
	const [previewHtml, setPreviewHtml] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	useEffect(() => { const onMessage = (event: MessageEvent) => { if (event.data?.type === 'design:select' && typeof event.data.id === 'string') selectElement(event.data.id); }; window.addEventListener('message', onMessage); return () => window.removeEventListener('message', onMessage); }, [selectElement]);
	useEffect(() => {
		let cancelled = false;
		if (!projectPath) return () => { cancelled = true; };
		// 一次 Design run 可能连续产生多个 patch；预览只在短暂静默后刷新，避免每个片段都重建完整 HTML。
		const timer = window.setTimeout(() => {
			void rpc.designPreview(projectPath, designId, activePageId, snapshot.document.revisions.at(-1)?.id).then((response) => {
				if (cancelled) return;
				if (response.success && response.command === 'design_preview' && response.data?.previewHandle?.html) { setPreviewHtml(response.data.previewHandle.html); setPreviewError(null); }
				else if (!response.success) { setPreviewHtml(null); setPreviewError(response.error); }
			}).catch((error) => { if (!cancelled) { setPreviewHtml(null); setPreviewError(error instanceof Error ? error.message : String(error)); } });
		}, 300);
		return () => { cancelled = true; window.clearTimeout(timer); };
	}, [activePageId, designId, projectPath, snapshot.document.revisions, snapshot.document.version]);
	const dimensions = viewport;
	const srcDoc = useMemo(() => previewDocument(snapshot, activePageId), [snapshot, activePageId]);
	const stageClassName = previewMode === 'browser' ? styles.previewStageBrowser : previewMode === 'fit' ? styles.previewStageFit : styles.previewStageOriginal;
	const frameClassName = previewMode === 'fit' ? styles.deviceFrameFit : styles.deviceFrameOriginal;
	const frameStyle: CSSProperties | undefined = previewMode === 'original' ? { width: dimensions.width, height: dimensions.height } : undefined;
	const previewFrame = <iframe title="设计预览" sandbox="allow-scripts" srcDoc={previewHtml ?? srcDoc} />;
	return <div className={styles.previewPanel}><div className={styles.previewToolbar}><div className={styles.deviceGroup}>{(['mobile', 'tablet', 'desktop'] as DesignTarget[]).map((item) => <DeviceButton key={item} target={item} active={target === item} onClick={() => setTarget(item)} />)}</div><div className={styles.previewActions}>{previewError && <span className={styles.statusHint} title={previewError}>检查失败</span>}<PreviewDisplayPicker mode={previewMode} onChange={setPreviewMode} /><button type="button" title="刷新预览" onClick={() => { setPreviewHtml(null); selectElement(null); }}><RotateCcw size={14} /></button><button type="button" title="在新窗口打开预览" onClick={() => openDesignPreview(previewHtml ?? srcDoc)}><ExternalLink size={14} /></button></div></div><div className={`${styles.previewStage} ${stageClassName}`}>{previewMode === 'browser' ? <BrowserFrame route={activePage?.route ?? '/'}>{previewFrame}</BrowserFrame> : <div className={`${styles.deviceFrame} ${frameClassName}`} style={frameStyle}>{previewFrame}</div>}</div></div>;
}

function CodePanel() {
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const activeFile = useDesignStore((state) => state.activeFile);
	const setActiveFile = useDesignStore((state) => state.setActiveFile);
	const file = filesForPage(snapshot, activePageId).concat(snapshot.files.filter((candidate) => candidate.scope === 'shared' || candidate.scope === 'asset')).find((candidate) => candidate.path === activeFile) ?? snapshot.files[0];
	const displayContent = useMemo(() => file ? formatDesignCode(file.content ?? '', file.language) : '', [file?.content, file?.language]);
	const copy = async () => { if (file) await navigator.clipboard?.writeText(file.content ?? ''); };
	const visibleFiles = filesForPage(snapshot, activePageId).concat(snapshot.files.filter((candidate) => candidate.scope === 'shared' || candidate.scope === 'asset'));
	return <div className={styles.codePanel}><div className={styles.codeToolbar}><div className={styles.fileTabs}>{visibleFiles.map((candidate) => { const label = candidate.path.split('/').slice(-2).join('/') || candidate.path; return <button type="button" key={candidate.path} className={activeFile === candidate.path ? styles.fileActive : ''} onClick={() => setActiveFile(candidate.path)} title={candidate.path}>{label}</button>; })}</div><button type="button" onClick={() => void copy()} title="复制文件"><Clipboard size={14} />复制</button></div><pre className={`${styles.codeContent} gp-scrollbar`}><code>{displayContent}</code></pre></div>;
}

export function DesignShell() {
	const isProjectStarted = useDesignStore((state) => state.isProjectStarted);
	const hydrateSnapshot = useDesignStore((state) => state.hydrateSnapshot);
	const currentProjectPath = useDesignStore((state) => state.projectPath);
	const activeTab = useDesignStore((state) => state.activeTab);
	const setTab = useDesignStore((state) => state.setTab);
	const setActivePage = useDesignStore((state) => state.setActivePage);
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const error = useDesignStore((state) => state.error);
	const clearError = useDesignStore((state) => state.clearError);
	const messages = useDesignStore((state) => state.messages);
	const [rightInspectorOpen, setRightInspectorOpen] = useState(true);
	const [rightInspectorWidth, setRightInspectorWidth] = useState(312);
	const [versionManagerOpen, setVersionManagerOpen] = useState(false);
	const hasGeneratedDesign = snapshot.document.version > 1 || messages.some((message) => message.kind === 'result');
	// 项目切换后重新读取该项目的 Design bucket；sidecar snapshot 是权威来源，缓存只负责首屏占位。
	// 只在项目目录变化时恢复；首次发送会直接把 design_create 返回的快照切入工作页，
	// 不应因 isProjectStarted 变化再次发起 design_open。
	useEffect(() => { void hydrateSnapshot(); }, [currentProjectPath, hydrateSnapshot]);
	const activePage = snapshot.document.pages.find((page) => page.id === activePageId) ?? snapshot.document.pages[0];
	return <div className={styles.shell} data-ui-version="design" data-design-empty={!hasGeneratedDesign} data-design-landing={!isProjectStarted}><TargetTitleBar />{!isProjectStarted ? <DesignLanding /> : <div className={`${styles.body} ${rightInspectorOpen ? styles.bodyWithRight : styles.bodyWithoutRight}`} style={{ '--design-right-width': `${rightInspectorWidth}px` } as CSSProperties}><Conversation /><main className={styles.workspace}><header className={styles.workspaceHeader}><div className={styles.pageSwitcher}><span className={styles.pageDot} aria-hidden="true" /><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className={`${styles.pageSwitcherTrigger} focus-visible:outline-none focus-visible:ring-0`} aria-label="切换设计页面"><span>{activePage?.name ?? '首页'}</span><ChevronDown size={13} aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className={styles.pageSwitcherMenu}>{snapshot.document.pages.map((page) => <DropdownMenuItem key={page.id} className={`${styles.pageSwitcherItem} ${page.id === activePageId ? styles.pageSwitcherItemActive : ''}`} onSelect={() => setActivePage(page.id)}><span>{page.name}</span>{page.id === activePageId && <Check size={13} className={styles.pageSwitcherItemCheck} />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div><div className={styles.tabs}><button type="button" className={activeTab === 'preview' ? styles.tabActive : ''} onClick={() => setTab('preview')}><Monitor size={14} />预览</button><button type="button" className={activeTab === 'code' ? styles.tabActive : ''} onClick={() => setTab('code')}><Code2 size={14} />代码</button></div><div className={styles.workspaceActions}><Button type="button" size="sm" variant="ghost" onClick={() => setVersionManagerOpen(true)}><History size={14} />版本</Button></div></header><div className={styles.workspaceBody}><div className={styles.canvas}><div className={styles.canvasContent}>{activeTab === 'preview' ? <PreviewPanel /> : <CodePanel />}</div></div></div></main>{rightInspectorOpen ? <DesignRightResizeHandle value={rightInspectorWidth} onChange={setRightInspectorWidth} /> : <div className={styles.rightResizeHandlePlaceholder} aria-hidden="true" />}<DesignRightInspector open={rightInspectorOpen} /></div>}<footer className={styles.statusbar}><ResolutionPicker /><span className={styles.statusGrow} /><Button type="button" variant="ghost" size="icon-sm" className={`${styles.workspaceInspectorToggle} ${styles.rightPanelToggle}`} onClick={() => setRightInspectorOpen((open) => !open)} title={rightInspectorOpen ? '收起右侧栏' : '展开右侧栏'} aria-label={rightInspectorOpen ? '收起右侧栏' : '展开右侧栏'} aria-pressed={rightInspectorOpen}><span className={`${styles.workspaceInspectorToggleIcon} ${rightInspectorOpen ? styles.workspaceInspectorToggleIconVisible : ''}`} aria-hidden="true"><PanelRightClose size={14} /></span><span className={`${styles.workspaceInspectorToggleIcon} ${rightInspectorOpen ? '' : styles.workspaceInspectorToggleIconVisible}`} aria-hidden="true"><PanelRightOpen size={14} /></span></Button></footer><DesignVersionManager open={versionManagerOpen} onOpenChange={setVersionManagerOpen} />{error && <div className={styles.error}><span>{error}</span><button type="button" onClick={clearError} aria-label="关闭错误提示"><X size={14} /></button></div>}</div>;
}
