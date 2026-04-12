import type {
  DashboardWidgetDefinition,
  DashboardWidgetHeight,
  DashboardWidgetId,
  DashboardWidgetLayoutItem,
  DashboardWidgetWidth
} from '@/types/dashboard'

export const DASHBOARD_LAYOUT_STORAGE_KEY_PREFIX = 'git-ai-club:dashboard-layout:v2'
export const DASHBOARD_LAYOUT_LEGACY_STORAGE_KEY = 'git-ai-club:dashboard-layout:v1'

const DASHBOARD_WIDGET_WIDTH_VALUES: DashboardWidgetWidth[] = ['quarter', 'half', 'threeQuarter', 'full']
const DASHBOARD_WIDGET_HEIGHT_VALUES: DashboardWidgetHeight[] = ['single', 'double', 'triple', 'quadruple']
const DASHBOARD_WIDGET_WIDTH_SET = new Set<DashboardWidgetWidth>(DASHBOARD_WIDGET_WIDTH_VALUES)
const DASHBOARD_WIDGET_HEIGHT_SET = new Set<DashboardWidgetHeight>(DASHBOARD_WIDGET_HEIGHT_VALUES)

/**
 * 首页小组件注册表。第一版仅纳入已有真实数据能力的小组件。
 */
export const DASHBOARD_WIDGET_DEFINITIONS: DashboardWidgetDefinition[] = [
  {
    id: 'stat-project-count',
    title: '总项目数量',
    description: '展示平台当前项目总数。',
    defaultWidth: 'quarter',
    defaultHeight: 'single',
    defaultVisible: true,
    renderKey: 'stat-project-count',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:project-stats']
  },
  {
    id: 'stat-agent-count',
    title: '活跃智能体',
    description: '展示当前在线或可用的智能体数量。',
    defaultWidth: 'quarter',
    defaultHeight: 'single',
    defaultVisible: true,
    renderKey: 'stat-agent-count',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:agent-stats']
  },
  {
    id: 'stat-task-count',
    title: '任务总览',
    description: '展示当前任务总量和待跟进任务规模。',
    defaultWidth: 'quarter',
    defaultHeight: 'single',
    defaultVisible: true,
    renderKey: 'stat-task-count',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:task-stats']
  },
  {
    id: 'quick-pipeline-build',
    title: '快速构建',
    description: '从首页直接触发项目流水线构建。',
    defaultWidth: 'half',
    defaultHeight: 'double',
    defaultVisible: true,
    renderKey: 'quick-pipeline-build',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:quick-build']
  },
  {
    id: 'gitlab-quick-merge',
    title: 'GitLab 快速发起 MR',
    description: '从首页直接发起 Merge Request。',
    defaultWidth: 'half',
    defaultHeight: 'double',
    defaultVisible: true,
    renderKey: 'gitlab-quick-merge',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:quick-merge']
  },
  {
    id: 'active-project-list',
    title: '活跃项目',
    description: '查看当前活跃项目列表。',
    defaultWidth: 'half',
    defaultHeight: 'double',
    defaultVisible: true,
    renderKey: 'active-project-list',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:active-projects']
  },
  {
    id: 'online-agent-list',
    title: '在线智能体',
    description: '查看当前在线的智能体列表。',
    defaultWidth: 'half',
    defaultHeight: 'double',
    defaultVisible: true,
    renderKey: 'online-agent-list',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:online-agents']
  },
  {
    id: 'recent-task-list',
    title: '最近任务',
    description: '展示最近任务或当前用户待跟进任务。',
    defaultWidth: 'full',
    defaultHeight: 'double',
    defaultVisible: true,
    renderKey: 'recent-task-list',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:recent-tasks']
  },
  {
    id: 'quick-task-checklist',
    title: '快捷任务',
    description: '记录当前账号在首页临时保存的快捷任务与便签。',
    defaultWidth: 'half',
    defaultHeight: 'single',
    defaultVisible: true,
    renderKey: 'quick-task-checklist',
    requiredPermissionsAll: ['dashboard:view', 'dashboard:widget:quick-tasks']
  }
]

/**
 * 先按权限过滤可用组件，再交给布局合并逻辑，避免无权限组件残留在本地缓存里。
 */
export function filterDashboardWidgetsByPermission(
  definitions: DashboardWidgetDefinition[],
  hasPermission: (permission: string | string[]) => boolean
) {
  return definitions.filter((definition) => {
    if (definition.requiredPermissionsAll?.length) {
      return definition.requiredPermissionsAll.every((permission) => hasPermission(permission))
    }
    return !definition.requiredPermission || hasPermission(definition.requiredPermission)
  })
}

/**
 * 根据组件注册表生成默认布局，作为首次访问和恢复默认时的统一基线。
 */
export function buildDefaultDashboardLayout(definitions: DashboardWidgetDefinition[]) {
  return definitions.map<DashboardWidgetLayoutItem>((definition) => buildLayoutItemFromDefinition(definition))
}

/**
 * 为当前用户生成专属布局缓存 key，避免同一浏览器多账号互相覆盖布局。
 */
export function createDashboardLayoutStorageKey(userId?: number | null) {
  return `${DASHBOARD_LAYOUT_STORAGE_KEY_PREFIX}:${typeof userId === 'number' ? userId : 'anonymous'}`
}

/**
 * 读取浏览器缓存中的布局：
 * 1. 优先读取 v2 的用户隔离缓存；
 * 2. 若不存在则兼容读取旧版 v1 缓存；
 * 3. 宽高缺失或非法时，统一回退到组件默认值。
 */
