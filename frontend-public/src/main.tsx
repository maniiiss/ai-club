/**
 * 应用入口。
 * 挂载 React 19 根节点，导入全局样式，初始化主题。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from '@/src/lib/theme'
import { consumeSsoTokenFromFragment } from '@/src/lib/sso'
import App from './App'
import './index.css'

// 在 React 渲染前初始化主题色，避免闪烁。
initTheme()
consumeSsoTokenFromFragment()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
