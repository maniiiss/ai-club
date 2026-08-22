import type { CanvasIconSpec, CanvasPathCommand, CanvasPathSpec } from './canvas-types';

/**
 * CanvasKit 不认识 React 图标组件，因此 Design 协议把图标表达为可序列化的
 * 语义名称，并在渲染边界解析成 24×24 的路径。业务意图：Agent 不需要携带
 * 外部图片或本地文件，也能稳定生成导航、按钮和表单里的常用图标。
 */
const BUILTIN_ICON_PATHS: Record<string, string> = {
	'arrow-left': 'M19 12H5 M12 19l-7-7 7-7',
	'arrow-right': 'M5 12h14 M12 5l7 7-7 7',
	'arrow-up': 'M12 19V5 M5 12l7-7 7 7',
	'arrow-down': 'M12 5v14 M19 12l-7 7-7-7',
	'chevron-left': 'M15 18l-6-6 6-6',
	'chevron-right': 'M9 18l6-6-6-6',
	'chevron-up': 'M18 15l-6-6-6 6',
	'chevron-down': 'M6 9l6 6 6-6',
	'check': 'M5 12l4 4L19 6',
	'x': 'M5 5l14 14 M19 5L5 19',
	'plus': 'M12 5v14 M5 12h14',
	'minus': 'M5 12h14',
	'menu': 'M4 6h16 M4 12h16 M4 18h16',
	'search': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M20 20l-4-4',
	'home': 'M3 10.5L12 3l9 7.5V21H3z M9 21v-6h6v6',
	'user': 'M20 21a8 8 0 0 0-16 0 M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
	'heart': 'M20.8 8.7c0 5.5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.3z',
	'star': 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z',
	'bell': 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
	'calendar': 'M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16',
	'mail': 'M4 5h16v14H4z M4 7l8 6 8-6',
	'lock': 'M6 10h12v10H6z M8 10V7a4 4 0 0 1 8 0v3',
	'eye': 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
	'filter': 'M4 5h16l-6 7v5l-4 2v-7z',
	'calendar-plus': 'M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M12 13v5 M9.5 15.5h5',
	'settings': 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.4h.8a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h2.4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14h-.2a1.7 1.7 0 0 0-1.6 1z',
	'info': 'M12 11v6 M12 7.5v.1',
	'help': 'M9.5 9a2.7 2.7 0 1 1 4.5 2c-1.2.9-2 1.5-2 3 M12 18v.1',
	'plus-circle': 'M12 5v14 M5 12h14 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
	'x-circle': 'M9 9l6 6 M15 9l-6 6 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
	'check-circle': 'M8 12l3 3 5-6 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
	'upload': 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
	'download': 'M12 4v12 M7 11l5 5 5-5 M5 20h14',
	'play': 'M8 5l11 7-11 7z',
	'pause': 'M7 5h3v14H7z M14 5h3v14h-3z',
	'copy': 'M8 8h11v13H8z M5 3h11v5H8v8H5z',
	'edit': 'M4 17.5V21h3.5L19 9.5 15.5 6z M13.5 8l3.5 3.5',
	'logout': 'M10 5H5v14h5 M14 8l4 4-4 4 M18 12H9',
	'question': 'M9.5 9a2.7 2.7 0 1 1 4.5 2c-1.2.9-2 1.5-2 3 M12 18v.1',
};

const ICON_ALIASES: Record<string, string> = {
	'arrowleft': 'arrow-left', 'arrowright': 'arrow-right', 'arrowup': 'arrow-up', 'arrowdown': 'arrow-down',
	'chevronleft': 'chevron-left', 'chevronright': 'chevron-right', 'chevronup': 'chevron-up', 'chevrondown': 'chevron-down',
	'magnifyingglass': 'search', 'magnifying-glass': 'search', 'gear': 'settings', 'cog': 'settings', 'person': 'user',
	'close': 'x', 'cross': 'x', 'hamburger': 'menu', 'funnel': 'filter', 'trash': 'x', 'questionmark': 'question',
	'housesimple': 'home', 'house-simple': 'home', 'usercircle': 'user', 'user-circle': 'user', 'users': 'user',
	'bellsimple': 'bell', 'bell-simple': 'bell', 'calendarblank': 'calendar', 'calendar-blank': 'calendar',
	'checkcircle': 'check-circle', 'check-circle': 'check-circle', 'pluscircle': 'plus-circle', 'plus-circle': 'plus-circle',
	'xcircle': 'x-circle', 'x-circle': 'x-circle', 'dots-three': 'menu', 'dots-three-outline': 'menu',
};