export function readStoredDashboardLayout(userId: number | null | undefined, definitions: DashboardWidgetDefinition[]) {
  if (typeof window === 'undefined') {
    return [] as DashboardWidgetLayoutItem[]
  }

  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]))
  const currentStorageKey = createDashboardLayoutStorageKey(userId)
  const currentRawValue = window.localStorage.getItem(currentStorageKey)
  if (currentRawValue) {
    return parseStoredDashboardLayout(currentRawValue, definitionMap)
  }

  const legacyRawValue = window.localStorage.getItem(DASHBOARD_LAYOUT_LEGACY_STORAGE_KEY)
  if (!legacyRawValue) {
    return [] as DashboardWidgetLayoutItem[]
  }

  return parseLegacyDashboardLayout(legacyRawValue, definitionMap)
}

export function writeStoredDashboardLayout(layout: DashboardWidgetLayoutItem[], userId: number | null | undefined) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(createDashboardLayoutStorageKey(userId), JSON.stringify(layout))
}

/**
 * 将本地缓存与当前注册表做一次幂等合并：
 * 1. 删除缓存里已经失效的组件；
 * 2. 保留用户已有顺序、显示状态和宽高；
 * 3. 新增组件按注册表默认值自动补入末尾。
 */
export function mergeDashboardLayout(
  storedLayout: DashboardWidgetLayoutItem[],
  definitions: DashboardWidgetDefinition[]
) {
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]))
  const orderedItems: DashboardWidgetLayoutItem[] = []
  const seenIds = new Set<DashboardWidgetId>()

  storedLayout.forEach((item) => {
    const definition = definitionMap.get(item.id)
    if (!definition || seenIds.has(item.id)) {
      return
    }
    orderedItems.push(normalizeLayoutItem(item, definition))
    seenIds.add(item.id)
  })

  definitions.forEach((definition) => {
    if (seenIds.has(definition.id)) {
      return
    }
    orderedItems.push(buildLayoutItemFromDefinition(definition))
  })

  return orderedItems
}

function buildLayoutItemFromDefinition(definition: DashboardWidgetDefinition): DashboardWidgetLayoutItem {
  return {
    id: definition.id,
    visible: definition.defaultVisible,
    width: definition.defaultWidth,
    height: definition.defaultHeight
  }
}

function parseStoredDashboardLayout(
  rawValue: string,
  definitionMap: Map<DashboardWidgetId, DashboardWidgetDefinition>
) {
  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return [] as DashboardWidgetLayoutItem[]
    }

    return parsed
      .filter((item) => isLayoutLikeItem(item) && definitionMap.has(item.id))
      .map((item) => normalizeLayoutItem(item, definitionMap.get(item.id)!))
  } catch {
    return [] as DashboardWidgetLayoutItem[]
  }
}

function parseLegacyDashboardLayout(
  rawValue: string,
  definitionMap: Map<DashboardWidgetId, DashboardWidgetDefinition>
) {
  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return [] as DashboardWidgetLayoutItem[]
    }

    // 旧缓存只保存顺序和显隐状态，这里补齐默认宽高后再进入统一合并流程。
    return parsed
      .filter((item) => isLegacyLayoutLikeItem(item) && definitionMap.has(item.id))
      .map((item) => {
        const definition = definitionMap.get(item.id)!
        return {
          id: item.id,
          visible: item.visible,
          width: definition.defaultWidth,
          height: definition.defaultHeight
        } satisfies DashboardWidgetLayoutItem
      })
  } catch {
    return [] as DashboardWidgetLayoutItem[]
  }
}

function normalizeLayoutItem(item: DashboardWidgetLayoutItem, definition: DashboardWidgetDefinition): DashboardWidgetLayoutItem {
  return {
    id: definition.id,
    visible: item.visible,
    width: normalizeDashboardWidgetWidth(item.width, definition.defaultWidth),
    height: normalizeDashboardWidgetHeight(item.height, definition.defaultHeight)
  }
}

function normalizeDashboardWidgetWidth(value: unknown, fallback: DashboardWidgetWidth) {
  return isDashboardWidgetWidth(value) ? value : fallback
}

function normalizeDashboardWidgetHeight(value: unknown, fallback: DashboardWidgetHeight) {
  return isDashboardWidgetHeight(value) ? value : fallback
}

function isDashboardWidgetWidth(value: unknown): value is DashboardWidgetWidth {
  return typeof value === 'string' && DASHBOARD_WIDGET_WIDTH_SET.has(value as DashboardWidgetWidth)
}

function isDashboardWidgetHeight(value: unknown): value is DashboardWidgetHeight {
  return typeof value === 'string' && DASHBOARD_WIDGET_HEIGHT_SET.has(value as DashboardWidgetHeight)
}

function isLayoutLikeItem(value: unknown): value is DashboardWidgetLayoutItem {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as DashboardWidgetLayoutItem).id === 'string' &&
    typeof (value as DashboardWidgetLayoutItem).visible === 'boolean'
  )
}

function isLegacyLayoutLikeItem(value: unknown): value is Pick<DashboardWidgetLayoutItem, 'id' | 'visible'> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Pick<DashboardWidgetLayoutItem, 'id' | 'visible'>).id === 'string' &&
    typeof (value as Pick<DashboardWidgetLayoutItem, 'id' | 'visible'>).visible === 'boolean'
  )
}
