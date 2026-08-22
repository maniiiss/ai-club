/** pointercancel、失焦和 Escape 共用的 transient 清理原因。 */
export type CanvasTransientCancelReason = 'pointercancel' | 'blur' | 'escape';

export interface CanvasTransientCancelActions {
	dragRef: { current: unknown };
	clearTransientPath: () => void;
	clearSelectionRect: () => void;
	resetDragOffset: () => void;
	setIsDragging: (value: boolean) => void;
	onTransientChange?: (transient: null) => void;
	onCancelled?: (reason: CanvasTransientCancelReason) => void;
}

/**
 * 丢弃尚未 pointerup 的几何预览。
 * 业务意图：系统接管指针、窗口失焦或用户主动取消时，不能将半截笔迹/变换
 * 写入 CanvasDesignDocument，也不能留下选择框或拖动状态。
 */
export function cancelCanvasTransientInteraction(reason: CanvasTransientCancelReason, actions: CanvasTransientCancelActions): void {
	actions.dragRef.current = null;
	actions.clearTransientPath();
	actions.clearSelectionRect();
	actions.resetDragOffset();
	actions.setIsDragging(false);
	actions.onTransientChange?.(null);
	actions.onCancelled?.(reason);
}
