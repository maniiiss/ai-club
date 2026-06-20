/**
 * 公共 API 类型定义。
 * 与后端 ApiResponse<T>、PageResponse<T> 契约对齐。
 */

/** 后端统一响应包装。 */
export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

/** 后端分页响应包装。 */
export interface PageResponse<T> {
  records: T[]
  total: number
  page: number
  size: number
  totalPages: number
}

/** 前端分页请求参数。 */
export interface PageParams {
  page?: number
  size?: number
  keyword?: string
  status?: string
}
