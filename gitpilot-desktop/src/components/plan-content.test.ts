import { describe, expect, it } from 'vitest';
import { parsePlanContent } from './plan-content';

describe('计划内容解析', () => {
	it('移除 Proposed Plan 包装并提取标题与预览', () => {
		const result = parsePlanContent('**Proposed Plan**\n\n# 登录模块改造\n\n## 目标\n\n保持现有协议不变。\n\n## 方案\n\n新增卡片。\n\n## 测试\n\n覆盖抽屉交互。');

		expect(result.title).toBe('登录模块改造');
		expect(result.markdown).toContain('# 登录模块改造');
		expect(result.markdown).not.toContain('Proposed Plan');
		expect(result.previewMarkdown).toContain('## 目标');
		expect(result.previewMarkdown).not.toContain('## 测试');
	});

	it('无标题时使用首行作为回退标题', () => {
		expect(parsePlanContent('先完成现状分析。\n\n再执行改造。').title).toBe('先完成现状分析。');
	});
});