export type CanvasIconWeight = 'regular' | 'bold' | 'fill';
export type CanvasIconDictionary = Readonly<Record<string, Readonly<Partial<Record<CanvasIconWeight, string>>>>>;

/** Phosphor path 使用 256×256 视口；内置手写表和自定义 svgPath 仍是 24×24。 */
const PHOSPHOR_VIEW_BOX = 256;

let activeDictionary: CanvasIconDictionary | null = null;
let dictionaryPromise: Promise<void> | null = null;

/**
 * 图标字典体积较大，作为独立异步 chunk 加载；加载完成前先用手写内置表渲染，
 * 由调用方（画布板）在就绪后触发首帧绘制，避免把 1.8MB 字典塞进主包。
 * 本地 chunk 拉取失败时静默退回内置表，图标能力绝不能阻塞画布。
 */
export function ensureCanvasIconDictionary(): Promise<void> {
	dictionaryPromise ??= import('./canvas-icon-dictionary.generated').then((module: { CANVAS_ICON_DICTIONARY: CanvasIconDictionary }) => {
		activeDictionary = module.CANVAS_ICON_DICTIONARY;
	}).catch(() => undefined);
	return dictionaryPromise;
}

function normalizeIconName(name: string): string {
	const normalized = name.trim().toLowerCase().replace(/[_\s]+/g, '-');
	return ICON_ALIASES[normalized] ?? ICON_ALIASES[normalized.replace(/-/g, '')] ?? normalized;
}

type Token = string;

function tokenizeSvgPath(value: string): Token[] {
	return value.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
}

function appendSvgArc(commands: CanvasPathCommand[], start: { x: number; y: number }, values: number[], relative: boolean): { x: number; y: number } {
	const [rawRx, rawRy, rotation, largeArcFlag, sweepFlag, rawX, rawY] = values;
	const end = { x: relative ? start.x + rawX : rawX, y: relative ? start.y + rawY : rawY };
	let rx = Math.abs(rawRx);
	let ry = Math.abs(rawRy);
	if (rx < 1e-6 || ry < 1e-6 || (Math.abs(start.x - end.x) < 1e-6 && Math.abs(start.y - end.y) < 1e-6)) {
		commands.push({ op: 'lineTo', x: end.x, y: end.y });
		return end;
	}
	const phi = rotation * Math.PI / 180;
	const cosPhi = Math.cos(phi);
	const sinPhi = Math.sin(phi);
	const dx = (start.x - end.x) / 2;
	const dy = (start.y - end.y) / 2;
	const xPrime = cosPhi * dx + sinPhi * dy;
	const yPrime = -sinPhi * dx + cosPhi * dy;
	const lambda = (xPrime * xPrime) / (rx * rx) + (yPrime * yPrime) / (ry * ry);
	if (lambda > 1) { const scale = Math.sqrt(lambda); rx *= scale; ry *= scale; }
	const denominator = rx * rx * yPrime * yPrime + ry * ry * xPrime * xPrime;
	const numerator = Math.max(0, rx * rx * ry * ry - denominator);
	const coefficient = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(denominator < 1e-12 ? 0 : numerator / denominator);
	const centerPrimeX = coefficient * (rx * yPrime / Math.max(1e-12, ry));
	const centerPrimeY = coefficient * (-ry * xPrime / Math.max(1e-12, rx));
	const center = { x: cosPhi * centerPrimeX - sinPhi * centerPrimeY + (start.x + end.x) / 2, y: sinPhi * centerPrimeX + cosPhi * centerPrimeY + (start.y + end.y) / 2 };
	const angleBetween = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
	const startAngle = angleBetween(1, 0, (xPrime - centerPrimeX) / rx, (yPrime - centerPrimeY) / ry);
	let deltaAngle = angleBetween((xPrime - centerPrimeX) / rx, (yPrime - centerPrimeY) / ry, (-xPrime - centerPrimeX) / rx, (-yPrime - centerPrimeY) / ry);
	if (!sweepFlag && deltaAngle > 0) deltaAngle -= Math.PI * 2;
	if (sweepFlag && deltaAngle < 0) deltaAngle += Math.PI * 2;
	const segmentCount = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2)));
	const segmentAngle = deltaAngle / segmentCount;
	const pointAt = (angle: number) => ({
		x: center.x + cosPhi * rx * Math.cos(angle) - sinPhi * ry * Math.sin(angle),
		y: center.y + sinPhi * rx * Math.cos(angle) + cosPhi * ry * Math.sin(angle),
	});
	const derivativeAt = (angle: number) => ({
		x: -cosPhi * rx * Math.sin(angle) - sinPhi * ry * Math.cos(angle),
		y: -sinPhi * rx * Math.sin(angle) + cosPhi * ry * Math.cos(angle),
	});
	for (let segment = 0; segment < segmentCount; segment += 1) {
		const angle0 = startAngle + segment * segmentAngle;
		const angle1 = angle0 + segmentAngle;
		const p0 = pointAt(angle0);
		const p1 = pointAt(angle1);
		const k = (4 / 3) * Math.tan((angle1 - angle0) / 4);
		const d0 = derivativeAt(angle0);
		const d1 = derivativeAt(angle1);
		commands.push({ op: 'cubicTo', x1: p0.x + k * d0.x, y1: p0.y + k * d0.y, x2: p1.x - k * d1.x, y2: p1.y - k * d1.y, x: p1.x, y: p1.y });
	}
	return end;
}

