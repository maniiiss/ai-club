/**
 * 消息中心（通知中心）类型定义。
 * 与后端 NotificationController / NotificationItem 契约对齐，
 * 管理端与公众端共用同一套 /api/notifications 接口。
 */

/** 通知一级类型：任务 / 代码仓库 / 流水线 / 系统。 */
export type NotificationType = 'TASK' | 'GITLAB' | 'CICD' | 'SYSTEM' | string

/** 通知状态（级别）：普通 / 成功 / 警告 / 错误。 */
export type NotificationLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | string

/** 单条通知消息，与后端 NotificationItem record 一一对应。 */
export interface NotificationItem {
  /** 主键 */
  id: number
  /** 一级类型（TASK / GITLAB / CICD / SYSTEM） */
  type: NotificationType
  /** 状态级别（INFO / SUCCESS / WARNING / ERROR） */
  level: NotificationLevel
  /** 标题 */
  title: string
  /** 正文内容 */
  content: string
  /** 二级业务类型，用于细化标签文案（如 TASK_OVERDUE、SYSTEM_ANNOUNCEMENT） */
  bizType: string | null
  /** 关联业务 ID */
  bizId: number | null
  /** 点击跳转地址（前端路由路径） */
  actionUrl: string | null
  /** 是否已读 */
  read: boolean
  /** 发送人名称（系统消息时可能为空） */
  senderName: string
  /** 发送时间（后端格式化为 yyyy-MM-dd HH:mm:ss 字符串） */
  createdAt: string
  /** 已读时间，未读时为 null */
  readAt: string | null
}

/** 未读数量统计结果。 */
export interface NotificationUnreadSummary {
  unreadCount: number
}

/** WebSocket 实时推送事件。 */
export interface NotificationRealtimeEvent {
  /** 事件类型，目前仅 NEW_NOTIFICATION */
  eventType: 'NEW_NOTIFICATION' | string
  /** 新消息完整内容 */
  notification: NotificationItem
  /** 该用户最新未读总数 */
  unreadCount: number
}

/** 列表查询参数。 */
export interface NotificationQuery {
  /** 页码，从 1 开始 */
  page: number
  /** 每页条数，后端强制 1~50 */
  size: number
  /** 仅查未读 */
  unreadOnly?: boolean
  /** 按一级类型筛选 */
  type?: string
}
