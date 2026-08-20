import { useEffect, useRef } from 'react';
import type { ThemeMode } from '@/src/store/theme';
import styles from './DesignShell.module.css';

interface AccentMark {
	x: number;
	y: number;
	size: number;
	alpha: number;
	phase: number;
	depth: number;
}

interface PointerField {
	x: number;
	y: number;
	active: boolean;
}

/** 空项目入口的氛围场景；用户生成的 Design 预览不复用这些动效。 */
export type LandingScene = 'signal' | 'stars' | 'daylight' | 'sunset' | 'ink' | 'glacier' | 'frost' | 'nocturne' | 'press';

interface LandingMotionTheme {
	scene: LandingScene;
	particle: string;
	particleAlpha: number;
	pointerAlpha: number;
	baseCount: number;
	countScale: number;
	speed: number;
}

const FRAME_INTERVAL_MS = 1000 / 60;
const TAU = Math.PI * 2;
const POINTER_FIELD_RADIUS = 190;
const POINTER_GRID_SPACING = 14;

/**
 * 场景主体由路径、地平线、纸张线稿或冰层切面构成。
 * particle 字段仅保留少量装饰标记，不能单独承担主题识别。
 */
export const LANDING_PARTICLE_THEMES: Record<ThemeMode, LandingMotionTheme> = {
	current: { scene: 'signal', particle: '141, 224, 204', particleAlpha: 0.46, pointerAlpha: 0.95, baseCount: 22, countScale: 0.55, speed: 1 },
	'mono-dark': { scene: 'stars', particle: '235, 235, 235', particleAlpha: 0.74, pointerAlpha: 1.05, baseCount: 76, countScale: 0.8, speed: 0.3 },
	light: { scene: 'daylight', particle: '15, 118, 110', particleAlpha: 0.28, pointerAlpha: 1.25, baseCount: 16, countScale: 0.4, speed: 0.22 },
	ember: { scene: 'sunset', particle: '240, 164, 91', particleAlpha: 0.42, pointerAlpha: 1, baseCount: 24, countScale: 0.5, speed: 0.48 },
	paper: { scene: 'ink', particle: '176, 82, 58', particleAlpha: 0.2, pointerAlpha: 1.55, baseCount: 18, countScale: 0.35, speed: 0.16 },
	glacier: { scene: 'glacier', particle: '45, 120, 159', particleAlpha: 0.28, pointerAlpha: 1.35, baseCount: 20, countScale: 0.4, speed: 0.2 },
	glass: { scene: 'frost', particle: '104, 110, 118', particleAlpha: 0.3, pointerAlpha: 1.2, baseCount: 20, countScale: 0.42, speed: 0.22 },
	'glass-dark': { scene: 'nocturne', particle: '222, 226, 232', particleAlpha: 0.34, pointerAlpha: 1.1, baseCount: 22, countScale: 0.45, speed: 0.2 },
	'black-white': { scene: 'press', particle: '17, 18, 20', particleAlpha: 0.26, pointerAlpha: 1.3, baseCount: 20, countScale: 0.4, speed: 0.18 },
};

export const LANDING_MOTION_THEMES = LANDING_PARTICLE_THEMES;

