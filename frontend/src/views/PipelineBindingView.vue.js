/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, DataAnalysis, Delete, EditPen, Filter, Plus, RefreshRight, Search, Tickets, VideoPlay } from '@element-plus/icons-vue';
import { createPipelineBinding, deletePipelineBinding, getPipelineBuildLog, listJenkinsServerOptions, listPipelineBuilds, pagePipelineBindings, triggerPipelineBuild, updatePipelineBinding } from '@/api/cicd';
import { listProjectOptions } from '@/api/platform';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('cicd:manage'));
const canView = computed(() => authStore.hasPermission('cicd:view'));
const projectOptions = ref([]);
const serverOptions = ref([]);
const bindingLoading = ref(false);
const bindingSubmitting = ref(false);
const bindingDialogVisible = ref(false);
const bindingIsEditing = ref(false);
const bindingReadonlyMode = ref(false);
const currentBindingId = ref(null);
const bindingList = ref([]);
const bindingFormRef = ref();
const bindingPagination = reactive({ page: 1, size: 10, total: 0 });
const bindingFilters = reactive({
    keyword: '',
    serverId: undefined,
    enabled: undefined
});
const bindingFilterPopoverVisible = ref(false);
const bindingForm = reactive({
    projectId: null,
    jenkinsServerId: null,
    jobName: '',
    defaultBranch: '',
    buildParametersJson: '',
    enabled: true
});
const buildDrawerVisible = ref(false);
const buildDrawerTitle = ref('构建历史');
const buildLoading = ref(false);
const buildHistoryLimit = ref(20);
const buildList = ref([]);
const currentBuildBindingId = ref(null);
const buildLogVisible = ref(false);
const currentBuildLog = ref(null);
const bindingTotalPages = computed(() => Math.max(1, Math.ceil(bindingPagination.total / bindingPagination.size) || 1));
const bindingDialogTitle = computed(() => {
    if (bindingReadonlyMode.value) {
        return '查看流水线绑定';
    }
    return bindingIsEditing.value ? '编辑流水线绑定' : '新增流水线绑定';
});
const bindingRules = {
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
    jenkinsServerId: [{ required: true, message: '请选择 Jenkins 服务', trigger: 'change' }],
    jobName: [{ required: true, message: '请输入 Job 名称', trigger: 'blur' }]
};
/**
 * 同步加载弹窗依赖的项目和 Jenkins 服务选项。
 */
const loadBaseOptions = async () => {
    const [projects, servers] = await Promise.all([listProjectOptions(), listJenkinsServerOptions()]);
    projectOptions.value = projects;
    serverOptions.value = servers;
    if (!bindingForm.projectId && projectOptions.value.length) {
        bindingForm.projectId = projectOptions.value[0].id;
    }
    if (!bindingForm.jenkinsServerId && serverOptions.value.length) {
        bindingForm.jenkinsServerId = serverOptions.value[0].id;
    }
};
const formatDateTime = (value) => {
    if (!value)
        return '-';
    return value.replace('T', ' ').slice(0, 16);
};
const formatTriggerStatus = (status) => {
    if (status === 'QUEUED')
        return '已排队';
    if (status === 'SUCCESS')
        return '成功';
    if (status === 'FAILED')
        return '失败';
    return status || '未触发';
};
const triggerStatusTone = (status) => {
    if (status === 'QUEUED' || status === 'SUCCESS')
        return 'success';
    if (status === 'FAILED')
        return 'danger';
    return 'neutral';
};
const buildStatusType = (item) => {
    if (item.building)
        return 'warning';
    if (item.result === 'SUCCESS')
        return 'success';
    if (item.result === 'FAILURE' || item.result === 'FAILED' || item.result === 'ABORTED')
        return 'danger';
    if (item.result === 'UNSTABLE')
        return 'warning';
    return 'info';
};
const formatBuildStatus = (item) => {
    if (item.building)
        return '构建中';
    if (item.result === 'SUCCESS')
        return '成功';
    if (item.result === 'FAILURE' || item.result === 'FAILED')
        return '失败';
    if (item.result === 'ABORTED')
        return '已中止';
    if (item.result === 'UNSTABLE')
        return '不稳定';
    return item.result || '未知';
};
const formatBuildLogStatus = (item) => {
    if (item.building)
        return '构建中';
    if (item.result === 'SUCCESS')
        return '成功';
    if (item.result === 'FAILURE' || item.result === 'FAILED')
        return '失败';
    if (item.result === 'ABORTED')
        return '已中止';
    if (item.result === 'UNSTABLE')
        return '不稳定';
    return item.result || '未知';
};
/**
 * 重置流水线绑定表单，确保新增场景默认选中首个可用项。
 */
