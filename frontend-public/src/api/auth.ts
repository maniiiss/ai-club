/**
 * 认证相关 API 调用。
 * 与后端 /api/auth/* 接口对齐。
 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type {
  ChangePasswordPayload,
  CurrentUserInfo,
  LoginPayload,
  LoginResult,
  RegisterPayload,
  UpdateProfilePayload,
  UpdateThemePayload,
} from '@/src/types/auth'

/** 登录。 */
export const loginApi = async (payload: LoginPayload): Promise<LoginResult> => {
  const response = await http.post<ApiResponse<LoginResult>>('/api/auth/login', payload)
  return unwrap(response)
}

/** 注册。 */
export const registerApi = async (payload: RegisterPayload): Promise<void> => {
  await http.post<ApiResponse<null>>('/api/auth/register', payload)
}

/** 获取当前登录用户信息。 */
export const getCurrentUser = async (): Promise<CurrentUserInfo> => {
  const response = await http.get<ApiResponse<CurrentUserInfo>>('/api/auth/me')
  return unwrap(response)
}

/** 更新个人资料。 */
export const updateProfileApi = async (payload: UpdateProfilePayload): Promise<CurrentUserInfo> => {
  const response = await http.put<ApiResponse<CurrentUserInfo>>('/api/auth/profile', payload)
  return unwrap(response)
}

/** 更新当前账号主题，并返回刷新后的用户快照。 */
export const updateThemeApi = async (payload: UpdateThemePayload): Promise<CurrentUserInfo> => {
  const response = await http.put<ApiResponse<CurrentUserInfo>>('/api/auth/theme', payload)
  return unwrap(response)
}

/** 修改密码。 */
export const changePasswordApi = async (payload: ChangePasswordPayload): Promise<void> => {
  await http.post<ApiResponse<null>>('/api/auth/change-password', payload)
}

/** 退出登录。 */
export const logoutApi = async (): Promise<void> => {
  await http.post<ApiResponse<null>>('/api/auth/logout', null, { withCredentials: true })
}
