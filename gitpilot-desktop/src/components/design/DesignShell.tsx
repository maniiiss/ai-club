import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Archive, ArrowDown, ArrowLeft, BookOpen, Check, ChevronDown, Clipboard, Code2, ExternalLink, FileText, Folder, History, Image as ImageIcon, ListChecks, Loader2, Monitor, Palette, PanelRightClose, PanelRightOpen, Plus, RotateCcw, Save, Send, Smartphone, Sparkles, Square, Tablet, Trash2, Upload, X } from 'lucide-react';
import { TargetTitleBar } from '@/src/components/desktop/TargetTitleBar';
import { ModelPicker } from '@/src/components/ModelPicker';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createDefaultProjectGuidelines, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignFile, type DesignMessage, type DesignProjectGuidelines, type DesignSnapshot, type DesignTarget } from '@/src/design/design-types';
import { isTauriEnv, rpc } from '@/src/rpc/bridge';
import type { AttachmentInput, DesignPatchOperation, PreparedAttachment } from '@/src/rpc/types';
import { listDesignProjectHistory, useDesignStore } from '@/src/store/design';
import { useThemeStore } from '@/src/store/theme';
import { DesignLandingBackground } from './DesignLandingBackground';
import { DesignPresetPicker } from './DesignPresetPicker';
import { DesignVersionManager } from './DesignVersionManager';
import styles from './DesignShell.module.css';

function filesForPage(snapshot: DesignSnapshot, pageId: string) {
	const page = snapshot.document.pages.find((candidate) => candidate.id === pageId) ?? snapshot.document.pages[0];
	if (!page) return [];
	const ids = new Set(page.fileIds ?? []);
	return snapshot.files.filter((file) => (file.id && ids.has(file.id)) || file.path.startsWith(`pages/${page.id}/`));
}

function previewDocument(snapshot: DesignSnapshot, pageId: string): string {
	const page = snapshot.document.pages.find((candidate) => candidate.id === pageId) ?? snapshot.document.pages[0];
	const files = filesForPage(snapshot, page?.id ?? pageId);
	const html = files.find((file) => file.id === page?.entryFileId || file.path.endsWith('/index.html') || file.path === 'index.html')?.content ?? '';
	const css = files.filter((file) => file.language === 'css').map((file) => file.content ?? '').join('\n');
	const js = files.filter((file) => file.language === 'javascript').map((file) => file.content ?? '').join('\n');
	return html.replace('</head>', `<style>${css}</style></head>`).replace('</body>', `<script>${js}</script></body>`);
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

	return <div ref={landingRef} className={styles.landing} data-landing-theme={theme}><DesignLandingBackground theme={theme} /><input ref={fileInputRef} type="file" multiple className={styles.hiddenFileInput} onChange={onFileInputChange} /><div className={styles.landingContent} data-mode-animation-content><div className={styles.landingLogo}><span className={styles.landingLogoMark} aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M6.5 23.5h4.75a3.25 3.25 0 0 0 3.25-3.25v-1.5a3.25 3.25 0 0 1 3.25-3.25H24" /><path d="m20 11.5 4.5 4-4.5 4" /><circle cx="6.5" cy="23.5" r="2.1" /><circle cx="14.5" cy="7.5" r="2.1" /></svg></span><span>GitPilot Design</span></div><p className={styles.landingSubtitle}>用自然语言，把想法变成可运行的界面</p><form className={styles.landingComposer} onSubmit={submit}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：设计一个简洁的注册流程" aria-label="设计需求" autoFocus />{attachments.length > 0 && <div className={styles.landingAttachments}>{attachments.map((attachment) => <span key={attachment.name} className={styles.landingAttachment} title={attachment.name}>{attachment.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}<span>{attachment.name}</span><button type="button" onClick={() => removeAttachment(attachment.name)} aria-label={`移除附件 ${attachment.name}`}><X size={11} /></button></span>)}</div>}<div className={styles.landingComposerBar}><button type="button" className={styles.landingRoundButton} aria-label="添加附件" onClick={() => void pickFiles()} disabled={preparing}>{preparing ? <Loader2 size={16} className={styles.spin} /> : '＋'}</button><button type="button" className={styles.landingProjectContext} onClick={() => void addProject()} title="添加或切换项目" aria-label={currentProjectPath ? `当前项目 ${currentProjectPath.split(/[\\/]/).pop()}` : '添加项目'}><Folder size={14} /><strong>{currentProjectPath ? currentProjectPath.split(/[\\/]/).pop() : '未选择项目'}</strong><ChevronDown size={13} /></button><DesignPresetPicker className={styles.landingPreset} selectedPresetId={selectedPresetId} onApply={applyPreset} /><span className={styles.landingBarGrow} /><div className={styles.landingModelPicker}><ModelPicker showThinkingLevel={false} /></div><button type="submit" className={styles.landingSend} disabled={!prompt.trim() && attachments.length === 0} aria-label="开始设计"><Send size={18} /></button></div></form>{prepareError && <div className={styles.landingPrepareError}>{prepareError}<button type="button" onClick={() => setPrepareError(null)} aria-label="关闭附件错误"><X size={12} /></button></div>}<section className={styles.projectHistory} aria-labelledby="design-project-history-title"><div className={styles.projectHistoryHeader}><div className={styles.projectHistoryTitle}><h2 id="design-project-history-title">项目</h2><button type="button" className={styles.projectHistoryAdd} onClick={() => void addProject()}><Plus size={13} />添加项目</button></div><span className={styles.projectHistoryCount}>{history.length}</span></div>{history.length > 0 ? <div className={styles.projectHistoryList}>{history.map((item) => <button type="button" key={item.path} data-sidebar-menu-kind="design-project" data-project-path={item.path} className={`${styles.projectHistoryCard} ${item.path === currentProjectPath ? styles.projectHistoryCardActive : ''}`} onClick={() => void openProjectHistory(item.path)} aria-current={item.path === currentProjectPath ? 'true' : undefined}><span className={styles.projectHistoryIcon}><Folder size={17} /></span><span className={styles.projectHistoryBody}><strong>{item.name}</strong><span className={styles.projectHistoryMeta}><span>{item.pageCount} 页面</span><span>{item.fileCount} 文件</span><span>{item.revisionCount} 修订</span><span>{item.messageCount} 消息</span></span></span><time className={styles.projectHistoryTime} dateTime={item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : undefined}>{formatProjectHistoryTime(item.lastActivityAt)}</time></button>)}</div> : <p className={styles.projectHistoryEmpty}>添加项目后，已创建的 Design 工作区会显示在这里</p>}</section></div></div>;
}

