import { useEffect, useRef } from 'react';
import styles from './DesignShell.module.css';

const LOGO_TEXT = 'GitPilot Design';
const ENTRANCE_DURATION_MS = 2600;
const HOVER_EASE = 0.22;
const POINTER_EASE = 0.35;
const TRAIL_LIMIT = 24;
const TRAIL_LIFE_MS = 1100;
const TRAIL_STEP = 3;
const PARTICLE_GAP = 2.2;
// 业务意图：粒子是标题上的局部点亮，不应盖过文字本身；限制透明度让主题色保持通透而不发白。
const PARTICLE_MAX_ALPHA = 0.56;
const PARTICLE_GLOW_ALPHA = 0.16;

type Rgb = readonly [number, number, number];

interface Particle {
	x: number;
	y: number;
	size: number;
	seed: number;
}

interface TrailPoint {
	x: number;
	y: number;
	bornAt: number;
}

const FALLBACK_COLORS: Record<'primary' | 'secondary' | 'highlight', Rgb> = {
	primary: [110, 231, 208],
	secondary: [122, 167, 255],
	highlight: [247, 197, 106],
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}

function randomFromPosition(x: number, y: number): number {
	const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
	return value - Math.floor(value);
}

function parseColor(value: string, fallback: Rgb): Rgb {
	const normalized = value.trim();
	const hex = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
	if (hex) {
		if (hex.length === 3) {
			return [
				parseInt(`${hex[0]}${hex[0]}`, 16),
				parseInt(`${hex[1]}${hex[1]}`, 16),
				parseInt(`${hex[2]}${hex[2]}`, 16),
			];
		}
		return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
	}
	const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
	if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
	return fallback;
}

function mixColor(first: Rgb, second: Rgb, amount: number): Rgb {
	const t = clamp(amount, 0, 1);
	return [
		first[0] + (second[0] - first[0]) * t,
		first[1] + (second[1] - first[1]) * t,
		first[2] + (second[2] - first[2]) * t,
	];
}

