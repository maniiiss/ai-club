export interface CanvasDirtyRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface RenderSchedulerOptions {
	requestFrame?: (callback: FrameRequestCallback) => number;
	cancelFrame?: (handle: number) => void;
	isVisible?: () => boolean;
}

/**
 * 将高频 Design 事件合并到浏览器帧边界。
 * 业务意图：patch、pointermove 和资源完成事件不能在 React render 阶段同步触发
 * CanvasKit 绘制；一帧只允许一次场景提交，避免事件突发造成 flush 风暴。
 */
export class RenderScheduler {
	private frame: number | null = null;
	private dirty = false;
	private paused = false;
	private disposed = false;
	private visibilityOverride: boolean | null = null;
	private dirtyRects: CanvasDirtyRect[] = [];
	/** 空数组表示完整重绘；单独记录该状态，避免后续局部失效覆盖它。 */
	private fullRedraw = false;
	private readonly requestFrame: (callback: FrameRequestCallback) => number;
	private readonly cancelFrame: (handle: number) => void;
	private readonly isVisible: () => boolean;

	constructor(
		private readonly onFrame: (dirtyRects: CanvasDirtyRect[]) => void,
		options: RenderSchedulerOptions = {},
	) {
		this.requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback));
		this.cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
		this.isVisible = options.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
	}

	/** 标记一组 page-local 脏矩形；空数组代表需要一次完整重绘。 */
	invalidate(rects: CanvasDirtyRect[] = []): void {
		if (this.disposed) return;
		this.dirty = true;
		if (rects.length === 0) {
			this.fullRedraw = true;
			this.dirtyRects = [];
		} else if (this.fullRedraw) {
			// 已经要求完整重绘，合并进来的局部矩形无需保留。
		} else if (this.dirtyRects.length > 0) {
			this.dirtyRects.push(...rects);
			if (this.dirtyRects.length > 64) {
				this.fullRedraw = true;
				this.dirtyRects = [];
			}
		} else if (this.dirtyRects.length === 0 && this.dirty) {
			this.dirtyRects.push(...rects);
		}
		this.schedule();
	}

	/** 窗口最小化/不可见时暂停非必要帧；恢复时自动安排一次完整重绘。 */
	setPaused(paused: boolean): void {
		if (this.disposed) return;
		if (this.paused === paused) {
			if (!paused) this.schedule();
			return;
		}
		this.paused = paused;
		if (paused && this.frame !== null) {
			this.cancelFrame(this.frame);
			this.frame = null;
		}
		if (!paused) this.schedule();
	}

	/** 供 visibilitychange 或测试直接触发恢复。 */
	setVisible(visible: boolean): void {
		this.visibilityOverride = visible;
		this.setPaused(!visible);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.frame !== null) this.cancelFrame(this.frame);
		this.frame = null;
		this.dirty = false;
		this.fullRedraw = false;
		this.dirtyRects = [];
	}

	private schedule(): void {
		if (this.disposed || this.paused || !this.dirty || !(this.visibilityOverride ?? this.isVisible()) || this.frame !== null) return;
		this.frame = this.requestFrame(() => {
			this.frame = null;
			if (this.disposed || this.paused || !this.dirty) return;
			this.dirty = false;
			const rects = this.fullRedraw ? [] : this.dirtyRects.splice(0);
			this.fullRedraw = false;
			this.onFrame(rects);
			if (this.dirty) this.schedule();
		});
	}
}
