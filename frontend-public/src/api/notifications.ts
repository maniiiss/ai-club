/**
 * 公众端个人消息 API。
 * 直接复用后端通知中心契约，页面与顶栏通过 store 共享状态。
 */
import { http, unwrap } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type { NotificationItem } from '@/src/types/notifications'
import { buildNotificationQuery } from '@/src/lib/notificationUtils'

export interface NotificationQuery {
  page: number
  size: number
  unreadOnly?: boolean
  type?: string
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))

export const pageNotifications = async (query: NotificationQuery) => {
  const response = await http.get<ApiResponse<PageResponse<NotificationItem>>>('/api/notifications', {
    params: cleanParams(query),
  })
  return unwrap(response)
}

export const getUnreadNotificationCount = async () => {
  const response = await http.get<ApiResponse<{ unreadCount: number }>>('/api/notifications/unread-count')
  return unwrap(response)
}

export const markNotificationRead = async (id: number) => {
  const response = await http.post<ApiResponse<NotificationItem>>(`/api/notifications/${id}/read`)
  return unwrap(response)
}

export const markAllNotificationsRead = async () => {
  const response = await http.post<ApiResponse<{ unreadCount: number }>>('/api/notifications/read-all')
  return unwrap(response)
}

export { buildNotificationQuery }