/** 将常见 SVG M/L/H/V/C/Q/Z 指令转换成 CanvasKit PathBuilder 可接受的命令。 */
export function parseCanvasIconPath(value: string): CanvasPathCommand[] {
	const tokens = tokenizeSvgPath(value);
	const commands: CanvasPathCommand[] = [];
	let index = 0;
	let command = '';
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	let previousCubicControl: { x: number; y: number } | null = null;
	let previousQuadControl: { x: number; y: number } | null = null;
	const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
	const read = () => Number(tokens[index++]);
	const has = (count: number) => index + count <= tokens.length && !tokens.slice(index, index + count).some(isCommand);
	const relativePoint = (nextX: number, nextY: number, relative: boolean) => ({ x: relative ? x + nextX : nextX, y: relative ? y + nextY : nextY });

	while (index < tokens.length) {
		if (isCommand(tokens[index])) command = tokens[index++];
		if (!command) { index += 1; continue; }
		const upper = command.toUpperCase();
		const relative = command !== upper;
		if (upper === 'Z') {
			commands.push({ op: 'close' }); x = startX; y = startY; previousCubicControl = null; previousQuadControl = null; command = '';
			continue;
		}
		const needed = upper === 'M' || upper === 'L' || upper === 'T' ? 2 : upper === 'H' || upper === 'V' ? 1 : upper === 'C' ? 6 : upper === 'S' ? 4 : upper === 'Q' ? 4 : upper === 'A' ? 7 : 0;
		if (!needed || !has(needed)) { command = ''; continue; }
		if (upper === 'M' || upper === 'L' || upper === 'T') {
			const rawX = read(); const rawY = read();
			const point = relativePoint(rawX, rawY, relative);
			if (upper === 'M') { commands.push({ op: 'moveTo', x: point.x, y: point.y }); startX = point.x; startY = point.y; command = relative ? 'l' : 'L'; }
			else if (upper === 'T') {
				const control: { x: number; y: number } = previousQuadControl ? { x: 2 * x - previousQuadControl.x, y: 2 * y - previousQuadControl.y } : { x, y };
				commands.push({ op: 'quadTo', x1: control.x, y1: control.y, x: point.x, y: point.y }); previousQuadControl = control;
			} else commands.push({ op: 'lineTo', x: point.x, y: point.y });
			x = point.x; y = point.y; previousCubicControl = null; if (upper !== 'T') previousQuadControl = null;
		} else if (upper === 'H' || upper === 'V') {
			const raw = read();
			if (upper === 'H') x = relative ? x + raw : raw; else y = relative ? y + raw : raw;
			commands.push({ op: 'lineTo', x, y }); previousCubicControl = null; previousQuadControl = null;
		} else if (upper === 'C' || upper === 'S') {
			let control1: { x: number; y: number };
			if (upper === 'S') {
				const reflected = previousCubicControl ? { x: 2 * x - previousCubicControl.x, y: 2 * y - previousCubicControl.y } : { x, y };
				control1 = reflected;
			} else {
				const rawX = read(); const rawY = read(); control1 = relativePoint(rawX, rawY, relative);
			}
			const rawX2 = read(); const rawY2 = read(); const control2 = relativePoint(rawX2, rawY2, relative); const rawX = read(); const rawY = read(); const point = relativePoint(rawX, rawY, relative);
			commands.push({ op: 'cubicTo', x1: control1.x, y1: control1.y, x2: control2.x, y2: control2.y, x: point.x, y: point.y });
			x = point.x; y = point.y; previousCubicControl = control2; previousQuadControl = null;
		} else if (upper === 'Q') {
			const rawX1 = read(); const rawY1 = read(); const control = relativePoint(rawX1, rawY1, relative); const rawX = read(); const rawY = read(); const point = relativePoint(rawX, rawY, relative);
			commands.push({ op: 'quadTo', x1: control.x, y1: control.y, x: point.x, y: point.y });
			x = point.x; y = point.y; previousQuadControl = control; previousCubicControl = null;
		} else if (upper === 'A') {
			const values = [read(), read(), read(), read(), read(), read(), read()];
			const point = appendSvgArc(commands, { x, y }, values, relative);
			x = point.x; y = point.y; previousCubicControl = null; previousQuadControl = null;
		}
	}
	return commands;
}

