/**
 * 项目内布局。
 * 面包屑、Tab、摘要信息固定不动，内容区内部滚动。
 */
import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ArrowLeft, Users, CheckSquare, GitBranch, Sparkles } from 'lucide-react'
import { ProjectNav } from '@/src/components/navigation/ProjectNav'
import { getProjectDetail } from '@/src/api/projects'
import type { ProjectItem } from '@/src/types/project'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { AssistantWorkspace } from '@/src/components/assistant/AssistantWorkspace'
import { useAuthStore } from '@/src/stores/auth'
import { useGuide } from '@/src/components/guide'

export const ProjectLayout = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const canUseAssistant = useAuthStore((s) => s.hasPermission('hermes:chat'))
  const [project, setProject] = useState<ProjectItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const { isCompleted: guideCompleted, startGuide } = useGuide('assistant')
  const authUser = useAuthStore((s) => s.user)

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

  // 首次打开助手抽屉时自动启动新手引导。
  // 工作区内的引导锚点（会话侧栏、对话区、输入区等）随抽屉懒挂载，
  // 必须等抽屉打开、工作区渲染完成后再启动，否则锚点不在 DOM 中会被步骤过滤掉。
  // 触发时机选在抽屉首次打开而非进入项目页自动弹出：
  // 各项目子页面自带页面级引导，若布局层同时自动弹出会出现两个引导遮罩叠加。
  useEffect(() => {
    if (assistantOpen && !guideCompleted && authUser && canUseAssistant) {
      const timer = setTimeout(() => startGuide(), 500)
      return () => clearTimeout(timer)
    }
  }, [assistantOpen, guideCompleted, authUser, canUseAssistant, startGuide])

  if (loading) {
    return <LoadingSpinner fullscreen text="加载项目信息…" />
  }

  if (error) {
    return <ErrorState title="加载项目失败" description={error} onRetry={fetchProject} />
  }

  return (
    <div className="-mx-4 -my-6 h-full flex flex-col lg:-mx-8 lg:-my-8">
      {/* 面包屑 — 固定 */}
      <div className="flex h-11 flex-shrink-0 items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 lg:px-6">
        <button
          onClick={() => navigate('/projects')}
          className="inline-flex h-full items-center gap-1 text-[12px] leading-5 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          项目
        </button>
        <span className="inline-flex h-full items-center text-[12px] leading-5 text-[var(--color-text-tertiary)]">/</span>
        <h2 className="inline-flex h-full min-w-0 items-center truncate text-[14px] font-semibold leading-5 text-[var(--color-text-primary)]">
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

      {/* 模块切换 Tab — 固定 */}
      <div className="flex-shrink-0">
        <ProjectNav />
      </div>

      {/* 项目摘要 — 固定 */}
      {project && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--color-border-light)] bg-[var(--color-bg-card)]/50 px-4 py-2 text-[12px] text-[var(--color-text-tertiary)] lg:px-6">
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

      {/* 子路由内容 — 内部滚动 */}
      <div className="flex-1 overflow-y-auto bg-[var(--color-bg-page)] px-4 pt-4 pb-2 lg:px-6 lg:pt-5 lg:pb-2">
        <Outlet />
      </div>

      {canUseAssistant && projectId && (
        <>
          <button
            type="button"
            className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-xl)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            title="打开 GitPilot 项目助手"
            aria-label="打开 GitPilot 项目助手"
            onClick={() => setAssistantOpen(true)}
          >
            <Sparkles className="h-5 w-5" />
          </button>
          <SlideDrawer
            open={assistantOpen}
            onClose={() => setAssistantOpen(false)}
            title="GitPilot 项目助手"
            description={project?.name || '当前项目'}
            maxWidth="min(1080px, 100vw)"
          >
            <AssistantWorkspace
              mode="project"
              projectId={Number(projectId)}
              compact
            />
          </SlideDrawer>
        </>
      )}
    </div>
  )
}
