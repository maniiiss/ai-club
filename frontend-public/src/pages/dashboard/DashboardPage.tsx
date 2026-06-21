/**
 * 工作台首页。
 * 展示统计数据、活跃项目、最近任务和快速入口。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckSquare,
  Users,
  GitBranch,
  Plus,
} from 'lucide-react'
import { getDashboardOverview } from '@/src/api/dashboard'
import type { DashboardOverview } from '@/src/types/dashboard'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate, getInitials } from '@/src/lib/utils'

export const DashboardPage = () => {
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getDashboardOverview()
      setOverview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工作台数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const stats = overview?.stats
  const activeProjects = overview?.activeProjects || []
  const recentTasks = overview?.recentTasks || []

  return (
    <div className="h-full overflow-y-auto animate-fadeIn">
      {/* 页面标题 */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-primary)]">
            工作台
          </h1>
          <p className="mt-1.5 text-[14px] text-[var(--color-text-tertiary)]">
            查看项目动态、待办任务和研发数据
          </p>
        </div>
        <Link to="/projects">
          <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
            新建项目
          </Button>
        </Link>
      </div>

      {loading ? (
        <LoadingSpinner fullscreen text="加载工作台数据…" />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchDashboard} />
      ) : (
        <>
          {/* 统计卡片 */}
          {stats && (
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card title="项目总数">
                <p className="text-[28px] font-bold text-[var(--color-primary)]">{stats.projectCount}</p>
              </Card>
              <Card title="任务总数">
                <p className="text-[28px] font-bold text-[var(--color-text-primary)]">{stats.taskCount}</p>
              </Card>
              <Card title="智能体数">
                <p className="text-[28px] font-bold text-emerald-600">{stats.agentCount}</p>
              </Card>
              <Card title="仓库数">
                <p className="text-[28px] font-bold text-amber-600">{stats.repoCount}</p>
              </Card>
            </div>
          )}

          {/* 我的任务统计 */}
          {stats && (stats.myTaskCount || stats.myInProgressTaskCount || stats.myPendingTaskCount) && (
            <div className="mb-8 rounded-xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary-light)] to-white p-6 shadow-[var(--shadow-card)]">
              <h2 className="mb-4 text-[16px] font-semibold text-[var(--color-text-primary)]">
                我的任务
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">任务总数</p>
                  <p className="mt-1 text-[24px] font-bold text-[var(--color-text-primary)]">
                    {stats.myTaskCount || 0}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">进行中</p>
                  <p className="mt-1 text-[24px] font-bold text-blue-600">
                    {stats.myInProgressTaskCount || 0}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">待处理</p>
                  <p className="mt-1 text-[24px] font-bold text-amber-600">
                    {stats.myPendingTaskCount || 0}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 活跃项目 */}
          <Card
            title="活跃项目"
            action={
              <Link to="/projects">
                <Button variant="ghost" size="sm">
                  查看全部
                </Button>
              </Link>
            }
          >
            {activeProjects.length === 0 ? (
              <EmptyState
                title="暂无项目"
                description="创建第一个项目开始协作。"
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
                {activeProjects.slice(0, 6).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </Card>

          {/* 最近任务 */}
          {recentTasks.length > 0 && (
            <Card title="最近任务" className="mt-6">
              <div className="space-y-2">
                {recentTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 hover:shadow-[var(--shadow-sm)] transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
                          <span className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                            {task.name}
                          </span>
                          {task.workItemCode && (
                            <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-tertiary)]">
                              {task.workItemCode}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                          <span>{task.projectName}</span>
                          <span>负责人: {task.assignee || '-'}</span>
                          {task.updatedAt && <span>更新于 {formatDate(task.updatedAt)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[11px] font-medium',
                            task.status === '已完成'
                              ? 'bg-emerald-50 text-emerald-700'
                              : task.status === '进行中'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700',
                          )}
                        >
                          {task.status}
                        </span>
                        {task.priority && (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-medium',
                              task.priority === '高'
                                ? 'bg-red-50 text-red-700'
                                : task.priority === '中'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-gray-100 text-gray-600',
                            )}
                          >
                            {task.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

/** 项目卡片组件。 */
const ProjectCard = ({ project }: { project: { id: number; name: string; description: string; status: string; taskCount: number; memberUserIds: number[]; repoCount: number } }) => (
  <Link
    to={`/projects/${project.id}`}
    className="group block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-card-hover)]"
  >
    <div className="flex items-start gap-3.5">
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[15px] font-semibold text-[var(--color-primary)] transition-all duration-200 group-hover:bg-[var(--color-primary)] group-hover:text-white group-hover:shadow-[var(--shadow-md)]">
        {getInitials(project.name)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--color-text-tertiary)]">
            {project.description}
          </p>
        )}
      </div>
    </div>

    <div className="mt-3 flex items-center gap-2.5 border-t border-[var(--color-border-light)] pt-3 text-[11px] text-[var(--color-text-tertiary)]">
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
          project.status === 'conducting'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-gray-100 text-gray-500',
        )}
      >
        {project.status === 'conducting' ? '进行中' : '已归档'}
      </span>
      <span className="flex items-center gap-1">
        <CheckSquare className="h-3 w-3" />
        {project.taskCount} 任务
      </span>
      <span className="flex items-center gap-1">
        <Users className="h-3 w-3" />
        {project.memberUserIds.length} 成员
      </span>
      {project.repoCount > 0 && (
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          {project.repoCount}
        </span>
      )}
    </div>
  </Link>
)
