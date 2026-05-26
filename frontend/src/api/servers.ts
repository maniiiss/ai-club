import { getResolvedApiBaseUrl, http } from './http'
import type {
  ApiResponse,
  PageResponse,
  ServerDetailItem,
  ServerMetricSampleItem,
  ServerSummaryItem,
  ServerTerminalSessionCreatedItem,
  SftpDownloadTicket,
  SftpLsResult
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

/** SFTP 列出远程目录内容 */
export const sftpLs = async (serverId: number, path = '/') => {
  const { data } = await http.get<ApiResponse<SftpLsResult>>(`/api/servers/${serverId}/sftp/ls`, {
    params: { path }
  })
  return data.data
}

/** SFTP 上传文件到远程路径 */
export const sftpUpload = async (
  serverId: number,
  remotePath: string,
  file: File,
  onProgress?: (percent: number) => void
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('remotePath', remotePath)
  const { data } = await http.post<ApiResponse<null>>(`/api/servers/${serverId}/sftp/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded * 100) / event.total))
      }
    }
  })
  return data
}

/** SFTP 下载远程文件 */
export const sftpDownload = async (serverId: number, path: string) => {
  const { data } = await http.post<ApiResponse<SftpDownloadTicket>>(
    `/api/servers/${serverId}/sftp/download-ticket`,
    null,
    { params: { path } }
  )
  const ticket = data.data?.ticket
  if (!ticket) {
    throw new Error('下载失败：未获取到下载票据')
  }
  const url = new URL(`/api/servers/${serverId}/sftp/download`, getResolvedApiBaseUrl())
  url.searchParams.set('path', path)
  url.searchParams.set('ticket', ticket)
  const link = document.createElement('a')
  link.href = url.toString()
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/** SFTP 删除远程文件或目录 */
export const sftpDelete = async (serverId: number, path: string, recursive = false) => {
  const { data } = await http.delete<ApiResponse<null>>(`/api/servers/${serverId}/sftp/file`, {
    params: { path, recursive }
  })
  return data
}

/** SFTP 创建远程目录 */
export const sftpMkdir = async (serverId: number, path: string) => {
  const { data } = await http.post<ApiResponse<null>>(`/api/servers/${serverId}/sftp/mkdir`, { path })
  return data
}
