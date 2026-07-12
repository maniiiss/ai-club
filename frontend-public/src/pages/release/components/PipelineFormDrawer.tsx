/**
 * 创建/编辑 GitPilot 流水线的表单抽屉。
 * 字段校验对齐后端 AiClubPipelineRequest 的 @NotBlank/@Size 注解。
 */
import { useEffect, useState, useCallback } from 'react'
import { SlideDrawer, SlideDrawerFooter } from '@/src/components/common/SlideDrawer'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { createAiClubPipeline, updateAiClubPipeline } from '@/src/api/release'
import { listGitlabBindingOptions } from '@/src/api/development'
import { getErrorMessage } from '@/src/lib/utils'
import type { AiClubPipelineItem, AiClubPipelinePayload } from '@/src/types/release'
import type { ProjectGitlabBindingItem } from '@/src/types/development'

interface PipelineFormDrawerProps {
  open: boolean
  onClose: () => void
  /** 项目 ID（从路由参数获取）。 */
  projectId: number
  /** 传入已有流水线则为编辑模式，不传为创建模式。 */
  pipeline?: AiClubPipelineItem | null
  /** 保存成功后回调，刷新列表。 */
  onSuccess: () => void
}

export const PipelineFormDrawer = ({
  open,
  onClose,
  projectId,
  pipeline,
  onSuccess,
}: PipelineFormDrawerProps) => {
  const isEdit = !!pipeline

  const [name, setName] = useState('')
  const [gitlabBindingId, setGitlabBindingId] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('')
  const [configPath, setConfigPath] = useState('.woodpecker.yml')
  const [enabled, setEnabled] = useState(true)

  const [bindings, setBindings] = useState<ProjectGitlabBindingItem[]>([])
  const [bindingsLoading, setBindingsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 加载 GitLab 绑定选项列表。 */
  const loadBindings = useCallback(async () => {
    setBindingsLoading(true)
    try {
      setBindings(await listGitlabBindingOptions())
    } catch {
      setBindings([])
    } finally {
      setBindingsLoading(false)
    }
  }, [])

  /** 打开时重置表单并加载绑定列表。 */
  useEffect(() => {
    if (!open) return
    setError(null)
    if (pipeline) {
      setName(pipeline.name)
      setGitlabBindingId(String(pipeline.gitlabBindingId))
      setDefaultBranch(pipeline.defaultBranch || '')
      setConfigPath(pipeline.configPath || '.woodpecker.yml')
      setEnabled(pipeline.enabled)
    } else {
      setName('')
      setGitlabBindingId('')
      setDefaultBranch('')
      setConfigPath('.woodpecker.yml')
      setEnabled(true)
    }
    loadBindings()
  }, [open, pipeline, loadBindings])

  /** 表单校验。 */
  const validate = (): string | null => {
    if (!name.trim()) return '流水线名称不能为空'
    if (name.length > 120) return '流水线名称长度不能超过 120'
    if (!gitlabBindingId) return '请选择 GitLab 绑定'
    if (defaultBranch.length > 100) return '默认分支长度不能超过 100'
    if (configPath.length > 255) return '配置文件路径长度不能超过 255'
    return null
  }

  const handleSave = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: AiClubPipelinePayload = {
        projectId,
        gitlabBindingId: Number(gitlabBindingId),
        name: name.trim(),
        defaultBranch: defaultBranch.trim() || null,
        configPath: configPath.trim() || null,
        enabled,
      }
      if (isEdit && pipeline) {
        await updateAiClubPipeline(pipeline.id, payload)
      } else {
        await createAiClubPipeline(payload)
      }
      onSuccess()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑流水线' : '新建流水线'}
      description={isEdit ? '修改 GitPilot 流水线配置' : '创建新的 GitPilot 流水线'}
      maxWidth="640px"
      footer={
        <SlideDrawerFooter
          loading={saving}
          onCancel={onClose}
          onConfirm={handleSave}
          confirmText={isEdit ? '保存' : '创建'}
        />
      }
    >
      <div className="p-6 space-y-5">
        {error && (
          <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        <Input
          label="流水线名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="输入流水线名称"
          maxLength={120}
          error={name.length > 120 ? '名称长度不能超过 120' : undefined}
        />

        <Select
          label="GitLab 绑定"
          value={gitlabBindingId}
          onChange={setGitlabBindingId}
          searchable
          placeholder={bindingsLoading ? '加载中…' : '选择 GitLab 绑定'}
          options={bindings.map((b) => ({
            value: String(b.id),
            label: b.gitlabProjectName || `绑定 #${b.id}`,
            description: b.gitlabProjectPath || undefined,
          }))}
        />

        <Input
          label="默认分支"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          placeholder="main"
          maxLength={100}
          hint="触发流水线时使用的默认分支"
        />

        <Input
          label="配置文件路径"
          value={configPath}
          onChange={(e) => setConfigPath(e.target.value)}
          placeholder=".woodpecker.yml"
          maxLength={255}
          hint="Woodpecker CI 配置文件在仓库中的路径"
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
          />
          <span className="text-[13px] text-[var(--color-text-primary)]">启用流水线</span>
        </label>
      </div>
    </SlideDrawer>
  )
}
