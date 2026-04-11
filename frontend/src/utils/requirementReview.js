/**
 * 构建需求工作项状态展示文案。
 */
export const formatRequirementStatusLabel = (state) => {
    if (state.workItemType === '需求' && state.status === '草稿' && isRequirementFullyPassed(state)) {
        return '草稿（评审通过）';
    }
    return state.status;
};
/**
 * 判断需求是否评审、开发、测试均已通过。
 */
export const isRequirementFullyPassed = (state) => Boolean(state.devPassed && state.testPassed);
/**
 * 判断任务关联需求是否已全部通过，从而解锁工时编辑。
 */
export const isTaskWorkHoursUnlocked = (state) => {
    if (!state.requirementTaskId) {
        return true;
    }
    return isRequirementFullyPassed({
        devPassed: state.requirementDevPassed,
        testPassed: state.requirementTestPassed
    });
};
/**
 * 获取任务工时被锁定时的提示文案。
 */
export const getTaskWorkHoursLockedReason = (state) => {
    if (isTaskWorkHoursUnlocked(state)) {
        return '';
    }
    return '需关联需求开发、测试均通过后才可编辑';
};
//# sourceMappingURL=requirementReview.js.map