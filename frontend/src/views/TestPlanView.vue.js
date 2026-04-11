/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Finished, Plus, RefreshRight, Right, Search } from '@element-plus/icons-vue';
import CompactSelectMenu from '@/components/CompactSelectMenu.vue';
import { createTestPlan, deleteTestPlan, getTestPlanDetail, listProjectOptions, listTestPlanIterations, pageTestPlans, updateTestPlan } from '@/api/platform';
import { useAuthStore } from '@/stores/auth';
const statusOptions = ['草稿', '待执行', '执行中', '已完成'];
const statusSelectOptions = [
    { label: '草稿', value: '草稿', tone: 'info' },
    { label: '待执行', value: '待执行', tone: 'warning' },
    { label: '执行中', value: '执行中', tone: 'primary' },
    { label: '已完成', value: '已完成', tone: 'success' }
];
const router = useRouter();
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('test:manage'));
const loading = ref(false);
const submitting = ref(false);
const statusUpdatingId = ref(null);
const dialogVisible = ref(false);
const isEditing = ref(false);
const readonlyMode = ref(false);
const currentId = ref(null);
const list = ref([]);
const projectOptions = ref([]);
const filterIterationOptions = ref([]);
const formIterationOptions = ref([]);
const currentCases = ref([]);
const formRef = ref();
const pagination = reactive({
    page: 1,
    size: 10,
    total: 0
});
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1));
const filters = reactive({
    keyword: '',
    projectId: undefined,
    iterationId: undefined,
    status: ''
});
const testPlanFilterPopoverVisible = ref(false);
const form = reactive({
    name: '',
    projectId: null,
    iterationId: null,
    status: '草稿',
    description: ''
});
const rules = {
    name: [{ required: true, message: '请输入测试计划名称', trigger: 'blur' }],
    projectId: [{ required: true, message: '请选择所属项目', trigger: 'change' }],
    iterationId: [{ required: true, message: '请选择所属迭代', trigger: 'change' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};
const dialogTitle = computed(() => {
    if (readonlyMode.value) {
        return '查看测试计划';
    }
    return isEditing.value ? '编辑测试计划' : '新建测试计划';
});
const canManageCurrent = computed(() => canManage.value && !readonlyMode.value);
const resetForm = () => {
    currentId.value = null;
    currentCases.value = [];
    form.name = '';
    form.projectId = projectOptions.value[0]?.id ?? null;
    form.iterationId = null;
    form.status = '草稿';
    form.description = '';
    formIterationOptions.value = [];
    formRef.value?.clearValidate();
};
const fillForm = (plan) => {
    form.name = plan.name;
    form.projectId = plan.projectId;
    form.iterationId = plan.iterationId;
    form.status = plan.status;
    form.description = plan.description;
    currentCases.value = plan.cases;
};
const buildCasePayload = (cases) => cases.map((item, caseIndex) => ({
    title: item.title,
    moduleName: item.moduleName,
    caseType: item.caseType,
    priority: item.priority,
    precondition: item.precondition,
    remarks: item.remarks,
    sortOrder: item.sortOrder ?? caseIndex,
    steps: item.steps.map((step, stepIndex) => ({
        stepNo: step.stepNo ?? stepIndex + 1,
        action: step.action,
        expectedResult: step.expectedResult
    }))
}));
const loadProjectOptions = async () => {
    projectOptions.value = await listProjectOptions();
};
const loadIterationsByProject = async (projectId) => {
    if (!projectId) {
        return [];
    }
    return await listTestPlanIterations(projectId);
};
const loadData = async () => {
    loading.value = true;
    try {
        const pageData = await pageTestPlans({
            page: pagination.page,
            size: pagination.size,
            keyword: filters.keyword,
            projectId: filters.projectId,
            iterationId: filters.iterationId,
            status: filters.status
        });
        list.value = pageData.records;
        pagination.total = pageData.total;
    }
    finally {
        loading.value = false;
    }
};
const handleSearch = async () => {
    testPlanFilterPopoverVisible.value = false;
    pagination.page = 1;
    await loadData();
};
const handleReset = async () => {
    filters.keyword = '';
    filters.projectId = undefined;
    filters.iterationId = undefined;
    filters.status = '';
    filterIterationOptions.value = [];
    pagination.page = 1;
    await loadData();
};
const handleSizeChange = async () => {
    pagination.page = 1;
    await loadData();
};
const handlePrevPage = async () => {
    if (pagination.page <= 1)
        return;
    pagination.page -= 1;
    await loadData();
};
const handleNextPage = async () => {
    if (pagination.page >= totalPages.value)
        return;
    pagination.page += 1;
    await loadData();
};
const handleFilterProjectChange = async () => {
    if (!filters.projectId) {
        filters.iterationId = undefined;
        filterIterationOptions.value = [];
        return;
    }
    filterIterationOptions.value = await loadIterationsByProject(filters.projectId);
    if (filters.iterationId && !filterIterationOptions.value.some((item) => item.id === filters.iterationId)) {
        filters.iterationId = undefined;
    }
};
const handleFormProjectChange = async () => {
    formIterationOptions.value = await loadIterationsByProject(form.projectId);
    if (form.iterationId && !formIterationOptions.value.some((item) => item.id === form.iterationId)) {
        form.iterationId = null;
    }
};
const openCreateDialog = async () => {
    readonlyMode.value = false;
    isEditing.value = false;
    resetForm();
    if (form.projectId) {
        formIterationOptions.value = await loadIterationsByProject(form.projectId);
        form.iterationId = formIterationOptions.value[0]?.id ?? null;
    }
    dialogVisible.value = true;
};
const openEditDialog = async (id) => {
    loading.value = true;
    try {
        const detail = await getTestPlanDetail(id);
        readonlyMode.value = !canManage.value;
        isEditing.value = true;
        currentId.value = detail.id;
        formIterationOptions.value = await loadIterationsByProject(detail.projectId);
        fillForm(detail);
        dialogVisible.value = true;
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载测试计划失败');
    }
    finally {
        loading.value = false;
    }
};
const openDetail = async (id) => {
    await router.push({ name: 'test-plan-detail', params: { planId: id } });
};
const goToProject = async (projectId) => {
    await router.push({ name: 'project-iterations', params: { projectId } });
};
const goToIteration = async (projectId, iterationId) => {
    await router.push({ name: 'project-iterations', params: { projectId }, query: { iterationId: String(iterationId) } });
};
const handleStatusChange = async (id, status) => {
    if (!status) {
        return;
    }
    statusUpdatingId.value = id;
    try {
        const detail = await getTestPlanDetail(id);
        if (detail.status === status) {
            return;
        }
        await updateTestPlan(id, {
            name: detail.name,
            projectId: detail.projectId,
            iterationId: detail.iterationId,
            status,
            description: detail.description,
            cases: buildCasePayload(detail.cases)
        });
        const target = list.value.find((item) => item.id === id);
        if (target) {
            target.status = status;
        }
        ElMessage.success('测试计划状态已更新');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '状态更新失败');
    }
    finally {
        statusUpdatingId.value = null;
    }
};
const handleSubmit = async () => {
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid || form.projectId === null || form.iterationId === null) {
        return;
    }
    submitting.value = true;
    try {
        const payload = {
            name: form.name.trim(),
            projectId: form.projectId,
            iterationId: form.iterationId,
            status: form.status,
            description: form.description.trim(),
            cases: buildCasePayload(currentCases.value)
        };
        if (isEditing.value && currentId.value !== null) {
            await updateTestPlan(currentId.value, payload);
            ElMessage.success('测试计划已更新');
            dialogVisible.value = false;
            await loadData();
        }
        else {
            const created = await createTestPlan(payload);
            ElMessage.success('测试计划已创建，继续补充测试用例');
            dialogVisible.value = false;
            await openDetail(created.id);
        }
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存失败');
    }
    finally {
        submitting.value = false;
    }
};
const handleDelete = async (id) => {
    try {
        await ElMessageBox.confirm('确认删除该测试计划吗？计划下的测试用例会一并删除。', '提示', { type: 'warning' });
        await deleteTestPlan(id);
        ElMessage.success('测试计划已删除');
        await loadData();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
const testPlanStatusTone = (status) => {
    if (status === '已完成')
        return 'success';
    if (status === '执行中')
        return 'warning';
    if (status === '待执行')
        return 'info';
    return 'neutral';
};
onMounted(async () => {
    try {
        await loadProjectOptions();
        await loadData();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载测试计划失败');
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['test-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-iteration']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['test-plan-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['plan-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atelier-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-search-shell" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "atelier-search-icon" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "atelier-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onKeyup: (__VLS_ctx.handleSearch) },
    value: (__VLS_ctx.filters.keyword),
    ...{ class: "atelier-search-input" },
    type: "text",
    placeholder: "搜索测试计划名称或说明...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atelier-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.testPlanFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (340),
    popperClass: "atelier-filter-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.testPlanFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (340),
    popperClass: "atelier-filter-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_11.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "atelier-toolbar-button" },
        type: "button",
    });
    const __VLS_12 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.Filter;
    /** @type {[typeof __VLS_components.Filter, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_15;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-panel atelier-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.projectId),
    clearable: true,
    placeholder: "所属项目",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_22 = __VLS_21({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.projectId),
    clearable: true,
    placeholder: "所属项目",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onChange: (__VLS_ctx.handleFilterProjectChange)
};
__VLS_23.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_28 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_30 = __VLS_29({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
}
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_32 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    modelValue: (__VLS_ctx.filters.iterationId),
    clearable: true,
    disabled: (!__VLS_ctx.filters.projectId),
    placeholder: "所属迭代",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_34 = __VLS_33({
    modelValue: (__VLS_ctx.filters.iterationId),
    clearable: true,
    disabled: (!__VLS_ctx.filters.projectId),
    placeholder: "所属迭代",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.filterIterationOptions))) {
    const __VLS_36 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_38 = __VLS_37({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
}
var __VLS_35;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_40 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_42 = __VLS_41({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.statusOptions))) {
    const __VLS_44 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_46 = __VLS_45({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
}
var __VLS_43;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-actions" },
});
const __VLS_48 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_50 = __VLS_49({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onClick: (__VLS_ctx.handleSearch)
};
__VLS_51.slots.default;
var __VLS_51;
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
    onClick: (__VLS_ctx.handleReset)
};
__VLS_59.slots.default;
var __VLS_59;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleReset) },
    ...{ class: "atelier-toolbar-button" },
    type: "button",
});
const __VLS_64 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
const __VLS_68 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
var __VLS_67;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-toolbar-side" },
});
if (__VLS_ctx.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openCreateDialog) },
        ...{ class: "atelier-create-button" },
        type: "button",
    });
    const __VLS_72 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
    const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
    __VLS_75.slots.default;
    const __VLS_76 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
    const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
    var __VLS_75;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atelier-table-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-list test-plan-list-table mobile-card-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head test-plan-list-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item test-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item test-col-project" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item test-col-iteration" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item test-col-status center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item test-col-cases center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item test-col-updated" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item test-col-actions right" },
});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.list))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (row.id),
        ...{ class: "atelier-data-row test-plan-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell test-col-main" },
        'data-label': "计划",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openDetail(row.id);
            } },
        ...{ class: "management-list-title-trigger test-plan-trigger" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title-cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-title-icon" },
    });
    const __VLS_80 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
    const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    const __VLS_84 = {}.Finished;
    /** @type {[typeof __VLS_components.Finished, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
    const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
    var __VLS_83;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title test-plan-link" },
    });
    (row.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-subtitle" },
    });
    (row.description || '暂无说明');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell test-col-project" },
        'data-label': "所属项目",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.goToProject(row.projectId);
            } },
        ...{ class: "management-list-link" },
        type: "button",
    });
    (row.projectName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell test-col-iteration" },
        'data-label': "所属迭代",
    });
    if (row.iterationId) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.iterationId))
                        return;
                    __VLS_ctx.goToIteration(row.projectId, row.iterationId);
                } },
            ...{ class: "management-list-link" },
            type: "button",
        });
        (row.iterationName || '-');
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell test-col-status center" },
        'data-label': "状态",
    });
    if (__VLS_ctx.canManage) {
        /** @type {[typeof CompactSelectMenu, ]} */ ;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent(CompactSelectMenu, new CompactSelectMenu({
            ...{ 'onChange': {} },
            modelValue: (row.status || null),
            options: (__VLS_ctx.statusSelectOptions),
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
            ...{ class: "status-select" },
        }));
        const __VLS_89 = __VLS_88({
            ...{ 'onChange': {} },
            modelValue: (row.status || null),
            options: (__VLS_ctx.statusSelectOptions),
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
            ...{ class: "status-select" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
        let __VLS_91;
        let __VLS_92;
        let __VLS_93;
        const __VLS_94 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.handleStatusChange(row.id, String($event));
            }
        };
        var __VLS_90;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (__VLS_ctx.testPlanStatusTone(row.status)) },
        });
        (row.status);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell test-col-cases center" },
        'data-label': "用例数",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill neutral" },
    });
    (row.caseCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell test-col-updated" },
        'data-label': "更新时间",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-updated" },
    });
    (row.updatedAt);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell test-col-actions right" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-row-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openDetail(row.id);
            } },
        ...{ class: "management-list-row-button" },
        type: "button",
        title: (__VLS_ctx.canManage ? '进入计划' : '查看计划'),
    });
    const __VLS_95 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({}));
    const __VLS_97 = __VLS_96({}, ...__VLS_functionalComponentArgsRest(__VLS_96));
    __VLS_98.slots.default;
    const __VLS_99 = {}.Right;
    /** @type {[typeof __VLS_components.Right, ]} */ ;
    // @ts-ignore
    const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({}));
    const __VLS_101 = __VLS_100({}, ...__VLS_functionalComponentArgsRest(__VLS_100));
    var __VLS_98;
    if (__VLS_ctx.canManage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.openEditDialog(row.id);
                } },
            ...{ class: "management-list-row-button" },
            type: "button",
            title: "编辑计划",
        });
        const __VLS_103 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({}));
        const __VLS_105 = __VLS_104({}, ...__VLS_functionalComponentArgsRest(__VLS_104));
        __VLS_106.slots.default;
        const __VLS_107 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({}));
        const __VLS_109 = __VLS_108({}, ...__VLS_functionalComponentArgsRest(__VLS_108));
        var __VLS_106;
    }
    if (__VLS_ctx.canManage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.handleDelete(row.id);
                } },
            ...{ class: "management-list-row-button danger" },
            type: "button",
            title: "删除计划",
        });
        const __VLS_111 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({}));
        const __VLS_113 = __VLS_112({}, ...__VLS_functionalComponentArgsRest(__VLS_112));
        __VLS_114.slots.default;
        const __VLS_115 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({}));
        const __VLS_117 = __VLS_116({}, ...__VLS_functionalComponentArgsRest(__VLS_116));
        var __VLS_114;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-table-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.pagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-page-size atelier-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_119 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_121 = __VLS_120({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_120));
