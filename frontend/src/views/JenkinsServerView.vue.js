/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Connection, Delete, EditPen, Filter, Plus, Promotion, RefreshRight, Search, Tickets } from '@element-plus/icons-vue';
import { createJenkinsServer, deleteJenkinsServer, listJenkinsJobs, pageJenkinsServers, testJenkinsServer, triggerJenkinsJob, updateJenkinsServer } from '@/api/cicd';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('cicd:manage'));
const serverLoading = ref(false);
const serverSubmitting = ref(false);
const serverDialogVisible = ref(false);
const serverIsEditing = ref(false);
const serverReadonlyMode = ref(false);
const currentServerId = ref(null);
const serverList = ref([]);
const serverFormRef = ref();
const serverPagination = reactive({ page: 1, size: 10, total: 0 });
const serverFilters = reactive({ keyword: '', enabled: undefined });
const serverFilterPopoverVisible = ref(false);
const serverForm = reactive({ name: '', baseUrl: '', username: '', apiToken: '', description: '', enabled: true });
const jobDrawerVisible = ref(false);
const jobDrawerTitle = ref('Jenkins Job 列表');
const jobLoading = ref(false);
const jobList = ref([]);
const currentJobServerId = ref(null);
const jobTriggeringName = ref('');
const serverTotalPages = computed(() => Math.max(1, Math.ceil(serverPagination.total / serverPagination.size) || 1));
const serverDialogTitle = computed(() => {
    if (serverReadonlyMode.value) {
        return '查看 Jenkins 服务';
    }
    return serverIsEditing.value ? '编辑 Jenkins 服务' : '新增 Jenkins 服务';
});
const serverRules = {
    name: [{ required: true, message: '请输入 Jenkins 名称', trigger: 'blur' }],
    baseUrl: [{ required: true, message: '请输入 Jenkins 地址', trigger: 'blur' }],
    username: [{ required: true, message: '请输入 Jenkins 用户名', trigger: 'blur' }]
};
/**
 * 将后端返回的时间串格式化为列表适合展示的短时间。
 */
const formatDateTime = (value) => {
    if (!value)
        return '-';
    return value.replace('T', ' ').slice(0, 16);
};
const formatTestStatus = (status) => {
    if (status === 'SUCCESS')
        return '成功';
    if (status === 'FAILED')
        return '失败';
    return status || '未测试';
};
const testStatusTone = (status) => {
    if (status === 'SUCCESS')
        return 'success';
    if (status === 'FAILED')
        return 'danger';
    return 'neutral';
};
/**
 * 重置服务表单，避免新增和编辑场景相互污染。
 */
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
const handleServerSearch = async () => {
    serverFilterPopoverVisible.value = false;
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
const handleServerPrevPage = async () => {
    if (serverPagination.page <= 1)
        return;
    serverPagination.page -= 1;
    await loadServers();
};
const handleServerNextPage = async () => {
    if (serverPagination.page >= serverTotalPages.value)
        return;
    serverPagination.page += 1;
    await loadServers();
};
const openServerCreateDialog = () => {
    serverReadonlyMode.value = false;
    serverIsEditing.value = false;
    resetServerForm();
    serverDialogVisible.value = true;
};
const fillServerForm = (row) => {
    serverIsEditing.value = true;
    currentServerId.value = row.id;
    serverForm.name = row.name;
    serverForm.baseUrl = row.baseUrl;
    serverForm.username = row.username;
    serverForm.apiToken = '';
    serverForm.description = row.description;
    serverForm.enabled = row.enabled;
};
const openServerDetailDialog = (row) => {
    serverReadonlyMode.value = true;
    fillServerForm(row);
    serverDialogVisible.value = true;
};
const openServerEditDialog = (row) => {
    serverReadonlyMode.value = false;
    fillServerForm(row);
    serverDialogVisible.value = true;
};
/**
 * 统一处理 Jenkins 服务的新增与编辑保存。
 */
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
        await loadServers();
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
        await loadServers();
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
        await loadServers();
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
/**
 * 在任务抽屉中直接触发指定 Job 构建，完成后刷新当前服务的任务列表。
 */
const handleTriggerJenkinsJob = async (row) => {
    if (currentJobServerId.value === null)
        return;
    const jobName = row.fullName || row.name;
    jobTriggeringName.value = jobName;
    try {
        const result = await triggerJenkinsJob(currentJobServerId.value, jobName);
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
onMounted(async () => {
    await loadServers();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['jenkins-col-url']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-user']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-message']} */ ;
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
    ...{ onKeyup: (__VLS_ctx.handleServerSearch) },
    value: (__VLS_ctx.serverFilters.keyword),
    ...{ class: "work-list-search-input" },
    type: "text",
    placeholder: "搜索 Jenkins 名称、地址或用户名...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "work-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.serverFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "work-list-filter-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.serverFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
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
    modelValue: (__VLS_ctx.serverFilters.enabled),
    clearable: true,
    placeholder: "启用状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.serverFilters.enabled),
    clearable: true,
    placeholder: "启用状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "启用",
    value: (true),
}));
const __VLS_26 = __VLS_25({
    label: "启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "停用",
    value: (false),
}));
const __VLS_30 = __VLS_29({
    label: "停用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-filter-actions" },
});
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (__VLS_ctx.handleServerSearch)
};
__VLS_35.slots.default;
var __VLS_35;
const __VLS_40 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onClick': {} },
}));
const __VLS_42 = __VLS_41({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onClick: (__VLS_ctx.handleServerReset)
};
__VLS_43.slots.default;
var __VLS_43;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleServerReset) },
    ...{ class: "work-list-toolbar-button" },
    type: "button",
});
const __VLS_48 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
var __VLS_51;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-toolbar-side" },
});
if (__VLS_ctx.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openServerCreateDialog) },
        ...{ class: "work-list-create-button" },
        type: "button",
    });
    const __VLS_56 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
    const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
    var __VLS_59;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "work-list-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.serverLoading) }, null, null);