const SIGNAL_ROUTES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
	[[-0.08, 0.18], [0.16, 0.18], [0.3, 0.34], [0.55, 0.34], [0.72, 0.16], [1.08, 0.16]],
	[[-0.08, 0.67], [0.18, 0.67], [0.36, 0.52], [0.62, 0.52], [0.78, 0.74], [1.08, 0.74]],
	[[0.06, 1.08], [0.22, 0.78], [0.45, 0.78], [0.59, 0.64], [0.9, 0.64], [1.08, 0.46]],
];

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function sceneSeed(theme: ThemeMode, width: number, height: number): number {
	let hash = 2166136261;
	for (const char of `${theme}:${Math.round(width)}:${Math.round(height)}`) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function createAccentMark(width: number, height: number, theme: LandingMotionTheme, random: () => number): AccentMark {
	const isSunset = theme.scene === 'sunset';
	const isGlacier = theme.scene === 'glacier';
	const x = isGlacier && random() < 0.68 ? width * (0.62 + random() * 0.42) : random() * width;
	const y = isSunset ? height * (0.61 + random() * 0.39) : random() * height;
	return {
		x,
		y,
		size: theme.scene === 'stars' ? 0.65 + random() * 1.45 : 0.7 + random() * 1.5,
		alpha: (0.32 + random() * 0.68) * theme.particleAlpha,
		phase: random() * TAU,
		depth: 0.35 + random() * 0.65,
	};
}

function getAccentCount(width: number, height: number, theme: LandingMotionTheme): number {
	const areaBoost = Math.round((width * height / 850_000) * theme.countScale);
	return Math.min(96, Math.max(theme.baseCount, theme.baseCount + areaBoost));
}

function pointOnRoute(route: ReadonlyArray<readonly [number, number]>, progress: number, width: number, height: number): { x: number; y: number } {
	const scaled = Math.max(0, Math.min(route.length - 1.001, progress * (route.length - 1)));
	const index = Math.floor(scaled);
	const next = route[index + 1] ?? route[index];
	const local = scaled - index;
	const from = route[index];
	return {
		x: (from[0] + (next[0] - from[0]) * local) * width,
		y: (from[1] + (next[1] - from[1]) * local) * height,
	};
}

function drawSignalScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.85;
	for (const [routeIndex, route] of SIGNAL_ROUTES.entries()) {
		context.globalAlpha = 0.11;
		context.beginPath();
		route.forEach(([x, y], index) => {
			if (index === 0) context.moveTo(x * width, y * height);
			else context.lineTo(x * width, y * height);
		});
		context.stroke();
		for (let pulseIndex = 0; pulseIndex < 2; pulseIndex += 1) {
			const progress = (time * 0.000035 * theme.speed + routeIndex * 0.31 + pulseIndex * 0.49) % 1;
			const pulse = pointOnRoute(route, progress, width, height);
			context.globalAlpha = 0.62;
			context.fillStyle = `rgb(${theme.particle})`;
			context.fillRect(pulse.x - 1.5, pulse.y - 1.5, 3, 3);
		}
	}
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		context.globalAlpha = mark.alpha * (0.52 + Math.sin(time * 0.00035 + mark.phase) * 0.2);
		context.fillRect(mark.x, mark.y, mark.size, mark.size);
	}
}

function drawStarsScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.65;
	for (const radius of [width * 0.28, width * 0.43]) {
		context.globalAlpha = 0.07;
		context.beginPath();
		context.arc(width * 0.84, -height * 0.08, radius, Math.PI * 0.58, Math.PI * 1.48);
		context.stroke();
	}
	context.globalAlpha = 0.08;
	context.beginPath();
	for (let index = 0; index < 8; index += 1) {
		const mark = marks[index];
		if (!mark) continue;
		if (index === 0) context.moveTo(mark.x, mark.y);
		else context.lineTo(mark.x, mark.y);
	}
	context.stroke();
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		const twinkle = 0.48 + (Math.sin(time * 0.00105 + mark.phase * 2.2) + 1) * 0.26;
		context.globalAlpha = mark.alpha * twinkle;
		context.beginPath();
		context.arc(mark.x, mark.y, mark.size * (0.74 + twinkle * 0.32), 0, TAU);
		context.fill();
	}
	const meteorProgress = (time % 14_000) / 14_000;
	if (meteorProgress < 0.12) {
		const startX = width * (0.16 + meteorProgress * 4.4);
		const startY = height * (0.16 + meteorProgress * 1.8);
		context.globalAlpha = (1 - meteorProgress / 0.12) * 0.32;
		context.beginPath();
		context.moveTo(startX, startY);
		context.lineTo(startX - 34, startY - 16);
		context.stroke();
	}
}

function drawDaylightScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	context.fillStyle = `rgb(${theme.particle})`;
	for (let band = 0; band < 4; band += 1) {
		const drift = Math.sin(time * 0.00009 + band) * 18;
		const x = width * (-0.18 + band * 0.29) + drift;
		context.globalAlpha = 0.025 + band * 0.007;
		context.beginPath();
		context.moveTo(x, 0);
		context.lineTo(x + width * 0.18, 0);
		context.lineTo(x + width * 0.58, height);
		context.lineTo(x + width * 0.4, height);
		context.closePath();
		context.fill();
	}
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.7;
	for (let line = 0; line < 5; line += 1) {
		context.globalAlpha = 0.055;
		context.beginPath();
		for (let step = 0; step <= 16; step += 1) {
			const x = (step / 16) * width;
			const y = height * (0.16 + line * 0.16) + Math.sin(step * 0.82 + line + time * 0.00014) * (5 + line * 1.6);
			if (step === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.stroke();
	}
	for (const mark of marks) {
		context.globalAlpha = mark.alpha * 0.7;
		context.fillRect(mark.x, mark.y, mark.size, mark.size);
	}
}

function drawHorizonLayer(context: CanvasRenderingContext2D, width: number, height: number, horizon: number, amplitude: number, phase: number, color: string, alpha: number): void {
	context.globalAlpha = alpha;
	context.fillStyle = `rgb(${color})`;
	context.beginPath();
	context.moveTo(-20, horizon);
	for (let step = 0; step <= 20; step += 1) {
		const x = (step / 20) * (width + 40) - 20;
		const y = horizon + Math.sin(step * 0.68 + phase) * amplitude + Math.sin(step * 1.77 + phase * 1.6) * amplitude * 0.32;
		context.lineTo(x, y);
	}
	context.lineTo(width + 20, height + 20);
	context.lineTo(-20, height + 20);
	context.closePath();
	context.fill();
}

function drawSunsetScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	const horizon = height * 0.58;
	const bands = [
		{ y: horizon - 42, height: 28, color: '240, 164, 91', alpha: 0.075 },
		{ y: horizon - 14, height: 30, color: '211, 106, 70', alpha: 0.065 },
		{ y: horizon + 16, height: 38, color: '146, 63, 47', alpha: 0.07 },
	];
	for (const band of bands) {
		context.globalAlpha = band.alpha;
		context.fillStyle = `rgb(${band.color})`;
		context.fillRect(0, band.y, width, band.height);
	}
	drawHorizonLayer(context, width, height, horizon + 18, 10, time * 0.00012, '86, 37, 29', 0.23);
	drawHorizonLayer(context, width, height, horizon + 52, 16, time * 0.0001 + 1.8, '46, 24, 20', 0.32);
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.7;
	context.setLineDash([18, 76]);
	context.lineDashOffset = -time * 0.012;
	for (let row = 0; row < 3; row += 1) {
		context.globalAlpha = 0.12 - row * 0.02;
		context.beginPath();
		context.moveTo(0, horizon + 7 + row * 12);
		context.lineTo(width, horizon + 7 + row * 12);
		context.stroke();
	}
	context.setLineDash([]);
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		context.globalAlpha = mark.alpha * (0.5 + mark.depth * 0.4);
		context.fillRect(mark.x, mark.y, mark.size * 0.75, mark.size * 2.2);
	}
}

function drawInkStroke(context: CanvasRenderingContext2D, width: number, height: number, ratio: number, time: number, phase: number, alpha: number, color: string): void {
	context.globalAlpha = alpha;
	context.strokeStyle = `rgb(${color})`;
	context.lineWidth = 0.8;
	context.beginPath();
	for (let step = 0; step <= 24; step += 1) {
		const x = (step / 24) * width;
		const y = height * ratio + Math.sin(step * 0.56 + phase) * 9 + Math.sin(step * 1.42 + phase * 1.7) * 2.8 + Math.sin(time * 0.0001 + phase) * 2;
		if (step === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.stroke();
}

function drawInkScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	for (let line = 0; line < 7; line += 1) {
		context.globalAlpha = 0.022;
		context.strokeStyle = `rgb(${theme.particle})`;
		context.lineWidth = 0.55;
		context.beginPath();
		context.moveTo(0, height * (0.1 + line * 0.13));
		context.lineTo(width, height * (0.1 + line * 0.13));
		context.stroke();
	}
	drawInkStroke(context, width, height, 0.27, time, 0.8, 0.13, theme.particle);
	drawInkStroke(context, width, height, 0.64, time, 2.4, 0.09, theme.particle);
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		context.save();
		context.translate(mark.x, mark.y);
		context.rotate(Math.sin(mark.phase) * 0.18);
		context.globalAlpha = mark.alpha;
		context.fillRect(-mark.size * 1.7, -0.4, mark.size * 3.4, 0.8);
		context.restore();
	}
}

