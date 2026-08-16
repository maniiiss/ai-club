import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Plug, Save, Settings2, SlidersHorizontal, Wrench, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/src/components/ui/dialog';
import { Hint } from '@/src/components/ui/tooltip';
import { isTauriEnv } from '@/src/rpc/bridge';
import { THEME_OPTIONS, useThemeStore, type ThemeMode } from '@/src/store/theme';
import { applyDesktopTypography, DESKTOP_FONT_OPTIONS, DESKTOP_FONT_SIZES, loadDesktopPreferences, saveDesktopPreferences, useSettingsDialogStore, type DesktopFont, type DesktopPreferences, type SettingsSection } from '@/src/store/settings';
import { McpSettingsPanel } from './McpManagerDialog';
import { RtkSettingsPanel } from '../RtkSettingsDialog';
import styles from './SettingsDialog.module.css';

interface BasicDraft extends DesktopPreferences {
	theme: ThemeMode;
}

const SECTION_META: ReadonlyArray<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
	{ id: 'basic', label: '基础设置', icon: SlidersHorizontal },
	{ id: 'mcp', label: 'MCP', icon: Plug },
	{ id: 'rtk', label: 'RTK', icon: Wrench },
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

	return <Dialog open={openState} onOpenChange={(next) => { if (!next) discard(); else show(section); }}>
		<DialogContent className={styles.content} aria-describedby="gitpilot-settings-description">
			<DialogTitle className="sr-only">GitPilot 设置</DialogTitle>
			<DialogDescription id="gitpilot-settings-description" className="sr-only">调整 GitPilot Desktop 的界面、MCP 和 RTK 设置。</DialogDescription>
			<div className={styles.frame}>
				<aside className={styles.sidebar} aria-label="设置分区">
					<p className={styles.eyebrow}>GitPilot</p><h1 className={styles.sidebarTitle}>设置</h1>
					<nav className={styles.nav}>{SECTION_META.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`${styles.navItem} ${section === id ? styles.navItemActive : ''}`} aria-current={section === id ? 'page' : undefined} onClick={() => show(id)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
				</aside>
				<main className={styles.main}>
					<header className={styles.mainHeader}><h2>{activeMeta.label}</h2></header>
					<div className={styles.body}>
						{section === 'basic' && <BasicSettings draft={draft} dirty={dirty} directoryError={directoryError} onChange={updateDraft} onChooseDirectory={() => void chooseDirectory()} onClearDirectory={() => updateDraft({ defaultDirectory: null })} onDiscard={discard} onSave={save} />}
						{section === 'mcp' && <McpSettingsPanel />}
						{section === 'rtk' && <RtkSettingsPanel />}
					</div>
				</main>
			</div>
		</DialogContent>
	</Dialog>;
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
	return <>
		<div className={styles.basicBody}>
			<section className={styles.section}><div className={styles.sectionHeading}><h3>外观</h3></div><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="desktop-font">界面字体</label><select id="desktop-font" className={styles.select} value={draft.font} onChange={(event) => onChange({ font: event.target.value as DesktopFont })}>{DESKTOP_FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className={styles.field}><label>字号</label><div className={styles.sizeChoices} role="radiogroup" aria-label="界面字号">{DESKTOP_FONT_SIZES.map((size) => <button key={size} type="button" className={`${styles.sizeChoice} ${draft.fontSize === size ? styles.sizeChoiceActive : ''}`} role="radio" aria-checked={draft.fontSize === size} onClick={() => onChange({ fontSize: size })}>{size}px</button>)}</div></div></div></section>
			<section className={styles.section}><div className={styles.sectionHeading}><h3>主题</h3></div><div className={styles.themeGrid}>{THEME_OPTIONS.map((option) => <button key={option.value} type="button" className={`${styles.themeChoice} ${draft.theme === option.value ? styles.themeChoiceActive : ''}`} onClick={() => onChange({ theme: option.value })} aria-pressed={draft.theme === option.value}><span className={`${styles.themeSwatch} ${themeSwatchClass(option.value)}`} aria-hidden="true" /><span className={styles.themeLabel}>{option.label}</span></button>)}</div></section>
			<section className={styles.section}><div className={styles.sectionHeading}><h3>独立任务默认目录</h3></div><div className={styles.directoryRow}><div className={`${styles.directoryValue} ${!draft.defaultDirectory ? styles.directoryEmpty : ''}`} title={draft.defaultDirectory ?? undefined}>{draft.defaultDirectory ?? '未设置，将使用 GitPilot 根目录'}</div><Hint content="选择默认目录"><Button type="button" variant="outline" size="icon-sm" onClick={onChooseDirectory} aria-label="选择默认目录"><FolderOpen /></Button></Hint>{draft.defaultDirectory && <Hint content="清除默认目录"><Button type="button" variant="ghost" size="icon-sm" onClick={onClearDirectory} aria-label="清除默认目录"><X /></Button></Hint>}</div>{directoryError && <p role="alert" className="mt-2 text-xs text-[var(--destructive)]">{directoryError}</p>}</section>
		</div>
		<DialogFooter className={styles.footer}><Button type="button" variant="outline" size="sm" onClick={onDiscard}>取消</Button><Button type="button" size="sm" onClick={onSave} disabled={!dirty}><Save />保存更改</Button></DialogFooter>
	</>;
}
