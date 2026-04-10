import { http } from './http'
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

export const uploadProfileAvatarApi = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<CurrentUserInfo>>('/api/auth/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return data.data
}

export const changePasswordApi = async (payload: ChangePasswordPayload) => {
  await http.post<ApiResponse<null>>('/api/auth/change-password', payload)
}

export const logoutApi = async () => {
  await http.post<ApiResponse<null>>('/api/auth/logout')
}
