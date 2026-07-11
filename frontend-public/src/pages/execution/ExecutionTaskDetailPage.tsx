/**
 * 执行任务详情页。
 * 展示任务基础信息、运行进度、步骤日志、执行产物和规划确认。
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Play,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  FileText,
  Save,
  MessageSquare,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  getExecutionTaskDetail,
  getExecutionRunDetail,
  cancelExecutionTask,
  retryExecutionTask,
  confirmExecutionPlan,
  updateExecutionPlanMarkdown,
  downloadExecutionArtifact,
  writebackTechnicalDesignArtifact,
} from '@/src/api/execution'
import type {
  ExecutionTaskDetailItem,
  ExecutionRunDetailItem,
  ExecutionStepItem,
  ExecutionArtifactDetailItem,
  ExecutionRunItem,
} from '@/src/types/execution'
import { Button } from '@/src/components/common/Button'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { cn } from '@/src/lib/utils'
import {
  detectGitNexusDegradation,
  isTechnicalDesignMarkdownArtifact,
  shouldShowTechnicalDesignWriteback,
} from '@/src/lib/technicalDesignAiUtils'

const statusColorMap: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  WAITING_CONFIRMATION: 'bg-purple-50 text-purple-700',
  RUNNING: 'bg-blue-50 text-blue-700',
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELED: 'bg-gray-100 text-gray-600',
}

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    PENDING: '待执行',
    WAITING_CONFIRMATION: '待确认',
    RUNNING: '执行中',
    SUCCESS: '成功',
    FAILED: '失败',
    CANCELED: '已取消',
  }
  return map[status] || status
}

const MARKDOWN_ARTIFACT_TYPES = [
  'PLAN_MARKDOWN',
  'REPORT_MARKDOWN',
  'FIX_PLAN_MARKDOWN',
  'FIX_SHARDS_MARKDOWN',
  'EXEC_PLAN_MARKDOWN',
  'IMPLEMENT_RESULT_MARKDOWN',
  'TEST_RESULT_MARKDOWN',
  'REPO_STRUCTURE_MARKDOWN',
  'CROSS_REPO_CONTEXT_MARKDOWN',
  'AUTOMATION_PLAN_MARKDOWN',
  'AUTOMATION_SCRIPT_PREVIEW_MARKDOWN',
  'AUTOMATION_TEST_RESULT_MARKDOWN',
  'AUTOMATION_REPORT_MARKDOWN',
  'CODE_CONTEXT_MARKDOWN',
  'TECHNICAL_DESIGN_MARKDOWN',
  'DESIGN_REVIEW_MARKDOWN',
]

const isMarkdownArtifact = (artifact: ExecutionArtifactDetailItem) =>
  MARKDOWN_ARTIFACT_TYPES.includes(artifact.artifactType) || isTechnicalDesignMarkdownArtifact(artifact.artifactType)

const isLogArtifact = (artifact: ExecutionArtifactDetailItem) =>
  ['STEP_RAW_LOG', 'STEP_STDOUT_LOG', 'STEP_STDERR_LOG'].includes(artifact.artifactType) ||
  artifact.artifactType.endsWith('_LOG')

const isImageArtifact = (artifact: ExecutionArtifactDetailItem) =>
  artifact.artifactType === 'PLAYWRIGHT_SCREENSHOT'

const previewLongText = (text: string | null | undefined, maxLen = 2000) => {
  if (!text) return '-'
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '\n\n… (已截断)'
}

export const ExecutionTaskDetailPage = () => {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>()
  const navigate = useNavigate()
  const tid = Number(taskId)

  const [taskDetail, setTaskDetail] = useState<ExecutionTaskDetailItem | null>(null)
  const [runDetail, setRunDetail] = useState<ExecutionRunDetailItem | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [writebackArtifactId, setWritebackArtifactId] = useState<number | null>(null)
  const [writebackMessage, setWritebackMessage] = useState('')

  /* 规划确认 */
  const [planMarkdownDraft, setPlanMarkdownDraft] = useState('')
  const [planSaving, setPlanSaving] = useState(false)
  const [planConfirming, setPlanConfirming] = useState(false)

  /* 轮询定时器 */
  const pollTimerRef = useRef<number | null>(null)

  const loadTaskDetail = useCallback(async () => {
    try {
      const detail = await getExecutionTaskDetail(tid)
      setTaskDetail(detail)
      /* 自动选中最新运行 */
      if (detail.runs.length > 0 && !selectedRunId) {
        const latestRun = detail.runs[0]
        setSelectedRunId(latestRun.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载执行任务详情失败')
    }
  }, [tid, selectedRunId])

  const loadRunDetail = useCallback(async () => {
    if (!selectedRunId) {
      setRunDetail(null)
      return
    }
    try {
      const detail = await getExecutionRunDetail(selectedRunId)
      setRunDetail(detail)
    } catch {
      setRunDetail(null)
    }
  }, [selectedRunId])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    await loadTaskDetail()
    await loadRunDetail()
    setLoading(false)
  }, [loadTaskDetail, loadRunDetail])

  useEffect(() => {
    loadAll()
  }, [selectedRunId])

  /* 首次加载 */
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        const detail = await getExecutionTaskDetail(tid)
        setTaskDetail(detail)
        if (detail.runs.length > 0) {
          const latestRun = detail.runs[0]
          setSelectedRunId(latestRun.id)
          try {
            const runD = await getExecutionRunDetail(latestRun.id)
            setRunDetail(runD)
          } catch {
            setRunDetail(null)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载执行任务详情失败')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [tid])

  /* 自动轮询 */
  useEffect(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (taskDetail && ['PENDING', 'RUNNING', 'WAITING_CONFIRMATION'].includes(taskDetail.status)) {
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const detail = await getExecutionTaskDetail(tid)
          setTaskDetail(detail)
          if (selectedRunId) {
            const runD = await getExecutionRunDetail(selectedRunId)
            setRunDetail(runD)
          }
        } catch {
          /* 静默 */
        }
      }, 6000)
    }
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
    }
  }, [taskDetail?.status, tid, selectedRunId])

  /* 规划 Markdown 同步 */
  useEffect(() => {
    if (!taskDetail?.planConfirmationPending) return
    const planArtifact = runDetail?.artifacts.find((a) => a.artifactType === 'PLAN_MARKDOWN')
    if (planArtifact?.contentText) {
      setPlanMarkdownDraft(planArtifact.contentText.trim())
    } else {
      const planStep = runDetail?.steps.find((s) => s.stepCode === 'PLAN')
      if (planStep?.outputSnapshot) {
        setPlanMarkdownDraft(planStep.outputSnapshot.trim())
      }
    }
  }, [runDetail, taskDetail?.planConfirmationPending])

  const handleCancel = async () => {
    setActionLoading(true)
    try {
      await cancelExecutionTask(tid)
      await loadAll()
    } catch {
      /* 静默 */
    } finally {
      setActionLoading(false)
    }
  }

  const handleRetry = async () => {
    setActionLoading(true)
    try {
      await retryExecutionTask(tid)
      await loadAll()
    } catch {
      /* 静默 */
    } finally {
      setActionLoading(false)
    }
  }

  const handleSavePlan = async () => {
    setPlanSaving(true)
    try {
      await updateExecutionPlanMarkdown(tid, { planMarkdown: planMarkdownDraft })
      await loadAll()
    } catch {
      /* 静默 */
    } finally {
      setPlanSaving(false)
    }
  }

  const handleConfirmPlan = async () => {
    setPlanConfirming(true)
    try {
      await confirmExecutionPlan(tid, { planMarkdown: planMarkdownDraft })
      await loadAll()
    } catch {
      /* 静默 */
    } finally {
      setPlanConfirming(false)
    }
  }

  const handleDownloadArtifact = async (artifact: ExecutionArtifactDetailItem) => {
    try {
      const { blob, fileName } = await downloadExecutionArtifact(artifact.id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      /* 静默 */
    }
  }

  /** 技术设计只在人工确认后写回，写回成功后刷新产物标记。 */
  const handleTechnicalDesignWriteback = async (
    artifact: ExecutionArtifactDetailItem,
    mode: 'DESCRIPTION' | 'COMMENT',
  ) => {
    setWritebackArtifactId(artifact.id)
    setWritebackMessage('')
    try {
      await writebackTechnicalDesignArtifact(tid, { artifactId: artifact.id, mode })
      setWritebackMessage(mode === 'DESCRIPTION' ? '技术设计已写入工作项描述' : '技术设计已追加到工作项评论')
      await loadRunDetail()
    } catch (reason) {
      setWritebackMessage(reason instanceof Error ? reason.message : '技术设计写回失败')
    } finally {
      setWritebackArtifactId(null)
    }
  }

  if (loading) return <LoadingSpinner fullscreen text="加载执行任务详情…" />
  if (error) return <ErrorState description={error} onRetry={loadAll} />
  if (!taskDetail) return <ErrorState description="执行任务不存在" />

  const showPlanConfirmation =
    taskDetail.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION' && taskDetail.planConfirmationPending
  const canEditPlan = showPlanConfirmation && taskDetail.canCurrentUserConfirmPlan
  const canCancel = ['PENDING', 'RUNNING', 'WAITING_CONFIRMATION'].includes(taskDetail.status)
  const canRetry = ['SUCCESS', 'FAILED', 'CANCELED'].includes(taskDetail.status)
  const latestSuccessfulRunId = taskDetail.runs
    .filter((run) => run.status === 'SUCCESS')
    .sort((left, right) => right.runNo - left.runNo)[0]?.id ?? null

  /* 过滤展示产物 */
  const displayArtifacts = (runDetail?.artifacts || []).filter((a) => {
    if (a.artifactType === 'IMPLEMENT_DIFF_JSON') return false
    return true
  })
  const gitNexusDegradation = taskDetail.scenarioCode === 'TECHNICAL_DESIGN_AUTHORING'
    ? (runDetail?.artifacts || [])
      .filter((artifact) => artifact.artifactType === 'CODE_CONTEXT_MARKDOWN')
      .map((artifact) => detectGitNexusDegradation(artifact.contentText))
      .find(Boolean) || null
    : null

  return (
    <div className="h-full overflow-hidden flex flex-col animate-fadeIn">
      {/* ── 顶部固定区域 ── */}
      <div className="shrink-0 overflow-y-auto">
        {/* Hero */}
        <div className="mb-4">
        <button
          onClick={() => navigate(`/projects/${projectId}/execution`)}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回执行中心
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
              {taskDetail.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
              <span className={cn('rounded-full px-2 py-0.5 font-medium', statusColorMap[taskDetail.status] || 'bg-gray-100 text-gray-600')}>
                {statusLabel(taskDetail.status)}
              </span>
              <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-medium">
                {taskDetail.scenarioName}
              </span>
              {taskDetail.workItemName && (
                <span>工作项: {taskDetail.workItemCode} {taskDetail.workItemName}</span>
              )}
              <span>项目: {taskDetail.projectName}</span>
              <span>发起人: {taskDetail.createdByName || '系统触发'}</span>
              <span>创建: {taskDetail.createdAt?.replace('T', ' ').slice(0, 16)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canCancel && (
              <Button variant="danger" size="sm" onClick={handleCancel} loading={actionLoading}>
                取消
              </Button>
            )}
            {canRetry && (
              <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={handleRetry} loading={actionLoading}>
                重试
              </Button>
            )}
          </div>
        </div>

        {taskDetail.latestSummary && (
          <p className="mt-3 text-[13px] text-[var(--color-text-secondary)]">
            {taskDetail.latestSummary}
          </p>
        )}
        {gitNexusDegradation && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><strong>GitNexus 已降级：</strong>{gitNexusDegradation}</span>
          </div>
        )}
        {writebackMessage && <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-700">{writebackMessage}</p>}
        </div>

        {taskDetail.orchestrationVersionId && taskDetail.resolvedBindings.length > 0 && (
          <section className="mb-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-sky-900">执行器快照</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-sky-700">编排版本 #{taskDetail.orchestrationVersionId}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {taskDetail.resolvedBindings.map((binding) => (
                <div key={`${binding.stepNo}-${binding.stepCode}-${binding.repositoryBindingId ?? 0}`} className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-[12px]">
                  <div className="font-semibold text-slate-800">{binding.stepNo}. {binding.stepName}</div>
                  <div className="mt-1 text-slate-500">{binding.agentName || `Agent #${binding.agentId ?? '-'}`} · {binding.runtimeType || binding.accessType || '-'} · {binding.timeoutSeconds ?? '-'} 秒</div>
                  {binding.repositoryDisplayName && <div className="mt-1 truncate text-slate-500">{binding.repositoryDisplayName} @ {binding.repositoryTargetBranch || '-'}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 运行进度 */}
        {taskDetail.runs.length > 0 && (
          <section className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">运行进度</h3>
            <Select
              layout="inline"
              value={selectedRunId ? String(selectedRunId) : ''}
              onChange={(value) => setSelectedRunId(Number(value))}
              className="[&>div]:w-32 [&_button]:h-8 [&_button]:text-[12px]"
              options={taskDetail.runs.map((run) => ({ value: String(run.id), label: `第 ${run.runNo} 次运行` }))}
            />
          </div>

          {runDetail ? (
            <div>
              {/* 进度条 */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                    {statusLabel(runDetail.status)}
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                    {runDetail.progressPercent}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      runDetail.status === 'SUCCESS' ? 'bg-emerald-500' :
                      runDetail.status === 'FAILED' ? 'bg-red-500' :
                      'bg-[var(--color-primary)]',
                    )}
                    style={{ width: `${runDetail.progressPercent}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-text-tertiary)]">
                <span>当前步骤: {runDetail.currentStepName || '-'}</span>
                <span>开始: {runDetail.startedAt?.replace('T', ' ').slice(0, 16) || '-'}</span>
                <span>结束: {runDetail.finishedAt?.replace('T', ' ').slice(0, 16) || '-'}</span>
                {runDetail.hasLiveStream && <span className="text-blue-600 font-medium">流式已启用</span>}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">
              执行运行尚未创建，请稍后刷新
            </p>
          )}
        </section>
      )}

        {/* 规划确认 */}
        {showPlanConfirmation && (
          <section className="mb-4 rounded-xl border border-purple-200 bg-purple-50/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-purple-600" />
            <h3 className="text-[15px] font-semibold text-purple-800">规划确认</h3>
          </div>
          <p className="mb-4 text-[13px] text-purple-700">
            开发执行已生成规划报告，发起人确认后才会继续后续开发、测试与交付报告。
          </p>
          {canEditPlan ? (
            <>
              <textarea
                value={planMarkdownDraft}
                onChange={(e) => setPlanMarkdownDraft(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-purple-200 bg-white px-4 py-3 text-[13px] font-mono focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
              />
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" icon={<Save className="h-3.5 w-3.5" />} onClick={handleSavePlan} loading={planSaving}>
                  保存规划
                </Button>
                <Button size="sm" onClick={handleConfirmPlan} loading={planConfirming}>
                  确认继续执行
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-white p-4 prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {planMarkdownDraft || '-'}
              </ReactMarkdown>
            </div>
          )}
        </section>
      )}
      </div>

      {/* ── 底部滚动区域：步骤日志 + 执行产物各自独立滚动 ── */}
      {runDetail && (
        <div className="flex-1 min-h-0 grid grid-cols-1 gap-6 lg:grid-cols-2 pb-4">
          {/* 步骤日志 */}
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] flex flex-col min-h-0">
            <div className="shrink-0 px-5 pt-5 pb-3">
              <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">步骤日志</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              {runDetail.steps.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无步骤</p>
              ) : (
                <div className="space-y-4">
                  {runDetail.steps.map((step) => (
                    <StepTimelineItem key={step.id} step={step} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 执行产物 */}
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] flex flex-col min-h-0">
            <div className="shrink-0 px-5 pt-5 pb-3">
              <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                执行产物 ({displayArtifacts.length})
              </h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              {displayArtifacts.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无产物</p>
              ) : (
                <div className="space-y-3">
                  {displayArtifacts.map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      artifact={artifact}
                      scenarioCode={taskDetail.scenarioCode}
                      canWriteback={selectedRunId === latestSuccessfulRunId && runDetail.status === 'SUCCESS'}
                      onDownload={() => handleDownloadArtifact(artifact)}
                      onWriteback={(mode) => handleTechnicalDesignWriteback(artifact, mode)}
                      writebackLoading={writebackArtifactId === artifact.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   步骤时间线条目
   ════════════════════════════════════════════ */

const StepTimelineItem = ({ step }: { step: ExecutionStepItem }) => {
  const [expanded, setExpanded] = useState(false)

  const statusIcon = () => {
    switch (step.status) {
      case 'SUCCESS': return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'FAILED': return <XCircle className="h-4 w-4 text-red-500" />
      case 'RUNNING': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'PENDING': return <Clock className="h-4 w-4 text-gray-400" />
      default: return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <div className="relative pl-6">
      {/* 时间线竖线 */}
      <div className="absolute left-[9px] top-6 bottom-0 w-px bg-[var(--color-border)]" />
      {/* 状态图标 */}
      <div className="absolute left-0 top-0.5">{statusIcon()}</div>

      <div
        className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] p-3 hover:bg-[var(--color-bg-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono text-[var(--color-text-tertiary)]">#{step.stepNo}</span>
            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
              {step.stepName || step.stepCode}
            </span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              statusColorMap[step.status] || 'bg-gray-100 text-gray-600',
            )}>
              {statusLabel(step.status)}
            </span>
          </div>
          <ChevronRight className={cn('h-4 w-4 text-[var(--color-text-tertiary)] transition-transform', expanded && 'rotate-90')} />
        </div>

        <div className="mt-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  step.status === 'SUCCESS' ? 'bg-emerald-500' :
                  step.status === 'FAILED' ? 'bg-red-500' :
                  'bg-[var(--color-primary)]',
                )}
                style={{ width: `${step.progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--color-text-tertiary)]">{step.progressPercent}%</span>
          </div>
        </div>

        {step.latestMessage && (
          <p className="mt-1.5 text-[12px] text-[var(--color-text-secondary)] line-clamp-2">
            {step.latestMessage}
          </p>
        )}

        {step.agentName && (
          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">Agent: {step.agentName}</p>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-3 pl-0">
          {step.tailLogText && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
                最近尾日志 ({step.tailLogLineCount || 0} 行)
              </p>
              <pre className="rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100 overflow-x-auto max-h-40 overflow-y-auto">
                {step.tailLogText}
              </pre>
            </div>
          )}

          <details className="rounded-lg border border-[var(--color-border-light)]">
            <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
              输入快照
            </summary>
            <pre className="border-t border-[var(--color-border-light)] p-3 text-[11px] text-[var(--color-text-secondary)] overflow-x-auto max-h-60 overflow-y-auto bg-[var(--color-bg-page)]">
              {previewLongText(step.inputSnapshot)}
            </pre>
          </details>

          <details className="rounded-lg border border-[var(--color-border-light)]">
            <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
              输出快照
            </summary>
            <pre className="border-t border-[var(--color-border-light)] p-3 text-[11px] text-[var(--color-text-secondary)] overflow-x-auto max-h-60 overflow-y-auto bg-[var(--color-bg-page)]">
              {previewLongText(step.outputSnapshot || step.errorMessage)}
            </pre>
          </details>

          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--color-text-tertiary)]">
            {step.currentCommand && <span>命令: {step.currentCommand}</span>}
            {step.lastEventAt && <span>最后事件: {step.lastEventAt.replace('T', ' ').slice(0, 16)}</span>}
            {step.lastHeartbeatAt && <span>心跳: {step.lastHeartbeatAt.replace('T', ' ').slice(0, 16)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   产物卡片
   ════════════════════════════════════════════ */

const ArtifactCard = ({
  artifact,
  scenarioCode,
  canWriteback,
  onDownload,
  onWriteback,
  writebackLoading,
}: {
  artifact: ExecutionArtifactDetailItem
  scenarioCode: string
  canWriteback: boolean
  onDownload: () => void
  onWriteback: (mode: 'DESCRIPTION' | 'COMMENT') => void
  writebackLoading: boolean
}) => {
  const [expanded, setExpanded] = useState(false)
  const isMarkdown = isMarkdownArtifact(artifact)
  const isLog = isLogArtifact(artifact)
  const isImage = isImageArtifact(artifact)
  const showWriteback = shouldShowTechnicalDesignWriteback({
    scenarioCode,
    artifactType: artifact.artifactType,
    contentText: artifact.contentText,
  }) && canWriteback && !artifact.workItemWriteback

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
              {artifact.title}
            </p>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {artifact.artifactType}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {artifact.contentRef && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDownload()
              }}
              className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
              title="下载产物"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronRight className={cn('h-4 w-4 text-[var(--color-text-tertiary)] transition-transform', expanded && 'rotate-90')} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border-light)]">
          {isMarkdown && artifact.contentText ? (
            <div className="prose prose-sm max-w-none p-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {artifact.contentText}
              </ReactMarkdown>
            </div>
          ) : isImage ? (
            <div className="p-4">
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                截图预览需要下载后查看
              </p>
            </div>
          ) : artifact.contentText ? (
            <pre className="p-4 text-[12px] text-[var(--color-text-secondary)] overflow-x-auto max-h-80 overflow-y-auto bg-[var(--color-bg-page)]">
              {previewLongText(artifact.contentText, isLog ? 3000 : 2000)}
            </pre>
          ) : (
            <p className="p-4 text-[12px] text-[var(--color-text-tertiary)]">暂无内容预览</p>
          )}
          {artifact.workItemWriteback && (
            <div className="border-t border-[var(--color-border-light)] px-4 py-2">
              <span className="text-[11px] text-[var(--color-text-tertiary)]">已回写工作项</span>
            </div>
          )}
          {showWriteback && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-light)] bg-sky-50/50 px-4 py-3">
              <span className="text-[11px] text-sky-800">人工确认后写回，不会自动覆盖工作项内容。</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" loading={writebackLoading} icon={<Save className="h-3.5 w-3.5" />} onClick={(event) => { event.stopPropagation(); onWriteback('DESCRIPTION') }}>写入描述</Button>
                <Button size="sm" variant="secondary" loading={writebackLoading} icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={(event) => { event.stopPropagation(); onWriteback('COMMENT') }}>追加评论</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
