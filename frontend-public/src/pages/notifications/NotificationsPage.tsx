/**
 * 公众端个人消息中心。
 * 页面只负责展示和交互，消息请求、分页和实时推送由 notifications store 统一管理。
 */
import { useState } from 'react'
import type { UIEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronRight, CircleCheck, GitBranch, Inbox, LoaderCircle, MessageSquareText, RefreshCcw, ShieldAlert, TriangleAlert, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNotificationStore } from '@/src/stores/notifications'
import {
  formatNotificationTime,
  resolveNotificationContextLabel,
  resolveNotificationContextTone,
  resolveNotificationLevelLabel,
  resolveNotificationAction,
  resolveNotificationSource,
} from '@/src/lib/notificationUtils'
import type { NotificationItem } from '@/src/types/notifications'
import { getErrorMessage } from '@/src/lib/utils'
import { cn } from '@/src/lib/utils'

const resolveNotificationIcon = (item: NotificationItem): LucideIcon => {
  if (item.type === 'TASK') return Workflow
  if (item.type === 'GITLAB') return GitBranch
  if (item.type === 'CICD') return CircleCheck
  if (item.level === 'ERROR' || item.level === 'WARNING') return ShieldAlert
  return MessageSquareText
}

const toneClasses: Record<string, string> = {
  accent: 'border-violet-200 bg-violet-50 text-violet-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
}

interface NotificationCardProps {
  item: NotificationItem
  onClick: (item: NotificationItem) => void
}

const NotificationCard = ({ item, onClick }: NotificationCardProps) => {
  const Icon = resolveNotificationIcon(item)
  const tone = resolveNotificationContextTone(item)
  const action = resolveNotificationAction(item.actionUrl)

  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={cn(
        'group w-full border-b border-[var(--color-border-light)] px-3 py-4 text-left transition-colors last:border-b-0 sm:px-5',
        item.read ? 'bg-white hover:bg-[var(--color-bg-hover)]' : 'bg-[var(--color-primary-light)]/30 hover:bg-[var(--color-primary-light)]/60',
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={cn(
          'relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
          toneClasses[tone] || toneClasses.neutral,
        )}>
          {!item.read && <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] ring-2 ring-white" />}
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[11px] font-medium text-[var(--color-text-tertiary)]">{resolveNotificationSource(item)}</span>
              <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-border-strong)]" />
              <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">{formatNotificationTime(item.createdAt)}</span>
            </div>
            {action && <ChevronRight className="hidden h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 sm:block" strokeWidth={1.8} />}
          </div>
          <h2 className={cn(
            'mt-1.5 truncate text-[14px] leading-5',
            item.read ? 'font-medium text-[var(--color-text-primary)]' : 'font-semibold text-[var(--color-text-primary)]',
          )}>{item.title}</h2>
          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">{item.content}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', toneClasses[tone] || toneClasses.neutral)}>
              {resolveNotificationContextLabel(item)}
            </span>
            <span className="text-[10px] text-[var(--color-text-tertiary)]">{resolveNotificationLevelLabel(item)}</span>
            {!item.read && <span className="text-[10px] font-medium text-[var(--color-primary)]">未读</span>}
          </div>
        </div>
      </div>
    </button>
  )
}

