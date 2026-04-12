import { http } from './http'
import type { ApiResponse, OperationLogItem, OperationLogQuery, PageResponse } from '@/types/platform'

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

/**
 * 分页查询后台操作日志列表。
 */
export const pageOperationLogs = async (query: OperationLogQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<OperationLogItem>>>('/api/operation-logs', {
    params: cleanParams(query)
  })
  return data.data
}
