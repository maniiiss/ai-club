/**
 * 顶部导航栏。
 * 水平布局：Logo + 导航链接 + 用户菜单。
 * 参考 Vercel / GitHub 的顶部导航风格。
 */
import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, LogOut, User, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/src/stores/auth'
import { cn, getInitials } from '@/src/lib/utils'

const navItems = [
  { to: '/dashboard', label: '工作台' },
  { to: '/projects', label: '项目' },
  { to: '/settings/profile', label: '设置' },
]

export const TopNav = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
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
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg-card)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-[52px] max-w-[1600px] items-center gap-4 px-4 lg:px-8">
        {/* Logo */}
        <NavLink to="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)]">
            <span className="text-[10px] font-bold text-white tracking-tight">AI</span>
          </div>
          <span className="text-[15px] font-semibold text-[var(--color-text-primary)] tracking-tight hidden sm:inline">
            AI Club
          </span>
        </NavLink>

        {/* 分隔线 */}
        <div className="h-5 w-px bg-[var(--color-border)] hidden sm:block" />

        {/* 桌面端导航链接 */}
        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'text-[var(--color-text-primary)] bg-[var(--color-bg-hover)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 右侧空间 */}
        <div className="flex-1" />

        {/* 用户菜单 */}
        <div className="relative hidden sm:block" ref={menuRef}>
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
                className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[11px] font-semibold text-[var(--color-primary)]">
                {getInitials(displayName)}
              </div>
            )}
            <span className="text-[13px] font-medium text-[var(--color-text-primary)] max-w-[100px] truncate">
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

        {/* 移动端汉堡菜单 */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="sm:hidden rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          aria-label="菜单"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* 移动端下拉菜单 */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-[var(--color-border)] bg-[var(--color-bg-card)] animate-fadeIn">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors',
                    isActive
                      ? 'text-[var(--color-text-primary)] bg-[var(--color-bg-hover)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mx-3 my-2 border-t border-[var(--color-border-light)]" />
            <button
              onClick={() => {
                setMobileOpen(false)
                navigate('/settings/profile')
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <User className="h-4 w-4" />
              个人资料
            </button>
            <button
              onClick={() => {
                setMobileOpen(false)
                handleLogout()
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </nav>
        </div>
      )}
    </header>
  )
}
