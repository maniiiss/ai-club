/**
 * 业主代码仓库推送面板（公众端）。
 * 沿用"管理端配置、公众端操作"模式：展示当前项目的业主仓库绑定，支持发起推送和查看推送历史。
 */
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Upload, History, AlertTriangle } from 'lucide-react'
import {
  listOwnerRepoBindings,
  getOwnerRepoPushContext,
  pushToOwnerRepo,
  listOwnerRepoPushLogs,
  pageGitlabBindings,
  listGitlabBranches,
} from '@/src/api/development'
import type {
  OwnerRepoBindingItem,
  OwnerRepoPushContextItem,
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
import { useToastStore } from '@/src/stores/toast'
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

export const OwnerRepoPushPanel = ({ projectId }: OwnerRepoPushPanelProps) => {
  const addToast = useToastStore((s) => s.addToast)
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

  const fetchBindings = useCallback(async () => {
    setLoading(true)
    try {
      setBindings(await listOwnerRepoBindings(projectId))
    } catch (err) {
      addToast({ title: '加载业主仓库失败', message: getErrorMessage(err), tone: 'danger' })
    } finally {
      setLoading(false)
    }
  }, [projectId, addToast])

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
      addToast({ title: '加载源仓库失败', message: getErrorMessage(err), tone: 'danger' })
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
      addToast({ title: '加载分支失败', message: getErrorMessage(err), tone: 'danger' })
    } finally {
      setBranchesLoading(false)
    }
  }

  const handlePushSubmit = async () => {
    if (!pushBinding || !sourceBindingId || !sourceBranch || !targetBranch) {
      addToast({ title: '请填写完整的推送参数', tone: 'warning' })
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
        addToast({ title: '推送失败', message: result.summaryMessage, tone: 'danger' })
      } else {
        addToast({ title: '推送完成', message: result.summaryMessage, tone: 'success' })
      }
      await fetchBindings()
    } catch (err) {
      addToast({ title: '推送失败', message: getErrorMessage(err), tone: 'danger' })
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
      addToast({ title: '加载推送历史失败', message: getErrorMessage(err), tone: 'danger' })
    } finally {
      setLogsLoading(false)
    }
  }

  if (loading) {
    return <LoadingSpinner text="加载业主仓库..." />
  }

  if (bindings.length === 0) {
    return <EmptyState title="暂无业主仓库绑定" description="请先在管理控制台配置业主仓库绑定" />
  }

  return (
    <div className="space-y-3">
      {bindings.map((binding) => (
        <div key={binding.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--color-text-primary)]">{binding.name}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-xs', ownerRepoPushModeStyle(binding.defaultPushMode))}>
                  {ownerRepoPushModeLabel(binding.defaultPushMode)}
                </span>
                {binding.lastPushStatus && (
                  <span className={cn('rounded px-1.5 py-0.5 text-xs', ownerRepoPushStatusStyle(binding.lastPushStatus))}>
                    {ownerRepoPushStatus(binding.lastPushStatus)}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {binding.gitlabProjectPath || binding.gitlabProjectRef}
                {binding.gitlabProjectWebUrl && (
                  <a href={binding.gitlabProjectWebUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-[var(--color-primary)]">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                默认分支：{binding.defaultTargetBranch || '-'} · 最近推送：{binding.lastPushedAt ? formatDate(binding.lastPushedAt) : '无'}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
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
        title="推送到业主仓库"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPushOpen(false)}>取消</Button>
            <Button variant="primary" loading={pushing} onClick={handlePushSubmit}>推送</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">业主仓库</label>
            <div className="text-sm text-[var(--color-text-secondary)]">{pushBinding?.name} · {pushBinding?.gitlabProjectPath || pushBinding?.gitlabProjectRef}</div>
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
            <Input value={targetBranch} onChange={(e) => setTargetBranch(e.target.value)} placeholder="业主仓库目标分支" />
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
              <span>直接推送将强制覆盖业主仓库目标分支的历史，不可恢复，请谨慎操作！</span>
            </div>
          )}
        </div>
      </SlideDrawer>

      {/* 危险操作确认 */}
      <ConfirmDialog
        open={dangerConfirmOpen}
        title="危险操作确认"
        description={`直接推送将强制覆盖业主仓库 ${targetBranch} 分支的历史，不可恢复，是否继续？`}
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
                  {log.sourceBranch} → {log.targetBranch}
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
