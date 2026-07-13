/**
 * 认证相关类型定义。
 * 与后端 /api/auth/* 接口契约对齐。
 */

/** 登录请求载荷。 */
export interface LoginPayload {
  username: string
  password: string
}

/** 注册请求载荷。 */
export interface RegisterPayload {
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  password: string
}

/** 更新个人资料请求载荷。 */
export interface UpdateProfilePayload {
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  avatarUrl?: string
}

/** 账号主题切换请求载荷。 */
export interface UpdateThemePayload {
  themeId: string
}

/** 修改密码请求载荷。 */
export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

/** 登录成功返回结果。 */
export interface LoginResult {
  token: string
  expiresAt: string
  user: CurrentUserInfo
}

/** 当前登录用户信息。 */
export interface CurrentUserInfo {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  avatarUrl: string
  enabled: boolean
  roleCodes: string[]
  roleNames: string[]
  /** 用户拥有的权限码集合，用于前端路由守卫和按钮级权限控制。 */
  permissionCodes: string[]
  /** 用户已完成新手引导的页面 key 列表。 */
  guideCompleted: string[]
  /** 账号级主题 ID，公众端与管理端共用。 */
  themeId: string
}
