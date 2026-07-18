/**
 * 工作项成员选择组件。
 * 支持在一个弹层里设置单个负责人和多个协作人。
 */
import { useEffect, useRef, useState, useMemo } from 'react'
import { Check, ChevronDown, User, Users } from 'lucide-react'
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
  /** 紧凑模式用于工作项列表等密集布局。 */
  compact?: boolean
  /** 触发器的无障碍名称和悬浮提示。 */
  ariaLabel?: string
}

/** 负责人筛选器的值：空值表示全部，特殊值支持未分配和当前用户快捷筛选。 */
export type AssigneeFilterValue = '' | 'mine' | 'unassigned' | `user:${number}`

interface AssigneeFilterPickerProps {
  value: AssigneeFilterValue
  onChange: (value: AssigneeFilterValue) => void
  userOptions: UserOptionItem[]
  projectMemberIds: number[]
  currentUserId: number | null
  ariaLabel?: string
  className?: string
}

interface WorkItemMemberPickerProps {
  /** 当前负责人 ID，负责人只能有一个。 */
  assigneeUserId: number | null
  /** 当前协作人 ID 列表，协作人可多选。 */
  collaboratorUserIds: number[]
  /** 成员变更回调，会保证负责人和协作人互斥。 */
  onChange: (value: { assigneeUserId: number | null; collaboratorUserIds: number[] }) => void
  /** 全部可选用户。 */
  userOptions: UserOptionItem[]
  /** 项目成员 ID 列表，用于分组显示。 */
  projectMemberIds: number[]
  /** 标签文字。 */
  label?: string
  /** 空状态占位。 */
  placeholder?: string
}

