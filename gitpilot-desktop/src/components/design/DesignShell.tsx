import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, Check, ChevronDown, Clipboard, Code2, ExternalLink, FileText, Folder, Image as ImageIcon, Loader2, Monitor, Palette, RotateCcw, Send, Smartphone, Sparkles, Tablet, X } from 'lucide-react';
import { TargetTitleBar } from '@/src/components/desktop/TargetTitleBar';
import { ModelPicker } from '@/src/components/ModelPicker';
import { Button } from '@/src/components/ui/button';
import { DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignFileName, type DesignMessage, type DesignSnapshot, type DesignTarget } from '@/src/design/design-types';
import { isTauriEnv, rpc } from '@/src/rpc/bridge';
import type { AttachmentInput, PreparedAttachment } from '@/src/rpc/types';
import { useDesignStore } from '@/src/store/design';
import { useSessionStore } from '@/src/store/session';
import styles from './DesignShell.module.css';

function previewDocument(snapshot: DesignSnapshot): string {
	const page = snapshot.document.pages.find((candidate) => candidate.id === snapshot.document.entryPageId) ?? snapshot.document.pages[0];
	const html = page?.files.find((file) => file.path === 'index.html')?.content ?? '';
	const css = page?.files.find((file) => file.path === 'styles.css')?.content ?? '';
	const js = page?.files.find((file) => file.path === 'main.js')?.content ?? '';
	return html.replace('</head>', `<style>${css}</style></head>`).replace('</body>', `<script>${js}</script></body>`);
}

function DesignLanding() {
	const startProject = useDesignStore((state) => state.startProject);
	const currentProjectPath = useSessionStore((state) => state.currentProjectPath);
	const addProject = useSessionStore((state) => state.addProject);
	const [prompt, setPrompt] = useState('');
	const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

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

	return <div className={styles.landing}><input ref={fileInputRef} type="file" multiple className={styles.hiddenFileInput} onChange={onFileInputChange} /><div className={styles.landingContent}><div className={styles.landingLogo}><span className={styles.landingLogoMark}>➤</span><span>GitPilot Design</span></div><p className={styles.landingSubtitle}>用自然语言，把想法变成可运行的界面</p><form className={styles.landingComposer} onSubmit={submit}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：设计一个简洁的注册流程" aria-label="设计需求" autoFocus />{attachments.length > 0 && <div className={styles.landingAttachments}>{attachments.map((attachment) => <span key={attachment.name} className={styles.landingAttachment} title={attachment.name}>{attachment.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}<span>{attachment.name}</span><button type="button" onClick={() => removeAttachment(attachment.name)} aria-label={`移除附件 ${attachment.name}`}><X size={11} /></button></span>)}</div>}<div className={styles.landingComposerBar}><button type="button" className={styles.landingRoundButton} aria-label="添加附件" onClick={() => void pickFiles()} disabled={preparing}>{preparing ? <Loader2 size={16} className={styles.spin} /> : '＋'}</button><span className={styles.landingBarGrow} /><span className={styles.landingMode}><Palette size={15} />设计</span><span className={styles.landingDivider} /><div className={styles.landingModelPicker}><ModelPicker /></div><button type="submit" className={styles.landingSend} disabled={!prompt.trim() && attachments.length === 0} aria-label="开始设计"><Send size={18} /></button></div></form>{prepareError && <div className={styles.landingPrepareError}>{prepareError}<button type="button" onClick={() => setPrepareError(null)} aria-label="关闭附件错误"><X size={12} /></button></div>}<div className={styles.landingFooter}><button type="button" className={styles.landingDirectory} onClick={() => void addProject()}><Folder size={15} />{currentProjectPath ? currentProjectPath.split(/[\\/]/).pop() : '选择工作目录'}<ChevronDown size={14} /></button></div></div></div>;
}

