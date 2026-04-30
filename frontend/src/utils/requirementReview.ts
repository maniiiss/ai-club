import { formatWorkItemStatusLabel } from './workItemStatus'

/**
 * 需求评审阶段显示所需的最小字段集合。
 */
interface RequirementReviewState {
  workItemType: '需求' | '任务' | '缺陷' | string
  status: string
  devPassed: boolean
  testPassed: boolean
}

/**
 * 需求是否全部通过判断所需的最小字段集合。
 */
interface RequirementPassState {
  devPassed: boolean | null
  testPassed: boolean | null
}

/**
 * 任务工时解锁判断所需的最小字段集合。
 */
interface RequirementLinkedState {
  requirementTaskId: number | null
  requirementDevPassed: boolean | null
  requirementTestPassed: boolean | null
}

/**
 * 构建需求工作项状态展示文案。
 */
export const formatRequirementStatusLabel = (state: RequirementReviewState) =>
  formatWorkItemStatusLabel(state.workItemType, state.status)

/**
 * 判断需求是否评审、开发、测试均已通过。
 */
export const isRequirementFullyPassed = (state: RequirementPassState) =>
  Boolean(state.devPassed && state.testPassed)

/**
 * 判断任务关联需求是否已全部通过，从而解锁工时编辑。
 */
export const isTaskWorkHoursUnlocked = (state: RequirementLinkedState) => {
  if (!state.requirementTaskId) {
    return true
  }
  return isRequirementFullyPassed({
    devPassed: state.requirementDevPassed,
    testPassed: state.requirementTestPassed
  })
}

/**
 * 获取任务工时被锁定时的提示文案。
 */
export const getTaskWorkHoursLockedReason = (state: RequirementLinkedState) => {
  if (isTaskWorkHoursUnlocked(state)) {
    return ''
  }
  return '需关联需求开发、测试均通过后才可编辑'
}
