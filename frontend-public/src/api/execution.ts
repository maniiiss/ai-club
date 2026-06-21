/**
 * 测试与执行模块 API。
 * 测试计划 CRUD + 执行中心 + 运行历史。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  ExecutionTaskItem,
  ExecutionTaskListStatsItem,
  ExecutionTaskDetailItem,
  ExecutionRunItem,
  ExecutionRunDetailItem,
  ExecutionArtifactDetailItem,
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

/* ── 执行任务详情 ── */

/** 获取执行任务完整详情（含运行列表）。 */
export const getExecutionTaskDetail = async (id: number): Promise<ExecutionTaskDetailItem> => {
  const res = await http.get<ApiResponse<ExecutionTaskDetailItem>>(`/api/execution-tasks/${id}`, {
    params: { _ts: Date.now() },
  })
  return unwrap(res)
}

/** 获取执行运行详情（含步骤和产物）。 */
export const getExecutionRunDetail = async (id: number): Promise<ExecutionRunDetailItem> => {
  const res = await http.get<ApiResponse<ExecutionRunDetailItem>>(`/api/execution-runs/${id}`, {
    params: { _ts: Date.now() },
  })
  return unwrap(res)
}

/** 确认执行规划并继续执行。 */
export const confirmExecutionPlan = async (
  id: number,
  payload: { planMarkdown: string },
): Promise<ExecutionTaskDetailItem> => {
  const res = await http.post<ApiResponse<ExecutionTaskDetailItem>>(
    `/api/execution-tasks/${id}/confirm-plan`,
    payload,
  )
  return unwrap(res)
}

/** 更新执行规划 Markdown。 */
export const updateExecutionPlanMarkdown = async (
  id: number,
  payload: { planMarkdown: string },
): Promise<ExecutionTaskDetailItem> => {
  const res = await http.put<ApiResponse<ExecutionTaskDetailItem>>(
    `/api/execution-tasks/${id}/plan-markdown`,
    payload,
  )
  return unwrap(res)
}

/** 下载执行产物文件。 */
export const downloadExecutionArtifact = async (
  artifactId: number,
): Promise<{ blob: Blob; fileName: string }> => {
  const response = await http.get(`/api/execution-artifacts/${artifactId}/download`, {
    responseType: 'blob',
  })
  const disposition = String(response.headers['content-disposition'] || '')
  const matched = disposition.match(/filename="?([^"]+)"?/)
  const fileName = matched?.[1] || `execution-artifact-${artifactId}`
  return {
    blob: response.data as Blob,
    fileName,
  }
}

/* ── 测试计划迭代 ── */

/** 获取项目下可选迭代列表。 */
export const listTestPlanIterations = async (
  projectId: number,
): Promise<{ id: number; name: string; startDate: string | null; endDate: string | null }[]> => {
  const res = await http.get<
    ApiResponse<{ id: number; name: string; startDate: string | null; endDate: string | null }[]>
  >(`/api/test-plans/projects/${projectId}/iterations`)
  return unwrap(res)
}

/** 触发测试计划已接入自动化执行。 */
export const runTestPlanAutomation = async (id: number): Promise<ExecutionTaskItem> => {
  const res = await http.post<ApiResponse<ExecutionTaskItem>>(
    `/api/test-plans/${id}/automation/run`,
  )
  return unwrap(res)
}
