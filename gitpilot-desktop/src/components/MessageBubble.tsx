/**
 * 单条消息渲染。
 *
 * - user：右对齐，品牌色背景
 * - assistant：左对齐，表面色背景，Markdown 渲染
 * - tool：灰色卡片（委托 CodeCard）
 * - system/error：居中提示
 */
import { memo } from 'react';
import { Bot, User } from 'lucide-react';
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
			<div className="my-1 pl-9">
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
		<div className={`flex items-start gap-2.5 ${ROLE_ALIGN[message.role]}`}>
			{!isUser && (
				<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]">
					<Bot size={15} />
				</div>
			)}
			<div
				className={`max-w-[78%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
					isUser
						? 'bg-[var(--color-primary)] text-white'
						: message.kind === 'error'
							? 'border border-[var(--color-error)]/40 bg-[var(--color-code-diff-del)] text-[var(--color-error)]'
							: 'bg-[var(--color-bg-surface)] text-[var(--color-text)]'
				}`}
			>
				{isUser ? (
					<span className="whitespace-pre-wrap break-words">{message.text}</span>
				) : (
					<CodeCard message={message} />
				)}
				{message.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[var(--color-primary-hover)] align-middle" />}
			</div>
			{isUser && (
				<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]">
					<User size={15} />
				</div>
			)}
		</div>
	);
});
