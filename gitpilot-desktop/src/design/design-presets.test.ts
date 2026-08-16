import { describe, expect, it } from 'vitest';
import { createDesignPresetCatalog, designPresetCatalog, filterDesignPresets, sanitizePresetPreviewHtml } from './design-presets';

const manifest = {
	schema: 'open-design.design-manifest.v1',
	title: 'Neutral Modern',
	description: '克制的现代产品界面。',
	entryFile: 'index.html',
	metadata: { source: 'Open Design', attribution: 'Design team' },
	responsiveViewports: [
		{ name: 'mobile', width: 390, height: 844, category: 'mobile' },
		{ name: 'desktop', width: 1440, height: 900, category: 'desktop' },
	],
};

const handoff = `# Neutral Modern handoff

## Color and brand contract
- Background is #FAFAFA and should feel quiet and precise.

## Component rules
- Buttons use the accent token with a visible focus state.

## Layout rules
- Keep content within a readable max-width and stable gutters.

## Responsive rules
- Collapse the secondary navigation below tablet width.

## Agent Prompt Guide
- Preserve the token names and do not replace product modules with generic cards.`;

const entryHtml = `<!doctype html><html><head><style>:root { --bg: #ffffff; --fg: #111111; --accent: #2f6feb; --display: Inter, sans-serif; --body: system-ui, sans-serif; --radius-card: 8px; --shadow-card: 0 8px 24px #0002; }</style></head><body><script data-od-srcdoc-transport>window.parent.postMessage('bridge', '*')</script><main>Preview</main></body></html>`;

function sources() {
	return {
		manifests: { './presets/neutral-modern/DESIGN-MANIFEST.json': manifest },
		handoffs: { './presets/neutral-modern/DESIGN-HANDOFF.md': handoff },
		entries: { './presets/neutral-modern/index.html': entryHtml },
	};
}

describe('Design preset catalog', () => {
	it('ships every migrated Open Design preset with a Chinese display title', () => {
		expect(designPresetCatalog.issues).toEqual([]);
		expect(designPresetCatalog.presets).toHaveLength(152);
		expect(designPresetCatalog.presets.find((preset) => preset.id === 'default')?.title).toBe('中性现代');
		expect(designPresetCatalog.presets.find((preset) => preset.id === 'agentic')?.title).toBe('智能体工作台');
		expect(designPresetCatalog.presets.find((preset) => preset.id === 'airtable')?.title).toBe('数据协作表格');
		expect(designPresetCatalog.presets.every((preset) => !/[A-Za-z]/.test(preset.title))).toBe(true);
	});

	it('discovers a valid preset and derives visual tokens plus handoff rules', () => {
		const catalog = createDesignPresetCatalog(sources());
		expect(catalog.issues).toEqual([]);
		expect(catalog.presets).toHaveLength(1);
		const preset = catalog.presets[0];
		expect(preset).toMatchObject({ id: 'neutral-modern', title: 'Neutral Modern', source: 'Open Design', license: 'unknown' });
		expect(preset.tokens.colors).toMatchObject({ bg: '#ffffff', accent: '#2f6feb' });
		expect(preset.tokens.typography).toMatchObject({ display: 'Inter, sans-serif', body: 'system-ui, sans-serif' });
		expect(preset.tokens.radius).toMatchObject({ 'radius-card': '8px' });
		expect(preset.handoffMarkdown).toContain('## Component rules');
		expect(preset.handoff.componentRules).toContain('Buttons use the accent token with a visible focus state.');
		expect(preset.handoff.responsiveRules).toContain('Collapse the secondary navigation below tablet width.');
		expect(preset.guidelines.rules).toContain('Keep content within a readable max-width and stable gutters.');
		expect(preset.warnings[0]).toContain('CSS Token');
	});

	it('reports directories that miss required files or use an invalid schema', () => {
		const catalog = createDesignPresetCatalog({
			manifests: {
				'./presets/missing-entry/DESIGN-MANIFEST.json': manifest,
				'./presets/invalid-schema/DESIGN-MANIFEST.json': { ...manifest, schema: 'other.schema' },
			},
			handoffs: {
				'./presets/missing-entry/DESIGN-HANDOFF.md': handoff,
				'./presets/invalid-schema/DESIGN-HANDOFF.md': handoff,
				'./presets/missing-manifest/DESIGN-HANDOFF.md': handoff,
			},
			entries: { './presets/missing-manifest/index.html': entryHtml, './presets/invalid-schema/index.html': entryHtml },
		});
		expect(catalog.presets).toEqual([]);
		expect(catalog.issues).toEqual(expect.arrayContaining([
			expect.objectContaining({ presetId: 'missing-entry', message: expect.stringContaining('index.html') }),
			expect.objectContaining({ presetId: 'missing-manifest', message: expect.stringContaining('DESIGN-MANIFEST') }),
			expect.objectContaining({ presetId: 'invalid-schema', message: expect.stringContaining('schema') }),
		]));
	});

	it('searches preset metadata without inspecting preview source', () => {
		const presets = createDesignPresetCatalog(sources()).presets;
		expect(filterDesignPresets(presets, 'open design').map((preset) => preset.id)).toEqual(['neutral-modern']);
		expect(filterDesignPresets(presets, 'not-found')).toEqual([]);
	});

	it('removes Open Design bridge code, external resources and executable preview scripts', () => {
		const sanitized = sanitizePresetPreviewHtml(`<html><head><script data-od-preview-redirect-guard>window.parent.postMessage('od', '*')</script><script>window.parent.postMessage('unsafe', '*')</script><link rel="stylesheet" href="https://cdn.example.com/app.css"><style>@import "https://cdn.example.com/theme.css";.hero{background:url(https://cdn.example.com/image.png)}</style></head><body onload="window.open('https://example.com')"><img src=https://cdn.example.com/image.png srcset="https://cdn.example.com/image@2x.png 2x" onerror="alert(1)"><a href="https://example.com">link</a></body></html>`);
		expect(sanitized).not.toMatch(/<script\b/i);
		expect(sanitized).not.toContain('postMessage');
		expect(sanitized).not.toContain('https://cdn.example.com');
		expect(sanitized).not.toContain('onload=');
		expect(sanitized).not.toContain('onerror=');
	});
});
