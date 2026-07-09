/**
 * 研发模块页面。
 * 左侧仓库绑定列表 + 右侧详情（产品分支/代码结构/扫描/自动合并中心/自动合并日志/数据工作台 六 Tab 切换）。
 */
import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import {
  GitBranch,
  Code2,
  ExternalLink,
  CheckCircle,
  XCircle,
  Shield,
  History,
  Play,
  Zap,
  Plus,
  Pencil,
  Trash2,
  X,
  GitCompareArrows,
  ClipboardList,
  Tag,
  Database,
  Upload,
} from 'lucide-react'
import {
  pageGitlabBindings,
  listGitlabBranches,
  getGitlabCodeStructure,
  listRepositoryScanRulesets,
  createGitlabBindingScanTask,
  pageGitlabAutoMergeLogs,
  createGitlabTag,
  listGitlabProductBranches,
  createGitlabProductBranch,
  updateGitlabProductBranch,
  deleteGitlabProductBranch,
  listGitlabProductBranchSyncLogs,
  createGitlabProductBranchSyncMergeRequests,
} from '@/src/api/development'
import type {
  ProjectGitlabBindingItem,
  GitlabBranchItem,
  GitlabCodeStructureSnapshotItem,
  RepositoryScanRulesetItem,
  GitlabAutoMergeLogItem,
  GitlabTagCreateResultItem,
  GitlabProductBranchItem,
  GitlabProductBranchPayload,
  GitlabProductBranchSyncLogItem,
  GitlabProductBranchSyncRunResult,
} from '@/src/types/development'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { Select } from '@/src/components/common/Select'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'
import { AutoMergeCenterPanel } from './AutoMergeCenterPanel'
import { useGuide } from '@/src/components/guide'
import { useAuthStore } from '@/src/stores/auth'
import {
  getEnabledProductBranchIds,
  productBranchSyncResultLabel,
  productBranchSyncResultStyle,
} from '@/src/lib/productBranchUtils'
import { buildGitlabTagPayload, resolveDefaultTagBranch } from '@/src/lib/gitlabTagUtils'
import { DataWorkbenchPanel } from './DataWorkbenchPanel'
import { OwnerRepoPushPanel } from './OwnerRepoPushPanel'

type DetailTab = 'product-branches' | 'code-structure' | 'scan' | 'auto-merge-center' | 'auto-merge-logs' | 'data-workbench' | 'owner-push'

const detailTabs: { key: DetailTab; label: string; icon: typeof GitBranch }[] = [
  { key: 'product-branches', label: '产品分支', icon: GitBranch },
  { key: 'code-structure', label: '代码结构', icon: Code2 },
  { key: 'scan', label: '扫描', icon: Shield },
  { key: 'auto-merge-center', label: '自动合并中心', icon: Zap },
  { key: 'auto-merge-logs', label: '合并日志', icon: History },
  { key: 'owner-push', label: '业主仓库', icon: Upload },
  { key: 'data-workbench', label: '数据工作台', icon: Database },
]

