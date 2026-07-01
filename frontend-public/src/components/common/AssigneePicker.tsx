/**
 * 负责人下拉选人组件。
 * 支持搜索、头像、项目成员/企业成员分组。
 */
import { useEffect, useRef, useState, useMemo } from 'react'
import { ChevronDown, User } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import type { UserOptionItem } from '@/src/api/users'

interface AssigneePickerProps {
  /** 当前选中的负责人 ID。 */
  value: number | null
  /** 选中变更回调。 */
  onChange: (userId: number | null) => void
  /** 全部可选用户。 */
  userOptions: UserOptionItem[]
  /** 项目成员 ID 列表，用于分组显示。 */
  projectMemberIds: number[]
  /** 标签文字。 */
  label?: string
}

export const AssigneePicker = ({
  value,
  onChange,
  userOptions,
  projectMemberIds,
  label,
}: AssigneePickerProps) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const memberSet = useMemo(() => new Set(projectMemberIds), [projectMemberIds])

  const selectedUser = useMemo(
    () => userOptions.find((u) => u.id === value),
    [userOptions, value],
  )

  // 分组 + 搜索
  const { projectMembers, enterpriseMembers } = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const filtered = keyword
      ? userOptions.filter(
          (u) =>
            u.nickname.toLowerCase().includes(keyword) ||
            u.username.toLowerCase().includes(keyword),
        )
      : userOptions
    const pm: UserOptionItem[] = []
    const em: UserOptionItem[] = []
    filtered.forEach((u) => {
      if (memberSet.has(u.id)) pm.push(u)
      else em.push(u)
    })
    return { projectMembers: pm, enterpriseMembers: em }
  }, [userOptions, search, memberSet])

  // 打开时自动聚焦搜索框
  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (userId: number | null) => {
    onChange(userId)
    setOpen(false)
  }

  const displayName = selectedUser?.nickname || selectedUser?.username

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center h-10 rounded-lg border bg-white px-3 transition-all duration-150 text-left gap-2',
          'hover:border-[var(--color-border-strong)]',
          open
            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20'
            : 'border-[var(--color-border-strong)]',
        )}
      >
        {selectedUser ? (
          <>
            <Avatar user={selectedUser} size={20} />
            <span className="text-[13px] text-[var(--color-text-primary)] truncate">{displayName}</span>
          </>
        ) : (
          <span className="text-[13px] text-[var(--color-text-placeholder)]">选择负责人</span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-fadeIn overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-[var(--color-border-light)]">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索成员…"
              className="h-8 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          {/* 选项列表 */}
          <div className="max-h-[280px] overflow-y-auto py-1">
            {/* 未分配 */}
            <UserRow
              user={null}
              selected={value === null}
              onClick={() => handleSelect(null)}
            />
            {/* 项目成员 */}
            {projectMembers.length > 0 && (
              <>
                <GroupLabel label="项目成员" />
                {projectMembers.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    selected={u.id === value}
                    onClick={() => handleSelect(u.id)}
                  />
                ))}
              </>
            )}
            {/* 企业成员 */}
            {enterpriseMembers.length > 0 && (
              <>
                <GroupLabel label="企业成员" />
                {enterpriseMembers.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    selected={u.id === value}
                    onClick={() => handleSelect(u.id)}
                  />
                ))}
              </>
            )}
            {projectMembers.length === 0 && enterpriseMembers.length === 0 && (
              <p className="px-3 py-4 text-center text-[12px] text-[var(--color-text-tertiary)]">无匹配成员</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 子组件 ── */

const Avatar = ({ user, size = 20 }: { user: UserOptionItem; size?: number }) => {
  const initial = (user.nickname || user.username || '?').charAt(0).toUpperCase()
  return user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.nickname}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {initial}
    </span>
  )
}

const UserRow = ({
  user,
  selected,
  onClick,
}: {
  user: UserOptionItem | null
  selected: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-2 w-full px-3 py-2 text-left transition-colors',
      selected ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]',
    )}
  >
    {user ? (
      <>
        <Avatar user={user} size={24} />
        <span className="text-[13px] truncate">{user.nickname || user.username}</span>
      </>
    ) : (
      <>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 shrink-0">
          <User className="h-3.5 w-3.5" />
        </span>
        <span className="text-[13px] text-[var(--color-text-tertiary)]">未分配</span>
      </>
    )}
  </button>
)

const GroupLabel = ({ label }: { label: string }) => (
  <div className="px-3 pt-2 pb-1">
    <span className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</span>
  </div>
)
