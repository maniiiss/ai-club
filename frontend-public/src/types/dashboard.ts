/**
 * 工作台类型定义。
 * 与后端 DashboardOverview / DashboardStats / AgentSummary / DashboardShortcutOverview 对齐。
 */

import type { ProjectItem } from './project'
import type { WorkItem } from './planning'

/** 工作台统计数据。 */
export interface DashboardStats {
  projectCount: number
  agentCount: number
  taskCount: number
  repoCount: number
  myTaskCount?: number
  myInProgressTaskCount?: number
  myPendingTaskCount?: number
  mergeAlertCount?: number
}

/** 在线智能体摘要（对齐后端 AgentSummary，仅保留工作台展示所需字段）。 */
export interface AgentSummary {
  id: number
  name: string
  type: string
  status: string
  enabled: boolean
  accessType?: string
  builtinCode?: string | null
  capability?: string | null
  description?: string | null
  projectId?: number | null
  projectName?: string | null
}

/** 工作台快捷入口条目（系统入口与个人入口共用）。 */
export interface DashboardShortcutEntryItem {
  /** 入口主键ID（个人入口保存后回填，系统入口由管理员维护）。 */
  id?: number
  /** 归属范围：SYSTEM 管理员统一维护 / USER 当前用户私有。 */
  scopeType?: 'SYSTEM' | 'USER' | string
  /** 入口名称。 */
  name: string
  /** 跳转地址。 */
  url: string
  /** 图标名称或图片地址。 */
  icon?: string | null
  /** 是否启用。 */
  enabled: boolean
  /** 展示顺序。 */
  sortOrder?: number
}

/** 保存个人快捷入口时的载荷条目。 */
export interface DashboardShortcutPayloadItem {
  id?: number
  name: string
  url: string
  icon?: string | null
  enabled: boolean
}

/** 工作台「常用系统访问入口」聚合数据。 */
export interface DashboardShortcutOverview {
  /** 管理员统一维护的系统入口（公众端只读）。 */
  systemEntries: DashboardShortcutEntryItem[]
  /** 当前登录用户自己的入口。 */
  userEntries: DashboardShortcutEntryItem[]
}

/** 工作台快捷任务（便签）条目。 */
export interface DashboardQuickTaskItem {
  /** 主键ID（保存后回填）。 */
  id?: number
  /** 前端用来匹配本地草稿行的稳定键。 */
  clientKey?: string
  /** 用户填写的临时笔记内容。 */
  content: string
  /** 是否已完成。 */
  checked: boolean
  /** 展示顺序。 */
  sortOrder?: number
}

/** 保存快捷任务时的载荷条目。 */
export interface DashboardQuickTaskPayloadItem {
  id?: number
  clientKey?: string
  content: string
  checked: boolean
}

/** 自动合并日志摘要（对齐后端 GitlabAutoMergeLogSummary，用于合并告警展示）。 */
export interface GitlabAutoMergeLogSummary {
  id: number
  configId: number | null
  configName: string
  triggerType: string
  mergeRequestIid: number | null
  mergeRequestTitle: string | null
  mergeRequestAuthorName: string | null
  mergeRequestAuthorUsername: string | null
  /** 合并结果：MERGED / FAILED / AI_REJECTED / SKIPPED 等。 */
  result: string
  reason: string
  detailMarkdown: string | null
  webUrl: string | null
  executedAt: string
}

/** 工作台全局概览。 */
export interface DashboardOverview {
  stats: DashboardStats
  activeProjects: ProjectItem[]
  /** 在线智能体列表（卡片3 数据来源）。 */
  onlineAgents: AgentSummary[]
  recentTasks: WorkItem[]
  /** 常用系统访问入口聚合（卡片5 数据来源）。 */
  shortcutOverview: DashboardShortcutOverview
  /** 当前登录用户的 GitLab 用户名，用于 MR 卡片展示身份。 */
  currentUserGitlabUsername: string | null
  /** 当前用户作为 MR 作者的最近合并日志（「我的合并记录」）。 */
  currentUserGitlabMergeLogs?: GitlabAutoMergeLogSummary[]
  /** 当前用户的合并告警日志（自动合并失败或 AI 审核拒绝）。 */
  mergeAlerts?: GitlabAutoMergeLogSummary[]
  /** 当前用户维度的任务（后端 myTasks，公众端暂未单独展示）。 */
  myTasks?: WorkItem[]
}
