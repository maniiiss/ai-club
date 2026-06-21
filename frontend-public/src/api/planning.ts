/**
 * 计划模块 API。
 * 迭代 CRUD + 工作项 CRUD + 统计 + 燃尽图。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  BurndownItem,
  IterationBoardItem,
  IterationItem,
  IterationPayload,
  WorkItem,
  WorkItemPayload,
  WorkItemQuery,
  WorkItemStats,
} from '@/src/types/planning'

/* ── 迭代 ── */

export const getIterationBoard = async (projectId: number): Promise<IterationBoardItem> => {
  const res = await http.get<ApiResponse<IterationBoardItem>>(`/api/projects/${projectId}/iteration-board`)
  return unwrap(res)
}

export const listProjectIterations = async (projectId: number): Promise<IterationItem[]> => {
  const res = await http.get<ApiResponse<IterationItem[]>>(`/api/projects/${projectId}/iterations`)
  return unwrap(res)
}

export const createIteration = async (projectId: number, payload: IterationPayload): Promise<IterationItem> => {
  const res = await http.post<ApiResponse<IterationItem>>(`/api/projects/${projectId}/iterations`, payload)
  return unwrap(res)
}

export const updateIteration = async (projectId: number, iterationId: number, payload: IterationPayload): Promise<IterationItem> => {
  const res = await http.put<ApiResponse<IterationItem>>(`/api/projects/${projectId}/iterations/${iterationId}`, payload)
  return unwrap(res)
}

export const deleteIteration = async (projectId: number, iterationId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/projects/${projectId}/iterations/${iterationId}`)
}

/* ── 工作项 ── */

export const pageProjectWorkItems = async (
  projectId: number,
  query: WorkItemQuery & { page: number; size: number },
): Promise<PageResponse<WorkItem>> => {
  const res = await http.get<ApiResponse<PageResponse<WorkItem>>>(`/api/projects/${projectId}/work-items/page`, {
    params: cleanParams(query),
  })
  return unwrap(res)
}

export const listProjectWorkItems = async (projectId: number, query?: WorkItemQuery): Promise<WorkItem[]> => {
  const res = await http.get<ApiResponse<WorkItem[]>>(`/api/projects/${projectId}/work-items`, {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}

export const getWorkItemStats = async (projectId: number, query?: WorkItemQuery): Promise<WorkItemStats> => {
  const res = await http.get<ApiResponse<WorkItemStats>>(`/api/projects/${projectId}/work-items/stats`, {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}

export const getWorkItemDetail = async (id: number): Promise<WorkItem> => {
  const res = await http.get<ApiResponse<WorkItem>>(`/api/tasks/${id}`)
  return unwrap(res)
}

export const createWorkItem = async (payload: WorkItemPayload): Promise<WorkItem> => {
  const res = await http.post<ApiResponse<WorkItem>>('/api/tasks', payload)
  return unwrap(res)
}

export const updateWorkItem = async (id: number, payload: WorkItemPayload): Promise<WorkItem> => {
  const res = await http.put<ApiResponse<WorkItem>>(`/api/tasks/${id}`, payload)
  return unwrap(res)
}

export const deleteWorkItem = async (id: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/tasks/${id}`)
}

/* ── 燃尽图 ── */

export const getProjectBurndown = async (projectId: number): Promise<BurndownItem> => {
  const res = await http.get<ApiResponse<BurndownItem>>(`/api/projects/${projectId}/burndown`)
  return unwrap(res)
}
