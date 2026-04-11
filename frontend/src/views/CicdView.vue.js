/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listProjectOptions } from '@/api/platform';
import { createJenkinsServer, createPipelineBinding, deleteJenkinsServer, deletePipelineBinding, getPipelineBuildLog, listJenkinsJobs, listJenkinsServerOptions, listPipelineBuilds, pageJenkinsServers, pagePipelineBindings, testJenkinsServer, triggerJenkinsJob, triggerPipelineBuild, updateJenkinsServer, updatePipelineBinding } from '@/api/cicd';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('cicd:manage'));
const canView = computed(() => authStore.hasPermission('cicd:view'));
const activeTab = ref('servers');
const projectOptions = ref([]);
const serverOptions = ref([]);
const serverLoading = ref(false);
const serverSubmitting = ref(false);
const serverDialogVisible = ref(false);
const serverIsEditing = ref(false);
const currentServerId = ref(null);
const serverList = ref([]);
const serverFormRef = ref();
const serverPagination = reactive({ page: 1, size: 10, total: 0 });
const serverFilters = reactive({ keyword: '', enabled: undefined });
const serverForm = reactive({ name: '', baseUrl: '', username: '', apiToken: '', description: '', enabled: true });
const bindingLoading = ref(false);
const bindingSubmitting = ref(false);
const bindingDialogVisible = ref(false);
const bindingIsEditing = ref(false);
const currentBindingId = ref(null);
const bindingList = ref([]);
const bindingFormRef = ref();
const bindingPagination = reactive({ page: 1, size: 10, total: 0 });
const bindingFilters = reactive({ keyword: '', serverId: undefined, enabled: undefined });
const bindingForm = reactive({ projectId: null, jenkinsServerId: null, jobName: '', defaultBranch: '', buildParametersJson: '', enabled: true });
const jobDrawerVisible = ref(false);
const jobDrawerTitle = ref('Jenkins Job 列表');
const jobLoading = ref(false);
const jobList = ref([]);
const currentJobServerId = ref(null);
const jobTriggeringName = ref('');
const buildDrawerVisible = ref(false);
const buildDrawerTitle = ref('构建历史');
const buildLoading = ref(false);
const buildHistoryLimit = ref(20);
const buildList = ref([]);
const currentBuildBindingId = ref(null);
const buildLogVisible = ref(false);
const currentBuildLog = ref(null);
const serverRules = {
    name: [{ required: true, message: '请输入 Jenkins 名称', trigger: 'blur' }],
    baseUrl: [{ required: true, message: '请输入 Jenkins 地址', trigger: 'blur' }],
    username: [{ required: true, message: '请输入 Jenkins 用户名', trigger: 'blur' }]
};
const bindingRules = {
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
    jenkinsServerId: [{ required: true, message: '请选择 Jenkins 服务', trigger: 'change' }],
    jobName: [{ required: true, message: '请输入 Job 名称', trigger: 'blur' }]
};
const testStatusType = (status) => (status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : 'info');
const triggerStatusType = (status) => (status === 'QUEUED' || status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : 'info');
const formatTriggerStatus = (status) => {
    if (status === 'QUEUED')
        return '已排队';
    if (status === 'SUCCESS')
        return '成功';
    if (status === 'FAILED')
        return '失败';
    return status || '未触发';
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
const resetServerForm = () => {
    currentServerId.value = null;
    serverForm.name = '';
    serverForm.baseUrl = '';
    serverForm.username = '';
    serverForm.apiToken = '';
    serverForm.description = '';
    serverForm.enabled = true;
    serverFormRef.value?.clearValidate();
};
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
const loadBaseOptions = async () => {
    const [projects, servers] = await Promise.all([listProjectOptions(), listJenkinsServerOptions()]);
    projectOptions.value = projects;
    serverOptions.value = servers;
    if (!bindingForm.projectId && projectOptions.value.length > 0)
        bindingForm.projectId = projectOptions.value[0].id;
    if (!bindingForm.jenkinsServerId && serverOptions.value.length > 0)
        bindingForm.jenkinsServerId = serverOptions.value[0].id;
};
const loadServers = async () => {
    serverLoading.value = true;
    try {
        const pageData = await pageJenkinsServers({
            page: serverPagination.page,
            size: serverPagination.size,
            keyword: serverFilters.keyword,
            enabled: serverFilters.enabled
        });
        serverList.value = pageData.records;
        serverPagination.total = pageData.total;
    }
    finally {
        serverLoading.value = false;
    }
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
const refreshAll = async () => {
    await loadBaseOptions();
    await Promise.all([loadServers(), loadBindings()]);
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
const handleServerSearch = async () => {
    serverPagination.page = 1;
    await loadServers();
};
const handleServerReset = async () => {
    serverFilters.keyword = '';
    serverFilters.enabled = undefined;
    serverPagination.page = 1;
    await loadServers();
};
const handleServerSizeChange = async () => {
    serverPagination.page = 1;
    await loadServers();
};
const handleBindingSearch = async () => {
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
const openServerCreateDialog = () => {
    serverIsEditing.value = false;
    resetServerForm();
    serverDialogVisible.value = true;
};
const openServerEditDialog = (row) => {
    serverIsEditing.value = true;
    currentServerId.value = row.id;
    serverForm.name = row.name;
    serverForm.baseUrl = row.baseUrl;
    serverForm.username = row.username;
    serverForm.apiToken = '';
    serverForm.description = row.description;
    serverForm.enabled = row.enabled;
    serverDialogVisible.value = true;
};
const handleServerSubmit = async () => {
    const valid = await serverFormRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    if (!serverIsEditing.value && !serverForm.apiToken.trim()) {
        ElMessage.warning('新增 Jenkins 服务时必须填写 API Token');
        return;
    }
    serverSubmitting.value = true;
    try {
        const payload = { ...serverForm };
        if (serverIsEditing.value && currentServerId.value !== null) {
            await updateJenkinsServer(currentServerId.value, payload);
            ElMessage.success('Jenkins 服务已更新');
        }
        else {
            await createJenkinsServer(payload);
            ElMessage.success('Jenkins 服务已创建');
        }
        serverDialogVisible.value = false;
        await refreshAll();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存失败');
    }
    finally {
        serverSubmitting.value = false;
    }
};
const handleServerDelete = async (id) => {
    try {
        await ElMessageBox.confirm('删除后不可恢复，确认继续吗？', '提示', { type: 'warning' });
        await deleteJenkinsServer(id);
        ElMessage.success('Jenkins 服务已删除');
        await refreshAll();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
const handleServerTest = async (id) => {
    try {
        const result = await testJenkinsServer(id);
        ElMessage.success(result.lastTestMessage || '连接成功');
        await refreshAll();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '测试连接失败');
        await loadServers();
    }
};
const openJobDrawer = async (row) => {
    currentJobServerId.value = row.id;
    jobDrawerTitle.value = `Jenkins Job 列表 - ${row.name}`;
    jobDrawerVisible.value = true;
    jobLoading.value = true;
    try {
        jobList.value = await listJenkinsJobs(row.id);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载 Job 列表失败');
    }
    finally {
        jobLoading.value = false;
    }
};
const handleTriggerJenkinsJob = async (row) => {
    if (currentJobServerId.value === null)
        return;
    jobTriggeringName.value = row.fullName;
    try {
        const result = await triggerJenkinsJob(currentJobServerId.value, row.fullName || row.name);
        ElMessage.success(result.message);
        jobList.value = await listJenkinsJobs(currentJobServerId.value);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '触发构建失败');
    }
    finally {
        jobTriggeringName.value = '';
    }
};
const openBindingCreateDialog = () => {
    bindingIsEditing.value = false;
    resetBindingForm();
    bindingDialogVisible.value = true;
};
const openBindingEditDialog = (row) => {
    bindingIsEditing.value = true;
    currentBindingId.value = row.id;
    bindingForm.projectId = row.projectId;
    bindingForm.jenkinsServerId = row.jenkinsServerId;
    bindingForm.jobName = row.jobName;
    bindingForm.defaultBranch = row.defaultBranch || '';
    bindingForm.buildParametersJson = row.buildParametersJson || '';
    bindingForm.enabled = row.enabled;
    bindingDialogVisible.value = true;
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
        await refreshAll();
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
    await refreshAll();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['cicd-page']} */ ;
/** @type {__VLS_StyleScopedClasses['cicd-page']} */ ;
/** @type {__VLS_StyleScopedClasses['cicd-page']} */ ;
/** @type {__VLS_StyleScopedClasses['cicd-page']} */ ;
/** @type {__VLS_StyleScopedClasses['cicd-page']} */ ;
/** @type {__VLS_StyleScopedClasses['cicd-page']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-form']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-wrap']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cicd-page" },
});
const __VLS_0 = {}.ElSpace;
/** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    direction: "vertical",
    fill: true,
    size: "20",
    ...{ class: "cicd-page-stack" },
}));
const __VLS_2 = __VLS_1({
    direction: "vertical",
    fill: true,
    size: "20",
    ...{ class: "cicd-page-stack" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_6 = __VLS_5({
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
const __VLS_8 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    label: "Jenkins 服务",
    name: "servers",
}));
const __VLS_10 = __VLS_9({
    label: "Jenkins 服务",
    name: "servers",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ class: "page-card" },
    shadow: "never",
}));
const __VLS_14 = __VLS_13({
    ...{ class: "page-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_15.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.canManage) {
        const __VLS_16 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onClick: (__VLS_ctx.openServerCreateDialog)
        };
        __VLS_19.slots.default;
        var __VLS_19;
    }
}
const __VLS_24 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    inline: (true),
    ...{ class: "filter-form" },
}));
const __VLS_26 = __VLS_25({
    inline: (true),
    ...{ class: "filter-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.serverFilters.keyword),
    clearable: true,
    placeholder: "搜索名称 / 地址 / 用户名",
}));
const __VLS_34 = __VLS_33({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.serverFilters.keyword),
    clearable: true,
    placeholder: "搜索名称 / 地址 / 用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onKeyup: (__VLS_ctx.handleServerSearch)
};
var __VLS_35;
var __VLS_31;
const __VLS_40 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
const __VLS_44 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    modelValue: (__VLS_ctx.serverFilters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
}));
const __VLS_46 = __VLS_45({
    modelValue: (__VLS_ctx.serverFilters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "启用",
    value: (true),
}));
const __VLS_50 = __VLS_49({
    label: "启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
const __VLS_52 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "停用",
    value: (false),
}));
const __VLS_54 = __VLS_53({
    label: "停用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
var __VLS_47;
var __VLS_43;
const __VLS_56 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
const __VLS_60 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_62 = __VLS_61({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
let __VLS_64;
let __VLS_65;
let __VLS_66;
const __VLS_67 = {
    onClick: (__VLS_ctx.handleServerSearch)
};
__VLS_63.slots.default;
var __VLS_63;
const __VLS_68 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    ...{ 'onClick': {} },
}));
const __VLS_70 = __VLS_69({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
let __VLS_72;
let __VLS_73;
let __VLS_74;
const __VLS_75 = {
    onClick: (__VLS_ctx.handleServerReset)
};
__VLS_71.slots.default;
var __VLS_71;
var __VLS_59;
var __VLS_27;
const __VLS_76 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    data: (__VLS_ctx.serverList),
    ...{ style: {} },
}));
const __VLS_78 = __VLS_77({
    data: (__VLS_ctx.serverList),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.serverLoading) }, null, null);
__VLS_79.slots.default;
const __VLS_80 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    prop: "name",
    label: "名称",
    minWidth: "160",
}));
const __VLS_82 = __VLS_81({
    prop: "name",
    label: "名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
const __VLS_84 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    prop: "baseUrl",
    label: "Jenkins 地址",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_86 = __VLS_85({
    prop: "baseUrl",
    label: "Jenkins 地址",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
const __VLS_88 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    prop: "username",
    label: "用户名",
    width: "140",
}));
const __VLS_90 = __VLS_89({
    prop: "username",
    label: "用户名",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
const __VLS_92 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    prop: "lastJobCount",
    label: "任务数",
    width: "90",
}));
const __VLS_94 = __VLS_93({
    prop: "lastJobCount",
    label: "任务数",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
const __VLS_96 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "启用",
    width: "90",
}));
const __VLS_98 = __VLS_97({
    label: "启用",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_99.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_100 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        type: (row.enabled ? 'success' : 'info'),
    }));
    const __VLS_102 = __VLS_101({
        type: (row.enabled ? 'success' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    (row.enabled ? '启用' : '停用');
    var __VLS_103;
}
var __VLS_99;
const __VLS_104 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "测试状态",
    width: "110",
}));
const __VLS_106 = __VLS_105({
    label: "测试状态",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_107.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_108 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        type: (__VLS_ctx.testStatusType(row.lastTestStatus)),
    }));
    const __VLS_110 = __VLS_109({
        type: (__VLS_ctx.testStatusType(row.lastTestStatus)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_111.slots.default;
    (row.lastTestStatus || '未测试');
    var __VLS_111;
}
var __VLS_107;
const __VLS_112 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    prop: "lastTestedAt",
    label: "最近测试时间",
    width: "180",
}));
const __VLS_114 = __VLS_113({
    prop: "lastTestedAt",
    label: "最近测试时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
const __VLS_116 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    prop: "lastTestMessage",
    label: "测试信息",
    minWidth: "280",
    showOverflowTooltip: true,
}));
const __VLS_118 = __VLS_117({
    prop: "lastTestMessage",
    label: "测试信息",
    minWidth: "280",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
if (__VLS_ctx.canManage) {
    const __VLS_120 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
        label: "操作",
        width: "320",
        fixed: "right",
    }));
    const __VLS_122 = __VLS_121({
        label: "操作",
        width: "320",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    __VLS_123.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_123.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_124 = {}.ElSpace;
        /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            wrap: true,
        }));
        const __VLS_126 = __VLS_125({
            wrap: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        const __VLS_128 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }));
        const __VLS_130 = __VLS_129({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        let __VLS_132;
        let __VLS_133;
        let __VLS_134;
        const __VLS_135 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.handleServerTest(row.id);
            }
        };
        __VLS_131.slots.default;
        var __VLS_131;
        const __VLS_136 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_138 = __VLS_137({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        let __VLS_140;
        let __VLS_141;
        let __VLS_142;
        const __VLS_143 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.openJobDrawer(row);
            }
        };
        __VLS_139.slots.default;
        var __VLS_139;
        const __VLS_144 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            ...{ 'onClick': {} },
            link: true,
            type: "warning",
        }));
        const __VLS_146 = __VLS_145({
            ...{ 'onClick': {} },
            link: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        let __VLS_148;
        let __VLS_149;
        let __VLS_150;
        const __VLS_151 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.openServerEditDialog(row);
            }
        };
        __VLS_147.slots.default;
        var __VLS_147;
        const __VLS_152 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_154 = __VLS_153({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        let __VLS_156;
        let __VLS_157;
        let __VLS_158;
        const __VLS_159 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.handleServerDelete(row.id);
            }
        };
        __VLS_155.slots.default;
        var __VLS_155;
        var __VLS_127;
    }
    var __VLS_123;
}
var __VLS_79;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pagination-wrap" },
});
const __VLS_160 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    currentPage: (__VLS_ctx.serverPagination.page),
    pageSize: (__VLS_ctx.serverPagination.size),
    background: true,
    layout: "total, sizes, prev, pager, next, jumper",
    pageSizes: ([5, 10, 20, 50]),
    total: (__VLS_ctx.serverPagination.total),
}));
const __VLS_162 = __VLS_161({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    currentPage: (__VLS_ctx.serverPagination.page),
    pageSize: (__VLS_ctx.serverPagination.size),
    background: true,
    layout: "total, sizes, prev, pager, next, jumper",
    pageSizes: ([5, 10, 20, 50]),
    total: (__VLS_ctx.serverPagination.total),
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
let __VLS_164;
let __VLS_165;
let __VLS_166;
const __VLS_167 = {
    onCurrentChange: (__VLS_ctx.loadServers)
};
const __VLS_168 = {
    onSizeChange: (__VLS_ctx.handleServerSizeChange)
};
var __VLS_163;
var __VLS_15;
var __VLS_11;
const __VLS_169 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
    label: "项目流水线",
    name: "pipelines",
}));
const __VLS_171 = __VLS_170({
    label: "项目流水线",
    name: "pipelines",
}, ...__VLS_functionalComponentArgsRest(__VLS_170));
__VLS_172.slots.default;
const __VLS_173 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
    ...{ class: "page-card" },
    shadow: "never",
}));
const __VLS_175 = __VLS_174({
    ...{ class: "page-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_174));
__VLS_176.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_176.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.canManage) {
        const __VLS_177 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_179 = __VLS_178({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_178));
        let __VLS_181;
        let __VLS_182;
        let __VLS_183;
        const __VLS_184 = {
            onClick: (__VLS_ctx.openBindingCreateDialog)
        };
        __VLS_180.slots.default;
        var __VLS_180;
    }
}
const __VLS_185 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
    inline: (true),
    ...{ class: "filter-form" },
}));
const __VLS_187 = __VLS_186({
    inline: (true),
    ...{ class: "filter-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_186));
__VLS_188.slots.default;
const __VLS_189 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({}));
const __VLS_191 = __VLS_190({}, ...__VLS_functionalComponentArgsRest(__VLS_190));
__VLS_192.slots.default;
const __VLS_193 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.bindingFilters.keyword),
    clearable: true,
    placeholder: "搜索项目 / Jenkins / Job / 分支",
}));
const __VLS_195 = __VLS_194({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.bindingFilters.keyword),
    clearable: true,
    placeholder: "搜索项目 / Jenkins / Job / 分支",
}, ...__VLS_functionalComponentArgsRest(__VLS_194));
let __VLS_197;
let __VLS_198;
let __VLS_199;
const __VLS_200 = {
    onKeyup: (__VLS_ctx.handleBindingSearch)
};
var __VLS_196;
var __VLS_192;
const __VLS_201 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({}));
const __VLS_203 = __VLS_202({}, ...__VLS_functionalComponentArgsRest(__VLS_202));
__VLS_204.slots.default;
const __VLS_205 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
    modelValue: (__VLS_ctx.bindingFilters.serverId),
    clearable: true,
    placeholder: "Jenkins 服务",
    ...{ style: {} },
}));
const __VLS_207 = __VLS_206({
    modelValue: (__VLS_ctx.bindingFilters.serverId),
    clearable: true,
    placeholder: "Jenkins 服务",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_206));
__VLS_208.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.serverOptions))) {
    const __VLS_209 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_211 = __VLS_210({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_210));
}
var __VLS_208;
var __VLS_204;
const __VLS_213 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({}));
const __VLS_215 = __VLS_214({}, ...__VLS_functionalComponentArgsRest(__VLS_214));
__VLS_216.slots.default;
const __VLS_217 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
    modelValue: (__VLS_ctx.bindingFilters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
}));
const __VLS_219 = __VLS_218({
    modelValue: (__VLS_ctx.bindingFilters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_218));
__VLS_220.slots.default;
const __VLS_221 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
    label: "启用",
    value: (true),
}));
const __VLS_223 = __VLS_222({
    label: "启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_222));
const __VLS_225 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
    label: "停用",
    value: (false),
}));
const __VLS_227 = __VLS_226({
    label: "停用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_226));
var __VLS_220;
var __VLS_216;
const __VLS_229 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({}));
const __VLS_231 = __VLS_230({}, ...__VLS_functionalComponentArgsRest(__VLS_230));
__VLS_232.slots.default;
const __VLS_233 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_235 = __VLS_234({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_234));
let __VLS_237;
let __VLS_238;
let __VLS_239;
const __VLS_240 = {
    onClick: (__VLS_ctx.handleBindingSearch)
};
__VLS_236.slots.default;
var __VLS_236;
const __VLS_241 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
    ...{ 'onClick': {} },
}));
const __VLS_243 = __VLS_242({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_242));
let __VLS_245;
let __VLS_246;
let __VLS_247;
const __VLS_248 = {
    onClick: (__VLS_ctx.handleBindingReset)
};
__VLS_244.slots.default;
var __VLS_244;
var __VLS_232;
var __VLS_188;
const __VLS_249 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({
    data: (__VLS_ctx.bindingList),
    ...{ style: {} },
}));
const __VLS_251 = __VLS_250({
    data: (__VLS_ctx.bindingList),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_250));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.bindingLoading) }, null, null);
__VLS_252.slots.default;
const __VLS_253 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
    prop: "projectName",
    label: "项目",
    minWidth: "160",
}));
const __VLS_255 = __VLS_254({
    prop: "projectName",
    label: "项目",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_254));
const __VLS_257 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
    prop: "jenkinsServerName",
    label: "Jenkins 服务",
    minWidth: "160",
}));
const __VLS_259 = __VLS_258({
    prop: "jenkinsServerName",
    label: "Jenkins 服务",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_258));
const __VLS_261 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
    label: "构建任务",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_263 = __VLS_262({
    label: "构建任务",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_262));
__VLS_264.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_264.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.jobUrl) {
        const __VLS_265 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
            href: (row.jobUrl),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_267 = __VLS_266({
            href: (row.jobUrl),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_266));
        __VLS_268.slots.default;
        (row.jobName);
        var __VLS_268;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (row.jobName);
    }
}
var __VLS_264;
const __VLS_269 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
    prop: "defaultBranch",
    label: "默认分支",
    width: "140",
}));
const __VLS_271 = __VLS_270({
    prop: "defaultBranch",
    label: "默认分支",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_270));
const __VLS_273 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_274 = __VLS_asFunctionalComponent(__VLS_273, new __VLS_273({
    label: "启用",
    width: "90",
}));
const __VLS_275 = __VLS_274({
    label: "启用",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_274));
__VLS_276.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_276.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_277 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({
        type: (row.enabled ? 'success' : 'info'),
    }));
    const __VLS_279 = __VLS_278({
        type: (row.enabled ? 'success' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_278));
    __VLS_280.slots.default;
    (row.enabled ? '启用' : '停用');
    var __VLS_280;
}
var __VLS_276;
const __VLS_281 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({
    label: "最近触发状态",
    width: "120",
}));
const __VLS_283 = __VLS_282({
    label: "最近触发状态",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_282));
__VLS_284.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_284.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_285 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
        type: (__VLS_ctx.triggerStatusType(row.lastTriggerStatus)),
    }));
    const __VLS_287 = __VLS_286({
        type: (__VLS_ctx.triggerStatusType(row.lastTriggerStatus)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_286));
    __VLS_288.slots.default;
    (__VLS_ctx.formatTriggerStatus(row.lastTriggerStatus));
    var __VLS_288;
}
var __VLS_284;
const __VLS_289 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_290 = __VLS_asFunctionalComponent(__VLS_289, new __VLS_289({
    prop: "lastTriggeredAt",
    label: "最近触发时间",
    width: "180",
}));
const __VLS_291 = __VLS_290({
    prop: "lastTriggeredAt",
    label: "最近触发时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_290));
const __VLS_293 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
    prop: "lastTriggerMessage",
    label: "最近结果",
    minWidth: "260",
    showOverflowTooltip: true,
}));
const __VLS_295 = __VLS_294({
    prop: "lastTriggerMessage",
    label: "最近结果",
    minWidth: "260",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_294));
if (__VLS_ctx.canView) {
    const __VLS_297 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_298 = __VLS_asFunctionalComponent(__VLS_297, new __VLS_297({
        label: "操作",
        width: "380",
        fixed: "right",
    }));
    const __VLS_299 = __VLS_298({
        label: "操作",
        width: "380",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_298));
    __VLS_300.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_300.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_301 = {}.ElSpace;
        /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
        // @ts-ignore
        const __VLS_302 = __VLS_asFunctionalComponent(__VLS_301, new __VLS_301({
            wrap: true,
        }));
        const __VLS_303 = __VLS_302({
            wrap: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_302));
        __VLS_304.slots.default;
        const __VLS_305 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_306 = __VLS_asFunctionalComponent(__VLS_305, new __VLS_305({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_307 = __VLS_306({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_306));
        let __VLS_309;
        let __VLS_310;
        let __VLS_311;
        const __VLS_312 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.canView))
                    return;
                __VLS_ctx.openBuildHistoryDrawer(row);
            }
        };
        __VLS_308.slots.default;
        var __VLS_308;
        if (__VLS_ctx.canManage) {
            const __VLS_313 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_314 = __VLS_asFunctionalComponent(__VLS_313, new __VLS_313({
                ...{ 'onClick': {} },
                link: true,
                type: "success",
            }));
            const __VLS_315 = __VLS_314({
                ...{ 'onClick': {} },
                link: true,
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_314));
            let __VLS_317;
            let __VLS_318;
            let __VLS_319;
            const __VLS_320 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canView))
                        return;
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.handleTriggerBuild(row.id);
                }
            };
            __VLS_316.slots.default;
            var __VLS_316;
        }
        if (__VLS_ctx.canManage) {
            const __VLS_321 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_322 = __VLS_asFunctionalComponent(__VLS_321, new __VLS_321({
                ...{ 'onClick': {} },
                link: true,
                type: "warning",
            }));
            const __VLS_323 = __VLS_322({
                ...{ 'onClick': {} },
                link: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_322));
            let __VLS_325;
            let __VLS_326;
            let __VLS_327;
            const __VLS_328 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canView))
                        return;
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.openBindingEditDialog(row);
                }
            };
            __VLS_324.slots.default;
            var __VLS_324;
        }
        if (__VLS_ctx.canManage) {
            const __VLS_329 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_330 = __VLS_asFunctionalComponent(__VLS_329, new __VLS_329({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_331 = __VLS_330({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_330));
            let __VLS_333;
            let __VLS_334;
            let __VLS_335;
            const __VLS_336 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canView))
                        return;
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.handleBindingDelete(row.id);
                }
            };
            __VLS_332.slots.default;
            var __VLS_332;
        }
        var __VLS_304;
    }
    var __VLS_300;
}
var __VLS_252;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pagination-wrap" },
});
const __VLS_337 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_338 = __VLS_asFunctionalComponent(__VLS_337, new __VLS_337({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    currentPage: (__VLS_ctx.bindingPagination.page),
    pageSize: (__VLS_ctx.bindingPagination.size),
    background: true,
    layout: "total, sizes, prev, pager, next, jumper",
    pageSizes: ([5, 10, 20, 50]),
    total: (__VLS_ctx.bindingPagination.total),
}));
const __VLS_339 = __VLS_338({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    currentPage: (__VLS_ctx.bindingPagination.page),
    pageSize: (__VLS_ctx.bindingPagination.size),
    background: true,
    layout: "total, sizes, prev, pager, next, jumper",
    pageSizes: ([5, 10, 20, 50]),
    total: (__VLS_ctx.bindingPagination.total),
}, ...__VLS_functionalComponentArgsRest(__VLS_338));
let __VLS_341;
let __VLS_342;
let __VLS_343;
const __VLS_344 = {
    onCurrentChange: (__VLS_ctx.loadBindings)
};
const __VLS_345 = {
    onSizeChange: (__VLS_ctx.handleBindingSizeChange)
};
var __VLS_340;
var __VLS_176;
var __VLS_172;
var __VLS_7;
var __VLS_3;
const __VLS_346 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
    modelValue: (__VLS_ctx.serverDialogVisible),
    title: (__VLS_ctx.serverIsEditing ? '编辑 Jenkins 服务' : '新增 Jenkins 服务'),
    width: "640px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_348 = __VLS_347({
    modelValue: (__VLS_ctx.serverDialogVisible),
    title: (__VLS_ctx.serverIsEditing ? '编辑 Jenkins 服务' : '新增 Jenkins 服务'),
    width: "640px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_347));
__VLS_349.slots.default;
const __VLS_350 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({
    ref: "serverFormRef",
    model: (__VLS_ctx.serverForm),
    rules: (__VLS_ctx.serverRules),
    labelWidth: "110px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_352 = __VLS_351({
    ref: "serverFormRef",
    model: (__VLS_ctx.serverForm),
    rules: (__VLS_ctx.serverRules),
    labelWidth: "110px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_351));
/** @type {typeof __VLS_ctx.serverFormRef} */ ;
var __VLS_354 = {};
__VLS_353.slots.default;
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
const __VLS_356 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
    label: "名称",
    prop: "name",
}));
const __VLS_358 = __VLS_357({
    label: "名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_357));
__VLS_359.slots.default;
const __VLS_360 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
    modelValue: (__VLS_ctx.serverForm.name),
    placeholder: "例如：测试环境 Jenkins",
}));
const __VLS_362 = __VLS_361({
    modelValue: (__VLS_ctx.serverForm.name),
    placeholder: "例如：测试环境 Jenkins",
}, ...__VLS_functionalComponentArgsRest(__VLS_361));
var __VLS_359;
const __VLS_364 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
    label: "Jenkins 地址",
    prop: "baseUrl",
}));
const __VLS_366 = __VLS_365({
    label: "Jenkins 地址",
    prop: "baseUrl",
}, ...__VLS_functionalComponentArgsRest(__VLS_365));
__VLS_367.slots.default;
const __VLS_368 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
    modelValue: (__VLS_ctx.serverForm.baseUrl),
    placeholder: "例如：http://jenkins.example.com",
}));
const __VLS_370 = __VLS_369({
    modelValue: (__VLS_ctx.serverForm.baseUrl),
    placeholder: "例如：http://jenkins.example.com",
}, ...__VLS_functionalComponentArgsRest(__VLS_369));
var __VLS_367;
const __VLS_372 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
    label: "用户名",
    prop: "username",
}));
const __VLS_374 = __VLS_373({
    label: "用户名",
    prop: "username",
}, ...__VLS_functionalComponentArgsRest(__VLS_373));
__VLS_375.slots.default;
const __VLS_376 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
    modelValue: (__VLS_ctx.serverForm.username),
    placeholder: "请输入 Jenkins 用户名",
}));
const __VLS_378 = __VLS_377({
    modelValue: (__VLS_ctx.serverForm.username),
    placeholder: "请输入 Jenkins 用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_377));
var __VLS_375;
const __VLS_380 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
    label: "API 令牌",
}));
const __VLS_382 = __VLS_381({
    label: "API 令牌",
}, ...__VLS_functionalComponentArgsRest(__VLS_381));
__VLS_383.slots.default;
const __VLS_384 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
    modelValue: (__VLS_ctx.serverForm.apiToken),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.serverIsEditing ? '留空则保留原令牌' : '请输入 API 令牌'),
}));
const __VLS_386 = __VLS_385({
    modelValue: (__VLS_ctx.serverForm.apiToken),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.serverIsEditing ? '留空则保留原令牌' : '请输入 API 令牌'),
}, ...__VLS_functionalComponentArgsRest(__VLS_385));
var __VLS_383;
const __VLS_388 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
    label: "描述",
}));
const __VLS_390 = __VLS_389({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_389));
__VLS_391.slots.default;
const __VLS_392 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
    modelValue: (__VLS_ctx.serverForm.description),
    type: "textarea",
    rows: (3),
    placeholder: "可填写用途、环境说明等",
}));
const __VLS_394 = __VLS_393({
    modelValue: (__VLS_ctx.serverForm.description),
    type: "textarea",
    rows: (3),
    placeholder: "可填写用途、环境说明等",
}, ...__VLS_functionalComponentArgsRest(__VLS_393));
var __VLS_391;
const __VLS_396 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
    label: "启用",
}));
const __VLS_398 = __VLS_397({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_397));
__VLS_399.slots.default;
const __VLS_400 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
    modelValue: (__VLS_ctx.serverForm.enabled),
}));
const __VLS_402 = __VLS_401({
    modelValue: (__VLS_ctx.serverForm.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_401));
var __VLS_399;
var __VLS_353;
{
    const { footer: __VLS_thisSlot } = __VLS_349.slots;
    const __VLS_404 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_405 = __VLS_asFunctionalComponent(__VLS_404, new __VLS_404({
        ...{ 'onClick': {} },
    }));
    const __VLS_406 = __VLS_405({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_405));
    let __VLS_408;
    let __VLS_409;
    let __VLS_410;
    const __VLS_411 = {
        onClick: (...[$event]) => {
            __VLS_ctx.serverDialogVisible = false;
        }
    };
    __VLS_407.slots.default;
    var __VLS_407;
    const __VLS_412 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_413 = __VLS_asFunctionalComponent(__VLS_412, new __VLS_412({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.serverSubmitting),
    }));
    const __VLS_414 = __VLS_413({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.serverSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_413));
    let __VLS_416;
    let __VLS_417;
    let __VLS_418;
    const __VLS_419 = {
        onClick: (__VLS_ctx.handleServerSubmit)
    };
    __VLS_415.slots.default;
    var __VLS_415;
}
var __VLS_349;
const __VLS_420 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
    modelValue: (__VLS_ctx.bindingDialogVisible),
    title: (__VLS_ctx.bindingIsEditing ? '编辑流水线绑定' : '新增流水线绑定'),
    width: "720px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_422 = __VLS_421({
    modelValue: (__VLS_ctx.bindingDialogVisible),
    title: (__VLS_ctx.bindingIsEditing ? '编辑流水线绑定' : '新增流水线绑定'),
    width: "720px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_421));
