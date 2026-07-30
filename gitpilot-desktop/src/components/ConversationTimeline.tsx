/** 聊天区左侧缩略时间轴：用消息摘要表示整段会话，并支持跳转到对应正文。 */
import type { UIMessage } from '@/src/store/session';

const MAX_VISIBLE_ENTRIES = 20;

export interface ConversationTimelineEntry {
	id: string;
	messageIndex: number;
	label: string;
}

/**
 * 时间轴只记录用户的提问。长会话均匀抽样展示有限节点，防止时间轴本身挤满可读空间。
 */
export function buildConversationTimelineEntries(messages: UIMessage[], maxEntries = MAX_VISIBLE_ENTRIES): ConversationTimelineEntry[] {
	const questionIndexes = messages.reduce<number[]>((indexes, message, messageIndex) => {
		if (message.role === 'user') indexes.push(messageIndex);
		return indexes;
	}, []);
	if (questionIndexes.length === 0 || maxEntries <= 0) return [];
	const visibleCount = Math.min(questionIndexes.length, maxEntries);
	const indexes = visibleCount === questionIndexes.length
		? questionIndexes
		: Array.from({ length: visibleCount }, (_, index) => questionIndexes[Math.round(index * (questionIndexes.length - 1) / (visibleCount - 1))]);

	return indexes.map((messageIndex) => {
		const message = messages[messageIndex];
		return { id: message.id, messageIndex, label: '用户提问' };
	});
}

/** 悬停预览优先展示真实正文；工具摘要等无正文节点使用其语义标签兜底。 */
export function getConversationTimelinePreview(messages: UIMessage[], entry: ConversationTimelineEntry): string {
	return messages[entry.messageIndex]?.text.trim() || entry.label;
}

interface ConversationTimelineProps {
	messages: UIMessage[];
	activeMessageId: string | null;
	onSelect: (id: string) => void;
}

export function ConversationTimeline({ messages, activeMessageId, onSelect }: ConversationTimelineProps) {
	const entries = buildConversationTimelineEntries(messages);
	if (entries.length < 2) return null;
	const activeMessageIndex = messages.findIndex((message) => message.id === activeMessageId);
	const closestActiveEntry = entries.reduce((closest, entry) => (
		Math.abs(entry.messageIndex - activeMessageIndex) < Math.abs(closest.messageIndex - activeMessageIndex) ? entry : closest
	), entries.at(-1)!);

	return (
		<nav className="conversation-timeline" aria-label="会话时间轴">
			<div className="conversation-timeline__track">
				{entries.map((entry) => {
					const active = entry.id === closestActiveEntry.id;
					const previewText = getConversationTimelinePreview(messages, entry);
					return (
						<div key={entry.id} className="conversation-timeline__entry">
							<button
								type="button"
								className={active ? 'is-active' : ''}
								onClick={() => onSelect(entry.id)}
								aria-label={`跳转到第 ${entry.messageIndex + 1} 段${entry.label}`}
							/>
							<div className="conversation-timeline__preview" role="tooltip" aria-hidden="true">
								<span>第 {entry.messageIndex + 1} 段 · {entry.label}</span>
								<p>{previewText}</p>
							</div>
						</div>
					);
				})}
			</div>
		</nav>
	);
}
