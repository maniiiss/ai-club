/**
 * 新手引导 Hook。
 * 封装 Driver.js 实例管理，提供引导启动、完成回调和状态同步。
 */
import { useCallback, useRef } from 'react'
import { driver } from 'driver.js'
import type { Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './guide.css'
import { getGuideSteps } from './guideSteps'
import type { GuidePageKey } from './guideSteps'
import { updateGuideStatus } from '@/src/api/guide'
import { useAuthStore } from '@/src/stores/auth'

/** 自动关闭倒计时秒数。 */
const COUNTDOWN_SECONDS = 10

interface UseGuideResult {
  /** 当前页面是否已完成引导。 */
  isCompleted: boolean
  /** 启动当前页面的引导。 */
  startGuide: () => void
  /** 重置所有引导状态，跳回 Dashboard 重新体验。 */
  resetAllGuides: () => Promise<void>
}

export function useGuide(pageKey: GuidePageKey): UseGuideResult {
  const user = useAuthStore((s) => s.user)
  const updateGuideCompleted = useAuthStore((s) => s.updateGuideCompleted)
  const driverRef = useRef<Driver | null>(null)

  const isCompleted = user?.guideCompleted?.includes(pageKey) ?? false

  /**
   * 标记某个页面引导已完成。
   * 从 store.getState() 读取最新的 guideCompleted，避免闭包陈旧值覆盖其他页面的完成状态。
   */
  const markCompleted = useCallback(
    async (key: GuidePageKey) => {
      const currentKeys = useAuthStore.getState().user?.guideCompleted ?? []
      if (currentKeys.includes(key)) return
      const newKeys = [...currentKeys, key]
      try {
        const updatedUser = await updateGuideStatus(newKeys)
        updateGuideCompleted(updatedUser.guideCompleted)
      } catch {
        // 静默失败：下次进入页面时重试
      }
    },
    [updateGuideCompleted],
  )

  const startGuide = useCallback(() => {
    const steps = getGuideSteps(pageKey)
    if (steps.length === 0) {
      // 目标元素尚未渲染（数据还在加载或页面为空），不标记完成，等下次进入再试
      return
    }

    // 倒计时状态
    let remaining = COUNTDOWN_SECONDS
    let countdownInterval: ReturnType<typeof setInterval> | null = null

    const driverObj = driver({
      showProgress: true,
      allowClose: false,
      overlayOpacity: 0.5,
      popoverClass: 'custom-guide-popover',
      nextBtnText: '下一步 →',
      prevBtnText: '← 上一步',
      doneBtnText: '完成 ✓',
      progressText: '{{current}} / {{total}}',
      steps,
      onPopoverRender: (popoverDom) => {
        const popover = popoverDom.wrapper

        // 移除上一步渲染时残留的自定义区域，避免重复追加
        popover.querySelector('.guide-custom-footer')?.remove()

        // 创建自定义底部区域：倒计时 + 跳过按钮
        const footer = document.createElement('div')
        footer.className = 'guide-custom-footer'

        const countdownEl = document.createElement('span')
        countdownEl.className = 'guide-countdown'
        countdownEl.textContent = `${remaining}秒后自动关闭`

        const skipBtn = document.createElement('button')
        skipBtn.className = 'guide-skip-btn'
        skipBtn.textContent = '跳过引导'
        skipBtn.onclick = () => driverObj.destroy()

        footer.appendChild(countdownEl)
        footer.appendChild(skipBtn)
        popover.appendChild(footer)

        // 首次渲染时启动倒计时（只在第一步且尚未启动时）
        if (!countdownInterval) {
          countdownInterval = setInterval(() => {
            remaining--
            if (remaining <= 0) {
              if (countdownInterval) clearInterval(countdownInterval)
              countdownInterval = null
              driverObj.destroy()
              return
            }
            // 更新当前 popover 中的倒计时文本
            const el = popover.querySelector('.guide-countdown')
            if (el) el.textContent = `${remaining}秒后自动关闭`
          }, 1000)
        }
      },
      onDestroyStarted: () => {
        if (countdownInterval) {
          clearInterval(countdownInterval)
          countdownInterval = null
        }
        markCompleted(pageKey)
        driverObj.destroy()
      },
    })

    driverRef.current = driverObj
    driverObj.drive()
  }, [pageKey, markCompleted])

  const resetAllGuides = useCallback(async () => {
    try {
      const updatedUser = await updateGuideStatus([])
      updateGuideCompleted(updatedUser.guideCompleted)
    } catch {
      // 静默失败
    }
  }, [updateGuideCompleted])

  return { isCompleted, startGuide, resetAllGuides }
}
