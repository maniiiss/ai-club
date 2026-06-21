/**
 * 工作台 API。
 * 与后端 /api/dashboard/* 接口对齐。
 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type { DashboardOverview } from '@/src/types/dashboard'

/** 获取工作台全局概览数据（含统计、活跃项目、最近任务等）。 */
export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  const res = await http.get<ApiResponse<DashboardOverview>>('/api/dashboard/overview')
  return unwrap(res)
}
