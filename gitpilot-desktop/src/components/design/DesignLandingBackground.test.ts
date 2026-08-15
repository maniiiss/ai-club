import { describe, expect, it } from 'vitest';
import { THEME_OPTIONS } from '@/src/store/theme';
import { LANDING_PARTICLE_THEMES } from './DesignLandingBackground';
import styles from './DesignShell.module.css';

describe('Design landing particle themes', () => {
	it('为 Canvas 层提供 CSS Module 类名', () => {
		expect(styles.landingParticles).toBeTruthy();
	});

	it('为每个全局主题提供同步的粒子参数', () => {
		for (const option of THEME_OPTIONS) {
			const config = LANDING_PARTICLE_THEMES[option.value];
			expect(config).toBeDefined();
			expect(config.baseCount).toBeGreaterThan(0);
			expect(config.countScale).toBeGreaterThan(0);
			expect(config.particle).toMatch(/^\d+, \d+, \d+$/);
		}
	});
});
