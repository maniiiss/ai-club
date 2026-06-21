/**
 * 需求 AI 助手 API。
 * 公众端接口走 /api/public/ 前缀，自带积分扣费。
 * 模型由后端自动选择，公众端不需要手动指定。
 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type { RequirementAiRequest, RequirementAiResult } from '@/src/types/requirementAi'

/**
 * 公众端 AI 生成（自动扣积分）。
 * 对应后端 PublicRequirementAiController.generateRequirementAi。
 */
export const generateRequirementAi = async (
  taskId: number,
  request: RequirementAiRequest,
): Promise<RequirementAiResult> => {
  const res = await http.post<ApiResponse<RequirementAiResult>>(
    `/api/public/tasks/${taskId}/requirement-ai`,
    request,
  )
  return unwrap(res)
}
