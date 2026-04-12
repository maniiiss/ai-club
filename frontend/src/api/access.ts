import { http } from './http'
import type { ApiResponse, DataPermissionScopeValue, PageResponse, PermissionItem, PlatformToolItem, RoleItem, UserItem, UserOptionItem } from '@/types/platform'

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export interface UserPayload {
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  enabled: boolean
  roleIds: number[]
  password?: string
}

export interface UserQuery {
  page: number
  size: number
  keyword?: string
  enabled?: boolean | ''
  roleId?: number
}

export interface RolePayload {
  name: string
  code: string
  enabled: boolean
  description: string
  projectVisibilityScope: DataPermissionScopeValue
  projectManageScope: DataPermissionScopeValue
  iterationDeleteScope: DataPermissionScopeValue
  taskDeleteScope: DataPermissionScopeValue
  permissionIds: number[]
}

export interface RoleQuery {
  page: number
  size: number
  keyword?: string
  enabled?: boolean | ''
}

export interface PermissionPayload {
  name: string
  code: string
  type: 'MENU' | 'ACTION'
  path?: string | null
  component?: string | null
  icon?: string
  parentId?: number | null
  sortOrder: number
  enabled: boolean
  description: string
}

export interface PermissionQuery {
  page: number
  size: number
  keyword?: string
  type?: 'MENU' | 'ACTION' | ''
  enabled?: boolean | ''
}

export interface PlatformToolQuery {
  page: number
  size: number
  keyword?: string
  moduleCode?: string
  enabled?: boolean | ''
  readOnly?: boolean | ''
}

export interface PlatformToolPayload {
  displayName?: string
  descriptionOverride?: string
  enabled: boolean
  allowAutoExecute: boolean
}

export const pageUsers = async (query: UserQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<UserItem>>>('/api/users', {
    params: cleanParams(query)
  })
  return data.data
}

export const listUserOptions = async () => {
  const { data } = await http.get<ApiResponse<UserOptionItem[]>>('/api/users/options')
  return data.data
}

export const createUser = async (payload: UserPayload) => {
  const { data } = await http.post<ApiResponse<UserItem>>('/api/users', payload)
  return data.data
}

export const updateUser = async (id: number, payload: UserPayload) => {
  const { data } = await http.put<ApiResponse<UserItem>>(`/api/users/${id}`, payload)
  return data.data
}

export const deleteUser = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/users/${id}`)
}

export const resetUserPassword = async (id: number, password: string) => {
  await http.post<ApiResponse<null>>(`/api/users/${id}/reset-password`, { password })
}

export const pageRoles = async (query: RoleQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<RoleItem>>>('/api/roles', {
    params: cleanParams(query)
  })
  return data.data
}

export const listRoleOptions = async () => {
  const { data } = await http.get<ApiResponse<RoleItem[]>>('/api/roles/options')
  return data.data
}

export const createRole = async (payload: RolePayload) => {
  const { data } = await http.post<ApiResponse<RoleItem>>('/api/roles', payload)
  return data.data
}

export const updateRole = async (id: number, payload: RolePayload) => {
  const { data } = await http.put<ApiResponse<RoleItem>>(`/api/roles/${id}`, payload)
  return data.data
}

export const deleteRole = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/roles/${id}`)
}

export const pagePermissions = async (query: PermissionQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<PermissionItem>>>('/api/permissions', {
    params: cleanParams(query)
  })
  return data.data
}

export const listPermissionOptions = async () => {
  const { data } = await http.get<ApiResponse<PermissionItem[]>>('/api/permissions/options')
  return data.data
}

export const createPermission = async (payload: PermissionPayload) => {
  const { data } = await http.post<ApiResponse<PermissionItem>>('/api/permissions', payload)
  return data.data
}

export const updatePermission = async (id: number, payload: PermissionPayload) => {
  const { data } = await http.put<ApiResponse<PermissionItem>>(`/api/permissions/${id}`, payload)
  return data.data
}

export const deletePermission = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/permissions/${id}`)
}

export const pagePlatformTools = async (query: PlatformToolQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<PlatformToolItem>>>('/api/platform-tools', {
    params: cleanParams(query)
  })
  return data.data
}

export const getPlatformToolDetail = async (toolCode: string) => {
  const { data } = await http.get<ApiResponse<PlatformToolItem>>(`/api/platform-tools/${encodeURIComponent(toolCode)}`)
  return data.data
}

export const updatePlatformTool = async (toolCode: string, payload: PlatformToolPayload) => {
  const { data } = await http.put<ApiResponse<PlatformToolItem>>(`/api/platform-tools/${encodeURIComponent(toolCode)}`, payload)
  return data.data
}
