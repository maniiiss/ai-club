import { http } from './http'
import type {
  ApiResponse,
  ModelBenchmarkProgress,
  ModelBenchmarkRunDetail,
  ModelBenchmarkRunStatus,
  ModelBenchmarkRunSummary,
  PageResponse
} from '@/types/platform'

/** 创建对比测试 run 的请求载荷，与后端 ModelBenchmarkCreateRequest 对齐。 */
export interface ModelBenchmarkCreatePayload {
  name?: string
  modelIds: number[]
  concurrency: number
  totalRequests: number
  streamEnabled: boolean
  maxTokens: number
  systemPrompt?: string
  userPrompt?: string
}

export interface ModelBenchmarkQuery {
  page: number
  size: number
  keyword?: string
  status?: ModelBenchmarkRunStatus
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const pageBenchmarks = async (query: ModelBenchmarkQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ModelBenchmarkRunSummary>>>(
    '/api/model-benchmarks',
    { params: cleanParams(query) }
  )
  return data.data
}

export const getBenchmarkDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ModelBenchmarkRunDetail>>(`/api/model-benchmarks/${id}`)
  return data.data
}

export const getBenchmarkProgress = async (id: number) => {
  const { data } = await http.get<ApiResponse<ModelBenchmarkProgress>>(`/api/model-benchmarks/${id}/progress`)
  return data.data
}

export const createBenchmark = async (payload: ModelBenchmarkCreatePayload) => {
  const { data } = await http.post<ApiResponse<ModelBenchmarkRunDetail>>('/api/model-benchmarks', payload)
  return data.data
}

export const cancelBenchmark = async (id: number) => {
  await http.post<ApiResponse<null>>(`/api/model-benchmarks/${id}/cancel`)
}

export const rerunBenchmark = async (id: number) => {
  const { data } = await http.post<ApiResponse<ModelBenchmarkRunDetail>>(`/api/model-benchmarks/${id}/rerun`)
  return data.data
}

export const deleteBenchmark = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/model-benchmarks/${id}`)
}
