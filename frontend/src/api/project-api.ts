import { http } from './http'
import type { ApiResponse } from '@/types/platform'
import type {
  ProjectApiDebugRecordItem,
  ProjectApiEndpointDetailItem,
  ProjectApiEnvironmentAuthConfigItem,
  ProjectApiEnvironmentItem,
  ProjectApiExportDocumentItem,
  ProjectApiFolderItem,
  ProjectApiImportResultItem,
  ProjectApiKeyValueItem,
  ProjectApiParameterItem,
  ProjectApiProfileItem,
  ProjectApiResponseExampleItem,
  ProjectApiTreeItem
} from '@/types/project-api'

export interface ProjectApiProfilePayload {
  title: string
  description: string
  version: string
}

export interface ProjectApiFolderPayload {
  parentFolderId: number | null
  name: string
  sortOrder: number
}

export interface ProjectApiDebugConfigPayload {
  defaultEnvironmentId: number | null
}

export interface ProjectApiEndpointPayload {
  folderId: number | null
  name: string
  method: string
  path: string
  summary: string
  descriptionMarkdown: string
  requestContentType: string
  pathParams: ProjectApiParameterItem[]
  queryParams: ProjectApiParameterItem[]
  headerParams: ProjectApiParameterItem[]
  bodyExampleText: string
  responseExamples: ProjectApiResponseExampleItem[]
  debugConfig: ProjectApiDebugConfigPayload
}

export interface ProjectApiEnvironmentPayload {
  name: string
  baseUrl: string
  variables: Record<string, string>
  authType: string
  authConfig: ProjectApiEnvironmentAuthConfigItem
  isDefault: boolean
}

export interface ProjectApiImportPayload {
  format: string
  fileName: string
  content: string
}

export interface ProjectApiDebugExecutePayload {
  environmentId: number | null
  method: string
  path: string
  requestContentType: string
  pathParams: ProjectApiKeyValueItem[]
  queryParams: ProjectApiKeyValueItem[]
  headerParams: ProjectApiKeyValueItem[]
  bodyText: string
}

const buildScopeParams = (projectId?: number | null) =>
  projectId == null ? undefined : { projectId }

export const getProjectApiProfile = async (projectId?: number | null) => {
  const { data } = await http.get<ApiResponse<ProjectApiProfileItem>>('/api/apis/profile', {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const updateProjectApiProfile = async (projectId: number | null | undefined, payload: ProjectApiProfilePayload) => {
  const { data } = await http.put<ApiResponse<ProjectApiProfileItem>>('/api/apis/profile', payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const getProjectApiTree = async (projectId?: number | null) => {
  const { data } = await http.get<ApiResponse<ProjectApiTreeItem>>('/api/apis/tree', {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const createProjectApiFolder = async (projectId: number | null | undefined, payload: ProjectApiFolderPayload) => {
  const { data } = await http.post<ApiResponse<ProjectApiFolderItem>>('/api/apis/folders', payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const updateProjectApiFolder = async (projectId: number | null | undefined, folderId: number, payload: ProjectApiFolderPayload) => {
  const { data } = await http.put<ApiResponse<ProjectApiFolderItem>>(`/api/apis/folders/${folderId}`, payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const deleteProjectApiFolder = async (projectId: number | null | undefined, folderId: number) => {
  await http.delete<ApiResponse<null>>(`/api/apis/folders/${folderId}`, {
    params: buildScopeParams(projectId)
  })
}

export const getProjectApiEndpoint = async (projectId: number | null | undefined, endpointId: number) => {
  const { data } = await http.get<ApiResponse<ProjectApiEndpointDetailItem>>(`/api/apis/endpoints/${endpointId}`, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const createProjectApiEndpoint = async (projectId: number | null | undefined, payload: ProjectApiEndpointPayload) => {
  const { data } = await http.post<ApiResponse<ProjectApiEndpointDetailItem>>('/api/apis/endpoints', payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const updateProjectApiEndpoint = async (projectId: number | null | undefined, endpointId: number, payload: ProjectApiEndpointPayload) => {
  const { data } = await http.put<ApiResponse<ProjectApiEndpointDetailItem>>(`/api/apis/endpoints/${endpointId}`, payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const deleteProjectApiEndpoint = async (projectId: number | null | undefined, endpointId: number) => {
  await http.delete<ApiResponse<null>>(`/api/apis/endpoints/${endpointId}`, {
    params: buildScopeParams(projectId)
  })
}

export const listProjectApiEnvironments = async (projectId?: number | null) => {
  const { data } = await http.get<ApiResponse<ProjectApiEnvironmentItem[]>>('/api/apis/environments', {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const createProjectApiEnvironment = async (projectId: number | null | undefined, payload: ProjectApiEnvironmentPayload) => {
  const { data } = await http.post<ApiResponse<ProjectApiEnvironmentItem>>('/api/apis/environments', payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const updateProjectApiEnvironment = async (projectId: number | null | undefined, environmentId: number, payload: ProjectApiEnvironmentPayload) => {
  const { data } = await http.put<ApiResponse<ProjectApiEnvironmentItem>>(`/api/apis/environments/${environmentId}`, payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const deleteProjectApiEnvironment = async (projectId: number | null | undefined, environmentId: number) => {
  await http.delete<ApiResponse<null>>(`/api/apis/environments/${environmentId}`, {
    params: buildScopeParams(projectId)
  })
}

export const importProjectApiOpenApi = async (projectId: number | null | undefined, payload: ProjectApiImportPayload) => {
  const { data } = await http.post<ApiResponse<ProjectApiImportResultItem>>('/api/apis/imports/openapi', payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}

export const exportProjectApiOpenApi = async (projectId: number | null | undefined, format: string) => {
  const { data } = await http.get<ApiResponse<ProjectApiExportDocumentItem>>('/api/apis/exports/openapi', {
    params: { ...buildScopeParams(projectId), format }
  })
  return data.data
}

export const listProjectApiDebugRecords = async (projectId: number | null | undefined, endpointId?: number) => {
  const { data } = await http.get<ApiResponse<ProjectApiDebugRecordItem[]>>('/api/apis/debug-records', {
    params: {
      ...buildScopeParams(projectId),
      ...(endpointId ? { endpointId } : {})
    }
  })
  return data.data
}

export const executeProjectApiDebug = async (projectId: number | null | undefined, endpointId: number, payload: ProjectApiDebugExecutePayload) => {
  const { data } = await http.post<ApiResponse<ProjectApiDebugRecordItem>>(`/api/apis/endpoints/${endpointId}/debug-executions`, payload, {
    params: buildScopeParams(projectId)
  })
  return data.data
}
