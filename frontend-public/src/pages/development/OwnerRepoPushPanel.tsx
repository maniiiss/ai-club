/**
 * 仓库镜像推送面板（公众端）。
 * 沿用"管理端配置、公众端操作"模式：展示当前项目的仓库镜像绑定，支持发起推送和查看推送历史。
 */
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Upload, History, AlertTriangle } from 'lucide-react'
import {
  listOwnerRepoBindings,
  pushToOwnerRepo,
  listOwnerRepoPushLogs,
  pageGitlabBindings,
  listGitlabBranches,
} from '@/src/api/development'
import type {
  OwnerRepoBindingItem,
  OwnerRepoPushResultItem,
  OwnerRepoPushLogItem,
  ProjectGitlabBindingItem,
  GitlabBranchItem,
} from '@/src/types/development'
import type { PageResponse } from '@/src/types/api'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { EmptyState } from '@/src/components/common/EmptyState'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'
import {
  ownerRepoPushModeLabel,
  ownerRepoPushModeStyle,
  ownerRepoPushStatus,
  ownerRepoPushStatusStyle,
  isDangerousPushMode,
} from '@/src/lib/ownerRepoPushUtils'

interface OwnerRepoPushPanelProps {
  projectId: number
}

type PushMode = 'DIRECT' | 'NEW_BRANCH' | 'MERGE_REQUEST'
type ToastTone = 'success' | 'danger' | 'warning'

