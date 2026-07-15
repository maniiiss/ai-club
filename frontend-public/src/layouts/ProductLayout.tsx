/**
 * 产品全局布局。
 * 顶部导航固定 + 内容区填满视口，各页面自行管理滚动。
 */
import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { TopNav } from '@/src/components/navigation/TopNav'
import { ProtectedRoute } from '@/src/components/common/ProtectedRoute'
import { NotificationToast } from '@/src/components/notifications/NotificationToast'
import { useNotificationStore } from '@/src/stores/notifications'
import { acknowledgePlatformRelease, getPendingPlatformRelease } from '@/src/api/platformReleases'
import { PlatformReleaseDialog } from '@/src/components/platformRelease/PlatformReleaseDialog'
import type { PlatformRelease } from '@/src/types/platformRelease'

export const ProductLayout = () => {
  const [pendingRelease, setPendingRelease] = useState<PlatformRelease | null>(null)
  const bootstrapNotifications = useNotificationStore((state) => state.bootstrap)
  const connectNotifications = useNotificationStore((state) => state.connect)
  const disconnectNotifications = useNotificationStore((state) => state.disconnect)

  useEffect(() => {
    let disposed = false
    void bootstrapNotifications().finally(() => {
      if (!disposed) connectNotifications()
    })
    return () => {
      disposed = true
      disconnectNotifications()
    }
  }, [bootstrapNotifications, connectNotifications, disconnectNotifications])

  useEffect(() => {
    let disposed = false
    void getPendingPlatformRelease()
      .then((release) => {
        if (!disposed) setPendingRelease(release)
      })
      .catch(() => {
        // 版本提示加载失败不应阻断公众端主页面，下一次进入布局时会再次尝试。
      })
    return () => {
      disposed = true
    }
  }, [])

  const handleReleaseClose = useCallback(() => {
    const release = pendingRelease
    if (!release) return
    // 关闭也代表用户已经看到内容，先关闭界面避免网络请求延迟阻塞用户操作。
    setPendingRelease(null)
    void acknowledgePlatformRelease(release.id).catch(() => {
      // 记录失败时不阻断页面；服务端未落库则下一次进入仍会提示。
    })
  }, [pendingRelease])

  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-hidden bg-[var(--color-bg-page)]">
          <div className="h-full px-4 pt-4 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
            <Outlet />
          </div>
        </main>
        <NotificationToast />
        {pendingRelease && <PlatformReleaseDialog release={pendingRelease} onClose={handleReleaseClose} />}
      </div>
    </ProtectedRoute>
  )
}
