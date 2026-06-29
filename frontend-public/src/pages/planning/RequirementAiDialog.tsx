/**
 * 需求 AI 助手弹窗组件。
 * 支持标准化需求、拆解子任务、生成测试用例三个动作，
 * 调用公众端接口（自带积分扣费），提供 AI 结果预览、评论/描述写入、子任务创建、测试计划导入等后续操作。
 */
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Sparkles, MessageSquare, FileDown, Replace, Plus, Trash2,
  Coins, FlaskConical, ListChecks, FileText,
} from 'lucide-react'
import { generateRequirementAi } from '@/src/api/requirementAi'
import { getMyFeatureCosts } from '@/src/api/credits'
import { createTaskComment, updateWorkItem, createWorkItem } from '@/src/api/planning'
import { pageTestPlans, getTestPlanDetail, createTestPlan, updateTestPlan } from '@/src/api/execution'
import { Markdown } from '@/src/components/common/Markdown'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { cn, getErrorMessage } from '@/src/lib/utils'
import type { WorkItem } from '@/src/types/planning'
import type { TestPlanItem } from '@/src/types/execution'
import type {
  RequirementAiResult,
  TaskSuggestionItem,
  TestCaseSuggestionItem,
  TestCaseStepSuggestionItem,
} from '@/src/types/requirementAi'

/* ── 常量 ── */

const taskCategoryOptions = ['需求设计', 'UI设计', '技术设计', '开发', '测试', '部署']
const taskPriorityOptions = ['高', '中', '低']
const caseTypeOptions = ['功能测试', '接口测试', '回归测试', '异常测试', '兼容性测试', '性能测试']
const casePriorityOptions = ['P0', 'P1', 'P2', 'P3']

/* ── Props ── */

interface RequirementAiDialogProps {
  open: boolean
  workItem: WorkItem
  onClose: () => void
  onChanged: () => void
  /** 打开后自动执行的 AI 动作（如 'STANDARDIZE'），执行一次后忽略。 */
  autoRunAction?: string
}

