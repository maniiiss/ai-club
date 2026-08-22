/**
 * 对话主区。
 *
 * 渲染累积的 UI 消息列表，自动滚动到底部。
 * 流式时保留底部跟随；用户上滚查看历史时不强制跟随。
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, Sparkle } from '@phosphor-icons/react';
import { useSessionStore, type UIMessage } from '@/src/store/session';
import { useWorkbenchStore, type ExecutionStep } from '@/src/store/workbench';
import { useReviewStore } from '@/src/store/review';
import type { ChangedFile } from '@/src/store/changed-files';
import { Button } from '@/src/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { ExecutionActivity, ExecutionTimer, type TraceItem } from './ExecutionActivity';
import { ConversationTimeline } from './ConversationTimeline';
import { getConversationFollowScrollTop, getConversationScrollBehavior, scrollMessageToSafeZone, shouldAnchorNewMessage } from './conversation-scroll';
import styles from './ChatView.module.css';

// 加载态与标题栏共用 Tauri 应用图标，避免引用不存在的根目录图片。
const appIcon = new URL('../../src-tauri/icons/icon.png', import.meta.url).href;

/** 触底时应以最后一段对话为当前节点，避免短尾消息落在视口基准线下而高亮上一轮。 */
export function isChatScrollAtBottom(scrollHeight: number, scrollTop: number, clientHeight: number) {
	return scrollHeight - scrollTop - clientHeight <= 24;
}

/**
 * 只过滤尚未真正进入 Agent 会话的本地引导消息。
 * 已归档执行批次即使任务仍在运行也必须保留，才能按“正文 → 工具 → 正文”的真实顺序展示。
 */
export function getConversationMessages(messages: UIMessage[]): UIMessage[] {
	return messages.filter((message) => {
		if (!message.meta?.guidanceMode) return true;
		const status = message.meta.guidanceStatus;
		return status === 'applied' || status === 'failed';
	});
}

/** 运行计时属于当前用户请求头部；思考和工具活动则跟随最新内容单独向下推进。 */
export function getLastUserMessageIndex(messages: UIMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].role === 'user') return index;
	}
	return -1;
}

/** 从 user 消息读取该轮已完成总耗时，兼容旧 execution 元数据作为迁移兜底。 */
export function getExecutionDurationForUser(messages: UIMessage[], userIndex: number): number | undefined {
	const direct = messages[userIndex]?.meta?.executionDurationMs;
	if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
	for (let index = userIndex + 1; index < messages.length; index += 1) {
		if (messages[index].role === 'user') break;
		const legacy = messages[index].meta?.durationMs;
		if (messages[index].kind === 'execution' && messages[index].meta?.isFinal === true && typeof legacy === 'number' && Number.isFinite(legacy)) return legacy;
	}
	return undefined;
}

export interface CollapsedExecutionDetails {
	durationMs: number;
	steps: ExecutionStep[];
	thinking?: string;
	changedFiles: ChangedFile[];
	progressTexts: string[];
	/** 按真实输出顺序交错的思考/步骤/正文/改动文件，用于展开总耗时后的执行过程回放。 */
	traceItems: TraceItem[];
}

/**
 * 运行中的当前段保留正文与 execution 的真实交错顺序；
 * 已完成段移除中间 execution 消息，并把全部步骤归并到对应 user 头部的总耗时详情中。
 */
