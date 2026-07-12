/**
 * 顶栏消息抽屉。
 * 业务意图：提供快速浏览和处理入口，复杂筛选、分页与完整历史交给独立消息中心页面。
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronRight, CircleCheck, GitBranch, LoaderCircle, MessageSquareText, ShieldAlert, TriangleAlert } from 'lucide-react'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { useNotificationStore } from '@/src/stores/notifications'
import { cn, getErrorMessage } from '@/src/lib/utils'
import {
  formatNotificationTime,
  resolveNotificationAction,
  resolveNotificationContextLabel,
  resolveNotificationContextTone,
  resolveNotificationLevelLabel,
  resolveNotificationSource,
} from '@/src/lib/notificationUtils'
import type { NotificationItem } from '@/src/types/notifications'

interface NotificationDrawerProps {
  open: boolean
  onClose: () => void
}

const toneClasses: Record<string, string> = {
  accent: 'bg-violet-50 text-violet-700',
  info: 'bg-sky-50 text-sky-700',
  neutral: 'bg-slate-50 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
}

const resolveIcon = (item: NotificationItem) => {
  if (item.type === 'TASK') return Bell
  if (item.type === 'GITLAB') return GitBranch
  if (item.type === 'CICD') return CircleCheck
  if (item.level === 'ERROR' || item.level === 'WARNING') return ShieldAlert
  return MessageSquareText
}

export const NotificationDrawer = ({ open, onClose }: NotificationDrawerProps) => {
  const navigate = useNavigate()
  const items = useNotificationStore((state) => state.items)
  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const loading = useNotificationStore((state) => state.loading)
  const unreadOnly = useNotificationStore((state) => state.unreadOnly)
  const total = useNotificationStore((state) => state.total)
  const toggleUnreadOnly = useNotificationStore((state) => state.toggleUnreadOnly)
  const loadNotifications = useNotificationStore((state) => state.loadNotifications)
  const markRead = useNotificationStore((state) => state.markRead)
  const markAllRead = useNotificationStore((state) => state.markAllRead)
  const [error, setError] = useState<string | null>(null)
  const initialLoadRequestedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      initialLoadRequestedRef.current = false
      return
    }
    if (initialLoadRequestedRef.current || loading || items.length > 0) return
    initialLoadRequestedRef.current = true
    void loadNotifications().catch((reason) => setError(getErrorMessage(reason)))
  }, [items.length, loadNotifications, loading, open])

  const handleFilterChange = (nextUnreadOnly: boolean) => {
    setError(null)
    void toggleUnreadOnly(nextUnreadOnly).catch((reason) => setError(getErrorMessage(reason)))
  }

  const handleMarkAllRead = () => {
    setError(null)
    void markAllRead()
      .then(() => unreadOnly ? loadNotifications() : undefined)
      .catch((reason) => setError(getErrorMessage(reason)))
  }

  const handleItemClick = (item: NotificationItem) => {
    setError(null)
    void markRead(item.id)
      .then(() => {
        onClose()
        const action = resolveNotificationAction(item.actionUrl)
        if (!action) return
        if (action.kind === 'external') window.location.assign(action.target)
        else navigate(action.target)
      })
      .catch((reason) => setError(getErrorMessage(reason)))
  }

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title="消息中心"
      description="快速查看最近的项目协作与执行提醒"
      width="100%"
      maxWidth="min(440px, 100vw)"
      headerActions={(
        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || loading}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          全部已读
        </button>
      )}
      footer={(
        <button
          type="button"
          onClick={() => {
            onClose()
            navigate('/notifications')
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary-light)] px-3 py-2.5 text-[12px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
        >
          查看全部消息
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    >
      <div className="flex min-h-full flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-light)] px-4 py-3">
          <div className="flex items-center gap-1 rounded-xl bg-[var(--color-bg-page)] p-1">
            <button
              type="button"
              onClick={() => handleFilterChange(false)}
              className={cn('rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors', !unreadOnly ? 'bg-white text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-tertiary)]')}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange(true)}
              className={cn('rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors', unreadOnly ? 'bg-white text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-tertiary)]')}
            >
              未读 {unreadCount > 0 ? unreadCount : ''}
            </button>
          </div>
          <span className="text-[11px] text-[var(--color-text-tertiary)]">共 {total} 条</span>
        </div>

        {error && (
          <div className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 text-[11px] text-red-700">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1">
          {loading && items.length === 0 ? (
            <div className="flex min-h-56 items-center justify-center text-[12px] text-[var(--color-text-tertiary)]">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[var(--color-primary)]" />
              正在加载消息
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <Bell className="h-7 w-7 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
              <p className="mt-3 text-[13px] font-medium text-[var(--color-text-primary)]">暂无消息</p>
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">新的提醒会显示在这里。</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-light)]">
              {items.map((item) => {
                const Icon = resolveIcon(item)
                const tone = resolveNotificationContextTone(item)
                const action = resolveNotificationAction(item.actionUrl)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={cn('group w-full px-4 py-4 text-left transition-colors hover:bg-[var(--color-bg-hover)]', !item.read && 'bg-[var(--color-primary-light)]/30')}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', toneClasses[tone] || toneClasses.neutral)}>
                        {!item.read && <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[var(--color-primary)] ring-2 ring-white" />}
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">{resolveNotificationSource(item)}</span>
                          <span className="shrink-0 text-[10px] text-[var(--color-text-tertiary)]">{formatNotificationTime(item.createdAt)}</span>
                        </div>
                        <p className={cn('mt-1 text-[13px] leading-5 text-[var(--color-text-primary)]', !item.read && 'font-semibold')}>{item.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', toneClasses[tone] || toneClasses.neutral)}>{resolveNotificationContextLabel(item)}</span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">{resolveNotificationLevelLabel(item)}</span>
                        </div>
                      </div>
                      {action && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </SlideDrawer>
  )
}
