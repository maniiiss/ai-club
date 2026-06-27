/**
 * 计划模块页面。
 * 功能：迭代 CRUD、工作项 CRUD、工作项详情抽屉、列表/看板切换。
 */
import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus, CalendarRange, CheckSquare, AlertCircle, FileText, Search,
  X, Edit3, Trash2, LayoutList, LayoutGrid, GripVertical, TrendingDown,
  ChevronDown, MessageSquare, Send, Bot, User, FolderOpen, Link2, Sparkles,
} from 'lucide-react'
import {
  getIterationBoard, pageProjectWorkItems, getWorkItemStats,
  createIteration, updateIteration, deleteIteration,
  createWorkItem, updateWorkItem, deleteWorkItem, getWorkItemDetail,
  getProjectBurndown, listTaskComments, createTaskComment,
} from '@/src/api/planning'
import { MarkdownEditor } from '@/src/components/common/MarkdownEditor'
import { RequirementAiDialog } from './RequirementAiDialog'
import { REQUIREMENT_TEMPLATE, TASK_TEMPLATE } from '@/src/lib/markdownTemplates'
import { uploadMarkdownImage } from '@/src/lib/markdownImageUpload'
import type { IterationBoardItem, IterationItem, WorkItem, WorkItemStats, WorkItemPayload, IterationPayload, BurndownItem, TaskComment } from '@/src/types/planning'
import type { PageResponse } from '@/src/types/api'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Card } from '@/src/components/common/Card'
import { Markdown } from '@/src/components/common/Markdown'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { Select } from '@/src/components/common/Select'
import { SlideDrawer, SlideDrawerFooter } from '@/src/components/common/SlideDrawer'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'

/* ── 常量 ── */

type WorkItemTypeFilter = '全部' | '需求' | '任务' | '缺陷'
type ViewMode = 'list' | 'kanban'

const typeTabs: WorkItemTypeFilter[] = ['全部', '需求', '任务', '缺陷']

const typeIconMap: Record<string, typeof FileText> = { '需求': FileText, '任务': CheckSquare, '缺陷': AlertCircle }

const statusColorMap: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600', '待开始': 'bg-amber-50 text-amber-700',
  '进行中': 'bg-blue-50 text-blue-700', '已完成': 'bg-emerald-50 text-emerald-700',
  '已阻塞': 'bg-red-50 text-red-700', '通过': 'bg-emerald-50 text-emerald-700',
  '已拒绝': 'bg-gray-100 text-gray-500', '延期解决': 'bg-orange-50 text-orange-700',
}

const priorityColorMap: Record<string, string> = { '高': 'text-red-600 font-semibold', '中': 'text-amber-600', '低': 'text-gray-500' }

const iterationStatusColor: Record<string, string> = { '未开始': 'bg-gray-100 text-gray-500', '进行中': 'bg-blue-50 text-blue-700', '已完成': 'bg-emerald-50 text-emerald-700' }

const statusOptions: Record<string, string[]> = {
  '需求': ['草稿', '待开始', '进行中', '已完成', '已阻塞'],
  '任务': ['待开始', '进行中', '已阻塞', '已完成'],
  '缺陷': ['待开始', '进行中', '已完成', '通过', '已拒绝', '延期解决'],
}

const kanbanColumns = ['待开始', '进行中', '已完成']

/* ═══════════════════════════════════════════════
   主页面
   ═══════════════════════════════════════════════ */

