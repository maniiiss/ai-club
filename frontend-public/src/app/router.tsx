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
import { NotFoundPage } from '@/src/pages/NotFoundPage'
import { PlanningPage } from '@/src/pages/planning/PlanningPage'
import { KnowledgePage } from '@/src/pages/knowledge/KnowledgePage'
import { DevelopmentPage } from '@/src/pages/development/DevelopmentPage'
import { ExecutionPage } from '@/src/pages/execution/ExecutionPage'
import { ReleasePage } from '@/src/pages/release/ReleasePage'


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
      { path: '/settings/profile', element: <ProfilePage /> },
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
