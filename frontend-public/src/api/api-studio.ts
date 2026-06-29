/**
 * API Studio 服务层。
 * 对应后端 ApiStudioController（/api/api-studio/projects/{projectId}/...）。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  ApiStudioProjectOverview,
  ApiStudioProjectTree,
  ApiStudioDirectoryItem,
  ApiStudioDirectoryPayload,
  ApiStudioDirectoryReorderPayload,
  ApiStudioEndpointSummary,
  ApiStudioEndpointDetail,
  ApiStudioEndpointPayload,
  ApiStudioEndpointReorderPayload,
  ApiStudioEnvironmentDetail,
  ApiStudioEnvironmentPayload,
  ApiStudioDebugExecutionPayload,
  ApiStudioDebugExecutionResult,
  ApiStudioDebugRecordItem,
  ApiStudioEndpointVersionItem,
} from '@/src/types/api-studio'

const base = (projectId: number) => `/api/api-studio/projects/${projectId}`

// ── 项目概览 ──

export const getApiStudioOverview = async (projectId: number): Promise<ApiStudioProjectOverview> => {
  const res = await http.get<ApiResponse<ApiStudioProjectOverview>>(`${base(projectId)}/overview`)
  return unwrap(res)
}

// ── 目录树 ──

export const getApiStudioTree = async (projectId: number): Promise<ApiStudioProjectTree> => {
  const res = await http.get<ApiResponse<ApiStudioProjectTree>>(`${base(projectId)}/tree`)
  return unwrap(res)
}

// ── 目录 CRUD ──

export const createApiStudioDirectory = async (projectId: number, payload: ApiStudioDirectoryPayload): Promise<ApiStudioDirectoryItem> => {
  const res = await http.post<ApiResponse<ApiStudioDirectoryItem>>(`${base(projectId)}/directories`, payload)
  return unwrap(res)
}

export const updateApiStudioDirectory = async (projectId: number, directoryId: number, payload: ApiStudioDirectoryPayload): Promise<ApiStudioDirectoryItem> => {
  const res = await http.put<ApiResponse<ApiStudioDirectoryItem>>(`${base(projectId)}/directories/${directoryId}`, payload)
  return unwrap(res)
}

export const deleteApiStudioDirectory = async (projectId: number, directoryId: number): Promise<void> => {
  await http.delete(`${base(projectId)}/directories/${directoryId}`)
}

export const reorderApiStudioDirectories = async (projectId: number, payload: ApiStudioDirectoryReorderPayload): Promise<void> => {
  await http.put(`${base(projectId)}/directories/reorder`, payload)
}

// ── API 端点 CRUD ──

export const listApiStudioEndpoints = async (projectId: number, query?: {
  directoryId?: number | null; status?: string | null; keyword?: string | null; method?: string | null
}): Promise<ApiStudioEndpointSummary[]> => {
  const res = await http.get<ApiResponse<ApiStudioEndpointSummary[]>>(`${base(projectId)}/endpoints`, {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}

export const createApiStudioEndpoint = async (projectId: number, payload: ApiStudioEndpointPayload): Promise<ApiStudioEndpointDetail> => {
  const res = await http.post<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints`, payload)
  return unwrap(res)
}

export const getApiStudioEndpoint = async (projectId: number, endpointId: number): Promise<ApiStudioEndpointDetail> => {
  const res = await http.get<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}`)
  return unwrap(res)
}

export const updateApiStudioEndpoint = async (projectId: number, endpointId: number, payload: ApiStudioEndpointPayload): Promise<ApiStudioEndpointDetail> => {
  const res = await http.put<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}`, payload)
  return unwrap(res)
}

export const deleteApiStudioEndpoint = async (projectId: number, endpointId: number): Promise<void> => {
  await http.delete(`${base(projectId)}/endpoints/${endpointId}`)
}

export const reorderApiStudioEndpoints = async (projectId: number, payload: ApiStudioEndpointReorderPayload): Promise<void> => {
  await http.put(`${base(projectId)}/endpoints/reorder`, payload)
}

// ── 生命周期 ──

export const publishApiStudioEndpoint = async (projectId: number, endpointId: number): Promise<ApiStudioEndpointDetail> => {
  const res = await http.post<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}/publish`)
  return unwrap(res)
}

export const deprecateApiStudioEndpoint = async (projectId: number, endpointId: number): Promise<ApiStudioEndpointDetail> => {
  const res = await http.post<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}/deprecate`)
  return unwrap(res)
}

// ── 环境 ──

export const listApiStudioEnvironments = async (projectId: number): Promise<ApiStudioEnvironmentDetail[]> => {
  const res = await http.get<ApiResponse<ApiStudioEnvironmentDetail[]>>(`${base(projectId)}/environments`)
  return unwrap(res)
}

export const createApiStudioEnvironment = async (projectId: number, payload: ApiStudioEnvironmentPayload): Promise<ApiStudioEnvironmentDetail> => {
  const res = await http.post<ApiResponse<ApiStudioEnvironmentDetail>>(`${base(projectId)}/environments`, payload)
  return unwrap(res)
}

export const updateApiStudioEnvironment = async (projectId: number, environmentId: number, payload: ApiStudioEnvironmentPayload): Promise<ApiStudioEnvironmentDetail> => {
  const res = await http.put<ApiResponse<ApiStudioEnvironmentDetail>>(`${base(projectId)}/environments/${environmentId}`, payload)
  return unwrap(res)
}

export const deleteApiStudioEnvironment = async (projectId: number, environmentId: number): Promise<void> => {
  await http.delete(`${base(projectId)}/environments/${environmentId}`)
}

export const setDefaultApiStudioEnvironment = async (projectId: number, environmentId: number): Promise<ApiStudioEnvironmentDetail> => {
  const res = await http.post<ApiResponse<ApiStudioEnvironmentDetail>>(`${base(projectId)}/environments/${environmentId}/set-default`)
  return unwrap(res)
}

// ── 调试 ──

export const executeApiStudioDebug = async (projectId: number, endpointId: number, payload: ApiStudioDebugExecutionPayload): Promise<ApiStudioDebugExecutionResult> => {
  const res = await http.post<ApiResponse<ApiStudioDebugExecutionResult>>(`${base(projectId)}/endpoints/${endpointId}/debug-executions`, payload)
  return unwrap(res)
}

export const listApiStudioDebugRecords = async (projectId: number, query?: {
  endpointId?: number | null; page?: number; size?: number
}): Promise<PageResponse<ApiStudioDebugRecordItem>> => {
  const res = await http.get<ApiResponse<PageResponse<ApiStudioDebugRecordItem>>>(`${base(projectId)}/debug-records`, {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}

export const getApiStudioDebugRecord = async (projectId: number, recordId: number): Promise<ApiStudioDebugRecordItem> => {
  const res = await http.get<ApiResponse<ApiStudioDebugRecordItem>>(`${base(projectId)}/debug-records/${recordId}`)
  return unwrap(res)
}

export const deleteApiStudioDebugRecord = async (projectId: number, recordId: number): Promise<void> => {
  await http.delete(`${base(projectId)}/debug-records/${recordId}`)
}

// ── 版本 ──

export const listApiStudioVersions = async (projectId: number, endpointId: number): Promise<ApiStudioEndpointVersionItem[]> => {
  const res = await http.get<ApiResponse<ApiStudioEndpointVersionItem[]>>(`${base(projectId)}/endpoints/${endpointId}/versions`)
  return unwrap(res)
}

export const getApiStudioVersion = async (projectId: number, endpointId: number, versionId: number): Promise<ApiStudioEndpointVersionItem> => {
  const res = await http.get<ApiResponse<ApiStudioEndpointVersionItem>>(`${base(projectId)}/endpoints/${endpointId}/versions/${versionId}`)
  return unwrap(res)
}

export const rollbackApiStudioVersion = async (projectId: number, endpointId: number, versionId: number): Promise<ApiStudioEndpointDetail> => {
  const res = await http.post<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}/versions/${versionId}/rollback`)
  return unwrap(res)
}
