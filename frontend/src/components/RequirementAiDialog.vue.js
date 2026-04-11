/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { createTask, createTaskComment, createTestPlan, generateTaskRequirementAi, getTestPlanDetail, pageTestPlans, updateTask, updateTestPlan } from '@/api/platform';
import { listModelConfigOptions } from '@/api/models';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { renderMarkdownToHtml } from '@/utils/markdown';
const props = defineProps();
const emit = defineEmits();
const taskCategoryOptions = ['需求设计', 'UI设计', '技术设计', '开发', '测试', '部署'];
const taskPriorityOptions = ['高', '中', '低'];
const caseTypeOptions = ['功能测试', '接口测试', '回归测试', '异常测试', '兼容性测试', '性能测试'];
const casePriorityOptions = ['P0', 'P1', 'P2', 'P3'];
const modelOptions = ref([]);
const selectedModelConfigId = ref();
const runningAction = ref(null);
const creatingTasks = ref(false);
const importingTestCases = ref(false);
const creatingTestPlan = ref(false);
const selectedPlanId = ref();
const testPlanOptions = ref([]);
const result = ref(null);
const editableTaskSuggestions = ref([]);
const editableTestCaseSuggestions = ref([]);
const taskSuggestionDrawerVisible = ref(false);
const currentTaskSuggestionIndex = ref(null);
const currentTaskSuggestion = computed(() => {
    if (currentTaskSuggestionIndex.value === null) {
        return null;
    }
    return editableTaskSuggestions.value[currentTaskSuggestionIndex.value] || null;
});
const isRequirementTask = computed(() => props.task?.workItemType === '需求');
const loadModelOptions = async () => {
    modelOptions.value = await listModelConfigOptions();
    if (!selectedModelConfigId.value && modelOptions.value.length === 1) {
        selectedModelConfigId.value = modelOptions.value[0].id;
    }
};
const loadTestPlanOptions = async () => {
    if (!props.task) {
        testPlanOptions.value = [];
        return;
    }
    const pageData = await pageTestPlans({
        page: 1,
        size: 100,
        projectId: props.task.projectId,
        iterationId: props.task.iterationId || undefined
    });
    testPlanOptions.value = pageData.records;
};
const cloneTaskSuggestions = (suggestions = []) => suggestions.map((item) => ({
    name: item.name,
    category: item.category,
    priority: item.priority,
    description: item.description
}));
const cloneTestCaseSuggestions = (suggestions = []) => suggestions.map((item) => ({
    title: item.title,
    moduleName: item.moduleName,
    caseType: item.caseType,
    priority: item.priority,
    precondition: item.precondition,
    remarks: item.remarks,
    steps: item.steps.map((step) => ({
        stepNo: step.stepNo,
        action: step.action,
        expectedResult: step.expectedResult
    }))
}));
const runAction = async (action) => {
    if (!props.task) {
        return;
    }
    runningAction.value = action;
    try {
        result.value = await generateTaskRequirementAi(props.task.id, {
            action,
            modelConfigId: selectedModelConfigId.value
        });
        editableTaskSuggestions.value = cloneTaskSuggestions(result.value.taskSuggestions);
        editableTestCaseSuggestions.value = cloneTestCaseSuggestions(result.value.testCaseSuggestions);
        if (action === 'TEST_CASES') {
            await loadTestPlanOptions();
        }
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || 'AI 生成失败');
    }
    finally {
        runningAction.value = null;
    }
};
/**
 * 统一构建工作项更新载荷，避免需求模板字段在 AI 更新时被清空。
 */
