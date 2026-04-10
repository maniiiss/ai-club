import { http } from '@/api/http'

const ABSOLUTE_URL_PATTERN = /^(https?:)?\/\//i

/**
 * 将后端返回的资源地址统一解析为可直接展示的完整地址，兼容相对路径和绝对路径两种格式。
 */
export const resolveAssetUrl = (rawUrl?: string | null) => {
  if (!rawUrl) {
    return ''
  }
  if (ABSOLUTE_URL_PATTERN.test(rawUrl) || rawUrl.startsWith('data:')) {
    return rawUrl
  }

  const baseUrl = typeof http.defaults.baseURL === 'string' && http.defaults.baseURL
    ? http.defaults.baseURL
    : window.location.origin

  try {
    return new URL(rawUrl, baseUrl).toString()
  } catch {
    return rawUrl
  }
}
