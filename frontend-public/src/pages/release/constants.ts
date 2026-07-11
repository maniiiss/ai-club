/**
 * 发布与观测模块共享常量。
 * 状态颜色映射、健康等级颜色映射等，供各面板统一引用。
 */

/** 流水线运行状态颜色映射。 */
export const statusColorMap: Record<string, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  FAILURE: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-700',
  RUNNING: 'bg-blue-50 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
  ABORTED: 'bg-gray-100 text-gray-600',
  UNSTABLE: 'bg-amber-50 text-amber-700',
}

/** 健康等级颜色映射。 */
export const healthLevelColorMap: Record<string, string> = {
  HEALTHY: 'bg-emerald-50 text-emerald-700',
  DEGRADED: 'bg-amber-50 text-amber-700',
  UNHEALTHY: 'bg-red-50 text-red-700',
}

/** 日志级别颜色映射。 */
export const logLevelColorMap: Record<string, string> = {
  ERROR: 'bg-red-50 text-red-700 border-red-200',
  WARN: 'bg-amber-50 text-amber-700 border-amber-200',
  INFO: 'bg-blue-50 text-blue-700 border-blue-200',
  DEBUG: 'bg-gray-50 text-gray-700 border-gray-200',
}

/** 可订阅的流水线状态列表（用于回调 Webhook 配置）。 */
export const subscribableStatuses = [
  'SUCCESS',
  'FAILURE',
  'PENDING',
  'RUNNING',
  'CANCELLED',
  'ABORTED',
  'UNSTABLE',
]

/** 获取状态对应的颜色类名，未匹配时返回默认灰色。 */
export const getStatusColor = (status: string | null): string =>
  (status && statusColorMap[status]) || 'bg-gray-100 text-gray-600'

/** 获取健康等级对应的颜色类名，未匹配时返回默认灰色。 */
export const getHealthLevelColor = (level: string | null): string =>
  (level && healthLevelColorMap[level]) || 'bg-gray-100 text-gray-600'
