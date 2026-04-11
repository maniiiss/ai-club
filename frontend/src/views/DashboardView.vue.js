/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Cpu, FolderOpened, Tickets } from '@element-plus/icons-vue';
import { pagePipelineBindings, triggerPipelineBuild } from '@/api/cicd';
import { VueDraggable } from 'vue-draggable-plus';
import { createGitlabMergeRequest, listGitlabBindingOptions, listGitlabBranches } from '@/api/gitlab';
import { getDashboardOverview } from '@/api/platform';
import { useAuthStore } from '@/stores/auth';
import { buildDefaultDashboardLayout, DASHBOARD_WIDGET_DEFINITIONS, filterDashboardWidgetsByPermission, mergeDashboardLayout, readStoredDashboardLayout, writeStoredDashboardLayout } from '@/utils/dashboardLayout';
const QUICK_TASK_STORAGE_KEY = 'git-ai-club:dashboard-quick-tasks:v1';
const DASHBOARD_BASE_ROW_HEIGHT_PX = 220;
const DASHBOARD_GRID_GAP_PX = 20;
const DASHBOARD_GRID_ROW_UNIT_PX = 8;
const DASHBOARD_WIDTH_OPTIONS = [
    { value: 'quarter', label: '1/4' },
    { value: 'half', label: '1/2' },
    { value: 'threeQuarter', label: '3/4' },
    { value: 'full', label: '1' }
];
const DASHBOARD_HEIGHT_OPTIONS = [
    { value: 'single', label: '1 行' },
    { value: 'double', label: '2 行' },
    { value: 'triple', label: '3 行' },
    { value: 'quadruple', label: '4 行' }
];
const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const dashboardEditing = ref(false);
const overview = ref(fallbackOverview());
const widgetLayout = ref([]);
const quickTaskItems = ref([]);
const quickMergeDialogVisible = ref(false);
const quickMergeResultVisible = ref(false);
const quickMergeSubmitting = ref(false);
const quickBuildLoading = ref(false);
const quickBuildBindings = ref([]);
const quickBuildTriggeringId = ref(null);
const quickMergeFormRef = ref();
const quickMergeBindingOptions = ref([]);
const quickMergeSourceBranchOptions = ref([]);
const quickMergeTargetBranchOptions = ref([]);
const sourceBranchLoading = ref(false);
const targetBranchLoading = ref(false);
const quickMergeResult = ref(null);
const quickMergeForm = reactive({ bindingId: null, sourceBranch: '', targetBranch: '', title: '', description: '' });
const widgetMeasuredRowSpanMap = ref({});
const quickMergeRules = {
    bindingId: [{ required: true, message: '请选择项目仓库', trigger: 'change' }],
    sourceBranch: [{ required: true, message: '请选择源分支', trigger: 'change' }],
    targetBranch: [{ required: true, message: '请选择目标分支', trigger: 'change' }],
    title: [{ required: true, message: '请输入 MR 标题', trigger: 'blur' }]
};
const canViewTasks = computed(() => authStore.hasPermission('task:view'));
const canViewProjects = computed(() => authStore.hasPermission('project:view'));
const canViewGitlab = computed(() => authStore.hasPermission('gitlab:view'));
const canManageGitlab = computed(() => authStore.hasPermission('gitlab:manage'));
const canViewCicd = computed(() => authStore.hasPermission('cicd:view'));
const canManageCicd = computed(() => authStore.hasPermission('cicd:manage'));
const meNames = computed(() => [authStore.user?.nickname, authStore.user?.username].filter((value) => Boolean(value && value.trim())).map((value) => value.trim()));
const gitlabBindingCount = computed(() => quickMergeBindingOptions.value.length);
const quickBuildBindingCount = computed(() => quickBuildBindings.value.length);
const dashboardLayoutUserId = computed(() => authStore.user?.id ?? null);
const availableWidgetDefinitions = computed(() => filterDashboardWidgetsByPermission(DASHBOARD_WIDGET_DEFINITIONS, (permission) => authStore.hasPermission(permission)));
const widgetDefinitionMap = computed(() => new Map(availableWidgetDefinitions.value.map((definition) => [definition.id, definition])));
const visibleWidgetLayouts = computed({
    get: () => widgetLayout.value.filter((item) => item.visible && widgetDefinitionMap.value.has(item.id)),
    set: (nextVisibleLayouts) => {
        const nextVisibleIds = new Set(nextVisibleLayouts.map((item) => item.id));
        const currentById = new Map(widgetLayout.value.map((item) => [item.id, item]));
        const hiddenLayouts = widgetLayout.value
            .filter((item) => widgetDefinitionMap.value.has(item.id) && !nextVisibleIds.has(item.id))
            .map((item) => ({ ...item, visible: false }));
        widgetLayout.value = [
            ...nextVisibleLayouts.map((item) => ({
                ...(currentById.get(item.id) || item),
                visible: true
            })),
            ...hiddenLayouts
        ];
    }
});
const hiddenWidgetDefinitions = computed(() => widgetLayout.value
    .filter((item) => !item.visible)
    .map((item) => widgetDefinitionMap.value.get(item.id))
    .filter((definition) => Boolean(definition)));
