/**
 * 对话主区。
 *
 * 渲染累积的 UI 消息列表，自动滚动到底部。
 * 流式时保留底部跟随；用户上滚查看历史时不强制跟随。
 */
import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { MessageBubble } from './MessageBubble';

export function ChatView() {
	const messages = useSessionStore((s) => s.messages);
	const isStreaming = useSessionStore((s) => s.isStreaming);
	const bottomRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);

	// 监听滚动，判断是否跟随底部
	const onScroll = () => {
		const el = containerRef.current;
		if (!el) return;
		stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
	};

	useEffect(() => {
		if (stickToBottom.current) {
			bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
		}
	}, [messages, isStreaming]);

	return (
		<div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-3xl px-6 py-6">
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
					<div className="space-y-4">
						{messages.map((m) => (
							<MessageBubble key={m.id} message={m} />
						))}
					</div>
				)}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
