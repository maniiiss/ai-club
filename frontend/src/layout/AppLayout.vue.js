/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, ArrowRight, Bell, ChatDotRound, Connection, Cpu, DataAnalysis, DocumentCopy, Expand, Finished, Fold, FolderOpened, Management, Message, MoreFilled, Odometer, Search, Setting, SwitchButton, Tickets, UserFilled, WarningFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notifications';
import { resolveAssetUrl } from '@/utils/asset';
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const systemMenuExpanded = ref(false);
const integrationMenuExpanded = ref(false);
const isMobileViewport = ref(false);
const mobileMoreDrawerVisible = ref(false);
const primaryMenuItems = [
    { path: '/dashboard', label: '首页看板', shortLabel: '首页', permission: 'dashboard:view', icon: Odometer, matchNames: ['dashboard'] },
    { path: '/projects', label: '项目管理', shortLabel: '项目', permission: 'project:view', icon: FolderOpened, matchNames: ['projects', 'project-iterations', 'project-knowledge-graph'] },
    { path: '/agents', label: '智能体管理', shortLabel: '智能体', permission: 'agent:view', icon: Connection, matchNames: ['agents'] },
    { path: '/tasks', label: '执行中心', shortLabel: '执行', permission: 'task:view', icon: Tickets, matchNames: ['tasks', 'execution-task-detail'] },
    { path: '/tests', label: '测试管理', shortLabel: '测试', permission: 'test:view', icon: Finished, matchNames: ['tests', 'test-plan-detail'] },
    { path: '/gitlab', label: '代码仓库', shortLabel: '仓库', permission: 'gitlab:view', icon: DocumentCopy, matchNames: ['gitlab'] }
];
const integrationMenuItems = [
    { path: '/cicd/jenkins-servers', label: 'Jenkins 服务', shortLabel: 'Jenkins', permission: 'cicd:view', icon: Connection, matchNames: ['cicd-servers'] },
    { path: '/cicd/pipeline-bindings', label: '项目流水线', shortLabel: '流水线', permission: 'cicd:view', icon: DataAnalysis, matchNames: ['cicd-pipelines'] }
];
const trailingMenuItems = [
    { path: '/models', label: '模型管理', shortLabel: '模型', permission: 'model:view', icon: Cpu, matchNames: ['models'] }
];
const systemMenuItems = [
    { path: '/users', label: '用户管理', shortLabel: '用户', permission: 'system:user:view', icon: UserFilled, matchNames: ['users'] },
    { path: '/roles', label: '角色管理', shortLabel: '角色', permission: 'system:role:view', icon: Management, matchNames: ['roles'] },
    { path: '/permissions', label: '功能管理', shortLabel: '功能', permission: 'system:permission:view', icon: Setting, matchNames: ['permissions'] },
    { path: '/tools', label: '工具配置', shortLabel: '工具', permission: 'system:tool:view', icon: Connection, matchNames: ['tools'] },
    { path: '/scan-rulesets', label: '扫描规则集', shortLabel: '规则集', permission: 'scan:ruleset:view', icon: Search, matchNames: ['scan-rulesets'] },
    { path: '/operation-logs', label: '操作日志', shortLabel: '日志', permission: 'system:operation-log:view', icon: DocumentCopy, matchNames: ['operation-logs'] }
];
const pageTitle = computed(() => route.meta.title || 'AI代理工程管理平台');
const visiblePrimaryMenus = computed(() => primaryMenuItems.filter((item) => authStore.hasPermission(item.permission)));
const visibleIntegrationMenus = computed(() => integrationMenuItems.filter((item) => authStore.hasPermission(item.permission)));
const visibleTrailingMenus = computed(() => trailingMenuItems.filter((item) => authStore.hasPermission(item.permission)));
const visibleSystemMenus = computed(() => systemMenuItems.filter((item) => authStore.hasPermission(item.permission)));
const isDashboardRoute = computed(() => route.name === 'dashboard');
const isIterationWorkspaceRoute = computed(() => route.name === 'project-iterations');
const effectiveSidebarCollapsed = computed(() => isMobileViewport.value || appStore.sidebarCollapsed);
const asideWidth = computed(() => (effectiveSidebarCollapsed.value ? '80px' : '256px'));
const todayLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
}).format(new Date()));
const userInitial = computed(() => (authStore.user?.nickname || authStore.user?.username || 'U').slice(0, 1).toUpperCase());
const userAvatarUrl = computed(() => resolveAssetUrl(authStore.user?.avatarUrl));
const headerSearchHint = computed(() => {
    const searchHints = {
        dashboard: '搜索项目、智能体或任务...',
        agents: '搜索智能体、模型或项目...',
        gitlab: '搜索仓库、分支或日志...',
        'cicd-servers': '搜索 Jenkins 服务、地址或用户名...',
        'cicd-pipelines': '搜索项目流水线、任务或分支...',
        tests: '搜索测试计划、用例或结果...',
        'project-iterations': '搜索工作项、需求或负责人...'
    };
    return searchHints[String(route.name || '')] || '搜索页面、数据或工作项...';
});
const canLoadMoreNotifications = computed(() => notificationStore.items.length < notificationStore.total);
const mobilePrimaryMenuPaths = ['/dashboard', '/projects', '/tasks', '/tests'];
const mobileBottomNavItems = computed(() => mobilePrimaryMenuPaths
    .map((path) => visiblePrimaryMenus.value.find((item) => item.path === path))
    .filter((item) => Boolean(item)));
const mobileWorkspaceMoreItems = computed(() => [
    ...visiblePrimaryMenus.value.filter((item) => !mobilePrimaryMenuPaths.includes(item.path)),
    ...visibleIntegrationMenus.value,
    ...visibleTrailingMenus.value
]);
const mobileSystemMoreItems = computed(() => visibleSystemMenus.value);
const isMobileMoreActive = computed(() => route.path === '/profile'
    || mobileWorkspaceMoreItems.value.some((item) => isMenuActive(item))
    || mobileSystemMoreItems.value.some((item) => isMenuActive(item)));
