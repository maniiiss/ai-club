import type { AssistantReferenceItem } from '@/src/types/assistant'

const ROUTE_BASE_URL = 'http://gitpilot.local'

/**
 * 将 Assistant 历史引用路由转换为公众端当前路由。
 * 业务意图：引用数据可能来自旧版本会话，升级后仍应能打开现有公众端页面。
 */
const normalizeAssistantReferencePath = (pathname: string): string => {
  const legacyIterationsMatch = pathname.match(/^\/projects\/(\d+)\/iterations$/)
  return legacyIterationsMatch ? `/projects/${legacyIterationsMatch[1]}/planning` : pathname
}

/**
 * 只允许打开当前公众端的相对路径，避免 Assistant 返回的异常 URL 跳转到外部站点或脚本地址。
 */
export const normalizeAssistantReferenceRoute = (route: string | null | undefined): string | null => {
  const value = String(route || '').trim()
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null

  try {
    const parsed = new URL(value, ROUTE_BASE_URL)
    if (parsed.origin !== ROUTE_BASE_URL || parsed.protocol !== 'http:') return null
    parsed.pathname = normalizeAssistantReferencePath(parsed.pathname)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

/** 获取引用对象可安全打开的新标签页地址。 */
export const resolveAssistantReferenceHref = (reference: Pick<AssistantReferenceItem, 'route'>): string | null =>
  normalizeAssistantReferenceRoute(reference.route)
