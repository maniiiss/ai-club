/**
 * 工作台卡片：快速构建（触发流水线）。
 * 业务意图：在首页列出已启用流水线并支持一键触发，与管理端首页快速构建对齐。
 * 依赖权限：cicd:view（列表）+ cicd:build（触发），由 V110 迁移补授给 PUBLIC_DEFAULT。
 * 复用后端接口：/api/cicd/pipeline-center/entries、/api/cicd/pipelines/{id}/trigger、
 * /api/cicd/pipeline-bindings/{id}/trigger。
 */
import { useEffect, useState } from 'react'
import { Play, RefreshCw, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import {
  pagePipelineCenterEntries,
  triggerAiClubPipeline,
  triggerPipelineBuild,
} from '@/src/api/release'
import type { PipelineCenterEntryItem } from '@/src/types/release'
import { cn, formatDateTime, getErrorMessage } from '@/src/lib/utils'
import { pipelineRunStatusLabel } from '@/src/lib/pipelineStatusUtils'

interface TriggerMessage {
  ok: boolean
  text: string
  url?: string | null
}

export const QuickBuildWidget = () => {
  const [entries, setEntries] = useState<PipelineCenterEntryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmEntry, setConfirmEntry] = useState<PipelineCenterEntryItem | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<TriggerMessage | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await pagePipelineCenterEntries({ page: 1, size: 4, enabled: true })
      setEntries(page.records)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleTrigger = async () => {
    if (!confirmEntry) return
    const entry = confirmEntry
    setTriggering(true)
    setTriggerMsg(null)
    try {
      if (entry.entryType === 'AI_CLUB') {
        const res = await triggerAiClubPipeline(entry.entryId)
        setTriggerMsg({
          ok: res.status !== 'FAILED',
          text: res.message || '已触发',
          url: res.triggerUrl,
        })
      } else {
        const res = await triggerPipelineBuild(entry.entryId)
        setTriggerMsg({ ok: true, text: res.message || '已触发', url: res.triggerUrl })
      }
    } catch (err) {
      setTriggerMsg({ ok: false, text: getErrorMessage(err) })
    } finally {
      setTriggering(false)
      setConfirmEntry(null)
    }
  }

  return (
    <Card
      title="快速构建"
      action={
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={load}
          disabled={loading}
        >
          刷新
        </Button>
      }
    >
      {loading ? (
        <LoadingSpinner text="加载流水线…" />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="暂无已启用流水线"
          description="在项目发布页绑定并启用流水线后，可在此快速触发。"
        />
      ) : (
        <div className="space-y-2">
          {triggerMsg && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg p-2.5 text-[12px]',
                triggerMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
              )}
            >
              {triggerMsg.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p>{triggerMsg.text}</p>
                {triggerMsg.url && (
                  <a
                    href={triggerMsg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline"
                  >
                    查看构建 <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
          {entries.map((entry) => (
            <div
              key={`${entry.entryType}-${entry.entryId}`}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {entry.displayName}
                </p>
                <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                  {entry.projectName} · {entry.entryType === 'AI_CLUB' ? 'GitPilot Pipeline' : 'Jenkins'}
                  {entry.lastTriggeredAt && ` · 最近 ${formatDateTime(entry.lastTriggeredAt)}`}
                </p>
              </div>
              {entry.lastRunStatus && (
                <span
                  className={cn(
                    'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    buildStatusClass(entry.lastRunStatus),
                  )}
                >
                  {pipelineRunStatusLabel(entry.lastRunStatus)}
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={<Play className="h-3.5 w-3.5" />}
                onClick={() => setConfirmEntry(entry)}
              >
                触发
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmEntry}
        title="确认触发流水线？"
        description={confirmEntry ? `将触发「${confirmEntry.displayName}」构建，操作立即生效。` : undefined}
        variant="default"
        confirmText="触发"
        loading={triggering}
        onCancel={() => setConfirmEntry(null)}
        onConfirm={handleTrigger}
      />
    </Card>
  )
}

/** 根据流水线运行状态返回对应的徽章配色。 */
function buildStatusClass(status: string): string {
  const s = status.toUpperCase()
  if (s === 'SUCCESS' || s === 'PASSED') return 'bg-emerald-50 text-emerald-700'
  if (s === 'FAILED' || s === 'FAILURE' || s === 'ERROR') return 'bg-red-50 text-red-700'
  if (s === 'RUNNING' || s === 'IN_PROGRESS') return 'bg-blue-50 text-blue-700'
  return 'bg-gray-100 text-gray-500'
}
