/**
 * 产品全局布局。
 * 顶部水平导航 + 全宽内容区，无侧边栏。
 * 内容区使用 max-w-[1600px] 保持可读性的同时充分利用大屏空间。
 */
import { Outlet } from 'react-router-dom'
import { TopNav } from '@/src/components/navigation/TopNav'
import { ProtectedRoute } from '@/src/components/common/ProtectedRoute'

export const ProductLayout = () => {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <main className="flex-1 bg-[var(--color-bg-page)]">
          <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
