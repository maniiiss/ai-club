import { describe, expect, it, vi } from 'vitest';
import { RenderScheduler, type CanvasDirtyRect } from './render-scheduler';

describe('RenderScheduler', () => {
	it('合并同一帧内的多次失效并只调用一次 onFrame', () => {
		const callbacks: FrameRequestCallback[] = [];
		const onFrame = vi.fn();
		const scheduler = new RenderScheduler(onFrame, { requestFrame: (callback) => { callbacks.push(callback); return callbacks.length; }, cancelFrame: vi.fn() });
		const first: CanvasDirtyRect = { x: 0, y: 0, width: 10, height: 10 };
		scheduler.invalidate([first]);
		scheduler.invalidate([{ x: 10, y: 10, width: 5, height: 5 }]);
		expect(callbacks).toHaveLength(1);
		callbacks.shift()?.(0);
		expect(onFrame).toHaveBeenCalledTimes(1);
		expect(onFrame.mock.calls[0][0]).toHaveLength(2);
	});

	it('不可见时暂存失效，恢复后安排完整重绘', () => {
		const callbacks: FrameRequestCallback[] = [];
		const onFrame = vi.fn();
		const scheduler = new RenderScheduler(onFrame, { requestFrame: (callback) => { callbacks.push(callback); return callbacks.length; }, cancelFrame: vi.fn(), isVisible: () => false });
		scheduler.invalidate([{ x: 0, y: 0, width: 1, height: 1 }]);
		expect(callbacks).toHaveLength(0);
		scheduler.setVisible(true);
		expect(callbacks).toHaveLength(1);
		callbacks.shift()?.(0);
		expect(onFrame).toHaveBeenCalledWith(expect.any(Array));
	});

	it('超过脏矩形上限后退化为完整重绘', () => {
		const callbacks: FrameRequestCallback[] = [];
		const onFrame = vi.fn();
		const scheduler = new RenderScheduler(onFrame, { requestFrame: (callback) => { callbacks.push(callback); return callbacks.length; }, cancelFrame: vi.fn() });
		for (let index = 0; index < 65; index += 1) scheduler.invalidate([{ x: index, y: index, width: 1, height: 1 }]);
		callbacks.shift()?.(0);
		expect(onFrame).toHaveBeenCalledWith([]);
	});

	it('完整重绘标记不会被随后到达的局部脏矩形覆盖', () => {
		const callbacks: FrameRequestCallback[] = [];
		const onFrame = vi.fn();
		const scheduler = new RenderScheduler(onFrame, { requestFrame: (callback) => { callbacks.push(callback); return callbacks.length; }, cancelFrame: vi.fn() });

		scheduler.invalidate();
		scheduler.invalidate([{ x: 12, y: 18, width: 20, height: 10 }]);
		callbacks.shift()?.(0);

		expect(onFrame).toHaveBeenCalledWith([]);
	});
});
