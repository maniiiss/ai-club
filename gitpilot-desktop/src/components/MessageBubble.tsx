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
import { ChangedFilesCard } from './ChangedFilesCard';
import type { UIMessage } from '@/src/store/session';
import { cn } from '@/src/lib/utils';
import styles from './MessageBubble.module.css';

const ROLE_ALIGN: Record<UIMessage['role'], string> = {
	user: styles.userAlign,
	assistant: styles.assistantAlign,
	tool: styles.assistantAlign,
	system: styles.systemAlign,
};

/** 用户消息内的附件行：图片显示缩略图，文档/文本显示 chip。 */
function AttachmentRow({ attachments }: { attachments: NonNullable<UIMessage['attachments']> }) {
	return (
		<div className={styles.attachments}>
			{attachments.map((a, idx) =>
				a.kind === 'image' && a.previewUrl ? (
					<img
						key={`${a.name}-${idx}`}
						src={a.previewUrl}
						alt={a.name}
						className={styles.attachmentThumb}
						title={a.name}
					/>
				) : (
					<span key={`${a.name}-${idx}`} className={styles.attachmentChip} title={a.name}>
						{a.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
						{a.name}
					</span>
				),
			)}
		</div>
	);
}

export const MessageBubble = memo(function MessageBubble({ message }: { message: UIMessage }) {
	if (message.kind === 'changed_files' && message.changedFiles && message.changedFiles.length > 0) {
		return <ChangedFilesCard files={message.changedFiles} />;
	}

	if (message.kind === 'execution') {
		return message.executionSteps?.length ? <ExecutionBatch steps={message.executionSteps} /> : null;
	}

	if (message.role === 'tool') {
		return (
			<div className={styles.tool}>
				<CodeCard message={message} />
			</div>
		);
	}

	if (message.role === 'system') {
		return (
			<div className={styles.system}>
				<span>{message.text}</span>
			</div>
		);
	}

	const isUser = message.role === 'user';
	const guidanceMode = message.meta?.guidanceMode === 'steer' || message.meta?.guidanceMode === 'followUp'
		? message.meta.guidanceMode
		: null;
	const guidanceStatus = typeof message.meta?.guidanceStatus === 'string' ? message.meta.guidanceStatus : null;
	const guidanceLabel = guidanceMode === 'steer' ? '引导' : '完成后追加';
	const guidanceStatusLabel = guidanceStatus === 'submitting' ? '提交中' : guidanceStatus === 'queued' ? '等待执行' : guidanceStatus === 'applying' ? '正在应用' : guidanceStatus === 'applied' ? '已交给 GitPilot' : guidanceStatus === 'cancelled' ? '已取消' : guidanceStatus === 'failed' ? '发送失败' : null;
	return (
		<div className={`${styles.message} ${ROLE_ALIGN[message.role]}`}>
			<div
				className={cn(styles.bubble, isUser ? styles.userBubble : styles.assistantBubble)}
			>
				{isUser && guidanceMode && (
					<div className={styles.guidanceMeta}>
						<span className={styles.guidanceMode}>{guidanceLabel}</span>
						{guidanceStatusLabel && <span>{guidanceStatusLabel}</span>}
					</div>
				)}
				{isUser && message.attachments && message.attachments.length > 0 && (
					<AttachmentRow attachments={message.attachments} />
				)}
				{isUser ? (
					<span className={styles.userText}>{message.text}</span>
				) : (
					<CodeCard message={message} />
				)}
				{message.streaming && <span className={styles.streaming} />}
			</div>
		</div>
	);
});