const isIntegrationSectionActive = computed(() => visibleIntegrationMenus.value.some((item) => isMenuActive(item)));
const isSystemSectionActive = computed(() => visibleSystemMenus.value.some((item) => isMenuActive(item)));
// 手机端强制使用折叠导航，只影响当前视口展示，不覆盖用户桌面端保存的侧边栏偏好。
function syncViewportMode() {
    if (typeof window === 'undefined') {
        return;
    }
    isMobileViewport.value = window.innerWidth <= 900;
    if (!isMobileViewport.value) {
        mobileMoreDrawerVisible.value = false;
    }
}
function isMenuActive(item) {
    const currentName = String(route.name || '');
    if (route.path === item.path) {
        return true;
    }
    return Boolean(item.matchNames?.includes(currentName));
}
async function handleNavigate(path) {
    mobileMoreDrawerVisible.value = false;
    if (route.path === path) {
        return;
    }
    await router.push(path);
}
/**
 * 手机端底部导航与更多面板统一复用同一套路由跳转，避免两套导航高亮与行为脱节。
 */
async function handleMobileNavigate(path) {
    await handleNavigate(path);
}
const handleCommand = async (command) => {
    mobileMoreDrawerVisible.value = false;
    if (command === 'profile') {
        await router.push('/profile');
        return;
    }
    if (command !== 'logout') {
        return;
    }
    notificationStore.disconnect();
    await authStore.logout();
    ElMessage.success('已退出登录');
    await router.replace('/login');
};
async function handleMobileCommand(command) {
    await handleCommand(command);
}
const handleOpenNotifications = async () => {
    await notificationStore.openDrawer();
};
// 将后端通知业务类型统一翻译为中文，避免抽屉里直接显示英文枚举值。
const NOTIFICATION_BIZ_TYPE_LABELS = {
    TASK: '任务通知',
    TASK_COMMENT: '任务评论',
    CHANGE_REQUEST: '变更申请',
    PIPELINE_BINDING: '流水线绑定',
    GITLAB_AUTO_MERGE_LOG: '合并请求',
    SYSTEM_ANNOUNCEMENT: '系统公告'
};
// 按业务类型和通知来源决定标签色调，让消息标签随全局主题变量联动变化。
const resolveNotificationBizKey = (item) => {
    const bizType = item.bizType?.trim();
    if (bizType) {
        return bizType.toUpperCase();
    }
    return item.type?.trim().toUpperCase() || 'SYSTEM';
};
const resolveNotificationSource = (item) => {
    if (item.senderName?.trim()) {
        return item.senderName.trim();
    }
    if (item.type === 'GITLAB')
        return '代码仓库协作';
    if (item.type === 'CICD')
        return '持续集成流水线';
    if (item.type === 'TASK')
        return '任务中心';
    return '系统消息';
};
const resolveNotificationContextLabel = (item) => {
    const bizKey = resolveNotificationBizKey(item);
    if (NOTIFICATION_BIZ_TYPE_LABELS[bizKey]) {
        return NOTIFICATION_BIZ_TYPE_LABELS[bizKey];
    }
    if (item.type === 'TASK')
        return '工作项中心';
    if (item.type === 'GITLAB')
        return '代码协作';
    if (item.type === 'CICD')
        return '流水线监控';
    return '系统消息';
};
const resolveNotificationContextTone = (item) => {
    const bizKey = resolveNotificationBizKey(item);
    if (bizKey === 'CHANGE_REQUEST')
        return 'warning';
    if (bizKey === 'TASK_COMMENT')
        return 'info';
    if (bizKey === 'SYSTEM_ANNOUNCEMENT')
        return 'neutral';
    if (item.type === 'TASK')
        return 'secondary';
    if (item.type === 'GITLAB')
        return 'tertiary';
    if (item.type === 'CICD')
        return 'info';
    return 'neutral';
};
const resolveNotificationContextIcon = (item) => {
    if (item.type === 'TASK')
        return Tickets;
    if (item.type === 'GITLAB')
        return Connection;
    if (item.type === 'CICD')
        return DataAnalysis;
    return Message;
};
const resolveNotificationLevelLabel = (item) => {
    if (item.level === 'ERROR')
        return '优先级：高';
    if (item.level === 'WARNING')
        return '优先级：中';
    if (item.level === 'SUCCESS')
        return '处理结果：成功';
    return '优先级：普通';
};
const resolveNotificationLevelTone = (item) => {
    if (item.level === 'ERROR')
        return 'high';
    if (item.level === 'WARNING')
        return 'medium';
    if (item.level === 'SUCCESS')
        return 'success';
    return 'normal';
};
// 将通知时间转换为参考稿风格的相对时间文案，避免在抽屉里直接暴露原始时间串。
const formatNotificationTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
    if (diffMinutes < 60) {
        return `${diffMinutes} 分钟前`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours} 小时前`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
        return '昨天';
    }
    return `${diffDays} 天前`;
};
const handleNotificationClick = async (item) => {
    await notificationStore.markRead(item.id);
    notificationStore.drawerVisible = false;
    if (item.actionUrl) {
        await router.push(item.actionUrl);
    }
};
const handleNotificationPageChange = async () => {
    await notificationStore.loadNotifications();
};
const handleNotificationSizeChange = async () => {
    notificationStore.page = 1;
    await notificationStore.loadNotifications();
};
const handleNotificationListScroll = async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }
    if (notificationStore.loading || !canLoadMoreNotifications.value) {
        return;
    }
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 120;
    if (!nearBottom) {
        return;
    }
    notificationStore.page += 1;
    await notificationStore.loadNotifications(true);
};
// 当用户进入系统管理子页时，展开态自动展开对应分组，避免丢失当前定位。
watch([
    () => route.fullPath,
    () => effectiveSidebarCollapsed.value,
    () => visibleIntegrationMenus.value.length,
    () => visibleSystemMenus.value.length
], () => {
    if (effectiveSidebarCollapsed.value) {
        integrationMenuExpanded.value = false;
        systemMenuExpanded.value = false;
        return;
    }
    if (isIntegrationSectionActive.value) {
        integrationMenuExpanded.value = true;
    }
    if (isSystemSectionActive.value) {
        systemMenuExpanded.value = true;
    }
}, { immediate: true });
onMounted(() => {
    notificationStore.bootstrap().catch(() => undefined);
    syncViewportMode();
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', syncViewportMode);
    }
});
onUnmounted(() => {
    if (typeof window !== 'undefined') {
        window.removeEventListener('resize', syncViewportMode);
    }
});
watch(() => authStore.token, (token) => {
    if (!token) {
        notificationStore.disconnect();
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['layout-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-head']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-button']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-button']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-button']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['iteration-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-main-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['header-notification-button']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-main']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-main']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-mark-all-button']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-scrollbar']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-scrollbar']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['unread']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-level']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-level']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-level']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-level']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-load-more']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['message-center-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['message-center-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['message-center-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-system-popper']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['el-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['el-drawer__header']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['el-drawer__body']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search-group']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search-group']} */ ;
/** @type {__VLS_StyleScopedClasses['header-page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-main']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-main']} */ ;
/** @type {__VLS_StyleScopedClasses['iteration-main']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['header-profile-group']} */ ;
/** @type {__VLS_StyleScopedClasses['header-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['user-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-bottom-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElContainer;
/** @type {[typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "layout-shell" },
    ...{ class: ({ collapsed: __VLS_ctx.effectiveSidebarCollapsed, 'iteration-shell': __VLS_ctx.isIterationWorkspaceRoute, 'mobile-shell': __VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute }) },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "layout-shell" },
    ...{ class: ({ collapsed: __VLS_ctx.effectiveSidebarCollapsed, 'iteration-shell': __VLS_ctx.isIterationWorkspaceRoute, 'mobile-shell': __VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport) {
    const __VLS_4 = {}.ElAside;
    /** @type {[typeof __VLS_components.ElAside, typeof __VLS_components.elAside, typeof __VLS_components.ElAside, typeof __VLS_components.elAside, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        width: (__VLS_ctx.asideWidth),
        ...{ class: "layout-aside" },
    }));
    const __VLS_6 = __VLS_5({
        width: (__VLS_ctx.asideWidth),
        ...{ class: "layout-aside" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "aside-head" },
        ...{ class: ({ compact: __VLS_ctx.effectiveSidebarCollapsed }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "brand-mark" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "brand-logo-svg" },
        viewBox: "0 0 64 64",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.defs, __VLS_intrinsicElements.defs)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.linearGradient, __VLS_intrinsicElements.linearGradient)({
        id: "brandLogoGradient",
        x1: "8",
        y1: "8",
        x2: "56",
        y2: "56",
        gradientUnits: "userSpaceOnUse",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.stop)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.stop)({
        offset: "1",
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "4",
        y: "4",
        width: "56",
        height: "56",
        rx: "16",
        fill: "url(#brandLogoGradient)",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M18.8 20.7L26.8 26.9M16.2 35.6L26.4 34.3M27.8 13.8L31.5 26.8M28.5 49.3L30.4 38.6",
        stroke: "white",
        'stroke-width': "2.5",
        'stroke-linecap': "round",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "31.5",
        cy: "33.5",
        r: "5",
        fill: "#fff",
        'fill-opacity': "0.24",
        stroke: "white",
        'stroke-width': "2.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "13",
        cy: "36",
        r: "3.4",
        fill: "url(#brandLogoGradient)",
        stroke: "white",
        'stroke-width': "2.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "16.5",
        cy: "20",
        r: "3.4",
        fill: "url(#brandLogoGradient)",
        stroke: "white",
        'stroke-width': "2.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "27",
        cy: "10.5",
        r: "3.4",
        fill: "url(#brandLogoGradient)",
        stroke: "white",
        'stroke-width': "2.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "28",
        cy: "53",
        r: "3.4",
        fill: "url(#brandLogoGradient)",
        stroke: "white",
        'stroke-width': "2.5",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M35.2 18.3C34.5 16.4 35.9 14.4 38 14.4H38.5C39.8 14.4 41 15.2 41.5 16.4L48.6 48.2C49.1 50.4 46.2 51.8 44.8 50L39 42.7H25.5L21.4 49.8C20.2 51.8 17 50.8 17.2 48.4C17.3 47.4 17.8 46.5 18.6 45.9L25.7 40.4L26.9 36.2L35.2 18.3ZM33.7 29.7L31.1 36.9H36.7L33.7 29.7Z",
        fill: "white",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "50.2",
        y: "14.2",
        width: "6.6",
        height: "36.2",
        rx: "3.3",
        fill: "white",
    });
    if (!__VLS_ctx.effectiveSidebarCollapsed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "brand-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "brand-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "brand-subtitle" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "brand-copy compact-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "brand-title-mini" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "brand-subtitle-mini" },
        });
    }
    const __VLS_8 = {}.ElScrollbar;
    /** @type {[typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ class: "aside-scroll" },
    }));
    const __VLS_10 = __VLS_9({
        ...{ class: "aside-scroll" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "sidebar-nav" },
        'aria-label': "主导航",
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.visiblePrimaryMenus))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                        return;
                    __VLS_ctx.handleNavigate(item.path);
                } },
            key: (item.path),
            ...{ class: "sidebar-menu-button" },
            ...{ class: ({ active: __VLS_ctx.isMenuActive(item), compact: __VLS_ctx.effectiveSidebarCollapsed }) },
            title: (item.label),
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-active-bar" },
            'aria-hidden': "true",
        });
        const __VLS_12 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            ...{ class: "menu-icon" },
        }));
        const __VLS_14 = __VLS_13({
            ...{ class: "menu-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        const __VLS_16 = ((item.icon));
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        var __VLS_15;
        if (!__VLS_ctx.effectiveSidebarCollapsed) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-label" },
            });
            (item.label);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-short-label" },
            });
            (item.shortLabel);
        }
    }
    if (__VLS_ctx.visibleIntegrationMenus.length && !__VLS_ctx.effectiveSidebarCollapsed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "system-menu-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                        return;
                    if (!(__VLS_ctx.visibleIntegrationMenus.length && !__VLS_ctx.effectiveSidebarCollapsed))
                        return;
                    __VLS_ctx.integrationMenuExpanded = !__VLS_ctx.integrationMenuExpanded;
                } },
            ...{ class: "sidebar-menu-button" },
            ...{ class: ({ active: __VLS_ctx.isIntegrationSectionActive }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-active-bar" },
            'aria-hidden': "true",
        });
        const __VLS_20 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            ...{ class: "menu-icon" },
        }));
        const __VLS_22 = __VLS_21({
            ...{ class: "menu-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        const __VLS_24 = {}.DataAnalysis;
        /** @type {[typeof __VLS_components.DataAnalysis, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
        const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
        var __VLS_23;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-label" },
        });
        const __VLS_28 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            ...{ class: "menu-arrow" },
        }));
        const __VLS_30 = __VLS_29({
            ...{ class: "menu-arrow" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        if (__VLS_ctx.integrationMenuExpanded) {
            const __VLS_32 = {}.ArrowDown;
            /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
            const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
        }
        else {
            const __VLS_36 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
            const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
        }
        var __VLS_31;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "system-submenu" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.integrationMenuExpanded) }, null, null);
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.visibleIntegrationMenus))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                            return;
                        if (!(__VLS_ctx.visibleIntegrationMenus.length && !__VLS_ctx.effectiveSidebarCollapsed))
                            return;
                        __VLS_ctx.handleNavigate(item.path);
                    } },
                key: (item.path),
                ...{ class: "system-submenu-button" },
                ...{ class: ({ active: __VLS_ctx.isMenuActive(item) }) },
                type: "button",
            });
            const __VLS_40 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
            const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
            __VLS_43.slots.default;
            const __VLS_44 = ((item.icon));
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
            const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
            var __VLS_43;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.label);
        }
    }
    if (__VLS_ctx.visibleIntegrationMenus.length && __VLS_ctx.effectiveSidebarCollapsed) {
        const __VLS_48 = {}.ElPopover;
        /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            trigger: "click",
            placement: "right-start",
            showArrow: (false),
            width: (220),
            popperClass: "sidebar-system-popper",
        }));
        const __VLS_50 = __VLS_49({
            trigger: "click",
            placement: "right-start",
            showArrow: (false),
            width: (220),
            popperClass: "sidebar-system-popper",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        {
            const { reference: __VLS_thisSlot } = __VLS_51.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "sidebar-menu-button compact" },
                ...{ class: ({ active: __VLS_ctx.isIntegrationSectionActive }) },
                title: "集成",
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-active-bar" },
                'aria-hidden': "true",
            });
            const __VLS_52 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                ...{ class: "menu-icon" },
            }));
            const __VLS_54 = __VLS_53({
                ...{ class: "menu-icon" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            __VLS_55.slots.default;
            const __VLS_56 = {}.DataAnalysis;
            /** @type {[typeof __VLS_components.DataAnalysis, ]} */ ;
            // @ts-ignore
            const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
            const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
            var __VLS_55;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-short-label" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "system-popover-menu" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.visibleIntegrationMenus))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                            return;
                        if (!(__VLS_ctx.visibleIntegrationMenus.length && __VLS_ctx.effectiveSidebarCollapsed))
                            return;
                        __VLS_ctx.handleNavigate(item.path);
                    } },
                key: (item.path),
                ...{ class: "system-popover-button" },
                ...{ class: ({ active: __VLS_ctx.isMenuActive(item) }) },
                type: "button",
            });
            const __VLS_60 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
            const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
            __VLS_63.slots.default;
            const __VLS_64 = ((item.icon));
            // @ts-ignore
            const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
            const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
            var __VLS_63;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.label);
        }
        var __VLS_51;
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.visibleTrailingMenus))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                        return;
                    __VLS_ctx.handleNavigate(item.path);
                } },
            key: (item.path),
            ...{ class: "sidebar-menu-button" },
            ...{ class: ({ active: __VLS_ctx.isMenuActive(item), compact: __VLS_ctx.effectiveSidebarCollapsed }) },
            title: (item.label),
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-active-bar" },
            'aria-hidden': "true",
        });
        const __VLS_68 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            ...{ class: "menu-icon" },
        }));
        const __VLS_70 = __VLS_69({
            ...{ class: "menu-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        __VLS_71.slots.default;
        const __VLS_72 = ((item.icon));
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
        const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
        var __VLS_71;
        if (!__VLS_ctx.effectiveSidebarCollapsed) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-label" },
            });
            (item.label);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-short-label" },
            });
            (item.shortLabel);
        }
    }
    if (__VLS_ctx.visibleSystemMenus.length && !__VLS_ctx.effectiveSidebarCollapsed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "system-menu-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                        return;
                    if (!(__VLS_ctx.visibleSystemMenus.length && !__VLS_ctx.effectiveSidebarCollapsed))
                        return;
                    __VLS_ctx.systemMenuExpanded = !__VLS_ctx.systemMenuExpanded;
                } },
            ...{ class: "sidebar-menu-button" },
            ...{ class: ({ active: __VLS_ctx.isSystemSectionActive }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-active-bar" },
            'aria-hidden': "true",
        });
        const __VLS_76 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            ...{ class: "menu-icon" },
        }));
        const __VLS_78 = __VLS_77({
            ...{ class: "menu-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        const __VLS_80 = {}.Setting;
        /** @type {[typeof __VLS_components.Setting, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
        const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
        var __VLS_79;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-label" },
        });
        const __VLS_84 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            ...{ class: "menu-arrow" },
        }));
        const __VLS_86 = __VLS_85({
            ...{ class: "menu-arrow" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        __VLS_87.slots.default;
        if (__VLS_ctx.systemMenuExpanded) {
            const __VLS_88 = {}.ArrowDown;
            /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
            const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
        }
        else {
            const __VLS_92 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
            const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
        }
        var __VLS_87;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "system-submenu" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.systemMenuExpanded) }, null, null);
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.visibleSystemMenus))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                            return;
                        if (!(__VLS_ctx.visibleSystemMenus.length && !__VLS_ctx.effectiveSidebarCollapsed))
                            return;
                        __VLS_ctx.handleNavigate(item.path);
                    } },
                key: (item.path),
                ...{ class: "system-submenu-button" },
                ...{ class: ({ active: __VLS_ctx.isMenuActive(item) }) },
                type: "button",
            });
            const __VLS_96 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
            const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
            __VLS_99.slots.default;
            const __VLS_100 = ((item.icon));
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
            const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
            var __VLS_99;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.label);
        }
    }
    if (__VLS_ctx.visibleSystemMenus.length && __VLS_ctx.effectiveSidebarCollapsed) {
        const __VLS_104 = {}.ElPopover;
        /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            trigger: "click",
            placement: "right-start",
            showArrow: (false),
            width: (220),
            popperClass: "sidebar-system-popper",
        }));
        const __VLS_106 = __VLS_105({
            trigger: "click",
            placement: "right-start",
            showArrow: (false),
            width: (220),
            popperClass: "sidebar-system-popper",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        __VLS_107.slots.default;
        {
            const { reference: __VLS_thisSlot } = __VLS_107.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "sidebar-menu-button compact" },
                ...{ class: ({ active: __VLS_ctx.isSystemSectionActive }) },
                title: "系统设置",
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-active-bar" },
                'aria-hidden': "true",
            });
            const __VLS_108 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                ...{ class: "menu-icon" },
            }));
            const __VLS_110 = __VLS_109({
                ...{ class: "menu-icon" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
            __VLS_111.slots.default;
            const __VLS_112 = {}.Setting;
            /** @type {[typeof __VLS_components.Setting, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({}));
            const __VLS_114 = __VLS_113({}, ...__VLS_functionalComponentArgsRest(__VLS_113));
            var __VLS_111;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "menu-short-label" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "system-popover-menu" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.visibleSystemMenus))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.isIterationWorkspaceRoute && !__VLS_ctx.isMobileViewport))
                            return;
                        if (!(__VLS_ctx.visibleSystemMenus.length && __VLS_ctx.effectiveSidebarCollapsed))
                            return;
                        __VLS_ctx.handleNavigate(item.path);
                    } },
                key: (item.path),
                ...{ class: "system-popover-button" },
                ...{ class: ({ active: __VLS_ctx.isMenuActive(item) }) },
                type: "button",
            });
            const __VLS_116 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
            const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
            __VLS_119.slots.default;
            const __VLS_120 = ((item.icon));
            // @ts-ignore
            const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
            const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
            var __VLS_119;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.label);
        }
        var __VLS_107;
    }
    var __VLS_11;
    if (!__VLS_ctx.isMobileViewport) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "aside-footer" },
            ...{ class: ({ compact: __VLS_ctx.effectiveSidebarCollapsed }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.appStore.toggleSidebarCollapsed) },
            ...{ class: "aside-action-button" },
            type: "button",
            title: (__VLS_ctx.appStore.sidebarCollapsed ? '展开导航' : '收起导航'),
            'aria-label': (__VLS_ctx.appStore.sidebarCollapsed ? '展开导航' : '收起导航'),
        });
        const __VLS_124 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
        const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        if (__VLS_ctx.appStore.sidebarCollapsed) {
            const __VLS_128 = {}.Expand;
            /** @type {[typeof __VLS_components.Expand, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
            const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
        }
        else {
            const __VLS_132 = {}.Fold;
            /** @type {[typeof __VLS_components.Fold, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
            const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
        }
        var __VLS_127;
        if (!__VLS_ctx.appStore.sidebarCollapsed) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.appStore.sidebarCollapsed ? '展开导航' : '收起导航');
        }
    }
    var __VLS_7;
}
const __VLS_136 = {}.ElContainer;
/** @type {[typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    ...{ class: "layout-main-shell" },
    ...{ class: ({ 'mobile-main-shell': __VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute }) },
}));
const __VLS_138 = __VLS_137({
    ...{ class: "layout-main-shell" },
    ...{ class: ({ 'mobile-main-shell': __VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
if (!__VLS_ctx.isIterationWorkspaceRoute) {
    const __VLS_140 = {}.ElHeader;
    /** @type {[typeof __VLS_components.ElHeader, typeof __VLS_components.elHeader, typeof __VLS_components.ElHeader, typeof __VLS_components.elHeader, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        ...{ class: "layout-header" },
    }));
    const __VLS_142 = __VLS_141({
        ...{ class: "layout-header" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    __VLS_143.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "header-search-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "header-page-title" },
    });
    (__VLS_ctx.pageTitle);
    if (!__VLS_ctx.isMobileViewport) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "header-search-shell" },
            'aria-hidden': "true",
        });
        const __VLS_144 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
        const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
        __VLS_147.slots.default;
        const __VLS_148 = {}.Search;
        /** @type {[typeof __VLS_components.Search, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({}));
        const __VLS_150 = __VLS_149({}, ...__VLS_functionalComponentArgsRest(__VLS_149));
        var __VLS_147;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.headerSearchHint);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "header-actions" },
    });
    const __VLS_152 = {}.ElDropdown;
    /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        ...{ 'onCommand': {} },
    }));
    const __VLS_154 = __VLS_153({
        ...{ 'onCommand': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    let __VLS_156;
    let __VLS_157;
    let __VLS_158;
    const __VLS_159 = {
        onCommand: (__VLS_ctx.handleCommand)
    };
    __VLS_155.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "header-profile-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleOpenNotifications) },
        ...{ class: "header-notification-button" },
        type: "button",
        'aria-label': "打开消息中心",
    });
    const __VLS_160 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({}));
    const __VLS_162 = __VLS_161({}, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    const __VLS_164 = {}.Bell;
    /** @type {[typeof __VLS_components.Bell, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({}));
    const __VLS_166 = __VLS_165({}, ...__VLS_functionalComponentArgsRest(__VLS_165));
    var __VLS_163;
    if (__VLS_ctx.notificationStore.unreadCount > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "header-notification-dot" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "header-divider" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "user-trigger" },
        type: "button",
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
    if (__VLS_ctx.userAvatarUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (__VLS_ctx.userAvatarUrl),
            alt: "当前用户头像",
            ...{ class: "user-avatar-image" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.userInitial);
    }
    {
        const { dropdown: __VLS_thisSlot } = __VLS_155.slots;
        const __VLS_168 = {}.ElDropdownMenu;
        /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({}));
        const __VLS_170 = __VLS_169({}, ...__VLS_functionalComponentArgsRest(__VLS_169));
        __VLS_171.slots.default;
        const __VLS_172 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
            command: "profile",
        }));
        const __VLS_174 = __VLS_173({
            command: "profile",
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        __VLS_175.slots.default;
        var __VLS_175;
        const __VLS_176 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            command: "roles",
            disabled: true,
        }));
        const __VLS_178 = __VLS_177({
            command: "roles",
            disabled: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        __VLS_179.slots.default;
        (__VLS_ctx.authStore.user?.roleNames?.join(' / ') || '暂无角色');
        var __VLS_179;
        const __VLS_180 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
            divided: true,
            command: "logout",
        }));
        const __VLS_182 = __VLS_181({
            divided: true,
            command: "logout",
        }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        __VLS_183.slots.default;
        var __VLS_183;
        var __VLS_171;
    }
    var __VLS_155;
    var __VLS_143;
}
const __VLS_184 = {}.ElMain;
/** @type {[typeof __VLS_components.ElMain, typeof __VLS_components.elMain, typeof __VLS_components.ElMain, typeof __VLS_components.elMain, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    ...{ class: "layout-main" },
    ...{ class: ({ 'dashboard-main': __VLS_ctx.isDashboardRoute, 'iteration-main': __VLS_ctx.isIterationWorkspaceRoute, 'mobile-main': __VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute }) },
}));
const __VLS_186 = __VLS_185({
    ...{ class: "layout-main" },
    ...{ class: ({ 'dashboard-main': __VLS_ctx.isDashboardRoute, 'iteration-main': __VLS_ctx.isIterationWorkspaceRoute, 'mobile-main': __VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
const __VLS_188 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({}));
const __VLS_190 = __VLS_189({}, ...__VLS_functionalComponentArgsRest(__VLS_189));
var __VLS_187;
var __VLS_139;
var __VLS_3;
if (__VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
        ...{ class: "mobile-bottom-nav" },
        'aria-label': "手机端主导航",
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.mobileBottomNavItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute))
                        return;
                    __VLS_ctx.handleMobileNavigate(item.path);
                } },
            key: (item.path),
            ...{ class: "mobile-nav-button" },
            ...{ class: ({ active: __VLS_ctx.isMenuActive(item) }) },
            type: "button",
        });
        const __VLS_192 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            ...{ class: "mobile-nav-icon" },
        }));
        const __VLS_194 = __VLS_193({
            ...{ class: "mobile-nav-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        __VLS_195.slots.default;
        const __VLS_196 = ((item.icon));
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({}));
        const __VLS_198 = __VLS_197({}, ...__VLS_functionalComponentArgsRest(__VLS_197));
        var __VLS_195;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "mobile-nav-label" },
        });
        (item.shortLabel);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isMobileViewport && !__VLS_ctx.isIterationWorkspaceRoute))
                    return;
                __VLS_ctx.mobileMoreDrawerVisible = true;
            } },
        ...{ class: "mobile-nav-button" },
        ...{ class: ({ active: __VLS_ctx.isMobileMoreActive }) },
        type: "button",
    });
    const __VLS_200 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
        ...{ class: "mobile-nav-icon" },
    }));
    const __VLS_202 = __VLS_201({
        ...{ class: "mobile-nav-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
    __VLS_203.slots.default;
    const __VLS_204 = {}.MoreFilled;
    /** @type {[typeof __VLS_components.MoreFilled, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({}));
    const __VLS_206 = __VLS_205({}, ...__VLS_functionalComponentArgsRest(__VLS_205));
    var __VLS_203;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mobile-nav-label" },
    });
}
const __VLS_208 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
    modelValue: (__VLS_ctx.mobileMoreDrawerVisible),
    direction: "btt",
    size: "72%",
    showClose: (false),
    ...{ class: "mobile-more-drawer" },
}));
const __VLS_210 = __VLS_209({
    modelValue: (__VLS_ctx.mobileMoreDrawerVisible),
    direction: "btt",
    size: "72%",
    showClose: (false),
    ...{ class: "mobile-more-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_209));
__VLS_211.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_211.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-more-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-more-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.mobileMoreDrawerVisible = false;
            } },
        ...{ class: "mobile-more-close" },
        type: "button",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mobile-more-panel" },
});
if (__VLS_ctx.mobileWorkspaceMoreItems.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "mobile-more-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-more-section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-more-list" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.mobileWorkspaceMoreItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.mobileWorkspaceMoreItems.length))
                        return;
                    __VLS_ctx.handleMobileNavigate(item.path);
                } },
            key: (item.path),
            ...{ class: "mobile-more-item" },
            ...{ class: ({ active: __VLS_ctx.isMenuActive(item) }) },
            type: "button",
        });
        const __VLS_212 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            ...{ class: "mobile-more-item-icon" },
        }));
        const __VLS_214 = __VLS_213({
            ...{ class: "mobile-more-item-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        const __VLS_216 = ((item.icon));
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({}));
        const __VLS_218 = __VLS_217({}, ...__VLS_functionalComponentArgsRest(__VLS_217));
        var __VLS_215;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "mobile-more-item-label" },
        });
        (item.label);
    }
}
if (__VLS_ctx.mobileSystemMoreItems.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "mobile-more-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-more-section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mobile-more-list" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.mobileSystemMoreItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.mobileSystemMoreItems.length))
                        return;
                    __VLS_ctx.handleMobileNavigate(item.path);
                } },
            key: (item.path),
            ...{ class: "mobile-more-item" },
            ...{ class: ({ active: __VLS_ctx.isMenuActive(item) }) },
            type: "button",
        });
        const __VLS_220 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            ...{ class: "mobile-more-item-icon" },
        }));
        const __VLS_222 = __VLS_221({
            ...{ class: "mobile-more-item-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        __VLS_223.slots.default;
        const __VLS_224 = ((item.icon));
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({}));
        const __VLS_226 = __VLS_225({}, ...__VLS_functionalComponentArgsRest(__VLS_225));
        var __VLS_223;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "mobile-more-item-label" },
        });
        (item.label);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "mobile-more-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mobile-more-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mobile-more-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.handleMobileCommand('profile');
        } },
    ...{ class: "mobile-more-item" },
    ...{ class: ({ active: __VLS_ctx.route.path === '/profile' }) },
    type: "button",
});
const __VLS_228 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
    ...{ class: "mobile-more-item-icon" },
}));
const __VLS_230 = __VLS_229({
    ...{ class: "mobile-more-item-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_229));
__VLS_231.slots.default;
const __VLS_232 = {}.UserFilled;
/** @type {[typeof __VLS_components.UserFilled, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({}));
const __VLS_234 = __VLS_233({}, ...__VLS_functionalComponentArgsRest(__VLS_233));
var __VLS_231;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mobile-more-item-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.handleMobileCommand('logout');
        } },
    ...{ class: "mobile-more-item" },
    type: "button",
});
const __VLS_236 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
    ...{ class: "mobile-more-item-icon" },
}));
const __VLS_238 = __VLS_237({
    ...{ class: "mobile-more-item-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_237));
__VLS_239.slots.default;
const __VLS_240 = {}.SwitchButton;
/** @type {[typeof __VLS_components.SwitchButton, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({}));
const __VLS_242 = __VLS_241({}, ...__VLS_functionalComponentArgsRest(__VLS_241));
var __VLS_239;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mobile-more-item-label" },
});
var __VLS_211;
const __VLS_244 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
    modelValue: (__VLS_ctx.notificationStore.drawerVisible),
    showClose: (false),
    size: "420px",
    ...{ class: "message-center-drawer" },
}));
const __VLS_246 = __VLS_245({
    modelValue: (__VLS_ctx.notificationStore.drawerVisible),
    showClose: (false),
    size: "420px",
    ...{ class: "message-center-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_245));
__VLS_247.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_247.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "drawer-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "drawer-head-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "drawer-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "drawer-subtitle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.notificationStore.markAllRead) },
        ...{ class: "drawer-mark-all-button" },
        type: "button",
    });
    const __VLS_248 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({}));
    const __VLS_250 = __VLS_249({}, ...__VLS_functionalComponentArgsRest(__VLS_249));
    __VLS_251.slots.default;
    const __VLS_252 = {}.Finished;
    /** @type {[typeof __VLS_components.Finished, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({}));
    const __VLS_254 = __VLS_253({}, ...__VLS_functionalComponentArgsRest(__VLS_253));
    var __VLS_251;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "notification-drawer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "notification-nav" },
    'aria-label': "消息分类",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.notificationStore.toggleUnreadOnly(false);
        } },
    ...{ class: "notification-nav-button" },
    ...{ class: ({ active: !__VLS_ctx.notificationStore.unreadOnly }) },
    type: "button",
});
const __VLS_256 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({}));
const __VLS_258 = __VLS_257({}, ...__VLS_functionalComponentArgsRest(__VLS_257));
__VLS_259.slots.default;
const __VLS_260 = {}.Message;
/** @type {[typeof __VLS_components.Message, ]} */ ;
// @ts-ignore
const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({}));
const __VLS_262 = __VLS_261({}, ...__VLS_functionalComponentArgsRest(__VLS_261));
var __VLS_259;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.notificationStore.toggleUnreadOnly(true);
        } },
    ...{ class: "notification-nav-button" },
    ...{ class: ({ active: __VLS_ctx.notificationStore.unreadOnly }) },
    type: "button",
});
const __VLS_264 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({}));
const __VLS_266 = __VLS_265({}, ...__VLS_functionalComponentArgsRest(__VLS_265));
__VLS_267.slots.default;
const __VLS_268 = {}.Bell;
/** @type {[typeof __VLS_components.Bell, ]} */ ;
// @ts-ignore
const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({}));
const __VLS_270 = __VLS_269({}, ...__VLS_functionalComponentArgsRest(__VLS_269));
var __VLS_267;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "notification-nav-button disabled" },
    type: "button",
    disabled: true,
});
const __VLS_272 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({}));
const __VLS_274 = __VLS_273({}, ...__VLS_functionalComponentArgsRest(__VLS_273));
__VLS_275.slots.default;
const __VLS_276 = {}.ChatDotRound;
/** @type {[typeof __VLS_components.ChatDotRound, ]} */ ;
// @ts-ignore
const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({}));
const __VLS_278 = __VLS_277({}, ...__VLS_functionalComponentArgsRest(__VLS_277));
var __VLS_275;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "notification-nav-button disabled" },
    type: "button",
    disabled: true,
});
const __VLS_280 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({}));
const __VLS_282 = __VLS_281({}, ...__VLS_functionalComponentArgsRest(__VLS_281));
__VLS_283.slots.default;
const __VLS_284 = {}.WarningFilled;
/** @type {[typeof __VLS_components.WarningFilled, ]} */ ;
// @ts-ignore
const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({}));
const __VLS_286 = __VLS_285({}, ...__VLS_functionalComponentArgsRest(__VLS_285));
var __VLS_283;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onScroll: (__VLS_ctx.handleNotificationListScroll) },
    ...{ class: "notification-list custom-scrollbar" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.notificationStore.loading) }, null, null);
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.notificationStore.items))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleNotificationClick(item);
            } },
        key: (item.id),
        ...{ class: "notification-item" },
        ...{ class: ({ unread: !item.read, muted: item.read }) },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notification-item-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notification-item-source" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "notification-item-dot" },
        ...{ class: ({ unread: !item.read }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "notification-item-source-text" },
    });
    (__VLS_ctx.resolveNotificationSource(item));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "notification-item-time" },
    });
    (__VLS_ctx.formatNotificationTime(item.createdAt));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notification-item-title" },
    });
    (item.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notification-item-content" },
    });
    (item.content);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notification-item-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "notification-item-chip" },
        ...{ class: (__VLS_ctx.resolveNotificationContextTone(item)) },
    });
    const __VLS_288 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({}));
    const __VLS_290 = __VLS_289({}, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    const __VLS_292 = ((__VLS_ctx.resolveNotificationContextIcon(item)));
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({}));
    const __VLS_294 = __VLS_293({}, ...__VLS_functionalComponentArgsRest(__VLS_293));
    var __VLS_291;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.resolveNotificationContextLabel(item));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "notification-item-separator" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "notification-item-level" },
        ...{ class: (__VLS_ctx.resolveNotificationLevelTone(item)) },
    });
    (__VLS_ctx.resolveNotificationLevelLabel(item));
}
if (!__VLS_ctx.notificationStore.loading && !__VLS_ctx.notificationStore.items.length) {
    const __VLS_296 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
        ...{ class: "notification-empty" },
        description: "暂无消息",
    }));
    const __VLS_298 = __VLS_297({
        ...{ class: "notification-empty" },
        description: "暂无消息",
    }, ...__VLS_functionalComponentArgsRest(__VLS_297));
}
if (__VLS_ctx.notificationStore.loading && __VLS_ctx.notificationStore.items.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notification-load-more" },
    });
}
else if (!__VLS_ctx.canLoadMoreNotifications && __VLS_ctx.notificationStore.items.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notification-load-more muted" },
    });
}
var __VLS_247;
/** @type {__VLS_StyleScopedClasses['layout-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-head']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-logo-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-title']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-title-mini']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-subtitle-mini']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-label']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-short-label']} */ ;
/** @type {__VLS_StyleScopedClasses['system-menu-group']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-label']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-short-label']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-label']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-short-label']} */ ;
/** @type {__VLS_StyleScopedClasses['system-menu-group']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-label']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu']} */ ;
/** @type {__VLS_StyleScopedClasses['system-submenu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-menu-button']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-active-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-short-label']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['system-popover-button']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-main-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search-group']} */ ;
/** @type {__VLS_StyleScopedClasses['header-page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['header-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['header-profile-group']} */ ;
/** @type {__VLS_StyleScopedClasses['header-notification-button']} */ ;
/** @type {__VLS_StyleScopedClasses['header-notification-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['header-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['user-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['user-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['user-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['user-avatar-image']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-main']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-bottom-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-nav-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-close']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-section']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-section']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-section']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-more-item-label']} */ ;
/** @type {__VLS_StyleScopedClasses['message-center-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-head-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-title']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-mark-all-button']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-list']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-scrollbar']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-head']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-source']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-source-text']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-time']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-title']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-content']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-item-level']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-load-more']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-load-more']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            ArrowRight: ArrowRight,
            Bell: Bell,
            ChatDotRound: ChatDotRound,
            DataAnalysis: DataAnalysis,
            Expand: Expand,
            Finished: Finished,
            Fold: Fold,
            Message: Message,
            MoreFilled: MoreFilled,
            Search: Search,
            Setting: Setting,
            SwitchButton: SwitchButton,
            UserFilled: UserFilled,
            WarningFilled: WarningFilled,
            route: route,
            appStore: appStore,
            authStore: authStore,
            notificationStore: notificationStore,
            systemMenuExpanded: systemMenuExpanded,
            integrationMenuExpanded: integrationMenuExpanded,
            isMobileViewport: isMobileViewport,
            mobileMoreDrawerVisible: mobileMoreDrawerVisible,
            pageTitle: pageTitle,
            visiblePrimaryMenus: visiblePrimaryMenus,
            visibleIntegrationMenus: visibleIntegrationMenus,
            visibleTrailingMenus: visibleTrailingMenus,
            visibleSystemMenus: visibleSystemMenus,
            isDashboardRoute: isDashboardRoute,
            isIterationWorkspaceRoute: isIterationWorkspaceRoute,
            effectiveSidebarCollapsed: effectiveSidebarCollapsed,
            asideWidth: asideWidth,
            userInitial: userInitial,
            userAvatarUrl: userAvatarUrl,
            headerSearchHint: headerSearchHint,
            canLoadMoreNotifications: canLoadMoreNotifications,
            mobileBottomNavItems: mobileBottomNavItems,
            mobileWorkspaceMoreItems: mobileWorkspaceMoreItems,
            mobileSystemMoreItems: mobileSystemMoreItems,
            isMobileMoreActive: isMobileMoreActive,
            isIntegrationSectionActive: isIntegrationSectionActive,
            isSystemSectionActive: isSystemSectionActive,
            isMenuActive: isMenuActive,
            handleNavigate: handleNavigate,
            handleMobileNavigate: handleMobileNavigate,
            handleCommand: handleCommand,
            handleMobileCommand: handleMobileCommand,
            handleOpenNotifications: handleOpenNotifications,
            resolveNotificationSource: resolveNotificationSource,
            resolveNotificationContextLabel: resolveNotificationContextLabel,
            resolveNotificationContextTone: resolveNotificationContextTone,
            resolveNotificationContextIcon: resolveNotificationContextIcon,
            resolveNotificationLevelLabel: resolveNotificationLevelLabel,
            resolveNotificationLevelTone: resolveNotificationLevelTone,
            formatNotificationTime: formatNotificationTime,
            handleNotificationClick: handleNotificationClick,
            handleNotificationListScroll: handleNotificationListScroll,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=AppLayout.vue.js.map
