/**
 * 流水线详情抽屉。
 * 包含四个子 Tab：运行历史、Cron 定时、Webhook 配置、配置状态。
 */
import { useEffect, useState, useCallback } from 'react'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import {
  listAiClubPipelineRuns,
  getAiClubPipelineConfigStatus,
} from '@/src/api/release'
import { getErrorMessage, cn, formatDateTime } from '@/src/lib/utils'
import { getStatusColor } from '../constants'
import { CronJobPanel } from './CronJobPanel'
import { WebhookPanel } from './WebhookPanel'
import { LogDetailDrawer } from './LogDetailDrawer'
import type { AiClubPipelineItem, AiClubPipelineRunItem, AiClubPipelineConfigStatus } from '@/src/types/release'
import { ExternalLink, GitBranch, Play, FileText, Clock, Webhook, Settings } from 'lucide-react'

type DetailTab = 'runs' | 'cron' | 'webhook' | 'config'

interface PipelineDetailDrawerProps {
  open: boolean
  onClose: () => void
  pipeline: AiClubPipelineItem | null
}

const detailTabs: { key: DetailTab; label: string; icon: typeof Play }[] = [
  { key: 'runs', label: '运行历史', icon: Play },
  { key: 'cron', label: 'Cron 定时', icon: Clock },
  { key: 'webhook', label: 'Webhook', icon: Webhook },
  { key: 'config', label: '配置状态', icon: Settings },
]

export const PipelineDetailDrawer = ({
  open,
  onClose,
  pipeline,
}: PipelineDetailDrawerProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('runs')

  if (!pipeline) return null

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={pipeline.name}
      description={`流水线详情 #${pipeline.id}`}
      width="100%"
      maxWidth="960px"
    >
      <div className="p-6">
        {/* 子 Tab 切换 */}
        <div className="mb-5 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 w-fit">
          {detailTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-150',
                activeTab === tab.key
                  ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 子面板内容 */}
        {activeTab === 'runs' && <RunsSubTab pipeline={pipeline} />}
        {activeTab === 'cron' && <CronJobPanel pipelineId={pipeline.id} />}
        {activeTab === 'webhook' && <WebhookPanel pipelineId={pipeline.id} />}
        {activeTab === 'config' && <ConfigStatusSubTab pipelineId={pipeline.id} />}
      </div>
    </SlideDrawer>
  )
}

/* ── 运行历史子面板 ── */

const RunsSubTab = ({ pipeline }: { pipeline: AiClubPipelineItem }) => {
  const [runs, setRuns] = useState<AiClubPipelineRunItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logDrawer, setLogDrawer] = useState<{ runNumber: number } | null>(null)

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRuns(await listAiClubPipelineRuns(pipeline.id, 30))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [pipeline.id])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  if (loading) return <LoadingSpinner text="加载运行历史…" />
  if (error) return <ErrorState description={error} onRetry={fetchRuns} />
  if (runs.length === 0) {
    return (
      <EmptyState
        title="暂无运行记录"
        description="该流水线还没有运行过。"
        icon={<Play className="h-6 w-6" strokeWidth={1.5} />}
      />
    )
  }

  return (
    <>
      <div className="space-y-2">
        {runs.map((run) => (
          <div
            key={run.number}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">#{run.number}</span>
                  {run.branch && (
                    <span className="flex items-center gap-1 rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--color-text-tertiary)]">
                      <GitBranch className="h-3 w-3" />{run.branch}
                    </span>
                  )}
                  {run.event && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">{run.event}</span>
                  )}
                </div>
                {run.message && (
                  <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-text-secondary)]">{run.message}</p>
                )}
                {run.commit && (
                  <p className="mt-1 font-mono text-[11px] text-[var(--color-text-tertiary)]">commit: {run.commit}</p>
                )}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                  {run.createdAt && <span>{formatDateTime(run.createdAt)}</span>}
                  <span>{run.durationText || '-'}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', getStatusColor(run.status))}>
                  {run.status || '-'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogDrawer({ runNumber: run.number })}
                    className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-primary)] hover:underline"
                  >
                    <FileText className="h-3 w-3" />日志
                  </button>
                  {run.url && (
                    <a
                      href={run.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-primary)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />详情
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 日志详情抽屉 */}
      {logDrawer && (
        <LogDetailDrawer
          mode="ai-club-run"
          refId={pipeline.id}
          seqNumber={logDrawer.runNumber}
          open={!!logDrawer}
          onClose={() => setLogDrawer(null)}
        />
      )}
    </>
  )
}

/* ── 配置状态子面板 ── */

const ConfigStatusSubTab = ({ pipelineId }: { pipelineId: number }) => {
  const [status, setStatus] = useState<AiClubPipelineConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatus(await getAiClubPipelineConfigStatus(pipelineId))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [pipelineId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  if (loading) return <LoadingSpinner text="加载配置状态…" />
  if (error) return <ErrorState description={error} onRetry={fetchStatus} />
  if (!status) return null

  const statusColor: Record<string, string> = {
    READY: 'bg-emerald-50 text-emerald-700',
    MISSING: 'bg-amber-50 text-amber-700',
    ERROR: 'bg-red-50 text-red-700',
    SYNCED: 'bg-emerald-50 text-emerald-700',
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-[12px] font-semibold',
              statusColor[status.status] || 'bg-gray-100 text-gray-600',
            )}
          >
            {status.status}
          </span>
          {status.checkedAt && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              检查于 {formatDateTime(status.checkedAt)}
            </span>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {status.branch && (
            <div className="flex items-center gap-2 text-[13px]">
              <GitBranch className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
              <span className="text-[var(--color-text-tertiary)]">分支：</span>
              <span className="font-mono text-[var(--color-text-primary)]">{status.branch}</span>
            </div>
          )}
          {status.configPath && (
            <div className="flex items-center gap-2 text-[13px]">
              <FileText className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
              <span className="text-[var(--color-text-tertiary)]">配置路径：</span>
              <span className="font-mono text-[var(--color-text-primary)]">{status.configPath}</span>
            </div>
          )}
        </div>

        {status.message && (
          <div className="mt-4 rounded-lg bg-[var(--color-bg-hover)] p-3">
            <p className="text-[12px] text-[var(--color-text-secondary)]">{status.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
