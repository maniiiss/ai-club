export const DASHBOARD_LAYOUT_STORAGE_KEY_PREFIX = 'git-ai-club:dashboard-layout:v2';
export const DASHBOARD_LAYOUT_LEGACY_STORAGE_KEY = 'git-ai-club:dashboard-layout:v1';
const DASHBOARD_WIDGET_WIDTH_VALUES = ['quarter', 'half', 'threeQuarter', 'full'];
const DASHBOARD_WIDGET_HEIGHT_VALUES = ['single', 'double', 'triple', 'quadruple'];
const DASHBOARD_WIDGET_WIDTH_SET = new Set(DASHBOARD_WIDGET_WIDTH_VALUES);
const DASHBOARD_WIDGET_HEIGHT_SET = new Set(DASHBOARD_WIDGET_HEIGHT_VALUES);
/**
 * 首页小组件注册表。第一版仅纳入已有真实数据能力的小组件。
 */
export const DASHBOARD_WIDGET_DEFINITIONS = [
    {
        id: 'stat-project-count',
        title: '总项目数量',
        description: '展示平台当前项目总数。',
        defaultWidth: 'quarter',
        defaultHeight: 'single',
        defaultVisible: true,
        renderKey: 'stat-project-count',
        requiredPermission: 'dashboard:view'
    },
    {
        id: 'stat-agent-count',
        title: '活跃智能体',
        description: '展示当前在线或可用的智能体数量。',
        defaultWidth: 'quarter',
        defaultHeight: 'single',
        defaultVisible: true,
        renderKey: 'stat-agent-count',
        requiredPermission: 'dashboard:view'
    },
    {
        id: 'stat-task-count',
        title: '任务总览',
        description: '展示当前任务总量和待跟进任务规模。',
        defaultWidth: 'quarter',
        defaultHeight: 'single',
        defaultVisible: true,
        renderKey: 'stat-task-count',
        requiredPermission: 'dashboard:view'
    },
    {
        id: 'quick-pipeline-build',
        title: '快速构建',
        description: '从首页直接触发项目流水线构建。',
        defaultWidth: 'half',
        defaultHeight: 'double',
        defaultVisible: true,
        renderKey: 'quick-pipeline-build',
        requiredPermission: 'cicd:view'
    },
    {
        id: 'gitlab-quick-merge',
        title: 'GitLab 快速发起 MR',
        description: '从首页直接发起 Merge Request。',
        defaultWidth: 'half',
        defaultHeight: 'double',
        defaultVisible: true,
        renderKey: 'gitlab-quick-merge',
        requiredPermission: 'gitlab:view'
    },
    {
        id: 'active-project-list',
        title: '活跃项目',
        description: '查看当前活跃项目列表。',
        defaultWidth: 'half',
        defaultHeight: 'double',
        defaultVisible: true,
        renderKey: 'active-project-list',
        requiredPermission: 'project:view'
    },
    {
        id: 'online-agent-list',
        title: '在线智能体',
        description: '查看当前在线的智能体列表。',
        defaultWidth: 'half',
        defaultHeight: 'double',
        defaultVisible: true,
        renderKey: 'online-agent-list',
        requiredPermission: 'agent:view'
    },
    {
        id: 'recent-task-list',
        title: '最近任务',
        description: '展示最近任务或当前用户待跟进任务。',
        defaultWidth: 'full',
        defaultHeight: 'double',
        defaultVisible: true,
        renderKey: 'recent-task-list',
        requiredPermission: 'task:view'
    },
    {
        id: 'quick-task-checklist',
        title: '快捷任务',
        description: '记录首页常用的本地待办清单。',
        defaultWidth: 'half',
        defaultHeight: 'single',
        defaultVisible: true,
        renderKey: 'quick-task-checklist',
        requiredPermission: 'dashboard:view'
    }
];
/**
 * 先按权限过滤可用组件，再交给布局合并逻辑，避免无权限组件残留在本地缓存里。
 */
export function filterDashboardWidgetsByPermission(definitions, hasPermission) {
    return definitions.filter((definition) => !definition.requiredPermission || hasPermission(definition.requiredPermission));
}
/**
 * 根据组件注册表生成默认布局，作为首次访问和恢复默认时的统一基线。
 */
export function buildDefaultDashboardLayout(definitions) {
    return definitions.map((definition) => buildLayoutItemFromDefinition(definition));
}
/**
 * 为当前用户生成专属布局缓存 key，避免同一浏览器多账号互相覆盖布局。
 */