const myTasks = computed(() => {
    const explicit = overview.value.myTasks ?? [];
    if (explicit.length) {
        return sortTasks(explicit).slice(0, 8);
    }
    const recent = overview.value.recentTasks ?? [];
    const mine = recent.filter((task) => meNames.value.includes(task.assignee));
    return sortTasks(mine.length ? mine : recent).slice(0, 8);
});
const activeProjects = computed(() => overview.value.activeProjects.slice(0, 5));
const onlineAgents = computed(() => overview.value.onlineAgents.slice(0, 5));
const mergeAlertCount = computed(() => overview.value.stats.mergeAlertCount ?? overview.value.currentUserGitlabMergeLogs.filter((item) => item.result !== 'MERGED').length);
const recentTaskRows = computed(() => myTasks.value.slice(0, 6).map((task) => ({
    id: String(task.id),
    title: task.name,
    subtitle: `项目：${task.projectName} · 负责人：${task.assignee || '未指派'}`,
    agent: task.agentName || task.assignee || '未指派',
    health: taskHealthPercent(task),
    updatedAt: formatDateTime(task.updatedAt)
})));
const statCards = computed(() => [
    { id: 'stat-project-count', value: overview.value.stats.projectCount ?? 0, caption: `${activeProjects.value.length} 个活跃项目` },
    { id: 'stat-agent-count', value: overview.value.stats.agentCount || onlineAgents.value.length, caption: `${onlineAgents.value.length} 个在线智能体` },
    { id: 'stat-task-count', value: formatCompactNumber(overview.value.stats.taskCount || myTasks.value.length), caption: `${myTasks.value.length} 个待跟进任务` }
]);
const statCardMap = computed(() => new Map(statCards.value.map((item) => [item.id, item])));
const widgetContentElementMap = new Map();
let widgetContentResizeObserver = null;
watch([availableWidgetDefinitions, dashboardLayoutUserId], ([definitions, userId], previousValue) => {
    const previousUserId = previousValue?.[1] ?? null;
    const shouldReloadStoredLayout = !widgetLayout.value.length || previousValue === undefined || userId !== previousUserId;
    // 首次进入页面或切换账号时，优先读取当前用户自己的缓存布局，避免不同账号之间相互覆盖。
    const sourceLayout = shouldReloadStoredLayout
        ? readStoredDashboardLayout(userId, definitions)
        : widgetLayout.value;
    widgetLayout.value = mergeDashboardLayout(sourceLayout, definitions);
    if (definitions.length > 0 && widgetLayout.value.every((item) => !item.visible)) {
        widgetLayout.value = buildDefaultDashboardLayout(definitions);
    }
}, { immediate: true });
watch(widgetLayout, (nextLayout) => writeStoredDashboardLayout(nextLayout, dashboardLayoutUserId.value), { deep: true });
watch(quickTaskItems, (items) => writeQuickTaskItems(items), { deep: true });
watch([visibleWidgetLayouts, activeProjects, onlineAgents, recentTaskRows, quickTaskItems, mergeAlertCount, gitlabBindingCount, quickBuildBindingCount, dashboardEditing], () => {
    void nextTick(syncVisibleWidgetRowSpans);
}, { deep: true });
watch(() => quickMergeForm.bindingId, async (bindingId) => {
    quickMergeForm.sourceBranch = '';
    quickMergeForm.targetBranch = '';
    quickMergeSourceBranchOptions.value = [];
    quickMergeTargetBranchOptions.value = [];
    if (!bindingId) {
        return;
    }
    await Promise.all([loadQuickMergeBranches('source'), loadQuickMergeBranches('target')]);
    const currentBinding = quickMergeBindingOptions.value.find((item) => item.id === bindingId);
    const preferredTarget = currentBinding?.defaultTargetBranch || quickMergeTargetBranchOptions.value.find((item) => item.defaultBranch)?.name || '';
    if (preferredTarget) {
        quickMergeForm.targetBranch = preferredTarget;
    }
});
function getWidgetDefinition(widgetId) {
    return widgetDefinitionMap.value.get(widgetId);
}
function isActionWidget(widgetId) {
    return widgetId === 'gitlab-quick-merge' || widgetId === 'quick-pipeline-build';
}
function shouldShowWidgetHeader(widgetId) {
    return !isActionWidget(widgetId) || dashboardEditing.value;
}
function shouldShowWidgetHeaderCopy(widgetId) {
    return !isActionWidget(widgetId);
}
function widgetWidthClass(width) {
    if (width === 'quarter')
        return 'width-quarter';
    if (width === 'half')
        return 'width-half';
    if (width === 'threeQuarter')
        return 'width-three-quarter';
    return 'width-full';
}
function widgetHeightClass(height) {
    if (height === 'double')
        return 'height-double';
    if (height === 'triple')
        return 'height-triple';
    if (height === 'quadruple')
        return 'height-quadruple';
    return 'height-single';
}
function updateWidgetWidth(widgetId, width) {
    updateWidgetLayout(widgetId, { width });
}
function updateWidgetHeight(widgetId, height) {
    updateWidgetLayout(widgetId, { height });
}
function updateWidgetLayout(widgetId, patch) {
    // 宽高调整只更新目标卡片自身字段，避免拖拽顺序和其它组件状态被意外重置。
    widgetLayout.value = widgetLayout.value.map((item) => (item.id === widgetId ? { ...item, ...patch } : item));
    void nextTick(() => syncWidgetCardRowSpan(widgetId));
}
/**
 * 编辑态切换宽度后，卡片里的换行和按钮布局都会变化。
 * 这里用内容真实高度反推网格跨行数，让组件在 1/4 宽度下优先向下展开，而不是被硬压缩。
 */
function widgetCardStyle(layoutItem) {
    const measuredRowSpan = widgetMeasuredRowSpanMap.value[layoutItem.id];
    return {
        gridRowEnd: `span ${measuredRowSpan ?? calculateMinimumGridRowSpan(layoutItem.height)}`
    };
}
function setWidgetContentRef(widgetId) {
    return (target) => {
        const element = resolveWidgetContentElement(target);
        const previousElement = widgetContentElementMap.get(widgetId);
        if (previousElement && previousElement !== element) {
            widgetContentResizeObserver?.unobserve(previousElement);
            widgetContentElementMap.delete(widgetId);
        }
        if (!(element instanceof HTMLElement)) {
            widgetMeasuredRowSpanMap.value = {
                ...widgetMeasuredRowSpanMap.value,
                [widgetId]: undefined
            };
            return;
        }
        widgetContentElementMap.set(widgetId, element);
        widgetContentResizeObserver?.observe(element);
        void nextTick(() => syncWidgetCardRowSpan(widgetId));
    };
}
function resolveWidgetContentElement(target) {
    if (target instanceof HTMLElement) {
        return target;
    }
    if (target && '$el' in target && target.$el instanceof HTMLElement) {
        return target.$el;
    }
    return null;
}
function syncVisibleWidgetRowSpans() {
    visibleWidgetLayouts.value.forEach((item) => {
        syncWidgetCardRowSpan(item.id);
    });
}
function syncWidgetCardRowSpan(widgetId) {
    const layoutItem = widgetLayout.value.find((item) => item.id === widgetId);
    const contentElement = widgetContentElementMap.get(widgetId);
    if (!layoutItem || !contentElement) {
        return;
    }
    const contentHeight = Math.ceil(contentElement.scrollHeight);
    const minimumHeight = resolveMinimumWidgetHeight(layoutItem.height);
    const nextRowSpan = calculateGridRowSpan(Math.max(contentHeight, minimumHeight));
    if (widgetMeasuredRowSpanMap.value[widgetId] === nextRowSpan) {
        return;
    }
    widgetMeasuredRowSpanMap.value = {
        ...widgetMeasuredRowSpanMap.value,
        [widgetId]: nextRowSpan
    };
}
function resolveMinimumWidgetHeight(height) {
    const rowCount = resolveWidgetHeightRowCount(height);
    return (DASHBOARD_BASE_ROW_HEIGHT_PX * rowCount) + (DASHBOARD_GRID_GAP_PX * Math.max(0, rowCount - 1));
}
function resolveWidgetHeightRowCount(height) {
    if (height === 'double')
        return 2;
    if (height === 'triple')
        return 3;
    if (height === 'quadruple')
        return 4;
    return 1;
}
function calculateMinimumGridRowSpan(height) {
    return calculateGridRowSpan(resolveMinimumWidgetHeight(height));
}
function calculateGridRowSpan(pixelHeight) {
    return Math.max(1, Math.ceil((pixelHeight + DASHBOARD_GRID_GAP_PX) / (DASHBOARD_GRID_ROW_UNIT_PX + DASHBOARD_GRID_GAP_PX)));
}
function toggleDashboardEditing() {
    dashboardEditing.value = !dashboardEditing.value;
}
function restoreDefaultLayout() {
    widgetLayout.value = buildDefaultDashboardLayout(availableWidgetDefinitions.value);
    ElMessage.success('首页看板已恢复默认布局');
}
function hideWidget(widgetId) {
    const target = widgetLayout.value.find((item) => item.id === widgetId);
    if (!target)
        return;
    const remaining = widgetLayout.value.filter((item) => item.id !== widgetId);
    widgetLayout.value = [
        ...remaining.filter((item) => item.visible),
        ...remaining.filter((item) => !item.visible),
        { ...target, visible: false }
    ];
}
function showWidget(widgetId) {
    const target = widgetLayout.value.find((item) => item.id === widgetId);
    if (!target)
        return;
    const remaining = widgetLayout.value.filter((item) => item.id !== widgetId);
    widgetLayout.value = [
        ...remaining.filter((item) => item.visible),
        { ...target, visible: true },
        ...remaining.filter((item) => !item.visible)
    ];
}
function buildDefaultQuickTaskItems() {
    return [
        { id: 'renew-ssl', label: '更新生产环境 SSL 证书', checked: false },
        { id: 'prepare-weekly-report', label: '周会汇报 PPT 准备', checked: true },
        { id: 'core-module-review', label: '代码审查：Core-Module v0.9', checked: false },
        { id: 'task-center-follow-up', label: canViewTasks.value ? '进入任务中心跟进待办' : '整理项目清单与待办', checked: false }
    ];
}
function readQuickTaskItems() {
    const defaultItems = buildDefaultQuickTaskItems();
    if (typeof window === 'undefined') {
        return defaultItems;
    }
    const rawValue = window.localStorage.getItem(QUICK_TASK_STORAGE_KEY);
    if (!rawValue) {
        return defaultItems;
    }
    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return defaultItems;
        }
        const checkedMap = new Map(parsed
            .filter((item) => item && typeof item.id === 'string' && typeof item.checked === 'boolean')
            .map((item) => [item.id, item.checked]));
        return defaultItems.map((item) => ({
            ...item,
            checked: checkedMap.get(item.id) ?? item.checked
        }));
    }
    catch {
        return defaultItems;
    }
}
function writeQuickTaskItems(items) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(QUICK_TASK_STORAGE_KEY, JSON.stringify(items));
}
async function loadOverview() {
    loading.value = true;
    try {
        overview.value = normalizeOverview(await getDashboardOverview());
    }
    catch {
        overview.value = fallbackOverview();
    }
    finally {
        loading.value = false;
    }
}
/**
 * 首页快速构建卡片只拉取少量启用中的流水线绑定，保证首页打开速度和交互聚焦。
 */