function DesignPlanCard({ message, onApply, onDismiss }: { message: Extract<DesignMessage, { kind: 'plan' }>; onApply: () => void; onDismiss: () => void }) {
	return <article className={styles.planCard}><div className={styles.planHeader}><span className={styles.planIcon}><Sparkles size={14} /></span><div><strong>{message.plan.title}</strong><small>设计方案已准备好，请确认</small></div></div><p>{message.plan.summary}</p><div className={styles.planFiles}>{message.plan.files.map((file) => <span key={file}>{file}</span>)}</div>{message.plan.risks.length > 0 && <div className={styles.planRisk}>↳ {message.plan.risks[0]}</div>}<div className={styles.planActions}><Button size="sm" variant="default" onClick={onApply}><Check size={13} />应用方案</Button><Button size="sm" variant="ghost" onClick={onDismiss}><X size={13} />暂不应用</Button></div></article>;
}

function Conversation() {
	const messages = useDesignStore((state) => state.messages);
	const isGenerating = useDesignStore((state) => state.isGenerating);
	const pendingPlan = useDesignStore((state) => state.pendingPlan);
	const sendPrompt = useDesignStore((state) => state.sendPrompt);
	const applyPlan = useDesignStore((state) => state.applyPlan);
	const dismissPlan = useDesignStore((state) => state.dismissPlan);
	// 返回入口属于设计会话上下文，放在会话标题行内避免占用原生窗口标题栏。
	const resetProject = useDesignStore((state) => state.resetProject);
	const [text, setText] = useState('');
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
	return <aside className={styles.conversation} aria-label="设计对话"><header className={styles.conversationHeader}><div className={styles.conversationHeading}><Button type="button" variant="ghost" size="icon-sm" className={styles.backButton} onClick={resetProject} title="返回设计入口" aria-label="返回设计入口"><ArrowLeft size={16} /></Button><div><span className={styles.kicker}>设计会话</span><h1>灵感工坊</h1></div></div></header><div className={`${styles.messageList} gp-scrollbar`}>{messages.map((message) => message.kind === 'plan' ? <DesignPlanCard key={message.id} message={message} onApply={() => void applyPlan()} onDismiss={dismissPlan} /> : <article key={message.id} className={`${styles.message} ${styles[`message_${message.kind}`]}`}><div className={styles.messageMeta}>{message.kind === 'user' ? '你' : message.kind === 'error' ? '错误' : 'GITPILOT'}</div><p>{message.kind === 'result' ? message.summary : message.kind === 'error' ? message.text : message.text}</p>{message.kind === 'result' && <span className={styles.revision}>修订版 {message.revisionId}</span>}</article>)}{pendingPlan && !messages.some((message) => message.kind === 'plan' && message.plan === pendingPlan) && <DesignPlanCard message={{ id: 'pending', kind: 'plan', plan: pendingPlan }} onApply={() => void applyPlan()} onDismiss={dismissPlan} />}{isGenerating && <div className={styles.generating}><span className={styles.pulse} /><span>正在生成新的设计方案…</span></div>}</div><form className={styles.composer} onSubmit={submit}><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(); }} placeholder="描述你想设计的页面…" aria-label="设计需求" disabled={isGenerating} /><div className={styles.composerFooter}><span>⌘ Enter 发送</span><Button type="submit" size="icon" disabled={isGenerating || !text.trim()} aria-label="发送设计需求"><Send size={15} /></Button></div></form></aside>;
}

function DeviceButton({ target, active, onClick }: { target: DesignTarget; active: boolean; onClick: () => void }) {
	const Icon = target === 'mobile' ? Smartphone : target === 'tablet' ? Tablet : Monitor;
	return <button type="button" className={`${styles.deviceButton} ${active ? styles.deviceActive : ''}`} onClick={onClick}><Icon size={14} />{DESIGN_TARGETS[target].label}</button>;
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
	const target = useDesignStore((state) => state.target);
	const viewport = useDesignStore((state) => state.viewport);
	const zoom = useDesignStore((state) => state.zoom);
	const setTarget = useDesignStore((state) => state.setTarget);
	const setZoom = useDesignStore((state) => state.setZoom);
	const selectElement = useDesignStore((state) => state.selectElement);
	useEffect(() => { const onMessage = (event: MessageEvent) => { if (event.data?.type === 'design:select' && typeof event.data.id === 'string') selectElement(event.data.id); }; window.addEventListener('message', onMessage); return () => window.removeEventListener('message', onMessage); }, [selectElement]);
	const dimensions = viewport;
	const srcDoc = useMemo(() => previewDocument(snapshot), [snapshot]);
	return <div className={styles.previewPanel}><div className={styles.previewToolbar}><div className={styles.deviceGroup}>{(['mobile', 'tablet', 'desktop'] as DesignTarget[]).map((item) => <DeviceButton key={item} target={item} active={target === item} onClick={() => setTarget(item)} />)}</div><div className={styles.previewActions}><select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="预览缩放">{[50, 75, 100, 125].map((value) => <option key={value} value={value}>{value}%</option>)}</select><button type="button" title="刷新预览" onClick={() => selectElement(null)}><RotateCcw size={14} /></button><button type="button" title="在新窗口打开预览" onClick={() => window.open('', '_blank')}><ExternalLink size={14} /></button></div></div><div className={styles.previewStage}><div className={styles.deviceFrame} style={{ width: dimensions.width * zoom / 100, height: dimensions.height * zoom / 100 }}><iframe title="设计预览" sandbox="allow-scripts" srcDoc={srcDoc} /></div></div></div>;
}

