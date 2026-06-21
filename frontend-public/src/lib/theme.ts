/**
 * 主题色管理。
 * 提供预设主题色定义、切换、持久化。
 */

export interface ThemePreset {
  key: string
  label: string
  /** 主题色 hex 值，用于色块预览。 */
  swatch: string
  /** 浅色背景值。 */
  light: string
}

/** 预置主题色列表。 */
export const THEME_PRESETS: ThemePreset[] = [
  { key: 'indigo', label: '靛蓝', swatch: '#4f46e5', light: '#eef2ff' },
  { key: 'blue', label: '蓝色', swatch: '#2563eb', light: '#eff6ff' },
  { key: 'teal', label: '青色', swatch: '#0d9488', light: '#f0fdfa' },
  { key: 'emerald', label: '翠绿', swatch: '#059669', light: '#ecfdf5' },
  { key: 'orange', label: '橙色', swatch: '#ea580c', light: '#fff7ed' },
  { key: 'rose', label: '玫红', swatch: '#e11d48', light: '#fff1f2' },
  { key: 'violet', label: '紫罗兰', swatch: '#7c3aed', light: '#f5f3ff' },
  { key: 'slate', label: '石墨', swatch: '#475569', light: '#f8fafc' },
]

const THEME_STORAGE_KEY = 'ai-club-theme'
const DEFAULT_THEME = 'indigo'

/** 获取当前主题 key。 */
export const getCurrentTheme = (): string => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** 应用主题到 document root。 */
export const applyTheme = (themeKey: string) => {
  document.documentElement.setAttribute('data-theme', themeKey)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeKey)
  } catch {
    // localStorage 不可用时忽略
  }
}

/** 初始化主题（应用启动时调用）。 */
export const initTheme = () => {
  applyTheme(getCurrentTheme())
}
