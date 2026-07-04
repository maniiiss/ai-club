/**
 * 工作台 API。
 * 与后端 /api/dashboard/* 接口对齐。
 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type {
  DashboardOverview,
  DashboardQuickTaskItem,
  DashboardQuickTaskPayloadItem,
  DashboardShortcutEntryItem,
  DashboardShortcutPayloadItem,
} from '@/src/types/dashboard'

/** 获取工作台全局概览数据（含统计、活跃项目、最近任务、在线智能体、系统入口等）。 */
export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  const res = await http.get<ApiResponse<DashboardOverview>>('/api/dashboard/overview')
  return unwrap(res)
}

/** 列出当前账号的快捷任务（便签）。 */
export const listDashboardQuickTasks = async (): Promise<DashboardQuickTaskItem[]> => {
  const res = await http.get<ApiResponse<DashboardQuickTaskItem[]>>('/api/dashboard/quick-tasks')
  return unwrap(res)
}

/** 保存当前账号的快捷任务（便签），整体覆盖。 */
export const saveDashboardQuickTasks = async (
  items: DashboardQuickTaskPayloadItem[],
): Promise<DashboardQuickTaskItem[]> => {
  const res = await http.put<ApiResponse<DashboardQuickTaskItem[]>>('/api/dashboard/quick-tasks', { items })
  return unwrap(res)
}

/** 列出当前账号的个人快捷入口。 */
export const listDashboardShortcutEntries = async (): Promise<DashboardShortcutEntryItem[]> => {
  const res = await http.get<ApiResponse<DashboardShortcutEntryItem[]>>('/api/dashboard/shortcut-entries')
  return unwrap(res)
}

/** 保存当前账号的个人快捷入口，整体覆盖。 */
export const saveDashboardShortcutEntries = async (
  items: DashboardShortcutPayloadItem[],
): Promise<DashboardShortcutEntryItem[]> => {
  const res = await http.put<ApiResponse<DashboardShortcutEntryItem[]>>('/api/dashboard/shortcut-entries', { items })
  return unwrap(res)
}
