/**
 * 创建聊天室弹窗。
 * 业务意图：项目房间继承项目参与人可见规则；全局房间必须显式邀请成员。
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { FolderKanban, Search, Users, X } from 'lucide-react'
import { createChatRoom } from '@/src/api/chat'
import { listProjectOptions } from '@/src/api/projects'
import { listUserOptions, type UserOptionItem } from '@/src/api/users'
import type { ChatRoomItem } from '@/src/types/chat'
import type { ProjectItem } from '@/src/types/project'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { cn, getErrorMessage, getInitials } from '@/src/lib/utils'

interface ChatRoomDialogProps {
  onClose: () => void
  onCreated: (room: ChatRoomItem) => void
}

type RoomMode = 'project' | 'global'

export const ChatRoomDialog = ({ onClose, onCreated }: ChatRoomDialogProps) => {
  const [mode, setMode] = useState<RoomMode>('project')
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [projectOptions, setProjectOptions] = useState<ProjectItem[]>([])
  const [userOptions, setUserOptions] = useState<UserOptionItem[]>([])
  const [userKeyword, setUserKeyword] = useState('')
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoadingOptions(true)
    Promise.all([listProjectOptions(), listUserOptions()])
      .then(([projects, users]) => {
        if (!alive) return
        setProjectOptions(projects)
        setUserOptions(users.filter((user) => user.enabled))
      })
      .catch((err) => {
        if (alive) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (alive) setLoadingOptions(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const filteredUsers = useMemo(() => {
    const keyword = userKeyword.trim().toLowerCase()
    if (!keyword) return userOptions
    return userOptions.filter((user) => {
      const displayName = user.nickname || user.username
      return displayName.toLowerCase().includes(keyword) || user.username.toLowerCase().includes(keyword)
    })
  }, [userKeyword, userOptions])

  const toggleUser = (userId: number) => {
    setSelectedUserIds((current) => (
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    ))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError('请输入房间标题')
      return
    }
    if (mode === 'project' && !projectId) {
      setError('请选择项目')
      return
    }
    if (mode === 'global' && selectedUserIds.length === 0) {
      setError('全局房间至少邀请一名成员')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const room = await createChatRoom({
        title: normalizedTitle,
        projectId: mode === 'project' ? Number(projectId) : null,
        invitedUserIds: mode === 'global' ? selectedUserIds : [],
      })
      onCreated(room)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
        <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-5 py-4">
          <div>
            <h2 className="text-[18px] font-bold text-[var(--color-text-primary)]">创建聊天室</h2>
            <p className="text-[12px] text-[var(--color-text-tertiary)]">选择项目上下文，或建立全局邀请制协作空间。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            title="关闭"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form id="chat-room-create-form" onSubmit={handleSubmit} className="min-h-0 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-100 bg-[var(--color-danger-light)] px-3 py-2 text-[13px] text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-bg-hover)] p-1">
            <button
              type="button"
              onClick={() => setMode('project')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                mode === 'project' ? 'bg-white text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]' : 'text-[var(--color-text-secondary)]',
              )}
            >
              <FolderKanban className="h-4 w-4" />
              项目房间
            </button>
            <button
              type="button"
              onClick={() => setMode('global')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                mode === 'global' ? 'bg-white text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]' : 'text-[var(--color-text-secondary)]',
              )}
            >
              <Users className="h-4 w-4" />
              全局邀请
            </button>
          </div>

          <div className="space-y-4">
            <Input
              label="房间标题 *"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={mode === 'project' ? '例如：版本 1.8 协作群' : '例如：跨项目需求讨论'}
              autoFocus
            />

            {mode === 'project' ? (
              <Select
                label="绑定项目 *"
                value={projectId}
                onChange={setProjectId}
                placeholder={loadingOptions ? '项目加载中...' : '选择项目'}
                disabled={loadingOptions}
                options={projectOptions.map((project) => ({
                  value: String(project.id),
                  label: project.name,
                  description: project.owner ? `负责人：${project.owner}` : undefined,
                }))}
                hint="项目房间对项目参与人可见，无需逐个邀请成员。"
              />
            ) : (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-page)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">邀请成员 *</label>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">已选 {selectedUserIds.length}</span>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <input
                    value={userKeyword}
                    onChange={(event) => setUserKeyword(event.target.value)}
                    placeholder="搜索成员"
                    className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  />
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {filteredUsers.map((user) => {
                    const displayName = user.nickname || user.username
                    const selected = selectedUserIds.includes(user.id)
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          selected ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'hover:bg-white',
                        )}
                      >
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={displayName} className="h-7 w-7 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[12px] font-semibold text-[var(--color-text-secondary)]">
                            {getInitials(displayName)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{displayName}</span>
                          <span className="block truncate text-[11px] text-[var(--color-text-tertiary)]">{user.username}</span>
                        </span>
                        <span className={cn('h-4 w-4 rounded border', selected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[var(--color-border-strong)] bg-white')} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border-light)] px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="chat-room-create-form" loading={saving}>
            创建
          </Button>
        </div>
      </div>
    </div>
  )
}
