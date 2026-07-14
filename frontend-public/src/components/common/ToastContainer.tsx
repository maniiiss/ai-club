/**
 * Toast 全局渲染层。
 * 通过 Portal 固定在右下角，订阅 toast store 渲染队列。
 * 配色随设计 token 主题切换。
 */
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { useToastStore, type ToastTone } from '@/src/stores/toast'
import { cn } from '@/src/lib/utils'

/** 各视觉类型对应的图标。 */
const TONE_ICON: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
}

/** 各视觉类型对应的配色类（使用设计 token，随主题切换）。 */
const TONE_CLASS: Record<ToastTone, string> = {
  info: 'text-[var(--color-info)]',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-warning)]',
  danger: 'text-[var(--color-danger)]',
}

export const ToastContainer = () => {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'info'
        const Icon = TONE_ICON[tone]
        const handleClick = () => {
          removeToast(toast.id)
          toast.onClick?.()
        }
        return (
          <div
            key={toast.id}
            className="animate-slideUp flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 shadow-[var(--shadow-lg)]"
          >
            <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', TONE_CLASS[tone])} strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-snug text-[var(--color-text-primary)]">
                {toast.title}
              </p>
              {toast.message && (
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                  {toast.message}
                </p>
              )}
            </div>
            {toast.onClick && (
              <button
                type="button"
                onClick={handleClick}
                className="shrink-0 self-stretch rounded-md px-2 py-0.5 text-[12px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]"
              >
                查看
              </button>
            )}
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-md p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
