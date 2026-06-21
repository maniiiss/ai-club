/**
 * 顶层 Provider 组合。
 * 当前只包含 RouterProvider，后续可加入 ErrorBoundary、Toast 等。
 */
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

export const Providers = () => {
  return <RouterProvider router={router} />
}
