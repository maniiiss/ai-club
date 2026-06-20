/**
 * 路由配置。
 * 使用 React Router v7 的 createBrowserRouter。
 */
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { CalendarRange, BookOpen, Code2, FlaskConical, Rocket } from 'lucide-react'

import { AuthLayout } from '@/src/layouts/AuthLayout'
import { ProductLayout } from '@/src/layouts/ProductLayout'
import { ProjectLayout } from '@/src/layouts/ProjectLayout'

import { LoginPage } from '@/src/pages/auth/LoginPage'
import { RegisterPage } from '@/src/pages/auth/RegisterPage'
import { DashboardPage } from '@/src/pages/dashboard/DashboardPage'
import { ProjectsPage } from '@/src/pages/projects/ProjectsPage'
import { ProfilePage } from '@/src/pages/settings/ProfilePage'
import { NotFoundPage } from '@/src/pages/NotFoundPage'

/* ── 占位模块页面（统一风格） ── */

const ModulePlaceholder = ({
  icon: Icon,
  title,
  subtitle,
  description,
  phase,
}: {
  icon: typeof CalendarRange
  title: string
  subtitle: string
  description: string
  phase: string
}) => (
  <div className="animate-fadeIn">
    <div className="mb-8">
      <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-1.5 text-[14px] text-[var(--color-text-tertiary)]">{subtitle}</p>
    </div>
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-16 text-center shadow-[var(--shadow-xs)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary-light)]">
        <Icon className="h-7 w-7 text-[var(--color-primary)]" strokeWidth={1.5} />
      </div>
      <h3 className="mt-4 text-[16px] font-semibold text-[var(--color-text-primary)]">
        {description}
      </h3>
      <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
        该模块将在{phase}上线，敬请期待。
      </p>
    </div>
  </div>
)

const PlanningPlaceholder = () => (
  <ModulePlaceholder
    icon={CalendarRange}
    title="计划"
    subtitle="管理需求、任务、缺陷与迭代节奏"
    description="迭代与工作项管理"
    phase="阶段二"
  />
)

const KnowledgePlaceholder = () => (
  <ModulePlaceholder
    icon={BookOpen}
    title="知识"
    subtitle="沉淀项目文档与上下文"
    description="Wiki 与项目记忆"
    phase="阶段二"
  />
)

const DevelopmentPlaceholder = () => (
  <ModulePlaceholder
    icon={Code2}
    title="研发"
    subtitle="连接代码仓库与质量治理"
    description="仓库、MR 与代码扫描"
    phase="阶段三"
  />
)

const ExecutionPlaceholder = () => (
  <ModulePlaceholder
    icon={FlaskConical}
    title="测试与执行"
    subtitle="跟踪测试和异步任务"
    description="测试计划与执行中心"
    phase="阶段三"
  />
)

const ReleasePlaceholder = () => (
  <ModulePlaceholder
    icon={Rocket}
    title="发布与观测"
    subtitle="关注发布是否成功、线上是否健康"
    description="流水线与健康趋势"
    phase="阶段四"
  />
)

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
          { index: true, element: <Navigate to="planning" replace /> },
          { path: 'planning', element: <PlanningPlaceholder /> },
          { path: 'knowledge', element: <KnowledgePlaceholder /> },
          { path: 'development', element: <DevelopmentPlaceholder /> },
          { path: 'execution', element: <ExecutionPlaceholder /> },
          { path: 'release', element: <ReleasePlaceholder /> },
        ],
      },
    ],
  },

  // 404
  { path: '*', element: <NotFoundPage /> },
])
