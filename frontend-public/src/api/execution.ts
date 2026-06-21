/**
 * 测试与执行模块 API。
 * 测试计划 CRUD + 执行中心 + 运行历史。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  ExecutionTaskItem,
  ExecutionTaskListStatsItem,
  ExecutionRunItem,
  TestPlanItem,
} from '@/src/types/execution'

/* ── 测试计划 ── */

/** 分页查询测试计划。 */
export const pageTestPlans = async (query: {
  page: number
  size: number
  keyword?: string
  projectId?: number
  iterationId?: number
  status?: string
}): Promise<PageResponse<TestPlanItem>> => {
  const res = await http.get<ApiResponse<PageResponse<TestPlanItem>>>('/api/test-plans', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 获取测试计划详情。 */
export const getTestPlanDetail = async (id: number): Promise<TestPlanItem> => {
  const res = await http.get<ApiResponse<TestPlanItem>>(`/api/test-plans/${id}`)
  return unwrap(res)
}

/** 创建测试计划。 */
export const createTestPlan = async (payload: {
  name: string
  projectId: number
  iterationId: number | null
  status: string
  description: string
  startDate?: string | null
  endDate?: string | null
}): Promise<TestPlanItem> => {
  const res = await http.post<ApiResponse<TestPlanItem>>('/api/test-plans', payload)
  return unwrap(res)
}

/** 更新测试计划。 */
export const updateTestPlan = async (id: number, payload: {
  name: string
  projectId: number
  iterationId: number | null
  status: string
  description: string
  startDate?: string | null
  endDate?: string | null
}): Promise<TestPlanItem> => {
  const res = await http.put<ApiResponse<TestPlanItem>>(`/api/test-plans/${id}`, payload)
  return unwrap(res)
}

/** 删除测试计划。 */
export const deleteTestPlan = async (id: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/test-plans/${id}`)
}

/** 触发测试计划自动化（生成并运行）。 */
export const generateAndRunTestPlanAutomation = async (id: number): Promise<ExecutionTaskItem> => {
  const res = await http.post<ApiResponse<ExecutionTaskItem>>(`/api/test-plans/${id}/automation/generate-and-run`)
  return unwrap(res)
}

/* ── 执行任务 ── */

/** 分页查询执行任务。 */
export const pageExecutionTasks = async (query: {
  page: number
  size: number
  keyword?: string
  status?: string
  scenarioCode?: string
  projectId?: number
}): Promise<PageResponse<ExecutionTaskItem>> => {
  const res = await http.get<ApiResponse<PageResponse<ExecutionTaskItem>>>('/api/execution-tasks', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 获取执行任务列表统计。 */
export const getExecutionTaskListStats = async (query?: {
  keyword?: string
  status?: string
  scenarioCode?: string
  projectId?: number
}): Promise<ExecutionTaskListStatsItem> => {
  const res = await http.get<ApiResponse<ExecutionTaskListStatsItem>>('/api/execution-tasks/stats', {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}

/** 获取执行任务的运行历史。 */
export const listExecutionTaskRuns = async (taskId: number): Promise<ExecutionRunItem[]> => {
  const res = await http.get<ApiResponse<ExecutionRunItem[]>>(`/api/execution-tasks/${taskId}/runs`)
  return unwrap(res)
}

/** 取消执行任务。 */
export const cancelExecutionTask = async (id: number): Promise<ExecutionTaskItem> => {
  const res = await http.post<ApiResponse<ExecutionTaskItem>>(`/api/execution-tasks/${id}/cancel`)
  return unwrap(res)
}

/** 重试执行任务。 */
export const retryExecutionTask = async (id: number): Promise<ExecutionTaskItem> => {
  const res = await http.post<ApiResponse<ExecutionTaskItem>>(`/api/execution-tasks/${id}/retry`)
  return unwrap(res)
}
