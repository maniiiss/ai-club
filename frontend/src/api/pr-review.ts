import { http } from './http'
import type {
  ApiResponse,
  PrReviewStatsConfigItem,
  PrReviewStatsGroupItem,
  PrReviewStatsQueryPayload,
  PrReviewStatsSummaryItem
} from '@/types/platform'

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

/**
 * 读取 PR 评审统计页的默认预填配置。
 */
export const getPrReviewStatsConfig = async (payload: {
  startTime: string
  endTime: string
}) => {
  const { data } = await http.get<ApiResponse<PrReviewStatsConfigItem>>('/api/pr-review-stats/config', {
    params: cleanParams(payload)
  })
  return data.data
}

/**
 * 查询当前时间范围内可选的 OA 开发组。
 */
export const listPrReviewStatsGroups = async (payload: {
  startTime: string
  endTime: string
}) => {
  const { data } = await http.get<ApiResponse<PrReviewStatsGroupItem[]>>('/api/pr-review-stats/groups', {
    params: cleanParams(payload)
  })
  return data.data
}

/**
 * 查询 PR 打回率与未合并开发任务统计。
 */
export const queryPrReviewStats = async (payload: PrReviewStatsQueryPayload) => {
  const { data } = await http.post<ApiResponse<PrReviewStatsSummaryItem>>('/api/pr-review-stats/query', payload)
  return data.data
}
