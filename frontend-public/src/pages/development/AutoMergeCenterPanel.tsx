/**
 * 自动合并中心面板。
 * 展示自动合并策略列表，支持 CRUD、测试、MR 预览、立即执行和 Webhook 管理。
 * AI 审核所用 Code Review Agent 由后台自动分配，前端仅控制开关与严格度。
 * 策略执行消耗积分，前端展示单价并在执行前校验余额。
 */
import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus,
  Search,
  Play,
  Eye,
  Pencil,
  Trash2,
  Zap,
  Bell,
  X,
  GitPullRequest,
  ExternalLink,
  AlertCircle,
  Coins,
} from 'lucide-react'
import {
  pageGitlabAutoMergeConfigs,
  createGitlabAutoMergeConfig,
  updateGitlabAutoMergeConfig,
  deleteGitlabAutoMergeConfig,
  testGitlabAutoMergeConfig,
  previewAutoMergeConfigMergeRequests,
  runAutoMergeConfig,
  listGitlabBindingOptions,
} from '@/src/api/development'
import { getMyFeatureCosts, getMyCreditAccount } from '@/src/api/credits'
import type {
  GitlabAutoMergeConfigItem,
  GitlabAutoMergeConfigPayload,
  GitlabAutoMergeRunResult,
  GitlabMergeRequestItem,
  ProjectGitlabBindingItem,
} from '@/src/types/development'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'
import { WebhookDialog } from './WebhookDialog'

/** 自动合并在积分系统中对应的 featureCode。 */
const AUTO_MERGE_FEATURE_CODE = 'AUTO_MERGE'

/* ── 工具函数 ── */

const executionModeLabel = (m: string) =>
  m === 'STANDALONE' ? '独立运行' : '关联项目'

const strictnessLabel = (s: string) => {
  if (s === 'HIGH') return '高'
  if (s === 'MEDIUM') return '中'
  if (s === 'LOW') return '低'
  return s
}

const runStatusStyle = (status: string | null) => {
  if (!status) return 'bg-gray-100 text-gray-500'
  switch (status) {
    case 'SUCCESS': return 'bg-emerald-50 text-emerald-700'
    case 'PARTIAL': return 'bg-amber-50 text-amber-700'
    case 'FAILED': return 'bg-red-50 text-red-700'
    case 'RUNNING': return 'bg-blue-50 text-blue-700'
    default: return 'bg-gray-100 text-gray-500'
  }
}

const runStatusLabel = (status: string | null) => {
  if (!status) return '未执行'
  switch (status) {
    case 'SUCCESS': return '成功'
    case 'PARTIAL': return '部分成功'
    case 'FAILED': return '失败'
    case 'RUNNING': return '运行中'
    default: return status
  }
}

const cronTemplates = [
  { value: '0 */5 * * * *', label: '每5分钟：0 */5 * * * *' },
  { value: '0 */10 * * * *', label: '每10分钟：0 */10 * * * *' },
  { value: '0 */30 * * * *', label: '每30分钟：0 */30 * * * *' },
  { value: '0 0 * * * *', label: '每小时整点：0 0 * * * *' },
  { value: '0 0 2 * * *', label: '每天凌晨2点：0 0 2 * * *' },
]

/* ── 表单默认值 ── */

const defaultForm: GitlabAutoMergeConfigPayload = {
  name: '',
  executionMode: 'PROJECT_BOUND',
  description: '',
  bindingId: null,
  apiBaseUrl: 'https://gitlab.example.com',
  gitlabProjectRef: '',
  apiToken: '',
  sourceBranch: '',
  targetBranch: '',
  titleKeyword: '',
  enabled: true,
  autoMerge: true,
  squashOnMerge: false,
  removeSourceBranch: true,
  triggerPipelineAfterMerge: false,
  requirePipelineSuccess: true,
  schedulerEnabled: false,
  schedulerCron: '0 */5 * * * *',
  reviewAgentId: null,
  aiReviewEnabled: false,
  aiReviewPrompt: '',
  reviewStrictness: 'MEDIUM',
  pipelineTargets: [],
}

