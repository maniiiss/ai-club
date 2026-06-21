/**
 * 顶栏组件。
 * 展示汉堡菜单按钮（移动端）、用户菜单和退出操作。
 * 简洁克制的设计风格。
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, LogOut, User, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/src/stores/auth'
import { cn, getInitials } from '@/src/lib/utils'

interface TopBarProps {
  onMobileMenuOpen: () => void
}

export const TopBar = ({ onMobileMenuOpen }: TopBarProps) => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const displayName = user?.nickname || user?.username || '用户'
  const avatarUrl = user?.avatarUrl

  return (
    <header className="flex h-[var(--topbar-height)] items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-card)]/80 backdrop-blur-sm px-4 lg:px-5">
      {/* 移动端汉堡菜单 */}
      <button
        onClick={onMobileMenuOpen}
        className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors lg:hidden"
        aria-label="打开导航"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block" />

      {/* 用户菜单 */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1.5',
            'transition-all duration-150',
            'hover:bg-[var(--color-bg-hover)]',
            menuOpen && 'bg-[var(--color-bg-hover)]',
          )}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-7 w-7 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[12px] font-semibold text-[var(--color-primary)]">
              {getInitials(displayName)}
            </div>
          )}
          <span className="hidden text-[13px] font-medium text-[var(--color-text-primary)] sm:inline max-w-[120px] truncate">
            {displayName}
          </span>
          <ChevronDown className={cn(
            'h-3.5 w-3.5 text-[var(--color-text-tertiary)] transition-transform duration-150',
            menuOpen && 'rotate-180',
          )} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-[var(--color-border)] bg-white py-1.5 shadow-[var(--shadow-lg)] animate-scaleIn">
            <div className="px-3 py-2 mb-1">
              <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                {displayName}
              </p>
              <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">
                {user?.email || user?.username}
              </p>
            </div>
            <div className="mx-2 my-1 border-t border-[var(--color-border-light)]" />
            <button
              onClick={() => {
                setMenuOpen(false)
                navigate('/settings/profile')
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <User className="h-4 w-4" strokeWidth={1.75} />
              个人资料
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                handleLogout()
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)] transition-colors"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              退出登录
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
