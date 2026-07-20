/**
 * 计划模块页面。
 * 功能：迭代 CRUD、工作项 CRUD、工作项详情抽屉、列表/看板切换。
 */
import { useEffect, useState, useCallback, useMemo, useRef, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Plus, CheckSquare, AlertCircle, FileText, Search,
  X, Edit3, Trash2, LayoutList, LayoutGrid, GripVertical, TrendingDown,
  ChevronDown, MessageSquare, Send, Bot, User, FolderOpen, Link2, Sparkles,
  Download, Paperclip, ArrowLeft, Copy, Check, Loader2, ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal,
} from 'lucide-react'
import {
  getIterationBoard, pageProjectWorkItems, listProjectWorkItems, getWorkItemStats,
  createIteration, updateIteration, deleteIteration,
  batchDeleteWorkItems, batchUpdateWorkItems, createWorkItem, updateWorkItem, updateWorkItemInline, deleteWorkItem, getWorkItemDetail,
  getProjectBurndown, listTaskComments, createTaskComment, pageTaskUpdateRecords,
  getWorkItemLinks, addWorkItemChild, removeWorkItemChild,
  addRelatedWorkItem, removeRelatedWorkItem, addWorkItemTestCase, removeWorkItemTestCase,
  pageProjectTestCases, uploadWorkItemAttachment, deleteWorkItemAttachment, downloadWorkItemAttachment,
} from '@/src/api/planning'
import { listUserOptions } from '@/src/api/users'
import { getMyFeatureCosts } from '@/src/api/credits'
import { generateBatchRequirementAi } from '@/src/api/requirementAi'
import type { UserOptionItem } from '@/src/api/users'
import { MarkdownEditor } from '@/src/components/common/MarkdownEditor'
import { RequirementAiDialog } from './RequirementAiDialog'
import { DevelopmentExecutionDialog } from './DevelopmentExecutionDialog'
import { TechnicalDesignAiDialog } from './TechnicalDesignAiDialog'
import { WorkItemUpdateTimeline } from '@/src/components/planning/WorkItemUpdateTimeline'
import { useAuthStore } from '@/src/stores/auth'
import { useGuide } from '@/src/components/guide'
import { REQUIREMENT_TEMPLATE, TASK_TEMPLATE } from '@/src/lib/markdownTemplates'
import { uploadMarkdownImage } from '@/src/lib/markdownImageUpload'
import { getBatchWorkItemAvailability, toggleAllBatchWorkItemSelection, toggleBatchWorkItemSelection } from '@/src/lib/planningBatchUtils'
import { buildPlanningIterationRoute, buildPlanningWorkItemRoute, buildWorkItemShareUrl } from '@/src/lib/planningShareUtils'
import { TASK_TYPE_OPTIONS, isDevelopmentExecutionEntryVisible, isRequirementAiEntryVisible, normalizeTaskType } from '@/src/lib/requirementAiUtils'
import { isTechnicalDesignEntryVisible } from '@/src/lib/technicalDesignAiUtils'
import type { IterationBoardItem, IterationItem, WorkItem, WorkItemStats, WorkItemPayload, IterationPayload, BurndownItem, TaskComment, WorkItemLinks, LinkedTestCase, WorkItemSortDirection, WorkItemSortField } from '@/src/types/planning'
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
import { DateRangePicker } from '@/src/components/common/DateRangePicker'
import { AssigneeFilterPicker, AssigneePicker, UserAvatar, WorkItemMemberPicker, type AssigneeFilterValue } from '@/src/components/common/AssigneePicker'
import { cn, formatDate, formatDateTime, getErrorMessage } from '@/src/lib/utils'

/* ── 常量 ── */

type WorkItemTypeFilter = '全部' | '需求' | '任务' | '缺陷'
type ViewMode = 'list' | 'kanban'
type DetailTab = 'detail' | 'children' | 'related' | 'testCases' | 'attachments'
type ActivityTab = 'comments' | 'updateRecords'
type BatchField = 'status' | 'priority' | 'assignee' | 'iteration'
type BatchDialog = BatchField | 'delete'
type AdvancedWorkItemFilters = {
  priority: string
  createdFrom: string
  createdTo: string
  planDateFrom: string
  planDateTo: string
}

const EMPTY_ADVANCED_WORK_ITEM_FILTERS: AdvancedWorkItemFilters = {
  priority: '',
  createdFrom: '',
  createdTo: '',
  planDateFrom: '',
  planDateTo: '',
}

type BatchWorkItemChange =
  | { field: 'status'; value: string }
  | { field: 'priority'; value: string }
  | { field: 'assignee'; userId: number | null }
  | { field: 'iteration'; iterationId: number | null }

interface BatchRequirementAiResult {
  workItem: WorkItem
  executionTaskId?: number
  error?: string
}

const typeTabs: WorkItemTypeFilter[] = ['全部', '需求', '任务', '缺陷']

const typeIconMap: Record<string, typeof FileText> = { '需求': FileText, '任务': CheckSquare, '缺陷': AlertCircle }

const statusColorMap: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600', '待开始': 'bg-amber-50 text-amber-700',
  '进行中': 'bg-blue-50 text-blue-700', '已完成': 'bg-emerald-50 text-emerald-700',
  '已阻塞': 'bg-red-50 text-red-700', '通过': 'bg-emerald-50 text-emerald-700',
  '已拒绝': 'bg-gray-100 text-gray-500', '延期解决': 'bg-orange-50 text-orange-700',
}
const statusInlineSelectClassMap: Record<string, string> = {
  '草稿': '[&>div>button]:bg-gray-100 [&>div>button]:text-gray-600',
  '待开始': '[&>div>button]:bg-amber-50 [&>div>button]:text-amber-700',
  '进行中': '[&>div>button]:bg-blue-50 [&>div>button]:text-blue-700',
  '已完成': '[&>div>button]:bg-emerald-50 [&>div>button]:text-emerald-700',
  '已阻塞': '[&>div>button]:bg-red-50 [&>div>button]:text-red-700',
  '通过': '[&>div>button]:bg-emerald-50 [&>div>button]:text-emerald-700',
  '已拒绝': '[&>div>button]:bg-gray-100 [&>div>button]:text-gray-500',
  '延期解决': '[&>div>button]:bg-orange-50 [&>div>button]:text-orange-700',
}
const statusDotColorMap: Record<string, string> = {
  '草稿': 'bg-gray-400', '待开始': 'bg-amber-500', '进行中': 'bg-blue-500',
  '已完成': 'bg-emerald-500', '已阻塞': 'bg-red-500', '通过': 'bg-emerald-500',
  '已拒绝': 'bg-gray-400', '延期解决': 'bg-orange-500',
}

const priorityColorMap: Record<string, string> = { '高': 'text-red-600 font-semibold', '中': 'text-amber-600', '低': 'text-gray-500' }
const priorityBadgeColorMap: Record<string, string> = {
  '高': '[&>div>button]:bg-red-50 [&>div>button]:text-red-700 [&>div>button]:border-red-100',
  '中': '[&>div>button]:bg-amber-50 [&>div>button]:text-amber-700 [&>div>button]:border-amber-100',
  '低': '[&>div>button]:bg-slate-100 [&>div>button]:text-slate-600 [&>div>button]:border-slate-200',
}
const priorityDotColorMap: Record<string, string> = {
  '高': 'bg-red-500',
  '中': 'bg-amber-500',
  '低': 'bg-slate-400',
}

const iterationStatusColor: Record<string, string> = { '未开始': 'bg-gray-100 text-gray-500', '进行中': 'bg-blue-50 text-blue-700', '已完成': 'bg-emerald-50 text-emerald-700' }

const statusOptions: Record<string, string[]> = {
  '需求': ['草稿', '待开始', '进行中', '已完成', '已阻塞'],
  '任务': ['待开始', '进行中', '已阻塞', '已完成'],
  '缺陷': ['待开始', '进行中', '已完成', '通过', '已拒绝', '延期解决'],
}

const kanbanColumns = ['待开始', '进行中', '已完成']

const detailTabs: Array<{ key: DetailTab; label: string }> = [
  { key: 'detail', label: '详情' },
  { key: 'children', label: '子工作项' },
  { key: 'related', label: '关联项' },
  { key: 'testCases', label: '测试用例' },
  { key: 'attachments', label: '附件' },
]

const batchFieldLabel: Record<BatchField, string> = {
  status: '状态',
  priority: '优先级',
  assignee: '负责人',
  iteration: '所属迭代',
}

const getDetailTabCount = (tab: DetailTab, links: WorkItemLinks | null) => {
  if (!links) return 0
  if (tab === 'children') return links.children.length
  if (tab === 'related') return links.relatedWorkItems.length
  if (tab === 'testCases') return links.testCases.length
  if (tab === 'attachments') return links.attachments.length
  return 0
}

/* ═══════════════════════════════════════════════
   主页面
   ═══════════════════════════════════════════════ */

