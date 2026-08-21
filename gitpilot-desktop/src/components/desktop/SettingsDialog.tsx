import { useEffect, useMemo, useState } from 'react';
import { ArrowClockwise as RefreshCw, Check, CheckCircle as CheckCircle2, CaretDown as ChevronDown, DownloadSimple as Download, FloppyDisk as Save, FolderOpen, Plug, ShieldCheck, SlidersHorizontal, SlidersHorizontal as Settings2, Sparkle as Sparkles, Warning as AlertTriangle, Wrench, X } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/src/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { Hint } from '@/src/components/ui/tooltip';
import { isTauriEnv } from '@/src/rpc/bridge';
import { THEME_OPTIONS, useThemeStore, type ThemeMode } from '@/src/store/theme';
import { applyDesktopTypography, DESKTOP_FONT_OPTIONS, DESKTOP_FONT_SIZES, loadDesktopPreferences, RTK_SETTINGS_ENABLED, saveDesktopPreferences, useSettingsDialogStore, type DesktopFont, type DesktopPreferences, type SettingsSection } from '@/src/store/settings';
import { McpSettingsPanel } from './McpManagerDialog';
import { SkillSettingsPanel } from './SkillManagerDialog';
import { RtkSettingsPanel } from '../RtkSettingsDialog';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import { useDesktopUpdateStore } from '@/src/store/desktop-update';
import styles from './SettingsDialog.module.css';

interface BasicDraft extends DesktopPreferences {
	theme: ThemeMode;
}

const SECTION_META: ReadonlyArray<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
	{ id: 'basic', label: '基础设置', icon: SlidersHorizontal },
	{ id: 'mcp', label: 'MCP', icon: Plug },
	{ id: 'skill', label: 'Skill', icon: Sparkles },
	...(RTK_SETTINGS_ENABLED ? [{ id: 'rtk', label: 'RTK', icon: Wrench } as const] : []),
	{ id: 'update', label: '版本与更新', icon: RefreshCw },
];

function readBasicDraft(): BasicDraft {
	return { ...loadDesktopPreferences(), theme: useThemeStore.getState().theme };
}

function themeSwatchClass(theme: ThemeMode): string {
	if (theme === 'mono-dark') return 'bg-black';
	if (theme === 'light') return 'bg-white';
	if (theme === 'ember') return 'bg-[#f0a45b]';
	if (theme === 'paper') return 'bg-[#f8f5ee]';
	if (theme === 'glacier') return 'bg-[#eef3f7]';
	if (theme === 'glass') return 'bg-[#eceef2]';
	if (theme === 'glass-dark') return 'bg-[#17181c]';
	if (theme === 'black-white') return 'bg-[#ffffff]';
	return 'bg-[#8de0cc]';
}

function sameBasicDraft(left: BasicDraft, right: BasicDraft): boolean {
	return left.theme === right.theme && left.font === right.font && left.fontSize === right.fontSize && left.defaultDirectory === right.defaultDirectory;
}