async function loadQuickBuildBindings() {
    if (!canViewCicd.value) {
        quickBuildBindings.value = [];
        return;
    }
    quickBuildLoading.value = true;
    try {
        const pageData = await pagePipelineBindings({
            page: 1,
            size: 4,
            enabled: true
        });
        quickBuildBindings.value = pageData.records;
    }
    catch (error) {
        quickBuildBindings.value = [];
        ElMessage.error(error?.response?.data?.message || '加载快速构建列表失败');
    }
    finally {
        quickBuildLoading.value = false;
    }
}
function resetQuickMergeForm() {
    quickMergeForm.bindingId = null;
    quickMergeForm.sourceBranch = '';
    quickMergeForm.targetBranch = '';
    quickMergeForm.title = '';
    quickMergeForm.description = '';
    quickMergeSourceBranchOptions.value = [];
    quickMergeTargetBranchOptions.value = [];
    quickMergeFormRef.value?.clearValidate();
}
async function loadQuickMergeBindings() {
    quickMergeBindingOptions.value = await listGitlabBindingOptions();
    if (!quickMergeBindingOptions.value.length) {
        throw new Error('暂无可用的 GitLab 绑定项目');
    }
    if (!quickMergeForm.bindingId) {
        quickMergeForm.bindingId = quickMergeBindingOptions.value[0].id;
    }
}
async function loadQuickMergeBranches(kind, keyword = '') {
    if (!quickMergeForm.bindingId)
        return;
    if (kind === 'source') {
        sourceBranchLoading.value = true;
    }
    else {
        targetBranchLoading.value = true;
    }
    try {
        const branches = await listGitlabBranches(quickMergeForm.bindingId, keyword);
        if (kind === 'source') {
            quickMergeSourceBranchOptions.value = branches;
        }
        else {
            quickMergeTargetBranchOptions.value = branches;
        }
    }
    finally {
        if (kind === 'source') {
            sourceBranchLoading.value = false;
        }
        else {
            targetBranchLoading.value = false;
        }
    }
}
function handleQuickMergeSourceSearch(keyword) {
    void loadQuickMergeBranches('source', keyword);
}
function handleQuickMergeTargetSearch(keyword) {
    void loadQuickMergeBranches('target', keyword);
}
async function openQuickMergeDialog() {
    try {
        resetQuickMergeForm();
        await loadQuickMergeBindings();
        quickMergeDialogVisible.value = true;
    }
    catch (error) {
        ElMessage.warning(error?.message || '暂无可用的 GitLab 绑定项目');
    }
}
async function handleQuickMergeSubmit() {
    const valid = await quickMergeFormRef.value?.validate().catch(() => false);
    if (!valid || quickMergeForm.bindingId === null) {
        return;
    }
    if (quickMergeForm.sourceBranch.trim() === quickMergeForm.targetBranch.trim()) {
        ElMessage.warning('源分支与目标分支不能相同');
        return;
    }
    quickMergeSubmitting.value = true;
    try {
        const result = await createGitlabMergeRequest(quickMergeForm.bindingId, {
            sourceBranch: quickMergeForm.sourceBranch.trim(),
            targetBranch: quickMergeForm.targetBranch.trim(),
            title: quickMergeForm.title.trim(),
            description: quickMergeForm.description.trim() || undefined
        });
        quickMergeResult.value = result;
        quickMergeDialogVisible.value = false;
        quickMergeResultVisible.value = true;
        ElMessage.success(`MR !${result.iid} 已创建`);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '创建 MR 失败');
    }
    finally {
        quickMergeSubmitting.value = false;
    }
}
function formatQuickBuildTriggerStatus(status) {
    if (status === 'QUEUED')
        return '已排队';
    if (status === 'SUCCESS')
        return '成功';
    if (status === 'FAILED')
        return '失败';
    return status || '未触发';
}
function quickBuildTriggerStatusTone(status) {
    if (status === 'QUEUED' || status === 'SUCCESS')
        return 'success';
    if (status === 'FAILED')
        return 'danger';
    return 'neutral';
}
function handleOpenPipelineCenter() {
    router.push('/cicd/pipeline-bindings');
}
async function handleQuickBuildTrigger(binding) {
    if (!canManageCicd.value) {
        handleOpenPipelineCenter();
        return;
    }
    quickBuildTriggeringId.value = binding.id;
    try {
        const result = await triggerPipelineBuild(binding.id);
        ElMessage.success(result.message);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '触发构建失败');
    }
    finally {
        quickBuildTriggeringId.value = null;
        await loadQuickBuildBindings();
    }
}
function formatCompactNumber(value) {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
}
function sortTasks(tasks) {
    const priorityScore = { 高: 0, 中: 1, 低: 2 };
    const statusScore = { 进行中: 0, 开发中: 0, 处理中: 0, 待开始: 1, 未开始: 1, 草稿: 1, 阻塞: 2, 已完成: 3, 完成: 3 };
    return [...tasks].sort((left, right) => {
        const statusDiff = (statusScore[left.status] ?? 9) - (statusScore[right.status] ?? 9);
        if (statusDiff)
            return statusDiff;
        const priorityDiff = (priorityScore[left.priority] ?? 9) - (priorityScore[right.priority] ?? 9);
        if (priorityDiff)
            return priorityDiff;
        return (right.updatedAt || '').localeCompare(left.updatedAt || '');
    });
}
function taskHealthPercent(task) {
    const statusScore = { 进行中: 85, 开发中: 82, 处理中: 78, 待开始: 60, 未开始: 58, 草稿: 46, 阻塞: 24, 已完成: 100, 完成: 100 };
    const priorityDelta = { 高: -4, 中: 0, 低: 4 };
    return Math.max(8, Math.min(100, (statusScore[task.status] ?? 60) + (priorityDelta[task.priority] ?? 0)));
}
function formatDateTime(value) {
    return value ? value.replace('T', ' ').slice(0, 16) : '-';
}
function fallbackOverview() {
    return {
        stats: { projectCount: 0, agentCount: 0, taskCount: 0, repoCount: 0, myTaskCount: 0, myInProgressTaskCount: 0, myPendingTaskCount: 0, myMergeLogCount: 0, mergeAlertCount: 0 },
        activeProjects: [],
        onlineAgents: [],
        recentTasks: [],
        currentUserGitlabUsername: null,
        currentUserGitlabMergeLogs: [],
        myTasks: [],
        mergeAlerts: [],
        focusIterationBoard: null,
        focusProjectBurndown: null
    };
}
function normalizeOverview(data) {
    const base = fallbackOverview();
    return {
        ...base,
        ...data,
        stats: { ...base.stats, ...(data.stats || {}) },
        activeProjects: data.activeProjects || [],
        onlineAgents: data.onlineAgents || [],
        recentTasks: data.recentTasks || [],
        currentUserGitlabMergeLogs: data.currentUserGitlabMergeLogs || [],
        myTasks: data.myTasks || [],
        mergeAlerts: data.mergeAlerts || [],
        focusIterationBoard: data.focusIterationBoard || null,
        focusProjectBurndown: data.focusProjectBurndown || null
    };
}
onMounted(async () => {
    // 监听卡片内容尺寸变化，保证宽度切换和数据变化后都能重新计算最佳高度。
    if (typeof ResizeObserver !== 'undefined') {
        widgetContentResizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const widgetId = entry.target.getAttribute('data-widget-id');
                if (widgetId) {
                    syncWidgetCardRowSpan(widgetId);
                }
            });
        });
    }
    quickTaskItems.value = readQuickTaskItems();
    await loadOverview();
    if (canViewGitlab.value) {
        try {
            await loadQuickMergeBindings();
        }
        catch {
            quickMergeBindingOptions.value = [];
        }
    }
    if (canViewCicd.value) {
        await loadQuickBuildBindings();
    }
    void nextTick(syncVisibleWidgetRowSpans);
});
onBeforeUnmount(() => {
    widgetContentResizeObserver?.disconnect();
    widgetContentResizeObserver = null;
    widgetContentElementMap.clear();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-title']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-description']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-description']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-group']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-label']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-button']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-action-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-button']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-button']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-status-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-status-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-status-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-button']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-button']} */ ;