function DesignPlanCard({ message, onApply, onDismiss }: { message: Extract<DesignMessage, { kind: 'plan' }>; onApply: () => void; onDismiss: () => void }) {
	return <article className={styles.planCard}><div className={styles.planHeader}><span className={styles.planIcon}><Sparkles size={14} /></span><div><strong>{message.plan.title}</strong><small>设计方案已准备好，请确认</small></div></div><p>{message.plan.summary}</p><div className={styles.planFiles}>{message.plan.files.map((file) => <span key={file}>{file}</span>)}</div>{message.plan.risks.length > 0 && <div className={styles.planRisk}>↳ {message.plan.risks[0]}</div>}<div className={styles.planActions}><Button size="sm" variant="default" onClick={onApply}><Check size={13} />应用方案</Button><Button size="sm" variant="ghost" onClick={onDismiss}><X size={13} />暂不应用</Button></div></article>;
}

const DESIGN_INTAKE_STEPS = [
	{ key: 'productType', question: '这次优先设计哪类页面？', options: [{ value: '品牌或营销页面', label: '品牌 / 营销', detail: '强调叙事、视觉记忆和转化路径' }, { value: '业务管理工作台', label: '内部系统', detail: '强调信息密度、效率和明确状态' }, { value: '面向客户的产品页面', label: '产品服务', detail: '平衡功能说明、信任感和引导' }, { value: '其他页面类型', label: '其他', detail: '后续在补充约束中说明' }] },
	{ key: 'visualTone', question: '视觉基调偏好？', options: [{ value: 'Cinematic dark', label: 'Cinematic dark', detail: '深色、强对比、镜头感' }, { value: 'Editorial light', label: 'Editorial light', detail: '留白、排版、克制色彩' }, { value: 'Quiet utility', label: 'Quiet utility', detail: '专业、稳定、高信息密度' }, { value: 'Expressive color', label: 'Expressive color', detail: '明亮、活力、品牌识别' }] },
	{ key: 'layout', question: '首选版式？', options: [{ value: '左侧品牌视觉 + 右侧核心内容', label: '分栏式', detail: '品牌展示与任务区并置' }, { value: '居中单焦点内容', label: '居中单卡', detail: '聚焦一个明确的主流程' }, { value: '沉浸式全屏叙事', label: '沉浸背景', detail: '以视觉和节奏承接内容' }, { value: '模块化工作台', label: '模块工作台', detail: '适合多任务与持续操作' }] },
] as const;

