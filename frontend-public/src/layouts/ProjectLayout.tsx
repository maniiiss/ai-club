/**
 * 项目内布局。
 * 模块 Tab 置于页面最顶部作为一级切换导航，
 * 下方展示面包屑 + 项目摘要 + 子路由内容。
 */
import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ArrowLeft, Users, CheckSquare, GitBranch } from 'lucide-react'
import { ProjectNav } from '@/src/components/navigation/ProjectNav'
import { getProjectDetail } from '@/src/api/projects'
import type { ProjectItem } from '@/src/types/project'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'

export const ProjectLayout = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<ProjectItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProject = async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getProjectDetail(Number(projectId))
      setProject(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProject()
  }, [projectId])

  if (loading) {
    return <LoadingSpinner fullscreen text="加载项目信息…" />
  }

  if (error) {
    return <ErrorState title="加载项目失败" description={error} onRetry={fetchProject} />
  }

  return (
    <div className="flex h-full flex-col -m-4 lg:-m-6">
      {/* 顶部：面包屑 + 状态 */}
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 lg:px-6">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          项目
        </button>
        <span className="text-[var(--color-text-tertiary)] text-[12px]">/</span>
        <h2 className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
          {project?.name || '项目'}
        </h2>
        {project?.status && (
          <span
            className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              project.status === 'conducting'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {project.status === 'conducting' ? '进行中' : '已归档'}
          </span>
        )}
      </div>

      {/* 模块切换 Tab */}
      <ProjectNav />

      {/* 项目摘要信息条 */}
      {project && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--color-border-light)] bg-[var(--color-bg-card)]/50 px-4 py-2 text-[12px] text-[var(--color-text-tertiary)] lg:px-6">
          {project.description && (
            <span className="max-w-md truncate text-[var(--color-text-secondary)]">
              {project.description}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {project.memberUserIds.length} 成员
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckSquare className="h-3.5 w-3.5" />
            {project.taskCount} 任务
          </span>
          {project.repoCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              {project.repoCount} 仓库
            </span>
          )}
        </div>
      )}

      {/* 子路由内容 */}
      <div className="flex-1 overflow-y-auto bg-[var(--color-bg-page)] p-5 lg:p-6">
        <Outlet />
      </div>
    </div>
  )
}
