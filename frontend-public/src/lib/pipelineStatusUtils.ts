const PIPELINE_RUN_STATUS_LABELS: Record<string, string> = {
  SUCCESS: '成功',
  PASSED: '成功',
  FAILED: '失败',
  FAILURE: '失败',
  ERROR: '失败',
  RUNNING: '运行中',
  IN_PROGRESS: '运行中',
  QUEUED: '排队中',
  PENDING: '等待中',
  CANCELED: '已取消',
  CANCELLED: '已取消',
  SKIPPED: '已跳过',
}

/** 将流水线运行状态码转换为公众端展示文案。 */
export function pipelineRunStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').trim().toUpperCase()
  if (!normalized) return '-'
  return PIPELINE_RUN_STATUS_LABELS[normalized] || status || '-'
}
