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
  agentTypes: OptionItem[]
}

export interface ModelUsageQueryPayload {
  startTime?: string
  endTime?: string
  modelNames?: string[]
  providers?: string[]
  agentTypes?: string[]
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
  /** 模型配置名称；未关联配置的系统调用为空。 */
  modelConfigName: string | null
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
  cachedTokens: number
  cacheHitRate: number | null
}

/** 按用户聚合的 Token 用量明细。 */
export interface UserBreakdown {
  userId: number | null
  username: string | null
  nickname: string | null
  total: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens: number
  cacheHitRate: number | null
  lastInvokedAt: string | null
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

/** 按调用来源（智能体类型）聚合的分布项。 */
export interface SourceBreakdown {
  agentType: string
  label: string
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

export const getModelUsageByUser = async (payload: ModelUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<UserBreakdown[]>>(
    '/api/model-usage-stats/by-user',
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

export const getModelUsageBySource = async (payload: ModelUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<SourceBreakdown[]>>(
    '/api/model-usage-stats/by-source',
    cleanPayload(payload)
  )
  return data.data
}
