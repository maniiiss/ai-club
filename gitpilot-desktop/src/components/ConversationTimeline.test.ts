import { describe, expect, it } from 'vitest';
import { buildConversationTimelineEntries, getConversationTimelinePreview } from './ConversationTimeline';
import type { UIMessage } from '@/src/store/session';

const message = (id: string, text: string, role: UIMessage['role'] = 'assistant', kind: UIMessage['kind'] = 'text'): UIMessage => ({ id, text, role, kind });

describe('会话缩略时间轴', () => {
	it('只保留每次用户提问及其原始顺序', () => {
		const entries = buildConversationTimelineEntries([
			message('a', '你好', 'user'),
			message('b', '我来处理'),
			message('c', '继续', 'user'),
			message('d', '继续处理'),
		]);
		expect(entries.map((entry) => entry.id)).toEqual(['a', 'c']);
		expect(entries.map((entry) => entry.messageIndex)).toEqual([0, 2]);
		expect(entries.every((entry) => entry.label === '用户提问')).toBe(true);
	});

	it('为长会话均匀抽样且始终保留首尾消息', () => {
		const messages = Array.from({ length: 80 }, (_, index) => message(String(index), `消息 ${index}`, index % 2 === 0 ? 'user' : 'assistant'));
		const entries = buildConversationTimelineEntries(messages, 8);
		expect(entries).toHaveLength(8);
		expect(entries[0]).toMatchObject({ id: '0', messageIndex: 0 });
		expect(entries.at(-1)).toMatchObject({ id: '78', messageIndex: 78 });
	});

	it('预览优先展示提问正文，空正文时回退到语义标签', () => {
		const messages = [message('text', '已完成项目结构检查', 'user'), message('empty', '', 'user')];
		const entries = buildConversationTimelineEntries(messages);
		expect(getConversationTimelinePreview(messages, entries[0])).toBe('已完成项目结构检查');
		expect(getConversationTimelinePreview(messages, entries[1])).toBe('用户提问');
	});
});
