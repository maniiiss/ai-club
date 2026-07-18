import { http } from './http'
import type { ApiResponse, CreditAccountBackfillResult, CreditAccountItem, CreditFeatureConfigItem, CreditGlobalConfigItem, CreditTransactionItem, DashboardShortcutEntryItem, DataChangeAuditItem, DataChangeDsl, DataChangePreviewResult, DataChangeRequestItem, DataPermissionScopeValue, DataWorkbenchDataSourceItem, DataWorkbenchEntityItem, DataWorkbenchEntityParseResult, DataWorkbenchSemanticModelItem, PageResponse, PermissionItem, PlatformEnvVarDetailItem, PlatformEnvVarItem, PlatformToolItem, RepositoryScanRulesetItem, RoleItem, UserItem, UserOptionItem, UserPosition } from '@/types/platform'

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
  /** 管理端可保存为空，兼容存量账号尚未设置定位的状态。 */
  userPosition?: UserPosition | null
  password?: string
}

export interface UserQuery {
  page: number
  size: number
  keyword?: string
  enabled?: boolean | ''
  roleId?: number
  userPosition?: UserPosition
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

export interface DataWorkbenchEntityPayload {
  entityCode: string
  entityName: string
  description: string
  tableName: string
  primaryKeyColumn: string
  /** 归属的平台项目 ID，替代 v1 的动态 project_id 列。 */
  platformProjectId: number | null
  maxAffectedRows: number
  requestScope: DataPermissionScopeValue
  executeScope: DataPermissionScopeValue
  rollbackScope: DataPermissionScopeValue
  enabled: boolean
  fields: Array<{
    id?: number | null
    fieldCode: string
    fieldName: string
    columnName: string
    dataType: string
    synonyms: string
    updatable: boolean
    locator: boolean
    sensitive: boolean
    enabled: boolean
    sortOrder: number
  }>
}

export interface DataChangeQuery {
  page: number
  size: number
  projectId?: number
  approvalStatus?: string
  executionStatus?: string
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

export const pageDataChangeRequests = async (query: DataChangeQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<DataChangeRequestItem>>>('/api/data-workbench/data-change/requests', {
    params: cleanParams(query)
  })
  return data.data
}

export const approveDataChangeRequest = async (id: number) => {
  const { data } = await http.post<ApiResponse<DataChangeRequestItem>>(`/api/data-workbench/data-change/requests/${id}/approve`)
  return data.data
}

export const rejectDataChangeRequest = async (id: number, reason: string) => {
  const { data } = await http.post<ApiResponse<DataChangeRequestItem>>(`/api/data-workbench/data-change/requests/${id}/reject`, { reason })
  return data.data
}

export const executeDataChangeRequest = async (id: number) => {
  const { data } = await http.post<ApiResponse<DataChangeRequestItem>>(`/api/data-workbench/data-change/requests/${id}/execute`)
  return data.data
}

export const rollbackDataChangeRequest = async (id: number) => {
  const { data } = await http.post<ApiResponse<DataChangeRequestItem>>(`/api/data-workbench/data-change/requests/${id}/rollback`)
  return data.data
}

export const listDataChangeAudits = async (id: number) => {
  const { data } = await http.get<ApiResponse<DataChangeAuditItem[]>>(`/api/data-workbench/data-change/requests/${id}/audits`)
  return data.data
}

export const parseDataChangeDsl = async (projectId: number, payload: { text: string; entityCode?: string; dsl?: Record<string, unknown> }) => {
  const { data } = await http.post<ApiResponse<DataChangeDsl>>(`/api/data-workbench/projects/${projectId}/data-change/parse`, payload)
  return data.data
}

export const previewDataChange = async (projectId: number, payload: { text: string; entityCode?: string; dsl?: Record<string, unknown> }) => {
  const { data } = await http.post<ApiResponse<DataChangePreviewResult>>(`/api/data-workbench/projects/${projectId}/data-change/preview`, payload)
  return data.data
}

export const submitDataChangeRequest = async (projectId: number, payload: { text: string; entityCode?: string; dsl?: Record<string, unknown> }) => {
  const { data } = await http.post<ApiResponse<DataChangeRequestItem>>(`/api/data-workbench/projects/${projectId}/data-change/requests`, payload)
  return data.data
}

export const pageProjectDataChangeRequests = async (projectId: number, page: number, size: number) => {
  const { data } = await http.get<ApiResponse<PageResponse<DataChangeRequestItem>>>(`/api/data-workbench/projects/${projectId}/data-change/requests`, {
    params: { page, size }
  })
  return data.data
}

export const listDataWorkbenchEntities = async (includeDisabled = true, platformProjectId?: number) => {
  const { data } = await http.get<ApiResponse<DataWorkbenchEntityItem[]>>('/api/data-workbench/config/entities', {
    params: cleanParams({ includeDisabled, platformProjectId })
  })
  return data.data
}

export const createDataWorkbenchEntity = async (payload: DataWorkbenchEntityPayload) => {
  const { data } = await http.post<ApiResponse<DataWorkbenchEntityItem>>('/api/data-workbench/config/entities', payload)
  return data.data
}

export const updateDataWorkbenchEntity = async (id: number, payload: DataWorkbenchEntityPayload) => {
  const { data } = await http.put<ApiResponse<DataWorkbenchEntityItem>>(`/api/data-workbench/config/entities/${id}`, payload)
  return data.data
}

export const deleteDataWorkbenchEntity = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/data-workbench/config/entities/${id}`)
}

/**
 * 从 DDL / Java 实体类源码解析出实体草稿，用于在“新增实体”弹窗中一键回填表单。
 * 只读操作，后端不落库；实际保存仍走 create/update。
 */
export const parseDataWorkbenchEntityDraft = async (payload: { sourceType: 'DDL' | 'JAVA'; content: string }) => {
  const { data } = await http.post<ApiResponse<DataWorkbenchEntityParseResult>>('/api/data-workbench/config/entities/parse', payload)
  return data.data
}

export const listDataWorkbenchDataSources = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<DataWorkbenchDataSourceItem[]>>(`/api/data-workbench/projects/${projectId}/data-sources`)
  return data.data
}
export const createDataWorkbenchDataSource = async (projectId: number, payload: { name: string; jdbcUrl: string; username: string; password: string; allowedSchemas: string; enabled: boolean }) => {
  const { data } = await http.post<ApiResponse<DataWorkbenchDataSourceItem>>(`/api/data-workbench/projects/${projectId}/data-sources`, payload)
  return data.data
}
export const scanDataWorkbenchDataSource = async (projectId: number, id: number) => {
  const { data } = await http.post<ApiResponse<DataWorkbenchDataSourceItem>>(`/api/data-workbench/projects/${projectId}/data-sources/${id}/scan`)
  return data.data
}
export const pageDataWorkbenchSourceSchema = async (projectId: number, id: number, query: { page: number; size: number; keyword?: string }) => {
  const { data } = await http.get<ApiResponse<PageResponse<{ schema: string; table: string; columns: string[] }>>>(`/api/data-workbench/projects/${projectId}/data-sources/${id}/schema`, { params: cleanParams(query) })
  return data.data
}
export const listDataWorkbenchSemanticModels = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<DataWorkbenchSemanticModelItem[]>>(`/api/data-workbench/projects/${projectId}/semantic-models`)
  return data.data
}
export const createDataWorkbenchSemanticModel = async (projectId: number, payload: { dataSourceId: number; name: string; definitionJson: string; modelConfigId?: number | null }) => {
  const { data } = await http.post<ApiResponse<DataWorkbenchSemanticModelItem>>(`/api/data-workbench/projects/${projectId}/semantic-models`, payload)
  return data.data
}
export const updateDataWorkbenchSemanticModel = async (projectId: number, id: number, payload: { dataSourceId: number; name: string; definitionJson: string; modelConfigId?: number | null }) => {
  const { data } = await http.put<ApiResponse<DataWorkbenchSemanticModelItem>>(`/api/data-workbench/projects/${projectId}/semantic-models/${id}`, payload)
  return data.data
}
export const publishDataWorkbenchSemanticModel = async (projectId: number, id: number) => {
  const { data } = await http.post<ApiResponse<DataWorkbenchSemanticModelItem>>(`/api/data-workbench/projects/${projectId}/semantic-models/${id}/publish`)
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
