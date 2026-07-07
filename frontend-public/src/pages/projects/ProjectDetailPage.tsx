/**
 * 项目详情页面。
 * 展示项目真实数据（名称、描述、成员、统计）+ 模块卡片导航入口。
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  CalendarRange,
  BookOpen,
  Code2,
  FlaskConical,
  Rocket,
  Users,
  CheckSquare,
  GitBranch,
  Settings2,
} from 'lucide-react'
import { getProjectDetail } from '@/src/api/projects'
import type { ProjectItem } from '@/src/types/project'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { Button } from '@/src/components/common/Button'
import { ProjectMemberDrawer } from '@/src/components/projects/ProjectMemberDrawer'
import { cn, getInitials } from '@/src/lib/utils'

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
    label: '文档',
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
  const pid = Number(projectId)

  const [project, setProject] = useState<ProjectItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberDrawerOpen, setMemberDrawerOpen] = useState(false)

  useEffect(() => {
    const fetchProject = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getProjectDetail(pid)
        setProject(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载项目详情失败')
      } finally {
        setLoading(false)
      }
    }
    if (pid > 0) fetchProject()
  }, [pid])

  if (loading) return <LoadingSpinner fullscreen text="加载项目详情…" />
  if (error) return <ErrorState title="加载失败" description={error} />

  return (
    <div className="h-full overflow-y-auto animate-fadeIn">
      {/* 项目头部信息 */}
      {project && (
        <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[20px] font-bold text-[var(--color-primary)]">
              {getInitials(project.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
                  {project.name}
                </h1>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium',
                    project.status === 'conducting'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {project.status === 'conducting' ? '进行中' : '已归档'}
                </span>
                {project.canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Settings2 className="h-3.5 w-3.5" />}
                    onClick={() => setMemberDrawerOpen(true)}
                  >
                    成员管理
                  </Button>
                )}
              </div>
              {project.description && (
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                  {project.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-[var(--color-text-tertiary)]">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" strokeWidth={1.75} />
                  {project.owner}
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4" strokeWidth={1.75} />
                  {project.taskCount} 任务
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" strokeWidth={1.75} />
                  {project.memberUserIds.length} 成员
                </span>
                {project.repoCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <GitBranch className="h-4 w-4" strokeWidth={1.75} />
                    {project.repoCount} 仓库
                  </span>
                )}
                {project.agentCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <FlaskConical className="h-4 w-4" strokeWidth={1.75} />
                    {project.agentCount} 智能体
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 成员头像 */}
          {project.memberItems && project.memberItems.length > 0 && (
            <div className="mt-4 border-t border-[var(--color-border-light)] pt-4">
              <p className="mb-2 text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                项目成员
              </p>
              <div className="flex flex-wrap gap-2">
                {project.memberItems.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 rounded-full bg-[var(--color-bg-hover)] px-3 py-1.5"
                  >
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.name}
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[10px] font-semibold text-[var(--color-primary)]">
                        {getInitials(member.name)}
                      </div>
                    )}
                    <span className="text-[12px] text-[var(--color-text-secondary)]">{member.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 模块卡片入口 */}
      <h2 className="mb-2 text-[16px] font-semibold text-[var(--color-text-primary)]">
        项目模块
      </h2>
      <p className="mb-4 text-[13px] text-[var(--color-text-tertiary)]">
        选择一个模块开始使用项目能力
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <Link
            key={mod.path}
            to={`/projects/${projectId}/${mod.path}`}
            className="group flex items-start gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-sm)] transition-all hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-md)]"
          >
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${mod.color}`}
            >
              <mod.icon className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
                {mod.label}
              </h3>
              <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
                {mod.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {project && (
        <ProjectMemberDrawer
          open={memberDrawerOpen}
          project={project}
          onClose={() => setMemberDrawerOpen(false)}
          onSaved={setProject}
        />
      )}
    </div>
  )
}
