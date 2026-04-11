/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, ArrowRight, Delete, Finished, Plus, RefreshRight, Right, Search } from '@element-plus/icons-vue';
import CompactSelectMenu from '@/components/CompactSelectMenu.vue';
import { getTestPlanDetail, updateTestPlan } from '@/api/platform';
import { useAuthStore } from '@/stores/auth';
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('test:manage'));
const statusOptions = ['草稿', '待执行', '执行中', '已完成'];
const statusSelectOptions = [
    { label: '草稿', value: '草稿', tone: 'info' },
    { label: '待执行', value: '待执行', tone: 'warning' },
    { label: '执行中', value: '执行中', tone: 'primary' },
    { label: '已完成', value: '已完成', tone: 'success' }
];
const caseTypeOptions = ['功能测试', '接口测试', '回归测试', '冒烟测试', '兼容性测试'];
const priorityOptions = ['P0', 'P1', 'P2', 'P3'];
const plan = ref(null);
const cases = ref([]);
const saving = ref(false);
const drawerVisible = ref(false);
const activeCaseIndex = ref(null);
const planId = Number(route.params.planId);
const pagination = reactive({
    page: 1,
    size: 10
});
const caseKeyword = ref('');
const createLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const filteredCases = computed(() => {
    const normalizedKeyword = caseKeyword.value.trim().toLowerCase();
    const items = cases.value.map((item, index) => ({
        ...item,
        absoluteIndex: index
    }));
    if (!normalizedKeyword) {
        return items;
    }
    return items.filter((item) => {
        const searchableText = [
            item.title,
            item.moduleName,
            item.caseType,
            item.priority,
            item.precondition,
            item.remarks,
            item.steps.map((step) => `${step.action} ${step.expectedResult}`).join(' ')
        ]
            .join(' ')
            .toLowerCase();
        return searchableText.includes(normalizedKeyword);
    });
});
const caseTotalPages = computed(() => Math.max(1, Math.ceil(filteredCases.value.length / pagination.size) || 1));
const pagedCases = computed(() => filteredCases.value
    .slice((pagination.page - 1) * pagination.size, pagination.page * pagination.size));
