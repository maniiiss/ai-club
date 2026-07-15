import { Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import {
  clearAssistantUserMemories,
  consolidateAssistantUserMemories,
  deleteAssistantUserMemory,
  getAssistantMemoryConsolidationStatus,
  listAssistantUserMemories,
} from '@/src/api/assistant'
import { getErrorMessage } from '@/src/lib/utils'
import type { AssistantMemoryFactItem, AssistantUserMemoryItem } from '@/src/types/assistant'

interface AssistantMemoryPanelProps {
  onClose: () => void
}

/**
 * GitPilot 记忆面板。
 * 业务意图：将用户长期记忆与文件库分离，降低“知识”入口的认知负担。
 */
export const AssistantMemoryPanel = ({ onClose }: AssistantMemoryPanelProps) => {
  const [tab, setTab] = useState<'conversation' | 'fact'>('conversation')
  const [query, setQuery] = useState('')
  const [conversationMemories, setConversationMemories] = useState<AssistantUserMemoryItem[]>([])
  const [facts, setFacts] = useState<AssistantMemoryFactItem[]>([])
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssistantUserMemoryItem | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [error, setError] = useState('')

  const loadMemories = async (nextQuery = query) => {
    setLoading(true)
    setError('')
    try {
      const data = await listAssistantUserMemories(nextQuery, 50)
      setConversationMemories(data.conversationMemories || [])
      setFacts(data.consolidatedFacts || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMemories('')
    // 只在面板首次打开时加载，输入搜索由事件直接触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirmDeleteMemory = async () => {
    if (!deleteTarget) return
    setConfirmLoading(true)
    setError('')
    try {
      await deleteAssistantUserMemory(deleteTarget.documentId)
      setDeleteTarget(null)
      await loadMemories()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setConfirmLoading(false)
    }
  }

  const confirmClearAll = async () => {
    if (!conversationMemories.length) return
    setConfirmLoading(true)
    setError('')
    try {
      await clearAssistantUserMemories()
      setClearConfirmOpen(false)
      await loadMemories()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setConfirmLoading(false)
    }
  }

  const consolidate = async () => {
    setWorking(true)
    setError('')
    try {
      const task = await consolidateAssistantUserMemories()
      for (let index = 0; index < 20; index += 1) {
        const status = await getAssistantMemoryConsolidationStatus(task.operationId)
        if (status.status === 'SUCCESS' || status.status === 'COMPLETED') break
        if (status.status === 'FAILED') throw new Error(status.errorMessage || '记忆整理失败')
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }
      await loadMemories()
      setTab('fact')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex-shrink-0 border-b border-[var(--color-border-light)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-semibold text-[var(--color-text-primary)]">记忆</div>
            <div className="text-[12px] text-[var(--color-text-tertiary)]">管理 GitPilot 从对话中沉淀的个人记忆。</div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>返回</Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid w-full grid-cols-2 rounded-lg bg-[var(--color-bg-hover)] p-1 sm:w-[240px]">
            <button type="button" className={tab === 'conversation' ? activeTabClass : tabClass} onClick={() => setTab('conversation')}>原始记忆</button>
            <button type="button" className={tab === 'fact' ? activeTabClass : tabClass} onClick={() => setTab('fact')}>整理摘要</button>
          </div>
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
            <Search className="h-4 w-4 text-[var(--color-text-tertiary)]" />
            <input
              value={query}
              placeholder="搜索记忆"
              className="w-full border-0 bg-transparent text-[13px] outline-none"
              onChange={(event) => {
                setQuery(event.target.value)
                void loadMemories(event.target.value)
              }}
            />
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        {loading ? (
          <div className="text-center text-[13px] text-[var(--color-text-tertiary)]">正在加载...</div>
        ) : tab === 'conversation' ? (
          conversationMemories.length ? (
            <div className="space-y-3">
              {conversationMemories.map((memory) => (
                <article key={memory.documentId} className="rounded-lg border border-[var(--color-border-light)] p-3">
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">{memory.scene || '会话记忆'}</div>
                  <div className="mt-1 text-[13px] font-semibold text-[var(--color-text-primary)]">{memory.question || memory.title}</div>
                  <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[var(--color-text-secondary)]">{memory.answer || memory.snippet}</p>
                  <button type="button" className="mt-2 inline-flex items-center gap-1 text-[12px] text-[var(--color-danger)]" onClick={() => setDeleteTarget(memory)}>
                    <Trash2 className="h-3.5 w-3.5" />删除
                  </button>
                </article>
              ))}
            </div>
          ) : <EmptyState text="暂无会话记忆" />
        ) : facts.length ? (
          <div className="space-y-3">
            {facts.map((fact) => (
              <article key={fact.id} className="rounded-lg border border-[var(--color-border-light)] p-3">
                <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{fact.summary || '未生成摘要'}</div>
                <div className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{[fact.subject, fact.predicate, fact.object].filter(Boolean).join(' · ')}</div>
                {fact.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{fact.tags.slice(0, 6).map((tag) => <span key={`${fact.id}-${tag}`} className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">{tag}</span>)}</div>}
              </article>
            ))}
          </div>
        ) : <EmptyState text="暂无整理后摘要" />}
      </div>
      <div className="flex flex-shrink-0 justify-end gap-2 border-t border-[var(--color-border-light)] p-3">
        <Button type="button" variant="secondary" size="sm" loading={working} onClick={consolidate}>整理记忆</Button>
        {conversationMemories.length > 0 && <Button type="button" variant="danger" size="sm" onClick={() => setClearConfirmOpen(true)}>清空全部</Button>}
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除记忆"
        description={<>确定要删除这条记忆「{deleteTarget?.question || deleteTarget?.title || '未命名记忆'}」吗？</>}
        variant="danger"
        confirmText="删除"
        loading={confirmLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteMemory}
      />
      <ConfirmDialog
        open={clearConfirmOpen}
        title="清空会话记忆"
        description="确认清空全部 GitPilot 会话记忆吗？整理后的摘要不会在这里单独删除。"
        variant="danger"
        confirmText="清空"
        loading={confirmLoading}
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={confirmClearAll}
      />
    </div>
  )
}

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[13px] text-[var(--color-text-tertiary)]">{text}</div>
)

const tabClass = 'rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)]'
const activeTabClass = 'rounded-md bg-white px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]'
