import { http } from './http'
import type { ApiResponse } from '@/types/platform'

/**
 * 平台模型调用量统计接口的所有类型与查询函数。
 * 以模型为中心聚合 agent_invocation_log，与 agent-usage.ts（按智能体/用户）互补。
 */

export interface ModelOptionItem {
  modelName: string
  provider: string
}

export interface OptionItem {
  code: string
  label: string
}

export interface ModelUsageOptions {
  models: ModelOptionItem[]
  providers: OptionItem[]
}

export interface ModelUsageQueryPayload {
  startTime?: string
  endTime?: string
  modelNames?: string[]
  providers?: string[]
  granularity?: 'day' | 'week' | 'month'
  limit?: number
}

export interface ModelOverview {
  totalCalls: number
  successCount: number
  failureCount: number
  successRate: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  tokenCoverage: number
  avgDurationMs: number
  p95DurationMs: number
  activeModelCount: number
  distinctUsers: number
  cachedTokens: number
  cacheHitRate: number | null
}

export interface ModelBreakdown {
  modelName: string
  provider: string
  modelConfigId: number | null
  total: number
  success: number
  failure: number
  successRate: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  avgDurationMs: number
  p95DurationMs: number
  uniqueUsers: number
  uniqueUserNames: string
  cachedTokens: number
  cacheHitRate: number | null
}

export interface ModelTrendPoint {
  bucket: string
  total: number
  success: number
  failure: number
  totalTokens: number
  avgDurationMs: number
  cachedTokens: number
  cacheHitRate: number | null
}

export interface ProviderBreakdown {
  provider: string
  total: number
  success: number
  failure: number
  successRate: number
  totalTokens: number
  avgDurationMs: number
  cachedTokens: number
  cacheHitRate: number | null
}

const cleanPayload = <T extends object>(payload: T): T =>
  Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
    )
  ) as T

export const getModelUsageOptions = async () => {
  const { data } = await http.get<ApiResponse<ModelUsageOptions>>('/api/model-usage-stats/options')
  return data.data
}

export const getModelUsageOverview = async (payload: ModelUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<ModelOverview>>(
    '/api/model-usage-stats/overview',
    cleanPayload(payload)
  )
  return data.data
}

export const getModelUsageByModel = async (payload: ModelUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<ModelBreakdown[]>>(
    '/api/model-usage-stats/by-model',
    cleanPayload(payload)
  )
  return data.data
}

export const getModelUsageTrend = async (payload: ModelUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<ModelTrendPoint[]>>(
    '/api/model-usage-stats/trend',
    cleanPayload(payload)
  )
  return data.data
}

export const getModelUsageByProvider = async (payload: ModelUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<ProviderBreakdown[]>>(
    '/api/model-usage-stats/by-provider',
    cleanPayload(payload)
  )
  return data.data
}