/* ── Toggle 开关组件 ── */

const Toggle = ({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-40',
      checked ? 'bg-[var(--color-primary)]' : 'bg-gray-200',
    )}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
        checked ? 'translate-x-4' : 'translate-x-0',
      )}
    />
  </button>
)

/* ════════════════════════════════════════════
   主面板
   ════════════════════════════════════════════ */

export const AutoMergeCenterPanel = () => {
  /* 列表状态 */
  const [configs, setConfigs] = useState<GitlabAutoMergeConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [keyword, setKeyword] = useState('')

  /* 基础选项 */
  const [bindingOptions, setBindingOptions] = useState<ProjectGitlabBindingItem[]>([])

  /* 积分信息 */
  const [featureCost, setFeatureCost] = useState<number>(0)
  const [balance, setBalance] = useState<number>(0)

  /* 表单抽屉 */
  const formRef = useRef<HTMLFormElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  /** 关闭动画期间保持 DOM 渲染 */
  const [drawerShouldRender, setDrawerShouldRender] = useState(false)
  const [drawerIsClosing, setDrawerIsClosing] = useState(false)

  useEffect(() => {
    if (drawerOpen) {
      setDrawerShouldRender(true)
      requestAnimationFrame(() => setDrawerIsClosing(false))
    } else if (drawerShouldRender) {
      setDrawerIsClosing(true)
      const timer = setTimeout(() => setDrawerShouldRender(false), 300)
      return () => clearTimeout(timer)
    }
  }, [drawerOpen])
  const [editingItem, setEditingItem] = useState<GitlabAutoMergeConfigItem | null>(null)
  const [form, setForm] = useState<GitlabAutoMergeConfigPayload>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [cronTemplate, setCronTemplate] = useState('')

  /* MR 预览弹窗 */
  const [previewMr, setPreviewMr] = useState<{ open: boolean; configName: string; mrs: GitlabMergeRequestItem[]; loading: boolean }>({
    open: false, configName: '', mrs: [], loading: false,
  })

  /* 执行结果弹窗 */
  const [runResult, setRunResult] = useState<{ open: boolean; result: GitlabAutoMergeRunResult | null }>({
    open: false, result: null,
  })

  /* 执行确认弹窗 */
  const [runConfirm, setRunConfirm] = useState<{ open: boolean; id: number; name: string; running: boolean }>({
    open: false, id: 0, name: '', running: false,
  })

  /* Webhook 弹窗 */
  const [webhookTarget, setWebhookTarget] = useState<{ configId: number; configName: string } | null>(null)

  /* Toast */
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  /* 加载选项与积分信息 */
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const bindings = await listGitlabBindingOptions()
        setBindingOptions(bindings)
      } catch { /* 选项加载失败不阻塞主流程 */ }
    }
    const loadCredits = async () => {
      try {
        const [costs, account] = await Promise.all([getMyFeatureCosts(), getMyCreditAccount()])
        setFeatureCost(costs[AUTO_MERGE_FEATURE_CODE] ?? 0)
        setBalance(account.balance)
      } catch { /* 积分加载失败不阻塞主流程 */ }
    }
    loadOptions()
    loadCredits()
  }, [])

  /* 加载列表 */
  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pageGitlabAutoMergeConfigs({ page, size: 10, keyword: keyword || undefined })
      setConfigs(data.records)
      setTotalPages(data.totalPages)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, keyword])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  /* 打开新建抽屉 */
  const openCreate = () => {
    setEditingItem(null)
    setForm({ ...defaultForm, bindingId: bindingOptions[0]?.id ?? null })
    setFormError(null)
    setCronTemplate('')
    setDrawerOpen(true)
  }

  /* 打开编辑抽屉 */
  const openEdit = (item: GitlabAutoMergeConfigItem) => {
    setEditingItem(item)
    setForm({
      name: item.name,
      executionMode: item.executionMode,
      description: item.description || '',
      bindingId: item.bindingId,
      apiBaseUrl: item.apiBaseUrl || '',
      gitlabProjectRef: item.gitlabProjectRef || '',
      apiToken: '',
      sourceBranch: item.sourceBranch || '',
      targetBranch: item.targetBranch || '',
      titleKeyword: item.titleKeyword || '',
      enabled: item.enabled,
      autoMerge: item.autoMerge,
      squashOnMerge: item.squashOnMerge,
      removeSourceBranch: item.removeSourceBranch,
      triggerPipelineAfterMerge: item.triggerPipelineAfterMerge,
      requirePipelineSuccess: item.requirePipelineSuccess,
      schedulerEnabled: item.schedulerEnabled,
      schedulerCron: item.schedulerCron || '',
      reviewAgentId: item.reviewAgentId,
      aiReviewEnabled: item.aiReviewEnabled,
      aiReviewPrompt: item.aiReviewPrompt || '',
      reviewStrictness: item.reviewStrictness,
      pipelineTargets: item.pipelineTargets.map((t) => ({ targetType: t.targetType as 'AI_CLUB' | 'JENKINS', targetId: t.targetId })),
    })
    setFormError(null)
    setCronTemplate('')
    setDrawerOpen(true)
  }

  /* 提交表单 */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      if (editingItem) {
        await updateGitlabAutoMergeConfig(editingItem.id, form)
        showToast('success', '策略已更新')
      } else {
        await createGitlabAutoMergeConfig(form)
        showToast('success', '策略已创建')
      }
      setDrawerOpen(false)
      await fetchConfigs()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  /* 删除 */
  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该自动合并策略？')) return
    try {
      await deleteGitlabAutoMergeConfig(id)
      showToast('success', '策略已删除')
      await fetchConfigs()
    } catch (err) {
      showToast('error', getErrorMessage(err))
    }
  }

  /* 测试策略 */
  const handleTest = async (id: number, name: string) => {
    try {
      await testGitlabAutoMergeConfig(id)
      showToast('success', `策略「${name}」测试完成`)
      await fetchConfigs()
    } catch (err) {
      showToast('error', getErrorMessage(err))
    }
  }

  /* 预览 MR */
  const handlePreviewMr = async (id: number, name: string) => {
    setPreviewMr({ open: true, configName: name, mrs: [], loading: true })
    try {
      const mrs = await previewAutoMergeConfigMergeRequests(id)
      setPreviewMr((prev) => ({ ...prev, mrs, loading: false }))
    } catch (err) {
      setPreviewMr({ open: false, configName: '', mrs: [], loading: false })
      showToast('error', getErrorMessage(err))
    }
  }

  /* 立即执行 → 打开确认弹窗 */
  const handleRun = (id: number, name: string) => {
    setRunConfirm({ open: true, id, name, running: false })
  }

  /* 确认后真正执行 */
  const handleRunConfirm = async () => {
    const { id, name } = runConfirm
    setRunConfirm((prev) => ({ ...prev, running: true }))
    try {
      const result = await runAutoMergeConfig(id)
      setRunResult({ open: true, result })
      setRunConfirm({ open: false, id: 0, name: '', running: false })
      /* 执行后刷新余额 */
      try {
        const account = await getMyCreditAccount()
        setBalance(account.balance)
      } catch { /* ignore */ }
      await fetchConfigs()
    } catch (err) {
      showToast('error', getErrorMessage(err))
      setRunConfirm((prev) => ({ ...prev, running: false }))
    }
  }

  /* Cron 模板变更 */
  const handleCronTemplateChange = (val: string) => {
    setCronTemplate(val)
    if (val) setForm((prev) => ({ ...prev, schedulerCron: val }))
  }

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* 工具栏 */}
      <div className="flex-shrink-0 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="搜索策略名称…"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>
        <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
          新增策略
        </Button>
      </div>

      {/* 列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <LoadingSpinner text="加载策略…" />
        ) : error ? (
          <ErrorState description={error} onRetry={fetchConfigs} />
        ) : configs.length === 0 ? (
          <EmptyState
            title="暂无自动合并策略"
            description="创建策略后，系统将按规则自动审查并合并 MR。"
            icon={<Zap className="h-6 w-6" strokeWidth={1.5} />}
          />
        ) : (
          <div className="space-y-3 pr-1">
            {configs.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-sm)]"
              >
                {/* 标题行 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" strokeWidth={1.75} />
                      <h4 className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                        {row.name}
                      </h4>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        row.executionMode === 'STANDALONE' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700',
                      )}>
                        {executionModeLabel(row.executionMode)}
                      </span>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        row.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                      )}>
                        {row.enabled ? '启用' : '停用'}
                      </span>
                    </div>
                    {row.description && (
                      <p className="mt-1 truncate text-[12px] text-[var(--color-text-tertiary)]">
                        {row.description}
                      </p>
                    )}
                  </div>
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" title="测试策略" onClick={() => handleTest(row.id, row.name)}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-blue-50 hover:text-blue-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="预览 MR" onClick={() => handlePreviewMr(row.id, row.name)}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-purple-50 hover:text-purple-600">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title={featureCost > 0 ? `立即执行（消耗 ${featureCost} 积分）` : '立即执行'} onClick={() => handleRun(row.id, row.name)}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-emerald-50 hover:text-emerald-600">
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Webhook 通知" onClick={() => setWebhookTarget({ configId: row.id, configName: row.name })}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-amber-50 hover:text-amber-600">
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="编辑" onClick={() => openEdit(row)}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="删除" onClick={() => handleDelete(row.id)}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* 详情字段 */}
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-4">
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>源分支：</span>
                    <span className="text-[var(--color-text-secondary)]">{row.sourceBranch || '不限'}</span>
                  </div>
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>目标分支：</span>
                    <span className="text-[var(--color-text-secondary)]">{row.targetBranch || '不限'}</span>
                  </div>
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>标题关键字：</span>
                    <span className="text-[var(--color-text-secondary)]">{row.titleKeyword || '不限'}</span>
                  </div>
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>调度：</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {row.schedulerEnabled ? row.schedulerCron || '已启用' : '未启用'}
                    </span>
                  </div>
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>AI 审核：</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {row.aiReviewEnabled ? (row.reviewAgentName || '已启用') : '关闭'}
                    </span>
                  </div>
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>严格度：</span>
                    <span className="text-[var(--color-text-secondary)]">{strictnessLabel(row.reviewStrictness)}</span>
                  </div>
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>最近执行：</span>
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', runStatusStyle(row.lastRunStatus))}>
                      {runStatusLabel(row.lastRunStatus)}
                    </span>
                  </div>
                  <div className="text-[var(--color-text-tertiary)]">
                    <span>下次执行：</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {row.nextExecutionTime ? formatDate(row.nextExecutionTime) : '-'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 mt-4 flex items-center justify-between">
          <span className="text-[12px] text-[var(--color-text-tertiary)]">第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 rounded-lg px-4 py-2.5 text-[13px] font-medium shadow-lg animate-scaleIn',
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toast.message}
        </div>
      )}

      {/* ── 创建/编辑抽屉 ── */}
      {drawerShouldRender && createPortal(
        <div className="fixed inset-0 z-50" onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false) }}>
          <div className={`absolute inset-y-0 right-0 flex flex-col w-full max-w-[720px] bg-white shadow-[var(--shadow-xl)] ${drawerIsClosing ? 'animate-slideRight' : 'animate-slideLeft'} overflow-hidden`}>
            {/* 抽屉头部 */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
                  {editingItem ? '编辑策略' : '新建策略'}
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
                  配置 AI 审核和自动合并行为
                </p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 抽屉内容 */}
            <form ref={formRef} onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-6 p-6">
                {formError && (
                  <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">
                    {formError}
                  </div>
                )}

                {/* ── 基础配置 ── */}
                <section>
                  <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-text-primary)]">基础配置</h3>
                  <p className="mb-4 text-[12px] text-[var(--color-text-tertiary)]">定义策略范围、执行模式和目标仓库规则。</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      label="策略名称 *"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      placeholder="例如：develop → main 自动合并"
                    />
                    <div>
                      <Select
                        label="执行模式"
                        value={form.executionMode}
                        onChange={(v) => setForm({ ...form, executionMode: v as 'PROJECT_BOUND' | 'STANDALONE' })}
                        options={[
                          { value: 'PROJECT_BOUND', label: '关联业务项目' },
                          { value: 'STANDALONE', label: '独立运行' },
                        ]}
                      />
                    </div>
                    {form.executionMode === 'PROJECT_BOUND' ? (
                      <div className="sm:col-span-2">
                        <Select
                          label="GitLab 绑定"
                          value={form.bindingId ? String(form.bindingId) : ''}
                          onChange={(v) => setForm({ ...form, bindingId: Number(v) })}
                          options={bindingOptions.map((b) => ({
                            value: String(b.id),
                            label: `${b.projectName} / ${b.gitlabProjectPath || b.gitlabProjectRef}`,
                          }))}
                          placeholder="选择绑定"
                        />
                      </div>
                    ) : (
                      <>
                        <Input
                          label="GitLab API"
                          value={form.apiBaseUrl}
                          onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                          placeholder="https://gitlab.example.com"
                        />
                        <Input
                          label="项目 ID / 路径"
                          value={form.gitlabProjectRef}
                          onChange={(e) => setForm({ ...form, gitlabProjectRef: e.target.value })}
                        />
                        <div className="sm:col-span-2">
                          <Input
                            label="API Token"
                            type="password"
                            value={form.apiToken}
                            onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
                            placeholder={editingItem ? '留空则保留原 Token' : '请输入 API Token'}
                          />
                        </div>
                      </>
                    )}
                    <Input
                      label="源分支"
                      value={form.sourceBranch}
                      onChange={(e) => setForm({ ...form, sourceBranch: e.target.value })}
                      placeholder="留空表示不限"
                    />
                    <Input
                      label="目标分支"
                      value={form.targetBranch}
                      onChange={(e) => setForm({ ...form, targetBranch: e.target.value })}
                      placeholder="留空表示不限"
                    />
                    <Input
                      label="标题关键字"
                      value={form.titleKeyword}
                      onChange={(e) => setForm({ ...form, titleKeyword: e.target.value })}
                      placeholder="留空表示不限"
                    />
                    <div className="flex items-end gap-3">
                      <label className="text-[12px] font-medium text-[var(--color-text-secondary)]">策略启用</label>
                      <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text-secondary)]">策略描述</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={3}
                        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                      />
                    </div>
                  </div>
                </section>

                {/* ── 调度配置 ── */}
                <section>
                  <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-text-primary)]">调度配置</h3>
                  <p className="mb-4 text-[12px] text-[var(--color-text-tertiary)]">配置定时执行方式和 Cron 规则。</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex items-end gap-3">
                      <label className="text-[12px] font-medium text-[var(--color-text-secondary)]">启用调度</label>
                      <Toggle checked={form.schedulerEnabled} onChange={(v) => setForm({ ...form, schedulerEnabled: v })} />
                    </div>
                    <Select
                      label="Cron 示例"
                      value={cronTemplate}
                      onChange={handleCronTemplateChange}
                      options={cronTemplates.map((t) => ({ value: t.value, label: t.label }))}
                      placeholder="选择一个常用示例"
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label="调度 Cron"
                        value={form.schedulerCron}
                        onChange={(e) => setForm({ ...form, schedulerCron: e.target.value })}
                        disabled={!form.schedulerEnabled}
                        placeholder="例如：0 */5 * * * *"
                        hint="使用 Spring 6 位 Cron，例如 0 */5 * * * * 表示每 5 分钟执行一次"
                      />
                    </div>
                  </div>
                </section>

                {/* ── AI 审核 & 合并行为 ── */}
                <section>
                  <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-text-primary)]">AI 审核 & 合并行为</h3>
                  <p className="mb-4 text-[12px] text-[var(--color-text-tertiary)]">配置 AI 审核和自动合并行为。审核所用 Agent 由系统自动分配。</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3 sm:col-span-2">
                      <label className="text-[12px] font-medium text-[var(--color-text-secondary)]">启用 AI 审核</label>
                      <Toggle checked={form.aiReviewEnabled} onChange={(v) => setForm({ ...form, aiReviewEnabled: v })} />
                      {featureCost > 0 && (
                        <span className="flex items-center gap-1 text-[12px] text-amber-600 ml-2">
                          <Coins className="h-3.5 w-3.5" />
                          每次审核 {featureCost} 积分 · 余额 {balance}
                        </span>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text-secondary)]">
                        审查严格度
                        <span className="ml-1 text-[var(--color-text-tertiary)] font-normal">
                          （高：不规范也拒绝；中：拒绝严重和中等风险；低：仅拒绝严重风险）
                        </span>
                      </label>
                      <div className="flex gap-1 rounded-lg border border-[var(--color-border)] p-1 w-fit">
                        {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            disabled={!form.aiReviewEnabled}
                            onClick={() => setForm({ ...form, reviewStrictness: level })}
                            className={cn(
                              'rounded-md px-4 py-1.5 text-[13px] font-medium transition-all disabled:opacity-40',
                              form.reviewStrictness === level
                                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                            )}
                          >
                            {strictnessLabel(level)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sm:col-span-2 border-t border-[var(--color-border-light)] pt-3">
                      <p className="mb-3 text-[12px] font-medium text-[var(--color-text-secondary)]">合并行为</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[
                          { key: 'autoMerge' as const, label: '自动合并' },
                          { key: 'requirePipelineSuccess' as const, label: '需 Pipeline 成功' },
                          { key: 'squashOnMerge' as const, label: 'Squash 合并' },
                          { key: 'removeSourceBranch' as const, label: '删除源分支' },
                          { key: 'triggerPipelineAfterMerge' as const, label: '合并后触发流水线' },
                        ].map((item) => (
                          <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form[item.key] as boolean}
                              onChange={(e) => setForm({ ...form, [item.key]: e.target.checked } as GitlabAutoMergeConfigPayload)}
                              className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
                            />
                            <span className="text-[13px] text-[var(--color-text-primary)]">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </form>

            {/* 抽屉底部 */}
            <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border-light)] px-6 py-3">
              {editingItem && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => { setDrawerOpen(false); setWebhookTarget({ configId: editingItem.id, configName: editingItem.name }) }}
                  icon={<Bell className="h-4 w-4" />}
                >
                  管理 Webhook
                </Button>
              )}
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
                取消
              </Button>
              <Button onClick={() => formRef.current?.requestSubmit()} loading={saving}>
                保存
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MR 预览弹窗 ── */}
      {previewMr.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setPreviewMr({ open: false, configName: '', mrs: [], loading: false })} />
          <div className="relative z-10 flex max-h-[80vh] w-full max-w-[640px] flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                  <GitPullRequest className="h-4.5 w-4.5 text-purple-600" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">匹配的合并请求</h2>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">{previewMr.configName}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPreviewMr({ open: false, configName: '', mrs: [], loading: false })}
                className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {previewMr.loading ? (
                <LoadingSpinner text="加载合并请求…" />
              ) : previewMr.mrs.length === 0 ? (
                <EmptyState
                  title="无匹配的合并请求"
                  description="当前没有符合策略条件的 MR。"
                  icon={<GitPullRequest className="h-6 w-6" strokeWidth={1.5} />}
                />
              ) : (
                <div className="space-y-2">
                  {previewMr.mrs.map((mr) => (
                    <div key={mr.iid} className="rounded-lg border border-[var(--color-border)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-[var(--color-text-tertiary)]">!{mr.iid}</span>
                            <span className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">{mr.title}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                            <span>{mr.sourceBranch}</span>
                            <span>→</span>
                            <span>{mr.targetBranch}</span>
                            <span>·</span>
                            <span>{mr.authorName}</span>
                          </div>
                        </div>
                        <a href={mr.webUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline flex-shrink-0">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      {mr.hasConflicts && (
                        <div className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">存在冲突</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 执行结果弹窗 ── */}
      {runResult.open && runResult.result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setRunResult({ open: false, result: null })} />
          <div className="relative z-10 flex max-h-[80vh] w-full max-w-[640px] flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                  <Play className="h-4.5 w-4.5 text-emerald-600" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">执行结果</h2>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">{runResult.result.configName}</p>
                </div>
              </div>
              <button type="button" onClick={() => setRunResult({ open: false, result: null })}
                className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {/* 统计卡片 */}
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Card title="匹配">
                  <p className="text-[24px] font-bold text-[var(--color-text-primary)]">{runResult.result.matchedCount}</p>
                </Card>
                <Card title="合并">
                  <p className="text-[24px] font-bold text-emerald-600">{runResult.result.mergedCount}</p>
                </Card>
                <Card title="跳过">
                  <p className="text-[24px] font-bold text-amber-600">{runResult.result.skippedCount}</p>
                </Card>
              </div>
              {/* 明细 */}
              {runResult.result.items.length > 0 && (
                <div className="space-y-2">
                  {runResult.result.items.map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-[var(--color-border)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-[var(--color-text-tertiary)]">!{item.iid}</span>
                            <span className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">{item.title}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[12px]">
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-medium',
                              item.action === 'MERGED' ? 'bg-emerald-50 text-emerald-700'
                                : item.action === 'SKIPPED' ? 'bg-gray-100 text-gray-600'
                                : item.action === 'AI_REJECTED' ? 'bg-red-50 text-red-700'
                                : item.action === 'CREDIT_INSUFFICIENT' ? 'bg-orange-50 text-orange-700'
                                : 'bg-amber-50 text-amber-700',
                            )}>
                              {item.action}
                            </span>
                            <span className="text-[var(--color-text-tertiary)]">{item.message}</span>
                          </div>
                        </div>
                        {item.webUrl && (
                          <a href={item.webUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline flex-shrink-0">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 执行确认弹窗 ── */}
      {runConfirm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => !runConfirm.running && setRunConfirm({ open: false, id: 0, name: '', running: false })} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <Play className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)] text-center">确认执行自动合并</h3>
            <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)] text-center">
              策略「{runConfirm.name}」将对匹配的 MR 执行 AI 审核。
            </p>
            {featureCost > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--color-text-secondary)]">单次 AI 审核费用</span>
                  <span className="font-semibold text-amber-700 flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5" />{featureCost} 积分
                  </span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--color-text-secondary)]">当前余额</span>
                  <span className="font-semibold text-[var(--color-text-primary)]">{balance} 积分</span>
                </div>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">
                  每个 MR 独立计费，指纹命中缓存的 MR 不扣费。积分不足时 MR 将被跳过。
                </p>
              </div>
            )}
            {featureCost > 0 && balance < featureCost && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-[12px] text-red-700">
                余额不足，执行将导致 MR 被跳过。请先联系管理员充值。
              </div>
            )}
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => setRunConfirm({ open: false, id: 0, name: '', running: false })} disabled={runConfirm.running}>
                取消
              </Button>
              <Button onClick={handleRunConfirm} loading={runConfirm.running}>
                确认执行
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Webhook 弹窗 ── */}
      {webhookTarget && (
        <WebhookDialog
          configId={webhookTarget.configId}
          configName={webhookTarget.configName}
          onClose={() => setWebhookTarget(null)}
        />
      )}
    </div>
  )
}
