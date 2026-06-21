/**
 * 全局左侧导航。
 * 一级导航：工作台、项目、设置。
 * 精致的浅色侧边栏，带微妙边框和层次阴影。
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  X,
} from 'lucide-react'
import { cn } from '@/src/lib/utils'

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

const navItems = [
  { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { to: '/projects', label: '项目', icon: FolderKanban },
  { to: '/settings/profile', label: '设置', icon: Settings },
]

export const Sidebar = ({ mobileOpen, onMobileClose }: SidebarProps) => {
  const navContent = (
    <nav className="flex h-full flex-col">
      {/* 品牌区 */}
      <div className="flex h-[var(--topbar-height)] items-center gap-2.5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]">
          <span className="text-[11px] font-bold text-white tracking-tight">AI</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)] leading-tight tracking-tight">
            AI Club
          </span>
        </div>
      </div>

      {/* 导航链接 */}
      <div className="flex-1 overflow-y-auto px-3 pt-2">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onMobileClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium',
                    'transition-all duration-150',
                    isActive
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_var(--color-border-light)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.8} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* 底部 */}
      <div className="border-t border-[var(--color-border-light)] px-5 py-3">
        <p className="text-[11px] text-[var(--color-text-tertiary)] tracking-wide">
          AI Club SaaS &middot; v1.0
        </p>
      </div>
    </nav>
  )

  return (
    <>
      {/* 桌面端侧边栏 */}
      <aside className="hidden lg:flex lg:w-[var(--sidebar-width)] lg:flex-col lg:border-r lg:border-[var(--color-border)] lg:bg-[var(--color-bg-sidebar)]">
        {navContent}
      </aside>

      {/* 移动端遮罩侧边栏 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px]"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 w-[280px] bg-[var(--color-bg-card)] shadow-[var(--shadow-xl)] animate-slideLeft">
            <button
              onClick={onMobileClose}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label="关闭导航"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
