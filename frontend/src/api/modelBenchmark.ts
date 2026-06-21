import { http } from './http'
import type {
  ApiResponse,
  ModelBenchmarkProgress,
  ModelBenchmarkRunDetail
} from '@/types/platform'

/**
 * 单条对比测试运行的接口。
 *
 * 新模型下：列表与触发都收口到 modelBenchmarkConfig.ts；本文件只保留单条 run 的
 * 详情 / 进度 / 取消 / 删除。
 */

export const getBenchmarkDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ModelBenchmarkRunDetail>>(`/api/model-benchmarks/${id}`)
  return data.data
}

export const getBenchmarkProgress = async (id: number) => {
  const { data } = await http.get<ApiResponse<ModelBenchmarkProgress>>(`/api/model-benchmarks/${id}/progress`)
  return data.data
}

export const cancelBenchmark = async (id: number) => {
  await http.post<ApiResponse<null>>(`/api/model-benchmarks/${id}/cancel`)
}

export const deleteBenchmark = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/model-benchmarks/${id}`)
}