const resetBindingForm = () => {
    currentBindingId.value = null;
    bindingForm.projectId = projectOptions.value[0]?.id ?? null;
    bindingForm.jenkinsServerId = serverOptions.value[0]?.id ?? null;
    bindingForm.jobName = '';
    bindingForm.defaultBranch = '';
    bindingForm.buildParametersJson = '';
    bindingForm.enabled = true;
    bindingFormRef.value?.clearValidate();
};
const loadBindings = async () => {
    bindingLoading.value = true;
    try {
        const pageData = await pagePipelineBindings({
            page: bindingPagination.page,
            size: bindingPagination.size,
            keyword: bindingFilters.keyword,
            serverId: bindingFilters.serverId,
            enabled: bindingFilters.enabled
        });
        bindingList.value = pageData.records;
        bindingPagination.total = pageData.total;
    }
    finally {
        bindingLoading.value = false;
    }
};
const loadBuildHistory = async (bindingId) => {
    buildLoading.value = true;
    try {
        buildList.value = await listPipelineBuilds(bindingId, buildHistoryLimit.value);
    }
    finally {
        buildLoading.value = false;
    }
};
const reloadBuildHistory = async () => {
    if (currentBuildBindingId.value === null)
        return;
    await loadBuildHistory(currentBuildBindingId.value);
};
const handleBuildHistoryLimitChange = async () => {
    await reloadBuildHistory();
};
const handleBindingSearch = async () => {
    bindingFilterPopoverVisible.value = false;
    bindingPagination.page = 1;
    await loadBindings();
};
const handleBindingReset = async () => {
    bindingFilters.keyword = '';
    bindingFilters.serverId = undefined;
    bindingFilters.enabled = undefined;
    bindingPagination.page = 1;
    await loadBindings();
};
const handleBindingSizeChange = async () => {
    bindingPagination.page = 1;
    await loadBindings();
};
const handleBindingPrevPage = async () => {
    if (bindingPagination.page <= 1)
        return;
    bindingPagination.page -= 1;
    await loadBindings();
};
const handleBindingNextPage = async () => {
    if (bindingPagination.page >= bindingTotalPages.value)
        return;
    bindingPagination.page += 1;
    await loadBindings();
};
const openBindingCreateDialog = () => {
    bindingReadonlyMode.value = false;
    bindingIsEditing.value = false;
    resetBindingForm();
    bindingDialogVisible.value = true;
};
const fillBindingForm = (row) => {
    bindingIsEditing.value = true;
    currentBindingId.value = row.id;
    bindingForm.projectId = row.projectId;
    bindingForm.jenkinsServerId = row.jenkinsServerId;
    bindingForm.jobName = row.jobName;
    bindingForm.defaultBranch = row.defaultBranch || '';
    bindingForm.buildParametersJson = row.buildParametersJson || '';
    bindingForm.enabled = row.enabled;
};
const openBindingDetailDialog = (row) => {
    bindingReadonlyMode.value = true;
    fillBindingForm(row);
    bindingDialogVisible.value = true;
};
const openBindingEditDialog = (row) => {
    bindingReadonlyMode.value = false;
    fillBindingForm(row);
    bindingDialogVisible.value = true;
};
/**
 * 统一处理流水线绑定的新增与编辑保存。
 */
