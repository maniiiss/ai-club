import { describe, expect, it } from 'vitest';
import { createDesignPresetCatalog, designPresetCatalog, filterDesignPresets } from './design-presets';

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

function sources() {
	return {
		manifests: { './presets/neutral-modern/DESIGN-MANIFEST.json': manifest },
		handoffs: { './presets/neutral-modern/DESIGN-HANDOFF.md': handoff },
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
		expect(preset.tokens.colors).toMatchObject({ 'color-1': '#FAFAFA' });
		expect(preset.handoffMarkdown).toContain('## Component rules');
		expect(preset.handoff.componentRules).toContain('Buttons use the accent token with a visible focus state.');
		expect(preset.handoff.responsiveRules).toContain('Collapse the secondary navigation below tablet width.');
		expect(preset.guidelines.rules).toContain('Keep content within a readable max-width and stable gutters.');
		expect(preset.scene?.schemaVersion).toBe(2);
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
		});
		// 缺少旧 HTML entry 不再是错误；原生预设只要求 manifest + handoff。
		expect(catalog.presets).toHaveLength(1);
		expect(catalog.presets[0].id).toBe('missing-entry');
		expect(catalog.issues).toEqual(expect.arrayContaining([
			expect.objectContaining({ presetId: 'missing-manifest', message: expect.stringContaining('DESIGN-MANIFEST') }),
		expect.objectContaining({ presetId: 'invalid-schema', message: expect.stringContaining('schema') }),
		]));
	});

	it('searches preset metadata without inspecting preview source', () => {
		const presets = createDesignPresetCatalog(sources()).presets;
		expect(filterDesignPresets(presets, 'open design').map((preset) => preset.id)).toEqual(['neutral-modern']);
		expect(filterDesignPresets(presets, 'not-found')).toEqual([]);
	});

	it('does not copy legacy HTML/CSS snippets from handoff into native guidelines', () => {
		const fence = String.fromCharCode(96).repeat(3);
		const preset = createDesignPresetCatalog({
			manifests: { './presets/native-safe/DESIGN-MANIFEST.json': manifest },
			handoffs: { './presets/native-safe/DESIGN-HANDOFF.md': handoff + '\n\n## Layout rules\n' + fence + 'html\n<html lang="zh-CN"><style>body { color: red; }</style>\n' + fence + '\n- Use CSS tokens for visual intent, not executable source.\n- Ignore `<html lang="en">` examples from legacy references.' },
		}).presets[0];
		expect(preset.guidelines.rules).not.toEqual(expect.arrayContaining([expect.stringContaining('<html')]));
		expect(preset.guidelines.rules).toContain('Use CSS tokens for visual intent, not executable source.');
	});

});
