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
  updateThemeApi,
} from '@/src/api/auth'
import type { CurrentUserInfo, RegisterPayload, UpdateProfilePayload } from '@/src/types/auth'
import { applyLoginTheme, applyTheme, applyUserTheme, getLoginThemePreference, getStoredLoginTheme } from '@/src/lib/theme'

/** 应用账号主题，并同步为下次回到登录页时使用的主题偏好。 */
const applyAccountTheme = (user: CurrentUserInfo) => {
  applyUserTheme(user)
  applyLoginTheme(user.themeId)
}

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
  /** 更新账号主题并同步服务端。 */
  updateTheme: (themeId: string) => Promise<void>
  /** 检查用户是否拥有指定权限码。传入空值时返回 true。 */
  hasPermission: (permission?: string | string[]) => boolean
  /** 清除错误状态。 */
  clearError: () => void
  /** 更新引导完成状态缓存。 */
  updateGuideCompleted: (keys: string[]) => void
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
      let user = result.user
      let accountThemeSynced = true
      const loginTheme = getLoginThemePreference()

      // 登录页已明确选择主题时，登录成功后将该选择写回账号，保证平台内外立即一致。
      if (loginTheme && loginTheme !== result.user.themeId) {
        try {
          user = await updateThemeApi({ themeId: loginTheme })
        } catch {
          // 主题同步失败不阻断登录，但保留登录页视觉偏好，等待用户下次进入设置时重试。
          accountThemeSynced = false
        }
      }

      // 持久化 token 和 user 到 localStorage。
      localStorage.setItem(AUTH_TOKEN_KEY, result.token)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
      set({
        token: result.token,
        user,
        profileLoaded: true,
        loading: false,
        error: null,
      })
      if (accountThemeSynced) {
        applyAccountTheme(user)
      } else {
        applyTheme(loginTheme || user.themeId)
      }
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
      applyAccountTheme(user)
      return user
    } catch {
      // 拉取失败时清除登录态。
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
      set({ token: '', user: null, profileLoaded: false })
      // 会话失效后回到登录页，保留用户在登录页选择的未登录主题偏好。
      applyLoginTheme(getStoredLoginTheme())
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
      // 退出登录不清除登录页主题偏好，避免返回登录页时恢复成初始化主题。
      applyLoginTheme(getStoredLoginTheme())
    }
  },

  updateProfile: async (payload: UpdateProfilePayload) => {
    const user = await updateProfileApi(payload)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    set({ user })
    applyAccountTheme(user)
  },

  updateTheme: async (themeId: string) => {
    const user = await updateThemeApi({ themeId })
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    set({ user })
    applyAccountTheme(user)
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

  updateGuideCompleted: (keys: string[]) => {
    const { user } = get()
    if (user) {
      const updated = { ...user, guideCompleted: keys }
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated))
      set({ user: updated })
    }
  },
}))
