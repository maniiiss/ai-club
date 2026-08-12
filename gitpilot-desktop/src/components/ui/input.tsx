import * as React from 'react';
import { cn } from '@/src/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => <input type={type} ref={ref} className={cn('flex h-9 w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-1.5 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 disabled:cursor-not-allowed disabled:opacity-45', className)} {...props} />);
Input.displayName = 'Input';
