import { http } from './http'
import type { ApiResponse } from '@/types/platform'

/**
 * 智能体调用统计接口的所有类型与查询函数。
 */

export interface OptionItem {
  code: string
  label: string
}

export interface AgentUsageOptions {
  agentTypes: OptionItem[]
  statuses: OptionItem[]
  triggerSources: OptionItem[]
}

export interface AgentUsageQueryPayload {
  startTime?: string
  endTime?: string
  agentTypes?: string[]
  userIds?: number[]
  modelConfigIds?: number[]
  triggerSources?: string[]
  projectId?: number
  granularity?: 'day' | 'week' | 'month'
  limit?: number
  page?: number
  size?: number
}

export interface UnknownCallSource {
  source: string
  count: number
}

export interface AgentUsageOverview {
  totalCount: number
  successCount: number
  failureCount: number
  successRate: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTotalTokens: number
  tokenCoverageRatio: number
  avgDurationMs: number
  p95DurationMs: number
  distinctUserCount: number
  unknownCallCount: number
  unknownCallSources: UnknownCallSource[]
}

export interface AgentUsageTrendPoint {
  bucket: string
  total: number
  success: number
  failure: number
  totalTokens: number
  avgDurationMs: number
}

export interface AgentUsageAgentBreakdown {
  agentType: string
  agentLabel: string
  total: number
  success: number
  failure: number
  successRate: number
  avgDurationMs: number
  totalTokens: number
}

export interface AgentUsageUserBreakdown {
  userId: number | null
  username: string
  nickname: string
  total: number
  success: number
  totalTokens: number
  lastInvokedAt: string | null
}

export interface AgentUsageModelBreakdown {
  modelConfigId: number | null
  modelName: string | null
  provider: string | null
  total: number
  totalTokens: number
  avgDurationMs: number
  p95DurationMs: number
}

export interface AgentInvocationLogSummary {
  id: number
  createdAt: string | null
  userId: number | null
  username: string | null
  nickname: string | null
  agentType: string
  agentLabel: string
  action: string | null
  modelName: string | null
  provider: string | null
  status: string
  triggerSource: string
  durationMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  inputChars: number | null
  outputChars: number | null
  errorCode: string | null
  errorMessage: string | null
}

export interface AgentUsageLogPage {
  records: AgentInvocationLogSummary[]
  total: number
  page: number
  size: number
  totalPages: number
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

export const getAgentUsageOptions = async () => {
  const { data } = await http.get<ApiResponse<AgentUsageOptions>>('/api/agent-usage-stats/options')
  return data.data
}

export const getAgentUsageOverview = async (payload: AgentUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<AgentUsageOverview>>(
    '/api/agent-usage-stats/overview',
    cleanPayload(payload)
  )
  return data.data
}

export const getAgentUsageTrend = async (payload: AgentUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<AgentUsageTrendPoint[]>>(
    '/api/agent-usage-stats/trend',
    cleanPayload(payload)
  )
  return data.data
}

export const getAgentUsageByAgent = async (payload: AgentUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<AgentUsageAgentBreakdown[]>>(
    '/api/agent-usage-stats/by-agent',
    cleanPayload(payload)
  )
  return data.data
}

export const getAgentUsageByUser = async (payload: AgentUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<AgentUsageUserBreakdown[]>>(
    '/api/agent-usage-stats/by-user',
    cleanPayload(payload)
  )
  return data.data
}

export const getAgentUsageByModel = async (payload: AgentUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<AgentUsageModelBreakdown[]>>(
    '/api/agent-usage-stats/by-model',
    cleanPayload(payload)
  )
  return data.data
}

export const getAgentUsageLogs = async (payload: AgentUsageQueryPayload) => {
  const { data } = await http.post<ApiResponse<AgentUsageLogPage>>(
    '/api/agent-usage-stats/logs',
    cleanPayload(payload)
  )
  return data.data
}