import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/src/api/http'

const SSO_TOKEN_FRAGMENT_KEY = 'ssoToken'

/**
 * 管理端通过 URL fragment 传递一次当前登录 token；公众端在应用挂载前消费它，
 * 避免路由守卫先跳登录页，同时立即清理地址栏中的敏感信息。
 */
export function consumeSsoTokenFromFragment() {
  if (typeof window === 'undefined') {
    return
  }
  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  if (!rawHash) {
    return
  }
  const params = new URLSearchParams(rawHash)
  const token = params.get(SSO_TOKEN_FRAGMENT_KEY)?.trim()
  if (!token) {
    return
  }

  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.removeItem(AUTH_USER_KEY)
  params.delete(SSO_TOKEN_FRAGMENT_KEY)

  const nextHash = params.toString()
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`
  window.history.replaceState(window.history.state, document.title, nextUrl)
}
