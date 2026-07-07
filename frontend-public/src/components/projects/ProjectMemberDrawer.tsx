/**
 * 项目成员管理抽屉。
 * 业务意图：项目负责人、创建人或平台项目管理员可在项目空间内维护协作成员，
 * 不需要进入后台项目编辑页，也不修改项目基础资料。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Crown, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { replaceProjectMembers } from '@/src/api/projects'
import { listUserOptions, type UserOptionItem } from '@/src/api/users'
import { SlideDrawer, SlideDrawerFooter } from '@/src/components/common/SlideDrawer'
import { cn, getErrorMessage, getInitials } from '@/src/lib/utils'
import type { ProjectItem } from '@/src/types/project'

interface ProjectMemberDrawerProps {
  open: boolean
  project: ProjectItem
  onClose: () => void
  onSaved: (project: ProjectItem) => void
}

export const ProjectMemberDrawer = ({ open, project, onClose, onSaved }: ProjectMemberDrawerProps) => {
  const [users, setUsers] = useState<UserOptionItem[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const protectedIds = useMemo(
    () => new Set([project.ownerUserId, project.creatorUserId].filter((id): id is number => typeof id === 'number')),
    [project.creatorUserId, project.ownerUserId],
  )

  useEffect(() => {
    if (!open) return
    setSelectedIds(project.memberUserIds.filter((id) => !protectedIds.has(id)))
    setKeyword('')
    setError(null)
    setLoading(true)
    listUserOptions()
      .then((items) => setUsers(items.filter((item) => item.enabled)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [open, project.id, project.memberUserIds, protectedIds])

  const currentSelectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const filteredUsers = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return users
      .filter((user) => !protectedIds.has(user.id))
      .filter((user) => {
        if (!kw) return true
        return user.username.toLowerCase().includes(kw) || (user.nickname || '').toLowerCase().includes(kw)
      })
  }, [keyword, protectedIds, users])

  const selectedUsers = useMemo(
    () => users.filter((user) => currentSelectedSet.has(user.id)),
    [currentSelectedSet, users],
  )

  const toggleUser = (userId: number) => {
    setSelectedIds((prev) => (
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    ))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await replaceProjectMembers(project.id, selectedIds)
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const ownerName = project.owner?.trim() || '未分配负责人'
  const creatorMember = project.memberItems?.find((member) => member.id === project.creatorUserId)

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title="成员管理"
      description={project.name}
      maxWidth="620px"
      footer={
        <SlideDrawerFooter
          cancelText="取消"
          confirmText="保存成员"
          loading={saving}
          onCancel={onClose}
          onConfirm={handleSave}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-page)]">
        <section className="border-b border-[var(--color-border-light)] bg-white px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ProtectedPersonCard
              name={ownerName}
              label="项目负责人"
              avatarUrl={project.ownerAvatarUrl || null}
              icon={<Crown className="h-4 w-4" />}
            />
            <ProtectedPersonCard
              name={creatorMember?.name || '项目创建人'}
              label="项目创建人"
              avatarUrl={creatorMember?.avatarUrl || null}
              icon={<ShieldCheck className="h-4 w-4" />}
            />
          </div>
          <p className="mt-3 text-[12px] leading-5 text-[var(--color-text-tertiary)]">
            负责人和创建人会自动拥有项目访问权，不在协作成员列表里重复维护。
          </p>
        </section>

        <section className="flex min-h-0 flex-1 flex-col px-6 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">协作成员</h3>
              <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">已选择 {selectedIds.length} 人</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索成员"
                className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}

          {selectedUsers.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleUser(user.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white py-1 pl-1 pr-2 text-[12px] text-[var(--color-text-secondary)] shadow-[var(--shadow-xs)] transition-colors hover:border-red-200 hover:text-red-600"
                >
                  <UserAvatar name={displayUserName(user)} avatarUrl={user.avatarUrl} size="sm" />
                  {displayUserName(user)}
                  <X className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-[13px] text-[var(--color-text-tertiary)]">
                加载成员候选中…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                <UserPlus className="h-6 w-6 text-[var(--color-text-tertiary)]" />
                <p className="text-[13px] text-[var(--color-text-secondary)]">没有匹配的成员</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-light)]">
                {filteredUsers.map((user) => {
                  const selected = currentSelectedSet.has(user.id)
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUser(user.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    >
                      <UserAvatar name={displayUserName(user)} avatarUrl={user.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[var(--color-text-primary)]">
                          {displayUserName(user)}
                        </span>
                        <span className="block truncate text-[12px] text-[var(--color-text-tertiary)]">
                          {user.username}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
                          selected
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                            : 'border-[var(--color-border-strong)] bg-white text-transparent',
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </SlideDrawer>
  )
}

const displayUserName = (user: UserOptionItem) => user.nickname?.trim() || user.username

const ProtectedPersonCard = ({
  name,
  label,
  avatarUrl,
  icon,
}: {
  name: string
  label: string
  avatarUrl: string | null
  icon: ReactNode
}) => (
  <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
    <UserAvatar name={name} avatarUrl={avatarUrl} />
    <div className="min-w-0 flex-1">
      <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{name}</div>
      <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
        {icon}
        {label}
      </div>
    </div>
  </div>
)

const UserAvatar = ({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string
  avatarUrl: string | null
  size?: 'sm' | 'md'
}) => {
  const classes = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-[12px]'
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={cn(classes, 'rounded-full object-cover')} />
  }
  return (
    <span className={cn(classes, 'inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] font-semibold text-[var(--color-primary)]')}>
      {getInitials(name)}
    </span>
  )
}
