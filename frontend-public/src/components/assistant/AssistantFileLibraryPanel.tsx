import { Download, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import {
  deleteAssistantFileLibraryItem,
  downloadAssistantFileLibraryAsset,
  listAssistantFileLibraryItems,
  reindexAssistantFileLibraryItem,
  updateAssistantFileLibraryItem,
  uploadAssistantFileLibraryItem,
} from '@/src/api/assistant'
import { getErrorMessage } from '@/src/lib/utils'
import type { AssistantFileLibraryItem } from '@/src/types/assistant'

interface AssistantFileLibraryPanelProps {
  onClose: () => void
}

/**
 * GitPilot 个人文件库面板。
 * 业务意图：文件上传、召回和向量化管理属于独立能力，不再挤占记忆面板空间。
 */
export const AssistantFileLibraryPanel = ({ onClose }: AssistantFileLibraryPanelProps) => {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AssistantFileLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [workingId, setWorkingId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssistantFileLibraryItem | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = async (nextQuery = query) => {
    setLoading(true)
    setError('')
    try {
      setItems(await listAssistantFileLibraryItems(nextQuery))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFiles('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uploadFile = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      await uploadAssistantFileLibraryItem(file)
      await loadFiles()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const toggleFile = async (item: AssistantFileLibraryItem) => {
    setWorkingId(item.id)
    setError('')
    try {
      await updateAssistantFileLibraryItem(item.id, { enabled: !item.enabled })
      await loadFiles()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorkingId(null)
    }
  }

  const reindexFile = async (item: AssistantFileLibraryItem) => {
    setWorkingId(item.id)
    setError('')
    try {
      await reindexAssistantFileLibraryItem(item.id)
      await loadFiles()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorkingId(null)
    }
  }

  const downloadFile = async (item: AssistantFileLibraryItem) => {
    setWorkingId(item.id)
    setError('')
    try {
      await downloadAssistantFileLibraryAsset(item.assetId, item.fileName || item.title || `file-${item.assetId}`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorkingId(null)
    }
  }

  const confirmDeleteFile = async () => {
    if (!deleteTarget) return
    setConfirmLoading(true)
    setError('')
    try {
      await deleteAssistantFileLibraryItem(deleteTarget.id)
      setDeleteTarget(null)
      await loadFiles()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex-shrink-0 border-b border-[var(--color-border-light)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-semibold text-[var(--color-text-primary)]">文件库</div>
            <div className="text-[12px] text-[var(--color-text-tertiary)]">管理 GitPilot 回答时可以召回的个人文件。</div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>返回</Button>
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
          <Search className="h-4 w-4 text-[var(--color-text-tertiary)]" />
          <input
            value={query}
            placeholder="搜索文件库"
            className="w-full border-0 bg-transparent text-[13px] outline-none"
            onChange={(event) => {
              setQuery(event.target.value)
              void loadFiles(event.target.value)
            }}
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        {loading ? (
          <div className="text-center text-[13px] text-[var(--color-text-tertiary)]">正在加载...</div>
        ) : items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-lg border border-[var(--color-border-light)] p-3">
                <div className="text-[12px] text-[var(--color-text-tertiary)]">{item.sourceFormat || 'FILE'} · {resolveFileLibraryStatusText(item)}</div>
                <div className="mt-1 text-[13px] font-semibold text-[var(--color-text-primary)]">{item.title || item.fileName}</div>
                {item.warnings.length > 0 && <p className="mt-2 text-[12px] leading-5 text-amber-700">转换警告：{item.warnings.join('；')}</p>}
                {item.lastError && <p className="mt-2 text-[12px] leading-5 text-red-700">切片/向量化失败：{item.lastError}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="text-[12px] text-[var(--color-primary)]" disabled={workingId === item.id} onClick={() => void toggleFile(item)}>{item.enabled ? '停用' : '启用'}</button>
                  <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-primary)]" disabled={workingId === item.id} onClick={() => void reindexFile(item)}><RefreshCw className="h-3.5 w-3.5" />重新向量化</button>
                  <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-secondary)]" disabled={workingId === item.id} onClick={() => void downloadFile(item)}><Download className="h-3.5 w-3.5" />下载</button>
                  <button type="button" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-danger)]" onClick={() => setDeleteTarget(item)}><Trash2 className="h-3.5 w-3.5" />删除</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-[13px] text-[var(--color-text-tertiary)]">暂无个人知识文件</div>}
      </div>
      <div className="flex flex-shrink-0 justify-end border-t border-[var(--color-border-light)] p-3">
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.pptx,.xlsx" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void uploadFile(file)
        }} />
        <Button type="button" size="sm" loading={uploading} icon={<Upload className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>上传文件</Button>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除文件"
        description={<>确定要删除文件「{deleteTarget?.title || deleteTarget?.fileName || '未命名文件'}」吗？</>}
        variant="danger"
        confirmText="删除"
        loading={confirmLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteFile}
      />
    </div>
  )
}

const resolveFileLibraryStatusText = (item: AssistantFileLibraryItem) => {
  const status = (item.indexStatus || '').toUpperCase()
  if (!item.enabled) return '已停用（不参与召回）'
  if (status === 'INDEXED') return '切片向量化完成'
  if (status === 'FAILED') return '切片向量化失败，请重新向量化'
  if (status === 'PENDING') return '切片向量化中'
  return '切片向量化状态未知，请重新向量化'
}