export interface ResolvedCanvasIconPath {
	path: CanvasPathSpec;
	/** 未知名称仍返回 question fallback，保证画布不会出现静默空白。 */
	known: boolean;
	/** path 所处的方形视口边长；内置与自定义为 24，Phosphor 字典为 256，渲染端据此缩放并补偿描边。 */
	viewBox: number;
}

/** 解析结果按源字符串缓存；AI 动画期间每帧重绘，不能反复解析上千字符的 path。 */
const parsedPathCache = new Map<string, CanvasPathCommand[]>();

function cachedParseCanvasIconPath(source: string): CanvasPathCommand[] {
	let commands = parsedPathCache.get(source);
	if (!commands) {
		commands = parseCanvasIconPath(source);
		// 字典 + 内置 + 自定义合计约两千条；超限整体清空比 LRU 更简单且足够。
		if (parsedPathCache.size > 4096) parsedPathCache.clear();
		parsedPathCache.set(source, commands);
	}
	return commands;
}

export function resolveCanvasIconPath(icon: CanvasIconSpec, dictionary: CanvasIconDictionary | null = activeDictionary): ResolvedCanvasIconPath {
	const custom = typeof icon.svgPath === 'string' ? icon.svgPath.trim() : '';
	const name = normalizeIconName(icon.name);
	const builtinSource = BUILTIN_ICON_PATHS[name];
	// 字典查找按协议字重取档；thin/light 不在字典中，回落到 regular 路径。
	const dictionaryEntry = dictionary?.[name];
	const dictionarySource = dictionaryEntry
		? (icon.weight === 'fill' ? dictionaryEntry.fill : icon.weight === 'bold' ? dictionaryEntry.bold : dictionaryEntry.regular) ?? dictionaryEntry.regular
		: undefined;
	const source = custom || builtinSource || dictionarySource || BUILTIN_ICON_PATHS.question;
	const viewBox = custom || builtinSource ? 24 : dictionarySource ? PHOSPHOR_VIEW_BOX : 24;
	return { path: { fillRule: 'nonZero', commands: cachedParseCanvasIconPath(source) }, known: Boolean(custom || builtinSource || dictionarySource), viewBox };
}

export function isBuiltinCanvasIcon(name: string): boolean {
	return Boolean(BUILTIN_ICON_PATHS[normalizeIconName(name)]);
}
