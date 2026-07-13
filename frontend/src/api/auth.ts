import { http } from './http'
import { uploadCommonImage } from './common'
import type { ApiResponse, CurrentUserInfo, LoginResult } from '@/types/platform'

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  password: string
}

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

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export const loginApi = async (payload: LoginPayload) => {
  const { data } = await http.post<ApiResponse<LoginResult>>('/api/auth/login', payload)
  return data.data
}

export const registerApi = async (payload: RegisterPayload) => {
  await http.post<ApiResponse<null>>('/api/auth/register', payload)
}

export const getCurrentUser = async () => {
  const { data } = await http.get<ApiResponse<CurrentUserInfo>>('/api/auth/me')
  return data.data
}

export const updateProfileApi = async (payload: UpdateProfilePayload) => {
  const { data } = await http.put<ApiResponse<CurrentUserInfo>>('/api/auth/profile', payload)
  return data.data
}

/** 更新当前账号主题，并返回刷新后的用户快照。 */
export const updateThemeApi = async (payload: UpdateThemePayload) => {
  const { data } = await http.put<ApiResponse<CurrentUserInfo>>('/api/auth/theme', payload)
  return data.data
}

export const uploadProfileAvatarApi = async (file: File) => {
  return uploadCommonImage(file, 'profile-avatars')
}

export const changePasswordApi = async (payload: ChangePasswordPayload) => {
  await http.post<ApiResponse<null>>('/api/auth/change-password', payload)
}

export const logoutApi = async () => {
  await http.post<ApiResponse<null>>('/api/auth/logout', null, { withCredentials: true })
}
