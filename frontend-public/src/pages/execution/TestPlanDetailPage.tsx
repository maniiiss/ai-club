/**
 * 测试计划详情页。
 * 展示测试计划基础信息、用例列表（支持增删改）和自动化配置。
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FlaskConical,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  ExternalLink,
  Save,
  ChevronDown,
} from 'lucide-react'
import {
  getTestPlanDetail,
  updateTestPlan,
  generateAndRunTestPlanAutomation,
  runTestPlanAutomation,
} from '@/src/api/execution'
import type { TestPlanItem, TestCaseItem } from '@/src/types/execution'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { cn, formatDate } from '@/src/lib/utils'

const statusColorMap: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '待执行': 'bg-amber-50 text-amber-700',
  '执行中': 'bg-blue-50 text-blue-700',
  '已完成': 'bg-emerald-50 text-emerald-700',
}

const planStatusOptions = ['草稿', '待执行', '执行中', '已完成']
const caseTypeOptions = ['功能测试', '接口测试', '回归测试', '冒烟测试', '兼容性测试']
const priorityOptions = ['P0', 'P1', 'P2', 'P3']
const automationTypeOptions = [
  { value: '手工', label: '手工' },
  { value: '自动化', label: '自动化（Playwright）' },
]

const priorityColorMap: Record<string, string> = {
  P0: 'text-red-600 font-semibold',
  P1: 'text-orange-600 font-semibold',
  P2: 'text-amber-600',
  P3: 'text-gray-500',
}

/** 本地用例步骤（带 localId 用于稳定渲染）。 */
interface LocalStep {
  localId: string
  stepNo: number
  action: string
  expectedResult: string
}

/** 本地用例（带 localId 用于稳定渲染）。 */
interface LocalCase {
  localId: string
  title: string
  moduleName: string
  caseType: string
  priority: string
  precondition: string
  remarks: string
  automationType: string
  automationHint: string
  sortOrder: number
  steps: LocalStep[]
}

const createLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const createStep = (): LocalStep => ({
  localId: createLocalId(),
  stepNo: 1,
  action: '',
  expectedResult: '',
})

const createCase = (order: number): LocalCase => ({
  localId: createLocalId(),
  title: '',
  moduleName: '',
  caseType: '功能测试',
  priority: 'P2',
  precondition: '',
  remarks: '',
  automationType: '手工',
  automationHint: '',
  sortOrder: order,
  steps: [createStep()],
})

const normalizeText = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

const normalizeAutomationType = (value?: string | null) => {
  const normalized = String(value || '').trim()
  if (normalized === '自动化' || normalized === 'Playwright自动化' || normalized === 'Playwright 自动化' || normalized.toUpperCase() === 'PLAYWRIGHT') {
    return '自动化'
  }
  return '手工'
}

