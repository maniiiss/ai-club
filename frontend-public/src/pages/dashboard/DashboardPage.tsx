/**
 * 工作台首页。
 * 面向公众 SaaS 用户的工作中心：欢迎语、快捷入口、最近项目。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderKanban,
  Plus,
  ArrowRight,
  Users,
  CheckSquare,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/src/stores/auth'
import { pageProjects } from '@/src/api/projects'
import type { ProjectItem } from '@/src/types/project'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { getInitials } from '@/src/lib/utils'

export const DashboardPage = () => {
  const user = useAuthStore((s) => s.user)
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await pageProjects({ page: 1, size: 6 })
      setProjects(result.records)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const displayName = user?.nickname || user?.username || '用户'
  const greeting = getGreeting()

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 欢迎区 */}
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-text-primary)]">
          {greeting}，{displayName}
        </h1>
        <p className="mt-1.5 text-[14px] text-[var(--color-text-tertiary)]">
          查看项目动态，管理你的研发工作流。
        </p>
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          to="/projects"
          className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:border-[var(--color-primary)]/20"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-light)] transition-colors group-hover:bg-[var(--color-primary)]/10">
              <FolderKanban className="h-5 w-5 text-[var(--color-primary)]" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">我的项目</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">浏览所有项目</p>
            </div>
          </div>
          <ArrowRight className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)] opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0 -translate-x-1" />
        </Link>

        <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <CheckSquare className="h-5 w-5 text-emerald-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">待办事项</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">即将上线</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
              <Sparkles className="h-5 w-5 text-amber-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">AI 助手</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">即将上线</p>
            </div>
          </div>
        </div>
      </div>

      {/* 最近项目 */}
      <Card
        title="最近项目"
        action={
          <Link to="/projects">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      >
        {loading ? (
          <LoadingSpinner text="加载项目…" />
        ) : error ? (
          <ErrorState title="加载失败" description={error} onRetry={fetchProjects} />
        ) : projects.length === 0 ? (
          <EmptyState
            title="还没有项目"
            description="创建第一个项目，开始你的研发协作之旅。"
            action={
              <Link to="/projects">
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  创建项目
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/** 项目小卡片（用于工作台）。 */
const ProjectCard = ({ project }: { project: ProjectItem }) => (
  <Link
    to={`/projects/${project.id}`}
    className="group block rounded-xl border border-[var(--color-border)] p-4 transition-all duration-200 hover:border-[var(--color-primary)]/30 hover:shadow-[var(--shadow-md)]"
  >
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)] text-[13px] font-semibold text-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-white">
        {getInitials(project.name)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
          {project.name}
        </h3>
        <p className="mt-0.5 truncate text-[12px] text-[var(--color-text-tertiary)]">
          {project.description || '暂无描述'}
        </p>
      </div>
    </div>
    <div className="mt-3 flex items-center gap-2.5 text-[11px] text-[var(--color-text-tertiary)]">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
          project.status === 'conducting'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        {project.status === 'conducting' ? '进行中' : '已归档'}
      </span>
      <span className="flex items-center gap-1">
        <CheckSquare className="h-3 w-3" />
        {project.taskCount}
      </span>
      <span className="flex items-center gap-1">
        <Users className="h-3 w-3" />
        {project.memberUserIds.length}
      </span>
    </div>
  </Link>
)

const getGreeting = (): string => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
