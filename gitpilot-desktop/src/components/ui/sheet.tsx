import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import { cn } from '@/src/lib/utils';

/** 移动/窄窗口使用的侧向工作台面板，复用 Dialog 的焦点与 Esc 语义。 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-[var(--z-overlay)] bg-black/65 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} />);
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'top' | 'right' | 'bottom' | 'left'; width?: 'default' | 'wide' }>(({ className, children, side = 'right', width = 'default', ...props }, ref) => <SheetPortal><SheetOverlay /><DialogPrimitive.Content ref={ref} className={cn('fixed z-[var(--z-dialog)] flex flex-col gap-4 border-[var(--border)] bg-[var(--card)] p-0 text-[var(--foreground)] shadow-2xl outline-none transition data-[state=open]:animate-in data-[state=closed]:animate-out', side === 'left' && 'inset-y-0 left-0 h-full border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left', side === 'right' && 'inset-y-0 right-0 h-full border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right', side === 'top' && 'inset-x-0 top-0 border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top', side === 'bottom' && 'inset-x-0 bottom-0 border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom', width === 'wide' ? 'w-[min(92vw,560px)]' : (side === 'left' || side === 'right') ? 'w-[min(86vw,360px)]' : '', className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 text-[var(--muted-foreground)] opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><X className="size-4" /><span className="sr-only">关闭</span></DialogPrimitive.Close></DialogPrimitive.Content></SheetPortal>);
SheetContent.displayName = DialogPrimitive.Content.displayName;
export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1.5 border-b border-[var(--border)] px-4 py-3', className)} {...props} />;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
