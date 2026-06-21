import type { ProjectRuntimeInstancePayload } from '@/api/cicd'
import type { ProjectRuntimeInstanceItem } from '@/types/platform'

export type RuntimeInstanceServerMode = 'MANAGED_SERVER' | 'EXTERNAL_ENDPOINT'
export type RuntimeInstanceHealthProbeType = 'HTTP' | 'TCP'

export interface RuntimeInstanceFormModel {
  name: string
  environment: string
  serviceName: string
  enabled: boolean
  serverMode: RuntimeInstanceServerMode
  serverId: number | null
  externalBaseUrl: string
  logEnabled: boolean
  logPathsText: string
  healthEnabled: boolean
  healthProbeType: RuntimeInstanceHealthProbeType
  healthTarget: string
}

export const createEmptyRuntimeInstanceForm = (projectName = '', serverId: number | null = null): RuntimeInstanceFormModel => ({
  name: projectName ? `${projectName} 运行实例` : '',
  environment: '',
  serviceName: '',
  enabled: true,
  serverMode: 'MANAGED_SERVER',
  serverId,
  externalBaseUrl: '',
  logEnabled: false,
  logPathsText: '',
  healthEnabled: true,
  healthProbeType: 'HTTP',
  healthTarget: ''
})

export const toRuntimeInstanceForm = (item: ProjectRuntimeInstanceItem): RuntimeInstanceFormModel => ({
  name: item.name || '',
  environment: item.environment || '',
  serviceName: item.serviceName || '',
  enabled: item.enabled,
  serverMode: item.serverMode === 'EXTERNAL_ENDPOINT' ? 'EXTERNAL_ENDPOINT' : 'MANAGED_SERVER',
  serverId: item.serverId,
  externalBaseUrl: item.externalBaseUrl || '',
  logEnabled: item.logEnabled,
  logPathsText: (item.logPaths || []).join('\n'),
  healthEnabled: item.healthEnabled,
  healthProbeType: item.healthProbeType === 'TCP' ? 'TCP' : 'HTTP',
  healthTarget: item.healthTarget || ''
})

const trimText = (value: string | null | undefined) => (value || '').trim()

export const normalizeLogPathsText = (value: string) =>
  value
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean)

/**
 * 将页面表单收敛成后端运行实例契约，确保外部地址模式不会携带 SSH 日志采集配置。
 */
export const buildRuntimeInstancePayload = (form: RuntimeInstanceFormModel): ProjectRuntimeInstancePayload => {
  const name = trimText(form.name)
  if (!name) {
    throw new Error('运行实例名称不能为空')
  }
  if (form.serverMode === 'MANAGED_SERVER' && !form.serverId) {
    throw new Error('受管服务器实例必须选择服务器')
  }
  if (form.serverMode === 'EXTERNAL_ENDPOINT' && !trimText(form.externalBaseUrl)) {
    throw new Error('外部地址实例必须填写外部访问地址')
  }
  if (form.healthEnabled && !trimText(form.healthTarget)) {
    throw new Error('开启健康检查时必须填写健康检查目标')
  }
  const logEnabled = form.serverMode === 'MANAGED_SERVER' && form.logEnabled
  return {
    name,
    environment: trimText(form.environment),
    serviceName: trimText(form.serviceName),
    enabled: form.enabled,
    serverMode: form.serverMode,
    serverId: form.serverMode === 'MANAGED_SERVER' ? form.serverId : null,
    externalBaseUrl: form.serverMode === 'EXTERNAL_ENDPOINT' ? trimText(form.externalBaseUrl) : '',
    logEnabled,
    logPaths: logEnabled ? normalizeLogPathsText(form.logPathsText) : [],
    healthEnabled: form.healthEnabled,
    healthProbeType: form.healthProbeType,
    healthTarget: form.healthEnabled ? trimText(form.healthTarget) : ''
  }
}

export const formatRuntimeInstanceSource = (sourceType?: string | null) => {
  const normalized = (sourceType || '').toUpperCase()
  if (normalized === 'MANUAL') return '手工维护'
  if (normalized === 'JENKINS') return 'Jenkins'
  if (normalized === 'WOODPECKER') return 'Woodpecker'
  return sourceType || '未知来源'
}

export const formatRuntimeInstanceServerMode = (serverMode?: string | null) =>
  serverMode === 'EXTERNAL_ENDPOINT' ? '外部地址' : '受管服务器'

export const formatRuntimeInstanceStatus = (status?: string | null) => {
  const normalized = (status || '').toUpperCase()
  if (normalized === 'DEPLOYING') return '部署中'
  if (normalized === 'HEALTHY') return '健康'
  if (normalized === 'UNHEALTHY') return '异常'
  if (normalized === 'FAILED') return '失败'
  if (normalized === 'UNKNOWN') return '未知'
  return status || '未采集'
}

export const runtimeInstanceStatusTone = (status?: string | null) => {
  const normalized = (status || '').toUpperCase()
  if (normalized === 'HEALTHY') return 'success'
  if (normalized === 'DEPLOYING') return 'warning'
  if (normalized === 'FAILED' || normalized === 'UNHEALTHY') return 'danger'
  return 'neutral'
}
