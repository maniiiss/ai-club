import { Archive, FileText, MessageSquarePlus, RotateCcw, Search, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/src/components/common/Button'
import { cn } from '@/src/lib/utils'
import type { AssistantConversationSearchResult, AssistantConversationSessionSummaryItem } from '@/src/types/assistant'

interface AssistantSessionSidebarProps {
  sessions: AssistantConversationSessionSummaryItem[]
  selectedSessionId: number | null
  archivedView: boolean
  loading: boolean
  loadingMore: boolean
  canLoadMore: boolean
  disabled: boolean
  searchQuery: string
  searchResults: AssistantConversationSearchResult[]
  searchLoading: boolean
  onSearchChange: (value: string) => void
  /** 文件库入口与当前项目的会话搜索保持同一组顶部导航，避免额外占用助手标题栏。 */
  onOpenFileLibrary: () => void
  /** 紧凑抽屉中的全局助手操作并入会话栏首行，避免渲染独立的空操作行。 */
  headerActions?: ReactNode
  onCreate: () => void
  onSelect: (sessionId: number) => void
  onSelectSearchResult: (result: AssistantConversationSearchResult) => void
  onLoadMore: () => void
  onRename: (session: AssistantConversationSessionSummaryItem) => void
  onArchive: (session: AssistantConversationSessionSummaryItem) => void
  onRestore: (session: AssistantConversationSessionSummaryItem) => void
  onDelete: (session: AssistantConversationSessionSummaryItem) => void
}

/**
 * 左侧会话导航。
 * 业务意图：让搜索、会话切换和会话管理集中在同一条窄侧栏中，减少空白操作行。
 */
export const AssistantSessionSidebar = ({
  sessions,
  selectedSessionId,
  archivedView,
  loading,
  loadingMore,
  canLoadMore,
  disabled,
  searchQuery,
  searchResults,
  searchLoading,
  onSearchChange,
  onOpenFileLibrary,
  headerActions,
  onCreate,
  onSelect,
  onSelectSearchResult,
  onLoadMore,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: AssistantSessionSidebarProps) => {
  const searching = searchQuery.trim().length > 0

  return (
    <aside data-guide-id="assistant-session-sidebar" className="flex h-full min-h-0 w-full flex-col border-r border-[var(--color-border-light)] bg-[var(--color-bg-sidebar)] md:w-[280px]">
      <div className="flex-shrink-0 space-y-2 border-b border-[var(--color-border-light)] p-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="min-w-0 flex-1"
            icon={<MessageSquarePlus className="h-4 w-4" />}
            disabled={disabled}
            onClick={onCreate}
          >
            新建会话
          </Button>
          {headerActions}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
          <Search className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" />
          <input
            type="search"
            value={searchQuery}
            placeholder="搜索聊天内容"
            aria-label="搜索聊天内容"
            className="min-w-0 w-full border-0 bg-transparent text-[13px] outline-none"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border-light)] bg-white px-3 py-2 text-left text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          onClick={onOpenFileLibrary}
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span>文件库</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {searching ? (
          searchLoading ? (
            <div className="rounded-lg border border-[var(--color-border-light)] bg-white px-3 py-4 text-center text-[13px] text-[var(--color-text-tertiary)]">
              正在搜索...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white px-3 py-5 text-center text-[13px] text-[var(--color-text-tertiary)]">
              没有找到匹配的聊天内容
            </div>
          ) : (
            <div className="space-y-1.5">
              {searchResults.map((result) => (
                <button
                  key={`${result.sessionId}-${result.matchedAt || result.matchedContent}`}
                  type="button"
                  className="block w-full rounded-lg border border-[var(--color-border-light)] bg-white px-3 py-2 text-left transition-colors hover:border-[var(--color-primary)]"
                  disabled={disabled}
                  onClick={() => onSelectSearchResult(result)}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                      {result.title || '新会话'}
                    </div>
                    {result.archived && <Archive className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" />}
                  </div>
                  <div className="mt-1 line-clamp-3 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
                    {result.matchedRole === 'assistant' ? 'GitPilot：' : '我：'}{result.matchedContent || '匹配会话标题'}
                  </div>
                </button>
              ))}
            </div>
          )
        ) : loading ? (
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
                </button>
                <div className="invisible flex max-h-0 items-center justify-between overflow-hidden border-t border-[var(--color-border-light)] px-2 py-0 opacity-0 transition-[max-height,opacity,padding] duration-200 group-hover:visible group-hover:max-h-10 group-hover:py-1 group-hover:opacity-100 group-focus-within:visible group-focus-within:max-h-10 group-focus-within:py-1 group-focus-within:opacity-100">
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
                      <button type="button" title="恢复" aria-label="恢复会话" disabled={disabled} onClick={() => onRestore(session)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-white hover:text-[var(--color-primary)]">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button type="button" title="归档" aria-label="归档会话" disabled={disabled} onClick={() => onArchive(session)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-white hover:text-[var(--color-primary)]">
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" title="删除" aria-label="删除会话" disabled={disabled} onClick={() => onDelete(session)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]">
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
}
