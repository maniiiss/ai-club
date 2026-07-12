import { useEffect, useState } from 'react'
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import { pageTaskUpdateRecords } from '@/src/api/planning'
import type { TaskUpdateRecord, TaskUpdateRecordDetail } from '@/src/types/planning'
import { formatDateTime } from '@/src/lib/utils'

const sourceLabels: Record<string, string> = { MANUAL: '人工', SYSTEM: '系统', AI: 'AI' }
const sourceClasses: Record<string, string> = {
  MANUAL: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
  SYSTEM: 'bg-slate-100 text-slate-600',
  AI: 'bg-amber-50 text-amber-700',
}

const displayValue = (value: string | null | undefined) => value?.trim() || '空'

const DetailValue = ({ value }: { value: string | null | undefined }) => {
  const text = displayValue(value)
  const [expanded, setExpanded] = useState(false)
  const long = text.length > 180
  const visible = !long || expanded ? text : `${text.slice(0, 180)}…`
  return (
    <span className="whitespace-pre-wrap break-words text-[12px] text-[var(--color-text-secondary)]">
      {visible}
      {long && (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="ml-1 text-[11px] font-medium text-[var(--color-primary)] hover:underline">
          {expanded ? '收起' : '展开'}
        </button>
      )}
    </span>
  )
}

const DetailRow = ({ detail }: { detail: TaskUpdateRecordDetail }) => (
  <div className="grid gap-1 rounded-lg bg-[var(--color-bg-page)] px-3 py-2 sm:grid-cols-[92px_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start sm:gap-2">
    <span className="text-[12px] font-medium text-[var(--color-text-primary)]">{detail.fieldName}</span>
    <DetailValue value={detail.oldValue} />
    <span className="hidden text-[11px] text-[var(--color-text-tertiary)] sm:block">→</span>
    <DetailValue value={detail.newValue} />
  </div>
)

export const WorkItemUpdateTimeline = ({ taskId, refreshKey = 0, onCountChange }: { taskId: number; refreshKey?: number; onCountChange?: (count: number) => void }) => {
  const [records, setRecords] = useState<TaskUpdateRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setPage(1)
    pageTaskUpdateRecords(taskId, { page: 1, size: 10 })
      .then((data) => {
        if (cancelled) return
        setRecords(data.records)
        setTotalPages(data.totalPages || 1)
        onCountChange?.(data.total || data.records.length)
      })
      .catch(() => { if (!cancelled) { setError(true); onCountChange?.(0) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [taskId, refreshKey])

  const loadMore = async () => {
    if (loadingMore || page >= totalPages) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const data = await pageTaskUpdateRecords(taskId, { page: nextPage, size: 10 })
      setRecords((current) => [...current, ...data.records])
      setPage(nextPage)
      setTotalPages(data.totalPages || totalPages)
      onCountChange?.(data.total || data.records.length)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section className="mt-6 border-t border-[var(--color-border-light)] pt-5">
      {error && !records.length ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-5 text-center text-[12px] text-[var(--color-text-tertiary)]">
          <RefreshCw className="mx-auto mb-2 h-4 w-4" />
          暂时无法加载更新记录
        </div>
      ) : !loading && !records.length ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-5 text-center text-[12px] text-[var(--color-text-tertiary)]">暂无更新记录</div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <article key={record.id} className="relative rounded-xl border border-[var(--color-border-light)] bg-white p-3.5 shadow-[var(--shadow-xs)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">{record.operatorName || '系统'}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceClasses[record.source] || sourceClasses.SYSTEM}`}>{sourceLabels[record.source] || record.source}</span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">{formatDateTime(record.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">{record.summary}</p>
              <div className="mt-2 space-y-1.5">
                {record.details.map((detail) => <DetailRow key={detail.id} detail={detail} />)}
              </div>
            </article>
          ))}
          {page < totalPages && (
            <button type="button" onClick={loadMore} disabled={loadingMore} className="mx-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 disabled:opacity-50">
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
              加载更多
            </button>
          )}
        </div>
      )}
    </section>
  )
}
