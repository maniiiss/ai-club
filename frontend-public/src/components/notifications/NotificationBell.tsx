/**
 * 通知铃铛入口按钮。
 * 顶部导航栏右侧展示，带未读数量角标，点击打开消息中心抽屉。
 * 桌面端与移动端共用同一组件，独立于用户下拉菜单，符合移动端交互规范。
 */
import { Bell } from 'lucide-react'
import { useNotificationStore } from '@/src/stores/notifications'
import { cn } from '@/src/lib/utils'

interface NotificationBellProps {
  /** 额外类名，用于在不同位置微调尺寸/间距。 */
  className?: string
}

export const NotificationBell = ({ className }: NotificationBellProps) => {
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const openDrawer = useNotificationStore((s) => s.openDrawer)

  return (
    <button
      type="button"
      onClick={() => openDrawer()}
      className={cn(
        'relative rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
        className,
      )}
      aria-label="消息中心"
      title="消息中心"
    >
      <Bell className="h-5 w-5" strokeWidth={1.75} />
      {/* 未读角标：超过 99 显示 99+ */}
      {unreadCount > 0 && (
        <span className="animate-scaleIn absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[var(--color-bg-card)]">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
