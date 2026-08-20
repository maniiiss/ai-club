import { create } from 'zustand';

/** 统一设置窗口的三个功能分区。 */
export type SettingsSection = 'basic' | 'mcp' | 'skill' | 'rtk' | 'update';

/**
 * RTK 设置分区暂时隐藏：设置菜单侧边栏不再展示，/rtk 命令也回退到基础分区。
 * 需要恢复显示时改为 true 即可。
 */
export const RTK_SETTINGS_ENABLED = false;

/** 界面字体只应用于非代码类文本，代码与终端继续使用等宽字体。 */
export type DesktopFont = 'default' | 'segoe' | 'yahei' | 'bahnschrift';
export type DesktopFontSize = 12 | 13 | 14 | 15 | 16;

export interface DesktopPreferences {
	font: DesktopFont;
	fontSize: DesktopFontSize;
	/** 独立任务的默认工作目录；null 表示回退 GitPilot 根目录。 */
	defaultDirectory: string | null;
}

export const DESKTOP_FONT_OPTIONS: ReadonlyArray<{ value: DesktopFont; label: string; stack: string }> = [
	{ value: 'default', label: 'GitPilot 默认', stack: "'Bahnschrift', 'Segoe UI Variable', 'Microsoft YaHei UI', sans-serif" },
	{ value: 'segoe', label: 'Segoe UI', stack: "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', sans-serif" },
	{ value: 'yahei', label: '微软雅黑', stack: "'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI Variable', sans-serif" },
	{ value: 'bahnschrift', label: 'Bahnschrift', stack: "'Bahnschrift', 'Segoe UI Variable', 'Microsoft YaHei UI', sans-serif" },
];

export const DESKTOP_FONT_SIZES: readonly DesktopFontSize[] = [12, 13, 14, 15, 16];
export const DEFAULT_DESKTOP_PREFERENCES: Readonly<DesktopPreferences> = {
	font: 'default',
	fontSize: 14,
	defaultDirectory: null,
};

const PREFERENCES_STORAGE_KEY = 'gitpilot-desktop.preferences.v1';
const FONT_STACKS = new Map(DESKTOP_FONT_OPTIONS.map((option) => [option.value, option.stack]));

export function isDesktopFont(value: unknown): value is DesktopFont {
	return value === 'default' || value === 'segoe' || value === 'yahei' || value === 'bahnschrift';
}

export function isDesktopFontSize(value: unknown): value is DesktopFontSize {
	return value === 12 || value === 13 || value === 14 || value === 15 || value === 16;
}

/** 容错读取历史或损坏的 localStorage，避免设置页阻塞工作台启动。 */
export function normalizeDesktopPreferences(value: unknown): DesktopPreferences {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_DESKTOP_PREFERENCES };
	const source = value as Partial<Record<keyof DesktopPreferences, unknown>>;
	return {
		font: isDesktopFont(source.font) ? source.font : DEFAULT_DESKTOP_PREFERENCES.font,
		fontSize: isDesktopFontSize(source.fontSize) ? source.fontSize : DEFAULT_DESKTOP_PREFERENCES.fontSize,
		defaultDirectory: typeof source.defaultDirectory === 'string' && source.defaultDirectory.trim()
			? source.defaultDirectory.trim()
			: null,
	};
}

export function loadDesktopPreferences(): DesktopPreferences {
	if (typeof localStorage === 'undefined') return { ...DEFAULT_DESKTOP_PREFERENCES };
	try {
		const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
		return raw ? normalizeDesktopPreferences(JSON.parse(raw)) : { ...DEFAULT_DESKTOP_PREFERENCES };
	} catch {
		return { ...DEFAULT_DESKTOP_PREFERENCES };
	}
}

/** 只写入桌面渲染层偏好，不能把本地路径或字体配置交给 sidecar。 */
export function saveDesktopPreferences(preferences: DesktopPreferences): void {
	const normalized = normalizeDesktopPreferences(preferences);
	try {
		localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
	} catch {
		// 私密窗口或受限 WebView 无法持久化时，当前会话仍保留已应用的设置。
	}
}

/** 将界面字体与字号令牌一次性写入根节点，供所有 CSS Module 实时预览。 */
export function applyDesktopTypography(preferences: DesktopPreferences): void {
	if (typeof document === 'undefined') return;
	const normalized = normalizeDesktopPreferences(preferences);
	const root = document.documentElement;
	const scale = normalized.fontSize / DEFAULT_DESKTOP_PREFERENCES.fontSize;
	root.dataset.desktopFont = normalized.font;
	root.style.setProperty('--font-sans', FONT_STACKS.get(normalized.font) ?? FONT_STACKS.get('default')!);
	root.style.setProperty('--desktop-font-scale', String(scale));
	root.style.setProperty('--text-xs', `calc(12px * ${scale})`);
	root.style.setProperty('--text-sm', `calc(13px * ${scale})`);
	root.style.setProperty('--text-base', `calc(14px * ${scale})`);
	root.style.setProperty('--text-lg', `calc(16px * ${scale})`);
	root.style.setProperty('--text-xl', `calc(18px * ${scale})`);
}

/** 应用启动时先恢复排版，避免首帧从默认字体或字号跳变。 */
export function initializeDesktopPreferences(): DesktopPreferences {
	const preferences = loadDesktopPreferences();
	applyDesktopTypography(preferences);
	return preferences;
}

/** 独立任务只在用户明确配置时替换 GitPilot 根目录回退值。 */
export function resolveStandaloneTaskDirectory(defaultDirectory: string | null | undefined, gitPilotRoot: string | null): string | null {
	const preferred = defaultDirectory?.trim();
	return preferred || gitPilotRoot;
}

interface SettingsDialogState {
	open: boolean;
	section: SettingsSection;
	show: (section?: SettingsSection) => void;
	hide: () => void;
}

/** 设置弹窗为全局界面，不绑定 Code、Work 或 Design 任一工作区。 */
export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
	open: false,
	section: 'basic',
	show: (section = 'basic') => set({ open: true, section }),
	hide: () => set({ open: false }),
}));