export const RequirementAiDialog = ({ open, workItem, onClose, onChanged, autoRunAction }: RequirementAiDialogProps) => {
  /* ── 积分费用 ── */
  const [featureCosts, setFeatureCosts] = useState<Record<string, number>>({})

  /* ── AI 生成状态 ── */
  const [result, setResult] = useState<RequirementAiResult | null>(null)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'success' | 'error'>('idle')

  /* ── 拆解建议编辑态 ── */
  const [taskSuggestions, setTaskSuggestions] = useState<TaskSuggestionItem[]>([])
  const [creatingTasks, setCreatingTasks] = useState(false)

  /* ── 测试用例建议编辑态 ── */
  const [testCaseSuggestions, setTestCaseSuggestions] = useState<TestCaseSuggestionItem[]>([])
  const [testPlanOptions, setTestPlanOptions] = useState<TestPlanItem[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [importingTestCases, setImportingTestCases] = useState(false)
  const [creatingTestPlan, setCreatingTestPlan] = useState(false)

  /* ── 操作状态 ── */
  const [postingComment, setPostingComment] = useState(false)
  const [appendingDesc, setAppendingDesc] = useState(false)
  const [replacingDesc, setReplacingDesc] = useState(false)

  /* ── Toast ── */
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  /* ── 初始化加载 ── */
  useEffect(() => {
    if (!open) return
    getMyFeatureCosts()
      .then(setFeatureCosts)
      .catch(() => {})
  }, [open])

  /* ── 关闭时重置状态 ── */
  useEffect(() => {
    if (!open) {
      setResult(null)
      setRunningAction(null)
      setGenerationStatus('idle')
      setTaskSuggestions([])
      setTestCaseSuggestions([])
      setTestPlanOptions([])
      setSelectedPlanId('')
      setToast(null)
    }
  }, [open])

  /* ── 打开时自动执行指定 AI 动作 ── */
  useEffect(() => {
    if (open && autoRunAction && !result && !runningAction) {
      runAction(autoRunAction)
    }
    // 仅在打开且有 autoRunAction 时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoRunAction])

  if (!open) return null

  const requirementAiCost = featureCosts['REQUIREMENT_AI']
  const testCaseAiCost = featureCosts['TEST_CASE_AI']

  /* 拆解子任务和测试用例需要右侧操作面板，标准化需求仅展示 Markdown 全宽即可 */
  const showRightPanel = result?.action === 'BREAKDOWN' || result?.action === 'TEST_CASES'

  /* ── AI 生成 ── */

  const runAction = async (action: string) => {
    setRunningAction(action)
    setGenerationStatus('idle')
    try {
      const data = await generateRequirementAi(workItem.id, { action })
      setResult(data)
      setGenerationStatus('success')
      // 克隆建议数据到编辑态
      setTaskSuggestions(data.taskSuggestions.map((s) => ({ ...s })))
      setTestCaseSuggestions(data.testCaseSuggestions.map((s) => ({
        ...s,
        steps: s.steps.map((step) => ({ ...step })),
      })))
      // 测试用例动作时加载测试计划选项
      if (action === 'TEST_CASES') {
        loadTestPlanOptions()
      }
      showToast('success', `${actionLabel(action)} 完成`)
    } catch (err) {
      setGenerationStatus('error')
      showToast('error', getErrorMessage(err) || 'AI 生成失败')
    } finally {
      setRunningAction(null)
    }
  }

  const loadTestPlanOptions = async () => {
    try {
      const page = await pageTestPlans({
        page: 1,
        size: 100,
        projectId: workItem.projectId,
        iterationId: workItem.iterationId || undefined,
      })
      setTestPlanOptions(page.records)
    } catch {
      setTestPlanOptions([])
    }
  }

  /* ── 结果操作 ── */

  const postAsComment = async () => {
    if (!result?.markdown) return
    setPostingComment(true)
    try {
      await createTaskComment(workItem.id, result.markdown)
      showToast('success', '已发到评论')
      onChanged()
    } catch (err) {
      showToast('error', getErrorMessage(err) || '发送评论失败')
    } finally {
      setPostingComment(false)
    }
  }

  const appendToDescription = async () => {
    if (!result?.markdown) return
    setAppendingDesc(true)
    try {
      const newDesc = (workItem.description || '') + '\n\n' + result.markdown
      await updateWorkItem(workItem.id, {
        name: workItem.name,
        status: workItem.status,
        priority: workItem.priority,
        assignee: workItem.assignee,
        description: newDesc,
        projectId: workItem.projectId,
        agentId: workItem.agentId,
      })
      workItem.description = newDesc
      showToast('success', '已追加到描述')
      onChanged()
    } catch (err) {
      showToast('error', getErrorMessage(err) || '更新描述失败')
    } finally {
      setAppendingDesc(false)
    }
  }

  const replaceDescription = async () => {
    if (!result?.markdown) return
    setReplacingDesc(true)
    try {
      await updateWorkItem(workItem.id, {
        name: workItem.name,
        status: workItem.status,
        priority: workItem.priority,
        assignee: workItem.assignee,
        description: result.markdown,
        projectId: workItem.projectId,
        agentId: workItem.agentId,
      })
      workItem.description = result.markdown
      showToast('success', '已替换描述')
      onChanged()
    } catch (err) {
      showToast('error', getErrorMessage(err) || '更新描述失败')
    } finally {
      setReplacingDesc(false)
    }
  }

  /* ── 拆解子任务操作 ── */

  const createSuggestedTasks = async () => {
    if (!taskSuggestions.length) return
    setCreatingTasks(true)
    try {
      for (const item of taskSuggestions) {
        await createWorkItem({
          name: item.name,
          workItemType: '任务',
          status: '待开始',
          priority: item.priority,
          assignee: workItem.assignee,
          description: item.description,
          projectId: workItem.projectId,
          agentId: null,
          iterationId: workItem.iterationId,
          requirementTaskId: workItem.workItemType === '需求' ? workItem.id : workItem.requirementTaskId,
        })
      }
      showToast('success', `已创建 ${taskSuggestions.length} 个子任务`)
      onChanged()
    } catch (err) {
      showToast('error', getErrorMessage(err) || '创建子任务失败')
    } finally {
      setCreatingTasks(false)
    }
  }

  const removeTaskSuggestion = (index: number) => {
    setTaskSuggestions((prev) => prev.filter((_, i) => i !== index))
  }

  const updateTaskSuggestion = (index: number, patch: Partial<TaskSuggestionItem>) => {
    setTaskSuggestions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  /* ── 测试用例操作 ── */

  const removeTestCaseSuggestion = (index: number) => {
    setTestCaseSuggestions((prev) => prev.filter((_, i) => i !== index))
  }

  const updateTestCaseSuggestion = (index: number, patch: Partial<TestCaseSuggestionItem>) => {
    setTestCaseSuggestions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const appendStep = (testCase: TestCaseSuggestionItem) => {
    const nextStepNo = testCase.steps.length + 1
    testCase.steps.push({ stepNo: nextStepNo, action: '', expectedResult: '' })
    setTestCaseSuggestions([...testCaseSuggestions])
  }

  const removeStep = (testCase: TestCaseSuggestionItem, stepIndex: number) => {
    testCase.steps.splice(stepIndex, 1)
    testCase.steps.forEach((s, i) => { s.stepNo = i + 1 })
    setTestCaseSuggestions([...testCaseSuggestions])
  }

  const updateStep = (testCase: TestCaseSuggestionItem, stepIndex: number, patch: Partial<TestCaseStepSuggestionItem>) => {
    Object.assign(testCase.steps[stepIndex], patch)
    setTestCaseSuggestions([...testCaseSuggestions])
  }

  const buildCasesPayload = (suggestions: TestCaseSuggestionItem[]) =>
    suggestions.map((item, idx) => ({
      title: item.title,
      moduleName: item.moduleName,
      caseType: item.caseType,
      priority: item.priority,
      precondition: item.precondition,
      remarks: item.remarks,
      sortOrder: idx + 1,
      automationType: '',
      automationHint: '',
      steps: item.steps.map((s) => ({ id: null, stepNo: s.stepNo, action: s.action, expectedResult: s.expectedResult })),
    }))

  const importToExistingPlan = async () => {
    if (!selectedPlanId || !testCaseSuggestions.length) return
    setImportingTestCases(true)
    try {
      const plan = await getTestPlanDetail(Number(selectedPlanId))
      const existingCases = plan.cases || []
      const newCases = buildCasesPayload(testCaseSuggestions)
      const allCases = [...existingCases, ...newCases]
      await updateTestPlan(Number(selectedPlanId), {
        name: plan.name,
        projectId: plan.projectId,
        iterationId: plan.iterationId,
        status: plan.status,
        description: plan.description,
      })
      showToast('success', `已导入 ${testCaseSuggestions.length} 条用例到「${plan.name}」`)
      onChanged()
    } catch (err) {
      showToast('error', getErrorMessage(err) || '导入测试计划失败')
    } finally {
      setImportingTestCases(false)
    }
  }

  const createNewPlanWithCases = async () => {
    if (!testCaseSuggestions.length) return
    setCreatingTestPlan(true)
    try {
      const planName = `${workItem.name} - 测试计划`
      await createTestPlan({
        name: planName,
        projectId: workItem.projectId,
        iterationId: workItem.iterationId,
        status: '待执行',
        description: `由需求 AI 助手自动生成，基于工作项「${workItem.name}」`,
      })
      showToast('success', `已新建测试计划「${planName}」`)
      onChanged()
    } catch (err) {
      showToast('error', getErrorMessage(err) || '创建测试计划失败')
    } finally {
      setCreatingTestPlan(false)
    }
  }

  /* ── 渲染 ── */

  const dialogContent = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* 透明点击区域，用于点击弹框外部关闭 */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* 彩虹边框包裹层：成功后绿色，失败后红色 */}
      <div className={cn(
        'relative z-5 flex flex-col pointer-events-none w-full max-h-[70vh] rounded-2xl animate-scaleIn',
        showRightPanel ? 'max-w-[1080px]' : 'max-w-[640px]',
        generationStatus === 'success' ? 'rainbow-border-success'
          : generationStatus === 'error' ? 'rainbow-border-error'
          : 'rainbow-border',
      )}>
        {/* 弹窗主体 */}
        <div className="flex flex-col w-full h-full max-h-[70vh] rounded-2xl bg-white shadow-[var(--shadow-xl)] overflow-hidden pointer-events-auto">
        {/* ── 头部 ── */}
        <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--color-border)] px-6 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-[var(--color-primary)] flex-shrink-0" />
            <span className="text-[15px] font-semibold text-[var(--color-text-primary)] whitespace-nowrap flex-shrink-0">需求 AI 助手</span>
            <span className="text-[13px] text-[var(--color-text-tertiary)] truncate" title={workItem.name}>— {workItem.name}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 工具栏 ── */}
        <div className="flex-shrink-0 flex items-center gap-3 flex-wrap border-b border-[var(--color-border-light)] px-6 py-3 bg-[var(--color-bg-page)]">
          <div className="flex items-center gap-2 flex-wrap">
            <ActionButton
              label="标准化需求"
              icon={<FileText className="h-3.5 w-3.5" />}
              cost={requirementAiCost}
              loading={runningAction === 'STANDARDIZE'}
              onClick={() => runAction('STANDARDIZE')}
            />
            <ActionButton
              label="拆解子任务"
              icon={<ListChecks className="h-3.5 w-3.5" />}
              cost={requirementAiCost}
              loading={runningAction === 'BREAKDOWN'}
              onClick={() => runAction('BREAKDOWN')}
            />
            <ActionButton
              label="生成测试用例"
              icon={<FlaskConical className="h-3.5 w-3.5" />}
              cost={testCaseAiCost}
              loading={runningAction === 'TEST_CASES'}
              onClick={() => runAction('TEST_CASES')}
            />
          </div>
        </div>

        {/* ── 内容区 ── */}
        <div className={cn(
          'flex-1 overflow-hidden grid',
          showRightPanel ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1',
        )}>
              {/* 左侧：AI 结果预览 */}
              <div className={cn(
                'flex flex-col min-h-0 overflow-hidden',
                showRightPanel && 'border-r border-[var(--color-border-light)]',
              )}>
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[var(--color-border-light)]">
              <div>
                <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {result?.title || 'AI 结果预览'}
                </div>
                {!result && (
                  <div className="text-[11px] text-[var(--color-text-tertiary)]">尚未生成内容</div>
                )}
              </div>
              {result && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={postAsComment}
                    disabled={postingComment}
                    className={actionBtnClass}
                    title="发到评论"
                  >
                    {postingComment ? <LoadingSpinner className="h-3 w-3" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    <span>评论</span>
                  </button>
                  <button
                    onClick={appendToDescription}
                    disabled={appendingDesc}
                    className={actionBtnClass}
                    title="追加到描述"
                  >
                    {appendingDesc ? <LoadingSpinner className="h-3 w-3" /> : <FileDown className="h-3.5 w-3.5" />}
                    <span>追加</span>
                  </button>
                  {result.action === 'STANDARDIZE' && (
                    <button
                      onClick={replaceDescription}
                      disabled={replacingDesc}
                      className={cn(actionBtnClass, 'text-[var(--color-primary)]')}
                      title="替换描述"
                    >
                      {replacingDesc ? <LoadingSpinner className="h-3 w-3" /> : <Replace className="h-3.5 w-3.5" />}
                      <span>替换</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {runningAction ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <LoadingSpinner />
                  <p className="text-[13px] text-[var(--color-text-tertiary)]">AI 正在生成中，请稍候…</p>
                </div>
              ) : result?.markdown ? (
                <Markdown content={result.markdown} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-text-tertiary)]">
                  <Sparkles className="h-8 w-8 opacity-30" />
                  <p className="text-[13px]">点击上方的动作按钮开始 AI 生成</p>
                  <p className="text-[11px] opacity-60">每次操作将消耗相应积分</p>
                </div>
              )}
            </div>
          </div>

              {showRightPanel && (
                <div className="flex flex-col min-h-0 overflow-hidden">
                  {/* 拆解子任务面板 */}
                  {result?.action === 'BREAKDOWN' && (
              <>
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[var(--color-border-light)]">
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">拆解建议</div>
                    <div className="text-[11px] text-[var(--color-text-tertiary)]">支持编辑、删除后再创建任务</div>
                  </div>
                  {taskSuggestions.length > 0 && (
                    <Button size="sm" onClick={createSuggestedTasks} loading={creatingTasks} icon={<Plus className="h-3.5 w-3.5" />}>
                      创建任务
                    </Button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
                  {taskSuggestions.length === 0 ? (
                    <p className="text-center text-[13px] text-[var(--color-text-tertiary)] py-8">暂无拆解建议</p>
                  ) : (
                    taskSuggestions.map((item, index) => (
                      <div key={index} className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-[var(--color-primary)]">子任务 {index + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--color-text-tertiary)]">{item.category} / {item.priority}</span>
                            <button onClick={() => removeTaskSuggestion(index)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <Input
                          value={item.name}
                          onChange={(e) => updateTaskSuggestion(index, { name: e.target.value })}
                          placeholder="任务标题"
                          className="h-8 text-[13px]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={item.category}
                            onChange={(v) => updateTaskSuggestion(index, { category: v })}
                            options={taskCategoryOptions.map((o) => ({ value: o, label: o }))}
                            placeholder="类别"
                            className="[&_.h-10]:h-8"
                          />
                          <Select
                            value={item.priority}
                            onChange={(v) => updateTaskSuggestion(index, { priority: v })}
                            options={taskPriorityOptions.map((o) => ({ value: o, label: o }))}
                            placeholder="优先级"
                            className="[&_.h-10]:h-8"
                          />
                        </div>
                        {item.description && (
                          <div className="text-[12px] text-[var(--color-text-secondary)] max-h-[80px] overflow-y-auto">
                            <Markdown content={item.description} />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* 测试用例面板 */}
            {result?.action === 'TEST_CASES' && (
              <>
                <div className="flex-shrink-0 px-5 py-2.5 border-b border-[var(--color-border-light)] space-y-2">
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">测试用例建议</div>
                    <div className="text-[11px] text-[var(--color-text-tertiary)]">可导入现有测试计划，或新建计划后导入</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedPlanId}
                      onChange={setSelectedPlanId}
                      options={testPlanOptions.map((p) => ({ value: String(p.id), label: p.name }))}
                      placeholder="选择已有测试计划"
                      className="flex-1"
                    />
                    {selectedPlanId && testCaseSuggestions.length > 0 && (
                      <Button size="sm" variant="secondary" onClick={importToExistingPlan} loading={importingTestCases}>
                        导入
                      </Button>
                    )}
                    {testCaseSuggestions.length > 0 && (
                      <Button size="sm" onClick={createNewPlanWithCases} loading={creatingTestPlan} icon={<Plus className="h-3.5 w-3.5" />}>
                        新建计划
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
                  {testCaseSuggestions.length === 0 ? (
                    <p className="text-center text-[13px] text-[var(--color-text-tertiary)] py-8">暂无测试用例</p>
                  ) : (
                    testCaseSuggestions.map((item, index) => (
                      <TestCaseCard
                        key={index}
                        item={item}
                        index={index}
                        onRemove={() => removeTestCaseSuggestion(index)}
                        onUpdate={(patch) => updateTestCaseSuggestion(index, patch)}
                        onAppendStep={() => appendStep(item)}
                        onRemoveStep={(si) => removeStep(item, si)}
                        onUpdateStep={(si, patch) => updateStep(item, si, patch)}
                      />
                    ))
                  )}
                </div>
              </>
            )}
                </div>
              )}
            </div>

        {/* ── Toast ── */}
        {toast && (
          <div className={cn(
            'absolute bottom-4 left-1/2 -translate-x-1/2 z-[70] rounded-lg px-4 py-2 text-[13px] font-medium shadow-[var(--shadow-lg)] animate-fadeIn',
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200',
          )}>
            {toast.message}
          </div>
        )}
      </div>
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}

/* ── 辅助组件 ── */

const actionBtnClass =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50'

/** 带积分消耗提示的动作按钮。 */
const ActionButton = ({
  label,
  icon,
  cost,
  loading,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  cost?: number
  loading: boolean
  onClick: () => void
}) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium',
      'transition-all duration-150',
      'hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]',
      'disabled:opacity-50 disabled:cursor-wait',
      loading
        ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-light)]'
        : 'border-[var(--color-border-strong)] text-[var(--color-text-secondary)] bg-white',
    )}
  >
    {loading ? (
      <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    ) : icon}
    <span>{label}</span>
    {cost != null && (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-text-tertiary)] ml-1">
        <Coins className="h-3 w-3" />{cost}
      </span>
    )}
  </button>
)

/** 测试用例卡片。 */
const TestCaseCard = ({
  item,
  index,
  onRemove,
  onUpdate,
  onAppendStep,
  onRemoveStep,
  onUpdateStep,
}: {
  item: TestCaseSuggestionItem
  index: number
  onRemove: () => void
  onUpdate: (patch: Partial<TestCaseSuggestionItem>) => void
  onAppendStep: () => void
  onRemoveStep: (stepIndex: number) => void
  onUpdateStep: (stepIndex: number, patch: Partial<TestCaseStepSuggestionItem>) => void
}) => (
  <div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-3 space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium text-[var(--color-primary)]">用例 {index + 1}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{item.caseType} / {item.priority}</span>
        <button onClick={onRemove} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <Input
      value={item.title}
      onChange={(e) => onUpdate({ title: e.target.value })}
      placeholder="用例标题"
      className="h-8 text-[13px]"
    />
    <div className="grid grid-cols-3 gap-2">
      <Input
        value={item.moduleName}
        onChange={(e) => onUpdate({ moduleName: e.target.value })}
        placeholder="功能模块"
        className="h-8 text-[12px]"
      />
      <Select
        value={item.caseType}
        onChange={(v) => onUpdate({ caseType: v })}
        options={caseTypeOptions.map((o) => ({ value: o, label: o }))}
        placeholder="类型"
      />
      <Select
        value={item.priority}
        onChange={(v) => onUpdate({ priority: v })}
        options={casePriorityOptions.map((o) => ({ value: o, label: o }))}
        placeholder="优先级"
      />
    </div>
    <textarea
      value={item.precondition}
      onChange={(e) => onUpdate({ precondition: e.target.value })}
      placeholder="前置条件"
      rows={2}
      className="w-full rounded-md border border-[var(--color-border-light)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
    />
    {/* 步骤 */}
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">步骤</span>
        <button onClick={onAppendStep} className="text-[11px] text-[var(--color-primary)] hover:underline">
          + 新增步骤
        </button>
      </div>
      {item.steps.map((step, si) => (
        <div key={si} className="rounded-md border border-[var(--color-border-light)] bg-white p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">步骤 {step.stepNo}</span>
            <button onClick={() => onRemoveStep(si)} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <textarea
            value={step.action}
            onChange={(e) => onUpdateStep(si, { action: e.target.value })}
            placeholder="执行步骤"
            rows={2}
            className="w-full rounded border border-[var(--color-border-light)] bg-white px-2 py-1 text-[12px] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <textarea
            value={step.expectedResult}
            onChange={(e) => onUpdateStep(si, { expectedResult: e.target.value })}
            placeholder="预期结果"
            rows={2}
            className="w-full rounded border border-[var(--color-border-light)] bg-white px-2 py-1 text-[12px] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
      ))}
    </div>
  </div>
)

/* ── 工具函数 ── */

function actionLabel(action: string): string {
  switch (action) {
    case 'STANDARDIZE': return '标准化需求'
    case 'BREAKDOWN': return '拆解子任务'
    case 'TEST_CASES': return '生成测试用例'
    default: return action
  }
}