function drawIcePlate(context: CanvasRenderingContext2D, points: ReadonlyArray<readonly [number, number]>, fill: string, stroke: string, alpha: number): void {
	context.globalAlpha = alpha;
	context.fillStyle = fill;
	context.strokeStyle = stroke;
	context.lineWidth = 0.9;
	context.beginPath();
	points.forEach(([x, y], index) => {
		if (index === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	});
	context.closePath();
	context.fill();
	context.stroke();
}

function drawGlacierScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	const drift = Math.sin(time * 0.00012) * 10;
	drawIcePlate(context, [[-30, height * 0.03], [width * 0.26, -20], [width * 0.46, height * 0.18 + drift], [width * 0.1, height * 0.28]], 'rgba(45, 120, 159, 0.045)', 'rgba(45, 120, 159, 0.2)', 1);
	drawIcePlate(context, [[width * 0.66, -20], [width + 30, height * 0.04], [width + 20, height * 0.38], [width * 0.77, height * 0.25 - drift]], 'rgba(45, 120, 159, 0.06)', 'rgba(45, 120, 159, 0.22)', 1);
	drawIcePlate(context, [[-20, height * 0.76], [width * 0.24, height * 0.64 + drift], [width * 0.48, height + 20], [-20, height + 20]], 'rgba(45, 120, 159, 0.045)', 'rgba(45, 120, 159, 0.18)', 1);
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.75;
	for (let line = 0; line < 4; line += 1) {
		const y = height * (0.18 + line * 0.18);
		context.globalAlpha = 0.07;
		context.beginPath();
		context.moveTo(-20, y + drift * (line % 2 ? -1 : 1));
		context.lineTo(width * 0.34, y - 18);
		context.lineTo(width * 0.68, y + 16);
		context.lineTo(width + 20, y - 8);
		context.stroke();
	}
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		const size = mark.size * (0.75 + mark.depth * 0.45);
		context.globalAlpha = mark.alpha;
		context.beginPath();
		context.moveTo(mark.x, mark.y - size);
		context.lineTo(mark.x + size, mark.y);
		context.lineTo(mark.x, mark.y + size);
		context.lineTo(mark.x - size, mark.y);
		context.closePath();
		context.fill();
	}
}

/** 毛玻璃场景：大面积柔光光斑模拟磨砂景深，斜向高光条呼应玻璃反光。 */
function drawFrostScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	const orbs = [
		{ x: 0.16, y: 0.22, r: 0.2, phase: 0 },
		{ x: 0.82, y: 0.14, r: 0.14, phase: 1.9 },
		{ x: 0.58, y: 0.82, r: 0.24, phase: 3.4 },
		{ x: 0.3, y: 0.6, r: 0.12, phase: 5.1 },
	];
	for (const [index, orb] of orbs.entries()) {
		const wobbleX = Math.sin(time * 0.00007 + orb.phase) * 26;
		const wobbleY = Math.cos(time * 0.00005 + orb.phase * 1.4) * 16;
		const radius = width * orb.r;
		const gradient = context.createRadialGradient(width * orb.x + wobbleX, height * orb.y + wobbleY, 0, width * orb.x + wobbleX, height * orb.y + wobbleY, radius);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		context.globalAlpha = 0.55 - index * 0.07;
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(width * orb.x + wobbleX, height * orb.y + wobbleY, radius, 0, TAU);
		context.fill();
	}
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.7;
	for (let line = 0; line < 3; line += 1) {
		const drift = Math.sin(time * 0.00006 + line * 2.1) * 20;
		context.globalAlpha = 0.09 - line * 0.02;
		context.beginPath();
		context.moveTo(-30 + line * 46, height * 1.08 + drift);
		context.lineTo(width * 0.52 + line * 46 + drift * 0.4, -30);
		context.stroke();
	}
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		context.globalAlpha = mark.alpha * (0.55 + Math.sin(time * 0.0004 + mark.phase) * 0.2);
		context.beginPath();
		context.arc(mark.x, mark.y, mark.size * 0.9, 0, TAU);
		context.fill();
	}
}

