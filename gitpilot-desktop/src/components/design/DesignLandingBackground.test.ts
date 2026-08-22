import { describe, expect, it } from 'vitest';
import { THEME_OPTIONS } from '@/src/store/theme';
import { LANDING_MOTION_THEMES, LANDING_PARTICLE_THEMES, rescaleAccentMarks } from './DesignLandingBackground';
import styles from './DesignShell.module.css';

describe('Design landing motion themes', () => {
	it('为 Canvas 层提供 CSS Module 类名', () => {
		expect(styles.landingParticles).toBeTruthy();
	});

	it('为每个全局主题提供同步的装饰参数', () => {
		for (const option of THEME_OPTIONS) {
			const config = LANDING_PARTICLE_THEMES[option.value];
			expect(config).toBeDefined();
			expect(config.baseCount).toBeGreaterThan(0);
			expect(config.countScale).toBeGreaterThan(0);
			expect(config.particleAlpha).toBeGreaterThan(0);
			expect(config.pointerAlpha).toBeGreaterThan(0);
			expect(config.particle).toMatch(/^\d+, \d+, \d+$/);
		}
	});

	it('为九套主题提供不同的入口场景', () => {
		expect(LANDING_MOTION_THEMES.current.scene).toBe('signal');
		expect(LANDING_MOTION_THEMES['mono-dark'].scene).toBe('stars');
		expect(LANDING_MOTION_THEMES.light.scene).toBe('daylight');
		expect(LANDING_MOTION_THEMES.ember.scene).toBe('sunset');
		expect(LANDING_MOTION_THEMES.paper.scene).toBe('ink');
		expect(LANDING_MOTION_THEMES.glacier.scene).toBe('glacier');
		expect(LANDING_MOTION_THEMES.glass.scene).toBe('frost');
		expect(LANDING_MOTION_THEMES['glass-dark'].scene).toBe('nocturne');
		expect(LANDING_MOTION_THEMES['black-white'].scene).toBe('press');
		expect(new Set(THEME_OPTIONS.map((option) => LANDING_MOTION_THEMES[option.value].scene)).size).toBe(THEME_OPTIONS.length);
		for (const option of THEME_OPTIONS) expect(LANDING_MOTION_THEMES[option.value].speed).toBeGreaterThan(0);
	});

	it('将装饰标记限制为辅助层，避免通用粒子覆盖主题主画面', () => {
		expect(LANDING_MOTION_THEMES.current.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES.ember.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES.paper.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES.glacier.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES.glass.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES['glass-dark'].baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES['black-white'].baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES['mono-dark'].baseCount).toBeLessThanOrEqual(80);
	});
});

describe('Design landing canvas resize', () => {
	const theme = 'mono-dark';
	const motionTheme = LANDING_MOTION_THEMES[theme];

	it('初始粒子场由主题种子决定，同一主题重复生成结果一致', () => {
		const first = rescaleAccentMarks([], 0, 0, 1200, 800, theme, motionTheme);
		const second = rescaleAccentMarks([], 0, 0, 1200, 800, theme, motionTheme);
		expect(first.length).toBe(second.length);
		expect(first[0].x).toBe(second[0].x);
		expect(first[0].y).toBe(second[0].y);
	});

	it('画布尺寸变化时按比例换算既有标记，不重新随机洗牌', () => {
		const initial = rescaleAccentMarks([], 0, 0, 1200, 800, theme, motionTheme);
		const narrowed = rescaleAccentMarks(initial, 1200, 800, 900, 800, theme, motionTheme);
		expect(narrowed.length).toBe(initial.length);
		expect(narrowed[0].x).toBeCloseTo(initial[0].x * (900 / 1200), 5);
		expect(narrowed[0].y).toBeCloseTo(initial[0].y, 5);
		// 尺寸变化不打断闪烁节奏：相位与透明度保持连续。
		expect(narrowed[0].phase).toBe(initial[0].phase);
		expect(narrowed[0].alpha).toBe(initial[0].alpha);
	});

	it('面积变大时用确定性随机流补充标记，缩小时截断到目标数量', () => {
		const initial = rescaleAccentMarks([], 0, 0, 900, 800, theme, motionTheme);
		const grown = rescaleAccentMarks(initial, 900, 800, 2000, 900, theme, motionTheme);
		expect(grown.length).toBe(initial.length + 1);
		expect(grown[0].x).toBeCloseTo(initial[0].x * (2000 / 900), 5);
		const grownAgain = rescaleAccentMarks(initial, 900, 800, 2000, 900, theme, motionTheme);
		expect(grown.at(-1)?.x).toBe(grownAgain.at(-1)?.x);
		const shrunk = rescaleAccentMarks(grown, 2000, 900, 900, 800, theme, motionTheme);
		expect(shrunk.length).toBe(initial.length);
		expect(shrunk[0].x).toBeCloseTo(grown[0].x * (900 / 2000), 5);
	});
});
