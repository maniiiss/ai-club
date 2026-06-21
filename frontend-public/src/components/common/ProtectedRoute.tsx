/**
 * 认证路由守卫组件。
 * 在渲染子路由前检查登录态，未登录时重定向到 /login 并携带 redirect 参数。
 * 同时负责恢复 session（首次进入时拉取 /api/auth/me）。
 */
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/src/stores/auth'
import { LoadingSpinner } from './LoadingSpinner'

interface ProtectedRouteProps {
  children: ReactNode
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const location = useLocation()
  const token = useAuthStore((s) => s.token)
  const restoreSession = useAuthStore((s) => s.restoreSession)
  const [checked, setChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      if (!token) {
        if (!cancelled) {
          setAuthenticated(false)
          setChecked(true)
        }
        return
      }
      const user = await restoreSession()
      if (!cancelled) {
        setAuthenticated(Boolean(user))
        setChecked(true)
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [token, restoreSession])

  if (!checked) {
    return <LoadingSpinner fullscreen text="正在验证登录状态…" />
  }

  if (!authenticated) {
    // 携带当前路径作为 redirect 参数，登录后跳回。
    const redirect = location.pathname !== '/' ? location.pathname : undefined
    return <Navigate to="/login" state={{ redirect }} replace />
  }

  return <>{children}</>
}