/** 毛玻璃黑场景：冷白月光光斑在深黑玻璃上晕开，银灰高光条呼应玻璃反光，与浅色毛玻璃互为镜像。 */
function drawNocturneScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	const orbs = [
		{ x: 0.16, y: 0.22, r: 0.2, phase: 0 },
		{ x: 0.82, y: 0.14, r: 0.14, phase: 1.9 },
		{ x: 0.58, y: 0.82, r: 0.24, phase: 3.4 },
		{ x: 0.3, y: 0.6, r: 0.12, phase: 5.1 },
	];
	for (const [index, orb] of orbs.entries()) {
		const wobbleX = Math.sin(time * 0.00007 + orb.phase) * 26;
		const wobbleY = Math.cos(time * 0.00005 + orb.phase * 1.4) * 16;
		const radius = width * orb.r;
		const gradient = context.createRadialGradient(width * orb.x + wobbleX, height * orb.y + wobbleY, 0, width * orb.x + wobbleX, height * orb.y + wobbleY, radius);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		context.globalAlpha = 0.4 - index * 0.05;
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(width * orb.x + wobbleX, height * orb.y + wobbleY, radius, 0, TAU);
		context.fill();
	}
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.7;
	for (let line = 0; line < 3; line += 1) {
		const drift = Math.sin(time * 0.00006 + line * 2.1) * 20;
		context.globalAlpha = 0.07 - line * 0.016;
		context.beginPath();
		context.moveTo(-30 + line * 46, height * 1.08 + drift);
		context.lineTo(width * 0.52 + line * 46 + drift * 0.4, -30);
		context.stroke();
	}
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		context.globalAlpha = mark.alpha * (0.55 + Math.sin(time * 0.0004 + mark.phase) * 0.2);
		context.beginPath();
		context.arc(mark.x, mark.y, mark.size * 0.9, 0, TAU);
		context.fill();
	}
}

/** 经典黑白场景：报纸式排版——黑色细线模拟文本行、描边矩形模拟图框，装饰方块缓慢漂移。 */
function drawPressScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	context.strokeStyle = `rgb(${theme.particle})`;
	context.lineWidth = 0.7;
	// 文本行：分组排布的黑色细线，宽度错落模拟段落排版。
	const lineGroups = [
		{ y: 0.16, lines: 4, x0: 0.08, x1: 0.44 },
		{ y: 0.16, lines: 4, x0: 0.52, x1: 0.92 },
		{ y: 0.52, lines: 3, x0: 0.08, x1: 0.92 },
	];
	for (const group of lineGroups) {
		for (let line = 0; line < group.lines; line += 1) {
			const y = height * (group.y + line * 0.035);
			const shorten = line === group.lines - 1 ? 0.72 : 1;
			context.globalAlpha = 0.08;
			context.beginPath();
			context.moveTo(width * group.x0, y);
			context.lineTo(width * (group.x0 + (group.x1 - group.x0) * shorten), y);
			context.stroke();
		}
	}
	// 图框：白色描边矩形，随时间轻微呼吸透明度，像版面中的图片占位。
	const frames = [
		{ x: 0.08, y: 0.36, w: 0.34, h: 0.11 },
		{ x: 0.52, y: 0.36, w: 0.4, h: 0.11 },
	];
	for (const [index, frame] of frames.entries()) {
		context.globalAlpha = 0.1 + Math.sin(time * 0.0004 + index * 2.4) * 0.025;
		context.strokeRect(width * frame.x, height * frame.y, width * frame.w, height * frame.h);
	}
	context.fillStyle = `rgb(${theme.particle})`;
	for (const mark of marks) {
		context.globalAlpha = mark.alpha * (0.6 + Math.sin(time * 0.00035 + mark.phase) * 0.18);
		context.fillRect(mark.x, mark.y, mark.size, mark.size);
	}
}

