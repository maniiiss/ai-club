import { http } from './http'
import type {
  ApiResponse,
  ObservabilityHealthTimelinePointItem,
  ObservabilityProjectDetailItem,
  ObservabilityProjectHealthItem,
  ObservabilityProjectItem,
  ObservabilityProjectLogItem,
  PageResponse,
  ProjectRuntimeInstanceItem
} from '@/types/platform'

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export interface ObservabilityProjectQuery {
  page: number
  size: number
  keyword?: string
  healthLevel?: string
}

export interface ObservabilityProjectLogQuery {
  page: number
  size: number
  runtimeInstanceId?: number
  level?: string
  keyword?: string
  traceId?: string
  startTime?: string
  endTime?: string
}

export interface ObservabilityRuntimeInstancePayload {
  name: string
  environment: string
  serviceName: string
  enabled: boolean
  serverMode: 'MANAGED_SERVER' | 'EXTERNAL_ENDPOINT'
  serverId?: number | null
  externalBaseUrl?: string
  logEnabled: boolean
  logPaths: string[]
  healthEnabled: boolean
  healthProbeType: 'HTTP' | 'TCP'
  healthTarget: string
}

export const pageObservabilityProjects = async (query: ObservabilityProjectQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ObservabilityProjectItem>>>('/api/observability/projects', {
    params: cleanParams(query)
  })
  return data.data
}

export const getObservabilityProjectDetail = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<ObservabilityProjectDetailItem>>(`/api/observability/projects/${projectId}`)
  return data.data
}

export const pageObservabilityProjectLogs = async (projectId: number, query: ObservabilityProjectLogQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ObservabilityProjectLogItem>>>(`/api/observability/projects/${projectId}/logs`, {
    params: cleanParams(query)
  })
  return data.data
}

export const getObservabilityProjectHealth = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<ObservabilityProjectHealthItem>>(`/api/observability/projects/${projectId}/health`)
  return data.data
}

export const getObservabilityProjectHealthTimeline = async (projectId: number, runtimeInstanceId?: number, limit = 50) => {
  const { data } = await http.get<ApiResponse<ObservabilityHealthTimelinePointItem[]>>(`/api/observability/projects/${projectId}/health/timeline`, {
    params: cleanParams({ runtimeInstanceId, limit })
  })
  return data.data
}

export const updateObservabilityRuntimeInstance = async (
  projectId: number,
  runtimeInstanceId: number,
  payload: ObservabilityRuntimeInstancePayload
) => {
  const { data } = await http.put<ApiResponse<ProjectRuntimeInstanceItem>>(
    `/api/observability/projects/${projectId}/runtime-instances/${runtimeInstanceId}`,
    payload
  )
  return data.data
}