export function SettingsDialog() {
	const openState = useSettingsDialogStore((state) => state.open);
	const section = useSettingsDialogStore((state) => state.section);
	const show = useSettingsDialogStore((state) => state.show);
	const hide = useSettingsDialogStore((state) => state.hide);
	const [draft, setDraft] = useState<BasicDraft>(() => readBasicDraft());
	const [baseline, setBaseline] = useState<BasicDraft>(() => readBasicDraft());
	const [directoryError, setDirectoryError] = useState('');

	useEffect(() => {
		if (!openState) return;
		const snapshot = readBasicDraft();
		setBaseline(snapshot);
		setDraft(snapshot);
		setDirectoryError('');
	}, [openState]);

	const dirty = useMemo(() => !sameBasicDraft(draft, baseline), [baseline, draft]);
	const updateDraft = (patch: Partial<BasicDraft>) => {
		setDraft((current) => {
			const next = { ...current, ...patch };
			if (patch.theme) useThemeStore.getState().previewTheme(next.theme);
			applyDesktopTypography(next);
			return next;
		});
	};
	const discard = () => {
		useThemeStore.getState().previewTheme(baseline.theme);
		applyDesktopTypography(baseline);
		setDraft(baseline);
		hide();
	};
	const save = () => {
		const preferences: DesktopPreferences = { font: draft.font, fontSize: draft.fontSize, defaultDirectory: draft.defaultDirectory };
		saveDesktopPreferences(preferences);
		useThemeStore.getState().setTheme(draft.theme);
		applyDesktopTypography(preferences);
		setBaseline(draft);
		hide();
	};
	const chooseDirectory = async () => {
		setDirectoryError('');
		if (!isTauriEnv()) {
			setDirectoryError('目录选择仅在 GitPilot Desktop 原生窗口中可用');
			return;
		}
		try {
			// 原生目录选择器只在用户请求目录时加载，避免进入设置页就增加启动包体。
			const { open } = await import('@tauri-apps/plugin-dialog');
			const selected = await open({ directory: true, multiple: false });
			if (typeof selected === 'string' && selected.trim()) updateDraft({ defaultDirectory: selected.trim() });
		} catch (reason) {
			setDirectoryError(reason instanceof Error ? reason.message : String(reason));
		}
	};
	const activeMeta = SECTION_META.find((item) => item.id === section) ?? SECTION_META[0];
	// RTK 隐藏时把遗留的 rtk 分区请求回退到基础分区，避免打开空设置页。
	const effectiveSection: SettingsSection = section === 'rtk' && !RTK_SETTINGS_ENABLED ? 'basic' : section;

	return <Dialog open={openState} onOpenChange={(next) => { if (!next) discard(); else show(section); }}>
		<DialogContent className={styles.content} aria-describedby="gitpilot-settings-description">
			<DialogTitle className="sr-only">GitPilot 设置</DialogTitle>
			<DialogDescription id="gitpilot-settings-description" className="sr-only">调整 GitPilot Desktop 的界面、MCP、Skill、RTK 和版本更新设置。</DialogDescription>
			<div className={styles.frame}>
				<aside className={styles.sidebar} aria-label="设置分区">
					<p className={styles.eyebrow}>GitPilot</p><h1 className={styles.sidebarTitle}>设置</h1>
					<nav className={styles.nav}>{SECTION_META.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`${styles.navItem} ${effectiveSection === id ? styles.navItemActive : ''}`} aria-current={effectiveSection === id ? 'page' : undefined} onClick={() => show(id)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
				</aside>
				<main className={styles.main}>
					<header className={styles.mainHeader}><h2>{activeMeta.label}</h2></header>
					<div className={styles.body}>
						{effectiveSection === 'basic' && <BasicSettings draft={draft} dirty={dirty} directoryError={directoryError} onChange={updateDraft} onChooseDirectory={() => void chooseDirectory()} onClearDirectory={() => updateDraft({ defaultDirectory: null })} onDiscard={discard} onSave={save} />}
						{effectiveSection === 'mcp' && <McpSettingsPanel />}
						{effectiveSection === 'skill' && <SkillSettingsPanel />}
						{effectiveSection === 'rtk' && RTK_SETTINGS_ENABLED && <RtkSettingsPanel />}
						{effectiveSection === 'update' && <DesktopUpdatePanel />}
					</div>
				</main>
			</div>
		</DialogContent>
	</Dialog>;
}

function formatUpdateDate(value?: string): string {
	if (!value) return '日期由发布中心提供';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

/** 更新设置分区：手动检查可见反馈，后台检查保持静默，安装前展示明确确认。 */
function DesktopUpdatePanel() {
	const status = useDesktopUpdateStore((state) => state.status);
	const update = useDesktopUpdateStore((state) => state.update);
	const error = useDesktopUpdateStore((state) => state.error);
	const progress = useDesktopUpdateStore((state) => state.progress);
	const checkForUpdate = useDesktopUpdateStore((state) => state.checkForUpdate);
	const installUpdate = useDesktopUpdateStore((state) => state.installUpdate);
	const clearError = useDesktopUpdateStore((state) => state.clearError);
	const isStreaming = useSessionStore((state) => state.isStreaming);
	const terminalOpen = useWorkbenchStore((state) => state.layout.bottomOpen);
	const currentProjectPath = useSessionStore((state) => state.currentProjectPath);
	const [confirming, setConfirming] = useState(false);
	const busy = isStreaming || (terminalOpen && Boolean(currentProjectPath));
	const checking = status === 'checking';
	const downloading = status === 'downloading' || status === 'installing';

	const handleCheck = async () => {
		setConfirming(false);
		await checkForUpdate();
	};
	const handleInstall = async () => {
		setConfirming(false);
		await installUpdate(() => busy);
	};

	return <div className={styles.updateBody}>
		<section className={styles.updateHero}>
			<div><p className={styles.updateEyebrow}>GitPilot Desktop</p><h3>保持工作台处于最新状态</h3><p>更新会经过 Tauri 签名校验，后台检查不会打断登录、Agent 或当前工作空间。</p></div>
			<Button type="button" variant="outline" size="sm" disabled={checking || downloading} onClick={() => void handleCheck()}><RefreshCw className={checking ? 'animate-spin' : ''} />{checking ? '检查中…' : '检查更新'}</Button>
		</section>

		{status === 'unavailable' && <div className={styles.updateNotice}><ShieldCheck /><span>当前运行在浏览器预览环境，原生更新能力会在正式 Desktop 中启用。</span></div>}
		{status === 'up-to-date' && <div className={`${styles.updateNotice} ${styles.updateNoticeSuccess}`}><CheckCircle2 /><span>当前已经是最新版本。</span></div>}
		{error && <div className={`${styles.updateNotice} ${styles.updateNoticeError}`} role="alert"><AlertTriangle /><span>{error}</span><button type="button" onClick={clearError}>关闭</button></div>}

		{update && <article className={styles.updateCard}>
			<div className={styles.updateCardHeader}><div><span className={styles.updateBadge}>发现新版本</span><h4>GitPilot {update.version}</h4><p>发布日期：{formatUpdateDate(update.publishedAt)}</p></div><Download className={styles.updateCardIcon} /></div>
			<div className={styles.updateNotes}><ReactMarkdown remarkPlugins={[remarkGfm]}>{update.notes || '本次更新未提供说明。'}</ReactMarkdown></div>
			{busy && <p className={styles.updateBusy}><AlertTriangle />当前有 Agent 流式任务或应用终端会话，完成后才能安装。</p>}
			{confirming ? <div className={styles.updateConfirm}><strong>确认下载并安装 GitPilot {update.version}？</strong><span>下载完成后会校验签名、替换应用并自动重启；本地会话数据会保留。</span><div><Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>稍后</Button><Button type="button" size="sm" disabled={busy || downloading} onClick={() => void handleInstall()}><ShieldCheck />确认安装</Button></div></div> : <Button type="button" size="sm" disabled={busy || downloading} onClick={() => setConfirming(true)}>{downloading ? (progress === 100 ? '正在重启…' : `下载中 ${progress ?? 0}%`) : '下载并安装'}</Button>}
			{downloading && <div className={styles.updateProgress} aria-label="更新下载进度"><div style={{ width: `${progress ?? 0}%` }} /><span>{status === 'installing' ? '正在安装并准备重启…' : `已下载 ${progress ?? 0}%`}</span></div>}
		</article>}
	</div>;
}

interface BasicSettingsProps {
	draft: BasicDraft;
	dirty: boolean;
	directoryError: string;
	onChange: (patch: Partial<BasicDraft>) => void;
	onChooseDirectory: () => void;
	onClearDirectory: () => void;
	onDiscard: () => void;
	onSave: () => void;
}

function BasicSettings({ draft, dirty, directoryError, onChange, onChooseDirectory, onClearDirectory, onDiscard, onSave }: BasicSettingsProps) {
	const selectedFont = DESKTOP_FONT_OPTIONS.find((option) => option.value === draft.font) ?? DESKTOP_FONT_OPTIONS[0];

	return <>
		<div className={styles.basicBody}>
			{/* 安全与沙箱功能仍由会话层保留，设置页入口暂时隐藏，待隔离能力稳定后再恢复。 */}
			<section className={styles.section}><div className={styles.sectionHeading}><h3>外观</h3></div><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="desktop-font">界面字体</label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" id="desktop-font" variant="unstyled" size="sm" className={styles.selectTrigger} aria-label="选择界面字体"><span style={{ fontFamily: selectedFont.stack }}>{selectedFont.label}</span><ChevronDown size={14} aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className={styles.selectMenu}>{DESKTOP_FONT_OPTIONS.map((option) => <DropdownMenuItem key={option.value} className={`${styles.selectItem} ${draft.font === option.value ? styles.selectItemActive : ''}`} onSelect={() => onChange({ font: option.value as DesktopFont })}><span style={{ fontFamily: option.stack }}>{option.label}</span>{draft.font === option.value && <Check size={14} className={styles.selectItemCheck} aria-hidden="true" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div><div className={styles.field}><label>字号</label><div className={styles.sizeChoices} role="radiogroup" aria-label="界面字号">{DESKTOP_FONT_SIZES.map((size) => <button key={size} type="button" className={`${styles.sizeChoice} ${draft.fontSize === size ? styles.sizeChoiceActive : ''}`} role="radio" aria-checked={draft.fontSize === size} onClick={() => onChange({ fontSize: size })}>{size}px</button>)}</div></div></div></section>
			<section className={styles.section}><div className={styles.sectionHeading}><h3>主题</h3></div><div className={styles.themeGrid}>{THEME_OPTIONS.map((option) => <button key={option.value} type="button" className={`${styles.themeChoice} ${draft.theme === option.value ? styles.themeChoiceActive : ''}`} onClick={() => onChange({ theme: option.value })} aria-pressed={draft.theme === option.value}><span className={`${styles.themeSwatch} ${themeSwatchClass(option.value)}`} aria-hidden="true" /><span className={styles.themeLabel}>{option.label}</span></button>)}</div></section>
			<section className={styles.section}><div className={styles.sectionHeading}><h3>独立任务默认目录</h3></div><div className={styles.directoryRow}><div className={`${styles.directoryValue} ${!draft.defaultDirectory ? styles.directoryEmpty : ''}`} title={draft.defaultDirectory ?? undefined}>{draft.defaultDirectory ?? '未设置，将使用 GitPilot 根目录'}</div><Hint content="选择默认目录"><Button type="button" variant="outline" size="icon-sm" onClick={onChooseDirectory} aria-label="选择默认目录"><FolderOpen /></Button></Hint>{draft.defaultDirectory && <Hint content="清除默认目录"><Button type="button" variant="ghost" size="icon-sm" onClick={onClearDirectory} aria-label="清除默认目录"><X /></Button></Hint>}</div>{directoryError && <p role="alert" className="mt-2 text-xs text-[var(--destructive)]">{directoryError}</p>}</section>
		</div>
		<DialogFooter className={styles.footer}><Button type="button" variant="outline" size="sm" onClick={onDiscard}>取消</Button><Button type="button" size="sm" onClick={onSave} disabled={!dirty}><Save />保存更改</Button></DialogFooter>
	</>;
}