const buildTaskUpdatePayload = (nextDescription, nextRequirementMarkdown) => {
    if (!props.task) {
        return null;
    }
    return {
        name: props.task.name,
        workItemType: props.task.workItemType,
        status: props.task.status,
        priority: props.task.priority,
        assignee: props.task.assignee,
        assigneeUserId: props.task.assigneeUserId,
        collaboratorUserIds: props.task.collaboratorUserIds,
        planStartDate: props.task.planStartDate,
        planEndDate: props.task.planEndDate,
        description: nextDescription,
        requirementMarkdown: isRequirementTask.value ? nextRequirementMarkdown || nextDescription : '',
        prototypeUrl: isRequirementTask.value ? props.task.prototypeUrl : '',
        projectId: props.task.projectId,
        agentId: props.task.agentId,
        iterationId: props.task.iterationId,
        requirementTaskId: props.task.requirementTaskId
    };
};
const replaceDescription = async () => {
    if (!props.task || !result.value || !props.canManage) {
        return;
    }
    try {
        const payload = buildTaskUpdatePayload(result.value.markdown, result.value.markdown);
        if (!payload) {
            return;
        }
        await updateTask(props.task.id, payload);
        ElMessage.success('需求描述已更新');
        emit('changed');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '更新描述失败');
    }
};
const appendToDescription = async () => {
    if (!props.task || !result.value || !props.canManage) {
        return;
    }
    const nextDescription = [props.task.description?.trim(), result.value.markdown?.trim()].filter(Boolean).join('\n\n');
    try {
        const payload = buildTaskUpdatePayload(nextDescription, nextDescription);
        if (!payload) {
            return;
        }
        await updateTask(props.task.id, payload);
        ElMessage.success('AI 结果已追加到描述');
        emit('changed');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '更新描述失败');
    }
};
const postAsComment = async () => {
    if (!props.task || !result.value) {
        return;
    }
    try {
        await createTaskComment(props.task.id, `## ${result.value.title}\n\n${result.value.markdown}`);
        ElMessage.success('AI 结果已发布到评论');
        emit('changed');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '发布评论失败');
    }
};
const removeTaskSuggestion = (index) => {
    if (currentTaskSuggestionIndex.value === index) {
        taskSuggestionDrawerVisible.value = false;
        currentTaskSuggestionIndex.value = null;
    }
    else if (currentTaskSuggestionIndex.value !== null && currentTaskSuggestionIndex.value > index) {
        currentTaskSuggestionIndex.value -= 1;
    }
    editableTaskSuggestions.value.splice(index, 1);
};
const openTaskSuggestionDrawer = (index) => {
    currentTaskSuggestionIndex.value = index;
    taskSuggestionDrawerVisible.value = true;
};
const createSuggestedTasks = async () => {
    if (!props.task || !props.canManage || !editableTaskSuggestions.value.length) {
        return;
    }
    creatingTasks.value = true;
    try {
        for (const item of editableTaskSuggestions.value) {
            await createTask({
                name: item.name.trim(),
                workItemType: '任务',
                status: '草稿',
                priority: item.priority,
                assignee: '',
                assigneeUserId: null,
                collaboratorUserIds: [],
                description: item.description,
                projectId: props.task.projectId,
                agentId: null,
                iterationId: props.task.iterationId,
                requirementTaskId: props.task.id
            });
        }
        ElMessage.success(`已创建 ${editableTaskSuggestions.value.length} 个任务`);
        emit('changed');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '创建任务失败');
    }
    finally {
        creatingTasks.value = false;
    }
};
const removeTestCaseSuggestion = (index) => {
    editableTestCaseSuggestions.value.splice(index, 1);
};
const appendStep = (testCase) => {
    testCase.steps.push({
        stepNo: testCase.steps.length + 1,
        action: '',
        expectedResult: ''
    });
};
const removeStep = (testCase, index) => {
    testCase.steps.splice(index, 1);
    testCase.steps.forEach((step, stepIndex) => {
        step.stepNo = stepIndex + 1;
    });
};
const buildCasePayload = (cases) => cases.map((item, caseIndex) => ({
    title: item.title.trim(),
    moduleName: item.moduleName.trim(),
    caseType: item.caseType,
    priority: item.priority,
    precondition: item.precondition.trim(),
    remarks: item.remarks.trim(),
    sortOrder: caseIndex,
    steps: item.steps
        .filter((step) => step.action.trim() && step.expectedResult.trim())
        .map((step, stepIndex) => ({
        stepNo: step.stepNo || stepIndex + 1,
        action: step.action.trim(),
        expectedResult: step.expectedResult.trim()
    }))
}));
const appendToExistingPlan = async () => {
    if (!selectedPlanId.value || !editableTestCaseSuggestions.value.length) {
        return;
    }
    importingTestCases.value = true;
    try {
        const detail = await getTestPlanDetail(selectedPlanId.value);
        await updateTestPlan(selectedPlanId.value, {
            name: detail.name,
            projectId: detail.projectId,
            iterationId: detail.iterationId,
            status: detail.status,
            description: detail.description,
            cases: [...detail.cases, ...buildCasePayload(editableTestCaseSuggestions.value)].map((item, index) => ({
                ...item,
                sortOrder: index
            }))
        });
        ElMessage.success(`已导入 ${editableTestCaseSuggestions.value.length} 条测试用例`);
        emit('changed');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '导入测试计划失败');
    }
    finally {
        importingTestCases.value = false;
    }
};
const createNewPlanWithCases = async () => {
    if (!props.task || !editableTestCaseSuggestions.value.length) {
        return;
    }
    if (!props.task.iterationId) {
        ElMessage.warning('当前需求未分配迭代，无法直接创建测试计划');
        return;
    }
    creatingTestPlan.value = true;
    try {
        await createTestPlan({
            name: `${props.task.name}-测试计划`,
            projectId: props.task.projectId,
            iterationId: props.task.iterationId,
            status: '草稿',
            description: `由需求《${props.task.name}》AI 生成`,
            cases: buildCasePayload(editableTestCaseSuggestions.value)
        });
        ElMessage.success(`已创建测试计划并导入 ${editableTestCaseSuggestions.value.length} 条测试用例`);
        emit('changed');
        await loadTestPlanOptions();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '创建测试计划失败');
    }
    finally {
        creatingTestPlan.value = false;
    }
};
watch(() => props.modelValue, (visible) => {
    if (!visible) {
        result.value = null;
        editableTaskSuggestions.value = [];
        editableTestCaseSuggestions.value = [];
        selectedPlanId.value = undefined;
        taskSuggestionDrawerVisible.value = false;
        currentTaskSuggestionIndex.value = null;
        runningAction.value = null;
        creatingTasks.value = false;
        importingTestCases.value = false;
        creatingTestPlan.value = false;
    }
});
watch(() => props.task?.id, () => {
    result.value = null;
    editableTaskSuggestions.value = [];
    editableTestCaseSuggestions.value = [];
    selectedPlanId.value = undefined;
    taskSuggestionDrawerVisible.value = false;
    currentTaskSuggestionIndex.value = null;
});
onMounted(async () => {
    await loadModelOptions();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-body']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['triple']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.modelValue),
    width: "1080px",
    alignCenter: true,
    destroyOnClose: true,
    ...{ class: "requirement-ai-dialog" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.modelValue),
    width: "1080px",
    alignCenter: true,
    destroyOnClose: true,
    ...{ class: "requirement-ai-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClose: (...[$event]) => {
        __VLS_ctx.emit('update:modelValue', false);
    }
};
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-subtitle" },
    });
    (__VLS_ctx.task?.name || '-');
}
if (__VLS_ctx.task) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-toolbar" },
    });
    const __VLS_8 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        modelValue: (__VLS_ctx.selectedModelConfigId),
        clearable: true,
        filterable: true,
        placeholder: "选择模型，不选则使用第一个启用模型",
        ...{ style: {} },
    }));
    const __VLS_10 = __VLS_9({
        modelValue: (__VLS_ctx.selectedModelConfigId),
        clearable: true,
        filterable: true,
        placeholder: "选择模型，不选则使用第一个启用模型",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.modelOptions))) {
        const __VLS_12 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            key: (item.id),
            label: (item.name),
            value: (item.id),
        }));
        const __VLS_14 = __VLS_13({
            key: (item.id),
            label: (item.name),
            value: (item.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    }
    var __VLS_11;
    const __VLS_16 = {}.ElSpace;
    /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        wrap: true,
    }));
    const __VLS_18 = __VLS_17({
        wrap: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.runningAction === 'STANDARDIZE'),
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.runningAction === 'STANDARDIZE'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.task))
                return;
            __VLS_ctx.runAction('STANDARDIZE');
        }
    };
    __VLS_23.slots.default;
    var __VLS_23;
    const __VLS_28 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.runningAction === 'BREAKDOWN'),
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.runningAction === 'BREAKDOWN'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.task))
                return;
            __VLS_ctx.runAction('BREAKDOWN');
        }
    };
    __VLS_31.slots.default;
    var __VLS_31;
    const __VLS_36 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.runningAction === 'TEST_CASES'),
    }));
    const __VLS_38 = __VLS_37({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.runningAction === 'TEST_CASES'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    let __VLS_40;
    let __VLS_41;
    let __VLS_42;
    const __VLS_43 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.task))
                return;
            __VLS_ctx.runAction('TEST_CASES');
        }
    };
    __VLS_39.slots.default;
    var __VLS_39;
    var __VLS_19;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-section-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-section-title" },
    });
    (__VLS_ctx.result?.title || 'AI 结果预览');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-section-subtitle" },
    });
    (__VLS_ctx.result?.modelConfigName ? `模型：${__VLS_ctx.result.modelConfigName}` : '尚未生成内容');
    if (__VLS_ctx.result) {
        const __VLS_44 = {}.ElSpace;
        /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
        const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_47.slots.default;
        const __VLS_48 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            ...{ 'onClick': {} },
        }));
        const __VLS_50 = __VLS_49({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        let __VLS_52;
        let __VLS_53;
        let __VLS_54;
        const __VLS_55 = {
            onClick: (__VLS_ctx.postAsComment)
        };
        __VLS_51.slots.default;
        var __VLS_51;
        if (__VLS_ctx.canManage && !__VLS_ctx.isRequirementTask) {
            const __VLS_56 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                ...{ 'onClick': {} },
            }));
            const __VLS_58 = __VLS_57({
                ...{ 'onClick': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_57));
            let __VLS_60;
            let __VLS_61;
            let __VLS_62;
            const __VLS_63 = {
                onClick: (__VLS_ctx.appendToDescription)
            };
            __VLS_59.slots.default;
            var __VLS_59;
        }
        if (__VLS_ctx.canManage && __VLS_ctx.result.action === 'STANDARDIZE') {
            const __VLS_64 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
                ...{ 'onClick': {} },
                type: "primary",
            }));
            const __VLS_66 = __VLS_65({
                ...{ 'onClick': {} },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_65));
            let __VLS_68;
            let __VLS_69;
            let __VLS_70;
            const __VLS_71 = {
                onClick: (__VLS_ctx.replaceDescription)
            };
            __VLS_67.slots.default;
            var __VLS_67;
        }
        var __VLS_47;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-markdown" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.renderMarkdownToHtml(__VLS_ctx.result?.markdown)) }, null, null);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-side" },
    });
    if (__VLS_ctx.result?.action === 'BREAKDOWN') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-head compact" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-subtitle" },
        });
        if (__VLS_ctx.canManage && __VLS_ctx.editableTaskSuggestions.length) {
            const __VLS_72 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.creatingTasks),
            }));
            const __VLS_74 = __VLS_73({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.creatingTasks),
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            let __VLS_76;
            let __VLS_77;
            let __VLS_78;
            const __VLS_79 = {
                onClick: (__VLS_ctx.createSuggestedTasks)
            };
            __VLS_75.slots.default;
            var __VLS_75;
        }
        if (!__VLS_ctx.editableTaskSuggestions.length) {
            const __VLS_80 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                description: "暂无拆解任务",
            }));
            const __VLS_82 = __VLS_81({
                description: "暂无拆解任务",
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "requirement-ai-suggestions" },
            });
            for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.editableTaskSuggestions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (`${item.name}-${index}`),
                    ...{ class: "requirement-ai-suggestion editable" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-card-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "requirement-ai-card-index" },
                });
                (index + 1);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "requirement-ai-card-type" },
                });
                (item.category);
                (item.priority);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-suggestion-actions" },
                });
                const __VLS_84 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "primary",
                }));
                const __VLS_86 = __VLS_85({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_85));
                let __VLS_88;
                let __VLS_89;
                let __VLS_90;
                const __VLS_91 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.task))
                            return;
                        if (!(__VLS_ctx.result?.action === 'BREAKDOWN'))
                            return;
                        if (!!(!__VLS_ctx.editableTaskSuggestions.length))
                            return;
                        __VLS_ctx.openTaskSuggestionDrawer(index);
                    }
                };
                __VLS_87.slots.default;
                var __VLS_87;
                const __VLS_92 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "danger",
                }));
                const __VLS_94 = __VLS_93({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_93));
                let __VLS_96;
                let __VLS_97;
                let __VLS_98;
                const __VLS_99 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.task))
                            return;
                        if (!(__VLS_ctx.result?.action === 'BREAKDOWN'))
                            return;
                        if (!!(!__VLS_ctx.editableTaskSuggestions.length))
                            return;
                        __VLS_ctx.removeTaskSuggestion(index);
                    }
                };
                __VLS_95.slots.default;
                var __VLS_95;
                const __VLS_100 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
                    modelValue: (item.name),
                    placeholder: "任务标题",
                }));
                const __VLS_102 = __VLS_101({
                    modelValue: (item.name),
                    placeholder: "任务标题",
                }, ...__VLS_functionalComponentArgsRest(__VLS_101));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-suggestion-grid" },
                });
                const __VLS_104 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                    modelValue: (item.category),
                }));
                const __VLS_106 = __VLS_105({
                    modelValue: (item.category),
                }, ...__VLS_functionalComponentArgsRest(__VLS_105));
                __VLS_107.slots.default;
                for (const [option] of __VLS_getVForSourceType((__VLS_ctx.taskCategoryOptions))) {
                    const __VLS_108 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                        key: (option),
                        label: (option),
                        value: (option),
                    }));
                    const __VLS_110 = __VLS_109({
                        key: (option),
                        label: (option),
                        value: (option),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
                }
                var __VLS_107;
                const __VLS_112 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
                    modelValue: (item.priority),
                }));
                const __VLS_114 = __VLS_113({
                    modelValue: (item.priority),
                }, ...__VLS_functionalComponentArgsRest(__VLS_113));
                __VLS_115.slots.default;
                for (const [option] of __VLS_getVForSourceType((__VLS_ctx.taskPriorityOptions))) {
                    const __VLS_116 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
                        key: (option),
                        label: (option),
                        value: (option),
                    }));
                    const __VLS_118 = __VLS_117({
                        key: (option),
                        label: (option),
                        value: (option),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
                }
                var __VLS_115;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-suggestion-desc" },
                });
                __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.renderMarkdownToHtml(item.description)) }, null, null);
            }
        }
    }
    else if (__VLS_ctx.result?.action === 'TEST_CASES') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-head compact" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-subtitle" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-plan-toolbar" },
        });
        const __VLS_120 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            modelValue: (__VLS_ctx.selectedPlanId),
            clearable: true,
            filterable: true,
            placeholder: "选择已有测试计划",
            ...{ style: {} },
        }));
        const __VLS_122 = __VLS_121({
            modelValue: (__VLS_ctx.selectedPlanId),
            clearable: true,
            filterable: true,
            placeholder: "选择已有测试计划",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        __VLS_123.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.testPlanOptions))) {
            const __VLS_124 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                key: (item.id),
                label: (item.name),
                value: (item.id),
            }));
            const __VLS_126 = __VLS_125({
                key: (item.id),
                label: (item.name),
                value: (item.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        }
        var __VLS_123;
        const __VLS_128 = {}.ElSpace;
        /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            wrap: true,
        }));
        const __VLS_130 = __VLS_129({
            wrap: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        __VLS_131.slots.default;
        if (__VLS_ctx.canManage && __VLS_ctx.editableTestCaseSuggestions.length && __VLS_ctx.selectedPlanId) {
            const __VLS_132 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.importingTestCases),
            }));
            const __VLS_134 = __VLS_133({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.importingTestCases),
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            let __VLS_136;
            let __VLS_137;
            let __VLS_138;
            const __VLS_139 = {
                onClick: (__VLS_ctx.appendToExistingPlan)
            };
            __VLS_135.slots.default;
            var __VLS_135;
        }
        if (__VLS_ctx.canManage && __VLS_ctx.editableTestCaseSuggestions.length) {
            const __VLS_140 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.creatingTestPlan),
            }));
            const __VLS_142 = __VLS_141({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.creatingTestPlan),
            }, ...__VLS_functionalComponentArgsRest(__VLS_141));
            let __VLS_144;
            let __VLS_145;
            let __VLS_146;
            const __VLS_147 = {
                onClick: (__VLS_ctx.createNewPlanWithCases)
            };
            __VLS_143.slots.default;
            var __VLS_143;
        }
        var __VLS_131;
        if (!__VLS_ctx.editableTestCaseSuggestions.length) {
            const __VLS_148 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
                description: "暂无测试用例",
            }));
            const __VLS_150 = __VLS_149({
                description: "暂无测试用例",
            }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "requirement-ai-suggestions" },
            });
            for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.editableTestCaseSuggestions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (`${item.title}-${index}`),
                    ...{ class: "requirement-ai-suggestion editable" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-card-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "requirement-ai-card-index" },
                });
                (index + 1);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "requirement-ai-card-type" },
                });
                (item.caseType);
                (item.priority);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-suggestion-actions" },
                });
                const __VLS_152 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "danger",
                }));
                const __VLS_154 = __VLS_153({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "danger",
                }, ...__VLS_functionalComponentArgsRest(__VLS_153));
                let __VLS_156;
                let __VLS_157;
                let __VLS_158;
                const __VLS_159 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.task))
                            return;
                        if (!!(__VLS_ctx.result?.action === 'BREAKDOWN'))
                            return;
                        if (!(__VLS_ctx.result?.action === 'TEST_CASES'))
                            return;
                        if (!!(!__VLS_ctx.editableTestCaseSuggestions.length))
                            return;
                        __VLS_ctx.removeTestCaseSuggestion(index);
                    }
                };
                __VLS_155.slots.default;
                var __VLS_155;
                const __VLS_160 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                    modelValue: (item.title),
                    placeholder: "用例标题",
                }));
                const __VLS_162 = __VLS_161({
                    modelValue: (item.title),
                    placeholder: "用例标题",
                }, ...__VLS_functionalComponentArgsRest(__VLS_161));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-suggestion-grid triple" },
                });
                const __VLS_164 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                    modelValue: (item.moduleName),
                    placeholder: "功能模块",
                }));
                const __VLS_166 = __VLS_165({
                    modelValue: (item.moduleName),
                    placeholder: "功能模块",
                }, ...__VLS_functionalComponentArgsRest(__VLS_165));
                const __VLS_168 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
                    modelValue: (item.caseType),
                }));
                const __VLS_170 = __VLS_169({
                    modelValue: (item.caseType),
                }, ...__VLS_functionalComponentArgsRest(__VLS_169));
                __VLS_171.slots.default;
                for (const [option] of __VLS_getVForSourceType((__VLS_ctx.caseTypeOptions))) {
                    const __VLS_172 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                        key: (option),
                        label: (option),
                        value: (option),
                    }));
                    const __VLS_174 = __VLS_173({
                        key: (option),
                        label: (option),
                        value: (option),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
                }
                var __VLS_171;
                const __VLS_176 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                    modelValue: (item.priority),
                }));
                const __VLS_178 = __VLS_177({
                    modelValue: (item.priority),
                }, ...__VLS_functionalComponentArgsRest(__VLS_177));
                __VLS_179.slots.default;
                for (const [option] of __VLS_getVForSourceType((__VLS_ctx.casePriorityOptions))) {
                    const __VLS_180 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                        key: (option),
                        label: (option),
                        value: (option),
                    }));
                    const __VLS_182 = __VLS_181({
                        key: (option),
                        label: (option),
                        value: (option),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
                }
                var __VLS_179;
                const __VLS_184 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                    modelValue: (item.precondition),
                    type: "textarea",
                    rows: (2),
                    placeholder: "前置条件",
                }));
                const __VLS_186 = __VLS_185({
                    modelValue: (item.precondition),
                    type: "textarea",
                    rows: (2),
                    placeholder: "前置条件",
                }, ...__VLS_functionalComponentArgsRest(__VLS_185));
                const __VLS_188 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                    modelValue: (item.remarks),
                    type: "textarea",
                    rows: (2),
                    placeholder: "备注",
                }));
                const __VLS_190 = __VLS_189({
                    modelValue: (item.remarks),
                    type: "textarea",
                    rows: (2),
                    placeholder: "备注",
                }, ...__VLS_functionalComponentArgsRest(__VLS_189));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-steps" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "requirement-ai-steps-head" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                const __VLS_192 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "primary",
                }));
                const __VLS_194 = __VLS_193({
                    ...{ 'onClick': {} },
                    text: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_193));
                let __VLS_196;
                let __VLS_197;
                let __VLS_198;
                const __VLS_199 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.task))
                            return;
                        if (!!(__VLS_ctx.result?.action === 'BREAKDOWN'))
                            return;
                        if (!(__VLS_ctx.result?.action === 'TEST_CASES'))
                            return;
                        if (!!(!__VLS_ctx.editableTestCaseSuggestions.length))
                            return;
                        __VLS_ctx.appendStep(item);
                    }
                };
                __VLS_195.slots.default;
                var __VLS_195;
                for (const [step, stepIndex] of __VLS_getVForSourceType((item.steps))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (stepIndex),
                        ...{ class: "requirement-ai-step" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "requirement-ai-step-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (step.stepNo);
                    const __VLS_200 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                        ...{ 'onClick': {} },
                        text: true,
                        type: "danger",
                    }));
                    const __VLS_202 = __VLS_201({
                        ...{ 'onClick': {} },
                        text: true,
                        type: "danger",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
                    let __VLS_204;
                    let __VLS_205;
                    let __VLS_206;
                    const __VLS_207 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.task))
                                return;
                            if (!!(__VLS_ctx.result?.action === 'BREAKDOWN'))
                                return;
                            if (!(__VLS_ctx.result?.action === 'TEST_CASES'))
                                return;
                            if (!!(!__VLS_ctx.editableTestCaseSuggestions.length))
                                return;
                            __VLS_ctx.removeStep(item, stepIndex);
                        }
                    };
                    __VLS_203.slots.default;
                    var __VLS_203;
                    const __VLS_208 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
                        modelValue: (step.action),
                        type: "textarea",
                        rows: (2),
                        placeholder: "执行步骤",
                    }));
                    const __VLS_210 = __VLS_209({
                        modelValue: (step.action),
                        type: "textarea",
                        rows: (2),
                        placeholder: "执行步骤",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
                    const __VLS_212 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
                        modelValue: (step.expectedResult),
                        type: "textarea",
                        rows: (2),
                        placeholder: "预期结果",
                    }));
                    const __VLS_214 = __VLS_213({
                        modelValue: (step.expectedResult),
                        type: "textarea",
                        rows: (2),
                        placeholder: "预期结果",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
                }
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-head compact" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "requirement-ai-section-subtitle" },
        });
        const __VLS_216 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            description: "当前动作没有侧边操作项",
        }));
        const __VLS_218 = __VLS_217({
            description: "当前动作没有侧边操作项",
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    }
}
var __VLS_3;
const __VLS_220 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
    modelValue: (__VLS_ctx.taskSuggestionDrawerVisible),
    size: "56%",
    destroyOnClose: true,
    ...{ class: "requirement-ai-drawer" },
}));
const __VLS_222 = __VLS_221({
    modelValue: (__VLS_ctx.taskSuggestionDrawerVisible),
    size: "56%",
    destroyOnClose: true,
    ...{ class: "requirement-ai-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
__VLS_223.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_223.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-drawer-title" },
    });
}
if (__VLS_ctx.currentTaskSuggestion) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-drawer-body" },
    });
    const __VLS_224 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        modelValue: (__VLS_ctx.currentTaskSuggestion.name),
        placeholder: "任务标题",
    }));
    const __VLS_226 = __VLS_225({
        modelValue: (__VLS_ctx.currentTaskSuggestion.name),
        placeholder: "任务标题",
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "requirement-ai-suggestion-grid" },
    });
    const __VLS_228 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        modelValue: (__VLS_ctx.currentTaskSuggestion.category),
    }));
    const __VLS_230 = __VLS_229({
        modelValue: (__VLS_ctx.currentTaskSuggestion.category),
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    __VLS_231.slots.default;
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.taskCategoryOptions))) {
        const __VLS_232 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
            key: (option),
            label: (option),
            value: (option),
        }));
        const __VLS_234 = __VLS_233({
            key: (option),
            label: (option),
            value: (option),
        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    }
    var __VLS_231;
    const __VLS_236 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        modelValue: (__VLS_ctx.currentTaskSuggestion.priority),
    }));
    const __VLS_238 = __VLS_237({
        modelValue: (__VLS_ctx.currentTaskSuggestion.priority),
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    __VLS_239.slots.default;
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.taskPriorityOptions))) {
        const __VLS_240 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
            key: (option),
            label: (option),
            value: (option),
        }));
        const __VLS_242 = __VLS_241({
            key: (option),
            label: (option),
            value: (option),
        }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    }
    var __VLS_239;
    /** @type {[typeof MarkdownEditor, ]} */ ;
    // @ts-ignore
    const __VLS_244 = __VLS_asFunctionalComponent(MarkdownEditor, new MarkdownEditor({
        modelValue: (__VLS_ctx.currentTaskSuggestion.description),
        height: (520),
        placeholder: "任务说明（Markdown）",
    }));
    const __VLS_245 = __VLS_244({
        modelValue: (__VLS_ctx.currentTaskSuggestion.description),
        height: (520),
        placeholder: "任务说明（Markdown）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_244));
}
var __VLS_223;
/** @type {__VLS_StyleScopedClasses['requirement-ai-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-header']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-title']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-body']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-side']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestions']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion']} */ ;
/** @type {__VLS_StyleScopedClasses['editable']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-card-index']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-card-type']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-plan-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestions']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion']} */ ;
/** @type {__VLS_StyleScopedClasses['editable']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-card-index']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-card-type']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['triple']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-steps-head']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-step']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-step-head']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-drawer-title']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-drawer-body']} */ ;
/** @type {__VLS_StyleScopedClasses['requirement-ai-suggestion-grid']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MarkdownEditor: MarkdownEditor,
            renderMarkdownToHtml: renderMarkdownToHtml,
            emit: emit,
            taskCategoryOptions: taskCategoryOptions,
            taskPriorityOptions: taskPriorityOptions,
            caseTypeOptions: caseTypeOptions,
            casePriorityOptions: casePriorityOptions,
            modelOptions: modelOptions,
            selectedModelConfigId: selectedModelConfigId,
            runningAction: runningAction,
            creatingTasks: creatingTasks,
            importingTestCases: importingTestCases,
            creatingTestPlan: creatingTestPlan,
            selectedPlanId: selectedPlanId,
            testPlanOptions: testPlanOptions,
            result: result,
            editableTaskSuggestions: editableTaskSuggestions,
            editableTestCaseSuggestions: editableTestCaseSuggestions,
            taskSuggestionDrawerVisible: taskSuggestionDrawerVisible,
            currentTaskSuggestion: currentTaskSuggestion,
            isRequirementTask: isRequirementTask,
            runAction: runAction,
            replaceDescription: replaceDescription,
            appendToDescription: appendToDescription,
            postAsComment: postAsComment,
            removeTaskSuggestion: removeTaskSuggestion,
            openTaskSuggestionDrawer: openTaskSuggestionDrawer,
            createSuggestedTasks: createSuggestedTasks,
            removeTestCaseSuggestion: removeTestCaseSuggestion,
            appendStep: appendStep,
            removeStep: removeStep,
            appendToExistingPlan: appendToExistingPlan,
            createNewPlanWithCases: createNewPlanWithCases,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=RequirementAiDialog.vue.js.map