/** 首轮确认卡沿用 Pi plan-mode 的“少量关键决策”语义，但由 Desktop 保持可恢复的视觉交互。 */
function DesignIntakeCard() {
	const intake = useDesignStore((state) => state.intake);
	const setIntakeStep = useDesignStore((state) => state.setIntakeStep);
	const updateIntakeAnswers = useDesignStore((state) => state.updateIntakeAnswers);
	const confirmIntake = useDesignStore((state) => state.confirmIntake);
	const skipIntake = useDesignStore((state) => state.skipIntake);
	if (!intake || intake.status !== 'pending') return null;
	const step = Math.max(0, Math.min(3, intake.step));
	const current = step < 3 ? DESIGN_INTAKE_STEPS[step] : null;
	const selected = current ? intake.answers[current.key] : undefined;
	const canContinue = step === 3 || Boolean(selected);
	const updateSelected = (value: string) => current && updateIntakeAnswers({ [current.key]: value });
	return <section className={styles.intakeCard} aria-label="设计需求确认">
		<header className={styles.intakeHeader}><span className={styles.intakeIcon}><Palette size={16} /></span><div><strong>设计需求确认</strong><p>补齐会直接影响页面方向的信息，其余交给 Agent 在生成中处理。</p></div><span className={styles.intakeProgress}>{step + 1} / 4</span></header>
		<div className={styles.intakeBody}>{current ? <><p className={styles.intakeQuestion}>{current.question}<span>（单选）</span></p><div className={current.key === 'visualTone' ? styles.intakeVisualOptions : styles.intakeOptions}>{current.options.map((option, index) => <button type="button" key={option.value} className={`${styles.intakeOption} ${selected === option.value ? styles.intakeOptionSelected : ''} ${current.key === 'visualTone' ? styles.intakeVisualOption : ''}`} onClick={() => updateSelected(option.value)} aria-pressed={selected === option.value}>{current.key === 'visualTone' && <span className={`${styles.intakeTone} ${styles[`intakeTone${index + 1}`]}`} aria-hidden="true" />}<span><strong>{option.label}</strong><small>{option.detail}</small></span>{selected === option.value && <Check size={14} aria-hidden="true" />}</button>)}</div></> : <label className={styles.intakeNotes}><span>还有哪些必须遵守的约束？<em>（可选）</em></span><textarea value={intake.answers.notes ?? ''} onChange={(event) => updateIntakeAnswers({ notes: event.target.value })} placeholder="例如：优先保证 AA 对比度；移动端保留底部主要操作；避免使用插画。" rows={4} /></label>}</div>
		<footer className={styles.intakeFooter}><span>已记录 {Object.values(intake.answers).filter(Boolean).length} 项偏好</span><div>{step > 0 && <button type="button" className={styles.intakeTextButton} onClick={() => setIntakeStep(step - 1)}>上一步</button>}<button type="button" className={styles.intakeTextButton} onClick={() => void skipIntake()}>跳过</button><Button type="button" size="sm" disabled={!canContinue} onClick={() => step === 3 ? void confirmIntake() : setIntakeStep(step + 1)}>{step === 3 ? '确认并开始' : '下一步'}</Button></div></footer>
	</section>;
}

