/**
 * 测试与执行模块页面。
 * 两个子 Tab：测试计划 + 执行中心。
 * 支持测试计划详情（含用例列表）和执行任务详情。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  FlaskConical,
  Play,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import {
  pageTestPlans,
  getTestPlanDetail,
  pageExecutionTasks,
  getExecutionTaskListStats,
  listExecutionTaskRuns,
  cancelExecutionTask,
  retryExecutionTask,
} from '@/src/api/execution'
import type {
  TestPlanItem,
  TestCaseItem,
  ExecutionTaskItem,
  ExecutionTaskListStatsItem,
  ExecutionRunItem,
} from '@/src/types/execution'
import type { PageResponse } from '@/src/types/api'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate } from '@/src/lib/utils'

type ExecutionTab = 'test-plans' | 'execution-center'

const tabs: { key: ExecutionTab; label: string; icon: typeof FlaskConical }[] = [
  { key: 'test-plans', label: '测试计划', icon: FlaskConical },
  { key: 'execution-center', label: '执行中心', icon: Play },
]

const statusColorMap: Record<string, string> = {
  '待执行': 'bg-amber-50 text-amber-700',
  '执行中': 'bg-blue-50 text-blue-700',
  '成功': 'bg-emerald-50 text-emerald-700',
  '失败': 'bg-red-50 text-red-700',
  '已取消': 'bg-gray-100 text-gray-600',
  '待确认': 'bg-purple-50 text-purple-700',
  IDLE: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-amber-50 text-amber-700',
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
}

const priorityColorMap: Record<string, string> = {
  '高': 'text-red-600 font-semibold',
  '中': 'text-amber-600',
  '低': 'text-gray-500',
  P0: 'text-red-600 font-semibold',
  P1: 'text-orange-600 font-semibold',
  P2: 'text-amber-600',
  P3: 'text-gray-500',
}

export const ExecutionPage = () => {
  const [activeTab, setActiveTab] = useState<ExecutionTab>('test-plans')

  return (
    <div className="h-full overflow-y-auto animate-fadeIn">
      <h2 className="mb-2 text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
        测试与执行
      </h2>
      <p className="mb-6 text-[14px] text-[var(--color-text-tertiary)]">
        管理测试计划、跟踪自动化执行结果
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

      {activeTab === 'test-plans' && <TestPlansPanel />}
      {activeTab === 'execution-center' && <ExecutionCenterPanel />}
    </div>
  )
}

/* ════════════════════════════════════════════
   测试计划面板
   ════════════════════════════════════════════ */

const TestPlansPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [plans, setPlans] = useState<PageResponse<TestPlanItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  /* 测试计划详情 */
  const [detailPlan, setDetailPlan] = useState<TestPlanItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pageTestPlans({
        page,
        size: 20,
        projectId: pid,
        keyword: keyword || undefined,
      })
      setPlans(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载测试计划失败')
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const handleOpenDetail = async (planId: number) => {
    setDetailLoading(true)
    try {
      const data = await getTestPlanDetail(planId)
      setDetailPlan(data)
    } catch {
      setDetailPlan(null)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          placeholder="搜索测试计划…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
          className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      {loading ? (
        <LoadingSpinner text="加载测试计划…" />
      ) : error ? (
        <ErrorState description={error} onRetry={fetchPlans} />
      ) : !plans || plans.records.length === 0 ? (
        <EmptyState
          title="暂无测试计划"
          description="该项目还没有测试计划。"
          icon={<FlaskConical className="h-6 w-6" strokeWidth={1.5} />}
        />
      ) : (
        <>
          <div className="space-y-3">
            {plans.records.map((plan) => (
              <div
                key={plan.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] cursor-pointer hover:shadow-[var(--shadow-card-hover)] transition-shadow"
                onClick={() => handleOpenDetail(plan.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                      {plan.name}
                    </h3>
                    {plan.description && (
                      <p className="mt-1 line-clamp-2 text-[13px] text-[var(--color-text-secondary)]">
                        {plan.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                      {plan.iterationName && <span>迭代: {plan.iterationName}</span>}
                      <span>{plan.caseCount} 用例</span>
                      {plan.automationEnabledCaseCount > 0 && (
                        <span>{plan.automationEnabledCaseCount} 自动化</span>
                      )}
                      {plan.startDate && plan.endDate && (
                        <span>
                          {formatDate(plan.startDate)} ~ {formatDate(plan.endDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium',
                        statusColorMap[plan.status] || 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {plan.status}
                    </span>
                    {plan.lastAutomationStatus && (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          statusColorMap[plan.lastAutomationStatus] || 'bg-gray-100 text-gray-600',
                        )}
                      >
                        自动化: {plan.lastAutomationStatus}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {plans.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                共 {plans.total} 个测试计划，第 {plans.page}/{plans.totalPages} 页
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
                  disabled={page >= plans.totalPages}
                  onClick={() => setPage((p) => Math.min(plans.totalPages, p + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 测试计划详情抽屉 */}
      {detailPlan && (
        <TestPlanDetailDrawer
          plan={detailPlan}
          loading={detailLoading}
          onClose={() => setDetailPlan(null)}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   测试计划详情抽屉
   ════════════════════════════════════════════ */

const TestPlanDetailDrawer = ({
  plan,
  loading,
  onClose,
}: {
  plan: TestPlanItem
  loading: boolean
  onClose: () => void
}) => (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-transparent" onClick={onClose} />
    <div className="absolute inset-y-0 right-0 flex flex-col w-full max-w-[900px] bg-white shadow-[var(--shadow-xl)] animate-slideLeft overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--color-border)] bg-white px-6 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] z-10">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{plan.name}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingSpinner fullscreen text="加载中…" />
        ) : (
          <div className="p-6 pb-4 space-y-5">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="状态">
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium', statusColorMap[plan.status] || 'bg-gray-100 text-gray-600')}>
                {plan.status}
              </span>
            </DetailField>
            <DetailField label="所属项目">
              <span className="text-[13px]">{plan.projectName}</span>
            </DetailField>
            {plan.iterationName && (
              <DetailField label="迭代">
                <span className="text-[13px]">{plan.iterationName}</span>
              </DetailField>
            )}
            <DetailField label="用例数">
              <span className="text-[13px] font-semibold">{plan.caseCount}</span>
            </DetailField>
            {plan.startDate && plan.endDate && (
              <DetailField label="周期">
                <span className="text-[13px]">{formatDate(plan.startDate)} ~ {formatDate(plan.endDate)}</span>
              </DetailField>
            )}
            {plan.automationEnabledCaseCount > 0 && (
              <DetailField label="自动化用例">
                <span className="text-[13px]">{plan.automationEnabledCaseCount} 个</span>
              </DetailField>
            )}
          </div>

          {plan.description && (
            <div>
              <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">描述</h4>
              <p className="text-[13px] text-[var(--color-text-secondary)]">{plan.description}</p>
            </div>
          )}

          {/* 自动化状态 */}
          {plan.lastAutomationStatus && (
            <div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-4">
              <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">最近自动化执行</h4>
              <div className="flex items-center gap-3">
                <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-medium', statusColorMap[plan.lastAutomationStatus] || 'bg-gray-100 text-gray-600')}>
                  {plan.lastAutomationStatus}
                </span>
                {plan.lastAutomationSummary && (
                  <span className="text-[12px] text-[var(--color-text-secondary)]">{plan.lastAutomationSummary}</span>
                )}
                {plan.lastAutomationMrUrl && (
                  <a href={plan.lastAutomationMrUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[var(--color-primary)] hover:underline inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />查看 MR
                  </a>
                )}
              </div>
            </div>
          )}

          {/* 测试用例列表 */}
          {plan.cases && plan.cases.length > 0 && (
            <div>
              <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
                测试用例 ({plan.cases.length})
              </h4>
              <div className="space-y-2">
                {plan.cases.map((tc, idx) => (
                  <TestCaseCard key={tc.id ?? idx} testCase={tc} index={idx + 1} />
                ))}
              </div>
            </div>
          )}

          {(!plan.cases || plan.cases.length === 0) && (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
              <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">暂无测试用例</p>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  </div>
)

/** 单个测试用例卡片。 */
const TestCaseCard = ({ testCase, index }: { testCase: TestCaseItem; index: number }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-bg-hover)] text-[11px] font-mono text-[var(--color-text-tertiary)]">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{testCase.title}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
            <span>{testCase.caseType}</span>
            <span className={cn(priorityColorMap[testCase.priority] || 'text-gray-500')}>{testCase.priority}</span>
            {testCase.moduleName && <span>{testCase.moduleName}</span>}
          </div>
        </div>
        <ChevronRight className={cn('h-4 w-4 text-[var(--color-text-tertiary)] transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="border-t border-[var(--color-border-light)] px-4 py-3 space-y-2">
          {testCase.precondition && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">前置条件</p>
              <p className="text-[12px] text-[var(--color-text-secondary)]">{testCase.precondition}</p>
            </div>
          )}
          {testCase.steps && testCase.steps.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">步骤</p>
              <div className="space-y-1.5">
                {testCase.steps.map((step, si) => (
                  <div key={si} className="flex gap-2 text-[12px]">
                    <span className="flex-shrink-0 w-5 text-right font-mono text-[var(--color-text-tertiary)]">{step.stepNo}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[var(--color-text-primary)]">{step.action}</p>
                      <p className="text-[var(--color-text-tertiary)]">预期: {step.expectedResult}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {testCase.remarks && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">备注</p>
              <p className="text-[12px] text-[var(--color-text-secondary)]">{testCase.remarks}</p>
            </div>
          )}
          {testCase.automationType && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">自动化: {testCase.automationType}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   执行中心面板
   ════════════════════════════════════════════ */

const ExecutionCenterPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [tasks, setTasks] = useState<PageResponse<ExecutionTaskItem> | null>(null)
  const [stats, setStats] = useState<ExecutionTaskListStatsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  /* 执行任务详情 */
  const [detailTask, setDetailTask] = useState<ExecutionTaskItem | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pageExecutionTasks({
        page,
        size: 20,
        projectId: pid,
        keyword: keyword || undefined,
      })
      setTasks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载执行任务失败')
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword])

  const fetchStats = async () => {
    try {
      const data = await getExecutionTaskListStats({ projectId: pid })
      setStats(data)
    } catch {
      /* 统计加载失败不阻塞页面 */
    }
  }

  useEffect(() => {
    fetchTasks()
    fetchStats()
  }, [fetchTasks])

  return (
    <div>
      {/* 统计卡片 */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card title="总计">
            <p className="text-[28px] font-bold text-[var(--color-text-primary)]">{stats.totalCount}</p>
          </Card>
          <Card title="待执行/执行中">
            <p className="text-[28px] font-bold text-amber-600">{stats.pendingOrRunningCount}</p>
          </Card>
          <Card title="成功">
            <p className="text-[28px] font-bold text-emerald-600">{stats.successCount}</p>
          </Card>
          <Card title="平均进度">
            <p className="text-[28px] font-bold text-blue-600">{stats.averageProgressPercent}%</p>
          </Card>
        </div>
      )}

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          placeholder="搜索执行任务…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
          className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      {loading ? (
        <LoadingSpinner text="加载执行任务…" />
      ) : error ? (
        <ErrorState description={error} onRetry={fetchTasks} />
      ) : !tasks || tasks.records.length === 0 ? (
        <EmptyState
          title="暂无执行任务"
          description="该项目还没有执行任务。"
          icon={<Play className="h-6 w-6" strokeWidth={1.5} />}
        />
      ) : (
        <>
          <div className="space-y-2">
            {tasks.records.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-[var(--shadow-xs)] cursor-pointer hover:shadow-[var(--shadow-sm)] transition-shadow"
                onClick={() => setDetailTask(task)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
                      <h4 className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                        {task.title}
                      </h4>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono">
                        {task.scenarioCode}
                      </span>
                      {task.workItemName && <span>工作项: {task.workItemName}</span>}
                      <span>创建者: {task.createdByName || '-'}</span>
                      <span>{formatDate(task.createdAt)}</span>
                    </div>
                    {task.latestSummary && (
                      <p className="mt-2 line-clamp-1 text-[12px] text-[var(--color-text-secondary)]">
                        {task.latestSummary}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium',
                        statusColorMap[task.status] || 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {task.status}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                      <div className="h-1.5 w-16 rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-primary)] transition-all"
                          style={{ width: `${task.progressPercent}%` }}
                        />
                      </div>
                      <span>{task.progressPercent}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {tasks.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                共 {tasks.total} 个执行任务，第 {tasks.page}/{tasks.totalPages} 页
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
                  disabled={page >= tasks.totalPages}
                  onClick={() => setPage((p) => Math.min(tasks.totalPages, p + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 执行任务详情抽屉 */}
      {detailTask && (
        <ExecutionTaskDetailDrawer task={detailTask} onClose={() => setDetailTask(null)} />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   执行任务详情抽屉
   ════════════════════════════════════════════ */

const ExecutionTaskDetailDrawer = ({
  task,
  onClose,
}: {
  task: ExecutionTaskItem
  onClose: () => void
}) => {
  const [runs, setRuns] = useState<ExecutionRunItem[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      setRunsLoading(true)
      try { setRuns(await listExecutionTaskRuns(task.id)) } catch { /* ignore */ }
      finally { setRunsLoading(false) }
    }
    fetch()
  }, [task.id])

  const handleCancel = async () => {
    setActionLoading(true)
    try { await cancelExecutionTask(task.id) } catch { /* ignore */ }
    finally { setActionLoading(false) }
  }

  const handleRetry = async () => {
    setActionLoading(true)
    try { await retryExecutionTask(task.id) } catch { /* ignore */ }
    finally { setActionLoading(false) }
  }

  return (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-transparent" onClick={onClose} />
    <div className="absolute inset-y-0 right-0 flex flex-col w-full max-w-[850px] bg-white shadow-[var(--shadow-xl)] animate-slideLeft overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--color-border)] bg-white px-6 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] z-10">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{task.title}</span>
        </div>
        <div className="flex items-center gap-1">
          {(task.status === 'PENDING' || task.status === 'RUNNING') && (
            <Button variant="danger" size="sm" onClick={handleCancel} loading={actionLoading}>取消</Button>
          )}
          {(task.status === 'FAILED' || task.status === 'CANCELLED') && (
            <Button variant="secondary" size="sm" onClick={handleRetry} loading={actionLoading}>重试</Button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-4 space-y-5">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4">
          <DetailField label="状态">
            <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium', statusColorMap[task.status] || 'bg-gray-100 text-gray-600')}>
              {task.status}
            </span>
          </DetailField>
          <DetailField label="进度">
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
                <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${task.progressPercent}%` }} />
              </div>
              <span className="text-[13px] font-semibold">{task.progressPercent}%</span>
            </div>
          </DetailField>
          <DetailField label="场景">
            <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[12px] font-mono">{task.scenarioCode}</span>
            <span className="ml-2 text-[12px] text-[var(--color-text-tertiary)]">{task.scenarioName}</span>
          </DetailField>
          <DetailField label="来源类型">
            <span className="text-[13px]">{task.sourceType}</span>
          </DetailField>
          {task.workItemName && (
            <DetailField label="关联工作项">
              <span className="text-[13px]">{task.workItemCode} {task.workItemName}</span>
            </DetailField>
          )}
          <DetailField label="创建者">
            <span className="text-[13px]">{task.createdByName || '-'}</span>
          </DetailField>
          <DetailField label="创建时间">
            <span className="text-[13px]">{formatDate(task.createdAt)}</span>
          </DetailField>
          <DetailField label="更新时间">
            <span className="text-[13px]">{formatDate(task.updatedAt)}</span>
          </DetailField>
        </div>

        {/* 当前执行步骤 */}
        {task.currentStepName && (
          <div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-4">
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">当前执行步骤</h4>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-text-tertiary)]">步骤 #{task.currentStepNo}</span>
              <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{task.currentStepName}</span>
              {task.currentRunStatus && (
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', statusColorMap[task.currentRunStatus] || 'bg-gray-100 text-gray-600')}>
                  {task.currentRunStatus}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 最新摘要 */}
        {task.latestSummary && (
          <div>
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">最新摘要</h4>
            <div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-4">
              <p className="text-[13px] text-[var(--color-text-secondary)]">{task.latestSummary}</p>
            </div>
          </div>
        )}

        {/* 计划确认状态 */}
        {task.planConfirmationRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-amber-800 text-[13px] font-medium">
              <AlertCircle className="h-4 w-4" />
              {task.planConfirmationPending ? '等待计划确认' : '需要计划确认'}
            </div>
          </div>
        )}

        {/* 运行历史 */}
        <div>
          <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            运行历史 {runs.length > 0 && <span className="text-[var(--color-text-tertiary)]">({runs.length})</span>}
          </h4>
          {runsLoading ? (
            <LoadingSpinner text="加载运行记录…" />
          ) : runs.length === 0 ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无运行记录</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="rounded-lg border border-[var(--color-border)] px-3.5 py-3 hover:bg-[var(--color-bg-hover)]/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-mono text-[var(--color-text-tertiary)]">#{run.runNo}</span>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', statusColorMap[run.status] || 'bg-gray-100 text-gray-600')}>
                        {run.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">{formatDate(run.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[12px] text-[var(--color-text-secondary)]">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-12 rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
                        <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${run.progressPercent}%` }} />
                      </div>
                      <span>{run.progressPercent}%</span>
                    </div>
                    {run.currentStepName && <span className="truncate">步骤: {run.currentStepName}</span>}
                  </div>
                  {run.outputSummary && (
                    <p className="mt-1.5 text-[12px] text-[var(--color-text-tertiary)] line-clamp-2">{run.outputSummary}</p>
                  )}
                  {run.errorMessage && (
                    <p className="mt-1.5 text-[12px] text-[var(--color-danger)]">{run.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  </div>
  )
}

/* ════════════════════════════════════════════
   公共组件
   ════════════════════════════════════════════ */

const DetailField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">{label}</p>
    {children}
  </div>
)
