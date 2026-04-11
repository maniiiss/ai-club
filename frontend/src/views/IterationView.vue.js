/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Bell, ChatDotRound, Cpu, Delete, EditPen, Filter, FolderOpened, Finished, Management, Plus, RefreshRight, Search, Tickets } from '@element-plus/icons-vue';
import { listUserOptions } from '@/api/access';
import CompactSelectMenu from '@/components/CompactSelectMenu.vue';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import ProjectBurndownChart from '@/components/ProjectBurndownChart.vue';
import RequirementAiDialog from '@/components/RequirementAiDialog.vue';
import WorkItemMemberField from '@/components/WorkItemMemberField.vue';
import { createTaskComment, createIteration, createTask, deleteIteration, deleteTask, getTaskDetail, getProjectBurndown, getIterationBoard, listTaskComments, listProjectWorkItems, passRequirementDev, passRequirementTest, pageProjectWorkItems, updateIteration, updateTask } from '@/api/platform';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notifications';
import { formatRequirementStatusLabel, isRequirementFullyPassed, getTaskWorkHoursLockedReason } from '@/utils/requirementReview';
import { uploadMarkdownImage } from '@/utils/taskImageUpload';
import { buildRequirementDraft, DEFAULT_REQUIREMENT_TEMPLATE, normalizeRequirementDocument, validateRequirementTemplate } from '@/utils/requirementTemplate';
import { renderMarkdownToHtml } from '@/utils/markdown';
const taskStatusOptions = ['草稿', '待开始', '处理中', '已完成', '已阻塞'];
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const projectId = Number(route.params.projectId);
const canManageIteration = computed(() => authStore.hasPermission('project:manage'));
const canManageWorkItem = computed(() => authStore.hasPermission('task:manage'));
const canRequirementDevPass = computed(() => authStore.hasPermission('task:requirement:dev'));
const canRequirementTestPass = computed(() => authStore.hasPermission('task:requirement:test'));
const board = reactive({
    project: {
        id: 0,
        name: '',
        owner: '',
        ownerUserId: null,
        creatorUserId: null,
        memberUserIds: [],
        memberNames: [],
        status: '',
        description: '',
        agentCount: 0,
        taskCount: 0,
        repoCount: 0,
        canEdit: false,
        canDelete: false
    },
    unplannedCount: 0,
    totalWorkItemCount: 0,
    iterations: []
});
/**
 * 当前项目可参与工作项指派的用户集合，包含负责人、创建人和项目成员。
 */
const projectParticipantUserIds = computed(() => {
    const result = new Set();
    if (board.project.ownerUserId != null) {
        result.add(board.project.ownerUserId);
    }
    if (board.project.creatorUserId != null) {
        result.add(board.project.creatorUserId);
    }
    for (const userId of board.project.memberUserIds || []) {
        result.add(userId);
    }
    return Array.from(result);
});
const projectParticipantUsers = computed(() => userOptions.value.filter((item) => projectParticipantUserIds.value.includes(item.id)));
const userOptions = ref([]);
const requirementOptions = ref([]);
const workItems = ref([]);
const burndown = ref(null);
const currentIterationProgress = ref(null);
const burndownDialogVisible = ref(false);
const statusUpdatingId = ref(null);
const workItemLoading = ref(false);
const keyword = ref('');
const activeTypeTab = ref('全部');
const workItemPagination = reactive({ page: 1, size: 10, total: 0 });
const workItemTotalPages = computed(() => Math.max(1, Math.ceil(workItemPagination.total / workItemPagination.size) || 1));
const workItemFilters = reactive({
    status: '',
    priority: '',
    assigneeUserId: undefined
});
const workItemFilterPopoverVisible = ref(false);
const selectedScope = reactive({
    type: 'unplanned',
    iterationId: null
});
const iterationDialogVisible = ref(false);
const iterationEditing = ref(false);
const iterationSubmitting = ref(false);
const currentIterationId = ref(null);
const iterationFormRef = ref();
const iterationForm = reactive({
    name: '',
    goal: '',
    status: '未开始',
    description: '',
    sortOrder: 0
});
const iterationDateRange = ref([]);
const workItemDialogVisible = ref(false);
const workItemEditing = ref(false);
const workItemSubmitting = ref(false);
const workItemDialogClosing = ref(false);
const currentWorkItemId = ref(null);
const workItemAssigneeFallback = ref('');
const commentDialogVisible = ref(false);
const commentLoading = ref(false);
const commentSubmitting = ref(false);
const commentImagePreviewVisible = ref(false);
const commentImagePreviewSrc = ref('');
const requirementAiDialogVisible = ref(false);
const currentRequirementAiTask = ref(null);
const currentDialogWorkItem = ref(null);
const legacyRequirementNeedsUpgrade = ref(false);
const legacyRequirementPreview = ref('');
const currentCommentTask = ref(null);
const taskComments = ref([]);
const workItemFormRef = ref();
const commentForm = reactive({
    content: ''
});
const workItemForm = reactive({
    workItemCode: '',
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
    agentId: null,
    iterationId: null,
    requirementTaskId: null
});
const iterationRules = {
    name: [{ required: true, message: '请输入迭代名称', trigger: 'blur' }],
    status: [{ required: true, message: '请选择迭代状态', trigger: 'change' }]
};
const workItemRules = {
    name: [{ required: true, message: '请输入工作项标题', trigger: 'blur' }],
    workItemType: [{ required: true, message: '请选择工作项类型', trigger: 'change' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }],
    priority: [{ required: true, message: '请选择优先级', trigger: 'change' }]
};
const buildUserLabel = (item) => {
    return item.nickname?.trim() || item.username;
};
const isRequirementWorkItem = computed(() => workItemForm.workItemType === '需求');
const requirementDocumentPlaceholder = computed(() => `${DEFAULT_REQUIREMENT_TEMPLATE}\n\n可在各章节中继续插入图片、链接、表格等 Markdown 内容。`);
const requirementSelectableOptions = computed(() => requirementOptions.value.filter((item) => item.id !== currentWorkItemId.value));
const selectedRequirementForWorkHours = computed(() => requirementOptions.value.find((item) => item.id === workItemForm.requirementTaskId) || null);
const workItemWorkHoursLockedReason = computed(() => {
    if (workItemForm.workItemType !== '任务' || !selectedRequirementForWorkHours.value) {
        return '';
    }
    return isRequirementFullyPassed(selectedRequirementForWorkHours.value)
        ? ''
        : '需关联需求开发、测试均通过后才可编辑';
});
const workItemDisplayCode = computed(() => {
    return workItemForm.workItemCode || '保存后自动生成';
});
const workItemPriorityTone = computed(() => {
    if (workItemForm.priority === '高')
        return 'high';
    if (workItemForm.priority === '低')
        return 'low';
    return 'medium';
});
const workItemPriorityBadge = computed(() => {
    if (workItemForm.priority === '高')
        return 'P0 - 高优先级';
    if (workItemForm.priority === '低')
        return 'P2 - 低优先级';
    return 'P1 - 中优先级';
});
const workItemStatusDisplay = computed(() => currentDialogWorkItem.value ? formatTaskStatusLabel(currentDialogWorkItem.value) : workItemForm.status || '草稿');
const workItemStatusTone = computed(() => workItemTone(workItemForm.status));
// 让编辑器直接撑满抽屉剩余空间，避免底部删除信息区后出现视觉留白。
// 工作项抽屉中的 Markdown 编辑器不再拉满剩余空间，避免顶部出现大片空白。
const workItemEditorHeight = computed(() => 'clamp(320px, 42vh, 420px)');
const workItemDialogUpdatedAt = computed(() => currentDialogWorkItem.value?.updatedAt || '保存后生成');
const hasWorkItemPlanDateRange = (task) => Boolean(task.planStartDate && task.planEndDate);
/**
 * 列表只在计划开始和结束都存在时展示完整范围，
 * 任一端缺失时统一回退为“未设置”态，避免给用户造成排期已完整配置的误解。
 */
