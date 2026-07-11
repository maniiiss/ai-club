/**
 * 运行实例观测配置编辑抽屉。
 * 在可观测性面板中编辑运行实例的日志收集与健康检查配置。
 */
import { useEffect, useState } from 'react'
import { SlideDrawer, SlideDrawerFooter } from '@/src/components/common/SlideDrawer'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { Card } from '@/src/components/common/Card'
import { updateObservabilityRuntimeInstance } from '@/src/api/release'
import { getErrorMessage } from '@/src/lib/utils'
import type { RuntimeInstanceItem, RuntimeInstancePayload } from '@/src/types/release'

interface RuntimeInstanceDrawerProps {
  open: boolean
  onClose: () => void
  projectId: number
  instance: RuntimeInstanceItem | null
  onSuccess: () => void
}

export const RuntimeInstanceDrawer = ({
  open,
  onClose,
  projectId,
  instance,
  onSuccess,
}: RuntimeInstanceDrawerProps) => {
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [logEnabled, setLogEnabled] = useState(false)
  const [logPaths, setLogPaths] = useState('')
  const [healthEnabled, setHealthEnabled] = useState(false)
  const [healthProbeType, setHealthProbeType] = useState('')
  const [healthTarget, setHealthTarget] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 打开时用实例数据填充表单。 */
  useEffect(() => {
    if (!open || !instance) return
    setError(null)
    setName(instance.name)
    setEnvironment(instance.environment || '')
    setServiceName(instance.serviceName || '')
    setEnabled(instance.enabled)
    setLogEnabled(instance.logEnabled)
    setLogPaths(instance.logPaths.join(', '))
    setHealthEnabled(instance.healthEnabled)
    setHealthProbeType(instance.healthProbeType || '')
    setHealthTarget(instance.healthTarget || '')
  }, [open, instance])

  const handleSave = async () => {
    if (!instance) return
    setSaving(true)
    setError(null)
    try {
      const payload: RuntimeInstancePayload = {
        name: name.trim(),
        environment: environment.trim() || null,
        serviceName: serviceName.trim() || null,
        enabled,
        logEnabled,
        logPaths: logPaths.split(',').map((s) => s.trim()).filter(Boolean),
        healthEnabled,
        healthProbeType: healthProbeType || null,
        healthTarget: healthTarget.trim() || null,
      }
      await updateObservabilityRuntimeInstance(projectId, instance.id, payload)
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
      title="编辑运行实例配置"
      description={instance?.name || ''}
      maxWidth="640px"
      footer={
        <SlideDrawerFooter
          loading={saving}
          onCancel={onClose}
          onConfirm={handleSave}
        />
      }
    >
      <div className="p-6 space-y-6">
        {error && (
          <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {/* 基本信息 */}
        <Card title="基本信息">
          <div className="space-y-4">
            <Input label="实例名称" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Input label="环境标识" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="prod" maxLength={60} />
            <Input label="服务名称" value={serviceName} onChange={(e) => setServiceName(e.target.value)} maxLength={120} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]" />
              <span className="text-[13px] text-[var(--color-text-primary)]">启用实例</span>
            </label>
          </div>
        </Card>

        {/* 日志配置 */}
        <Card title="日志收集">
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={logEnabled} onChange={(e) => setLogEnabled(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]" />
              <span className="text-[13px] text-[var(--color-text-primary)]">启用日志收集</span>
            </label>
            {logEnabled && (
              <Input
                label="日志路径"
                value={logPaths}
                onChange={(e) => setLogPaths(e.target.value)}
                placeholder="/var/log/app.log, /var/log/error.log"
                hint="多个路径用逗号分隔"
              />
            )}
          </div>
        </Card>

        {/* 健康检查 */}
        <Card title="健康检查">
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={healthEnabled} onChange={(e) => setHealthEnabled(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]" />
              <span className="text-[13px] text-[var(--color-text-primary)]">启用健康检查</span>
            </label>
            {healthEnabled && (
              <>
                <Select
                  label="探针类型"
                  value={healthProbeType}
                  onChange={setHealthProbeType}
                  options={[
                    { value: '', label: '请选择' },
                    { value: 'HTTP', label: 'HTTP' },
                    { value: 'TCP', label: 'TCP' },
                  ]}
                />
                <Input
                  label="健康检查目标"
                  value={healthTarget}
                  onChange={(e) => setHealthTarget(e.target.value)}
                  placeholder="http://localhost:8080/actuator/health"
                  maxLength={500}
                />
              </>
            )}
          </div>
        </Card>
      </div>
    </SlideDrawer>
  )
}
