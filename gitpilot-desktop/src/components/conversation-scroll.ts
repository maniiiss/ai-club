/**
 * 对话新消息滚动的几何与动效策略。
 *
 * Code 和 Work 的消息数据来源不同，但发送后都需要把最新用户消息
 * 留在滚动视口上方安全区，因此将计算逻辑集中在这里避免两个工作台漂移。
 */

export const NEW_MESSAGE_TOP_OFFSET_PX = 72;

export type ConversationScrollBehavior = 'auto' | 'smooth';

export interface NewMessageAnchorInput {
	initialized: boolean;
	currentUserId: string | null;
	previousUserId: string | null;
	isSessionLoading?: boolean;
	wasSessionLoading?: boolean;
	sessionChanged?: boolean;
}

/** 只允许当前会话真正追加的用户消息触发上移动画。 */
export function shouldAnchorNewMessage({
	initialized,
	currentUserId,
	previousUserId,
	isSessionLoading = false,
	wasSessionLoading = false,
	sessionChanged = false,
}: NewMessageAnchorInput): boolean {
	return initialized
		&& !sessionChanged
		&& !isSessionLoading
		&& !wasSessionLoading
		&& currentUserId != null
		&& currentUserId !== previousUserId;
}

interface ScrollContainerLike {
	scrollTop: number;
	clientHeight: number;
	scrollHeight: number;
	getBoundingClientRect: () => { top: number };
	scrollTo: (options: { top: number; behavior: ConversationScrollBehavior }) => void;
}

interface MessageNodeLike {
	getBoundingClientRect: () => { top: number };
}

/** 计算消息顶部落在安全区后的滚动位置，并限制为非负值。 */
export function getMessageScrollTop(
	container: Pick<ScrollContainerLike, 'scrollTop' | 'clientHeight' | 'getBoundingClientRect'>,
	message: Pick<MessageNodeLike, 'getBoundingClientRect'>,
	offset = NEW_MESSAGE_TOP_OFFSET_PX,
): number {
	const containerTop = container.getBoundingClientRect().top;
	const messageTop = message.getBoundingClientRect().top;
	const safeOffset = Math.max(0, Math.min(offset, Math.max(0, container.clientHeight - 1)));
	return Math.max(0, container.scrollTop + messageTop - containerTop - safeOffset);
}

/** 计算为使消息到达安全区还需要追加的尾部滚动空间。 */
export function getAdditionalScrollTail(
	container: Pick<ScrollContainerLike, 'scrollTop' | 'clientHeight' | 'scrollHeight' | 'getBoundingClientRect'>,
	message: Pick<MessageNodeLike, 'getBoundingClientRect'>,
	offset = NEW_MESSAGE_TOP_OFFSET_PX,
): number {
	const targetTop = getMessageScrollTop(container, message, offset);
	const currentMaxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
	return Math.max(0, targetTop - currentMaxScrollTop);
}

/** 计算忽略人工尾部留白后的真实消息底部位置，避免跟随输出时把新问题一起卷走。 */
export function getLatestContentScrollTop(
	container: Pick<ScrollContainerLike, 'clientHeight' | 'scrollHeight'>,
	additionalTail = 0,
): number {
	return Math.max(0, container.scrollHeight - container.clientHeight - Math.max(0, additionalTail));
}

/** 输出跟随只允许向下推进，短回复时保留新问题的初始定位。 */
export function getConversationFollowScrollTop(
	container: Pick<ScrollContainerLike, 'clientHeight' | 'scrollHeight'>,
	additionalTail = 0,
	anchorTop = 0,
): number {
	return Math.max(anchorTop, getLatestContentScrollTop(container, additionalTail));
}

/** 根据系统动效偏好选择原生滚动行为；测试和非浏览器调用可显式传入偏好。 */
export function getConversationScrollBehavior(reducedMotion?: boolean): ConversationScrollBehavior {
	if (typeof reducedMotion === 'boolean') return reducedMotion ? 'auto' : 'smooth';
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth';
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** 将消息平滑移动到对话视口上方安全区。 */
export function scrollMessageToSafeZone(
	container: ScrollContainerLike,
	message: MessageNodeLike,
	options?: { offset?: number; reducedMotion?: boolean },
): number {
	const top = getMessageScrollTop(container, message, options?.offset);
	container.scrollTo({ top, behavior: getConversationScrollBehavior(options?.reducedMotion) });
	return top;
}