const formatWorkItemPlanDateRange = (planStartDate, planEndDate) => {
    if (!planStartDate || !planEndDate) {
        return '';
    }
    return `${planStartDate} ~ ${planEndDate}`;
};
const syncWorkItemAssignee = () => {
    const selected = userOptions.value.find((item) => item.id === workItemForm.assigneeUserId);
    workItemForm.assignee = selected?.nickname?.trim() || selected?.username || workItemAssigneeFallback.value;
    workItemForm.collaboratorUserIds = workItemForm.collaboratorUserIds.filter((item) => item !== workItemForm.assigneeUserId);
};
const currentIteration = computed(() => board.iterations.find((item) => item.id === selectedScope.iterationId) || null);
const currentScopeTitle = computed(() => {
    if (selectedScope.type === 'unplanned')
        return '未规划工作项';
    return currentIteration.value?.name || '迭代工作项';
});
const currentScopeDescription = computed(() => {
    if (selectedScope.type === 'unplanned') {
        return '当前展示尚未分配到任何迭代的工作项';
    }
    const iteration = currentIteration.value;
    if (!iteration)
        return '';
    return `目标：${iteration.goal || '未设置'}`;
});
const workspaceStatCards = computed(() => {
    const totalItems = currentIterationProgress.value?.total ?? workItems.value.length;
    const completed = currentIterationProgress.value?.completed ?? workItems.value.filter((item) => isCompletedStatus(item.status)).length;
    const defects = workItems.value.filter((item) => item.workItemType === '缺陷').length;
    const openTasks = workItems.value.filter((item) => !isCompletedStatus(item.status)).length;
    const velocity = totalItems ? Number(((completed / Math.max(totalItems, 1)) * 50).toFixed(1)) : 0;
    const burnRate = currentIterationProgress.value?.percent ?? 0;
    return [
        { label: '迭代速度', value: velocity.toFixed(1), highlight: completed ? `+${completed}%` : '', progress: Math.min(100, Math.round(velocity * 2)), progressTone: 'primary', subtext: '' },
        { label: '未完成项', value: String(openTasks), highlight: '', progress: undefined, progressTone: '', subtext: `${totalItems ? Math.round((openTasks / totalItems) * 100) : 0}% 处理中`, dots: 0, activeDots: 0 },
        { label: '缺陷数', value: String(defects), highlight: defects > 0 ? '风险偏高' : '', progress: Math.min(100, defects * 8), progressTone: 'danger', subtext: '', dots: 0, activeDots: 0 },
        { label: '燃尽率', value: `${burnRate}%`, highlight: '', progress: undefined, progressTone: '', subtext: '', dots: 4, activeDots: Math.max(1, Math.round(burnRate / 25)) }
    ];
});
const unplannedProgressPercent = computed(() => {
    if (!board.unplannedCount) {
        return 0;
    }
    const base = Math.min(100, Math.max(16, board.unplannedCount * 12));
    return base;
});
const iterationStatusType = (status) => {
    if (status === '进行中')
        return 'success';
    if (status === '已完成')
        return 'info';
    return 'warning';
};
const handleOpenNotificationsProxy = async () => {
    await notificationStore.openDrawer();
};
const setTypeTab = async (tab) => {
    if (activeTypeTab.value === tab) {
        return;
    }
    activeTypeTab.value = tab;
    await handleTypeTabChange();
};
const formatCompactDateRange = (startDate, endDate) => {
    if (!startDate && !endDate) {
        return '未设置周期';
    }
    const start = startDate ? startDate.slice(5) : '--';
    const end = endDate ? endDate.slice(5) : '--';
    return `${start} ~ ${end}`;
};
const iterationSidebarPercent = (item) => {
    if (selectedScope.type === 'iteration' && selectedScope.iterationId === item.id && currentIterationProgress.value) {
        return currentIterationProgress.value.percent;
    }
    if (item.status === '已完成')
        return 100;
    if (item.status === '进行中')
        return 68;
    return 22;
};
const iterationStatusIcon = (status) => {
    if (status === '已完成')
        return '✔';
    if (status === '进行中')
        return '≡';
    return '◷';
};
// 复用任务管理列表的胶囊配色，让迭代列表和任务管理在视觉上保持同一套语义。
const workItemTypeTone = (type) => {
    if (type === '需求')
        return 'requirement';
    if (type === '缺陷')
        return 'defect';
    return 'task';
};
const workItemTone = (status) => {
    if (['进行中', '开发中', '处理中'].includes(status || ''))
        return 'running';
    if (['已完成', '完成'].includes(status || ''))
        return 'done';
    if (status === '已阻塞' || status === '阻塞')
        return 'blocked';
    return 'backlog';
};
const workspacePriorityTone = (priority) => {
    if (priority === '高')
        return 'high';
    if (priority === '低')
        return 'low';
    return 'medium';
};
const ownerInitial = (value) => (value || 'UN').slice(0, 2).toUpperCase();
const isCompletedStatus = (status) => status === '已完成' || status === '完成';
const taskStatusSelectOptions = [
    { label: '草稿', value: '草稿', tone: 'info' },
    { label: '待开始', value: '待开始', tone: 'warning' },
    { label: '处理中', value: '处理中', tone: 'primary' },
    { label: '已完成', value: '已完成', tone: 'success' },
    { label: '已阻塞', value: '已阻塞', tone: 'danger' }
];
const prioritySelectOptions = [
    { label: '高', value: '高', tone: 'danger' },
    { label: '中', value: '中', tone: 'warning' },
    { label: '低', value: '低', tone: 'info' }
];
const assigneeSelectOptions = computed(() => [
    { label: '未分配', value: -1, tone: 'info' },
    ...projectParticipantUsers.value.map((item) => ({
        label: buildUserLabel(item),
        value: item.id,
        tone: 'primary'
    }))
]);
const formatDateRange = (startDate, endDate) => {
    if (startDate && endDate)
        return `${startDate} 至 ${endDate}`;
    if (startDate)
        return `开始：${startDate}`;
    if (endDate)
        return `结束：${endDate}`;
    return '未设置计划时间';
};
const resetIterationForm = () => {
    currentIterationId.value = null;
    iterationForm.name = '';
    iterationForm.goal = '';
    iterationForm.status = '未开始';
    iterationForm.description = '';
    iterationForm.sortOrder = board.iterations.length;
    iterationDateRange.value = [];
    iterationFormRef.value?.clearValidate();
};
const resetWorkItemForm = () => {
    currentWorkItemId.value = null;
    currentDialogWorkItem.value = null;
    workItemForm.workItemCode = '';
    workItemForm.name = '';
    workItemForm.workItemType = '任务';
    workItemForm.status = '草稿';
    workItemForm.priority = '中';
    workItemForm.workHours = null;
    workItemForm.planStartDate = null;
    workItemForm.planEndDate = null;
    workItemForm.assignee = '';
    workItemAssigneeFallback.value = '';
    workItemForm.assigneeUserId = null;
    workItemForm.collaboratorUserIds = [];
    workItemForm.description = '';
    workItemForm.requirementMarkdown = '';
    workItemForm.prototypeUrl = '';
    workItemForm.agentId = null;
    workItemForm.iterationId = selectedScope.type === 'iteration' ? selectedScope.iterationId : null;
    workItemForm.requirementTaskId = null;
    legacyRequirementNeedsUpgrade.value = false;
    legacyRequirementPreview.value = '';
    workItemFormRef.value?.clearValidate();
};
const resetCommentForm = () => {
    commentForm.content = '';
};
const normalizeCommentContent = (value) => value.trim();
const renderCommentContent = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return '<p>-</p>';
    }
    return /<\/?[a-z][\s\S]*>/i.test(trimmed) ? trimmed : renderMarkdownToHtml(trimmed);
};
const handleTaskMarkdownImageUpload = (file) => uploadMarkdownImage(file);
const validateRequirementForm = () => {
    if (!isRequirementWorkItem.value) {
        return '';
    }
    // 需求改为模板化文档后，原型链接与固定章节都需要在提交前完成校验。
    if (!workItemForm.prototypeUrl.trim()) {
        return '请输入原型链接';
    }
    return validateRequirementTemplate(workItemForm.requirementMarkdown);
};
const formatTaskStatusLabel = (task) => {
    if (!task) {
        return '-';
    }
    return formatRequirementStatusLabel(task);
};
// 将 Markdown 描述压平成单行摘要，避免需求文档把列表行高撑得过大。
const formatWorkItemPreview = (task) => {
    const source = (task.description || task.requirementMarkdown || '').trim();
    if (!source) {
        return '暂无说明';
    }
    return source
        .replace(/!\[[^\]]*]\([^)]+\)/g, '图片')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`>#*_~\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || '暂无说明';
};
// 统一格式化列表里的更新时间，兼容后端返回 ISO 字符串和空值场景。
const formatWorkItemUpdatedAt = (value) => {
    if (!value) {
        return '-';
    }
    return value.replace('T', ' ').slice(0, 16);
};
const getRowWorkHoursLockedReason = (task) => {
    if (task.workItemType !== '任务') {
        return '';
    }
    return getTaskWorkHoursLockedReason(task);
};
const openRequirementAiDialog = (item) => {
    currentRequirementAiTask.value = item;
    requirementAiDialogVisible.value = true;
};
const handleRequirementAiChanged = async () => {
    await Promise.all([loadBoard(), loadWorkItems(), loadCurrentIterationProgress()]);
    if (currentCommentTask.value && currentRequirementAiTask.value && currentCommentTask.value.id === currentRequirementAiTask.value.id) {
        await loadTaskCommentList();
    }
};
const handleRequirementDevPass = async (task) => {
    try {
        await passRequirementDev(task.id);
        ElMessage.success('需求已开发通过');
        await refreshBoardAndItems();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '开发通过失败');
    }
};
const handleRequirementTestPass = async (task) => {
    try {
        await passRequirementTest(task.id);
        ElMessage.success('需求已测试通过');
        await refreshBoardAndItems();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '测试通过失败');
    }
};
const handleCommentImagePreview = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }
    const image = target.closest('.comment-item-content img');
    if (!(image instanceof HTMLImageElement) || !image.src) {
        return;
    }
    commentImagePreviewSrc.value = image.src;
    commentImagePreviewVisible.value = true;
};
const openRequirementTask = async (taskId) => {
    if (!taskId) {
        return;
    }
    await openWorkItemDetailById(taskId);
};
/**
 * 统一解析可分享链接中的工作项详情参数，保证 URL、左侧选中迭代和详情抽屉始终指向同一个工作项。
 */
const openTaskFromQuery = async (taskId) => {
    const targetTaskId = taskId ?? Number(route.query.openTaskId);
    if (Number.isNaN(targetTaskId) || targetTaskId <= 0) {
        return;
    }
    try {
        const task = await getTaskDetail(targetTaskId);
        if (task.projectId !== projectId) {
            await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' });
            return;
        }
        selectedScope.type = task.iterationId ? 'iteration' : 'unplanned';
        selectedScope.iterationId = task.iterationId;
        workItemPagination.page = 1;
        await Promise.all([loadWorkItems(), loadCurrentIterationProgress()]);
        openEditWorkItemDialog(task);
        await syncWorkItemRouteQuery({
            iterationId: task.iterationId,
            openTaskId: task.id,
            mode: 'replace'
        });
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '打开工作项详情失败');
        await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' });
    }
};
const goBack = () => {
    router.push({ name: 'projects' });
};
/**
 * 统一维护迭代管理页面的深链参数，只改动迭代与工作项详情相关字段，其余查询参数保持不变。
 */
const syncWorkItemRouteQuery = async ({ iterationId = selectedScope.type === 'iteration' ? selectedScope.iterationId : null, openTaskId = route.query.openTaskId ? Number(route.query.openTaskId) : null, mode = 'replace' }) => {
    const nextQuery = { ...route.query };
    if (iterationId) {
        nextQuery.iterationId = String(iterationId);
    }
    else {
        delete nextQuery.iterationId;
    }
    if (openTaskId) {
        nextQuery.openTaskId = String(openTaskId);
    }
    else {
        delete nextQuery.openTaskId;
    }
    const currentIterationId = route.query.iterationId ? String(route.query.iterationId) : '';
    const currentOpenTaskId = route.query.openTaskId ? String(route.query.openTaskId) : '';
    const nextIterationId = iterationId ? String(iterationId) : '';
    const nextOpenTaskId = openTaskId ? String(openTaskId) : '';
    if (currentIterationId === nextIterationId && currentOpenTaskId === nextOpenTaskId) {
        return;
    }
    await router[mode]({ name: 'project-iterations', params: { projectId }, query: nextQuery });
};
const syncIterationQuery = async (iterationId) => {
    await syncWorkItemRouteQuery({ iterationId, mode: 'replace' });
};
/**
 * 用户从列表点击工作项时，优先把当前工作项写入 URL，再交给路由监听统一打开详情，确保链接可复制分享。
 */
const openWorkItemDetailFromRow = async (item) => {
    const currentTaskId = Number(route.query.openTaskId);
    const currentIterationId = route.query.iterationId ? Number(route.query.iterationId) : null;
    const targetIterationId = item.iterationId ?? null;
    if (currentTaskId === item.id && currentIterationId === targetIterationId) {
        await openTaskFromQuery(item.id);
        return;
    }
    await syncWorkItemRouteQuery({
        iterationId: targetIterationId,
        openTaskId: item.id,
        mode: 'push'
    });
};
/**
 * 某些入口只有工作项 ID，需要先补齐工作项详情后再生成标准分享链接。
 */
const openWorkItemDetailById = async (taskId) => {
    const currentTaskId = Number(route.query.openTaskId);
    if (currentTaskId === taskId) {
        await openTaskFromQuery(taskId);
        return;
    }
    try {
        const task = await getTaskDetail(taskId);
        if (task.projectId !== projectId) {
            return;
        }
        await syncWorkItemRouteQuery({
            iterationId: task.iterationId,
            openTaskId: task.id,
            mode: 'push'
        });
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '打开工作项详情失败');
    }
};
/**
 * 统一关闭详情抽屉，并在关闭时清理分享链接中的工作项参数，保留当前迭代上下文。
 */
const closeWorkItemDetail = async () => {
    if (workItemDialogClosing.value) {
        return;
    }
    workItemDialogClosing.value = true;
    try {
        await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' });
        workItemDialogVisible.value = false;
    }
    finally {
        workItemDialogClosing.value = false;
    }
};
/**
 * 兼容抽屉遮罩点击、按 Esc 等系统关闭动作，避免这类关闭路径遗漏 URL 清理。
 */
const handleWorkItemDrawerBeforeClose = async (done) => {
    if (workItemDialogClosing.value) {
        done();
        return;
    }
    workItemDialogClosing.value = true;
    try {
        await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' });
        done();
    }
    finally {
        workItemDialogClosing.value = false;
    }
};
const handleWorkItemDialogClosed = () => {
    resetWorkItemForm();
};
const selectUnplanned = async () => {
    selectedScope.type = 'unplanned';
    selectedScope.iterationId = null;
    workItemPagination.page = 1;
    await Promise.all([loadWorkItems(), loadCurrentIterationProgress(), syncIterationQuery(null)]);
};
const selectIteration = async (item) => {
    selectedScope.type = 'iteration';
    selectedScope.iterationId = item.id;
    workItemPagination.page = 1;
    await Promise.all([loadWorkItems(), loadCurrentIterationProgress(), syncIterationQuery(item.id)]);
};
const loadBoard = async () => {
    const [boardData, users, burndownData, requirements] = await Promise.all([
        getIterationBoard(projectId),
        listUserOptions(),
        getProjectBurndown(projectId),
        listProjectWorkItems(projectId, { workItemType: '需求' })
    ]);
    board.project = boardData.project;
    board.unplannedCount = boardData.unplannedCount;
    board.totalWorkItemCount = boardData.totalWorkItemCount;
    board.iterations = boardData.iterations;
    userOptions.value = users;
    burndown.value = burndownData;
    requirementOptions.value = requirements;
    const routeIterationId = Number(route.query.iterationId);
    if (!Number.isNaN(routeIterationId) && routeIterationId > 0 && board.iterations.some((item) => item.id === routeIterationId)) {
        selectedScope.type = 'iteration';
        selectedScope.iterationId = routeIterationId;
    }
    if (selectedScope.type === 'iteration') {
        const exists = board.iterations.some((item) => item.id === selectedScope.iterationId);
        if (!exists) {
            selectedScope.type = board.iterations.length > 0 ? 'iteration' : 'unplanned';
            selectedScope.iterationId = board.iterations.length > 0 ? board.iterations[0].id : null;
        }
    }
    else if (selectedScope.iterationId === null && board.iterations.length > 0 && board.unplannedCount === 0) {
        selectedScope.type = 'iteration';
        selectedScope.iterationId = board.iterations[0].id;
    }
};
const loadWorkItems = async () => {
    workItemLoading.value = true;
    try {
        const pageData = await pageProjectWorkItems(projectId, {
            page: workItemPagination.page,
            size: workItemPagination.size,
            iterationId: selectedScope.type === 'iteration' ? selectedScope.iterationId || undefined : undefined,
            unplanned: selectedScope.type === 'unplanned' ? true : undefined,
            workItemType: activeTypeTab.value,
            keyword: keyword.value,
            status: workItemFilters.status || undefined,
            priority: workItemFilters.priority || undefined,
            assigneeUserId: workItemFilters.assigneeUserId
        });
        workItems.value = pageData.records;
        workItemPagination.total = pageData.total;
        if (currentCommentTask.value) {
            currentCommentTask.value = pageData.records.find((item) => item.id === currentCommentTask.value?.id) || currentCommentTask.value;
        }
    }
    finally {
        workItemLoading.value = false;
    }
};
const loadCurrentIterationProgress = async () => {
    if (selectedScope.type !== 'iteration' || !selectedScope.iterationId) {
        currentIterationProgress.value = null;
        return;
    }
    const allItems = await listProjectWorkItems(projectId, {
        iterationId: selectedScope.iterationId,
        workItemType: '全部'
    });
    const total = allItems.length;
    const completed = allItems.filter((item) => isCompletedStatus(item.status)).length;
    const remaining = Math.max(total - completed, 0);
    currentIterationProgress.value = {
        total,
        completed,
        remaining,
        percent: total ? Math.round((completed / total) * 100) : 0
    };
};
const refreshBoardAndItems = async () => {
    await loadBoard();
    await Promise.all([loadWorkItems(), loadCurrentIterationProgress()]);
};
const handleTypeTabChange = async () => {
    workItemPagination.page = 1;
    await loadWorkItems();
};
const handleFilterSearch = async () => {
    workItemFilterPopoverVisible.value = false;
    workItemPagination.page = 1;
    await loadWorkItems();
};
const handleFilterReset = async () => {
    workItemFilterPopoverVisible.value = false;
    workItemFilters.status = '';
    workItemFilters.priority = '';
    workItemFilters.assigneeUserId = undefined;
    keyword.value = '';
    activeTypeTab.value = '全部';
    workItemPagination.page = 1;
    await loadWorkItems();
};
const handlePageSizeChange = async () => {
    workItemPagination.page = 1;
    await loadWorkItems();
};
const handleWorkItemPrevPage = async () => {
    if (workItemPagination.page <= 1)
        return;
    workItemPagination.page -= 1;
    await loadWorkItems();
};
const handleWorkItemNextPage = async () => {
    if (workItemPagination.page >= workItemTotalPages.value)
        return;
    workItemPagination.page += 1;
    await loadWorkItems();
};
const openCreateIterationDialog = () => {
    if (!canManageIteration.value) {
        return;
    }
    iterationEditing.value = false;
    resetIterationForm();
    iterationDialogVisible.value = true;
};
const openEditIterationDialog = (item) => {
    if (!canManageIteration.value) {
        return;
    }
    iterationEditing.value = true;
    currentIterationId.value = item.id;
    iterationForm.name = item.name;
    iterationForm.goal = item.goal;
    iterationForm.status = item.status;
    iterationForm.description = item.description;
    iterationForm.sortOrder = item.sortOrder;
    iterationDateRange.value = [item.startDate || '', item.endDate || ''].filter(Boolean);
    iterationDialogVisible.value = true;
};
const handleSubmitIteration = async () => {
    if (!canManageIteration.value) {
        return;
    }
    const valid = await iterationFormRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    iterationSubmitting.value = true;
    try {
        const payload = {
            name: iterationForm.name,
            goal: iterationForm.goal,
            status: iterationForm.status,
            startDate: iterationDateRange.value[0] || '',
            endDate: iterationDateRange.value[1] || '',
            description: iterationForm.description,
            sortOrder: iterationForm.sortOrder
        };
        if (iterationEditing.value && currentIterationId.value !== null) {
            await updateIteration(projectId, currentIterationId.value, payload);
            ElMessage.success('迭代已更新');
        }
        else {
            await createIteration(projectId, payload);
            ElMessage.success('迭代已创建');
        }
        iterationDialogVisible.value = false;
        await refreshBoardAndItems();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存失败');
    }
    finally {
        iterationSubmitting.value = false;
    }
};
const handleDeleteIteration = async (item) => {
    if (!canManageIteration.value || !item.canDelete) {
        return;
    }
    try {
        await ElMessageBox.confirm('删除迭代后，迭代下的工作项会转为未规划工作项，是否继续？', '提示', { type: 'warning' });
        await deleteIteration(projectId, item.id);
        ElMessage.success('迭代已删除');
        await refreshBoardAndItems();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
const openCreateWorkItemDialog = () => {
    workItemEditing.value = false;
    resetWorkItemForm();
    workItemDialogVisible.value = true;
};
const openEditWorkItemDialog = (item) => {
    workItemEditing.value = true;
    currentDialogWorkItem.value = item;
    currentWorkItemId.value = item.id;
    workItemForm.workItemCode = item.workItemCode;
    workItemForm.name = item.name;
    workItemForm.workItemType = item.workItemType;
    workItemForm.status = item.status;
    workItemForm.priority = item.priority;
    workItemForm.workHours = item.workHours;
    workItemForm.planStartDate = item.planStartDate;
    workItemForm.planEndDate = item.planEndDate;
    workItemForm.assignee = item.assignee;
    workItemAssigneeFallback.value = item.assigneeUserId ? '' : item.assignee;
    workItemForm.assigneeUserId = item.assigneeUserId;
    workItemForm.collaboratorUserIds = [...item.collaboratorUserIds];
    workItemForm.description = item.description;
    if (item.workItemType === '需求') {
        // 历史需求只有 description 时，这里自动包装成新模板草稿，方便用户补齐后直接保存升级。
        const requirementDraft = buildRequirementDraft(item.requirementMarkdown, item.description);
        workItemForm.requirementMarkdown = requirementDraft.markdown;
        workItemForm.prototypeUrl = item.prototypeUrl || '';
        legacyRequirementNeedsUpgrade.value = requirementDraft.upgradedFromLegacy;
        legacyRequirementPreview.value = !item.requirementMarkdown && item.description ? item.description : '';
    }
    else {
        workItemForm.requirementMarkdown = '';
        workItemForm.prototypeUrl = '';
        legacyRequirementNeedsUpgrade.value = false;
        legacyRequirementPreview.value = '';
    }
    workItemForm.agentId = item.agentId;
    workItemForm.iterationId = item.iterationId;
    workItemForm.requirementTaskId = item.requirementTaskId;
    workItemDialogVisible.value = true;
};
const loadTaskCommentList = async () => {
    if (!currentCommentTask.value) {
        taskComments.value = [];
        return;
    }
    commentLoading.value = true;
    try {
        taskComments.value = await listTaskComments(currentCommentTask.value.id);
    }
    finally {
        commentLoading.value = false;
    }
};
const openCommentDialog = async (item) => {
    currentCommentTask.value = item;
    resetCommentForm();
    commentDialogVisible.value = true;
    await loadTaskCommentList();
};
const handleSubmitComment = async () => {
    if (!currentCommentTask.value) {
        return;
    }
    const content = normalizeCommentContent(commentForm.content);
    if (!content) {
        ElMessage.warning('请输入评论内容');
        return;
    }
    commentSubmitting.value = true;
    try {
        await createTaskComment(currentCommentTask.value.id, content);
        resetCommentForm();
        await Promise.all([loadTaskCommentList(), loadWorkItems()]);
        ElMessage.success('评论已发布');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '评论发布失败');
    }
    finally {
        commentSubmitting.value = false;
    }
};
const handleSubmitWorkItem = async () => {
    if (!canManageWorkItem.value) {
        return;
    }
    const valid = await workItemFormRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    if (workItemForm.planStartDate && workItemForm.planEndDate && workItemForm.planEndDate < workItemForm.planStartDate) {
        ElMessage.warning('计划结束日期不能早于计划开始日期');
        return;
    }
    const requirementValidationMessage = validateRequirementForm();
    if (requirementValidationMessage) {
        ElMessage.warning(requirementValidationMessage);
        return;
    }
    if (workItemForm.workItemType === '任务' && workItemWorkHoursLockedReason.value && workItemForm.workHours !== null) {
        ElMessage.warning(workItemWorkHoursLockedReason.value);
        return;
    }
    workItemSubmitting.value = true;
    try {
        syncWorkItemAssignee();
        const normalizedRequirementMarkdown = isRequirementWorkItem.value
            ? normalizeRequirementDocument(workItemForm.requirementMarkdown)
            : '';
        const payload = {
            name: workItemForm.name,
            workItemType: workItemForm.workItemType,
            status: workItemForm.status,
            priority: workItemForm.priority,
            workHours: workItemForm.workItemType === '任务' ? workItemForm.workHours : null,
            planStartDate: workItemForm.planStartDate,
            planEndDate: workItemForm.planEndDate,
            assignee: workItemForm.assignee,
            assigneeUserId: workItemForm.assigneeUserId,
            collaboratorUserIds: workItemForm.collaboratorUserIds,
            description: isRequirementWorkItem.value ? normalizedRequirementMarkdown : workItemForm.description,
            requirementMarkdown: normalizedRequirementMarkdown,
            prototypeUrl: isRequirementWorkItem.value ? workItemForm.prototypeUrl.trim() : '',
            projectId,
            agentId: workItemForm.agentId,
            iterationId: workItemForm.iterationId,
            requirementTaskId: workItemForm.workItemType === '需求' ? null : workItemForm.requirementTaskId
        };
        if (workItemEditing.value && currentWorkItemId.value !== null) {
            await updateTask(currentWorkItemId.value, payload);
            ElMessage.success('工作项已更新');
        }
        else {
            await createTask(payload);
            ElMessage.success('工作项已创建');
        }
        await closeWorkItemDetail();
        await refreshBoardAndItems();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存失败');
    }
    finally {
        workItemSubmitting.value = false;
    }
};
const handleDeleteWorkItem = async (item) => {
    if (!canManageWorkItem.value || !item.canDelete) {
        return;
    }
    try {
        await ElMessageBox.confirm(`确认删除工作项“${item.name}”吗？`, '提示', { type: 'warning' });
        await deleteTask(item.id);
        ElMessage.success('工作项已删除');
        await refreshBoardAndItems();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
const updateInlineWorkItem = async (row, overrides) => {
    statusUpdatingId.value = row.id;
    try {
        const nextAssigneeUserId = overrides.assigneeUserId === undefined ? row.assigneeUserId : overrides.assigneeUserId;
        const nextAssignee = overrides.assignee !== undefined
            ? overrides.assignee
            : nextAssigneeUserId === null
                ? '未分配'
                : buildUserLabel(userOptions.value.find((item) => item.id === nextAssigneeUserId) || { id: 0, username: '未分配', nickname: '', enabled: true });
        const nextCollaboratorUserIds = (overrides.collaboratorUserIds ?? row.collaboratorUserIds).filter((item) => item !== nextAssigneeUserId);
        const updated = await updateTask(row.id, {
            name: row.name,
            workItemType: row.workItemType,
            status: overrides.status ?? row.status,
            priority: overrides.priority ?? row.priority,
            workHours: overrides.workHours === undefined ? row.workHours : overrides.workHours,
            planStartDate: row.planStartDate,
            planEndDate: row.planEndDate,
            assignee: nextAssignee,
            assigneeUserId: nextAssigneeUserId,
            collaboratorUserIds: nextCollaboratorUserIds,
            description: row.description,
            requirementMarkdown: row.requirementMarkdown,
            prototypeUrl: row.prototypeUrl,
            projectId: row.projectId,
            agentId: row.agentId,
            iterationId: row.iterationId,
            requirementTaskId: row.requirementTaskId
        });
        Object.assign(row, updated);
        await Promise.all([loadBoard(), loadCurrentIterationProgress(), loadWorkItems()]);
        ElMessage.success('工作项已更新');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '更新失败');
    }
    finally {
        statusUpdatingId.value = null;
    }
};
const handleQuickStatusChange = async (row, status) => {
    if (row.status === status) {
        return;
    }
    await updateInlineWorkItem(row, { status });
};
const handleQuickPriorityChange = async (row, priority) => {
    if (row.priority === priority) {
        return;
    }
    await updateInlineWorkItem(row, { priority });
};
const handleQuickWorkHoursChange = async (row, value) => {
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
    await updateInlineWorkItem(row, { workHours: formattedValue });
};
const handleQuickAssigneeChange = async (row, assigneeUserId) => {
    const normalizedAssigneeUserId = assigneeUserId <= 0 ? null : assigneeUserId;
    if (row.assigneeUserId === normalizedAssigneeUserId) {
        return;
    }
    await updateInlineWorkItem(row, { assigneeUserId: normalizedAssigneeUserId });
};
watch(() => route.query.iterationId, async (value) => {
    const nextIterationId = Number(value);
    if (!value || Number.isNaN(nextIterationId) || nextIterationId <= 0) {
        return;
    }
    if (selectedScope.type === 'iteration' && selectedScope.iterationId === nextIterationId) {
        return;
    }
    if (!board.iterations.some((item) => item.id === nextIterationId)) {
        return;
    }
    selectedScope.type = 'iteration';
    selectedScope.iterationId = nextIterationId;
    workItemPagination.page = 1;
    await Promise.all([loadWorkItems(), loadCurrentIterationProgress()]);
});
watch(() => route.query.openTaskId, async (value, previousValue) => {
    if (!value) {
        if (previousValue && workItemDialogVisible.value && !workItemDialogClosing.value) {
            workItemDialogVisible.value = false;
        }
        return;
    }
    const nextTaskId = Number(value);
    if (Number.isNaN(nextTaskId) || nextTaskId <= 0) {
        return;
    }
    if (value === previousValue && workItemDialogVisible.value && currentWorkItemId.value === nextTaskId) {
        return;
    }
    await openTaskFromQuery(nextTaskId);
});
watch(() => workItemForm.assigneeUserId, () => {
    // 组合字段支持同面板切换角色，这里实时兜底一次，避免表单状态里残留重复成员。
    syncWorkItemAssignee();
});
watch(() => workItemForm.workItemType, (workItemType, previousType) => {
    if (workItemType === '需求') {
        // 用户切换到需求类型时，自动带出固定模板，并清空关联需求关系。
        workItemForm.requirementTaskId = null;
        workItemForm.workHours = null;
        if (!workItemForm.requirementMarkdown.trim()) {
            workItemForm.requirementMarkdown = DEFAULT_REQUIREMENT_TEMPLATE;
        }
        return;
    }
    if (workItemType !== '任务') {
        workItemForm.workHours = null;
    }
    if (previousType === '需求') {
        // 从需求切回普通工作项时，清理模板字段，避免无关数据残留。
        workItemForm.requirementMarkdown = '';
        workItemForm.prototypeUrl = '';
        legacyRequirementNeedsUpgrade.value = false;
        legacyRequirementPreview.value = '';
    }
});
onMounted(async () => {
    if (Number.isNaN(projectId) || projectId <= 0) {
        ElMessage.error('项目参数不正确');
        goBack();
        return;
    }
    try {
        await refreshBoardAndItems();
        await openTaskFromQuery();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载迭代管理数据失败');
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['workspace-brand-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-search']} */ ;
/** @type {__VLS_StyleScopedClasses['el-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-search']} */ ;
/** @type {__VLS_StyleScopedClasses['header-notification-button']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-value-row']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-primary-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-item-code']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-item-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-item-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-owner-line']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-collaborator-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-pagination-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['iteration-filter-popper']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['work-hours-input']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['running']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['done']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['blocked']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['backlog']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-priority-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['high']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-priority-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['medium']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-priority-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['low']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-inline-pair']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-inline-pair']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input-number']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-textarea__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input-number']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-textarea__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-hours-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item__content']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-item']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-item']} */ ;
/** @type {__VLS_StyleScopedClasses['iteration-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar-list']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-topbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-search']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-topbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-pagination-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-pagination-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['header-profile-group']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-header']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-header-side']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-top']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-body']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-input-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-input-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-inline-pair']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "iteration-workspace" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "workspace-sidebar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-sidebar-brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-brand-mark" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.FolderOpened;
/** @type {[typeof __VLS_components.FolderOpened, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-brand-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.board.project.name || '项目迭代');
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-sidebar-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.selectUnplanned) },
    ...{ class: "workspace-iteration-card" },
    ...{ class: ({ active: __VLS_ctx.selectedScope.type === 'unplanned' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-iteration-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-iteration-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-iteration-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-iteration-date" },
});
(__VLS_ctx.board.unplannedCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-iteration-progress" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-iteration-progress-fill" },
    ...{ style: ({ width: `${__VLS_ctx.unplannedProgressPercent}%` }) },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.board.iterations))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectIteration(item);
            } },
        key: (item.id),
        ...{ class: "workspace-iteration-card" },
        ...{ class: ({ active: __VLS_ctx.selectedScope.type === 'iteration' && __VLS_ctx.selectedScope.iterationId === item.id }) },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-iteration-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "workspace-iteration-title" },
    });
    (item.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-iteration-head-side" },
    });
    if (__VLS_ctx.canManageIteration) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageIteration))
                        return;
                    __VLS_ctx.openEditIterationDialog(item);
                } },
            ...{ class: "workspace-iteration-action" },
            type: "button",
            'aria-label': "编辑迭代",
        });
        const __VLS_8 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
        const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        const __VLS_12 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
        const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
        var __VLS_11;
    }
    if (__VLS_ctx.canManageIteration && item.canDelete) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageIteration && item.canDelete))
                        return;
                    __VLS_ctx.handleDeleteIteration(item);
                } },
            ...{ class: "workspace-iteration-action danger" },
            type: "button",
            'aria-label': "删除迭代",
        });
        const __VLS_16 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        const __VLS_20 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
        const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
        var __VLS_19;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "workspace-iteration-icon" },
    });
    (__VLS_ctx.iterationStatusIcon(item.status));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-iteration-date" },
    });
    (__VLS_ctx.formatCompactDateRange(item.startDate, item.endDate));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-iteration-progress" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-iteration-progress-fill" },
        ...{ style: ({ width: `${__VLS_ctx.iterationSidebarPercent(item)}%` }) },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-sidebar-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.canManageIteration ? __VLS_ctx.openCreateIterationDialog() : __VLS_ctx.goBack();
        } },
    ...{ class: "workspace-sidebar-action" },
    type: "button",
});
const __VLS_24 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_27;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.canManageIteration ? '新建迭代' : '返回项目');
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "workspace-topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-topbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.goBack) },
    ...{ class: "workspace-back-link" },
    type: "button",
});
const __VLS_32 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
var __VLS_35;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-topbar-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-profile-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleOpenNotificationsProxy) },
    ...{ class: "header-notification-button" },
    type: "button",
    'aria-label': "打开消息中心",
});
const __VLS_40 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
const __VLS_44 = {}.Bell;
/** @type {[typeof __VLS_components.Bell, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
var __VLS_43;
if (__VLS_ctx.notificationStore.unreadCount > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "header-notification-dot" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "header-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "user-trigger" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "user-meta" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.authStore.user?.nickname || __VLS_ctx.authStore.user?.username || '当前用户');
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
(__VLS_ctx.authStore.user?.roleNames?.[0] || '协作成员');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "user-avatar" },
});
((__VLS_ctx.authStore.user?.nickname || __VLS_ctx.authStore.user?.username || 'U').slice(0, 1).toUpperCase());
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-stats" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.workspaceStatCards))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (item.label),
        ...{ class: "workspace-stat-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "workspace-stat-label" },
    });
    (item.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-stat-value-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (item.value);
    if (item.highlight) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-stat-highlight" },
        });
        (item.highlight);
    }
    if (item.progress !== undefined) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "workspace-stat-track" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "workspace-stat-fill" },
            ...{ class: (item.progressTone) },
            ...{ style: ({ width: `${item.progress}%` }) },
        });
    }
    if (item.subtext) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "workspace-stat-subtext" },
        });
        (item.subtext);
    }
    if (item.dots) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "workspace-stat-dots" },
        });
        for (const [index] of __VLS_getVForSourceType((item.dots))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (index),
                ...{ class: "workspace-stat-dot" },
                ...{ class: ({ active: index <= item.activeDots }) },
            });
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-controls workspace-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-list-switcher" },
    role: "tablist",
    'aria-label': "工作项类型切换",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.setTypeTab('全部');
        } },
    ...{ class: "workspace-list-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTypeTab === '全部' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.setTypeTab('需求');
        } },
    ...{ class: "workspace-list-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTypeTab === '需求' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.setTypeTab('任务');
        } },
    ...{ class: "workspace-list-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTypeTab === '任务' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.setTypeTab('缺陷');
        } },
    ...{ class: "workspace-list-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTypeTab === '缺陷' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-search-shell" },
});
const __VLS_48 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ class: "management-list-search-icon" },
}));
const __VLS_50 = __VLS_49({
    ...{ class: "management-list-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
var __VLS_51;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onKeyup: (__VLS_ctx.handleFilterSearch) },
    value: (__VLS_ctx.keyword),
    ...{ class: "management-list-search-input" },
    type: "text",
    placeholder: "搜索工作项标题、说明或负责人...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_56 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    visible: (__VLS_ctx.workItemFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-end",
    width: (360),
    popperClass: "iteration-filter-popper",
}));
const __VLS_58 = __VLS_57({
    visible: (__VLS_ctx.workItemFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-end",
    width: (360),
    popperClass: "iteration-filter-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_59.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "management-list-toolbar-button" },
        type: "button",
    });
    const __VLS_60 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
    const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_63.slots.default;
    const __VLS_64 = {}.Filter;
    /** @type {[typeof __VLS_components.Filter, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
    const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
    var __VLS_63;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-filter-panel management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_68 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    modelValue: (__VLS_ctx.workItemFilters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_70 = __VLS_69({
    modelValue: (__VLS_ctx.workItemFilters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.taskStatusOptions))) {
    const __VLS_72 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_74 = __VLS_73({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
}
var __VLS_71;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_76 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    modelValue: (__VLS_ctx.workItemFilters.priority),
    clearable: true,
    placeholder: "优先级",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_78 = __VLS_77({
    modelValue: (__VLS_ctx.workItemFilters.priority),
    clearable: true,
    placeholder: "优先级",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "高",
    value: "高",
}));
const __VLS_82 = __VLS_81({
    label: "高",
    value: "高",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
const __VLS_84 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "中",
    value: "中",
}));
const __VLS_86 = __VLS_85({
    label: "中",
    value: "中",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
const __VLS_88 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    label: "低",
    value: "低",
}));
const __VLS_90 = __VLS_89({
    label: "低",
    value: "低",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
var __VLS_79;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_92 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    modelValue: (__VLS_ctx.workItemFilters.assigneeUserId),
    clearable: true,
    filterable: true,
    placeholder: "负责人",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_94 = __VLS_93({
    modelValue: (__VLS_ctx.workItemFilters.assigneeUserId),
    clearable: true,
    filterable: true,
    placeholder: "负责人",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectParticipantUsers))) {
    const __VLS_96 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }));
    const __VLS_98 = __VLS_97({
        key: (item.id),
        label: (__VLS_ctx.buildUserLabel(item)),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
}
var __VLS_95;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-filter-actions" },
});
const __VLS_100 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_102 = __VLS_101({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
let __VLS_104;
let __VLS_105;
let __VLS_106;
const __VLS_107 = {
    onClick: (__VLS_ctx.handleFilterSearch)
};
__VLS_103.slots.default;
var __VLS_103;
const __VLS_108 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    ...{ 'onClick': {} },
}));
const __VLS_110 = __VLS_109({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
let __VLS_112;
let __VLS_113;
let __VLS_114;
const __VLS_115 = {
    onClick: (__VLS_ctx.handleFilterReset)
};
__VLS_111.slots.default;
var __VLS_111;
var __VLS_59;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleFilterReset) },
    ...{ class: "management-list-toolbar-button" },
    type: "button",
});
const __VLS_116 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
const __VLS_120 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
var __VLS_119;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-side" },
});
if (__VLS_ctx.canManageWorkItem) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openCreateWorkItemDialog) },
        ...{ class: "management-list-create-button" },
        type: "button",
    });
    const __VLS_124 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
    const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
    __VLS_127.slots.default;
    const __VLS_128 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
    const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
    var __VLS_127;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-table-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.workItemLoading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "workspace-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "workspace-col-code" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "workspace-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "workspace-col-status" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "workspace-col-hours" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center workspace-col-type" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "workspace-col-plan" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "workspace-col-owner" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center workspace-col-priority" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "workspace-col-creator" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "right workspace-col-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
if (!__VLS_ctx.workItems.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        colspan: "10",
        ...{ class: "workspace-empty-row" },
    });
}
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.workItems))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "workspace-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-col-code" },
        'data-label': "工作项编号",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openWorkItemDetailFromRow(row);
            } },
        ...{ class: "workspace-item-code standalone workspace-item-link-button" },
        type: "button",
    });
    (row.workItemCode);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-col-main" },
        'data-label': "标题",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-primary-cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-primary-icon" },
    });
    const __VLS_132 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
    const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
    __VLS_135.slots.default;
    const __VLS_136 = {}.Tickets;
    /** @type {[typeof __VLS_components.Tickets, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
    const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
    var __VLS_135;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-primary-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openWorkItemDetailFromRow(row);
            } },
        ...{ class: "workspace-title-button" },
        type: "button",
    });
    (row.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-col-status" },
        'data-label': "状态",
    });
    if (__VLS_ctx.canManageWorkItem && row.workItemType !== '需求') {
        /** @type {[typeof CompactSelectMenu, ]} */ ;
        // @ts-ignore
        const __VLS_140 = __VLS_asFunctionalComponent(CompactSelectMenu, new CompactSelectMenu({
            ...{ 'onChange': {} },
            modelValue: (row.status || null),
            options: (__VLS_ctx.taskStatusSelectOptions),
            ...{ class: "status-select" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
        }));
        const __VLS_141 = __VLS_140({
            ...{ 'onChange': {} },
            modelValue: (row.status || null),
            options: (__VLS_ctx.taskStatusSelectOptions),
            ...{ class: "status-select" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_140));
        let __VLS_143;
        let __VLS_144;
        let __VLS_145;
        const __VLS_146 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.canManageWorkItem && row.workItemType !== '需求'))
                    return;
                __VLS_ctx.handleQuickStatusChange(row, String($event));
            }
        };
        var __VLS_142;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-status-pill" },
            ...{ class: (__VLS_ctx.workItemTone(row.status)) },
        });
        (__VLS_ctx.formatTaskStatusLabel(row));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-col-hours" },
        'data-label': "预估工时",
    });
    if (__VLS_ctx.canManageWorkItem && row.workItemType === '任务') {
        const __VLS_147 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
            content: (__VLS_ctx.getRowWorkHoursLockedReason(row)),
            disabled: (!__VLS_ctx.getRowWorkHoursLockedReason(row)),
        }));
        const __VLS_149 = __VLS_148({
            content: (__VLS_ctx.getRowWorkHoursLockedReason(row)),
            disabled: (!__VLS_ctx.getRowWorkHoursLockedReason(row)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_148));
        __VLS_150.slots.default;
        const __VLS_151 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
            ...{ 'onChange': {} },
            modelValue: (row.workHours ?? undefined),
            min: (0),
            max: (15),
            step: (0.5),
            precision: (1),
            controlsPosition: "right",
            ...{ class: "work-hours-input" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id || Boolean(__VLS_ctx.getRowWorkHoursLockedReason(row))),
        }));
        const __VLS_153 = __VLS_152({
            ...{ 'onChange': {} },
            modelValue: (row.workHours ?? undefined),
            min: (0),
            max: (15),
            step: (0.5),
            precision: (1),
            controlsPosition: "right",
            ...{ class: "work-hours-input" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id || Boolean(__VLS_ctx.getRowWorkHoursLockedReason(row))),
        }, ...__VLS_functionalComponentArgsRest(__VLS_152));
        let __VLS_155;
        let __VLS_156;
        let __VLS_157;
        const __VLS_158 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.canManageWorkItem && row.workItemType === '任务'))
                    return;
                __VLS_ctx.handleQuickWorkHoursChange(row, $event);
            }
        };
        var __VLS_154;
        var __VLS_150;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-empty-text" },
        });
        (row.workHours == null ? '-' : `${row.workHours}h`);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center workspace-col-type" },
        'data-label': "工作项类型",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "workspace-type-pill" },
        ...{ class: (__VLS_ctx.workItemTypeTone(row.workItemType)) },
    });
    (row.workItemType);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-col-plan" },
        'data-label': "计划时间",
    });
    if (__VLS_ctx.hasWorkItemPlanDateRange(row)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-plan-text" },
        });
        (__VLS_ctx.formatWorkItemPlanDateRange(row.planStartDate, row.planEndDate));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-empty-text" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-col-owner" },
        'data-label': "负责人",
    });
    if (__VLS_ctx.canManageWorkItem && row.workItemType !== '需求') {
        /** @type {[typeof CompactSelectMenu, ]} */ ;
        // @ts-ignore
        const __VLS_159 = __VLS_asFunctionalComponent(CompactSelectMenu, new CompactSelectMenu({
            ...{ 'onChange': {} },
            modelValue: (row.assigneeUserId ?? -1),
            options: (__VLS_ctx.assigneeSelectOptions),
            ...{ class: "assignee-select" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
        }));
        const __VLS_160 = __VLS_159({
            ...{ 'onChange': {} },
            modelValue: (row.assigneeUserId ?? -1),
            options: (__VLS_ctx.assigneeSelectOptions),
            ...{ class: "assignee-select" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_159));
        let __VLS_162;
        let __VLS_163;
        let __VLS_164;
        const __VLS_165 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.canManageWorkItem && row.workItemType !== '需求'))
                    return;
                __VLS_ctx.handleQuickAssigneeChange(row, Number($event));
            }
        };
        var __VLS_161;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "workspace-owner-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-owner-avatar" },
        });
        (__VLS_ctx.ownerInitial(row.assignee));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-owner-name" },
        });
        (row.assignee || '未分配');
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center workspace-col-priority" },
        'data-label': "优先级",
    });
    if (__VLS_ctx.canManageWorkItem && row.workItemType !== '需求') {
        /** @type {[typeof CompactSelectMenu, ]} */ ;
        // @ts-ignore
        const __VLS_166 = __VLS_asFunctionalComponent(CompactSelectMenu, new CompactSelectMenu({
            ...{ 'onChange': {} },
            modelValue: (row.priority || null),
            options: (__VLS_ctx.prioritySelectOptions),
            ...{ class: "priority-select" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
        }));
        const __VLS_167 = __VLS_166({
            ...{ 'onChange': {} },
            modelValue: (row.priority || null),
            options: (__VLS_ctx.prioritySelectOptions),
            ...{ class: "priority-select" },
            disabled: (__VLS_ctx.statusUpdatingId === row.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_166));
        let __VLS_169;
        let __VLS_170;
        let __VLS_171;
        const __VLS_172 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.canManageWorkItem && row.workItemType !== '需求'))
                    return;
                __VLS_ctx.handleQuickPriorityChange(row, String($event));
            }
        };
        var __VLS_168;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "workspace-priority-pill" },
            ...{ class: (__VLS_ctx.workspacePriorityTone(row.priority)) },
        });
        (row.priority || '-');
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "workspace-col-creator" },
        'data-label': "创建人",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "workspace-creator-name" },
    });
    (row.creatorName || '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "right workspace-col-actions" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-row-actions" },
    });
    const __VLS_173 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
        content: "评论",
        placement: "top",
    }));
    const __VLS_175 = __VLS_174({
        content: "评论",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_174));
    __VLS_176.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openCommentDialog(row);
            } },
        ...{ class: "workspace-action-button" },
        type: "button",
        'aria-label': "评论工作项",
    });
    const __VLS_177 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({}));
    const __VLS_179 = __VLS_178({}, ...__VLS_functionalComponentArgsRest(__VLS_178));
    __VLS_180.slots.default;
    const __VLS_181 = {}.ChatDotRound;
    /** @type {[typeof __VLS_components.ChatDotRound, ]} */ ;
    // @ts-ignore
    const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({}));
    const __VLS_183 = __VLS_182({}, ...__VLS_functionalComponentArgsRest(__VLS_182));
    var __VLS_180;
    var __VLS_176;
    if (__VLS_ctx.canManageWorkItem) {
        const __VLS_185 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
            content: "编辑",
            placement: "top",
        }));
        const __VLS_187 = __VLS_186({
            content: "编辑",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_186));
        __VLS_188.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageWorkItem))
                        return;
                    __VLS_ctx.openWorkItemDetailFromRow(row);
                } },
            ...{ class: "workspace-action-button" },
            type: "button",
            'aria-label': "编辑工作项",
        });
        const __VLS_189 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({}));
        const __VLS_191 = __VLS_190({}, ...__VLS_functionalComponentArgsRest(__VLS_190));
        __VLS_192.slots.default;
        const __VLS_193 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({}));
        const __VLS_195 = __VLS_194({}, ...__VLS_functionalComponentArgsRest(__VLS_194));
        var __VLS_192;
        var __VLS_188;
    }
    if (row.workItemType === '需求') {
        const __VLS_197 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
            content: "需求 AI",
            placement: "top",
        }));
        const __VLS_199 = __VLS_198({
            content: "需求 AI",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_198));
        __VLS_200.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.workItemType === '需求'))
                        return;
                    __VLS_ctx.openRequirementAiDialog(row);
                } },
            ...{ class: "workspace-action-button ai" },
            type: "button",
            'aria-label': "打开需求 AI",
        });
        const __VLS_201 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({}));
        const __VLS_203 = __VLS_202({}, ...__VLS_functionalComponentArgsRest(__VLS_202));
        __VLS_204.slots.default;
        const __VLS_205 = {}.Cpu;
        /** @type {[typeof __VLS_components.Cpu, ]} */ ;
        // @ts-ignore
        const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({}));
        const __VLS_207 = __VLS_206({}, ...__VLS_functionalComponentArgsRest(__VLS_206));
        var __VLS_204;
        var __VLS_200;
    }
    if (row.workItemType === '需求' && __VLS_ctx.canRequirementDevPass && !row.devPassed) {
        const __VLS_209 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
            content: "开发通过",
            placement: "top",
        }));
        const __VLS_211 = __VLS_210({
            content: "开发通过",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_210));
        __VLS_212.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.workItemType === '需求' && __VLS_ctx.canRequirementDevPass && !row.devPassed))
                        return;
                    __VLS_ctx.handleRequirementDevPass(row);
                } },
            ...{ class: "workspace-action-button pass" },
            type: "button",
            'aria-label': "标记开发通过",
        });
        const __VLS_213 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({}));
        const __VLS_215 = __VLS_214({}, ...__VLS_functionalComponentArgsRest(__VLS_214));
        __VLS_216.slots.default;
        const __VLS_217 = {}.Management;
        /** @type {[typeof __VLS_components.Management, ]} */ ;
        // @ts-ignore
        const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({}));
        const __VLS_219 = __VLS_218({}, ...__VLS_functionalComponentArgsRest(__VLS_218));
        var __VLS_216;
        var __VLS_212;
    }
    if (row.workItemType === '需求' && __VLS_ctx.canRequirementTestPass && !row.testPassed) {
        const __VLS_221 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
            content: "测试通过",
            placement: "top",
        }));
        const __VLS_223 = __VLS_222({
            content: "测试通过",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_222));
        __VLS_224.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(row.workItemType === '需求' && __VLS_ctx.canRequirementTestPass && !row.testPassed))
                        return;
                    __VLS_ctx.handleRequirementTestPass(row);
                } },
            ...{ class: "workspace-action-button success" },
            type: "button",
            'aria-label': "标记测试通过",
        });
        const __VLS_225 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({}));
        const __VLS_227 = __VLS_226({}, ...__VLS_functionalComponentArgsRest(__VLS_226));
        __VLS_228.slots.default;
        const __VLS_229 = {}.Finished;
        /** @type {[typeof __VLS_components.Finished, ]} */ ;
        // @ts-ignore
        const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({}));
        const __VLS_231 = __VLS_230({}, ...__VLS_functionalComponentArgsRest(__VLS_230));
        var __VLS_228;
        var __VLS_224;
    }
    if (__VLS_ctx.canManageWorkItem && row.canDelete) {
        const __VLS_233 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
            content: "删除",
            placement: "top",
        }));
        const __VLS_235 = __VLS_234({
            content: "删除",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_234));
        __VLS_236.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManageWorkItem && row.canDelete))
                        return;
                    __VLS_ctx.handleDeleteWorkItem(row);
                } },
            ...{ class: "workspace-action-button danger" },
            type: "button",
            'aria-label': "删除工作项",
        });
        const __VLS_237 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({}));
        const __VLS_239 = __VLS_238({}, ...__VLS_functionalComponentArgsRest(__VLS_238));
        __VLS_240.slots.default;
        const __VLS_241 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({}));
        const __VLS_243 = __VLS_242({}, ...__VLS_functionalComponentArgsRest(__VLS_242));
        var __VLS_240;
        var __VLS_236;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-pagination" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.workItemPagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-pagination-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-page-size" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_245 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.workItemPagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_247 = __VLS_246({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.workItemPagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_246));
let __VLS_249;
let __VLS_250;
let __VLS_251;
const __VLS_252 = {
    onChange: (__VLS_ctx.handlePageSizeChange)
};
__VLS_248.slots.default;
const __VLS_253 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
    value: (10),
    label: "10",
}));
const __VLS_255 = __VLS_254({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_254));
const __VLS_257 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
    value: (20),
    label: "20",
}));
const __VLS_259 = __VLS_258({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_258));
const __VLS_261 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
    value: (50),
    label: "50",
}));
const __VLS_263 = __VLS_262({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_262));
var __VLS_248;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleWorkItemPrevPage) },
    ...{ class: "workspace-page-button" },
    type: "button",
    disabled: (__VLS_ctx.workItemPagination.page <= 1),
});
const __VLS_265 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({}));
const __VLS_267 = __VLS_266({}, ...__VLS_functionalComponentArgsRest(__VLS_266));
__VLS_268.slots.default;
const __VLS_269 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({}));
const __VLS_271 = __VLS_270({}, ...__VLS_functionalComponentArgsRest(__VLS_270));
var __VLS_268;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "workspace-page-text" },
});
(__VLS_ctx.workItemPagination.page);
(__VLS_ctx.workItemTotalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleWorkItemNextPage) },
    ...{ class: "workspace-page-button" },
    type: "button",
    disabled: (__VLS_ctx.workItemPagination.page >= __VLS_ctx.workItemTotalPages),
});
const __VLS_273 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_274 = __VLS_asFunctionalComponent(__VLS_273, new __VLS_273({}));
const __VLS_275 = __VLS_274({}, ...__VLS_functionalComponentArgsRest(__VLS_274));
__VLS_276.slots.default;
const __VLS_277 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({}));
const __VLS_279 = __VLS_278({}, ...__VLS_functionalComponentArgsRest(__VLS_278));
var __VLS_276;
const __VLS_281 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({
    modelValue: (__VLS_ctx.iterationDialogVisible),
    title: (__VLS_ctx.iterationEditing ? '编辑迭代' : '新建迭代'),
    width: "640px",
    ...{ class: "platform-form-dialog" },
}));
const __VLS_283 = __VLS_282({
    modelValue: (__VLS_ctx.iterationDialogVisible),
    title: (__VLS_ctx.iterationEditing ? '编辑迭代' : '新建迭代'),
    width: "640px",
    ...{ class: "platform-form-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_282));
__VLS_284.slots.default;
const __VLS_285 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
    ref: "iterationFormRef",
    model: (__VLS_ctx.iterationForm),
    rules: (__VLS_ctx.iterationRules),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_287 = __VLS_286({
    ref: "iterationFormRef",
    model: (__VLS_ctx.iterationForm),
    rules: (__VLS_ctx.iterationRules),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_286));
/** @type {typeof __VLS_ctx.iterationFormRef} */ ;
var __VLS_289 = {};
__VLS_288.slots.default;
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
const __VLS_291 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
    label: "迭代名称",
    prop: "name",
}));
const __VLS_293 = __VLS_292({
    label: "迭代名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_292));
__VLS_294.slots.default;
const __VLS_295 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
    modelValue: (__VLS_ctx.iterationForm.name),
    placeholder: "请输入迭代名称",
}));
const __VLS_297 = __VLS_296({
    modelValue: (__VLS_ctx.iterationForm.name),
    placeholder: "请输入迭代名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_296));
var __VLS_294;
const __VLS_299 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_300 = __VLS_asFunctionalComponent(__VLS_299, new __VLS_299({
    label: "迭代目标",
}));
const __VLS_301 = __VLS_300({
    label: "迭代目标",
}, ...__VLS_functionalComponentArgsRest(__VLS_300));
__VLS_302.slots.default;
const __VLS_303 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_304 = __VLS_asFunctionalComponent(__VLS_303, new __VLS_303({
    modelValue: (__VLS_ctx.iterationForm.goal),
    placeholder: "请输入迭代目标",
}));
const __VLS_305 = __VLS_304({
    modelValue: (__VLS_ctx.iterationForm.goal),
    placeholder: "请输入迭代目标",
}, ...__VLS_functionalComponentArgsRest(__VLS_304));
var __VLS_302;
const __VLS_307 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_308 = __VLS_asFunctionalComponent(__VLS_307, new __VLS_307({
    label: "状态",
    prop: "status",
}));
const __VLS_309 = __VLS_308({
    label: "状态",
    prop: "status",
}, ...__VLS_functionalComponentArgsRest(__VLS_308));
__VLS_310.slots.default;
const __VLS_311 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_312 = __VLS_asFunctionalComponent(__VLS_311, new __VLS_311({
    modelValue: (__VLS_ctx.iterationForm.status),
    ...{ style: {} },
}));
const __VLS_313 = __VLS_312({
    modelValue: (__VLS_ctx.iterationForm.status),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_312));
__VLS_314.slots.default;
const __VLS_315 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_316 = __VLS_asFunctionalComponent(__VLS_315, new __VLS_315({
    label: "未开始",
    value: "未开始",
}));
const __VLS_317 = __VLS_316({
    label: "未开始",
    value: "未开始",
}, ...__VLS_functionalComponentArgsRest(__VLS_316));
const __VLS_319 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_320 = __VLS_asFunctionalComponent(__VLS_319, new __VLS_319({
    label: "进行中",
    value: "进行中",
}));
const __VLS_321 = __VLS_320({
    label: "进行中",
    value: "进行中",
}, ...__VLS_functionalComponentArgsRest(__VLS_320));
const __VLS_323 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_324 = __VLS_asFunctionalComponent(__VLS_323, new __VLS_323({
    label: "已完成",
    value: "已完成",
}));
const __VLS_325 = __VLS_324({
    label: "已完成",
    value: "已完成",
}, ...__VLS_functionalComponentArgsRest(__VLS_324));
var __VLS_314;
var __VLS_310;
const __VLS_327 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_328 = __VLS_asFunctionalComponent(__VLS_327, new __VLS_327({
    label: "计划时间",
}));
const __VLS_329 = __VLS_328({
    label: "计划时间",
}, ...__VLS_functionalComponentArgsRest(__VLS_328));
__VLS_330.slots.default;
const __VLS_331 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_332 = __VLS_asFunctionalComponent(__VLS_331, new __VLS_331({
    modelValue: (__VLS_ctx.iterationDateRange),
    type: "daterange",
    startPlaceholder: "开始日期",
    endPlaceholder: "结束日期",
    valueFormat: "YYYY-MM-DD",
    ...{ style: {} },
}));
const __VLS_333 = __VLS_332({
    modelValue: (__VLS_ctx.iterationDateRange),
    type: "daterange",
    startPlaceholder: "开始日期",
    endPlaceholder: "结束日期",
    valueFormat: "YYYY-MM-DD",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_332));
var __VLS_330;
const __VLS_335 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_336 = __VLS_asFunctionalComponent(__VLS_335, new __VLS_335({
    label: "排序值",
}));
const __VLS_337 = __VLS_336({
    label: "排序值",
}, ...__VLS_functionalComponentArgsRest(__VLS_336));
__VLS_338.slots.default;
const __VLS_339 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_340 = __VLS_asFunctionalComponent(__VLS_339, new __VLS_339({
    modelValue: (__VLS_ctx.iterationForm.sortOrder),
    min: (0),
    step: (1),
}));
const __VLS_341 = __VLS_340({
    modelValue: (__VLS_ctx.iterationForm.sortOrder),
    min: (0),
    step: (1),
}, ...__VLS_functionalComponentArgsRest(__VLS_340));
var __VLS_338;
const __VLS_343 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_344 = __VLS_asFunctionalComponent(__VLS_343, new __VLS_343({
    label: "说明",
}));
const __VLS_345 = __VLS_344({
    label: "说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_344));
__VLS_346.slots.default;
const __VLS_347 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_348 = __VLS_asFunctionalComponent(__VLS_347, new __VLS_347({
    modelValue: (__VLS_ctx.iterationForm.description),
    type: "textarea",
    rows: (4),
    placeholder: "请输入迭代说明",
}));
const __VLS_349 = __VLS_348({
    modelValue: (__VLS_ctx.iterationForm.description),
    type: "textarea",
    rows: (4),
    placeholder: "请输入迭代说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_348));
var __VLS_346;
var __VLS_288;
{
    const { footer: __VLS_thisSlot } = __VLS_284.slots;
    const __VLS_351 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_352 = __VLS_asFunctionalComponent(__VLS_351, new __VLS_351({
        ...{ 'onClick': {} },
    }));
    const __VLS_353 = __VLS_352({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_352));
    let __VLS_355;
    let __VLS_356;
    let __VLS_357;
    const __VLS_358 = {
        onClick: (...[$event]) => {
            __VLS_ctx.iterationDialogVisible = false;
        }
    };
    __VLS_354.slots.default;
    var __VLS_354;
    const __VLS_359 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_360 = __VLS_asFunctionalComponent(__VLS_359, new __VLS_359({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.iterationSubmitting),
    }));
    const __VLS_361 = __VLS_360({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.iterationSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_360));
    let __VLS_363;
    let __VLS_364;
    let __VLS_365;
    const __VLS_366 = {
        onClick: (__VLS_ctx.handleSubmitIteration)
    };
    __VLS_362.slots.default;
    var __VLS_362;
}
var __VLS_284;
const __VLS_367 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_368 = __VLS_asFunctionalComponent(__VLS_367, new __VLS_367({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.workItemDialogVisible),
    showClose: (false),
    beforeClose: (__VLS_ctx.handleWorkItemDrawerBeforeClose),
    direction: "rtl",
    size: "60%",
    ...{ class: "work-item-drawer" },
    appendToBody: true,
}));
const __VLS_369 = __VLS_368({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.workItemDialogVisible),
    showClose: (false),
    beforeClose: (__VLS_ctx.handleWorkItemDrawerBeforeClose),
    direction: "rtl",
    size: "60%",
    ...{ class: "work-item-drawer" },
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_368));
let __VLS_371;
let __VLS_372;
let __VLS_373;
const __VLS_374 = {
    onClosed: (__VLS_ctx.handleWorkItemDialogClosed)
};
__VLS_370.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_370.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-header-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeWorkItemDetail) },
        ...{ class: "work-item-dialog-close" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "work-item-dialog-divider" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "work-item-dialog-heading-icon" },
    });
    const __VLS_375 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_376 = __VLS_asFunctionalComponent(__VLS_375, new __VLS_375({}));
    const __VLS_377 = __VLS_376({}, ...__VLS_functionalComponentArgsRest(__VLS_376));
    __VLS_378.slots.default;
    const __VLS_379 = {}.FolderOpened;
    /** @type {[typeof __VLS_components.FolderOpened, ]} */ ;
    // @ts-ignore
    const __VLS_380 = __VLS_asFunctionalComponent(__VLS_379, new __VLS_379({}));
    const __VLS_381 = __VLS_380({}, ...__VLS_functionalComponentArgsRest(__VLS_380));
    var __VLS_378;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-heading-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-eyebrow" },
    });
    (__VLS_ctx.workItemEditing ? '编辑工作项' : '新建工作项');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-heading-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "work-item-dialog-heading-text" },
    });
    (__VLS_ctx.workItemForm.name || (__VLS_ctx.workItemEditing ? '编辑工作项' : '新建工作项'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "work-item-dialog-status-pill" },
        ...{ class: (__VLS_ctx.workItemStatusTone) },
    });
    (__VLS_ctx.workItemStatusDisplay);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-header-side" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "work-item-priority-badge" },
        ...{ class: (__VLS_ctx.workItemPriorityTone) },
    });
    (__VLS_ctx.workItemPriorityBadge);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "work-item-dialog-updated" },
    });
    (__VLS_ctx.workItemDialogUpdatedAt);
}
const __VLS_383 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_384 = __VLS_asFunctionalComponent(__VLS_383, new __VLS_383({
    ref: "workItemFormRef",
    model: (__VLS_ctx.workItemForm),
    rules: (__VLS_ctx.workItemRules),
    disabled: (!__VLS_ctx.canManageWorkItem),
    labelPosition: "top",
    ...{ class: "work-item-form work-item-editor-form" },
}));
const __VLS_385 = __VLS_384({
    ref: "workItemFormRef",
    model: (__VLS_ctx.workItemForm),
    rules: (__VLS_ctx.workItemRules),
    disabled: (!__VLS_ctx.canManageWorkItem),
    labelPosition: "top",
    ...{ class: "work-item-form work-item-editor-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_384));
/** @type {typeof __VLS_ctx.workItemFormRef} */ ;
var __VLS_387 = {};
__VLS_386.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "work-item-editor-top" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-title-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
const __VLS_389 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_390 = __VLS_asFunctionalComponent(__VLS_389, new __VLS_389({
    prop: "name",
    ...{ class: "work-item-title-form-item work-item-form-item-plain" },
}));
const __VLS_391 = __VLS_390({
    prop: "name",
    ...{ class: "work-item-title-form-item work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_390));
__VLS_392.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-title-input-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "work-item-id-badge" },
});
(__VLS_ctx.workItemDisplayCode);
const __VLS_393 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_394 = __VLS_asFunctionalComponent(__VLS_393, new __VLS_393({
    modelValue: (__VLS_ctx.workItemForm.name),
    placeholder: "请填写工作项标题",
    size: "large",
}));
const __VLS_395 = __VLS_394({
    modelValue: (__VLS_ctx.workItemForm.name),
    placeholder: "请填写工作项标题",
    size: "large",
}, ...__VLS_functionalComponentArgsRest(__VLS_394));
var __VLS_392;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-field-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
const __VLS_397 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_398 = __VLS_asFunctionalComponent(__VLS_397, new __VLS_397({
    prop: "workItemType",
    ...{ class: "work-item-form-item-plain" },
}));
const __VLS_399 = __VLS_398({
    prop: "workItemType",
    ...{ class: "work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_398));
__VLS_400.slots.default;
const __VLS_401 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_402 = __VLS_asFunctionalComponent(__VLS_401, new __VLS_401({
    modelValue: (__VLS_ctx.workItemForm.workItemType),
    ...{ style: {} },
}));
const __VLS_403 = __VLS_402({
    modelValue: (__VLS_ctx.workItemForm.workItemType),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_402));
__VLS_404.slots.default;
const __VLS_405 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_406 = __VLS_asFunctionalComponent(__VLS_405, new __VLS_405({
    label: "需求",
    value: "需求",
}));
const __VLS_407 = __VLS_406({
    label: "需求",
    value: "需求",
}, ...__VLS_functionalComponentArgsRest(__VLS_406));
const __VLS_409 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_410 = __VLS_asFunctionalComponent(__VLS_409, new __VLS_409({
    label: "任务",
    value: "任务",
}));
const __VLS_411 = __VLS_410({
    label: "任务",
    value: "任务",
}, ...__VLS_functionalComponentArgsRest(__VLS_410));
const __VLS_413 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_414 = __VLS_asFunctionalComponent(__VLS_413, new __VLS_413({
    label: "缺陷",
    value: "缺陷",
}));
const __VLS_415 = __VLS_414({
    label: "缺陷",
    value: "缺陷",
}, ...__VLS_functionalComponentArgsRest(__VLS_414));
var __VLS_404;
var __VLS_400;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-field-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-static-field" },
});
(__VLS_ctx.board.project.name || '当前项目');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-field-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
const __VLS_417 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_418 = __VLS_asFunctionalComponent(__VLS_417, new __VLS_417({
    ...{ class: "work-item-form-item-plain" },
}));
const __VLS_419 = __VLS_418({
    ...{ class: "work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_418));
__VLS_420.slots.default;
const __VLS_421 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_422 = __VLS_asFunctionalComponent(__VLS_421, new __VLS_421({
    modelValue: (__VLS_ctx.workItemForm.iterationId),
    clearable: true,
    placeholder: "未选择则放入未规划工作项",
    ...{ style: {} },
}));
const __VLS_423 = __VLS_422({
    modelValue: (__VLS_ctx.workItemForm.iterationId),
    clearable: true,
    placeholder: "未选择则放入未规划工作项",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_422));
__VLS_424.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.board.iterations))) {
    const __VLS_425 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_426 = __VLS_asFunctionalComponent(__VLS_425, new __VLS_425({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_427 = __VLS_426({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_426));
}
var __VLS_424;
var __VLS_420;
if (__VLS_ctx.isRequirementWorkItem) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-field-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-editor-label" },
    });
    const __VLS_429 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_430 = __VLS_asFunctionalComponent(__VLS_429, new __VLS_429({
        ...{ class: "work-item-form-item-plain" },
    }));
    const __VLS_431 = __VLS_430({
        ...{ class: "work-item-form-item-plain" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_430));
    __VLS_432.slots.default;
    const __VLS_433 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_434 = __VLS_asFunctionalComponent(__VLS_433, new __VLS_433({
        modelValue: (__VLS_ctx.workItemForm.prototypeUrl),
        placeholder: "请输入原型链接",
    }));
    const __VLS_435 = __VLS_434({
        modelValue: (__VLS_ctx.workItemForm.prototypeUrl),
        placeholder: "请输入原型链接",
    }, ...__VLS_functionalComponentArgsRest(__VLS_434));
    var __VLS_432;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-field-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-editor-label" },
    });
    const __VLS_437 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_438 = __VLS_asFunctionalComponent(__VLS_437, new __VLS_437({
        ...{ class: "work-item-form-item-plain" },
    }));
    const __VLS_439 = __VLS_438({
        ...{ class: "work-item-form-item-plain" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_438));
    __VLS_440.slots.default;
    const __VLS_441 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_442 = __VLS_asFunctionalComponent(__VLS_441, new __VLS_441({
        modelValue: (__VLS_ctx.workItemForm.requirementTaskId),
        clearable: true,
        filterable: true,
        placeholder: "可选，关联一个需求",
        ...{ style: {} },
    }));
    const __VLS_443 = __VLS_442({
        modelValue: (__VLS_ctx.workItemForm.requirementTaskId),
        clearable: true,
        filterable: true,
        placeholder: "可选，关联一个需求",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_442));
    __VLS_444.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.requirementSelectableOptions))) {
        const __VLS_445 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_446 = __VLS_asFunctionalComponent(__VLS_445, new __VLS_445({
            key: (item.id),
            label: (item.name),
            value: (item.id),
        }));
        const __VLS_447 = __VLS_446({
            key: (item.id),
            label: (item.name),
            value: (item.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_446));
    }
    var __VLS_444;
    var __VLS_440;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-field-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-inline-pair schedule" },
});
const __VLS_449 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_450 = __VLS_asFunctionalComponent(__VLS_449, new __VLS_449({
    ...{ class: "work-item-form-item-plain" },
}));
const __VLS_451 = __VLS_450({
    ...{ class: "work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_450));
__VLS_452.slots.default;
const __VLS_453 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_454 = __VLS_asFunctionalComponent(__VLS_453, new __VLS_453({
    modelValue: (__VLS_ctx.workItemForm.planStartDate),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "开始日期",
    ...{ style: {} },
}));
const __VLS_455 = __VLS_454({
    modelValue: (__VLS_ctx.workItemForm.planStartDate),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "开始日期",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_454));
var __VLS_452;
const __VLS_457 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_458 = __VLS_asFunctionalComponent(__VLS_457, new __VLS_457({
    ...{ class: "work-item-form-item-plain" },
}));
const __VLS_459 = __VLS_458({
    ...{ class: "work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_458));
__VLS_460.slots.default;
const __VLS_461 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_462 = __VLS_asFunctionalComponent(__VLS_461, new __VLS_461({
    modelValue: (__VLS_ctx.workItemForm.planEndDate),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "结束日期",
    ...{ style: {} },
}));
const __VLS_463 = __VLS_462({
    modelValue: (__VLS_ctx.workItemForm.planEndDate),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "结束日期",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_462));
var __VLS_460;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-field-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
const __VLS_465 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_466 = __VLS_asFunctionalComponent(__VLS_465, new __VLS_465({
    ...{ class: "work-item-form-item-plain" },
}));
const __VLS_467 = __VLS_466({
    ...{ class: "work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_466));
__VLS_468.slots.default;
/** @type {[typeof WorkItemMemberField, ]} */ ;
// @ts-ignore
const __VLS_469 = __VLS_asFunctionalComponent(WorkItemMemberField, new WorkItemMemberField({
    assigneeUserId: (__VLS_ctx.workItemForm.assigneeUserId),
    collaboratorUserIds: (__VLS_ctx.workItemForm.collaboratorUserIds),
    userOptions: (__VLS_ctx.projectParticipantUsers),
    projectMemberUserIds: (__VLS_ctx.projectParticipantUserIds),
    placeholder: "指派负责人/协作者",
}));
const __VLS_470 = __VLS_469({
    assigneeUserId: (__VLS_ctx.workItemForm.assigneeUserId),
    collaboratorUserIds: (__VLS_ctx.workItemForm.collaboratorUserIds),
    userOptions: (__VLS_ctx.projectParticipantUsers),
    projectMemberUserIds: (__VLS_ctx.projectParticipantUserIds),
    placeholder: "指派负责人/协作者",
}, ...__VLS_functionalComponentArgsRest(__VLS_469));
var __VLS_468;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-field-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
const __VLS_472 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_473 = __VLS_asFunctionalComponent(__VLS_472, new __VLS_472({
    prop: "status",
    ...{ class: "work-item-form-item-plain" },
}));
const __VLS_474 = __VLS_473({
    prop: "status",
    ...{ class: "work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_473));
__VLS_475.slots.default;
const __VLS_476 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_477 = __VLS_asFunctionalComponent(__VLS_476, new __VLS_476({
    modelValue: (__VLS_ctx.workItemForm.status),
    ...{ style: {} },
}));
const __VLS_478 = __VLS_477({
    modelValue: (__VLS_ctx.workItemForm.status),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_477));
__VLS_479.slots.default;
const __VLS_480 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_481 = __VLS_asFunctionalComponent(__VLS_480, new __VLS_480({
    label: "草稿",
    value: "草稿",
}));
const __VLS_482 = __VLS_481({
    label: "草稿",
    value: "草稿",
}, ...__VLS_functionalComponentArgsRest(__VLS_481));
const __VLS_484 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_485 = __VLS_asFunctionalComponent(__VLS_484, new __VLS_484({
    label: "待开始",
    value: "待开始",
}));
const __VLS_486 = __VLS_485({
    label: "待开始",
    value: "待开始",
}, ...__VLS_functionalComponentArgsRest(__VLS_485));
const __VLS_488 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_489 = __VLS_asFunctionalComponent(__VLS_488, new __VLS_488({
    label: "处理中",
    value: "处理中",
}));
const __VLS_490 = __VLS_489({
    label: "处理中",
    value: "处理中",
}, ...__VLS_functionalComponentArgsRest(__VLS_489));
const __VLS_492 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_493 = __VLS_asFunctionalComponent(__VLS_492, new __VLS_492({
    label: "已完成",
    value: "已完成",
}));
const __VLS_494 = __VLS_493({
    label: "已完成",
    value: "已完成",
}, ...__VLS_functionalComponentArgsRest(__VLS_493));
const __VLS_496 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
    label: "已阻塞",
    value: "已阻塞",
}));
const __VLS_498 = __VLS_497({
    label: "已阻塞",
    value: "已阻塞",
}, ...__VLS_functionalComponentArgsRest(__VLS_497));
var __VLS_479;
var __VLS_475;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-field-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-editor-label" },
});
(__VLS_ctx.workItemForm.workItemType === '任务' ? '优先级 / 预估工时' : '优先级');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-inline-pair" },
    ...{ class: ({ single: __VLS_ctx.workItemForm.workItemType !== '任务' }) },
});
const __VLS_500 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_501 = __VLS_asFunctionalComponent(__VLS_500, new __VLS_500({
    prop: "priority",
    ...{ class: "work-item-form-item-plain" },
}));
const __VLS_502 = __VLS_501({
    prop: "priority",
    ...{ class: "work-item-form-item-plain" },
}, ...__VLS_functionalComponentArgsRest(__VLS_501));
__VLS_503.slots.default;
const __VLS_504 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_505 = __VLS_asFunctionalComponent(__VLS_504, new __VLS_504({
    modelValue: (__VLS_ctx.workItemForm.priority),
    ...{ style: {} },
}));
const __VLS_506 = __VLS_505({
    modelValue: (__VLS_ctx.workItemForm.priority),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_505));
__VLS_507.slots.default;
const __VLS_508 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_509 = __VLS_asFunctionalComponent(__VLS_508, new __VLS_508({
    label: "高",
    value: "高",
}));
const __VLS_510 = __VLS_509({
    label: "高",
    value: "高",
}, ...__VLS_functionalComponentArgsRest(__VLS_509));
const __VLS_512 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({
    label: "中",
    value: "中",
}));
const __VLS_514 = __VLS_513({
    label: "中",
    value: "中",
}, ...__VLS_functionalComponentArgsRest(__VLS_513));
const __VLS_516 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
    label: "低",
    value: "低",
}));
const __VLS_518 = __VLS_517({
    label: "低",
    value: "低",
}, ...__VLS_functionalComponentArgsRest(__VLS_517));
var __VLS_507;
var __VLS_503;
if (__VLS_ctx.workItemForm.workItemType === '任务') {
    const __VLS_520 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_521 = __VLS_asFunctionalComponent(__VLS_520, new __VLS_520({
        ...{ class: "work-item-form-item-plain work-item-hours-item" },
    }));
    const __VLS_522 = __VLS_521({
        ...{ class: "work-item-form-item-plain work-item-hours-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_521));
    __VLS_523.slots.default;
    const __VLS_524 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_525 = __VLS_asFunctionalComponent(__VLS_524, new __VLS_524({
        content: (__VLS_ctx.workItemWorkHoursLockedReason),
        disabled: (!__VLS_ctx.workItemWorkHoursLockedReason),
    }));
    const __VLS_526 = __VLS_525({
        content: (__VLS_ctx.workItemWorkHoursLockedReason),
        disabled: (!__VLS_ctx.workItemWorkHoursLockedReason),
    }, ...__VLS_functionalComponentArgsRest(__VLS_525));
    __VLS_527.slots.default;
    const __VLS_528 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_529 = __VLS_asFunctionalComponent(__VLS_528, new __VLS_528({
        modelValue: (__VLS_ctx.workItemForm.workHours),
        min: (0),
        max: (15),
        step: (0.5),
        precision: (1),
        controlsPosition: "right",
        ...{ style: {} },
        disabled: (Boolean(__VLS_ctx.workItemWorkHoursLockedReason)),
    }));
    const __VLS_530 = __VLS_529({
        modelValue: (__VLS_ctx.workItemForm.workHours),
        min: (0),
        max: (15),
        step: (0.5),
        precision: (1),
        controlsPosition: "right",
        ...{ style: {} },
        disabled: (Boolean(__VLS_ctx.workItemWorkHoursLockedReason)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_529));
    var __VLS_527;
    var __VLS_523;
}
if (__VLS_ctx.workItemWorkHoursLockedReason && __VLS_ctx.workItemForm.workItemType === '任务') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-tip work-item-inline-tip" },
    });
    (__VLS_ctx.workItemWorkHoursLockedReason);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "work-item-editor-description" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-description-body" },
});
if (__VLS_ctx.isRequirementWorkItem && __VLS_ctx.legacyRequirementNeedsUpgrade) {
    const __VLS_532 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_533 = __VLS_asFunctionalComponent(__VLS_532, new __VLS_532({
        type: "warning",
        closable: (false),
        title: "该需求为历史数据，本次保存后会升级为新模板结构。",
        ...{ class: "legacy-requirement-alert" },
    }));
    const __VLS_534 = __VLS_533({
        type: "warning",
        closable: (false),
        title: "该需求为历史数据，本次保存后会升级为新模板结构。",
        ...{ class: "legacy-requirement-alert" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_533));
}
if (__VLS_ctx.isRequirementWorkItem && __VLS_ctx.legacyRequirementPreview) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "legacy-requirement-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "legacy-requirement-preview-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "legacy-requirement-preview-body" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.renderMarkdownToHtml(__VLS_ctx.legacyRequirementPreview)) }, null, null);
}
if (__VLS_ctx.isRequirementWorkItem) {
    const __VLS_536 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_537 = __VLS_asFunctionalComponent(__VLS_536, new __VLS_536({
        ...{ class: "description-form-item work-item-description-form-item" },
    }));
    const __VLS_538 = __VLS_537({
        ...{ class: "description-form-item work-item-description-form-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_537));
    __VLS_539.slots.default;
    /** @type {[typeof MarkdownEditor, ]} */ ;
    // @ts-ignore
    const __VLS_540 = __VLS_asFunctionalComponent(MarkdownEditor, new MarkdownEditor({
        modelValue: (__VLS_ctx.workItemForm.requirementMarkdown),
        height: (__VLS_ctx.workItemEditorHeight),
        uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
        placeholder: (__VLS_ctx.requirementDocumentPlaceholder),
    }));
    const __VLS_541 = __VLS_540({
        modelValue: (__VLS_ctx.workItemForm.requirementMarkdown),
        height: (__VLS_ctx.workItemEditorHeight),
        uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
        placeholder: (__VLS_ctx.requirementDocumentPlaceholder),
    }, ...__VLS_functionalComponentArgsRest(__VLS_540));
    var __VLS_539;
}
else {
    const __VLS_543 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_544 = __VLS_asFunctionalComponent(__VLS_543, new __VLS_543({
        prop: "description",
        ...{ class: "description-form-item work-item-description-form-item" },
    }));
    const __VLS_545 = __VLS_544({
        prop: "description",
        ...{ class: "description-form-item work-item-description-form-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_544));
    __VLS_546.slots.default;
    /** @type {[typeof MarkdownEditor, ]} */ ;
    // @ts-ignore
    const __VLS_547 = __VLS_asFunctionalComponent(MarkdownEditor, new MarkdownEditor({
        modelValue: (__VLS_ctx.workItemForm.description),
        height: (__VLS_ctx.workItemEditorHeight),
        uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
        placeholder: "请填写工作项详细说明，支持 Markdown 格式",
    }));
    const __VLS_548 = __VLS_547({
        modelValue: (__VLS_ctx.workItemForm.description),
        height: (__VLS_ctx.workItemEditorHeight),
        uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
        placeholder: "请填写工作项详细说明，支持 Markdown 格式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_547));
    var __VLS_546;
}
var __VLS_386;
{
    const { footer: __VLS_thisSlot } = __VLS_370.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "work-item-dialog-footer" },
    });
    const __VLS_550 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_551 = __VLS_asFunctionalComponent(__VLS_550, new __VLS_550({
        ...{ 'onClick': {} },
    }));
    const __VLS_552 = __VLS_551({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_551));
    let __VLS_554;
    let __VLS_555;
    let __VLS_556;
    const __VLS_557 = {
        onClick: (__VLS_ctx.closeWorkItemDetail)
    };
    __VLS_553.slots.default;
    var __VLS_553;
    if (__VLS_ctx.canManageWorkItem) {
        const __VLS_558 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_559 = __VLS_asFunctionalComponent(__VLS_558, new __VLS_558({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.workItemSubmitting),
        }));
        const __VLS_560 = __VLS_559({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.workItemSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_559));
        let __VLS_562;
        let __VLS_563;
        let __VLS_564;
        const __VLS_565 = {
            onClick: (__VLS_ctx.handleSubmitWorkItem)
        };
        __VLS_561.slots.default;
        (__VLS_ctx.workItemEditing ? '保存工作项' : '创建工作项');
        var __VLS_561;
    }
}
var __VLS_370;
const __VLS_566 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_567 = __VLS_asFunctionalComponent(__VLS_566, new __VLS_566({
    modelValue: (__VLS_ctx.commentDialogVisible),
    title: (__VLS_ctx.currentCommentTask ? `评论：${__VLS_ctx.currentCommentTask.name}` : '工作项评论'),
    width: "760px",
    ...{ class: "comment-dialog" },
}));
const __VLS_568 = __VLS_567({
    modelValue: (__VLS_ctx.commentDialogVisible),
    title: (__VLS_ctx.currentCommentTask ? `评论：${__VLS_ctx.currentCommentTask.name}` : '工作项评论'),
    width: "760px",
    ...{ class: "comment-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_567));
__VLS_569.slots.default;
if (__VLS_ctx.currentCommentTask) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "comment-task-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.currentCommentTask.workItemType);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.formatTaskStatusLabel(__VLS_ctx.currentCommentTask));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.currentCommentTask.assignee || '未分配');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.currentCommentTask.updatedAt);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.handleCommentImagePreview) },
        ...{ class: "comment-list" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.commentLoading) }, null, null);
    if (!__VLS_ctx.taskComments.length && !__VLS_ctx.commentLoading) {
        const __VLS_570 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_571 = __VLS_asFunctionalComponent(__VLS_570, new __VLS_570({
            description: "暂无评论",
        }));
        const __VLS_572 = __VLS_571({
            description: "暂无评论",
        }, ...__VLS_functionalComponentArgsRest(__VLS_571));
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.taskComments))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (item.id),
            ...{ class: "comment-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-item-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.authorName || '未知用户');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.createdAt);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-item-content" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.renderCommentContent(item.content)) }, null, null);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "comment-editor" },
    });
    /** @type {[typeof MarkdownEditor, ]} */ ;
    // @ts-ignore
    const __VLS_574 = __VLS_asFunctionalComponent(MarkdownEditor, new MarkdownEditor({
        modelValue: (__VLS_ctx.commentForm.content),
        height: (220),
        uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
        placeholder: "输入评论内容",
    }));
    const __VLS_575 = __VLS_574({
        modelValue: (__VLS_ctx.commentForm.content),
        height: (220),
        uploadImage: (__VLS_ctx.handleTaskMarkdownImageUpload),
        placeholder: "输入评论内容",
    }, ...__VLS_functionalComponentArgsRest(__VLS_574));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "comment-editor-hint" },
    });
}
{
    const { footer: __VLS_thisSlot } = __VLS_569.slots;
    const __VLS_577 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_578 = __VLS_asFunctionalComponent(__VLS_577, new __VLS_577({
        ...{ 'onClick': {} },
    }));
    const __VLS_579 = __VLS_578({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_578));
    let __VLS_581;
    let __VLS_582;
    let __VLS_583;
    const __VLS_584 = {
        onClick: (...[$event]) => {
            __VLS_ctx.commentDialogVisible = false;
        }
    };
    __VLS_580.slots.default;
    var __VLS_580;
    const __VLS_585 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_586 = __VLS_asFunctionalComponent(__VLS_585, new __VLS_585({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.commentSubmitting),
    }));
    const __VLS_587 = __VLS_586({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.commentSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_586));
    let __VLS_589;
    let __VLS_590;
    let __VLS_591;
    const __VLS_592 = {
        onClick: (__VLS_ctx.handleSubmitComment)
    };
    __VLS_588.slots.default;
    var __VLS_588;
}
var __VLS_569;
const __VLS_593 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_594 = __VLS_asFunctionalComponent(__VLS_593, new __VLS_593({
    modelValue: (__VLS_ctx.burndownDialogVisible),
    title: "项目燃尽图",
    width: "980px",
    ...{ class: "burndown-dialog" },
}));
const __VLS_595 = __VLS_594({
    modelValue: (__VLS_ctx.burndownDialogVisible),
    title: "项目燃尽图",
    width: "980px",
    ...{ class: "burndown-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_594));
__VLS_596.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "burndown-dialog-body" },
});
/** @type {[typeof ProjectBurndownChart, ]} */ ;
// @ts-ignore
const __VLS_597 = __VLS_asFunctionalComponent(ProjectBurndownChart, new ProjectBurndownChart({
    data: (__VLS_ctx.burndown),
}));
const __VLS_598 = __VLS_597({
    data: (__VLS_ctx.burndown),
}, ...__VLS_functionalComponentArgsRest(__VLS_597));
var __VLS_596;
/** @type {[typeof RequirementAiDialog, ]} */ ;
// @ts-ignore
const __VLS_600 = __VLS_asFunctionalComponent(RequirementAiDialog, new RequirementAiDialog({
    ...{ 'onChanged': {} },
    modelValue: (__VLS_ctx.requirementAiDialogVisible),
    task: (__VLS_ctx.currentRequirementAiTask),
    canManage: (__VLS_ctx.canManageWorkItem),
}));
const __VLS_601 = __VLS_600({
    ...{ 'onChanged': {} },
    modelValue: (__VLS_ctx.requirementAiDialogVisible),
    task: (__VLS_ctx.currentRequirementAiTask),
    canManage: (__VLS_ctx.canManageWorkItem),
}, ...__VLS_functionalComponentArgsRest(__VLS_600));
let __VLS_603;
let __VLS_604;
let __VLS_605;
const __VLS_606 = {
    onChanged: (__VLS_ctx.handleRequirementAiChanged)
};
var __VLS_602;
/** @type {__VLS_StyleScopedClasses['iteration-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-brand-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar-list']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-head']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-title']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-date']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-head']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-title']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-head-side']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-date']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-iteration-progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-sidebar-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-main']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-topbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-back-link']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-topbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['header-profile-group']} */ ;
/** @type {__VLS_StyleScopedClasses['header-notification-button']} */ ;
/** @type {__VLS_StyleScopedClasses['header-notification-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['header-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['user-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['user-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-value-row']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-highlight']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-track']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-subtext']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-dots']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-stat-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-list-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-code']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-hours']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-plan']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-creator']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty-row']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-row']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-code']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-item-code']} */ ;
/** @type {__VLS_StyleScopedClasses['standalone']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-item-link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-primary-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-primary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-primary-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-title-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['status-select']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-hours']} */ ;
/** @type {__VLS_StyleScopedClasses['work-hours-input']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-type-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-plan']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-plan-text']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['assignee-select']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-owner-line']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-owner-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-owner-name']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-priority']} */ ;
/** @type {__VLS_StyleScopedClasses['priority-select']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-priority-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-creator']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-creator-name']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ai']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['pass']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['success']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-pagination-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-text']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-header']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-header-main']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-close']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-heading-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-heading-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-heading-line']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-heading-text']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-status-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-header-side']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-priority-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-form']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-top']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-title-input-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-id-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-col']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-static-field']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-col']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-inline-pair']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-col']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-col']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-inline-pair']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-form-item-plain']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-hours-item']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-inline-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-editor-description']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-body']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-title']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-requirement-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-description-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-dialog-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-task-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-list']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-item']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-item-head']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-item-content']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-editor-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-dialog-body']} */ ;
// @ts-ignore
var __VLS_290 = __VLS_289, __VLS_388 = __VLS_387;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            Bell: Bell,
            ChatDotRound: ChatDotRound,
            Cpu: Cpu,
            Delete: Delete,
            EditPen: EditPen,
            Filter: Filter,
            FolderOpened: FolderOpened,
            Finished: Finished,
            Management: Management,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Search: Search,
            Tickets: Tickets,
            CompactSelectMenu: CompactSelectMenu,
            MarkdownEditor: MarkdownEditor,
            ProjectBurndownChart: ProjectBurndownChart,
            RequirementAiDialog: RequirementAiDialog,
            WorkItemMemberField: WorkItemMemberField,
            renderMarkdownToHtml: renderMarkdownToHtml,
            taskStatusOptions: taskStatusOptions,
            authStore: authStore,
            notificationStore: notificationStore,
            canManageIteration: canManageIteration,
            canManageWorkItem: canManageWorkItem,
            canRequirementDevPass: canRequirementDevPass,
            canRequirementTestPass: canRequirementTestPass,
            board: board,
            projectParticipantUserIds: projectParticipantUserIds,
            projectParticipantUsers: projectParticipantUsers,
            workItems: workItems,
            burndown: burndown,
            burndownDialogVisible: burndownDialogVisible,
            statusUpdatingId: statusUpdatingId,
            workItemLoading: workItemLoading,
            keyword: keyword,
            activeTypeTab: activeTypeTab,
            workItemPagination: workItemPagination,
            workItemTotalPages: workItemTotalPages,
            workItemFilters: workItemFilters,
            workItemFilterPopoverVisible: workItemFilterPopoverVisible,
            selectedScope: selectedScope,
            iterationDialogVisible: iterationDialogVisible,
            iterationEditing: iterationEditing,
            iterationSubmitting: iterationSubmitting,
            iterationFormRef: iterationFormRef,
            iterationForm: iterationForm,
            iterationDateRange: iterationDateRange,
            workItemDialogVisible: workItemDialogVisible,
            workItemEditing: workItemEditing,
            workItemSubmitting: workItemSubmitting,
            commentDialogVisible: commentDialogVisible,
            commentLoading: commentLoading,
            commentSubmitting: commentSubmitting,
            requirementAiDialogVisible: requirementAiDialogVisible,
            currentRequirementAiTask: currentRequirementAiTask,
            legacyRequirementNeedsUpgrade: legacyRequirementNeedsUpgrade,
            legacyRequirementPreview: legacyRequirementPreview,
            currentCommentTask: currentCommentTask,
            taskComments: taskComments,
            workItemFormRef: workItemFormRef,
            commentForm: commentForm,
            workItemForm: workItemForm,
            iterationRules: iterationRules,
            workItemRules: workItemRules,
            buildUserLabel: buildUserLabel,
            isRequirementWorkItem: isRequirementWorkItem,
            requirementDocumentPlaceholder: requirementDocumentPlaceholder,
            requirementSelectableOptions: requirementSelectableOptions,
            workItemWorkHoursLockedReason: workItemWorkHoursLockedReason,
            workItemDisplayCode: workItemDisplayCode,
            workItemPriorityTone: workItemPriorityTone,
            workItemPriorityBadge: workItemPriorityBadge,
            workItemStatusDisplay: workItemStatusDisplay,
            workItemStatusTone: workItemStatusTone,
            workItemEditorHeight: workItemEditorHeight,
            workItemDialogUpdatedAt: workItemDialogUpdatedAt,
            hasWorkItemPlanDateRange: hasWorkItemPlanDateRange,
            formatWorkItemPlanDateRange: formatWorkItemPlanDateRange,
            workspaceStatCards: workspaceStatCards,
            unplannedProgressPercent: unplannedProgressPercent,
            handleOpenNotificationsProxy: handleOpenNotificationsProxy,
            setTypeTab: setTypeTab,
            formatCompactDateRange: formatCompactDateRange,
            iterationSidebarPercent: iterationSidebarPercent,
            iterationStatusIcon: iterationStatusIcon,
            workItemTypeTone: workItemTypeTone,
            workItemTone: workItemTone,
            workspacePriorityTone: workspacePriorityTone,
            ownerInitial: ownerInitial,
            taskStatusSelectOptions: taskStatusSelectOptions,
            prioritySelectOptions: prioritySelectOptions,
            assigneeSelectOptions: assigneeSelectOptions,
            renderCommentContent: renderCommentContent,
            handleTaskMarkdownImageUpload: handleTaskMarkdownImageUpload,
            formatTaskStatusLabel: formatTaskStatusLabel,
            getRowWorkHoursLockedReason: getRowWorkHoursLockedReason,
            openRequirementAiDialog: openRequirementAiDialog,
            handleRequirementAiChanged: handleRequirementAiChanged,
            handleRequirementDevPass: handleRequirementDevPass,
            handleRequirementTestPass: handleRequirementTestPass,
            handleCommentImagePreview: handleCommentImagePreview,
            goBack: goBack,
            openWorkItemDetailFromRow: openWorkItemDetailFromRow,
            closeWorkItemDetail: closeWorkItemDetail,
            handleWorkItemDrawerBeforeClose: handleWorkItemDrawerBeforeClose,
            handleWorkItemDialogClosed: handleWorkItemDialogClosed,
            selectUnplanned: selectUnplanned,
            selectIteration: selectIteration,
            handleFilterSearch: handleFilterSearch,
            handleFilterReset: handleFilterReset,
            handlePageSizeChange: handlePageSizeChange,
            handleWorkItemPrevPage: handleWorkItemPrevPage,
            handleWorkItemNextPage: handleWorkItemNextPage,
            openCreateIterationDialog: openCreateIterationDialog,
            openEditIterationDialog: openEditIterationDialog,
            handleSubmitIteration: handleSubmitIteration,
            handleDeleteIteration: handleDeleteIteration,
            openCreateWorkItemDialog: openCreateWorkItemDialog,
            openCommentDialog: openCommentDialog,
            handleSubmitComment: handleSubmitComment,
            handleSubmitWorkItem: handleSubmitWorkItem,
            handleDeleteWorkItem: handleDeleteWorkItem,
            handleQuickStatusChange: handleQuickStatusChange,
            handleQuickPriorityChange: handleQuickPriorityChange,
            handleQuickWorkHoursChange: handleQuickWorkHoursChange,
            handleQuickAssigneeChange: handleQuickAssigneeChange,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=IterationView.vue.js.map