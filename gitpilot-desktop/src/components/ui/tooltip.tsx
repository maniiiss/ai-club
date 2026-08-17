import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/src/lib/utils';
import styles from './tooltip.module.css';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<React.ElementRef<typeof TooltipPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>>(({ className, sideOffset = 6, ...props }, ref) => (
	<TooltipPrimitive.Portal>
		<TooltipPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn(styles.content, className)} {...props} />
	</TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface HintProps {
	/** 为空时不创建浮层，允许调用方直接传入条件提示文案。 */
	content?: React.ReactNode;
	children: React.ReactElement;
	side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
}

/** 桌面端统一 hover 提示：替代无法控制样式的浏览器 title，并保留 Radix 的焦点可访问性。 */
export function Hint({ content, children, side = 'top' }: HintProps) {
	if (!content) return children;
	return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side={side}>{content}</TooltipContent></Tooltip>;
}

interface NativeHintState {
	text: string;
	anchor: { left: number; top: number; width: number; bottom: number };
	pointerOnly: boolean;
}

interface NativeHintPosition {
	left: number;
	top: number;
}

/** 兼容尚未迁移的 title 属性，也为不能嵌套多个 Radix 触发器的桌面按钮提供统一提示视觉。 */
export function NativeHintBridge() {
	const [hint, setHint] = React.useState<NativeHintState | null>(null);
	const [position, setPosition] = React.useState<NativeHintPosition | null>(null);
	const hintRef = React.useRef<HTMLDivElement | null>(null);
	const activeElement = React.useRef<HTMLElement | null>(null);
	const activePointerOnly = React.useRef(false);

	const reposition = React.useCallback(() => {
		const currentHint = hint;
		const content = hintRef.current;
		if (!currentHint || !content) return;
		const contentRect = content.getBoundingClientRect();
		const margin = 12;
		const maxLeft = Math.max(margin, window.innerWidth - contentRect.width - margin);
		const preferredLeft = currentHint.anchor.left + currentHint.anchor.width / 2 - contentRect.width / 2;
		const preferredTop = currentHint.pointerOnly && currentHint.anchor.top < 66
			? currentHint.anchor.bottom + 10
			: currentHint.anchor.top - contentRect.height - 10;
		const maxTop = Math.max(margin, window.innerHeight - contentRect.height - margin);
		const nextPosition = {
			left: Math.min(maxLeft, Math.max(margin, preferredLeft)),
			top: Math.min(maxTop, Math.max(margin, preferredTop)),
		};
		setPosition((previous) => previous && previous.left === nextPosition.left && previous.top === nextPosition.top ? previous : nextPosition);
	}, [hint]);

	React.useLayoutEffect(() => {
		if (!hint) {
			setPosition(null);
			return;
		}
		reposition();
	}, [hint, reposition]);

	React.useEffect(() => {
		if (!hint) return undefined;
		window.addEventListener('resize', reposition);
		return () => window.removeEventListener('resize', reposition);
	}, [hint, reposition]);

	React.useEffect(() => {
		const findTarget = (target: EventTarget | null): HTMLElement | null => target instanceof Element ? target.closest<HTMLElement>('[title], [data-gp-hint]') : null;
		const show = (event: Event) => {
			const element = findTarget(event.target);
			if (!element) return;
			// data-gp-hint 用于菜单触发器，只响应鼠标悬停，避免点击后的焦点事件重复显示提示。
			if (event.type === 'focusin' && !element.hasAttribute('title')) return;
			const text = element.getAttribute('title') || element.getAttribute('data-gp-hint');
			if (!text) return;
			if (element.hasAttribute('title')) {
				element.setAttribute('data-gp-hint', text);
				element.removeAttribute('title');
			}
			if (element.tagName === 'IFRAME') return;
			activeElement.current = element;
			activePointerOnly.current = event.type === 'pointerover';
			const rect = element.getBoundingClientRect();
			setHint({ text, anchor: { left: rect.left, top: rect.top, width: rect.width, bottom: rect.bottom }, pointerOnly: activePointerOnly.current });
		};
		const hide = (event: Event) => {
			const active = activeElement.current;
			if (!active) return;
			if (event.type === 'focusout' && activePointerOnly.current) return;
			const related = (event as PointerEvent | FocusEvent).relatedTarget;
			if (related instanceof Node && active.contains(related)) return;
			activeElement.current = null;
			activePointerOnly.current = false;
			setHint(null);
		};
		document.addEventListener('pointerover', show, true);
		document.addEventListener('pointerout', hide, true);
		document.addEventListener('focusin', show, true);
		document.addEventListener('focusout', hide, true);
		return () => {
			document.removeEventListener('pointerover', show, true);
			document.removeEventListener('pointerout', hide, true);
			document.removeEventListener('focusin', show, true);
			document.removeEventListener('focusout', hide, true);
		};
	}, []);

	if (!hint) return null;
	return <div ref={hintRef} className={cn(styles.content, styles.legacy)} style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }} role="tooltip">{hint.text}</div>;
}
