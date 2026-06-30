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
 * 格式化日期时间为本地可读格式（YYYY-MM-DD HH:mm）。
 * 输入为 ISO 8601 字符串或 Date 对象。
 */
export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
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
 * 优先提取后端 ApiResponse 中的 message 字段，再降级到 Error.message 和默认文案。
 *
 * 注意：AxiosError 继承自 Error，必须先检查 response.data.message，
 * 否则 instanceof Error 会直接返回 Axios 的通用消息（如 "Request failed with status code 400"），
 * 导致后端返回的具体错误信息被吞掉。
 */
export const getErrorMessage = (error: unknown): string => {
  // 1. 优先提取后端 ApiResponse 返回的错误消息（覆盖 Axios 错误和其他带 response 的错误）
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { data?: { message?: string } } }).response?.data?.message
  ) {
    return (error as { response: { data: { message: string } } }).response.data.message
  }
  // 2. 普通 Error（含非 API 场景的 Axios 错误，如网络断开）
  if (error instanceof Error) return error.message
  // 3. 字符串类型错误
  if (typeof error === 'string') return error
  // 4. 兜底
  return '操作失败，请稍后重试'
}
