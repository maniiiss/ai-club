/**
 * 项目详情占位页面。
 * 阶段一仅展示模块卡片入口，阶段二开始补充真实数据。
 * 当用户直接访问 /projects/:id 时显示此页面。
 */
import { useParams, Link } from 'react-router-dom'
import {
  CalendarRange,
  BookOpen,
  Code2,
  FlaskConical,
  Rocket,
} from 'lucide-react'

const modules = [
  {
    path: 'planning',
    label: '计划',
    description: '管理需求、任务、缺陷与迭代节奏',
    icon: CalendarRange,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    path: 'knowledge',
    label: '知识',
    description: 'Wiki 文档、项目记忆与上下文',
    icon: BookOpen,
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    path: 'development',
    label: '研发',
    description: '代码仓库、MR 审查与质量扫描',
    icon: Code2,
    color: 'bg-purple-50 text-purple-600',
  },
  {
    path: 'execution',
    label: '测试与执行',
    description: '测试计划、自动化执行与报告',
    icon: FlaskConical,
    color: 'bg-amber-50 text-amber-600',
  },
  {
    path: 'release',
    label: '发布与观测',
    description: '流水线、发布记录与健康趋势',
    icon: Rocket,
    color: 'bg-rose-50 text-rose-600',
  },
]

export const ProjectDetailPage = () => {
  const { projectId } = useParams<{ projectId: string }>()

  return (
    <div className="animate-fadeIn">
      <h2 className="mb-2 text-[var(--text-xl)] font-semibold text-[var(--color-text-primary)]">
        项目模块
      </h2>
      <p className="mb-6 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
        选择一个模块开始使用项目能力。各模块将在后续版本中逐步接入真实数据。
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <Link
            key={mod.path}
            to={`/projects/${projectId}/${mod.path}`}
            className="group flex items-start gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-sm)] transition-all hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-md)]"
          >
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] ${mod.color}`}
            >
              <mod.icon className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-[var(--text-base)] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
                {mod.label}
              </h3>
              <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
                {mod.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