let __VLS_123;
let __VLS_124;
let __VLS_125;
const __VLS_126 = {
    onChange: (__VLS_ctx.handleSizeChange)
};
__VLS_122.slots.default;
const __VLS_127 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
    value: (10),
    label: "10",
}));
const __VLS_129 = __VLS_128({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_128));
const __VLS_131 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({
    value: (20),
    label: "20",
}));
const __VLS_133 = __VLS_132({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_132));
const __VLS_135 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
    value: (50),
    label: "50",
}));
const __VLS_137 = __VLS_136({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_136));
var __VLS_122;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePrevPage) },
    ...{ class: "atelier-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page <= 1),
});
const __VLS_139 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({}));
const __VLS_141 = __VLS_140({}, ...__VLS_functionalComponentArgsRest(__VLS_140));
__VLS_142.slots.default;
const __VLS_143 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({}));
const __VLS_145 = __VLS_144({}, ...__VLS_functionalComponentArgsRest(__VLS_144));
var __VLS_142;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atelier-page-text" },
});
(__VLS_ctx.pagination.page);
(__VLS_ctx.totalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleNextPage) },
    ...{ class: "atelier-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page >= __VLS_ctx.totalPages),
});
const __VLS_147 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({}));
const __VLS_149 = __VLS_148({}, ...__VLS_functionalComponentArgsRest(__VLS_148));
__VLS_150.slots.default;
const __VLS_151 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({}));
const __VLS_153 = __VLS_152({}, ...__VLS_functionalComponentArgsRest(__VLS_152));
var __VLS_150;
const __VLS_155 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "760px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
    destroyOnClose: true,
}));
const __VLS_157 = __VLS_156({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "760px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_156));
__VLS_158.slots.default;
const __VLS_159 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelPosition: "top",
    ...{ class: "platform-form-layout" },
}));
const __VLS_161 = __VLS_160({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelPosition: "top",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_160));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_163 = {};
__VLS_162.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "platform-form-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "plan-grid" },
});
const __VLS_165 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
    label: "计划名称",
    prop: "name",
    ...{ class: "span-2" },
}));
const __VLS_167 = __VLS_166({
    label: "计划名称",
    prop: "name",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_166));
