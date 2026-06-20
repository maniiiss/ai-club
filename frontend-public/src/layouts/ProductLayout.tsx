/**
 * 产品全局布局。
 * 左侧边栏 + 顶栏 + 主内容区。
 * 包含 ProtectedRoute 逻辑：未登录时重定向到 /login。
 */
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/src/components/navigation/Sidebar'
import { TopBar } from '@/src/components/navigation/TopBar'
import { ProtectedRoute } from '@/src/components/common/ProtectedRoute'

export const ProductLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar onMobileMenuOpen={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto bg-[var(--color-bg-page)] p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
