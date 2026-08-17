import { describe, expect, it, vi } from 'vitest';
import { clampScrollTopToContainer, getAdditionalScrollTail, getConversationFollowScrollTop, getConversationScrollBehavior, getLatestContentScrollTop, getMessageScrollTop, scrollMessageToSafeZone, shouldAnchorNewMessage } from './conversation-scroll';

function createContainer(overrides: Partial<{ scrollTop: number; clientHeight: number }> = {}) {
	return {
		scrollTop: overrides.scrollTop ?? 400,
		clientHeight: overrides.clientHeight ?? 800,
		scrollHeight: 1600,
		getBoundingClientRect: () => ({ top: 100 }),
		scrollTo: vi.fn(),
	};
}

describe('对话新消息滚动工具', () => {
	it('将消息顶部定位到对话区上方 72px 安全区', () => {
		const container = createContainer();
		const message = { getBoundingClientRect: () => ({ top: 300 }) };

		expect(getMessageScrollTop(container, message)).toBe(528);
	});

	it('滚动目标不会小于零，并会限制过大的顶部偏移', () => {
		const container = createContainer({ scrollTop: 0, clientHeight: 40 });
		const message = { getBoundingClientRect: () => ({ top: 10 }) };

		expect(getMessageScrollTop(container, message, 72)).toBe(0);
	});

	it('内容不足以滚动到安全区时计算所需尾部留白', () => {
		const container = createContainer({ scrollTop: 0, clientHeight: 800 });
		container.scrollHeight = 900;
		const message = { getBoundingClientRect: () => ({ top: 700 }) };

		expect(getAdditionalScrollTail(container, message)).toBe(428);
	});

	it('跟随输出时忽略人工尾部留白，只滚到真实消息底部', () => {
		const container = createContainer({ scrollTop: 120, clientHeight: 800 });
		container.scrollHeight = 1800;

		expect(getLatestContentScrollTop(container, 420)).toBe(580);
		expect(getLatestContentScrollTop(container, 960)).toBe(40);
		expect(getConversationFollowScrollTop(container, 420, 640)).toBe(640);
		expect(getConversationFollowScrollTop(container, 420, 300)).toBe(580);
	});

	it('清理人工尾部后不会把滚动位置保留在已移除的空白区域', () => {
		const container = createContainer({ scrollTop: 1400, clientHeight: 800 });
		container.scrollHeight = 2100;

		expect(clampScrollTopToContainer(container.scrollTop, container.scrollHeight, container.clientHeight)).toBe(1300);
	});

	it('根据 reduced-motion 选择平滑或即时滚动', () => {
		expect(getConversationScrollBehavior(false)).toBe('smooth');
		expect(getConversationScrollBehavior(true)).toBe('auto');
	});

	it('初始恢复、会话切换和加载中的历史消息不会触发新消息定位', () => {
		expect(shouldAnchorNewMessage({ initialized: false, currentUserId: 'u1', previousUserId: null })).toBe(false);
		expect(shouldAnchorNewMessage({ initialized: true, currentUserId: 'u2', previousUserId: 'u1', sessionChanged: true })).toBe(false);
		expect(shouldAnchorNewMessage({ initialized: true, currentUserId: 'u2', previousUserId: null, wasSessionLoading: true })).toBe(false);
	});

	it('同一会话追加新的用户消息时才触发定位', () => {
		expect(shouldAnchorNewMessage({ initialized: true, currentUserId: 'u2', previousUserId: 'u1' })).toBe(true);
		expect(shouldAnchorNewMessage({ initialized: true, currentUserId: 'u1', previousUserId: 'u1' })).toBe(false);
	});

	it('定位消息时调用原生滚动并返回目标位置', () => {
		const container = createContainer();
		const message = { getBoundingClientRect: () => ({ top: 300 }) };

		expect(scrollMessageToSafeZone(container, message, { reducedMotion: false })).toBe(528);
		expect(container.scrollTo).toHaveBeenCalledWith({ top: 528, behavior: 'smooth' });
	});
});
