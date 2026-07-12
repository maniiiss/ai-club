import type { NotificationItem } from '@/src/types/notifications'

export type NotificationAction =
  | { kind: 'internal'; target: string }
  | { kind: 'external'; target: string }

const NOTIFICATION_BIZ_TYPE_LABELS: Record<string, string> = {
  TASK: '工作项通知',
  TASK_ASSIGNED: '负责人分配',
  TASK_UNASSIGNED: '取消分配',
  TASK_STATUS_CHANGED: '状态变更',
  TASK_COMMENT: '任务评论',
  TASK_COLLABORATOR_ADDED: '协作通知',
  TASK_OVERDUE: '逾期提醒',
  CHANGE_REQUEST: '变更申请',
  AI_CLUB_PIPELINE: 'GitPilot Pipeline',
  PIPELINE_BINDING: '外部 Jenkins 绑定',
  GITLAB_MERGED: '自动合并成功',
  GITLAB_AI_REJECTED: 'AI 审核拒绝',
  GITLAB_BRANCH_BEHIND: '分支落后提醒',
  GITLAB_AUTO_MERGE_LOG: '合并请求',
  DEVELOPMENT_EXECUTION_COMPLETED: '开发执行完成',
  DEVELOPMENT_EXECUTION_FAILED: '开发执行失败',
  DEVELOPMENT_EXECUTION_CANCELED: '开发执行已取消',
  DEVELOPMENT_EXECUTION_PLAN_CONFIRM: '开发执行待确认',
  TEST_AUTOMATION_COMPLETED: '自动化测试完成',
  TEST_AUTOMATION_FAILED: '自动化测试失败',
  TEST_AUTOMATION_CANCELED: '自动化测试已取消',
  CODEBASE_SCAN_COMPLETED: '仓库扫描完成',
  CODEBASE_SCAN_FAILED: '仓库扫描失败',
  CODEBASE_SCAN_CANCELED: '仓库扫描已取消',
  EXECUTION_COMPLETED: '执行完成',
  EXECUTION_FAILED: '执行失败',
  EXECUTION_CANCELED: '执行已取消',
  SYSTEM_ANNOUNCEMENT: '系统公告',
}

const resolveNotificationBizKey = (item: NotificationItem): string => {
  const bizType = item.bizType?.trim()
  if (bizType) return bizType.toUpperCase()
  return item.type?.trim().toUpperCase() || 'SYSTEM'
}

/** 构造通知列表请求参数，未读筛选关闭时不向后端发送 false。 */
export const buildNotificationQuery = (page: number, size: number, unreadOnly: boolean) => ({
  page,
  size,
  ...(unreadOnly ? { unreadOnly: true } : {}),
})

/** 合并实时消息或分页消息，按 ID 去重并保留新版本内容。 */
export const mergeNotificationItems = (
  existing: NotificationItem[],
  incoming: NotificationItem[],
  position: 'prepend' | 'append',
): NotificationItem[] => {
  const candidates = position === 'prepend' ? [...incoming, ...existing] : [...existing, ...incoming]
  const unique = new Map<number, NotificationItem>()
  for (const item of candidates) {
    if (!unique.has(item.id)) unique.set(item.id, item)
  }
  return [...unique.values()]
}

/** 将后端通知业务类型转换为公众端可读的上下文标签。 */
export const resolveNotificationContextLabel = (item: NotificationItem): string => {
  const bizKey = resolveNotificationBizKey(item)
  if (NOTIFICATION_BIZ_TYPE_LABELS[bizKey]) return NOTIFICATION_BIZ_TYPE_LABELS[bizKey]
  if (item.type === 'TASK') return '工作项中心'
  if (item.type === 'GITLAB') return '代码协作'
  if (item.type === 'CICD') return '流水线监控'
  return '系统消息'
}

