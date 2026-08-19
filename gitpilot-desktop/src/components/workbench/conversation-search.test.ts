import { describe, expect, it } from 'vitest';
import { searchConversationHistory } from './conversation-search';

interface CodeSession {
	path: string;
	name?: string;
	firstMessage: string;
	allMessagesText?: string;
	modified: string;
}

interface WorkTask {
	id: string;
	title: string;
	messages: Array<{ role: 'user' | 'assistant'; text: string }>;
	updatedAt: number;
}

describe('历史任务搜索', () => {
	it('搜索 Code 标题，并回退支持旧 sidecar 的首条消息', () => {
		const sessions: CodeSession[] = [
			{ path: 'code-1', name: '登录重构', firstMessage: '检查认证流程', modified: '2026-08-19T10:00:00.000Z' },
			{ path: 'code-2', name: '支付页面', firstMessage: '调整支付按钮', modified: '2026-08-19T11:00:00.000Z' },
		];
		const results = searchConversationHistory(sessions, ' 登录 ', { getKey: (item) => item.path, getTitle: (item) => item.name ?? item.firstMessage, getSearchText: (item) => [item.name, item.firstMessage, item.allMessagesText].filter(Boolean).join(' '), getUpdatedAt: (item) => item.modified });
		expect(results.map((result) => result.item.path)).toEqual(['code-1']);
	});

	it('搜索 Code 的用户和助手完整历史消息', () => {
		const session: CodeSession = { path: 'code-1', name: '任务', firstMessage: '开始排查', allMessagesText: '用户要求检查缓存；助手发现 Redis 连接超时', modified: '2026-08-19T10:00:00.000Z' };
		const results = searchConversationHistory([session], 'redis 连接', { getKey: (item) => item.path, getTitle: (item) => item.name ?? '', getSearchText: (item) => [item.name, item.firstMessage, item.allMessagesText].filter(Boolean).join(' '), getUpdatedAt: (item) => item.modified });
		expect(results).toHaveLength(1);
		expect(results[0].summary).toContain('Redis');
	});

	it('搜索 Work 标题和用户、助手消息', () => {
		const tasks: WorkTask[] = [{ id: 'work-1', title: '公众端协同', messages: [{ role: 'user', text: '设计评论流程' }, { role: 'assistant', text: '已整理评论通知方案' }], updatedAt: 20 }];
		const search = (query: string) => searchConversationHistory(tasks, query, { getKey: (item) => item.id, getTitle: (item) => item.title, getSearchText: (item) => [item.title, ...item.messages.map((message) => message.text)].join(' '), getUpdatedAt: (item) => item.updatedAt });
		expect(search('协同')).toHaveLength(1);
		expect(search('通知方案')).toHaveLength(1);
	});

	it('忽略大小写和连续空白，并对空关键词与无结果返回空数组', () => {
		const items = [{ id: 'a', text: '  Hello   World  ', updatedAt: 1 }];
		const options = { getKey: (item: (typeof items)[number]) => item.id, getTitle: (item: (typeof items)[number]) => item.text, getSearchText: (item: (typeof items)[number]) => item.text, getUpdatedAt: (item: (typeof items)[number]) => item.updatedAt };
		expect(searchConversationHistory(items, ' hello world ', options)).toHaveLength(1);
		expect(searchConversationHistory(items, '   ', options)).toEqual([]);
		expect(searchConversationHistory(items, 'missing', options)).toEqual([]);
	});

	it('按更新时间倒序并限制结果数量', () => {
		const items = [1, 2, 3].map((id) => ({ id: String(id), text: '共同关键词', updatedAt: id }));
		const results = searchConversationHistory(items, '关键词', { getKey: (item) => item.id, getTitle: (item) => item.text, getSearchText: (item) => item.text, getUpdatedAt: (item) => item.updatedAt, limit: 2 });
		expect(results.map((result) => result.item.id)).toEqual(['3', '2']);
	});
});
