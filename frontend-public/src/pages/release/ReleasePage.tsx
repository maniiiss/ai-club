/**
 * 发布与观测模块页面。
 * 五个子 Tab：流水线中心 + AI Club 流水线 + 可观测性 + 项目日志 + 项目分享。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Rocket,
  Activity,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Play,
  GitBranch,
  X,
  Cpu,
  Share2,
  Copy,
  Check,
} from 'lucide-react'
import {
  pagePipelineCenterEntries,
  pageAiClubPipelines,
  listAiClubPipelineRuns,
  listPipelineBuilds,
  getObservabilityProjectHealth,
  pageObservabilityProjectLogs,
  getObservabilityProjectHealthTimeline,
  getProjectShare,
  createOrRefreshProjectShare,
  disableProjectShare,
} from '@/src/api/release'
import type { ProjectShareItem } from '@/src/api/release'
import type {
  PipelineCenterEntryItem,
  AiClubPipelineItem,
  AiClubPipelineRunItem,
  JenkinsBuildItem,
  ObservabilityProjectHealthItem,
  ObservabilityProjectLogItem,
  ObservabilityHealthTimelinePointItem,
} from '@/src/types/release'
import type { PageResponse } from '@/src/types/api'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate } from '@/src/lib/utils'

type ReleaseTab = 'pipelines' | 'ai-club-pipelines' | 'observability' | 'logs' | 'share'

const tabs: { key: ReleaseTab; label: string; icon: typeof Rocket }[] = [
  { key: 'pipelines', label: '流水线中心', icon: Rocket },
  { key: 'ai-club-pipelines', label: 'AI Club 流水线', icon: Cpu },
  { key: 'observability', label: '可观测性', icon: Activity },
  { key: 'logs', label: '项目日志', icon: FileText },
  { key: 'share', label: '项目分享', icon: Share2 },
]

const statusColorMap: Record<string, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  FAILURE: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-700',
  RUNNING: 'bg-blue-50 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
  ABORTED: 'bg-gray-100 text-gray-600',
  UNSTABLE: 'bg-amber-50 text-amber-700',
}

const healthLevelColorMap: Record<string, string> = {
  HEALTHY: 'bg-emerald-50 text-emerald-700',
  DEGRADED: 'bg-amber-50 text-amber-700',
  UNHEALTHY: 'bg-red-50 text-red-700',
}

export const ReleasePage = () => {
  const [activeTab, setActiveTab] = useState<ReleaseTab>('pipelines')

  return (
    <div className="h-full overflow-y-auto animate-fadeIn">
      <h2 className="mb-2 text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
        发布与观测
      </h2>
      <p className="mb-6 text-[14px] text-[var(--color-text-tertiary)]">
        跟踪流水线运行状态、项目健康度和日志
      </p>

      {/* Tab 切换 */}
      <div className="mb-6 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
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

      {activeTab === 'pipelines' && <PipelinesPanel />}
      {activeTab === 'ai-club-pipelines' && <AiClubPipelinesPanel />}
      {activeTab === 'observability' && <ObservabilityPanel />}
      {activeTab === 'logs' && <LogsPanel />}
      {activeTab === 'share' && <SharePanel />}
    </div>
  )
}

/* ════════════════════════════════════════════
   流水线中心面板（含 Jenkins 构建历史）
   ════════════════════════════════════════════ */

const PipelinesPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [entries, setEntries] = useState<PageResponse<PipelineCenterEntryItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  /* Jenkins 构建历史 */
  const [buildDialog, setBuildDialog] = useState<{
    entry: PipelineCenterEntryItem
    builds: JenkinsBuildItem[]
    loading: boolean
  } | null>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pagePipelineCenterEntries({
        page,
        size: 20,
        projectId: pid,
        keyword: keyword || undefined,
      })
      setEntries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载流水线失败')
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleViewBuilds = async (entry: PipelineCenterEntryItem) => {
    setBuildDialog({ entry, builds: [], loading: true })
    try {
      const builds = await listPipelineBuilds(entry.entryId)
      setBuildDialog({ entry, builds, loading: false })
    } catch {
      setBuildDialog({ entry, builds: [], loading: false })
    }
  }

  return (
    <div>
      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          placeholder="搜索流水线…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
          className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      {loading ? (
        <LoadingSpinner text="加载流水线…" />
      ) : error ? (
        <ErrorState description={error} onRetry={fetchEntries} />
      ) : !entries || entries.records.length === 0 ? (
        <EmptyState
          title="暂无流水线"
          description="该项目还没有配置流水线。"
          icon={<Rocket className="h-6 w-6" strokeWidth={1.5} />}
        />
      ) : (
        <>
          <div className="space-y-3">
            {entries.records.map((entry) => (
              <div
                key={`${entry.entryType}-${entry.entryId}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Rocket className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
                      <h3 className="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
                        {entry.displayName}
                      </h3>
                      <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-tertiary)]">
                        {entry.entryType}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                      {entry.defaultBranch && <span>分支: {entry.defaultBranch}</span>}
                      {entry.primaryLabel && (
                        <span>
                          {entry.primaryLabel}: {entry.primaryValue || '-'}
                        </span>
                      )}
                      {entry.lastTriggeredAt && <span>最近触发: {formatDate(entry.lastTriggeredAt)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium',
                        statusColorMap[entry.lastRunStatus || ''] || 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {entry.lastRunStatus || '未运行'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          entry.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {entry.enabled ? '已启用' : '已禁用'}
                      </span>
                      {/* Jenkins 类型显示构建历史按钮 */}
                      {entry.entryType === 'JENKINS' && (
                        <button
                          onClick={() => handleViewBuilds(entry)}
                          className="text-[11px] text-[var(--color-primary)] hover:underline"
                        >
                          构建历史
                        </button>
                      )}
                      {entry.primaryUrl && (
                        <a
                          href={entry.primaryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5"
                        >
                          <ExternalLink className="h-3 w-3" />外部链接
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {entries.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                共 {entries.total} 条流水线，第 {entries.page}/{entries.totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft className="h-4 w-4" />}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= entries.totalPages}
                  onClick={() => setPage((p) => Math.min(entries.totalPages, p + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Jenkins 构建历史抽屉 */}
      {buildDialog && (
        <BuildHistoryDrawer
          entry={buildDialog.entry}
          builds={buildDialog.builds}
          loading={buildDialog.loading}
          onClose={() => setBuildDialog(null)}
        />
      )}
    </div>
  )
}

/** Jenkins 构建历史抽屉。 */
const BuildHistoryDrawer = ({
  entry,
  builds,
  loading,
  onClose,
}: {
  entry: PipelineCenterEntryItem
  builds: JenkinsBuildItem[]
  loading: boolean
  onClose: () => void
}) => (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-transparent" onClick={onClose} />
    <div className="absolute inset-y-0 right-0 flex flex-col w-full max-w-[850px] bg-white shadow-[var(--shadow-xl)] animate-slideLeft overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--color-border)] bg-white px-6 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] z-10">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{entry.displayName}</span>
          <span className="text-[12px] text-[var(--color-text-tertiary)]">构建历史</span>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingSpinner fullscreen text="加载构建历史…" />
        ) : builds.length === 0 ? (
          <div className="p-6 pb-4">
            <EmptyState title="暂无构建记录" description="该流水线还没有构建历史。" icon={<Rocket className="h-6 w-6" strokeWidth={1.5} />} />
          </div>
        ) : (
          <div className="p-6 pb-4 space-y-2">
          {builds.map((build) => (
            <div key={build.number} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">#{build.number}</span>
                    {build.building && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">构建中</span>
                    )}
                  </div>
                  {build.description && (
                    <p className="mt-1 text-[12px] text-[var(--color-text-secondary)] line-clamp-1">{build.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                    {build.executedAt && <span>{formatDate(build.executedAt)}</span>}
                    <span>{build.durationText || `${build.durationMillis}ms`}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', statusColorMap[build.result || ''] || 'bg-gray-100 text-gray-600')}>
                    {build.result || '进行中'}
                  </span>
                  {build.url && (
                    <a href={build.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5">
                      <ExternalLink className="h-3 w-3" />查看
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  </div>
)

/* ════════════════════════════════════════════
   AI Club 流水线面板（含运行历史）
   ════════════════════════════════════════════ */

const AiClubPipelinesPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [pipelines, setPipelines] = useState<PageResponse<AiClubPipelineItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  /* 运行历史 */
  const [runDialog, setRunDialog] = useState<{
    pipeline: AiClubPipelineItem
    runs: AiClubPipelineRunItem[]
    loading: boolean
  } | null>(null)

  const fetchPipelines = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pageAiClubPipelines({
        page,
        size: 20,
        projectId: pid,
        keyword: keyword || undefined,
      })
      setPipelines(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 AI Club 流水线失败')
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword])

  useEffect(() => {
    fetchPipelines()
  }, [fetchPipelines])

  const handleViewRuns = async (pipeline: AiClubPipelineItem) => {
    setRunDialog({ pipeline, runs: [], loading: true })
    try {
      const runs = await listAiClubPipelineRuns(pipeline.id)
      setRunDialog({ pipeline, runs, loading: false })
    } catch {
      setRunDialog({ pipeline, runs: [], loading: false })
    }
  }

  return (
    <div>
      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          placeholder="搜索 AI Club 流水线…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
          className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      {loading ? (
        <LoadingSpinner text="加载 AI Club 流水线…" />
      ) : error ? (
        <ErrorState description={error} onRetry={fetchPipelines} />
      ) : !pipelines || pipelines.records.length === 0 ? (
        <EmptyState
          title="暂无 AI Club 流水线"
          description="该项目还没有配置 AI Club 流水线。"
          icon={<Cpu className="h-6 w-6" strokeWidth={1.5} />}
        />
      ) : (
        <>
          <div className="space-y-3">
            {pipelines.records.map((pipeline) => (
              <div
                key={pipeline.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                      <h3 className="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
                        {pipeline.name}
                      </h3>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                      {pipeline.gitlabProjectName && <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{pipeline.gitlabProjectName}</span>}
                      {pipeline.defaultBranch && <span>分支: {pipeline.defaultBranch}</span>}
                      {pipeline.configPath && <span className="font-mono">{pipeline.configPath}</span>}
                      {pipeline.lastTriggeredAt && <span>最近触发: {formatDate(pipeline.lastTriggeredAt)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium',
                        statusColorMap[pipeline.lastRunStatus || ''] || 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {pipeline.lastRunStatus || '未运行'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          pipeline.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {pipeline.enabled ? '已启用' : '已禁用'}
                      </span>
                      <button
                        onClick={() => handleViewRuns(pipeline)}
                        className="text-[11px] text-[var(--color-primary)] hover:underline"
                      >
                        运行历史
                      </button>
                      {pipeline.lastRunUrl && (
                        <a
                          href={pipeline.lastRunUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5"
                        >
                          <ExternalLink className="h-3 w-3" />最近运行
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pipelines.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                共 {pipelines.total} 条流水线，第 {pipelines.page}/{pipelines.totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  上一页
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= pipelines.totalPages} onClick={() => setPage((p) => Math.min(pipelines.totalPages, p + 1))}>
                  下一页 <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 运行历史抽屉 */}
      {runDialog && (
        <RunHistoryDrawer
          pipeline={runDialog.pipeline}
          runs={runDialog.runs}
          loading={runDialog.loading}
          onClose={() => setRunDialog(null)}
        />
      )}
    </div>
  )
}

/** AI Club 流水线运行历史抽屉。 */
const RunHistoryDrawer = ({
  pipeline,
  runs,
  loading,
  onClose,
}: {
  pipeline: AiClubPipelineItem
  runs: AiClubPipelineRunItem[]
  loading: boolean
  onClose: () => void
}) => (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-transparent" onClick={onClose} />
    <div className="absolute inset-y-0 right-0 flex flex-col w-full max-w-[900px] bg-white shadow-[var(--shadow-xl)] animate-slideLeft overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--color-border)] bg-white px-6 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] z-10">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{pipeline.name}</span>
          <span className="text-[12px] text-[var(--color-text-tertiary)]">运行历史</span>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingSpinner fullscreen text="加载运行历史…" />
        ) : runs.length === 0 ? (
          <div className="p-6 pb-4">
            <EmptyState title="暂无运行记录" description="该流水线还没有运行过。" icon={<Play className="h-6 w-6" strokeWidth={1.5} />} />
          </div>
        ) : (
          <div className="p-6 pb-4 space-y-2">
          {runs.map((run) => (
            <div key={run.number} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
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
                    <p className="mt-1 text-[12px] text-[var(--color-text-secondary)] line-clamp-2">{run.message}</p>
                  )}
                  {run.commit && (
                    <p className="mt-1 text-[11px] font-mono text-[var(--color-text-tertiary)]">commit: {run.commit}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                    {run.createdAt && <span>{formatDate(run.createdAt)}</span>}
                    <span>{run.durationText || '-'}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', statusColorMap[run.status || ''] || 'bg-gray-100 text-gray-600')}>
                    {run.status || '-'}
                  </span>
                  {run.url && (
                    <a href={run.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5">
                      <ExternalLink className="h-3 w-3" />详情
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  </div>
)

/* ════════════════════════════════════════════
   可观测性面板（含健康趋势图）
   ════════════════════════════════════════════ */

const ObservabilityPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [health, setHealth] = useState<ObservabilityProjectHealthItem | null>(null)
  const [timeline, setTimeline] = useState<ObservabilityHealthTimelinePointItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [healthData, timelineData] = await Promise.all([
        getObservabilityProjectHealth(pid),
        getObservabilityProjectHealthTimeline(pid).catch(() => [] as ObservabilityHealthTimelinePointItem[]),
      ])
      setHealth(healthData)
      setTimeline(timelineData)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载健康状态失败')
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  if (loading) return <LoadingSpinner text="加载健康状态…" />
  if (error) return <ErrorState description={error} onRetry={fetchHealth} />
  if (!health) {
    return (
      <EmptyState
        title="暂无可观测性数据"
        description="该项目还没有配置运行时实例。"
        icon={<Activity className="h-6 w-6" strokeWidth={1.5} />}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* 健康摘要 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card title="健康评分">
          <p className="text-[28px] font-bold text-[var(--color-primary)]">
            {health.projectHealthScore ?? '-'}
          </p>
        </Card>
        <Card title="健康等级">
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-[14px] font-semibold',
              healthLevelColorMap[health.projectHealthLevel || ''] || 'bg-gray-100 text-gray-600',
            )}
          >
            {health.projectHealthLevel || '-'}
          </span>
        </Card>
        <Card title="实例总数">
          <p className="text-[28px] font-bold text-[var(--color-text-primary)]">{health.totalInstanceCount}</p>
        </Card>
        <Card title="异常实例">
          <p
            className={cn(
              'text-[28px] font-bold',
              health.abnormalInstanceCount > 0 ? 'text-red-600' : 'text-emerald-600',
            )}
          >
            {health.abnormalInstanceCount}
          </p>
        </Card>
      </div>

      {/* 最近检查时间 */}
      {health.lastHealthCheckedAt && (
        <div className="rounded-lg bg-[var(--color-bg-hover)] px-4 py-3 text-[13px] text-[var(--color-text-secondary)]">
          最近检查时间: {formatDate(health.lastHealthCheckedAt)}
        </div>
      )}

      {/* 健康趋势图 */}
      {timeline.length > 0 && (
        <Card title="健康趋势">
          <HealthTimelineChart data={timeline} />
        </Card>
      )}
    </div>
  )
}

/** 健康趋势折线图（纯 SVG 实现，无需外部图表库）。 */
const HealthTimelineChart = ({ data }: { data: ObservabilityHealthTimelinePointItem[] }) => {
  if (data.length === 0) return null

  const width = 600
  const height = 180
  const padding = { top: 20, right: 20, bottom: 30, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const validPoints = data.filter((d) => d.healthScore != null)
  if (validPoints.length === 0) return <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无有效数据点</p>

  const maxScore = 100
  const minScore = 0

  const xScale = (i: number) => padding.left + (i / Math.max(validPoints.length - 1, 1)) * chartWidth
  const yScale = (v: number) => padding.top + chartHeight - ((v - minScore) / (maxScore - minScore)) * chartHeight

  const pathD = validPoints
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.healthScore!)}`)
    .join(' ')

  const areaD = `${pathD} L ${xScale(validPoints.length - 1)} ${padding.top + chartHeight} L ${xScale(0)} ${padding.top + chartHeight} Z`

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[600px] h-auto">
        {/* 背景网格 */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={padding.left} y1={yScale(v)} x2={width - padding.right} y2={yScale(v)} stroke="var(--color-border-light)" strokeWidth={0.5} />
            <text x={padding.left - 8} y={yScale(v) + 4} textAnchor="end" className="fill-[var(--color-text-tertiary)]" fontSize={10}>{v}</text>
          </g>
        ))}
        {/* 渐变填充 */}
        <defs>
          <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#healthGrad)" />
        <path d={pathD} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" />
        {/* 数据点 */}
        {validPoints.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.healthScore!)} r={3} fill="var(--color-primary)" />
        ))}
        {/* X 轴标签（首尾） */}
        {validPoints.length > 1 && (
          <>
            <text x={xScale(0)} y={height - 5} textAnchor="middle" className="fill-[var(--color-text-tertiary)]" fontSize={9}>
              {formatDate(validPoints[0].sampledAt)}
            </text>
            <text x={xScale(validPoints.length - 1)} y={height - 5} textAnchor="middle" className="fill-[var(--color-text-tertiary)]" fontSize={9}>
              {formatDate(validPoints[validPoints.length - 1].sampledAt)}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

/* ════════════════════════════════════════════
   项目日志面板
   ════════════════════════════════════════════ */

const LogsPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [logs, setLogs] = useState<PageResponse<ObservabilityProjectLogItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [level, setLevel] = useState<string>('')
  const [page, setPage] = useState(1)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pageObservabilityProjectLogs(pid, {
        page,
        size: 50,
        keyword: keyword || undefined,
        level: level || undefined,
      })
      setLogs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载日志失败')
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword, level])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const logLevelColorMap: Record<string, string> = {
    ERROR: 'bg-red-50 text-red-700 border-red-200',
    WARN: 'bg-amber-50 text-amber-700 border-amber-200',
    INFO: 'bg-blue-50 text-blue-700 border-blue-200',
    DEBUG: 'bg-gray-50 text-gray-700 border-gray-200',
  }

  return (
    <div>
      {/* 筛选 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="搜索日志…"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
            className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value)
            setPage(1)
          }}
          className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        >
          <option value="">所有级别</option>
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO">INFO</option>
          <option value="DEBUG">DEBUG</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner text="加载日志…" />
      ) : error ? (
        <ErrorState description={error} onRetry={fetchLogs} />
      ) : !logs || logs.records.length === 0 ? (
        <EmptyState
          title="暂无日志"
          description="该项目还没有收集到日志。"
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
                        <span
                          className={cn(
                            'rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                            logLevelColorMap[log.logLevel] || 'bg-gray-50 text-gray-700 border-gray-200',
                          )}
                        >
                          {log.logLevel}
                        </span>
                      )}
                      <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                        {log.runtimeInstanceName}
                      </span>
                      {log.logger && (
                        <span className="truncate text-[11px] font-mono text-[var(--color-text-tertiary)]">
                          {log.logger}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] font-mono text-[var(--color-text-primary)]">
                      {log.message}
                    </p>
                    {log.loggedAt && (
                      <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                        {formatDate(log.loggedAt)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {logs.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                共 {logs.total} 条日志，第 {logs.page}/{logs.totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft className="h-4 w-4" />}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= logs.totalPages}
                  onClick={() => setPage((p) => Math.min(logs.totalPages, p + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   项目分享面板
   ════════════════════════════════════════════ */

const SharePanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [share, setShare] = useState<ProjectShareItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [permanent, setPermanent] = useState(true)

  const fetchShare = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setShare(await getProjectShare(pid))
    } catch {
      setShare(null)
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => { fetchShare() }, [fetchShare])

  const handleCreate = async () => {
    setActionLoading(true)
    try {
      const result = await createOrRefreshProjectShare(pid, {
        permanent,
        expiresInDays: permanent ? null : 30,
      })
      setShare(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建分享链接失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDisable = async () => {
    setActionLoading(true)
    try {
      await disableProjectShare(pid)
      setShare(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '禁用分享失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!share?.shareUrl) return
    try {
      await navigator.clipboard.writeText(share.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  if (loading) return <LoadingSpinner text="加载分享状态…" />

  return (
    <div className="animate-fadeIn space-y-4">
      <Card title="项目公开分享">
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">
          生成公开链接，允许未登录用户查看项目的自动合并日志和流水线运行状态。
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {share?.enabled && share.shareUrl ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-800 text-[13px] font-medium mb-2">
                <Check className="h-4 w-4" />
                分享已启用
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={share.shareUrl}
                  className="flex-1 h-9 rounded-lg border border-emerald-300 bg-white px-3 text-[13px] text-[var(--color-text-primary)] font-mono"
                />
                <Button variant="secondary" size="sm" onClick={handleCopy} icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}>
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
              {share.expiresAt && (
                <p className="mt-2 text-[12px] text-emerald-700">有效期至：{formatDate(share.expiresAt)}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleCreate} loading={actionLoading}>刷新链接</Button>
              <Button variant="danger" onClick={handleDisable} loading={actionLoading}>禁用分享</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permanent}
                onChange={(e) => setPermanent(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
              />
              <span className="text-[13px] text-[var(--color-text-primary)]">永久有效</span>
              {!permanent && <span className="text-[12px] text-[var(--color-text-tertiary)]">（30 天后过期）</span>}
            </label>
            <Button onClick={handleCreate} loading={actionLoading} icon={<Share2 className="h-4 w-4" />}>
              生成分享链接
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
