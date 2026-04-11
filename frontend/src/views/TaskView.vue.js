/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, Tickets, VideoPlay } from '@element-plus/icons-vue';
import { listUserOptions } from '@/api/access';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import { createTask, deleteTask, listAgentOptions, listProjectWorkItems, listProjectOptions, listTaskAgentRuns, pageTasks, runTaskAgent, updateTask } from '@/api/platform';
import { formatRequirementStatusLabel, isRequirementFullyPassed, getTaskWorkHoursLockedReason } from '@/utils/requirementReview';
import { uploadMarkdownImage } from '@/utils/taskImageUpload';
import { useAuthStore } from '@/stores/auth';
const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const runDialogVisible = ref(false);
const runHistoryLoading = ref(false);
const runningAgent = ref(false);
const workHoursUpdatingId = ref(null);
const isEditing = ref(false);
const currentId = ref(null);
const assigneeFallback = ref('');
const taskList = ref([]);
const projectOptions = ref([]);
const requirementOptions = ref([]);
const userOptions = ref([]);
const runHistory = ref([]);
const currentRunTask = ref(null);
const runInput = ref('');
const formRef = ref();
const canManageTasks = computed(() => authStore.hasPermission('task:manage'));
const pagination = reactive({
    page: 1,
    size: 10,
    total: 0
});
const filters = reactive({
    keyword: '',
    status: '',
    priority: '',
    projectId: undefined,
    agentId: undefined
});
const taskFilterPopoverVisible = ref(false);
const form = reactive({
    name: '',
    workItemType: '任务',
    status: '草稿',
    priority: '中',
    workHours: null,
    planStartDate: null,
    planEndDate: null,
    assignee: '',
    assigneeUserId: null,
    collaboratorUserIds: [],
    description: '',
    requirementMarkdown: '',
    prototypeUrl: '',
    projectId: null,
    agentId: null,
    iterationId: null,
    requirementTaskId: null
});
const rules = {
    name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }],
    priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }]
};
const selectedFormProject = computed(() => projectOptions.value.find((item) => item.id === form.projectId) || null);
/**
 * 负责人与协作人只能从当前项目负责人、创建人和成员中选择，避免产生越权可见性。
 */
const projectParticipantUserIds = computed(() => {
    const result = new Set();
    if (selectedFormProject.value?.ownerUserId != null) {
        result.add(selectedFormProject.value.ownerUserId);
    }
    if (selectedFormProject.value?.creatorUserId != null) {
        result.add(selectedFormProject.value.creatorUserId);
    }
    for (const userId of selectedFormProject.value?.memberUserIds || []) {
        result.add(userId);
    }
    return result;
});
const projectParticipantUsers = computed(() => userOptions.value.filter((item) => projectParticipantUserIds.value.has(item.id)));
const collaboratorSelectableUsers = computed(() => projectParticipantUsers.value.filter((item) => item.id !== form.assigneeUserId));
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1));
const selectedRequirementForWorkHours = computed(() => requirementOptions.value.find((item) => item.id === form.requirementTaskId) || null);
const taskFormWorkHoursLockedReason = computed(() => {
    if (form.workItemType !== '任务' || !selectedRequirementForWorkHours.value) {
        return '';
    }
    return isRequirementFullyPassed(selectedRequirementForWorkHours.value)
        ? ''
        : '需关联需求开发、测试均通过后才可编辑';
});
const formatTaskStatusLabel = (task) => {
    if (!task) {
        return '-';
    }
    return formatRequirementStatusLabel(task);
};
const buildUserLabel = (item) => {
    return item.nickname?.trim() ? `${item.nickname} (${item.username})` : item.username;
};
const ownerInitial = (value) => (value || 'UN').slice(0, 2).toUpperCase();
const taskTypeTone = (workItemType) => {
    if (workItemType === '需求')
        return 'requirement';
    if (workItemType === '缺陷')
        return 'defect';
    return 'task';
};
const taskPriorityTone = (priority) => {
    if (priority === '高')
        return 'high';
    if (priority === '低')
        return 'low';
    return 'medium';
};
const taskStatusTone = (task) => {
    const status = formatTaskStatusLabel(task);
    if (['处理中', '进行中', '开发中'].includes(status))
        return 'running';
    if (['已完成', '完成', '测试通过', '开发通过'].includes(status))
        return 'done';
    if (['已阻塞', '阻塞'].includes(status))
        return 'blocked';
    return 'draft';
};
const getRowWorkHoursLockedReason = (task) => {
    if (task.workItemType !== '任务') {
        return '';
    }
    return getTaskWorkHoursLockedReason(task);
};
const syncFormAssignee = () => {
    const selected = userOptions.value.find((item) => item.id === form.assigneeUserId);
    form.assignee = selected?.nickname?.trim() || selected?.username || assigneeFallback.value;
    form.collaboratorUserIds = form.collaboratorUserIds.filter((item) => item !== form.assigneeUserId);
};
/**
 * 当项目发生切换时，及时剔除不属于当前项目参与人的负责人和协作人，避免提交无效数据。
 */
