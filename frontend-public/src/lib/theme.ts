/**
 * 主题色管理。
 * 提供 GitPilot 统一主题定义、切换和本地启动缓存。
 */
import type { CurrentUserInfo } from '@/src/types/auth'

export interface ThemePreset {
  key: string
  label: string
  description: string
  /** 主题主色，用于色块预览和交互强调。 */
  swatch: string
  /** 主题浅色背景值。 */
  light: string
  accent: string
}

/** 预置主题色列表。 */
export const THEME_PRESETS: ThemePreset[] = [
  { key: 'deep-sea', label: '深海蓝', description: '深海藏蓝、雾银灰与电光蓝的 GitPilot 默认风格。', swatch: '#2f6bff', light: '#dce5ec', accent: '#55d6c2' },
  { key: 'ocean-mist', label: '海雾蓝', description: '更明亮的海雾蓝，适合长时间浏览和协作。', swatch: '#1677c8', light: '#edf5fb', accent: '#53b7ff' },
  { key: 'signal-teal', label: '信号青', description: '青绿色智能信号与蓝色工程控制感。', swatch: '#0a8f86', light: '#eef9f7', accent: '#2f6bff' },
  { key: 'paper-white', label: '纯白', description: '纯白工作台与冷灰边界，适合简洁高效的日常协作。', swatch: '#2f6bff', light: '#ffffff', accent: '#55d6c2' },
  { key: 'carbon-black', label: '曜石黑', description: '深色工作台与电光蓝信号，适合专注开发和夜间使用。', swatch: '#5f8aff', light: '#111821', accent: '#55d6c2' },
]

export const THEME_STORAGE_KEY = 'gitpilot-theme'
/** 未登录状态下由登录页选择的主题偏好，不会被账号主题同步覆盖。 */
export const LOGIN_THEME_STORAGE_KEY = 'gitpilot-login-theme'
export const DEFAULT_THEME = 'deep-sea'

export const isThemeKey = (themeKey: string): boolean => THEME_PRESETS.some((theme) => theme.key === themeKey)

export const resolveThemeKey = (themeKey?: string | null): string => (
  themeKey && isThemeKey(themeKey) ? themeKey : DEFAULT_THEME
)

/** 获取当前主题 key。 */
export const getCurrentTheme = (): string => {
  try {
    return resolveThemeKey(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

/** 获取登录页主题偏好；旧版本没有该缓存时回退到当前主题缓存。 */
export const getStoredLoginTheme = (): string => {
  try {
    return resolveThemeKey(localStorage.getItem(LOGIN_THEME_STORAGE_KEY) || localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

/** 读取用户是否明确在登录页选择过主题，用于登录时决定是否同步到账号。 */
export const getLoginThemePreference = (): string | null => {
  try {
    const stored = localStorage.getItem(LOGIN_THEME_STORAGE_KEY)
    return stored && isThemeKey(stored) ? stored : null
  } catch {
    return null
  }
}

/** 应用主题到 document root。 */
export const applyTheme = (themeKey?: string | null): string => {
  const resolvedTheme = resolveThemeKey(themeKey)
  document.documentElement.setAttribute('data-theme', resolvedTheme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme)
  } catch {
    // localStorage 不可用时忽略
  }
  return resolvedTheme
}

/** 应用并持久化未登录用户在登录页选择的主题。 */
export const applyLoginTheme = (themeKey?: string | null): string => {
  const resolvedTheme = applyTheme(themeKey)
  try {
    localStorage.setItem(LOGIN_THEME_STORAGE_KEY, resolvedTheme)
  } catch {
    // localStorage 不可用时忽略
  }
  return resolvedTheme
}

/** 初始化主题（应用启动时调用）。 */
export const initTheme = () => {
  const hasToken = typeof localStorage !== 'undefined' && localStorage.getItem('ai-club-auth-token')
  applyTheme(hasToken ? getCurrentTheme() : getStoredLoginTheme())
}

/** 将服务端用户快照中的主题应用到当前浏览器。 */
export const applyUserTheme = (user: Pick<CurrentUserInfo, 'themeId'>): string => applyTheme(user.themeId)
