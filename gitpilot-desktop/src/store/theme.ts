import { create } from 'zustand';

/** 工作台支持的三套视觉主题。current 保留当前午夜石墨与青绿色强调色。 */
export type ThemeMode = 'current' | 'mono-dark' | 'light';

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; description: string }> = [
	{ value: 'current', label: '当前主题', description: '午夜石墨与青绿色强调' },
	{ value: 'mono-dark', label: '黑底白字', description: '纯黑背景，灰色辅助信息' },
	{ value: 'light', label: '白底黑字', description: '白色背景，黑色正文' },
];

const THEME_STORAGE_KEY = 'gitpilot-desktop.theme';

export function isThemeMode(value: unknown): value is ThemeMode {
	return value === 'current' || value === 'mono-dark' || value === 'light';
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
	root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}

export function initializeTheme(): ThemeMode {
	const theme = readStoredTheme();
	applyTheme(theme);
	return theme;
}

interface ThemeStore {
	theme: ThemeMode;
	setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()((set) => ({
	theme: readStoredTheme(),
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