export const AssigneePicker = ({
  value,
  onChange,
  userOptions,
  projectMemberIds,
  label,
  compact = false,
  ariaLabel,
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
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center rounded-lg border bg-white text-left transition-all duration-150',
          compact ? 'h-8 rounded-md gap-1.5 px-2' : 'h-10 gap-2 px-3',
          'hover:border-[var(--color-border-strong)]',
          open
            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20'
            : 'border-[var(--color-border-strong)]',
        )}
      >
        {selectedUser ? (
          <>
            <UserAvatar user={selectedUser} size={compact ? 18 : 20} />
            <span className={cn('truncate text-[var(--color-text-primary)]', compact ? 'text-[12px]' : 'text-[13px]')}>{displayName}</span>
          </>
        ) : (
          <span className={cn('text-[var(--color-text-placeholder)]', compact ? 'text-[12px]' : 'text-[13px]')}>{compact ? '未分配' : '选择负责人'}</span>
        )}
        <ChevronDown className={cn('ml-auto shrink-0 text-[var(--color-text-tertiary)]', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
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

/**
 * 工作项列表负责人筛选器。
 * 复用负责人选择器的成员分组和搜索交互，同时增加“我负责的”快捷条件。
 */
export const AssigneeFilterPicker = ({
  value,
  onChange,
  userOptions,
  projectMemberIds,
  currentUserId,
  ariaLabel,
  className,
}: AssigneeFilterPickerProps) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const memberSet = useMemo(() => new Set(projectMemberIds), [projectMemberIds])
  const selectedUserId = value.startsWith('user:') ? Number(value.slice('user:'.length)) : null
  const selectedUser = userOptions.find((user) => user.id === selectedUserId)

  const { projectMembers, enterpriseMembers } = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const filtered = keyword
      ? userOptions.filter((user) => user.nickname.toLowerCase().includes(keyword) || user.username.toLowerCase().includes(keyword))
      : userOptions
    const pm: UserOptionItem[] = []
    const em: UserOptionItem[] = []
    filtered.forEach((user) => (memberSet.has(user.id) ? pm : em).push(user))
    return { projectMembers: pm, enterpriseMembers: em }
  }, [memberSet, search, userOptions])

  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (nextValue: AssigneeFilterValue) => {
    onChange(nextValue)
    setOpen(false)
  }

  const displayName = value === 'mine'
    ? '我负责的'
    : value === 'unassigned'
      ? '未分配'
      : selectedUser?.nickname || selectedUser?.username || '全部负责人'

  return (
    <div ref={containerRef} className={cn('relative flex flex-col gap-1.5', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-10 w-full cursor-pointer items-center justify-between rounded-lg border bg-white px-3.5 text-[14px] transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20',
          open
            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20'
            : 'border-[var(--color-border-strong)] hover:border-[var(--color-border-strong)]',
        )}
      >
        <span className={cn('truncate', value ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-placeholder)]')}>{displayName}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[260px] rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-fadeIn">
          <div className="border-b border-[var(--color-border-light)] p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索成员…"
              className="h-8 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            <button type="button" onClick={() => handleSelect('')} className={cn('flex w-full items-center px-3 py-2 text-left text-[13px] transition-colors', value === '' ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]')}>全部负责人</button>
            <UserRow user={null} selected={value === 'unassigned'} onClick={() => handleSelect('unassigned')} />
            {currentUserId && (
              <button type="button" onClick={() => handleSelect('mine')} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors', value === 'mine' ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]')}>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)]"><User className="h-3.5 w-3.5" /></span>
                我负责的
              </button>
            )}
            {projectMembers.length > 0 && (
              <>
                <GroupLabel label="项目成员" />
                {projectMembers.map((user) => <UserRow key={user.id} user={user} selected={value === `user:${user.id}`} onClick={() => handleSelect(`user:${user.id}`)} />)}
              </>
            )}
            {enterpriseMembers.length > 0 && (
              <>
                <GroupLabel label="企业成员" />
                {enterpriseMembers.map((user) => <UserRow key={user.id} user={user} selected={value === `user:${user.id}`} onClick={() => handleSelect(`user:${user.id}`)} />)}
              </>
            )}
            {projectMembers.length === 0 && enterpriseMembers.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-[var(--color-text-tertiary)]">无匹配成员</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 子组件 ── */

export const WorkItemMemberPicker = ({
  assigneeUserId,
  collaboratorUserIds,
  onChange,
  userOptions,
  projectMemberIds,
  label,
  placeholder = '选择负责人 / 协作人',
}: WorkItemMemberPickerProps) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const memberSet = useMemo(() => new Set(projectMemberIds), [projectMemberIds])

  const assigneeUser = useMemo(
    () => userOptions.find((user) => user.id === assigneeUserId) || null,
    [userOptions, assigneeUserId],
  )
  const collaboratorUsers = useMemo(
    () => collaboratorUserIds
      .map((id) => userOptions.find((user) => user.id === id))
      .filter((user): user is UserOptionItem => Boolean(user)),
    [userOptions, collaboratorUserIds],
  )
  const displayCollaborators = collaboratorUsers.slice(0, 4)
  const hiddenCollaboratorCount = Math.max(0, collaboratorUsers.length - displayCollaborators.length)

  const { projectMembers, enterpriseMembers } = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const filtered = keyword
      ? userOptions.filter(
          (user) =>
            user.nickname.toLowerCase().includes(keyword) ||
            user.username.toLowerCase().includes(keyword),
        )
      : userOptions
    const pm: UserOptionItem[] = []
    const em: UserOptionItem[] = []
    filtered.forEach((user) => {
      if (memberSet.has(user.id)) pm.push(user)
      else em.push(user)
    })
    return { projectMembers: pm, enterpriseMembers: em }
  }, [memberSet, search, userOptions])

  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  /**
   * 统一输出成员字段，保证同一个用户不会同时是负责人和协作人。
   */
  const emitChange = (nextAssigneeUserId: number | null, nextCollaboratorUserIds: number[]) => {
    onChange({
      assigneeUserId: nextAssigneeUserId,
      collaboratorUserIds: Array.from(new Set(nextCollaboratorUserIds)).filter((id) => id !== nextAssigneeUserId),
    })
  }

  const setAssignee = (userId: number | null) => {
    emitChange(userId, collaboratorUserIds)
  }

  const toggleCollaborator = (userId: number) => {
    if (userId === assigneeUserId) return
    const next = collaboratorUserIds.includes(userId)
      ? collaboratorUserIds.filter((id) => id !== userId)
      : [...collaboratorUserIds, userId]
    emitChange(assigneeUserId, next)
  }

  const renderRows = (users: UserOptionItem[]) => users.map((user) => {
    const isAssignee = user.id === assigneeUserId
    const isCollaborator = collaboratorUserIds.includes(user.id)
    return (
      <div key={user.id} className={cn(
        'flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--color-bg-hover)]',
        (isAssignee || isCollaborator) && 'bg-[var(--color-primary-light)]/60',
      )}>
        <UserAvatar user={user} size={24} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-[var(--color-text-primary)]">{user.nickname || user.username}</div>
          <div className="truncate text-[11px] text-[var(--color-text-tertiary)]">{user.username}</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAssignee(isAssignee ? null : user.id)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] transition-colors',
              isAssignee
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border-light)] bg-white text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]',
            )}
          >
            {isAssignee && <Check className="h-3 w-3" />}
            负责人
          </button>
          <button
            type="button"
            onClick={() => toggleCollaborator(user.id)}
            disabled={isAssignee}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-45',
              isCollaborator
                ? 'bg-emerald-500 text-white'
                : 'border border-[var(--color-border-light)] bg-white text-[var(--color-text-secondary)] hover:text-emerald-600',
            )}
          >
            {isCollaborator && <Check className="h-3 w-3" />}
            协作人
          </button>
        </div>
      </div>
    )
  })

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex min-h-10 items-center rounded-lg border bg-white px-3 py-2 transition-all duration-150 text-left gap-2',
          'hover:border-[var(--color-border-strong)]',
          open
            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20'
            : 'border-[var(--color-border-strong)]',
        )}
      >
        {assigneeUser || collaboratorUsers.length ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {assigneeUser ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <UserAvatar user={assigneeUser} size={22} />
                <span className="truncate text-[13px] text-[var(--color-text-primary)]">
                  {assigneeUser.nickname || assigneeUser.username}
                </span>
              </span>
            ) : (
              <span className="text-[13px] text-[var(--color-text-placeholder)]">未分配负责人</span>
            )}
            {displayCollaborators.length > 0 && (
              <span className="flex items-center -space-x-1">
                {displayCollaborators.map((user) => (
                  <span key={user.id} title={user.nickname || user.username} className="rounded-full border border-white">
                    <UserAvatar user={user} size={22} />
                  </span>
                ))}
                {hiddenCollaboratorCount > 0 && (
                  <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-white bg-[var(--color-bg-hover)] px-1 text-[10px] text-[var(--color-text-tertiary)]">
                    +{hiddenCollaboratorCount}
                  </span>
                )}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-[13px] text-[var(--color-text-placeholder)]">
            <Users className="h-4 w-4" />
            {placeholder}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[420px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-fadeIn">
          <div className="border-b border-[var(--color-border-light)] p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索成员..."
              className="h-8 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => setAssignee(null)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)]"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <User className="h-3.5 w-3.5" />
              </span>
              清空负责人
            </button>
            {projectMembers.length > 0 && (
              <>
                <GroupLabel label="项目成员" />
                {renderRows(projectMembers)}
              </>
            )}
            {enterpriseMembers.length > 0 && (
              <>
                <GroupLabel label="企业成员" />
                {renderRows(enterpriseMembers)}
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

export const UserAvatar = ({ user, size = 20 }: { user: UserOptionItem; size?: number }) => {
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
        <UserAvatar user={user} size={24} />
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