function Conversation() {
	const messages = useDesignStore((state) => state.messages);
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const execution = useDesignStore((state) => state.execution);
	const pendingApproval = useDesignStore((state) => state.pendingApproval);
	const queuedPrompts = useDesignStore((state) => state.queuedPrompts);
	const pendingPlan = useDesignStore((state) => state.pendingPlan);
	const sendPrompt = useDesignStore((state) => state.sendPrompt);
	const stop = useDesignStore((state) => state.stop);
	const approve = useDesignStore((state) => state.approve);
	const applyPlan = useDesignStore((state) => state.applyPlan);
	const dismissPlan = useDesignStore((state) => state.dismissPlan);
	// 返回入口属于设计会话上下文，放在会话标题行内避免占用原生窗口标题栏。
	const resetProject = useDesignStore((state) => state.resetProject);
	const [text, setText] = useState('');
	const scrollTrigger = `${execution.runId ?? 'idle'}:${execution.sequence}:${messages.length}:${pendingPlan ? 'plan' : ''}:${pendingApproval ? 'approval' : ''}`;
	const { viewportRef, isFollowing, scrollToLatest } = useFollowOutputScroll<HTMLDivElement>({ trigger: scrollTrigger, resetKey: execution.runId });
	const liveStatus = getDesignLiveStatus(execution, isGenerating, queuedPrompts);
	const submit = (event?: FormEvent) => { event?.preventDefault(); if (!text.trim()) return; void sendPrompt(text); setText(''); };
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
	return <aside className={styles.conversation} aria-label="设计对话"><header className={styles.conversationHeader}><div className={styles.conversationHeading}><Button type="button" variant="ghost" size="icon-sm" className={styles.backButton} onClick={resetProject} title="返回设计入口" aria-label="返回设计入口"><ArrowLeft size={16} /></Button><div><span className={styles.kicker}>设计会话</span><h1>灵感工坊</h1></div></div></header><div className={styles.conversationScrollFrame}><div ref={viewportRef} className={`${styles.messageList} gp-scrollbar`}>{messages.map((message) => message.kind === 'plan' ? <DesignPlanCard key={message.id} message={message} onApply={() => void applyPlan()} onDismiss={dismissPlan} /> : <article key={message.id} className={`${styles.message} ${styles[`message_${message.kind}`]}`}><div className={styles.messageMeta}>{message.kind === 'user' ? `你${message.status === 'queued' ? ' · 排队中' : message.status === 'cancelled' ? ' · 已取消' : ''}` : message.kind === 'error' ? '错误' : 'GITPILOT'}</div>{message.kind === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown> : <p>{message.kind === 'result' ? message.summary : message.text}</p>}{message.kind === 'result' && <span className={styles.revision}>修订版 {message.revisionId}</span>}</article>)}<DesignIntakeCard />{pendingPlan && !messages.some((message) => message.kind === 'plan' && message.plan === pendingPlan) && <DesignPlanCard message={{ id: 'pending', kind: 'plan', plan: pendingPlan }} onApply={() => void applyPlan()} onDismiss={dismissPlan} />}{liveStatus && <div className={styles.liveStatus} role="status" aria-live="polite"><span className={styles.pulse} /><span>{liveStatus}</span></div>}{pendingApproval && <div className={styles.approvalCard}><strong>需要确认高风险设计修改</strong><p>{pendingApproval.reason}</p><div><Button size="sm" onClick={() => void approve(true)}><Check size={13} />继续</Button><Button size="sm" variant="ghost" onClick={() => void approve(false)}><X size={13} />拒绝</Button></div></div>}</div>{!isFollowing && <button type="button" className={styles.scrollToLatest} onClick={scrollToLatest} title="回到最新位置" aria-label="回到最新位置"><ArrowDown size={13} /><span>回到最新</span></button>}</div><form className={styles.composer} onSubmit={submit}><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(); }} placeholder="描述你想设计的页面…" aria-label="设计需求" /><div className={styles.composerFooter}><span>⌘ Enter 发送</span><div className={styles.composerActions}>{isGenerating && <Button type="button" size="icon" variant="ghost" onClick={() => void stop()} aria-label="停止设计任务" title="停止"><Square size={14} /></Button>}<Button type="submit" size="icon" disabled={!text.trim()} aria-label="发送设计需求"><Send size={15} /></Button></div></div></form></aside>;
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
	const exportDesign = useDesignStore((state) => state.exportDesign);
	const setError = useDesignStore((state) => state.setError);
	const importInputRef = useRef<HTMLInputElement>(null);
	const [importing, setImporting] = useState(false);
	const [dialog, setDialog] = useState<NavigatorDialogState | null>(null);
	const activePage = snapshot.document.pages.find((page) => page.id === activePageId) ?? snapshot.document.pages[0];
	const pageFiles = activePage ? filesForPage(snapshot, activePage.id) : [];
	const sharedFiles = snapshot.files.filter((file) => file.scope === 'shared' || file.scope === 'asset');
	const baseRevisionId = snapshot.document.revisions.at(-1)?.id ?? '';
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
	return <aside className={styles.navigator} aria-label="页面与文件">
		<div className={styles.navigatorTopbar}><span>页面与文件</span><div className={styles.navigatorTopbarActions}><button type="button" onClick={() => void exportDesign()} title="导出 ZIP" aria-label="导出 ZIP"><Archive size={13} /></button>{onClose && <button type="button" onClick={onClose} title="收起目录" aria-label="收起目录">×</button>}</div></div>
		<div className={styles.navigatorSection}><div className={styles.navigatorHeading}><span>页面</span><span className={styles.navigatorCount}>{snapshot.document.pages.length}</span><button type="button" onClick={() => setDialog({ kind: 'create-page', value: 'dashboard' })} title="新建页面" aria-label="新建页面"><Plus size={12} /></button></div>
			{snapshot.document.pages.map((page) => <button type="button" key={page.id} className={`${styles.navigatorPage} ${page.id === activePageId ? styles.navigatorActive : ''}`} onClick={() => { setActivePage(page.id); onClose?.(); }}><Monitor size={13} /><span>{page.name}</span><small>{page.route}</small></button>)}
		</div>
		<div className={styles.navigatorSection}><input ref={importInputRef} type="file" multiple className={styles.hiddenFileInput} onChange={(event) => void importFiles(event)} /><div className={styles.navigatorHeading}><span>{activePage?.name ?? '当前页面'} 文件</span><span className={styles.navigatorCount}>{pageFiles.length}</span><button type="button" onClick={() => importInputRef.current?.click()} title="导入文件" aria-label="导入文件" disabled={!activePage || importing}><Upload size={12} /></button><button type="button" onClick={() => activePage && setDialog({ kind: 'create-file', pageId: activePage.id, value: 'components.js' })} title="新建文件" aria-label="新建文件" disabled={!activePage}><Plus size={12} /></button></div>
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
	const messages = useDesignStore((state) => state.messages);
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const { viewportRef, isFollowing, scrollToLatest } = useFollowOutputScroll<HTMLDivElement>({ trigger: `${execution.sequence}:${messages.length}:${execution.thinking.length}`, resetKey: execution.runId });
	const phaseLabel = execution.status === 'failed' ? '执行失败' : execution.phase === 'tool' ? '执行设计工具' : execution.phase === 'thinking' ? '思考中' : isGenerating ? '处理中' : '已就绪';
	return <div className={styles.executionInspectorFrame}><div ref={viewportRef} className={styles.executionInspector}>
		<div className={styles.inspectorStatus}><span className={`${styles.inspectorStatusDot} ${isGenerating ? styles.inspectorStatusRunning : ''}`} /><div><strong>{phaseLabel}</strong><span>{queuedPrompts.length > 0 ? `${queuedPrompts.length} 条消息排队中` : '当前项目独立运行'}</span></div></div>
		{execution.thinking && <section className={styles.inspectorSection}><div className={styles.inspectorSectionHeading}><span>思考摘要</span><span className={styles.inspectorCount}>实时</span></div><p className={styles.inspectorThinking}>{execution.thinking}</p></section>}
		<section className={styles.inspectorSection}><div className={styles.inspectorSectionHeading}><span>工具步骤</span><span className={styles.inspectorCount}>{execution.steps.length}</span></div>{execution.steps.length > 0 ? <div className={styles.inspectorSteps}>{execution.steps.map((step) => <div key={step.id} className={styles.inspectorStep}><span className={step.status === 'running' ? styles.stepRunning : step.status === 'failed' ? styles.stepFailed : styles.stepDone}>{step.status === 'running' ? '执行中' : step.status === 'failed' ? '失败' : '完成'}</span><code>{step.toolName}</code></div>)}</div> : <p className={styles.inspectorEmpty}>发送设计需求后，工具步骤会显示在这里。</p>}</section>
		{pendingApproval && <section className={`${styles.inspectorSection} ${styles.inspectorApproval}`}><div className={styles.inspectorSectionHeading}><span>待确认变更</span><span className={styles.inspectorCount}>高风险</span></div><p>{pendingApproval.reason}</p></section>}
		<section className={styles.inspectorSection}><div className={styles.inspectorSectionHeading}><span>会话摘要</span><span className={styles.inspectorCount}>{messages.length}</span></div><p className={styles.inspectorEmpty}>{messages.length > 0 ? '对话记录已按当前项目隔离保存。' : '当前还没有设计消息。'}</p></section>
	</div>{!isFollowing && <button type="button" className={styles.scrollToLatest} onClick={scrollToLatest} title="回到最新位置" aria-label="回到最新位置"><ArrowDown size={13} /><span>回到最新</span></button>}</div>;
}

