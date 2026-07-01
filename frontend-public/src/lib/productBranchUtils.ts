import type { GitlabProductBranchItem } from '@/src/types/development'

/** 产品分支同步结果的公众端展示文案，与后端 result 枚举解耦。 */
export const productBranchSyncResultLabel = (result: string | null | undefined): string => {
  switch (result) {
    case 'CREATED':
      return '已创建同步 MR'
    case 'NO_CHANGE':
      return '无变更'
    case 'EXISTING_OPEN_MR':
      return '已有开放 MR'
    case 'FAILED':
      return '失败'
    case 'SKIPPED':
      return '已跳过'
    default:
      return result || '未同步'
  }
}

/** 产品分支同步结果的色彩语义，供列表和结果弹窗复用。 */
export const productBranchSyncResultStyle = (result: string | null | undefined): string => {
  switch (result) {
    case 'CREATED':
      return 'bg-emerald-50 text-emerald-700'
    case 'NO_CHANGE':
      return 'bg-gray-100 text-gray-600'
    case 'EXISTING_OPEN_MR':
      return 'bg-blue-50 text-blue-700'
    case 'FAILED':
      return 'bg-red-50 text-red-700'
    case 'SKIPPED':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-gray-100 text-gray-500'
  }
}

/** 批量同步只能选择已启用的产品分支，避免向后端提交不可执行目标。 */
export const getEnabledProductBranchIds = (
  branches: Pick<GitlabProductBranchItem, 'id' | 'enabled'>[],
): number[] => branches.filter((branch) => branch.enabled).map((branch) => branch.id)
