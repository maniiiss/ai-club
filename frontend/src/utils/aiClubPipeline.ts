export const formatAiClubPipelineDateTime = (value?: string | null) => {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

const normalizeStatus = (status?: string | null) => (status || '').trim().toLowerCase()

export const formatAiClubPipelineStatus = (status?: string | null) => {
  const normalized = normalizeStatus(status)
  if (!normalized) return '未运行'
  if (normalized === 'success') return '成功'
  if (normalized === 'failure' || normalized === 'failed' || normalized === 'error') return '失败'
  if (normalized === 'killed' || normalized === 'canceled' || normalized === 'cancelled') return '已取消'
  if (normalized === 'running') return '运行中'
  if (normalized === 'pending' || normalized === 'queued') return '已排队'
  if (normalized === 'blocked') return '阻塞'
  return status || '未知'
}

export const aiClubPipelineStatusTone = (status?: string | null) => {
  const normalized = normalizeStatus(status)
  if (normalized === 'success') return 'success'
  if (normalized === 'failure' || normalized === 'failed' || normalized === 'error' || normalized === 'killed') return 'danger'
  if (normalized === 'running' || normalized === 'pending' || normalized === 'queued' || normalized === 'blocked') return 'warning'
  return 'neutral'
}

export const aiClubPipelineRunStatusType = (status?: string | null) => {
  const tone = aiClubPipelineStatusTone(status)
  if (tone === 'success') return 'success'
  if (tone === 'danger') return 'danger'
  if (tone === 'warning') return 'warning'
  return 'info'
}

export const formatAiClubPipelineConfigStatus = (status?: string | null) => {
  if (status === 'PRESENT') return '已配置'
  if (status === 'MISSING') return '缺少配置'
  if (status === 'UNKNOWN') return '待确认'
  return '检查中'
}

export const aiClubPipelineConfigStatusTone = (status?: string | null) => {
  if (status === 'PRESENT') return 'success'
  if (status === 'MISSING') return 'warning'
  if (status === 'UNKNOWN') return 'danger'
  return 'neutral'
}
