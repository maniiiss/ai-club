/**
 * 消息中心抽屉。
 * 参考管理端 AppLayout.vue 的消息中心实现：
 * - 基于公共 SlideDrawer 容器，右侧滑出
 * - 分类 Tab（全部消息 / 未读消息）
 * - 消息列表：来源、相对时间、标题、内容、类型/状态/业务标签（全中文）
 * - 点击标记已读并跳转、IntersectionObserver 无限滚动加载
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck } from 'lucide-react'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { Button } from '@/src/components/common/Button'
import { EmptyState } from '@/src/components/common/EmptyState'
import { useNotificationStore } from '@/src/stores/notifications'
import { cn } from '@/src/lib/utils'
import type { NotificationItem } from '@/src/types/notification'
import {
  formatRelativeTime,
  levelToClass,
  resolveNotificationContextLabel,
  resolveNotificationContextTone,
  resolveNotificationLevelLabel,
  resolveNotificationSource,
  resolveNotificationTypeIcon,
  resolveNotificationTypeLabel,
  toneToClass,
} from '@/src/lib/notificationRender'

export const MessageCenterDrawer = () => {
  const navigate = useNavigate()
  const drawerOpen = useNotificationStore((s) => s.drawerOpen)
  const closeDrawer = useNotificationStore((s) => s.closeDrawer)
  const items = useNotificationStore((s) => s.items)
  const loading = useNotificationStore((s) => s.loading)
  const unreadOnly = useNotificationStore((s) => s.unreadOnly)
  const total = useNotificationStore((s) => s.total)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const toggleUnreadOnly = useNotificationStore((s) => s.toggleUnreadOnly)
  const loadMore = useNotificationStore((s) => s.loadMore)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)

  // 无限滚动哨兵：进入视口时加载下一页。
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadMore()
        }
      },
      { root: null, rootMargin: '120px', threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore, drawerOpen])

  const canLoadMore = items.length < total

  const handleClickItem = async (item: NotificationItem) => {
    await markRead(item.id)
    closeDrawer()
    if (item.actionUrl) {
      navigate(item.actionUrl)
    }
  }

  const handleMarkAllRead = async () => {
    await markAllRead()
  }

  return (
    <SlideDrawer
      open={drawerOpen}
      onClose={closeDrawer}
      title="消息中心"
      description="系统通知与未读消息"
      width="420px"
      headerActions={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
          icon={<CheckCheck className="h-4 w-4" strokeWidth={1.75} />}
        >
          全部已读
        </Button>
      }
    >
      {/* 分类 Tab */}
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-[var(--color-border-light)] bg-[var(--color-bg-card)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => toggleUnreadOnly(false)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
            !unreadOnly
              ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
          )}
        >
          全部消息
        </button>
        <button
          type="button"
          onClick={() => toggleUnreadOnly(true)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
            unreadOnly
              ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
          )}
        >
          未读消息
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* 消息列表 */}
      <div className="flex flex-col">
        {items.length === 0 && !loading ? (
          <EmptyState title="暂无消息" description={unreadOnly ? '没有未读通知' : '暂时还没有通知消息'} />
        ) : (
          items.map((item) => {
            const TypeIcon = resolveNotificationTypeIcon(item)
            const tone = resolveNotificationContextTone(item)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClickItem(item)}
                className={cn(
                  'flex w-full flex-col gap-1.5 border-b border-[var(--color-border-light)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]',
                  !item.read && 'bg-[var(--color-primary-lighter)]',
                )}
              >
                {/* 头部：来源 + 时间 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {!item.read && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                    )}
                    <span className="truncate text-[12px] font-medium text-[var(--color-text-secondary)]">
                      {resolveNotificationSource(item)}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>

                {/* 标题 */}
                <p
                  className={cn(
                    'text-[13.5px] leading-snug',
                    item.read
                      ? 'font-medium text-[var(--color-text-secondary)]'
                      : 'font-semibold text-[var(--color-text-primary)]',
                  )}
                >
                  {item.title}
                </p>

                {/* 内容 */}
                {item.content && (
                  <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[var(--color-text-tertiary)]">
                    {item.content}
                  </p>
                )}

                {/* 标签行：类型 + 状态 + 业务类型（全中文） */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                      toneToClass(tone),
                    )}
                  >
                    <TypeIcon className="h-3 w-3" strokeWidth={1.75} />
                    {resolveNotificationTypeLabel(item)}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                      levelToClass(item),
                    )}
                  >
                    {resolveNotificationLevelLabel(item)}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                      toneToClass(tone),
                    )}
                  >
                    {resolveNotificationContextLabel(item)}
                  </span>
                </div>
              </button>
            )
          })
        )}

        {/* 加载更多哨兵 */}
        {canLoadMore && items.length > 0 && <div ref={sentinelRef} className="h-1 w-full" />}

        {/* 底部状态文案 */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-[var(--color-text-tertiary)]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
            加载中...
          </div>
        )}
        {!loading && items.length > 0 && !canLoadMore && (
          <div className="py-4 text-center text-[12px] text-[var(--color-text-tertiary)]">
            已加载全部消息
          </div>
        )}
      </div>
    </SlideDrawer>
  )
}
