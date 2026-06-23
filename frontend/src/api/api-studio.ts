import { http } from './http'
import type { ApiResponse, PageResponse } from '@/types/platform'
import type {
  ApiStudioDebugExecutionPayload,
  ApiStudioDebugExecutionResult,
  ApiStudioDebugRecordItem,
  ApiStudioDirectoryItem,
  ApiStudioDirectoryPayload,
  ApiStudioDirectoryReorderPayload,
  ApiStudioEndpointDetail,
  ApiStudioEndpointPayload,
  ApiStudioEndpointReorderPayload,
  ApiStudioEndpointSummary,
  ApiStudioEndpointVersionItem,
  ApiStudioEnvironmentDetail,
  ApiStudioEnvironmentPayload,
  ApiStudioProjectOverview,
  ApiStudioProjectTree
} from '@/types/api-studio'

const base = (projectId: number) => `/api/api-studio/projects/${projectId}`

// ========== 项目概览 ==========

export const getApiStudioOverview = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<ApiStudioProjectOverview>>(`${base(projectId)}/overview`)
  return data.data as ApiStudioProjectOverview
}

// ========== 目录 ==========

export const getApiStudioTree = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<ApiStudioProjectTree>>(`${base(projectId)}/tree`)
  return data.data as ApiStudioProjectTree
}

export const createApiStudioDirectory = async (projectId: number, payload: ApiStudioDirectoryPayload) => {
  const { data } = await http.post<ApiResponse<ApiStudioDirectoryItem>>(`${base(projectId)}/directories`, payload)
  return data.data as ApiStudioDirectoryItem
}

export const updateApiStudioDirectory = async (projectId: number, directoryId: number, payload: ApiStudioDirectoryPayload) => {
  const { data } = await http.put<ApiResponse<ApiStudioDirectoryItem>>(`${base(projectId)}/directories/${directoryId}`, payload)
  return data.data as ApiStudioDirectoryItem
}

export const deleteApiStudioDirectory = async (projectId: number, directoryId: number) => {
  await http.delete<ApiResponse<null>>(`${base(projectId)}/directories/${directoryId}`)
}

export const reorderApiStudioDirectories = async (projectId: number, payload: ApiStudioDirectoryReorderPayload) => {
  await http.put<ApiResponse<null>>(`${base(projectId)}/directories/reorder`, payload)
}

// ========== API 端点 ==========

export interface ApiStudioEndpointListQuery {
  directoryId?: number | null
  status?: string | null
  keyword?: string | null
  method?: string | null
}

export const listApiStudioEndpoints = async (projectId: number, query: ApiStudioEndpointListQuery = {}) => {
  const { data } = await http.get<ApiResponse<ApiStudioEndpointSummary[]>>(`${base(projectId)}/endpoints`, { params: query })
  return data.data ?? []
}

export const createApiStudioEndpoint = async (projectId: number, payload: ApiStudioEndpointPayload) => {
  const { data } = await http.post<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints`, payload)
  return data.data as ApiStudioEndpointDetail
}

export const getApiStudioEndpoint = async (projectId: number, endpointId: number) => {
  const { data } = await http.get<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}`)
  return data.data as ApiStudioEndpointDetail
}

export const updateApiStudioEndpoint = async (projectId: number, endpointId: number, payload: ApiStudioEndpointPayload) => {
  const { data } = await http.put<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}`, payload)
  return data.data as ApiStudioEndpointDetail
}

export const deleteApiStudioEndpoint = async (projectId: number, endpointId: number) => {
  await http.delete<ApiResponse<null>>(`${base(projectId)}/endpoints/${endpointId}`)
}

export const reorderApiStudioEndpoints = async (projectId: number, payload: ApiStudioEndpointReorderPayload) => {
  await http.put<ApiResponse<null>>(`${base(projectId)}/endpoints/reorder`, payload)
}

export const publishApiStudioEndpoint = async (projectId: number, endpointId: number) => {
  const { data } = await http.post<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}/publish`)
  return data.data as ApiStudioEndpointDetail
}

