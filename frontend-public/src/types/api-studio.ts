// API Studio 类型定义
// 对应后端 com.aiclub.platform.dto.apistudio.* 和 com.aiclub.platform.dto.request.apistudio.*

export type ApiStudioMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type ApiStudioStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED'
export type ApiStudioBodyType = 'NONE' | 'JSON' | 'FORM_DATA' | 'FORM_URLENCODED' | 'RAW_TEXT'
export type ApiStudioParamLocation = 'PATH' | 'QUERY' | 'HEADER' | 'FORM_DATA' | 'FORM_URLENCODED'
export type ApiStudioDataType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT' | 'FILE'
export type ApiStudioAuthType = 'NONE' | 'BEARER' | 'API_KEY'
export type ApiStudioChangeType = 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'ROLLBACK'

export interface ApiStudioProjectOverview {
  projectId: number
  projectName: string
  directoryCount: number
  endpointCount: number
  environmentCount: number
  defaultEnvironmentId: number | null
  defaultEnvironmentName: string | null
}

export interface ApiStudioDirectoryItem {
  id: number
  projectId: number
  parentId: number | null
  name: string
  description: string | null
  sortOrder: number
  createdBy: number | null
  updatedBy: number | null
  createdAt: string
  updatedAt: string
}

export interface ApiStudioEndpointSummary {
  id: number
  projectId: number
  directoryId: number | null
  name: string
  method: ApiStudioMethod
  path: string
  summary: string | null
  status: ApiStudioStatus
  sortOrder: number
  revision: number
  updatedAt: string
}

export interface ApiStudioTreeNode {
  directory: ApiStudioDirectoryItem
  children: ApiStudioTreeNode[]
  endpoints: ApiStudioEndpointSummary[]
}

export interface ApiStudioProjectTree {
  projectId: number
  nodes: ApiStudioTreeNode[]
  rootEndpoints: ApiStudioEndpointSummary[]
}

export interface ApiStudioParameterItem {
  id?: number | null
  location: ApiStudioParamLocation
  name: string
  dataType: ApiStudioDataType
  required: boolean
  defaultValue?: string | null
  exampleValue?: string | null
  description?: string | null
  enumJson?: string | null
  sortOrder?: number | null
}

export interface ApiStudioResponseFieldItem {
  id?: number | null
  parentId?: number | null
  name: string
  dataType: ApiStudioDataType
  required: boolean
  description?: string | null
  exampleValue?: string | null
  enumJson?: string | null
  sortOrder?: number | null
  children?: ApiStudioResponseFieldItem[]
}

export interface ApiStudioResponseItem {
  id?: number | null
  statusCode: number
  contentType: string
  description?: string | null
  exampleBody?: string | null
  sortOrder?: number | null
  fields?: ApiStudioResponseFieldItem[]
}

export interface ApiStudioEndpointDetail {
  id: number
  projectId: number
  directoryId: number | null
  name: string
  method: ApiStudioMethod
  path: string
  summary: string | null
  descriptionMarkdown: string | null
  status: ApiStudioStatus
  requestBodyType: ApiStudioBodyType
  requestBodySchemaJson: string | null
  requestBodyExample: string | null
  sortOrder: number
  revision: number
  createdBy: number | null
  updatedBy: number | null
  createdAt: string
  updatedAt: string
  parameters: ApiStudioParameterItem[]
  responses: ApiStudioResponseItem[]
}

export interface ApiStudioEnvironmentVariableItem {
  id?: number | null
  name: string
  value: string | null
  secret: boolean
  description?: string | null
}

export interface ApiStudioEnvironmentDetail {
  id: number
  projectId: number
  name: string
  baseUrl: string
  commonHeadersJson: string | null
  authType: ApiStudioAuthType
  authConfigJson: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
  variables: ApiStudioEnvironmentVariableItem[]
}

export interface ApiStudioDebugExecutionResult {
  debugRecordId: number | null
  success: boolean
  statusCode: number | null
  durationMillis: number
  errorMessage: string | null
  finalUrl: string
  requestMethod: string
  requestHeaders: Record<string, string[]>
  requestBodyPreview: string
  responseHeaders: Record<string, string[]>
  responseBody: string
  responseBytes: number
  responseTruncated: boolean
}

export interface ApiStudioDebugRecordItem {
  id: number
  projectId: number
  endpointId: number | null
  environmentId: number | null
  creatorUserId: number
  requestSnapshotJson: string | null
  responseSnapshotJson: string | null
  statusCode: number | null
  durationMillis: number | null
  success: boolean
  errorMessage: string | null
  createdAt: string
}

export interface ApiStudioEndpointVersionItem {
  id: number
  endpointId: number
  versionNo: number
  changeType: ApiStudioChangeType
  changeSummary: string | null
  creatorUserId: number | null
  createdAt: string
  snapshotJson: string | null
}

// 请求 Payload

export interface ApiStudioDirectoryPayload {
  parentId?: number | null
  name: string
  description?: string | null
  sortOrder?: number | null
}

export interface ApiStudioDirectoryReorderPayload {
  items: Array<{ directoryId: number; parentId: number | null; sortOrder: number }>
}

export interface ApiStudioEndpointPayload {
  directoryId?: number | null
  name: string
  method: ApiStudioMethod
  path: string
  summary?: string | null
  descriptionMarkdown?: string | null
  status?: ApiStudioStatus
  requestBodyType?: ApiStudioBodyType
  requestBodySchemaJson?: string | null
  requestBodyExample?: string | null
  sortOrder?: number | null
  revision?: number | null
  parameters?: ApiStudioParameterItem[]
  responses?: ApiStudioResponseItem[]
  changeSummary?: string | null
}

export interface ApiStudioEndpointReorderPayload {
  items: Array<{ endpointId: number; directoryId: number | null; sortOrder: number }>
}

export interface ApiStudioEnvironmentPayload {
  name: string
  baseUrl: string
  commonHeadersJson?: string | null
  authType?: ApiStudioAuthType
  authConfigJson?: string | null
  isDefault?: boolean
  variables?: ApiStudioEnvironmentVariableItem[]
}

export interface ApiStudioDebugExecutionPayload {
  environmentId: number
  pathOverrides?: Record<string, string>
  queryOverrides?: Record<string, string>
  headerOverrides?: Record<string, string>
  requestBodyType?: ApiStudioBodyType
  requestBody?: string
  formOverrides?: Array<{ name: string; value: string; file?: boolean }>
  variableOverrides?: Record<string, string>
}