export const TestPlanDetailPage = () => {
  const { projectId, planId } = useParams<{ projectId: string; planId: string }>()
  const navigate = useNavigate()
  const pid = Number(planId)

  const [plan, setPlan] = useState<TestPlanItem | null>(null)
  const [cases, setCases] = useState<LocalCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [caseKeyword, setCaseKeyword] = useState('')
  const [casePage, setCasePage] = useState(1)
  const casePageSize = 10

  /* 用例编辑抽屉 */
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [activeCaseIndex, setActiveCaseIndex] = useState<number | null>(null)

  /* 自动化对话框 */
  const [automationVisible, setAutomationVisible] = useState(false)
  const [automationLoading, setAutomationLoading] = useState(false)

  const loadPlan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await getTestPlanDetail(pid)
      setPlan(detail)
      setCases(
        (detail.cases || []).map((tc, index) => ({
          localId: createLocalId(),
          title: normalizeText(tc.title),
          moduleName: normalizeText(tc.moduleName),
          caseType: normalizeText(tc.caseType, '功能测试') || '功能测试',
          priority: normalizeText(tc.priority, 'P2') || 'P2',
          precondition: normalizeText(tc.precondition),
          remarks: normalizeText(tc.remarks),
          automationType: normalizeAutomationType(normalizeText(tc.automationType)),
          automationHint: normalizeText(tc.automationHint),
          sortOrder: tc.sortOrder ?? index,
          steps: Array.isArray(tc.steps) && tc.steps.length
            ? tc.steps.map((step, si) => ({
                localId: createLocalId(),
                stepNo: step.stepNo ?? si + 1,
                action: normalizeText(step.action),
                expectedResult: normalizeText(step.expectedResult),
              }))
            : [createStep()],
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载测试计划详情失败')
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => {
    loadPlan()
  }, [loadPlan])

  /* 过滤和分页 */
  const filteredCases = useMemo(() => {
    const kw = caseKeyword.trim().toLowerCase()
    if (!kw) return cases
    return cases.filter((c) =>
      [c.title, c.moduleName, c.caseType, c.priority, c.precondition, c.remarks,
       ...c.steps.map((s) => `${s.action} ${s.expectedResult}`)]
        .join(' ')
        .toLowerCase()
        .includes(kw)
    )
  }, [cases, caseKeyword])

  const totalCasePages = Math.max(1, Math.ceil(filteredCases.length / casePageSize))
  const pagedCases = filteredCases.slice((casePage - 1) * casePageSize, casePage * casePageSize)

  /* 保存 */
  const buildPayload = () => {
    if (!plan) throw new Error('测试计划不存在')
    const payloadCases = cases
      .filter((c) => {
        const hasContent = c.title.trim() || c.moduleName.trim() || c.precondition.trim() ||
          c.remarks.trim() || c.steps.some((s) => s.action.trim() || s.expectedResult.trim())
        return hasContent
      })
      .map((c, index) => ({
        title: c.title.trim(),
        moduleName: c.moduleName.trim(),
        caseType: c.caseType || '功能测试',
        priority: c.priority || 'P2',
        precondition: c.precondition.trim(),
        remarks: c.remarks.trim(),
        sortOrder: index,
        automationType: c.automationType || '手工',
        automationHint: c.automationHint.trim(),
        steps: c.steps
          .filter((s) => s.action.trim() || s.expectedResult.trim())
          .map((s, si) => ({ stepNo: si + 1, action: s.action.trim(), expectedResult: s.expectedResult.trim() })),
      }))
    return {
      name: plan.name,
      projectId: plan.projectId,
      iterationId: plan.iterationId,
      status: plan.status,
      description: plan.description,
      startDate: plan.startDate,
      endDate: plan.endDate,
    }
  }

  const handleSave = async () => {
    if (!plan) return
    setSaving(true)
    try {
      await updateTestPlan(plan.id, buildPayload())
      await loadPlan()
    } catch {
      /* 静默 */
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!plan || plan.status === newStatus) return
    try {
      await updateTestPlan(plan.id, { ...buildPayload(), status: newStatus })
      setPlan({ ...plan, status: newStatus })
    } catch {
      /* 静默 */
    }
  }

  /* 用例操作 */
  const addCase = () => {
    setCases((prev) => [...prev, createCase(prev.length)])
    setCasePage(Math.max(1, Math.ceil((cases.length + 1) / casePageSize)))
    setActiveCaseIndex(cases.length)
    setDrawerVisible(true)
  }

  const removeCase = (index: number) => {
    setCases((prev) => prev.filter((_, i) => i !== index))
    if (activeCaseIndex !== null) {
      if (index === activeCaseIndex) {
        setActiveCaseIndex(null)
        setDrawerVisible(false)
      } else if (index < activeCaseIndex) {
        setActiveCaseIndex(activeCaseIndex - 1)
      }
    }
  }

  const updateCase = (index: number, updates: Partial<LocalCase>) => {
    setCases((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)))
  }

  const openCaseDrawer = (index: number) => {
    setActiveCaseIndex(index)
    setDrawerVisible(true)
  }

  if (loading) return <LoadingSpinner fullscreen text="加载测试计划详情…" />
  if (error) return <ErrorState description={error} onRetry={loadPlan} />
  if (!plan) return <ErrorState description="测试计划不存在" />

  const activeCase = activeCaseIndex !== null ? cases[activeCaseIndex] : null

  return (
    <div className="h-full overflow-y-auto animate-fadeIn">
      {/* Hero */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/projects/${projectId}/execution`)}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回测试计划
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
              {plan.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
              <span>项目: {plan.projectName}</span>
              {plan.iterationName && <span>迭代: {plan.iterationName}</span>}
              {plan.startDate && plan.endDate && (
                <span>{formatDate(plan.startDate)} ~ {formatDate(plan.endDate)}</span>
              )}
              <span>{cases.length} 用例</span>
              {plan.createdAt && <span>创建: {formatDate(plan.createdAt)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => setAutomationVisible(true)}>
              自动化测试
            </Button>
            <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} onClick={handleSave} loading={saving}>
              保存
            </Button>
          </div>
        </div>

        {/* 内联状态 */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] text-[var(--color-text-tertiary)]">状态:</span>
          <InlinePlanStatus currentStatus={plan.status} onChange={handleStatusChange} />
        </div>

        {plan.description && (
          <p className="mt-3 text-[13px] text-[var(--color-text-secondary)]">{plan.description}</p>
        )}

        {/* 自动化状态 */}
        {plan.lastAutomationStatus && (
          <div className="mt-3 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-3">
            <div className="flex items-center gap-3 text-[12px]">
              <span className="text-[var(--color-text-tertiary)]">最近自动化:</span>
              <span className={cn('rounded-full px-2 py-0.5 font-medium', statusColorMap[plan.lastAutomationStatus] || 'bg-gray-100 text-gray-600')}>
                {plan.lastAutomationStatus}
              </span>
              {plan.lastAutomationSummary && (
                <span className="text-[var(--color-text-secondary)]">{plan.lastAutomationSummary}</span>
              )}
              {plan.lastAutomationMrUrl && (
                <a href={plan.lastAutomationMrUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />查看 MR
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 用例列表 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="搜索用例…"
            value={caseKeyword}
            onChange={(e) => {
              setCaseKeyword(e.target.value)
              setCasePage(1)
            }}
            className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={addCase}>
          新增用例
        </Button>
      </div>

      {filteredCases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
          <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
            {cases.length ? '当前筛选条件下暂无用例' : '暂无测试用例，点击"新增用例"开始添加'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagedCases.map((tc) => {
              const absoluteIndex = cases.indexOf(tc)
              return (
                <div
                  key={tc.localId}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)] transition-shadow cursor-pointer"
                  onClick={() => openCaseDrawer(absoluteIndex)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                        {tc.title || '未命名用例'}
                      </h4>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                        <span>{tc.caseType}</span>
                        <span className={cn(priorityColorMap[tc.priority] || 'text-gray-500')}>{tc.priority}</span>
                        {tc.moduleName && <span>{tc.moduleName}</span>}
                        <span>{tc.steps.length} 步骤</span>
                        {tc.automationType === '自动化' && (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-700 font-medium">自动化</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeCase(absoluteIndex)
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-red-50 transition-colors"
                      title="删除用例"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {totalCasePages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                共 {filteredCases.length} 条用例，第 {casePage}/{totalCasePages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft className="h-4 w-4" />}
                  disabled={casePage <= 1}
                  onClick={() => setCasePage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={casePage >= totalCasePages}
                  onClick={() => setCasePage((p) => Math.min(totalCasePages, p + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 用例编辑抽屉 */}
      {drawerVisible && activeCase && activeCaseIndex !== null && (
        <CaseEditDrawer
          testCase={activeCase}
          onUpdate={(updates) => updateCase(activeCaseIndex, updates)}
          onClose={() => {
            setDrawerVisible(false)
            setActiveCaseIndex(null)
          }}
        />
      )}

      {/* 自动化对话框 */}
      {automationVisible && (
        <AutomationDialog
          plan={plan}
          cases={cases}
          onClose={() => setAutomationVisible(false)}
          onNavigate={(taskId) => navigate(`/projects/${projectId}/execution/tasks/${taskId}`)}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   内联状态选择
   ════════════════════════════════════════════ */

const InlinePlanStatus = ({
  currentStatus,
  onChange,
}: {
  currentStatus: string
  onChange: (status: string) => void
}) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium cursor-pointer transition-all',
          statusColorMap[currentStatus] || 'bg-gray-100 text-gray-600',
        )}
      >
        {currentStatus}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 min-w-[100px] rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-lg)]">
          {planStatusOptions.map((opt) => (
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
   用例编辑抽屉
   ════════════════════════════════════════════ */

const CaseEditDrawer = ({
  testCase,
  onUpdate,
  onClose,
}: {
  testCase: LocalCase
  onUpdate: (updates: Partial<LocalCase>) => void
  onClose: () => void
}) => {
  const addStep = () => {
    onUpdate({
      steps: [...testCase.steps, { ...createStep(), stepNo: testCase.steps.length + 1 }],
    })
  }

  const removeStep = (index: number) => {
    onUpdate({
      steps: testCase.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNo: i + 1 })),
    })
  }

  const updateStep = (index: number, field: keyof LocalStep, value: string) => {
    onUpdate({
      steps: testCase.steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    })
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-transparent" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex flex-col w-full max-w-[680px] bg-white shadow-[var(--shadow-xl)] animate-slideLeft overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--color-border)] bg-white px-6 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] z-10">
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            {testCase.title || '编辑用例'}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 基础信息 */}
          <section>
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
              基础信息
            </h4>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--color-text-secondary)]">用例标题</label>
                <input
                  type="text"
                  value={testCase.title}
                  onChange={(e) => onUpdate({ title: e.target.value })}
                  placeholder="请输入测试用例标题"
                  className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--color-text-secondary)]">功能模块</label>
                  <input
                    type="text"
                    value={testCase.moduleName}
                    onChange={(e) => onUpdate({ moduleName: e.target.value })}
                    placeholder="例如：登录、审批"
                    className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--color-text-secondary)]">用例类型</label>
                  <select
                    value={testCase.caseType}
                    onChange={(e) => onUpdate({ caseType: e.target.value })}
                    className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    {caseTypeOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--color-text-secondary)]">优先级</label>
                  <select
                    value={testCase.priority}
                    onChange={(e) => onUpdate({ priority: e.target.value })}
                    className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    {priorityOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--color-text-secondary)]">自动化类型</label>
                  <select
                    value={testCase.automationType}
                    onChange={(e) => onUpdate({ automationType: e.target.value })}
                    className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    {automationTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--color-text-secondary)]">前置条件</label>
                <textarea
                  value={testCase.precondition}
                  onChange={(e) => onUpdate({ precondition: e.target.value })}
                  placeholder="请输入前置条件"
                  rows={3}
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 步骤 */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                步骤与预期结果 ({testCase.steps.length})
              </h4>
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addStep}>
                添加步骤
              </Button>
            </div>
            {testCase.steps.length === 0 ? (
              <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无步骤</p>
            ) : (
              <div className="space-y-3">
                {testCase.steps.map((step, si) => (
                  <div key={step.localId} className="flex gap-3">
                    <span className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-bold text-white mt-1">
                      {si + 1}
                    </span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <textarea
                        value={step.action}
                        onChange={(e) => updateStep(si, 'action', e.target.value)}
                        placeholder="步骤描述"
                        rows={2}
                        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none"
                      />
                      <textarea
                        value={step.expectedResult}
                        onChange={(e) => updateStep(si, 'expectedResult', e.target.value)}
                        placeholder="预期结果"
                        rows={2}
                        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => removeStep(si)}
                      className="shrink-0 mt-1 rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 自动化提示 */}
          <section>
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
              自动化提示
            </h4>
            <textarea
              value={testCase.automationHint}
              onChange={(e) => onUpdate({ automationHint: e.target.value })}
              placeholder="例如：页面路径: /login&#10;就绪选择器: [data-testid=&quot;login-form&quot;]"
              rows={4}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </section>

          {/* 备注 */}
          <section>
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
              备注
            </h4>
            <textarea
              value={testCase.remarks}
              onChange={(e) => onUpdate({ remarks: e.target.value })}
              placeholder="可填写备注、数据准备说明或风险提示"
              rows={4}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </section>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   自动化测试对话框
   ════════════════════════════════════════════ */

const AutomationDialog = ({
  plan,
  cases,
  onClose,
  onNavigate,
}: {
  plan: TestPlanItem
  cases: LocalCase[]
  onClose: () => void
  onNavigate: (taskId: number) => void
}) => {
  const [loading, setLoading] = useState(false)
  const automatedCount = cases.filter((c) => normalizeAutomationType(c.automationType) === '自动化').length

  const handleGenerateAndRun = async () => {
    if (automatedCount <= 0) return
    setLoading(true)
    try {
      const task = await generateAndRunTestPlanAutomation(plan.id)
      onNavigate(task.id)
    } catch {
      /* 静默 */
    } finally {
      setLoading(false)
    }
  }

  const handleRun = async () => {
    if (automatedCount <= 0) return
    setLoading(true)
    try {
      const task = await runTestPlanAutomation(plan.id)
      onNavigate(task.id)
    } catch {
      /* 静默 */
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-[var(--shadow-xl)]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">自动化测试</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-4 space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[var(--color-text-tertiary)]">自动化用例</span>
              <span className="font-semibold">{automatedCount} 条</span>
            </div>
            {plan.lastAutomationStatus && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--color-text-tertiary)]">最近状态</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', statusColorMap[plan.lastAutomationStatus] || 'bg-gray-100 text-gray-600')}>
                  {plan.lastAutomationStatus}
                </span>
              </div>
            )}
            {plan.lastAutomationSummary && (
              <p className="text-[12px] text-[var(--color-text-secondary)]">
                摘要: {plan.lastAutomationSummary}
              </p>
            )}
          </div>

          {automatedCount <= 0 && (
            <p className="text-[12px] text-amber-600">
              请先把至少一条测试用例标记为"自动化"才能执行。
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <Button variant="secondary" onClick={handleGenerateAndRun} loading={loading} disabled={automatedCount <= 0}>
            生成并验证
          </Button>
          <Button onClick={handleRun} loading={loading} disabled={automatedCount <= 0}>
            执行已接入自动化
          </Button>
        </div>
      </div>
    </div>
  )
}
