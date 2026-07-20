/**
 * 测试和执行中心页面实现。
 * 测试计划与执行任务共用数据访问和卡片实现，但通过项目路由分别呈现。
 */
import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FlaskConical,
  Play,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import {
  pageTestPlans,
  getTestPlanDetail,
  pageExecutionTasks,
  getExecutionTaskListStats,
  cancelExecutionTask,
  retryExecutionTask,
  updateTestPlan,
  createTestPlan,
  deleteTestPlan,
  listTestPlanIterations,
} from '@/src/api/execution'
import { listProjectOptions } from '@/src/api/projects'
import type {
  TestPlanItem,
  ExecutionTaskItem,
  ExecutionTaskListStatsItem,
} from '@/src/types/execution'
import type { ProjectItem } from '@/src/types/project'
import type { PageResponse } from '@/src/types/api'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate } from '@/src/lib/utils'
import { DateRangePicker } from '@/src/components/common/DateRangePicker'
import { Select } from '@/src/components/common/Select'
import { useGuide } from '@/src/components/guide'
import { useAuthStore } from '@/src/stores/auth'

const statusColorMap: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '待执行': 'bg-amber-50 text-amber-700',
  '执行中': 'bg-blue-50 text-blue-700',
  '已完成': 'bg-emerald-50 text-emerald-700',
  '成功': 'bg-emerald-50 text-emerald-700',
  '失败': 'bg-red-50 text-red-700',
  '已取消': 'bg-gray-100 text-gray-600',
  '待确认': 'bg-purple-50 text-purple-700',
  IDLE: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-amber-50 text-amber-700',
  WAITING_CONFIRMATION: 'bg-purple-50 text-purple-700',
  RUNNING: 'bg-blue-50 text-blue-700',
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELED: 'bg-gray-100 text-gray-600',
}

const planStatusOptions = ['草稿', '待执行', '执行中', '已完成']

const executionStatusOptions = [
  { value: 'PENDING', label: '待执行' },
  { value: 'WAITING_CONFIRMATION', label: '待确认' },
  { value: 'RUNNING', label: '执行中' },
  { value: 'SUCCESS', label: '成功' },
  { value: 'FAILED', label: '失败' },
  { value: 'CANCELED', label: '已取消' },
]

const scenarioOptions = [
  { value: 'TECHNICAL_DESIGN_AUTHORING', label: '技术设计 AI' },
  { value: 'DEVELOPMENT_IMPLEMENTATION', label: '开发执行' },
  { value: 'TEST_AUTOMATION', label: '自动化测试' },
  { value: 'CODEBASE_COMPLIANCE_SCAN', label: '仓库规范扫描' },
]

/** 执行状态码转中文标签。 */
const executionStatusLabel = (status: string) => {
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

const priorityColorMap: Record<string, string> = {
  '高': 'text-red-600 font-semibold',
  '中': 'text-amber-600',
  '低': 'text-gray-500',
  P0: 'text-red-600 font-semibold',
  P1: 'text-orange-600 font-semibold',
  P2: 'text-amber-600',
  P3: 'text-gray-500',
}

const ExecutionModulePage = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) => (
  <div className="h-full overflow-y-auto animate-fadeIn">
    <h2 className="mb-2 text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
      {title}
    </h2>
    <p className="mb-6 text-[14px] text-[var(--color-text-tertiary)]">
      {description}
    </p>
    {children}
  </div>
)

/** 测试入口：仅展示测试计划和测试用例管理。 */
export const TestPlansPage = () => (
  <ExecutionModulePage title="测试" description="管理测试计划、测试用例与自动化测试准备">
    <TestPlansPanel />
  </ExecutionModulePage>
)

/** 执行中心入口：仅展示平台执行任务及其运行状态。 */
export const ExecutionCenterPage = () => (
  <ExecutionModulePage title="执行中心" description="跟踪技术设计、开发、测试与交付执行任务">
    <ExecutionCenterPanel />
  </ExecutionModulePage>
)

/** 兼容旧引用，新的项目路由使用 TestPlansPage 和 ExecutionCenterPage。 */
export const ExecutionPage = ExecutionCenterPage

/* ════════════════════════════════════════════
   测试计划面板
   ════════════════════════════════════════════ */

const TestPlansPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const pid = Number(projectId)

  const [plans, setPlans] = useState<PageResponse<TestPlanItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  /* 新建/编辑对话框 */
  const [formVisible, setFormVisible] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [editingPlan, setEditingPlan] = useState<TestPlanItem | null>(null)

  /* 状态切换 */
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)

  const { isCompleted: guideCompleted, startGuide } = useGuide('testing')
  const authUser = useAuthStore((s) => s.user)

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

  // 测试计划首次加载完成后自动启动新手引导
  useEffect(() => {
    if (!guideCompleted && authUser && !loading && !error) {
      const timer = setTimeout(() => startGuide(), 500)
      return () => clearTimeout(timer)
    }
  }, [guideCompleted, authUser, loading, error, startGuide])

  const handleOpenDetail = (planId: number) => {
    navigate(`/projects/${projectId}/testing/test-plans/${planId}`)
  }

  const handleStatusChange = async (plan: TestPlanItem, newStatus: string) => {
    if (plan.status === newStatus) return
    setStatusUpdatingId(plan.id)
    try {
      await updateTestPlan(plan.id, {
        name: plan.name,
        projectId: plan.projectId,
        iterationId: plan.iterationId,
        status: newStatus,
        description: plan.description,
        startDate: plan.startDate,
        endDate: plan.endDate,
      })
      await fetchPlans()
    } catch {
      /* 静默处理 */
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const handleDelete = async (plan: TestPlanItem) => {
    if (!window.confirm(`确认删除测试计划「${plan.name}」吗？计划下的测试用例会一并删除。`)) return
    try {
      await deleteTestPlan(plan.id)
      await fetchPlans()
    } catch {
      /* 静默处理 */
    }
  }

  const handleEdit = async (planId: number) => {
    setFormLoading(true)
    try {
      const detail = await getTestPlanDetail(planId)
      setEditingPlan(detail)
      setFormVisible(true)
    } catch {
      /* 静默处理 */
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Input
          data-guide-id="testing-search"
          size="sm"
          adaptiveIcon
          wrapperClassName="min-w-0 max-w-xs flex-1"
          icon={<Search className="h-4 w-4" />}
            placeholder="搜索测试计划…"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
        />
        <Button
          data-guide-id="testing-create"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setEditingPlan(null)
            setFormVisible(true)
          }}
        >
          新建测试计划
        </Button>
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
          <div data-guide-id="testing-plan-list" className="space-y-3">
            {plans.records.map((plan) => (
              <div
                key={plan.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => handleOpenDetail(plan.id)}
                  >
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
                    {/* 内联状态切换 */}
                    <InlineStatusSelect
                      currentStatus={plan.status}
                      options={planStatusOptions}
                      disabled={statusUpdatingId === plan.id}
                      onChange={(newStatus) => handleStatusChange(plan, newStatus)}
                    />
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
                {/* 操作按钮 */}
                <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border-light)] pt-3">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(plan.id)}>
                    进入计划
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(plan.id)} loading={formLoading}>
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => handleDelete(plan)}
                    className="text-[var(--color-danger)] hover:text-red-700"
                  >
                    删除
                  </Button>
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

      {/* 新建/编辑对话框 */}
      {formVisible && (
        <TestPlanFormDialog
          projectId={pid}
          editingPlan={editingPlan}
          onClose={() => {
            setFormVisible(false)
            setEditingPlan(null)
          }}
          onSaved={() => {
            setFormVisible(false)
            setEditingPlan(null)
            fetchPlans()
          }}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   内联状态选择器
   ════════════════════════════════════════════ */

const InlineStatusSelect = ({
  currentStatus,
  options,
  disabled,
  onChange,
}: {
  currentStatus: string
  options: string[]
  disabled?: boolean
  onChange: (value: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
          statusColorMap[currentStatus] || 'bg-gray-100 text-gray-600',
          !disabled && 'cursor-pointer hover:opacity-80',
          disabled && 'opacity-50',
        )}
      >
        {currentStatus}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[100px] rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-lg)]">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt)
                setOpen(false)
              }}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-[12px] transition-colors',
                opt === currentStatus
                  ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   测试计划表单对话框
   ════════════════════════════════════════════ */

