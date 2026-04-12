import { http } from './http'
import type { ApiResponse, CreateFeedbackPayload } from '@/types/platform'

/**
 * 提交用户填写的反馈与建议。
 */
export const createFeedbackApi = async (payload: CreateFeedbackPayload) => {
  await http.post<ApiResponse<null>>('/api/feedback', payload)
}
