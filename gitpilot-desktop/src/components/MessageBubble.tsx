/**
 * 单条消息渲染。
 *
 * - user：右对齐，浅灰背景配深色文字；附件（图片缩略图 / 文档 chip）渲染在文本上方
 * - assistant：左对齐，无外框直接渲染 Markdown
 * - tool：灰色卡片（委托 CodeCard）
 * - system/error：居中提示
 */
import { memo } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { CodeCard } from './CodeCard';
import { ExecutionBatch } from './ExecutionActivity';
import type { UIMessage } from '@/src/store/session';

const ROLE_ALIGN: Record<UIMessage['role'], string> = {
	user: 'justify-end',
	assistant: 'justify-start',
	tool: 'justify-start',
	system: 'justify-center',
};

/** 用户消息内的附件行：图片显示缩略图，文档/文本显示 chip。 */
function AttachmentRow({ attachments }: { attachments: NonNullable<UIMessage['attachments']> }) {
	return (
		<div className="chat-message__attachments">
			{attachments.map((a, idx) =>
				a.kind === 'image' && a.previewUrl ? (
					<img
						key={`${a.name}-${idx}`}
						src={a.previewUrl}
						alt={a.name}
						className="chat-message__attachment-thumb"
						title={a.name}
					/>
				) : (
					<span key={`${a.name}-${idx}`} className="chat-message__attachment-chip" title={a.name}>
						{a.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
						{a.name}
					</span>
				),
			)}
		</div>
	);
}

export const MessageBubble = memo(function MessageBubble({ message }: { message: UIMessage }) {
	if (message.kind === 'execution') {
		return message.executionSteps?.length ? <ExecutionBatch steps={message.executionSteps} /> : null;
	}

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
				{isUser && message.attachments && message.attachments.length > 0 && (
					<AttachmentRow attachments={message.attachments} />
				)}
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
