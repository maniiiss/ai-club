/**
 * 首页看板可注册的小组件标识，后续扩展时统一在这里追加。
 */
export type DashboardWidgetId =
  | 'stat-project-count'
  | 'stat-agent-count'
  | 'stat-task-count'
  | 'quick-pipeline-build'
  | 'gitlab-quick-merge'
  | 'active-project-list'
  | 'online-agent-list'
  | 'recent-task-list'
  | 'quick-task-checklist'

/**
 * 看板组件允许选择的固定宽度档位。
 */
export type DashboardWidgetWidth = 'quarter' | 'half' | 'threeQuarter' | 'full'

/**
 * 看板组件允许选择的固定高度档位。
 */
export type DashboardWidgetHeight = 'single' | 'double' | 'triple' | 'quadruple'

/**
 * 本地缓存中的看板布局项，保存顺序、显示状态以及用户自定义宽高。
 */
export interface DashboardWidgetLayoutItem {
  /** 小组件唯一标识。 */
  id: DashboardWidgetId
  /** 是否在首页主网格中展示。 */
  visible: boolean
  /** 当前组件占用的固定宽度档位。 */
  width: DashboardWidgetWidth
  /** 当前组件占用的固定高度档位。 */
  height: DashboardWidgetHeight
}

/**
 * 小组件注册表定义，描述首页如何认识和渲染每一个组件。
 */
export interface DashboardWidgetDefinition {
  /** 小组件唯一标识。 */
  id: DashboardWidgetId
  /** 编辑态和卡片头部显示的名称。 */
  title: string
  /** 帮助用户理解组件用途的简短说明。 */
  description: string
  /** 首次进入首页时默认采用的宽度档位。 */
  defaultWidth: DashboardWidgetWidth
  /** 首次进入首页时默认采用的高度档位。 */
  defaultHeight: DashboardWidgetHeight
  /** 首次进入首页时是否默认展示。 */
  defaultVisible: boolean
  /** 组件渲染键，当前版本等同于 id，便于后续改为独立组件。 */
  renderKey: string
  /** 访问该组件需要具备的权限，没有权限时直接从布局中剔除。 */
  requiredPermission?: string | string[]
}
