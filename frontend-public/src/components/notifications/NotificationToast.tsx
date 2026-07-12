/**
 * 实时通知轻提示。
 * 业务意图：新消息到达时给用户即时反馈，但不借助浏览器权限打断当前工作。
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle2, ExternalLink, TriangleAlert, X } from 'lucide-react'
import { useNotificationStore } from '@/src/stores/notifications'
import { resolveNotificationAction } from '@/src/lib/notificationUtils'
import { cn } from '@/src/lib/utils'

export const NotificationToast = () => {
  const navigate = useNavigate()
  const toast = useNotificationStore((state) => state.toast)
  const markRead = useNotificationStore((state) => state.markRead)
  const clearToast = useNotificationStore((state) => state.clearToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(clearToast, 5000)
    return () => window.clearTimeout(timer)
  }, [clearToast, toast])

  if (!toast) return null

  const action = resolveNotificationAction(toast.actionUrl)
  const StatusIcon = toast.level === 'ERROR' || toast.level === 'WARNING'
    ? TriangleAlert
    : toast.level === 'SUCCESS'
      ? CheckCircle2
      : Bell

  const handleOpen = async () => {
    await markRead(toast.id).catch(() => undefined)
    clearToast()
    if (!action) return
    if (action.kind === 'external') {
      window.location.assign(action.target)
    } else {
      navigate(action.target)
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[min(360px,calc(100vw-2rem))] animate-slideUp">
      <div
        className={cn(
          'overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-xl)]',
          toast.level === 'ERROR' ? 'border-red-200' : toast.level === 'WARNING' ? 'border-amber-200' : 'border-[var(--color-border)]',
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
            toast.level === 'ERROR' && 'bg-red-50 text-red-600',
            toast.level === 'WARNING' && 'bg-amber-50 text-amber-600',
            toast.level === 'SUCCESS' && 'bg-emerald-50 text-emerald-600',
            (!toast.level || toast.level === 'INFO') && 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
          )}>
            <StatusIcon className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <button className="min-w-0 flex-1 text-left" type="button" onClick={handleOpen}>
            <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{toast.title}</p>
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">{toast.content}</p>
            {action && (
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)]">
                查看消息
                {action.kind === 'external' ? <ExternalLink className="h-3 w-3" /> : null}
              </span>
            )}
          </button>
          <button
            className="rounded-md p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            type="button"
            aria-label="关闭消息提示"
            onClick={clearToast}
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}
