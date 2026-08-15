import type { DesignProjectGuidelines } from './rpc-types.ts';

/** 缺少或损坏的规范回退到稳定默认值，保证旧 workspace 可以继续打开。 */
export function defaultProjectGuidelines(): DesignProjectGuidelines {
	return {
		version: 1,
		brand: { name: '', tone: '清晰、专业、易使用' },
		tokens: { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {} },
		components: {},
		rules: [],
		accessibility: { minContrast: 'AA' },
		updatedAt: new Date().toISOString(),
	};
}

function stringMap(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).filter(([key, item]) => /^[a-zA-Z0-9._-]{1,80}$/.test(key) && typeof item === 'string' && item.length <= 500));
}

/** 规范化来自 Desktop 或磁盘的 JSON，避免任意字段进入 Agent 上下文或无限膨胀。 */
export function normalizeProjectGuidelines(value: unknown): DesignProjectGuidelines {
	const fallback = defaultProjectGuidelines();
	if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
	const raw = value as Record<string, unknown>;
	const brand = raw.brand && typeof raw.brand === 'object' && !Array.isArray(raw.brand) ? raw.brand as Record<string, unknown> : {};
	const tokens = raw.tokens && typeof raw.tokens === 'object' && !Array.isArray(raw.tokens) ? raw.tokens as Record<string, unknown> : {};
	const accessibility = raw.accessibility && typeof raw.accessibility === 'object' && !Array.isArray(raw.accessibility) ? raw.accessibility as Record<string, unknown> : {};
	return {
		version: 1,
		brand: { name: typeof brand.name === 'string' ? brand.name.slice(0, 200) : fallback.brand.name, tone: typeof brand.tone === 'string' ? brand.tone.slice(0, 500) : fallback.brand.tone },
		tokens: {
			colors: stringMap(tokens.colors),
			typography: stringMap(tokens.typography),
			spacing: stringMap(tokens.spacing),
			radius: stringMap(tokens.radius),
			shadows: stringMap(tokens.shadows),
		},
		components: stringMap(raw.components),
		rules: Array.isArray(raw.rules) ? raw.rules.filter((rule): rule is string => typeof rule === 'string').map((rule) => rule.slice(0, 500)).slice(0, 100) : [],
		accessibility: { minContrast: accessibility.minContrast === 'AAA' ? 'AAA' : 'AA' },
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
	};
}
