import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/src/lib/utils';

export interface ScrollAreaProps extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
	/** 将 Radix 默认的 table 内容包装器约束为当前面板宽度，适合侧栏等不可横向溢出的列表。 */
	fitContent?: boolean;
}

export const ScrollArea = React.forwardRef<React.ElementRef<typeof ScrollAreaPrimitive.Root>, ScrollAreaProps>(({ className, children, fitContent = false, ...props }, ref) => {
	const rootRef = React.useRef<HTMLDivElement>(null);
	const setRefs = React.useCallback((node: HTMLDivElement | null) => {
		rootRef.current = node;
		if (typeof ref === 'function') ref(node);
		else if (ref) ref.current = node;
	}, [ref]);

	React.useLayoutEffect(() => {
		if (!fitContent) return;
		const content = rootRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport] > div');
		if (!content) return;
		// Radix 默认使用 display:table 计算内容宽度；侧栏列表需要跟随面板收缩，而不是被长文本撑开。
		content.style.display = 'block';
		content.style.width = '100%';
		content.style.minWidth = '0';
	}, [children, fitContent]);

	return <ScrollAreaPrimitive.Root ref={setRefs} className={cn('relative overflow-hidden', className)} {...props}><ScrollAreaPrimitive.Viewport className="size-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport><ScrollBar /></ScrollAreaPrimitive.Root>;
});
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export const ScrollBar = React.forwardRef<React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>, React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>>(({ className, orientation = 'vertical', ...props }, ref) => <ScrollAreaPrimitive.ScrollAreaScrollbar ref={ref} orientation={orientation} className={cn('flex touch-none select-none transition-colors', orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px', orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px', className)} {...props}><ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-[var(--border-strong)]" /></ScrollAreaPrimitive.ScrollAreaScrollbar>);
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