export const deprecateApiStudioEndpoint = async (projectId: number, endpointId: number) => {
  const { data } = await http.post<ApiResponse<ApiStudioEndpointDetail>>(`${base(projectId)}/endpoints/${endpointId}/deprecate`)
  return data.data as ApiStudioEndpointDetail
}

// ========== 环境 ==========

export const listApiStudioEnvironments = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<ApiStudioEnvironmentDetail[]>>(`${base(projectId)}/environments`)
  return data.data ?? []
}

export const createApiStudioEnvironment = async (projectId: number, payload: ApiStudioEnvironmentPayload) => {
  const { data } = await http.post<ApiResponse<ApiStudioEnvironmentDetail>>(`${base(projectId)}/environments`, payload)
  return data.data as ApiStudioEnvironmentDetail
}

export const updateApiStudioEnvironment = async (projectId: number, environmentId: number, payload: ApiStudioEnvironmentPayload) => {
  const { data } = await http.put<ApiResponse<ApiStudioEnvironmentDetail>>(`${base(projectId)}/environments/${environmentId}`, payload)
  return data.data as ApiStudioEnvironmentDetail
}

export const deleteApiStudioEnvironment = async (projectId: number, environmentId: number) => {
  await http.delete<ApiResponse<null>>(`${base(projectId)}/environments/${environmentId}`)
}

export const setDefaultApiStudioEnvironment = async (projectId: number, environmentId: number) => {
  const { data } = await http.post<ApiResponse<ApiStudioEnvironmentDetail>>(`${base(projectId)}/environments/${environmentId}/set-default`)
  return data.data as ApiStudioEnvironmentDetail
}

// ========== 调试 ==========

export const executeApiStudioDebug = async (
  projectId: number,
  endpointId: number,
  payload: ApiStudioDebugExecutionPayload
) => {
  const { data } = await http.post<ApiResponse<ApiStudioDebugExecutionResult>>(
    `${base(projectId)}/endpoints/${endpointId}/debug-executions`,
    payload
  )
  return data.data as ApiStudioDebugExecutionResult
}

export interface ApiStudioDebugRecordQuery {
  endpointId?: number | null
  page?: number
  size?: number
}

export const listApiStudioDebugRecords = async (projectId: number, query: ApiStudioDebugRecordQuery = {}) => {
  const { data } = await http.get<ApiResponse<PageResponse<ApiStudioDebugRecordItem>>>(
    `${base(projectId)}/debug-records`,
    { params: query }
  )
  return data.data as PageResponse<ApiStudioDebugRecordItem>
}

export const getApiStudioDebugRecord = async (projectId: number, recordId: number) => {
  const { data } = await http.get<ApiResponse<ApiStudioDebugRecordItem>>(
    `${base(projectId)}/debug-records/${recordId}`
  )
  return data.data as ApiStudioDebugRecordItem
}

export const deleteApiStudioDebugRecord = async (projectId: number, recordId: number) => {
  await http.delete<ApiResponse<null>>(`${base(projectId)}/debug-records/${recordId}`)
}

// ========== 版本 ==========

export const listApiStudioVersions = async (projectId: number, endpointId: number) => {
  const { data } = await http.get<ApiResponse<ApiStudioEndpointVersionItem[]>>(
    `${base(projectId)}/endpoints/${endpointId}/versions`
  )
  return data.data ?? []
}

export const getApiStudioVersion = async (projectId: number, endpointId: number, versionId: number) => {
  const { data } = await http.get<ApiResponse<ApiStudioEndpointVersionItem>>(
    `${base(projectId)}/endpoints/${endpointId}/versions/${versionId}`
  )
  return data.data as ApiStudioEndpointVersionItem
}

export const rollbackApiStudioVersion = async (projectId: number, endpointId: number, versionId: number) => {
  const { data } = await http.post<ApiResponse<ApiStudioEndpointDetail>>(
    `${base(projectId)}/endpoints/${endpointId}/versions/${versionId}/rollback`
  )
  return data.data as ApiStudioEndpointDetail
}
