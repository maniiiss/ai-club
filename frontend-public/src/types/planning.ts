/**
 * 计划模块类型定义。
 * 涵盖迭代、工作项、统计和燃尽图。
 */

/** 迭代。 */
export interface IterationItem {
  id: number
  projectId: number
  projectName: string
  creatorUserId: number | null
  name: string
  goal: string
  /** '未开始' | '进行中' | '已完成' */
  status: string
  startDate: string | null
  endDate: string | null
  description: string
  sortOrder: number
  workItemCount: number
  canDelete: boolean
}

/** 迭代看板（含项目信息和未规划数）。 */
export interface IterationBoardItem {
  project: import('@/src/types/project').ProjectItem
  unplannedCount: number
  totalWorkItemCount: number
  iterations: IterationItem[]
}

/** 创建/更新迭代载荷。 */
export interface IterationPayload {
  name: string
  goal: string
  status: string
  startDate: string
  endDate: string
  description: string
  sortOrder: number
}

/** 工作项（TaskItem）。 */
export interface WorkItem {
  id: number
  workItemCode: string
  name: string
  /** '需求' | '任务' | '缺陷' */
  workItemType: string
  /** 任务细分类型，仅 workItemType 为“任务”时有效。 */
  taskType: string | null
  creatorUserId: number | null
  creatorName: string
  status: string
  /** '高' | '中' | '低' */
  priority: string
  workHours: number | null
  assignee: string
  assigneeUserId: number | null
  collaboratorUserIds: number[]
  collaboratorNames: string[]
  planStartDate: string | null
  planEndDate: string | null
  /** 创建时间。 */
  createdAt: string | null
  updatedAt: string
  description: string
  moduleName?: string | null
  projectId: number
  projectName: string
  agentId: number | null
  agentName: string | null
  iterationId: number | null
  iterationName: string | null
  requirementTaskId: number | null
  requirementTaskName: string | null
  canDelete: boolean
}

/** 创建/更新工作项载荷。 */
export interface WorkItemPayload {
  name: string
  workItemType?: string
  /** 任务细分类型，仅创建或更新“任务”工作项时提交。 */
  taskType?: string | null
  status: string
  priority: string
  workHours?: number | null
  assignee: string
  assigneeUserId?: number | null
  collaboratorUserIds?: number[]
  description: string
  moduleName?: string
  planStartDate?: string | null
  planEndDate?: string | null
  projectId: number
  agentId: number | null
  iterationId?: number | null
  requirementTaskId?: number | null
}

/** 工作项查询参数。 */
export interface WorkItemQuery {
  iterationId?: number
  unplanned?: boolean
  workItemType?: string
  keyword?: string
  status?: string
  priority?: string
}

/** 工作项统计。 */
export interface WorkItemStats {
  totalCount: number
  completedCount: number
  openCount: number
  defectCount: number
  /** 完成率 0–100。 */
  completionRate: number
}

/** 工作项评论。 */
export interface TaskComment {
  id: number
  taskId: number
  authorUserId: number
  authorName: string
  /** Markdown 格式评论内容。 */
  content: string
  createdAt: string
}

/** 燃尽图数据。 */
export interface BurndownItem {
  startDate: string
  endDate: string
  totalWorkItemCount: number
  completedWorkItemCount: number
  remainingWorkItemCount: number
  labels: string[]
  idealRemaining: number[]
  actualRemaining: number[]
}
