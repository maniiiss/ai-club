import { describe, expect, it } from 'vitest';
import { buildWorkItemContext, buildWorkItemPrompt, createWorkItemAttachment, getWorkItemGroup } from './ComposerAddMenu';
import type { RpcWorkItemSummary } from '@/src/rpc/types';

const workItem = (patch: Partial<RpcWorkItemSummary> = {}): RpcWorkItemSummary => ({
	id: 1,
	workItemCode: '#REQ-1',
	name: '登录支持验证码',
	workItemType: '需求',
	status: '进行中',
	priority: '高',
	assignee: '张三',
	taskType: null,
	projectId: 2,
	projectName: 'AI Club 平台',
	iterationId: 3,
	iterationName: '迭代一',
	planStartDate: '2026-08-01',
	planEndDate: '2026-08-15',
	requirementMarkdown: '## 用户故事\n作为用户我希望安全登录',
	...patch,
});

describe('工作项添加入口', () => {
	it('将需求和任务放入需求任务分组，缺陷单独分组', () => {
		expect(getWorkItemGroup(workItem({ workItemType: '需求' }))).toBe('requirements');
		expect(getWorkItemGroup(workItem({ workItemType: '任务' }))).toBe('requirements');
		expect(getWorkItemGroup(workItem({ workItemType: '缺陷' }))).toBe('defects');
	});

	it('选中需求时只生成固定分析指令', () => {
		const prompt = buildWorkItemPrompt(workItem());
		expect(prompt).toBe('帮我分析需求，并设计实现方案。');
	});

	it('缺陷使用缺陷分析指令，完整工作项信息放入隐藏上下文', () => {
		expect(buildWorkItemPrompt(workItem({ workItemType: '缺陷' }))).toBe('帮我分析缺陷，并提出修改方案。');
		const context = buildWorkItemContext(workItem());
		expect(context).toContain('编号：#REQ-1');
		expect(context).toContain('项目：AI Club 平台');
		expect(createWorkItemAttachment(workItem()).kind).toBe('work-item');
	});

	it('任务仍归入需求任务并使用需求分析指令', () => {
		const prompt = buildWorkItemPrompt(workItem({ workItemType: '任务', taskType: '开发', requirementMarkdown: '不应作为需求内容带入' }));
		expect(prompt).toBe('帮我分析需求，并设计实现方案。');
		expect(buildWorkItemContext(workItem({ workItemType: '任务', taskType: '开发' }))).toContain('类型：任务/开发');
	});
});
