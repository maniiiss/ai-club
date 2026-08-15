import { useEffect, useRef } from 'react';
import type { ThemeMode } from '@/src/store/theme';
import styles from './DesignShell.module.css';

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	targetVx: number;
	targetVy: number;
	nextTurnAt: number;
	size: number;
	alpha: number;
	phase: number;
	phaseSpeed: number;
}

interface ParticleTheme {
	particle: string;
	particleAlpha: number;
	countScale: number;
	baseCount: number;
}

interface PointerRipple {
	x: number;
	y: number;
	startedAt: number;
}

const RIPPLE_LIFETIME = 1100;
const RIPPLE_RADIUS = 184;
const RIPPLE_EDGE_WIDTH = 28;
const RIPPLE_DOT_COUNT = 32;
const MAX_RIPPLES = 5;
const PARTICLE_MAX_VX = 7.2;
const PARTICLE_MAX_VY = 5.76;

// 鼠标反馈使用有限寿命的扩散波纹，避免点阵持续绑定在指针位置形成块状光斑。

/**
 * 空项目入口的粒子只表达 GitPilot 当前 UI 主题，不进入用户生成的 Design snapshot。
 * 业务意图：后续新增主题时只扩展这一组视觉参数，动画和布局逻辑保持不变。
 */
export const LANDING_PARTICLE_THEMES: Record<ThemeMode, ParticleTheme> = {
	current: { particle: '141, 224, 204', particleAlpha: 0.7, countScale: 1, baseCount: 120 },
	'mono-dark': { particle: '235, 235, 235', particleAlpha: 0.62, countScale: 0.82, baseCount: 105 },
	light: { particle: '15, 118, 110', particleAlpha: 0.52, countScale: 0.72, baseCount: 90 },
};

function randomNormal(): number {
	const first = Math.max(Number.EPSILON, Math.random());
	const second = Math.random();
	return Math.sqrt(-2 * Math.log(first)) * Math.cos(Math.PI * 2 * second);
}

function createParticle(width: number, height: number, theme: ParticleTheme): Particle {
	// 约七成粒子聚集在右上方，形成粒子云的视觉重心，避免均匀雪花感。
	const clustered = Math.random() < 0.72;
	const x = clustered ? width * (0.72 + randomNormal() * 0.24) : Math.random() * width;
	const y = clustered ? height * (0.27 + randomNormal() * 0.2) : Math.random() * height;
	return {
		x: Math.max(-20, Math.min(width + 20, x)),
		y: Math.max(-20, Math.min(height + 20, y)),
		vx: (Math.random() - 0.5) * PARTICLE_MAX_VX,
		vy: (Math.random() - 0.5) * PARTICLE_MAX_VY,
		targetVx: (Math.random() - 0.5) * PARTICLE_MAX_VX,
		targetVy: (Math.random() - 0.5) * PARTICLE_MAX_VY,
		nextTurnAt: 700 + Math.random() * 1800,
		size: 1 + Math.random() * 2.7,
		alpha: (0.25 + Math.random() * 0.75) * theme.particleAlpha,
		phase: Math.random() * Math.PI * 2,
		phaseSpeed: 0.006 + Math.random() * 0.012,
	};
}

function getParticleCount(width: number, height: number, theme: ParticleTheme): number {
	const areaCount = Math.round((width * height) / 9000);
	return Math.max(theme.baseCount, Math.min(420, Math.round((theme.baseCount + areaCount) * theme.countScale)));
}

function drawPointerRipples(context: CanvasRenderingContext2D, ripples: PointerRipple[], time: number, theme: ParticleTheme, width: number, height: number): void {
	context.fillStyle = `rgb(${theme.particle})`;
	for (const ripple of ripples) {
		const progress = (time - ripple.startedAt) / RIPPLE_LIFETIME;
		if (progress < 0 || progress >= 1) continue;
		const radius = 10 + progress * RIPPLE_RADIUS;
		const fade = (1 - progress) ** 1.35;
		for (let index = 0; index < RIPPLE_DOT_COUNT; index += 1) {
			const angle = (index / RIPPLE_DOT_COUNT) * Math.PI * 2 + time * 0.00018;
			const wobble = Math.sin(time * 0.003 + index * 1.7 + ripple.startedAt * 0.002) * 2.4;
			const x = ripple.x + Math.cos(angle) * (radius + wobble);
			const y = ripple.y + Math.sin(angle) * (radius + wobble);
			if (x < 0 || x > width || y < 0 || y > height) continue;
			const intensity = 0.42 + Math.sin(time * 0.004 + index * 0.9) * 0.18;
			context.globalAlpha = fade * intensity * theme.particleAlpha;
			context.fillRect(x, y, 1.6, 1.6);
		}
	}
}

