import { describe, expect, it, vi } from 'vitest';
import { cancelCanvasTransientInteraction, type CanvasTransientCancelReason } from './canvas-interaction';

describe('Canvas transient interaction', () => {
	it.each(['pointercancel', 'blur', 'escape'] as CanvasTransientCancelReason[])('在 %s 时统一丢弃未提交几何', (reason) => {
		const actions = {
			dragRef: { current: { pointerId: 1 } },
			clearTransientPath: vi.fn(),
			clearSelectionRect: vi.fn(),
			resetDragOffset: vi.fn(),
			setIsDragging: vi.fn(),
			onTransientChange: vi.fn(),
			onCancelled: vi.fn(),
		};

		cancelCanvasTransientInteraction(reason, actions);

		expect(actions.dragRef.current).toBeNull();
		expect(actions.clearTransientPath).toHaveBeenCalledOnce();
		expect(actions.clearSelectionRect).toHaveBeenCalledOnce();
		expect(actions.resetDragOffset).toHaveBeenCalledOnce();
		expect(actions.setIsDragging).toHaveBeenCalledWith(false);
		expect(actions.onTransientChange).toHaveBeenCalledWith(null);
		expect(actions.onCancelled).toHaveBeenCalledWith(reason);
	});
});