export function buildConversationPresentation(messages: UIMessage[], retainedCompletedUserId?: string | null): {
	messages: UIMessage[];
	executionByUserId: Map<string, CollapsedExecutionDetails>;
	processMessageIdsByUserId: Map<string, Set<string>>;
} {
	const visibleMessages: UIMessage[] = [];
	const executionByUserId = new Map<string, CollapsedExecutionDetails>();
	const processMessageIdsByUserId = new Map<string, Set<string>>();
	let segment: UIMessage[] = [];
	let segmentStartIndex = -1;

	const flushSegment = () => {
		if (segment.length === 0) return;
		const user = segment[0]?.role === 'user' ? segment[0] : undefined;
		const durationMs = user && segmentStartIndex >= 0 ? getExecutionDurationForUser(messages, segmentStartIndex) : undefined;
		if (!user || durationMs == null) {
			visibleMessages.push(...segment);
			segment = [];
			return;
		}

		const stepsById = new Map<string, ExecutionStep>();
		const filesByPath = new Map<string, ChangedFile>();
		const assistantTexts = segment.filter((message) => message.role === 'assistant' && (message.kind === 'text' || message.kind === 'plan'));
		const finalAssistantTextId = assistantTexts.at(-1)?.id;
		const progressTexts: string[] = [];
		const traceItems: TraceItem[] = [];
		const processMessageIds = new Set<string>();
		let thinking: string | undefined;
		for (const message of segment) {
			if (message.role === 'assistant' && message.kind === 'text' && message.id !== finalAssistantTextId) {
				if (message.text.trim()) {
					progressTexts.push(message.text);
					traceItems.push({ type: 'text', text: message.text });
				}
				processMessageIds.add(message.id);
			}
			// workspace changed_files 是 sidecar 在 agent_settled 计算出的最终净 diff；
			// 它覆盖同一段中按工具中间结果推导的旧统计，避免聊天卡片出现两份或行数不一致。
			if (message.kind === 'changed_files') {
				processMessageIds.add(message.id);
				for (const file of message.changedFiles ?? []) filesByPath.set(file.path, file);
				continue;
			}
			if (message.kind !== 'execution') continue;
			processMessageIds.add(message.id);
			const msgThinking = typeof message.meta?.thinking === 'string' && message.meta.thinking.trim() ? message.meta.thinking : undefined;
			if (msgThinking) {
				thinking = msgThinking;
				traceItems.push({ type: 'thinking', text: msgThinking });
			}
			for (const step of message.executionSteps ?? []) {
				stepsById.set(step.id, step);
				if (step.kind !== 'complete') traceItems.push({ type: 'step', step });
			}
			for (const file of message.changedFiles ?? []) {
				const previous = filesByPath.get(file.path);
				filesByPath.set(file.path, previous ? {
					...file,
					added: previous.added + file.added,
					removed: previous.removed + file.removed,
					editCount: previous.editCount + file.editCount,
					editable: previous.editable || file.editable,
					diff: file.diff ?? previous.diff,
				} : file);
			}
		}
		executionByUserId.set(user.id, {
			durationMs,
			steps: [...stepsById.values()],
			thinking,
			changedFiles: [...filesByPath.values()],
			progressTexts,
			traceItems,
		});
		processMessageIdsByUserId.set(user.id, processMessageIds);
		const visibleSegment = user.id === retainedCompletedUserId
			? segment
			: segment.filter((message) => !processMessageIds.has(message.id));
		visibleMessages.push(...visibleSegment);
		// 文件结果必须位于最终正文/停止提示之后，只在本轮已收敛且非动画保留态时追加。
		if (user.id !== retainedCompletedUserId && filesByPath.size > 0) {
			visibleMessages.push({
				id: `changed-files-${user.id}`,
				role: 'assistant',
				text: '',
				kind: 'changed_files',
				changedFiles: [...filesByPath.values()],
			});
		}
		segment = [];
	};

	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		if (message.role === 'user') {
			flushSegment();
			segment = [message];
			segmentStartIndex = index;
		} else if (segment.length > 0) {
			segment.push(message);
		} else {
			visibleMessages.push(message);
		}
	}
	flushSegment();
	return { messages: visibleMessages, executionByUserId, processMessageIdsByUserId };
}

