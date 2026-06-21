/**
 * 迭代管理 - 工作项列表列宽持久化工具。
 *
 * 设计目标：
 * 1. 列宽信息按用户隔离，避免同一浏览器多账号互相覆盖配置；
 * 2. 仅持久化用户实际拖拽过的列，避免缓存写死默认值导致后续调默认值时无法生效；
 * 3. 读取时对非法值做兜底，保证页面在 localStorage 数据被外部破坏时仍能正常渲染。
 */

/** 工作项列表中可见列的稳定 key，用于序列化和读取列宽。 */
export type WorkItemColumnKey =
  | 'code'
  | 'main'
  | 'status'
  | 'hours'
  | 'type'
  | 'plan'
  | 'owner'
  | 'priority'
  | 'creator'

/** 列宽缓存使用的 storage key 前缀，更新版本号请同步调整以触发缓存重置。 */
export const WORK_ITEM_COLUMN_WIDTH_STORAGE_KEY_PREFIX = 'git-ai-club:iteration-work-item-column-widths:v1'

/** 单列允许的最小宽度（像素），防止拖拽到 0 导致列彻底消失。 */
export const WORK_ITEM_COLUMN_MIN_WIDTH = 60

/** 单列允许的最大宽度（像素），避免误操作把单列拖到极端值。 */
export const WORK_ITEM_COLUMN_MAX_WIDTH = 800

/** 列定义：包含默认宽度、是否允许拖拽调整。 */
export interface WorkItemColumnDefinition {
  key: WorkItemColumnKey
  /** 默认宽度（像素），与原 CSS 中的 width 保持一致。 */
  defaultWidth: number
  /** 是否允许用户拖拽调整宽度。操作列保持固定避免按钮换行。 */
  resizable: boolean
}

/**
 * 工作项列表的列注册表。顺序与表头 <th> 顺序保持一致，必要时同步调整模板。
 */
export const WORK_ITEM_COLUMN_DEFINITIONS: WorkItemColumnDefinition[] = [
  { key: 'code', defaultWidth: 90, resizable: true },
  { key: 'main', defaultWidth: 320, resizable: true },
  { key: 'status', defaultWidth: 116, resizable: true },
  { key: 'hours', defaultWidth: 80, resizable: true },
  { key: 'type', defaultWidth: 86, resizable: true },
  { key: 'plan', defaultWidth: 156, resizable: true },
  { key: 'owner', defaultWidth: 124, resizable: true },
  { key: 'priority', defaultWidth: 116, resizable: true },
  { key: 'creator', defaultWidth: 90, resizable: true }
]

export type WorkItemColumnWidthMap = Record<WorkItemColumnKey, number>

/** 生成当前用户专属的 storage key。 */
export function createWorkItemColumnWidthStorageKey(userId?: number | null) {
  const suffix = typeof userId === 'number' && Number.isFinite(userId) ? String(userId) : 'anonymous'
  return `${WORK_ITEM_COLUMN_WIDTH_STORAGE_KEY_PREFIX}:${suffix}`
}

/**
 * 构建一份默认列宽映射，未持久化或读取失败时使用。
 */
export function buildDefaultWorkItemColumnWidths(): WorkItemColumnWidthMap {
  const result = {} as WorkItemColumnWidthMap
  WORK_ITEM_COLUMN_DEFINITIONS.forEach((definition) => {
    result[definition.key] = definition.defaultWidth
  })
  return result
}

/**
 * 读取本地缓存的列宽并与默认值合并：缓存里没有的列、值非法的列统一回退到默认值。
 */
export function readStoredWorkItemColumnWidths(userId?: number | null): WorkItemColumnWidthMap {
  const defaults = buildDefaultWorkItemColumnWidths()
  if (typeof window === 'undefined') {
    return defaults
  }
  const storageKey = createWorkItemColumnWidthStorageKey(userId)
  const rawValue = window.localStorage.getItem(storageKey)
  if (!rawValue) {
    return defaults
  }
  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object') {
      return defaults
    }
    WORK_ITEM_COLUMN_DEFINITIONS.forEach((definition) => {
      const candidate = (parsed as Record<string, unknown>)[definition.key]
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        defaults[definition.key] = clampColumnWidth(candidate)
      }
    })
    return defaults
  } catch {
    return defaults
  }
}

/**
 * 持久化当前列宽映射到 localStorage。
 * 仅写入非默认值的列，避免缓存与默认值同步漂移。
 */
export function writeStoredWorkItemColumnWidths(widths: WorkItemColumnWidthMap, userId?: number | null) {
  if (typeof window === 'undefined') {
    return
  }
  const storageKey = createWorkItemColumnWidthStorageKey(userId)
  const payload: Partial<WorkItemColumnWidthMap> = {}
  WORK_ITEM_COLUMN_DEFINITIONS.forEach((definition) => {
    const current = widths[definition.key]
    if (typeof current === 'number' && Number.isFinite(current) && current !== definition.defaultWidth) {
      payload[definition.key] = clampColumnWidth(current)
    }
  })
  if (Object.keys(payload).length === 0) {
    // 用户重置成默认值时直接清掉缓存，方便后续默认值升级生效。
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(payload))
}

/** 把列宽夹到允许范围内，避免拖拽越界。 */
export function clampColumnWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return WORK_ITEM_COLUMN_MIN_WIDTH
  }
  if (value < WORK_ITEM_COLUMN_MIN_WIDTH) {
    return WORK_ITEM_COLUMN_MIN_WIDTH
  }
  if (value > WORK_ITEM_COLUMN_MAX_WIDTH) {
    return WORK_ITEM_COLUMN_MAX_WIDTH
  }
  return Math.round(value)
}