interface IterationOption {
  id: number
  name: string
  startDate: string | null
  endDate: string | null
}

const TestPlanFormDialog = ({
  projectId,
  editingPlan,
  onClose,
  onSaved,
}: {
  projectId: number
  editingPlan: TestPlanItem | null
  onClose: () => void
  onSaved: () => void
}) => {
  const isEditing = Boolean(editingPlan)
  const [name, setName] = useState(editingPlan?.name || '')
  const [description, setDescription] = useState(editingPlan?.description || '')
  const [status, setStatus] = useState(editingPlan?.status || '草稿')
  const [iterationId, setIterationId] = useState<number | null>(editingPlan?.iterationId ?? null)
  const [startDate, setStartDate] = useState(editingPlan?.startDate || '')
  const [endDate, setEndDate] = useState(editingPlan?.endDate || '')
  const [iterations, setIterations] = useState<IterationOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listTestPlanIterations(projectId)
        setIterations(data)
        if (!isEditing && data.length > 0 && !iterationId) {
          setIterationId(data[0].id)
          if (data[0].startDate) setStartDate(data[0].startDate)
          if (data[0].endDate) setEndDate(data[0].endDate)
        }
      } catch {
        /* 静默 */
      }
    }
    load()
  }, [projectId])

  const handleIterationChange = (id: number) => {
    setIterationId(id)
    const iter = iterations.find((i) => i.id === id)
    if (iter) {
      if (iter.startDate) setStartDate(iter.startDate)
      if (iter.endDate) setEndDate(iter.endDate)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        projectId,
        iterationId,
        status,
        description: description.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
      }
      if (isEditing && editingPlan) {
        await updateTestPlan(editingPlan.id, payload)
      } else {
        await createTestPlan(payload)
      }
      onSaved()
    } catch {
      /* 静默 */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-[var(--shadow-xl)]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
            {isEditing ? '编辑测试计划' : '新建测试计划'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">
              计划名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入测试计划名称"
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 text-[14px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="所属迭代"
              value={iterationId ? String(iterationId) : ''}
              onChange={(v) => handleIterationChange(v ? Number(v) : 0)}
              placeholder="请选择迭代"
              options={iterations.map((iter) => ({ value: String(iter.id), label: iter.name }))}
            />
            <Select
              label="状态"
              value={status}
              onChange={(v) => setStatus(v)}
              options={planStatusOptions.map((opt) => ({ value: opt, label: opt }))}
            />
          </div>

          <DateRangePicker
            label="计划时间"
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start)
              setEndDate(end)
            }}
          />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">
              说明
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="用于描述测试范围、版本范围和执行目标"
              rows={4}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2.5 text-[14px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!name.trim()}>
            {isEditing ? '保存计划' : '创建计划'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   执行中心面板
   ════════════════════════════════════════════ */

const ExecutionCenterPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const pid = Number(projectId)

  const [tasks, setTasks] = useState<PageResponse<ExecutionTaskItem> | null>(null)
  const [stats, setStats] = useState<ExecutionTaskListStatsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  const { isCompleted: guideCompleted, startGuide } = useGuide('execution')
  const authUser = useAuthStore((s) => s.user)

  /* 筛选 */
  const [filterStatus, setFilterStatus] = useState('')
  const [filterScenario, setFilterScenario] = useState('')
  const [filterVisible, setFilterVisible] = useState(false)
  const [projectOptions, setProjectOptions] = useState<ProjectItem[]>([])

  /* 轮询 */
  const pollTimerRef = useRef<number | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [data, statsData] = await Promise.all([
        pageExecutionTasks({
          page,
          size: 20,
          projectId: pid,
          keyword: keyword || undefined,
          status: filterStatus || undefined,
          scenarioCode: filterScenario || undefined,
        }),
        getExecutionTaskListStats({
          projectId: pid,
          keyword: keyword || undefined,
          status: filterStatus || undefined,
          scenarioCode: filterScenario || undefined,
        }),
      ])
      setTasks(data)
      setStats(statsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载执行任务失败')
    } finally {
      setLoading(false)
    }
  }, [pid, page, keyword, filterStatus, filterScenario])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // 执行任务首次加载完成后自动启动新手引导。
  // 用派生布尔值做依赖：轮询每 8 秒替换 tasks 对象，若直接依赖 tasks 会导致引导反复触发。
  const guideDataReady = tasks !== null && !error
  useEffect(() => {
    if (!guideCompleted && authUser && guideDataReady) {
      const timer = setTimeout(() => startGuide(), 500)
      return () => clearTimeout(timer)
    }
  }, [guideCompleted, authUser, guideDataReady, startGuide])

  /* 自动轮询：当存在运行中或待执行任务时每 8 秒刷新。 */
  useEffect(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (tasks?.records.some((t) => ['PENDING', 'RUNNING', 'WAITING_CONFIRMATION'].includes(t.status))) {
      pollTimerRef.current = window.setInterval(() => {
        fetchTasks()
      }, 8000)
    }
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current)
      }
    }
  }, [tasks, fetchTasks])

  /* 加载项目选项 */
  useEffect(() => {
    listProjectOptions().then(setProjectOptions).catch(() => {})
  }, [])

  const handleOpenDetail = (taskId: number) => {
    navigate(`/projects/${projectId}/execution/tasks/${taskId}`)
  }

  const handleCancel = async (task: ExecutionTaskItem) => {
    if (!window.confirm(`确认取消执行任务「${task.title}」吗？`)) return
    try {
      await cancelExecutionTask(task.id)
      await fetchTasks()
    } catch {
      /* 静默 */
    }
  }

  const handleRetry = async (task: ExecutionTaskItem) => {
    try {
      await retryExecutionTask(task.id)
      await fetchTasks()
    } catch {
      /* 静默 */
    }
  }

  const handleResetFilters = () => {
    setKeyword('')
    setFilterStatus('')
    setFilterScenario('')
    setPage(1)
  }

  const hasActiveFilters = Boolean(filterStatus || filterScenario)

  return (
    <div>
      {/* 统计卡片 */}
      {stats && (
        <div data-guide-id="execution-stats" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* 搜索和筛选 */}
      <div data-guide-id="execution-toolbar" className="mb-4 flex items-center gap-3">
        <Input
          size="sm"
          adaptiveIcon
          wrapperClassName="min-w-0 max-w-xs flex-1"
          icon={<Search className="h-4 w-4" />}
            placeholder="搜索执行任务…"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
        />
        <button
          type="button"
          onClick={() => setFilterVisible(!filterVisible)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
            hasActiveFilters
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
              : 'border-[var(--color-border-strong)] bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          筛选
          {hasActiveFilters && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] text-white">
              {(filterStatus ? 1 : 0) + (filterScenario ? 1 : 0)}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={fetchTasks}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      {/* 筛选面板 */}
      {filterVisible && (
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-[var(--shadow-sm)]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="执行场景"
              value={filterScenario}
              onChange={(value) => {
                setFilterScenario(value)
                setPage(1)
              }}
              options={[
                { value: '', label: '全部场景' },
                ...scenarioOptions,
              ]}
            />
            <Select
              label="执行状态"
              value={filterStatus}
              onChange={(value) => {
                setFilterStatus(value)
                setPage(1)
              }}
              options={[
                { value: '', label: '全部状态' },
                ...executionStatusOptions,
              ]}
            />
            <div className="flex items-end">
              <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                重置筛选
              </Button>
            </div>
          </div>
        </div>
      )}

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
          <div data-guide-id="execution-task-list" className="space-y-2">
            {tasks.records.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-[var(--shadow-xs)] cursor-pointer hover:shadow-[var(--shadow-sm)] transition-shadow"
                onClick={() => handleOpenDetail(task.id)}
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
                      <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-medium">
                        {task.scenarioName || task.scenarioCode}
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
                      {executionStatusLabel(task.status)}
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
                {/* 操作按钮 */}
                <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border-light)] pt-3">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(task.id)}>
                    查看详情
                  </Button>
                  {['PENDING', 'RUNNING', 'WAITING_CONFIRMATION'].includes(task.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCancel(task)
                      }}
                      className="text-amber-600 hover:text-amber-700"
                    >
                      取消
                    </Button>
                  )}
                  {['FAILED', 'CANCELED'].includes(task.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetry(task)
                      }}
                    >
                      重试
                    </Button>
                  )}
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
    </div>
  )
}
