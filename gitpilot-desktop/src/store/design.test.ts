import { describe, expect, it } from 'vitest';
import { createDemoSnapshot, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS } from '@/src/design/design-types';

describe('Design Mode snapshot', () => {
	it('provides a runnable multi-file StudioAI prototype', () => {
		const snapshot = createDemoSnapshot();
		expect(snapshot.document.entryPageId).toBe('home');
		expect(snapshot.files.map((file) => file.path)).toEqual(['index.html', 'styles.css', 'main.js']);
		expect(snapshot.files[0].content).toContain('灵感工坊');
		expect(snapshot.files[1].content).toContain('@media');
	});

	it('keeps the three target profiles deterministic', () => {
		expect(DESIGN_TARGETS.mobile).toEqual({ label: '手机', width: 375, height: 812 });
		expect(DESIGN_TARGETS.desktop.width).toBeGreaterThan(DESIGN_TARGETS.tablet.width);
	});

	it('provides editable-friendly common viewport presets', () => {
		expect(DESIGN_VIEWPORT_PRESETS.mobile.map((preset) => preset.width)).toEqual([360, 375, 390, 430]);
		expect(DESIGN_VIEWPORT_PRESETS.desktop.map((preset) => preset.id)).toEqual(['desktop-workspace', 'desktop-720p', 'desktop-1080p', 'desktop-2k', 'desktop-4k']);
		expect(DESIGN_VIEWPORT_PRESETS.desktop.find((preset) => preset.id === 'desktop-4k')).toMatchObject({ width: 3840, height: 2160 });
	});
});