if (__VLS_ctx.serverList.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "work-list-table jenkins-list-table mobile-card-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "jenkins-col-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "jenkins-col-url" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "jenkins-col-user" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "center jenkins-col-count" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "center jenkins-col-enabled" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "center jenkins-col-test" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "jenkins-col-time" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "jenkins-col-message" },
    });
    if (__VLS_ctx.canManage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            ...{ class: "right jenkins-col-actions" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [row] of __VLS_getVForSourceType((__VLS_ctx.serverList))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (row.id),
            ...{ class: "work-list-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "jenkins-col-main" },
            'data-label': "服务",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.serverList.length))
                        return;
                    __VLS_ctx.openServerDetailDialog(row);
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
        const __VLS_64 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
        const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        const __VLS_68 = {}.Connection;
        /** @type {[typeof __VLS_components.Connection, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
        const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
        var __VLS_67;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title" },
        });
        (row.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-subtitle" },
        });
        (row.description || '暂无描述');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "jenkins-col-url" },
            'data-label': "Jenkins 地址",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            ...{ class: "management-list-link" },
            href: (row.baseUrl),
            target: "_blank",
            rel: "noreferrer",
        });
        (row.baseUrl);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "jenkins-col-user" },
            'data-label': "用户名",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-text" },
        });
        (row.username);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "center jenkins-col-count" },
            'data-label': "任务数",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill neutral" },
        });
        (row.lastJobCount ?? 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "center jenkins-col-enabled" },
            'data-label': "启用",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (row.enabled ? 'success' : 'neutral') },
        });
        (row.enabled ? '启用' : '停用');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "center jenkins-col-test" },
            'data-label': "测试状态",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (__VLS_ctx.testStatusTone(row.lastTestStatus)) },
        });
        (__VLS_ctx.formatTestStatus(row.lastTestStatus));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "jenkins-col-time" },
            'data-label': "最近测试时间",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-updated" },
        });
        (__VLS_ctx.formatDateTime(row.lastTestedAt));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "jenkins-col-message" },
            'data-label': "测试信息",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
        (row.lastTestMessage || '-');
        if (__VLS_ctx.canManage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                ...{ class: "right jenkins-col-actions" },
                'data-label': "操作",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "management-list-row-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.serverList.length))
                            return;
                        if (!(__VLS_ctx.canManage))
                            return;
                        __VLS_ctx.handleServerTest(row.id);
                    } },
                ...{ class: "management-list-row-button" },
                type: "button",
                title: "测试连接",
            });
            const __VLS_72 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
            const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
            __VLS_75.slots.default;
            const __VLS_76 = {}.Promotion;
            /** @type {[typeof __VLS_components.Promotion, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
            const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
            var __VLS_75;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.serverList.length))
                            return;
                        if (!(__VLS_ctx.canManage))
                            return;
                        __VLS_ctx.openJobDrawer(row);
                    } },
                ...{ class: "management-list-row-button" },
                type: "button",
                title: "查看任务",
            });
            const __VLS_80 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
            const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
            __VLS_83.slots.default;
            const __VLS_84 = {}.Tickets;
            /** @type {[typeof __VLS_components.Tickets, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
            const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
            var __VLS_83;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.serverList.length))
                            return;
                        if (!(__VLS_ctx.canManage))
                            return;
                        __VLS_ctx.openServerEditDialog(row);
                    } },
                ...{ class: "management-list-row-button" },
                type: "button",
                title: "编辑服务",
            });
            const __VLS_88 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
            const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
            __VLS_91.slots.default;
            const __VLS_92 = {}.EditPen;
            /** @type {[typeof __VLS_components.EditPen, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
            const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
            var __VLS_91;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.serverList.length))
                            return;
                        if (!(__VLS_ctx.canManage))
                            return;
                        __VLS_ctx.handleServerDelete(row.id);
                    } },
                ...{ class: "management-list-row-button danger" },
                type: "button",
                title: "删除服务",
            });
            const __VLS_96 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
            const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
            __VLS_99.slots.default;
            const __VLS_100 = {}.Delete;
            /** @type {[typeof __VLS_components.Delete, ]} */ ;
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
            const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
            var __VLS_99;
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-list-empty-state" },
    });
    const __VLS_104 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        description: "当前筛选条件下暂无 Jenkins 服务",
    }));
    const __VLS_106 = __VLS_105({
        description: "当前筛选条件下暂无 Jenkins 服务",
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.serverPagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-page-size work-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_108 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.serverPagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_110 = __VLS_109({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.serverPagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
let __VLS_112;
let __VLS_113;
let __VLS_114;
const __VLS_115 = {
    onChange: (__VLS_ctx.handleServerSizeChange)
};
__VLS_111.slots.default;
const __VLS_116 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    value: (5),
    label: "5",
}));
const __VLS_118 = __VLS_117({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
const __VLS_120 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    value: (10),
    label: "10",
}));
const __VLS_122 = __VLS_121({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
const __VLS_124 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    value: (20),
    label: "20",
}));
const __VLS_126 = __VLS_125({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
const __VLS_128 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    value: (50),
    label: "50",
}));
const __VLS_130 = __VLS_129({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
var __VLS_111;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleServerPrevPage) },
    ...{ class: "work-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.serverPagination.page <= 1),
});
const __VLS_132 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
const __VLS_136 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
var __VLS_135;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "work-list-page-text" },
});
(__VLS_ctx.serverPagination.page);
(__VLS_ctx.serverTotalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleServerNextPage) },
    ...{ class: "work-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.serverPagination.page >= __VLS_ctx.serverTotalPages),
});
const __VLS_140 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({}));
const __VLS_142 = __VLS_141({}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
var __VLS_143;
const __VLS_148 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    modelValue: (__VLS_ctx.serverDialogVisible),
    title: (__VLS_ctx.serverDialogTitle),
    width: "640px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_150 = __VLS_149({
    modelValue: (__VLS_ctx.serverDialogVisible),
    title: (__VLS_ctx.serverDialogTitle),
    width: "640px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
const __VLS_152 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    ref: "serverFormRef",
    model: (__VLS_ctx.serverForm),
    rules: (__VLS_ctx.serverRules),
    disabled: (__VLS_ctx.serverReadonlyMode),
    labelWidth: "110px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_154 = __VLS_153({
    ref: "serverFormRef",
    model: (__VLS_ctx.serverForm),
    rules: (__VLS_ctx.serverRules),
    disabled: (__VLS_ctx.serverReadonlyMode),
    labelWidth: "110px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
/** @type {typeof __VLS_ctx.serverFormRef} */ ;
var __VLS_156 = {};
__VLS_155.slots.default;
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
const __VLS_158 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
    label: "名称",
    prop: "name",
}));
const __VLS_160 = __VLS_159({
    label: "名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_161.slots.default;
const __VLS_162 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
    modelValue: (__VLS_ctx.serverForm.name),
    placeholder: "例如：测试环境 Jenkins",
}));
const __VLS_164 = __VLS_163({
    modelValue: (__VLS_ctx.serverForm.name),
    placeholder: "例如：测试环境 Jenkins",
}, ...__VLS_functionalComponentArgsRest(__VLS_163));
var __VLS_161;
const __VLS_166 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_167 = __VLS_asFunctionalComponent(__VLS_166, new __VLS_166({
    label: "Jenkins 地址",
    prop: "baseUrl",
}));
const __VLS_168 = __VLS_167({
    label: "Jenkins 地址",
    prop: "baseUrl",
}, ...__VLS_functionalComponentArgsRest(__VLS_167));
__VLS_169.slots.default;
const __VLS_170 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    modelValue: (__VLS_ctx.serverForm.baseUrl),
    placeholder: "例如：http://jenkins.example.com",
}));
const __VLS_172 = __VLS_171({
    modelValue: (__VLS_ctx.serverForm.baseUrl),
    placeholder: "例如：http://jenkins.example.com",
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
var __VLS_169;
const __VLS_174 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
    label: "用户名",
    prop: "username",
}));
const __VLS_176 = __VLS_175({
    label: "用户名",
    prop: "username",
}, ...__VLS_functionalComponentArgsRest(__VLS_175));
__VLS_177.slots.default;
const __VLS_178 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
    modelValue: (__VLS_ctx.serverForm.username),
    placeholder: "请输入 Jenkins 用户名",
}));
const __VLS_180 = __VLS_179({
    modelValue: (__VLS_ctx.serverForm.username),
    placeholder: "请输入 Jenkins 用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_179));
var __VLS_177;
const __VLS_182 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
    label: "API 令牌",
}));
const __VLS_184 = __VLS_183({
    label: "API 令牌",
}, ...__VLS_functionalComponentArgsRest(__VLS_183));
__VLS_185.slots.default;
const __VLS_186 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    modelValue: (__VLS_ctx.serverForm.apiToken),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.serverIsEditing ? '留空则保留原令牌' : '请输入 API 令牌'),
}));
const __VLS_188 = __VLS_187({
    modelValue: (__VLS_ctx.serverForm.apiToken),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.serverIsEditing ? '留空则保留原令牌' : '请输入 API 令牌'),
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
var __VLS_185;
const __VLS_190 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
    label: "描述",
}));
const __VLS_192 = __VLS_191({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_191));
__VLS_193.slots.default;
const __VLS_194 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    modelValue: (__VLS_ctx.serverForm.description),
    type: "textarea",
    rows: (3),
    placeholder: "可填写用途、环境说明等",
}));
const __VLS_196 = __VLS_195({
    modelValue: (__VLS_ctx.serverForm.description),
    type: "textarea",
    rows: (3),
    placeholder: "可填写用途、环境说明等",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
var __VLS_193;
const __VLS_198 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    label: "启用",
}));
const __VLS_200 = __VLS_199({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_201.slots.default;
const __VLS_202 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    modelValue: (__VLS_ctx.serverForm.enabled),
}));
const __VLS_204 = __VLS_203({
    modelValue: (__VLS_ctx.serverForm.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
var __VLS_201;
var __VLS_155;
{
    const { footer: __VLS_thisSlot } = __VLS_151.slots;
    const __VLS_206 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
        ...{ 'onClick': {} },
    }));
    const __VLS_208 = __VLS_207({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_207));
    let __VLS_210;
    let __VLS_211;
    let __VLS_212;
    const __VLS_213 = {
        onClick: (...[$event]) => {
            __VLS_ctx.serverDialogVisible = false;
        }
    };
    __VLS_209.slots.default;
    (__VLS_ctx.serverReadonlyMode ? '关闭' : '取消');
    var __VLS_209;
    if (!__VLS_ctx.serverReadonlyMode) {
        const __VLS_214 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.serverSubmitting),
        }));
        const __VLS_216 = __VLS_215({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.serverSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_215));
        let __VLS_218;
        let __VLS_219;
        let __VLS_220;
        const __VLS_221 = {
            onClick: (__VLS_ctx.handleServerSubmit)
        };
        __VLS_217.slots.default;
        var __VLS_217;
    }
}
var __VLS_151;
const __VLS_222 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    modelValue: (__VLS_ctx.jobDrawerVisible),
    title: (__VLS_ctx.jobDrawerTitle),
    size: "60%",
}));
const __VLS_224 = __VLS_223({
    modelValue: (__VLS_ctx.jobDrawerVisible),
    title: (__VLS_ctx.jobDrawerTitle),
    size: "60%",
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
__VLS_225.slots.default;
const __VLS_226 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
    data: (__VLS_ctx.jobList),
    ...{ style: {} },
}));
const __VLS_228 = __VLS_227({
    data: (__VLS_ctx.jobList),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_227));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.jobLoading) }, null, null);
