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
	left: number;
	top: number;
	below: boolean;
}

/** 兼容尚未迁移的 title 属性，让旧版桌面控件也使用统一的提示视觉。 */
export function NativeHintBridge() {
	const [hint, setHint] = React.useState<NativeHintState | null>(null);
	const activeElement = React.useRef<HTMLElement | null>(null);

	React.useEffect(() => {
		const findTarget = (target: EventTarget | null): HTMLElement | null => target instanceof Element ? target.closest<HTMLElement>('[title], [data-gp-hint]') : null;
		const show = (event: Event) => {
			const element = findTarget(event.target);
			if (!element) return;
			const text = element.getAttribute('title') || element.getAttribute('data-gp-hint');
			if (!text) return;
			if (element.hasAttribute('title')) {
				element.setAttribute('data-gp-hint', text);
				element.removeAttribute('title');
			}
			if (element.tagName === 'IFRAME') return;
			activeElement.current = element;
			const rect = element.getBoundingClientRect();
			const below = rect.top < 66;
			setHint({ text, left: Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2)), top: below ? rect.bottom : rect.top, below });
		};
		const hide = (event: Event) => {
			const active = activeElement.current;
			if (!active) return;
			const related = (event as PointerEvent | FocusEvent).relatedTarget;
			if (related instanceof Node && active.contains(related)) return;
			activeElement.current = null;
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
	return <div className={cn(styles.content, styles.legacy, hint.below && styles.legacyBelow)} style={{ left: hint.left, top: hint.top }} role="tooltip">{hint.text}</div>;
}
