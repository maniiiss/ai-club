/**
 * 流水线中心面板。
 * 统一展示 AI Club 流水线和 Jenkins 绑定，支持触发、构建历史查看、日志详情、
 * Jenkins 服务管理和 Jenkins 绑定的编辑/删除。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Rocket,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  FileText,
  Server,
  Pencil,
  Trash2,
  Plus,
  Cpu,
  RefreshCw,
  Settings,
} from 'lucide-react'
import {
  pagePipelineCenterEntries,
  listPipelineBuilds,
  triggerAiClubPipeline,
  triggerPipelineBuild,
  deletePipelineBinding,
  getPipelineBinding,
  deleteAiClubPipeline,
  syncAiClubPipelineRepository,
  getAiClubPipeline,
} from '@/src/api/release'
import { getErrorMessage, cn, formatDate } from '@/src/lib/utils'
import { getStatusColor } from '../constants'
import type { PipelineCenterEntryItem, JenkinsBuildItem, PipelineBindingItem, AiClubPipelineItem } from '@/src/types/release'
import type { PageResponse } from '@/src/types/api'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { LogDetailDrawer } from '../components/LogDetailDrawer'
import { JenkinsServerDrawer } from '../components/JenkinsServerDrawer'
import { PipelineBindingFormDrawer } from '../components/PipelineBindingFormDrawer'
import { PipelineFormDrawer } from '../components/PipelineFormDrawer'
import { PipelineDetailDrawer } from '../components/PipelineDetailDrawer'
import { CreatePipelineTypeDialog } from '../components/CreatePipelineTypeDialog'

export const PipelinesPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [entries, setEntries] = useState<PageResponse<PipelineCenterEntryItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  /* Jenkins 构建历史抽屉 */
  const [buildDialog, setBuildDialog] = useState<{
    entry: PipelineCenterEntryItem
    builds: JenkinsBuildItem[]
    loading: boolean
  } | null>(null)

  /* 日志详情抽屉 */
  const [logDrawer, setLogDrawer] = useState<{
    mode: 'ai-club-run' | 'jenkins-build'
    refId: number
    number: number
  } | null>(null)

  /* Jenkins 服务管理抽屉 */
  const [jenkinsDrawerOpen, setJenkinsDrawerOpen] = useState(false)

  /* 绑定编辑/删除 */
  const [bindingFormOpen, setBindingFormOpen] = useState(false)
  const [editingBinding, setEditingBinding] = useState<PipelineBindingItem | null>(null)
  const [deletingBindingId, setDeletingBindingId] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  /* AI Club 流水线 CRUD 状态 */
  const [pipelineFormOpen, setPipelineFormOpen] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<AiClubPipelineItem | null>(null)
  const [detailPipeline, setDetailPipeline] = useState<AiClubPipelineItem | null>(null)
  const [deletingPipelineId, setDeletingPipelineId] = useState<number | null>(null)

  /* 新建流水线类型选择 */
  const [createTypeOpen, setCreateTypeOpen] = useState(false)

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
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  /** 触发流水线（AI Club 或 Jenkins）。 */
  const handleTrigger = async (entry: PipelineCenterEntryItem) => {
    setActionLoading(entry.entryId)
    setActionError(null)
    try {
      if (entry.entryType === 'AI_CLUB') {
        await triggerAiClubPipeline(entry.entryId)
      } else {
        await triggerPipelineBuild(entry.entryId)
      }
      fetchEntries()
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  /** 查看构建历史。 */
  const handleViewBuilds = async (entry: PipelineCenterEntryItem) => {
    setBuildDialog({ entry, builds: [], loading: true })
    try {
      const builds = await listPipelineBuilds(entry.entryId)
      setBuildDialog({ entry, builds, loading: false })
    } catch {
      setBuildDialog({ entry, builds: [], loading: false })
    }
  }

  /** 编辑 Jenkins 绑定。 */
  const handleEditBinding = async (entry: PipelineCenterEntryItem) => {
    try {
      const binding = await getPipelineBinding(entry.entryId)
      setEditingBinding(binding)
      setBindingFormOpen(true)
    } catch (err) {
      setActionError(getErrorMessage(err))
    }
  }

  /** 确认删除 Jenkins 绑定。 */
  const handleDeleteBinding = async () => {
    if (deletingBindingId === null) return
    setActionLoading(deletingBindingId)
    setActionError(null)
    try {
      await deletePipelineBinding(deletingBindingId)
      setDeletingBindingId(null)
      fetchEntries()
    } catch (err) {
      setActionError(getErrorMessage(err))
      setDeletingBindingId(null)
    } finally {
      setActionLoading(null)
    }
  }

  /** 编辑 AI Club 流水线：先获取完整数据再打开表单。 */
  const handleEditPipeline = async (entry: PipelineCenterEntryItem) => {
    setActionLoading(entry.entryId)
    setActionError(null)
    try {
      const pipeline = await getAiClubPipeline(entry.entryId)
      setEditingPipeline(pipeline)
      setPipelineFormOpen(true)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  /** 查看流水线详情：先获取完整数据再打开详情抽屉。 */
  const handleViewPipelineDetail = async (entry: PipelineCenterEntryItem) => {
    setActionLoading(entry.entryId)
    setActionError(null)
    try {
      const pipeline = await getAiClubPipeline(entry.entryId)
      setDetailPipeline(pipeline)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  /** 同步 AI Club 流水线仓库。 */
  const handleSyncPipeline = async (entry: PipelineCenterEntryItem) => {
    setActionLoading(entry.entryId)
    setActionError(null)
    try {
      await syncAiClubPipelineRepository(entry.entryId)
      fetchEntries()
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  /** 确认删除 AI Club 流水线。 */
  const handleDeletePipeline = async () => {
    if (deletingPipelineId === null) return
    setActionLoading(deletingPipelineId)
    setActionError(null)
    try {
      await deleteAiClubPipeline(deletingPipelineId)
      setDeletingPipelineId(null)
      fetchEntries()
    } catch (err) {
      setActionError(getErrorMessage(err))
      setDeletingPipelineId(null)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div>
      {/* 顶部操作栏 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="搜索流水线…"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateTypeOpen(true)}>
            新建流水线
          </Button>
          <Button size="sm" variant="secondary" icon={<Server className="h-3.5 w-3.5" />} onClick={() => setJenkinsDrawerOpen(true)}>
            Jenkins 服务
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
          {actionError}
        </div>
      )}

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
                      <h3 className="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">{entry.displayName}</h3>
                      <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-tertiary)]">{entry.entryType}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                      {entry.defaultBranch && <span>分支: {entry.defaultBranch}</span>}
                      {entry.primaryLabel && <span>{entry.primaryLabel}: {entry.primaryValue || '-'}</span>}
                      {entry.lastTriggeredAt && <span>最近触发: {formatDate(entry.lastTriggeredAt)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', getStatusColor(entry.lastRunStatus))}>
                      {entry.lastRunStatus || '未运行'}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', entry.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                      {entry.enabled ? '已启用' : '已禁用'}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border-light)] pt-3">
                  <Button size="sm" variant="secondary" icon={<Play className="h-3 w-3" />} loading={actionLoading === entry.entryId} onClick={() => handleTrigger(entry)}>
                    触发
                  </Button>
                  {entry.entryType === 'AI_CLUB' && (
                    <>
                      <button onClick={() => handleViewPipelineDetail(entry)} disabled={actionLoading === entry.entryId} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-40">
                        <Settings className="h-3 w-3" />详情
                      </button>
                      <button onClick={() => handleSyncPipeline(entry)} disabled={actionLoading === entry.entryId} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-40">
                        <RefreshCw className="h-3 w-3" />同步
                      </button>
                      <button onClick={() => handleEditPipeline(entry)} disabled={actionLoading === entry.entryId} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-40">
                        <Pencil className="h-3 w-3" />编辑
                      </button>
                      <button onClick={() => setDeletingPipelineId(entry.entryId)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-[var(--color-danger)] transition-colors">
                        <Trash2 className="h-3 w-3" />删除
                      </button>
                    </>
                  )}
                  {entry.entryType === 'JENKINS' && (
                    <>
                      <button onClick={() => handleViewBuilds(entry)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors">
                        <FileText className="h-3 w-3" />构建历史
                      </button>
                      <button onClick={() => handleEditBinding(entry)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors">
                        <Pencil className="h-3 w-3" />编辑
                      </button>
                      <button onClick={() => setDeletingBindingId(entry.entryId)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-[var(--color-danger)] transition-colors">
                        <Trash2 className="h-3 w-3" />删除
                      </button>
                    </>
                  )}
                  {entry.primaryUrl && (
                    <a href={entry.primaryUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-[var(--color-primary)] hover:underline">
                      <ExternalLink className="h-3 w-3" />外部链接
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {entries.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">共 {entries.total} 条流水线，第 {entries.page}/{entries.totalPages} 页</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
                <Button variant="secondary" size="sm" disabled={page >= entries.totalPages} onClick={() => setPage((p) => Math.min(entries.totalPages, p + 1))}>下一页 <ChevronRight className="h-4 w-4" /></Button>
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
          onViewLog={(buildNumber) => setLogDrawer({
            mode: 'jenkins-build',
            refId: buildDialog.entry.entryId,
            number: buildNumber,
          })}
        />
      )}

      {/* 日志详情抽屉 */}
      {logDrawer && (
        <LogDetailDrawer
          mode={logDrawer.mode}
          refId={logDrawer.refId}
          seqNumber={logDrawer.number}
          open={!!logDrawer}
          onClose={() => setLogDrawer(null)}
        />
      )}

      {/* Jenkins 服务管理 */}
      <JenkinsServerDrawer open={jenkinsDrawerOpen} onClose={() => setJenkinsDrawerOpen(false)} />

      {/* 绑定编辑表单 */}
      <PipelineBindingFormDrawer
        open={bindingFormOpen}
        onClose={() => setBindingFormOpen(false)}
        projectId={pid}
        binding={editingBinding}
        onSuccess={fetchEntries}
      />

      {/* 删除绑定确认 */}
      <ConfirmDialog
        open={deletingBindingId !== null}
        title="删除 Jenkins 绑定"
        description="确定要删除该流水线绑定吗？此操作不可撤销。"
        variant="danger"
        confirmText="删除"
        loading={actionLoading === deletingBindingId}
        onCancel={() => setDeletingBindingId(null)}
        onConfirm={handleDeleteBinding}
      />

      {/* AI Club 流水线创建/编辑表单 */}
      <PipelineFormDrawer
        open={pipelineFormOpen}
        onClose={() => setPipelineFormOpen(false)}
        projectId={pid}
        pipeline={editingPipeline}
        onSuccess={fetchEntries}
      />

      {/* AI Club 流水线详情抽屉 */}
      <PipelineDetailDrawer
        open={!!detailPipeline}
        onClose={() => setDetailPipeline(null)}
        pipeline={detailPipeline}
      />

      {/* 删除流水线确认 */}
      <ConfirmDialog
        open={deletingPipelineId !== null}
        title="删除流水线"
        description="确定要删除该流水线吗？关联的 Cron 任务和 Webhook 配置也将被清除。"
        variant="danger"
        confirmText="删除"
        loading={actionLoading === deletingPipelineId}
        onCancel={() => setDeletingPipelineId(null)}
        onConfirm={handleDeletePipeline}
      />

      {/* 新建流水线类型选择 */}
      <CreatePipelineTypeDialog
        open={createTypeOpen}
        onClose={() => setCreateTypeOpen(false)}
        onSelectAiClub={() => { setCreateTypeOpen(false); setEditingPipeline(null); setPipelineFormOpen(true) }}
        onSelectJenkins={() => { setCreateTypeOpen(false); setEditingBinding(null); setBindingFormOpen(true) }}
      />
    </div>
  )
}

/** Jenkins 构建历史抽屉。 */
const BuildHistoryDrawer = ({
  entry,
  builds,
  loading,
  onClose,
  onViewLog,
}: {
  entry: PipelineCenterEntryItem
  builds: JenkinsBuildItem[]
  loading: boolean
  onClose: () => void
  onViewLog: (buildNumber: number) => void
}) => (
  <SlideDrawer
    open
    onClose={onClose}
    title={entry.displayName}
    description="构建历史"
    width="100%"
    maxWidth="850px"
  >
    {loading ? (
      <LoadingSpinner fullscreen text="加载构建历史…" />
    ) : builds.length === 0 ? (
      <div className="p-6">
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
                  {build.building && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">构建中</span>}
                </div>
                {build.description && <p className="mt-1 line-clamp-1 text-[12px] text-[var(--color-text-secondary)]">{build.description}</p>}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                  {build.executedAt && <span>{formatDate(build.executedAt)}</span>}
                  <span>{build.durationText || `${build.durationMillis}ms`}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', getStatusColor(build.result))}>
                  {build.result || '进行中'}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => onViewLog(build.number)} className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-primary)] hover:underline">
                    <FileText className="h-3 w-3" />日志
                  </button>
                  {build.url && (
                    <a href={build.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-primary)] hover:underline">
                      <ExternalLink className="h-3 w-3" />查看
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </SlideDrawer>
)