export function DesignLandingBackground({ theme }: { theme: ThemeMode }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;

		// 某些已安装的 Tauri WebView 版本可能没有完整暴露这些浏览器 API；
		// 背景特效不能因为能力缺失阻断整个 Design 入口渲染。
		const reducedMotion = typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-reduced-motion: reduce)').matches
			: false;
		const particleTheme = LANDING_PARTICLE_THEMES[theme];
		let width = 0;
		let height = 0;
		let particles: Particle[] = [];
		let animationFrame = 0;
		let disposed = false;
		let lastFrameTime = 0;
		let hasPointer = false;
		let lastRippleAt = 0;
		let lastPointerX = 0;
		let lastPointerY = 0;
		let ripples: PointerRipple[] = [];
		context.imageSmoothingEnabled = false;

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
			const nextWidth = Math.max(1, rect.width);
			const nextHeight = Math.max(1, rect.height);
			if (nextWidth === width && nextHeight === height && canvas.width > 0 && canvas.height > 0) return;
			width = nextWidth;
			height = nextHeight;
			canvas.width = Math.round(width * pixelRatio);
			canvas.height = Math.round(height * pixelRatio);
			context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
			particles = Array.from({ length: getParticleCount(width, height, particleTheme) }, () => createParticle(width, height, particleTheme));
		};

		const onPointerMove = (event: Event) => {
			const pointerEvent = event as PointerEvent;
			const rect = canvas.getBoundingClientRect();
			const x = pointerEvent.clientX - rect.left;
			const y = pointerEvent.clientY - rect.top;
			const now = performance.now();
			const movedDistance = Math.hypot(x - lastPointerX, y - lastPointerY);
			if (!hasPointer || movedDistance >= 14 || now - lastRippleAt >= 150) {
				ripples = [...ripples, { x, y, startedAt: now }].slice(-MAX_RIPPLES);
				lastRippleAt = now;
			}
			lastPointerX = x;
			lastPointerY = y;
			hasPointer = true;
			if (reducedMotion) animationFrame = window.requestAnimationFrame(draw);
		};

		const draw = (time: number) => {
			if (disposed) return;
			const deltaMilliseconds = lastFrameTime > 0 ? Math.min(32, time - lastFrameTime) : 16;
			const delta = deltaMilliseconds / 16;
			const deltaSeconds = deltaMilliseconds / 1000;
			lastFrameTime = time;
			context.clearRect(0, 0, width, height);
			context.fillStyle = `rgb(${particleTheme.particle})`;
			ripples = ripples.filter((ripple) => time - ripple.startedAt < RIPPLE_LIFETIME);
			for (const particle of particles) {
				if (!reducedMotion) {
					if (time >= particle.nextTurnAt) {
						particle.targetVx = (Math.random() - 0.5) * PARTICLE_MAX_VX;
						particle.targetVy = (Math.random() - 0.5) * PARTICLE_MAX_VY;
						particle.nextTurnAt = time + 1500 + Math.random() * 2800;
					}
					// 速度向随机目标缓慢靠拢，避免粒子突然变向造成视觉抖动。
					const steering = Math.min(1, deltaSeconds * 1.8);
					particle.vx += (particle.targetVx - particle.vx) * steering;
					particle.vy += (particle.targetVy - particle.vy) * steering;
					particle.x += particle.vx * deltaSeconds;
					particle.y += particle.vy * deltaSeconds;
					particle.phase += particle.phaseSpeed * delta;
					if (particle.x < -24) particle.x = width + 24;
					if (particle.x > width + 24) particle.x = -24;
					if (particle.y < -24) particle.y = height + 24;
					if (particle.y > height + 24) particle.y = -24;
				}
				const pulse = 0.72 + Math.sin(particle.phase + time * 0.00015) * 0.28;
				let drawX = particle.x;
				let drawY = particle.y;
				let alpha = particle.alpha * pulse;
				for (const ripple of ripples) {
					const progress = (time - ripple.startedAt) / RIPPLE_LIFETIME;
					const radius = 10 + progress * RIPPLE_RADIUS;
					const dx = particle.x - ripple.x;
					const dy = particle.y - ripple.y;
					const distance = Math.hypot(dx, dy);
					const edgeDistance = Math.abs(distance - radius);
					if (edgeDistance < RIPPLE_EDGE_WIDTH) {
						const influence = (1 - edgeDistance / RIPPLE_EDGE_WIDTH) ** 2 * (1 - progress);
						const direction = distance > 0 ? 1 / distance : 0;
						drawX += dx * direction * influence * 5;
						drawY += dy * direction * influence * 5;
						alpha *= 1 + influence * 0.9;
					}
				}
				context.globalAlpha = Math.min(1, alpha);
				context.fillRect(drawX, drawY, particle.size, particle.size);
			}
			if (hasPointer) drawPointerRipples(context, ripples, time, particleTheme, width, height);
			context.globalAlpha = 1;
			if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw);
		};

		resize();
		const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
		if (observer) observer.observe(canvas);
		else window.addEventListener('resize', resize);
		const pointerHost = canvas.parentElement ?? window;
		pointerHost.addEventListener('pointermove', onPointerMove, { passive: true });
		animationFrame = window.requestAnimationFrame(draw);
		return () => {
			disposed = true;
			if (observer) observer.disconnect();
			else window.removeEventListener('resize', resize);
			pointerHost.removeEventListener('pointermove', onPointerMove);
			window.cancelAnimationFrame(animationFrame);
		};
	}, [theme]);

	return <canvas ref={canvasRef} className={styles.landingParticles} aria-hidden="true" />;
}
