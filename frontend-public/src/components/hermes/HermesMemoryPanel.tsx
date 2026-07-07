import { Download, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import {
  clearHermesUserMemories,
  consolidateHermesUserMemories,
  deleteHermesFileLibraryItem,
  deleteHermesUserMemory,
  downloadHermesFileLibraryAsset,
  getHermesMemoryConsolidationStatus,
  listHermesFileLibraryItems,
  listHermesUserMemories,
  reindexHermesFileLibraryItem,
  updateHermesFileLibraryItem,
  uploadHermesFileLibraryItem,
} from '@/src/api/hermes'
import { getErrorMessage } from '@/src/lib/utils'
import type { HermesFileLibraryItem, HermesMemoryFactItem, HermesUserMemoryItem } from '@/src/types/hermes'

interface HermesMemoryPanelProps {
  onClose: () => void
}

export const HermesMemoryPanel = ({ onClose }: HermesMemoryPanelProps) => {
  const [knowledgeTab, setKnowledgeTab] = useState<'memory' | 'fileLibrary'>('memory')
  const [tab, setTab] = useState<'conversation' | 'fact'>('conversation')
  const [query, setQuery] = useState('')
  const [fileQuery, setFileQuery] = useState('')
  const [conversationMemories, setConversationMemories] = useState<HermesUserMemoryItem[]>([])
  const [facts, setFacts] = useState<HermesMemoryFactItem[]>([])
  const [fileItems, setFileItems] = useState<HermesFileLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [fileWorkingId, setFileWorkingId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<HermesUserMemoryItem | null>(null)
  const [fileDeleteTarget, setFileDeleteTarget] = useState<HermesFileLibraryItem | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadMemories = async (nextQuery = query) => {
    setLoading(true)
    setError('')
    try {
      const data = await listHermesUserMemories(nextQuery, 50)
      setConversationMemories(data.conversationMemories || [])
      setFacts(data.consolidatedFacts || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const loadFiles = async (nextQuery = fileQuery) => {
    setLoading(true)
    setError('')
    try {
      setFileItems(await listHermesFileLibraryItems(nextQuery))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMemories('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (knowledgeTab === 'fileLibrary') loadFiles('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledgeTab])

  const confirmDeleteMemory = async () => {
    if (!deleteTarget) return
    setConfirmLoading(true)
    setError('')
    try {
      await deleteHermesUserMemory(deleteTarget.documentId)
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
      await clearHermesUserMemories()
      setClearConfirmOpen(false)
      await loadMemories()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setConfirmLoading(false)
    }
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      await uploadHermesFileLibraryItem(file)
      await loadFiles()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const toggleFile = async (item: HermesFileLibraryItem) => {
    setFileWorkingId(item.id)
    setError('')
    try {
      await updateHermesFileLibraryItem(item.id, { enabled: !item.enabled })
      await loadFiles()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setFileWorkingId(null)
    }
  }

  const reindexFile = async (item: HermesFileLibraryItem) => {
    setFileWorkingId(item.id)
    setError('')
    try {
      await reindexHermesFileLibraryItem(item.id)
      await loadFiles()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setFileWorkingId(null)
    }
  }

  const downloadFile = async (item: HermesFileLibraryItem) => {
    setFileWorkingId(item.id)
    setError('')
    try {
      await downloadHermesFileLibraryAsset(item.assetId, item.fileName || item.title || `file-${item.assetId}`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setFileWorkingId(null)
    }
  }

  const confirmDeleteFile = async () => {
    if (!fileDeleteTarget) return
    setConfirmLoading(true)
    setError('')
    try {
      await deleteHermesFileLibraryItem(fileDeleteTarget.id)
      setFileDeleteTarget(null)
      await loadFiles()
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
      const task = await consolidateHermesUserMemories()
      for (let index = 0; index < 20; index += 1) {
        const status = await getHermesMemoryConsolidationStatus(task.operationId)
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
            <div className="text-[15px] font-semibold text-[var(--color-text-primary)]">知识</div>
            <div className="text-[12px] text-[var(--color-text-tertiary)]">管理 Hermes 会话记忆和个人文件库。</div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            返回
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid w-full grid-cols-2 rounded-lg bg-[var(--color-bg-hover)] p-1 sm:w-[240px]">
            <button type="button" className={knowledgeTab === 'memory' ? activeTabClass : tabClass} onClick={() => setKnowledgeTab('memory')}>
              会话记忆
            </button>
            <button type="button" className={knowledgeTab === 'fileLibrary' ? activeTabClass : tabClass} onClick={() => setKnowledgeTab('fileLibrary')}>
              文件库
            </button>
          </div>
          {knowledgeTab === 'memory' && <div className="grid w-full grid-cols-2 rounded-lg bg-[var(--color-bg-hover)] p-1 sm:w-[240px]">
            <button type="button" className={tab === 'conversation' ? activeTabClass : tabClass} onClick={() => setTab('conversation')}>
              原始记忆
            </button>
            <button type="button" className={tab === 'fact' ? activeTabClass : tabClass} onClick={() => setTab('fact')}>
              整理摘要
            </button>
          </div>}
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
            <Search className="h-4 w-4 text-[var(--color-text-tertiary)]" />
            <input
              value={knowledgeTab === 'memory' ? query : fileQuery}
              placeholder={knowledgeTab === 'memory' ? '搜索记忆' : '搜索文件库'}
              className="w-full border-0 bg-transparent text-[13px] outline-none"
              onChange={(event) => {
                if (knowledgeTab === 'memory') {
                  setQuery(event.target.value)
                  loadMemories(event.target.value)
                } else {
                  setFileQuery(event.target.value)
                  loadFiles(event.target.value)
                }
              }}
            />
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        {loading ? (
          <div className="text-center text-[13px] text-[var(--color-text-tertiary)]">正在加载...</div>
        ) : knowledgeTab === 'fileLibrary' ? (
          fileItems.length ? (
            <div className="space-y-3">
              {fileItems.map((item) => (
                <article key={item.id} className="rounded-lg border border-[var(--color-border-light)] p-3">
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">
                    {item.sourceFormat || 'FILE'} · {resolveFileLibraryStatusText(item)}
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-[var(--color-text-primary)]">{item.title || item.fileName}</div>
                  {item.warnings.length > 0 && <p className="mt-2 text-[12px] leading-5 text-amber-700">转换警告：{item.warnings.join('；')}</p>}
                  {item.lastError && <p className="mt-2 text-[12px] leading-5 text-red-700">切片/向量化失败：{item.lastError}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="text-[12px] text-[var(--color-primary)]" disabled={fileWorkingId === item.id} onClick={() => toggleFile(item)}>
                      {item.enabled ? '停用' : '启用'}
                    </button>
                    <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-primary)]" disabled={fileWorkingId === item.id} onClick={() => reindexFile(item)}>
                      <RefreshCw className="h-3.5 w-3.5" /> 重新向量化
                    </button>
                    <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-secondary)]" disabled={fileWorkingId === item.id} onClick={() => downloadFile(item)}>
                      <Download className="h-3.5 w-3.5" /> 下载
                    </button>
                    <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-danger)]" onClick={() => setFileDeleteTarget(item)}>
                      <Trash2 className="h-3.5 w-3.5" /> 删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
              暂无个人知识文件
            </div>
          )
        ) : tab === 'conversation' ? (
          conversationMemories.length ? (
            <div className="space-y-3">
              {conversationMemories.map((memory) => (
                <article key={memory.documentId} className="rounded-lg border border-[var(--color-border-light)] p-3">
                  <div className="text-[12px] text-[var(--color-text-tertiary)]">{memory.scene || '会话记忆'}</div>
                  <div className="mt-1 text-[13px] font-semibold text-[var(--color-text-primary)]">{memory.question || memory.title}</div>
                  <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[var(--color-text-secondary)]">{memory.answer || memory.snippet}</p>
                  <button type="button" className="mt-2 inline-flex items-center gap-1 text-[12px] text-[var(--color-danger)]" onClick={() => setDeleteTarget(memory)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
              暂无会话记忆
            </div>
          )
        ) : facts.length ? (
          <div className="space-y-3">
            {facts.map((fact) => (
              <article key={fact.id} className="rounded-lg border border-[var(--color-border-light)] p-3">
                <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{fact.summary || '未生成摘要'}</div>
                <div className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{[fact.subject, fact.predicate, fact.object].filter(Boolean).join(' · ')}</div>
                {fact.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {fact.tags.slice(0, 6).map((tag) => (
                      <span key={`${fact.id}-${tag}`} className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">{tag}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
            暂无整理后摘要
          </div>
        )}
      </div>
      <div className="flex flex-shrink-0 justify-end gap-2 border-t border-[var(--color-border-light)] p-3">
        {knowledgeTab === 'fileLibrary' && (
          <>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.pptx,.xlsx" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) uploadFile(file)
            }} />
            <Button type="button" size="sm" loading={uploading} icon={<Upload className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
              上传文件
            </Button>
          </>
        )}
        {knowledgeTab === 'memory' && (
          <>
        <Button type="button" variant="secondary" size="sm" loading={working} onClick={consolidate}>
          整理记忆
        </Button>
        {conversationMemories.length > 0 && (
          <Button type="button" variant="danger" size="sm" onClick={() => setClearConfirmOpen(true)}>
            清空全部
          </Button>
        )}
          </>
        )}
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
        description="确认清空全部 Hermes 会话记忆吗？整理后的摘要不会在这里单独删除。"
        variant="danger"
        confirmText="清空"
        loading={confirmLoading}
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={confirmClearAll}
      />
      <ConfirmDialog
        open={Boolean(fileDeleteTarget)}
        title="删除文件"
        description={<>确定要删除文件「{fileDeleteTarget?.title || fileDeleteTarget?.fileName || '未命名文件'}」吗？</>}
        variant="danger"
        confirmText="删除"
        loading={confirmLoading}
        onCancel={() => setFileDeleteTarget(null)}
        onConfirm={confirmDeleteFile}
      />
    </div>
  )
}

const tabClass = 'rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)]'
const activeTabClass = 'rounded-md bg-white px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]'

const resolveFileLibraryStatusText = (item: HermesFileLibraryItem) => {
  const status = (item.indexStatus || '').toUpperCase()
  if (!item.enabled) return '已停用（不参与召回）'
  if (status === 'INDEXED') return '切片向量化完成'
  if (status === 'FAILED') return '切片向量化失败，请重新向量化'
  if (status === 'PENDING') return '切片向量化中'
  return '切片向量化状态未知，请重新向量化'
}
