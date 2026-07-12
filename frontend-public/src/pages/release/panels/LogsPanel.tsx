/**
 * 项目日志面板。
 * 支持关键字、级别、TraceId、运行实例和时间范围筛选。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { pageObservabilityProjectLogs, getObservabilityProjectDetail } from '@/src/api/release'
import { getErrorMessage, cn, formatDateTime } from '@/src/lib/utils'
import { logLevelColorMap } from '../constants'
import type { ObservabilityProjectLogItem, RuntimeInstanceItem } from '@/src/types/release'
import type { PageResponse } from '@/src/types/api'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { DateRangePicker } from '@/src/components/common/DateRangePicker'

export const LogsPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [logs, setLogs] = useState<PageResponse<ObservabilityProjectLogItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* 筛选条件 */
  const [keyword, setKeyword] = useState('')
  const [level, setLevel] = useState('')
  const [traceId, setTraceId] = useState('')
  const [runtimeInstanceId, setRuntimeInstanceId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)

  /* 运行实例选项 */
  const [instances, setInstances] = useState<RuntimeInstanceItem[]>([])

  /** 加载运行实例列表供筛选。 */
  useEffect(() => {
    getObservabilityProjectDetail(pid)
      .then((detail) => setInstances(detail.instances))
      .catch(() => setInstances([]))
  }, [pid])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pageObservabilityProjectLogs(pid, {
        page,
        size: 50,
        keyword: keyword || undefined,
        level: level || undefined,
        traceId: traceId || undefined,
        runtimeInstanceId: runtimeInstanceId ? Number(runtimeInstanceId) : undefined,
        startTime: startDate || undefined,
        endTime: endDate || undefined,
      })
      setLogs(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword, level, traceId, runtimeInstanceId, startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <div>
      {/* 筛选区 */}
      <div className="mb-4 space-y-3">
        {/* 第一行：关键字 + 级别 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            size="sm"
            adaptiveIcon
            wrapperClassName="min-w-0 max-w-xs flex-1"
            icon={<Search className="h-4 w-4" />}
              placeholder="搜索日志…"
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
          />
          <Select
            layout="inline"
            value={level}
            onChange={(value) => { setLevel(value); setPage(1) }}
            className="[&>div]:w-32"
            options={[
              { value: '', label: '所有级别' },
              { value: 'ERROR', label: 'ERROR' },
              { value: 'WARN', label: 'WARN' },
              { value: 'INFO', label: 'INFO' },
              { value: 'DEBUG', label: 'DEBUG' },
            ]}
          />
        </div>

        {/* 第二行：TraceId + 实例 + 时间范围 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            size="sm"
            adaptiveIcon
            wrapperClassName="min-w-0 max-w-xs flex-1"
            icon={<Search className="h-4 w-4" />}
              placeholder="Trace ID…"
              value={traceId}
              onChange={(e) => { setTraceId(e.target.value); setPage(1) }}
              className="font-mono"
          />
          <Select
            layout="inline"
            value={runtimeInstanceId}
            onChange={(value) => { setRuntimeInstanceId(value); setPage(1) }}
            className="flex-1"
            placeholder="所有实例"
            options={[
              { value: '', label: '所有实例' },
              ...instances.map((inst) => ({
                value: String(inst.id),
                label: inst.name,
              })),
            ]}
          />
          <div className="w-full sm:w-auto sm:min-w-[280px]">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => { setStartDate(start); setEndDate(end); setPage(1) }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text="加载日志…" />
      ) : error ? (
        <ErrorState description={error} onRetry={fetchLogs} />
      ) : !logs || logs.records.length === 0 ? (
        <EmptyState
          title="暂无日志"
          description="该项目还没有收集到日志，或没有匹配当前筛选条件的日志。"
          icon={<FileText className="h-6 w-6" strokeWidth={1.5} />}
        />
      ) : (
        <>
          <div className="space-y-2">
            {logs.records.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {log.logLevel && (
                        <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold', logLevelColorMap[log.logLevel] || 'bg-gray-50 text-gray-700 border-gray-200')}>
                          {log.logLevel}
                        </span>
                      )}
                      <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">{log.runtimeInstanceName}</span>
                      {log.logger && <span className="truncate text-[11px] font-mono text-[var(--color-text-tertiary)]">{log.logger}</span>}
                      {log.traceId && <span className="truncate text-[10px] font-mono text-[var(--color-primary)]">trace: {log.traceId}</span>}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] font-mono text-[var(--color-text-primary)]">{log.message}</p>
                    {log.loggedAt && <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{formatDateTime(log.loggedAt)}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {logs.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">共 {logs.total} 条日志，第 {logs.page}/{logs.totalPages} 页</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
                <Button variant="secondary" size="sm" disabled={page >= logs.totalPages} onClick={() => setPage((p) => Math.min(logs.totalPages, p + 1))}>下一页 <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
