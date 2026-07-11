/**
 * 创建/编辑 Jenkins 流水线绑定的表单抽屉。
 * 将项目与 Jenkins Server 上的 Job 绑定，用于触发构建和收集构建历史。
 */
import { useEffect, useState, useCallback } from 'react'
import { SlideDrawer, SlideDrawerFooter } from '@/src/components/common/SlideDrawer'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import {
  createPipelineBinding,
  updatePipelineBinding,
  listJenkinsServerOptions,
} from '@/src/api/release'
import { getErrorMessage } from '@/src/lib/utils'
import type { PipelineBindingItem, PipelineBindingPayload, JenkinsServerItem } from '@/src/types/release'

interface PipelineBindingFormDrawerProps {
  open: boolean
  onClose: () => void
  projectId: number
  /** 传入已有绑定为编辑模式。 */
  binding?: PipelineBindingItem | null
  onSuccess: () => void
}

export const PipelineBindingFormDrawer = ({
  open,
  onClose,
  projectId,
  binding,
  onSuccess,
}: PipelineBindingFormDrawerProps) => {
  const isEdit = !!binding

  const [jenkinsServerId, setJenkinsServerId] = useState('')
  const [jobName, setJobName] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('')
  const [buildParametersJson, setBuildParametersJson] = useState('')
  const [enabled, setEnabled] = useState(true)

  const [servers, setServers] = useState<JenkinsServerItem[]>([])
  const [serversLoading, setServersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 加载 Jenkins 服务选项。 */
  const loadServers = useCallback(async () => {
    setServersLoading(true)
    try {
      setServers(await listJenkinsServerOptions())
    } catch {
      setServers([])
    } finally {
      setServersLoading(false)
    }
  }, [])

  /** 打开时重置表单。 */
  useEffect(() => {
    if (!open) return
    setError(null)
    if (binding) {
      setJenkinsServerId(String(binding.jenkinsServerId))
      setJobName(binding.jobName)
      setDefaultBranch(binding.defaultBranch || '')
      setBuildParametersJson(binding.buildParametersJson || '')
      setEnabled(binding.enabled)
    } else {
      setJenkinsServerId('')
      setJobName('')
      setDefaultBranch('')
      setBuildParametersJson('')
      setEnabled(true)
    }
    loadServers()
  }, [open, binding, loadServers])

  /** 表单校验。 */
  const validate = (): string | null => {
    if (!jenkinsServerId) return '请选择 Jenkins 服务'
    if (!jobName.trim()) return 'Job 名称不能为空'
    if (jobName.length > 255) return 'Job 名称长度不能超过 255'
    if (defaultBranch.length > 100) return '默认分支长度不能超过 100'
    if (buildParametersJson.length > 4000) return '构建参数 JSON 长度不能超过 4000'
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
      const payload: PipelineBindingPayload = {
        projectId,
        jenkinsServerId: Number(jenkinsServerId),
        jobName: jobName.trim(),
        defaultBranch: defaultBranch.trim() || null,
        buildParametersJson: buildParametersJson.trim() || null,
        enabled,
      }
      if (isEdit && binding) {
        await updatePipelineBinding(binding.id, payload)
      } else {
        await createPipelineBinding(payload)
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
      title={isEdit ? '编辑 Jenkins 绑定' : '新建 Jenkins 绑定'}
      description="将项目与 Jenkins Job 绑定"
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

        <Select
          label="Jenkins 服务"
          value={jenkinsServerId}
          onChange={setJenkinsServerId}
          searchable
          placeholder={serversLoading ? '加载中…' : '选择 Jenkins 服务'}
          options={servers.map((s) => ({
            value: String(s.id),
            label: s.name,
            description: s.baseUrl,
          }))}
        />

        <Input
          label="Job 名称"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          placeholder="project-build"
          maxLength={255}
        />

        <Input
          label="默认分支"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          placeholder="main"
          maxLength={100}
          hint="触发构建时使用的默认分支"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">构建参数 JSON</label>
          <textarea
            value={buildParametersJson}
            onChange={(e) => setBuildParametersJson(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder='{"param1":"value1"}'
            className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2.5 text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-y"
          />
          <p className="text-[12px] text-[var(--color-text-tertiary)]">Jenkins Job 的构建参数，JSON 格式</p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
          />
          <span className="text-[13px] text-[var(--color-text-primary)]">启用绑定</span>
        </label>
      </div>
    </SlideDrawer>
  )
}
