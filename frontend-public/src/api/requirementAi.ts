/**
 * 需求 AI 助手 API。
 * 公众端接口走 /api/public/ 前缀，自带积分扣费。
 * 模型由后端自动选择，公众端不需要手动指定。
 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type { BatchRequirementAiOperationResult, RequirementAiRequest } from '@/src/types/requirementAi'
import type { ExecutionTaskItem } from '@/src/types/execution'

/**
 * 公众端 AI 生成（自动扣积分）。
 * 对应后端 PublicRequirementAiController.generateRequirementAi。
 */
export const generateRequirementAi = async (
  taskId: number,
  request: RequirementAiRequest,
): Promise<ExecutionTaskItem> => {
  const res = await http.post<ApiResponse<ExecutionTaskItem>>(
    `/api/public/tasks/${taskId}/requirement-ai`,
    request,
  )
  return unwrap(res)
}

/**
 * 公众端批量需求 AI：将当前页所选需求一次提交到后端，由后端统一逐项扣费和创建执行任务。
 */
export const generateBatchRequirementAi = async (
  taskIds: number[],
  request: RequirementAiRequest,
): Promise<BatchRequirementAiOperationResult[]> => {
  const res = await http.post<ApiResponse<BatchRequirementAiOperationResult[]>>(
    '/api/public/tasks/batch-requirement-ai',
    { taskIds, action: request.action },
  )
  return unwrap(res)
}
