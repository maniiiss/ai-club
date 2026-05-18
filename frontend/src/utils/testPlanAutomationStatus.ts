/**
 * 业务意图：测试计划自动化状态机在后端使用 IDLE/PENDING/RUNNING/SUCCESS/FAILED/CANCELED 这一组标识，
 * 各列表与详情页都需要按相同口径渲染中文文案与色调。集中在这里维护一份映射，避免散落各处出现遗漏。
 */
const STATUS_LABELS: Record<string, string> = {
  IDLE: '未配置',
  PENDING: '待执行',
  RUNNING: '执行中',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELED: '已取消'
}

const STATUS_TONES: Record<string, string> = {
  IDLE: 'neutral',
  PENDING: 'warning',
  RUNNING: 'primary',
  SUCCESS: 'success',
  FAILED: 'danger',
  CANCELED: 'info'
}

const normalize = (status?: string | null): string => String(status || '').trim().toUpperCase()

/**
 * 把后端原始状态码映射成可直接展示给用户的中文文案。
 * 未知值统一退化为“未配置”，避免把脏数据原样泄露给用户。
 */
export const formatAutomationStatus = (status?: string | null): string => {
  const normalized = normalize(status)
  return STATUS_LABELS[normalized] || STATUS_LABELS.IDLE
}

/**
 * 返回与状态对应的徽章 tone 名称，用于 management-list-pill 的色调样式。
 */
export const automationStatusTone = (status?: string | null): string => {
  const normalized = normalize(status)
  return STATUS_TONES[normalized] || STATUS_TONES.IDLE
}