const activeCase = computed(() => {
    if (activeCaseIndex.value === null) {
        return null;
    }
    return cases.value[activeCaseIndex.value] || null;
});
const drawerTitle = computed(() => {
    if (!activeCase.value) {
        return '测试用例详情';
    }
    return activeCase.value.title.trim() || '测试用例详情';
});
const planStatusTone = (status) => {
    if (status === '已完成')
        return 'success';
    if (status === '执行中')
        return 'warning';
    if (status === '待执行')
        return 'info';
    return 'neutral';
};
const casePriorityTone = (priority) => {
    if (priority === 'P0')
        return 'danger';
    if (priority === 'P1')
        return 'warning';
    if (priority === 'P2')
        return 'info';
    return 'neutral';
};
const formatCasePreview = (item) => {
    const segments = [item.precondition.trim(), item.steps[0]?.action.trim() || '']
        .filter(Boolean);
    if (!segments.length) {
        return '点击进入后补充前置条件、步骤与预期结果';
    }
    return segments.join(' · ');
};
const formatCaseRemarks = (item) => {
    const remarks = item.remarks.trim();
    if (remarks) {
        return remarks;
    }
    return item.precondition.trim() || '-';
};
const resetCaseKeyword = () => {
    caseKeyword.value = '';
};
watch(caseKeyword, () => {
    pagination.page = 1;
});
watch([() => filteredCases.value.length, () => pagination.size], () => {
    if (pagination.page > caseTotalPages.value) {
        pagination.page = caseTotalPages.value;
    }
});
const handleSizeChange = () => {
    pagination.page = 1;
};
const handlePrevPage = () => {
    if (pagination.page <= 1) {
        return;
    }
    pagination.page -= 1;
};
const handleNextPage = () => {
    if (pagination.page >= caseTotalPages.value) {
        return;
    }
    pagination.page += 1;
};
const createStep = () => ({
    localId: createLocalId(),
    stepNo: 1,
    action: '',
    expectedResult: ''
});
const createCase = () => ({
    localId: createLocalId(),
    title: '',
    moduleName: '',
    caseType: '功能测试',
    priority: 'P2',
    precondition: '',
    remarks: '',
    sortOrder: cases.value.length,
    steps: [createStep()]
});
const syncOrder = () => {
    cases.value.forEach((item, index) => {
        item.sortOrder = index;
        item.steps.forEach((step, stepIndex) => {
            step.stepNo = stepIndex + 1;
        });
    });
};
const fillCases = (detail) => {
    cases.value = detail.cases.map((item, index) => ({
        localId: createLocalId(),
        title: item.title,
        moduleName: item.moduleName,
        caseType: item.caseType,
        priority: item.priority,
        precondition: item.precondition,
        remarks: item.remarks,
        sortOrder: item.sortOrder ?? index,
        steps: item.steps.length
            ? item.steps.map((step, stepIndex) => ({
                localId: createLocalId(),
                stepNo: step.stepNo ?? stepIndex + 1,
                action: step.action,
                expectedResult: step.expectedResult
            }))
            : [createStep()]
    }));
    syncOrder();
};
const loadPlan = async () => {
    if (Number.isNaN(planId) || planId <= 0) {
        ElMessage.error('测试计划参数不正确');
        await router.replace({ name: 'tests' });
        return;
    }
    try {
        const detail = await getTestPlanDetail(planId);
        plan.value = detail;
        fillCases(detail);
        if (activeCaseIndex.value !== null && activeCaseIndex.value >= cases.value.length) {
            activeCaseIndex.value = cases.value.length ? cases.value.length - 1 : null;
        }
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载测试计划详情失败');
        await router.replace({ name: 'tests' });
    }
};
const buildPayloadCases = () => {
    const payloadCases = [];
    for (let caseIndex = 0; caseIndex < cases.value.length; caseIndex += 1) {
        const item = cases.value[caseIndex];
        const title = item.title.trim();
        const moduleName = item.moduleName.trim();
        const precondition = item.precondition.trim();
        const remarks = item.remarks.trim();
        const hasStepContent = item.steps.some((step) => step.action.trim() || step.expectedResult.trim());
        const hasCaseContent = title || moduleName || precondition || remarks || hasStepContent;
        if (!hasCaseContent) {
            continue;
        }
        if (!title) {
            throw new Error(`第 ${caseIndex + 1} 个测试用例缺少标题`);
        }
        const steps = item.steps.reduce((result, step, stepIndex) => {
            const action = step.action.trim();
            const expectedResult = step.expectedResult.trim();
            if (!action && !expectedResult) {
                return result;
            }
            if (!action || !expectedResult) {
                throw new Error(`第 ${caseIndex + 1} 个测试用例的第 ${stepIndex + 1} 步请填写完整`);
            }
            result.push({
                stepNo: result.length + 1,
                action,
                expectedResult
            });
            return result;
        }, []);
        if (!steps.length) {
            throw new Error(`第 ${caseIndex + 1} 个测试用例至少需要一条测试步骤`);
        }
        payloadCases.push({
            title,
            moduleName,
            caseType: item.caseType || '功能测试',
            priority: item.priority || 'P2',
            precondition,
            remarks,
            sortOrder: payloadCases.length,
            steps
        });
    }
    return payloadCases;
};
const addCase = () => {
    cases.value.push(createCase());
    syncOrder();
};
const handleCreateCase = () => {
    addCase();
    pagination.page = Math.max(1, Math.ceil(cases.value.length / pagination.size));
    openCaseDetail(cases.value.length - 1);
};
const openCaseDetail = (index) => {
    activeCaseIndex.value = index;
    drawerVisible.value = true;
};
const removeCase = (index) => {
    cases.value.splice(index, 1);
    if (!cases.value.length) {
        activeCaseIndex.value = null;
        drawerVisible.value = false;
    }
    else if (activeCaseIndex.value !== null) {
        if (index === activeCaseIndex.value) {
            activeCaseIndex.value = Math.min(index, cases.value.length - 1);
        }
        else if (index < activeCaseIndex.value) {
            activeCaseIndex.value -= 1;
        }
    }
    syncOrder();
    const totalPages = Math.max(1, Math.ceil(cases.value.length / pagination.size));
    if (pagination.page > totalPages) {
        pagination.page = totalPages;
    }
};
const addStep = (item) => {
    item.steps.push(createStep());
    syncOrder();
};
const removeStep = (item, index) => {
    item.steps.splice(index, 1);
    syncOrder();
};
const handleSave = async () => {
    if (!plan.value) {
        return;
    }
    saving.value = true;
    try {
        await updateTestPlan(plan.value.id, {
            name: plan.value.name,
            projectId: plan.value.projectId,
            iterationId: plan.value.iterationId,
            status: plan.value.status,
            description: plan.value.description,
            cases: buildPayloadCases()
        });
        ElMessage.success('测试用例已保存');
        await loadPlan();
    }
    catch (error) {
        ElMessage.error(error?.message || error?.response?.data?.message || '保存失败');
    }
    finally {
        saving.value = false;
    }
};
const goToProject = async (projectId) => {
    await router.push({ name: 'project-iterations', params: { projectId } });
};
const goToIteration = async (projectId, iterationId) => {
    await router.push({ name: 'project-iterations', params: { projectId }, query: { iterationId: String(iterationId) } });
};
const handlePlanStatusChange = async (status) => {
    if (!plan.value || !plan.value.iterationId || plan.value.status === status) {
        return;
    }
    try {
        await updateTestPlan(plan.value.id, {
            name: plan.value.name,
            projectId: plan.value.projectId,
            iterationId: plan.value.iterationId,
            status,
            description: plan.value.description,
            cases: buildPayloadCases()
        });
        plan.value.status = status;
        ElMessage.success('测试计划状态已更新');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '状态更新失败');
    }
};
const handleSaveActiveCase = async () => {
    if (!activeCase.value) {
        return;
    }
    const title = activeCase.value.title.trim();
    if (!title) {
        ElMessage.warning('请填写测试用例标题');
        return;
    }
    const steps = activeCase.value.steps.filter((step) => step.action.trim() || step.expectedResult.trim());
    if (!steps.length) {
        ElMessage.warning('当前测试用例至少需要一条测试步骤');
        return;
    }
    for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (!step.action.trim() || !step.expectedResult.trim()) {
            ElMessage.warning(`当前测试用例的第 ${index + 1} 步请填写完整`);
            return;
        }
    }
    await handleSave();
    drawerVisible.value = false;
};
const goBack = async () => {
    await router.push({ name: 'tests' });
};
onMounted(async () => {
    await loadPlan();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['detail-hero-head']} */ ;
/** @type {__VLS_StyleScopedClasses['step-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-head']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-row']} */ ;
/** @type {__VLS_StyleScopedClasses['step-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-description']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-head']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-row']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['step-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-head']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-description']} */ ;
/** @type {__VLS_StyleScopedClasses['step-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-steps']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-list-page test-plan-detail-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "detail-hero" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-hero-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-hero-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.goBack) },
    ...{ class: "detail-back-link" },
    type: "button",
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-title" },
});
(__VLS_ctx.plan?.name || '测试计划详情');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-hero-actions" },
});
if (__VLS_ctx.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleCreateCase) },
        ...{ class: "atelier-create-button" },
        type: "button",
    });
    const __VLS_8 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
    const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "detail-summary-card detail-summary-card-compact" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-main" },
});
if (__VLS_ctx.plan?.projectId) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.plan?.projectId))
                    return;
                __VLS_ctx.goToProject(__VLS_ctx.plan.projectId);
            } },
        ...{ class: "management-list-link detail-summary-link" },
        type: "button",
    });
    (__VLS_ctx.plan?.projectName || '-');
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-summary-value" },
    });
    (__VLS_ctx.plan?.projectName || '-');
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "detail-summary-card detail-summary-card-compact" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-main" },
});
if (__VLS_ctx.plan?.projectId && __VLS_ctx.plan?.iterationId) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.plan?.projectId && __VLS_ctx.plan?.iterationId))
                    return;
                __VLS_ctx.goToIteration(__VLS_ctx.plan.projectId, __VLS_ctx.plan.iterationId);
            } },
        ...{ class: "management-list-link detail-summary-link" },
        type: "button",
    });
    (__VLS_ctx.plan?.iterationName || '-');
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-summary-value" },
    });
    (__VLS_ctx.plan?.iterationName || '-');
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-note" },
});
(__VLS_ctx.plan?.updatedAt || '暂无更新时间');
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "detail-summary-card detail-summary-card-compact" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-main" },
});
if (__VLS_ctx.canManage && __VLS_ctx.plan) {
    /** @type {[typeof CompactSelectMenu, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(CompactSelectMenu, new CompactSelectMenu({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.plan.status),
        options: (__VLS_ctx.statusSelectOptions),
        ...{ class: "status-select" },
    }));
    const __VLS_17 = __VLS_16({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.plan.status),
        options: (__VLS_ctx.statusSelectOptions),
        ...{ class: "status-select" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    let __VLS_19;
    let __VLS_20;
    let __VLS_21;
    const __VLS_22 = {
        onChange: (...[$event]) => {
            if (!(__VLS_ctx.canManage && __VLS_ctx.plan))
                return;
            __VLS_ctx.handlePlanStatusChange(String($event));
        }
    };
    var __VLS_18;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (__VLS_ctx.planStatusTone(__VLS_ctx.plan?.status)) },
    });
    (__VLS_ctx.plan?.status || '-');
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "detail-summary-card detail-summary-card-compact detail-summary-card-emphasis" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-value" },
});
(__VLS_ctx.cases.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "detail-summary-card detail-summary-card-description" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-summary-description" },
});
(__VLS_ctx.plan?.description || '暂无说明');
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atelier-toolbar detail-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-toolbar-main detail-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-search-shell" },
});
const __VLS_23 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    ...{ class: "atelier-search-icon" },
}));
const __VLS_25 = __VLS_24({
    ...{ class: "atelier-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
const __VLS_27 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({}));
const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
var __VLS_26;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    value: (__VLS_ctx.caseKeyword),
    ...{ class: "atelier-search-input" },
    type: "text",
    placeholder: "搜索用例标题、模块、步骤或备注...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atelier-toolbar-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.resetCaseKeyword) },
    ...{ class: "atelier-toolbar-button" },
    type: "button",
});
const __VLS_31 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({}));
const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
const __VLS_35 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({}));
const __VLS_37 = __VLS_36({}, ...__VLS_functionalComponentArgsRest(__VLS_36));
var __VLS_34;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-toolbar-side" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "detail-toolbar-note" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atelier-table-shell" },
});
if (!__VLS_ctx.filteredCases.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-empty-state" },
    });
    const __VLS_39 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        description: (__VLS_ctx.cases.length ? '当前筛选条件下暂无测试用例' : '暂无测试用例'),
    }));
    const __VLS_41 = __VLS_40({
        description: (__VLS_ctx.cases.length ? '当前筛选条件下暂无测试用例' : '暂无测试用例'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_42.slots.default;
    if (__VLS_ctx.canManage && !__VLS_ctx.cases.length) {
        const __VLS_43 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_45 = __VLS_44({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_44));
        let __VLS_47;
        let __VLS_48;
        let __VLS_49;
        const __VLS_50 = {
            onClick: (__VLS_ctx.handleCreateCase)
        };
        __VLS_46.slots.default;
        var __VLS_46;
    }
    else if (__VLS_ctx.caseKeyword) {
        const __VLS_51 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
            ...{ 'onClick': {} },
        }));
        const __VLS_53 = __VLS_52({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_52));
        let __VLS_55;
        let __VLS_56;
        let __VLS_57;
        const __VLS_58 = {
            onClick: (__VLS_ctx.resetCaseKeyword)
        };
        __VLS_54.slots.default;
        var __VLS_54;
    }
    var __VLS_42;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-table-scroll" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-list detail-case-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head detail-case-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item detail-col-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item detail-col-module" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item detail-col-type" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item detail-col-priority center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item detail-col-steps center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item detail-col-remarks" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item detail-col-actions right" },
    });
    for (const [row] of __VLS_getVForSourceType((__VLS_ctx.pagedCases))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.filteredCases.length))
                        return;
                    __VLS_ctx.openCaseDetail(row.absoluteIndex);
                } },
            key: (row.localId),
            ...{ class: "atelier-data-row detail-case-row" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell detail-col-main" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title-cell" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-title-icon" },
        });
        const __VLS_59 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({}));
        const __VLS_61 = __VLS_60({}, ...__VLS_functionalComponentArgsRest(__VLS_60));
        __VLS_62.slots.default;
        const __VLS_63 = {}.Finished;
        /** @type {[typeof __VLS_components.Finished, ]} */ ;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({}));
        const __VLS_65 = __VLS_64({}, ...__VLS_functionalComponentArgsRest(__VLS_64));
        var __VLS_62;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "detail-case-title" },
        });
        (row.title.trim() || '未命名测试用例');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-subtitle" },
        });
        (__VLS_ctx.formatCasePreview(row));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell detail-col-module" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
        (row.moduleName.trim() || '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell detail-col-type" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill info" },
        });
        (row.caseType || '功能测试');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell detail-col-priority center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (__VLS_ctx.casePriorityTone(row.priority)) },
        });
        (row.priority || '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell detail-col-steps center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill neutral" },
        });
        (row.steps.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell detail-col-remarks" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "detail-case-note" },
        });
        (__VLS_ctx.formatCaseRemarks(row));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell detail-col-actions right" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-row-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.filteredCases.length))
                        return;
                    __VLS_ctx.openCaseDetail(row.absoluteIndex);
                } },
            ...{ class: "management-list-row-button" },
            type: "button",
            title: "查看或编辑用例",
        });
        const __VLS_67 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({}));
        const __VLS_69 = __VLS_68({}, ...__VLS_functionalComponentArgsRest(__VLS_68));
        __VLS_70.slots.default;
        const __VLS_71 = {}.Right;
        /** @type {[typeof __VLS_components.Right, ]} */ ;
        // @ts-ignore
        const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({}));
        const __VLS_73 = __VLS_72({}, ...__VLS_functionalComponentArgsRest(__VLS_72));
        var __VLS_70;
        if (__VLS_ctx.canManage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.filteredCases.length))
                            return;
                        if (!(__VLS_ctx.canManage))
                            return;
                        __VLS_ctx.removeCase(row.absoluteIndex);
                    } },
                ...{ class: "management-list-row-button danger" },
                type: "button",
                title: "删除用例",
            });
            const __VLS_75 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({}));
            const __VLS_77 = __VLS_76({}, ...__VLS_functionalComponentArgsRest(__VLS_76));
            __VLS_78.slots.default;
            const __VLS_79 = {}.Delete;
            /** @type {[typeof __VLS_components.Delete, ]} */ ;
            // @ts-ignore
            const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({}));
            const __VLS_81 = __VLS_80({}, ...__VLS_functionalComponentArgsRest(__VLS_80));
            var __VLS_78;
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-table-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-footer-total" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.filteredCases.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-footer-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-page-size atelier-compact-input" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_83 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.pagination.size),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_85 = __VLS_84({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.pagination.size),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_84));
    let __VLS_87;
    let __VLS_88;
    let __VLS_89;
    const __VLS_90 = {
        onChange: (__VLS_ctx.handleSizeChange)
    };
    __VLS_86.slots.default;
    const __VLS_91 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
        value: (5),
        label: "5",
    }));
    const __VLS_93 = __VLS_92({
        value: (5),
        label: "5",
    }, ...__VLS_functionalComponentArgsRest(__VLS_92));
    const __VLS_95 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
        value: (10),
        label: "10",
    }));
    const __VLS_97 = __VLS_96({
        value: (10),
        label: "10",
    }, ...__VLS_functionalComponentArgsRest(__VLS_96));
    const __VLS_99 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
        value: (20),
        label: "20",
    }));
    const __VLS_101 = __VLS_100({
        value: (20),
        label: "20",
    }, ...__VLS_functionalComponentArgsRest(__VLS_100));
    const __VLS_103 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        value: (50),
        label: "50",
    }));
    const __VLS_105 = __VLS_104({
        value: (50),
        label: "50",
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    var __VLS_86;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-page-nav" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handlePrevPage) },
        ...{ class: "atelier-page-button" },
        type: "button",
        disabled: (__VLS_ctx.pagination.page <= 1),
    });
    const __VLS_107 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({}));
    const __VLS_109 = __VLS_108({}, ...__VLS_functionalComponentArgsRest(__VLS_108));
    __VLS_110.slots.default;
    const __VLS_111 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({}));
    const __VLS_113 = __VLS_112({}, ...__VLS_functionalComponentArgsRest(__VLS_112));
    var __VLS_110;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "atelier-page-text" },
    });
    (__VLS_ctx.pagination.page);
    (__VLS_ctx.caseTotalPages);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleNextPage) },
        ...{ class: "atelier-page-button" },
        type: "button",
        disabled: (__VLS_ctx.pagination.page >= __VLS_ctx.caseTotalPages),
    });
    const __VLS_115 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({}));
    const __VLS_117 = __VLS_116({}, ...__VLS_functionalComponentArgsRest(__VLS_116));
    __VLS_118.slots.default;
    const __VLS_119 = {}.ArrowRight;
    /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
    // @ts-ignore
    const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({}));
    const __VLS_121 = __VLS_120({}, ...__VLS_functionalComponentArgsRest(__VLS_120));
    var __VLS_118;
}
const __VLS_123 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.drawerTitle),
    size: "760px",
    destroyOnClose: true,
    ...{ class: "case-detail-drawer" },
}));
const __VLS_125 = __VLS_124({
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.drawerTitle),
    size: "760px",
    destroyOnClose: true,
    ...{ class: "case-detail-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_124));
__VLS_126.slots.default;
if (__VLS_ctx.activeCase) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "drawer-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "form-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-subtitle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-grid two-columns" },
    });
    const __VLS_127 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
        label: "用例标题",
        ...{ class: "span-2" },
    }));
    const __VLS_129 = __VLS_128({
        label: "用例标题",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_128));
    __VLS_130.slots.default;
    const __VLS_131 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({
        modelValue: (__VLS_ctx.activeCase.title),
        disabled: (!__VLS_ctx.canManage),
        placeholder: "请输入测试用例标题",
    }));
    const __VLS_133 = __VLS_132({
        modelValue: (__VLS_ctx.activeCase.title),
        disabled: (!__VLS_ctx.canManage),
        placeholder: "请输入测试用例标题",
    }, ...__VLS_functionalComponentArgsRest(__VLS_132));
    var __VLS_130;
    const __VLS_135 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
        label: "功能模块",
    }));
    const __VLS_137 = __VLS_136({
        label: "功能模块",
    }, ...__VLS_functionalComponentArgsRest(__VLS_136));
    __VLS_138.slots.default;
    const __VLS_139 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({
        modelValue: (__VLS_ctx.activeCase.moduleName),
        disabled: (!__VLS_ctx.canManage),
        placeholder: "例如：登录、审批、报表",
    }));
    const __VLS_141 = __VLS_140({
        modelValue: (__VLS_ctx.activeCase.moduleName),
        disabled: (!__VLS_ctx.canManage),
        placeholder: "例如：登录、审批、报表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_140));
    var __VLS_138;
    const __VLS_143 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
        label: "用例类型",
    }));
    const __VLS_145 = __VLS_144({
        label: "用例类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_144));
    __VLS_146.slots.default;
    const __VLS_147 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
        modelValue: (__VLS_ctx.activeCase.caseType),
        disabled: (!__VLS_ctx.canManage),
        ...{ style: {} },
    }));
    const __VLS_149 = __VLS_148({
        modelValue: (__VLS_ctx.activeCase.caseType),
        disabled: (!__VLS_ctx.canManage),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_148));
    __VLS_150.slots.default;
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.caseTypeOptions))) {
        const __VLS_151 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
            key: (option),
            label: (option),
            value: (option),
        }));
        const __VLS_153 = __VLS_152({
            key: (option),
            label: (option),
            value: (option),
        }, ...__VLS_functionalComponentArgsRest(__VLS_152));
    }
    var __VLS_150;
    var __VLS_146;
    const __VLS_155 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
        label: "优先级",
    }));
    const __VLS_157 = __VLS_156({
        label: "优先级",
    }, ...__VLS_functionalComponentArgsRest(__VLS_156));
    __VLS_158.slots.default;
    const __VLS_159 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
        modelValue: (__VLS_ctx.activeCase.priority),
        disabled: (!__VLS_ctx.canManage),
        ...{ style: {} },
    }));
    const __VLS_161 = __VLS_160({
        modelValue: (__VLS_ctx.activeCase.priority),
        disabled: (!__VLS_ctx.canManage),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_160));
    __VLS_162.slots.default;
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.priorityOptions))) {
        const __VLS_163 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_164 = __VLS_asFunctionalComponent(__VLS_163, new __VLS_163({
            key: (option),
            label: (option),
            value: (option),
        }));
        const __VLS_165 = __VLS_164({
            key: (option),
            label: (option),
            value: (option),
        }, ...__VLS_functionalComponentArgsRest(__VLS_164));
    }
    var __VLS_162;
    var __VLS_158;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({});
    const __VLS_167 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({
        label: "前置条件",
        ...{ class: "span-2" },
    }));
    const __VLS_169 = __VLS_168({
        label: "前置条件",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_168));
    __VLS_170.slots.default;
    const __VLS_171 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_172 = __VLS_asFunctionalComponent(__VLS_171, new __VLS_171({
        modelValue: (__VLS_ctx.activeCase.precondition),
        disabled: (!__VLS_ctx.canManage),
        type: "textarea",
        rows: (3),
        placeholder: "请输入前置条件",
    }));
    const __VLS_173 = __VLS_172({
        modelValue: (__VLS_ctx.activeCase.precondition),
        disabled: (!__VLS_ctx.canManage),
        type: "textarea",
        rows: (3),
        placeholder: "请输入前置条件",
    }, ...__VLS_functionalComponentArgsRest(__VLS_172));
    var __VLS_170;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "form-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-subtitle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "step-section-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "step-section-title" },
    });
    (__VLS_ctx.activeCase.steps.length);
    if (__VLS_ctx.canManage) {
        const __VLS_175 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_176 = __VLS_asFunctionalComponent(__VLS_175, new __VLS_175({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_177 = __VLS_176({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_176));
        let __VLS_179;
        let __VLS_180;
        let __VLS_181;
        const __VLS_182 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeCase))
                    return;
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.addStep(__VLS_ctx.activeCase);
            }
        };
        __VLS_178.slots.default;
        var __VLS_178;
    }
    if (!__VLS_ctx.activeCase.steps.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "step-empty" },
        });
        const __VLS_183 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({
            description: "暂无测试步骤",
        }));
        const __VLS_185 = __VLS_184({
            description: "暂无测试步骤",
        }, ...__VLS_functionalComponentArgsRest(__VLS_184));
    }
    for (const [step, stepIndex] of __VLS_getVForSourceType((__VLS_ctx.activeCase.steps))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (step.localId),
            ...{ class: "step-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "step-order" },
        });
        (stepIndex + 1);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "step-fields" },
        });
        const __VLS_187 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
            modelValue: (step.action),
            disabled: (!__VLS_ctx.canManage),
            type: "textarea",
            rows: (2),
            placeholder: "请输入步骤描述",
        }));
        const __VLS_189 = __VLS_188({
            modelValue: (step.action),
            disabled: (!__VLS_ctx.canManage),
            type: "textarea",
            rows: (2),
            placeholder: "请输入步骤描述",
        }, ...__VLS_functionalComponentArgsRest(__VLS_188));
        const __VLS_191 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({
            modelValue: (step.expectedResult),
            disabled: (!__VLS_ctx.canManage),
            type: "textarea",
            rows: (2),
            placeholder: "请输入预期结果",
        }));
        const __VLS_193 = __VLS_192({
            modelValue: (step.expectedResult),
            disabled: (!__VLS_ctx.canManage),
            type: "textarea",
            rows: (2),
            placeholder: "请输入预期结果",
        }, ...__VLS_functionalComponentArgsRest(__VLS_192));
        if (__VLS_ctx.canManage) {
            const __VLS_195 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_197 = __VLS_196({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_196));
            let __VLS_199;
            let __VLS_200;
            let __VLS_201;
            const __VLS_202 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeCase))
                        return;
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.removeStep(__VLS_ctx.activeCase, stepIndex);
                }
            };
            __VLS_198.slots.default;
            var __VLS_198;
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "form-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-section-subtitle" },
    });
    const __VLS_203 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
        label: "备注",
    }));
    const __VLS_205 = __VLS_204({
        label: "备注",
    }, ...__VLS_functionalComponentArgsRest(__VLS_204));
    __VLS_206.slots.default;
    const __VLS_207 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
        modelValue: (__VLS_ctx.activeCase.remarks),
        disabled: (!__VLS_ctx.canManage),
        type: "textarea",
        rows: (4),
        placeholder: "可填写备注、数据准备说明或风险提示",
    }));
    const __VLS_209 = __VLS_208({
        modelValue: (__VLS_ctx.activeCase.remarks),
        disabled: (!__VLS_ctx.canManage),
        type: "textarea",
        rows: (4),
        placeholder: "可填写备注、数据准备说明或风险提示",
    }, ...__VLS_functionalComponentArgsRest(__VLS_208));
    var __VLS_206;
}
{
    const { footer: __VLS_thisSlot } = __VLS_126.slots;
    const __VLS_211 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
        ...{ 'onClick': {} },
    }));
    const __VLS_213 = __VLS_212({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_212));
    let __VLS_215;
    let __VLS_216;
    let __VLS_217;
    const __VLS_218 = {
        onClick: (...[$event]) => {
            __VLS_ctx.drawerVisible = false;
        }
    };
    __VLS_214.slots.default;
    var __VLS_214;
    if (__VLS_ctx.canManage) {
        const __VLS_219 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }));
        const __VLS_221 = __VLS_220({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_220));
        let __VLS_223;
        let __VLS_224;
        let __VLS_225;
        const __VLS_226 = {
            onClick: (__VLS_ctx.handleSaveActiveCase)
        };
        __VLS_222.slots.default;
        var __VLS_222;
    }
}
var __VLS_126;
/** @type {__VLS_StyleScopedClasses['atelier-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['test-plan-detail-page']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-head']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-hero-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-link']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-value']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-link']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-value']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-note']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['status-select']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-emphasis']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-main']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-value']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-card-description']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-label']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-summary-description']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-toolbar-note']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-list']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-list']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-head']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-module']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-remarks']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-row']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-module']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['info']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-remarks']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-case-note']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-text']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['case-detail-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['step-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['step-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['step-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['step-row']} */ ;
/** @type {__VLS_StyleScopedClasses['step-order']} */ ;
/** @type {__VLS_StyleScopedClasses['step-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-subtitle']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Delete: Delete,
            Finished: Finished,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Right: Right,
            Search: Search,
            CompactSelectMenu: CompactSelectMenu,
            canManage: canManage,
            statusSelectOptions: statusSelectOptions,
            caseTypeOptions: caseTypeOptions,
            priorityOptions: priorityOptions,
            plan: plan,
            cases: cases,
            saving: saving,
            drawerVisible: drawerVisible,
            pagination: pagination,
            caseKeyword: caseKeyword,
            filteredCases: filteredCases,
            caseTotalPages: caseTotalPages,
            pagedCases: pagedCases,
            activeCase: activeCase,
            drawerTitle: drawerTitle,
            planStatusTone: planStatusTone,
            casePriorityTone: casePriorityTone,
            formatCasePreview: formatCasePreview,
            formatCaseRemarks: formatCaseRemarks,
            resetCaseKeyword: resetCaseKeyword,
            handleSizeChange: handleSizeChange,
            handlePrevPage: handlePrevPage,
            handleNextPage: handleNextPage,
            handleCreateCase: handleCreateCase,
            openCaseDetail: openCaseDetail,
            removeCase: removeCase,
            addStep: addStep,
            removeStep: removeStep,
            goToProject: goToProject,
            goToIteration: goToIteration,
            handlePlanStatusChange: handlePlanStatusChange,
            handleSaveActiveCase: handleSaveActiveCase,
            goBack: goBack,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=TestPlanDetailView.vue.js.map