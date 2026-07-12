/**
 * 开发执行创建弹窗。
 * 从开发任务/缺陷发起执行任务，复用后端 DEVELOPMENT_IMPLEMENTATION 场景。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown, ArrowUp, GitBranch, Plus, Sparkles, Trash2, X,
} from 'lucide-react'
import { createExecutionTask, getExecutionContextOptions, listExecutionOrchestrationScenarios, type ExecutionContextOptionsSummary } from '@/src/api/execution'
import { listGitlabBindingOptions } from '@/src/api/development'
import { Button } from '@/src/components/common/Button'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import {
  validateDevelopmentExecutionDraft,
  type DevelopmentExecutionRepositoryDraft,
} from '@/src/lib/developmentExecutionUtils'
import { cn, getErrorMessage } from '@/src/lib/utils'
import type { ProjectGitlabBindingItem } from '@/src/types/development'
import type { ExecutionTaskItem } from '@/src/types/execution'
import type { WorkItem } from '@/src/types/planning'

interface DevelopmentExecutionDialogProps {
  open: boolean
  workItem: WorkItem
  onClose: () => void
  onCreated: (executionTask: ExecutionTaskItem) => void
}

export const DevelopmentExecutionDialog = ({
  open,
  workItem,
  onClose,
  onCreated,
}: DevelopmentExecutionDialogProps) => {
  const [gitlabBindings, setGitlabBindings] = useState<ProjectGitlabBindingItem[]>([])
  const [orchestrationReady, setOrchestrationReady] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [repositories, setRepositories] = useState<DevelopmentExecutionRepositoryDraft[]>([])
  const [selectedBindingId, setSelectedBindingId] = useState('')
  const [inputText, setInputText] = useState('')
  const [planConfirmationRequired, setPlanConfirmationRequired] = useState(false)
  const [includeRequirementContext, setIncludeRequirementContext] = useState(true)
  const [includeTechnicalDesignContext, setIncludeTechnicalDesignContext] = useState(true)
  const [contextOptions, setContextOptions] = useState<ExecutionContextOptionsSummary | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const availableBindings = useMemo(
    () => gitlabBindings.filter((binding) => binding.projectId === workItem.projectId && binding.enabled),
    [gitlabBindings, workItem.projectId],
  )
  const selectedBindingIds = useMemo(() => new Set(repositories.map((item) => item.bindingId)), [repositories])
  const addableBindingOptions = useMemo(
    () => availableBindings
      .filter((binding) => !selectedBindingIds.has(binding.id))
      .map((binding) => ({
        value: String(binding.id),
        label: buildBindingLabel(binding),
        description: buildBindingHint(binding),
      })),
    [availableBindings, selectedBindingIds],
  )
  const resolveBinding = useCallback(
    (bindingId: number) => availableBindings.find((binding) => binding.id === bindingId),
    [availableBindings],
  )
  const resolveBindingName = useCallback(
    (bindingId: number) => buildBindingLabel(resolveBinding(bindingId)),
    [resolveBinding],
  )

  /**
   * 每次打开弹窗都重新拉取项目仓库与编排就绪状态，避免使用过期配置创建执行任务。
   */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingOptions(true)
    setSubmitting(false)
    setRepositories([])
    setSelectedBindingId('')
    setOrchestrationReady(false)
    setInputText('')
    setPlanConfirmationRequired(false)
    setIncludeRequirementContext(true)
    setIncludeTechnicalDesignContext(true)
    setContextOptions(null)
    setToast(null)
    Promise.all([
      listGitlabBindingOptions(),
      listExecutionOrchestrationScenarios(workItem.projectId),
      getExecutionContextOptions(workItem.projectId, workItem.id),
    ])
      .then(([bindings, scenarios, options]) => {
        if (cancelled) return
        setGitlabBindings(bindings)
        setOrchestrationReady(Boolean(
          scenarios.find((item) => item.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION')?.effectiveReady,
        ))
        setContextOptions(options)
        setIncludeRequirementContext(options.requirementLinked)
        setIncludeTechnicalDesignContext(options.technicalDesignAvailable)
      })
      .catch((err) => {
        if (!cancelled) showToast('error', getErrorMessage(err) || '加载执行配置失败')
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => { cancelled = true }
  }, [open, showToast, workItem.projectId])

  useEffect(() => {
    if (!open) return
    const firstAddable = addableBindingOptions[0]?.value || ''
    if (!selectedBindingId || !addableBindingOptions.some((option) => option.value === selectedBindingId)) {
      setSelectedBindingId(firstAddable)
    }
  }, [addableBindingOptions, open, selectedBindingId])

  if (!open) return null

  const addRepository = () => {
    const bindingId = Number(selectedBindingId)
    if (!bindingId || selectedBindingIds.has(bindingId)) return
    const binding = resolveBinding(bindingId)
    setRepositories((prev) => [
      ...prev,
      { bindingId, targetBranch: binding?.defaultTargetBranch || '' },
    ])
  }

  const updateRepository = (bindingId: number, patch: Partial<DevelopmentExecutionRepositoryDraft>) => {
    setRepositories((prev) => prev.map((item) => (item.bindingId === bindingId ? { ...item, ...patch } : item)))
  }

  const moveRepository = (index: number, offset: number) => {
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= repositories.length) return
    const next = [...repositories]
    const current = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = current
    setRepositories(next)
  }

  /**
   * 构建开发执行创建请求：发起人只提交仓库与约束，后端按已发布编排固化执行器。
   */
  const submit = async () => {
    const validation = validateDevelopmentExecutionDraft({
      repositories,
      resolveRepositoryName: resolveBindingName,
    })
    if (!validation.valid) {
      showToast('error', validation.message)
      return
    }
    if (!orchestrationReady) {
      showToast('error', '当前项目的开发执行编排未就绪，请联系管理员配置并发布编排')
      return
    }

    setSubmitting(true)
    try {
      const inputPayload: Record<string, unknown> = {
        repositories: repositories.map((repository) => ({
          bindingId: repository.bindingId,
          targetBranch: repository.targetBranch.trim(),
        })),
      }
      if (inputText.trim()) inputPayload.inputText = inputText.trim()
      inputPayload.includeRequirementContext = includeRequirementContext
      inputPayload.includeTechnicalDesignContext = includeTechnicalDesignContext
      const executionTask = await createExecutionTask({
        scenarioCode: 'DEVELOPMENT_IMPLEMENTATION',
        projectId: workItem.projectId,
        workItemId: workItem.id,
        triggerSource: 'PAGE',
        planConfirmationRequired,
        inputPayload,
      })
      showToast('success', '执行任务已创建')
      onCreated(executionTask)
    } catch (err) {
      showToast('error', getErrorMessage(err) || '创建执行任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  const dialogContent = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-5 flex max-h-[88vh] w-full max-w-[980px] animate-scaleIn flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-xl)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
            <span className="shrink-0 text-[15px] font-semibold text-[var(--color-text-primary)]">开发执行</span>
            <span className="truncate text-[13px] text-[var(--color-text-tertiary)]" title={workItem.name}>— {workItem.name}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingOptions ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <LoadingSpinner text="加载执行配置…" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetaTile label="工作项" value={workItem.workItemCode || `#${workItem.id}`} detail={workItem.workItemType} />
              <MetaTile label="项目" value={workItem.projectName} detail={`可用仓库 ${availableBindings.length} 个`} />
              <MetaTile label="执行场景" value="开发实现" detail="DEVELOPMENT_IMPLEMENTATION" />
            </div>

            <div className="space-y-5">
              <section className="space-y-3">
                <SectionHeader title="仓库与目标分支" description="至少选择一个已启用的 GitLab 绑定。" />
                <div className="flex min-w-0 items-end gap-2">
                  <Select
                    label="添加仓库"
                    value={selectedBindingId}
                    onChange={setSelectedBindingId}
                    options={addableBindingOptions}
                    searchable
                    placeholder={availableBindings.length ? '选择 GitLab 绑定' : '暂无可用绑定'}
                    disabled={!addableBindingOptions.length}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={addRepository}
                    disabled={!selectedBindingId}
                    className="mb-0.5 shrink-0"
                  >
                    添加
                  </Button>
                </div>
                <div className="space-y-2">
                  {repositories.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-page)] px-4 py-6 text-center text-[13px] text-[var(--color-text-tertiary)]">
                      请选择要执行的代码仓库
                    </div>
                  ) : repositories.map((repository, index) => {
                    const binding = resolveBinding(repository.bindingId)
                    return (
                      <div key={repository.bindingId} className="grid grid-cols-[minmax(0,1fr)_180px_auto] items-center gap-3 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <GitBranch className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-[var(--color-text-primary)]" title={buildBindingLabel(binding)}>
                              {buildBindingLabel(binding)}
                            </div>
                            <div className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                              {buildBindingHint(binding)}
                            </div>
                          </div>
                        </div>
                        <input
                          value={repository.targetBranch}
                          onChange={(event) => updateRepository(repository.bindingId, { targetBranch: event.target.value })}
                          placeholder="目标分支"
                          className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                        />
                        <div className="flex items-center gap-1">
                          <IconButton title="上移" disabled={index === 0} onClick={() => moveRepository(index, -1)} icon={<ArrowUp className="h-3.5 w-3.5" />} />
                          <IconButton title="下移" disabled={index === repositories.length - 1} onClick={() => moveRepository(index, 1)} icon={<ArrowDown className="h-3.5 w-3.5" />} />
                          <IconButton title="移除" onClick={() => setRepositories((prev) => prev.filter((item) => item.bindingId !== repository.bindingId))} icon={<Trash2 className="h-3.5 w-3.5" />} danger />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              {!orchestrationReady && (
                <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
                  当前项目的开发执行编排未就绪，请联系管理员配置并发布编排。
                </section>
              )}

              <section className="space-y-3">
                <SectionHeader title="执行补充说明" description="可补充本次开发关注点、验收条件或限制。" />
                <textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder="例如：优先保持接口兼容，完成后运行公众端测试和构建。"
                  rows={4}
                  className="w-full resize-y rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[13px] leading-relaxed text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
                <div className="space-y-2">
                  <label className="flex items-start gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2.5">
                    <input type="checkbox" checked={includeRequirementContext} disabled={!contextOptions?.requirementLinked} onChange={(event) => setIncludeRequirementContext(event.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span className="text-[13px] text-[var(--color-text-secondary)]">带入关联需求 <span className="block text-[11px] text-[var(--color-text-tertiary)]">{contextOptions?.requirementNotice || '将关联需求正文作为执行上下文。'}</span></span>
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2.5">
                    <input type="checkbox" checked={includeTechnicalDesignContext} disabled={!contextOptions?.technicalDesignAvailable} onChange={(event) => setIncludeTechnicalDesignContext(event.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span className="text-[13px] text-[var(--color-text-secondary)]">带入技术设计 <span className="block text-[11px] text-[var(--color-text-tertiary)]">{contextOptions?.technicalDesignNotice || '将最新成功技术设计作为执行上下文。'}</span></span>
                  </label>
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={planConfirmationRequired}
                    onChange={(event) => setPlanConfirmationRequired(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  />
                  <span className="text-[13px] text-[var(--color-text-secondary)]">
                    生成执行规划后需要人工确认再继续
                  </span>
                </label>
              </section>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-page)] px-6 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
          <Button type="button" onClick={submit} loading={submitting} disabled={loadingOptions || !orchestrationReady}>
            创建执行任务
          </Button>
        </div>

        {toast && (
          <div className={cn(
            'absolute bottom-16 left-1/2 z-[70] -translate-x-1/2 rounded-lg border px-4 py-2 text-[13px] font-medium shadow-[var(--shadow-lg)] animate-fadeIn',
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700',
          )}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}

const buildBindingLabel = (binding?: ProjectGitlabBindingItem | null) =>
  binding?.gitlabProjectPath || binding?.gitlabProjectRef || `GitLab 绑定 #${binding?.id ?? '-'}`

const buildBindingHint = (binding?: ProjectGitlabBindingItem | null) => {
  if (!binding) return '绑定信息不可用'
  const defaultBranch = binding.defaultTargetBranch || '未配置默认分支'
  return `${binding.projectName} · 默认分支：${defaultBranch}`
}

const SectionHeader = ({ title, description }: { title: string; description: string }) => (
  <div>
    <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
    <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{description}</p>
  </div>
)

const MetaTile = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <div className="min-w-0 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2">
    <div className="text-[11px] text-[var(--color-text-tertiary)]">{label}</div>
    <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]" title={value}>{value}</div>
    <div className="truncate text-[11px] text-[var(--color-text-tertiary)]" title={detail}>{detail}</div>
  </div>
)

const IconButton = ({
  title,
  icon,
  onClick,
  disabled,
  danger,
}: {
  title: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'rounded-md p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-35',
      danger ? 'hover:text-[var(--color-danger)]' : 'hover:text-[var(--color-primary)]',
    )}
  >
    {icon}
  </button>
)
