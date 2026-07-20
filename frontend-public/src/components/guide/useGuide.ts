/**
 * 新手引导 Hook。
 * 封装 Driver.js 实例管理，提供引导启动、完成回调和状态同步。
 */
import { useCallback, useEffect, useRef } from 'react'
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

  // 页面卸载时销毁 driver 实例：
  // 引导弹窗挂在 document.body 上，若引导进行中切换路由，遮罩会泄漏到下一个页面
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [])

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
        // 后端同步失败时降级为仅本地持久化：
        // 仍然尊重用户的"跳过"操作，避免引导反复弹出，下次同步成功后以后端为准
        updateGuideCompleted(newKeys)
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
    let driverObj: Driver

    /**
     * 引导统一收尾逻辑：清理倒计时并把该页面标记为已完成。
     * 注意：driver.js 公开的 destroy() 直接走内部清理（g(false)），
     * 不会触发 onDestroyStarted 钩子，所以"跳过引导"和"倒计时自动关闭"
     * 必须在这里主动调用 markCompleted 持久化完成状态，
     * 否则用户跳过后下次进入页面仍会再次弹出。
     */
    const finishGuide = () => {
      if (countdownInterval) {
        clearInterval(countdownInterval)
        countdownInterval = null
      }
      markCompleted(pageKey)
      driverObj.destroy()
    }

    driverObj = driver({
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

        // 先取出步骤进度元素（如 "1/4"）：上一步渲染时它已被挪进自定义底栏，
        // 必须在移除旧底栏之前持有引用，否则会被连带移除导致进度丢失
        const progressEl = popover.querySelector('.driver-popover-progress-text')

        // 移除上一步渲染时残留的自定义区域，避免重复追加
        popover.querySelector('.guide-custom-footer')?.remove()

        // 创建自定义底部区域：倒计时 + 步骤进度 + 跳过按钮
        const footer = document.createElement('div')
        footer.className = 'guide-custom-footer'

        const countdownEl = document.createElement('span')
        countdownEl.className = 'guide-countdown'
        countdownEl.textContent = `${remaining}秒后自动关闭`

        const skipBtn = document.createElement('button')
        skipBtn.className = 'guide-skip-btn'
        skipBtn.textContent = '跳过引导'
        // 跳过同样视为"已完成"，持久化后该页面不再自动弹出
        skipBtn.onclick = () => finishGuide()

        footer.appendChild(countdownEl)
        // 把 driver 默认位于按钮行的步骤进度挪到自定义底栏居中展示；
        // driver 内部持有同一元素引用、每步原地更新文本，移动后内容仍正常刷新
        if (progressEl) footer.appendChild(progressEl)
        footer.appendChild(skipBtn)
        popover.appendChild(footer)

        // 首次渲染时启动倒计时（只在第一步且尚未启动时）
        if (!countdownInterval) {
          countdownInterval = setInterval(() => {
            remaining--
            if (remaining <= 0) {
              // 倒计时自动关闭同样视为"已完成"，避免反复打扰用户
              finishGuide()
              return
            }
            // 更新当前 popover 中的倒计时文本
            const el = popover.querySelector('.guide-countdown')
            if (el) el.textContent = `${remaining}秒后自动关闭`
          }, 1000)
        }
      },
      onDestroyStarted: () => {
        // 点完最后一步"完成 ✓"时 driver.js 会先回调这里（g(true)），
        // 由 finishGuide 负责标记完成并执行真正的销毁（g(false)）
        finishGuide()
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
