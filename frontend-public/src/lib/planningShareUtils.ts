/**
 * 计划工作项分享链接工具。
 * 业务意图：工作项详情使用计划页路径参数承载抽屉状态，保证链接可直接恢复详情抽屉。
 */

/** 构造计划页工作项详情路径；null 表示回到不打开抽屉的计划首页。 */
export const buildPlanningWorkItemPath = (projectId: number, workItemId: number | null): string =>
  `/projects/${projectId}/planning${workItemId === null ? '' : `/work-items/${workItemId}`}`

/** 构造计划页内部导航地址，并清理旧版本遗留的 openTaskId 参数。 */
export const buildPlanningWorkItemRoute = (
  projectId: number,
  workItemId: number | null,
  search: string | URLSearchParams,
): string => {
  const params = new URLSearchParams(search)
  params.delete('openTaskId')
  const query = params.toString()
  return `${buildPlanningWorkItemPath(projectId, workItemId)}${query ? `?${query}` : ''}`
}

/** 构造可直接打开工作项详情抽屉的完整分享地址，保留当前页面的其他 query 参数。 */
export const buildWorkItemShareUrl = (
  location: Pick<Location, 'origin' | 'search'>,
  projectId: number,
  workItemId: number,
): string => {
  return `${location.origin}${buildPlanningWorkItemRoute(projectId, workItemId, location.search)}`
}