const handleBindingSubmit = async () => {
    const valid = await bindingFormRef.value?.validate().catch(() => false);
    if (!valid || bindingForm.projectId === null || bindingForm.jenkinsServerId === null)
        return;
    bindingSubmitting.value = true;
    try {
        const payload = {
            projectId: bindingForm.projectId,
            jenkinsServerId: bindingForm.jenkinsServerId,
            jobName: bindingForm.jobName,
            defaultBranch: bindingForm.defaultBranch,
            buildParametersJson: bindingForm.buildParametersJson,
            enabled: bindingForm.enabled
        };
        if (bindingIsEditing.value && currentBindingId.value !== null) {
            await updatePipelineBinding(currentBindingId.value, payload);
            ElMessage.success('流水线绑定已更新');
        }
        else {
            await createPipelineBinding(payload);
            ElMessage.success('流水线绑定已创建');
        }
        bindingDialogVisible.value = false;
        await Promise.all([loadBaseOptions(), loadBindings()]);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存失败');
    }
    finally {
        bindingSubmitting.value = false;
    }
};
const handleBindingDelete = async (id) => {
    try {
        await ElMessageBox.confirm('删除后不可恢复，确认继续吗？', '提示', { type: 'warning' });
        await deletePipelineBinding(id);
        ElMessage.success('流水线绑定已删除');
        await loadBindings();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
const openBuildHistoryDrawer = async (row) => {
    currentBuildBindingId.value = row.id;
    buildDrawerTitle.value = `构建历史 - ${row.projectName} / ${row.jobName}`;
    buildDrawerVisible.value = true;
    buildLogVisible.value = false;
    currentBuildLog.value = null;
    try {
        await loadBuildHistory(row.id);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载构建历史失败');
    }
};
const openBuildLog = async (row) => {
    if (currentBuildBindingId.value === null)
        return;
    try {
        currentBuildLog.value = await getPipelineBuildLog(currentBuildBindingId.value, row.number);
        buildLogVisible.value = true;
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载构建日志失败');
    }
};
const handleTriggerBuild = async (id) => {
    try {
        const result = await triggerPipelineBuild(id);
        ElMessage.success(result.message);
        await loadBindings();
        if (currentBuildBindingId.value === id && buildDrawerVisible.value) {
            await loadBuildHistory(id);
        }
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '触发构建失败');
        await loadBindings();
    }
};
onMounted(async () => {
    await loadBaseOptions();
    await loadBindings();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['pipeline-col-server']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-job']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-branch']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-message']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "work-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-search-shell" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "work-list-search-icon" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "work-list-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onKeyup: (__VLS_ctx.handleBindingSearch) },
    value: (__VLS_ctx.bindingFilters.keyword),
    ...{ class: "work-list-search-input" },
    type: "text",
    placeholder: "搜索项目、Jenkins、Job 或分支...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "work-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.bindingFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (360),
    popperClass: "work-list-filter-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.bindingFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (360),
    popperClass: "work-list-filter-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_11.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "work-list-toolbar-button" },
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
    ...{ class: "work-list-filter-panel work-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.bindingFilters.serverId),
    clearable: true,
    placeholder: "Jenkins 服务",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.bindingFilters.serverId),
    clearable: true,
    placeholder: "Jenkins 服务",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.serverOptions))) {
    const __VLS_24 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_26 = __VLS_25({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_28 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.bindingFilters.enabled),
    clearable: true,
    placeholder: "启用状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.bindingFilters.enabled),
    clearable: true,
    placeholder: "启用状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "启用",
    value: (true),
}));
const __VLS_34 = __VLS_33({
    label: "启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
const __VLS_36 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "停用",
    value: (false),
}));
const __VLS_38 = __VLS_37({
    label: "停用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
var __VLS_31;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-filter-actions" },
});
const __VLS_40 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_42 = __VLS_41({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onClick: (__VLS_ctx.handleBindingSearch)
};
__VLS_43.slots.default;
var __VLS_43;
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
    onClick: (__VLS_ctx.handleBindingReset)
};
__VLS_51.slots.default;
var __VLS_51;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleBindingReset) },
    ...{ class: "work-list-toolbar-button" },
    type: "button",
});
const __VLS_56 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
const __VLS_60 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
var __VLS_59;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-toolbar-side" },
});
if (__VLS_ctx.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openBindingCreateDialog) },
        ...{ class: "work-list-create-button" },
        type: "button",
    });
    const __VLS_64 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
    const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    const __VLS_68 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
    const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
    var __VLS_67;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "work-list-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.bindingLoading) }, null, null);
