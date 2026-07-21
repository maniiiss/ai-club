import type { GitPilotConfig } from './config.js'

export interface DeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresInSeconds: number
  intervalSeconds: number
}

export interface CliUser {
  id: number
  username: string
  nickname: string
}

export interface CliTokenResult {
  accessToken: string
  expiresAt: string
  user: CliUser
  scopes: string[]
}

export interface CliModel {
  id: number
  name: string
  provider: 'OPENAI' | 'ANTHROPIC'
  modelName: string
  description: string
  openaiApiMode: string
}

export interface ModelSession {
  sessionId: string
  accessToken: string
  expiresAt: string
  provider: 'OPENAI' | 'ANTHROPIC'
  modelName: string
  proxyBaseUrl: string
}

interface ApiResponse<T> { success: boolean; message: string; data: T }

export class PlatformApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message)
  }
}

/** 对平台接口做统一 JSON 解包，并确保错误信息不携带服务端凭据。 */
const requestJson = async <T>(config: GitPilotConfig, path: string, init: RequestInit = {}, token?: string): Promise<T> => {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body) headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${config.platformUrl}${path}`, { ...init, headers })
  } catch (error) {
    throw new Error(`无法连接平台 ${config.platformUrl}，请确认平台地址正确且 backend 已启动：${error instanceof Error ? error.message : String(error)}`)
  }
  const raw = await response.text()
  let payload: ApiResponse<T> | undefined
  try { payload = JSON.parse(raw) as ApiResponse<T> } catch { /* 下方统一报告 HTTP 错误 */ }
  if (!response.ok || !payload?.success) {
    throw new PlatformApiError(response.status, payload?.message || `平台请求失败（HTTP ${response.status}）`, (payload as any)?.code)
  }
  return payload.data
}

export const createDeviceAuthorization = (config: GitPilotConfig) =>
  requestJson<DeviceAuthorization>(config, '/api/cli/device/authorizations', { method: 'POST', body: JSON.stringify({ clientVersion: '0.1.0' }) })

export const pollDeviceToken = (config: GitPilotConfig, deviceCode: string) =>
  requestJson<CliTokenResult>(config, '/api/cli/device/token', { method: 'POST', body: JSON.stringify({ deviceCode }) })

export const getCurrentUser = (config: GitPilotConfig, token: string) => requestJson<CliUser>(config, '/api/cli/me', {}, token)

export const revokeCliToken = (config: GitPilotConfig, token: string) => requestJson<void>(config, '/api/cli/logout', { method: 'POST' }, token)

export const listModels = (config: GitPilotConfig, token: string) => requestJson<CliModel[]>(config, '/api/cli/models', {}, token)

export const createModelSession = (config: GitPilotConfig, token: string, modelConfigId: number) =>
  requestJson<ModelSession>(config, '/api/cli/model-sessions', { method: 'POST', body: JSON.stringify({ modelConfigId, clientVersion: '0.1.0' }) }, token)
