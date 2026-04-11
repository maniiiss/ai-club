/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Connection, Delete, EditPen, Filter, FolderOpened, Lightning, PieChart, Plus, RefreshRight, Search, Tickets, TrendCharts } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { listUserOptions } from '@/api/access';
import { createProject, deleteProject, pageProjects, updateProject } from '@/api/platform';
import { pageGitlabBindings } from '@/api/gitlab';
import { useAuthStore } from '@/stores/auth';
import { resolveAssetUrl } from '@/utils/asset';
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const isEditing = ref(false);
const currentId = ref(null);
const projectList = ref([]);
const userOptions = ref([]);
const repoBindings = ref([]);
const repoDialogVisible = ref(false);
const repoLoading = ref(false);
const currentRepoProject = ref(null);
const formRef = ref();
const router = useRouter();
const authStore = useAuthStore();
const activePreset = ref('all');
const canManageProjects = computed(() => authStore.hasPermission('project:manage'));
const pagination = reactive({
    page: 1,
    size: 10,
    total: 0
});
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1));
const filters = reactive({
    keyword: '',
    status: ''
});
const projectFilterPopoverVisible = ref(false);
const form = reactive({
    name: '',
    owner: '',
    ownerUserId: null,
    memberUserIds: [],
    status: '进行中',
    description: ''
});
const rules = {
    name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
    ownerUserId: [{ required: true, message: '请选择负责人', trigger: 'change' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};
const memberSelectableUsers = computed(() => userOptions.value.filter((item) => item.id !== form.ownerUserId));
const summaryCards = computed(() => [
    { label: '活跃项目', value: projectList.value.length || pagination.total, icon: Lightning, active: true },
    { label: '任务总量', value: projectList.value.reduce((sum, item) => sum + item.taskCount, 0), icon: TrendCharts, active: false },
    { label: '资源负载', value: `${resourceLoad.value}%`, icon: PieChart, active: false },
    { label: '平均速度', value: averageVelocity.value.toFixed(1), icon: FolderOpened, active: false }
]);
const resourceLoad = computed(() => {
    if (!projectList.value.length) {
        return 0;
    }
    const runningCount = projectList.value.filter((item) => item.status === '进行中').length;
    return Math.round((runningCount / projectList.value.length) * 100);
});
const averageVelocity = computed(() => {
    if (!projectList.value.length) {
        return 0;
    }
    const total = projectList.value.reduce((sum, item) => sum + item.taskCount, 0);
    return total / projectList.value.length;
});
const resetForm = () => {
    currentId.value = null;
    form.name = '';
    form.owner = '';
    form.ownerUserId = null;
    form.memberUserIds = [];
    form.status = '进行中';
    form.description = '';
    formRef.value?.clearValidate();
};
const buildUserLabel = (item) => item.nickname?.trim() ? `${item.nickname}（${item.username}）` : item.username;
const syncFormOwner = () => {
    const selected = userOptions.value.find((item) => item.id === form.ownerUserId);
    form.owner = selected?.nickname?.trim() || selected?.username || '';
    form.memberUserIds = form.memberUserIds.filter((item) => item !== form.ownerUserId);
};
const loadUserList = async () => {
    userOptions.value = await listUserOptions();
};
const loadProjects = async () => {
    loading.value = true;
    try {
        const pageData = await pageProjects({
            page: pagination.page,
            size: pagination.size,
            keyword: filters.keyword,
            status: filters.status
        });
        projectList.value = pageData.records;
        pagination.total = pageData.total;
    }
    finally {
        loading.value = false;
    }
};
const applyPreset = async (preset) => {
    activePreset.value = preset;
    if (preset === 'all') {
        filters.status = '';
    }
    else if (preset === 'planning') {
        filters.status = '规划中';
    }
    else {
        filters.status = '已立项';
    }
    pagination.page = 1;
    await loadProjects();
};
const handleSearch = async () => {
    projectFilterPopoverVisible.value = false;
    pagination.page = 1;
    await loadProjects();
};
const handleReset = async () => {
    filters.keyword = '';
    filters.status = '';
    activePreset.value = 'all';
    pagination.page = 1;
    await loadProjects();
};
const handleSizeChange = async () => {
    pagination.page = 1;
    await loadProjects();
};
const handlePrevPage = async () => {
    if (pagination.page <= 1)
        return;
    pagination.page -= 1;
    await loadProjects();
};
const handleNextPage = async () => {
    if (pagination.page >= totalPages.value)
        return;
    pagination.page += 1;
    await loadProjects();
};
const openCreateDialog = () => {
    if (!canManageProjects.value) {
        return;
    }
    isEditing.value = false;
    resetForm();
    dialogVisible.value = true;
};
const openEditDialog = (row) => {
    if (!canManageProjects.value || !row.canEdit) {
        ElMessage.warning('当前账号不能编辑该项目');
        return;
    }
    isEditing.value = true;
    currentId.value = row.id;
    form.name = row.name;
    form.owner = row.owner;
    form.ownerUserId = row.ownerUserId;
    form.memberUserIds = [...row.memberUserIds];
    form.status = row.status;
    form.description = row.description;
    dialogVisible.value = true;
};
const openIterationBoard = (row) => {
    router.push({ name: 'project-iterations', params: { projectId: row.id } });
};
const openKnowledgeGraph = (row) => {
    router.push({ name: 'project-knowledge-graph', params: { projectId: row.id } });
};
const openRepoDialog = async (row) => {
    if (!authStore.hasPermission('gitlab:view')) {
        ElMessage.warning('当前账号没有查看仓库列表的权限');
        return;
    }
    currentRepoProject.value = row;
    repoBindings.value = [];
    repoDialogVisible.value = true;
    repoLoading.value = true;
    try {
        const pageData = await pageGitlabBindings({
            page: 1,
            size: 20,
            projectId: row.id
        });
        repoBindings.value = pageData.records;
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载仓库列表失败');
    }
    finally {
        repoLoading.value = false;
    }
};
const handleSubmit = async () => {
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    submitting.value = true;
    try {
        syncFormOwner();
        if (isEditing.value && currentId.value !== null) {
            await updateProject(currentId.value, { ...form });
            ElMessage.success('项目更新成功');
        }
        else {
            await createProject({ ...form });
            ElMessage.success('项目创建成功');
        }
        dialogVisible.value = false;
        await loadProjects();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '操作失败');
    }
    finally {
        submitting.value = false;
    }
};
const handleDelete = async (id) => {
    if (!canManageProjects.value) {
        return;
    }
    try {
        await ElMessageBox.confirm('删除项目会同时删除关联 Agent 和任务，是否继续？', '提示', { type: 'warning' });
        await deleteProject(id);
        ElMessage.success('项目删除成功');
        await loadProjects();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
const statusTone = (status) => {
    if (status === '进行中')
        return 'running';
    if (status === '规划中' || status === '已立项')
        return 'active';
    if (status === '已完成')
        return 'onhold';
    return 'delayed';
};
const statusLabel = (status) => {
    if (status === '进行中')
        return '进行中';
    if (status === '规划中' || status === '已立项')
        return '活跃';
    if (status === '已完成')
        return '已完成';
    return '延期';
};
const taskProgress = (row) => Math.min(100, Math.max(4, row.taskCount));
/**
 * 统一解析项目负责人展示名称，兼容历史数据里仅有 owner 文本、没有头像字段的情况。
 */
const projectOwnerName = (row) => row.owner?.trim() || '未分配';
/**
 * 判断项目是否已配置负责人，用于控制弹层里的空状态文案。
 */
const hasProjectOwner = (row) => Boolean(row.ownerUserId || row.owner?.trim());
/**
 * 将后端增量返回的成员摘要与旧 memberNames 字段做兼容归一，避免前后端上线窗口期列表闪断。
 */
const projectMembers = (row) => {
    if (Array.isArray(row.memberItems) && row.memberItems.length > 0) {
        return row.memberItems;
    }
    return (row.memberNames || []).map((name, index) => ({
        id: row.memberUserIds?.[index] ?? -(index + 1),
        name,
        avatarUrl: null
    }));
};
const memberPreview = (row) => projectMembers(row).slice(0, 3);
const avatarText = (name) => (name?.trim() || '未').slice(0, 1).toUpperCase();
const resolveProjectAvatarUrl = (avatarUrl) => resolveAssetUrl(avatarUrl) || undefined;
onMounted(async () => {
    await loadUserList();
    await loadProjects();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['project-kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['project-name-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-owner-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['project-name-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-owner-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-item']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['project-kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['project-name-text']} */ ;
/** @type {__VLS_StyleScopedClasses['project-owner-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-text']} */ ;
/** @type {__VLS_StyleScopedClasses['project-row-actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "project-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "project-kpi-row" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.summaryCards))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (item.label),
        ...{ class: "project-kpi-card" },
        ...{ class: ({ active: item.active }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-kpi-label" },
    });
    (item.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-kpi-value" },
    });
    (item.value);
    const __VLS_0 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ class: "project-kpi-icon" },
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "project-kpi-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    const __VLS_4 = ((item.icon));
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-page project-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-search-shell" },
});
const __VLS_8 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "management-list-search-icon" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "management-list-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onKeyup: (__VLS_ctx.handleSearch) },
    value: (__VLS_ctx.filters.keyword),
    ...{ class: "management-list-search-input" },
    type: "text",
    placeholder: "搜索项目名、负责人或描述...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_16 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    visible: (__VLS_ctx.projectFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "management-list-popper",
}));
const __VLS_18 = __VLS_17({
    visible: (__VLS_ctx.projectFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "management-list-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_19.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "management-list-toolbar-button" },
        type: "button",
    });
    const __VLS_20 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
    const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.Filter;
    /** @type {[typeof __VLS_components.Filter, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
    const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
    var __VLS_23;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-panel management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_28 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "全部状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "全部状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "进行中",
    value: "进行中",
}));
const __VLS_34 = __VLS_33({
    label: "进行中",
    value: "进行中",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
const __VLS_36 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "规划中",
    value: "规划中",
}));
const __VLS_38 = __VLS_37({
    label: "规划中",
    value: "规划中",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "已立项",
    value: "已立项",
}));
const __VLS_42 = __VLS_41({
    label: "已立项",
    value: "已立项",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "已完成",
    value: "已完成",
}));
const __VLS_46 = __VLS_45({
    label: "已完成",
    value: "已完成",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
var __VLS_31;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-actions" },
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
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleReset) },
    ...{ class: "management-list-toolbar-button" },
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
    ...{ class: "management-list-toolbar-side" },
});
if (__VLS_ctx.canManageProjects) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openCreateDialog) },
        ...{ class: "management-list-create-button" },
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
    ...{ class: "management-list-shell project-workspace" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "management-list-table project-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "project-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "project-col-owner" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "project-col-members" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "project-col-status" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "project-col-tasks" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "project-col-repos center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "project-col-actions right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.projectList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "management-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "project-col-main" },
        'data-label': "项目",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openIterationBoard(row);
            } },
        ...{ class: "project-name-button management-list-title-trigger" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-title-cell" },
    });
    const __VLS_80 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        ...{ class: "management-list-title-icon project-name-icon" },
    }));
    const __VLS_82 = __VLS_81({
        ...{ class: "management-list-title-icon project-name-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    const __VLS_84 = {}.FolderOpened;
    /** @type {[typeof __VLS_components.FolderOpened, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
    const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
    var __VLS_83;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-title-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-title project-name-text" },
    });
    (row.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-subtitle" },
    });
    (row.description || '暂无项目说明');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "project-col-owner" },
        'data-label': "负责人",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-owner-cell" },
    });
    const __VLS_88 = {}.ElPopover;
    /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        trigger: "click",
        placement: "bottom-start",
        width: (220),
        popperClass: "project-person-popper",
    }));
    const __VLS_90 = __VLS_89({
        trigger: "click",
        placement: "bottom-start",
        width: (220),
        popperClass: "project-person-popper",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    {
        const { reference: __VLS_thisSlot } = __VLS_91.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "project-avatar-trigger project-owner-trigger" },
            type: "button",
            'aria-label': "查看负责人详情",
        });
        const __VLS_92 = {}.ElAvatar;
        /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            ...{ class: "project-owner-avatar" },
            src: (__VLS_ctx.resolveProjectAvatarUrl(row.ownerAvatarUrl)),
        }));
        const __VLS_94 = __VLS_93({
            ...{ class: "project-owner-avatar" },
            src: (__VLS_ctx.resolveProjectAvatarUrl(row.ownerAvatarUrl)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        (__VLS_ctx.avatarText(__VLS_ctx.projectOwnerName(row)));
        var __VLS_95;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-person-panel" },
    });
    if (__VLS_ctx.hasProjectOwner(row)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-person-item" },
        });
        const __VLS_96 = {}.ElAvatar;
        /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            ...{ class: "project-popover-avatar" },
            src: (__VLS_ctx.resolveProjectAvatarUrl(row.ownerAvatarUrl)),
        }));
        const __VLS_98 = __VLS_97({
            ...{ class: "project-popover-avatar" },
            src: (__VLS_ctx.resolveProjectAvatarUrl(row.ownerAvatarUrl)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        __VLS_99.slots.default;
        (__VLS_ctx.avatarText(__VLS_ctx.projectOwnerName(row)));
        var __VLS_99;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "project-person-name" },
        });
        (__VLS_ctx.projectOwnerName(row));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-person-empty" },
        });
    }
    var __VLS_91;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "project-col-members" },
        'data-label': "成员",
    });
    if (__VLS_ctx.projectMembers(row).length) {
        const __VLS_100 = {}.ElPopover;
        /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            trigger: "click",
            placement: "bottom-start",
            width: (260),
            popperClass: "project-person-popper",
        }));
        const __VLS_102 = __VLS_101({
            trigger: "click",
            placement: "bottom-start",
            width: (260),
            popperClass: "project-person-popper",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        {
            const { reference: __VLS_thisSlot } = __VLS_103.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "project-avatar-trigger project-members-trigger" },
                type: "button",
                'aria-label': "查看项目成员详情",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "project-member-stack" },
            });
            for (const [member] of __VLS_getVForSourceType((__VLS_ctx.memberPreview(row)))) {
                const __VLS_104 = {}.ElAvatar;
                /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
                // @ts-ignore
                const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                    key: (`${row.id}-${member.id}-${member.name}`),
                    ...{ class: "project-member-avatar" },
                    src: (__VLS_ctx.resolveProjectAvatarUrl(member.avatarUrl)),
                }));
                const __VLS_106 = __VLS_105({
                    key: (`${row.id}-${member.id}-${member.name}`),
                    ...{ class: "project-member-avatar" },
                    src: (__VLS_ctx.resolveProjectAvatarUrl(member.avatarUrl)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_105));
                __VLS_107.slots.default;
                (__VLS_ctx.avatarText(member.name));
                var __VLS_107;
            }
            if (__VLS_ctx.projectMembers(row).length > 3) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "project-member-avatar extra" },
                });
                (__VLS_ctx.projectMembers(row).length - 3);
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-person-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-person-list" },
        });
        for (const [member] of __VLS_getVForSourceType((__VLS_ctx.projectMembers(row)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`${row.id}-${member.id}-${member.name}`),
                ...{ class: "project-person-item" },
            });
            const __VLS_108 = {}.ElAvatar;
            /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                ...{ class: "project-popover-avatar" },
                src: (__VLS_ctx.resolveProjectAvatarUrl(member.avatarUrl)),
            }));
            const __VLS_110 = __VLS_109({
                ...{ class: "project-popover-avatar" },
                src: (__VLS_ctx.resolveProjectAvatarUrl(member.avatarUrl)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
            __VLS_111.slots.default;
            (__VLS_ctx.avatarText(member.name));
            var __VLS_111;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "project-person-name" },
            });
            (member.name);
        }
        var __VLS_103;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "project-member-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "project-col-status" },
        'data-label': "状态",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "project-status-pill" },
        ...{ class: (__VLS_ctx.statusTone(row.status)) },
    });
    (__VLS_ctx.statusLabel(row.status));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "project-col-tasks" },
        'data-label': "任务",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-progress-cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-progress-track" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-progress-fill" },
        ...{ style: ({ width: `${__VLS_ctx.taskProgress(row)}%` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "project-progress-text" },
    });
    (row.taskCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center project-col-repos" },
        'data-label': "仓库",
    });
    if (row.repoCount > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.repoCount > 0))
                        return;
                    __VLS_ctx.openRepoDialog(row);
                } },
            ...{ class: "repo-link-button" },
            type: "button",
        });
        (row.repoCount);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "repo-link-button muted" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "right project-col-actions" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "project-row-actions" },
    });
    const __VLS_112 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        content: "迭代管理",
        placement: "top",
    }));
    const __VLS_114 = __VLS_113({
        content: "迭代管理",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openIterationBoard(row);
            } },
        ...{ class: "project-action-button" },
        type: "button",
        'aria-label': "打开迭代管理",
    });
    const __VLS_116 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
    const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    const __VLS_120 = {}.Tickets;
    /** @type {[typeof __VLS_components.Tickets, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
    const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
    var __VLS_119;
    var __VLS_115;
    const __VLS_124 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        content: "知识图谱",
        placement: "top",
    }));
    const __VLS_126 = __VLS_125({
        content: "知识图谱",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    __VLS_127.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openKnowledgeGraph(row);
            } },
        ...{ class: "project-action-button graph" },
        type: "button",
        'aria-label': "打开知识图谱",
    });
    const __VLS_128 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
    const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
    __VLS_131.slots.default;
    const __VLS_132 = {}.Connection;
    /** @type {[typeof __VLS_components.Connection, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
    const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
    var __VLS_131;
    var __VLS_127;
    if (__VLS_ctx.canManageProjects && row.canEdit) {
        const __VLS_136 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            content: "编辑",
            placement: "top",
        }));
        const __VLS_138 = __VLS_137({
            content: "编辑",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageProjects && row.canEdit))
                        return;
                    __VLS_ctx.openEditDialog(row);
                } },
            ...{ class: "project-action-button" },
            type: "button",
            'aria-label': "编辑项目",
        });
        const __VLS_140 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({}));
        const __VLS_142 = __VLS_141({}, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        const __VLS_144 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
        const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
        var __VLS_143;
        var __VLS_139;
    }
    if (__VLS_ctx.canManageProjects && row.canDelete) {
        const __VLS_148 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            content: "删除",
            placement: "top",
        }));
        const __VLS_150 = __VLS_149({
            content: "删除",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        __VLS_151.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageProjects && row.canDelete))
                        return;
                    __VLS_ctx.handleDelete(row.id);
                } },
            ...{ class: "project-action-button danger" },
            type: "button",
            'aria-label': "删除项目",
        });
        const __VLS_152 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({}));
        const __VLS_154 = __VLS_153({}, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        const __VLS_156 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({}));
        const __VLS_158 = __VLS_157({}, ...__VLS_functionalComponentArgsRest(__VLS_157));
        var __VLS_155;
        var __VLS_151;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer project-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.pagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-size management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_160 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_162 = __VLS_161({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
let __VLS_164;
let __VLS_165;
let __VLS_166;
const __VLS_167 = {
    onChange: (__VLS_ctx.handleSizeChange)
};
__VLS_163.slots.default;
const __VLS_168 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    value: (5),
    label: "5",
}));
const __VLS_170 = __VLS_169({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
const __VLS_172 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    value: (10),
    label: "10",
}));
const __VLS_174 = __VLS_173({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
const __VLS_176 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    value: (20),
    label: "20",
}));
const __VLS_178 = __VLS_177({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
const __VLS_180 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    value: (50),
    label: "50",
}));
const __VLS_182 = __VLS_181({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
var __VLS_163;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePrevPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page <= 1),
});
const __VLS_184 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({}));
const __VLS_186 = __VLS_185({}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
const __VLS_188 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({}));
const __VLS_190 = __VLS_189({}, ...__VLS_functionalComponentArgsRest(__VLS_189));
var __VLS_187;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-page-text" },
});
(__VLS_ctx.pagination.page);
(__VLS_ctx.totalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleNextPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page >= __VLS_ctx.totalPages),
});
const __VLS_192 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({}));
const __VLS_194 = __VLS_193({}, ...__VLS_functionalComponentArgsRest(__VLS_193));
__VLS_195.slots.default;
const __VLS_196 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({}));
const __VLS_198 = __VLS_197({}, ...__VLS_functionalComponentArgsRest(__VLS_197));
var __VLS_195;
const __VLS_200 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.isEditing ? '编辑项目' : '新建项目'),
    width: "520px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_202 = __VLS_201({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.isEditing ? '编辑项目' : '新建项目'),
    width: "520px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
const __VLS_204 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "90px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_206 = __VLS_205({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "90px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_208 = {};
__VLS_207.slots.default;
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
const __VLS_210 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    label: "项目名称",
    prop: "name",
}));
const __VLS_212 = __VLS_211({
    label: "项目名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
const __VLS_214 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入项目名称",
}));
const __VLS_216 = __VLS_215({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入项目名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_215));
var __VLS_213;
const __VLS_218 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
    label: "负责人",
    prop: "ownerUserId",
}));
const __VLS_220 = __VLS_219({
    label: "负责人",
    prop: "ownerUserId",
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
__VLS_221.slots.default;
const __VLS_222 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    modelValue: (__VLS_ctx.form.ownerUserId),
    filterable: true,
    placeholder: "请选择负责人",
    ...{ style: {} },
}));
const __VLS_224 = __VLS_223({
    modelValue: (__VLS_ctx.form.ownerUserId),
    filterable: true,
    placeholder: "请选择负责人",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
__VLS_225.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.userOptions))) {
    const __VLS_226 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }));
    const __VLS_228 = __VLS_227({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_227));
}
var __VLS_225;
var __VLS_221;
const __VLS_230 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
    label: "项目成员",
}));
const __VLS_232 = __VLS_231({
    label: "项目成员",
}, ...__VLS_functionalComponentArgsRest(__VLS_231));
__VLS_233.slots.default;
const __VLS_234 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
    modelValue: (__VLS_ctx.form.memberUserIds),
    multiple: true,
    filterable: true,
    collapseTags: true,
    placeholder: "请选择项目成员",
    ...{ style: {} },
}));
const __VLS_236 = __VLS_235({
    modelValue: (__VLS_ctx.form.memberUserIds),
    multiple: true,
    filterable: true,
    collapseTags: true,
    placeholder: "请选择项目成员",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_235));
__VLS_237.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.memberSelectableUsers))) {
    const __VLS_238 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }));
    const __VLS_240 = __VLS_239({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_239));
}
var __VLS_237;
var __VLS_233;
const __VLS_242 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
    label: "状态",
    prop: "status",
}));
const __VLS_244 = __VLS_243({
    label: "状态",
    prop: "status",
}, ...__VLS_functionalComponentArgsRest(__VLS_243));
__VLS_245.slots.default;
const __VLS_246 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
    modelValue: (__VLS_ctx.form.status),
    placeholder: "请选择状态",
    ...{ style: {} },
}));
const __VLS_248 = __VLS_247({
    modelValue: (__VLS_ctx.form.status),
    placeholder: "请选择状态",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
__VLS_249.slots.default;
const __VLS_250 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
    label: "进行中",
    value: "进行中",
}));
const __VLS_252 = __VLS_251({
    label: "进行中",
    value: "进行中",
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
const __VLS_254 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_255 = __VLS_asFunctionalComponent(__VLS_254, new __VLS_254({
    label: "规划中",
    value: "规划中",
}));
const __VLS_256 = __VLS_255({
    label: "规划中",
    value: "规划中",
}, ...__VLS_functionalComponentArgsRest(__VLS_255));
const __VLS_258 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
    label: "已立项",
    value: "已立项",
}));
const __VLS_260 = __VLS_259({
    label: "已立项",
    value: "已立项",
}, ...__VLS_functionalComponentArgsRest(__VLS_259));
const __VLS_262 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
    label: "已完成",
    value: "已完成",
}));
const __VLS_264 = __VLS_263({
    label: "已完成",
    value: "已完成",
}, ...__VLS_functionalComponentArgsRest(__VLS_263));
var __VLS_249;
var __VLS_245;
const __VLS_266 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_267 = __VLS_asFunctionalComponent(__VLS_266, new __VLS_266({
    label: "项目说明",
    prop: "description",
}));
const __VLS_268 = __VLS_267({
    label: "项目说明",
    prop: "description",
}, ...__VLS_functionalComponentArgsRest(__VLS_267));
__VLS_269.slots.default;
const __VLS_270 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (4),
    placeholder: "请输入项目说明",
}));
const __VLS_272 = __VLS_271({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (4),
    placeholder: "请输入项目说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_271));
var __VLS_269;
var __VLS_207;
{
    const { footer: __VLS_thisSlot } = __VLS_203.slots;
    const __VLS_274 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_275 = __VLS_asFunctionalComponent(__VLS_274, new __VLS_274({
        ...{ 'onClick': {} },
    }));
    const __VLS_276 = __VLS_275({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_275));
    let __VLS_278;
    let __VLS_279;
    let __VLS_280;
    const __VLS_281 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_277.slots.default;
    var __VLS_277;
    const __VLS_282 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_283 = __VLS_asFunctionalComponent(__VLS_282, new __VLS_282({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_284 = __VLS_283({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_283));
    let __VLS_286;
    let __VLS_287;
    let __VLS_288;
    const __VLS_289 = {
        onClick: (__VLS_ctx.handleSubmit)
    };
    __VLS_285.slots.default;
    var __VLS_285;
}
var __VLS_203;
const __VLS_290 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
    modelValue: (__VLS_ctx.repoDialogVisible),
    title: "关联仓库列表",
    width: "760px",
    alignCenter: true,
    destroyOnClose: true,
}));
const __VLS_292 = __VLS_291({
    modelValue: (__VLS_ctx.repoDialogVisible),
    title: "关联仓库列表",
    width: "760px",
    alignCenter: true,
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_291));
__VLS_293.slots.default;
if (__VLS_ctx.currentRepoProject) {
    const __VLS_294 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
        column: (2),
        border: true,
        ...{ class: "repo-meta" },
    }));
    const __VLS_296 = __VLS_295({
        column: (2),
        border: true,
        ...{ class: "repo-meta" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_295));
    __VLS_297.slots.default;
    const __VLS_298 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
        label: "项目",
    }));
    const __VLS_300 = __VLS_299({
        label: "项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_299));
    __VLS_301.slots.default;
    (__VLS_ctx.currentRepoProject.name);
    var __VLS_301;
    const __VLS_302 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
        label: "仓库数量",
    }));
    const __VLS_304 = __VLS_303({
        label: "仓库数量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_303));
    __VLS_305.slots.default;
    (__VLS_ctx.repoBindings.length);
    var __VLS_305;
    var __VLS_297;
    const __VLS_306 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
        data: (__VLS_ctx.repoBindings),
        ...{ style: {} },
    }));
    const __VLS_308 = __VLS_307({
        data: (__VLS_ctx.repoBindings),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_307));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.repoLoading) }, null, null);
    __VLS_309.slots.default;
    const __VLS_310 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
        prop: "projectName",
        label: "所属项目",
        width: "160",
    }));
    const __VLS_312 = __VLS_311({
        prop: "projectName",
        label: "所属项目",
        width: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_311));
    const __VLS_314 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
        label: "仓库名称",
        minWidth: "200",
    }));
    const __VLS_316 = __VLS_315({
        label: "仓库名称",
        minWidth: "200",
    }, ...__VLS_functionalComponentArgsRest(__VLS_315));
    __VLS_317.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_317.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.gitlabProjectName || row.gitlabProjectPath || row.gitlabProjectRef);
    }
    var __VLS_317;
    const __VLS_318 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
        label: "仓库路径",
        minWidth: "220",
        showOverflowTooltip: true,
    }));
    const __VLS_320 = __VLS_319({
        label: "仓库路径",
        minWidth: "220",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_319));
    __VLS_321.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_321.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.gitlabProjectPath || row.gitlabProjectRef);
    }
    var __VLS_321;
    const __VLS_322 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({
        label: "默认分支",
        width: "140",
    }));
    const __VLS_324 = __VLS_323({
        label: "默认分支",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_323));
    __VLS_325.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_325.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.defaultTargetBranch || '-');
    }
    var __VLS_325;
    const __VLS_326 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
        label: "状态",
        width: "120",
    }));
    const __VLS_328 = __VLS_327({
        label: "状态",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_327));
    __VLS_329.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_329.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_330 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_331 = __VLS_asFunctionalComponent(__VLS_330, new __VLS_330({
            type: (row.enabled ? 'success' : 'info'),
        }));
        const __VLS_332 = __VLS_331({
            type: (row.enabled ? 'success' : 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_331));
        __VLS_333.slots.default;
        (row.enabled ? '启用' : '停用');
        var __VLS_333;
    }
    var __VLS_329;
    const __VLS_334 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
        label: "链接",
        width: "90",
    }));
    const __VLS_336 = __VLS_335({
        label: "链接",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_335));
    __VLS_337.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_337.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.gitlabProjectWebUrl) {
            const __VLS_338 = {}.ElLink;
            /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
            // @ts-ignore
            const __VLS_339 = __VLS_asFunctionalComponent(__VLS_338, new __VLS_338({
                href: (row.gitlabProjectWebUrl),
                target: "_blank",
                type: "primary",
            }));
            const __VLS_340 = __VLS_339({
                href: (row.gitlabProjectWebUrl),
                target: "_blank",
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_339));
            __VLS_341.slots.default;
            var __VLS_341;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
    }
    var __VLS_337;
    var __VLS_309;
}
{
    const { footer: __VLS_thisSlot } = __VLS_293.slots;
    const __VLS_342 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
        ...{ 'onClick': {} },
    }));
    const __VLS_344 = __VLS_343({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_343));
    let __VLS_346;
    let __VLS_347;
    let __VLS_348;
    const __VLS_349 = {
        onClick: (...[$event]) => {
            __VLS_ctx.repoDialogVisible = false;
        }
    };
    __VLS_345.slots.default;
    var __VLS_345;
}
var __VLS_293;
/** @type {__VLS_StyleScopedClasses['project-page']} */ ;
/** @type {__VLS_StyleScopedClasses['project-kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['project-kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['project-kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['project-kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['project-kpi-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['project-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['project-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['project-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-members']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-tasks']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-repos']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['project-name-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['project-name-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['project-name-text']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['project-owner-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['project-avatar-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['project-owner-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['project-owner-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-item']} */ ;
/** @type {__VLS_StyleScopedClasses['project-popover-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-name']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-members']} */ ;
/** @type {__VLS_StyleScopedClasses['project-avatar-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['project-members-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['extra']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-list']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-item']} */ ;
/** @type {__VLS_StyleScopedClasses['project-popover-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['project-person-name']} */ ;
/** @type {__VLS_StyleScopedClasses['project-member-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-tasks']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['project-progress-text']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-repos']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['project-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['project-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['graph']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['project-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-text']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-meta']} */ ;
// @ts-ignore
var __VLS_209 = __VLS_208;
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
            FolderOpened: FolderOpened,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Search: Search,
            Tickets: Tickets,
            loading: loading,
            submitting: submitting,
            dialogVisible: dialogVisible,
            isEditing: isEditing,
            projectList: projectList,
            userOptions: userOptions,
            repoBindings: repoBindings,
            repoDialogVisible: repoDialogVisible,
            repoLoading: repoLoading,
            currentRepoProject: currentRepoProject,
            formRef: formRef,
            canManageProjects: canManageProjects,
            pagination: pagination,
            totalPages: totalPages,
            filters: filters,
            projectFilterPopoverVisible: projectFilterPopoverVisible,
            form: form,
            rules: rules,
            memberSelectableUsers: memberSelectableUsers,
            summaryCards: summaryCards,
            buildUserLabel: buildUserLabel,
            handleSearch: handleSearch,
            handleReset: handleReset,
            handleSizeChange: handleSizeChange,
            handlePrevPage: handlePrevPage,
            handleNextPage: handleNextPage,
            openCreateDialog: openCreateDialog,
            openEditDialog: openEditDialog,
            openIterationBoard: openIterationBoard,
            openKnowledgeGraph: openKnowledgeGraph,
            openRepoDialog: openRepoDialog,
            handleSubmit: handleSubmit,
            handleDelete: handleDelete,
            statusTone: statusTone,
            statusLabel: statusLabel,
            taskProgress: taskProgress,
            projectOwnerName: projectOwnerName,
            hasProjectOwner: hasProjectOwner,
            projectMembers: projectMembers,
            memberPreview: memberPreview,
            avatarText: avatarText,
            resolveProjectAvatarUrl: resolveProjectAvatarUrl,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=ProjectView.vue.js.map