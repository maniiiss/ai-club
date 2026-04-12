import axios from 'axios'
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/constants/auth'

/**
 * 解析前端请求的接口基础地址。
 * 优先使用显式配置的完整地址；未配置时，根据当前页面主机名与后端端口拼出真实后端地址，
 * 避免把接口请求误打到前端自身端口。
 */
const resolveApiBaseUrl = () => {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredApiBaseUrl !== undefined && configuredApiBaseUrl.trim() !== '') {
    return configuredApiBaseUrl
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const backendPort = import.meta.env.VITE_API_PORT?.trim() || '8080'
    return `${protocol}//${window.location.hostname}:${backendPort}`
  }
  return 'http://localhost:8080'
}

export const resolvedApiBaseUrl = resolveApiBaseUrl()
export const getResolvedApiBaseUrl = () => resolvedApiBaseUrl

export const http = axios.create({
  baseURL: resolvedApiBaseUrl,
  timeout: 60000
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

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
  }
)
