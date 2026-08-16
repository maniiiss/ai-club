import { afterEach, describe, expect, it } from 'vitest';
import { THEME_OPTIONS, isLightTheme, isThemeMode, normalizeTheme, useThemeStore } from './theme';

describe('theme store', () => {
	afterEach(() => useThemeStore.getState().setTheme('current'));

	it('只接受六套已定义主题', () => {
		expect(isThemeMode('current')).toBe(true);
		expect(isThemeMode('mono-dark')).toBe(true);
		expect(isThemeMode('light')).toBe(true);
		expect(isThemeMode('ember')).toBe(true);
		expect(isThemeMode('paper')).toBe(true);
		expect(isThemeMode('glacier')).toBe(true);
		expect(isThemeMode('system')).toBe(false);
		expect(normalizeTheme('unknown')).toBe('current');
		expect(isLightTheme('light')).toBe(true);
		expect(isLightTheme('paper')).toBe(true);
		expect(isLightTheme('glacier')).toBe(true);
		expect(isLightTheme('ember')).toBe(false);
	});

	it('切换主题会更新 store', () => {
		useThemeStore.getState().setTheme('light');
		expect(useThemeStore.getState().theme).toBe('light');
		expect(THEME_OPTIONS.map((option) => option.value)).toEqual(['current', 'mono-dark', 'light', 'ember', 'paper', 'glacier']);
		expect(THEME_OPTIONS.map((option) => option.label)).toEqual(['午夜石墨', '单色暗夜', '纯净浅色', '炭火橙', '纸张暖白', '冰川灰蓝']);
	});

	it('预览主题只更新当前渲染状态', () => {
		useThemeStore.getState().previewTheme('paper');
		expect(useThemeStore.getState().theme).toBe('paper');
	});
});
