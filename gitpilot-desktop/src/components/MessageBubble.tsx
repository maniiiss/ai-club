/**
 * 单条消息渲染。
 *
 * - user：右对齐，浅灰背景配深色文字
 * - assistant：左对齐，无外框直接渲染 Markdown
 * - tool：灰色卡片（委托 CodeCard）
 * - system/error：居中提示
 */
import { memo } from 'react';
import { CodeCard } from './CodeCard';
import type { UIMessage } from '@/src/store/session';

const ROLE_ALIGN: Record<UIMessage['role'], string> = {
	user: 'justify-end',
	assistant: 'justify-start',
	tool: 'justify-start',
	system: 'justify-center',
};

export const MessageBubble = memo(function MessageBubble({ message }: { message: UIMessage }) {
	if (message.role === 'tool') {
		return (
			<div className="my-1">
				<CodeCard message={message} />
			</div>
		);
	}

	if (message.role === 'system') {
		return (
			<div className="my-2 flex justify-center">
				<span className="rounded-full bg-[var(--color-bg-hover)] px-3 py-1 text-xs text-[var(--color-text-muted)]">{message.text}</span>
			</div>
		);
	}

	const isUser = message.role === 'user';
	return (
		<div className={`chat-message flex min-w-0 w-full ${ROLE_ALIGN[message.role]}`}>
			<div
				className={`${isUser ? 'max-w-[78%] rounded-lg px-4 py-3' : 'w-full min-w-0 max-w-none px-1 py-1'} text-[14px] font-normal leading-6 ${
					isUser
						? 'bg-[var(--color-bg-hover)] text-[var(--color-text)]'
						: 'bg-transparent text-[var(--color-text)]'
				}`}
			>
				{isUser ? (
					<span className="whitespace-pre-wrap break-words">{message.text}</span>
				) : (
					<CodeCard message={message} />
				)}
				{message.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[var(--color-primary-hover)] align-middle" />}
			</div>
		</div>
	);
});