function rgba(color: Rgb, alpha: number): string {
	return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${clamp(alpha, 0, 1)})`;
}

function drawMaskText(context: CanvasRenderingContext2D, width: number, height: number, font: string, letterSpacing: number): void {
	context.clearRect(0, 0, width, height);
	context.font = font;
	context.fillStyle = '#fff';
	context.textAlign = 'left';
	context.textBaseline = 'alphabetic';
	const metrics = context.measureText(LOGO_TEXT);
	const ascent = metrics.actualBoundingBoxAscent || height * 0.78;
	const descent = metrics.actualBoundingBoxDescent || height * 0.18;
	const baseline = (height - ascent - descent) / 2 + ascent;
	let x = 0;
	for (const character of LOGO_TEXT) {
		context.fillText(character, x, baseline);
		x += context.measureText(character).width + letterSpacing;
	}
}

function sampleParticles(mask: HTMLCanvasElement, dpr: number): Particle[] {
	const context = mask.getContext('2d', { willReadFrequently: true });
	if (!context) return [];
	const pixels = context.getImageData(0, 0, mask.width, mask.height).data;
	const gap = Math.max(2, Math.round(PARTICLE_GAP * dpr));
	const particles: Particle[] = [];
	for (let py = 0; py < mask.height; py += gap) {
		for (let px = 0; px < mask.width; px += gap) {
			const alpha = pixels[(py * mask.width + px) * 4 + 3] ?? 0;
			if (alpha < 36) continue;
			const x = px / dpr;
			const y = py / dpr;
			const seed = randomFromPosition(x, y);
			particles.push({ x, y, seed, size: 0.65 + seed * 1.25 });
		}
	}
	return particles;
}

/**
 * 业务意图：Design 标题沿用 OpenDesign 的局部粒子高光，但使用原生 Canvas
 * 读取当前主题 token，避免 CSS 渐变在桌面 WebView 中泄漏成矩形背景。
 */
export function DesignLandingLogo({ theme }: { theme: string }) {
	const hostRef = useRef<HTMLSpanElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!host || !canvas || !context) return undefined;

		let disposed = false;
		let animationFrame = 0;
		let width = 0;
		let height = 0;
		let dpr = 1;
		let entranceStartedAt = performance.now();
		let particles: Particle[] = [];
		let trail: TrailPoint[] = [];
		let hoverTarget = 0;
		let hoverValue = 0;
		let pointerActive = false;
		let targetX = -10_000;
		let targetY = -10_000;
		let liveX = targetX;
		let liveY = targetY;
		let lastTrailX = targetX;
		let lastTrailY = targetY;
		let colors: { primary: Rgb; secondary: Rgb; highlight: Rgb } = {
			primary: FALLBACK_COLORS.primary,
			secondary: FALLBACK_COLORS.secondary,
			highlight: FALLBACK_COLORS.highlight,
		};

		const readTheme = () => {
			const computed = window.getComputedStyle(host);
			colors = {
				primary: parseColor(computed.getPropertyValue('--landing-logo-a'), FALLBACK_COLORS.primary),
				secondary: parseColor(computed.getPropertyValue('--landing-logo-b'), FALLBACK_COLORS.secondary),
				highlight: parseColor(computed.getPropertyValue('--landing-logo-c'), FALLBACK_COLORS.highlight),
			};
		};

		const resize = () => {
			if (disposed) return;
			const rect = host.getBoundingClientRect();
			width = rect.width;
			height = rect.height;
			if (!width || !height) return;
			dpr = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.max(1, Math.round(width * dpr));
			canvas.height = Math.max(1, Math.round(height * dpr));
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			const computed = window.getComputedStyle(host);
			const font = computed.font || `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
			const letterSpacing = Number.parseFloat(computed.letterSpacing) || 0;
			const mask = document.createElement('canvas');
			mask.width = canvas.width;
			mask.height = canvas.height;
			const maskContext = mask.getContext('2d');
			if (!maskContext) return;
			maskContext.setTransform(dpr, 0, 0, dpr, 0, 0);
			drawMaskText(maskContext, width, height, font, letterSpacing);
			particles = sampleParticles(mask, dpr);
			readTheme();
			ensureAnimation();
		};

		const addTrailPoint = (now: number) => {
			if (!pointerActive) return;
			if (Math.hypot(liveX - lastTrailX, liveY - lastTrailY) < TRAIL_STEP) return;
			trail.unshift({ x: liveX, y: liveY, bornAt: now });
			trail = trail.slice(0, TRAIL_LIMIT);
			lastTrailX = liveX;
			lastTrailY = liveY;
		};

		const draw = (now: number) => {
			animationFrame = 0;
			if (disposed || !width || !height) return;
			const elapsed = now - entranceStartedAt;
			const entranceActive = elapsed < ENTRANCE_DURATION_MS;
			const reduceMotion = typeof window.matchMedia === 'function'
				&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;

			hoverValue += (hoverTarget - hoverValue) * HOVER_EASE;
			liveX += (targetX - liveX) * POINTER_EASE;
			liveY += (targetY - liveY) * POINTER_EASE;
			addTrailPoint(now);
			trail = trail.filter((point) => now - point.bornAt < TRAIL_LIFE_MS);

			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, width, height);
			if (!reduceMotion) {
				const progress = clamp(elapsed / ENTRANCE_DURATION_MS, 0, 1);
				const scanPosition = -0.14 + progress * 1.28;
				const spotRadius = Math.max(28, Math.min(54, height * 1.12));
				// 普通覆盖混合避免多个相邻粒子叠加后被抬成近白色。
				context.globalCompositeOperation = 'source-over';

				for (const particle of particles) {
					let intensity = 0;
					if (entranceActive) {
						const scanCoordinate = particle.x / width + (particle.y / height - 0.5) * 0.08 + particle.seed * 0.12;
						const scanDistance = Math.abs(scanCoordinate - scanPosition);
						intensity = smoothstep(0.18, 0, scanDistance) * (0.62 + 0.38 * Math.sin(now / 180 + particle.seed * 6.28));
					}

					let drawX = particle.x;
					let drawY = particle.y;
					for (const point of trail) {
						const dx = particle.x - point.x;
						const dy = particle.y - point.y;
						const distance = Math.hypot(dx, dy);
						const angle = Math.atan2(dy, dx);
						const wobble = 1 + 0.3 * Math.sin(3 * angle + now / 625) + 0.16 * Math.sin(5 * angle - now / 910 + 1.3);
						const reach = spotRadius * 0.8 * wobble;
						const age = clamp(1 - (now - point.bornAt) / TRAIL_LIFE_MS, 0, 1);
						intensity = Math.max(intensity, smoothstep(reach, reach * 0.4, distance) * age * hoverValue);
					}

					if (hoverValue > 0.01 && pointerActive) {
						const dx = liveX - particle.x;
						const dy = liveY - particle.y;
						const distance = Math.hypot(dx, dy);
						const pull = hoverValue * smoothstep(spotRadius * 1.4, 0, distance) * 4;
						if (distance > 0.001) {
							drawX += (dx / distance) * pull;
							drawY += (dy / distance) * pull;
						}
					}

					if (intensity < 0.035) continue;
					const tone = clamp(0.5 + 0.5 * Math.sin(now / 500 + particle.seed * 6.28) + 0.18 * Math.sin(now / 270 + particle.seed * 12.56), 0, 1);
					const color = mixColor(colors.primary, tone > 0.68 ? colors.highlight : colors.secondary, tone * 0.72);
					const size = particle.size * (0.72 + intensity * 1.1);
					context.globalAlpha = clamp(0.08 + intensity * PARTICLE_MAX_ALPHA, 0, PARTICLE_MAX_ALPHA);
					context.fillStyle = rgba(color, 1);
					context.fillRect(drawX - size / 2, drawY - size / 2, size, size);
					if (intensity > 0.72) {
						context.globalAlpha = intensity * PARTICLE_GLOW_ALPHA;
						context.fillRect(drawX - size * 1.35, drawY - size * 1.35, size * 2.7, size * 2.7);
					}
				}
			}
			context.globalAlpha = 1;
			context.globalCompositeOperation = 'source-over';

			const trailActive = trail.length > 0 || hoverValue > 0.01;
			if (!reduceMotion && (entranceActive || pointerActive || trailActive)) ensureAnimation();
		};

		const ensureAnimation = () => {
			if (!animationFrame && !disposed) animationFrame = window.requestAnimationFrame(draw);
		};

		const toLocal = (event: PointerEvent) => {
			const rect = host.getBoundingClientRect();
			return { x: event.clientX - rect.left, y: event.clientY - rect.top };
		};
		const onEnter = (event: PointerEvent) => {
			const point = toLocal(event);
			pointerActive = true;
			hoverTarget = 1;
			targetX = liveX = lastTrailX = point.x;
			targetY = liveY = lastTrailY = point.y;
			trail = [{ x: point.x, y: point.y, bornAt: performance.now() }];
			ensureAnimation();
		};
		const onMove = (event: PointerEvent) => {
			const point = toLocal(event);
			targetX = clamp(point.x, 0, width);
			targetY = clamp(point.y, 0, height);
			ensureAnimation();
		};
		const onLeave = () => {
			pointerActive = false;
			hoverTarget = 0;
			ensureAnimation();
		};

		const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
		resizeObserver?.observe(host);
		window.addEventListener('resize', resize, { passive: true });
		host.addEventListener('pointerenter', onEnter, { passive: true });
		host.addEventListener('pointermove', onMove, { passive: true });
		host.addEventListener('pointerleave', onLeave, { passive: true });
		resize();
		ensureAnimation();

		return () => {
			disposed = true;
			if (animationFrame) window.cancelAnimationFrame(animationFrame);
			resizeObserver?.disconnect();
			window.removeEventListener('resize', resize);
			host.removeEventListener('pointerenter', onEnter);
			host.removeEventListener('pointermove', onMove);
			host.removeEventListener('pointerleave', onLeave);
		};
	}, [theme]);

	return <span ref={hostRef} className={styles.landingLogoText} aria-label={LOGO_TEXT}>{LOGO_TEXT}<canvas ref={canvasRef} className={styles.landingLogoTextCanvas} aria-hidden="true" /></span>;
}