__VLS_168.slots.default;
const __VLS_169 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
    modelValue: (__VLS_ctx.form.name),
    disabled: (!__VLS_ctx.canManageCurrent),
    placeholder: "请输入测试计划名称",
}));
const __VLS_171 = __VLS_170({
    modelValue: (__VLS_ctx.form.name),
    disabled: (!__VLS_ctx.canManageCurrent),
    placeholder: "请输入测试计划名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_170));
var __VLS_168;
const __VLS_173 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
    label: "所属项目",
    prop: "projectId",
}));
const __VLS_175 = __VLS_174({
    label: "所属项目",
    prop: "projectId",
}, ...__VLS_functionalComponentArgsRest(__VLS_174));
__VLS_176.slots.default;
const __VLS_177 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.projectId),
    disabled: (!__VLS_ctx.canManageCurrent),
    placeholder: "请选择项目",
    ...{ style: {} },
}));
const __VLS_179 = __VLS_178({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.projectId),
    disabled: (!__VLS_ctx.canManageCurrent),
    placeholder: "请选择项目",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_178));
let __VLS_181;
let __VLS_182;
let __VLS_183;
const __VLS_184 = {
    onChange: (__VLS_ctx.handleFormProjectChange)
};
__VLS_180.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_185 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_187 = __VLS_186({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
}
var __VLS_180;
var __VLS_176;
const __VLS_189 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
    label: "所属迭代",
    prop: "iterationId",
}));
const __VLS_191 = __VLS_190({
    label: "所属迭代",
    prop: "iterationId",
}, ...__VLS_functionalComponentArgsRest(__VLS_190));
__VLS_192.slots.default;
const __VLS_193 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
    modelValue: (__VLS_ctx.form.iterationId),
    disabled: (!__VLS_ctx.canManageCurrent || !__VLS_ctx.form.projectId),
    placeholder: "请选择迭代",
    ...{ style: {} },
}));
const __VLS_195 = __VLS_194({
    modelValue: (__VLS_ctx.form.iterationId),
    disabled: (!__VLS_ctx.canManageCurrent || !__VLS_ctx.form.projectId),
    placeholder: "请选择迭代",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_194));
