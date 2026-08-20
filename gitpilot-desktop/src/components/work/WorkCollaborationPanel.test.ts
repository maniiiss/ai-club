import { describe, expect, it } from 'vitest';
import { buildWorkItemConversationContext } from './WorkCollaborationPanel';
import type { RpcWorkItemDetail } from '@/src/rpc/types';

/** 构造测试用工作项详情；undefined 字段按需覆盖。 */
function makeDetail(overrides: Partial<RpcWorkItemDetail> = {}): RpcWorkItemDetail {
	return {
		id: 11,
		workItemCode: 'REQ-11',
		name: '登录加固',
		workItemType: '需求',
		status: '进行中',
		priority: '高',
		assignee: '张三',
		taskType: null,
		projectId: 3,
		projectName: null,
		iterationId: null,
		iterationName: null,
		planStartDate: null,
		planEndDate: null,
		description: null,
		requirementMarkdown: null,
		creatorName: null,
		prototypeUrl: null,
		moduleName: null,
		...overrides,
	};
}

describe('buildWorkItemConversationContext（发送到对话的上下文块）', () => {
	it('序列化基础字段并包裹 <work_item> 标签', () => {
		const context = buildWorkItemConversationContext(makeDetail());
		expect(context.startsWith('<work_item>\n')).toBe(true);
		expect(context.endsWith('\n</work_item>')).toBe(true);
		expect(context).toContain('编号：REQ-11');
		expect(context).toContain('名称：登录加固');
		expect(context).toContain('- 类型：需求');
		expect(context).toContain('- 状态：进行中');
		expect(context).toContain('- 优先级：高');
		expect(context).toContain('- 负责人：张三');
		// 未提供的可选字段不产生行
		expect(context).not.toContain('- 项目：');
		expect(context).not.toContain('- 迭代：');
		expect(context).not.toContain('## 描述');
		expect(context).not.toContain('## 需求内容');
	});

	it('任务类型与子类型组合展示，可选元数据按需输出', () => {
		const context = buildWorkItemConversationContext(makeDetail({
			workItemType: '任务',
			taskType: '开发',
			creatorName: '李四',
			projectName: '订单中心',
			iterationName: '迭代 3',
			moduleName: '认证',
			planStartDate: '2026-08-01',
			planEndDate: '2026-08-15',
		}));
		expect(context).toContain('- 类型：任务/开发');
		expect(context).toContain('- 创建人：李四');
		expect(context).toContain('- 项目：订单中心');
		expect(context).toContain('- 迭代：迭代 3');
		expect(context).toContain('- 模块：认证');
		expect(context).toContain('- 计划周期：2026-08-01 ~ 2026-08-15');
	});

	it('描述与需求正文分别注入对应小节', () => {
		const context = buildWorkItemConversationContext(makeDetail({
			description: '支持验证码登录',
			requirementMarkdown: '# 登录加固\n- 短信验证码',
		}));
		expect(context).toContain('## 描述\n支持验证码登录');
		expect(context).toContain('## 需求内容\n# 登录加固\n- 短信验证码');
	});

	it('描述与需求正文重复（Gitee 同步需求类工作项）时只保留需求内容', () => {
		const context = buildWorkItemConversationContext(makeDetail({
			description: '# 登录加固\n- 短信验证码',
			requirementMarkdown: '# 登录加固\n- 短信验证码',
		}));
		expect(context).not.toContain('## 描述');
		expect(context.match(/## 需求内容/g)).toHaveLength(1);
		expect(context).toContain('# 登录加固\n- 短信验证码');
	});

	it('仅普通任务描述（无需求正文）时正常展示描述', () => {
		const context = buildWorkItemConversationContext(makeDetail({
			description: '修复登录超时问题',
		}));
		expect(context).toContain('## 描述\n修复登录超时问题');
		expect(context).not.toContain('## 需求内容');
	});
});
