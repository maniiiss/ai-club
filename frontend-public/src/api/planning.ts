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
  LinkedTestCase,
  TaskAttachment,
  TaskComment,
  TaskUpdateRecord,
  WorkItem,
  BatchWorkItemOperationResult,
  BatchWorkItemUpdatePayload,
  WorkItemLinks,
  WorkItemPayload,
  WorkItemInlineUpdatePayload,
  WorkItemInlineUpdateResult,
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

/** 列表轻量更新入口，不上传描述、需求文档等完整工作项字段。 */
export const updateWorkItemInline = async (id: number, payload: WorkItemInlineUpdatePayload): Promise<WorkItemInlineUpdateResult> => {
  const res = await http.put<ApiResponse<WorkItemInlineUpdateResult>>(`/api/tasks/${id}/inline`, payload)
  return unwrap(res)
}

export const deleteWorkItem = async (id: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/tasks/${id}`)
}

/** 服务端批量更新入口：一次请求内返回每个工作项的成功或失败结果。 */
export const batchUpdateWorkItems = async (payload: BatchWorkItemUpdatePayload): Promise<BatchWorkItemOperationResult[]> => {
  const res = await http.put<ApiResponse<BatchWorkItemOperationResult[]>>('/api/tasks/batch', payload)
  return unwrap(res)
}

/** 服务端批量删除入口，单项权限失败不会影响其他工作项。 */
export const batchDeleteWorkItems = async (taskIds: number[]): Promise<BatchWorkItemOperationResult[]> => {
  const res = await http.delete<ApiResponse<BatchWorkItemOperationResult[]>>('/api/tasks/batch', { data: { taskIds } })
  return unwrap(res)
}

export const getWorkItemLinks = async (id: number): Promise<WorkItemLinks> => {
  const res = await http.get<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/links`)
  return unwrap(res)
}

export const addWorkItemChild = async (id: number, targetId: number): Promise<WorkItemLinks> => {
  const res = await http.post<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/children`, { targetId })
  return unwrap(res)
}

export const removeWorkItemChild = async (id: number, childTaskId: number): Promise<WorkItemLinks> => {
  const res = await http.delete<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/children/${childTaskId}`)
  return unwrap(res)
}

export const addRelatedWorkItem = async (id: number, targetId: number): Promise<WorkItemLinks> => {
  const res = await http.post<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/related-work-items`, { targetId })
  return unwrap(res)
}

export const removeRelatedWorkItem = async (id: number, relatedTaskId: number): Promise<WorkItemLinks> => {
  const res = await http.delete<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/related-work-items/${relatedTaskId}`)
  return unwrap(res)
}

export const addWorkItemTestCase = async (id: number, targetId: number): Promise<WorkItemLinks> => {
  const res = await http.post<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/test-cases`, { targetId })
  return unwrap(res)
}

export const removeWorkItemTestCase = async (id: number, testCaseId: number): Promise<WorkItemLinks> => {
  const res = await http.delete<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/test-cases/${testCaseId}`)
  return unwrap(res)
}

export const pageProjectTestCases = async (
  projectId: number,
  query: { page: number; size: number; keyword?: string },
): Promise<PageResponse<LinkedTestCase>> => {
  const res = await http.get<ApiResponse<PageResponse<LinkedTestCase>>>(`/api/projects/${projectId}/test-cases`, {
    params: cleanParams(query),
  })
  return unwrap(res)
}

export const uploadWorkItemAttachment = async (id: number, file: File): Promise<TaskAttachment> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await http.post<ApiResponse<TaskAttachment>>(`/api/tasks/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return unwrap(res)
}

export const deleteWorkItemAttachment = async (id: number, attachmentId: number): Promise<WorkItemLinks> => {
  const res = await http.delete<ApiResponse<WorkItemLinks>>(`/api/tasks/${id}/attachments/${attachmentId}`)
  return unwrap(res)
}

export const downloadWorkItemAttachment = async (id: number, attachmentId: number): Promise<{ blob: Blob; fileName: string }> => {
  const res = await http.get(`/api/tasks/${id}/attachments/${attachmentId}/download`, { responseType: 'blob' })
  const disposition = String(res.headers['content-disposition'] || '')
  const matched = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/)
  return {
    blob: res.data as Blob,
    fileName: matched ? decodeURIComponent(matched[1]) : `work-item-attachment-${attachmentId}`,
  }
}

/* ── 评论 ── */

export const listTaskComments = async (taskId: number): Promise<TaskComment[]> => {
  const res = await http.get<ApiResponse<TaskComment[]>>(`/api/tasks/${taskId}/comments`)
  return unwrap(res)
}

export const createTaskComment = async (taskId: number, content: string): Promise<TaskComment> => {
  const res = await http.post<ApiResponse<TaskComment>>(`/api/tasks/${taskId}/comments`, { content })
  return unwrap(res)
}

export const pageTaskUpdateRecords = async (
  taskId: number,
  query: { page: number; size: number },
): Promise<PageResponse<TaskUpdateRecord>> => {
  const res = await http.get<ApiResponse<PageResponse<TaskUpdateRecord>>>(`/api/tasks/${taskId}/update-records`, {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/* ── 燃尽图 ── */

export interface BurndownQuery {
  /** 仅统计该迭代的工作项；不传则按项目全量 */
  iterationId?: number
  /** 项目全量视图下是否排除未规划（iterationId 为空）的工作项 */
  excludeUnplanned?: boolean
}

export const getProjectBurndown = async (projectId: number, query?: BurndownQuery): Promise<BurndownItem> => {
  const res = await http.get<ApiResponse<BurndownItem>>(`/api/projects/${projectId}/burndown`, {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}
