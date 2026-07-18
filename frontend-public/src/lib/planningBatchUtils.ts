import type { WorkItem } from '@/src/types/planning'

/**
 * 计算当前批量选择可显示的操作。
 * 业务意图：面对混合工作项时隐藏不安全的操作，而不是静默跳过不适用项。
 */
export const getBatchWorkItemAvailability = (items: Pick<WorkItem, 'workItemType' | 'canDelete'>[]) => {
  const hasSelection = items.length > 0
  const workItemType = items[0]?.workItemType || null
  return {
    hasSelection,
    hasSameWorkItemType: hasSelection && items.every((item) => item.workItemType === workItemType),
    canRequirementAi: hasSelection && items.every((item) => item.workItemType === '需求'),
    canDelete: hasSelection && items.every((item) => item.canDelete),
  }
}

/** 当前页选择切换，返回不可变的新集合，避免直接修改 React 状态中的 Set。 */
export const toggleBatchWorkItemSelection = (selectedIds: Set<number>, id: number): Set<number> => {
  const next = new Set(selectedIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** 仅对当前页全选或清空，不跨页保留隐藏选择。 */
export const toggleAllBatchWorkItemSelection = (selectedIds: Set<number>, visibleIds: number[]): Set<number> => {
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  return allSelected ? new Set() : new Set(visibleIds)
}
