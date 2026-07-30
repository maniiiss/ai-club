/**
 * 对话主区。
 *
 * 渲染累积的 UI 消息列表，自动滚动到底部。
 * 流式时保留底部跟随；用户上滚查看历史时不强制跟随。
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { MessageBubble } from './MessageBubble';
import { ExecutionActivity } from './ExecutionActivity';
import { ConversationTimeline } from './ConversationTimeline';

/** 触底时应以最后一段对话为当前节点，避免短尾消息落在视口基准线下而高亮上一轮。 */
export function isChatScrollAtBottom(scrollHeight: number, scrollTop: number, clientHeight: number) {
	return scrollHeight - scrollTop - clientHeight <= 24;
}

export function ChatView() {
	const messages = useSessionStore((s) => s.messages);
	const isStreaming = useSessionStore((s) => s.isStreaming);
	const containerRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);
	const messageNodes = useRef(new Map<string, HTMLDivElement>());
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

	/** 根据滚动视口上三分之一处的消息更新当前时间轴节点。 */
	const updateTimelineFocus = useCallback(() => {
		const container = containerRef.current;
		if (!container || messages.length === 0) return;
		if (isChatScrollAtBottom(container.scrollHeight, container.scrollTop, container.clientHeight)) {
			const lastMessageId = messages.at(-1)!.id;
			setActiveMessageId((current) => current === lastMessageId ? current : lastMessageId);
			return;
		}
		const containerTop = container.getBoundingClientRect().top;
		const focusY = containerTop + Math.min(150, container.clientHeight * 0.34);
		let activeId = messages[0].id;
		for (const message of messages) {
			const node = messageNodes.current.get(message.id);
			if (!node) continue;
			if (node.getBoundingClientRect().top <= focusY) activeId = message.id;
			else break;
		}
		setActiveMessageId((current) => current === activeId ? current : activeId);
	}, [messages]);

	// 监听滚动，判断是否跟随底部
	const onScroll = () => {
		const el = containerRef.current;
		if (!el) return;
		stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
		updateTimelineFocus();
	};

	const selectTimelineEntry = useCallback((id: string) => {
		const target = messageNodes.current.get(id);
		if (!target) return;
		stickToBottom.current = false;
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		target.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
		setActiveMessageId(id);
	}, []);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (container && stickToBottom.current) container.scrollTop = container.scrollHeight;
		updateTimelineFocus();
	}, [messages, isStreaming, updateTimelineFocus]);

	return (
		<div ref={containerRef} onScroll={onScroll} className="chat-scroll flex-1 overflow-y-auto">
			<div className="chat-view-frame">
				<ConversationTimeline messages={messages} activeMessageId={activeMessageId} onSelect={selectTimelineEntry} />
				<div className="chat-view-content mx-auto w-full min-w-0 max-w-[900px] px-6 py-6">
				{messages.length === 0 ? (
					<div className="mt-24 flex flex-col items-center gap-4 text-center">
						<div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-primary-muted)] text-[var(--color-primary-hover)]">
							<Sparkles size={26} />
						</div>
						<div>
							<h2 className="text-lg font-medium text-[var(--color-text)]">GitPilot 桌面版</h2>
							<p className="mt-1 text-sm text-[var(--color-text-muted)]">在当前仓库启动本地 Coding Agent，输入指令开始</p>
						</div>
					</div>
				) : (
					<div className="space-y-5">
						{messages.map((m) => (
							<div key={m.id} ref={(node) => {
								if (node) messageNodes.current.set(m.id, node);
								else messageNodes.current.delete(m.id);
							}}>
								<MessageBubble message={m} />
							</div>
						))}
						<ExecutionActivity isStreaming={isStreaming} />
					</div>
				)}
				</div>
			</div>
		</div>
	);
}
