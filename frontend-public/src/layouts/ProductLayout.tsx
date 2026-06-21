/**
 * 产品全局布局。
 * 顶部导航固定 + 内容区填满视口，各页面自行管理滚动。
 */
import { Outlet } from 'react-router-dom'
import { TopNav } from '@/src/components/navigation/TopNav'
import { ProtectedRoute } from '@/src/components/common/ProtectedRoute'

export const ProductLayout = () => {
  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-hidden bg-[var(--color-bg-page)]">
          <div className="h-full px-4 pt-4 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
            <Outlet />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
