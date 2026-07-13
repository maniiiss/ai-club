export interface ThemePreset {
  /** 风格唯一标识，必须与公众端和后端账号主题契约保持一致。 */
  id: string
  /** 风格名称，显示在个人中心的主题卡片上。 */
  name: string
  /** 风格说明，帮助用户理解当前主题的视觉方向。 */
  description: string
  /** 风格主色，用于预览卡片与品牌强调色。 */
  primary: string
  /** 风格辅色，用于预览卡片中的第二视觉点。 */
  accent: string
  /** 风格中性面板色，用于展示背景层次。 */
  surface: string
  /** 风格预览背景，用于个人中心的小型样机展示。 */
  previewBackground: string
  /** 写入根节点的 CSS 变量集合，用于全局主题切换。 */
  variables: Record<string, string>
}

export const THEME_STORAGE_KEY = 'gitpilot-theme'
export const DEFAULT_THEME_ID = 'deep-sea'

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'deep-sea',
    name: '深海蓝',
    description: '深海藏蓝、雾银灰与电光蓝的 GitPilot 默认风格。',
    primary: '#2F6BFF',
    accent: '#55D6C2',
    surface: '#DCE5EC',
    previewBackground: 'linear-gradient(135deg, rgba(47, 107, 255, 0.18) 0%, rgba(220, 229, 236, 0.94) 52%, rgba(85, 214, 194, 0.16) 100%)',
    variables: {
      '--app-page-accent-a': 'rgba(47, 107, 255, 0.08)',
      '--app-page-accent-b': 'rgba(85, 214, 194, 0.07)',
      '--app-page-gradient-start': '#F7FAFC',
      '--app-page-gradient-end': '#DCE5EC',
      '--app-surface-base': '#F7FAFC',
      '--app-surface-low': '#EEF4F7',
      '--app-surface-high': '#E4EDF2',
      '--app-surface-card': '#FFFFFF',
      '--app-surface-muted': '#DCE5EC',
      '--app-text': '#122333',
      '--app-text-soft': '#506579',
      '--app-text-muted': '#7A8D9D',
      '--app-primary-rgb': '47, 107, 255',
      '--app-primary-container-rgb': '85, 214, 194',
      '--app-secondary-rgb': '23, 50, 76',
      '--app-tertiary-rgb': '255, 135, 95',
      '--app-outline-rgb': '109, 132, 148',
      '--app-primary': '#2F6BFF',
      '--app-primary-container': '#55D6C2',
      '--app-primary-fixed': '#DCE7FF',
      '--app-primary-fixed-dim': '#9FB7FF',
      '--app-primary-light-3': '#5F8AFF',
      '--app-primary-light-5': '#86A6FF',
      '--app-primary-light-7': '#B5C7FF',
      '--app-primary-light-8': '#D2DDFF',
      '--app-primary-light-9': '#E8EFFF',
      '--app-primary-dark-2': '#2158DF',
      '--app-primary-hover-start': '#5F8AFF',
      '--app-primary-hover-end': '#2158DF',
      '--app-secondary': '#17324C',
      '--app-tertiary': '#FF875F'
    }
  },
  {
    id: 'ocean-mist',
    name: '海雾蓝',
    description: '更明亮的海雾蓝，适合长时间浏览和协作。',
    primary: '#1677C8',
    accent: '#53B7FF',
    surface: '#EDF5FB',
    previewBackground: 'linear-gradient(135deg, rgba(22, 119, 200, 0.18) 0%, rgba(237, 245, 251, 0.96) 52%, rgba(83, 183, 255, 0.18) 100%)',
    variables: {
      '--app-page-accent-a': 'rgba(22, 119, 200, 0.09)',
      '--app-page-accent-b': 'rgba(83, 183, 255, 0.08)',
      '--app-page-gradient-start': '#FBFDFF',
      '--app-page-gradient-end': '#EDF5FB',
      '--app-surface-base': '#FBFDFF',
      '--app-surface-low': '#F4F9FC',
      '--app-surface-high': '#E5F0F7',
      '--app-surface-card': '#FFFFFF',
      '--app-surface-muted': '#EDF5FB',
      '--app-text': '#10283A',
      '--app-text-soft': '#557084',
      '--app-text-muted': '#7C9AAF',
      '--app-primary-rgb': '22, 119, 200',
      '--app-primary-container-rgb': '83, 183, 255',
      '--app-secondary-rgb': '11, 56, 86',
      '--app-tertiary-rgb': '255, 154, 112',
      '--app-outline-rgb': '98, 137, 160',
      '--app-primary': '#1677C8',
      '--app-primary-container': '#53B7FF',
      '--app-primary-fixed': '#D9EDF9',
      '--app-primary-fixed-dim': '#9BD7FF',
      '--app-primary-light-3': '#4B99D7',
      '--app-primary-light-5': '#75B3E2',
      '--app-primary-light-7': '#A6CDEB',
      '--app-primary-light-8': '#C5DFEF',
      '--app-primary-light-9': '#E4F1F9',
      '--app-primary-dark-2': '#0F5D91',
      '--app-primary-hover-start': '#53B7FF',
      '--app-primary-hover-end': '#0F5D91',
      '--app-secondary': '#0B3856',
      '--app-tertiary': '#FF9A70'
    }
  },
  {
    id: 'signal-teal',
    name: '信号青',
    description: '青绿色智能信号与蓝色工程控制感。',
    primary: '#0A8F86',
    accent: '#2F6BFF',
    surface: '#EEF9F7',
    previewBackground: 'linear-gradient(135deg, rgba(10, 143, 134, 0.18) 0%, rgba(238, 249, 247, 0.96) 52%, rgba(47, 107, 255, 0.14) 100%)',
    variables: {
      '--app-page-accent-a': 'rgba(10, 143, 134, 0.09)',
      '--app-page-accent-b': 'rgba(47, 107, 255, 0.07)',
      '--app-page-gradient-start': '#FBFFFE',
      '--app-page-gradient-end': '#EEF9F7',
      '--app-surface-base': '#FBFFFE',
      '--app-surface-low': '#F3FBFA',
      '--app-surface-high': '#E4F2F0',
      '--app-surface-card': '#FFFFFF',
      '--app-surface-muted': '#EEF9F7',
      '--app-text': '#102D31',
      '--app-text-soft': '#557579',
      '--app-text-muted': '#789394',
      '--app-primary-rgb': '10, 143, 134',
      '--app-primary-container-rgb': '47, 107, 255',
      '--app-secondary-rgb': '6, 78, 73',
      '--app-tertiary-rgb': '255, 155, 114',
      '--app-outline-rgb': '89, 135, 130',
      '--app-primary': '#0A8F86',
      '--app-primary-container': '#2F6BFF',
      '--app-primary-fixed': '#C9EFEB',
      '--app-primary-fixed-dim': '#8DD8D0',
      '--app-primary-light-3': '#35B9AD',
      '--app-primary-light-5': '#62C8BF',
      '--app-primary-light-7': '#9ADDD7',
      '--app-primary-light-8': '#BCEAE5',
      '--app-primary-light-9': '#E2F6F3',
      '--app-primary-dark-2': '#06766F',
      '--app-primary-hover-start': '#35B9AD',
      '--app-primary-hover-end': '#06766F',
      '--app-secondary': '#064E49',
      '--app-tertiary': '#FF9B72'
    }
  }
]

export function resolveThemePreset(themeId?: string | null) {
  return THEME_PRESETS.find((item) => item.id === themeId) || THEME_PRESETS[0]
}

export function readStoredThemeId() {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_ID
  }
  return resolveThemePreset(window.localStorage.getItem(THEME_STORAGE_KEY)).id
}

export function applyThemePreset(themeId?: string | null) {
  if (typeof document === 'undefined') {
    return resolveThemePreset(themeId)
  }

  // 将主题变量逐项写入根节点，保证管理端所有页面即时响应账号主题。
  const preset = resolveThemePreset(themeId)
  const root = document.documentElement
  root.dataset.theme = preset.id
  Object.entries(preset.variables).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })
  return preset
}
