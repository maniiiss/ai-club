/**
 * 通用工具函数。
 */

/**
 * 合并 CSS class 名称，过滤掉假值。
 * 轻量替代 clsx / classnames。
 */
export const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

/**
 * 格式化日期字符串为本地可读格式。
 * 输入为 ISO 8601 字符串或 Date 对象，输出为 YYYY-MM-DD 格式。
 */
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取用户展示名称的首字，用于头像回退显示。
 */
export const getInitials = (name: string | null | undefined): string => {
  if (!name) return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

/**
 * 从 API 错误中提取用户可读的错误消息。
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { data?: { message?: string } } }).response?.data?.message
  ) {
    return (error as { response: { data: { message: string } } }).response.data.message
  }
  return '操作失败，请稍后重试'
}
