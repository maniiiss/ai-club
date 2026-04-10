import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { applyThemePreset, readStoredThemeId, resolveThemePreset, THEME_PRESETS, THEME_STORAGE_KEY } from '@/constants/theme'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'git-ai-club:sidebar-collapsed'

function readSidebarCollapsedPreference() {
  // 读取本地侧边栏偏好，让用户刷新后仍保留上一次的工作台密度。
  if (typeof window === 'undefined') {
    return false
  }
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
}

export const useAppStore = defineStore('app', () => {
  const systemName = ref('AI代理工程管理平台')
  const currentProject = ref('Agent Ops')
  const sidebarCollapsed = ref(readSidebarCollapsedPreference())
  const currentThemeId = ref(readStoredThemeId())
  const currentTheme = computed(() => resolveThemePreset(currentThemeId.value))

  const setSidebarCollapsed = (collapsed: boolean) => {
    sidebarCollapsed.value = collapsed
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
    }
  }

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(!sidebarCollapsed.value)
  }

  const initializeAppearance = () => {
    // 启动时恢复浏览器缓存中的界面风格，避免用户每次刷新后都要重新选择。
    currentThemeId.value = readStoredThemeId()
    applyThemePreset(currentThemeId.value)
  }

  const setTheme = (themeId: string) => {
    // 切换风格时统一做三件事：纠正非法主题、写入根节点样式、同步到本地缓存。
    const preset = applyThemePreset(themeId)
    currentThemeId.value = preset.id
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, preset.id)
    }
  }

  return {
    systemName,
    currentProject,
    sidebarCollapsed,
    currentThemeId,
    currentTheme,
    themePresets: THEME_PRESETS,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    initializeAppearance,
    setTheme
  }
})
