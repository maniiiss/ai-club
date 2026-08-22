import type { CanvasDesignDocument, CanvasNode } from './canvas-types';
import type { DesignPreset, DesignPresetHandoff, DesignPresetViewport, DesignProjectGuidelines } from './design-types';

const PRESET_SCHEMA = 'open-design.design-manifest.v1';
const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRESET_PATH_PATTERN = /^\.\/presets\/([^/]+)\/(?:DESIGN-MANIFEST\.json|DESIGN-HANDOFF\.md)$/;

type UnknownRecord = Record<string, unknown>;

export interface DesignPresetCatalogIssue {
	presetId: string;
	message: string;
}

export interface DesignPresetCatalog {
	presets: DesignPreset[];
	issues: DesignPresetCatalogIssue[];
}

export interface DesignPresetModuleSources {
	manifests: Record<string, unknown>;
	handoffs: Record<string, unknown>;
	/** 兼容旧测试调用方；原生 Catalog 不读取此字段。 */
	entries?: Record<string, unknown>;
}

/** 搜索只命中 Catalog 的公开元数据，避免把完整 handoff 或预览 HTML 放进 UI 筛选索引。 */
export function filterDesignPresets(presets: DesignPreset[], query: string): DesignPreset[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return presets;
	return presets.filter((preset) => [preset.title, preset.description, preset.source, preset.attribution]
		.filter((value): value is string => Boolean(value))
		.join(' ')
		.toLocaleLowerCase()
		.includes(normalizedQuery));
}

function isRecord(value: unknown): value is UnknownRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstText(...values: unknown[]): string | undefined {
	return values.map(text).find((value): value is string => Boolean(value));
}

function stringValue(value: unknown): string | undefined {
	if (typeof value === 'string') return text(value);
	if (!isRecord(value)) return undefined;
	return firstText(value.name, value.label, value.url, value.href, value.value);
}

