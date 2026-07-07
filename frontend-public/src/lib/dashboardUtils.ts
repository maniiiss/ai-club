import type { DashboardStats } from '@/src/types/dashboard'

/** 判断是否展示“我的任务”统计区，避免 React 将数值 0 渲染成文本节点。 */
export function hasDashboardMyTaskStats(stats: DashboardStats | null | undefined): boolean {
  return Boolean(
    stats && (stats.myTaskCount || stats.myInProgressTaskCount || stats.myPendingTaskCount),
  )
}
