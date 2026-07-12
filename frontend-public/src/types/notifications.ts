/**
 * 站内消息类型定义。
 * 与管理端和后端 NotificationItem DTO 保持同一字段契约，保证两个前端可以共享消息数据。
 */
export interface NotificationItem {
  id: number
  type: string
  level: string
  title: string
  content: string
  bizType: string | null
  bizId: number | null
  actionUrl: string | null
  read: boolean
  senderName: string
  createdAt: string
  readAt: string | null
}

/** WebSocket 推送的新消息事件。 */
export interface NotificationRealtimeEvent {
  eventType: string
  notification: NotificationItem
  unreadCount: number
}

/** 右下角实时消息轻提示。 */
export type NotificationToast = NotificationItem