__VLS_423.slots.default;
const __VLS_424 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
    ref: "bindingFormRef",
    model: (__VLS_ctx.bindingForm),
    rules: (__VLS_ctx.bindingRules),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_426 = __VLS_425({
    ref: "bindingFormRef",
    model: (__VLS_ctx.bindingForm),
    rules: (__VLS_ctx.bindingRules),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_425));
/** @type {typeof __VLS_ctx.bindingFormRef} */ ;
var __VLS_428 = {};
__VLS_427.slots.default;
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
const __VLS_430 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_431 = __VLS_asFunctionalComponent(__VLS_430, new __VLS_430({
    label: "平台项目",
    prop: "projectId",
}));
const __VLS_432 = __VLS_431({
    label: "平台项目",
    prop: "projectId",
}, ...__VLS_functionalComponentArgsRest(__VLS_431));
__VLS_433.slots.default;
const __VLS_434 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_435 = __VLS_asFunctionalComponent(__VLS_434, new __VLS_434({
    modelValue: (__VLS_ctx.bindingForm.projectId),
    placeholder: "请选择项目",
    ...{ style: {} },
}));
const __VLS_436 = __VLS_435({
    modelValue: (__VLS_ctx.bindingForm.projectId),
    placeholder: "请选择项目",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_435));