export function createDashboardLayoutStorageKey(userId) {
    return `${DASHBOARD_LAYOUT_STORAGE_KEY_PREFIX}:${typeof userId === 'number' ? userId : 'anonymous'}`;
}
/**
 * 读取浏览器缓存中的布局：
 * 1. 优先读取 v2 的用户隔离缓存；
 * 2. 若不存在则兼容读取旧版 v1 缓存；
 * 3. 宽高缺失或非法时，统一回退到组件默认值。
 */
export function readStoredDashboardLayout(userId, definitions) {
    if (typeof window === 'undefined') {
        return [];
    }
    const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
    const currentStorageKey = createDashboardLayoutStorageKey(userId);
    const currentRawValue = window.localStorage.getItem(currentStorageKey);
    if (currentRawValue) {
        return parseStoredDashboardLayout(currentRawValue, definitionMap);
    }
    const legacyRawValue = window.localStorage.getItem(DASHBOARD_LAYOUT_LEGACY_STORAGE_KEY);
    if (!legacyRawValue) {
        return [];
    }
    return parseLegacyDashboardLayout(legacyRawValue, definitionMap);
}
export function writeStoredDashboardLayout(layout, userId) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(createDashboardLayoutStorageKey(userId), JSON.stringify(layout));
}
/**
 * 将本地缓存与当前注册表做一次幂等合并：
 * 1. 删除缓存里已经失效的组件；
 * 2. 保留用户已有顺序、显示状态和宽高；
 * 3. 新增组件按注册表默认值自动补入末尾。
 */
export function mergeDashboardLayout(storedLayout, definitions) {
    const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
    const orderedItems = [];
    const seenIds = new Set();
    storedLayout.forEach((item) => {
        const definition = definitionMap.get(item.id);
        if (!definition || seenIds.has(item.id)) {
            return;
        }
        orderedItems.push(normalizeLayoutItem(item, definition));
        seenIds.add(item.id);
    });
    definitions.forEach((definition) => {
        if (seenIds.has(definition.id)) {
            return;
        }
        orderedItems.push(buildLayoutItemFromDefinition(definition));
    });
    return orderedItems;
}
function buildLayoutItemFromDefinition(definition) {
    return {
        id: definition.id,
        visible: definition.defaultVisible,
        width: definition.defaultWidth,
        height: definition.defaultHeight
    };
}
function parseStoredDashboardLayout(rawValue, definitionMap) {
    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter((item) => isLayoutLikeItem(item) && definitionMap.has(item.id))
            .map((item) => normalizeLayoutItem(item, definitionMap.get(item.id)));
    }
    catch {
        return [];
    }
}
function parseLegacyDashboardLayout(rawValue, definitionMap) {
    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }
        // 旧缓存只保存顺序和显隐状态，这里补齐默认宽高后再进入统一合并流程。
        return parsed
            .filter((item) => isLegacyLayoutLikeItem(item) && definitionMap.has(item.id))
            .map((item) => {
            const definition = definitionMap.get(item.id);
            return {
                id: item.id,
                visible: item.visible,
                width: definition.defaultWidth,
                height: definition.defaultHeight
            };
        });
    }
    catch {
        return [];
    }
}
function normalizeLayoutItem(item, definition) {
    return {
        id: definition.id,
        visible: item.visible,
        width: normalizeDashboardWidgetWidth(item.width, definition.defaultWidth),
        height: normalizeDashboardWidgetHeight(item.height, definition.defaultHeight)
    };
}
function normalizeDashboardWidgetWidth(value, fallback) {
    return isDashboardWidgetWidth(value) ? value : fallback;
}
function normalizeDashboardWidgetHeight(value, fallback) {
    return isDashboardWidgetHeight(value) ? value : fallback;
}
function isDashboardWidgetWidth(value) {
    return typeof value === 'string' && DASHBOARD_WIDGET_WIDTH_SET.has(value);
}
function isDashboardWidgetHeight(value) {
    return typeof value === 'string' && DASHBOARD_WIDGET_HEIGHT_SET.has(value);
}
function isLayoutLikeItem(value) {
    return Boolean(value &&
        typeof value === 'object' &&
        typeof value.id === 'string' &&
        typeof value.visible === 'boolean');
}
function isLegacyLayoutLikeItem(value) {
    return Boolean(value &&
        typeof value === 'object' &&
        typeof value.id === 'string' &&
        typeof value.visible === 'boolean');
}
//# sourceMappingURL=dashboardLayout.js.map