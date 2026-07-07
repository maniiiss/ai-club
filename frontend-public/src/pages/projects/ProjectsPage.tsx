/**
 * 项目列表页面。
 * 搜索、状态筛选、分页，精致的卡片网格展示。
 * 支持新建、编辑、删除项目。
 */
import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckSquare,
  GitBranch,
  Edit3,
  Trash2,
} from 'lucide-react'
import {
  pageProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectListStats,
} from '@/src/api/projects'
import type { ProjectItem, ProjectPayload, ProjectListStatsItem } from '@/src/types/project'
import type { PageResponse } from '@/src/types/api'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { useAuth } from '@/src/hooks/useAuth'
import { cn, getInitials, getErrorMessage } from '@/src/lib/utils'
import { useGuide } from '@/src/components/guide'
import { useAuthStore } from '@/src/stores/auth'

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

  const [stats, setStats] = useState<ProjectListStatsItem | null>(null)

  /* 弹窗状态 */
  const [dialog, setDialog] = useState<{ open: boolean; editing?: ProjectItem }>({ open: false })
  const [deleteConfirm, setDeleteConfirm] = useState<ProjectItem | null>(null)
  const canManageProject = useAuth((state) => state.hasPermission('project:manage'))
  const { isCompleted: guideCompleted, startGuide } = useGuide('projects')
  const authUser = useAuthStore((s) => s.user)

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

  const fetchStats = async () => {
    try {
      const s = await getProjectListStats({
        keyword: keyword || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setStats(s)
    } catch {
      /* 统计加载失败不阻塞页面 */
    }
  }

  useEffect(() => {
    fetchProjects()
    fetchStats()
  }, [fetchProjects])

  useEffect(() => {
    if (!guideCompleted && authUser && !loading && !error) {
      const timer = setTimeout(() => startGuide(), 500)
      return () => clearTimeout(timer)
    }
  }, [guideCompleted, authUser, loading, error, startGuide])

  const handleStatusChange = (status: StatusFilter) => {
    setStatusFilter(status)
    setPage(1)
  }

  const handleSearch = () => {
    setPage(1)
    fetchProjects()
    fetchStats()
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    try {
      await deleteProject(deleteConfirm.id)
      setDeleteConfirm(null)
      fetchProjects()
      fetchStats()
    } catch {
      /* 显示错误在对话框内 */
    }
  }

  return (
    <div className="h-full overflow-y-auto animate-fadeIn">
      {/* 页面标题 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-text-primary)]">项目</h1>
          <p className="mt-1 text-[14px] text-[var(--color-text-tertiary)]">
            管理你的研发项目空间
          </p>
        </div>
        {canManageProject && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setDialog({ open: true })}
            data-guide-id="projects-create"
          >
            创建项目
          </Button>
        )}
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4" data-guide-id="projects-stats">
          <StatCard label="活跃项目" value={stats.activeProjectCount} color="text-[var(--color-primary)]" />
          <StatCard label="总任务数" value={stats.totalTaskCount} />
          <StatCard label="进行中占比" value={`${stats.resourceLoadPercent}%`} color="text-emerald-600" />
          <StatCard label="平均任务数" value={stats.averageTaskCount} />
        </div>
      )}

      {/* 搜索和筛选 */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-guide-id="projects-filter">
        <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)]">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                statusFilter === tab.value
                  ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]'
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
              !keyword && canManageProject ? (
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ open: true })}>
                  创建项目
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-guide-id="projects-list">
            {data.records.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                canManageProject={canManageProject}
                onEdit={() => setDialog({ open: true, editing: project })}
                onDelete={() => setDeleteConfirm(project)}
              />
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

      {/* 弹窗 */}
      {dialog.open && (
        <ProjectDialog
          editing={dialog.editing}
          canManageProject={canManageProject}
          onClose={() => setDialog({ open: false })}
          onSaved={() => {
            setDialog({ open: false })
            fetchProjects()
            fetchStats()
          }}
        />
      )}
      {deleteConfirm && (
        <DeleteConfirmDialog
          name={deleteConfirm.name}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  )
}

/** 项目列表卡片（含编辑/删除操作）。 */
const ProjectListItem = ({
  project,
  canManageProject,
  onEdit,
  onDelete,
}: {
  project: ProjectItem
  canManageProject: boolean
  onEdit: () => void
  onDelete: () => void
}) => (
  <div className="group relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-card-hover)]">
    <Link to={`/projects/${project.id}`} className="block">
      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[15px] font-semibold text-[var(--color-primary)] transition-all duration-200 group-hover:bg-[var(--color-primary)] group-hover:text-white group-hover:shadow-[var(--shadow-md)]">
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
    </Link>

    <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-light)] pt-3.5">
      <div className="flex items-center gap-2.5 text-[11px] text-[var(--color-text-tertiary)]">
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
      {/* 操作按钮：移动端默认显示，桌面端 hover 显示 */}
      <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        {canManageProject && project.canEdit && (
          <button
            onClick={(e) => { e.preventDefault(); onEdit() }}
            className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            title="编辑项目"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
        {canManageProject && project.canDelete && (
          <button
            onClick={(e) => { e.preventDefault(); onDelete() }}
            className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)] transition-colors"
            title="删除项目"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  </div>
)

/* ════════════════════════════════════════════
   项目创建/编辑对话框
   ════════════════════════════════════════════ */

const ProjectDialog = ({
  editing,
  canManageProject,
  onClose,
  onSaved,
}: {
  editing?: ProjectItem
  canManageProject: boolean
  onClose: () => void
  onSaved: () => void
}) => {
  const [form, setForm] = useState({
    name: editing?.name || '',
    owner: editing?.owner || '',
    description: editing?.description || '',
    status: editing?.status || 'conducting',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canManageProject) {
      setError('当前账号没有项目维护权限')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: ProjectPayload = {
        name: form.name,
        owner: form.owner,
        description: form.description,
        status: form.status,
      }
      if (editing) {
        await updateProject(editing.id, payload)
      } else {
        await createProject(payload)
      }
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <h2 className="text-[18px] font-bold text-[var(--color-text-primary)] mb-4">
          {editing ? '编辑项目' : '创建项目'}
        </h2>
        {error && (
          <div className="mb-3 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="项目名称 *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label="负责人 *"
            value={form.owner}
            onChange={(e) => setForm({ ...form, owner: e.target.value })}
            required
          />
          <Select
            label="状态"
            value={form.status}
            onChange={(value) => setForm({ ...form, status: value })}
            options={[
              { value: 'conducting', label: '进行中' },
              { value: 'archived', label: '已归档' },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="项目描述（可选）"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2.5 text-[14px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-y"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? '保存' : '创建'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   删除确认对话框
   ════════════════════════════════════════════ */

const DeleteConfirmDialog = ({
  name,
  onCancel,
  onConfirm,
}: {
  name: string
  onCancel: () => void
  onConfirm: () => void
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onCancel} />
    <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-light)]">
        <Trash2 className="h-5 w-5 text-[var(--color-danger)]" />
      </div>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">确认删除</h3>
      <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">
        确定要删除项目「{name}」吗？此操作不可撤销。
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          删除
        </Button>
      </div>
    </div>
  </div>
)

/* ════════════════════════════════════════════
   统计卡片
   ════════════════════════════════════════════ */

const StatCard = ({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color?: string
}) => (
  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 shadow-[var(--shadow-xs)]">
    <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
      {label}
    </p>
    <p className={cn('mt-1 text-[22px] font-bold tracking-tight', color || 'text-[var(--color-text-primary)]')}>
      {value}
    </p>
  </div>
)
