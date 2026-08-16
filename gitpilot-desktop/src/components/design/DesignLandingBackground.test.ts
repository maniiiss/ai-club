import { describe, expect, it } from 'vitest';
import { THEME_OPTIONS } from '@/src/store/theme';
import { LANDING_MOTION_THEMES, LANDING_PARTICLE_THEMES } from './DesignLandingBackground';
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

	it('为六套主题提供不同的入口场景', () => {
		expect(LANDING_MOTION_THEMES.current.scene).toBe('signal');
		expect(LANDING_MOTION_THEMES['mono-dark'].scene).toBe('stars');
		expect(LANDING_MOTION_THEMES.light.scene).toBe('daylight');
		expect(LANDING_MOTION_THEMES.ember.scene).toBe('sunset');
		expect(LANDING_MOTION_THEMES.paper.scene).toBe('ink');
		expect(LANDING_MOTION_THEMES.glacier.scene).toBe('glacier');
		expect(new Set(THEME_OPTIONS.map((option) => LANDING_MOTION_THEMES[option.value].scene)).size).toBe(THEME_OPTIONS.length);
		for (const option of THEME_OPTIONS) expect(LANDING_MOTION_THEMES[option.value].speed).toBeGreaterThan(0);
	});

	it('将装饰标记限制为辅助层，避免通用粒子覆盖主题主画面', () => {
		expect(LANDING_MOTION_THEMES.current.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES.ember.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES.paper.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES.glacier.baseCount).toBeLessThan(30);
		expect(LANDING_MOTION_THEMES['mono-dark'].baseCount).toBeLessThanOrEqual(80);
	});
});