function presetIdFromPath(path: string): string | null {
	return path.match(PRESET_PATH_PATTERN)?.[1] ?? null;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function markdownLines(markdown: string): string[] {
	let inCodeFence = false;
	const lines: string[] = [];
	for (const rawLine of markdown.split(/\r?\n/)) {
		const trimmed = rawLine.trim();
		if (/^(?:```|~~~)/.test(trimmed)) {
			inCodeFence = !inCodeFence;
			continue;
		}
		if (inCodeFence) continue;
		const line = rawLine.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '').replace(/`/g, '').trim();
		// handoff 可以包含给旧 HTML 预览使用的示例代码，但这些内容不能进入原生场景规范或 AI 上下文。
		if (!line || line.startsWith('#') || /<\/?(?:html|script|style|iframe|object|embed|base)\b/i.test(line)) continue;
		lines.push(line);
	}
	return uniqueStrings(lines);
}

/** 按二级标题归档 handoff，保留 Markdown 中对 Agent 有价值的语义规则。 */
function markdownSections(markdown: string): Array<{ heading: string; lines: string[] }> {
	const sections: Array<{ heading: string; lines: string[] }> = [];
	let current = { heading: '', lines: [] as string[] };
	for (const line of markdown.split(/\r?\n/)) {
		const heading = line.match(/^##\s+(.+)\s*$/);
		if (heading) {
			if (current.heading || current.lines.length > 0) sections.push(current);
			current = { heading: heading[1].trim(), lines: [] };
			continue;
		}
		current.lines.push(line);
	}
	if (current.heading || current.lines.length > 0) sections.push(current);
	return sections.map((section) => ({ ...section, lines: markdownLines(section.lines.join('\n')) }));
}

function sectionLines(sections: Array<{ heading: string; lines: string[] }>, pattern: RegExp): string[] {
	return uniqueStrings(sections.filter((section) => pattern.test(section.heading)).flatMap((section) => section.lines));
}

function firstParagraph(markdown: string): string {
	const paragraph = markdown.split(/\r?\n\s*\r?\n/).map((block) => markdownLines(block).join(' ')).find(Boolean);
	return paragraph ?? '';
}

function extractHandoff(markdown: string): DesignPresetHandoff {
	const sections = markdownSections(markdown);
	const brand = sectionLines(sections, /brand|color/i);
	return {
		brandDescription: brand[0] ?? firstParagraph(markdown),
		componentRules: sectionLines(sections, /component|interaction|state/i),
		layoutRules: sectionLines(sections, /layout|screen|surface|fidelity/i),
		responsiveRules: sectionLines(sections, /responsive|breakpoint|viewport/i),
		agentPromptGuide: sectionLines(sections, /agent|ai coding|coding checklist|implementation sequence|implementation target/i),
	};
}

function isColor(value: string): boolean {
	return /#(?:[0-9a-f]{3,8})\b|\b(?:rgb|hsl|oklch|lab|color)\(/i.test(value);
}

function tokenGroup(name: string, value: string): keyof DesignProjectGuidelines['tokens'] | null {
	if (/(?:color|bg|background|fg|foreground|accent|muted|border|surface|text)/i.test(name) || isColor(value)) return 'colors';
	if (/(?:font|type|display|body|mono|serif|sans|line-height|leading|tracking)/i.test(name)) return 'typography';
	if (/(?:space|spacing|gap|gutter|padding|margin|inset)/i.test(name)) return 'spacing';
	if (/(?:radius|round)/i.test(name)) return 'radius';
	if (/(?:shadow|elevation)/i.test(name)) return 'shadows';
	return null;
}

/** 设计 Token 只从 manifest/handoff 的文本元数据提取，不从 HTML/CSS 预览执行环境读取。 */
export function extractPresetTokens(source: string): DesignProjectGuidelines['tokens'] {
	const tokens: DesignProjectGuidelines['tokens'] = { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {} };
	const customProperty = /--([a-zA-Z][\w-]*)\s*:\s*([^;{}]+);/g;
	for (const match of source.matchAll(customProperty)) {
		const [, name, rawValue] = match;
		const value = rawValue.trim();
		const group = tokenGroup(name, value);
		if (group && value) tokens[group][name] = value;
	}
	if (Object.keys(tokens.colors).length === 0) {
		extractMarkdownColors(source).forEach((color, index) => { tokens.colors[`color-${index + 1}`] = color; });
	}
	return tokens;
}

function extractMarkdownColors(markdown: string): string[] {
	return uniqueStrings([...markdown.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toUpperCase()));
}

function presetWarnings(tokens: DesignProjectGuidelines['tokens'], markdown: string): string[] {
	const cssColors = new Set(Object.values(tokens.colors).flatMap((value) => [...value.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toUpperCase())));
	const markdownColors = extractMarkdownColors(markdown);
	if (cssColors.size === 0 || markdownColors.length === 0) return [];
	const hasDifference = markdownColors.some((color) => !cssColors.has(color));
	return hasDifference ? ['Markdown 中的颜色与 CSS Token 不完全一致，已按 CSS Token 作为实际视觉值。'] : [];
}

function parseViewports(value: unknown, presetId: string): { viewports?: DesignPresetViewport[]; issue?: string } {
	if (!Array.isArray(value) || value.length === 0) return { issue: '缺少有效的 responsiveViewports。' };
	const viewports: DesignPresetViewport[] = [];
	for (const item of value) {
		if (!isRecord(item)) return { issue: 'responsiveViewports 包含非法条目。' };
		const label = firstText(item.name, item.label);
		const width = item.width;
		const height = item.height;
		if (!label || typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 10000 || height > 10000) {
			return { issue: 'responsiveViewports 必须包含合法的名称、宽度和高度。' };
		}
		viewports.push({ id: `${presetId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || viewports.length + 1}`, label, width, height, category: text(item.category) });
	}
	return { viewports };
}

function guidelinesForPreset(title: string, tokens: DesignProjectGuidelines['tokens'], handoff: DesignPresetHandoff): DesignProjectGuidelines {
	const components = Object.fromEntries(handoff.componentRules.slice(0, 40).map((rule, index) => [`component-${index + 1}`, rule]));
	const rules = uniqueStrings([
		...handoff.layoutRules,
		...handoff.responsiveRules,
		...handoff.agentPromptGuide,
	]).slice(0, 100);
	return {
		version: 1,
		brand: { name: title, tone: handoff.brandDescription || '遵循预设视觉系统和交互规则' },
		tokens,
		components,
		rules,
		accessibility: { minContrast: 'AA' },
		updatedAt: new Date().toISOString(),
	};
}

/**
 * 把 Catalog 元数据落成可编辑的原生场景，作为预设缩略图和新工作区初稿。
 * 业务意图：预设可以继续从 Open Design 获取规范资料，但视觉预览不再依赖 HTML/CSS 执行。
 */
function sceneForPreset(id: string, title: string, viewports: DesignPresetViewport[], tokens: DesignProjectGuidelines['tokens']): CanvasDesignDocument {
	const viewport = viewports.find((item) => item.category === 'desktop') ?? viewports[0] ?? { width: 1440, height: 900 };
	const width = viewport.width;
	const height = viewport.height;
	const color = (key: string, fallback: string) => tokens.colors[key] ?? fallback;
	const layout = (nodeWidth: number, nodeHeight: number) => ({ mode: 'absolute' as const, width: nodeWidth, height: nodeHeight, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column' as const, align: 'start' as const, justify: 'start' as const });
	const makeNode = (node: Omit<CanvasNode, 'parentId' | 'childIds' | 'visible' | 'locked' | 'opacity' | 'layout'> & Partial<Pick<CanvasNode, 'parentId' | 'childIds' | 'paint' | 'text'>>): CanvasNode => ({ parentId: null, childIds: [], visible: true, locked: false, opacity: 1, layout: layout(node.transform.width, node.transform.height), ...node });
	const rootId = `${id}-frame`;
	const titleId = `${id}-title`;
	const subtitleId = `${id}-subtitle`;
	const actionId = `${id}-action`;
	const root = makeNode({ id: rootId, type: 'frame', name: `${title} 画板`, transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 }, paint: { fill: { kind: 'solid', color: color('bg', '#f7f8fa') } }, childIds: [titleId, subtitleId, actionId] });
	const titleNode = makeNode({ id: titleId, type: 'text', name: '预设标题', parentId: rootId, transform: { x: width * 0.1, y: height * 0.28, width: width * 0.8, height: 100, rotation: 0, scaleX: 1, scaleY: 1 }, text: { text: title, fontFamily: 'Inter', fontSize: Math.max(34, width * 0.045), fontWeight: 700, lineHeight: Math.max(42, width * 0.05), letterSpacing: 0, color: color('fg', '#18212f'), align: 'center', verticalAlign: 'center', wrap: 'wrap' } });
	const subtitleNode = makeNode({ id: subtitleId, type: 'text', name: '预设说明', parentId: rootId, transform: { x: width * 0.18, y: height * 0.45, width: width * 0.64, height: 62, rotation: 0, scaleX: 1, scaleY: 1 }, text: { text: 'CanvasKit 原生设计系统预设', fontFamily: 'Inter', fontSize: Math.max(14, width * 0.014), fontWeight: 400, lineHeight: 24, letterSpacing: 0, color: color('muted', '#687386'), align: 'center', verticalAlign: 'center', wrap: 'wrap' } });
	const actionNode = makeNode({ id: actionId, type: 'rect', name: '预设操作', parentId: rootId, transform: { x: width * 0.38, y: height * 0.62, width: width * 0.24, height: 54, rotation: 0, scaleX: 1, scaleY: 1 }, paint: { fill: { kind: 'solid', color: color('accent', '#2563eb') }, cornerRadius: 27 } });
	const nodes = Object.fromEntries([root, titleNode, subtitleNode, actionNode].map((node) => [node.id, node]));
	return { schemaVersion: 2, id: `preset-${id}`, name: title, revision: 1, updatedAt: new Date().toISOString(), entryPageId: `${id}-page`, pages: [{ id: `${id}-page`, name: title, route: '/', rootNodeId: rootId, width, height, background: { kind: 'solid', color: color('bg', '#f7f8fa') } }], nodes, assets: {}, guidelines: undefined };
}

/** 将 Vite 的 glob 结果转换为可诊断的 Catalog，便于在测试中覆盖缺文件和非法 manifest。 */
export function createDesignPresetCatalog(sources: DesignPresetModuleSources): DesignPresetCatalog {
	const paths = [...Object.keys(sources.manifests), ...Object.keys(sources.handoffs)];
	const ids = uniqueStrings(paths.map(presetIdFromPath).filter((id): id is string => Boolean(id))).sort();
	const presets: DesignPreset[] = [];
	const issues: DesignPresetCatalogIssue[] = [];

	for (const id of ids) {
		const manifestPath = `./presets/${id}/DESIGN-MANIFEST.json`;
		const handoffPath = `./presets/${id}/DESIGN-HANDOFF.md`;
		if (!PRESET_ID_PATTERN.test(id)) { issues.push({ presetId: id, message: '预设目录必须使用小写 kebab-case preset id。' }); continue; }
		if (!(manifestPath in sources.manifests)) { issues.push({ presetId: id, message: '缺少 DESIGN-MANIFEST.json。' }); continue; }
		if (!(handoffPath in sources.handoffs)) { issues.push({ presetId: id, message: '缺少 DESIGN-HANDOFF.md。' }); continue; }
		const manifest = sources.manifests[manifestPath];
		if (!isRecord(manifest)) { issues.push({ presetId: id, message: 'DESIGN-MANIFEST.json 必须是对象。' }); continue; }
		if (manifest.schema !== PRESET_SCHEMA) { issues.push({ presetId: id, message: `manifest schema 必须是 ${PRESET_SCHEMA}。` }); continue; }
		const title = text(manifest.title);
		if (!title) { issues.push({ presetId: id, message: 'manifest 缺少标题。' }); continue; }
		if (manifest.entryFile && manifest.entryFile !== 'index.html') { issues.push({ presetId: id, message: '旧预设 entryFile 必须仅作为兼容元数据保留。' }); continue; }
		const viewportResult = parseViewports(manifest.responsiveViewports, id);
		if (!viewportResult.viewports) { issues.push({ presetId: id, message: viewportResult.issue ?? 'responsiveViewports 不可用。' }); continue; }
		const handoff = text(sources.handoffs[handoffPath]);
		if (!handoff) { issues.push({ presetId: id, message: '预设 handoff 文件不能为空。' }); continue; }
		const metadata = isRecord(manifest.metadata) ? manifest.metadata : {};
		const tokens = extractPresetTokens(handoff);
		const parsedHandoff = extractHandoff(handoff);
		const description = firstText(manifest.description, manifest.summary, metadata.description, parsedHandoff.brandDescription, title) ?? title;
		presets.push({
			id,
			title,
			description,
			viewports: viewportResult.viewports,
			tokens,
			handoff: parsedHandoff,
			handoffMarkdown: handoff,
			guidelines: guidelinesForPreset(title, tokens, parsedHandoff),
			scene: sceneForPreset(id, title, viewportResult.viewports, tokens),
			source: firstText(stringValue(manifest.source), stringValue(metadata.source)),
			license: firstText(stringValue(manifest.license), stringValue(metadata.license)) ?? 'unknown',
			attribution: firstText(stringValue(manifest.attribution), stringValue(metadata.attribution)),
			warnings: presetWarnings(tokens, handoff),
		});
	}
	return { presets, issues };
}

const manifestModules = import.meta.glob('./presets/*/DESIGN-MANIFEST.json', { eager: true, import: 'default' });
const handoffModules = import.meta.glob('./presets/*/DESIGN-HANDOFF.md', { eager: true, query: '?raw', import: 'default' });

/** Catalog 只在构建时读取仓库内文件，不提供导入、联网拉取或项目目录写入能力。 */
export const designPresetCatalog = createDesignPresetCatalog({
	manifests: manifestModules,
	handoffs: handoffModules,
});
