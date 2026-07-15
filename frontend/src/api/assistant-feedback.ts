import { http } from './http'
import type { ApiResponse, PageResponse } from '@/types/platform'
import type {
  AssistantFeedbackDetail,
  AssistantFeedbackItem,
  AssistantFeedbackPageQuery,
  AssistantFeedbackStats
} from '@/types/assistant-feedback'

const cleanParams = (params: Record<string, unknown>) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
)

/** 分页查询 GitPilot 反馈运营队列。 */
export const pageAssistantFeedback = async (query: AssistantFeedbackPageQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<AssistantFeedbackItem>>>('/api/assistant-feedback', { params: cleanParams({ ...query }) })
  return data.data
}

/** 查询 GitPilot 反馈运营统计。 */
export const getAssistantFeedbackStats = async () => {
  const { data } = await http.get<ApiResponse<AssistantFeedbackStats>>('/api/assistant-feedback/stats')
  return data.data
}

/** 查询反馈详情与活动时间线。 */
export const getAssistantFeedbackDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<AssistantFeedbackDetail>>(`/api/assistant-feedback/${id}`)
  return data.data
}

/** 更新反馈分诊状态和负责人。 */
export const triageAssistantFeedback = async (id: number, payload: { status: string; assigneeUserId?: number | null; note?: string }) => {
  const { data } = await http.patch<ApiResponse<AssistantFeedbackDetail>>(`/api/assistant-feedback/${id}/triage`, payload)
  return data.data
}

/** 更新反馈处理结论和复盘数据集标记。 */
export const resolveAssistantFeedback = async (id: number, payload: { status: string; resolutionCode: string; resolutionNote: string; improvementTags: string[]; datasetStatus: string }) => {
  const { data } = await http.patch<ApiResponse<AssistantFeedbackDetail>>(`/api/assistant-feedback/${id}/resolution`, payload)
  return data.data
}
