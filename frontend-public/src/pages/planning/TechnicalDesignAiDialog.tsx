/** 技术设计 AI 创建弹窗：发起人确认多仓分支，执行器由管理员发布的编排统一确定。 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Coins, GitBranch, Plus, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { getMyFeatureCosts } from '@/src/api/credits'
import { listGitlabBindingOptions } from '@/src/api/development'
import { createPublicTechnicalDesignExecution, listExecutionOrchestrationScenarios } from '@/src/api/execution'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { Select } from '@/src/components/common/Select'
import {
  buildTechnicalDesignExecutionPayload,
  validateTechnicalDesignDraft,
  type TechnicalDesignRepositoryDraft,
} from '@/src/lib/technicalDesignAiUtils'
import { cn, getErrorMessage } from '@/src/lib/utils'
import type { ProjectGitlabBindingItem } from '@/src/types/development'
import type { ExecutionTaskItem } from '@/src/types/execution'
import type { WorkItem } from '@/src/types/planning'

interface Props {
  open: boolean
  workItem: WorkItem
  onClose: () => void
  onCreated: (task: ExecutionTaskItem) => void
}

export const TechnicalDesignAiDialog = ({ open, workItem, onClose, onCreated }: Props) => {
  const [bindings, setBindings] = useState<ProjectGitlabBindingItem[]>([])
  const [orchestrationReady, setOrchestrationReady] = useState(false)
  const [repositories, setRepositories] = useState<TechnicalDesignRepositoryDraft[]>([])
  const [selectedBindingId, setSelectedBindingId] = useState('')
  const [inputText, setInputText] = useState('')
  const [cost, setCost] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const hasRequirement = Boolean(workItem.requirementTaskId)

  const availableBindings = useMemo(
    () => bindings.filter((binding) => binding.projectId === workItem.projectId && binding.enabled),
    [bindings, workItem.projectId],
  )
  const selectedIds = useMemo(() => new Set(repositories.map((item) => item.bindingId)), [repositories])
  const addableBindings = useMemo(() => availableBindings.filter((item) => !selectedIds.has(item.id)), [availableBindings, selectedIds])
  const resolveBinding = useCallback((id: number) => availableBindings.find((item) => item.id === id), [availableBindings])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    setOrchestrationReady(false)
    setRepositories([])
    setInputText('')
    Promise.all([
      listGitlabBindingOptions(),
      getMyFeatureCosts(),
      listExecutionOrchestrationScenarios(workItem.projectId),
    ])
      .then(([bindingOptions, costs, scenarios]) => {
        if (cancelled) return
        setBindings(bindingOptions)
        setCost(costs.TECHNICAL_DESIGN_AI)
        setOrchestrationReady(Boolean(
          scenarios.find((item) => item.scenarioCode === 'TECHNICAL_DESIGN_AUTHORING')?.effectiveReady,
        ))
      })
      .catch((reason) => { if (!cancelled) setError(getErrorMessage(reason) || '加载技术设计配置失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, workItem.projectId])

  useEffect(() => {
    setSelectedBindingId(addableBindings[0] ? String(addableBindings[0].id) : '')
  }, [addableBindings])

  if (!open) return null

  const addRepository = () => {
    const id = Number(selectedBindingId)
    const binding = resolveBinding(id)
    if (!binding || selectedIds.has(id)) return
    setRepositories((current) => [...current, { bindingId: id, targetBranch: binding.defaultTargetBranch || '' }])
  }

  const submit = async () => {
    const validation = validateTechnicalDesignDraft({
      repositories,
      resolveRepositoryName: (id) => bindingLabel(resolveBinding(id)),
    })
    if (!validation.valid) return setError(validation.message)
    if (!orchestrationReady) return setError('当前项目的技术设计编排未就绪，请联系管理员配置并发布编排')
    if (!hasRequirement) return setError('技术设计工作项必须先关联需求工作项')
    setSubmitting(true)
    setError('')
    try {
      const task = await createPublicTechnicalDesignExecution(
        workItem.id,
        buildTechnicalDesignExecutionPayload({ projectId: workItem.projectId, repositories, inputText }),
      )
      onCreated(task)
    } catch (reason) {
      setError(getErrorMessage(reason) || '创建技术设计执行失败')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="关闭弹窗" className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-[min(720px,90vh)] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[var(--shadow-xl)]">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><Sparkles className="h-4.5 w-4.5" /></span>
            <div className="min-w-0"><h2 className="text-[15px] font-semibold">技术设计 AI</h2><p className="truncate text-[12px] text-[var(--color-text-tertiary)]">{workItem.workItemCode} · {workItem.name}</p></div>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="relative min-h-0 flex-1">
          {loading ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-white">
              <LoadingSpinner text="加载编排与仓库…" />
            </div>
          ) : null}
          <div className={cn(
            'h-full space-y-6 overflow-y-auto px-6 py-5 transition-opacity duration-200',
            loading ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}>
            {!hasRequirement && <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">技术设计工作项必须先关联需求工作项。</section>}
            <div className="grid gap-3 md:grid-cols-3">
              <InfoTile title="三步只读流程" text="代码理解 → 设计生成 → 设计自检" icon={<ShieldCheck className="h-4 w-4" />} />
              <InfoTile title="GitNexus 优先" text="索引不可用时明确降级到源码搜索" icon={<GitBranch className="h-4 w-4" />} />
              <InfoTile title="本次费用" text={cost == null ? '以提交时配置为准' : `${cost} 积分`} icon={<Coins className="h-4 w-4" />} />
            </div>

            <section className="space-y-3">
              <SectionTitle title="仓库与目标分支" hint="支持多仓库；默认分支可按本次设计范围调整。" />
              <div className="flex items-end gap-2">
                <Select className="min-w-0 flex-1" label="添加仓库" searchable value={selectedBindingId} onChange={setSelectedBindingId} options={addableBindings.map((binding) => ({ value: String(binding.id), label: bindingLabel(binding), description: `默认分支：${binding.defaultTargetBranch || '未配置'}` }))} placeholder="选择项目仓库" disabled={!addableBindings.length} />
                <Button variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={addRepository} disabled={!selectedBindingId}>添加</Button>
              </div>
              <div className="space-y-2">
                {repositories.length === 0 ? <EmptyBox text="至少添加一个已启用仓库" /> : repositories.map((repository) => (
                  <div key={repository.bindingId} className="grid gap-3 rounded-xl border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
                    <div className="min-w-0"><p className="truncate text-[13px] font-medium">{bindingLabel(resolveBinding(repository.bindingId))}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">本次执行仅进行只读分析</p></div>
                    <input value={repository.targetBranch} onChange={(event) => setRepositories((current) => current.map((item) => item.bindingId === repository.bindingId ? { ...item, targetBranch: event.target.value } : item))} placeholder="目标分支" className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] outline-none focus:border-[var(--color-primary)]" />
                    <button type="button" title="移除仓库" onClick={() => setRepositories((current) => current.filter((item) => item.bindingId !== repository.bindingId))} className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </section>

            {!orchestrationReady ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
                当前项目的技术设计编排未就绪，请联系管理员配置并发布编排。
              </section>
            ) : null}

            <section className="space-y-3"><SectionTitle title="补充约束" hint="可补充兼容性、边界、交付格式等要求。" /><textarea rows={4} value={inputText} onChange={(event) => setInputText(event.target.value)} className="w-full resize-y rounded-xl border border-[var(--color-border-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-primary)]" placeholder="例如：保持现有 API 兼容，明确数据库迁移与回滚方案。" /></section>
            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p> : null}
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-page)] px-6 py-3"><p className="text-[11px] text-[var(--color-text-tertiary)]">Runtime 命令层采用只读权限，不修改仓库代码。</p><div className="flex gap-2"><Button variant="secondary" onClick={onClose}>取消</Button><Button onClick={submit} loading={submitting} disabled={loading || !orchestrationReady || !hasRequirement}>创建技术设计</Button></div></footer>
      </div>
    </div>, document.body,
  )
}

const bindingLabel = (binding?: ProjectGitlabBindingItem | null) => binding?.gitlabProjectPath || binding?.gitlabProjectRef || `GitLab 绑定 #${binding?.id ?? '-'}`
const SectionTitle = ({ title, hint }: { title: string; hint: string }) => <div><h3 className="text-[13px] font-semibold">{title}</h3><p className="text-[12px] text-[var(--color-text-tertiary)]">{hint}</p></div>
const EmptyBox = ({ text }: { text: string }) => <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] py-6 text-center text-[12px] text-[var(--color-text-tertiary)]">{text}</div>
const InfoTile = ({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) => <div className={cn('rounded-xl border border-sky-100 bg-sky-50/60 p-3')}><div className="mb-1 flex items-center gap-2 text-sky-700">{icon}<span className="text-[12px] font-semibold">{title}</span></div><p className="text-[11px] leading-4 text-slate-600">{text}</p></div>
