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

/** 工作项关联测试用例摘要。 */
export interface LinkedTestCase {
  id: number
  title: string
  moduleName: string
  caseType: string
  priority: string
  testPlanId: number
  testPlanName: string
  projectId: number
  projectName: string
}

/** 工作项附件摘要。 */
export interface TaskAttachment {
  id: number
  assetId: number
  fileName: string
  contentType: string
  fileSize: number
  sourceFormat: string
  uploaderUserId: number | null
  uploaderName: string
  createdAt: string | null
}

/** 工作项详情页签聚合关联。 */
export interface WorkItemLinks {
  children: WorkItem[]
  parentWorkItems: WorkItem[]
  relatedWorkItems: WorkItem[]
  testCases: LinkedTestCase[]
  attachments: TaskAttachment[]
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

/** 工作项列表轻量更新字段，避免快捷编辑提交完整工作项载荷。 */
export type WorkItemInlineUpdateField = 'STATUS' | 'PRIORITY' | 'ASSIGNEE' | 'PLAN_DATES'

/** 工作项列表快捷更新请求，仅包含当前修改字段及其值。 */
export interface WorkItemInlineUpdatePayload {
  field: WorkItemInlineUpdateField
  value?: string
  assigneeUserId?: number | null
  planStartDate?: string | null
  planEndDate?: string | null
}

/** 工作项列表轻量更新结果，不包含描述和需求文档。 */
export interface WorkItemInlineUpdateResult {
  id: number
  status: string
  priority: string
  assignee: string
  assigneeUserId: number | null
  planStartDate: string | null
  planEndDate: string | null
  updatedAt: string | null
}

/** 公众端批量工作项更新支持的字段。 */
export type BatchWorkItemUpdateField = 'STATUS' | 'PRIORITY' | 'ASSIGNEE' | 'ITERATION'

/** 由服务端一次接收并逐项执行的批量更新载荷。 */
export interface BatchWorkItemUpdatePayload {
  taskIds: number[]
  field: BatchWorkItemUpdateField
  value?: string
  assigneeUserId?: number | null
  iterationId?: number | null
}

/** 批量工作项操作的逐项结果，失败项不影响已成功项。 */
export interface BatchWorkItemOperationResult {
  taskId: number
  task: WorkItem | null
  errorMessage: string | null
}

/** 工作项查询参数。 */
export type WorkItemSortField = 'name' | 'workItemType' | 'status' | 'priority' | 'assignee' | 'planStartDate' | 'createdAt'
export type WorkItemSortDirection = 'asc' | 'desc'

export interface WorkItemQuery {
  iterationId?: number
  unplanned?: boolean
  workItemType?: string
  keyword?: string
  status?: string
  priority?: string
  assigneeUserId?: number
  assigneeUnassigned?: boolean
  createdFrom?: string
  createdTo?: string
  planDateFrom?: string
  planDateTo?: string
  sortBy?: WorkItemSortField
  sortDirection?: WorkItemSortDirection
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

/** 工作项更新记录明细。 */
export interface TaskUpdateRecordDetail {
  id: number
  fieldCode: string
  fieldName: string
  detailType: string
  oldValue: string | null
  newValue: string | null
  relatedObjectId: number | null
  relatedObjectName: string | null
}

/** 工作项更新记录时间线节点。 */
export interface TaskUpdateRecord {
  id: number
  taskId: number
  operatorUserId: number | null
  operatorName: string
  source: 'MANUAL' | 'SYSTEM' | 'AI' | string
  actionType: string
  summary: string
  createdAt: string | null
  details: TaskUpdateRecordDetail[]
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
