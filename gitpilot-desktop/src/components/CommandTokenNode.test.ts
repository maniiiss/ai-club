import { describe, expect, it } from 'vitest';
import { createCommandDocument, findCommandToken, serializeCommandContent } from './CommandTokenNode';

describe('Tiptap 命令 inline node', () => {
	it('序列化命令 token 时保留 slash 协议和多行参数', () => {
		const document = createCommandDocument('goal', 'extension', '检查登录\n补充测试');
		expect(serializeCommandContent(document.content)).toBe('/goal 检查登录\n补充测试');
	});

	it('可以从编辑器文档中恢复命令名称和来源', () => {
		const document = createCommandDocument('plan', 'extension');
		expect(findCommandToken(document.content)).toEqual({ name: 'plan', source: 'extension' });
		expect(findCommandToken([{ type: 'paragraph', content: [{ type: 'text', text: '普通文本' }] }])).toBeNull();
	});
});
