/**
 * 项目相关类型定义。
 * 与后端 /api/projects/* 接口契约对齐。
 */

/** 项目成员摘要。 */
export interface ProjectMemberItem {
  /** 成员用户 ID。 */
  id: number
  /** 成员展示名称。 */
  name: string
  /** 成员头像地址，为空时前端回退显示姓名首字。 */
  avatarUrl: string | null
}

/** 项目列表/详情返回的项目信息。 */
export interface ProjectItem {
  id: number
  name: string
  owner: string
  ownerUserId: number | null
  /** 项目创建人用户 ID。 */
  creatorUserId: number | null
  /** 负责人头像地址，为空时前端回退显示负责人首字。 */
  ownerAvatarUrl?: string | null
  memberUserIds: number[]
  memberNames: string[]
  /** 项目成员轻量摘要，供项目列表头像与弹层展示复用。 */
  memberItems?: ProjectMemberItem[]
  status: string
  description: string
  agentCount: number
  taskCount: number
  repoCount: number
  /** 当前用户是否可以编辑项目。 */
  canEdit: boolean
  /** 当前用户是否可以删除项目。 */
  canDelete: boolean
}

/** 创建/更新项目请求载荷。 */
export interface ProjectPayload {
  name: string
  owner: string
  ownerUserId?: number | null
  memberUserIds?: number[]
  status: string
  description: string
}

/** 项目列表统计信息。 */
export interface ProjectListStatsItem {
  /** 当前筛选结果中的项目总数。 */
  activeProjectCount: number
  /** 当前筛选结果下的任务总量。 */
  totalTaskCount: number
  /** 当前筛选结果中进行中项目占比，范围 0-100。 */
  resourceLoadPercent: number
  /** 当前筛选结果下的平均任务数。 */
  averageTaskCount: number
}
