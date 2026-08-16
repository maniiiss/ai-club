import type { DesignPreset, DesignPresetHandoff, DesignPresetViewport, DesignProjectGuidelines } from './design-types';

const PRESET_SCHEMA = 'open-design.design-manifest.v1';
const PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRESET_PATH_PATTERN = /^\.\/presets\/([^/]+)\/(?:DESIGN-MANIFEST\.json|DESIGN-HANDOFF\.md|index\.html)$/;

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
	entries: Record<string, unknown>;
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
	return uniqueStrings(markdown
		.split(/\r?\n/)
		.map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '').replace(/`/g, '').trim())
		.filter((line) => line && !line.startsWith('#')));
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

/** CSS 自定义属性是像素级事实源，Markdown 只补充用途与实现规则。 */
export function extractPresetTokens(html: string): DesignProjectGuidelines['tokens'] {
	const tokens: DesignProjectGuidelines['tokens'] = { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {} };
	const customProperty = /--([a-zA-Z][\w-]*)\s*:\s*([^;{}]+);/g;
	for (const match of html.matchAll(customProperty)) {
		const [, name, rawValue] = match;
		const value = rawValue.trim();
		const group = tokenGroup(name, value);
		if (group && value) tokens[group][name] = value;
	}
	return tokens;
}

function extractMarkdownColors(markdown: string): string[] {
	return uniqueStrings([...markdown.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase()));
}

function presetWarnings(tokens: DesignProjectGuidelines['tokens'], markdown: string): string[] {
	const cssColors = new Set(Object.values(tokens.colors).flatMap((value) => [...value.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase())));
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

/**
 * 预览是隔离的静态参考，而不是项目页面。移除所有可执行脚本、外部资源和事件属性，
 * 使 Open Design 的桥接代码无法向宿主窗口发消息。
 */
export function sanitizePresetPreviewHtml(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
		.replace(/<(?:iframe|object|embed|base)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)\s*>/gi, '')
		.replace(/<(?:iframe|object|embed|base)\b[^>]*\/?\s*>/gi, '')
		.replace(/<meta\b[^>]*http-equiv\s*=\s*(['"]?)refresh\1[^>]*>/gi, '')
		.replace(/\s+on[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
		.replace(/\s+(?:src|href|action|poster)\s*=\s*(['"])(?:https?:)?\/\/[^'"]*\1/gi, '')
		.replace(/\s+(?:src|href|action|poster)\s*=\s*(?:https?:)?\/\/[^\s>]+/gi, '')
		.replace(/\s+srcset\s*=\s*(?:(['"])[\s\S]*?\1|[^\s>]+)/gi, '')
		.replace(/\s+(?:src|href|action|poster)\s*=\s*(['"])javascript:[\s\S]*?\1/gi, '')
		.replace(/@import\s+(['"])(?:https?:)?\/\/[\s\S]*?\1\s*;?/gi, '')
		.replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^)'"]*\1\s*\)/gi, 'none');
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

/** 将 Vite 的 glob 结果转换为可诊断的 Catalog，便于在测试中覆盖缺文件和非法 manifest。 */
export function createDesignPresetCatalog(sources: DesignPresetModuleSources): DesignPresetCatalog {
	const paths = [...Object.keys(sources.manifests), ...Object.keys(sources.handoffs), ...Object.keys(sources.entries)];
	const ids = uniqueStrings(paths.map(presetIdFromPath).filter((id): id is string => Boolean(id))).sort();
	const presets: DesignPreset[] = [];
	const issues: DesignPresetCatalogIssue[] = [];

	for (const id of ids) {
		const manifestPath = `./presets/${id}/DESIGN-MANIFEST.json`;
		const handoffPath = `./presets/${id}/DESIGN-HANDOFF.md`;
		const entryPath = `./presets/${id}/index.html`;
		if (!PRESET_ID_PATTERN.test(id)) { issues.push({ presetId: id, message: '预设目录必须使用小写 kebab-case preset id。' }); continue; }
		if (!(manifestPath in sources.manifests)) { issues.push({ presetId: id, message: '缺少 DESIGN-MANIFEST.json。' }); continue; }
		if (!(handoffPath in sources.handoffs)) { issues.push({ presetId: id, message: '缺少 DESIGN-HANDOFF.md。' }); continue; }
		if (!(entryPath in sources.entries)) { issues.push({ presetId: id, message: '缺少 index.html 入口文件。' }); continue; }
		const manifest = sources.manifests[manifestPath];
		if (!isRecord(manifest)) { issues.push({ presetId: id, message: 'DESIGN-MANIFEST.json 必须是对象。' }); continue; }
		if (manifest.schema !== PRESET_SCHEMA) { issues.push({ presetId: id, message: `manifest schema 必须是 ${PRESET_SCHEMA}。` }); continue; }
		const title = text(manifest.title);
		if (!title) { issues.push({ presetId: id, message: 'manifest 缺少标题。' }); continue; }
		if (manifest.entryFile !== 'index.html') { issues.push({ presetId: id, message: 'manifest entryFile 必须指向 index.html。' }); continue; }
		const viewportResult = parseViewports(manifest.responsiveViewports, id);
		if (!viewportResult.viewports) { issues.push({ presetId: id, message: viewportResult.issue ?? 'responsiveViewports 不可用。' }); continue; }
		const handoff = text(sources.handoffs[handoffPath]);
		const entryHtml = text(sources.entries[entryPath]);
		if (!handoff || !entryHtml) { issues.push({ presetId: id, message: '预设文件不能为空。' }); continue; }
		const metadata = isRecord(manifest.metadata) ? manifest.metadata : {};
		const tokens = extractPresetTokens(entryHtml);
		const parsedHandoff = extractHandoff(handoff);
		const description = firstText(manifest.description, manifest.summary, metadata.description, parsedHandoff.brandDescription, title) ?? title;
		presets.push({
			id,
			title,
			description,
			entryFile: 'index.html',
			viewports: viewportResult.viewports,
			tokens,
			handoff: parsedHandoff,
			handoffMarkdown: handoff,
			guidelines: guidelinesForPreset(title, tokens, parsedHandoff),
			previewHtml: sanitizePresetPreviewHtml(entryHtml),
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
const entryModules = import.meta.glob('./presets/*/index.html', { eager: true, query: '?raw', import: 'default' });

/** Catalog 只在构建时读取仓库内文件，不提供导入、联网拉取或项目目录写入能力。 */
export const designPresetCatalog = createDesignPresetCatalog({
	manifests: manifestModules,
	handoffs: handoffModules,
	entries: entryModules,
});
