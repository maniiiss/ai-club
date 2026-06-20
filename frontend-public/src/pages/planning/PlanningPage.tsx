/**
 * 计划模块页面。
 * 左侧迭代列表 + 右侧工作项列表（含类型筛选、状态筛选、分页）。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus,
  CalendarRange,
  CheckSquare,
  AlertCircle,
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { getIterationBoard, pageProjectWorkItems, getWorkItemStats } from '@/src/api/planning'
import type { IterationBoardItem, IterationItem, WorkItem, WorkItemStats } from '@/src/types/planning'
import type { PageResponse } from '@/src/types/api'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate } from '@/src/lib/utils'

type WorkItemTypeFilter = '全部' | '需求' | '任务' | '缺陷'

const typeTabs: WorkItemTypeFilter[] = ['全部', '需求', '任务', '缺陷']

const typeIconMap: Record<string, typeof FileText> = {
  '需求': FileText,
  '任务': CheckSquare,
  '缺陷': AlertCircle,
}

const statusColorMap: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '待开始': 'bg-amber-50 text-amber-700',
  '进行中': 'bg-blue-50 text-blue-700',
  '已完成': 'bg-emerald-50 text-emerald-700',
  '已阻塞': 'bg-red-50 text-red-700',
  '通过': 'bg-emerald-50 text-emerald-700',
  '已拒绝': 'bg-gray-100 text-gray-500',
  '延期解决': 'bg-orange-50 text-orange-700',
}

const priorityColorMap: Record<string, string> = {
  '高': 'text-red-600 font-semibold',
  '中': 'text-amber-600',
  '低': 'text-gray-500',
}

const iterationStatusColor: Record<string, string> = {
  '未开始': 'bg-gray-100 text-gray-500',
  '进行中': 'bg-blue-50 text-blue-700',
  '已完成': 'bg-emerald-50 text-emerald-700',
}

export const PlanningPage = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  // 迭代看板
  const [board, setBoard] = useState<IterationBoardItem | null>(null)
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState<string | null>(null)

  // 选中迭代（null 表示"未规划"）
  const [selectedIteration, setSelectedIteration] = useState<IterationItem | null | 'unplanned'>(null)

  // 工作项
  const [workItems, setWorkItems] = useState<PageResponse<WorkItem> | null>(null)
  const [wiLoading, setWiLoading] = useState(false)
  const [wiError, setWiError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<WorkItemTypeFilter>('全部')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  // 统计
  const [stats, setStats] = useState<WorkItemStats | null>(null)

  const fetchBoard = async () => {
    setBoardLoading(true)
    setBoardError(null)
    try {
      const data = await getIterationBoard(pid)
      setBoard(data)
      // 默认选中第一个进行中的迭代
      const active = data.iterations.find((i) => i.status === '进行中')
      if (active) setSelectedIteration(active)
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : '加载迭代失败')
    } finally {
      setBoardLoading(false)
    }
  }

  const fetchWorkItems = useCallback(async () => {
    setWiLoading(true)
    setWiError(null)
    try {
      const query: Parameters<typeof pageProjectWorkItems>[1] = {
        page,
        size: 20,
        keyword: keyword || undefined,
        workItemType: typeFilter === '全部' ? undefined : typeFilter,
      }
      if (selectedIteration === 'unplanned') {
        query.unplanned = true
      } else if (selectedIteration) {
        query.iterationId = selectedIteration.id
      }
      const data = await pageProjectWorkItems(pid, query)
      setWorkItems(data)
    } catch (err) {
      setWiError(err instanceof Error ? err.message : '加载工作项失败')
    } finally {
      setWiLoading(false)
    }
  }, [pid, page, keyword, typeFilter, selectedIteration])

  const fetchStats = async () => {
    try {
      const data = await getWorkItemStats(pid)
      setStats(data)
    } catch {
      // 统计加载失败不阻塞页面
    }
  }

  useEffect(() => { fetchBoard(); fetchStats() }, [pid])
  useEffect(() => { fetchWorkItems() }, [fetchWorkItems])

  const handleTypeChange = (type: WorkItemTypeFilter) => {
    setTypeFilter(type)
    setPage(1)
  }

  return (
    <div className="animate-fadeIn">
      {/* 统计卡片 */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="总计" value={stats.totalCount} />
          <StatCard label="进行中" value={stats.openCount} color="text-blue-600" />
          <StatCard label="已完成" value={stats.completedCount} color="text-emerald-600" />
          <StatCard label="缺陷" value={stats.defectCount} color="text-red-600" />
          <StatCard label="完成率" value={`${stats.completionRate}%`} color="text-indigo-600" />
        </div>
      )}

      <div className="flex gap-5">
        {/* 左侧：迭代列表 */}
        <div className="hidden lg:block w-[260px] shrink-0">
          <div className="sticky top-[68px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">迭代</h3>
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>新建</Button>
            </div>
            {boardLoading ? (
              <LoadingSpinner text="加载迭代…" />
            ) : boardError ? (
              <p className="text-[12px] text-[var(--color-danger)]">{boardError}</p>
            ) : (
              <div className="space-y-1">
                {/* 未规划 */}
                <button
                  onClick={() => { setSelectedIteration('unplanned'); setPage(1) }}
                  className={cn(
                    'w-full flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors text-left',
                    selectedIteration === 'unplanned'
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                  )}
                >
                  <span>未规划</span>
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">{board?.unplannedCount ?? 0}</span>
                </button>

                {/* 迭代列表 */}
                {board?.iterations.map((iter) => (
                  <button
                    key={iter.id}
                    onClick={() => { setSelectedIteration(iter); setPage(1) }}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      selectedIteration && selectedIteration !== 'unplanned' && (selectedIteration as IterationItem).id === iter.id
                        ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/15'
                        : 'hover:bg-[var(--color-bg-hover)]',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'text-[13px] font-medium truncate',
                        selectedIteration && selectedIteration !== 'unplanned' && (selectedIteration as IterationItem).id === iter.id
                          ? 'text-[var(--color-primary)]'
                          : 'text-[var(--color-text-primary)]',
                      )}>
                        {iter.name}
                      </span>
                      <span className={cn(
                        'ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        iterationStatusColor[iter.status] || 'bg-gray-100 text-gray-500',
                      )}>
                        {iter.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      <span>{iter.workItemCount} 项</span>
                      {iter.startDate && iter.endDate && (
                        <span>{formatDate(iter.startDate)} ~ {formatDate(iter.endDate)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：工作项列表 */}
        <div className="flex-1 min-w-0">
          {/* 类型 Tab + 搜索 */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)]">
              {typeTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTypeChange(tab)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150',
                    typeFilter === tab
                      ? 'bg-[var(--color-primary)] text-white shadow-[0_1px_2px_rgba(79,70,229,0.25)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                placeholder="搜索工作项…"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                className="h-8 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
          </div>

          {/* 工作项表格 */}
          {wiLoading ? (
            <LoadingSpinner text="加载工作项…" />
          ) : wiError ? (
            <ErrorState title="加载失败" description={wiError} onRetry={fetchWorkItems} />
          ) : !workItems || workItems.records.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
              <EmptyState
                title="暂无工作项"
                description={selectedIteration ? '当前迭代还没有工作项。' : '选择迭代或创建新工作项。'}
                icon={<CheckSquare className="h-6 w-6" strokeWidth={1.5} />}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border-light)] bg-[var(--color-bg-page)]/50">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">工作项</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[80px]">类型</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[80px]">状态</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[60px]">优先级</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider w-[80px]">负责人</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-light)]">
                  {workItems.records.map((item) => {
                    const TypeIcon = typeIconMap[item.workItemType] || FileText
                    return (
                      <tr key={item.id} className="hover:bg-[var(--color-bg-hover)]/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {item.workItemCode && (
                              <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] shrink-0">
                                {item.workItemCode}
                              </span>
                            )}
                            <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                              {item.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-secondary)]">
                            <TypeIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                            {item.workItemType}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                            statusColorMap[item.status] || 'bg-gray-100 text-gray-600',
                          )}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('text-[12px]', priorityColorMap[item.priority] || 'text-gray-500')}>
                            {item.priority}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[12px] text-[var(--color-text-secondary)] truncate max-w-[80px]">
                          {item.assignee || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* 分页 */}
              {workItems.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[var(--color-border-light)] px-4 py-2.5">
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">
                    共 {workItems.total} 项，第 {workItems.page}/{workItems.totalPages} 页
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      上一页
                    </Button>
                    <Button variant="ghost" size="sm" disabled={page >= workItems.totalPages} onClick={() => setPage(page + 1)}>
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 统计数字卡片。 */
const StatCard = ({ label, value, color }: { label: string; value: number | string; color?: string }) => (
  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 shadow-[var(--shadow-xs)]">
    <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">{label}</p>
    <p className={cn('mt-1 text-[22px] font-bold tracking-tight', color || 'text-[var(--color-text-primary)]')}>
      {value}
    </p>
  </div>
)
