/**
 * 计划迭代与工作项分享链接工具。
 * 业务意图：迭代和工作项使用固定路径参数承载当前上下文，保证复制链接后可直接恢复对应视图。
 */

/** 构造迭代计划页路径；null 表示项目计划首页（未规划工作项没有迭代 ID）。 */
export const buildPlanningIterationPath = (projectId: number, iterationId: number | null): string =>
  `/projects/${projectId}/planning${iterationId === null ? '' : `/${iterationId}`}`

/**
 * 构造计划页工作项详情路径。
 * 已规划工作项使用“迭代 ID/工作项 ID”固定路径；未规划工作项保留旧路径，避免伪造不存在的迭代 ID。
 */
export const buildPlanningWorkItemPath = (
  projectId: number,
  iterationId: number | null,
  workItemId: number,
): string => iterationId === null
  ? `/projects/${projectId}/planning/work-items/${workItemId}`
  : `${buildPlanningIterationPath(projectId, iterationId)}/${workItemId}`

/** 构造迭代计划页内部导航地址，并清理旧版本遗留的迭代和详情参数。 */
export const buildPlanningIterationRoute = (
  projectId: number,
  iterationId: number | null,
  search: string | URLSearchParams,
): string => {
  const params = new URLSearchParams(search)
  params.delete('openTaskId')
  params.delete('iterationId')
  const query = params.toString()
  return `${buildPlanningIterationPath(projectId, iterationId)}${query ? `?${query}` : ''}`
}

/** 构造工作项详情内部导航地址，并清理旧版本遗留的详情参数。 */
export const buildPlanningWorkItemRoute = (
  projectId: number,
  iterationId: number | null,
  workItemId: number,
  search: string | URLSearchParams,
): string => {
  const params = new URLSearchParams(search)
  params.delete('openTaskId')
  params.delete('iterationId')
  const query = params.toString()
  return `${buildPlanningWorkItemPath(projectId, iterationId, workItemId)}${query ? `?${query}` : ''}`
}

/** 构造可直接打开工作项详情抽屉的完整分享地址，保留当前页面的其他 query 参数。 */
export const buildWorkItemShareUrl = (
  location: Pick<Location, 'origin' | 'search'>,
  projectId: number,
  iterationId: number | null,
  workItemId: number,
): string => {
  return `${location.origin}${buildPlanningWorkItemRoute(projectId, iterationId, workItemId, location.search)}`
}