__VLS_196.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.formIterationOptions))) {
    const __VLS_197 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_199 = __VLS_198({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_198));
}
var __VLS_196;
var __VLS_192;
const __VLS_201 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
    label: "状态",
    prop: "status",
}));
const __VLS_203 = __VLS_202({
    label: "状态",
    prop: "status",
}, ...__VLS_functionalComponentArgsRest(__VLS_202));
__VLS_204.slots.default;
const __VLS_205 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
    modelValue: (__VLS_ctx.form.status),
    disabled: (!__VLS_ctx.canManageCurrent),
    ...{ style: {} },
}));
const __VLS_207 = __VLS_206({
    modelValue: (__VLS_ctx.form.status),
    disabled: (!__VLS_ctx.canManageCurrent),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_206));
__VLS_208.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.statusOptions))) {
    const __VLS_209 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_211 = __VLS_210({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_210));
}
var __VLS_208;
var __VLS_204;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({});
const __VLS_213 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
    label: "说明",
    ...{ class: "span-2" },
}));
const __VLS_215 = __VLS_214({
    label: "说明",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_214));
__VLS_216.slots.default;
const __VLS_217 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
    modelValue: (__VLS_ctx.form.description),
    disabled: (!__VLS_ctx.canManageCurrent),
    type: "textarea",
    rows: (4),
    placeholder: "用于描述测试范围、版本范围和执行目标",
}));
const __VLS_219 = __VLS_218({
    modelValue: (__VLS_ctx.form.description),
    disabled: (!__VLS_ctx.canManageCurrent),
    type: "textarea",
    rows: (4),
    placeholder: "用于描述测试范围、版本范围和执行目标",
}, ...__VLS_functionalComponentArgsRest(__VLS_218));
var __VLS_216;
var __VLS_162;
{
    const { footer: __VLS_thisSlot } = __VLS_158.slots;
    const __VLS_221 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
        ...{ 'onClick': {} },
    }));
    const __VLS_223 = __VLS_222({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_222));
    let __VLS_225;
    let __VLS_226;
    let __VLS_227;
    const __VLS_228 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_224.slots.default;
    (__VLS_ctx.canManageCurrent ? '取消' : '关闭');
    var __VLS_224;
    if (__VLS_ctx.canManageCurrent) {
        const __VLS_229 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_231 = __VLS_230({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_230));
        let __VLS_233;
        let __VLS_234;
        let __VLS_235;
        const __VLS_236 = {
            onClick: (__VLS_ctx.handleSubmit)
        };
        __VLS_232.slots.default;
        (__VLS_ctx.isEditing ? '保存计划' : '保存并进入');
        var __VLS_232;
    }
}
var __VLS_158;
/** @type {__VLS_StyleScopedClasses['atelier-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-list']} */ ;
/** @type {__VLS_StyleScopedClasses['test-plan-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-list']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head']} */ ;
/** @type {__VLS_StyleScopedClasses['test-plan-list-head']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-iteration']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-cases']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-row']} */ ;
/** @type {__VLS_StyleScopedClasses['test-plan-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['test-plan-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['test-plan-link']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-iteration']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['status-select']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-cases']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['test-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
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
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['plan-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
// @ts-ignore
var __VLS_164 = __VLS_163;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Delete: Delete,
            EditPen: EditPen,
            Filter: Filter,
            Finished: Finished,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Right: Right,
            Search: Search,
            CompactSelectMenu: CompactSelectMenu,
            statusOptions: statusOptions,
            statusSelectOptions: statusSelectOptions,
            canManage: canManage,
            loading: loading,
            submitting: submitting,
            statusUpdatingId: statusUpdatingId,
            dialogVisible: dialogVisible,
            isEditing: isEditing,
            list: list,
            projectOptions: projectOptions,
            filterIterationOptions: filterIterationOptions,
            formIterationOptions: formIterationOptions,
            formRef: formRef,
            pagination: pagination,
            totalPages: totalPages,
            filters: filters,
            testPlanFilterPopoverVisible: testPlanFilterPopoverVisible,
            form: form,
            rules: rules,
            dialogTitle: dialogTitle,
            canManageCurrent: canManageCurrent,
            handleSearch: handleSearch,
            handleReset: handleReset,
            handleSizeChange: handleSizeChange,
            handlePrevPage: handlePrevPage,
            handleNextPage: handleNextPage,
            handleFilterProjectChange: handleFilterProjectChange,
            handleFormProjectChange: handleFormProjectChange,
            openCreateDialog: openCreateDialog,
            openEditDialog: openEditDialog,
            openDetail: openDetail,
            goToProject: goToProject,
            goToIteration: goToIteration,
            handleStatusChange: handleStatusChange,
            handleSubmit: handleSubmit,
            handleDelete: handleDelete,
            testPlanStatusTone: testPlanStatusTone,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=TestPlanView.vue.js.map