__VLS_437.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_438 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_439 = __VLS_asFunctionalComponent(__VLS_438, new __VLS_438({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_440 = __VLS_439({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_439));
}
var __VLS_437;
var __VLS_433;
const __VLS_442 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_443 = __VLS_asFunctionalComponent(__VLS_442, new __VLS_442({
    label: "Jenkins 服务",
    prop: "jenkinsServerId",
}));
const __VLS_444 = __VLS_443({
    label: "Jenkins 服务",
    prop: "jenkinsServerId",
}, ...__VLS_functionalComponentArgsRest(__VLS_443));
__VLS_445.slots.default;
const __VLS_446 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_447 = __VLS_asFunctionalComponent(__VLS_446, new __VLS_446({
    modelValue: (__VLS_ctx.bindingForm.jenkinsServerId),
    placeholder: "请选择 Jenkins 服务",
    ...{ style: {} },
}));
const __VLS_448 = __VLS_447({
    modelValue: (__VLS_ctx.bindingForm.jenkinsServerId),
    placeholder: "请选择 Jenkins 服务",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_447));
__VLS_449.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.serverOptions))) {
    const __VLS_450 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_451 = __VLS_asFunctionalComponent(__VLS_450, new __VLS_450({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_452 = __VLS_451({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_451));
}
var __VLS_449;
var __VLS_445;
const __VLS_454 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_455 = __VLS_asFunctionalComponent(__VLS_454, new __VLS_454({
    label: "任务名称",
    prop: "jobName",
}));
const __VLS_456 = __VLS_455({
    label: "任务名称",
    prop: "jobName",
}, ...__VLS_functionalComponentArgsRest(__VLS_455));
__VLS_457.slots.default;
const __VLS_458 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_459 = __VLS_asFunctionalComponent(__VLS_458, new __VLS_458({
    modelValue: (__VLS_ctx.bindingForm.jobName),
    placeholder: "支持 folder/job 形式，例如：backend/build",
}));
const __VLS_460 = __VLS_459({
    modelValue: (__VLS_ctx.bindingForm.jobName),
    placeholder: "支持 folder/job 形式，例如：backend/build",
}, ...__VLS_functionalComponentArgsRest(__VLS_459));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
var __VLS_457;
const __VLS_462 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_463 = __VLS_asFunctionalComponent(__VLS_462, new __VLS_462({
    label: "默认分支",
}));
const __VLS_464 = __VLS_463({
    label: "默认分支",
}, ...__VLS_functionalComponentArgsRest(__VLS_463));
__VLS_465.slots.default;
const __VLS_466 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_467 = __VLS_asFunctionalComponent(__VLS_466, new __VLS_466({
    modelValue: (__VLS_ctx.bindingForm.defaultBranch),
    placeholder: "例如：main",
}));
const __VLS_468 = __VLS_467({
    modelValue: (__VLS_ctx.bindingForm.defaultBranch),
    placeholder: "例如：main",
}, ...__VLS_functionalComponentArgsRest(__VLS_467));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
(__VLS_ctx.bindingForm.defaultBranch || '你的默认分支');
var __VLS_465;
const __VLS_470 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_471 = __VLS_asFunctionalComponent(__VLS_470, new __VLS_470({
    label: "构建参数 JSON",
}));
const __VLS_472 = __VLS_471({
    label: "构建参数 JSON",
}, ...__VLS_functionalComponentArgsRest(__VLS_471));
__VLS_473.slots.default;
const __VLS_474 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_475 = __VLS_asFunctionalComponent(__VLS_474, new __VLS_474({
    modelValue: (__VLS_ctx.bindingForm.buildParametersJson),
    type: "textarea",
    rows: (6),
    placeholder: '例如：{"env":"test","branch":"main"}',
}));
const __VLS_476 = __VLS_475({
    modelValue: (__VLS_ctx.bindingForm.buildParametersJson),
    type: "textarea",
    rows: (6),
    placeholder: '例如：{"env":"test","branch":"main"}',
}, ...__VLS_functionalComponentArgsRest(__VLS_475));
var __VLS_473;
const __VLS_478 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_479 = __VLS_asFunctionalComponent(__VLS_478, new __VLS_478({
    label: "启用",
}));
const __VLS_480 = __VLS_479({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_479));
__VLS_481.slots.default;
const __VLS_482 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_483 = __VLS_asFunctionalComponent(__VLS_482, new __VLS_482({
    modelValue: (__VLS_ctx.bindingForm.enabled),
}));
const __VLS_484 = __VLS_483({
    modelValue: (__VLS_ctx.bindingForm.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_483));
var __VLS_481;
var __VLS_427;
{
    const { footer: __VLS_thisSlot } = __VLS_423.slots;
    const __VLS_486 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_487 = __VLS_asFunctionalComponent(__VLS_486, new __VLS_486({
        ...{ 'onClick': {} },
    }));
    const __VLS_488 = __VLS_487({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_487));
    let __VLS_490;
    let __VLS_491;
    let __VLS_492;
    const __VLS_493 = {
        onClick: (...[$event]) => {
            __VLS_ctx.bindingDialogVisible = false;
        }
    };
    __VLS_489.slots.default;
    var __VLS_489;
    const __VLS_494 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_495 = __VLS_asFunctionalComponent(__VLS_494, new __VLS_494({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.bindingSubmitting),
    }));
    const __VLS_496 = __VLS_495({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.bindingSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_495));
    let __VLS_498;
    let __VLS_499;
    let __VLS_500;
    const __VLS_501 = {
        onClick: (__VLS_ctx.handleBindingSubmit)
    };
    __VLS_497.slots.default;
    var __VLS_497;
}
var __VLS_423;
const __VLS_502 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_503 = __VLS_asFunctionalComponent(__VLS_502, new __VLS_502({
    modelValue: (__VLS_ctx.jobDrawerVisible),
    title: (__VLS_ctx.jobDrawerTitle),
    size: "60%",
}));
const __VLS_504 = __VLS_503({
    modelValue: (__VLS_ctx.jobDrawerVisible),
    title: (__VLS_ctx.jobDrawerTitle),
    size: "60%",
}, ...__VLS_functionalComponentArgsRest(__VLS_503));
__VLS_505.slots.default;
const __VLS_506 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_507 = __VLS_asFunctionalComponent(__VLS_506, new __VLS_506({
    data: (__VLS_ctx.jobList),
    ...{ style: {} },
}));
const __VLS_508 = __VLS_507({
    data: (__VLS_ctx.jobList),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_507));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.jobLoading) }, null, null);