const normalizeFormParticipants = () => {
    if (form.assigneeUserId != null && !projectParticipantUserIds.value.has(form.assigneeUserId)) {
        form.assigneeUserId = null;
        form.assignee = '';
        assigneeFallback.value = '';
    }
    form.collaboratorUserIds = form.collaboratorUserIds.filter((item) => projectParticipantUserIds.value.has(item));
};
const handleTaskMarkdownImageUpload = (file) => uploadMarkdownImage(file);
const openRequirementTask = (row) => {
    if (!row.requirementTaskId) {
        return;
    }
    router.push({
        name: 'project-iterations',
        params: { projectId: row.projectId },
        query: { openTaskId: String(row.requirementTaskId) }
    });
};
const openTaskDetail = (row) => {
    router.push({
        name: 'project-iterations',
        params: { projectId: row.projectId },
        query: { openTaskId: String(row.id) }
    });
};
const openTaskProject = (projectId) => {
    router.push({
        name: 'project-iterations',
        params: { projectId }
    });
};
const loadRequirementOptions = async (projectId) => {
    if (!projectId) {
        requirementOptions.value = [];
        return;
    }
    requirementOptions.value = await listProjectWorkItems(projectId, {
        workItemType: '需求'
    });
};
const buildTaskRunInput = (task) => {
    return [
        `任务：${task.name}`,
        `项目：${task.projectName}`,
        `状态：${task.status}`,
        `优先级：${task.priority}`,
        `工时：${task.workHours == null ? '-' : task.workHours}`,
        `负责人：${task.assignee}`,
        '',
        '说明：',
        task.description || ''
    ].join('\n');
};
const formatRunStatusLabel = (status) => {
    if (status === 'SUCCESS')
        return '成功';
    if (status === 'FAILED')
        return '失败';
    if (status === 'RUNNING')
        return '运行中';
    return status || '-';
};
const resetForm = () => {
    currentId.value = null;
    form.name = '';
    form.workItemType = '任务';
    form.status = '草稿';
    form.priority = '中';
    form.workHours = null;
    form.planStartDate = null;
    form.planEndDate = null;
    form.assignee = '';
    assigneeFallback.value = '';
    form.assigneeUserId = null;
    form.collaboratorUserIds = [];
    form.description = '';
    form.requirementMarkdown = '';
    form.prototypeUrl = '';
    form.projectId = projectOptions.value[0]?.id ?? null;
    form.agentId = null;
    form.iterationId = null;
    form.requirementTaskId = null;
    formRef.value?.clearValidate();
};
const refreshAgentOptionsForProject = async (projectId) => {
    const options = await listAgentOptions(projectId ?? undefined);
    return options;
};
const loadOptions = async () => {
    const [projects, users] = await Promise.all([listProjectOptions(), listUserOptions()]);
    projectOptions.value = projects;
    userOptions.value = users;
    if (!form.projectId && projectOptions.value.length > 0) {
        form.projectId = projectOptions.value[0].id;
    }
    await loadRequirementOptions(form.projectId);
};
const loadTasks = async () => {
    loading.value = true;
    try {
        const pageData = await pageTasks({
            page: pagination.page,
            size: pagination.size,
            keyword: filters.keyword,
            status: filters.status,
            priority: filters.priority,
            projectId: filters.projectId
        });
        taskList.value = pageData.records;
        pagination.total = pageData.total;
    }
    finally {
        loading.value = false;
    }
};
const loadRunHistory = async () => {
    if (!currentRunTask.value)
        return;
    runHistoryLoading.value = true;
    try {
        runHistory.value = await listTaskAgentRuns(currentRunTask.value.id);
    }
    finally {
        runHistoryLoading.value = false;
    }
};
const handleSearch = async () => {
    taskFilterPopoverVisible.value = false;
    pagination.page = 1;
    await loadTasks();
};
const handleReset = async () => {
    filters.keyword = '';
    filters.status = '';
    filters.priority = '';
    filters.projectId = undefined;
    pagination.page = 1;
    await loadTasks();
};
const handleSizeChange = async () => {
    pagination.page = 1;
    await loadTasks();
};
const handlePrevPage = async () => {
    if (pagination.page <= 1) {
        return;
    }
    pagination.page -= 1;
    await loadTasks();
};
const handleNextPage = async () => {
    if (pagination.page >= totalPages.value) {
        return;
    }
    pagination.page += 1;
    await loadTasks();
};
const handleFilterProjectChange = async () => {
    pagination.page = 1;
    await loadTasks();
};
const handleFormProjectChange = async () => {
    await loadRequirementOptions(form.projectId);
    normalizeFormParticipants();
    if (form.requirementTaskId && !requirementOptions.value.some((item) => item.id === form.requirementTaskId)) {
        form.requirementTaskId = null;
    }
};
const openCreateDialog = async () => {
    if (!canManageTasks.value) {
        return;
    }
    isEditing.value = false;
    resetForm();
    dialogVisible.value = true;
};
const openEditDialog = async (row) => {
    if (!canManageTasks.value) {
        ElMessage.warning('当前账号没有编辑任务的权限');
        return;
    }
    isEditing.value = true;
    currentId.value = row.id;
    form.name = row.name;
    form.workItemType = row.workItemType;
    form.status = row.status;
    form.priority = row.priority;
    form.workHours = row.workHours;
    form.planStartDate = row.planStartDate;
    form.planEndDate = row.planEndDate;
    form.assignee = row.assignee;
    assigneeFallback.value = row.assigneeUserId ? '' : row.assignee;
    form.assigneeUserId = row.assigneeUserId;
    form.collaboratorUserIds = [...row.collaboratorUserIds];
    form.description = row.description;
    form.requirementMarkdown = row.requirementMarkdown;
    form.prototypeUrl = row.prototypeUrl;
    form.projectId = row.projectId;
    await loadRequirementOptions(form.projectId);
    normalizeFormParticipants();
    form.agentId = row.agentId;
    form.iterationId = row.iterationId;
    form.requirementTaskId = row.requirementTaskId;
    dialogVisible.value = true;
};
const openRunDialog = async (row) => {
    if (!canManageTasks.value) {
        return;
    }
    if (!row.agentId) {
        ElMessage.warning('当前任务还没有绑定执行智能体');
        return;
    }
    currentRunTask.value = row;
    runInput.value = buildTaskRunInput(row);
    runHistory.value = [];
    runDialogVisible.value = true;
    await loadRunHistory();
};
const handleSubmit = async () => {
    if (!canManageTasks.value) {
        return;
    }
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid || form.projectId === null)
        return;
    if (form.workItemType === '任务' && taskFormWorkHoursLockedReason.value && form.workHours !== null) {
        ElMessage.warning(taskFormWorkHoursLockedReason.value);
        return;
    }
    submitting.value = true;
    try {
        syncFormAssignee();
        const payload = {
            name: form.name,
            workItemType: form.workItemType,
            status: form.status,
            priority: form.priority,
            workHours: form.workItemType === '任务' ? form.workHours : null,
            planStartDate: form.planStartDate,
            planEndDate: form.planEndDate,
            assignee: form.assignee,
            assigneeUserId: form.assigneeUserId,
            collaboratorUserIds: form.collaboratorUserIds,
            description: form.description,
            requirementMarkdown: form.requirementMarkdown,
            prototypeUrl: form.prototypeUrl,
            projectId: form.projectId,
            agentId: form.agentId,
            iterationId: form.iterationId,
            requirementTaskId: form.requirementTaskId
        };
        if (isEditing.value && currentId.value !== null) {
            await updateTask(currentId.value, payload);
            ElMessage.success('任务更新成功');
        }
        else {
            await createTask(payload);
            ElMessage.success('任务创建成功');
        }
        dialogVisible.value = false;
        await loadTasks();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '操作失败');
    }
    finally {
        submitting.value = false;
    }
};
const handleRunAgent = async () => {
    if (!canManageTasks.value) {
        return;
    }
    if (!currentRunTask.value)
        return;
    if (!runInput.value.trim()) {
        ElMessage.warning('请输入运行内容');
        return;
    }
    runningAgent.value = true;
    try {
        const result = await runTaskAgent(currentRunTask.value.id, runInput.value);
        runHistory.value = [result, ...runHistory.value.filter(item => item.id !== result.id)];
        ElMessage.success(result.status === 'SUCCESS' ? '任务智能体运行成功' : '任务智能体运行失败');
        await loadTasks();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '运行失败');
    }
    finally {
        runningAgent.value = false;
    }
};
const handleQuickWorkHoursChange = async (row, value) => {
    if (!canManageTasks.value) {
        return;
    }
    if (row.workItemType !== '任务') {
        return;
    }
    const lockedReason = getRowWorkHoursLockedReason(row);
    if (lockedReason) {
        ElMessage.warning(lockedReason);
        return;
    }
    const normalizedValue = value == null || value === '' ? null : Number(value);
    if (normalizedValue !== null && (!Number.isFinite(normalizedValue) || normalizedValue > 15 || normalizedValue < 0)) {
        ElMessage.warning('工时必须在 0 到 15 小时之间');
        return;
    }
    const formattedValue = normalizedValue == null ? null : Number(normalizedValue.toFixed(1));
    if (row.workHours === formattedValue) {
        return;
    }
    workHoursUpdatingId.value = row.id;
    try {
        await updateTask(row.id, {
            name: row.name,
            workItemType: row.workItemType,
            status: row.status,
            priority: row.priority,
            workHours: formattedValue,
            planStartDate: row.planStartDate,
            planEndDate: row.planEndDate,
            assignee: row.assignee,
            assigneeUserId: row.assigneeUserId,
            collaboratorUserIds: row.collaboratorUserIds,
            description: row.description,
            requirementMarkdown: row.requirementMarkdown,
            prototypeUrl: row.prototypeUrl,
            projectId: row.projectId,
            agentId: row.agentId,
            iterationId: row.iterationId,
            requirementTaskId: row.requirementTaskId
        });
        row.workHours = formattedValue;
        ElMessage.success('工时已更新');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '工时更新失败');
    }
    finally {
        workHoursUpdatingId.value = null;
    }
};
const handleDelete = async (id) => {
    if (!canManageTasks.value) {
        return;
    }
    try {
        await ElMessageBox.confirm('确认删除该任务吗？', '提示', { type: 'warning' });
        await deleteTask(id);
        ElMessage.success('任务删除成功');
        await loadTasks();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
onMounted(async () => {
    await loadOptions();
    await loadTasks();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['task-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['task-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-title']} */ ;
/** @type {__VLS_StyleScopedClasses['task-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-title']} */ ;
/** @type {__VLS_StyleScopedClasses['task-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['task-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['task-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-owner-line']} */ ;
/** @type {__VLS_StyleScopedClasses['task-collaborator-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['task-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['task-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['task-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-popper']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-block']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-block']} */ ;
/** @type {__VLS_StyleScopedClasses['list-work-hours-input']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['task-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['task-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-title']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['task-owner-line']} */ ;
/** @type {__VLS_StyleScopedClasses['task-collaborator-list']} */ ;
/** @type {__VLS_StyleScopedClasses['task-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-atelier-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "task-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-search-shell" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "task-search-icon" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "task-search-icon" },
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
    ...{ class: "task-search-input" },
    type: "text",
    placeholder: "筛选任务、说明、负责人或项目...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "task-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.taskFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (360),
    popperClass: "task-filter-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.taskFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (360),
    popperClass: "task-filter-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_11.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "task-toolbar-button" },
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
    ...{ class: "task-filter-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-filter-field" },
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
for (const [project] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_28 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }));
    const __VLS_30 = __VLS_29({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
}
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_32 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    modelValue: (__VLS_ctx.filters.priority),
    clearable: true,
    placeholder: "优先级",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_34 = __VLS_33({
    modelValue: (__VLS_ctx.filters.priority),
    clearable: true,
    placeholder: "优先级",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "高",
    value: "高",
}));
const __VLS_38 = __VLS_37({
    label: "高",
    value: "高",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "中",
    value: "中",
}));
const __VLS_42 = __VLS_41({
    label: "中",
    value: "中",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "低",
    value: "低",
}));
const __VLS_46 = __VLS_45({
    label: "低",
    value: "低",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
var __VLS_35;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_48 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_50 = __VLS_49({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "草稿",
    value: "草稿",
}));
const __VLS_54 = __VLS_53({
    label: "草稿",
    value: "草稿",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
const __VLS_56 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "待开始",
    value: "待开始",
}));
const __VLS_58 = __VLS_57({
    label: "待开始",
    value: "待开始",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
const __VLS_60 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "处理中",
    value: "处理中",
}));
const __VLS_62 = __VLS_61({
    label: "处理中",
    value: "处理中",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
const __VLS_64 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "已完成",
    value: "已完成",
}));
const __VLS_66 = __VLS_65({
    label: "已完成",
    value: "已完成",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
const __VLS_68 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "已阻塞",
    value: "已阻塞",
}));
const __VLS_70 = __VLS_69({
    label: "已阻塞",
    value: "已阻塞",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
var __VLS_51;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-filter-actions" },
});
const __VLS_72 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_74 = __VLS_73({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
let __VLS_76;
let __VLS_77;
let __VLS_78;
const __VLS_79 = {
    onClick: (__VLS_ctx.handleSearch)
};
__VLS_75.slots.default;
var __VLS_75;
const __VLS_80 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    ...{ 'onClick': {} },
}));
const __VLS_82 = __VLS_81({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
let __VLS_84;
let __VLS_85;
let __VLS_86;
const __VLS_87 = {
    onClick: (__VLS_ctx.handleReset)
};
__VLS_83.slots.default;
var __VLS_83;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleReset) },
    ...{ class: "task-toolbar-button" },
    type: "button",
});
const __VLS_88 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
const __VLS_92 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
var __VLS_91;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-toolbar-side" },
});
if (__VLS_ctx.canManageTasks) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openCreateDialog) },
        ...{ class: "task-create-button" },
        type: "button",
    });
    const __VLS_96 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
    const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_99.slots.default;
    const __VLS_100 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
    const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
    var __VLS_99;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "task-table-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "task-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center task-col-type" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-project" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-requirement" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-owner" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-collaborators" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center task-col-priority" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-hours" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-status" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "task-col-updated" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "right task-col-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.taskList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "task-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-col-main" },
        'data-label': "任务",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openTaskDetail(row);
            } },
        ...{ class: "task-title-button" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "task-primary-cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "task-primary-icon" },
    });
    const __VLS_104 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
    const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    const __VLS_108 = {}.Tickets;
    /** @type {[typeof __VLS_components.Tickets, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
    const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
    var __VLS_107;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "task-primary-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "task-primary-title" },
    });
    (row.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "task-primary-meta" },
    });
    (row.description || '暂无说明');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center task-col-type" },
        'data-label': "类型",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "task-type-pill" },
        ...{ class: (__VLS_ctx.taskTypeTone(row.workItemType)) },
    });
    (row.workItemType);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-project-cell task-col-project" },
        'data-label': "所属项目",
    });
    if (row.projectName) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.projectName))
                        return;
                    __VLS_ctx.openTaskProject(row.projectId);
                } },
            ...{ class: "task-link-button" },
            type: "button",
        });
        (row.projectName);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "task-empty-text" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-col-requirement" },
        'data-label': "关联需求",
    });
    if (row.requirementTaskId && row.requirementTaskName) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.requirementTaskId && row.requirementTaskName))
                        return;
                    __VLS_ctx.openRequirementTask(row);
                } },
            ...{ class: "task-link-button" },
            type: "button",
        });
        (row.requirementTaskName);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "task-empty-text" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-col-owner" },
        'data-label': "负责人",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "task-owner-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "task-owner-avatar" },
    });
    (__VLS_ctx.ownerInitial(row.assignee));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "task-owner-name" },
    });
    (row.assignee || '未分配');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-col-collaborators" },
        'data-label': "协作人",
    });
    if (row.collaboratorNames.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "task-collaborator-list" },
        });
        for (const [name] of __VLS_getVForSourceType((row.collaboratorNames.slice(0, 3)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (`${row.id}-${name}`),
                ...{ class: "task-collaborator-chip" },
            });
            (name);
        }
        if (row.collaboratorNames.length > 3) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "task-collaborator-chip muted" },
            });
            (row.collaboratorNames.length - 3);
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "task-empty-text" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center task-col-priority" },
        'data-label': "优先级",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "task-priority-pill" },
        ...{ class: (__VLS_ctx.taskPriorityTone(row.priority)) },
    });
    (row.priority || '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-col-hours" },
        'data-label': "工时",
    });
    if (__VLS_ctx.canManageTasks && row.workItemType === '任务') {
        const __VLS_112 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            content: (__VLS_ctx.getRowWorkHoursLockedReason(row)),
            disabled: (!__VLS_ctx.getRowWorkHoursLockedReason(row)),
        }));
        const __VLS_114 = __VLS_113({
            content: (__VLS_ctx.getRowWorkHoursLockedReason(row)),
            disabled: (!__VLS_ctx.getRowWorkHoursLockedReason(row)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        __VLS_115.slots.default;
        const __VLS_116 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            ...{ 'onChange': {} },
            modelValue: (row.workHours ?? undefined),
            min: (0),
            max: (15),
            step: (0.5),
            precision: (1),
            controlsPosition: "right",
            ...{ class: "list-work-hours-input" },
            disabled: (__VLS_ctx.workHoursUpdatingId === row.id || Boolean(__VLS_ctx.getRowWorkHoursLockedReason(row))),
        }));
        const __VLS_118 = __VLS_117({
            ...{ 'onChange': {} },
            modelValue: (row.workHours ?? undefined),
            min: (0),
            max: (15),
            step: (0.5),
            precision: (1),
            controlsPosition: "right",
            ...{ class: "list-work-hours-input" },
            disabled: (__VLS_ctx.workHoursUpdatingId === row.id || Boolean(__VLS_ctx.getRowWorkHoursLockedReason(row))),
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        let __VLS_120;
        let __VLS_121;
        let __VLS_122;
        const __VLS_123 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.canManageTasks && row.workItemType === '任务'))
                    return;
                __VLS_ctx.handleQuickWorkHoursChange(row, $event);
            }
        };
        var __VLS_119;
        var __VLS_115;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "task-empty-text" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-col-status" },
        'data-label': "状态",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "task-status-pill" },
        ...{ class: (__VLS_ctx.taskStatusTone(row)) },
    });
    (__VLS_ctx.formatTaskStatusLabel(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "task-updated-cell task-col-updated" },
        'data-label': "更新时间",
    });
    (row.updatedAt ? row.updatedAt.replace('T', ' ').slice(0, 16) : '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "right task-col-actions" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "task-row-actions" },
    });
    if (__VLS_ctx.canManageTasks) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageTasks))
                        return;
                    __VLS_ctx.openRunDialog(row);
                } },
            ...{ class: "task-action-button" },
            type: "button",
            title: "运行智能体",
        });
        const __VLS_124 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
        const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        const __VLS_128 = {}.VideoPlay;
        /** @type {[typeof __VLS_components.VideoPlay, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
        const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
        var __VLS_127;
    }
    if (__VLS_ctx.canManageTasks) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageTasks))
                        return;
                    __VLS_ctx.openEditDialog(row);
                } },
            ...{ class: "task-action-button" },
            type: "button",
            title: "编辑任务",
        });
        const __VLS_132 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
        const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
        __VLS_135.slots.default;
        const __VLS_136 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
        const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
        var __VLS_135;
    }
    if (__VLS_ctx.canManageTasks && row.canDelete) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageTasks && row.canDelete))
                        return;
                    __VLS_ctx.handleDelete(row.id);
                } },
            ...{ class: "task-action-button danger" },
            type: "button",
            title: "删除任务",
        });
        const __VLS_140 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({}));
        const __VLS_142 = __VLS_141({}, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        const __VLS_144 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
        const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
        var __VLS_143;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-table-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.pagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-page-size" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_148 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_150 = __VLS_149({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
let __VLS_152;
let __VLS_153;
let __VLS_154;
const __VLS_155 = {
    onChange: (__VLS_ctx.handleSizeChange)
};
__VLS_151.slots.default;
const __VLS_156 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    value: (5),
    label: "5",
}));
const __VLS_158 = __VLS_157({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
const __VLS_160 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    value: (10),
    label: "10",
}));
const __VLS_162 = __VLS_161({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
const __VLS_164 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    value: (20),
    label: "20",
}));
const __VLS_166 = __VLS_165({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
const __VLS_168 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    value: (50),
    label: "50",
}));
const __VLS_170 = __VLS_169({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
var __VLS_151;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "task-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePrevPage) },
    ...{ class: "task-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page <= 1),
});
const __VLS_172 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({}));
const __VLS_174 = __VLS_173({}, ...__VLS_functionalComponentArgsRest(__VLS_173));
__VLS_175.slots.default;
const __VLS_176 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({}));
const __VLS_178 = __VLS_177({}, ...__VLS_functionalComponentArgsRest(__VLS_177));
var __VLS_175;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "task-page-text" },
});
(__VLS_ctx.pagination.page);
(__VLS_ctx.totalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleNextPage) },
    ...{ class: "task-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page >= __VLS_ctx.totalPages),
});
const __VLS_180 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({}));
const __VLS_182 = __VLS_181({}, ...__VLS_functionalComponentArgsRest(__VLS_181));
__VLS_183.slots.default;
const __VLS_184 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({}));
const __VLS_186 = __VLS_185({}, ...__VLS_functionalComponentArgsRest(__VLS_185));
var __VLS_183;
const __VLS_188 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.isEditing ? '编辑任务' : '新建任务'),
    width: "980px",
    ...{ class: "work-item-dialog platform-form-dialog" },
}));
const __VLS_190 = __VLS_189({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.isEditing ? '编辑任务' : '新建任务'),
    width: "980px",
    ...{ class: "work-item-dialog platform-form-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
__VLS_191.slots.default;
const __VLS_192 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelPosition: "top",
    ...{ class: "work-item-form platform-form-layout" },
}));
const __VLS_194 = __VLS_193({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelPosition: "top",
    ...{ class: "work-item-form platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_193));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_196 = {};
__VLS_195.slots.default;
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
const __VLS_198 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    label: "标题",
    prop: "name",
    ...{ class: "grid-span-2" },
}));
const __VLS_200 = __VLS_199({
    label: "标题",
    prop: "name",
    ...{ class: "grid-span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_201.slots.default;
const __VLS_202 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入任务标题",
    size: "large",
}));
const __VLS_204 = __VLS_203({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入任务标题",
    size: "large",
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
var __VLS_201;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-grid" },
});
const __VLS_206 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
    label: "负责人",
    ...{ class: "compact-form-item" },
}));
const __VLS_208 = __VLS_207({
    label: "负责人",
    ...{ class: "compact-form-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_207));
__VLS_209.slots.default;
const __VLS_210 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    modelValue: (__VLS_ctx.form.assigneeUserId),
    clearable: true,
    filterable: true,
    placeholder: "请选择负责人",
    ...{ style: {} },
}));
const __VLS_212 = __VLS_211({
    modelValue: (__VLS_ctx.form.assigneeUserId),
    clearable: true,
    filterable: true,
    placeholder: "请选择负责人",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectParticipantUsers))) {
    const __VLS_214 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }));
    const __VLS_216 = __VLS_215({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_215));
}
var __VLS_213;
var __VLS_209;
const __VLS_218 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
    label: "协作人",
    ...{ class: "compact-form-item" },
}));
const __VLS_220 = __VLS_219({
    label: "协作人",
    ...{ class: "compact-form-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
__VLS_221.slots.default;
const __VLS_222 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    modelValue: (__VLS_ctx.form.collaboratorUserIds),
    multiple: true,
    filterable: true,
    collapseTags: true,
    placeholder: "请选择协作人",
    ...{ style: {} },
}));
const __VLS_224 = __VLS_223({
    modelValue: (__VLS_ctx.form.collaboratorUserIds),
    multiple: true,
    filterable: true,
    collapseTags: true,
    placeholder: "请选择协作人",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
__VLS_225.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.collaboratorSelectableUsers))) {
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
    label: "所属项目",
    prop: "projectId",
    ...{ class: "compact-form-item" },
}));
const __VLS_232 = __VLS_231({
    label: "所属项目",
    prop: "projectId",
    ...{ class: "compact-form-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_231));
__VLS_233.slots.default;
const __VLS_234 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.projectId),
    placeholder: "请选择项目",
    ...{ style: {} },
}));
const __VLS_236 = __VLS_235({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.projectId),
    placeholder: "请选择项目",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_235));
let __VLS_238;
let __VLS_239;
let __VLS_240;
const __VLS_241 = {
    onChange: (__VLS_ctx.handleFormProjectChange)
};
__VLS_237.slots.default;
for (const [project] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_242 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }));
    const __VLS_244 = __VLS_243({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_243));
}
var __VLS_237;
var __VLS_233;
const __VLS_246 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
    label: "关联需求",
    ...{ class: "compact-form-item" },
}));
const __VLS_248 = __VLS_247({
    label: "关联需求",
    ...{ class: "compact-form-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
__VLS_249.slots.default;
const __VLS_250 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
    modelValue: (__VLS_ctx.form.requirementTaskId),
    clearable: true,
    filterable: true,
    placeholder: "可选，关联一个需求",
    ...{ style: {} },
}));
const __VLS_252 = __VLS_251({
    modelValue: (__VLS_ctx.form.requirementTaskId),
    clearable: true,
    filterable: true,
    placeholder: "可选，关联一个需求",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
__VLS_253.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.requirementOptions))) {
    const __VLS_254 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_255 = __VLS_asFunctionalComponent(__VLS_254, new __VLS_254({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_256 = __VLS_255({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_255));
}
var __VLS_253;
var __VLS_249;
const __VLS_258 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
    label: "优先级",
    prop: "priority",
    ...{ class: "compact-form-item" },
}));
const __VLS_260 = __VLS_259({
    label: "优先级",
    prop: "priority",
    ...{ class: "compact-form-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_259));
__VLS_261.slots.default;
const __VLS_262 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
    modelValue: (__VLS_ctx.form.priority),
    placeholder: "请选择优先级",
    ...{ style: {} },
}));
const __VLS_264 = __VLS_263({
    modelValue: (__VLS_ctx.form.priority),
    placeholder: "请选择优先级",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_263));
__VLS_265.slots.default;
const __VLS_266 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_267 = __VLS_asFunctionalComponent(__VLS_266, new __VLS_266({
    label: "高",
    value: "高",
}));
const __VLS_268 = __VLS_267({
    label: "高",
    value: "高",
}, ...__VLS_functionalComponentArgsRest(__VLS_267));
const __VLS_270 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
    label: "中",
    value: "中",
}));
const __VLS_272 = __VLS_271({
    label: "中",
    value: "中",
}, ...__VLS_functionalComponentArgsRest(__VLS_271));
const __VLS_274 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_275 = __VLS_asFunctionalComponent(__VLS_274, new __VLS_274({
    label: "低",
    value: "低",
}));
const __VLS_276 = __VLS_275({
    label: "低",
    value: "低",
}, ...__VLS_functionalComponentArgsRest(__VLS_275));
var __VLS_265;
var __VLS_261;
if (__VLS_ctx.form.workItemType === '任务') {
    const __VLS_278 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_279 = __VLS_asFunctionalComponent(__VLS_278, new __VLS_278({
        label: "工时",
        ...{ class: "compact-form-item" },
    }));
    const __VLS_280 = __VLS_279({
        label: "工时",
        ...{ class: "compact-form-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_279));
    __VLS_281.slots.default;
    const __VLS_282 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_283 = __VLS_asFunctionalComponent(__VLS_282, new __VLS_282({
        content: (__VLS_ctx.taskFormWorkHoursLockedReason),
        disabled: (!__VLS_ctx.taskFormWorkHoursLockedReason),
    }));
    const __VLS_284 = __VLS_283({
        content: (__VLS_ctx.taskFormWorkHoursLockedReason),
        disabled: (!__VLS_ctx.taskFormWorkHoursLockedReason),
    }, ...__VLS_functionalComponentArgsRest(__VLS_283));
    __VLS_285.slots.default;
    const __VLS_286 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_287 = __VLS_asFunctionalComponent(__VLS_286, new __VLS_286({
        modelValue: (__VLS_ctx.form.workHours),
        min: (0),
        max: (15),
        step: (0.5),
        precision: (1),
        controlsPosition: "right",
        ...{ style: {} },
        disabled: (Boolean(__VLS_ctx.taskFormWorkHoursLockedReason)),
    }));
    const __VLS_288 = __VLS_287({
        modelValue: (__VLS_ctx.form.workHours),
        min: (0),
        max: (15),
        step: (0.5),
        precision: (1),
        controlsPosition: "right",
        ...{ style: {} },
        disabled: (Boolean(__VLS_ctx.taskFormWorkHoursLockedReason)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_287));
    var __VLS_285;
    if (__VLS_ctx.taskFormWorkHoursLockedReason) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-tip" },
        });
        (__VLS_ctx.taskFormWorkHoursLockedReason);
    }
    var __VLS_281;
}
const __VLS_290 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
    label: "状态",
    prop: "status",
    ...{ class: "compact-form-item" },
}));
const __VLS_292 = __VLS_291({
    label: "状态",
    prop: "status",
    ...{ class: "compact-form-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_291));
__VLS_293.slots.default;
const __VLS_294 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
    modelValue: (__VLS_ctx.form.status),
    placeholder: "请选择状态",
    ...{ style: {} },
}));
const __VLS_296 = __VLS_295({
    modelValue: (__VLS_ctx.form.status),
    placeholder: "请选择状态",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_295));
__VLS_297.slots.default;
const __VLS_298 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
    label: "草稿",
    value: "草稿",
}));
const __VLS_300 = __VLS_299({
    label: "草稿",
    value: "草稿",
}, ...__VLS_functionalComponentArgsRest(__VLS_299));
const __VLS_302 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
    label: "待开始",
    value: "待开始",
}));
const __VLS_304 = __VLS_303({
    label: "待开始",
    value: "待开始",
}, ...__VLS_functionalComponentArgsRest(__VLS_303));
const __VLS_306 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
    label: "处理中",
    value: "处理中",
}));
const __VLS_308 = __VLS_307({
    label: "处理中",
    value: "处理中",
}, ...__VLS_functionalComponentArgsRest(__VLS_307));
const __VLS_310 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
    label: "已完成",
    value: "已完成",
}));
const __VLS_312 = __VLS_311({
    label: "已完成",
    value: "已完成",
}, ...__VLS_functionalComponentArgsRest(__VLS_311));
const __VLS_314 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
    label: "已阻塞",
    value: "已阻塞",
}));
const __VLS_316 = __VLS_315({
    label: "已阻塞",
    value: "已阻塞",
}, ...__VLS_functionalComponentArgsRest(__VLS_315));
var __VLS_297;
var __VLS_293;
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
const __VLS_318 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
    label: "详细说明",
    prop: "description",
    ...{ class: "grid-span-2 description-form-item" },
}));
const __VLS_320 = __VLS_319({
    label: "详细说明",
    prop: "description",
    ...{ class: "grid-span-2 description-form-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_319));
__VLS_321.slots.default;
/** @type {[typeof MarkdownEditor, ]} */ ;
// @ts-ignore
const __VLS_322 = __VLS_asFunctionalComponent(MarkdownEditor, new MarkdownEditor({
    modelValue: (__VLS_ctx.form.description),
    height: (380),
    uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
    placeholder: "请填写任务详细说明，支持 Markdown 格式",
}));
const __VLS_323 = __VLS_322({
    modelValue: (__VLS_ctx.form.description),
    height: (380),
    uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
    placeholder: "请填写任务详细说明，支持 Markdown 格式",
}, ...__VLS_functionalComponentArgsRest(__VLS_322));
var __VLS_321;
var __VLS_195;
{
    const { footer: __VLS_thisSlot } = __VLS_191.slots;
    const __VLS_325 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
        ...{ 'onClick': {} },
    }));
    const __VLS_327 = __VLS_326({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_326));
    let __VLS_329;
    let __VLS_330;
    let __VLS_331;
    const __VLS_332 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_328.slots.default;
    var __VLS_328;
    const __VLS_333 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_334 = __VLS_asFunctionalComponent(__VLS_333, new __VLS_333({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_335 = __VLS_334({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_334));
    let __VLS_337;
    let __VLS_338;
    let __VLS_339;
    const __VLS_340 = {
        onClick: (__VLS_ctx.handleSubmit)
    };
    __VLS_336.slots.default;
    var __VLS_336;
}
var __VLS_191;
const __VLS_341 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({
    modelValue: (__VLS_ctx.runDialogVisible),
    title: "运行任务智能体",
    width: "880px",
    destroyOnClose: true,
}));
const __VLS_343 = __VLS_342({
    modelValue: (__VLS_ctx.runDialogVisible),
    title: "运行任务智能体",
    width: "880px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_342));
__VLS_344.slots.default;
if (__VLS_ctx.currentRunTask) {
    const __VLS_345 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_346 = __VLS_asFunctionalComponent(__VLS_345, new __VLS_345({
        column: (2),
        border: true,
        ...{ class: "run-meta" },
    }));
    const __VLS_347 = __VLS_346({
        column: (2),
        border: true,
        ...{ class: "run-meta" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_346));
    __VLS_348.slots.default;
    const __VLS_349 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_350 = __VLS_asFunctionalComponent(__VLS_349, new __VLS_349({
        label: "任务",
    }));
    const __VLS_351 = __VLS_350({
        label: "任务",
    }, ...__VLS_functionalComponentArgsRest(__VLS_350));
    __VLS_352.slots.default;
    (__VLS_ctx.currentRunTask.name);
    var __VLS_352;
    const __VLS_353 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_354 = __VLS_asFunctionalComponent(__VLS_353, new __VLS_353({
        label: "项目",
    }));
    const __VLS_355 = __VLS_354({
        label: "项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_354));
    __VLS_356.slots.default;
    (__VLS_ctx.currentRunTask.projectName);
    var __VLS_356;
    const __VLS_357 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_358 = __VLS_asFunctionalComponent(__VLS_357, new __VLS_357({
        label: "执行智能体",
    }));
    const __VLS_359 = __VLS_358({
        label: "执行智能体",
    }, ...__VLS_functionalComponentArgsRest(__VLS_358));
    __VLS_360.slots.default;
    (__VLS_ctx.currentRunTask.agentName || '-');
    var __VLS_360;
    const __VLS_361 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_362 = __VLS_asFunctionalComponent(__VLS_361, new __VLS_361({
        label: "状态",
    }));
    const __VLS_363 = __VLS_362({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_362));
    __VLS_364.slots.default;
    (__VLS_ctx.currentRunTask.status);
    var __VLS_364;
    var __VLS_348;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "run-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "run-section-title" },
    });
    const __VLS_365 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_366 = __VLS_asFunctionalComponent(__VLS_365, new __VLS_365({
        modelValue: (__VLS_ctx.runInput),
        type: "textarea",
        rows: (10),
        placeholder: "请输入运行内容",
    }));
    const __VLS_367 = __VLS_366({
        modelValue: (__VLS_ctx.runInput),
        type: "textarea",
        rows: (10),
        placeholder: "请输入运行内容",
    }, ...__VLS_functionalComponentArgsRest(__VLS_366));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "run-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "run-section-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "run-section-title" },
    });
    const __VLS_369 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_370 = __VLS_asFunctionalComponent(__VLS_369, new __VLS_369({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_371 = __VLS_370({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_370));
    let __VLS_373;
    let __VLS_374;
    let __VLS_375;
    const __VLS_376 = {
        onClick: (__VLS_ctx.loadRunHistory)
    };
    __VLS_372.slots.default;
    var __VLS_372;
    if (!__VLS_ctx.runHistory.length && !__VLS_ctx.runHistoryLoading) {
        const __VLS_377 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_378 = __VLS_asFunctionalComponent(__VLS_377, new __VLS_377({
            description: "暂无运行记录",
        }));
        const __VLS_379 = __VLS_378({
            description: "暂无运行记录",
        }, ...__VLS_functionalComponentArgsRest(__VLS_378));
    }
    else {
        const __VLS_381 = {}.ElTimeline;
        /** @type {[typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, ]} */ ;
        // @ts-ignore
        const __VLS_382 = __VLS_asFunctionalComponent(__VLS_381, new __VLS_381({}));
        const __VLS_383 = __VLS_382({}, ...__VLS_functionalComponentArgsRest(__VLS_382));
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.runHistoryLoading) }, null, null);
        __VLS_384.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.runHistory))) {
            const __VLS_385 = {}.ElTimelineItem;
            /** @type {[typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, ]} */ ;
            // @ts-ignore
            const __VLS_386 = __VLS_asFunctionalComponent(__VLS_385, new __VLS_385({
                key: (item.id),
                timestamp: (item.createdAt),
                type: (item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'primary'),
                placement: "top",
            }));
            const __VLS_387 = __VLS_386({
                key: (item.id),
                timestamp: (item.createdAt),
                type: (item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'primary'),
                placement: "top",
            }, ...__VLS_functionalComponentArgsRest(__VLS_386));
            __VLS_388.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "run-history-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "run-history-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.agentName || '-');
            const __VLS_389 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_390 = __VLS_asFunctionalComponent(__VLS_389, new __VLS_389({
                size: "small",
                type: (item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'info'),
            }));
            const __VLS_391 = __VLS_390({
                size: "small",
                type: (item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'info'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_390));
            __VLS_392.slots.default;
            (__VLS_ctx.formatRunStatusLabel(item.status));
            var __VLS_392;
            if (item.requesterName) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "run-history-subtitle" },
                });
                (item.requesterName);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "run-history-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "run-history-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
            (item.input);
            if (item.output) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "run-history-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "run-history-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
                (item.output);
            }
            if (item.errorMessage) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "run-history-block error" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "run-history-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
                (item.errorMessage);
            }
            var __VLS_388;
        }
        var __VLS_384;
    }
}
{
    const { footer: __VLS_thisSlot } = __VLS_344.slots;
    const __VLS_393 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_394 = __VLS_asFunctionalComponent(__VLS_393, new __VLS_393({
        ...{ 'onClick': {} },
    }));
    const __VLS_395 = __VLS_394({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_394));
    let __VLS_397;
    let __VLS_398;
    let __VLS_399;
    const __VLS_400 = {
        onClick: (...[$event]) => {
            __VLS_ctx.runDialogVisible = false;
        }
    };
    __VLS_396.slots.default;
    var __VLS_396;
    const __VLS_401 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_402 = __VLS_asFunctionalComponent(__VLS_401, new __VLS_401({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.runningAgent),
    }));
    const __VLS_403 = __VLS_402({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.runningAgent),
    }, ...__VLS_functionalComponentArgsRest(__VLS_402));
    let __VLS_405;
    let __VLS_406;
    let __VLS_407;
    const __VLS_408 = {
        onClick: (__VLS_ctx.handleRunAgent)
    };
    __VLS_404.slots.default;
    var __VLS_404;
}
var __VLS_344;
/** @type {__VLS_StyleScopedClasses['task-atelier-page']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['task-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['task-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['task-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['task-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['task-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-requirement']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-collaborators']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-hours']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['task-row']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['task-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-title']} */ ;
/** @type {__VLS_StyleScopedClasses['task-primary-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['task-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-project-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['task-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-requirement']} */ ;
/** @type {__VLS_StyleScopedClasses['task-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['task-owner-line']} */ ;
/** @type {__VLS_StyleScopedClasses['task-owner-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['task-owner-name']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-collaborators']} */ ;
/** @type {__VLS_StyleScopedClasses['task-collaborator-list']} */ ;
/** @type {__VLS_StyleScopedClasses['task-collaborator-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['task-collaborator-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['task-empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['task-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-hours']} */ ;
/** @type {__VLS_StyleScopedClasses['list-work-hours-input']} */ ;
/** @type {__VLS_StyleScopedClasses['task-empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['task-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['task-updated-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['task-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['task-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['task-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['task-table-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['task-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['task-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-text']} */ ;
/** @type {__VLS_StyleScopedClasses['task-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['run-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['run-section']} */ ;
/** @type {__VLS_StyleScopedClasses['run-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['run-section']} */ ;
/** @type {__VLS_StyleScopedClasses['run-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['run-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-item']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-title']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-block']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-label']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-block']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-label']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-block']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['run-history-label']} */ ;
// @ts-ignore
var __VLS_197 = __VLS_196;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Delete: Delete,
            EditPen: EditPen,
            Filter: Filter,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Search: Search,
            Tickets: Tickets,
            VideoPlay: VideoPlay,
            MarkdownEditor: MarkdownEditor,
            loading: loading,
            submitting: submitting,
            dialogVisible: dialogVisible,
            runDialogVisible: runDialogVisible,
            runHistoryLoading: runHistoryLoading,
            runningAgent: runningAgent,
            workHoursUpdatingId: workHoursUpdatingId,
            isEditing: isEditing,
            taskList: taskList,
            projectOptions: projectOptions,
            requirementOptions: requirementOptions,
            runHistory: runHistory,
            currentRunTask: currentRunTask,
            runInput: runInput,
            formRef: formRef,
            canManageTasks: canManageTasks,
            pagination: pagination,
            filters: filters,
            taskFilterPopoverVisible: taskFilterPopoverVisible,
            form: form,
            rules: rules,
            projectParticipantUsers: projectParticipantUsers,
            collaboratorSelectableUsers: collaboratorSelectableUsers,
            totalPages: totalPages,
            taskFormWorkHoursLockedReason: taskFormWorkHoursLockedReason,
            formatTaskStatusLabel: formatTaskStatusLabel,
            buildUserLabel: buildUserLabel,
            ownerInitial: ownerInitial,
            taskTypeTone: taskTypeTone,
            taskPriorityTone: taskPriorityTone,
            taskStatusTone: taskStatusTone,
            getRowWorkHoursLockedReason: getRowWorkHoursLockedReason,
            handleTaskMarkdownImageUpload: handleTaskMarkdownImageUpload,
            openRequirementTask: openRequirementTask,
            openTaskDetail: openTaskDetail,
            openTaskProject: openTaskProject,
            formatRunStatusLabel: formatRunStatusLabel,
            loadRunHistory: loadRunHistory,
            handleSearch: handleSearch,
            handleReset: handleReset,
            handleSizeChange: handleSizeChange,
            handlePrevPage: handlePrevPage,
            handleNextPage: handleNextPage,
            handleFilterProjectChange: handleFilterProjectChange,
            handleFormProjectChange: handleFormProjectChange,
            openCreateDialog: openCreateDialog,
            openEditDialog: openEditDialog,
            openRunDialog: openRunDialog,
            handleSubmit: handleSubmit,
            handleRunAgent: handleRunAgent,
            handleQuickWorkHoursChange: handleQuickWorkHoursChange,
            handleDelete: handleDelete,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=TaskView.vue.js.map