export const PlanningPage = () => {
  const { projectId, iterationId, workItemId } = useParams<{ projectId: string; iterationId?: string; workItemId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const canCreateExecution = useAuthStore((state) => state.hasPermission('task:execution:create'))
  const currentUser = useAuthStore((state) => state.user)
  const { isCompleted: guideCompleted, startGuide } = useGuide('planning')
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
  /** 基础筛选只保留负责人快捷入口，高级筛选承载优先级和时间条件。 */
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilterValue>('')
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedWorkItemFilters>(EMPTY_ADVANCED_WORK_ITEM_FILTERS)
  const [advancedFilterDraft, setAdvancedFilterDraft] = useState<AdvancedWorkItemFilters>(EMPTY_ADVANCED_WORK_ITEM_FILTERS)
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const advancedFiltersRef = useRef<HTMLDivElement>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  /** 默认保持列表按创建时间倒序；表头点击后服务端按对应字段分页排序。 */
  const [sortBy, setSortBy] = useState<WorkItemSortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<WorkItemSortDirection>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [inlineEditError, setInlineEditError] = useState<string | null>(null)
  /** 正在保存的列表内联编辑工作项，用行尾小旋转图标反馈请求状态。 */
  const [inlineEditingIds, setInlineEditingIds] = useState<Set<number>>(new Set())
  /** 当前列表页的批量选择；切换列表上下文时清空，避免误操作其他筛选结果。 */
  const [selectedWorkItemIds, setSelectedWorkItemIds] = useState<Set<number>>(new Set())
  const [batchFieldDialog, setBatchFieldDialog] = useState<BatchDialog | null>(null)
  const [batchAiDialogOpen, setBatchAiDialogOpen] = useState(false)
  const [batchAiResults, setBatchAiResults] = useState<BatchRequirementAiResult[] | null>(null)
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchNotice, setBatchNotice] = useState<string | null>(null)

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
  const openedTaskIdRef = useRef<number | null>(null)
  /** 请求序号用于丢弃 React StrictMode 或快速切换产生的过期响应，避免旧结果覆盖当前列表。 */
  const boardRequestIdRef = useRef(0)
  const workItemRequestIdRef = useRef(0)
  /**
   * 详情抽屉内关联跳转历史。列表/看板首次打开详情会清空，关联项跳转会入栈，便于原路返回。
   */
  const [detailNavigationStack, setDetailNavigationStack] = useState<WorkItem[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'iteration' | 'workItem'; id: number; name: string } | null>(null)
  /**
   * 需求 AI 助手弹窗的目标工作项。
   * 独立于 detailItem——编辑抽屉打开/关闭、详情抽屉关闭都不应影响 AI 助手的存活。
   */
  const [aiAssistantItem, setAiAssistantItem] = useState<WorkItem | null>(null)
  /** 开发任务/缺陷发起开发执行的目标工作项。 */
  const [developmentExecutionItem, setDevelopmentExecutionItem] = useState<WorkItem | null>(null)
  /** 技术设计任务发起三步只读设计工作流的目标工作项。 */
  const [technicalDesignItem, setTechnicalDesignItem] = useState<WorkItem | null>(null)
  /** 打开 AI 助手后自动执行的动作（如 'STANDARDIZE'），执行后由 onClose 清理。 */
  const [autoRunAction, setAutoRunAction] = useState<string | null>(null)
  /** 全部可选企业用户。 */
  const [userOptions, setUserOptions] = useState<UserOptionItem[]>([])
  /** 项目成员 ID 列表，用于负责人选人分组。 */
  const projectMemberIds = board?.project?.memberUserIds ?? []
  // 首次请求尚未返回时不能把 null 误判成空列表，否则进入页面会先闪出空状态。
  const showWorkItemLoading = !workItems && !wiError
  const selectedWorkItems = useMemo(
    () => workItems?.records.filter((item) => selectedWorkItemIds.has(item.id)) || [],
    [selectedWorkItemIds, workItems],
  )
  const batchAvailability = getBatchWorkItemAvailability(selectedWorkItems)
  const selectedWorkItemType = selectedWorkItems[0]?.workItemType || null
  const allSelectedSameType = batchAvailability.hasSameWorkItemType
  const canBatchRequirementAi = batchAvailability.canRequirementAi
  const canBatchDelete = batchAvailability.canDelete

  const fetchBoard = async () => {
    const requestId = ++boardRequestIdRef.current
    setBoardLoading(true); setBoardError(null)
    try {
      const [data, users] = await Promise.all([getIterationBoard(pid), listUserOptions()])
      if (requestId !== boardRequestIdRef.current) return
      setBoard(data)
      setUserOptions(users)
      // 业务意图：路径中的迭代 ID 优先；同时兼容 GitPilot 已生成的 query 参数链接。
      const requestedIterationId = Number(iterationId || searchParams.get('iterationId'))
      const requestedIteration = Number.isSafeInteger(requestedIterationId) && requestedIterationId > 0
        ? data.iterations.find((i) => i.id === requestedIterationId)
        : undefined
      const active = requestedIteration || data.iterations.find((i) => i.status === '进行中')
      if (active) setSelectedIteration((current) => current || active)
    } catch (err) {
      if (requestId === boardRequestIdRef.current) setBoardError(getErrorMessage(err))
    } finally {
      if (requestId === boardRequestIdRef.current) setBoardLoading(false)
    }
  }

  const fetchWorkItems = useCallback(async () => {
    const requestId = ++workItemRequestIdRef.current
    setWiLoading(true); setWiError(null)
    try {
      const assigneeUserId = assigneeFilter === 'mine'
        ? currentUser?.id
        : assigneeFilter.startsWith('user:')
          ? Number(assigneeFilter.slice('user:'.length))
          : undefined
      const query: Parameters<typeof pageProjectWorkItems>[1] = {
        page, size: 20, keyword: keyword || undefined,
        workItemType: typeFilter === '全部' ? undefined : typeFilter,
        status: statusFilter || undefined,
        priority: advancedFilters.priority || undefined,
        assigneeUserId,
        assigneeUnassigned: assigneeFilter === 'unassigned' ? true : undefined,
        createdFrom: advancedFilters.createdFrom || undefined,
        createdTo: advancedFilters.createdTo || undefined,
        planDateFrom: advancedFilters.planDateFrom || undefined,
        planDateTo: advancedFilters.planDateTo || undefined,
        sortBy,
        sortDirection,
      }
      if (selectedIteration === 'unplanned') query.unplanned = true
      else if (selectedIteration) query.iterationId = selectedIteration.id
      const data = await pageProjectWorkItems(pid, query)
      if (requestId === workItemRequestIdRef.current) setWorkItems(data)
    } catch (err) {
      if (requestId === workItemRequestIdRef.current) setWiError(getErrorMessage(err))
    } finally {
      if (requestId === workItemRequestIdRef.current) setWiLoading(false)
    }
  }, [pid, page, keyword, typeFilter, statusFilter, assigneeFilter, advancedFilters, sortBy, sortDirection, currentUser?.id, selectedIteration])

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
  // 地址变化时恢复对应迭代，让浏览器前进、后退和分享链接都能定位到同一迭代。
  useEffect(() => {
    if (!board) return
    const requestedIterationId = Number(iterationId || searchParams.get('iterationId'))
    if (!Number.isSafeInteger(requestedIterationId) || requestedIterationId <= 0) return
    const requestedIteration = board.iterations.find((item) => item.id === requestedIterationId)
    if (requestedIteration) {
      setSelectedIteration((current) => current !== 'unplanned' && current?.id === requestedIteration.id ? current : requestedIteration)
    }
  }, [board, iterationId, searchParams])
  useEffect(() => { fetchBurndown() }, [fetchBurndown])
  // 等迭代列表加载完成并选定迭代后再拉工作项，避免先拉全量再按迭代拉导致闪烁。
  useEffect(() => {
    if (!boardLoading) fetchWorkItems()
  }, [fetchWorkItems, boardLoading])

  // 迭代与工作项首次加载完成后自动启动新手引导；
  // 用派生布尔值做依赖，避免筛选/翻页替换 workItems 对象时反复触发。
  // 深链自动打开详情抽屉时先不弹，等抽屉关闭后再启动。
  const guideDataReady = !boardLoading && !boardError && workItems !== null && !wiError
  useEffect(() => {
    if (!guideCompleted && currentUser && guideDataReady && !detailItem) {
      const timer = setTimeout(() => startGuide(), 500)
      return () => clearTimeout(timer)
    }
  }, [guideCompleted, currentUser, guideDataReady, detailItem, startGuide])

  // 批量选择只属于当前页的当前筛选上下文；切换后必须丢弃，防止隐藏项被继续提交。
  useEffect(() => {
    setSelectedWorkItemIds(new Set())
    setBatchNotice(null)
  }, [page, typeFilter, statusFilter, assigneeFilter, advancedFilters, keyword, selectedIteration, viewMode, sortBy, sortDirection])

  // 点击高级筛选面板外部时关闭浮层；下拉菜单通过 data-select-menu 保持可继续选择。
  useEffect(() => {
    if (!advancedFiltersOpen) return
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Element
      if (advancedFiltersRef.current?.contains(target) || target.closest('[data-select-menu]')) return
      setAdvancedFiltersOpen(false)
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [advancedFiltersOpen])

  const refreshAll = () => { fetchBoard(); fetchStats() }

  /** 将迭代与详情抽屉状态同步到地址栏，便于复制链接或通过浏览器前进后退恢复。 */
  const syncDetailUrl = (workItemId: number | null, targetIterationId: number | null = selectedIteration && selectedIteration !== 'unplanned' ? selectedIteration.id : null) => {
    const route = workItemId === null
      ? buildPlanningIterationRoute(pid, targetIterationId, searchParams)
      : buildPlanningWorkItemRoute(pid, targetIterationId, workItemId, searchParams)
    navigate(route, { replace: true })
  }

  const handleOpenDetail = async (id: number, options: { iterationId?: number | null; pushHistory?: boolean; preserveHistory?: boolean; previousItem?: WorkItem | null } = {}) => {
    if (options.pushHistory && options.previousItem && options.previousItem.id !== id) {
      setDetailNavigationStack((prev) => [...prev, options.previousItem!])
    } else if (!options.pushHistory && !options.preserveHistory) {
      setDetailNavigationStack([])
    }
    openedTaskIdRef.current = id
    const targetIterationId = options.iterationId ?? (selectedIteration && selectedIteration !== 'unplanned' ? selectedIteration.id : null)
    syncDetailUrl(id, targetIterationId)
    setDetailLoading(true)
    try {
      const item = await getWorkItemDetail(id)
      setDetailItem(item)
      // 关联工作项可能属于另一迭代，详情加载后以真实归属修正固定链接。
      if (item.iterationId !== targetIterationId) syncDetailUrl(id, item.iterationId)
    }
    catch { setDetailItem(null) }
    finally { setDetailLoading(false) }
  }

  // 兼容历史通知中的 openTaskId，并统一迁移到新的工作项路径参数地址。
  useEffect(() => {
    const requestedWorkItemId = Number(workItemId || searchParams.get('openTaskId'))
    if (boardLoading || !Number.isInteger(requestedWorkItemId) || requestedWorkItemId <= 0 || openedTaskIdRef.current === requestedWorkItemId) return
    openedTaskIdRef.current = requestedWorkItemId
    const requestedIterationId = Number(iterationId)
    void handleOpenDetail(requestedWorkItemId, {
      iterationId: Number.isSafeInteger(requestedIterationId) && requestedIterationId > 0 ? requestedIterationId : undefined,
    })
  }, [boardLoading, searchParams, workItemId])

  const handleBackDetail = async () => {
    const previous = detailNavigationStack[detailNavigationStack.length - 1]
    if (!previous) return
    setDetailNavigationStack((prev) => prev.slice(0, -1))
    syncDetailUrl(previous.id, previous.iterationId)
    setDetailLoading(true)
    try { setDetailItem(await getWorkItemDetail(previous.id)) }
    catch { setDetailItem(previous) }
    finally { setDetailLoading(false) }
  }

  const handleCloseDetail = () => {
    openedTaskIdRef.current = null
    syncDetailUrl(null)
    setDetailItem(null)
    setDetailNavigationStack([])
  }

  /** 选择迭代时同步固定路径，并关闭可能已打开的工作项详情。 */
  const handleSelectIteration = (iteration: IterationItem | 'unplanned') => {
    setSelectedIteration(iteration)
    setPage(1)
    openedTaskIdRef.current = null
    setDetailItem(null)
    setDetailNavigationStack([])
    navigate(buildPlanningIterationRoute(pid, iteration === 'unplanned' ? null : iteration.id, searchParams))
  }

  /** 表头排序只修改查询状态，实际数据由列表请求按服务端分页结果返回。 */
  const handleWorkItemSort = (field: WorkItemSortField) => {
    if (sortBy === field) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(field)
      setSortDirection(field === 'createdAt' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  const advancedFilterCount = [
    advancedFilters.priority,
    advancedFilters.createdFrom || advancedFilters.createdTo,
    advancedFilters.planDateFrom || advancedFilters.planDateTo,
  ].filter(Boolean).length

  const openAdvancedFilters = () => {
    setAdvancedFilterDraft({ ...advancedFilters })
    setAdvancedFiltersOpen(true)
  }

  const applyAdvancedFilters = () => {
    setAdvancedFilters({ ...advancedFilterDraft })
    setPage(1)
    setAdvancedFiltersOpen(false)
  }

  const clearAdvancedFilters = () => {
    setAdvancedFilterDraft({ ...EMPTY_ADVANCED_WORK_ITEM_FILTERS })
    setAdvancedFilters({ ...EMPTY_ADVANCED_WORK_ITEM_FILTERS })
    setPage(1)
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

  const handleInlineWorkItemChange = async (item: WorkItem, field: 'status' | 'priority', value: string) => {
    if (item[field] === value) return
    setInlineEditError(null)
    setInlineEditingIds((current) => new Set(current).add(item.id))
    /** 先更新当前行，接口只负责持久化；失败时用保存前快照回滚。 */
    const optimisticChanges = field === 'status'
      ? { status: value, updatedAt: item.updatedAt }
      : { priority: value, updatedAt: item.updatedAt }
    applyInlineWorkItemChanges(item.id, optimisticChanges)
    try {
      const updated = await updateWorkItemInline(item.id, { field: field === 'status' ? 'STATUS' : 'PRIORITY', value })
      applyInlineWorkItemChanges(item.id, { [field]: updated[field], updatedAt: updated.updatedAt || item.updatedAt })
    } catch (err) {
      applyInlineWorkItemChanges(item.id, { [field]: item[field], updatedAt: item.updatedAt })
      setInlineEditError(getErrorMessage(err) || '更新工作项失败')
    } finally {
      setInlineEditingIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  /** 列表内修改负责人时同时提交负责人名称和 ID，确保后端展示字段与关联用户一致。 */
  const handleInlineWorkItemAssigneeChange = async (item: WorkItem, assigneeUserId: number | null): Promise<boolean> => {
    const selectedUser = userOptions.find((user) => user.id === assigneeUserId)
    const assignee = selectedUser?.nickname || selectedUser?.username || ''
    if (item.assigneeUserId === assigneeUserId && (!assigneeUserId || item.assignee === assignee)) return true
    setInlineEditError(null)
    setInlineEditingIds((current) => new Set(current).add(item.id))
    applyInlineWorkItemChanges(item.id, {
      assignee,
      assigneeUserId,
      updatedAt: item.updatedAt,
    })
    try {
      const updated = await updateWorkItemInline(item.id, { field: 'ASSIGNEE', assigneeUserId })
      applyInlineWorkItemChanges(item.id, {
        assignee: updated.assignee,
        assigneeUserId: updated.assigneeUserId,
        updatedAt: updated.updatedAt || item.updatedAt,
      })
      return true
    } catch (err) {
      applyInlineWorkItemChanges(item.id, {
        assignee: item.assignee,
        assigneeUserId: item.assigneeUserId,
        updatedAt: item.updatedAt,
      })
      setInlineEditError(getErrorMessage(err) || '更新负责人失败')
      return false
    } finally {
      setInlineEditingIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  /** 列表内一次提交完整计划周期，避免只修改一端日期时覆盖另一端。 */
  const handleInlineWorkItemDateChange = async (item: WorkItem, startDate: string, endDate: string): Promise<boolean> => {
    if ((item.planStartDate || '') === startDate && (item.planEndDate || '') === endDate) return true
    setInlineEditError(null)
    setInlineEditingIds((current) => new Set(current).add(item.id))
    applyInlineWorkItemChanges(item.id, {
      planStartDate: startDate || null,
      planEndDate: endDate || null,
      updatedAt: item.updatedAt,
    })
    try {
      const updated = await updateWorkItemInline(item.id, {
        field: 'PLAN_DATES',
        planStartDate: startDate || null,
        planEndDate: endDate || null,
      })
      applyInlineWorkItemChanges(item.id, {
        planStartDate: updated.planStartDate,
        planEndDate: updated.planEndDate,
        updatedAt: updated.updatedAt || item.updatedAt,
      })
      return true
    } catch (err) {
      applyInlineWorkItemChanges(item.id, {
        planStartDate: item.planStartDate,
        planEndDate: item.planEndDate,
        updatedAt: item.updatedAt,
      })
      setInlineEditError(getErrorMessage(err) || '更新计划时间失败')
      return false
    } finally {
      setInlineEditingIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  /** 列表快捷更新成功后只合并当前行，避免重新请求迭代看板和完整工作项详情。 */
  const applyInlineWorkItemChanges = (itemId: number, changes: Partial<Pick<WorkItem, 'status' | 'priority' | 'assignee' | 'assigneeUserId' | 'planStartDate' | 'planEndDate' | 'updatedAt'>>) => {
    setWorkItems((current) => current ? {
      ...current,
      records: current.records.map((item) => item.id === itemId ? { ...item, ...changes } : item),
    } : current)
    setDetailItem((current) => current?.id === itemId ? { ...current, ...changes } : current)
  }

  const toggleWorkItemSelection = (id: number) => {
    setSelectedWorkItemIds((current) => toggleBatchWorkItemSelection(current, id))
  }

  const toggleAllVisibleWorkItems = () => {
    const visibleItems = workItems?.records || []
    setSelectedWorkItemIds((current) => toggleAllBatchWorkItemSelection(current, visibleItems.map((item) => item.id)))
  }

  /** 批量字段更新先回读最新工作项，再以完整载荷覆盖单个目标字段，避免覆盖其他人的并发编辑。 */
  const submitBatchFieldChange = async (change: BatchWorkItemChange) => {
    const selectedSnapshot = [...selectedWorkItems]
    if (selectedSnapshot.length === 0) return
    setBatchSubmitting(true)
    setBatchNotice(null)
    const payload = change.field === 'status'
      ? { taskIds: selectedSnapshot.map((item) => item.id), field: 'STATUS' as const, value: change.value }
      : change.field === 'priority'
        ? { taskIds: selectedSnapshot.map((item) => item.id), field: 'PRIORITY' as const, value: change.value }
        : change.field === 'assignee'
          ? { taskIds: selectedSnapshot.map((item) => item.id), field: 'ASSIGNEE' as const, assigneeUserId: change.userId }
          : { taskIds: selectedSnapshot.map((item) => item.id), field: 'ITERATION' as const, iterationId: change.iterationId }
    let failedIds = new Set<number>()
    try {
      const results = await batchUpdateWorkItems(payload)
      failedIds = new Set(results.filter((item) => item.errorMessage).map((item) => item.taskId))
    } catch {
      failedIds = new Set(selectedSnapshot.map((item) => item.id))
    }
    const successCount = selectedSnapshot.length - failedIds.size
    setSelectedWorkItemIds(failedIds)
    setBatchNotice(`批量${batchFieldLabel[change.field]}完成：成功 ${successCount} 项，失败 ${failedIds.size} 项${failedIds.size ? '（失败项已保留选中）' : ''}`)
    setBatchFieldDialog(null)
    await fetchWorkItems()
    if (change.field === 'iteration') await fetchBoard()
    else if (change.field === 'status') await fetchStats()
    if (detailItem && !failedIds.has(detailItem.id)) void handleOpenDetail(detailItem.id, { preserveHistory: true, iterationId: detailItem.iterationId })
    setBatchSubmitting(false)
  }

  const submitBatchDelete = async () => {
    const selectedSnapshot = [...selectedWorkItems]
    if (selectedSnapshot.length === 0) return
    setBatchSubmitting(true)
    setBatchNotice(null)
    let failedIds = new Set<number>()
    try {
      const results = await batchDeleteWorkItems(selectedSnapshot.map((item) => item.id))
      failedIds = new Set(results.filter((item) => item.errorMessage).map((item) => item.taskId))
    } catch {
      failedIds = new Set(selectedSnapshot.map((item) => item.id))
    }
    const successCount = selectedSnapshot.length - failedIds.size
    setSelectedWorkItemIds(failedIds)
    setBatchNotice(`批量删除完成：成功 ${successCount} 项，失败 ${failedIds.size} 项${failedIds.size ? '（失败项已保留选中）' : ''}`)
    setBatchFieldDialog(null)
    if (detailItem && !failedIds.has(detailItem.id)) handleCloseDetail()
    await fetchWorkItems()
    refreshAll()
    setBatchSubmitting(false)
  }

  const submitBatchRequirementAi = async (action: 'STANDARDIZE' | 'BREAKDOWN') => {
    const selectedSnapshot = [...selectedWorkItems]
    if (selectedSnapshot.length === 0) return
    setBatchSubmitting(true)
    let results: BatchRequirementAiResult[]
    let failedIds: Set<number>
    try {
      const response = await generateBatchRequirementAi(selectedSnapshot.map((item) => item.id), { action })
      const itemById = new Map(selectedSnapshot.map((item) => [item.id, item]))
      results = response.map((item) => {
        if (item.executionTask) {
          localStorage.setItem(`requirement-ai-execution:${item.taskId}`, JSON.stringify({ executionId: item.executionTask.id, action }))
        }
        return {
          workItem: itemById.get(item.taskId)!,
          executionTaskId: item.executionTask?.id,
          error: item.errorMessage || undefined,
        }
      })
      failedIds = new Set(response.filter((item) => item.errorMessage).map((item) => item.taskId))
    } catch (error) {
      failedIds = new Set(selectedSnapshot.map((item) => item.id))
      results = selectedSnapshot.map((item) => ({ workItem: item, error: getErrorMessage(error) || '提交失败' }))
    }
    setSelectedWorkItemIds(failedIds)
    setBatchAiResults(results)
    setBatchSubmitting(false)
  }

  /**
   * 详情头部统一使用 Sparkles 智能入口：按需求 AI、技术设计 AI、开发执行顺序分流。
   */
  const handleOpenSmartAction = (item: WorkItem) => {
    if (isRequirementAiEntryVisible(item)) {
      setAiAssistantItem(item)
      return
    }
    if (canCreateExecution && isTechnicalDesignEntryVisible(item)) {
      setTechnicalDesignItem(item)
      return
    }
    if (canCreateExecution && isDevelopmentExecutionEntryVisible(item)) {
      setDevelopmentExecutionItem(item)
    }
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
        <div data-guide-id="planning-iterations" className="hidden lg:flex lg:flex-col w-[260px] shrink-0 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">迭代</h3>
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setIterDialog({ open: true })}>新建</Button>
            </div>
            {boardLoading ? <LoadingSpinner text="加载迭代…" />
              : boardError ? <p className="text-[12px] text-[var(--color-danger)]">{boardError}</p>
              : (
                <div className="space-y-1">
                  <button onClick={() => handleSelectIteration('unplanned')}
                    className={cn('w-full flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors text-left',
                      selectedIteration === 'unplanned' ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]')}>
                    <span>未规划</span>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">{board?.unplannedCount ?? 0}</span>
                  </button>
                  {board?.iterations.map((iter) => {
                    const isSelected = selectedIteration && selectedIteration !== 'unplanned' && (selectedIteration as IterationItem).id === iter.id
                    return (
                      <div key={iter.id} className={cn('group rounded-lg transition-colors', isSelected ? 'bg-[var(--color-primary-light)] border border-[var(--color-primary)]/15' : 'hover:bg-[var(--color-bg-hover)]')}>
                        <button onClick={() => handleSelectIteration(iter)} className="w-full px-3 py-2.5 text-left">
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
                  if (val === 'unplanned') handleSelectIteration('unplanned')
                  else {
                    const iter = board.iterations.find((i) => i.id === Number(val))
                    if (iter) handleSelectIteration(iter)
                  }
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
              <div data-guide-id="planning-type-tabs" className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)]">
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
              {/* 负责人筛选复用列表负责人选择器的分组：未分配、我负责的、项目成员、企业成员。 */}
              <AssigneeFilterPicker
                value={assigneeFilter}
                onChange={(v) => { setAssigneeFilter(v); setPage(1) }}
                userOptions={userOptions}
                projectMemberIds={projectMemberIds}
                currentUserId={currentUser?.id || null}
                ariaLabel="按负责人筛选工作项"
                className="w-[150px]"
              />
              <div ref={advancedFiltersRef} className="relative">
                <button
                  type="button"
                  onClick={() => advancedFiltersOpen ? setAdvancedFiltersOpen(false) : openAdvancedFilters()}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors',
                    advancedFiltersOpen || advancedFilterCount > 0
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border-strong)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  筛选
                  {advancedFilterCount > 0 && <span className="rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">{advancedFilterCount}</span>}
                </button>

                {advancedFiltersOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-visible rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-xl)]">
                    <div className="flex items-start justify-between border-b border-[var(--color-border-light)] px-5 py-4">
                      <div>
                        <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">筛选条件</h3>
                        <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">设置完成后点击筛选，列表位置保持不变。</p>
                      </div>
                      <button type="button" aria-label="关闭高级筛选" onClick={() => setAdvancedFiltersOpen(false)} className="rounded-lg p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="p-5">
                      <div className="flex flex-col gap-4">
                        <Select
                          label="优先级"
                          value={advancedFilterDraft.priority}
                          onChange={(value) => setAdvancedFilterDraft((current) => ({ ...current, priority: value }))}
                          options={[
                            { value: '', label: '全部优先级' },
                            { value: '高', label: '高', icon: <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> },
                            { value: '中', label: '中', icon: <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> },
                            { value: '低', label: '低', icon: <span className="inline-block h-2 w-2 rounded-full bg-gray-400" /> },
                          ]}
                          placeholder="全部优先级"
                        />
                        <DateRangePicker
                          label="创建时间"
                          startDate={advancedFilterDraft.createdFrom}
                          endDate={advancedFilterDraft.createdTo}
                          onChange={(start, end) => setAdvancedFilterDraft((current) => ({ ...current, createdFrom: start, createdTo: end }))}
                          ariaLabel="筛选创建时间范围"
                        />
                        <DateRangePicker
                          label="计划时间"
                          startDate={advancedFilterDraft.planDateFrom}
                          endDate={advancedFilterDraft.planDateTo}
                          onChange={(start, end) => setAdvancedFilterDraft((current) => ({ ...current, planDateFrom: start, planDateTo: end }))}
                          ariaLabel="筛选计划时间范围"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-[var(--color-border-light)] px-5 py-4">
                      <button type="button" onClick={clearAdvancedFilters} className="rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">重置</button>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => { setAdvancedFilterDraft({ ...advancedFilters }); setAdvancedFiltersOpen(false) }}>取消</Button>
                        <Button size="sm" onClick={applyAdvancedFilters}>筛选</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* 视图切换 */}
              <div data-guide-id="planning-view-switch" className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-0.5 shadow-[var(--shadow-xs)]">
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
              <Button data-guide-id="planning-create" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setWiDialog({ open: true })}>新建工作项</Button>
            </div>
           </div>

           {viewMode === 'list' && selectedWorkItems.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--color-primary)]/25 bg-[var(--color-primary-light)]/45 px-4 py-3 shadow-[var(--shadow-xs)] lg:flex-row lg:items-center">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-primary)]">
                <CheckSquare className="h-4 w-4" />
                已选 {selectedWorkItems.length} 项
                <button type="button" onClick={() => setSelectedWorkItemIds(new Set())} className="ml-1 text-[12px] font-normal text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]">清空</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                {allSelectedSameType && <Button size="sm" variant="secondary" onClick={() => setBatchFieldDialog('status')}>改状态</Button>}
                <Button size="sm" variant="secondary" onClick={() => setBatchFieldDialog('priority')}>改优先级</Button>
                <Button size="sm" variant="secondary" onClick={() => setBatchFieldDialog('assignee')}>改负责人</Button>
                <Button size="sm" variant="secondary" onClick={() => setBatchFieldDialog('iteration')}>移至迭代</Button>
                {canBatchRequirementAi && <Button size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => { setBatchAiResults(null); setBatchAiDialogOpen(true) }}>需求 AI</Button>}
                {canBatchDelete && <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setBatchFieldDialog('delete')}>删除</Button>}
              </div>
            </div>
          )}

          {batchNotice && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-800">
              <span>{batchNotice}</span>
              <button type="button" onClick={() => setBatchNotice(null)} className="text-sky-700 hover:text-sky-900"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

           {/* 内容 */}
           <div className="relative min-h-[240px]">
           {wiLoading && workItems && (
             <div role="status" aria-live="polite" className="pointer-events-none absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)]/95 px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
               <Loader2 className="h-3 w-3 animate-spin text-[var(--color-primary)]" />
               更新中
             </div>
           )}
           {boardError ? <ErrorState description={boardError} onRetry={fetchBoard} />
             : showWorkItemLoading || (wiLoading && !workItems) ? <div className="flex min-h-[240px] items-start"><LoadingSpinner text="加载工作项…" /></div>
             : wiError ? <ErrorState description={wiError} onRetry={fetchWorkItems} />
            : !workItems || workItems.records.length === 0
              ? <div className="min-h-[240px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]"><EmptyState title="暂无工作项" description="点击右上角「新建工作项」开始。" icon={<CheckSquare className="h-6 w-6" strokeWidth={1.5} />} /></div>
              : viewMode === 'list'
                ? <WorkItemTable items={workItems} selectedIds={selectedWorkItemIds} inlineEditingIds={inlineEditingIds} sortBy={sortBy} sortDirection={sortDirection} onSort={handleWorkItemSort} onToggleSelect={toggleWorkItemSelection} onToggleSelectAll={toggleAllVisibleWorkItems} onOpenDetail={(item) => handleOpenDetail(item.id, { iterationId: item.iterationId })} onEdit={(w) => setWiDialog({ open: true, editing: w })} onDelete={(w) => setDeleteConfirm({ type: 'workItem', id: w.id, name: w.name })} onInlineChange={handleInlineWorkItemChange} onAssigneeChange={handleInlineWorkItemAssigneeChange} onPlanDateChange={handleInlineWorkItemDateChange} userOptions={userOptions} projectMemberIds={projectMemberIds} error={inlineEditError} page={page} totalPages={workItems.totalPages} total={workItems.total} onPageChange={setPage} />
                : <KanbanBoard items={workItems.records} onOpenDetail={(item) => handleOpenDetail(item.id, { iterationId: item.iterationId })} />
          }
          </div>
        </div>
      </div>

      {/* ── 弹窗 ── */}
      {iterDialog.open && <IterationDialog projectId={pid} editing={iterDialog.editing} onClose={() => setIterDialog({ open: false })} onSaved={() => { setIterDialog({ open: false }); fetchBoard() }} />}
      {wiDialog.open && <WorkItemDialog projectId={pid} editing={wiDialog.editing} iterationId={selectedIteration && selectedIteration !== 'unplanned' ? selectedIteration.id : undefined} userOptions={userOptions} projectMemberIds={projectMemberIds} onClose={() => setWiDialog({ open: false })} onSaved={(result) => { setWiDialog({ open: false }); refreshAll(); if (result?.autoStandardize && result.item) { setAiAssistantItem(result.item); setAutoRunAction('STANDARDIZE') } }} />}
      {detailItem && <WorkItemDetailDrawer item={detailItem} loading={detailLoading} userOptions={userOptions} canGoBack={detailNavigationStack.length > 0} canCreateExecution={canCreateExecution} onBack={handleBackDetail} onClose={handleCloseDetail} onEdit={() => { openedTaskIdRef.current = null; syncDetailUrl(null); setWiDialog({ open: true, editing: detailItem }); setDetailItem(null); setDetailNavigationStack([]) }} onDelete={(w) => { openedTaskIdRef.current = null; syncDetailUrl(null); setDetailItem(null); setDetailNavigationStack([]); setDeleteConfirm({ type: 'workItem', id: w.id, name: w.name }) }} onRefresh={(id) => handleOpenDetail(id, { preserveHistory: true })} onOpenLinkedWorkItem={(id) => handleOpenDetail(id, { pushHistory: true, previousItem: detailItem })} onOpenAi={() => handleOpenSmartAction(detailItem)} />}
      {deleteConfirm && <DeleteConfirmDialog name={deleteConfirm.name} onCancel={() => setDeleteConfirm(null)} onConfirm={handleDeleteConfirm} />}
      {batchFieldDialog && batchFieldDialog !== 'delete' && (
        <BatchWorkItemFieldDialog
          field={batchFieldDialog}
          itemCount={selectedWorkItems.length}
          workItemType={selectedWorkItemType}
          iterations={board?.iterations || []}
          userOptions={userOptions}
          projectMemberIds={projectMemberIds}
          submitting={batchSubmitting}
          onClose={() => setBatchFieldDialog(null)}
          onSubmit={submitBatchFieldChange}
        />
      )}
      {batchFieldDialog === 'delete' && (
        <BatchDeleteConfirmDialog
          itemCount={selectedWorkItems.length}
          submitting={batchSubmitting}
          onClose={() => setBatchFieldDialog(null)}
          onConfirm={submitBatchDelete}
        />
      )}
      {batchAiDialogOpen && (
        <BatchRequirementAiDialog
          selectedItems={selectedWorkItems}
          results={batchAiResults}
          submitting={batchSubmitting}
          onClose={() => { setBatchAiDialogOpen(false); setBatchAiResults(null) }}
          onSubmit={submitBatchRequirementAi}
          onOpenExecution={(id) => navigate(`/projects/${pid}/execution/tasks/${id}`)}
          onOpenExecutionCenter={() => navigate(`/projects/${pid}/execution`)}
        />
      )}
      {aiAssistantItem && isRequirementAiEntryVisible(aiAssistantItem) && <RequirementAiDialog open={true} workItem={aiAssistantItem} userOptions={userOptions} projectMemberIds={projectMemberIds} onClose={() => { setAiAssistantItem(null); setAutoRunAction(null) }} onChanged={() => { if (detailItem?.id === aiAssistantItem.id) handleOpenDetail(aiAssistantItem.id); refreshAll() }} autoRunAction={autoRunAction} />}
      {technicalDesignItem && <TechnicalDesignAiDialog open={true} workItem={technicalDesignItem} onClose={() => setTechnicalDesignItem(null)} onCreated={(executionTask) => { const sourceItem = technicalDesignItem; setTechnicalDesignItem(null); refreshAll(); navigate(`/projects/${executionTask.projectId || sourceItem.projectId}/execution/tasks/${executionTask.id}`) }} />}
      {developmentExecutionItem && <DevelopmentExecutionDialog open={true} workItem={developmentExecutionItem} onClose={() => setDevelopmentExecutionItem(null)} onCreated={(executionTask) => { const sourceItem = developmentExecutionItem; setDevelopmentExecutionItem(null); if (detailItem?.id === sourceItem.id) handleOpenDetail(sourceItem.id, { preserveHistory: true }); refreshAll(); navigate(`/projects/${executionTask.projectId || sourceItem.projectId}/execution/tasks/${executionTask.id}`) }} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   工作项表格
   ═══════════════════════════════════════════════ */

const SortableWorkItemHeader = ({ label, field, activeField, direction, onSort, className }: {
  label: string
  field: WorkItemSortField
  activeField: WorkItemSortField
  direction: WorkItemSortDirection
  onSort: (field: WorkItemSortField) => void
  className?: string
}) => {
  const Icon = activeField !== field ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={cn('px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider', className)}>
      <button
        type="button"
        aria-label={`按${label}${activeField === field && direction === 'asc' ? '降序' : '升序'}排序`}
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-primary)]"
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  )
}

const WorkItemTable = ({ items, selectedIds, inlineEditingIds, sortBy, sortDirection, onSort, onToggleSelect, onToggleSelectAll, onOpenDetail, onEdit, onDelete, onInlineChange, onAssigneeChange, onPlanDateChange, userOptions, projectMemberIds, error, page, totalPages, total, onPageChange }: {
  items: PageResponse<WorkItem>; onOpenDetail: (item: WorkItem) => void; onEdit: (w: WorkItem) => void; onDelete: (w: WorkItem) => void
  selectedIds: Set<number>; inlineEditingIds: Set<number>; onToggleSelect: (id: number) => void; onToggleSelectAll: () => void
  sortBy: WorkItemSortField; sortDirection: WorkItemSortDirection; onSort: (field: WorkItemSortField) => void
  onInlineChange: (item: WorkItem, field: 'status' | 'priority', value: string) => void; error: string | null
  onAssigneeChange: (item: WorkItem, assigneeUserId: number | null) => Promise<boolean>
  onPlanDateChange: (item: WorkItem, startDate: string, endDate: string) => Promise<boolean>
  userOptions: UserOptionItem[]; projectMemberIds: number[]
  page: number; totalPages: number; total: number; onPageChange: (p: number) => void
}) => {
  const allSelected = items.records.length > 0 && items.records.every((item) => selectedIds.has(item.id))
  const someSelected = items.records.some((item) => selectedIds.has(item.id))
  return (
  <div className="h-full flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
    {error && (
      <div className="border-b border-red-100 bg-[var(--color-danger-light)] px-4 py-2 text-[12px] text-[var(--color-danger)]">
        {error}
      </div>
    )}
    <div className="flex-1 overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-[var(--color-border-light)] bg-[var(--color-bg-page)]/80 backdrop-blur-sm">
            <th className="w-[44px] px-3 py-2 text-center">
              <input
                aria-label="选择当前页全部工作项"
                type="checkbox"
                checked={allSelected}
                ref={(node) => { if (node) node.indeterminate = !allSelected && someSelected }}
                onChange={onToggleSelectAll}
                className="h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </th>
            <SortableWorkItemHeader label="工作项" field="name" activeField={sortBy} direction={sortDirection} onSort={onSort} className="px-4" />
            <SortableWorkItemHeader label="类型" field="workItemType" activeField={sortBy} direction={sortDirection} onSort={onSort} className="w-[70px]" />
            <SortableWorkItemHeader label="状态" field="status" activeField={sortBy} direction={sortDirection} onSort={onSort} className="w-[80px]" />
            <SortableWorkItemHeader label="优先级" field="priority" activeField={sortBy} direction={sortDirection} onSort={onSort} className="w-[55px]" />
            <SortableWorkItemHeader label="负责人" field="assignee" activeField={sortBy} direction={sortDirection} onSort={onSort} className="w-[150px]" />
            <SortableWorkItemHeader label="计划时间" field="planStartDate" activeField={sortBy} direction={sortDirection} onSort={onSort} className="w-[180px]" />
            <SortableWorkItemHeader label="创建时间" field="createdAt" activeField={sortBy} direction={sortDirection} onSort={onSort} className="w-[120px]" />
            <th className="px-3 py-2 w-[70px]" />
          </tr>
        </thead>
      <tbody className="divide-y divide-[var(--color-border-light)]">
        {items.records.map((item) => {
          const TypeIcon = typeIconMap[item.workItemType] || FileText
          const inlineEditing = inlineEditingIds.has(item.id)
          return (
            <tr key={item.id} aria-busy={inlineEditing || undefined} className={cn('group cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]/50', inlineEditing && 'bg-[var(--color-primary-light)]/20')} onClick={() => onOpenDetail(item)}>
              <td className="px-3 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                <input
                  aria-label={`选择工作项 ${item.name}`}
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => onToggleSelect(item.id)}
                  className="h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </td>
              <td className="px-4 py-2 max-w-0"><div className="flex items-center gap-2 min-w-0">{item.workItemCode && <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] shrink-0">{item.workItemCode}</span>}<span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{item.name}</span></div></td>
              <td className="px-3 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-secondary)]"><TypeIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />{item.workItemType}</span></td>
              <td className="px-3 py-2 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                <InlineStatusSelect
                  item={item}
                  onChange={(value) => onInlineChange(item, 'status', value)}
                />
              </td>
              <td className="px-3 py-2 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                <InlinePrioritySelect
                  value={item.priority}
                  onChange={(value) => onInlineChange(item, 'priority', value)}
                />
              </td>
              <td className="px-3 py-2 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                <InlineAssigneePicker item={item} userOptions={userOptions} projectMemberIds={projectMemberIds} onChange={onAssigneeChange} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                <InlinePlanDateRangePicker item={item} onChange={onPlanDateChange} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-[12px] text-[var(--color-text-tertiary)]">{formatDateTime(item.createdAt)}</td>
              <td className="px-3 py-2">
                {inlineEditing ? (
                  <div className="flex items-center justify-end pr-1" title="保存中" aria-label="保存中">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-primary)]" />
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(item) }} className="rounded p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-primary)]"><Edit3 className="h-3.5 w-3.5" /></button>
                    {item.canDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(item) }} className="rounded p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                )}
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
}

/** 工作项列表中的紧凑负责人选择器，保存期间禁用重复操作。 */
const InlineAssigneePicker = ({ item, userOptions, projectMemberIds, onChange }: {
  item: WorkItem
  userOptions: UserOptionItem[]
  projectMemberIds: number[]
  onChange: (item: WorkItem, assigneeUserId: number | null) => Promise<boolean>
}) => {
  const [saving, setSaving] = useState(false)

  const handleChange = async (assigneeUserId: number | null) => {
    if (saving) return
    setSaving(true)
    try {
      await onChange(item, assigneeUserId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn('min-w-[132px]', saving && 'pointer-events-none opacity-60')}>
      <AssigneePicker
        value={item.assigneeUserId}
        onChange={(assigneeUserId) => { void handleChange(assigneeUserId) }}
        userOptions={userOptions}
        projectMemberIds={projectMemberIds}
        compact
        ariaLabel={`修改工作项「${item.name}」的负责人`}
      />
    </div>
  )
}

/** 工作项列表中的紧凑计划周期编辑器；只有选择完整范围或清除范围时才提交。 */
const InlinePlanDateRangePicker = ({ item, onChange }: {
  item: WorkItem
  onChange: (item: WorkItem, startDate: string, endDate: string) => Promise<boolean>
}) => {
  const [draft, setDraft] = useState({ startDate: item.planStartDate || '', endDate: item.planEndDate || '' })

  useEffect(() => {
    setDraft({ startDate: item.planStartDate || '', endDate: item.planEndDate || '' })
  }, [item.planStartDate, item.planEndDate])

  const handleChange = async (startDate: string, endDate: string) => {
    setDraft({ startDate, endDate })
    if ((startDate && endDate) || (!startDate && !endDate)) {
      const saved = await onChange(item, startDate, endDate)
      if (!saved) setDraft({ startDate: item.planStartDate || '', endDate: item.planEndDate || '' })
    }
  }

  return (
    <DateRangePicker
      startDate={draft.startDate}
      endDate={draft.endDate}
      onChange={(startDate, endDate) => { void handleChange(startDate, endDate) }}
      compact
      ariaLabel={`修改工作项「${item.name}」的计划时间`}
    />
  )
}

const InlineStatusSelect = ({ item, onChange }: { item: WorkItem; onChange: (value: string) => void }) => {
  const options = statusOptions[item.workItemType] || statusOptions['任务']

  return (
    <Select
      title="修改工作项状态"
      value={item.status}
      onChange={onChange}
      options={options.map((option) => ({
        value: option,
        label: option,
        icon: <span className={cn('h-2 w-2 rounded-full', statusDotColorMap[option] || 'bg-slate-400')} />,
      }))}
      className={cn(
        'w-[116px]',
        '[&>div>button]:h-8 [&>div>button]:rounded-full [&>div>button]:border-transparent [&>div>button]:px-3 [&>div>button]:text-[12px] [&>div>button]:font-semibold',
        '[&>div>button]:hover:border-[var(--color-border-strong)]',
        statusInlineSelectClassMap[item.status] || '[&>div>button]:bg-gray-100 [&>div>button]:text-gray-600',
      )}
    />
  )
}

const InlinePrioritySelect = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <Select
    title="修改工作项优先级"
    value={value}
    onChange={onChange}
    options={['高', '中', '低'].map((option) => ({
      value: option,
      label: option,
      icon: <span className={cn('h-2 w-2 rounded-full', priorityDotColorMap[option])} />,
    }))}
    className={cn(
      'w-[86px]',
      '[&>div>button]:h-8 [&>div>button]:rounded-full [&>div>button]:border-transparent [&>div>button]:px-3 [&>div>button]:text-[12px] [&>div>button]:font-semibold',
      '[&>div>button]:hover:border-[var(--color-border-strong)]',
      priorityBadgeColorMap[value] || '[&>div>button]:border-slate-200 [&>div>button]:bg-slate-100 [&>div>button]:text-slate-600',
    )}
  />
)

/* ═══════════════════════════════════════════════
   看板视图
   ═══════════════════════════════════════════════ */

const KanbanBoard = ({ items, onOpenDetail }: { items: WorkItem[]; onOpenDetail: (item: WorkItem) => void }) => {
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
                <button key={item.id} onClick={() => onOpenDetail(item)}
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

const WorkItemDialog = ({ projectId, editing, iterationId, userOptions, projectMemberIds, onClose, onSaved }: {
  projectId: number; editing?: WorkItem; iterationId?: number; userOptions: UserOptionItem[]; projectMemberIds: number[]; onClose: () => void
  onSaved: (result?: { item: WorkItem; autoStandardize: boolean }) => void
}) => {
  const [form, setForm] = useState({
    name: editing?.name || '', workItemType: editing?.workItemType || '任务', status: editing?.status || '待开始',
    taskType: (editing?.workItemType || '任务') === '任务' ? normalizeTaskType(editing?.taskType) : '',
    priority: editing?.priority || '中', assignee: editing?.assignee || '', assigneeUserId: editing?.assigneeUserId ?? null,
    collaboratorUserIds: editing?.collaboratorUserIds || [],
    description: editing?.description || '', planStartDate: editing?.planStartDate || '', planEndDate: editing?.planEndDate || '',
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
        taskType: form.workItemType === '任务' ? normalizeTaskType(form.taskType) : null,
        iterationId: editing?.iterationId ?? iterationId ?? null,
        planStartDate: form.planStartDate || null,
        planEndDate: form.planEndDate || null,
        assigneeUserId: form.assigneeUserId,
        collaboratorUserIds: form.collaboratorUserIds,
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
      width="clamp(800px, 52vw, 1040px)"
      maxWidth="calc(100vw - 48px)"
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
            onChange={(v) => {
              setForm({
                ...form,
                workItemType: v,
                taskType: v === '任务' ? normalizeTaskType(form.taskType) : '',
                status: (statusOptions[v] || ['待开始'])[0],
              })
              setAutoStandardize(false)
            }}
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
        {form.workItemType === '任务' && (
          <Select
            label="任务类型"
            value={form.taskType}
            onChange={(v) => setForm({ ...form, taskType: v })}
            options={TASK_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <WorkItemMemberPicker
            label="负责人 / 协作人"
            assigneeUserId={form.assigneeUserId}
            collaboratorUserIds={form.collaboratorUserIds}
            userOptions={userOptions}
            projectMemberIds={projectMemberIds}
            onChange={({ assigneeUserId, collaboratorUserIds }) => {
              const selected = userOptions.find((u) => u.id === assigneeUserId)
              setForm({
                ...form,
                assigneeUserId,
                assignee: selected?.nickname || selected?.username || '',
                collaboratorUserIds,
              })
            }}
          />
          <DateRangePicker
            label="计划时间"
            startDate={form.planStartDate}
            endDate={form.planEndDate}
            onChange={(start, end) => setForm({ ...form, planStartDate: start, planEndDate: end })}
          />
        </div>
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

const WorkItemDetailDrawer = ({ item, loading, userOptions, canGoBack, canCreateExecution, onBack, onClose, onEdit, onDelete, onRefresh, onOpenLinkedWorkItem, onOpenAi }: {
  item: WorkItem; loading: boolean; userOptions: UserOptionItem[]; onClose: () => void; onEdit: () => void
  canGoBack: boolean; onBack: () => void; onDelete: (item: WorkItem) => void; onRefresh: (id: number) => void
  canCreateExecution: boolean; onOpenLinkedWorkItem: (id: number) => void; onOpenAi?: () => void
}) => {
  const TypeIcon = typeIconMap[item.workItemType] || FileText
  const [comments, setComments] = useState<TaskComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [updateRecordCount, setUpdateRecordCount] = useState(0)
  const [activeTab, setActiveTab] = useState<DetailTab>('detail')
  const [activityTab, setActivityTab] = useState<ActivityTab>('comments')
  const [links, setLinks] = useState<WorkItemLinks | null>(null)
  const [linksLoading, setLinksLoading] = useState(false)
  const [workItemOptions, setWorkItemOptions] = useState<WorkItem[]>([])
  const [selectedWorkItemId, setSelectedWorkItemId] = useState('')
  const [testCaseOptions, setTestCaseOptions] = useState<LinkedTestCase[]>([])
  const [selectedTestCaseId, setSelectedTestCaseId] = useState('')
  const [linkSubmitting, setLinkSubmitting] = useState(false)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
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
  const assigneeUser = userOptions.find((user) => user.id === item.assigneeUserId) || null
  const collaboratorUsers = item.collaboratorUserIds
    .map((id) => userOptions.find((user) => user.id === id))
    .filter((user): user is UserOptionItem => Boolean(user))

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
    setActiveTab('detail')
    setActivityTab('comments')
    setUpdateRecordCount(0)
    setCommentsLoading(true)
    listTaskComments(item.id)
      .then((data) => { if (!cancelled) setComments(data) })
      .catch(() => { if (!cancelled) setComments([]) })
      .finally(() => { if (!cancelled) setCommentsLoading(false) })
    return () => { cancelled = true }
  }, [item.id])

  useEffect(() => {
    let cancelled = false
    pageTaskUpdateRecords(item.id, { page: 1, size: 1 })
      .then((data) => { if (!cancelled) setUpdateRecordCount(data.total) })
      .catch(() => { if (!cancelled) setUpdateRecordCount(0) })
    return () => { cancelled = true }
  }, [item.id, historyRefreshKey])

  useEffect(() => {
    let cancelled = false
    setLinksLoading(true)
    Promise.all([
      getWorkItemLinks(item.id),
      listProjectWorkItems(item.projectId, {}),
      pageProjectTestCases(item.projectId, { page: 1, size: 50 }),
    ])
      .then(([linkData, workItems, testCases]) => {
        if (cancelled) return
        setLinks(linkData)
        setWorkItemOptions(workItems.filter((option) => option.id !== item.id))
        setTestCaseOptions(testCases.records)
      })
      .catch(() => {
        if (cancelled) return
        setLinks(null)
        setWorkItemOptions([])
        setTestCaseOptions([])
      })
      .finally(() => { if (!cancelled) setLinksLoading(false) })
    return () => { cancelled = true }
  }, [item.id, item.projectId])

  // 提交评论
  const handleSubmitComment = async () => {
    if (!commentText.trim() || commentSubmitting) return
    setCommentSubmitting(true)
    try {
      const newComment = await createTaskComment(item.id, commentText)
      setComments((prev) => [...prev, newComment])
      setHistoryRefreshKey((value) => value + 1)
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
        workItemType: item.workItemType,
        taskType: item.workItemType === '任务' ? normalizeTaskType(item.taskType) : null,
        assignee: item.assignee, description: item.description,
        assigneeUserId: item.assigneeUserId,
        collaboratorUserIds: item.collaboratorUserIds,
        planStartDate: item.planStartDate,
        planEndDate: item.planEndDate,
        projectId: item.projectId, agentId: item.agentId,
        iterationId: item.iterationId,
        requirementTaskId: item.requirementTaskId,
      })
      onRefresh(item.id)
      setHistoryRefreshKey((value) => value + 1)
    } catch { /* 静默 */ }
    finally { setStatusUpdating(false) }
  }

  const updateLinks = async (operation: () => Promise<WorkItemLinks>) => {
    if (linkSubmitting) return
    setLinkSubmitting(true)
    try {
      setLinks(await operation())
      setHistoryRefreshKey((value) => value + 1)
      setSelectedWorkItemId('')
      setSelectedTestCaseId('')
    } catch { /* 静默，由后续统一错误提示补充 */ }
    finally { setLinkSubmitting(false) }
  }

  const handleUploadAttachment = async (file: File | null) => {
    if (!file || attachmentUploading) return
    setAttachmentUploading(true)
    try {
      await uploadWorkItemAttachment(item.id, file)
      setLinks(await getWorkItemLinks(item.id))
      setHistoryRefreshKey((value) => value + 1)
    } catch { /* 静默 */ }
    finally { setAttachmentUploading(false) }
  }

  const handleDownloadAttachment = async (attachmentId: number) => {
    const result = await downloadWorkItemAttachment(item.id, attachmentId)
    const url = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(buildWorkItemShareUrl(window.location, item.projectId, item.iterationId, item.id))
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // 剪贴板受浏览器权限限制时不打断抽屉使用。
    }
  }

  /** 头部操作按钮，渲染在 SlideDrawer 关闭按钮之前 */
  const headerActions = (
    <>
      {canGoBack && (
        <button onClick={onBack} title="返回上一工作项" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-2.5 text-[12px] font-semibold whitespace-nowrap text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)]/35 hover:bg-[var(--color-primary)]/15">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </button>
      )}
      <button onClick={handleCopyShareLink} title="复制工作项链接" aria-label="复制工作项链接" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-primary)]">
        {shareCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {shareCopied ? '已复制' : '复制链接'}
      </button>
      {(isRequirementAiEntryVisible(item) || (canCreateExecution && (isTechnicalDesignEntryVisible(item) || isDevelopmentExecutionEntryVisible(item)))) && onOpenAi && (
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
      width="clamp(800px, 52vw, 1040px)"
      maxWidth="calc(100vw - 48px)"
      headerActions={headerActions}
    >
      {loading ? <LoadingSpinner fullscreen text="加载中…" /> : (
        <div className="p-6 pb-4">
          <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] p-1">
            {detailTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-white text-[var(--color-primary)] shadow-[var(--shadow-xs)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-white/70',
                )}
              >
                <span>{tab.label}</span>
                {getDetailTabCount(tab.key, links) > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[11px] font-bold leading-none text-white">
                    {getDetailTabCount(tab.key, links)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'detail' ? (
          <div className="space-y-5">
          {/* 属性网格 */}
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="类型"><span className="inline-flex items-center gap-1.5 text-[13px]"><TypeIcon className="h-4 w-4" strokeWidth={1.75} />{item.workItemType}</span></DetailField>
            {item.workItemType === '任务' && <DetailField label="任务类型"><span className="text-[13px]">{normalizeTaskType(item.taskType)}</span></DetailField>}
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
            <DetailField label="成员">
              <WorkItemMemberSummary assigneeUser={assigneeUser} assigneeName={item.assignee} collaboratorUsers={collaboratorUsers} collaboratorNames={item.collaboratorNames} />
            </DetailField>
            <DetailField label="迭代"><span className="text-[13px]">{item.iterationName || '未规划'}</span></DetailField>
            <DetailField label="所属项目"><span className="text-[13px]">{item.projectName}</span></DetailField>
            <DetailField label="创建人"><span className="inline-flex items-center gap-1 text-[13px]"><User className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" strokeWidth={1.75} />{item.creatorName || '未知'}</span></DetailField>
            <DetailField label="创建时间"><span className="text-[13px] text-[var(--color-text-secondary)]">{formatDateTime(item.createdAt)}</span></DetailField>
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

          <section className="detail-activity-tabs mt-7 min-h-[420px] border-t border-[var(--color-border-light)] pt-5" aria-label="工作项协作记录">
            <div className="mb-4 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] p-1">
              <button
                type="button"
                onClick={() => setActivityTab('comments')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  activityTab === 'comments' ? 'bg-white text-[var(--color-primary)] shadow-[var(--shadow-xs)]' : 'text-[var(--color-text-secondary)] hover:bg-white/70',
                )}
              >
                评论
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[11px] font-bold leading-none text-white">{comments.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('updateRecords')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  activityTab === 'updateRecords' ? 'bg-white text-[var(--color-primary)] shadow-[var(--shadow-xs)]' : 'text-[var(--color-text-secondary)] hover:bg-white/70',
                )}
              >
                更新记录
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[11px] font-bold leading-none text-white">{updateRecordCount}</span>
              </button>
            </div>

            {activityTab === 'comments' ? (
              <div id="comments-section" className="space-y-4">
                <div>
                  <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">评论</h4>
                  {commentsLoading ? (
                    <div className="py-4 text-center text-[13px] text-[var(--color-text-tertiary)]">加载评论中…</div>
                  ) : comments.length === 0 ? (
                    <div className="py-4 text-center text-[13px] text-[var(--color-text-tertiary)]">暂无评论</div>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((c) => (
                        <div key={c.id} className="rounded-lg border border-[var(--color-border-light)] bg-white p-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{c.authorName || '未知用户'}</span>
                            <span className="text-[11px] text-[var(--color-text-tertiary)]">{formatDate(c.createdAt)}</span>
                          </div>
                          <div className="text-[13px]"><Markdown content={c.content} /></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
            ) : (
              <WorkItemUpdateTimeline
                taskId={item.id}
                refreshKey={historyRefreshKey}
                onCountChange={setUpdateRecordCount}
              />
            )}
          </section>

          <p className="text-[11px] text-[var(--color-text-tertiary)]">最后更新：{formatDate(item.updatedAt)}</p>
          </div>
          ) : (
            <WorkItemLinksPanel
              tab={activeTab}
              item={item}
              links={links}
              loading={linksLoading}
              linkSubmitting={linkSubmitting}
              workItemOptions={workItemOptions}
              selectedWorkItemId={selectedWorkItemId}
              onSelectedWorkItemChange={setSelectedWorkItemId}
              testCaseOptions={testCaseOptions}
              selectedTestCaseId={selectedTestCaseId}
              onSelectedTestCaseChange={setSelectedTestCaseId}
              onOpenWorkItem={onOpenLinkedWorkItem}
              onAddChild={() => selectedWorkItemId && updateLinks(() => addWorkItemChild(item.id, Number(selectedWorkItemId)))}
              onRemoveChild={(id) => updateLinks(() => removeWorkItemChild(item.id, id))}
              onAddRelated={() => selectedWorkItemId && updateLinks(() => addRelatedWorkItem(item.id, Number(selectedWorkItemId)))}
              onRemoveRelated={(id) => updateLinks(() => removeRelatedWorkItem(item.id, id))}
              onAddTestCase={() => selectedTestCaseId && updateLinks(() => addWorkItemTestCase(item.id, Number(selectedTestCaseId)))}
              onRemoveTestCase={(id) => updateLinks(() => removeWorkItemTestCase(item.id, id))}
              attachmentUploading={attachmentUploading}
              onUploadAttachment={handleUploadAttachment}
              onDownloadAttachment={handleDownloadAttachment}
              onDeleteAttachment={(id) => updateLinks(() => deleteWorkItemAttachment(item.id, id))}
            />
          )}
        </div>
      )}
    </SlideDrawer>
  )
}

const WorkItemLinksPanel = ({
  tab,
  item,
  links,
  loading,
  linkSubmitting,
  workItemOptions,
  selectedWorkItemId,
  onSelectedWorkItemChange,
  testCaseOptions,
  selectedTestCaseId,
  onSelectedTestCaseChange,
  onOpenWorkItem,
  onAddChild,
  onRemoveChild,
  onAddRelated,
  onRemoveRelated,
  onAddTestCase,
  onRemoveTestCase,
  attachmentUploading,
  onUploadAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
}: {
  tab: DetailTab
  item: WorkItem
  links: WorkItemLinks | null
  loading: boolean
  linkSubmitting: boolean
  workItemOptions: WorkItem[]
  selectedWorkItemId: string
  onSelectedWorkItemChange: (value: string) => void
  testCaseOptions: LinkedTestCase[]
  selectedTestCaseId: string
  onSelectedTestCaseChange: (value: string) => void
  onOpenWorkItem: (id: number) => void
  onAddChild: () => void
  onRemoveChild: (id: number) => void
  onAddRelated: () => void
  onRemoveRelated: (id: number) => void
  onAddTestCase: () => void
  onRemoveTestCase: (id: number) => void
  attachmentUploading: boolean
  onUploadAttachment: (file: File | null) => void
  onDownloadAttachment: (id: number) => void
  onDeleteAttachment: (id: number) => void
}) => {
  if (loading) return <div className="py-10"><LoadingSpinner text="加载关联…" /></div>
  if (!links) return <EmptyState title="暂无关联数据" description="稍后刷新后再试。" />

  if (tab === 'children') {
    return (
      <div className="space-y-4">
        <WorkItemPicker options={workItemOptions} value={selectedWorkItemId} onChange={onSelectedWorkItemChange} onSubmit={onAddChild} submitting={linkSubmitting} placeholder="选择子工作项" />
        <LinkedWorkItemList items={links.children} emptyText="暂无子工作项" onOpen={onOpenWorkItem} onRemove={onRemoveChild} />
        {links.parentWorkItems.length > 0 && (
          <div className="border-t border-[var(--color-border-light)] pt-4">
            <h4 className="mb-2 text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">父工作项</h4>
            <LinkedWorkItemList items={links.parentWorkItems} emptyText="暂无父工作项" onOpen={onOpenWorkItem} />
          </div>
        )}
      </div>
    )
  }

  if (tab === 'related') {
    return (
      <div className="space-y-4">
        <WorkItemPicker options={workItemOptions} value={selectedWorkItemId} onChange={onSelectedWorkItemChange} onSubmit={onAddRelated} submitting={linkSubmitting} placeholder="选择关联工作项" />
        <LinkedWorkItemList items={links.relatedWorkItems} emptyText="暂无关联工作项" onOpen={onOpenWorkItem} onRemove={onRemoveRelated} />
      </div>
    )
  }

  if (tab === 'testCases') {
    return (
      <div className="space-y-4">
        <TestCasePicker options={testCaseOptions} value={selectedTestCaseId} onChange={onSelectedTestCaseChange} onSubmit={onAddTestCase} submitting={linkSubmitting} />
        {links.testCases.length === 0 ? <EmptyState title="暂无测试用例" description="关联已有测试用例后会显示在这里。" /> : (
          <div className="space-y-2">
            {links.testCases.map((testCase) => (
              <div key={testCase.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-light)] bg-white p-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{testCase.title}</div>
                  <div className="mt-1 truncate text-[12px] text-[var(--color-text-tertiary)]">{testCase.testPlanName} · {testCase.moduleName || '未分组'} · {testCase.priority || '-'}</div>
                </div>
                <button onClick={() => onRemoveTestCase(testCase.id)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[13px] font-medium text-white">
        <Paperclip className="h-4 w-4" />
        {attachmentUploading ? '上传中…' : '上传附件'}
        <input type="file" className="hidden" disabled={attachmentUploading} onChange={(event) => onUploadAttachment(event.target.files?.[0] ?? null)} />
      </label>
      {links.attachments.length === 0 ? <EmptyState title="暂无附件" description="上传后的附件会按工作项权限受控下载。" /> : (
        <div className="space-y-2">
          {links.attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-light)] bg-white p-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{attachment.fileName}</div>
                <div className="mt-1 truncate text-[12px] text-[var(--color-text-tertiary)]">{formatBytes(attachment.fileSize)} · {attachment.uploaderName || '未知用户'} · {formatDate(attachment.createdAt)}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onDownloadAttachment(attachment.id)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-primary)]">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => onDeleteAttachment(attachment.id)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const WorkItemPicker = ({ options, value, onChange, onSubmit, submitting, placeholder }: {
  options: WorkItem[]
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  submitting: boolean
  placeholder: string
}) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
    <Select
      value={value}
      onChange={onChange}
      searchable
      placeholder={placeholder}
      className="min-w-0 flex-1"
      options={[
        { value: '', label: placeholder },
        ...options.map((option) => ({
          value: String(option.id),
          label: option.name,
          description: `${option.workItemCode || option.id} · ${option.workItemType} · ${option.status}`,
        })),
      ]}
    />
    <Button size="sm" onClick={onSubmit} disabled={!value || submitting} loading={submitting}>关联</Button>
  </div>
)

const TestCasePicker = ({ options, value, onChange, onSubmit, submitting }: {
  options: LinkedTestCase[]
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  submitting: boolean
}) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
    <Select
      value={value}
      onChange={onChange}
      searchable
      placeholder="选择测试用例"
      className="min-w-0 flex-1"
      options={[
        { value: '', label: '选择测试用例' },
        ...options.map((option) => ({
          value: String(option.id),
          label: option.title,
          description: `${option.testPlanName} · ${option.moduleName || '未分组'} · ${option.priority || '-'}`,
        })),
      ]}
    />
    <Button size="sm" onClick={onSubmit} disabled={!value || submitting} loading={submitting}>关联</Button>
  </div>
)

const LinkedWorkItemList = ({ items, emptyText, onOpen, onRemove }: {
  items: WorkItem[]
  emptyText: string
  onOpen: (id: number) => void
  onRemove?: (id: number) => void
}) => items.length === 0 ? <EmptyState title={emptyText} description="关联已有工作项后会显示在这里。" /> : (
  <div className="space-y-2">
    {items.map((workItem) => (
      <div key={workItem.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-light)] bg-white p-3">
        <button
          onClick={() => onOpen(workItem.id)}
          title="打开工作项详情"
          className="group min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)] group-hover:underline group-hover:underline-offset-4 group-focus-visible:text-[var(--color-primary)] group-focus-visible:underline">
              {workItem.name}
            </span>
            <span className="shrink-0 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              查看详情
            </span>
          </div>
          <div className="mt-1 truncate text-[12px] text-[var(--color-text-tertiary)]">{workItem.workItemCode || workItem.id} · {workItem.workItemType} · {workItem.status}</div>
        </button>
        {onRemove && (
          <button onClick={() => onRemove(workItem.id)} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    ))}
  </div>
)

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const DetailField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">{label}</p>
    {children}
  </div>
)

const WorkItemMemberSummary = ({
  assigneeUser,
  assigneeName,
  collaboratorUsers,
  collaboratorNames,
}: {
  assigneeUser: UserOptionItem | null
  assigneeName: string
  collaboratorUsers: UserOptionItem[]
  collaboratorNames: string[]
}) => (
  <div className="inline-flex min-w-0 items-center gap-2">
    {assigneeUser ? (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <UserAvatar user={assigneeUser} size={22} />
        <span className="truncate text-[13px]">{assigneeUser.nickname || assigneeUser.username}</span>
      </span>
    ) : (
      <span className="text-[13px] text-[var(--color-text-tertiary)]">{assigneeName || '未分配'}</span>
    )}
    {collaboratorUsers.length > 0 ? (
      <span className="flex items-center -space-x-1">
        {collaboratorUsers.slice(0, 4).map((user) => (
          <span key={user.id} title={user.nickname || user.username} className="rounded-full border border-white">
            <UserAvatar user={user} size={22} />
          </span>
        ))}
        {collaboratorUsers.length > 4 && (
          <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-white bg-[var(--color-bg-hover)] px-1 text-[10px] text-[var(--color-text-tertiary)]">
            +{collaboratorUsers.length - 4}
          </span>
        )}
      </span>
    ) : collaboratorNames.length > 0 ? (
      <span className="text-[12px] text-[var(--color-text-tertiary)]">协作人 {collaboratorNames.length}</span>
    ) : null}
  </div>
)

/* ═══════════════════════════════════════════════
   批量操作对话框
   ═══════════════════════════════════════════════ */

const BatchWorkItemFieldDialog = ({
  field,
  itemCount,
  workItemType,
  iterations,
  userOptions,
  projectMemberIds,
  submitting,
  onClose,
  onSubmit,
}: {
  field: BatchField
  itemCount: number
  workItemType: string | null
  iterations: IterationItem[]
  userOptions: UserOptionItem[]
  projectMemberIds: number[]
  submitting: boolean
  onClose: () => void
  onSubmit: (change: BatchWorkItemChange) => Promise<void>
}) => {
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [assigneeUserId, setAssigneeUserId] = useState<number | null>(null)
  const [assigneeChosen, setAssigneeChosen] = useState(false)
  const [iterationValue, setIterationValue] = useState('')
  const selectedUser = userOptions.find((item) => item.id === assigneeUserId)
  const selectedIteration = iterations.find((item) => String(item.id) === iterationValue)
  const statusChoices = workItemType ? (statusOptions[workItemType] || []) : []
  const change: BatchWorkItemChange | null = field === 'status' && status
    ? { field, value: status }
    : field === 'priority' && priority
      ? { field, value: priority }
      : field === 'assignee' && assigneeChosen
        ? { field, userId: assigneeUserId }
        : field === 'iteration' && iterationValue
          ? { field, iterationId: iterationValue === 'unplanned' ? null : Number(iterationValue) }
          : null
  const valueLabel = field === 'status' ? status
    : field === 'priority' ? priority
      : field === 'assignee' && assigneeChosen ? (selectedUser?.nickname || selectedUser?.username || '未分配')
        : selectedIteration?.name || (iterationValue === 'unplanned' ? '未规划' : '')

  return (
    <DialogOverlay onClose={submitting ? () => {} : onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">批量编辑</p>
        <h3 className="mt-1 text-[18px] font-bold text-[var(--color-text-primary)]">批量修改{batchFieldLabel[field]}</h3>
        <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">将对已选的 {itemCount} 个工作项应用同一设置，其他字段保持不变。</p>
        <div className="mt-5">
          {field === 'status' && (
            <Select value={status} onChange={setStatus} placeholder="选择状态" options={statusChoices.map((value) => ({ value, label: value }))} />
          )}
          {field === 'priority' && (
            <Select value={priority} onChange={setPriority} placeholder="选择优先级" options={['高', '中', '低'].map((value) => ({ value, label: value }))} />
          )}
          {field === 'assignee' && (
            <AssigneePicker value={assigneeUserId} onChange={(value) => { setAssigneeUserId(value); setAssigneeChosen(true) }} userOptions={userOptions} projectMemberIds={projectMemberIds} label="负责人" />
          )}
          {field === 'iteration' && (
            <Select value={iterationValue} onChange={setIterationValue} placeholder="选择迭代" options={[
              { value: 'unplanned', label: '未规划' },
              ...iterations.map((item) => ({ value: String(item.id), label: item.name, description: item.status })),
            ]} />
          )}
        </div>
        {valueLabel && <p className="mt-4 rounded-lg bg-[var(--color-bg-page)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)]">确认后将把 {itemCount} 项的{batchFieldLabel[field]}设为「{valueLabel}」。</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" disabled={submitting} onClick={onClose}>取消</Button>
          <Button disabled={!change} loading={submitting} onClick={() => change && void onSubmit(change)}>确认修改</Button>
        </div>
      </div>
    </DialogOverlay>
  )
}

const BatchDeleteConfirmDialog = ({ itemCount, submitting, onClose, onConfirm }: {
  itemCount: number
  submitting: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}) => (
  <DialogOverlay onClose={submitting ? () => {} : onClose}>
    <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-light)]"><Trash2 className="h-5 w-5 text-[var(--color-danger)]" /></div>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">确认批量删除</h3>
      <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">即将删除 {itemCount} 个工作项。此操作不可撤销，单条权限校验失败的工作项会保留。</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="secondary" disabled={submitting} onClick={onClose}>取消</Button>
        <Button variant="danger" loading={submitting} onClick={() => void onConfirm()}>删除 {itemCount} 项</Button>
      </div>
    </div>
  </DialogOverlay>
)

const BatchRequirementAiDialog = ({
  selectedItems,
  results,
  submitting,
  onClose,
  onSubmit,
  onOpenExecution,
  onOpenExecutionCenter,
}: {
  selectedItems: WorkItem[]
  results: BatchRequirementAiResult[] | null
  submitting: boolean
  onClose: () => void
  onSubmit: (action: 'STANDARDIZE' | 'BREAKDOWN') => Promise<void>
  onOpenExecution: (id: number) => void
  onOpenExecutionCenter: () => void
}) => {
  const [action, setAction] = useState<'STANDARDIZE' | 'BREAKDOWN'>('STANDARDIZE')
  const [featureCost, setFeatureCost] = useState<number | null>(null)
  const [costError, setCostError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyFeatureCosts()
      .then((costs) => { if (!cancelled) setFeatureCost(costs.REQUIREMENT_AI ?? 0) })
      .catch(() => { if (!cancelled) setCostError(true) })
    return () => { cancelled = true }
  }, [])

  if (results) {
    const successCount = results.filter((item) => item.executionTaskId).length
    return (
      <DialogOverlay onClose={onClose}>
        <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">批量需求 AI</p><h3 className="mt-1 text-[18px] font-bold text-[var(--color-text-primary)]">提交结果</h3><p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">成功创建 {successCount} 项执行任务，失败 {results.length - successCount} 项。</p></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {results.map((result) => (
              <div key={result.workItem.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-light)] px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">{result.workItem.name}</p><p className={cn('mt-0.5 text-[11px]', result.executionTaskId ? 'text-emerald-700' : 'text-[var(--color-danger)]')}>{result.executionTaskId ? `已创建执行任务 #${result.executionTaskId}` : result.error || '提交失败'}</p></div>
                {result.executionTaskId && <Button size="sm" variant="secondary" onClick={() => onOpenExecution(result.executionTaskId!)}>查看任务</Button>}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-[var(--color-text-tertiary)]">任务完成后，可打开对应需求的单条 AI 助手继续审核和手动写回结果。</p>
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onOpenExecutionCenter}>查看执行中心</Button><Button onClick={onClose}>完成</Button></div>
        </div>
      </DialogOverlay>
    )
  }

  const totalCost = featureCost === null ? null : featureCost * selectedItems.length
  return (
    <DialogOverlay onClose={submitting ? () => {} : onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">批量需求 AI</p>
        <h3 className="mt-1 text-[18px] font-bold text-[var(--color-text-primary)]">为 {selectedItems.length} 条需求创建 AI 任务</h3>
        <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">每条需求都会独立创建后台执行任务并扣除积分，结果不会自动写回需求。</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {([['STANDARDIZE', '标准化需求', '整理为结构化需求文档'], ['BREAKDOWN', '拆解子任务', '生成可编辑的任务建议']] as const).map(([value, label, description]) => (
            <button key={value} type="button" onClick={() => setAction(value)} className={cn('rounded-xl border p-3 text-left transition-colors', action === value ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/55' : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]')}><p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{label}</p><p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{description}</p></button>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-[var(--color-bg-page)] px-3 py-2.5 text-[12px] text-[var(--color-text-secondary)]">
          {costError ? '积分价格加载失败，请稍后重试。' : totalCost === null ? '正在加载积分价格…' : <>预计扣除：<strong className="text-[var(--color-text-primary)]">{totalCost}</strong> 积分（{featureCost} × {selectedItems.length}）</>}
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" disabled={submitting} onClick={onClose}>取消</Button><Button disabled={featureCost === null || costError} loading={submitting} icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void onSubmit(action)}>确认创建</Button></div>
      </div>
    </DialogOverlay>
  )
}

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
