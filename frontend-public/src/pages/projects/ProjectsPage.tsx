/**
 * 项目列表页面。
 * 搜索、状态筛选、分页，精致的卡片网格展示。
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, ChevronLeft, ChevronRight, Users, CheckSquare, GitBranch } from 'lucide-react'
import { pageProjects } from '@/src/api/projects'
import type { ProjectItem } from '@/src/types/project'
import type { PageResponse } from '@/src/types/api'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, getInitials } from '@/src/lib/utils'

type StatusFilter = 'all' | 'conducting' | 'archived'

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'conducting', label: '进行中' },
  { value: 'archived', label: '已归档' },
]

export const ProjectsPage = () => {
  const [data, setData] = useState<PageResponse<ProjectItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const pageSize = 12

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await pageProjects({
        page,
        size: pageSize,
        keyword: keyword || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, keyword, statusFilter])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleStatusChange = (status: StatusFilter) => {
    setStatusFilter(status)
    setPage(1)
  }

  const handleSearch = () => {
    setPage(1)
    fetchProjects()
  }

  return (
    <div className="animate-fadeIn">
      {/* 页面标题 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-text-primary)]">项目</h1>
          <p className="mt-1 text-[14px] text-[var(--color-text-tertiary)]">
            管理你的研发项目空间
          </p>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)]">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                statusFilter === tab.value
                  ? 'bg-[var(--color-primary)] text-white shadow-[0_1px_2px_rgba(79,70,229,0.25)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="搜索项目名称…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] placeholder:text-[var(--color-text-placeholder)] transition-all duration-150 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
        </div>
      </div>

      {/* 内容区 */}
      {loading ? (
        <LoadingSpinner fullscreen text="加载项目列表…" />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchProjects} />
      ) : !data || data.records.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
          <EmptyState
            title={keyword ? '没有找到匹配的项目' : '还没有项目'}
            description={keyword ? '尝试其他关键词或清除筛选条件。' : '创建第一个项目开始协作。'}
            action={
              !keyword ? (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  创建项目
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.records.map((project) => (
              <ProjectListItem key={project.id} project={project} />
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">
                共 {data.total} 个项目，第 {data.page}/{data.totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft className="h-4 w-4" />}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                >
                  下一页 <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 项目列表卡片。 */
const ProjectListItem = ({ project }: { project: ProjectItem }) => (
  <Link
    to={`/projects/${project.id}`}
    className="group block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-card-hover)]"
  >
    <div className="flex items-start gap-3.5">
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[15px] font-semibold text-[var(--color-primary)] transition-all duration-200 group-hover:bg-[var(--color-primary)] group-hover:text-white group-hover:shadow-[0_2px_8px_rgba(79,70,229,0.25)]">
        {getInitials(project.name)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
          {project.name}
        </h3>
        <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
          {project.owner}
        </p>
      </div>
    </div>

    {project.description && (
      <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
        {project.description}
      </p>
    )}

    <div className="mt-4 flex items-center gap-2.5 border-t border-[var(--color-border-light)] pt-3.5 text-[11px] text-[var(--color-text-tertiary)]">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
          project.status === 'conducting'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-gray-100 text-gray-500'
        }`}
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
