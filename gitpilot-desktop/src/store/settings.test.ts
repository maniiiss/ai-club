import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDesktopTypography, DEFAULT_DESKTOP_PREFERENCES, loadDesktopPreferences, normalizeDesktopPreferences, resolveStandaloneTaskDirectory, saveDesktopPreferences, useSettingsDialogStore } from './settings';

function installStorage(): Map<string, string> {
	const values = new Map<string, string>();
	(globalThis as { localStorage?: Storage }).localStorage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => { values.set(key, value); },
		removeItem: (key: string) => { values.delete(key); },
		clear: () => values.clear(),
		key: (index: number) => [...values.keys()][index] ?? null,
		get length() { return values.size; },
	} as Storage;
	return values;
}

describe('桌面设置偏好', () => {
	beforeEach(() => {
		installStorage();
		useSettingsDialogStore.setState({ open: false, section: 'basic' });
	});

	it('损坏或不支持的偏好回退到默认值', () => {
		expect(normalizeDesktopPreferences(null)).toEqual(DEFAULT_DESKTOP_PREFERENCES);
		expect(normalizeDesktopPreferences({ font: 'unknown', fontSize: 23, defaultDirectory: '  ' })).toEqual(DEFAULT_DESKTOP_PREFERENCES);
		expect(normalizeDesktopPreferences({ font: 'yahei', fontSize: 16, defaultDirectory: ' C:\\workspace ' })).toEqual({ font: 'yahei', fontSize: 16, defaultDirectory: 'C:\\workspace' });
	});

	it('保存后可恢复本地排版与默认目录', () => {
		saveDesktopPreferences({ font: 'segoe', fontSize: 15, defaultDirectory: 'C:\\workspace' });
		expect(loadDesktopPreferences()).toEqual({ font: 'segoe', fontSize: 15, defaultDirectory: 'C:\\workspace' });
	});

	it('预览排版写入根级字体和字号令牌，恢复值可覆盖预览', () => {
		const setProperty = vi.fn();
		const root = { dataset: {} as DOMStringMap, style: { setProperty } };
		(globalThis as { document?: Document }).document = { documentElement: root } as unknown as Document;

		applyDesktopTypography({ font: 'yahei', fontSize: 16, defaultDirectory: null });
		expect(root.dataset.desktopFont).toBe('yahei');
		expect(setProperty).toHaveBeenCalledWith('--desktop-font-scale', String(16 / 14));
		expect(setProperty).toHaveBeenCalledWith('--text-base', `calc(14px * ${16 / 14})`);

		applyDesktopTypography(DEFAULT_DESKTOP_PREFERENCES);
		expect(root.dataset.desktopFont).toBe('default');
		expect(setProperty).toHaveBeenLastCalledWith('--text-xl', 'calc(18px * 1)');
	});

	it('独立任务只在设置了目录时替换 GitPilot 根目录', () => {
		expect(resolveStandaloneTaskDirectory('C:\\workspace', 'C:\\gitpilot')).toBe('C:\\workspace');
		expect(resolveStandaloneTaskDirectory('  ', 'C:\\gitpilot')).toBe('C:\\gitpilot');
		expect(resolveStandaloneTaskDirectory(null, null)).toBeNull();
	});

	it('账户入口默认打开基础分区，RTK 入口可直达对应分区', () => {
		useSettingsDialogStore.getState().show();
		expect(useSettingsDialogStore.getState()).toMatchObject({ open: true, section: 'basic' });
		useSettingsDialogStore.getState().show('rtk');
		expect(useSettingsDialogStore.getState()).toMatchObject({ open: true, section: 'rtk' });
		useSettingsDialogStore.getState().hide();
		expect(useSettingsDialogStore.getState().open).toBe(false);
	});
});
