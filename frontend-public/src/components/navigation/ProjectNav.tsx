/**
 * 项目内模块切换导航。
 * 作为项目页面的一级 Tab，精致下划线指示器 + 微妙 hover 效果。
 */
import { NavLink, useParams } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarRange,
  BookOpen,
  Code2,
  FlaskConical,
  Rocket,
} from 'lucide-react'
import { cn } from '@/src/lib/utils'

const projectTabs = [
  { path: '', label: '概览', icon: LayoutDashboard, exact: true },
  { path: 'planning', label: '计划', icon: CalendarRange, exact: false },
  { path: 'knowledge', label: '文档', icon: BookOpen, exact: false },
  { path: 'development', label: '研发', icon: Code2, exact: false },
  { path: 'execution', label: '测试与执行', icon: FlaskConical, exact: false },
  { path: 'release', label: '发布与观测', icon: Rocket, exact: false },
]

export const ProjectNav = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const basePath = `/projects/${projectId}`

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <div className="flex gap-0 overflow-x-auto px-2 lg:px-4">
        {projectTabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path === '' ? basePath : `${basePath}/${tab.path}`}
            end={tab.exact}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-2 px-4 py-3 text-[13.5px] font-medium whitespace-nowrap',
                'transition-all duration-150',
                'after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:rounded-full after:transition-all after:duration-200',
                isActive
                  ? 'text-[var(--color-primary)] after:bg-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] after:bg-transparent hover:after:bg-[var(--color-border-strong)]',
              )
            }
          >
            <tab.icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