export const DevelopmentPage = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [bindings, setBindings] = useState<ProjectGitlabBindingItem[]>([])
  const [bindingsLoading, setBindingsLoading] = useState(true)
  const [bindingsError, setBindingsError] = useState<string | null>(null)
  const [selectedBinding, setSelectedBinding] = useState<ProjectGitlabBindingItem | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('product-branches')
  const [tagDialogBinding, setTagDialogBinding] = useState<ProjectGitlabBindingItem | null>(null)
  const { isCompleted: guideCompleted, startGuide } = useGuide('development')
  const authUser = useAuthStore((s) => s.user)

  const fetchBindings = useCallback(async () => {
    setBindingsLoading(true)
    setBindingsError(null)
    try {
      const result = await pageGitlabBindings({ page: 1, size: 50, projectId: pid })
      setBindings(result.records)
      if (result.records.length > 0 && !selectedBinding) {
        setSelectedBinding(result.records[0])
      }
    } catch (err) {
      setBindingsError(err instanceof Error ? err.message : '加载仓库绑定失败')
    } finally {
      setBindingsLoading(false)
    }
  }, [pid, selectedBinding])

  useEffect(() => {
    fetchBindings()
  }, [fetchBindings])

  useEffect(() => {
    if (!bindingsLoading && !bindingsError && bindings.length === 0) {
      setActiveTab('data-workbench')
    }
  }, [bindings.length, bindingsError, bindingsLoading])

  useEffect(() => {
    if (!guideCompleted && authUser && !bindingsLoading && !bindingsError && selectedBinding) {
      const timer = setTimeout(() => startGuide(), 500)
      return () => clearTimeout(timer)
    }
  }, [guideCompleted, authUser, bindingsLoading, bindingsError, selectedBinding, startGuide])

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-shrink-0">
      <h2 className="mb-2 text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
        研发
      </h2>
      <p className="mb-6 text-[14px] text-[var(--color-text-tertiary)]">
        管理代码仓库绑定、产品分支、代码结构、自动合并策略和项目数据工作台
      </p>
      </div>

      <div className="flex-1 flex gap-5 overflow-hidden">
        {/* 左侧：仓库绑定列表 */}
        <div className="hidden lg:flex lg:flex-col w-[280px] shrink-0 overflow-y-auto" data-guide-id="dev-binding-list">
          <div>
            <h3 className="mb-3 text-[13px] font-semibold text-[var(--color-text-primary)]">
              仓库绑定
            </h3>
            {bindingsLoading ? (
              <LoadingSpinner text="加载仓库…" />
            ) : bindingsError ? (
              <ErrorState description={bindingsError} onRetry={fetchBindings} />
            ) : bindings.length === 0 ? (
              <EmptyState
                title="暂无仓库绑定"
                description="请先在管理控制台绑定 GitLab 仓库。"
                icon={<GitBranch className="h-6 w-6" strokeWidth={1.5} />}
              />
            ) : (
              <div className="space-y-2">
                {bindings.map((binding) => (
                  <button
                    key={binding.id}
                    onClick={() => setSelectedBinding(binding)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-all',
                      selectedBinding?.id === binding.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] shadow-sm'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-primary)]/30 hover:shadow-xs',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
                        <GitBranch className="h-4 w-4 text-purple-600" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {binding.gitlabProjectName || binding.gitlabProjectRef}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">
                          {binding.gitlabProjectPath}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              binding.enabled
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-gray-100 text-gray-600',
                            )}
                          >
                            {binding.enabled ? '已启用' : '已禁用'}
                          </span>
                          {binding.lastTestStatus === 'SUCCESS' && (
                            <CheckCircle className="h-3 w-3 text-emerald-600" />
                          )}
                          {binding.lastTestStatus === 'FAILED' && (
                            <XCircle className="h-3 w-3 text-red-600" />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：详情 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* 移动端仓库选择器 */}
          {bindings.length > 0 && (
            <div className="flex-shrink-0 mb-4 lg:hidden">
              <Select
                value={selectedBinding?.id ? String(selectedBinding.id) : ''}
                onChange={(v) => {
                  const binding = bindings.find((b) => b.id === Number(v))
                  if (binding) setSelectedBinding(binding)
                }}
                options={bindings.map((b) => ({ value: String(b.id), label: b.gitlabProjectName || b.gitlabProjectRef }))}
                placeholder="选择仓库"
              />
            </div>
          )}

          {!selectedBinding ? (
            <div className="flex h-full flex-col">
              <div className="flex-shrink-0">
                <Card>
                  <div>
                    <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
                      项目数据工作台
                    </h3>
                    <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
                      仓库绑定为空时，仍可在项目范围内提交 DataChange 工单。
                    </p>
                  </div>
                </Card>
                <div className="mt-4 flex w-fit gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('data-workbench')}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3.5 py-1.5 text-[13px] font-medium text-white shadow-[var(--shadow-sm)]"
                  >
                    <Database className="h-3.5 w-3.5" strokeWidth={1.75} />
                    数据工作台
                  </button>
                </div>
              </div>
              <div className="mt-4 min-h-0 flex-1">
                {activeTab === 'data-workbench' ? (
                  <DataWorkbenchPanel projectId={pid} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-16 text-center">
                    <div>
                      <GitBranch className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                      <p className="mt-3 text-[14px] text-[var(--color-text-tertiary)]">
                        从左侧选择一个仓库绑定查看详情
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* 仓库信息 */}
              <div className="flex-shrink-0" data-guide-id="dev-tab-nav">
                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
                        {selectedBinding.gitlabProjectName || selectedBinding.gitlabProjectRef}
                      </h3>
                      <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
                        {selectedBinding.gitlabProjectPath}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTagDialogBinding(selectedBinding)}
                        icon={<Tag className="h-4 w-4" />}
                      >
                        创建 Tag
                      </Button>
                      {selectedBinding.gitlabProjectWebUrl && (
                        <a
                          href={selectedBinding.gitlabProjectWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[13px] text-[var(--color-primary)] hover:underline"
                        >
                          在 GitLab 中查看 <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Tab 切换 */}
                <div className="mt-4 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit" data-guide-id="dev-detail-tabs">
                  {detailTabs.map((tab) => (
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
              </div>

              {/* Tab 内容 */}
              <div className="mt-4 flex-1 min-h-0">
                {activeTab === 'product-branches' && <ProductBranchesPanel binding={selectedBinding} />}
                {activeTab === 'code-structure' && <CodeStructurePanel bindingId={selectedBinding.id} />}
                {activeTab === 'scan' && <ScanPanel bindingId={selectedBinding.id} branch={selectedBinding.defaultTargetBranch || 'main'} />}
                {activeTab === 'auto-merge-center' && <AutoMergeCenterPanel />}
                {activeTab === 'auto-merge-logs' && <AutoMergeLogsPanel />}
                {activeTab === 'owner-push' && <OwnerRepoPushPanel projectId={pid} />}
                {activeTab === 'data-workbench' && <DataWorkbenchPanel projectId={pid} />}
              </div>
            </div>
          )}
        </div>
      </div>
      {tagDialogBinding && (
        <GitlabTagDialog
          binding={tagDialogBinding}
          onClose={() => setTagDialogBinding(null)}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   创建 GitLab Tag 弹窗
   ════════════════════════════════════════════ */

interface GitlabTagForm {
  tagName: string
  branchName: string
  message: string
}

const defaultGitlabTagForm: GitlabTagForm = {
  tagName: '',
  branchName: '',
  message: '',
}

const GitlabTagDialog = ({
  binding,
  onClose,
}: {
  binding: ProjectGitlabBindingItem
  onClose: () => void
}) => {
  const [branches, setBranches] = useState<GitlabBranchItem[]>([])
  const [branchLoading, setBranchLoading] = useState(true)
  const [form, setForm] = useState<GitlabTagForm>(defaultGitlabTagForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GitlabTagCreateResultItem | null>(null)

  const branchOptions = useMemo(() => {
    const options = branches.map((branch) => ({
      value: branch.name,
      label: branch.defaultBranch ? `${branch.name}（默认）` : branch.name,
      description: branch.latestCommitTitle || undefined,
    }))
    if (form.branchName && !options.some((option) => option.value === form.branchName)) {
      return [{ value: form.branchName, label: form.branchName }, ...options]
    }
    return options
  }, [branches, form.branchName])

  useEffect(() => {
    let cancelled = false
    const loadBranches = async () => {
      setBranchLoading(true)
      setForm(defaultGitlabTagForm)
      setFormError(null)
      setResult(null)
      try {
        const data = await listGitlabBranches(binding.id)
        if (cancelled) return
        setBranches(data)
        setForm((current) => ({
          ...current,
          branchName: resolveDefaultTagBranch(binding.defaultTargetBranch, data),
        }))
      } catch (err) {
        if (!cancelled) setFormError(getErrorMessage(err))
      } finally {
        if (!cancelled) setBranchLoading(false)
      }
    }
    loadBranches()
    return () => { cancelled = true }
  }, [binding.id, binding.defaultTargetBranch])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const payload = buildGitlabTagPayload(form)
    if (!payload.tagName || !payload.branchName) {
      setFormError('请填写 Tag 名称并选择来源分支。')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      setResult(await createGitlabTag(binding.id, payload))
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => !submitting && onClose()} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
        <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Tag className="h-4.5 w-4.5 text-blue-600" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
                {result ? 'Tag 创建结果' : '创建 GitLab Tag'}
              </h2>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                {binding.projectName} / {binding.gitlabProjectPath || binding.gitlabProjectRef}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-3 text-[12px] sm:grid-cols-2">
              <ProductBranchField label="Tag 名称" value={result.tagName} />
              <ProductBranchField label="来源分支" value={result.branchName} />
              <ProductBranchField label="Tag 类型" value={result.message ? '注释 Tag' : '轻量 Tag'} />
              <ProductBranchField label="目标 SHA" value={result.targetSha || '-'} />
              <ProductBranchField label="创建时间" value={formatDateTimeText(result.createdAt)} />
              <ProductBranchField label="受保护" value={result.protectedTag ? '是' : '否'} />
            </div>
            <div className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
              <p className="text-[11px] text-[var(--color-text-tertiary)]">备注说明</p>
              <p className="mt-0.5 whitespace-pre-wrap text-[12px] font-medium text-[var(--color-text-primary)]">{result.message || '-'}</p>
            </div>
            <div className="flex justify-end gap-2">
              {result.webUrl && (
                <a
                  href={result.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--color-bg-hover)]"
                >
                  打开 GitLab Tag <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Button onClick={onClose}>关闭</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 px-6 py-5">
              {formError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700">{formError}</div>
              )}
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)] px-3.5 py-2.5 text-[12px] text-[var(--color-text-secondary)]">
                默认目标分支：<strong className="text-[var(--color-text-primary)]">{binding.defaultTargetBranch || '未配置'}</strong>
              </div>
              <Input
                label="Tag 名称"
                value={form.tagName}
                onChange={(event) => setForm((current) => ({ ...current, tagName: event.target.value }))}
                placeholder="例如：v1.2.0"
              />
              <Select
                label="来源分支"
                value={form.branchName}
                onChange={(branchName) => setForm((current) => ({ ...current, branchName }))}
                options={branchOptions}
                placeholder={branchLoading ? '加载分支…' : '请选择来源分支'}
                disabled={branchLoading}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">备注说明</label>
                <textarea
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  placeholder="留空将创建轻量 Tag"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2 text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border-light)] px-6 py-4">
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>取消</Button>
              <Button type="submit" loading={submitting} disabled={branchLoading}>创建</Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ════════════════════════════════════════════
   产品分支面板
   ════════════════════════════════════════════ */

const defaultProductBranchForm: GitlabProductBranchPayload = {
  lineCode: '',
  lineName: '',
  branchName: '',
  enabled: true,
}

const Toggle = ({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-40',
      checked ? 'bg-[var(--color-primary)]' : 'bg-gray-200',
    )}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200',
        checked ? 'translate-x-4' : 'translate-x-0',
      )}
    />
  </button>
)

const formatDateTimeText = (value: string | null | undefined) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

const ProductBranchesPanel = ({ binding }: { binding: ProjectGitlabBindingItem }) => {
  const [branches, setBranches] = useState<GitlabProductBranchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<GitlabProductBranchItem | null>(null)
  const [form, setForm] = useState<GitlabProductBranchPayload>(defaultProductBranchForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncConfirm, setSyncConfirm] = useState<{ open: boolean; ids: number[]; running: boolean }>({ open: false, ids: [], running: false })
  const [syncResult, setSyncResult] = useState<GitlabProductBranchSyncRunResult | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logs, setLogs] = useState<GitlabProductBranchSyncLogItem[]>([])
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const hasProductMainBranch = Boolean(binding.productMainBranch?.trim())
  const enabledBranchIds = useMemo(() => getEnabledProductBranchIds(branches), [branches])
  const allEnabledSelected = enabledBranchIds.length > 0 && enabledBranchIds.every((id) => selectedIds.includes(id))

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const fetchBranches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listGitlabProductBranches(binding.id)
      setBranches(data)
      setSelectedIds((current) => current.filter((id) => data.some((branch) => branch.id === id && branch.enabled)))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [binding.id])

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      setLogs(await listGitlabProductBranchSyncLogs(binding.id))
    } catch (err) {
      showToast('error', getErrorMessage(err))
    } finally {
      setLogsLoading(false)
    }
  }, [binding.id, showToast])

  useEffect(() => {
    setSelectedIds([])
    setLogs([])
    fetchBranches()
  }, [fetchBranches])

  const openCreate = () => {
    setEditingBranch(null)
    setForm(defaultProductBranchForm)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (branch: GitlabProductBranchItem) => {
    setEditingBranch(branch)
    setForm({
      lineCode: branch.lineCode,
      lineName: branch.lineName,
      branchName: branch.branchName,
      enabled: branch.enabled,
    })
    setFormError(null)
    setFormOpen(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const payload = {
      lineCode: form.lineCode.trim(),
      lineName: form.lineName.trim(),
      branchName: form.branchName.trim(),
      enabled: form.enabled,
    }
    if (!payload.lineCode || !payload.lineName || !payload.branchName) {
      setFormError('请填写产品线编码、产品线名称和分线分支。')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editingBranch) {
        await updateGitlabProductBranch(binding.id, editingBranch.id, payload)
        showToast('success', '产品分支已更新')
      } else {
        await createGitlabProductBranch(binding.id, payload)
        showToast('success', '产品分支已创建')
      }
      setFormOpen(false)
      await fetchBranches()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (branch: GitlabProductBranchItem) => {
    if (!confirm(`确认删除产品分支「${branch.lineName}」吗？`)) return
    try {
      await deleteGitlabProductBranch(binding.id, branch.id)
      setSelectedIds((current) => current.filter((id) => id !== branch.id))
      showToast('success', '产品分支已删除')
      await fetchBranches()
    } catch (err) {
      showToast('error', getErrorMessage(err))
    }
  }

  const toggleBranchSelection = (branch: GitlabProductBranchItem, checked: boolean) => {
    if (!branch.enabled) return
    setSelectedIds((current) => checked
      ? [...new Set([...current, branch.id])]
      : current.filter((id) => id !== branch.id))
  }

  const toggleAllEnabled = (checked: boolean) => {
    setSelectedIds(checked ? enabledBranchIds : [])
  }

  const openSyncConfirm = (ids = selectedIds) => {
    if (!hasProductMainBranch) {
      showToast('error', '请先在管理端 GitLab 绑定中配置产品主线分支')
      return
    }
    const syncIds = ids.filter((id) => branches.some((branch) => branch.id === id && branch.enabled))
    if (!syncIds.length) {
      showToast('error', '请至少选择一个已启用的产品分支')
      return
    }
    setSyncConfirm({ open: true, ids: syncIds, running: false })
  }

  const handleSyncSubmit = async () => {
    setSyncConfirm((current) => ({ ...current, running: true }))
    try {
      const result = await createGitlabProductBranchSyncMergeRequests(binding.id, {
        productBranchIds: syncConfirm.ids,
      })
      setSyncResult(result)
      setSyncConfirm({ open: false, ids: [], running: false })
      await Promise.all([fetchBranches(), fetchLogs()])
      showToast('success', `同步完成：创建 ${result.createdCount}，无变更 ${result.noChangeCount}，已有 MR ${result.existingOpenMrCount}，失败 ${result.failedCount}`)
    } catch (err) {
      showToast('error', getErrorMessage(err))
      setSyncConfirm((current) => ({ ...current, running: false }))
    }
  }

  const openLogs = async () => {
    setLogsOpen(true)
    await fetchLogs()
  }

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {toast && (
        <div className={cn(
          'fixed right-5 top-5 z-[60] rounded-lg px-4 py-2 text-[13px] font-medium shadow-lg animate-slideDown',
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toast.message}
        </div>
      )}

      <div className="flex-shrink-0 mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-2 text-[12px] text-[var(--color-text-secondary)] sm:grid-cols-2">
            <span className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
              产品主线：<strong className="text-[var(--color-text-primary)]">{binding.productMainBranch || '未配置'}</strong>
            </span>
            <span className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
              默认目标分支：<strong className="text-[var(--color-text-primary)]">{binding.defaultTargetBranch || '-'}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openLogs} icon={<ClipboardList className="h-4 w-4" />}>
              同步日志
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasProductMainBranch || selectedIds.length === 0}
              onClick={() => openSyncConfirm()}
              icon={<GitCompareArrows className="h-4 w-4" />}
            >
              批量同步
            </Button>
            <Button size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
              新增分支
            </Button>
          </div>
        </div>
        {!hasProductMainBranch && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
            当前绑定尚未配置产品主线分支，产品分支可维护，但同步主线功能会暂时禁用。
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <LoadingSpinner text="加载产品分支…" />
        ) : error ? (
          <ErrorState description={error} onRetry={fetchBranches} />
        ) : branches.length === 0 ? (
          <div className="flex-1 min-h-[320px] flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
            <EmptyState
              title="暂无产品分支"
              description="新增产品分支后，可以按产品线同步主线变更。"
              icon={<GitBranch className="h-6 w-6" strokeWidth={1.5} />}
            />
          </div>
        ) : (
          <div className="space-y-3 pr-1">
            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-[12px] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={allEnabledSelected}
                onChange={(event) => toggleAllEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border-strong)]"
              />
              选择全部已启用分支
            </label>

            {branches.map((branch) => (
              <article
                key={branch.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-sm)]"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(branch.id)}
                        disabled={!branch.enabled}
                        onChange={(event) => toggleBranchSelection(branch, event.target.checked)}
                        className="h-4 w-4 rounded border-[var(--color-border-strong)] disabled:opacity-40"
                      />
                      <GitBranch className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                      <h4 className="text-[14px] font-semibold text-[var(--color-text-primary)]">{branch.lineName}</h4>
                      <span className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">{branch.lineCode}</span>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        branch.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                      )}>
                        {branch.enabled ? '启用' : '停用'}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2 xl:grid-cols-4">
                      <ProductBranchField label="分线分支" value={branch.branchName} />
                      <ProductBranchField label="落后提交" value={`${branch.behindCount ?? 0} 个`} />
                      <ProductBranchField label="主线差异" value={branch.hasDiffWithMainline ? '有待同步变更' : '已与主线对齐'} />
                      <ProductBranchField label="上次同步" value={formatDateTimeText(branch.lastSyncAt)} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        productBranchSyncResultStyle(branch.lastSyncStatus),
                      )}>
                        {productBranchSyncResultLabel(branch.lastSyncStatus)}
                      </span>
                      <span className="max-w-full truncate text-[var(--color-text-tertiary)]">{branch.lastSyncMessage || '暂无同步记录'}</span>
                      {branch.openSyncMergeRequestWebUrl ? (
                        <a href={branch.openSyncMergeRequestWebUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline">
                          开放 MR !{branch.openSyncMergeRequestIid} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : branch.lastSyncMrUrl ? (
                        <a href={branch.lastSyncMrUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline">
                          最近同步 MR <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 lg:flex-shrink-0">
                    <button
                      type="button"
                      title="同步主线"
                      disabled={!hasProductMainBranch || !branch.enabled}
                      onClick={() => openSyncConfirm([branch.id])}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <GitCompareArrows className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="编辑"
                      onClick={() => openEdit(branch)}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="删除"
                      onClick={() => handleDelete(branch)}
                      className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {formOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => !saving && setFormOpen(false)} />
          <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
            <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">{editingBranch ? '编辑产品分支' : '新增产品分支'}</h2>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">维护产品线编码、名称和对应的 Git 分支。</p>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {formError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-700">{formError}</div>
              )}
              <Input label="产品线编码" value={form.lineCode} onChange={(event) => setForm((current) => ({ ...current, lineCode: event.target.value }))} placeholder="例如：line-a" />
              <Input label="产品线名称" value={form.lineName} onChange={(event) => setForm((current) => ({ ...current, lineName: event.target.value }))} placeholder="例如：A 产品线" />
              <Input label="分线分支" value={form.branchName} onChange={(event) => setForm((current) => ({ ...current, branchName: event.target.value }))} placeholder="例如：release/a" />
              <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3.5 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[var(--color-text-primary)]">启用</p>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">停用后不会参与批量同步。</p>
                </div>
                <Toggle checked={form.enabled} onChange={(enabled) => setForm((current) => ({ ...current, enabled }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border-light)] px-6 py-4">
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>取消</Button>
              <Button type="submit" loading={saving}>保存</Button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {syncConfirm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => !syncConfirm.running && setSyncConfirm({ open: false, ids: [], running: false })} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <GitCompareArrows className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="text-center text-[16px] font-semibold text-[var(--color-text-primary)]">确认同步主线</h3>
            <p className="mt-2 text-center text-[13px] text-[var(--color-text-tertiary)]">
              将从产品主线「{binding.productMainBranch || '-'}」为 {syncConfirm.ids.length} 条产品分支创建同步 MR。
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => setSyncConfirm({ open: false, ids: [], running: false })} disabled={syncConfirm.running}>取消</Button>
              <Button onClick={handleSyncSubmit} loading={syncConfirm.running}>创建同步 MR</Button>
            </div>
          </div>
        </div>
      )}

      {syncResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setSyncResult(null)} />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
            <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">同步结果</h2>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">{syncResult.projectName} · 主线 {syncResult.sourceBranchName}</p>
              </div>
              <button type="button" onClick={() => setSyncResult(null)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard title="创建" value={syncResult.createdCount} tone="text-emerald-600" />
                <MetricCard title="无变更" value={syncResult.noChangeCount} tone="text-gray-600" />
                <MetricCard title="已有 MR" value={syncResult.existingOpenMrCount} tone="text-blue-600" />
                <MetricCard title="失败" value={syncResult.failedCount} tone="text-red-600" />
              </div>
              <div className="space-y-2">
                {syncResult.items.map((item) => (
                  <div key={`${item.productBranchId}-${item.targetBranchName}`} className="rounded-lg border border-[var(--color-border)] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{item.lineName}</span>
                          <span className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">{item.targetBranchName}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', productBranchSyncResultStyle(item.result))}>
                            {productBranchSyncResultLabel(item.result)}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{item.message}</p>
                      </div>
                      {item.mergeRequestWebUrl && (
                        <a href={item.mergeRequestWebUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-primary)] hover:underline">
                          打开 MR <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {logsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setLogsOpen(false)} />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
            <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">产品分支同步日志</h2>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">查看主线同步到各产品分线的历史记录。</p>
              </div>
              <button type="button" onClick={() => setLogsOpen(false)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {logsLoading ? (
                <LoadingSpinner text="加载同步日志…" />
              ) : logs.length === 0 ? (
                <EmptyState title="暂无同步日志" icon={<ClipboardList className="h-6 w-6" strokeWidth={1.5} />} />
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-[var(--color-border)] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{log.lineName}</span>
                            <span className="text-[11px] text-[var(--color-text-tertiary)]">{log.sourceBranchName} → {log.targetBranchName}</span>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', productBranchSyncResultStyle(log.result))}>
                              {productBranchSyncResultLabel(log.result)}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{log.reason || '-'}</p>
                          <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{formatDateTimeText(log.executedAt)}</p>
                        </div>
                        {log.mergeRequestWebUrl && (
                          <a href={log.mergeRequestWebUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-primary)] hover:underline">
                            打开 MR <ExternalLink className="h-3 w-3" />
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
    </div>
  )
}

const ProductBranchField = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
    <p className="text-[11px] text-[var(--color-text-tertiary)]">{label}</p>
    <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--color-text-primary)]">{value}</p>
  </div>
)

const MetricCard = ({ title, value, tone }: { title: string; value: number; tone: string }) => (
  <Card title={title}>
    <p className={cn('text-[24px] font-bold', tone)}>{value}</p>
  </Card>
)

/* ════════════════════════════════════════════
   代码结构面板
   ════════════════════════════════════════════ */

const CodeStructurePanel = ({ bindingId }: { bindingId: number }) => {
  const [snapshot, setSnapshot] = useState<GitlabCodeStructureSnapshotItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCodeStructure = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getGitlabCodeStructure(bindingId)
      setSnapshot(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载代码结构失败')
    } finally {
      setLoading(false)
    }
  }, [bindingId])

  useEffect(() => {
    fetchCodeStructure()
  }, [fetchCodeStructure])

  if (loading) return <LoadingSpinner text="加载代码结构…" />
  if (error) return <ErrorState description={error} onRetry={fetchCodeStructure} />
  if (!snapshot || !snapshot.files || snapshot.totalFileCount === 0) {
    return (
      <EmptyState
        title="暂无代码结构"
        description="代码结构快照尚未生成。"
        icon={<Code2 className="h-6 w-6" strokeWidth={1.5} />}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card title="文件数">
          <p className="text-[28px] font-bold text-[var(--color-primary)]">{snapshot.totalFileCount}</p>
        </Card>
        <Card title="符号数">
          <p className="text-[28px] font-bold text-[var(--color-text-primary)]">{snapshot.totalSymbolCount}</p>
        </Card>
        <Card title="生成时间">
          <p className="text-[14px] font-medium text-[var(--color-text-primary)]">
            {snapshot.generatedAt ? formatDate(snapshot.generatedAt) : '-'}
          </p>
        </Card>
      </div>

      {snapshot.overviewMarkdown && (
        <Card title="概览">
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed font-sans text-[var(--color-text-secondary)]">
              {snapshot.overviewMarkdown}
            </pre>
          </div>
        </Card>
      )}

      <Card title="文件列表">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border-light)]">
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">
                  文件路径
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase w-[100px]">
                  语言
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase w-[80px]">
                  符号数
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase w-[80px]">
                  行数
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-light)]">
              {snapshot.files.slice(0, 50).map((file) => (
                <tr key={file.path} className="hover:bg-[var(--color-bg-hover)]/50 transition-colors">
                  <td className="px-3 py-2.5 text-[12px] font-mono text-[var(--color-text-primary)] truncate max-w-[300px]">
                    {file.path}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[var(--color-text-secondary)]">
                    {file.language || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-right text-[var(--color-text-secondary)]">
                    {file.symbolCount}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-right text-[var(--color-text-secondary)]">
                    {file.lineCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {snapshot.files.length > 50 && (
            <p className="mt-2 text-center text-[12px] text-[var(--color-text-tertiary)]">
              显示前 50 个文件，共 {snapshot.totalFileCount} 个
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ════════════════════════════════════════════
   扫描面板
   ════════════════════════════════════════════ */

const ScanPanel = ({ bindingId, branch }: { bindingId: number; branch: string }) => {
  const [rulesets, setRulesets] = useState<RepositoryScanRulesetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [selectedRuleset, setSelectedRuleset] = useState('')

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const data = await listRepositoryScanRulesets()
        setRulesets(data)
        const defaultRs = data.find((r) => r.defaultSelected)
        if (defaultRs) setSelectedRuleset(defaultRs.code)
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    fetch()
  }, [])

  const handleScan = async () => {
    if (!selectedRuleset) return
    setScanning(true)
    setScanResult(null)
    try {
      await createGitlabBindingScanTask(bindingId, { branch, rulesetCode: selectedRuleset })
      setScanResult('扫描任务已提交，请在执行中心查看结果。')
    } catch (err) {
      setScanResult(err instanceof Error ? err.message : '扫描触发失败')
    } finally {
      setScanning(false)
    }
  }

  if (loading) return <LoadingSpinner text="加载扫描规则…" />

  return (
    <div className="animate-fadeIn">
      <Card title="质量扫描">
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">
          对仓库代码执行质量扫描，生成扫描报告。扫描结果将作为执行任务在「测试与执行」模块中展示。
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Select
              label="扫描规则集"
              value={selectedRuleset}
              onChange={(v) => setSelectedRuleset(v)}
              options={rulesets.map((rs) => ({ value: rs.code, label: rs.name, description: rs.description }))}
            />
          </div>
          <Button onClick={handleScan} loading={scanning} icon={<Play className="h-4 w-4" />}>
            触发扫描
          </Button>
        </div>

        {scanResult && (
          <div className={cn(
            'mt-4 rounded-lg px-3.5 py-2.5 text-[13px]',
            scanResult.includes('已提交')
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-[var(--color-danger-light)] border border-red-100 text-[var(--color-danger)]',
          )}>
            {scanResult}
          </div>
        )}

        {rulesets.length > 0 && (
          <div className="mt-6 border-t border-[var(--color-border-light)] pt-4">
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">可用规则集</h4>
            <div className="space-y-2">
              {rulesets.map((rs) => (
                <div key={rs.code} className="rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                    <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{rs.name}</span>
                    <span className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">{rs.engineType}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{rs.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ════════════════════════════════════════════
   自动合并日志面板（带筛选）
   ════════════════════════════════════════════ */

const mergeResultColor: Record<string, string> = {
  MERGED: 'bg-emerald-50 text-emerald-700',
  AI_REJECTED: 'bg-red-50 text-red-700',
  CREDIT_INSUFFICIENT: 'bg-orange-50 text-orange-700',
  FAILED: 'bg-red-50 text-red-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
  BRANCH_BEHIND: 'bg-amber-50 text-amber-700',
  EMPTY: 'bg-gray-100 text-gray-500',
}

const resultLabel: Record<string, string> = {
  MERGED: '合并成功',
  AI_REJECTED: 'AI 拒绝',
  CREDIT_INSUFFICIENT: '积分不足',
  FAILED: '失败',
  SKIPPED: '已跳过',
  BRANCH_BEHIND: '分支落后',
  EMPTY: '无 MR',
}

const AutoMergeLogsPanel = () => {
  const [logs, setLogs] = useState<GitlabAutoMergeLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  /* 筛选条件 */
  const [filterResult, setFilterResult] = useState('')
  const [filterTrigger, setFilterTrigger] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await pageGitlabAutoMergeLogs({
        page,
        size: 15,
        result: filterResult || undefined,
        triggerType: (filterTrigger as 'MANUAL' | 'SCHEDULED') || undefined,
      })
      setLogs(data.records)
      setTotalPages(data.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载自动合并日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, filterResult, filterTrigger])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleResetFilters = () => {
    setFilterResult('')
    setFilterTrigger('')
    setPage(1)
  }

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* 筛选栏 */}
      <div className="flex-shrink-0 mb-4 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
        <Select
          layout="inline"
          className="[&>div]:w-36 max-sm:w-full max-sm:[&>div]:flex-1"
          label="结果"
          value={filterResult}
          onChange={(v) => { setFilterResult(v); setPage(1) }}
          options={[
            { value: 'MERGED', label: '合并成功' },
            { value: 'AI_REJECTED', label: 'AI 拒绝' },
            { value: 'CREDIT_INSUFFICIENT', label: '积分不足' },
            { value: 'FAILED', label: '失败' },
            { value: 'SKIPPED', label: '已跳过' },
            { value: 'BRANCH_BEHIND', label: '分支落后' },
            { value: 'EMPTY', label: '无 MR' },
          ]}
          placeholder="全部结果"
        />
        <Select
          layout="inline"
          className="[&>div]:w-36 max-sm:w-full max-sm:[&>div]:flex-1"
          label="触发方式"
          value={filterTrigger}
          onChange={(v) => { setFilterTrigger(v); setPage(1) }}
          options={[
            { value: 'MANUAL', label: '手动' },
            { value: 'SCHEDULED', label: '定时' },
          ]}
          placeholder="全部触发"
        />
        {(filterResult || filterTrigger) && (
          <Button variant="ghost" size="sm" onClick={handleResetFilters}>
            重置
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {loading ? (
          <LoadingSpinner text="加载日志…" />
        ) : error ? (
          <ErrorState description={error} onRetry={fetchLogs} />
        ) : logs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
            <EmptyState
              title="暂无自动合并日志"
              description="自动合并运行后，日志将在此显示。"
              icon={<History className="h-6 w-6" strokeWidth={1.5} />}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-[var(--color-border-light)] bg-[var(--color-bg-page)]/80 backdrop-blur-sm">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">配置</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[80px]">触发</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[100px]">结果</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">MR</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[80px]">原因</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[130px]">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-light)]">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--color-bg-hover)]/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{log.configName}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[12px] text-[var(--color-text-secondary)]">
                          {log.triggerType === 'MANUAL' ? '手动' : '定时'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          mergeResultColor[log.result] || 'bg-gray-100 text-gray-600',
                        )}>
                          {resultLabel[log.result] || log.result}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {log.mergeRequestTitle ? (
                          log.webUrl ? (
                            <a href={log.webUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-primary)] hover:underline truncate max-w-[200px]">
                              {log.mergeRequestTitle} <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-[12px] text-[var(--color-text-secondary)] truncate max-w-[200px] block">{log.mergeRequestTitle}</span>
                          )
                        ) : (
                          <span className="text-[12px] text-[var(--color-text-tertiary)]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] text-[var(--color-text-tertiary)] truncate max-w-[100px] block" title={log.reason}>
                          {log.reason || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-[var(--color-text-tertiary)]">
                        {formatDate(log.executedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-between border-t border-[var(--color-border-light)] px-4 py-2.5">
                <span className="text-[12px] text-[var(--color-text-tertiary)]">第 {page}/{totalPages} 页</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                  <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
