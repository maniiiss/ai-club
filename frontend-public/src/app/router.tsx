/**
 * 路由配置。
 * 使用 React Router v7 的 createBrowserRouter。
 */
import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AuthLayout } from '@/src/layouts/AuthLayout'
import { ProductLayout } from '@/src/layouts/ProductLayout'
import { ProjectLayout } from '@/src/layouts/ProjectLayout'

import { LoginPage } from '@/src/pages/auth/LoginPage'
import { RegisterPage } from '@/src/pages/auth/RegisterPage'
import { DashboardPage } from '@/src/pages/dashboard/DashboardPage'
import { ProjectsPage } from '@/src/pages/projects/ProjectsPage'
import { ProjectDetailPage } from '@/src/pages/projects/ProjectDetailPage'
import { ProfilePage } from '@/src/pages/settings/ProfilePage'
import { NotificationsPage } from '@/src/pages/notifications/NotificationsPage'
import { NotFoundPage } from '@/src/pages/NotFoundPage'
import { PlanningPage } from '@/src/pages/planning/PlanningPage'
import { KnowledgePage } from '@/src/pages/knowledge/KnowledgePage'
import { DevelopmentPage } from '@/src/pages/development/DevelopmentPage'
import { ExecutionPage } from '@/src/pages/execution/ExecutionPage'
import { TestPlanDetailPage } from '@/src/pages/execution/TestPlanDetailPage'
import { ExecutionTaskDetailPage } from '@/src/pages/execution/ExecutionTaskDetailPage'
import { ReleasePage } from '@/src/pages/release/ReleasePage'
import { ChatPage } from '@/src/pages/chat/ChatPage'


/* ── 路由定义 ── */

export const router = createBrowserRouter([
  // 公开路由
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },

  // 产品主界面
  {
    element: <ProductLayout />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/chat', element: <ChatPage /> },
      { path: '/settings/profile', element: <ProfilePage /> },
      { path: '/notifications', element: <NotificationsPage /> },
      // 兼容后端历史通知中的执行任务链接，详情页会在缺少 projectId 时使用任务自身的项目归属返回。
      { path: '/tasks/:taskId', element: <ExecutionTaskDetailPage /> },
      // 测试与执行详情页（独立页面，不嵌套在项目布局内）
      { path: '/projects/:projectId/execution/test-plans/:planId', element: <TestPlanDetailPage /> },
      { path: '/projects/:projectId/execution/tasks/:taskId', element: <ExecutionTaskDetailPage /> },
    ],
  },

  // 项目内路由
  {
    element: <ProductLayout />,
    children: [
      {
        path: '/projects/:projectId',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <ProjectDetailPage /> },
          { path: 'overview', element: <ProjectDetailPage /> },
          { path: 'planning', element: <PlanningPage /> },
          { path: 'knowledge', element: <KnowledgePage /> },
          { path: 'development', element: <DevelopmentPage /> },
          { path: 'execution', element: <ExecutionPage /> },
          { path: 'release', element: <ReleasePage /> },
        ],
      },
    ],
  },

  // 404
  { path: '*', element: <NotFoundPage /> },
])