function CodePanel() {
	const snapshot = useDesignStore((state) => state.snapshot);
	const activeFile = useDesignStore((state) => state.activeFile);
	const setActiveFile = useDesignStore((state) => state.setActiveFile);
	const file = snapshot.files.find((candidate) => candidate.path === activeFile) ?? snapshot.files[0];
	const copy = async () => { if (file) await navigator.clipboard?.writeText(file.content); };
	return <div className={styles.codePanel}><div className={styles.codeToolbar}><div className={styles.fileTabs}>{(['index.html', 'styles.css', 'main.js'] as DesignFileName[]).map((name) => <button type="button" key={name} className={activeFile === name ? styles.fileActive : ''} onClick={() => setActiveFile(name)}>{name}</button>)}</div><button type="button" onClick={() => void copy()} title="复制文件"><Clipboard size={14} />复制</button></div><pre className={`${styles.codeContent} gp-scrollbar`}><code>{file?.content ?? ''}</code></pre></div>;
}

export function DesignShell() {
	const isProjectStarted = useDesignStore((state) => state.isProjectStarted);
	const activeTab = useDesignStore((state) => state.activeTab);
	const setTab = useDesignStore((state) => state.setTab);
	const snapshot = useDesignStore((state) => state.snapshot);
	const revert = useDesignStore((state) => state.revert);
	const exportDesign = useDesignStore((state) => state.exportDesign);
	const error = useDesignStore((state) => state.error);
	const clearError = useDesignStore((state) => state.clearError);
	const selectedElementId = useDesignStore((state) => state.selectedElementId);
	const messages = useDesignStore((state) => state.messages);
	const hasGeneratedDesign = messages.some((message) => message.kind === 'result');
	return <div className={styles.shell} data-ui-version="design" data-design-empty={!hasGeneratedDesign}><TargetTitleBar />{!isProjectStarted ? <DesignLanding /> : <div className={styles.body}><Conversation /><main className={styles.workspace}><header className={styles.workspaceHeader}><div className={styles.pageIdentity}><span className={styles.pageDot} /><div><strong>{snapshot.document.name}</strong><span>{snapshot.document.pages[0]?.name ?? '首页'} · 修订版 {snapshot.document.version}</span></div></div><div className={styles.tabs}><button type="button" className={activeTab === 'preview' ? styles.tabActive : ''} onClick={() => setTab('preview')}><Monitor size={14} />预览</button><button type="button" className={activeTab === 'code' ? styles.tabActive : ''} onClick={() => setTab('code')}><Code2 size={14} />代码</button></div><div className={styles.workspaceActions}><Button type="button" size="sm" variant="ghost" onClick={revert}><RotateCcw size={14} />回滚</Button><Button type="button" size="sm" variant="default" onClick={() => void exportDesign()}><Clipboard size={14} />导出 HTML</Button></div></header>{activeTab === 'preview' ? <PreviewPanel /> : <CodePanel />}<footer className={styles.statusbar}><ResolutionPicker /><span className={styles.statusHint}>{hasGeneratedDesign ? (selectedElementId ? `已选中：${selectedElementId}` : '点击预览中的元素查看标识') : ''}</span></footer></main></div>}{error && <div className={styles.error}><span>{error}</span><button type="button" onClick={clearError} aria-label="关闭错误提示"><X size={14} /></button></div>}</div>;
}
