import * as React from 'react';
import { Check } from '@phosphor-icons/react';
import { cn } from '@/src/lib/utils';

/** 桌面端统一复选框：保持原生 input 的键盘/表单语义，同时统一视觉和焦点反馈。 */
export const Checkbox = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, ...props }, ref) => <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
	<input
		{...props}
		type="checkbox"
		ref={ref}
		className={cn('peer absolute inset-0 m-0 size-4 cursor-pointer appearance-none rounded-[4px] border border-[var(--input)] bg-[var(--background)] outline-none transition-[background-color,border-color,box-shadow] hover:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/25 checked:border-[var(--primary)] checked:bg-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-45', className)}
	/>
	<Check aria-hidden="true" className="pointer-events-none absolute size-3 text-[var(--primary-foreground)] opacity-0 transition-opacity peer-checked:opacity-100 peer-disabled:opacity-45" />
</span>);
Checkbox.displayName = 'Checkbox';
