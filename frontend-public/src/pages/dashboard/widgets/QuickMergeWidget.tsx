/**
 * 工作台卡片：GitLab 快速发起 MR。
 * 业务意图：让研发用户在公众端首页一键发起 Merge Request，无需进入项目研发页。
 * 依赖权限：dashboard:view + gitlab:view + gitlab:manage（由 V110 迁移补授给 PUBLIC_DEFAULT）。
 * 复用后端接口：/api/gitlab/bindings/options、/api/gitlab/bindings/{id}/branches、
 * /api/gitlab/user-oauth-binding、/api/gitlab/bindings/{id}/merge-requests。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitBranch, ExternalLink, AlertCircle, AlertTriangle, ChevronDown } from 'lucide-react'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Select } from '@/src/components/common/Select'
import { Input } from '@/src/components/common/Input'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import {
  listGitlabBindingOptions,
  listGitlabBranches,
  getCurrentUserGitlabOauthBinding,
  createGitlabMergeRequest,
} from '@/src/api/development'
import type {
  ProjectGitlabBindingItem,
  GitlabBranchItem,
  GitlabUserOauthBindingItem,
  GitlabCreateMergeRequestResultItem,
} from '@/src/types/development'
import type { GitlabAutoMergeLogSummary } from '@/src/types/dashboard'
import { cn, getErrorMessage } from '@/src/lib/utils'

const QUICK_MERGE_TITLE_LIMIT = 200

interface QuickMergeWidgetProps {
  /** 当前登录用户的 GitLab 用户名，用于在卡片上展示发起身份。 */
  gitlabUsername: string | null
  /** 当前用户的合并告警日志（自动合并失败或 AI 审核拒绝）。 */
  mergeAlerts: GitlabAutoMergeLogSummary[]
}