export const NotificationsPage = () => {
  const navigate = useNavigate()
  const items = useNotificationStore((state) => state.items)
  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const loading = useNotificationStore((state) => state.loading)
  const error = useNotificationStore((state) => state.error)
  const unreadOnly = useNotificationStore((state) => state.unreadOnly)
  const total = useNotificationStore((state) => state.total)
  const toggleUnreadOnly = useNotificationStore((state) => state.toggleUnreadOnly)
  const loadNotifications = useNotificationStore((state) => state.loadNotifications)
  const loadNextPage = useNotificationStore((state) => state.loadNextPage)
  const markRead = useNotificationStore((state) => state.markRead)
  const markAllRead = useNotificationStore((state) => state.markAllRead)
  const [actionError, setActionError] = useState<string | null>(null)

  const hasMore = items.length < total

  const handleFilterChange = (nextUnreadOnly: boolean) => {
    setActionError(null)
    void toggleUnreadOnly(nextUnreadOnly).catch((err) => setActionError(getErrorMessage(err)))
  }

  const handleRetry = () => {
    setActionError(null)
    void loadNotifications().catch((err) => setActionError(getErrorMessage(err)))
  }

  const handleMarkAllRead = () => {
    setActionError(null)
    void markAllRead()
      .then(() => unreadOnly ? loadNotifications() : undefined)
      .catch((err) => setActionError(getErrorMessage(err)))
  }

  const handleNotificationClick = (item: NotificationItem) => {
    setActionError(null)
    void markRead(item.id)
      .then(() => {
        const action = resolveNotificationAction(item.actionUrl)
        if (!action) return
        if (action.kind === 'external') window.location.assign(action.target)
        else navigate(action.target)
      })
      .catch((err) => setActionError(getErrorMessage(err)))
  }

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (loading || !hasMore) return
    const element = event.currentTarget
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 160) return
    void loadNextPage().catch((err) => setActionError(getErrorMessage(err)))
  }

  return (
    <section className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-hidden sm:gap-5">
      <header className="flex shrink-0 flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-5 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <Bell className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">Personal inbox</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">消息中心</h1>
            <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">集中查看项目协作、执行结果和系统提醒。</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
            <span className="rounded-full bg-[var(--color-bg-hover)] px-2.5 py-1">共 {total} 条</span>
            <span className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 font-medium text-[var(--color-primary)]">{unreadCount} 条未读</span>
          </div>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0 || loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CheckCheck className="h-4 w-4" strokeWidth={1.8} />
            全部已读
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-light)] px-3 py-3 sm:px-5">
          <div className="flex items-center gap-1 rounded-xl bg-[var(--color-bg-page)] p-1" role="tablist" aria-label="消息筛选">
            <button
              type="button"
              role="tab"
              aria-selected={!unreadOnly}
              onClick={() => handleFilterChange(false)}
              className={cn('rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors', !unreadOnly ? 'bg-white text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]')}
            >
              全部消息
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={unreadOnly}
              onClick={() => handleFilterChange(true)}
              className={cn('rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors', unreadOnly ? 'bg-white text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]')}
            >
              未读消息{unreadCount > 0 ? ` · ${unreadCount}` : ''}
            </button>
          </div>
          {loading && items.length > 0 && <LoaderCircle className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
        </div>

        {(actionError || error) && items.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
            <span>{actionError || error}</span>
            <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={handleRetry}>重试</button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto" onScroll={handleListScroll}>
          {loading && items.length === 0 ? (
            <div className="flex h-full min-h-64 items-center justify-center text-[12px] text-[var(--color-text-tertiary)]">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[var(--color-primary)]" />
              正在加载消息
            </div>
          ) : error && items.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
              <TriangleAlert className="h-7 w-7 text-red-400" strokeWidth={1.7} />
              <p className="mt-3 text-[13px] font-medium text-[var(--color-text-primary)]">消息暂时加载失败</p>
              <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{error}</p>
              <button type="button" onClick={handleRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]">
                <RefreshCcw className="h-3.5 w-3.5" />
                重新加载
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
              <Inbox className="h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
              <p className="mt-3 text-[13px] font-medium text-[var(--color-text-primary)]">暂时没有消息</p>
              <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">新的项目协作和执行提醒会显示在这里。</p>
            </div>
          ) : (
            <>
              {items.map((item) => <NotificationCard key={item.id} item={item} onClick={handleNotificationClick} />)}
              <div className="flex items-center justify-center px-4 py-4 text-[11px] text-[var(--color-text-tertiary)]">
                {loading ? (
                  <><LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />加载更多</>
                ) : hasMore ? (
                  '继续滚动加载更多'
                ) : (
                  '已加载全部消息'
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