__VLS_229.slots.default;
const __VLS_230 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
    label: "名称",
    minWidth: "180",
}));
const __VLS_232 = __VLS_231({
    label: "名称",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_231));
__VLS_233.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_233.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.url) {
        const __VLS_234 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_236 = __VLS_235({
            href: (row.url),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_235));
        __VLS_237.slots.default;
        (row.name);
        var __VLS_237;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (row.name);
    }
}
var __VLS_233;
const __VLS_238 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
    prop: "fullName",
    label: "完整名称",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_240 = __VLS_239({
    prop: "fullName",
    label: "完整名称",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_239));
const __VLS_242 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
    prop: "color",
    label: "状态色",
    width: "110",
}));
const __VLS_244 = __VLS_243({
    prop: "color",
    label: "状态色",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_243));
const __VLS_246 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
    prop: "lastBuildNumber",
    label: "最近构建号",
    width: "110",
}));
const __VLS_248 = __VLS_247({
    prop: "lastBuildNumber",
    label: "最近构建号",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
const __VLS_250 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
    prop: "lastBuildResult",
    label: "最近结果",
    width: "120",
}));
const __VLS_252 = __VLS_251({
    prop: "lastBuildResult",
    label: "最近结果",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
const __VLS_254 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_255 = __VLS_asFunctionalComponent(__VLS_254, new __VLS_254({
    prop: "lastBuildAt",
    label: "最近构建时间",
    width: "180",
}));
const __VLS_256 = __VLS_255({
    prop: "lastBuildAt",
    label: "最近构建时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_255));
if (__VLS_ctx.canManage) {
    const __VLS_258 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
        label: "操作",
        width: "120",
        fixed: "right",
    }));
    const __VLS_260 = __VLS_259({
        label: "操作",
        width: "120",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_259));
    __VLS_261.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_261.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_262 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
            loading: (__VLS_ctx.jobTriggeringName === (row.fullName || row.name)),
        }));
        const __VLS_264 = __VLS_263({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
            loading: (__VLS_ctx.jobTriggeringName === (row.fullName || row.name)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_263));
        let __VLS_266;
        let __VLS_267;
        let __VLS_268;
        const __VLS_269 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.canManage))
                    return;
                __VLS_ctx.handleTriggerJenkinsJob(row);
            }
        };
        __VLS_265.slots.default;
        var __VLS_265;
    }
    var __VLS_261;
}
var __VLS_229;
var __VLS_225;
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
/** @type {__VLS_StyleScopedClasses['work-list-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-url']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-user']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-count']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-test']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-time']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-message']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['work-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-url']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-user']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-count']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-test']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-time']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-message']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['jenkins-col-actions']} */ ;
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
// @ts-ignore
var __VLS_157 = __VLS_156;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Connection: Connection,
            Delete: Delete,
            EditPen: EditPen,
            Filter: Filter,
            Plus: Plus,
            Promotion: Promotion,
            RefreshRight: RefreshRight,
            Search: Search,
            Tickets: Tickets,
            canManage: canManage,
            serverLoading: serverLoading,
            serverSubmitting: serverSubmitting,
            serverDialogVisible: serverDialogVisible,
            serverIsEditing: serverIsEditing,
            serverReadonlyMode: serverReadonlyMode,
            serverList: serverList,
            serverFormRef: serverFormRef,
            serverPagination: serverPagination,
            serverFilters: serverFilters,
            serverFilterPopoverVisible: serverFilterPopoverVisible,
            serverForm: serverForm,
            jobDrawerVisible: jobDrawerVisible,
            jobDrawerTitle: jobDrawerTitle,
            jobLoading: jobLoading,
            jobList: jobList,
            jobTriggeringName: jobTriggeringName,
            serverTotalPages: serverTotalPages,
            serverDialogTitle: serverDialogTitle,
            serverRules: serverRules,
            formatDateTime: formatDateTime,
            formatTestStatus: formatTestStatus,
            testStatusTone: testStatusTone,
            handleServerSearch: handleServerSearch,
            handleServerReset: handleServerReset,
            handleServerSizeChange: handleServerSizeChange,
            handleServerPrevPage: handleServerPrevPage,
            handleServerNextPage: handleServerNextPage,
            openServerCreateDialog: openServerCreateDialog,
            openServerDetailDialog: openServerDetailDialog,
            openServerEditDialog: openServerEditDialog,
            handleServerSubmit: handleServerSubmit,
            handleServerDelete: handleServerDelete,
            handleServerTest: handleServerTest,
            openJobDrawer: openJobDrawer,
            handleTriggerJenkinsJob: handleTriggerJenkinsJob,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=JenkinsServerView.vue.js.map