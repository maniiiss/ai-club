/**
 * 聊天室房间列表。
 * 业务意图：让用户快速在项目房间与全局邀请房间之间切换，并保留最近消息线索。
 */
import { MessageSquare, Plus, Search, Users, FolderKanban } from 'lucide-react'
import type { ChatRoomItem } from '@/src/types/chat'
import { Button } from '@/src/components/common/Button'
import { cn, getInitials } from '@/src/lib/utils'

type RoomFilter = 'all' | 'project' | 'global'

interface ChatRoomListProps {
  rooms: ChatRoomItem[]
  selectedRoomId: number | null
  keyword: string
  filter: RoomFilter
  loading: boolean
  onKeywordChange: (keyword: string) => void
  onFilterChange: (filter: RoomFilter) => void
  onSelectRoom: (room: ChatRoomItem) => void
  onCreateRoom: () => void
}

const filterTabs: { value: RoomFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'project', label: '项目' },
  { value: 'global', label: '全局' },
]

const formatRoomTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const ChatRoomList = ({
  rooms,
  selectedRoomId,
  keyword,
  filter,
  loading,
  onKeywordChange,
  onFilterChange,
  onSelectRoom,
  onCreateRoom,
}: ChatRoomListProps) => {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-border-light)] p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[18px] font-bold text-[var(--color-text-primary)]">聊天室</h1>
          </div>
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={onCreateRoom}
            className="px-2.5"
          >
            新建
          </Button>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索房间"
            className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] text-[var(--color-text-primary)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--color-bg-hover)] p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onFilterChange(tab.value)}
              className={cn(
                'h-7 rounded-md text-[12px] font-medium transition-colors',
                filter === tab.value
                  ? 'bg-white text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="px-3 py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">加载房间中...</div>
        ) : rooms.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-5 text-center">
            <MessageSquare className="mb-3 h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
            <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">暂无可见房间</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
              创建项目房间或邀请成员进入全局房间。
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {rooms.map((room) => {
              const isProjectRoom = room.visibilityType === 'PROJECT'
              const active = selectedRoomId === room.id
              return (
                <button
                  key={room.id}
                  onClick={() => onSelectRoom(room)}
                  className={cn(
                    'group w-full rounded-lg px-3 py-2.5 text-left transition-all',
                    active
                      ? 'bg-[var(--color-primary-light)] ring-1 ring-[var(--color-primary)]/20'
                      : 'hover:bg-[var(--color-bg-hover)]',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold',
                        isProjectRoom
                          ? 'bg-sky-50 text-sky-700'
                          : 'bg-emerald-50 text-emerald-700',
                      )}
                    >
                      {isProjectRoom ? <FolderKanban className="h-4 w-4" /> : getInitials(room.title)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-[var(--color-text-primary)]">{room.title}</p>
                        <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
                          {formatRoomTime(room.lastMessageAt || room.updatedAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={cn(
                            'inline-flex max-w-[130px] items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                            isProjectRoom ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700',
                          )}
                        >
                          {isProjectRoom ? room.projectName || '项目房间' : '全局邀请'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                          <Users className="h-3 w-3" />
                          {room.members.length || (isProjectRoom ? '项目成员' : 0)}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
                        {room.latestPreview || room.historySummary || '还没有消息'}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
