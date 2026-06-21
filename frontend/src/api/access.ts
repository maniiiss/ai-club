import { http } from './http'
import type { ApiResponse, CreditAccountBackfillResult, CreditAccountItem, CreditFeatureConfigItem, CreditGlobalConfigItem, CreditTransactionItem, DashboardShortcutEntryItem, DataPermissionScopeValue, PageResponse, PermissionItem, PlatformEnvVarDetailItem, PlatformEnvVarItem, PlatformToolItem, RepositoryScanRulesetItem, RoleItem, UserItem, UserOptionItem } from '@/types/platform'

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export interface UserPayload {
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUserId?: number | null
  gitlabUsername: string
  gitlabName?: string
  giteeMemberId?: number | null
  giteeUsername?: string
  giteeName?: string
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

export interface PlatformEnvVarPayload {
  sourceType: 'STATIC' | 'HTTP'
  staticValue?: string
  httpUrl?: string | null
  httpHeadersJson?: string | null
}

export interface DashboardShortcutAdminPayload {
  name: string
  url: string
  icon: string
  enabled: boolean
  sortOrder: number
}

export interface RepositoryScanRulesetQuery {
  page: number
  size: number
  keyword?: string
  engineType?: string
  enabled?: boolean | ''
}

export interface RepositoryScanRulesetPayload {
  code: string
  name: string
  description: string
  engineType: string
  enabled: boolean
  defaultSelected: boolean
  definitionContent: string
}

export interface RepositoryScanRulesetValidationPayload {
  engineType: string
  definitionContent: string
}

export interface CreditGlobalConfigPayload {
  registerGrantAmount: number
  registerGrantEnabled: boolean
}

export interface CreditFeatureConfigPayload {
  featureCode: string
  featureName: string
  costAmount: number
  enabled: boolean
}

export interface CreditAccountQuery {
  page: number
  size: number
  keyword?: string
}

export interface CreditAdjustmentPayload {
  amount: number
  reason: string
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

export const listPlatformEnvVars = async () => {
  const { data } = await http.get<ApiResponse<PlatformEnvVarItem[]>>('/api/platform-env-vars')
  return data.data
}

export const getPlatformEnvVarDetail = async (envKey: string) => {
  const { data } = await http.get<ApiResponse<PlatformEnvVarDetailItem>>(`/api/platform-env-vars/${encodeURIComponent(envKey)}`)
  return data.data
}

export const updatePlatformEnvVar = async (envKey: string, payload: PlatformEnvVarPayload) => {
  const { data } = await http.put<ApiResponse<PlatformEnvVarDetailItem>>(`/api/platform-env-vars/${encodeURIComponent(envKey)}`, payload)
  return data.data
}

export const listDashboardShortcutEntries = async () => {
  const { data } = await http.get<ApiResponse<DashboardShortcutEntryItem[]>>('/api/dashboard-shortcut-entries')
  return data.data
}

export const createDashboardShortcutEntry = async (payload: DashboardShortcutAdminPayload) => {
  const { data } = await http.post<ApiResponse<DashboardShortcutEntryItem>>('/api/dashboard-shortcut-entries', payload)
  return data.data
}

export const updateDashboardShortcutEntry = async (id: number, payload: DashboardShortcutAdminPayload) => {
  const { data } = await http.put<ApiResponse<DashboardShortcutEntryItem>>(`/api/dashboard-shortcut-entries/${id}`, payload)
  return data.data
}

export const deleteDashboardShortcutEntry = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/dashboard-shortcut-entries/${id}`)
}

export const pageRepositoryScanRulesets = async (query: RepositoryScanRulesetQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<RepositoryScanRulesetItem>>>('/api/repository-scan-rulesets', {
    params: cleanParams(query)
  })
  return data.data
}

export const getRepositoryScanRulesetDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<RepositoryScanRulesetItem>>(`/api/repository-scan-rulesets/${id}`)
  return data.data
}

export const createRepositoryScanRuleset = async (payload: RepositoryScanRulesetPayload) => {
  const { data } = await http.post<ApiResponse<RepositoryScanRulesetItem>>('/api/repository-scan-rulesets', payload)
  return data.data
}

export const updateRepositoryScanRuleset = async (id: number, payload: RepositoryScanRulesetPayload) => {
  const { data } = await http.put<ApiResponse<RepositoryScanRulesetItem>>(`/api/repository-scan-rulesets/${id}`, payload)
  return data.data
}

export const validateRepositoryScanRuleset = async (payload: RepositoryScanRulesetValidationPayload) => {
  const { data } = await http.post<ApiResponse<{ success: boolean; message: string }>>('/api/repository-scan-rulesets/validate', payload)
  return data.data
}

export const getCreditGlobalConfig = async () => {
  const { data } = await http.get<ApiResponse<CreditGlobalConfigItem>>('/api/credits/config')
  return data.data
}

export const updateCreditGlobalConfig = async (payload: CreditGlobalConfigPayload) => {
  const { data } = await http.put<ApiResponse<CreditGlobalConfigItem>>('/api/credits/config', payload)
  return data.data
}

export const listCreditFeatureConfigs = async () => {
  const { data } = await http.get<ApiResponse<CreditFeatureConfigItem[]>>('/api/credits/features')
  return data.data
}

export const saveCreditFeatureConfig = async (payload: CreditFeatureConfigPayload) => {
  const { data } = await http.post<ApiResponse<CreditFeatureConfigItem>>('/api/credits/features', payload)
  return data.data
}

export const pageCreditAccounts = async (query: CreditAccountQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<CreditAccountItem>>>('/api/credits/accounts', {
    params: cleanParams(query)
  })
  return data.data
}

export const adjustCreditAccount = async (userId: number, payload: CreditAdjustmentPayload) => {
  const { data } = await http.post<ApiResponse<CreditAccountItem>>(`/api/credits/accounts/${userId}/adjust`, payload)
  return data.data
}

export const backfillCreditAccounts = async () => {
  const { data } = await http.post<ApiResponse<CreditAccountBackfillResult>>('/api/credits/accounts/backfill')
  return data.data
}

export const pageCreditAccountTransactions = async (userId: number, page: number, size: number) => {
  const { data } = await http.get<ApiResponse<PageResponse<CreditTransactionItem>>>(`/api/credits/accounts/${userId}/transactions`, {
    params: { page, size }
  })
  return data.data
}