/** 待办页签承接首轮确认后的设计节奏，用户可手动校正，避免把 Agent 推断伪装成唯一进度。 */
function DesignTodoInspector() {
	const todos = useDesignStore((state) => state.todos);
	const cycleTodo = useDesignStore((state) => state.cycleTodo);
	const addTodo = useDesignStore((state) => state.addTodo);
	const removeTodo = useDesignStore((state) => state.removeTodo);
	const [draft, setDraft] = useState('');
	const done = todos.filter((todo) => todo.state === 'done').length;
	const submit = (event: FormEvent) => {
		event.preventDefault();
		addTodo(draft);
		setDraft('');
	};
	return <div className={`${styles.todoInspector} gp-scrollbar`}><header className={styles.todoHeader}><div><strong>待办</strong><span>当前设计推进 {done} / {todos.length || 0}</span></div><span className={styles.todoProgress}>{done}/{todos.length || 0}</span></header>{todos.length > 0 ? <div className={styles.todoList}>{todos.map((todo) => <div key={todo.id} className={`${styles.todoItem} ${todo.state === 'done' ? styles.todoDone : ''}`}><button type="button" className={`${styles.todoState} ${styles[`todoState${todo.state}`]}`} onClick={() => cycleTodo(todo.id)} aria-label={`切换待办状态：${todo.text}`} title={todo.state === 'pending' ? '设为进行中' : todo.state === 'active' ? '设为完成' : '重新打开'}>{todo.state === 'done' ? <Check size={12} /> : <span />}</button><span>{todo.text}</span><small>{todo.state === 'pending' ? '待处理' : todo.state === 'active' ? '进行中' : '已完成'}</small><button type="button" className={styles.todoRemove} onClick={() => removeTodo(todo.id)} aria-label={`删除待办 ${todo.text}`} title="删除待办"><Trash2 size={12} /></button></div>)}</div> : <p className={styles.todoEmpty}>确认需求后会生成交付待办。</p>}<form className={styles.todoAdd} onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="添加待办" aria-label="添加待办" /><button type="submit" aria-label="新增待办" title="新增待办" disabled={!draft.trim()}><Plus size={14} /></button></form></div>;
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

	return <div className={`${styles.guidelinesInspector} gp-scrollbar`}><header className={styles.guidelinesHeader}><div><strong>项目规范</strong><span>Design Agent 会遵循这些约束</span></div><div className={styles.guidelinesActions}><DesignPresetPicker className={styles.guidelinesPreset} selectedPresetId={selectedPresetId} onApply={applyPreset} /><button type="button" className={styles.guidelinesSave} onClick={() => void save()} disabled={saving}><Save size={13} />{saving ? '保存中' : '保存'}</button></div></header><div className={styles.guidelinesForm}><label className={styles.guidelinesField}><span>品牌名称</span><input value={draft.brand.name} onChange={(event) => updateBrand('name', event.target.value)} placeholder="例如：GitPilot" /></label><label className={styles.guidelinesField}><span>设计语气</span><input value={draft.brand.tone} onChange={(event) => updateBrand('tone', event.target.value)} placeholder="清晰、专业、易使用" /></label><label className={styles.guidelinesField}><span>最低对比度</span><select value={draft.accessibility.minContrast} onChange={(event) => setDraft((current) => ({ ...current, accessibility: { minContrast: event.target.value === 'AAA' ? 'AAA' : 'AA' } }))}><option value="AA">AA</option><option value="AAA">AAA</option></select></label><GuidelineMapEditor title="颜色 Token" values={draft.tokens.colors} valuePlaceholder="#0f766e" onChange={(values) => updateTokenGroup('colors', values)} /><GuidelineMapEditor title="字体 Token" values={draft.tokens.typography} valuePlaceholder="例如：16px / 1.5" onChange={(values) => updateTokenGroup('typography', values)} /><GuidelineMapEditor title="间距 Token" values={draft.tokens.spacing} valuePlaceholder="例如：16px" onChange={(values) => updateTokenGroup('spacing', values)} /><GuidelineMapEditor title="圆角 Token" values={draft.tokens.radius} valuePlaceholder="例如：8px" onChange={(values) => updateTokenGroup('radius', values)} /><GuidelineMapEditor title="阴影 Token" values={draft.tokens.shadows} valuePlaceholder="例如：0 8px 24px #0002" onChange={(values) => updateTokenGroup('shadows', values)} /><GuidelineMapEditor title="组件规则" values={draft.components} valuePlaceholder="例如：主按钮使用品牌色" onChange={updateComponents} /><label className={styles.guidelinesField}><span>设计规则</span><textarea value={draft.rules.join('\n')} onChange={(event) => setDraft((current) => ({ ...current, rules: event.target.value.split('\n').map((rule) => rule.trim()).filter(Boolean) }))} placeholder="每行一条规则" rows={5} /></label>{saved && <span className={styles.guidelinesSaved}>已保存到当前项目</span>}</div></div>;
}

