import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/src/lib/utils';

const buttonVariants = cva(
	'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-45 [&>svg]:size-4 [&>svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:bg-[var(--primary-hover)]',
				secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--secondary-hover)]',
				outline: 'border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--accent)]',
				ghost: 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
				/** 业务列表自行管理 hover/selected 背景，避免 ghost 的默认强调色覆盖局部状态。 */
				unstyled: 'bg-transparent hover:bg-transparent focus-visible:ring-0',
				destructive: 'bg-[var(--destructive)] text-white hover:bg-[var(--destructive-hover)]',
				link: 'text-[var(--primary)] underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-9 px-3',
				sm: 'h-8 rounded-[var(--radius-sm)] px-2.5 text-xs',
				lg: 'h-10 px-5',
				icon: 'size-9',
				'icon-sm': 'size-8 rounded-[var(--radius-sm)]',
			},
		},
		defaultVariants: { variant: 'default', size: 'default' },
	},
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
	const Comp = asChild ? Slot : 'button';
	return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = 'Button';

export { buttonVariants };