__VLS_509.slots.default;
const __VLS_510 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_511 = __VLS_asFunctionalComponent(__VLS_510, new __VLS_510({
    label: "名称",
    minWidth: "180",
}));
const __VLS_512 = __VLS_511({
    label: "名称",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_511));
__VLS_513.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_513.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.url) {
        const __VLS_514 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_515 = __VLS_asFunctionalComponent(__VLS_514, new __VLS_514({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_516 = __VLS_515({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_515));
        __VLS_517.slots.default;
        (row.name);
        var __VLS_517;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (row.name);
    }
}
var __VLS_513;
const __VLS_518 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_519 = __VLS_asFunctionalComponent(__VLS_518, new __VLS_518({
    prop: "fullName",
    label: "完整名称",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_520 = __VLS_519({
    prop: "fullName",
    label: "完整名称",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_519));
const __VLS_522 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_523 = __VLS_asFunctionalComponent(__VLS_522, new __VLS_522({
    prop: "color",
    label: "状态色",
    width: "110",
}));
const __VLS_524 = __VLS_523({
    prop: "color",
    label: "状态色",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_523));
const __VLS_526 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_527 = __VLS_asFunctionalComponent(__VLS_526, new __VLS_526({
    prop: "lastBuildNumber",
    label: "最近构建号",
    width: "110",
}));
const __VLS_528 = __VLS_527({
    prop: "lastBuildNumber",
    label: "最近构建号",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_527));
const __VLS_530 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_531 = __VLS_asFunctionalComponent(__VLS_530, new __VLS_530({
    prop: "lastBuildResult",
    label: "最近结果",
    width: "120",
}));
const __VLS_532 = __VLS_531({
    prop: "lastBuildResult",
    label: "最近结果",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_531));
const __VLS_534 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_535 = __VLS_asFunctionalComponent(__VLS_534, new __VLS_534({
    prop: "lastBuildAt",
    label: "最近构建时间",
    width: "180",
}));
const __VLS_536 = __VLS_535({
    prop: "lastBuildAt",
    label: "最近构建时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_535));
if (__VLS_ctx.canManage) {
    const __VLS_538 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_539 = __VLS_asFunctionalComponent(__VLS_538, new __VLS_538({
        label: "操作",
        width: "120",
        fixed: "right",
    }));
    const __VLS_540 = __VLS_539({
        label: "操作",
        width: "120",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_539));
    __VLS_541.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_541.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_542 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_543 = __VLS_asFunctionalComponent(__VLS_542, new __VLS_542({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
            loading: (__VLS_ctx.jobTriggeringName === row.fullName),
        }));
        const __VLS_544 = __VLS_543({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
            loading: (__VLS_ctx.jobTriggeringName === row.fullName),
        }, ...__VLS_functionalComponentArgsRest(__VLS_543));
        let __VLS_546;
        let __VLS_547;
        let __VLS_548;
        const __VLS_549 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.handleTriggerJenkinsJob(row);
            }
        };
        __VLS_545.slots.default;
        var __VLS_545;
    }
    var __VLS_541;
}
var __VLS_509;
var __VLS_505;
const __VLS_550 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_551 = __VLS_asFunctionalComponent(__VLS_550, new __VLS_550({
    modelValue: (__VLS_ctx.buildDrawerVisible),
    title: (__VLS_ctx.buildDrawerTitle),
    size: "68%",
}));
const __VLS_552 = __VLS_551({
    modelValue: (__VLS_ctx.buildDrawerVisible),
    title: (__VLS_ctx.buildDrawerTitle),
    size: "68%",
}, ...__VLS_functionalComponentArgsRest(__VLS_551));
__VLS_553.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "build-history-toolbar" },
});
const __VLS_554 = {}.ElSpace;
/** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
// @ts-ignore
const __VLS_555 = __VLS_asFunctionalComponent(__VLS_554, new __VLS_554({
    wrap: true,
}));
const __VLS_556 = __VLS_555({
    wrap: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_555));
__VLS_557.slots.default;
const __VLS_558 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_559 = __VLS_asFunctionalComponent(__VLS_558, new __VLS_558({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.buildHistoryLimit),
    ...{ style: {} },
}));
const __VLS_560 = __VLS_559({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.buildHistoryLimit),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_559));
let __VLS_562;
let __VLS_563;
let __VLS_564;
const __VLS_565 = {
    onChange: (__VLS_ctx.handleBuildHistoryLimitChange)
};
__VLS_561.slots.default;
const __VLS_566 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_567 = __VLS_asFunctionalComponent(__VLS_566, new __VLS_566({
    value: (10),
    label: "最近 10 条",
}));
const __VLS_568 = __VLS_567({
    value: (10),
    label: "最近 10 条",
}, ...__VLS_functionalComponentArgsRest(__VLS_567));
const __VLS_570 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_571 = __VLS_asFunctionalComponent(__VLS_570, new __VLS_570({
    value: (20),
    label: "最近 20 条",
}));
const __VLS_572 = __VLS_571({
    value: (20),
    label: "最近 20 条",
}, ...__VLS_functionalComponentArgsRest(__VLS_571));
const __VLS_574 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_575 = __VLS_asFunctionalComponent(__VLS_574, new __VLS_574({
    value: (50),
    label: "最近 50 条",
}));
const __VLS_576 = __VLS_575({
    value: (50),
    label: "最近 50 条",
}, ...__VLS_functionalComponentArgsRest(__VLS_575));
var __VLS_561;
const __VLS_578 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_579 = __VLS_asFunctionalComponent(__VLS_578, new __VLS_578({
    ...{ 'onClick': {} },
}));
const __VLS_580 = __VLS_579({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_579));
let __VLS_582;
let __VLS_583;
let __VLS_584;
const __VLS_585 = {
    onClick: (__VLS_ctx.reloadBuildHistory)
};
__VLS_581.slots.default;
var __VLS_581;
var __VLS_557;
const __VLS_586 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_587 = __VLS_asFunctionalComponent(__VLS_586, new __VLS_586({
    data: (__VLS_ctx.buildList),
    ...{ style: {} },
}));
const __VLS_588 = __VLS_587({
    data: (__VLS_ctx.buildList),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_587));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.buildLoading) }, null, null);
__VLS_589.slots.default;
const __VLS_590 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_591 = __VLS_asFunctionalComponent(__VLS_590, new __VLS_590({
    prop: "number",
    label: "构建号",
    width: "100",
}));
const __VLS_592 = __VLS_591({
    prop: "number",
    label: "构建号",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_591));
const __VLS_594 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_595 = __VLS_asFunctionalComponent(__VLS_594, new __VLS_594({
    label: "状态",
    width: "120",
}));
const __VLS_596 = __VLS_595({
    label: "状态",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_595));
__VLS_597.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_597.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_598 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_599 = __VLS_asFunctionalComponent(__VLS_598, new __VLS_598({
        type: (__VLS_ctx.buildStatusType(row)),
    }));
    const __VLS_600 = __VLS_599({
        type: (__VLS_ctx.buildStatusType(row)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_599));
    __VLS_601.slots.default;
    (__VLS_ctx.formatBuildStatus(row));
    var __VLS_601;
}
var __VLS_597;
const __VLS_602 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_603 = __VLS_asFunctionalComponent(__VLS_602, new __VLS_602({
    label: "执行中",
    width: "90",
}));
const __VLS_604 = __VLS_603({
    label: "执行中",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_603));
__VLS_605.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_605.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_606 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_607 = __VLS_asFunctionalComponent(__VLS_606, new __VLS_606({
        type: (row.building ? 'warning' : 'info'),
    }));
    const __VLS_608 = __VLS_607({
        type: (row.building ? 'warning' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_607));
    __VLS_609.slots.default;
    (row.building ? '是' : '否');
    var __VLS_609;
}
var __VLS_605;
const __VLS_610 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_611 = __VLS_asFunctionalComponent(__VLS_610, new __VLS_610({
    prop: "executedAt",
    label: "执行时间",
    width: "180",
}));
const __VLS_612 = __VLS_611({
    prop: "executedAt",
    label: "执行时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_611));
const __VLS_614 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_615 = __VLS_asFunctionalComponent(__VLS_614, new __VLS_614({
    prop: "durationText",
    label: "耗时",
    width: "120",
}));
const __VLS_616 = __VLS_615({
    prop: "durationText",
    label: "耗时",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_615));
const __VLS_618 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_619 = __VLS_asFunctionalComponent(__VLS_618, new __VLS_618({
    prop: "description",
    label: "描述",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_620 = __VLS_619({
    prop: "description",
    label: "描述",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_619));
const __VLS_622 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_623 = __VLS_asFunctionalComponent(__VLS_622, new __VLS_622({
    label: "链接",
    width: "90",
}));
const __VLS_624 = __VLS_623({
    label: "链接",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_623));
__VLS_625.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_625.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.url) {
        const __VLS_626 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_627 = __VLS_asFunctionalComponent(__VLS_626, new __VLS_626({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_628 = __VLS_627({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_627));
        __VLS_629.slots.default;
        var __VLS_629;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
var __VLS_625;
const __VLS_630 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_631 = __VLS_asFunctionalComponent(__VLS_630, new __VLS_630({
    label: "操作",
    width: "110",
    fixed: "right",
}));
const __VLS_632 = __VLS_631({
    label: "操作",
    width: "110",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_631));
__VLS_633.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_633.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_634 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_635 = __VLS_asFunctionalComponent(__VLS_634, new __VLS_634({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_636 = __VLS_635({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_635));
    let __VLS_638;
    let __VLS_639;
    let __VLS_640;
    const __VLS_641 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openBuildLog(row);
        }
    };
    __VLS_637.slots.default;
    var __VLS_637;
}
var __VLS_633;
var __VLS_589;
var __VLS_553;
const __VLS_642 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_643 = __VLS_asFunctionalComponent(__VLS_642, new __VLS_642({
    modelValue: (__VLS_ctx.buildLogVisible),
    title: "构建日志详情",
    width: "900px",
}));
const __VLS_644 = __VLS_643({
    modelValue: (__VLS_ctx.buildLogVisible),
    title: "构建日志详情",
    width: "900px",
}, ...__VLS_functionalComponentArgsRest(__VLS_643));
__VLS_645.slots.default;
if (__VLS_ctx.currentBuildLog) {
    const __VLS_646 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_647 = __VLS_asFunctionalComponent(__VLS_646, new __VLS_646({
        column: (2),
        border: true,
    }));
    const __VLS_648 = __VLS_647({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_647));
    __VLS_649.slots.default;
    const __VLS_650 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_651 = __VLS_asFunctionalComponent(__VLS_650, new __VLS_650({
        label: "平台项目",
    }));
    const __VLS_652 = __VLS_651({
        label: "平台项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_651));
    __VLS_653.slots.default;
    (__VLS_ctx.currentBuildLog.projectName);
    var __VLS_653;
    const __VLS_654 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_655 = __VLS_asFunctionalComponent(__VLS_654, new __VLS_654({
        label: "Jenkins 服务",
    }));
    const __VLS_656 = __VLS_655({
        label: "Jenkins 服务",
    }, ...__VLS_functionalComponentArgsRest(__VLS_655));
    __VLS_657.slots.default;
    (__VLS_ctx.currentBuildLog.jenkinsServerName);
    var __VLS_657;
    const __VLS_658 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_659 = __VLS_asFunctionalComponent(__VLS_658, new __VLS_658({
        label: "Job",
    }));
    const __VLS_660 = __VLS_659({
        label: "Job",
    }, ...__VLS_functionalComponentArgsRest(__VLS_659));
    __VLS_661.slots.default;
    (__VLS_ctx.currentBuildLog.jobName);
    var __VLS_661;
    const __VLS_662 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_663 = __VLS_asFunctionalComponent(__VLS_662, new __VLS_662({
        label: "构建号",
    }));
    const __VLS_664 = __VLS_663({
        label: "构建号",
    }, ...__VLS_functionalComponentArgsRest(__VLS_663));
    __VLS_665.slots.default;
    (__VLS_ctx.currentBuildLog.buildNumber);
    var __VLS_665;
    const __VLS_666 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_667 = __VLS_asFunctionalComponent(__VLS_666, new __VLS_666({
        label: "状态",
    }));
    const __VLS_668 = __VLS_667({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_667));
    __VLS_669.slots.default;
    (__VLS_ctx.formatBuildLogStatus(__VLS_ctx.currentBuildLog));
    var __VLS_669;
    const __VLS_670 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_671 = __VLS_asFunctionalComponent(__VLS_670, new __VLS_670({
        label: "执行时间",
    }));
    const __VLS_672 = __VLS_671({
        label: "执行时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_671));
    __VLS_673.slots.default;
    (__VLS_ctx.currentBuildLog.executedAt || '-');
    var __VLS_673;
    const __VLS_674 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_675 = __VLS_asFunctionalComponent(__VLS_674, new __VLS_674({
        label: "耗时",
    }));
    const __VLS_676 = __VLS_675({
        label: "耗时",
    }, ...__VLS_functionalComponentArgsRest(__VLS_675));
    __VLS_677.slots.default;
    (__VLS_ctx.currentBuildLog.durationText || '-');
    var __VLS_677;
    const __VLS_678 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_679 = __VLS_asFunctionalComponent(__VLS_678, new __VLS_678({
        label: "描述",
    }));
    const __VLS_680 = __VLS_679({
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_679));
    __VLS_681.slots.default;
    (__VLS_ctx.currentBuildLog.description || '-');
    var __VLS_681;
    const __VLS_682 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_683 = __VLS_asFunctionalComponent(__VLS_682, new __VLS_682({
        label: "链接",
        span: (2),
    }));
    const __VLS_684 = __VLS_683({
        label: "链接",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_683));
    __VLS_685.slots.default;
    if (__VLS_ctx.currentBuildLog.url) {
        const __VLS_686 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_687 = __VLS_asFunctionalComponent(__VLS_686, new __VLS_686({
            href: (__VLS_ctx.currentBuildLog.url),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_688 = __VLS_687({
            href: (__VLS_ctx.currentBuildLog.url),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_687));
        __VLS_689.slots.default;
        var __VLS_689;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_685;
    var __VLS_649;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "build-log-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "build-log-title" },
});
const __VLS_690 = {}.ElScrollbar;
/** @type {[typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, ]} */ ;
// @ts-ignore
const __VLS_691 = __VLS_asFunctionalComponent(__VLS_690, new __VLS_690({
    maxHeight: "420px",
}));
const __VLS_692 = __VLS_691({
    maxHeight: "420px",
}, ...__VLS_functionalComponentArgsRest(__VLS_691));
__VLS_693.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
    ...{ class: "build-log-content" },
});
(__VLS_ctx.currentBuildLog?.consoleLog || '');
var __VLS_693;
{
    const { footer: __VLS_thisSlot } = __VLS_645.slots;
    const __VLS_694 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_695 = __VLS_asFunctionalComponent(__VLS_694, new __VLS_694({
        ...{ 'onClick': {} },
    }));
    const __VLS_696 = __VLS_695({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_695));
    let __VLS_698;
    let __VLS_699;
    let __VLS_700;
    const __VLS_701 = {
        onClick: (...[$event]) => {
            __VLS_ctx.buildLogVisible = false;
        }
    };
    __VLS_697.slots.default;
    var __VLS_697;
}
var __VLS_645;
/** @type {__VLS_StyleScopedClasses['cicd-page']} */ ;
/** @type {__VLS_StyleScopedClasses['cicd-page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-form']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-form']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
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
var __VLS_355 = __VLS_354, __VLS_429 = __VLS_428;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            canManage: canManage,
            canView: canView,
            activeTab: activeTab,
            projectOptions: projectOptions,
            serverOptions: serverOptions,
            serverLoading: serverLoading,
            serverSubmitting: serverSubmitting,
            serverDialogVisible: serverDialogVisible,
            serverIsEditing: serverIsEditing,
            serverList: serverList,
            serverFormRef: serverFormRef,
            serverPagination: serverPagination,
            serverFilters: serverFilters,
            serverForm: serverForm,
            bindingLoading: bindingLoading,
            bindingSubmitting: bindingSubmitting,
            bindingDialogVisible: bindingDialogVisible,
            bindingIsEditing: bindingIsEditing,
            bindingList: bindingList,
            bindingFormRef: bindingFormRef,
            bindingPagination: bindingPagination,
            bindingFilters: bindingFilters,
            bindingForm: bindingForm,
            jobDrawerVisible: jobDrawerVisible,
            jobDrawerTitle: jobDrawerTitle,
            jobLoading: jobLoading,
            jobList: jobList,
            jobTriggeringName: jobTriggeringName,
            buildDrawerVisible: buildDrawerVisible,
            buildDrawerTitle: buildDrawerTitle,
            buildLoading: buildLoading,
            buildHistoryLimit: buildHistoryLimit,
            buildList: buildList,
            buildLogVisible: buildLogVisible,
            currentBuildLog: currentBuildLog,
            serverRules: serverRules,
            bindingRules: bindingRules,
            testStatusType: testStatusType,
            triggerStatusType: triggerStatusType,
            formatTriggerStatus: formatTriggerStatus,
            buildStatusType: buildStatusType,
            formatBuildStatus: formatBuildStatus,
            formatBuildLogStatus: formatBuildLogStatus,
            loadServers: loadServers,
            loadBindings: loadBindings,
            reloadBuildHistory: reloadBuildHistory,
            handleBuildHistoryLimitChange: handleBuildHistoryLimitChange,
            handleServerSearch: handleServerSearch,
            handleServerReset: handleServerReset,
            handleServerSizeChange: handleServerSizeChange,
            handleBindingSearch: handleBindingSearch,
            handleBindingReset: handleBindingReset,
            handleBindingSizeChange: handleBindingSizeChange,
            openServerCreateDialog: openServerCreateDialog,
            openServerEditDialog: openServerEditDialog,
            handleServerSubmit: handleServerSubmit,
            handleServerDelete: handleServerDelete,
            handleServerTest: handleServerTest,
            openJobDrawer: openJobDrawer,
            handleTriggerJenkinsJob: handleTriggerJenkinsJob,
            openBindingCreateDialog: openBindingCreateDialog,
            openBindingEditDialog: openBindingEditDialog,
            openBuildHistoryDrawer: openBuildHistoryDrawer,
            openBuildLog: openBuildLog,
            handleBindingSubmit: handleBindingSubmit,
            handleBindingDelete: handleBindingDelete,
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
//# sourceMappingURL=CicdView.vue.js.map