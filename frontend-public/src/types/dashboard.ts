/**
 * 工作台类型定义。
 * 与后端 DashboardOverview / DashboardStats 对齐。
 */

import type { ProjectItem } from './project'
import type { WorkItem } from './planning'

/** 工作台统计数据。 */
export interface DashboardStats {
  projectCount: number
  agentCount: number
  taskCount: number
  repoCount: number
  myTaskCount?: number
  myInProgressTaskCount?: number
  myPendingTaskCount?: number
  mergeAlertCount?: number
}

/** 工作台全局概览。 */
export interface DashboardOverview {
  stats: DashboardStats
  activeProjects: ProjectItem[]
  recentTasks: WorkItem[]
  currentUserGitlabUsername: string | null
}