/** 返回消息卡片使用的语义色调。 */
export const resolveNotificationContextTone = (item: NotificationItem): string => {
  const bizKey = resolveNotificationBizKey(item)
  if (bizKey === 'CHANGE_REQUEST' || bizKey === 'TASK_UNASSIGNED' || bizKey === 'TASK_OVERDUE' || bizKey === 'GITLAB_BRANCH_BEHIND') return 'warning'
  if (bizKey === 'TASK_COMMENT') return 'info'
  if (bizKey === 'DEVELOPMENT_EXECUTION_PLAN_CONFIRM') return 'warning'
  if (bizKey.endsWith('_FAILED') || bizKey.endsWith('_CANCELED')) return 'warning'
  if (bizKey.endsWith('_COMPLETED')) return 'success'
  if (bizKey === 'TASK_ASSIGNED' || bizKey === 'TASK_STATUS_CHANGED' || bizKey === 'TASK_COLLABORATOR_ADDED') return 'success'
  if (bizKey === 'GITLAB_MERGED' || bizKey === 'GITLAB_AI_REJECTED' || bizKey === 'GITLAB_AUTO_MERGE_LOG') return 'accent'
  if (bizKey === 'SYSTEM_ANNOUNCEMENT') return 'neutral'
  if (item.type === 'TASK') return 'success'
  if (item.type === 'GITLAB') return 'accent'
  if (item.type === 'CICD') return 'info'
  return 'neutral'
}

/** 将消息等级统一翻译为卡片底部的优先级/结果文案。 */
export const resolveNotificationLevelLabel = (item: NotificationItem): string => {
  if (item.level === 'ERROR') return '优先级：高'
  if (item.level === 'WARNING') return '优先级：中'
  if (item.level === 'SUCCESS') return '处理结果：成功'
  return '优先级：普通'
}

/** 将管理端的时间串转换成适合消息列表扫描的相对时间。 */
export const formatNotificationTime = (value: string, now = new Date()): string => {
  const normalizedValue = value?.includes('T') ? value : value?.replace(' ', 'T')
  const date = new Date(normalizedValue)
  if (Number.isNaN(date.getTime())) return value || '-'

  const diffMinutes = Math.max(1, Math.floor((now.getTime() - date.getTime()) / 60000))
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return '昨天'
  return `${diffDays} 天前`
}

/** 将未读数转换为不会撑开顶栏的短标签。 */
export const formatUnreadCount = (count: number): string => {
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

/** 区分 React Router 内部路径和需要交给浏览器处理的绝对 URL。 */
export const resolveNotificationAction = (actionUrl: string | null): NotificationAction | null => {
  const target = actionUrl?.trim()
  if (!target) return null
  if (/^https?:\/\//i.test(target)) return { kind: 'external', target }

  const normalizedTarget = target.startsWith('/') ? target : `/${target}`
  const queryIndex = normalizedTarget.indexOf('?')
  const pathname = queryIndex >= 0 ? normalizedTarget.slice(0, queryIndex) : normalizedTarget
  const suffix = queryIndex >= 0 ? normalizedTarget.slice(queryIndex) : ''

  // 管理端工作项链接使用 iterations，公众端对应 planning；保留 openTaskId 让计划页自动打开详情抽屉。
  const iterationMatch = pathname.match(/^\/projects\/(\d+)\/iterations$/)
  if (iterationMatch) return { kind: 'internal', target: `/projects/${iterationMatch[1]}/planning${suffix}` }

  // 执行任务通知历史上使用 /tasks/{id}，公众端通过兼容路由承接该地址。
  if (/^\/tasks\/\d+$/.test(pathname)) return { kind: 'internal', target: normalizedTarget }

  const isPublicRoute =
    ['/dashboard', '/projects', '/chat', '/settings/profile', '/notifications'].includes(pathname) ||
    /^\/projects\/\d+\/(planning|knowledge|development|execution|release)(?:\/.*)?$/.test(pathname)
  return isPublicRoute ? { kind: 'internal', target: normalizedTarget } : null
}

export const resolveNotificationSource = (item: NotificationItem): string => {
  if (item.senderName?.trim()) return item.senderName.trim()
  if (item.type === 'GITLAB') return '代码仓库协作'
  if (item.type === 'CICD') return '流水线中心'
  if (item.type === 'TASK') return '任务中心'
  return '系统消息'
}
