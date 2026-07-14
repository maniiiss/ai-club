/**
 * 消息中心渲染辅助函数与中文映射表。
 * 移植管理端 AppLayout.vue 的通知文案/色调解析逻辑，
 * 并统一将通知类型（type）和状态（level）展示为中文，避免在界面上暴露英文枚举。
 */
import { formatDistanceToNowStrict } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ListTodo, GitBranch, Workflow, Bell, type LucideIcon } from 'lucide-react'
import type { NotificationItem } from '@/src/types/notification'

/** 通知一级类型 → 中文。 */
export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TASK: '任务',
  GITLAB: '代码仓库',
  CICD: '流水线',
  SYSTEM: '系统',
}

/** 通知状态（级别）→ 中文。 */
export const NOTIFICATION_LEVEL_LABELS: Record<string, string> = {
  INFO: '普通',
  SUCCESS: '成功',
  WARNING: '警告',
  ERROR: '错误',
}

/**
 * 通知二级业务类型 → 中文标签。
 * 与管理端 NOTIFICATION_BIZ_TYPE_LABELS 保持一致。
 */
export const NOTIFICATION_BIZ_TYPE_LABELS: Record<string, string> = {
  TASK: '工作项通知',
  TASK_ASSIGNED: '负责人分配',
  TASK_UNASSIGNED: '取消分配',
  TASK_STATUS_CHANGED: '状态变更',
  TASK_COMMENT: '任务评论',
  TASK_COLLABORATOR_ADDED: '协作通知',
  TASK_OVERDUE: '逾期提醒',
  CHANGE_REQUEST: '变更申请',
  AI_CLUB_PIPELINE: 'AI Club Pipeline',
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

/** 业务标签色调，决定 chip 的浅底/文字配色。 */
export type NotificationTone = 'warning' | 'secondary' | 'info' | 'tertiary' | 'neutral'

/** 取业务类型的大写 key，缺失时回退到一级类型。 */
const resolveBizKey = (item: NotificationItem): string => {
  const bizType = item.bizType?.trim()
  if (bizType) return bizType.toUpperCase()
  return item.type?.trim().toUpperCase() || 'SYSTEM'
}

/** 解析通知来源：优先展示发送人名称，否则按一级类型给出中文兜底。 */
export const resolveNotificationSource = (item: NotificationItem): string => {
  if (item.senderName?.trim()) return item.senderName.trim()
  if (item.type === 'GITLAB') return '代码仓库协作'
  if (item.type === 'CICD') return '流水线中心'
  if (item.type === 'TASK') return '任务中心'
  return '系统消息'
}

/** 解析二级业务类型的中文名称。 */
export const resolveNotificationContextLabel = (item: NotificationItem): string => {
  const bizKey = resolveBizKey(item)
  if (NOTIFICATION_BIZ_TYPE_LABELS[bizKey]) return NOTIFICATION_BIZ_TYPE_LABELS[bizKey]
  if (item.type === 'TASK') return '工作项中心'
  if (item.type === 'GITLAB') return '代码协作'
  if (item.type === 'CICD') return '流水线监控'
  return '系统消息'
}

/** 解析一级类型的中文名称。 */
export const resolveNotificationTypeLabel = (item: NotificationItem): string =>
  NOTIFICATION_TYPE_LABELS[(item.type?.trim().toUpperCase())] || '系统'

/** 解析一级类型对应的图标。 */
export const resolveNotificationTypeIcon = (item: NotificationItem): LucideIcon => {
  if (item.type === 'TASK') return ListTodo
  if (item.type === 'GITLAB') return GitBranch
  if (item.type === 'CICD') return Workflow
  return Bell
}

/** 解析状态（级别）的中文名称。 */
export const resolveNotificationLevelLabel = (item: NotificationItem): string =>
  NOTIFICATION_LEVEL_LABELS[(item.level?.trim().toUpperCase())] || '普通'

/** 解析业务标签色调。 */
export const resolveNotificationContextTone = (item: NotificationItem): NotificationTone => {
  const bizKey = resolveBizKey(item)
  if (bizKey === 'CHANGE_REQUEST') return 'warning'
  if (bizKey === 'TASK_UNASSIGNED' || bizKey === 'TASK_OVERDUE' || bizKey === 'GITLAB_BRANCH_BEHIND')
    return 'warning'
  if (bizKey === 'TASK_COMMENT') return 'info'
  if (bizKey === 'DEVELOPMENT_EXECUTION_PLAN_CONFIRM') return 'warning'
  if (bizKey.endsWith('_FAILED') || bizKey.endsWith('_CANCELED')) return 'warning'
  if (bizKey.endsWith('_COMPLETED')) return 'secondary'
  if (bizKey === 'DEVELOPMENT_EXECUTION_COMPLETED') return 'secondary'
  if (
    bizKey === 'TASK_ASSIGNED' ||
    bizKey === 'TASK_STATUS_CHANGED' ||
    bizKey === 'TASK_COLLABORATOR_ADDED'
  )
    return 'secondary'
  if (bizKey === 'GITLAB_MERGED' || bizKey === 'GITLAB_AI_REJECTED' || bizKey === 'GITLAB_AUTO_MERGE_LOG')
    return 'tertiary'
  if (bizKey === 'SYSTEM_ANNOUNCEMENT') return 'neutral'
  if (item.type === 'TASK') return 'secondary'
  if (item.type === 'GITLAB') return 'tertiary'
  if (item.type === 'CICD') return 'info'
  return 'neutral'
}

/** 业务色调 → Tailwind + 设计 token 类名（浅底 + 深字）。 */
export const toneToClass = (tone: NotificationTone): string => {
  switch (tone) {
    case 'warning':
      return 'bg-[var(--color-warning-light)] text-[var(--color-warning)]'
    case 'secondary':
      return 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
    case 'info':
      return 'bg-[var(--color-info-light)] text-[var(--color-info)]'
    case 'tertiary':
      return 'bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]'
    case 'neutral':
    default:
      return 'bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]'
  }
}

/** 状态（级别） → chip 配色类名。 */
export const levelToClass = (item: NotificationItem): string => {
  const level = item.level?.trim().toUpperCase()
  if (level === 'ERROR') return 'bg-[var(--color-danger-light)] text-[var(--color-danger)]'
  if (level === 'WARNING') return 'bg-[var(--color-warning-light)] text-[var(--color-warning)]'
  if (level === 'SUCCESS') return 'bg-[var(--color-success-light)] text-[var(--color-success)]'
  return 'bg-[var(--color-info-light)] text-[var(--color-info)]'
}

/**
 * 将时间字符串转换为相对时间文案（如「3 分钟前」「刚刚」「2 小时前」）。
 * 对齐管理端 formatNotificationTime 体验，使用 date-fns 的中文 locale。
 */
export const formatRelativeTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  // 后端返回的 createdAt 形如 "yyyy-MM-dd HH:mm:ss"，部分浏览器无法直接解析，补 T 使其兼容。
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(date)) {
    return formatDistanceToNowStrict(new Date(date.replace(' ', 'T')), { addSuffix: true, locale: zhCN })
  }
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: zhCN })
}