export const QuickMergeWidget = ({ gitlabUsername, mergeAlerts }: QuickMergeWidgetProps) => {
  const [open, setOpen] = useState(false)
  const [bindings, setBindings] = useState<ProjectGitlabBindingItem[]>([])
  const [oauth, setOauth] = useState<GitlabUserOauthBindingItem | null>(null)
  const [bindingId, setBindingId] = useState('')
  const [branches, setBranches] = useState<GitlabBranchItem[]>([])
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loadingBindings, setLoadingBindings] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GitlabCreateMergeRequestResultItem | null>(null)
  const [alertsExpanded, setAlertsExpanded] = useState(false)

  // 打开抽屉时并发加载仓库绑定选项与 GitLab OAuth 绑定状态
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      setLoadingBindings(true)
      setError(null)
      try {
        const [bindingList, oauthBinding] = await Promise.all([
          listGitlabBindingOptions(),
          getCurrentUserGitlabOauthBinding(),
        ])
        if (cancelled) return
        setBindings(bindingList)
        setOauth(oauthBinding)
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err))
      } finally {
        if (!cancelled) setLoadingBindings(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open])

  // 选定仓库绑定后加载其分支列表，并预填目标分支为绑定配置的默认目标分支
  useEffect(() => {
    if (!bindingId) {
      setBranches([])
      setSourceBranch('')
      setTargetBranch('')
      return
    }
    let cancelled = false
    const load = async () => {
      setLoadingBranches(true)
      try {
        const list = await listGitlabBranches(Number(bindingId))
        if (cancelled) return
        setBranches(list)
        const selected = bindings.find((b) => String(b.id) === bindingId)
        setTargetBranch(selected?.defaultTargetBranch || '')
        setSourceBranch('')
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err))
      } finally {
        if (!cancelled) setLoadingBranches(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [bindingId, bindings])

  const oauthConnected = oauth?.connected === true
  const canSubmit =
    oauthConnected &&
    !!bindingId &&
    !!sourceBranch &&
    !!targetBranch &&
    !!title.trim() &&
    sourceBranch !== targetBranch &&
    !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await createGitlabMergeRequest(Number(bindingId), {
        sourceBranch,
        targetBranch,
        title: title.trim(),
        description: description.trim() || undefined,
      })
      setResult(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setBindingId('')
    setSourceBranch('')
    setTargetBranch('')
    setTitle('')
    setDescription('')
    setError(null)
    setResult(null)
    setBranches([])
  }

  const handleClose = () => {
    setOpen(false)
    resetForm()
  }

  const bindingOptions = bindings.map((b) => ({
    value: String(b.id),
    label: b.gitlabProjectName || b.gitlabProjectRef,
    description: b.projectName,
  }))
  const branchOptions = branches.map((b) => ({
    value: b.name,
    label: b.name,
    description: b.defaultBranch ? '默认分支' : undefined,
  }))

  return (
    <Card
      title="GitLab 工作台"
      action={
        <Button
          variant="primary"
          size="sm"
          icon={<GitBranch className="h-4 w-4" />}
          onClick={() => setOpen(true)}
        >
          发起 MR
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-[var(--color-text-secondary)]">
          一键发起 Merge Request，快速合并代码变更。
        </p>
        {gitlabUsername ? (
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            当前 GitLab 身份：
            <span className="font-medium text-[var(--color-text-secondary)]">@{gitlabUsername}</span>
          </p>
        ) : (
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            未检测到 GitLab 身份，发起 MR 前需先在个人中心完成 GitLab 授权。
          </p>
        )}
        {mergeAlerts.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
            <button
              type="button"
              onClick={() => setAlertsExpanded((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[12px] font-medium text-red-700"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{mergeAlerts.length} 条合并告警</span>
              <ChevronDown
                className={cn(
                  'ml-auto h-3.5 w-3.5 transition-transform',
                  alertsExpanded && 'rotate-180',
                )}
              />
            </button>
            {alertsExpanded && (
              <div className="mt-2 space-y-1.5">
                {mergeAlerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="flex items-start gap-2 text-[11px] text-red-700">
                    <span className="flex-shrink-0 rounded bg-red-100 px-1 py-0.5 font-medium">
                      {alert.result}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {alert.mergeRequestTitle || `!${alert.mergeRequestIid ?? ''}`}
                    </span>
                    {alert.webUrl && (
                      <a
                        href={alert.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-red-600 hover:underline"
                      >
                        查看
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <SlideDrawer
        open={open}
        onClose={handleClose}
        title="快速发起 Merge Request"
        description="选择仓库与分支，以当前账号的 GitLab 身份发起 MR"
        maxWidth="560px"
        footer={
          result ? (
            <Button variant="primary" onClick={handleClose}>
              完成
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose} disabled={submitting}>
                取消
              </Button>
              <Button
                variant="primary"
                loading={submitting}
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                发起 MR
              </Button>
            </>
          )
        }
      >
        {loadingBindings ? (
          <LoadingSpinner text="加载仓库列表…" />
        ) : result ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <GitBranch className="h-6 w-6" />
            </div>
            <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">MR 已创建</h3>
            <p className="text-[13px] text-[var(--color-text-secondary)]">{result.title}</p>
            <p className="text-[12px] text-[var(--color-text-tertiary)]">
              {result.sourceBranch} → {result.targetBranch}
            </p>
            {result.webUrl && (
              <a
                href={result.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-primary)] hover:underline"
              >
                在 GitLab 中查看 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-6">
            {!oauthConnected && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  未完成 GitLab OAuth 授权，无法以本人身份发起 MR。
                  <Link to="/settings/profile" className="ml-1 font-medium underline">
                    去授权
                  </Link>
                </div>
              </div>
            )}
            <Select
              label="仓库绑定"
              value={bindingId}
              onChange={setBindingId}
              options={bindingOptions}
              placeholder="选择 GitLab 仓库绑定"
            />
            {bindingId &&
              (loadingBranches ? (
                <LoadingSpinner text="加载分支…" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="源分支"
                    value={sourceBranch}
                    onChange={setSourceBranch}
                    options={branchOptions}
                    placeholder="选择源分支"
                  />
                  <Select
                    label="目标分支"
                    value={targetBranch}
                    onChange={setTargetBranch}
                    options={branchOptions}
                    placeholder="选择目标分支"
                  />
                </div>
              ))}
            {sourceBranch && targetBranch && sourceBranch === targetBranch && (
              <p className="text-[12px] text-[var(--color-danger)]">源分支与目标分支不能相同</p>
            )}
            <Input
              label="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简要描述本次合并内容"
              maxLength={QUICK_MERGE_TITLE_LIMIT}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">
                描述（可选）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="补充 MR 的详细说明"
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
              />
            </div>
            {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}
          </div>
        )}
      </SlideDrawer>
    </Card>
  )
}
