/**
 * 计划工作项列表内联编辑工具。
 * 业务意图：列表只暴露状态和优先级的快捷修改，但后端更新接口需要完整工作项载荷，
 * 因此这里统一保留工作项原有上下文，避免快捷编辑误清空负责人、迭代、关联需求等字段。
 */
import { normalizeTaskType } from '@/src/lib/requirementAiUtils'
import type { WorkItem, WorkItemPayload } from '@/src/types/planning'

export const buildWorkItemInlineEditPayload = (
  item: WorkItem,
  overrides: Pick<Partial<WorkItemPayload>, 'status' | 'priority'>,
): WorkItemPayload => ({
  name: item.name,
  workItemType: item.workItemType,
  taskType: item.workItemType === '任务' ? normalizeTaskType(item.taskType) : null,
  status: overrides.status ?? item.status,
  priority: overrides.priority ?? item.priority,
  workHours: item.workHours,
  assignee: item.assignee,
  assigneeUserId: item.assigneeUserId,
  collaboratorUserIds: item.collaboratorUserIds,
  description: item.description,
  moduleName: item.moduleName || '',
  planStartDate: item.planStartDate,
  planEndDate: item.planEndDate,
  projectId: item.projectId,
  agentId: item.agentId,
  iterationId: item.iterationId,
  requirementTaskId: item.requirementTaskId,
})