if (__VLS_ctx.bindingList.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "work-list-table pipeline-list-table mobile-card-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "pipeline-col-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "pipeline-col-server" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "pipeline-col-job" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "pipeline-col-branch" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "center pipeline-col-enabled" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "center pipeline-col-status" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "pipeline-col-time" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "pipeline-col-message" },
    });
    if (__VLS_ctx.canView) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            ...{ class: "right pipeline-col-actions" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [row] of __VLS_getVForSourceType((__VLS_ctx.bindingList))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (row.id),
            ...{ class: "work-list-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "pipeline-col-main" },
            'data-label': "项目",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.bindingList.length))
                        return;
                    __VLS_ctx.openBindingDetailDialog(row);
                } },
            ...{ class: "management-list-title-trigger" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title-cell" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-title-icon" },
        });
        const __VLS_72 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
        const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        const __VLS_76 = {}.DataAnalysis;
        /** @type {[typeof __VLS_components.DataAnalysis, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
        const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
        var __VLS_75;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title" },
        });
        (row.projectName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-subtitle" },
        });
        (row.id);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "pipeline-col-server" },
            'data-label': "Jenkins 服务",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-text" },
        });
        (row.jenkinsServerName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "pipeline-col-job" },
            'data-label': "构建任务",
        });
        if (row.jobUrl) {
            const __VLS_80 = {}.ElLink;
            /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                href: (row.jobUrl),
                target: "_blank",
                type: "primary",
                ...{ class: "pipeline-job-link" },
            }));
            const __VLS_82 = __VLS_81({
                href: (row.jobUrl),
                target: "_blank",
                type: "primary",
                ...{ class: "pipeline-job-link" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            __VLS_83.slots.default;
            (row.jobName);
            var __VLS_83;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "management-list-link" },
            });
            (row.jobName);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "pipeline-col-branch" },
            'data-label': "默认分支",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
        (row.defaultBranch || '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "center pipeline-col-enabled" },
            'data-label': "启用",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (row.enabled ? 'success' : 'neutral') },
        });
        (row.enabled ? '启用' : '停用');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "center pipeline-col-status" },
            'data-label': "最近触发状态",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (__VLS_ctx.triggerStatusTone(row.lastTriggerStatus)) },
        });
        (__VLS_ctx.formatTriggerStatus(row.lastTriggerStatus));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "pipeline-col-time" },
            'data-label': "最近触发时间",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-updated" },
        });
        (__VLS_ctx.formatDateTime(row.lastTriggeredAt));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "pipeline-col-message" },
            'data-label': "最近结果",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
        (row.lastTriggerMessage || '-');
        if (__VLS_ctx.canView) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                ...{ class: "right pipeline-col-actions" },
                'data-label': "操作",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "management-list-row-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.bindingList.length))
                            return;
                        if (!(__VLS_ctx.canView))
                            return;
                        __VLS_ctx.openBuildHistoryDrawer(row);
                    } },
                ...{ class: "management-list-row-button" },
                type: "button",
                title: "构建历史",
            });
            const __VLS_84 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
            const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
            __VLS_87.slots.default;
            const __VLS_88 = {}.Tickets;
            /** @type {[typeof __VLS_components.Tickets, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
            const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
            var __VLS_87;
            if (__VLS_ctx.canManage) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.bindingList.length))
                                return;
                            if (!(__VLS_ctx.canView))
                                return;
                            if (!(__VLS_ctx.canManage))
                                return;
                            __VLS_ctx.handleTriggerBuild(row.id);
                        } },
                    ...{ class: "management-list-row-button" },
                    type: "button",
                    title: "触发构建",
                });
                const __VLS_92 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
                const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
                __VLS_95.slots.default;
                const __VLS_96 = {}.VideoPlay;
                /** @type {[typeof __VLS_components.VideoPlay, ]} */ ;
                // @ts-ignore
                const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
                const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
                var __VLS_95;
            }
            if (__VLS_ctx.canManage) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.bindingList.length))
                                return;
                            if (!(__VLS_ctx.canView))
                                return;
                            if (!(__VLS_ctx.canManage))
                                return;
                            __VLS_ctx.openBindingEditDialog(row);
                        } },
                    ...{ class: "management-list-row-button" },
                    type: "button",
                    title: "编辑绑定",
                });
                const __VLS_100 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
                const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
                __VLS_103.slots.default;
                const __VLS_104 = {}.EditPen;
                /** @type {[typeof __VLS_components.EditPen, ]} */ ;
                // @ts-ignore
                const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
                const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
                var __VLS_103;
            }
            if (__VLS_ctx.canManage) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.bindingList.length))
                                return;
                            if (!(__VLS_ctx.canView))
                                return;
                            if (!(__VLS_ctx.canManage))
                                return;
                            __VLS_ctx.handleBindingDelete(row.id);
                        } },
                    ...{ class: "management-list-row-button danger" },
                    type: "button",
                    title: "删除绑定",
                });
                const __VLS_108 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
                const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
                __VLS_111.slots.default;
                const __VLS_112 = {}.Delete;
                /** @type {[typeof __VLS_components.Delete, ]} */ ;
                // @ts-ignore
                const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({}));
                const __VLS_114 = __VLS_113({}, ...__VLS_functionalComponentArgsRest(__VLS_113));
                var __VLS_111;
            }
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-list-empty-state" },
    });
    const __VLS_116 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        description: "当前筛选条件下暂无项目流水线",
    }));
    const __VLS_118 = __VLS_117({
        description: "当前筛选条件下暂无项目流水线",
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.bindingPagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-page-size work-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_120 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.bindingPagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_122 = __VLS_121({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.bindingPagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
let __VLS_124;
let __VLS_125;
let __VLS_126;
const __VLS_127 = {
    onChange: (__VLS_ctx.handleBindingSizeChange)
};
__VLS_123.slots.default;
const __VLS_128 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    value: (5),
    label: "5",
}));
const __VLS_130 = __VLS_129({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
const __VLS_132 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    value: (10),
    label: "10",
}));
const __VLS_134 = __VLS_133({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
const __VLS_136 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    value: (20),
    label: "20",
}));
const __VLS_138 = __VLS_137({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
const __VLS_140 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    value: (50),
    label: "50",
}));
const __VLS_142 = __VLS_141({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
var __VLS_123;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleBindingPrevPage) },
    ...{ class: "work-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.bindingPagination.page <= 1),
});
const __VLS_144 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
const __VLS_148 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({}));
const __VLS_150 = __VLS_149({}, ...__VLS_functionalComponentArgsRest(__VLS_149));
var __VLS_147;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "work-list-page-text" },
});
(__VLS_ctx.bindingPagination.page);
(__VLS_ctx.bindingTotalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleBindingNextPage) },
    ...{ class: "work-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.bindingPagination.page >= __VLS_ctx.bindingTotalPages),
});
const __VLS_152 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({}));
const __VLS_154 = __VLS_153({}, ...__VLS_functionalComponentArgsRest(__VLS_153));
__VLS_155.slots.default;
const __VLS_156 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({}));
const __VLS_158 = __VLS_157({}, ...__VLS_functionalComponentArgsRest(__VLS_157));
var __VLS_155;
const __VLS_160 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    modelValue: (__VLS_ctx.bindingDialogVisible),
    title: (__VLS_ctx.bindingDialogTitle),
    width: "720px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_162 = __VLS_161({
    modelValue: (__VLS_ctx.bindingDialogVisible),
    title: (__VLS_ctx.bindingDialogTitle),
    width: "720px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    ref: "bindingFormRef",
    model: (__VLS_ctx.bindingForm),
    rules: (__VLS_ctx.bindingRules),
    disabled: (__VLS_ctx.bindingReadonlyMode),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_166 = __VLS_165({
    ref: "bindingFormRef",
    model: (__VLS_ctx.bindingForm),
    rules: (__VLS_ctx.bindingRules),
    disabled: (__VLS_ctx.bindingReadonlyMode),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
/** @type {typeof __VLS_ctx.bindingFormRef} */ ;
var __VLS_168 = {};
__VLS_167.slots.default;
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
const __VLS_170 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    label: "平台项目",
    prop: "projectId",
}));
const __VLS_172 = __VLS_171({
    label: "平台项目",
    prop: "projectId",
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
__VLS_173.slots.default;
const __VLS_174 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
    modelValue: (__VLS_ctx.bindingForm.projectId),
    placeholder: "请选择项目",
    ...{ style: {} },
}));
const __VLS_176 = __VLS_175({
    modelValue: (__VLS_ctx.bindingForm.projectId),
    placeholder: "请选择项目",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_175));
