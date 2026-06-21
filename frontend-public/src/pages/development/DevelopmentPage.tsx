/**
 * 研发模块页面。
 * 左侧仓库绑定列表 + 右侧详情（分支/合并请求/代码结构/扫描/自动合并中心/自动合并日志 六 Tab 切换）。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  GitBranch,
  GitPullRequest,
  Code2,
  Search,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  History,
  Play,
  Zap,
} from 'lucide-react'
import {
  pageGitlabBindings,
  listGitlabBranches,
  previewBindingMergeRequests,
  getGitlabCodeStructure,
  listRepositoryScanRulesets,
  createGitlabBindingScanTask,
  pageGitlabAutoMergeLogs,
} from '@/src/api/development'
import type {
  ProjectGitlabBindingItem,
  GitlabBranchItem,
  GitlabMergeRequestItem,
  GitlabCodeStructureSnapshotItem,
  RepositoryScanRulesetItem,
  GitlabAutoMergeLogItem,
} from '@/src/types/development'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { Select } from '@/src/components/common/Select'
import { cn, formatDate } from '@/src/lib/utils'
import { AutoMergeCenterPanel } from './AutoMergeCenterPanel'

type DetailTab = 'branches' | 'merge-requests' | 'code-structure' | 'scan' | 'auto-merge-center' | 'auto-merge-logs'

const detailTabs: { key: DetailTab; label: string; icon: typeof GitBranch }[] = [
  { key: 'branches', label: '分支', icon: GitBranch },
  { key: 'merge-requests', label: '合并请求', icon: GitPullRequest },
  { key: 'code-structure', label: '代码结构', icon: Code2 },
  { key: 'scan', label: '扫描', icon: Shield },
  { key: 'auto-merge-center', label: '自动合并中心', icon: Zap },
  { key: 'auto-merge-logs', label: '合并日志', icon: History },
]

const statusColorMap: Record<string, string> = {
  opened: 'bg-blue-50 text-blue-700',
  merged: 'bg-purple-50 text-purple-700',
  closed: 'bg-gray-100 text-gray-600',
}

export const DevelopmentPage = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [bindings, setBindings] = useState<ProjectGitlabBindingItem[]>([])
  const [bindingsLoading, setBindingsLoading] = useState(true)
  const [bindingsError, setBindingsError] = useState<string | null>(null)
  const [selectedBinding, setSelectedBinding] = useState<ProjectGitlabBindingItem | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('branches')

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

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-shrink-0">
      <h2 className="mb-2 text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
        研发
      </h2>
      <p className="mb-6 text-[14px] text-[var(--color-text-tertiary)]">
        管理代码仓库绑定、分支、合并请求、代码结构和自动合并策略
      </p>
      </div>

      <div className="flex-1 flex gap-5 overflow-hidden">
        {/* 左侧：仓库绑定列表 */}
        <div className="hidden lg:flex lg:flex-col w-[280px] shrink-0 overflow-y-auto">
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
            <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-16 text-center">
              <div>
                <GitBranch className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                <p className="mt-3 text-[14px] text-[var(--color-text-tertiary)]">
                  从左侧选择一个仓库绑定查看详情
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* 仓库信息 */}
              <div className="flex-shrink-0">
                <Card>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
                        {selectedBinding.gitlabProjectName || selectedBinding.gitlabProjectRef}
                      </h3>
                      <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
                        {selectedBinding.gitlabProjectPath}
                      </p>
                    </div>
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
                </Card>

                {/* Tab 切换 */}
                <div className="mt-4 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit">
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
                {activeTab === 'branches' && <BranchesPanel bindingId={selectedBinding.id} />}
                {activeTab === 'merge-requests' && <MergeRequestsPanel bindingId={selectedBinding.id} />}
                {activeTab === 'code-structure' && <CodeStructurePanel bindingId={selectedBinding.id} />}
                {activeTab === 'scan' && <ScanPanel bindingId={selectedBinding.id} branch={selectedBinding.defaultTargetBranch || 'main'} />}
                {activeTab === 'auto-merge-center' && <AutoMergeCenterPanel />}
                {activeTab === 'auto-merge-logs' && <AutoMergeLogsPanel />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   分支面板
   ════════════════════════════════════════════ */

const BranchesPanel = ({ bindingId }: { bindingId: number }) => {
  const [branches, setBranches] = useState<GitlabBranchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')

  const fetchBranches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listGitlabBranches(bindingId, keyword || undefined)
      setBranches(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载分支失败')
    } finally {
      setLoading(false)
    }
  }, [bindingId, keyword])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 mb-3 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          placeholder="搜索分支…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <LoadingSpinner text="加载分支…" />
        ) : error ? (
          <ErrorState description={error} onRetry={fetchBranches} />
        ) : branches.length === 0 ? (
          <EmptyState title="暂无分支" icon={<GitBranch className="h-6 w-6" strokeWidth={1.5} />} />
        ) : (
          <div className="space-y-2 pr-1">
            {branches.map((branch) => (
              <div
                key={branch.name}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
                    <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                      {branch.name}
                    </span>
                    {branch.defaultBranch && (
                      <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        默认
                      </span>
                    )}
                    {branch.protectedBranch && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        受保护
                      </span>
                    )}
                  </div>
                  {branch.webUrl && (
                    <a
                      href={branch.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                {branch.latestCommitTitle && (
                  <p className="mt-1 truncate text-[12px] text-[var(--color-text-tertiary)]">
                    {branch.latestCommitTitle}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   合并请求面板
   ════════════════════════════════════════════ */

const MergeRequestsPanel = ({ bindingId }: { bindingId: number }) => {
  const [mergeRequests, setMergeRequests] = useState<GitlabMergeRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMergeRequests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await previewBindingMergeRequests(bindingId)
      setMergeRequests(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载合并请求失败')
    } finally {
      setLoading(false)
    }
  }, [bindingId])

  useEffect(() => {
    fetchMergeRequests()
  }, [fetchMergeRequests])

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <LoadingSpinner text="加载合并请求…" />
        ) : error ? (
          <ErrorState description={error} onRetry={fetchMergeRequests} />
        ) : mergeRequests.length === 0 ? (
          <EmptyState
            title="暂无合并请求"
            icon={<GitPullRequest className="h-6 w-6" strokeWidth={1.5} />}
          />
        ) : (
          <div className="space-y-2 pr-1">
            {mergeRequests.map((mr) => (
              <div
                key={mr.iid}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <GitPullRequest className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
                      <span className="text-[11px] font-mono text-[var(--color-text-tertiary)]">
                        !{mr.iid}
                      </span>
                      <h4 className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                        {mr.title}
                      </h4>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      <span className="truncate">{mr.sourceBranch}</span>
                      <span>→</span>
                      <span className="truncate">{mr.targetBranch}</span>
                      <span>·</span>
                      <span>{mr.authorName}</span>
                      <span>·</span>
                      <span>{formatDate(mr.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        statusColorMap[mr.state] || 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {mr.state}
                    </span>
                    <a
                      href={mr.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
                {mr.hasConflicts && (
                  <div className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
                    存在冲突
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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
      <div className="flex-shrink-0 mb-4 flex flex-wrap items-end gap-3">
        <Select
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
