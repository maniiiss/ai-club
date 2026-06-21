export type WorkItemStatusTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export interface WorkItemStatusOption {
  label: string
  value: string
  tone: WorkItemStatusTone
}

const REQUIREMENT_TYPE = '需求'
const TASK_TYPE = '任务'
const DEFECT_TYPE = '缺陷'

const REQUIREMENT_STATUS_OPTIONS: WorkItemStatusOption[] = [
  { label: '草稿', value: '草稿', tone: 'info' },
  { label: '待开始', value: '待开始', tone: 'warning' },
  { label: '进行中', value: '进行中', tone: 'primary' },
  { label: '已完成', value: '已完成', tone: 'success' },
  { label: '已阻塞', value: '已阻塞', tone: 'danger' }
]

const TASK_STATUS_OPTIONS: WorkItemStatusOption[] = [
  { label: '待开始', value: '待开始', tone: 'warning' },
  { label: '进行中', value: '进行中', tone: 'primary' },
  { label: '已阻塞', value: '已阻塞', tone: 'danger' },
  { label: '已完成', value: '已完成', tone: 'info' }
]

const DEFECT_STATUS_OPTIONS: WorkItemStatusOption[] = [
  { label: '已拒绝', value: '已拒绝', tone: 'danger' },
  { label: '待开始', value: '待开始', tone: 'warning' },
  { label: '进行中', value: '进行中', tone: 'primary' },
  { label: '已完成', value: '已完成', tone: 'info' },
  { label: '通过', value: '通过', tone: 'success' },
  { label: '延期解决', value: '延期解决', tone: 'accent' }
]

const ALL_STATUS_ORDER = ['草稿', '待开始', '进行中', '已阻塞', '已完成', '通过', '已拒绝', '延期解决']

const normalizeWorkItemType = (workItemType?: string | null) => {
  const normalized = workItemType?.trim()
  if (normalized === REQUIREMENT_TYPE || normalized === DEFECT_TYPE || normalized === TASK_TYPE) {
    return normalized
  }
  return TASK_TYPE
}

/**
 * 历史状态值统一折算为新的主状态，避免旧数据在前端展示出已经废弃的文案。
 */
export const normalizeWorkItemStatus = (workItemType?: string | null, status?: string | null) => {
  const normalizedType = normalizeWorkItemType(workItemType)
  const normalizedStatus = status?.trim() || ''
  if (!normalizedStatus) {
    return ''
  }
  if (normalizedStatus === '草稿（评审通过）') {
    return '草稿'
  }
  if (normalizedStatus === '处理中' || normalizedStatus === '开发中') {
    return '进行中'
  }
  if (normalizedStatus === '完成') {
    return '已完成'
  }
  if (normalizedStatus === '阻塞') {
    return '已阻塞'
  }
  if (normalizedType !== REQUIREMENT_TYPE && normalizedStatus === '草稿') {
    return '待开始'
  }
  return normalizedStatus
}

const getOptionsByType = (workItemType?: string | null) => {
  const normalizedType = normalizeWorkItemType(workItemType)
  if (normalizedType === REQUIREMENT_TYPE) {
    return REQUIREMENT_STATUS_OPTIONS
  }
  if (normalizedType === DEFECT_TYPE) {
    return DEFECT_STATUS_OPTIONS
  }
  return TASK_STATUS_OPTIONS
}

export const getWorkItemStatusOptions = (workItemType?: string | null) => getOptionsByType(workItemType)

export const getAllWorkItemStatusOptions = () => {
  const optionMap = new Map<string, WorkItemStatusOption>()
  for (const option of [...REQUIREMENT_STATUS_OPTIONS, ...TASK_STATUS_OPTIONS, ...DEFECT_STATUS_OPTIONS]) {
    if (!optionMap.has(option.value)) {
      optionMap.set(option.value, option)
    }
  }
  return ALL_STATUS_ORDER
    .map((status) => optionMap.get(status) || null)
    .filter((item): item is WorkItemStatusOption => Boolean(item))
}

export const getDefaultWorkItemStatus = (workItemType?: string | null) => {
  const normalizedType = normalizeWorkItemType(workItemType)
  return normalizedType === REQUIREMENT_TYPE ? '草稿' : '待开始'
}

export const isWorkItemStatusAllowed = (workItemType?: string | null, status?: string | null) => {
  const normalizedStatus = normalizeWorkItemStatus(workItemType, status)
  return getOptionsByType(workItemType).some((item) => item.value === normalizedStatus)
}

export const getWorkItemStatusTone = (workItemType?: string | null, status?: string | null): WorkItemStatusTone => {
  const normalizedStatus = normalizeWorkItemStatus(workItemType, status)
  return getOptionsByType(workItemType).find((item) => item.value === normalizedStatus)?.tone || 'info'
}

export const formatWorkItemStatusLabel = (workItemType?: string | null, status?: string | null) => {
  return normalizeWorkItemStatus(workItemType, status) || '-'
}

/**
 * 完成态按工作项类型区分：需求以"已完成"为完成，缺陷以"通过"为完成，任务以"已完成"为完成。
 */
export const isWorkItemCompletedStatus = (workItemType?: string | null, status?: string | null) => {
  const normalizedType = normalizeWorkItemType(workItemType)
  const normalizedStatus = normalizeWorkItemStatus(workItemType, status)
  if (normalizedType === REQUIREMENT_TYPE) {
    return normalizedStatus === '已完成'
  }
  if (normalizedType === DEFECT_TYPE) {
    return normalizedStatus === '通过'
  }
  return normalizedStatus === '已完成'
}
