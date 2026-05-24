import { http } from './http'
import type {
  ApiResponse,
  PageResponse,
  ServerDetailItem,
  ServerMetricSampleItem,
  ServerSummaryItem,
  ServerTerminalSessionCreatedItem
} from '@/types/platform'

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export interface ServerQuery {
  page: number
  size: number
  keyword?: string
  enabled?: boolean | ''
}

export interface ServerPayload {
  name: string
  description: string
  host: string
  port: number
  username: string
  osType: string
  authType: 'PASSWORD' | 'PRIVATE_KEY'
  password?: string
  privateKey?: string
  privateKeyPassphrase?: string
  enabled: boolean
  jumpHostEnabled: boolean
  jumpHost?: string
  jumpPort?: number | null
  jumpUsername?: string
  jumpAuthType?: 'PASSWORD' | 'PRIVATE_KEY' | ''
  jumpPassword?: string
  jumpPrivateKey?: string
  jumpPrivateKeyPassphrase?: string
  connectivityAlertEnabledOverride?: boolean | null
  cpuThresholdPercentOverride?: number | null
  memoryThresholdPercentOverride?: number | null
  diskThresholdPercentOverride?: number | null
  consecutiveBreachesOverride?: number | null
  cooldownMinutesOverride?: number | null
  recipientUserIds: number[]
}

export interface ServerAlertConfigPayload {
  connectivityAlertEnabledOverride?: boolean | null
  cpuThresholdPercentOverride?: number | null
  memoryThresholdPercentOverride?: number | null
  diskThresholdPercentOverride?: number | null
  consecutiveBreachesOverride?: number | null
  cooldownMinutesOverride?: number | null
  recipientUserIds: number[]
}

export interface ServerTerminalSessionPayload {
  cols?: number
  rows?: number
}

export const pageServers = async (query: ServerQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ServerSummaryItem>>>('/api/servers', {
    params: cleanParams(query)
  })
  return data.data
}

export const getServerDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ServerDetailItem>>(`/api/servers/${id}`)
  return data.data
}

export const createServer = async (payload: ServerPayload) => {
  const { data } = await http.post<ApiResponse<ServerDetailItem>>('/api/servers', payload)
  return data.data
}

export const updateServer = async (id: number, payload: ServerPayload) => {
  const { data } = await http.put<ApiResponse<ServerDetailItem>>(`/api/servers/${id}`, payload)
  return data.data
}

export const deleteServer = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/servers/${id}`)
}

export const testServerConnection = async (id: number) => {
  const { data } = await http.post<ApiResponse<ServerSummaryItem>>(`/api/servers/${id}/test-connection`)
  return data.data
}

export const listServerMetricsHistory = async (id: number) => {
  const { data } = await http.get<ApiResponse<ServerMetricSampleItem[]>>(`/api/servers/${id}/metrics/history`)
  return data.data
}

export const updateServerAlertConfig = async (id: number, payload: ServerAlertConfigPayload) => {
  const { data } = await http.put<ApiResponse<ServerDetailItem>>(`/api/servers/${id}/alerts`, payload)
  return data.data
}

export const createServerTerminalSession = async (id: number, payload: ServerTerminalSessionPayload) => {
  const { data } = await http.post<ApiResponse<ServerTerminalSessionCreatedItem>>(`/api/servers/${id}/terminal-sessions`, payload)
  return data.data
}

export const closeServerTerminalSession = async (sessionId: string) => {
  await http.delete<ApiResponse<null>>(`/api/server-terminal-sessions/${encodeURIComponent(sessionId)}`)
}
