import { Archive, MessageSquarePlus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/src/components/common/Button'
import { cn } from '@/src/lib/utils'
import type { HermesConversationSessionSummaryItem } from '@/src/types/hermes'

interface HermesSessionSidebarProps {
  sessions: HermesConversationSessionSummaryItem[]
  selectedSessionId: number | null
  archivedView: boolean
  loading: boolean
  loadingMore: boolean
  canLoadMore: boolean
  disabled: boolean
  onCreate: () => void
  onSelect: (sessionId: number) => void
  onToggleArchivedView: (archived: boolean) => void
  onLoadMore: () => void
  onRename: (session: HermesConversationSessionSummaryItem) => void
  onArchive: (session: HermesConversationSessionSummaryItem) => void
  onRestore: (session: HermesConversationSessionSummaryItem) => void
  onDelete: (session: HermesConversationSessionSummaryItem) => void
}

export const HermesSessionSidebar = ({
  sessions,
  selectedSessionId,
  archivedView,
  loading,
  loadingMore,
  canLoadMore,
  disabled,
  onCreate,
  onSelect,
  onToggleArchivedView,
  onLoadMore,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: HermesSessionSidebarProps) => (
  <aside className="flex h-full min-h-0 w-full flex-col border-r border-[var(--color-border-light)] bg-[var(--color-bg-sidebar)] md:w-[280px]">
    <div className="flex-shrink-0 border-b border-[var(--color-border-light)] p-3">
      <Button
        type="button"
        size="sm"
        className="w-full"
        icon={<MessageSquarePlus className="h-4 w-4" />}
        disabled={disabled}
        onClick={onCreate}
      >
        新建会话
      </Button>
      <div className="mt-3 grid grid-cols-2 rounded-lg bg-[var(--color-bg-hover)] p-1">
        <button
          type="button"
          className={cn(
            'rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors',
            !archivedView ? 'bg-white text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]' : 'text-[var(--color-text-secondary)]',
          )}
          disabled={disabled}
          onClick={() => onToggleArchivedView(false)}
        >
          当前
        </button>
        <button
          type="button"
          className={cn(
            'rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors',
            archivedView ? 'bg-white text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]' : 'text-[var(--color-text-secondary)]',
          )}
          disabled={disabled}
          onClick={() => onToggleArchivedView(true)}
        >
          已归档
        </button>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {loading ? (
        <div className="rounded-lg border border-[var(--color-border-light)] bg-white px-3 py-4 text-center text-[13px] text-[var(--color-text-tertiary)]">
          正在加载会话...
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-3 py-5 text-center text-[13px] text-[var(--color-text-tertiary)]">
          {archivedView ? '暂无已归档会话' : '暂无会话记录'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group rounded-lg border bg-white transition-colors',
                selectedSessionId === session.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-lighter)]'
                  : 'border-[var(--color-border-light)] hover:border-[var(--color-border-strong)]',
              )}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left"
                disabled={disabled}
                onClick={() => onSelect(session.id)}
              >
                <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {session.title || '新会话'}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
                  {session.latestPreview || '尚未开始聊天'}
                </div>
              </button>
              <div className="flex items-center justify-between border-t border-[var(--color-border-light)] px-2 py-1">
                <button
                  type="button"
                  className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]"
                  disabled={disabled}
                  onClick={() => onRename(session)}
                >
                  重命名
                </button>
                <div className="flex items-center gap-1">
                  {session.archived ? (
                    <button type="button" title="恢复" disabled={disabled} onClick={() => onRestore(session)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-white hover:text-[var(--color-primary)]">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button type="button" title="归档" disabled={disabled} onClick={() => onArchive(session)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-white hover:text-[var(--color-primary)]">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" title="删除" disabled={disabled} onClick={() => onDelete(session)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {canLoadMore && (
            <Button type="button" variant="secondary" size="sm" className="w-full" loading={loadingMore} onClick={onLoadMore}>
              查看更多
            </Button>
          )}
        </div>
      )}
    </div>
  </aside>
)
