/**
 * 顶层 Provider 组合。
 * 挂载路由与全局 Toast 提示层。
 */
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ToastContainer } from '@/src/components/common/ToastContainer'

export const Providers = () => {
  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer />
    </>
  )
}