/** @type {__VLS_StyleScopedClasses['solid']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['success']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-task-item']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-task-item']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-task-item']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-head']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-item']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-head']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-head-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-group']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-value']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-hero-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-hero-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-side']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-half']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-three-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-full']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-half']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-three-quarter']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['width-full']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-head-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-side']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "dashboard-screen" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "dashboard-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "dashboard-toolbar-actions" },
});
if (__VLS_ctx.dashboardEditing) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.restoreDefaultLayout) },
        ...{ class: "dashboard-toolbar-button ghost" },
        type: "button",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggleDashboardEditing) },
    ...{ class: "dashboard-toolbar-button primary" },
    type: "button",
});
(__VLS_ctx.dashboardEditing ? '完成编辑' : '编辑看板');
const __VLS_0 = {}.VueDraggable;
/** @type {[typeof __VLS_components.VueDraggable, typeof __VLS_components.VueDraggable, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.visibleWidgetLayouts),
    ...{ class: "dashboard-widget-grid" },
    itemKey: "id",
    tag: "section",
    handle: ".dashboard-widget-drag-handle",
    ghostClass: "dashboard-widget-ghost",
    chosenClass: "dashboard-widget-chosen",
    animation: (200),
    disabled: (!__VLS_ctx.dashboardEditing),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.visibleWidgetLayouts),
    ...{ class: "dashboard-widget-grid" },
    itemKey: "id",
    tag: "section",
    handle: ".dashboard-widget-drag-handle",
    ghostClass: "dashboard-widget-ghost",
    chosenClass: "dashboard-widget-chosen",
    animation: (200),
    disabled: (!__VLS_ctx.dashboardEditing),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
for (const [element] of __VLS_getVForSourceType((__VLS_ctx.visibleWidgetLayouts))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (element.id),
        ...{ class: "dashboard-widget-card" },
        ...{ class: ([
                __VLS_ctx.widgetWidthClass(element.width),
                __VLS_ctx.widgetHeightClass(element.height),
                {
                    editing: __VLS_ctx.dashboardEditing,
                    'quick-action-widget': __VLS_ctx.isActionWidget(element.id),
                    'quick-merge-widget': element.id === 'gitlab-quick-merge',
                    'quick-build-widget': element.id === 'quick-pipeline-build'
                }
            ]) },
        ...{ style: (__VLS_ctx.widgetCardStyle(element)) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ref: (__VLS_ctx.setWidgetContentRef(element.id)),
        ...{ class: "dashboard-widget-card-shell" },
        'data-widget-id': (element.id),
    });
    if (__VLS_ctx.shouldShowWidgetHeader(element.id)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "dashboard-widget-head" },
        });
        if (__VLS_ctx.shouldShowWidgetHeaderCopy(element.id)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-head-copy" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-title" },
            });
            (__VLS_ctx.getWidgetDefinition(element.id)?.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-description" },
            });
            (__VLS_ctx.getWidgetDefinition(element.id)?.description);
        }
        if (__VLS_ctx.dashboardEditing) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-head-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-size-group" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "dashboard-widget-size-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-size-buttons" },
            });
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.DASHBOARD_WIDTH_OPTIONS))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.shouldShowWidgetHeader(element.id)))
                                return;
                            if (!(__VLS_ctx.dashboardEditing))
                                return;
                            __VLS_ctx.updateWidgetWidth(element.id, option.value);
                        } },
                    key: (`width-${element.id}-${option.value}`),
                    ...{ class: "dashboard-widget-size-button" },
                    ...{ class: ({ active: element.width === option.value }) },
                    type: "button",
                    'aria-label': (`将组件宽度调整为 ${option.label}`),
                    'aria-pressed': (element.width === option.value),
                });
                (option.label);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-size-group" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "dashboard-widget-size-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dashboard-widget-size-buttons" },
            });
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.DASHBOARD_HEIGHT_OPTIONS))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.shouldShowWidgetHeader(element.id)))
                                return;
                            if (!(__VLS_ctx.dashboardEditing))
                                return;
                            __VLS_ctx.updateWidgetHeight(element.id, option.value);
                        } },
                    key: (`height-${element.id}-${option.value}`),
                    ...{ class: "dashboard-widget-size-button" },
                    ...{ class: ({ active: element.height === option.value }) },
                    type: "button",
                    'aria-label': (`将组件高度调整为 ${option.label}`),
                    'aria-pressed': (element.height === option.value),
                });
                (option.label);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "dashboard-widget-icon dashboard-widget-drag-handle" },
                type: "button",
                'aria-label': "拖拽排序",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.shouldShowWidgetHeader(element.id)))
                            return;
                        if (!(__VLS_ctx.dashboardEditing))
                            return;
                        __VLS_ctx.hideWidget(element.id);
                    } },
                ...{ class: "dashboard-widget-icon" },
                type: "button",
                'aria-label': "隐藏组件",
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "dashboard-widget-body" },
    });
    if (element.id === 'stat-project-count') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-icon orange" },
        });
        const __VLS_4 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
        const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_7.slots.default;
        const __VLS_8 = {}.FolderOpened;
        /** @type {[typeof __VLS_components.FolderOpened, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
        const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
        var __VLS_7;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-value" },
        });
        (__VLS_ctx.statCardMap.get('stat-project-count')?.value || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-caption" },
        });
        (__VLS_ctx.statCardMap.get('stat-project-count')?.caption);
    }
    else if (element.id === 'stat-agent-count') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-icon blue" },
        });
        const __VLS_12 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
        const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        const __VLS_16 = {}.Cpu;
        /** @type {[typeof __VLS_components.Cpu, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        var __VLS_15;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-value" },
        });
        (__VLS_ctx.statCardMap.get('stat-agent-count')?.value || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-caption" },
        });
        (__VLS_ctx.statCardMap.get('stat-agent-count')?.caption);
    }
    else if (element.id === 'stat-task-count') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-icon purple" },
        });
        const __VLS_20 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
        const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        const __VLS_24 = {}.Tickets;
        /** @type {[typeof __VLS_components.Tickets, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
        const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
        var __VLS_23;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-value" },
        });
        (__VLS_ctx.statCardMap.get('stat-task-count')?.value || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-widget-caption" },
        });
        (__VLS_ctx.statCardMap.get('stat-task-count')?.caption);
    }
    else if (element.id === 'gitlab-quick-merge') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-stack" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-merge-widget-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-merge-kicker" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-merge-hero-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "quick-merge-hero-text" },
        });
        (__VLS_ctx.canManageGitlab ? (__VLS_ctx.mergeAlertCount > 0 ? `当前有 ${__VLS_ctx.mergeAlertCount} 条 GitLab 告警待关注，也可以直接发起新的 Merge Request。` : '选择项目、源分支和目标分支，直接从首页快速创建 Merge Request。') : '当前账号仅有 GitLab 查看权限，可从这里快速进入仓库管理页。');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-merge-meta-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.gitlabBindingCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.mergeAlertCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-merge-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(element.id === 'stat-project-count'))
                        return;
                    if (!!(element.id === 'stat-agent-count'))
                        return;
                    if (!!(element.id === 'stat-task-count'))
                        return;
                    if (!(element.id === 'gitlab-quick-merge'))
                        return;
                    __VLS_ctx.canViewGitlab ? __VLS_ctx.router.push('/gitlab') : __VLS_ctx.router.push('/dashboard');
                } },
            ...{ class: "quick-merge-button ghost" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(element.id === 'stat-project-count'))
                        return;
                    if (!!(element.id === 'stat-agent-count'))
                        return;
                    if (!!(element.id === 'stat-task-count'))
                        return;
                    if (!(element.id === 'gitlab-quick-merge'))
                        return;
                    __VLS_ctx.canManageGitlab ? __VLS_ctx.openQuickMergeDialog() : (__VLS_ctx.canViewGitlab ? __VLS_ctx.router.push('/gitlab') : __VLS_ctx.router.push('/dashboard'));
                } },
            ...{ class: "quick-merge-button solid" },
            type: "button",
        });
        (__VLS_ctx.canManageGitlab ? '快速发起 MR' : '进入仓库页');
    }
    else if (element.id === 'quick-pipeline-build') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-stack" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-build-widget-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-build-kicker" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-build-hero-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "quick-build-hero-text" },
        });
        (__VLS_ctx.canManageCicd ? '选择已启用的项目流水线，一键触发 Jenkins 构建并快速跳转到流水线中心继续跟进。' : '查看首页推荐的项目流水线，快速进入流水线中心了解最新构建状态。');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-build-meta-line" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.quickBuildBindingCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.canManageCicd ? '可触发构建' : '仅查看');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-scroll-area" },
        });
        if (__VLS_ctx.quickBuildLoading) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "widget-empty" },
            });
        }
        else if (__VLS_ctx.quickBuildBindings.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "quick-build-list" },
            });
            for (const [binding] of __VLS_getVForSourceType((__VLS_ctx.quickBuildBindings))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (binding.id),
                    ...{ class: "quick-build-item" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "quick-build-main" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "quick-build-title-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "quick-build-title" },
                });
                (binding.projectName);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "quick-build-status-chip" },
                    ...{ class: (__VLS_ctx.quickBuildTriggerStatusTone(binding.lastTriggerStatus)) },
                });
                (__VLS_ctx.formatQuickBuildTriggerStatus(binding.lastTriggerStatus));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "quick-build-subtitle" },
                });
                (binding.jenkinsServerName);
                (binding.jobName);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "quick-build-meta-line" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (binding.defaultBranch || '-');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.formatDateTime(binding.lastTriggeredAt));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "quick-build-message" },
                });
                (binding.lastTriggerMessage || '当前暂无最近触发结果，可直接发起新的构建。');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "quick-build-actions" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (__VLS_ctx.handleOpenPipelineCenter) },
                    ...{ class: "quick-build-button ghost" },
                    type: "button",
                });
                if (__VLS_ctx.canManageCicd) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(element.id === 'stat-project-count'))
                                    return;
                                if (!!(element.id === 'stat-agent-count'))
                                    return;
                                if (!!(element.id === 'stat-task-count'))
                                    return;
                                if (!!(element.id === 'gitlab-quick-merge'))
                                    return;
                                if (!(element.id === 'quick-pipeline-build'))
                                    return;
                                if (!!(__VLS_ctx.quickBuildLoading))
                                    return;
                                if (!(__VLS_ctx.quickBuildBindings.length))
                                    return;
                                if (!(__VLS_ctx.canManageCicd))
                                    return;
                                __VLS_ctx.handleQuickBuildTrigger(binding);
                            } },
                        ...{ class: "quick-build-button solid" },
                        type: "button",
                        disabled: (__VLS_ctx.quickBuildTriggeringId === binding.id),
                    });
                    (__VLS_ctx.quickBuildTriggeringId === binding.id ? '触发中...' : '立即构建');
                }
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "widget-empty" },
            });
            (__VLS_ctx.canManageCicd ? '当前没有可快速触发的启用流水线，请先在项目流水线页完成绑定。' : '当前没有可展示的启用流水线，可进入流水线页查看详情。');
        }
        if (__VLS_ctx.canViewCicd) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.handleOpenPipelineCenter) },
                ...{ class: "widget-footer-button" },
                type: "button",
            });
        }
    }
    else if (element.id === 'active-project-list') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-stack" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-scroll-area" },
        });
        if (__VLS_ctx.activeProjects.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-list" },
            });
            for (const [project] of __VLS_getVForSourceType((__VLS_ctx.activeProjects))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (project.id),
                    ...{ class: "info-list-item" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-list-main" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-list-title" },
                });
                (project.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-list-subtitle" },
                });
                (project.owner || '未指定');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "info-list-chip" },
                });
                (project.status || '进行中');
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "widget-empty" },
            });
        }
        if (__VLS_ctx.canViewProjects) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(element.id === 'stat-project-count'))
                            return;
                        if (!!(element.id === 'stat-agent-count'))
                            return;
                        if (!!(element.id === 'stat-task-count'))
                            return;
                        if (!!(element.id === 'gitlab-quick-merge'))
                            return;
                        if (!!(element.id === 'quick-pipeline-build'))
                            return;
                        if (!(element.id === 'active-project-list'))
                            return;
                        if (!(__VLS_ctx.canViewProjects))
                            return;
                        __VLS_ctx.router.push('/projects');
                    } },
                ...{ class: "widget-footer-button" },
                type: "button",
            });
        }
    }
    else if (element.id === 'online-agent-list') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-stack" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-scroll-area" },
        });
        if (__VLS_ctx.onlineAgents.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "info-list" },
            });
            for (const [agent] of __VLS_getVForSourceType((__VLS_ctx.onlineAgents))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (agent.id),
                    ...{ class: "info-list-item" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-list-main" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-list-title" },
                });
                (agent.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "info-list-subtitle" },
                });
                (agent.projectName || agent.category || agent.type || '智能体');
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "info-list-chip success" },
                });
                (agent.enabled ? '在线' : '停用');
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "widget-empty" },
            });
        }
        if (__VLS_ctx.authStore.hasPermission('agent:view')) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(element.id === 'stat-project-count'))
                            return;
                        if (!!(element.id === 'stat-agent-count'))
                            return;
                        if (!!(element.id === 'stat-task-count'))
                            return;
                        if (!!(element.id === 'gitlab-quick-merge'))
                            return;
                        if (!!(element.id === 'quick-pipeline-build'))
                            return;
                        if (!!(element.id === 'active-project-list'))
                            return;
                        if (!(element.id === 'online-agent-list'))
                            return;
                        if (!(__VLS_ctx.authStore.hasPermission('agent:view')))
                            return;
                        __VLS_ctx.router.push('/agents');
                    } },
                ...{ class: "widget-footer-button" },
                type: "button",
            });
        }
    }
    else if (element.id === 'recent-task-list') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-stack" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-scroll-area" },
        });
        if (__VLS_ctx.recentTaskRows.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "task-list" },
            });
            for (const [task] of __VLS_getVForSourceType((__VLS_ctx.recentTaskRows))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (task.id),
                    ...{ class: "task-list-item" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "task-list-main" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "task-list-title" },
                });
                (task.title);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "task-list-subtitle" },
                });
                (task.subtitle);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "task-list-side" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "task-health-text" },
                });
                (task.health);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "task-time-text" },
                });
                (task.updatedAt);
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "widget-empty" },
            });
        }
        if (__VLS_ctx.canViewTasks) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(element.id === 'stat-project-count'))
                            return;
                        if (!!(element.id === 'stat-agent-count'))
                            return;
                        if (!!(element.id === 'stat-task-count'))
                            return;
                        if (!!(element.id === 'gitlab-quick-merge'))
                            return;
                        if (!!(element.id === 'quick-pipeline-build'))
                            return;
                        if (!!(element.id === 'active-project-list'))
                            return;
                        if (!!(element.id === 'online-agent-list'))
                            return;
                        if (!(element.id === 'recent-task-list'))
                            return;
                        if (!(__VLS_ctx.canViewTasks))
                            return;
                        __VLS_ctx.router.push('/tasks');
                    } },
                ...{ class: "widget-footer-button" },
                type: "button",
            });
        }
    }
    else if (element.id === 'quick-task-checklist') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-scroll-area" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quick-task-list" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.quickTaskItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                key: (item.id),
                ...{ class: "quick-task-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                type: "checkbox",
            });
            (item.checked);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: ({ completed: item.checked }) },
            });
            (item.label);
        }
    }
}
var __VLS_3;
if (__VLS_ctx.dashboardEditing) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "dashboard-widget-library" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "dashboard-widget-library-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    if (__VLS_ctx.hiddenWidgetDefinitions.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dashboard-widget-library-list" },
        });
        for (const [definition] of __VLS_getVForSourceType((__VLS_ctx.hiddenWidgetDefinitions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.dashboardEditing))
                            return;
                        if (!(__VLS_ctx.hiddenWidgetDefinitions.length))
                            return;
                        __VLS_ctx.showWidget(definition.id);
                    } },
                key: (definition.id),
                ...{ class: "dashboard-widget-library-item" },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "dashboard-widget-library-item-title" },
            });
            (definition.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "dashboard-widget-library-item-desc" },
            });
            (definition.description);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "dashboard-widget-library-item-action" },
            });
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "widget-empty" },
        });
    }
}
const __VLS_28 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.quickMergeDialogVisible),
    title: "GitLab 快速发起 MR",
    width: "720px",
    alignCenter: true,
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.quickMergeDialogVisible),
    title: "GitLab 快速发起 MR",
    width: "720px",
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ref: "quickMergeFormRef",
    model: (__VLS_ctx.quickMergeForm),
    rules: (__VLS_ctx.quickMergeRules),
    labelWidth: "120px",
}));
const __VLS_34 = __VLS_33({
    ref: "quickMergeFormRef",
    model: (__VLS_ctx.quickMergeForm),
    rules: (__VLS_ctx.quickMergeRules),
    labelWidth: "120px",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
/** @type {typeof __VLS_ctx.quickMergeFormRef} */ ;
var __VLS_36 = {};
__VLS_35.slots.default;
const __VLS_38 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(__VLS_38, new __VLS_38({
    label: "项目",
    prop: "bindingId",
}));
const __VLS_40 = __VLS_39({
    label: "项目",
    prop: "bindingId",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
__VLS_41.slots.default;
const __VLS_42 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_43 = __VLS_asFunctionalComponent(__VLS_42, new __VLS_42({
    modelValue: (__VLS_ctx.quickMergeForm.bindingId),
    placeholder: "请选择已绑定 GitLab 的项目仓库",
    ...{ style: {} },
}));
const __VLS_44 = __VLS_43({
    modelValue: (__VLS_ctx.quickMergeForm.bindingId),
    placeholder: "请选择已绑定 GitLab 的项目仓库",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_43));
__VLS_45.slots.default;
for (const [binding] of __VLS_getVForSourceType((__VLS_ctx.quickMergeBindingOptions))) {
    const __VLS_46 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_47 = __VLS_asFunctionalComponent(__VLS_46, new __VLS_46({
        key: (binding.id),
        label: (`${binding.projectName} / ${binding.gitlabProjectPath || binding.gitlabProjectRef}`),
        value: (binding.id),
    }));
    const __VLS_48 = __VLS_47({
        key: (binding.id),
        label: (`${binding.projectName} / ${binding.gitlabProjectPath || binding.gitlabProjectRef}`),
        value: (binding.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_47));
}
var __VLS_45;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
var __VLS_41;
const __VLS_50 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
    label: "源分支",
    prop: "sourceBranch",
}));
const __VLS_52 = __VLS_51({
    label: "源分支",
    prop: "sourceBranch",
}, ...__VLS_functionalComponentArgsRest(__VLS_51));
__VLS_53.slots.default;
const __VLS_54 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent(__VLS_54, new __VLS_54({
    modelValue: (__VLS_ctx.quickMergeForm.sourceBranch),
    filterable: true,
    remote: true,
    reserveKeyword: true,
    placeholder: "请输入关键字搜索源分支",
    ...{ style: {} },
    remoteMethod: (__VLS_ctx.handleQuickMergeSourceSearch),
    loading: (__VLS_ctx.sourceBranchLoading),
}));
const __VLS_56 = __VLS_55({
    modelValue: (__VLS_ctx.quickMergeForm.sourceBranch),
    filterable: true,
    remote: true,
    reserveKeyword: true,
    placeholder: "请输入关键字搜索源分支",
    ...{ style: {} },
    remoteMethod: (__VLS_ctx.handleQuickMergeSourceSearch),
    loading: (__VLS_ctx.sourceBranchLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
__VLS_57.slots.default;
for (const [branch] of __VLS_getVForSourceType((__VLS_ctx.quickMergeSourceBranchOptions))) {
    const __VLS_58 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_59 = __VLS_asFunctionalComponent(__VLS_58, new __VLS_58({
        key: (branch.name),
        label: (branch.defaultBranch ? `${branch.name}（默认）` : branch.name),
        value: (branch.name),
    }));
    const __VLS_60 = __VLS_59({
        key: (branch.name),
        label: (branch.defaultBranch ? `${branch.name}（默认）` : branch.name),
        value: (branch.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_59));
}
var __VLS_57;
var __VLS_53;
const __VLS_62 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_63 = __VLS_asFunctionalComponent(__VLS_62, new __VLS_62({
    label: "目标分支",
    prop: "targetBranch",
}));
const __VLS_64 = __VLS_63({
    label: "目标分支",
    prop: "targetBranch",
}, ...__VLS_functionalComponentArgsRest(__VLS_63));
__VLS_65.slots.default;
const __VLS_66 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
    modelValue: (__VLS_ctx.quickMergeForm.targetBranch),
    filterable: true,
    remote: true,
    reserveKeyword: true,
    placeholder: "请输入关键字搜索目标分支",
    ...{ style: {} },
    remoteMethod: (__VLS_ctx.handleQuickMergeTargetSearch),
    loading: (__VLS_ctx.targetBranchLoading),
}));
const __VLS_68 = __VLS_67({
    modelValue: (__VLS_ctx.quickMergeForm.targetBranch),
    filterable: true,
    remote: true,
    reserveKeyword: true,
    placeholder: "请输入关键字搜索目标分支",
    ...{ style: {} },
    remoteMethod: (__VLS_ctx.handleQuickMergeTargetSearch),
    loading: (__VLS_ctx.targetBranchLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
__VLS_69.slots.default;
for (const [branch] of __VLS_getVForSourceType((__VLS_ctx.quickMergeTargetBranchOptions))) {
    const __VLS_70 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_71 = __VLS_asFunctionalComponent(__VLS_70, new __VLS_70({
        key: (branch.name),
        label: (branch.defaultBranch ? `${branch.name}（默认）` : branch.name),
        value: (branch.name),
    }));
    const __VLS_72 = __VLS_71({
        key: (branch.name),
        label: (branch.defaultBranch ? `${branch.name}（默认）` : branch.name),
        value: (branch.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_71));
}
var __VLS_69;
var __VLS_65;
const __VLS_74 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
    label: "MR 标题",
    prop: "title",
}));
const __VLS_76 = __VLS_75({
    label: "MR 标题",
    prop: "title",
}, ...__VLS_functionalComponentArgsRest(__VLS_75));
__VLS_77.slots.default;
const __VLS_78 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_79 = __VLS_asFunctionalComponent(__VLS_78, new __VLS_78({
    modelValue: (__VLS_ctx.quickMergeForm.title),
    placeholder: "请输入本次合并请求标题",
}));
const __VLS_80 = __VLS_79({
    modelValue: (__VLS_ctx.quickMergeForm.title),
    placeholder: "请输入本次合并请求标题",
}, ...__VLS_functionalComponentArgsRest(__VLS_79));
var __VLS_77;
const __VLS_82 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_83 = __VLS_asFunctionalComponent(__VLS_82, new __VLS_82({
    label: "MR 描述",
}));
const __VLS_84 = __VLS_83({
    label: "MR 描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_83));
__VLS_85.slots.default;
const __VLS_86 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_87 = __VLS_asFunctionalComponent(__VLS_86, new __VLS_86({
    modelValue: (__VLS_ctx.quickMergeForm.description),
    type: "textarea",
    rows: (4),
    placeholder: "可选，补充本次 MR 的背景、变更点或注意事项",
}));
const __VLS_88 = __VLS_87({
    modelValue: (__VLS_ctx.quickMergeForm.description),
    type: "textarea",
    rows: (4),
    placeholder: "可选，补充本次 MR 的背景、变更点或注意事项",
}, ...__VLS_functionalComponentArgsRest(__VLS_87));
var __VLS_85;
var __VLS_35;
{
    const { footer: __VLS_thisSlot } = __VLS_31.slots;
    const __VLS_90 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_91 = __VLS_asFunctionalComponent(__VLS_90, new __VLS_90({
        ...{ 'onClick': {} },
    }));
    const __VLS_92 = __VLS_91({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_91));
    let __VLS_94;
    let __VLS_95;
    let __VLS_96;
    const __VLS_97 = {
        onClick: (...[$event]) => {
            __VLS_ctx.quickMergeDialogVisible = false;
        }
    };
    __VLS_93.slots.default;
    var __VLS_93;
    const __VLS_98 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.quickMergeSubmitting),
    }));
    const __VLS_100 = __VLS_99({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.quickMergeSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_99));
    let __VLS_102;
    let __VLS_103;
    let __VLS_104;
    const __VLS_105 = {
        onClick: (__VLS_ctx.handleQuickMergeSubmit)
    };
    __VLS_101.slots.default;
    var __VLS_101;
}
var __VLS_31;
const __VLS_106 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_107 = __VLS_asFunctionalComponent(__VLS_106, new __VLS_106({
    modelValue: (__VLS_ctx.quickMergeResultVisible),
    title: "MR 创建结果",
    width: "720px",
}));
const __VLS_108 = __VLS_107({
    modelValue: (__VLS_ctx.quickMergeResultVisible),
    title: "MR 创建结果",
    width: "720px",
}, ...__VLS_functionalComponentArgsRest(__VLS_107));
__VLS_109.slots.default;
if (__VLS_ctx.quickMergeResult) {
    const __VLS_110 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_111 = __VLS_asFunctionalComponent(__VLS_110, new __VLS_110({
        column: (2),
        border: true,
    }));
    const __VLS_112 = __VLS_111({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_111));
    __VLS_113.slots.default;
    const __VLS_114 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_115 = __VLS_asFunctionalComponent(__VLS_114, new __VLS_114({
        label: "平台项目",
    }));
    const __VLS_116 = __VLS_115({
        label: "平台项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_115));
    __VLS_117.slots.default;
    (__VLS_ctx.quickMergeResult.projectName);
    var __VLS_117;
    const __VLS_118 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_119 = __VLS_asFunctionalComponent(__VLS_118, new __VLS_118({
        label: "GitLab 仓库",
    }));
    const __VLS_120 = __VLS_119({
        label: "GitLab 仓库",
    }, ...__VLS_functionalComponentArgsRest(__VLS_119));
    __VLS_121.slots.default;
    (__VLS_ctx.quickMergeResult.projectRef);
    var __VLS_121;
    const __VLS_122 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_123 = __VLS_asFunctionalComponent(__VLS_122, new __VLS_122({
        label: "MR IID",
    }));
    const __VLS_124 = __VLS_123({
        label: "MR IID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_123));
    __VLS_125.slots.default;
    (__VLS_ctx.quickMergeResult.iid);
    var __VLS_125;
    const __VLS_126 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_127 = __VLS_asFunctionalComponent(__VLS_126, new __VLS_126({
        label: "状态",
    }));
    const __VLS_128 = __VLS_127({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_127));
    __VLS_129.slots.default;
    (__VLS_ctx.quickMergeResult.state || '-');
    var __VLS_129;
    const __VLS_130 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_131 = __VLS_asFunctionalComponent(__VLS_130, new __VLS_130({
        label: "源分支",
    }));
    const __VLS_132 = __VLS_131({
        label: "源分支",
    }, ...__VLS_functionalComponentArgsRest(__VLS_131));
    __VLS_133.slots.default;
    (__VLS_ctx.quickMergeResult.sourceBranch);
    var __VLS_133;
    const __VLS_134 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({
        label: "目标分支",
    }));
    const __VLS_136 = __VLS_135({
        label: "目标分支",
    }, ...__VLS_functionalComponentArgsRest(__VLS_135));
    __VLS_137.slots.default;
    (__VLS_ctx.quickMergeResult.targetBranch);
    var __VLS_137;
    const __VLS_138 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_139 = __VLS_asFunctionalComponent(__VLS_138, new __VLS_138({
        label: "标题",
        span: (2),
    }));
    const __VLS_140 = __VLS_139({
        label: "标题",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_139));
    __VLS_141.slots.default;
    (__VLS_ctx.quickMergeResult.title);
    var __VLS_141;
    const __VLS_142 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
        label: "创建时间",
    }));
    const __VLS_144 = __VLS_143({
        label: "创建时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_143));
    __VLS_145.slots.default;
    (__VLS_ctx.formatDateTime(__VLS_ctx.quickMergeResult.createdAt));
    var __VLS_145;
    const __VLS_146 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
        label: "链接",
    }));
    const __VLS_148 = __VLS_147({
        label: "链接",
    }, ...__VLS_functionalComponentArgsRest(__VLS_147));
    __VLS_149.slots.default;
    if (__VLS_ctx.quickMergeResult.webUrl) {
        const __VLS_150 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
            href: (__VLS_ctx.quickMergeResult.webUrl),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_152 = __VLS_151({
            href: (__VLS_ctx.quickMergeResult.webUrl),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_151));
        __VLS_153.slots.default;
        var __VLS_153;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_149;
    var __VLS_113;
}
var __VLS_109;
/** @type {__VLS_StyleScopedClasses['dashboard-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-card-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-head']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-head-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-description']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-head-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-group']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-label']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-group']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-label']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-size-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-body']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['orange']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['blue']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['purple']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-widget-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-widget-body']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-hero-title']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-hero-text']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-meta-line']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-merge-button']} */ ;
/** @type {__VLS_StyleScopedClasses['solid']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-widget-body']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-hero-title']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-hero-text']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-meta-line']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-scroll-area']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-list']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-item']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-main']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-title']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-status-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-meta-line']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-message']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-build-button']} */ ;
/** @type {__VLS_StyleScopedClasses['solid']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-scroll-area']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-main']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-scroll-area']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-main']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['info-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['success']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-scroll-area']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-main']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list-side']} */ ;
/** @type {__VLS_StyleScopedClasses['task-health-text']} */ ;
/** @type {__VLS_StyleScopedClasses['task-time-text']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-footer-button']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-scroll-area']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-task-list']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-task-item']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-head']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-list']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-item']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-item-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-widget-library-item-action']} */ ;
/** @type {__VLS_StyleScopedClasses['widget-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
// @ts-ignore
var __VLS_37 = __VLS_36;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Cpu: Cpu,
            FolderOpened: FolderOpened,
            Tickets: Tickets,
            VueDraggable: VueDraggable,
            DASHBOARD_WIDTH_OPTIONS: DASHBOARD_WIDTH_OPTIONS,
            DASHBOARD_HEIGHT_OPTIONS: DASHBOARD_HEIGHT_OPTIONS,
            router: router,
            authStore: authStore,
            loading: loading,
            dashboardEditing: dashboardEditing,
            quickTaskItems: quickTaskItems,
            quickMergeDialogVisible: quickMergeDialogVisible,
            quickMergeResultVisible: quickMergeResultVisible,
            quickMergeSubmitting: quickMergeSubmitting,
            quickBuildLoading: quickBuildLoading,
            quickBuildBindings: quickBuildBindings,
            quickBuildTriggeringId: quickBuildTriggeringId,
            quickMergeFormRef: quickMergeFormRef,
            quickMergeBindingOptions: quickMergeBindingOptions,
            quickMergeSourceBranchOptions: quickMergeSourceBranchOptions,
            quickMergeTargetBranchOptions: quickMergeTargetBranchOptions,
            sourceBranchLoading: sourceBranchLoading,
            targetBranchLoading: targetBranchLoading,
            quickMergeResult: quickMergeResult,
            quickMergeForm: quickMergeForm,
            quickMergeRules: quickMergeRules,
            canViewTasks: canViewTasks,
            canViewProjects: canViewProjects,
            canViewGitlab: canViewGitlab,
            canManageGitlab: canManageGitlab,
            canViewCicd: canViewCicd,
            canManageCicd: canManageCicd,
            gitlabBindingCount: gitlabBindingCount,
            quickBuildBindingCount: quickBuildBindingCount,
            visibleWidgetLayouts: visibleWidgetLayouts,
            hiddenWidgetDefinitions: hiddenWidgetDefinitions,
            activeProjects: activeProjects,
            onlineAgents: onlineAgents,
            mergeAlertCount: mergeAlertCount,
            recentTaskRows: recentTaskRows,
            statCardMap: statCardMap,
            getWidgetDefinition: getWidgetDefinition,
            isActionWidget: isActionWidget,
            shouldShowWidgetHeader: shouldShowWidgetHeader,
            shouldShowWidgetHeaderCopy: shouldShowWidgetHeaderCopy,
            widgetWidthClass: widgetWidthClass,
            widgetHeightClass: widgetHeightClass,
            updateWidgetWidth: updateWidgetWidth,
            updateWidgetHeight: updateWidgetHeight,
            widgetCardStyle: widgetCardStyle,
            setWidgetContentRef: setWidgetContentRef,
            toggleDashboardEditing: toggleDashboardEditing,
            restoreDefaultLayout: restoreDefaultLayout,
            hideWidget: hideWidget,
            showWidget: showWidget,
            handleQuickMergeSourceSearch: handleQuickMergeSourceSearch,
            handleQuickMergeTargetSearch: handleQuickMergeTargetSearch,
            openQuickMergeDialog: openQuickMergeDialog,
            handleQuickMergeSubmit: handleQuickMergeSubmit,
            formatQuickBuildTriggerStatus: formatQuickBuildTriggerStatus,
            quickBuildTriggerStatusTone: quickBuildTriggerStatusTone,
            handleOpenPipelineCenter: handleOpenPipelineCenter,
            handleQuickBuildTrigger: handleQuickBuildTrigger,
            formatDateTime: formatDateTime,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=DashboardView.vue.js.map