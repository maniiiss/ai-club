/**
 * HTTP 客户端配置。
 * 精确复刻 Vue 端 api/http.ts 的模式：
 * - baseURL 三级回退解析
 * - 请求拦截器注入 Bearer token
 * - 响应拦截器处理 401 跳转
 * - ApiResponse<T> 解包工具函数
 */
import axios from 'axios'

/** localStorage 中存储认证 token 的 key。 */
export const AUTH_TOKEN_KEY = 'ai-club-auth-token'

/** localStorage 中存储用户信息 JSON 的 key。 */
export const AUTH_USER_KEY = 'ai-club-auth-user'

/**
 * 解析接口基础地址。
 * 优先使用显式配置的完整地址；未配置时根据当前页面主机名与后端端口拼出真实后端地址，
 * 避免把接口请求误打到前端自身端口。
 */
const resolveApiBaseUrl = (): string => {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredApiBaseUrl !== undefined && String(configuredApiBaseUrl).trim() !== '') {
    return String(configuredApiBaseUrl)
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const backendPort = String(import.meta.env.VITE_API_PORT ?? '').trim() || '8080'
    return `${protocol}//${window.location.hostname}:${backendPort}`
  }
  return 'http://localhost:8080'
}

export const resolvedApiBaseUrl = resolveApiBaseUrl()

/** Axios 实例，统一 baseURL 和超时时间。 */
export const http = axios.create({
  baseURL: resolvedApiBaseUrl,
  timeout: 60000,
})

/** 请求拦截器：自动注入 Bearer token。 */
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 响应拦截器：401 时清除认证信息并跳转登录页。 */
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

/**
 * 解包后端 ApiResponse<T> 响应。
 * 后端将所有响应包装为 { success, message, data }，此函数提取 data 字段。
 */
export const unwrap = <T>(response: { data: { success: boolean; message: string; data: T } }): T => {
  if (!response.data.success) {
    throw new Error(response.data.message || '请求失败')
  }
  return response.data.data
}

/**
 * 清除查询参数中的 null、undefined 和空字符串值。
 * 避免向后端发送无意义的空参数。
 */
export const cleanParams = (params: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