__VLS_177.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_178 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_180 = __VLS_179({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_179));
}
var __VLS_177;
var __VLS_173;
const __VLS_182 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
    label: "Jenkins 服务",
    prop: "jenkinsServerId",
}));
const __VLS_184 = __VLS_183({
    label: "Jenkins 服务",
    prop: "jenkinsServerId",
}, ...__VLS_functionalComponentArgsRest(__VLS_183));
__VLS_185.slots.default;
const __VLS_186 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    modelValue: (__VLS_ctx.bindingForm.jenkinsServerId),
    placeholder: "请选择 Jenkins 服务",
    ...{ style: {} },
}));
const __VLS_188 = __VLS_187({
    modelValue: (__VLS_ctx.bindingForm.jenkinsServerId),
    placeholder: "请选择 Jenkins 服务",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
__VLS_189.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.serverOptions))) {
    const __VLS_190 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_192 = __VLS_191({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_191));
}
var __VLS_189;
var __VLS_185;
const __VLS_194 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    label: "任务名称",
    prop: "jobName",
}));
const __VLS_196 = __VLS_195({
    label: "任务名称",
    prop: "jobName",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
__VLS_197.slots.default;
const __VLS_198 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    modelValue: (__VLS_ctx.bindingForm.jobName),
    placeholder: "支持 folder/job 形式，例如：backend/build",
}));
const __VLS_200 = __VLS_199({
    modelValue: (__VLS_ctx.bindingForm.jobName),
    placeholder: "支持 folder/job 形式，例如：backend/build",
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
var __VLS_197;
const __VLS_202 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    label: "默认分支",
}));
const __VLS_204 = __VLS_203({
    label: "默认分支",
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
__VLS_205.slots.default;
const __VLS_206 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
    modelValue: (__VLS_ctx.bindingForm.defaultBranch),
    placeholder: "例如：main",
}));
const __VLS_208 = __VLS_207({
    modelValue: (__VLS_ctx.bindingForm.defaultBranch),
    placeholder: "例如：main",
}, ...__VLS_functionalComponentArgsRest(__VLS_207));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
var __VLS_205;
const __VLS_210 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    label: "构建参数 JSON",
}));
const __VLS_212 = __VLS_211({
    label: "构建参数 JSON",
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
const __VLS_214 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
    modelValue: (__VLS_ctx.bindingForm.buildParametersJson),
    type: "textarea",
    rows: (6),
    placeholder: '例如：{"env":"test","branch":"main"}',
}));
const __VLS_216 = __VLS_215({
    modelValue: (__VLS_ctx.bindingForm.buildParametersJson),
    type: "textarea",
    rows: (6),
    placeholder: '例如：{"env":"test","branch":"main"}',
}, ...__VLS_functionalComponentArgsRest(__VLS_215));
var __VLS_213;
const __VLS_218 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
    label: "启用",
}));
const __VLS_220 = __VLS_219({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
__VLS_221.slots.default;
const __VLS_222 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    modelValue: (__VLS_ctx.bindingForm.enabled),
}));
const __VLS_224 = __VLS_223({
    modelValue: (__VLS_ctx.bindingForm.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
var __VLS_221;
var __VLS_167;
{
    const { footer: __VLS_thisSlot } = __VLS_163.slots;
    const __VLS_226 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
        ...{ 'onClick': {} },
    }));
    const __VLS_228 = __VLS_227({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_227));
    let __VLS_230;
    let __VLS_231;
    let __VLS_232;
    const __VLS_233 = {
        onClick: (...[$event]) => {
            __VLS_ctx.bindingDialogVisible = false;
        }
    };
    __VLS_229.slots.default;
    (__VLS_ctx.bindingReadonlyMode ? '关闭' : '取消');
    var __VLS_229;
    if (!__VLS_ctx.bindingReadonlyMode) {
        const __VLS_234 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.bindingSubmitting),
        }));
        const __VLS_236 = __VLS_235({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.bindingSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_235));
        let __VLS_238;
        let __VLS_239;
        let __VLS_240;
        const __VLS_241 = {
            onClick: (__VLS_ctx.handleBindingSubmit)
        };
        __VLS_237.slots.default;
        var __VLS_237;
    }
}
var __VLS_163;
const __VLS_242 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
    modelValue: (__VLS_ctx.buildDrawerVisible),
    title: (__VLS_ctx.buildDrawerTitle),
    size: "68%",
}));
const __VLS_244 = __VLS_243({
    modelValue: (__VLS_ctx.buildDrawerVisible),
    title: (__VLS_ctx.buildDrawerTitle),
    size: "68%",
}, ...__VLS_functionalComponentArgsRest(__VLS_243));
__VLS_245.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "build-history-toolbar" },
});
const __VLS_246 = {}.ElSpace;
/** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
    wrap: true,
}));
const __VLS_248 = __VLS_247({
    wrap: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
__VLS_249.slots.default;
const __VLS_250 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.buildHistoryLimit),
    ...{ style: {} },
}));
const __VLS_252 = __VLS_251({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.buildHistoryLimit),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
let __VLS_254;
let __VLS_255;
let __VLS_256;
const __VLS_257 = {
    onChange: (__VLS_ctx.handleBuildHistoryLimitChange)
};
__VLS_253.slots.default;
const __VLS_258 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
    value: (10),
    label: "最近 10 条",
}));
const __VLS_260 = __VLS_259({
    value: (10),
    label: "最近 10 条",
}, ...__VLS_functionalComponentArgsRest(__VLS_259));
const __VLS_262 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
    value: (20),
    label: "最近 20 条",
}));
const __VLS_264 = __VLS_263({
    value: (20),
    label: "最近 20 条",
}, ...__VLS_functionalComponentArgsRest(__VLS_263));
const __VLS_266 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_267 = __VLS_asFunctionalComponent(__VLS_266, new __VLS_266({
    value: (50),
    label: "最近 50 条",
}));
const __VLS_268 = __VLS_267({
    value: (50),
    label: "最近 50 条",
}, ...__VLS_functionalComponentArgsRest(__VLS_267));
var __VLS_253;
const __VLS_270 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
    ...{ 'onClick': {} },
}));
const __VLS_272 = __VLS_271({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_271));
let __VLS_274;
let __VLS_275;
let __VLS_276;
const __VLS_277 = {
    onClick: (__VLS_ctx.reloadBuildHistory)
};
__VLS_273.slots.default;
var __VLS_273;
var __VLS_249;
const __VLS_278 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_279 = __VLS_asFunctionalComponent(__VLS_278, new __VLS_278({
    data: (__VLS_ctx.buildList),
    ...{ style: {} },
}));
const __VLS_280 = __VLS_279({
    data: (__VLS_ctx.buildList),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_279));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.buildLoading) }, null, null);
__VLS_281.slots.default;
const __VLS_282 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_283 = __VLS_asFunctionalComponent(__VLS_282, new __VLS_282({
    prop: "number",
    label: "构建号",
    width: "100",
}));
const __VLS_284 = __VLS_283({
    prop: "number",
    label: "构建号",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_283));
const __VLS_286 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_287 = __VLS_asFunctionalComponent(__VLS_286, new __VLS_286({
    label: "状态",
    width: "120",
}));
const __VLS_288 = __VLS_287({
    label: "状态",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_287));
__VLS_289.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_289.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_290 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
        type: (__VLS_ctx.buildStatusType(row)),
    }));
    const __VLS_292 = __VLS_291({
        type: (__VLS_ctx.buildStatusType(row)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_291));
    __VLS_293.slots.default;
    (__VLS_ctx.formatBuildStatus(row));
    var __VLS_293;
}
var __VLS_289;
const __VLS_294 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
    label: "执行中",
    width: "90",
}));
const __VLS_296 = __VLS_295({
    label: "执行中",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_295));
__VLS_297.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_297.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_298 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
        type: (row.building ? 'warning' : 'info'),
    }));
    const __VLS_300 = __VLS_299({
        type: (row.building ? 'warning' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_299));
    __VLS_301.slots.default;
    (row.building ? '是' : '否');
    var __VLS_301;
}
var __VLS_297;
const __VLS_302 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
    prop: "executedAt",
    label: "执行时间",
    width: "180",
}));
const __VLS_304 = __VLS_303({
    prop: "executedAt",
    label: "执行时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_303));
const __VLS_306 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
    prop: "durationText",
    label: "耗时",
    width: "120",
}));
const __VLS_308 = __VLS_307({
    prop: "durationText",
    label: "耗时",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_307));
const __VLS_310 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
    prop: "description",
    label: "描述",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_312 = __VLS_311({
    prop: "description",
    label: "描述",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_311));
const __VLS_314 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
    label: "链接",
    width: "90",
}));
const __VLS_316 = __VLS_315({
    label: "链接",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_315));
__VLS_317.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_317.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.url) {
        const __VLS_318 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_320 = __VLS_319({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_319));
        __VLS_321.slots.default;
        var __VLS_321;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
var __VLS_317;
const __VLS_322 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({
    label: "操作",
    width: "110",
    fixed: "right",
}));
const __VLS_324 = __VLS_323({
    label: "操作",
    width: "110",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_323));
__VLS_325.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_325.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_326 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_328 = __VLS_327({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_327));
    let __VLS_330;
    let __VLS_331;
    let __VLS_332;
    const __VLS_333 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openBuildLog(row);
        }
    };
    __VLS_329.slots.default;
    var __VLS_329;
}
var __VLS_325;
var __VLS_281;
var __VLS_245;
const __VLS_334 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
    modelValue: (__VLS_ctx.buildLogVisible),
    title: "构建日志详情",
    width: "900px",
}));
const __VLS_336 = __VLS_335({
    modelValue: (__VLS_ctx.buildLogVisible),
    title: "构建日志详情",
    width: "900px",
}, ...__VLS_functionalComponentArgsRest(__VLS_335));
__VLS_337.slots.default;
if (__VLS_ctx.currentBuildLog) {
    const __VLS_338 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_339 = __VLS_asFunctionalComponent(__VLS_338, new __VLS_338({
        column: (2),
        border: true,
    }));
    const __VLS_340 = __VLS_339({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_339));
    __VLS_341.slots.default;
    const __VLS_342 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
        label: "平台项目",
    }));
    const __VLS_344 = __VLS_343({
        label: "平台项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_343));
    __VLS_345.slots.default;
    (__VLS_ctx.currentBuildLog.projectName);
    var __VLS_345;
    const __VLS_346 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
        label: "Jenkins 服务",
    }));
    const __VLS_348 = __VLS_347({
        label: "Jenkins 服务",
    }, ...__VLS_functionalComponentArgsRest(__VLS_347));
    __VLS_349.slots.default;
    (__VLS_ctx.currentBuildLog.jenkinsServerName);
    var __VLS_349;
    const __VLS_350 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({
        label: "Job",
    }));
    const __VLS_352 = __VLS_351({
        label: "Job",
    }, ...__VLS_functionalComponentArgsRest(__VLS_351));
    __VLS_353.slots.default;
    (__VLS_ctx.currentBuildLog.jobName);
    var __VLS_353;
    const __VLS_354 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({
        label: "构建号",
    }));
    const __VLS_356 = __VLS_355({
        label: "构建号",
    }, ...__VLS_functionalComponentArgsRest(__VLS_355));
    __VLS_357.slots.default;
    (__VLS_ctx.currentBuildLog.buildNumber);
    var __VLS_357;
    const __VLS_358 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_359 = __VLS_asFunctionalComponent(__VLS_358, new __VLS_358({
        label: "状态",
    }));
    const __VLS_360 = __VLS_359({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_359));
    __VLS_361.slots.default;
    (__VLS_ctx.formatBuildLogStatus(__VLS_ctx.currentBuildLog));
    var __VLS_361;
    const __VLS_362 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
        label: "执行时间",
    }));
    const __VLS_364 = __VLS_363({
        label: "执行时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_363));
    __VLS_365.slots.default;
    (__VLS_ctx.currentBuildLog.executedAt || '-');
    var __VLS_365;
    const __VLS_366 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_367 = __VLS_asFunctionalComponent(__VLS_366, new __VLS_366({
        label: "耗时",
    }));
    const __VLS_368 = __VLS_367({
        label: "耗时",
    }, ...__VLS_functionalComponentArgsRest(__VLS_367));
    __VLS_369.slots.default;
    (__VLS_ctx.currentBuildLog.durationText || '-');
    var __VLS_369;
    const __VLS_370 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_371 = __VLS_asFunctionalComponent(__VLS_370, new __VLS_370({
        label: "描述",
    }));
    const __VLS_372 = __VLS_371({
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_371));
    __VLS_373.slots.default;
    (__VLS_ctx.currentBuildLog.description || '-');
    var __VLS_373;
    const __VLS_374 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_375 = __VLS_asFunctionalComponent(__VLS_374, new __VLS_374({
        label: "链接",
        span: (2),
    }));
    const __VLS_376 = __VLS_375({
        label: "链接",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_375));
    __VLS_377.slots.default;
    if (__VLS_ctx.currentBuildLog.url) {
        const __VLS_378 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_379 = __VLS_asFunctionalComponent(__VLS_378, new __VLS_378({
            href: (__VLS_ctx.currentBuildLog.url),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_380 = __VLS_379({
            href: (__VLS_ctx.currentBuildLog.url),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_379));
        __VLS_381.slots.default;
        var __VLS_381;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_377;
    var __VLS_341;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "build-log-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "build-log-title" },
});
const __VLS_382 = {}.ElScrollbar;
/** @type {[typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, ]} */ ;
// @ts-ignore
const __VLS_383 = __VLS_asFunctionalComponent(__VLS_382, new __VLS_382({
    maxHeight: "420px",
}));
const __VLS_384 = __VLS_383({
    maxHeight: "420px",
}, ...__VLS_functionalComponentArgsRest(__VLS_383));
__VLS_385.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
    ...{ class: "build-log-content" },
});
(__VLS_ctx.currentBuildLog?.consoleLog || '');
var __VLS_385;
{
    const { footer: __VLS_thisSlot } = __VLS_337.slots;
    const __VLS_386 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_387 = __VLS_asFunctionalComponent(__VLS_386, new __VLS_386({
        ...{ 'onClick': {} },
    }));
    const __VLS_388 = __VLS_387({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_387));
    let __VLS_390;
    let __VLS_391;
    let __VLS_392;
    const __VLS_393 = {
        onClick: (...[$event]) => {
            __VLS_ctx.buildLogVisible = false;
        }
    };
    __VLS_389.slots.default;
    var __VLS_389;
}
var __VLS_337;
/** @type {__VLS_StyleScopedClasses['work-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-server']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-job']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-branch']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-time']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-message']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-server']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-job']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-job-link']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-branch']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-time']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-message']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-page-text']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['build-history-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['build-log-block']} */ ;
/** @type {__VLS_StyleScopedClasses['build-log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['build-log-content']} */ ;
// @ts-ignore
var __VLS_169 = __VLS_168;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            DataAnalysis: DataAnalysis,
            Delete: Delete,
            EditPen: EditPen,
            Filter: Filter,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Search: Search,
            Tickets: Tickets,
            VideoPlay: VideoPlay,
            canManage: canManage,
            canView: canView,
            projectOptions: projectOptions,
            serverOptions: serverOptions,
            bindingLoading: bindingLoading,
            bindingSubmitting: bindingSubmitting,
            bindingDialogVisible: bindingDialogVisible,
            bindingReadonlyMode: bindingReadonlyMode,
            bindingList: bindingList,
            bindingFormRef: bindingFormRef,
            bindingPagination: bindingPagination,
            bindingFilters: bindingFilters,
            bindingFilterPopoverVisible: bindingFilterPopoverVisible,
            bindingForm: bindingForm,
            buildDrawerVisible: buildDrawerVisible,
            buildDrawerTitle: buildDrawerTitle,
            buildLoading: buildLoading,
            buildHistoryLimit: buildHistoryLimit,
            buildList: buildList,
            buildLogVisible: buildLogVisible,
            currentBuildLog: currentBuildLog,
            bindingTotalPages: bindingTotalPages,
            bindingDialogTitle: bindingDialogTitle,
            bindingRules: bindingRules,
            formatDateTime: formatDateTime,
            formatTriggerStatus: formatTriggerStatus,
            triggerStatusTone: triggerStatusTone,
            buildStatusType: buildStatusType,
            formatBuildStatus: formatBuildStatus,
            formatBuildLogStatus: formatBuildLogStatus,
            reloadBuildHistory: reloadBuildHistory,
            handleBuildHistoryLimitChange: handleBuildHistoryLimitChange,
            handleBindingSearch: handleBindingSearch,
            handleBindingReset: handleBindingReset,
            handleBindingSizeChange: handleBindingSizeChange,
            handleBindingPrevPage: handleBindingPrevPage,
            handleBindingNextPage: handleBindingNextPage,
            openBindingCreateDialog: openBindingCreateDialog,
            openBindingDetailDialog: openBindingDetailDialog,
            openBindingEditDialog: openBindingEditDialog,
            handleBindingSubmit: handleBindingSubmit,
            handleBindingDelete: handleBindingDelete,
            openBuildHistoryDrawer: openBuildHistoryDrawer,
            openBuildLog: openBuildLog,
            handleTriggerBuild: handleTriggerBuild,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=PipelineBindingView.vue.js.map