type DesignInspectorTabId = 'execution' | 'todos' | 'files' | 'guidelines';

/** 右侧 Inspector 保持挂载，通过 aria-hidden 和 CSS 合成层过渡完成展开/收起。 */
function DesignRightInspector({ open }: { open: boolean }) {
	const [openTabs, setOpenTabs] = useState<DesignInspectorTabId[]>(['execution', 'todos', 'files', 'guidelines']);
	const [activeTab, setActiveTab] = useState<DesignInspectorTabId>('execution');
	const tabDefinitions: Array<{ id: DesignInspectorTabId; label: string; icon: typeof ListChecks }> = [{ id: 'execution', label: '执行过程', icon: ListChecks }, { id: 'todos', label: '待办', icon: ListChecks }, { id: 'files', label: '文件', icon: Folder }, { id: 'guidelines', label: '规范', icon: BookOpen }];
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
			{openTabs.map((tabId) => { const tab = tabDefinitions.find((item) => item.id === tabId)!; const Icon = tab.icon; return <div key={tab.id} className={`${styles.inspectorTab} ${activeTab === tab.id ? styles.inspectorTabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveTab(tab.id); } }}><Icon size={13} /><span>{tab.label}</span><button type="button" className={styles.inspectorTabClose} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} aria-label={`关闭${tab.label}`}><X size={11} /></button></div>; })}
			<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={styles.inspectorTabAdd} aria-label="打开 Design 功能页签"><Plus size={15} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{tabDefinitions.map((tab) => { const Icon = tab.icon; return <DropdownMenuItem key={tab.id} onSelect={() => openTab(tab.id)}><Icon />{tab.label}</DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu>
		</nav>
		{openTabs.length === 0 ? <div className={styles.inspectorEmptyPanel}><ListChecks size={20} /><span>右侧面板已关闭</span><small>点击上方 + 重新打开一个面板。</small></div> : activeTab === 'files' ? <DesignNavigator /> : activeTab === 'guidelines' ? <DesignGuidelinesInspector /> : activeTab === 'todos' ? <DesignTodoInspector /> : <DesignExecutionInspector />}
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

	return <div className={styles.viewportControls} aria-label="预览分辨率"><span className={styles.viewportLabel}>画布尺寸</span><select className={styles.viewportSelect} value={presetId} onChange={(event) => applyPreset(event.target.value)} aria-label="分辨率预设"><option value="custom">自定义</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} {preset.width} × {preset.height}</option>)}</select><input className={styles.viewportInput} inputMode="numeric" value={widthText} onChange={(event) => setWidthText(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter} aria-label="画布宽度" /><span>×</span><input className={styles.viewportInput} inputMode="numeric" value={heightText} onChange={(event) => setHeightText(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter} aria-label="画布高度" /></div>;
}

function PreviewPanel() {
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const target = useDesignStore((state) => state.target);
	const viewport = useDesignStore((state) => state.viewport);
	const zoom = useDesignStore((state) => state.zoom);
	const setTarget = useDesignStore((state) => state.setTarget);
	const setZoom = useDesignStore((state) => state.setZoom);
	const selectElement = useDesignStore((state) => state.selectElement);
	const projectPath = useDesignStore((state) => state.projectPath);
	const designId = snapshot.context?.designId ?? snapshot.document.id;
	const [previewHtml, setPreviewHtml] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	useEffect(() => { const onMessage = (event: MessageEvent) => { if (event.data?.type === 'design:select' && typeof event.data.id === 'string') selectElement(event.data.id); }; window.addEventListener('message', onMessage); return () => window.removeEventListener('message', onMessage); }, [selectElement]);
	useEffect(() => {
		let cancelled = false;
		if (!projectPath) return () => { cancelled = true; };
		void rpc.designPreview(projectPath, designId, activePageId, snapshot.document.revisions.at(-1)?.id).then((response) => {
			if (cancelled) return;
			if (response.success && response.command === 'design_preview' && response.data?.previewHandle?.html) { setPreviewHtml(response.data.previewHandle.html); setPreviewError(null); }
			else if (!response.success) { setPreviewHtml(null); setPreviewError(response.error); }
		}).catch((error) => { if (!cancelled) { setPreviewHtml(null); setPreviewError(error instanceof Error ? error.message : String(error)); } });
		return () => { cancelled = true; };
	}, [activePageId, designId, projectPath, snapshot.document.revisions, snapshot.document.version]);
	const dimensions = viewport;
	const srcDoc = useMemo(() => previewDocument(snapshot, activePageId), [snapshot, activePageId]);
	return <div className={styles.previewPanel}><div className={styles.previewToolbar}><div className={styles.deviceGroup}>{(['mobile', 'tablet', 'desktop'] as DesignTarget[]).map((item) => <DeviceButton key={item} target={item} active={target === item} onClick={() => setTarget(item)} />)}</div><div className={styles.previewActions}>{previewError && <span className={styles.statusHint} title={previewError}>检查失败</span>}<select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="预览缩放">{[50, 75, 100, 125].map((value) => <option key={value} value={value}>{value}%</option>)}</select><button type="button" title="刷新预览" onClick={() => { setPreviewHtml(null); selectElement(null); }}><RotateCcw size={14} /></button><button type="button" title="在新窗口打开预览" onClick={() => window.open('', '_blank')}><ExternalLink size={14} /></button></div></div><div className={styles.previewStage}><div className={styles.deviceFrame} style={{ width: dimensions.width * zoom / 100, height: dimensions.height * zoom / 100 }}><iframe title="设计预览" sandbox="allow-scripts" srcDoc={previewHtml ?? srcDoc} /></div></div></div>;
}

function CodePanel() {
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const activeFile = useDesignStore((state) => state.activeFile);
	const setActiveFile = useDesignStore((state) => state.setActiveFile);
	const file = filesForPage(snapshot, activePageId).concat(snapshot.files.filter((candidate) => candidate.scope === 'shared' || candidate.scope === 'asset')).find((candidate) => candidate.path === activeFile) ?? snapshot.files[0];
	const copy = async () => { if (file) await navigator.clipboard?.writeText(file.content ?? ''); };
	const visibleFiles = filesForPage(snapshot, activePageId).concat(snapshot.files.filter((candidate) => candidate.scope === 'shared' || candidate.scope === 'asset'));
	return <div className={styles.codePanel}><div className={styles.codeToolbar}><div className={styles.fileTabs}>{visibleFiles.map((candidate) => { const label = candidate.path.split('/').slice(-2).join('/') || candidate.path; return <button type="button" key={candidate.path} className={activeFile === candidate.path ? styles.fileActive : ''} onClick={() => setActiveFile(candidate.path)} title={candidate.path}>{label}</button>; })}</div><button type="button" onClick={() => void copy()} title="复制文件"><Clipboard size={14} />复制</button></div><pre className={`${styles.codeContent} gp-scrollbar`}><code>{file?.content ?? ''}</code></pre></div>;
}

export function DesignShell() {
	const isProjectStarted = useDesignStore((state) => state.isProjectStarted);
	const hydrateSnapshot = useDesignStore((state) => state.hydrateSnapshot);
	const currentProjectPath = useDesignStore((state) => state.projectPath);
	const activeTab = useDesignStore((state) => state.activeTab);
	const setTab = useDesignStore((state) => state.setTab);
	const snapshot = useDesignStore((state) => state.snapshot);
	const activePageId = useDesignStore((state) => state.activePageId);
	const activeFile = useDesignStore((state) => state.activeFile);
	const error = useDesignStore((state) => state.error);
	const clearError = useDesignStore((state) => state.clearError);
	const selectedElementId = useDesignStore((state) => state.selectedElementId);
	const messages = useDesignStore((state) => state.messages);
	const [rightInspectorOpen, setRightInspectorOpen] = useState(true);
	const [versionManagerOpen, setVersionManagerOpen] = useState(false);
	const hasGeneratedDesign = snapshot.document.version > 1 || messages.some((message) => message.kind === 'result');
	// 项目切换后重新读取该项目的 Design bucket；sidecar snapshot 是权威来源，缓存只负责首屏占位。
	// 只在项目目录变化时恢复；首次发送会直接把 design_create 返回的快照切入工作页，
	// 不应因 isProjectStarted 变化再次发起 design_open。
	useEffect(() => { void hydrateSnapshot(); }, [currentProjectPath, hydrateSnapshot]);
	const activePage = snapshot.document.pages.find((page) => page.id === activePageId) ?? snapshot.document.pages[0];
	return <div className={styles.shell} data-ui-version="design" data-design-empty={!hasGeneratedDesign} data-design-landing={!isProjectStarted}><TargetTitleBar />{!isProjectStarted ? <DesignLanding /> : <div className={`${styles.body} ${rightInspectorOpen ? styles.bodyWithRight : styles.bodyWithoutRight}`}><Conversation /><main className={styles.workspace}><header className={styles.workspaceHeader}><div className={styles.pageIdentity}><span className={styles.pageDot} /><div><strong>{snapshot.document.name}</strong><span>{activePage?.name ?? '首页'} · 修订版 {snapshot.document.version}</span></div></div><div className={styles.tabs}><button type="button" className={activeTab === 'preview' ? styles.tabActive : ''} onClick={() => setTab('preview')}><Monitor size={14} />预览</button><button type="button" className={activeTab === 'code' ? styles.tabActive : ''} onClick={() => setTab('code')}><Code2 size={14} />代码</button></div><div className={styles.workspaceActions}><Button type="button" size="sm" variant="ghost" onClick={() => setVersionManagerOpen(true)}><History size={14} />版本</Button><Button type="button" variant="ghost" size="icon-sm" className={styles.workspaceInspectorToggle} onClick={() => setRightInspectorOpen((open) => !open)} title={rightInspectorOpen ? '收起右侧栏' : '展开右侧栏'} aria-label={rightInspectorOpen ? '收起右侧栏' : '展开右侧栏'} aria-pressed={rightInspectorOpen}><span className={`${styles.workspaceInspectorToggleIcon} ${rightInspectorOpen ? styles.workspaceInspectorToggleIconVisible : ''}`} aria-hidden="true"><PanelRightClose size={14} /></span><span className={`${styles.workspaceInspectorToggleIcon} ${rightInspectorOpen ? '' : styles.workspaceInspectorToggleIconVisible}`} aria-hidden="true"><PanelRightOpen size={14} /></span></Button></div></header><div className={styles.workspaceBody}><div className={styles.canvas}><div className={styles.canvasContent}>{activeTab === 'preview' ? <PreviewPanel /> : <CodePanel />}</div><footer className={styles.statusbar}><ResolutionPicker /><span className={styles.statusHint}>{activePage?.name ?? '首页'} · {activeFile || '未选择文件'}</span><span className={styles.statusHint}>{hasGeneratedDesign ? (selectedElementId ? `已选中：${selectedElementId}` : '点击预览中的元素查看标识') : ''}</span></footer></div></div></main><DesignRightInspector open={rightInspectorOpen} /></div>}<DesignVersionManager open={versionManagerOpen} onOpenChange={setVersionManagerOpen} />{error && <div className={styles.error}><span>{error}</span><button type="button" onClick={clearError} aria-label="关闭错误提示"><X size={14} /></button></div>}</div>;
}