/** 鼠标点阵只承担交互反馈：规则网格随指针产生局部位移，不替代主题主画面。 */
function drawPointerField(context: CanvasRenderingContext2D, pointer: PointerField, time: number, theme: LandingMotionTheme, width: number, height: number): void {
	if (!pointer.active) return;
	const radius = POINTER_FIELD_RADIUS;
	const startX = Math.floor((pointer.x - radius) / POINTER_GRID_SPACING) * POINTER_GRID_SPACING;
	const startY = Math.floor((pointer.y - radius) / POINTER_GRID_SPACING) * POINTER_GRID_SPACING;
	context.fillStyle = `rgb(${theme.particle})`;
	for (let x = startX; x <= pointer.x + radius; x += POINTER_GRID_SPACING) {
		for (let y = startY; y <= pointer.y + radius; y += POINTER_GRID_SPACING) {
			const dx = x - pointer.x;
			const dy = y - pointer.y;
			const distance = Math.hypot(dx, dy);
			if (distance > radius) continue;
			const falloff = 1 - distance / radius;
			const wave = Math.sin(time * 0.004 - distance * 0.055) * 0.5 + 0.5;
			const displacement = falloff * (3 + wave * 5);
			const direction = distance > 0 ? 1 / distance : 0;
			const drawX = x + dx * direction * displacement;
			const drawY = y + dy * direction * displacement;
			const size = 0.9 + falloff * 1.9 + wave * falloff * 0.9;
			context.globalAlpha = Math.min(0.84, (0.06 + falloff * 0.34 + wave * falloff * 0.08) * theme.pointerAlpha);
			if (drawX < 0 || drawX > width || drawY < 0 || drawY > height) continue;
			context.fillRect(drawX - size / 2, drawY - size / 2, size, size);
		}
	}
	context.globalAlpha = 1;
}

/** 场景主体优先，装饰标记只在各自场景的最后一步绘制。 */
function drawScene(context: CanvasRenderingContext2D, marks: AccentMark[], time: number, theme: LandingMotionTheme, width: number, height: number): void {
	context.globalAlpha = 1;
	switch (theme.scene) {
		case 'signal': drawSignalScene(context, marks, time, theme, width, height); break;
		case 'stars': drawStarsScene(context, marks, time, theme, width, height); break;
		case 'daylight': drawDaylightScene(context, marks, time, theme, width, height); break;
		case 'sunset': drawSunsetScene(context, marks, time, theme, width, height); break;
		case 'ink': drawInkScene(context, marks, time, theme, width, height); break;
		case 'glacier': drawGlacierScene(context, marks, time, theme, width, height); break;
		case 'frost': drawFrostScene(context, marks, time, theme, width, height); break;
		case 'nocturne': drawNocturneScene(context, marks, time, theme, width, height); break;
		case 'press': drawPressScene(context, marks, time, theme, width, height); break;
	}
	context.globalAlpha = 1;
}

/** 统一时钟最多 60fps，减少动态效果时不更新任何状态，只渲染静态首帧。 */
function updateAccentMarks(marks: AccentMark[], theme: LandingMotionTheme, deltaSeconds: number, width: number, height: number): void {
	for (const mark of marks) {
		mark.phase += deltaSeconds * theme.speed;
		if (theme.scene === 'stars') continue;
		if (theme.scene === 'sunset') {
			mark.y -= (8 + mark.depth * 12) * deltaSeconds * theme.speed;
			mark.x += Math.sin(mark.phase * 1.6) * deltaSeconds * 5;
			if (mark.y < height * 0.4) {
				mark.y = height * (0.72 + (mark.phase % 0.28));
				mark.x = (mark.x + width * 0.31) % width;
			}
			continue;
		}
		if (theme.scene === 'glacier') {
			mark.x -= deltaSeconds * (2 + mark.depth * 3) * theme.speed;
			mark.y += Math.sin(mark.phase) * deltaSeconds * 2;
		} else {
			mark.x += Math.cos(mark.phase * 1.4) * deltaSeconds * 4 * theme.speed;
			mark.y += Math.sin(mark.phase * 1.1) * deltaSeconds * 2 * theme.speed;
		}
		if (mark.x < -12) mark.x = width + 12;
		if (mark.x > width + 12) mark.x = -12;
		if (mark.y < -12) mark.y = height + 12;
		if (mark.y > height + 12) mark.y = -12;
	}
}

