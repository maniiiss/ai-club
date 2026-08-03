/**
 * 对话主区。
 *
 * 渲染累积的 UI 消息列表，自动滚动到底部。
 * 流式时保留底部跟随；用户上滚查看历史时不强制跟随。
 */
import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { ExecutionActivity } from './ExecutionActivity';
import { ConversationTimeline } from './ConversationTimeline';
import styles from './ChatView.module.css';

const appIcon = new URL('../../app-icon.png', import.meta.url).href;

/** 触底时应以最后一段对话为当前节点，避免短尾消息落在视口基准线下而高亮上一轮。 */
export function isChatScrollAtBottom(scrollHeight: number, scrollTop: number, clientHeight: number) {
	return scrollHeight - scrollTop - clientHeight <= 24;
}

export function ChatView() {
	const messages = useSessionStore((s) => s.messages);
	const isStreaming = useSessionStore((s) => s.isStreaming);
	// 尚未交给 GitPilot 的引导只在输入框队列中展示；真正开始执行后回到主对话，避免两处重复。
	// 运行中隐藏尚未封口的执行批次（isFinal !== true），避免“总耗时”在任务未完成时提前出现。
	const conversationMessages = useMemo(() => messages.filter((message) => {
		if (isStreaming && message.kind === 'execution' && message.meta?.isFinal !== true) return false;
		if (!message.meta?.guidanceMode) return true;
		const status = message.meta.guidanceStatus;
		return status === 'applied' || status === 'failed';
	}), [messages, isStreaming]);
	// 运行中面板固定在当前回复（最近一条 user 消息）之后，不随输出内容下移。
	const lastUserIndex = useMemo(() => {
		for (let i = conversationMessages.length - 1; i >= 0; i--) {
			if (conversationMessages[i].role === 'user') return i;
		}
		return -1;
	}, [conversationMessages]);
	const isSessionLoading = useSessionStore((s) => s.isSessionLoading);
	const containerRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);
	const scrollingToBottom = useRef(false);
	const navigatingTimeline = useRef(false);
	const messageNodes = useRef(new Map<string, HTMLDivElement>());
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
	const [showScrollToBottom, setShowScrollToBottom] = useState(false);

	/** 根据滚动视口上三分之一处的消息更新当前时间轴节点。 */
	const updateTimelineFocus = useCallback(() => {
		const container = containerRef.current;
		if (!container || conversationMessages.length === 0) return;
		if (isChatScrollAtBottom(container.scrollHeight, container.scrollTop, container.clientHeight)) {
			const lastMessageId = conversationMessages.at(-1)!.id;
			setActiveMessageId((current) => current === lastMessageId ? current : lastMessageId);
			return;
		}
		const containerTop = container.getBoundingClientRect().top;
		const focusY = containerTop + Math.min(150, container.clientHeight * 0.34);
		let activeId = conversationMessages[0].id;
		for (const message of conversationMessages) {
			const node = messageNodes.current.get(message.id);
			if (!node) continue;
			if (node.getBoundingClientRect().top <= focusY) activeId = message.id;
			else break;
		}
		setActiveMessageId((current) => current === activeId ? current : activeId);
	}, [conversationMessages]);

	// 监听滚动，判断是否跟随底部
	const onScroll = () => {
		const el = containerRef.current;
		if (!el) return;
		if (navigatingTimeline.current) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
		stickToBottom.current = atBottom;
		if (!scrollingToBottom.current) setShowScrollToBottom(!atBottom);
		updateTimelineFocus();
	};

	const selectTimelineEntry = useCallback((id: string) => {
		const target = messageNodes.current.get(id);
		if (!target) return;
		stickToBottom.current = false;
		navigatingTimeline.current = true;
		target.scrollIntoView({ block: 'center' });
		setActiveMessageId(id);
		// scrollIntoView 为即时跳转，但 scroll 事件异步触发；
		// 短暂屏蔽 onScroll 与 updateTimelineFocus，防止 stickToBottom 被复位或高亮跳走。
		window.setTimeout(() => { navigatingTimeline.current = false; }, 200);
	}, []);

	/** 点击回到底部按钮：恢复底部跟随并平滑滚动到最新消息。 */
	const scrollToBottom = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		stickToBottom.current = true;
		setShowScrollToBottom(false);
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reducedMotion) {
			container.scrollTop = container.scrollHeight;
			updateTimelineFocus();
			return;
		}
		// 平滑滚动期间屏蔽 onScroll 对按钮显隐的控制，避免中途闪现
		scrollingToBottom.current = true;
		container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
		let done = false;
		const restore = () => {
			if (done) return;
			done = true;
			scrollingToBottom.current = false;
			const el = containerRef.current;
			if (!el) return;
			const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
			stickToBottom.current = atBottom;
			setShowScrollToBottom(!atBottom);
		};
		container.addEventListener('scrollend', restore, { once: true });
		window.setTimeout(restore, 800);
	}, [updateTimelineFocus]);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (container && stickToBottom.current) container.scrollTop = container.scrollHeight;
		if (!navigatingTimeline.current) updateTimelineFocus();
	}, [conversationMessages, isStreaming, updateTimelineFocus]);

	return (
		<div className={styles.surface}>
			{/* 业务意图：时间轴属于视口导航，不随正文滚动；点击节点仍通过 scrollIntoView 定位正文。 */}
			<div className={styles.timelineRail} aria-hidden={conversationMessages.length < 2}>
				<ConversationTimeline messages={conversationMessages} activeMessageId={activeMessageId} onSelect={selectTimelineEntry} />
			</div>
			<div ref={containerRef} onScroll={onScroll} className={styles.scroll}>
				<div className={styles.frame}>
					<div className={styles.content}>
					{isSessionLoading ? (
						<div className={styles.loadingState} role="status" aria-live="polite">
							<span className={styles.logoLoader} aria-hidden="true">
								<img src={appIcon} alt="" className={styles.loadingLogo} />
								<span className={styles.loadingHalo} />
							</span>
							<span>正在加载任务…</span>
						</div>
					) : conversationMessages.length === 0 ? (
						<div className={styles.empty}>
							<div className={styles.emptyIcon}>
								<Sparkles size={26} />
							</div>
							<div>
								<h2>GitPilot 桌面版</h2>
								<p>在当前仓库启动本地 Coding Agent，输入指令开始</p>
							</div>
						</div>
					) : (
							<div className={styles.messages}>
								{conversationMessages.map((m, i) => (
									<Fragment key={m.id}>
										<div ref={(node) => {
											if (node) messageNodes.current.set(m.id, node);
											else messageNodes.current.delete(m.id);
										}}>
											<MessageBubble message={m} />
										</div>
										{i === lastUserIndex && isStreaming && <ExecutionActivity isStreaming={isStreaming} />}
									</Fragment>
								))}
							</div>
					)}
					</div>
				</div>
			</div>
			{/* 不在底部时显示回到底部按钮，定位在输入框正上方 */}
			{showScrollToBottom && (
				<div className={styles.scrollBottomBar}>
					<Button type="button" variant="unstyled" size="icon" className={styles.scrollBottomBtn} onClick={scrollToBottom} aria-label="回到底部">
						<ChevronDown size={18} />
					</Button>
				</div>
			)}
		</div>
	);
}
