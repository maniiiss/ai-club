export interface ProjectApiProfileItem {
  projectId: number
  title: string
  description: string
  version: string
}

export interface ProjectApiFolderItem {
  id: number
  projectId: number
  parentFolderId: number | null
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ProjectApiEndpointSummaryItem {
  id: number
  folderId: number | null
  name: string
  method: string
  path: string
  summary: string
}

export interface ProjectApiFolderTreeNodeItem {
  id: number
  name: string
  sortOrder: number
  children: ProjectApiFolderTreeNodeItem[]
  endpoints: ProjectApiEndpointSummaryItem[]
}

export interface ProjectApiTreeItem {
  folders: ProjectApiFolderTreeNodeItem[]
  rootEndpoints: ProjectApiEndpointSummaryItem[]
}

export interface ProjectApiKeyValueItem {
  name: string
  value: string
  enabled: boolean
}

export interface ProjectApiParameterItem {
  name: string
  required: boolean
  type: string
  example: string
  description: string
}

export interface ProjectApiResponseExampleItem {
  name: string
  statusCode: number
  contentType: string
  headers: ProjectApiKeyValueItem[]
  bodyExample: string
  description: string
}

export interface ProjectApiDebugConfigItem {
  defaultEnvironmentId: number | null
}

export interface ProjectApiEndpointDetailItem {
  id: number
  projectId: number
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
  debugConfig: ProjectApiDebugConfigItem
  createdAt: string
  updatedAt: string
}

export interface ProjectApiEnvironmentAuthConfigItem {
  token: string
  username: string
  password: string
  apiKeyName: string
  apiKeyValue: string
  apiKeyLocation: string
}

export interface ProjectApiEnvironmentItem {
  id: number
  projectId: number
  name: string
  baseUrl: string
  variables: Record<string, string>
  authType: 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY' | string
  authConfig: ProjectApiEnvironmentAuthConfigItem
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectApiDebugRequestSnapshotItem {
  method: string
  url: string
  contentType: string
  headers: ProjectApiKeyValueItem[]
  body: string
}

export interface ProjectApiDebugResponseSnapshotItem {
  statusCode: number | null
  contentType: string
  headers: ProjectApiKeyValueItem[]
  binary: boolean
  bodySize: number
  body: string
  bodyPreview: string
}

export interface ProjectApiDebugRecordItem {
  id: number
  endpointId: number | null
  endpointName: string
  environmentId: number | null
  environmentName: string
  success: boolean
  errorMessage: string
  durationMillis: number
  requestSnapshot: ProjectApiDebugRequestSnapshotItem
  responseSnapshot: ProjectApiDebugResponseSnapshotItem
  createdByName: string
  createdAt: string
}

export interface ProjectApiImportResultItem {
  folderCount: number
  endpointCount: number
  environmentCount: number
}

export interface ProjectApiExportDocumentItem {
  fileName: string
  format: string
  content: string
}