export function ChatView() {
	const messages = useSessionStore((s) => s.messages);
	const isStreaming = useSessionStore((s) => s.isStreaming);
	const selectedSessionPath = useSessionStore((s) => s.selectedSessionPath);
	// 尚未交给 GitPilot 的引导只在输入框队列中展示；真正开始执行后回到主对话，避免两处重复。
	const baseConversationMessages = useMemo(() => getConversationMessages(messages), [messages]);
	const baseLastUserIndex = useMemo(() => getLastUserMessageIndex(baseConversationMessages), [baseConversationMessages]);
	const baseLastUserId = baseLastUserIndex >= 0 ? baseConversationMessages[baseLastUserIndex].id : null;
	const previousStreaming = useRef(isStreaming);
	const [collapsingUserId, setCollapsingUserId] = useState<string | null>(null);
	const justCompletedUserId = previousStreaming.current && !isStreaming ? baseLastUserId : null;
	const retainedCompletedUserId = justCompletedUserId ?? collapsingUserId;
	const presentation = useMemo(
		() => buildConversationPresentation(baseConversationMessages, retainedCompletedUserId),
		[baseConversationMessages, retainedCompletedUserId],
	);
	const conversationMessages = presentation.messages;
	/**
	 * 右侧「审查」页签数据源：取最近一轮 changed_files 虚拟消息，与聊天卡片保持同源一致。
	 * 实时归档与历史回放都会经由 presentation 生成该消息，这里只做派生写入，不重复聚合。
	 */
	useEffect(() => {
		let latestFiles: ChangedFile[] | null = null;
		for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
			const message = conversationMessages[index];
			if (message.kind === 'changed_files' && message.changedFiles && message.changedFiles.length > 0) {
				latestFiles = message.changedFiles;
				break;
			}
		}
		useReviewStore.getState().setReviewFiles(selectedSessionPath ?? '__new__', latestFiles ?? []);
	}, [conversationMessages, selectedSessionPath]);
	const lastUserIndex = useMemo(() => getLastUserMessageIndex(conversationMessages), [conversationMessages]);
	const executionStartedAt = useWorkbenchStore((s) => s.execution.startedAt);
	const isSessionLoading = useSessionStore((s) => s.isSessionLoading);
	const containerRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);
	const scrollingToBottom = useRef(false);
	const scrollingToNewMessage = useRef(false);
	const navigatingTimeline = useRef(false);
	const scrollMode = useRef<'bottom' | 'positioning' | 'following' | 'manual'>('bottom');
	const previousSessionPath = useRef<string | null>(selectedSessionPath);
	const previousSessionLoading = useRef(isSessionLoading);
	const previousUserId = useRef<string | null>(baseLastUserId);
	const initializedScrollSession = useRef(false);
	const newMessageTimer = useRef<number | null>(null);
	const newMessageAnchorTop = useRef(0);
	const messageNodes = useRef(new Map<string, HTMLDivElement>());
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
	const [showScrollToBottom, setShowScrollToBottom] = useState(false);
	const [newMessageId, setNewMessageId] = useState<string | null>(null);
	const conversationMessagesRef = useRef(conversationMessages);
	const streamingStateRef = useRef(isStreaming);
	conversationMessagesRef.current = conversationMessages;
	streamingStateRef.current = isStreaming;

	// 完成瞬间先保留本轮中间正文和工具批次 320ms 执行收起动画，再从主正文流移除。
	useLayoutEffect(() => {
		const wasStreaming = previousStreaming.current;
		previousStreaming.current = isStreaming;
		if (isStreaming) {
			setCollapsingUserId(null);
			return;
		}
		if (!wasStreaming || !baseLastUserId) return;
		setCollapsingUserId(baseLastUserId);
		const timer = window.setTimeout(() => setCollapsingUserId(null), 320);
		return () => window.clearTimeout(timer);
	}, [baseLastUserId, isStreaming]);

	/**
	 * 新用户消息只在当前会话中真正追加时触发定位；恢复会话或切换会话时只同步基线，
	 * 避免打开历史记录时突然把视口拉到某条旧消息。定位阶段结束后，首段助手输出出现即恢复底部跟随。
	 */
	useLayoutEffect(() => {
		const wasSessionLoading = previousSessionLoading.current;
		previousSessionLoading.current = isSessionLoading;
		if (previousSessionPath.current !== selectedSessionPath) {
			previousSessionPath.current = selectedSessionPath;
			previousUserId.current = baseLastUserId;
			initializedScrollSession.current = true;
			scrollMode.current = 'bottom';
			stickToBottom.current = true;
			scrollingToNewMessage.current = false;
			newMessageAnchorTop.current = 0;
			setNewMessageId(null);
			if (newMessageTimer.current != null) window.clearTimeout(newMessageTimer.current);
			return;
		}
		if (!initializedScrollSession.current) {
			initializedScrollSession.current = true;
			previousUserId.current = baseLastUserId;
			return;
		}
		const previousId = previousUserId.current;
		previousUserId.current = baseLastUserId;
		if (!baseLastUserId || !shouldAnchorNewMessage({ initialized: initializedScrollSession.current, currentUserId: baseLastUserId, previousUserId: previousId, isSessionLoading, wasSessionLoading })) return;

		const container = containerRef.current;
		const message = messageNodes.current.get(baseLastUserId);
		if (!container || !message) return;
		scrollMode.current = 'positioning';
		stickToBottom.current = false;
		setShowScrollToBottom(false);
		// 新一轮发送只做一次消息定位，不再为定位扩大滚动容器的物理底部。
		newMessageAnchorTop.current = 0;
		setNewMessageId(baseLastUserId);
		if (newMessageTimer.current != null) window.clearTimeout(newMessageTimer.current);

		// 等待新消息进入布局后，再开始平滑定位。
		let removeScrollEndListener: (() => void) | undefined;
		const frame = window.requestAnimationFrame(() => {
			const currentContainer = containerRef.current;
			const currentMessage = messageNodes.current.get(baseLastUserId);
			if (!currentContainer || !currentMessage) return;
			const reducedMotion = getConversationScrollBehavior() === 'auto';
			scrollingToNewMessage.current = !reducedMotion;
			newMessageAnchorTop.current = scrollMessageToSafeZone(currentContainer, currentMessage, { reducedMotion });
			let finished = false;
			const finish = () => {
				if (finished) return;
				finished = true;
				scrollingToNewMessage.current = false;
				const latestMessages = conversationMessagesRef.current;
				const latestIndex = latestMessages.findIndex((item) => item.id === baseLastUserId);
				const replyStarted = latestIndex >= 0 && latestMessages.slice(latestIndex + 1).some((item) => item.role === 'assistant');
				if (replyStarted) {
					scrollMode.current = 'following';
					currentContainer.scrollTop = getConversationFollowScrollTop(currentContainer, 0, newMessageAnchorTop.current);
					setShowScrollToBottom(false);
				} else if (streamingStateRef.current) {
					// 助手尚未输出正文时继续保持定位态，首段 execution/text 到达后再跟随底部。
					scrollMode.current = 'positioning';
					setShowScrollToBottom(false);
				} else {
					scrollMode.current = 'manual';
					setShowScrollToBottom(true);
				}
			};
			if (reducedMotion) {
				finish();
				return;
			}
			currentContainer.addEventListener('scrollend', finish, { once: true });
			removeScrollEndListener = () => currentContainer.removeEventListener('scrollend', finish);
			newMessageTimer.current = window.setTimeout(finish, 520);
		});

		return () => {
			window.cancelAnimationFrame(frame);
			removeScrollEndListener?.();
			scrollingToNewMessage.current = false;
			if (newMessageTimer.current != null) window.clearTimeout(newMessageTimer.current);
		};
	}, [baseLastUserId, isSessionLoading, selectedSessionPath]);

	// 平滑定位期间如果首段助手正文已经出现，直接切换为“跟随最新输出”，避免等待动画计时器。
	useLayoutEffect(() => {
		if (!newMessageId || scrollMode.current !== 'positioning' || scrollingToNewMessage.current) return;
		const container = containerRef.current;
		const latestIndex = conversationMessages.findIndex((item) => item.id === newMessageId);
		const replyStarted = latestIndex >= 0 && conversationMessages.slice(latestIndex + 1).some((item) => item.role === 'assistant');
		if (!container) return;
		if (!isStreaming && !replyStarted) {
			scrollMode.current = 'manual';
			setShowScrollToBottom(true);
			return;
		}
		if (!replyStarted) return;
		scrollMode.current = 'following';
		container.scrollTop = getConversationFollowScrollTop(container, 0, newMessageAnchorTop.current);
		setShowScrollToBottom(false);
	}, [conversationMessages, isStreaming, newMessageId]);

	/** 根据滚动视口上三分之一处的消息更新当前时间轴节点。 */
	const updateTimelineFocus = useCallback(() => {
		const container = containerRef.current;
		if (!container || conversationMessages.length === 0) return;
		const atLatest = isChatScrollAtBottom(container.scrollHeight, container.scrollTop, container.clientHeight);
		if (atLatest) {
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
		if (scrollingToNewMessage.current) return;
		// 执行中也以滚动容器的真实物理底部为最新位置；输入框的基础占位仍由 CSS 保留，
		// 但不再把发送阶段的人工尾部当成不可滚动区域，也不在用户拖动时回写 scrollTop。
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
		stickToBottom.current = atBottom;
		if (atBottom && isStreaming) {
			// 用户从历史位置重新拖回真实底部后，恢复流式跟随。
			scrollMode.current = 'following';
		} else if (!atBottom && (scrollMode.current === 'following' || scrollMode.current === 'positioning')) {
			scrollMode.current = 'manual';
		}
		if (!scrollingToBottom.current) setShowScrollToBottom(!atBottom);
		updateTimelineFocus();
	};

	const selectTimelineEntry = useCallback((id: string) => {
		const target = messageNodes.current.get(id);
		if (!target) return;
		stickToBottom.current = false;
		scrollMode.current = 'manual';
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
		scrollMode.current = 'bottom';
		setShowScrollToBottom(false);
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reducedMotion) {
			container.scrollTop = container.scrollHeight;
			updateTimelineFocus();
			return;
		}
		// 平滑滚动期间屏蔽 onScroll 对按钮显隐的控制，避免中途闪现
		scrollingToBottom.current = true;
		const latestTop = container.scrollHeight;
		container.scrollTo({ top: latestTop, behavior: 'smooth' });
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
		if (container && scrollMode.current === 'bottom' && stickToBottom.current) {
			container.scrollTop = container.scrollHeight;
		} else if (container && scrollMode.current === 'following' && isStreaming) {
			container.scrollTop = getConversationFollowScrollTop(container, 0, newMessageAnchorTop.current);
		}
		if (!navigatingTimeline.current) updateTimelineFocus();
	}, [conversationMessages, isStreaming, updateTimelineFocus]);

	/** 回复结束后清理本轮新消息标记；输入框基础占位始终由 CSS 保留。 */
	useLayoutEffect(() => {
		if (!newMessageId || isStreaming || retainedCompletedUserId) return;
		newMessageAnchorTop.current = 0;
		setNewMessageId(null);
	}, [isStreaming, newMessageId, retainedCompletedUserId]);

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
								<Sparkle weight="regular" size={26} />
							</div>
							<div>
								<h2>GitPilot 桌面版</h2>
								<p>在当前仓库启动 GitPilot，输入指令开始</p>
							</div>
						</div>
					) : (
							<div className={styles.messages}>
								{conversationMessages.map((m, index) => {
									const details = m.role === 'user' ? presentation.executionByUserId.get(m.id) : undefined;
									const isCollapsingMessage = retainedCompletedUserId != null
										&& presentation.processMessageIdsByUserId.get(retainedCompletedUserId)?.has(m.id) === true;
									return <Fragment key={m.id}>
										<div className={`${styles.messageSlot} ${isCollapsingMessage ? styles.collapsingMessage : ''} ${newMessageId === m.id ? styles.newMessageSlot : ''}`} ref={(node) => {
											if (node) messageNodes.current.set(m.id, node);
											else messageNodes.current.delete(m.id);
										}}>
											<div className={styles.messageSlotInner}><MessageBubble message={m} /></div>
										</div>
										{m.role === 'user' && (
												<ExecutionTimer
													isRunning={index === lastUserIndex && isStreaming}
													startedAt={index === lastUserIndex ? executionStartedAt : undefined}
													durationMs={details?.durationMs}
													items={details?.traceItems ?? []}
													isCollapsing={retainedCompletedUserId === m.id}
												/>
										)}
									</Fragment>;
								})}
								{/* 只有当前思考/工具活动跟在最新内容之后；运行计时仍固定在本次回复起点。 */}
								{isStreaming && <ExecutionActivity isStreaming={isStreaming} />}
							</div>
					)}
					</div>
				</div>
			</div>
			{/* 不在底部时显示回到底部按钮，定位在输入框正上方 */}
			{showScrollToBottom && (
				<div className={styles.scrollBottomBar}>
					<Button type="button" variant="unstyled" size="icon" className={styles.scrollBottomBtn} onClick={scrollToBottom} aria-label="回到底部">
						<CaretDown weight="bold" size={18} />
					</Button>
				</div>
			)}
		</div>
	);
}
