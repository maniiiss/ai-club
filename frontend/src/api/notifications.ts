import { http } from './http'
import type { ApiResponse, NotificationItem, NotificationUnreadSummary, PageResponse } from '@/types/platform'

export interface NotificationQuery {
  page: number
  size: number
  unreadOnly?: boolean
  type?: string
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const pageNotifications = async (query: NotificationQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<NotificationItem>>>('/api/notifications', {
    params: cleanParams(query)
  })
  return data.data
}

export const getUnreadNotificationCount = async () => {
  const { data } = await http.get<ApiResponse<NotificationUnreadSummary>>('/api/notifications/unread-count')
  return data.data
}

export const markNotificationRead = async (id: number) => {
  const { data } = await http.post<ApiResponse<NotificationItem>>(`/api/notifications/${id}/read`)
  return data.data
}

export const markAllNotificationsRead = async () => {
  const { data } = await http.post<ApiResponse<NotificationUnreadSummary>>('/api/notifications/read-all')
  return data.data
}
