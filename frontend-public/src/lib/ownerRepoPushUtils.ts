/**
 * 业主仓库推送相关纯函数工具，供公众端列表与推送表单复用。
 * 与后端 pushMode / executionStatus 枚举解耦，前端自行维护展示文案与配色。
 */

/** 推送方式的可读文案。 */
export const ownerRepoPushModeLabel = (mode: string | null | undefined): string => {
  switch (mode) {
    case 'DIRECT':
      return '直接推送'
    case 'MERGE_REQUEST':
      return '创建 MR'
    case 'NEW_BRANCH':
      return '推到新分支'
    default:
      return mode || '-'
  }
}

/** 推送方式的色彩语义，用于列表标签。 */
export const ownerRepoPushModeStyle = (mode: string | null | undefined): string => {
  switch (mode) {
    case 'DIRECT':
      return 'bg-red-50 text-red-700'
    case 'MERGE_REQUEST':
      return 'bg-emerald-50 text-emerald-700'
    case 'NEW_BRANCH':
      return 'bg-blue-50 text-blue-700'
    default:
      return 'bg-gray-100 text-gray-500'
  }
}

/** 推送执行状态的文案。 */
export const ownerRepoPushStatus = (status: string | null | undefined): string => {
  switch (status) {
    case 'SUCCESS':
      return '成功'
    case 'PARTIAL':
      return '部分成功'
    case 'FAILED':
      return '失败'
    default:
      return status || '-'
  }
}

/** 推送执行状态的色彩语义。 */
export const ownerRepoPushStatusStyle = (status: string | null | undefined): string => {
  switch (status) {
    case 'SUCCESS':
      return 'bg-emerald-50 text-emerald-700'
    case 'PARTIAL':
      return 'bg-amber-50 text-amber-700'
    case 'FAILED':
      return 'bg-red-50 text-red-700'
    default:
      return 'bg-gray-100 text-gray-500'
  }
}

/** DIRECT 模式属于高风险覆盖操作，前端据此展示危险确认弹窗。 */
export const isDangerousPushMode = (mode: string | null | undefined): boolean => mode === 'DIRECT'
