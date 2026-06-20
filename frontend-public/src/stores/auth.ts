/**
 * 认证状态管理。
 * 使用 Zustand 替代 Vue 端的 Pinia，提供 token/user 管理、登录态恢复和权限检查。
 */
import { create } from 'zustand'
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/src/api/http'
import {
  loginApi,
  registerApi,
  getCurrentUser,
  logoutApi,
  updateProfileApi,
} from '@/src/api/auth'
import type { CurrentUserInfo, RegisterPayload, UpdateProfilePayload } from '@/src/types/auth'

/** 从 localStorage 读取缓存的用户信息，解析失败时返回 null。 */
const readCachedUser = (): CurrentUserInfo | null => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (raw) return JSON.parse(raw) as CurrentUserInfo
  } catch {
    localStorage.removeItem(AUTH_USER_KEY)
  }
  return null
}

interface AuthState {
  /** 当前认证 token。 */
  token: string
  /** 当前登录用户信息。 */
  user: CurrentUserInfo | null
  /** 是否已成功加载过 profile。 */
  profileLoaded: boolean
  /** 登录请求是否正在进行。 */
  loading: boolean
  /** 登录/注册过程中的错误消息。 */
  error: string | null
}

interface AuthActions {
  /** 是否已登录。 */
  isLoggedIn: () => boolean
  /** 登录。 */
  login: (username: string, password: string) => Promise<void>
  /** 注册。 */
  register: (payload: RegisterPayload) => Promise<void>
  /** 拉取当前用户 profile。 */
  fetchProfile: () => Promise<CurrentUserInfo | null>
  /**
   * 恢复登录态：如果 token 存在但 profile 尚未加载，自动拉取。
   * 用于路由守卫中判断是否需要重新获取用户信息。
   */
  restoreSession: () => Promise<CurrentUserInfo | null>
  /** 退出登录。 */
  logout: () => Promise<void>
  /** 更新个人资料。 */
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>
  /** 检查用户是否拥有指定权限码。传入空值时返回 true。 */
  hasPermission: (permission?: string | string[]) => boolean
  /** 清除错误状态。 */
  clearError: () => void
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // --- State ---
  token: localStorage.getItem(AUTH_TOKEN_KEY) || '',
  user: readCachedUser(),
  profileLoaded: false,
  loading: false,
  error: null,

  // --- Actions ---

  isLoggedIn: () => Boolean(get().token),

  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const result = await loginApi({ username, password })
      // 持久化 token 和 user 到 localStorage。
      localStorage.setItem(AUTH_TOKEN_KEY, result.token)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user))
      set({
        token: result.token,
        user: result.user,
        profileLoaded: true,
        loading: false,
        error: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败'
      set({ loading: false, error: message })
      throw err
    }
  },

  register: async (payload: RegisterPayload) => {
    set({ loading: true, error: null })
    try {
      await registerApi(payload)
      set({ loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : '注册失败'
      set({ loading: false, error: message })
      throw err
    }
  },

  fetchProfile: async () => {
    try {
      const user = await getCurrentUser()
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
      set({ user, profileLoaded: true })
      return user
    } catch {
      // 拉取失败时清除登录态。
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
      set({ token: '', user: null, profileLoaded: false })
      return null
    }
  },

  restoreSession: async () => {
    const { token, profileLoaded } = get()
    if (!token) return null
    if (profileLoaded) return get().user
    return get().fetchProfile()
  },

  logout: async () => {
    try {
      await logoutApi()
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
      set({ token: '', user: null, profileLoaded: false })
    }
  },

  updateProfile: async (payload: UpdateProfilePayload) => {
    const user = await updateProfileApi(payload)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    set({ user })
  },

  hasPermission: (permission?: string | string[]) => {
    if (!permission) return true
    const codes = get().user?.permissionCodes || []
    if (Array.isArray(permission)) {
      return permission.some((p) => codes.includes(p))
    }
    return codes.includes(permission)
  },

  clearError: () => set({ error: null }),
}))
