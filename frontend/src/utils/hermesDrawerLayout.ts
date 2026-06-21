export interface HermesDrawerPresentationOptions {
  isMobileViewport: boolean
  desktopFullscreen: boolean
}

export interface HermesDrawerPresentation {
  size: string
  classNames: string[]
  panelColumns: string
}

/**
 * 统一收口 Hermes 抽屉在移动端、桌面普通态和桌面全屏态下的尺寸与样式类，
 * 避免模板里散落多段条件判断后难以维护。
 */
export const resolveHermesDrawerPresentation = (
  options: HermesDrawerPresentationOptions
): HermesDrawerPresentation => {
  if (options.isMobileViewport) {
    return {
      size: '100%',
      classNames: ['hermes-drawer', 'is-mobile'],
      panelColumns: '164px minmax(0, 1fr)'
    }
  }

  if (options.desktopFullscreen) {
    return {
      size: '100%',
      classNames: ['hermes-drawer', 'is-desktop-fullscreen'],
      panelColumns: '220px minmax(0, 1fr)'
    }
  }

  return {
    size: '880px',
    classNames: ['hermes-drawer'],
    panelColumns: '164px minmax(0, 1fr)'
  }
}