export const PlanningPage = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [board, setBoard] = useState<IterationBoardItem | null>(null)
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [selectedIteration, setSelectedIteration] = useState<IterationItem | null | 'unplanned'>(null)

  const [workItems, setWorkItems] = useState<PageResponse<WorkItem> | null>(null)
  const [wiLoading, setWiLoading] = useState(false)
  const [wiError, setWiError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<WorkItemTypeFilter>('全部')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const [stats, setStats] = useState<WorkItemStats | null>(null)
  const [burndown, setBurndown] = useState<BurndownItem | null>(null)
  const [burndownExpanded, setBurndownExpanded] = useState(false)
  /** 燃尽图范围：'all' = 项目全部 | 'planned' = 项目全部但剔除未规划 | number = 指定迭代 id */
  const [burndownScope, setBurndownScope] = useState<'all' | 'planned' | number>('planned')

  // 弹窗状态
  const [iterDialog, setIterDialog] = useState<{ open: boolean; editing?: IterationItem }>({ open: false })
  const [wiDialog, setWiDialog] = useState<{ open: boolean; editing?: WorkItem }>({ open: false })
  const [detailItem, setDetailItem] = useState<WorkItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'iteration' | 'workItem'; id: number; name: string } | null>(null)
  /**
   * 需求 AI 助手弹窗的目标工作项。
   * 独立于 detailItem——编辑抽屉打开/关闭、详情抽屉关闭都不应影响 AI 助手的存活。
   */
  const [aiAssistantItem, setAiAssistantItem] = useState<WorkItem | null>(null)
  /** 打开 AI 助手后自动执行的动作（如 'STANDARDIZE'），执行后由 onClose 清理。 */
  const [autoRunAction, setAutoRunAction] = useState<string | null>(null)

  const fetchBoard = async () => {
    setBoardLoading(true); setBoardError(null)
    try {
      const data = await getIterationBoard(pid)
      setBoard(data)
      const active = data.iterations.find((i) => i.status === '进行中')
      if (active && !selectedIteration) setSelectedIteration(active)
    } catch (err) { setBoardError(getErrorMessage(err)) }
    finally { setBoardLoading(false) }
  }

  const fetchWorkItems = useCallback(async () => {
    setWiLoading(true); setWiError(null)
    try {
      const query: Parameters<typeof pageProjectWorkItems>[1] = {
        page, size: 20, keyword: keyword || undefined,
        workItemType: typeFilter === '全部' ? undefined : typeFilter,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
      }
      if (selectedIteration === 'unplanned') query.unplanned = true
      else if (selectedIteration) query.iterationId = selectedIteration.id
      setWorkItems(await pageProjectWorkItems(pid, query))
    } catch (err) { setWiError(getErrorMessage(err)) }
    finally { setWiLoading(false) }
  }, [pid, page, keyword, typeFilter, statusFilter, priorityFilter, selectedIteration])

  const fetchStats = async () => {
    try { setStats(await getWorkItemStats(pid)) } catch { /* ignore */ }
  }

  const fetchBurndown = useCallback(async () => {
    try {
      const query =
        typeof burndownScope === 'number'
          ? { iterationId: burndownScope }
          : burndownScope === 'planned'
            ? { excludeUnplanned: true }
            : undefined
      setBurndown(await getProjectBurndown(pid, query))
    } catch { setBurndown(null) }
  }, [pid, burndownScope])

  useEffect(() => { fetchBoard(); fetchStats() }, [pid])
  useEffect(() => { fetchBurndown() }, [fetchBurndown])
  // 等迭代列表加载完成并选定迭代后再拉工作项，避免先拉全量再按迭代拉导致闪烁。
  useEffect(() => {
    if (!boardLoading) fetchWorkItems()
  }, [fetchWorkItems, boardLoading])

  const refreshAll = () => { fetchBoard(); fetchWorkItems(); fetchStats() }

  const handleOpenDetail = async (id: number) => {
    setDetailLoading(true)
    try { setDetailItem(await getWorkItemDetail(id)) }
    catch { setDetailItem(null) }
    finally { setDetailLoading(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'iteration') await deleteIteration(pid, deleteConfirm.id)
      else await deleteWorkItem(deleteConfirm.id)
      setDeleteConfirm(null)
      refreshAll()
    } catch { /* show error inline */ }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fadeIn">
      {/* 顶部区域（不滚动） */}
      <div className="flex-shrink-0">
      {/* 燃尽图（可折叠，默认收起） —— 统计信息已合并到折叠头 */}
      {burndown && burndown.labels.length > 0 && (
        <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
          <button
            onClick={() => setBurndownExpanded(!burndownExpanded)}
            className="flex w-full items-center justify-between gap-4 px-5 py-3 hover:bg-[var(--color-bg-hover)]/50 transition-colors"
          >
            <div className="flex items-center gap-2 flex-shrink-0">
              <TrendingDown className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
              <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">燃尽图</h3>
            </div>
            {stats && (
              <div className="flex items-center gap-4 sm:gap-6 flex-1 justify-end pr-2 text-[12px]">
                <StatInline label="总计" value={stats.totalCount} />
                <StatInline label="进行中" value={stats.openCount} color="text-blue-600" />
                <StatInline label="已完成" value={stats.completedCount} color="text-emerald-600" />
                <StatInline label="缺陷" value={stats.defectCount} color="text-red-600" />
                <StatInline label="完成率" value={`${stats.completionRate}%`} color="text-[var(--color-primary)]" />
              </div>
            )}
            <ChevronDown className={cn(
              'h-4 w-4 text-[var(--color-text-tertiary)] transition-transform duration-200 flex-shrink-0',
              burndownExpanded && 'rotate-180',
            )} />
          </button>
          <div className={cn(
            'grid transition-all duration-300 ease-in-out',
            burndownExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}>
            <div className="overflow-hidden">
              <div className="px-5 pb-5 pt-1">
                <div className="flex items-center justify-between gap-3 mb-2 text-[12px] text-[var(--color-text-tertiary)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-text-tertiary)]">范围</span>
                    <Select
                      value={typeof burndownScope === 'number' ? `iter:${burndownScope}` : burndownScope}
                      onChange={(v) => {
                        if (v === 'all' || v === 'planned') setBurndownScope(v)
                        else if (v.startsWith('iter:')) setBurndownScope(Number(v.slice(5)))
                      }}
                      options={[
                        {
                          value: 'planned',
                          label: '已规划工作项',
                          description: '推荐 · 排除未规划任务',
                          icon: <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />,
                        },
                        {
                          value: 'all',
                          label: '项目全部',
                          description: '含未规划工作项',
                          icon: <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />,
                        },
                        ...(board?.iterations?.map((it) => ({
                          value: `iter:${it.id}`,
                          label: it.name,
                          description: it.status,
                          icon: <span className={cn(
                            'inline-block h-2 w-2 rounded-full',
                            it.status === '进行中' ? 'bg-blue-500'
                              : it.status === '已完成' ? 'bg-emerald-500'
                              : 'bg-gray-300',
                          )} />,
                        })) ?? []),
                      ]}
                      className="w-[220px]"
                    />
                  </div>
                  {burndown.startDate && burndown.endDate && (
                    <span>周期: {formatDate(burndown.startDate)} ~ {formatDate(burndown.endDate)} · 剩余 {burndown.remainingWorkItemCount}</span>
                  )}
                </div>
                <BurndownChart data={burndown} />
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      <div className="flex-1 flex gap-5 overflow-hidden">
        {/* 左侧：迭代列表 */}
        <div className="hidden lg:flex lg:flex-col w-[260px] shrink-0 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">迭代</h3>
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setIterDialog({ open: true })}>新建</Button>
            </div>
            {boardLoading ? <LoadingSpinner text="加载迭代…" />
              : boardError ? <p className="text-[12px] text-[var(--color-danger)]">{boardError}</p>
              : (
                <div className="space-y-1">
                  <button onClick={() => { setSelectedIteration('unplanned'); setPage(1) }}
                    className={cn('w-full flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors text-left',
                      selectedIteration === 'unplanned' ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]')}>
                    <span>未规划</span>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">{board?.unplannedCount ?? 0}</span>
                  </button>
                  {board?.iterations.map((iter) => {
                    const isSelected = selectedIteration && selectedIteration !== 'unplanned' && (selectedIteration as IterationItem).id === iter.id
                    return (
                      <div key={iter.id} className={cn('group rounded-lg transition-colors', isSelected ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/15' : 'hover:bg-[var(--color-bg-hover)]')}>
                        <button onClick={() => { setSelectedIteration(iter); setPage(1) }} className="w-full px-3 py-2.5 text-left">
                          <div className="flex items-center justify-between">
                            <span className={cn('text-[13px] font-medium truncate', isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]')}>{iter.name}</span>
                            <span className={cn('ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', iterationStatusColor[iter.status] || 'bg-gray-100 text-gray-500')}>{iter.status}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                            <span>{iter.workItemCount} 项</span>
                            {iter.startDate && iter.endDate && <span>{formatDate(iter.startDate)} ~ {formatDate(iter.endDate)}</span>}
                          </div>
                        </button>
                        {/* 操作按钮：移动端默认显示，桌面端 hover 显示 */}
                        <div className="flex items-center gap-1 px-3 pb-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setIterDialog({ open: true, editing: iter })} className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors">编辑</button>
                          {iter.canDelete && <button onClick={() => setDeleteConfirm({ type: 'iteration', id: iter.id, name: iter.name })} className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors">删除</button>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>
        </div>

        {/* 右侧：工作项 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* 移动端迭代选择器 */}
          {board && (
            <div className="mb-4 lg:hidden">
              <Select
                value={selectedIteration === 'unplanned' ? 'unplanned' : String(selectedIteration?.id || '')}
                onChange={(val) => {
                  if (val === 'unplanned') {
                    setSelectedIteration('unplanned')
                  } else {
                    const iter = board.iterations.find((i) => i.id === Number(val))
                    if (iter) setSelectedIteration(iter)
                  }
                  setPage(1)
                }}
                options={[
                  { value: 'unplanned', label: `未规划 (${board.unplannedCount})` },
                  ...board.iterations.map((iter) => ({
                    value: String(iter.id),
                    label: iter.name,
                    description: `${iter.workItemCount} 项 · ${iter.status}`,
                  })),
                ]}
              />
            </div>
          )}

          {/* 工具栏 */}
          <div className="flex-shrink-0 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)]">
                {typeTabs.map((tab) => (
                  <button key={tab} onClick={() => { setTypeFilter(tab); setStatusFilter(''); setPage(1) }}
                    className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150',
                      typeFilter === tab ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]')}>
                    {tab}
                  </button>
                ))}
              </div>
              {/* 状态筛选 */}
              <Select
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1) }}
                options={[
                  { value: '', label: '全部状态' },
                  ...(typeFilter === '全部' || typeFilter === '需求' ? [
                    { value: '草稿', label: '草稿' },
                  ] : []),
                  { value: '待开始', label: '待开始' },
                  { value: '进行中', label: '进行中' },
                  { value: '已完成', label: '已完成' },
                  { value: '已阻塞', label: '已阻塞' },
                  ...(typeFilter === '缺陷' ? [
                    { value: '通过', label: '通过' },
                    { value: '已拒绝', label: '已拒绝' },
                    { value: '延期解决', label: '延期解决' },
                  ] : []),
                ]}
                placeholder="全部状态"
                className="w-[120px]"
              />
              {/* 优先级筛选 */}
              <Select
                value={priorityFilter}
                onChange={(v) => { setPriorityFilter(v); setPage(1) }}
                options={[
                  { value: '', label: '全部优先级' },
                  { value: '高', label: '高', icon: <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> },
                  { value: '中', label: '中', icon: <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> },
                  { value: '低', label: '低', icon: <span className="inline-block h-2 w-2 rounded-full bg-gray-400" /> },
                ]}
                placeholder="全部优先级"
                className="w-[120px]"
              />
              {/* 视图切换 */}
              <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-0.5 shadow-[var(--shadow-xs)]">
                <button onClick={() => setViewMode('list')} className={cn('rounded-md p-1.5 transition-colors', viewMode === 'list' ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]')}><LayoutList className="h-4 w-4" /></button>
                <button onClick={() => setViewMode('kanban')} className={cn('rounded-md p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]')}><LayoutGrid className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input type="text" placeholder="搜索…" value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                  className="h-8 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" />
              </div>
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setWiDialog({ open: true })}>新建工作项</Button>
            </div>
          </div>

          {/* 内容 */}
          <div className="flex-1 min-h-0">
          {wiLoading ? <LoadingSpinner text="加载工作项…" />
            : wiError ? <ErrorState description={wiError} onRetry={fetchWorkItems} />
            : !workItems || workItems.records.length === 0
              ? <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]"><EmptyState title="暂无工作项" description="点击右上角「新建工作项」开始。" icon={<CheckSquare className="h-6 w-6" strokeWidth={1.5} />} /></div>
              : viewMode === 'list'
                ? <WorkItemTable items={workItems} onOpenDetail={handleOpenDetail} onEdit={(w) => setWiDialog({ open: true, editing: w })} onDelete={(w) => setDeleteConfirm({ type: 'workItem', id: w.id, name: w.name })} page={page} totalPages={workItems.totalPages} total={workItems.total} onPageChange={setPage} />
                : <KanbanBoard items={workItems.records} onOpenDetail={handleOpenDetail} />
          }
          </div>
        </div>
      </div>

      {/* ── 弹窗 ── */}
      {iterDialog.open && <IterationDialog projectId={pid} editing={iterDialog.editing} onClose={() => setIterDialog({ open: false })} onSaved={() => { setIterDialog({ open: false }); fetchBoard() }} />}
      {wiDialog.open && <WorkItemDialog projectId={pid} editing={wiDialog.editing} iterationId={selectedIteration && selectedIteration !== 'unplanned' ? selectedIteration.id : undefined} onClose={() => setWiDialog({ open: false })} onSaved={(result) => { setWiDialog({ open: false }); refreshAll(); if (result?.autoStandardize && result.item) { setAiAssistantItem(result.item); setAutoRunAction('STANDARDIZE') } }} />}
      {detailItem && <WorkItemDetailDrawer item={detailItem} loading={detailLoading} onClose={() => setDetailItem(null)} onEdit={() => { setWiDialog({ open: true, editing: detailItem }); setDetailItem(null) }} onDelete={(w) => { setDetailItem(null); setDeleteConfirm({ type: 'workItem', id: w.id, name: w.name }) }} onRefresh={handleOpenDetail} onOpenAi={() => setAiAssistantItem(detailItem)} />}
      {deleteConfirm && <DeleteConfirmDialog name={deleteConfirm.name} onCancel={() => setDeleteConfirm(null)} onConfirm={handleDeleteConfirm} />}
      {aiAssistantItem && aiAssistantItem.workItemType === '需求' && <RequirementAiDialog open={true} workItem={aiAssistantItem} onClose={() => { setAiAssistantItem(null); setAutoRunAction(null) }} onChanged={() => { if (detailItem?.id === aiAssistantItem.id) handleOpenDetail(aiAssistantItem.id); refreshAll() }} autoRunAction={autoRunAction} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   工作项表格
   ═══════════════════════════════════════════════ */

const WorkItemTable = ({ items, onOpenDetail, onEdit, onDelete, page, totalPages, total, onPageChange }: {
  items: PageResponse<WorkItem>; onOpenDetail: (id: number) => void; onEdit: (w: WorkItem) => void; onDelete: (w: WorkItem) => void
  page: number; totalPages: number; total: number; onPageChange: (p: number) => void
}) => (
  <div className="h-full flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
    <div className="flex-1 overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-[var(--color-border-light)] bg-[var(--color-bg-page)]/80 backdrop-blur-sm">
            <th className="px-4 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">工作项</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[70px]">类型</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[80px]">状态</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[55px]">优先级</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[70px]">负责人</th>
            <th className="px-3 py-2 w-[70px]" />
          </tr>
        </thead>
      <tbody className="divide-y divide-[var(--color-border-light)]">
        {items.records.map((item) => {
          const TypeIcon = typeIconMap[item.workItemType] || FileText
          return (
            <tr key={item.id} className="group hover:bg-[var(--color-bg-hover)]/50 transition-colors cursor-pointer" onClick={() => onOpenDetail(item.id)}>
              <td className="px-4 py-2 max-w-0"><div className="flex items-center gap-2 min-w-0">{item.workItemCode && <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] shrink-0">{item.workItemCode}</span>}<span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{item.name}</span></div></td>
              <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-secondary)]"><TypeIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />{item.workItemType}</span></td>
              <td className="px-3 py-2 whitespace-nowrap"><span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', statusColorMap[item.status] || 'bg-gray-100 text-gray-600')}>{item.status}</span></td>
              <td className="px-3 py-2 whitespace-nowrap"><span className={cn('text-[12px]', priorityColorMap[item.priority] || 'text-gray-500')}>{item.priority}</span></td>
              <td className="px-3 py-2 whitespace-nowrap text-[12px] text-[var(--color-text-secondary)] truncate max-w-[70px]">{item.assignee || '-'}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1 justify-end lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); onEdit(item) }} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"><Edit3 className="h-3.5 w-3.5" /></button>
                  {item.canDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(item) }} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)] transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
    {totalPages > 1 && (
      <div className="flex-shrink-0 flex items-center justify-between border-t border-[var(--color-border-light)] px-4 py-2 bg-[var(--color-bg-card)]">
        <span className="text-[12px] text-[var(--color-text-tertiary)]">共 {total} 项，第 {page}/{totalPages} 页</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</Button>
        </div>
      </div>
    )}
  </div>
)

/* ═══════════════════════════════════════════════
   看板视图
   ═══════════════════════════════════════════════ */

const KanbanBoard = ({ items, onOpenDetail }: { items: WorkItem[]; onOpenDetail: (id: number) => void }) => {
  const grouped = kanbanColumns.reduce<Record<string, WorkItem[]>>((acc, col) => { acc[col] = []; return acc }, {})
  items.forEach((item) => { if (grouped[item.status]) grouped[item.status].push(item) })

  return (
    <div className="h-full grid grid-cols-1 gap-4 sm:grid-cols-3">
      {kanbanColumns.map((col) => (
        <div key={col} className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-page)]/50 p-3 overflow-hidden">
          <div className="flex-shrink-0 mb-3 flex items-center justify-between">
            <h4 className="text-[12px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">{col}</h4>
            <span className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">{grouped[col].length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {grouped[col].map((item) => {
              const TypeIcon = typeIconMap[item.workItemType] || FileText
              return (
                <button key={item.id} onClick={() => onOpenDetail(item.id)}
                  className="w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)] transition-shadow">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TypeIcon className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">{item.workItemType}</span>
                    {item.workItemCode && <span className="ml-auto text-[10px] font-mono text-[var(--color-text-tertiary)]">{item.workItemCode}</span>}
                  </div>
                  <p className="text-[13px] font-medium text-[var(--color-text-primary)] line-clamp-2">{item.name}</p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                    <span className={cn(priorityColorMap[item.priority])}>{item.priority}</span>
                    <span>{item.assignee || '未分配'}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   迭代对话框
   ═══════════════════════════════════════════════ */

const IterationDialog = ({ projectId, editing, onClose, onSaved }: {
  projectId: number; editing?: IterationItem; onClose: () => void; onSaved: () => void
}) => {
  const [form, setForm] = useState({
    name: editing?.name || '', goal: editing?.goal || '', status: editing?.status || '未开始',
    startDate: editing?.startDate || '', endDate: editing?.endDate || '', description: editing?.description || '', sortOrder: editing?.sortOrder || 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const payload: IterationPayload = { ...form }
      if (editing) await updateIteration(projectId, editing.id, payload)
      else await createIteration(projectId, payload)
      onSaved()
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <h2 className="text-[18px] font-bold text-[var(--color-text-primary)] mb-4">{editing ? '编辑迭代' : '新建迭代'}</h2>
        {error && <div className="mb-3 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input label="名称 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          <Input label="目标" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <Select
              label="状态"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={[
                { value: '未开始', label: '未开始', icon: <span className="inline-block h-2 w-2 rounded-full bg-gray-400" /> },
                { value: '进行中', label: '进行中', icon: <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> },
                { value: '已完成', label: '已完成', icon: <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> },
              ]}
            />
            <Input label="开始" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <Input label="结束" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>取消</Button>
            <Button type="submit" loading={saving}>{editing ? '保存' : '创建'}</Button>
          </div>
        </form>
      </div>
    </DialogOverlay>
  )
}

/* ═══════════════════════════════════════════════
   工作项对话框
   ═══════════════════════════════════════════════ */

const WorkItemDialog = ({ projectId, editing, iterationId, onClose, onSaved }: {
  projectId: number; editing?: WorkItem; iterationId?: number; onClose: () => void
  onSaved: (result?: { item: WorkItem; autoStandardize: boolean }) => void
}) => {
  const [form, setForm] = useState({
    name: editing?.name || '', workItemType: editing?.workItemType || '任务', status: editing?.status || '待开始',
    priority: editing?.priority || '中', assignee: editing?.assignee || '', description: editing?.description || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 创建需求时是否自动执行标准化需求 */
  const [autoStandardize, setAutoStandardize] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  /** 关闭动画播放中，延迟父组件卸载 */
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(onClose, 300)
  }, [onClose])

  const currentStatusOptions = statusOptions[form.workItemType] || statusOptions['任务']

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const payload: WorkItemPayload = {
        ...form, projectId, agentId: editing?.agentId ?? null,
        iterationId: editing?.iterationId ?? iterationId ?? null,
      }
      if (editing) {
        await updateWorkItem(editing.id, payload)
        onSaved()
      } else {
        const created = await createWorkItem(payload)
        onSaved({ item: created, autoStandardize })
      }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <SlideDrawer
      open={!isClosing}
      onClose={handleClose}
      title={editing ? '编辑工作项' : '新建工作项'}
      maxWidth="800px"
      footer={
        <SlideDrawerFooter
          cancelText="取消"
          confirmText={editing ? '保存' : '创建'}
          loading={saving}
          onCancel={handleClose}
          onConfirm={() => formRef.current?.requestSubmit()}
        />
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 min-h-full">
        {error && <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">{error}</div>}
        <Input label="名称 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
        <div className="grid grid-cols-3 gap-3">
          <Select
            label="类型"
            value={form.workItemType}
            onChange={(v) => { setForm({ ...form, workItemType: v, status: (statusOptions[v] || ['待开始'])[0] }); setAutoStandardize(false) }}
            options={[
              { value: '需求', label: '需求', icon: <FileText className="h-3.5 w-3.5 text-blue-600" /> },
              { value: '任务', label: '任务', icon: <CheckSquare className="h-3.5 w-3.5 text-emerald-600" /> },
              { value: '缺陷', label: '缺陷', icon: <AlertCircle className="h-3.5 w-3.5 text-red-600" /> },
            ]}
          />
          <Select
            label="状态"
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
            options={currentStatusOptions.map((s) => ({ value: s, label: s }))}
          />
          <Select
            label="优先级"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v })}
            options={[
              { value: '高', label: '高', icon: <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> },
              { value: '中', label: '中', icon: <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> },
              { value: '低', label: '低', icon: <span className="inline-block h-2 w-2 rounded-full bg-gray-400" /> },
            ]}
          />
        </div>
        <Input label="负责人" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} />
        <div className="flex flex-col gap-1.5 flex-1 min-h-0">
          <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">描述</label>
          <MarkdownEditor
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
            placeholder="支持 Markdown 格式…"
            height="auto"
            templates={form.workItemType === '需求' ? [REQUIREMENT_TEMPLATE] : [TASK_TEMPLATE]}
            uploadImage={uploadMarkdownImage}
            startInEditMode={!editing}
          />
        </div>
        {/* 创建需求时显示标准化需求复选框 */}
        {!editing && form.workItemType === '需求' && (
          <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2.5 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30 transition-colors">
            <input
              type="checkbox"
              checked={autoStandardize}
              onChange={(e) => setAutoStandardize(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)] flex-shrink-0" />
            <span>创建后自动执行「标准化需求」</span>
          </label>
        )}
      </form>
    </SlideDrawer>
  )
}

/* ═══════════════════════════════════════════════
   工作项详情抽屉
   ═══════════════════════════════════════════════ */

const WorkItemDetailDrawer = ({ item, loading, onClose, onEdit, onDelete, onRefresh, onOpenAi }: {
  item: WorkItem; loading: boolean; onClose: () => void; onEdit: () => void
  onDelete: (item: WorkItem) => void; onRefresh: (id: number) => void; onOpenAi?: () => void
}) => {
  const TypeIcon = typeIconMap[item.workItemType] || FileText
  const [comments, setComments] = useState<TaskComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [showStatusSelect, setShowStatusSelect] = useState(false)
  /** 关闭动画播放中，延迟父组件卸载 */
  const [isClosing, setIsClosing] = useState(false)
  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(onClose, 300)
  }, [onClose])
  const scrollToComments = () => {
    document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const currentStatusOptions = statusOptions[item.workItemType] || statusOptions['任务']

  // 关闭状态下拉（点击外部）
  useEffect(() => {
    if (!showStatusSelect) return
    const close = () => setShowStatusSelect(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [showStatusSelect])

  // 加载评论
  useEffect(() => {
    let cancelled = false
    setCommentsLoading(true)
    listTaskComments(item.id)
      .then((data) => { if (!cancelled) setComments(data) })
      .catch(() => { if (!cancelled) setComments([]) })
      .finally(() => { if (!cancelled) setCommentsLoading(false) })
    return () => { cancelled = true }
  }, [item.id])

  // 提交评论
  const handleSubmitComment = async () => {
    if (!commentText.trim() || commentSubmitting) return
    setCommentSubmitting(true)
    try {
      const newComment = await createTaskComment(item.id, commentText)
      setComments((prev) => [...prev, newComment])
      setCommentText('')
    } catch { /* 静默 */ }
    finally { setCommentSubmitting(false) }
  }

  // 内联状态切换
  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === item.status || statusUpdating) return
    setShowStatusSelect(false)
    setStatusUpdating(true)
    try {
      await updateWorkItem(item.id, {
        name: item.name, status: newStatus, priority: item.priority,
        assignee: item.assignee, description: item.description,
        projectId: item.projectId, agentId: item.agentId,
        iterationId: item.iterationId,
      })
      onRefresh(item.id)
    } catch { /* 静默 */ }
    finally { setStatusUpdating(false) }
  }

  /** 头部操作按钮，渲染在 SlideDrawer 关闭按钮之前 */
  const headerActions = (
    <>
      {item.workItemType === '需求' && onOpenAi && (
        <button onClick={onOpenAi} title="AI 助手" className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors">
          <Sparkles className="h-4 w-4" />
        </button>
      )}
      <button onClick={scrollToComments} title="评论" className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors">
        <MessageSquare className="h-4 w-4" />
      </button>
      {item.canDelete && (
        <button onClick={() => onDelete(item)} title="删除" className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)] transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <button onClick={onEdit} title="编辑" className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors">
        <Edit3 className="h-4 w-4" />
      </button>
    </>
  )

  return (
    <SlideDrawer
      open={!isClosing}
      onClose={handleClose}
      title={item.name}
      description={item.workItemCode || undefined}
      maxWidth="800px"
      headerActions={headerActions}
    >
      {loading ? <LoadingSpinner fullscreen text="加载中…" /> : (
        <div className="p-6 pb-4 space-y-5">
          {/* 属性网格 */}
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="类型"><span className="inline-flex items-center gap-1.5 text-[13px]"><TypeIcon className="h-4 w-4" strokeWidth={1.75} />{item.workItemType}</span></DetailField>
            {/* 内联状态切换 */}
            <DetailField label="状态">
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowStatusSelect(!showStatusSelect) }}
                  disabled={statusUpdating}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium cursor-pointer hover:opacity-80 transition-opacity',
                    statusColorMap[item.status] || 'bg-gray-100 text-gray-600',
                    statusUpdating && 'opacity-50 cursor-wait',
                  )}
                >
                  {item.status}
                  <ChevronDown className="h-3 w-3" strokeWidth={2} />
                </button>
                {showStatusSelect && (
                  <div className="absolute left-0 top-full mt-1 z-50 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)] py-1 animate-fadeIn">
                    {currentStatusOptions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-[13px] hover:bg-[var(--color-bg-hover)] transition-colors',
                          s === item.status && 'text-[var(--color-primary)] font-medium',
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </DetailField>
            <DetailField label="优先级"><span className={cn('text-[13px]', priorityColorMap[item.priority])}>{item.priority}</span></DetailField>
            <DetailField label="负责人"><span className="text-[13px]">{item.assignee || '未分配'}</span></DetailField>
            <DetailField label="迭代"><span className="text-[13px]">{item.iterationName || '未规划'}</span></DetailField>
            <DetailField label="所属项目"><span className="text-[13px]">{item.projectName}</span></DetailField>
            <DetailField label="创建人"><span className="inline-flex items-center gap-1 text-[13px]"><User className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />{item.creatorName || '未知'}</span></DetailField>
            {item.moduleName && <DetailField label="模块"><span className="inline-flex items-center gap-1 text-[13px]"><FolderOpen className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />{item.moduleName}</span></DetailField>}
            {item.agentName && <DetailField label="关联 Agent"><span className="inline-flex items-center gap-1 text-[13px]"><Bot className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />{item.agentName}</span></DetailField>}
            {item.requirementTaskName && <DetailField label="关联需求"><span className="inline-flex items-center gap-1 text-[13px]"><Link2 className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />{item.requirementTaskName}</span></DetailField>}
            {item.planStartDate && <DetailField label="计划周期"><span className="text-[13px]">{formatDate(item.planStartDate)} ~ {formatDate(item.planEndDate)}</span></DetailField>}
            {item.workHours != null && <DetailField label="预估工时"><span className="text-[13px]">{item.workHours} 小时</span></DetailField>}
          </div>

          {/* 描述 */}
          <div>
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">描述</h4>
            <div className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-4">
              {item.description ? <Markdown content={item.description} /> : <span className="text-[var(--color-text-tertiary)] text-[14px]">暂无描述</span>}
            </div>
          </div>

          {/* 协作者 */}
          {item.collaboratorNames.length > 0 && (
            <div>
              <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">协作者</h4>
              <div className="flex flex-wrap gap-1.5">
                {item.collaboratorNames.map((n) => <span key={n} className="rounded-full bg-[var(--color-bg-hover)] px-2.5 py-1 text-[12px] text-[var(--color-text-secondary)]">{n}</span>)}
              </div>
            </div>
          )}

          {/* ── 评论区 ── */}
          <div id="comments-section">
            <h4 className="text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
              评论{comments.length > 0 && <span className="ml-1 text-[var(--color-primary)]">({comments.length})</span>}
            </h4>

            {commentsLoading ? (
              <div className="py-4 text-center text-[13px] text-[var(--color-text-tertiary)]">加载评论中…</div>
            ) : comments.length === 0 ? (
              <div className="py-4 text-center text-[13px] text-[var(--color-text-tertiary)]">暂无评论</div>
            ) : (
              <div className="space-y-3 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[var(--color-border-light)] bg-white p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{c.authorName || '未知用户'}</span>
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">{formatDate(c.createdAt)}</span>
                    </div>
                    <div className="text-[13px]">
                      <Markdown content={c.content} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 评论输入 */}
            <div className="space-y-2">
              <MarkdownEditor
                value={commentText}
                onChange={setCommentText}
                placeholder="输入评论内容…"
                height={200}
                uploadImage={uploadMarkdownImage}
                startInEditMode
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSubmitComment}
                  loading={commentSubmitting}
                  disabled={!commentText.trim()}
                  icon={<Send className="h-3.5 w-3.5" />}
                  size="sm"
                >
                  发送
                </Button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--color-text-tertiary)]">最后更新：{formatDate(item.updatedAt)}</p>
        </div>
      )}
    </SlideDrawer>
  )
}

const DetailField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">{label}</p>
    {children}
  </div>
)

/* ═══════════════════════════════════════════════
   删除确认对话框
   ═══════════════════════════════════════════════ */

const DeleteConfirmDialog = ({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) => (
  <DialogOverlay onClose={onCancel}>
    <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-light)]">
        <Trash2 className="h-5 w-5 text-[var(--color-danger)]" />
      </div>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">确认删除</h3>
      <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">确定要删除「{name}」吗？此操作不可撤销。</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button variant="danger" onClick={onConfirm}>删除</Button>
      </div>
    </div>
  </DialogOverlay>
)

/* ═══════════════════════════════════════════════
   公共组件
   ═══════════════════════════════════════════════ */

const DialogOverlay = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
    <div className="relative z-10">{children}</div>
  </div>
)

const StatInline = ({ label, value, color }: { label: string; value: number | string; color?: string }) => (
  <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
    <span className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</span>
    <span className={cn('text-[15px] font-bold tracking-tight', color || 'text-[var(--color-text-primary)]')}>{value}</span>
  </span>
)

/* ═══════════════════════════════════════════════
   燃尽图 (SVG)
   ═══════════════════════════════════════════════ */

const BurndownChart = ({ data }: { data: BurndownItem }) => {
  const { labels, idealRemaining, actualRemaining } = data
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(700)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  /* 监听容器宽度变化（横向铺满） */
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerWidth(w)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (labels.length === 0) return null

  /* 每个时间点的合适宽度：≥ 56px，铺满优先 */
  const MIN_STEP = 56
  const height = 240
  const padding = { top: 20, right: 24, bottom: 36, left: 48 }
  const segments = Math.max(labels.length - 1, 1)

  // 容器内可用绘图宽度（去掉左右 padding）
  const availInner = Math.max(containerWidth - padding.left - padding.right, 100)
  // 需要的最小内绘图宽度
  const needInner = MIN_STEP * segments
  // 实际内绘图宽度：能铺满就铺满，铺不下就用 needInner（外层会横向滚动）
  const chartWidth = Math.max(availInner, needInner)
  const width = chartWidth + padding.left + padding.right
  const chartHeight = height - padding.top - padding.bottom

  const maxVal = Math.max(...idealRemaining, ...actualRemaining, 1)
  const xScale = (i: number) => padding.left + (i / segments) * chartWidth
  const yScale = (v: number) => padding.top + chartHeight - (v / maxVal) * chartHeight

  const idealPath = idealRemaining.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')
  const actualPath = actualRemaining
    .map((v, i) => (v != null ? `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}` : ''))
    .filter(Boolean)
    .join(' ')

  /* X 轴标签自适应密度：保证标签之间至少 60px 间距 */
  const labelStep = Math.max(1, Math.ceil((labels.length * 60) / chartWidth))

  /* hover tooltip 内容 */
  const hover = hoverIdx != null ? {
    label: labels[hoverIdx],
    ideal: idealRemaining[hoverIdx],
    actual: actualRemaining[hoverIdx],
    x: xScale(hoverIdx),
    yActual: actualRemaining[hoverIdx] != null ? yScale(actualRemaining[hoverIdx] as number) : null,
    yIdeal: yScale(idealRemaining[hoverIdx]),
  } : null

  // tooltip 像素位置（按 SVG 像素与容器像素一致渲染）
  const tooltipLeftPct = hover ? (hover.x / width) * 100 : 0

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* 网格线 */}
          {Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i)).map((v) => (
            <g key={v}>
              <line x1={padding.left} y1={yScale(v)} x2={width - padding.right} y2={yScale(v)} stroke="var(--color-border-light)" strokeWidth={0.5} />
              <text x={padding.left - 8} y={yScale(v) + 4} textAnchor="end" className="fill-[var(--color-text-tertiary)]" fontSize={10}>{v}</text>
            </g>
          ))}

          {/* 理想线 */}
          <path d={idealPath} fill="none" stroke="var(--color-text-tertiary)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6} />
          {/* 实际线 */}
          <path d={actualPath} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} strokeLinejoin="round" />

          {/* hover 竖向参考线 */}
          {hover && (
            <line x1={hover.x} y1={padding.top} x2={hover.x} y2={padding.top + chartHeight}
                  stroke="var(--color-primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
          )}

          {/* 数据点（实际） */}
          {actualRemaining.map((v, i) =>
            v != null ? (
              <circle key={`a-${i}`} cx={xScale(i)} cy={yScale(v)}
                      r={hoverIdx === i ? 5 : 3}
                      fill="var(--color-primary)"
                      stroke="var(--color-bg-card)" strokeWidth={hoverIdx === i ? 2 : 0} />
            ) : null,
          )}

          {/* X 轴标签 */}
          {labels.map((label, i) =>
            i % labelStep === 0 || i === labels.length - 1 ? (
              <text key={i} x={xScale(i)} y={height - 8} textAnchor="middle" className="fill-[var(--color-text-tertiary)]" fontSize={10}>
                {label}
              </text>
            ) : null,
          )}

          {/* 图例 */}
          <g>
            <line x1={width - 170} y1={10} x2={width - 150} y2={10} stroke="var(--color-text-tertiary)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6} />
            <text x={width - 146} y={14} className="fill-[var(--color-text-tertiary)]" fontSize={10}>理想</text>
            <line x1={width - 105} y1={10} x2={width - 85} y2={10} stroke="var(--color-primary)" strokeWidth={2.5} />
            <text x={width - 81} y={14} className="fill-[var(--color-primary)]" fontSize={10}>实际</text>
          </g>

          {/* 透明 hover hit-area：每个数据点一个宽条带 */}
          {labels.map((_, i) => {
            const half = chartWidth / segments / 2
            const x = xScale(i) - half
            return (
              <rect
                key={`hit-${i}`}
                x={Math.max(x, 0)}
                y={padding.top}
                width={Math.max(chartWidth / segments, 1)}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                style={{ cursor: 'pointer' }}
              />
            )
          })}
        </svg>
      </div>

      {/* Tooltip（HTML 浮层） */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 shadow-[var(--shadow-card)] text-[12px] whitespace-nowrap"
          style={{
            left: `${tooltipLeftPct}%`,
            top: 4,
          }}
        >
          <div className="font-semibold text-[var(--color-text-primary)] mb-1">{hover.label}</div>
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <span className="inline-block w-2.5 h-0.5 bg-[var(--color-primary)]" />
            <span>实际剩余</span>
            <span className="font-semibold text-[var(--color-primary)]">
              {hover.actual != null ? hover.actual : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] mt-0.5">
            <span className="inline-block w-2.5 h-0.5 border-t border-dashed border-[var(--color-text-tertiary)]" />
            <span>理想剩余</span>
            <span className="font-semibold">{hover.ideal}</span>
          </div>
          {hover.actual != null && (
            <div className="mt-1 pt-1 border-t border-[var(--color-border-light)] text-[11px]">
              <span className="text-[var(--color-text-tertiary)]">偏差: </span>
              <span className={cn(
                'font-semibold',
                (hover.actual as number) > hover.ideal ? 'text-red-600' : 'text-emerald-600',
              )}>
                {(hover.actual as number) > hover.ideal ? '+' : ''}
                {(hover.actual as number) - hover.ideal}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
