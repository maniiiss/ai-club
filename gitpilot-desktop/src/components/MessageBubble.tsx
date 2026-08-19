/**
 * 单条消息渲染。
 *
 * - user：右对齐，浅灰背景配深色文字；附件（图片缩略图 / 文档 chip）渲染在文本上方
 * - assistant：左对齐，无外框直接渲染 Markdown
 * - tool：灰色卡片（委托 CodeCard）
 * - system/error：居中提示
 */
import { Fragment, memo, useState, type ReactNode } from 'react';
import { Bug, Check, ClipboardList, Copy, FileText, Image as ImageIcon, Pencil } from 'lucide-react';
import { CodeCard } from './CodeCard';
import { ExecutionBatch } from './ExecutionActivity';
import { ChangedFilesCard } from './ChangedFilesCard';
import { PlanCard } from './PlanCard';
import { CommandIcon, formatCommandLabel } from './CommandTokenNode';
import type { UIMessage } from '@/src/store/session';
import { cn } from '@/src/lib/utils';
import { copyText } from '@/src/lib/clipboard';
import { useWorkbenchStore } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
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
					<Hint key={`${a.name}-${idx}`} content={a.name}><img src={a.previewUrl} alt={a.name} className={styles.attachmentThumb} /></Hint>
				) : (
					<Hint key={`${a.name}-${idx}`} content={a.name}><span className={styles.attachmentChip}>
						{a.kind === 'image' ? <ImageIcon size={12} /> : a.kind === 'work-item' ? (a.workItemType === '缺陷' ? <Bug size={12} /> : <ClipboardList size={12} />) : <FileText size={12} />}
						{a.name}
					</span></Hint>
				),
			)}
		</div>
	);
}

/** 用户命令与需求标题保持正文尺寸，仅用主题色细边框标识，避免变成大号标签。 */
function renderHighlightedUserText(text: string) {
	return text.split('\n').map((line, index, lines) => {
		const requirement = line.match(/^(#\s+\[[^\]]+\]\s+)(.+)$/);
		const slash = line.match(/^(\/[^\s]+)(.*)$/);
		let content: ReactNode = line;
		if (requirement) content = <>{requirement[1]}<mark className={styles.highlightToken}>{requirement[2]}</mark></>;
		else if (slash) {
			const commandName = slash[1].slice(1);
			content = <><mark className={styles.highlightToken}><CommandIcon name={commandName} /><span>{formatCommandLabel(commandName)}</span></mark>{slash[2]}</>;
		}
		return <Fragment key={`${index}-${line}`}>{content}{index < lines.length - 1 ? '\n' : ''}</Fragment>;
	});
}

/** 用户消息操作栏：复制保留当前问题文本，编辑只预填输入框，不自动重发。 */
function UserMessageActions({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const copyMessage = async () => {
		setCopied(await copyText(text));
	};

	const editMessage = () => {
		useWorkbenchStore.getState().setComposerPrefill(text);
	};

	return (
		<div className={styles.messageActions}>
			<Hint content={copied ? '已复制' : '复制'}>
				<Button type="button" variant="ghost" size="icon-sm" className={styles.messageAction} onClick={() => void copyMessage()} aria-label={copied ? '已复制问题' : '复制问题'}>
					{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
				</Button>
			</Hint>
			<Hint content="编辑">
				<Button type="button" variant="ghost" size="icon-sm" className={styles.messageAction} onClick={editMessage} aria-label="编辑问题">
					<Pencil size={14} aria-hidden="true" />
				</Button>
			</Hint>
		</div>
	);
}

export const MessageBubble = memo(function MessageBubble({ message }: { message: UIMessage }) {
	if (message.kind === 'changed_files' && message.changedFiles && message.changedFiles.length > 0) {
		return <ChangedFilesCard files={message.changedFiles} />;
	}

	if (message.kind === 'execution') {
		return message.executionSteps?.length ? (
			<ExecutionBatch
				steps={message.executionSteps}
				thinking={message.meta?.thinking as string | undefined}
			/>
		) : null;
	}

	if (message.kind === 'plan') return <PlanCard message={message} />;

	if (message.kind === 'error' && message.role === 'assistant') {
		return (
			<div className={styles.error}>
				<span className={styles.errorIcon} aria-hidden="true">⚠</span>
				<span>{message.text}</span>
			</div>
		);
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
	const bubble = (
		<div className={cn(styles.bubble, isUser ? styles.userBubble : styles.assistantBubble)}>
				{isUser && guidanceMode && (
					<div className={styles.guidanceMeta}>
						<span className={styles.guidanceMode}>{guidanceLabel}</span>
						{guidanceStatusLabel && <span>{guidanceStatusLabel}</span>}
					</div>
				)}
				{isUser && message.attachments && message.attachments.length > 0 && (
					<AttachmentRow attachments={message.attachments} />
				)}
				{isUser && message.skills && message.skills.length > 0 && (
					<div className={styles.attachments} aria-label="已使用技能">
						{message.skills.map((skill) => <Hint key={skill} content={`技能 · ${skill}`}><span className={styles.attachmentChip}>✣ Skill:{skill}</span></Hint>)}
					</div>
				)}
				{isUser ? (
					<span className={styles.userText}>{renderHighlightedUserText(message.text)}</span>
				) : (
					<CodeCard message={message} />
				)}
				{/* 没有可见正文时由执行状态展示“正在思考”，不单独留下孤立光标。 */}
				{message.streaming && message.text.trim() && <span className={styles.streaming} />}
		</div>
	);
	return (
		<div className={`${styles.message} ${ROLE_ALIGN[message.role]}`}>
			{isUser ? (
				<div className={styles.userMessageGroup}>
					{bubble}
					<UserMessageActions text={message.text} />
				</div>
			) : bubble}
		</div>
	);
});