export function DesignLandingBackground({ theme }: { theme: ThemeMode }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;

		const reducedMotion = typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-reduced-motion: reduce)').matches
			: false;
		const motionTheme = LANDING_MOTION_THEMES[theme];
		let width = 0;
		let height = 0;
		let marks: AccentMark[] = [];
		const pointer: PointerField = { x: 0, y: 0, active: false };
		let animationFrame = 0;
		let lastFrameTime = 0;
		let accumulatedMilliseconds = 0;
		let disposed = false;

		const draw = (time: number, force = false) => {
			if (disposed) return;
			animationFrame = 0;
			const deltaMilliseconds = lastFrameTime > 0 ? Math.min(80, time - lastFrameTime) : FRAME_INTERVAL_MS;
			lastFrameTime = time;
			accumulatedMilliseconds += deltaMilliseconds;
			if (!force && !reducedMotion && accumulatedMilliseconds < FRAME_INTERVAL_MS) {
				animationFrame = window.requestAnimationFrame(draw);
				return;
			}
			const sceneDelta = Math.min(80, accumulatedMilliseconds);
			accumulatedMilliseconds = 0;
			if (!reducedMotion) updateAccentMarks(marks, motionTheme, sceneDelta / 1000, width, height);
			context.clearRect(0, 0, width, height);
			drawScene(context, marks, time, motionTheme, width, height);
			drawPointerField(context, pointer, time, motionTheme, width, height);
			if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw);
		};

		const queueDraw = () => {
			if (!animationFrame) animationFrame = window.requestAnimationFrame(draw);
		};

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
			const nextWidth = Math.max(1, rect.width);
			const nextHeight = Math.max(1, rect.height);
			if (nextWidth === width && nextHeight === height && canvas.width > 0 && canvas.height > 0) return;
			// 设置 canvas 尺寸会立即清空绘图缓冲区；先取消旧帧，再强制同步绘制，避免窗口调整时出现透明闪帧。
			if (animationFrame) {
				window.cancelAnimationFrame(animationFrame);
				animationFrame = 0;
			}
			width = nextWidth;
			height = nextHeight;
			canvas.width = Math.round(width * pixelRatio);
			canvas.height = Math.round(height * pixelRatio);
			context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
			const random = seededRandom(sceneSeed(theme, width, height));
			marks = Array.from({ length: getAccentCount(width, height, motionTheme) }, () => createAccentMark(width, height, motionTheme, random));
			draw(performance.now(), true);
		};

		const onPointerMove = (event: Event) => {
			const pointerEvent = event as PointerEvent;
			const rect = canvas.parentElement?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
			pointer.x = pointerEvent.clientX - rect.left;
			pointer.y = pointerEvent.clientY - rect.top;
			pointer.active = true;
			queueDraw();
		};

		const onPointerLeave = () => {
			pointer.active = false;
			queueDraw();
		};

		resize();
		const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
		if (observer) observer.observe(canvas);
		else window.addEventListener('resize', resize);
		const pointerHost = canvas.parentElement ?? window;
		pointerHost.addEventListener('pointermove', onPointerMove, { passive: true });
		pointerHost.addEventListener('pointerleave', onPointerLeave, { passive: true });
		return () => {
			disposed = true;
			if (observer) observer.disconnect();
			else window.removeEventListener('resize', resize);
			pointerHost.removeEventListener('pointermove', onPointerMove);
			pointerHost.removeEventListener('pointerleave', onPointerLeave);
			window.cancelAnimationFrame(animationFrame);
		};
	}, [theme]);

	return <canvas ref={canvasRef} className={styles.landingParticles} data-motion-scene={LANDING_MOTION_THEMES[theme].scene} aria-hidden="true" />;
}