export const OwnerRepoPushPanel = ({ projectId }: OwnerRepoPushPanelProps) => {
  // 公众端当前没有全局 Toast Provider，本面板沿用开发中心其他面板的局部提示模式。
  const [toast, setToast] = useState<{ tone: ToastTone; title: string; message?: string | null } | null>(null)
  const [bindings, setBindings] = useState<OwnerRepoBindingItem[]>([])
  const [loading, setLoading] = useState(true)

  // 推送表单状态
  const [pushBinding, setPushBinding] = useState<OwnerRepoBindingItem | null>(null)
  const [pushOpen, setPushOpen] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [sourceBindings, setSourceBindings] = useState<ProjectGitlabBindingItem[]>([])
  const [branches, setBranches] = useState<GitlabBranchItem[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [sourceBindingId, setSourceBindingId] = useState('')
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [pushMode, setPushMode] = useState<PushMode>('NEW_BRANCH')

  // 推送结果
  const [pushResult, setPushResult] = useState<OwnerRepoPushResultItem | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  // 危险确认
  const [dangerConfirmOpen, setDangerConfirmOpen] = useState(false)

  // 推送历史
  const [logsBinding, setLogsBinding] = useState<OwnerRepoBindingItem | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<OwnerRepoPushLogItem[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotal, setLogsTotal] = useState(0)
  const logsTotalPages = Math.max(1, Math.ceil(logsTotal / 10))

  const showToast = useCallback((tone: ToastTone, title: string, message?: string | null) => {
    setToast({ tone, title, message })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const fetchBindings = useCallback(async () => {
    setLoading(true)
    try {
      setBindings(await listOwnerRepoBindings(projectId))
    } catch (err) {
      showToast('danger', '加载仓库镜像失败', getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [projectId, showToast])

  useEffect(() => {
    fetchBindings()
  }, [fetchBindings])

  const openPushDrawer = async (binding: OwnerRepoBindingItem) => {
    setPushBinding(binding)
    setSourceBindingId('')
    setSourceBranch('')
    setTargetBranch(binding.defaultTargetBranch || '')
    setPushMode((binding.defaultPushMode as PushMode) || 'NEW_BRANCH')
    setBranches([])
    setPushOpen(true)
    // 加载当前项目的源 GitLab 绑定
    try {
      const result = await pageGitlabBindings({ page: 1, size: 50, projectId })
      setSourceBindings(result.records)
    } catch (err) {
      showToast('danger', '加载源仓库失败', getErrorMessage(err))
    }
  }

  const handleSourceBindingChange = async (value: string) => {
    setSourceBindingId(value)
    setSourceBranch('')
    setBranches([])
    if (!value) return
    setBranchesLoading(true)
    try {
      setBranches(await listGitlabBranches(Number(value)))
    } catch (err) {
      showToast('danger', '加载分支失败', getErrorMessage(err))
    } finally {
      setBranchesLoading(false)
    }
  }

  const handlePushSubmit = async () => {
    if (!pushBinding || !sourceBindingId || !sourceBranch || !targetBranch) {
      showToast('warning', '请填写完整的推送参数')
      return
    }
    if (isDangerousPushMode(pushMode)) {
      setDangerConfirmOpen(true)
      return
    }
    executePush()
  }

  const executePush = async () => {
    if (!pushBinding) return
    setPushing(true)
    try {
      const result = await pushToOwnerRepo(pushBinding.id, {
        sourceBindingId: Number(sourceBindingId),
        sourceBranch,
        targetBranch,
        pushMode,
      })
      setPushResult(result)
      setPushOpen(false)
      setResultOpen(true)
      if (result.executionStatus === 'FAILED') {
        showToast('danger', '推送失败', result.summaryMessage)
      } else {
        showToast('success', '推送完成', result.summaryMessage)
      }
      await fetchBindings()
    } catch (err) {
      showToast('danger', '推送失败', getErrorMessage(err))
    } finally {
      setPushing(false)
      setDangerConfirmOpen(false)
    }
  }

  const openLogsDrawer = async (binding: OwnerRepoBindingItem) => {
    setLogsBinding(binding)
    setLogsPage(1)
    setLogsOpen(true)
    await fetchLogs(binding.id, 1)
  }

  const fetchLogs = async (bindingId: number, page: number) => {
    setLogsLoading(true)
    try {
      const result: PageResponse<OwnerRepoPushLogItem> = await listOwnerRepoPushLogs(bindingId, page, 10)
      setLogs(result.records)
      setLogsTotal(result.total)
    } catch (err) {
      showToast('danger', '加载推送历史失败', getErrorMessage(err))
    } finally {
      setLogsLoading(false)
    }
  }

  if (loading) {
    return <LoadingSpinner text="加载仓库镜像..." />
  }

  if (bindings.length === 0) {
    return <EmptyState title="暂无仓库镜像绑定" description="请先在管理控制台配置仓库镜像绑定" />
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      {toast && (
        <div className={cn(
          'fixed right-5 top-5 z-[60] rounded-lg px-4 py-2 text-[13px] font-medium shadow-lg animate-slideDown',
          toast.tone === 'success' && 'bg-emerald-600 text-white',
          toast.tone === 'danger' && 'bg-red-600 text-white',
          toast.tone === 'warning' && 'bg-amber-500 text-white',
        )}>
          <div>{toast.title}</div>
          {toast.message && <div className="mt-0.5 text-[12px] font-normal opacity-90">{toast.message}</div>}
        </div>
      )}

      {bindings.map((binding) => (
        <div key={binding.id} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-xs)]">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words text-[14px] font-semibold text-[var(--color-text-primary)]">{binding.name}</span>
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs', ownerRepoPushModeStyle(binding.defaultPushMode))}>
                  {ownerRepoPushModeLabel(binding.defaultPushMode)}
                </span>
                {binding.lastPushStatus && (
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs', ownerRepoPushStatusStyle(binding.lastPushStatus))}>
                    {ownerRepoPushStatus(binding.lastPushStatus)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-start gap-1 text-sm text-[var(--color-text-secondary)]">
                <span className="min-w-0 break-all">{binding.gitlabProjectPath || binding.gitlabProjectRef}</span>
                {binding.gitlabProjectWebUrl && (
                  <a href={binding.gitlabProjectWebUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex shrink-0 items-center text-[var(--color-primary)]">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
                <span>默认分支：{binding.defaultTargetBranch || '-'}</span>
                <span>最近推送：{binding.lastPushedAt ? formatDate(binding.lastPushedAt) : '无'}</span>
              </div>
            </div>
            <div className="flex w-full shrink-0 gap-2 sm:w-auto">
              <Button size="sm" variant="primary" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => openPushDrawer(binding)}>
                推送
              </Button>
              <Button size="sm" variant="secondary" icon={<History className="h-3.5 w-3.5" />} onClick={() => openLogsDrawer(binding)}>
                历史
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* 推送表单抽屉 */}
      <SlideDrawer
        open={pushOpen}
        onClose={() => setPushOpen(false)}
        title="推送到仓库镜像"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPushOpen(false)}>取消</Button>
            <Button variant="primary" loading={pushing} onClick={handlePushSubmit}>推送</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">仓库镜像</label>
            <div className="break-all text-sm text-[var(--color-text-secondary)]">{pushBinding?.name} · {pushBinding?.gitlabProjectPath || pushBinding?.gitlabProjectRef}</div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">源 GitLab 绑定</label>
            <Select
              value={sourceBindingId}
              onChange={handleSourceBindingChange}
              options={sourceBindings.map((b) => ({ value: String(b.id), label: `${b.projectName} / ${b.gitlabProjectPath || b.gitlabProjectRef}` }))}
              placeholder="选择源仓库"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">源分支</label>
            {branchesLoading ? (
              <LoadingSpinner text="加载分支..." />
            ) : (
              <Select
                value={sourceBranch}
                onChange={setSourceBranch}
                options={branches.map((b) => ({ value: b.name, label: b.name }))}
                placeholder="选择源分支"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">目标分支</label>
            <Input value={targetBranch} onChange={(e) => setTargetBranch(e.target.value)} placeholder="仓库镜像目标分支" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">推送方式</label>
            <Select
              value={pushMode}
              onChange={(v) => setPushMode(v as PushMode)}
              options={[
                { value: 'NEW_BRANCH', label: '推到新分支' },
                { value: 'MERGE_REQUEST', label: '创建 MR' },
                { value: 'DIRECT', label: '直接推送（覆盖）' },
              ]}
            />
          </div>
          {isDangerousPushMode(pushMode) && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>直接推送将强制覆盖仓库镜像目标分支的历史，不可恢复，请谨慎操作！</span>
            </div>
          )}
        </div>
      </SlideDrawer>

      {/* 危险操作确认 */}
      <ConfirmDialog
        open={dangerConfirmOpen}
        title="危险操作确认"
        description={`直接推送将强制覆盖仓库镜像 ${targetBranch} 分支的历史，不可恢复，是否继续？`}
        variant="danger"
        confirmText="确认推送"
        loading={pushing}
        onCancel={() => setDangerConfirmOpen(false)}
        onConfirm={executePush}
      />

      {/* 推送结果 */}
      <SlideDrawer
        open={resultOpen}
        onClose={() => setResultOpen(false)}
        title="推送结果"
      >
        {pushResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-text-secondary)]">执行状态</span>
              <span className={cn('rounded px-2 py-0.5 text-xs', ownerRepoPushStatusStyle(pushResult.executionStatus))}>
                {ownerRepoPushStatus(pushResult.executionStatus)}
              </span>
            </div>
            <div className="text-sm text-[var(--color-text-primary)]">{pushResult.summaryMessage}</div>
            <div className="space-y-1 text-xs text-[var(--color-text-tertiary)]">
              <div>源 commit：{pushResult.sourceCommitSha || '-'}</div>
              <div>目标 commit：{pushResult.targetCommitSha || '-'}</div>
              <div>推送分支：{pushResult.pushedBranch || '-'}</div>
              {pushResult.mergeRequestWebUrl && (
                <div>
                  Merge Request：
                  <a href={pushResult.mergeRequestWebUrl} target="_blank" rel="noreferrer" className="ml-1 text-[var(--color-primary)]">
                    !{pushResult.mergeRequestIid}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </SlideDrawer>

      {/* 推送历史 */}
      <SlideDrawer
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title={`推送历史 - ${logsBinding?.name || ''}`}
      >
        {logsLoading ? (
          <LoadingSpinner text="加载推送历史..." />
        ) : logs.length === 0 ? (
          <EmptyState title="暂无推送历史" />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between">
                  <span className={cn('rounded px-1.5 py-0.5 text-xs', ownerRepoPushStatusStyle(log.executionStatus))}>
                    {ownerRepoPushStatus(log.executionStatus)}
                  </span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">{log.executedAt ? formatDate(log.executedAt) : '-'}</span>
                </div>
                <div className="mt-2 text-sm text-[var(--color-text-primary)]">
                  <span className="break-all">{log.sourceBranch} → {log.targetBranch}</span>
                  <span className={cn('ml-2 rounded px-1.5 py-0.5 text-xs', ownerRepoPushModeStyle(log.pushMode))}>
                    {ownerRepoPushModeLabel(log.pushMode)}
                  </span>
                </div>
                {log.summaryMessage && <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{log.summaryMessage}</div>}
                {log.mergeRequestWebUrl && (
                  <div className="mt-1">
                    <a href={log.mergeRequestWebUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)]">
                      <ExternalLink className="h-3 w-3" /> !{log.mergeRequestIid}
                    </a>
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="ghost" disabled={logsPage <= 1} onClick={() => { const p = logsPage - 1; setLogsPage(p); fetchLogs(logsBinding!.id, p) }}>上一页</Button>
              <span className="text-sm text-[var(--color-text-secondary)]">{logsPage} / {logsTotalPages}</span>
              <Button size="sm" variant="ghost" disabled={logsPage >= logsTotalPages} onClick={() => { const p = logsPage + 1; setLogsPage(p); fetchLogs(logsBinding!.id, p) }}>下一页</Button>
            </div>
          </div>
        )}
      </SlideDrawer>
    </div>
  )
}
