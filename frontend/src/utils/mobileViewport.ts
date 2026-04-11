import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 统一管理页面级移动端断点，避免每个列表页都重复编写一套 resize 监听逻辑。
 */
export function useMobileViewport(breakpoint = 900) {
  const isMobileViewport = ref(false)

  /**
   * 只按当前浏览器视口宽度判断是否切到移动卡片模板，不引入额外设备识别分支。
   */
  const syncMobileViewport = () => {
    if (typeof window === 'undefined') {
      return
    }
    isMobileViewport.value = window.innerWidth <= breakpoint
  }

  onMounted(() => {
    syncMobileViewport()
    window.addEventListener('resize', syncMobileViewport)
  })

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.removeEventListener('resize', syncMobileViewport)
  })

  return {
    isMobileViewport
  }
}
