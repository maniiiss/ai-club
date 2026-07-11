/**
 * Cron 定时任务管理面板。
 * 在流水线详情抽屉内展示 Cron 任务列表，支持创建、编辑、删除。
 */
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { EmptyState } from '@/src/components/common/EmptyState'
import {
  listAiClubPipelineCronJobs,
  createAiClubPipelineCronJob,
  updateAiClubPipelineCronJob,
  deleteAiClubPipelineCronJob,
} from '@/src/api/release'
import { getErrorMessage, cn, formatDateTime } from '@/src/lib/utils'
import type { AiClubPipelineCronItem, AiClubPipelineCronPayload } from '@/src/types/release'
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react'

interface CronJobPanelProps {
  pipelineId: number
}

export const CronJobPanel = ({ pipelineId }: CronJobPanelProps) => {
  const [crons, setCrons] = useState<AiClubPipelineCronItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** 新建/编辑表单状态。 */
  const [editing, setEditing] = useState<AiClubPipelineCronItem | null | 'new'>(null)
  const [formName, setFormName] = useState('')
  const [formBranch, setFormBranch] = useState('')
  const [formCron, setFormCron] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  /** 删除确认状态。 */
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchCrons = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCrons(await listAiClubPipelineCronJobs(pipelineId))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [pipelineId])

  useEffect(() => {
    fetchCrons()
  }, [fetchCrons])

  /** 打开新建表单。 */
  const handleOpenNew = () => {
    setEditing('new')
    setFormName('')
    setFormBranch('')
    setFormCron('')
    setFormEnabled(true)
    setFormError(null)
  }

  /** 打开编辑表单。 */
  const handleOpenEdit = (cron: AiClubPipelineCronItem) => {
    setEditing(cron)
    setFormName(cron.name)
    setFormBranch(cron.branch || '')
    setFormCron(cron.cronExpression)
    setFormEnabled(cron.enabled)
    setFormError(null)
  }

  /** 保存（创建或更新）。 */
  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('Cron 名称不能为空')
      return
    }
    if (!formCron.trim()) {
      setFormError('Cron 表达式不能为空')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload: AiClubPipelineCronPayload = {
        name: formName.trim(),
        branch: formBranch.trim() || null,
        cronExpression: formCron.trim(),
        enabled: formEnabled,
      }
      if (editing && editing !== 'new') {
        await updateAiClubPipelineCronJob(pipelineId, editing.id, payload)
      } else {
        await createAiClubPipelineCronJob(pipelineId, payload)
      }
      setEditing(null)
      fetchCrons()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  /** 确认删除。 */
  const handleDelete = async () => {
    if (deletingId === null) return
    setDeleteLoading(true)
    try {
      await deleteAiClubPipelineCronJob(pipelineId, deletingId)
      setDeletingId(null)
      fetchCrons()
    } catch (err) {
      setFormError(getErrorMessage(err))
      setDeletingId(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) return <LoadingSpinner text="加载定时任务…" />
  if (error) return <p className="text-[13px] text-[var(--color-danger)]">{error}</p>

  return (
    <div className="space-y-4">
      {/* 新建按钮 */}
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={handleOpenNew}>
          新建定时任务
        </Button>
      </div>

      {/* 列表 */}
      {crons.length === 0 ? (
        <EmptyState
          title="暂无定时任务"
          description="为该流水线创建 Cron 定时触发规则。"
          icon={<Clock className="h-6 w-6" strokeWidth={1.5} />}
        />
      ) : (
        <div className="space-y-2">
          {crons.map((cron) => (
            <div
              key={cron.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                    <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{cron.name}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        cron.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {cron.enabled ? '已启用' : '已禁用'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                    <span className="font-mono">{cron.cronExpression}</span>
                    {cron.branch && <span>分支: {cron.branch}</span>}
                    {cron.nextRunAt && <span>下次执行: {formatDateTime(cron.nextRunAt)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(cron)}
                    className="rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingId(cron.id)}
                    className="rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-[var(--color-danger)] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建/编辑表单（内联展开） */}
      {editing !== null && (
        <div className="rounded-xl border border-[var(--color-primary)] bg-[var(--color-bg-card)] p-5 space-y-4">
          <h4 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            {editing === 'new' ? '新建定时任务' : '编辑定时任务'}
          </h4>
          {formError && (
            <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
              {formError}
            </div>
          )}
          <Input
            label="名称"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="每日构建"
            maxLength={120}
          />
          <Input
            label="分支"
            value={formBranch}
            onChange={(e) => setFormBranch(e.target.value)}
            placeholder="main"
            maxLength={100}
          />
          <Input
            label="Cron 表达式"
            value={formCron}
            onChange={(e) => setFormCron(e.target.value)}
            placeholder="0 2 * * *"
            maxLength={100}
            hint="标准 5 段式 Cron：分 时 日 月 周"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formEnabled}
              onChange={(e) => setFormEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
            />
            <span className="text-[13px] text-[var(--color-text-primary)]">启用</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>取消</Button>
            <Button size="sm" loading={saving} onClick={handleSave}>
              {editing === 'new' ? '创建' : '保存'}
            </Button>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deletingId !== null}
        title="删除定时任务"
        description="确定要删除该 Cron 定时任务吗？此操作不可撤销。"
        variant="danger"
        confirmText="删除"
        loading={deleteLoading}
        onCancel={() => setDeletingId(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
