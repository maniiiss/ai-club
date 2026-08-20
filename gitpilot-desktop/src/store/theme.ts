import { create } from 'zustand';

/** 工作台支持的九套视觉主题；主题只改变渲染层令牌，不改变 sidecar 会话与权限边界。 */
export type ThemeMode = 'current' | 'mono-dark' | 'light' | 'ember' | 'paper' | 'glacier' | 'glass' | 'glass-dark' | 'black-white';

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; description: string }> = [
	{ value: 'current', label: '午夜石墨', description: '深石墨背景，青绿色强调' },
	{ value: 'mono-dark', label: '单色暗夜', description: '纯黑背景，灰色辅助信息' },
	{ value: 'light', label: '纯净浅色', description: '白色背景，深色正文' },
	{ value: 'ember', label: '炭火橙', description: '炭黑背景，琥珀橙强调' },
	{ value: 'paper', label: '纸张暖白', description: '暖白背景，陶土红强调' },
	{ value: 'glacier', label: '冰川灰蓝', description: '冷灰蓝背景，深蓝强调' },
	{ value: 'glass', label: '毛玻璃', description: '黑白灰磨砂玻璃，半透明面板配柔和景深' },
	{ value: 'glass-dark', label: '毛玻璃黑', description: '黑底白字磨砂玻璃，半透明深色面板配柔和景深' },
	{ value: 'black-white', label: '经典黑白', description: '白色背景，黑色正文，黑字白底的经典扁平对比' },
];

const LIGHT_THEME_MODES: ReadonlySet<ThemeMode> = new Set(['light', 'paper', 'glacier', 'glass', 'black-white']);

/** 浏览器原生控件和滚动条需要跟随主题选择正确的明暗配色。 */
export function isLightTheme(theme: ThemeMode): boolean {
	return LIGHT_THEME_MODES.has(theme);
}

const THEME_STORAGE_KEY = 'gitpilot-desktop.theme';

export function isThemeMode(value: unknown): value is ThemeMode {
	return value === 'current' || value === 'mono-dark' || value === 'light' || value === 'ember' || value === 'paper' || value === 'glacier' || value === 'glass' || value === 'glass-dark' || value === 'black-white';
}

export function normalizeTheme(value: unknown): ThemeMode {
	return isThemeMode(value) ? value : 'current';
}

function readStoredTheme(): ThemeMode {
	if (typeof localStorage === 'undefined') return 'current';
	try {
		return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
	} catch {
		return 'current';
	}
}

/** 将主题同步到 document 根节点，CSS 令牌据此切换，不触碰业务组件结构。 */
export function applyTheme(theme: ThemeMode): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.dataset.theme = theme;
	root.style.colorScheme = isLightTheme(theme) ? 'light' : 'dark';
}

export function initializeTheme(): ThemeMode {
	const theme = readStoredTheme();
	applyTheme(theme);
	return theme;
}

interface ThemeStore {
	theme: ThemeMode;
	/** 预览不写入 localStorage，设置弹窗取消时可恢复到已保存主题。 */
	previewTheme: (theme: ThemeMode) => void;
	setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()((set) => ({
	theme: readStoredTheme(),
	previewTheme: (theme) => {
		applyTheme(theme);
		set({ theme });
	},
	setTheme: (theme) => {
		applyTheme(theme);
		try {
			localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch {
			// 本地存储不可用时仍允许本次会话切换主题。
		}
		set({ theme });
	},
}));
