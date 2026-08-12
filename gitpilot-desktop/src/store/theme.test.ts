import { afterEach, describe, expect, it } from 'vitest';
import { THEME_OPTIONS, isThemeMode, normalizeTheme, useThemeStore } from './theme';

describe('theme store', () => {
	afterEach(() => useThemeStore.getState().setTheme('current'));

	it('只接受三套已定义主题', () => {
		expect(isThemeMode('current')).toBe(true);
		expect(isThemeMode('mono-dark')).toBe(true);
		expect(isThemeMode('light')).toBe(true);
		expect(isThemeMode('system')).toBe(false);
		expect(normalizeTheme('unknown')).toBe('current');
	});

	it('切换主题会更新 store', () => {
		useThemeStore.getState().setTheme('light');
		expect(useThemeStore.getState().theme).toBe('light');
		expect(THEME_OPTIONS.map((option) => option.value)).toEqual(['current', 'mono-dark', 'light']);
	});
});
