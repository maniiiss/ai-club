import { http } from './http'
import type {
  ApiResponse,
  ModelBenchmarkConfigDetail,
  ModelBenchmarkConfigSummary,
  ModelBenchmarkRunSummary,
  PageResponse
} from '@/types/platform'

/**
 * 模型对比测试"配置维度"接口。
 *
 * 配置可重复编辑、可重复触发；每次触发会生成一条新的 run（带运行时配置快照），
 * run 的查询/取消/删除走 modelBenchmark.ts。
 */

export interface ModelBenchmarkConfigPayload {
  name?: string
  modelIds: number[]
  concurrency: number
  totalRequests: number
  streamEnabled: boolean
  maxTokens: number
  systemPrompt?: string
  userPrompt?: string
}

export interface ModelBenchmarkConfigQuery {
  page: number
  size: number
  keyword?: string
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const pageBenchmarkConfigs = async (query: ModelBenchmarkConfigQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ModelBenchmarkConfigSummary>>>(
    '/api/model-benchmark-configs',
    { params: cleanParams(query) }
  )
  return data.data
}

export const getBenchmarkConfigDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ModelBenchmarkConfigDetail>>(`/api/model-benchmark-configs/${id}`)
  return data.data
}

export const createBenchmarkConfig = async (payload: ModelBenchmarkConfigPayload) => {
  const { data } = await http.post<ApiResponse<ModelBenchmarkConfigDetail>>(
    '/api/model-benchmark-configs',
    payload
  )
  return data.data
}

export const updateBenchmarkConfig = async (id: number, payload: ModelBenchmarkConfigPayload) => {
  const { data } = await http.put<ApiResponse<ModelBenchmarkConfigDetail>>(
    `/api/model-benchmark-configs/${id}`,
    payload
  )
  return data.data
}

export const deleteBenchmarkConfig = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/model-benchmark-configs/${id}`)
}

/** 触发一次运行；nameSuffix 可选，用户可用来标记一次性场景。 */
export const triggerBenchmarkConfigRun = async (id: number, nameSuffix?: string) => {
  const { data } = await http.post<ApiResponse<ModelBenchmarkConfigDetail>>(
    `/api/model-benchmark-configs/${id}/runs`,
    nameSuffix ? { nameSuffix } : {}
  )
  return data.data
}

export const pageBenchmarkConfigRuns = async (id: number, page: number, size: number) => {
  const { data } = await http.get<ApiResponse<PageResponse<ModelBenchmarkRunSummary>>>(
    `/api/model-benchmark-configs/${id}/runs`,
    { params: { page, size } }
  )
  return data.data
}
