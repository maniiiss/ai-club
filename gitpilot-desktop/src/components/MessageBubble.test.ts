import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MessageBubble, shouldCollapseUserText, USER_TEXT_COLLAPSE_THRESHOLD } from './MessageBubble';
import { TooltipProvider } from '@/src/components/ui/tooltip';
import type { UIMessage } from '@/src/store/session';

/** 用户消息操作栏包含 Radix Tooltip，静态渲染需要 Provider 包裹。 */
function renderBubble(message: UIMessage): string {
	return renderToStaticMarkup(createElement(TooltipProvider, null, createElement(MessageBubble, { message })));
}

describe('超长用户消息折叠', () => {
	it('超过阈值判定为需要折叠，短消息不折叠', () => {
		expect(shouldCollapseUserText('x'.repeat(USER_TEXT_COLLAPSE_THRESHOLD + 1))).toBe(true);
		expect(shouldCollapseUserText('x'.repeat(USER_TEXT_COLLAPSE_THRESHOLD))).toBe(false);
		expect(shouldCollapseUserText('简短提问')).toBe(false);
	});

	it('超长用户消息渲染折叠容器与展开按钮，短消息不渲染', () => {
		const longMessage = { id: 'm1', role: 'user', text: 'y'.repeat(USER_TEXT_COLLAPSE_THRESHOLD + 10), kind: 'text' } as UIMessage;
		const longHtml = renderBubble(longMessage);
		expect(longHtml).toContain('展开全文');

		const shortMessage = { id: 'm2', role: 'user', text: '简短提问', kind: 'text' } as UIMessage;
		const shortHtml = renderBubble(shortMessage);
		expect(shortHtml).not.toContain('展开全文');
	});
});
