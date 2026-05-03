import { http } from './http'
import type {
  ApiResponse,
  ExecutionTaskItem,
  GitlabAutoMergeConfigItem,
  GitlabAutoMergeLogItem,
  GitlabAutoMergeRunResult,
  GitlabBranchItem,
  GitlabCreateMergeRequestResultItem,
  GitlabMergeRequestItem,
  GitlabProductBranchItem,
  GitlabProductBranchSyncLogItem,
  GitlabProductBranchSyncRunResult,
  GitlabCodeStructureQueryRequest,
  GitlabCodeStructureQueryResultItem,
  GitlabCodeStructureRefreshAcceptedResultItem,
  GitlabCodeStructureSnapshotItem,
  GitlabGitnexusLaunchRequestItem,
  GitlabGitnexusLaunchResultItem,
  GitlabTagCreateResultItem,
  GitlabUserOauthBindingItem,
  PageResponse,
  ProjectGitlabBindingItem,
  RepositoryScanRulesetItem
} from '@/types/platform'

export interface GitlabBindingPayload {
  projectId: number
  apiBaseUrl: string
  gitlabProjectRef: string
  defaultTargetBranch: string
  productMainBranch: string
  apiToken: string
  enabled: boolean
  testProfileJson?: string
}

export interface GitlabBindingQuery {
  page: number
  size: number
  keyword?: string
  projectId?: number
}

export interface GitlabAutoMergePayload {
  name: string
  executionMode: 'PROJECT_BOUND' | 'STANDALONE'
  description: string
  bindingId: number | null
  apiBaseUrl: string
  gitlabProjectRef: string
  apiToken: string
  sourceBranch: string
  targetBranch: string
  titleKeyword: string
  enabled: boolean
  autoMerge: boolean
  squashOnMerge: boolean
  removeSourceBranch: boolean
  triggerPipelineAfterMerge: boolean
  requirePipelineSuccess: boolean
  schedulerEnabled: boolean
  schedulerCron: string
  reviewAgentId: number | null
  aiModelConfigId?: number | null
  aiReviewEnabled: boolean
  aiReviewPrompt: string
}

export interface GitlabAutoMergeQuery {
  page: number
  size: number
  keyword?: string
  executionMode?: 'PROJECT_BOUND' | 'STANDALONE'
  enabled?: boolean
}

export interface GitlabAutoMergeLogQuery {
  page: number
  size: number
  configId?: number
  result?: string
  triggerType?: 'MANUAL' | 'SCHEDULED'
}

/**
 * 创建 GitLab Tag 的前端请求体。
 */
export interface GitlabTagPayload {
  tagName: string
  branchName: string
  message?: string
}

/**
 * 首页快速发起 MR 的前端请求体。
 */
export interface GitlabCreateMergeRequestPayload {
  sourceBranch: string
  targetBranch: string
  title: string
  description?: string
}

/**
 * 当前用户发起 GitLab OAuth 授权时提交的参数。
 */
export interface GitlabUserOauthAuthorizePayload {
  apiBaseUrl?: string
}

/**
 * GitLab OAuth 回调页转发到后端的授权码和 state。
 */
export interface GitlabUserOauthCallbackPayload {
  code: string
  state: string
}

export interface GitlabBindingScanTaskPayload {
  branch: string
  rulesetCode: string
  planAgentId?: number | null
}

export interface GitlabProductBranchPayload {
  lineCode: string
  lineName: string
  branchName: string
  enabled: boolean
}

export interface GitlabProductBranchSyncPayload {
  productBranchIds: number[]
}

export interface GitlabCodeStructureRefreshPayload {
  branch?: string
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const pageGitlabBindings = async (query: GitlabBindingQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ProjectGitlabBindingItem>>>('/api/gitlab/bindings', {
    params: cleanParams(query)
  })
  return data.data
}

export const listGitlabBindingOptions = async () => {
  const { data } = await http.get<ApiResponse<ProjectGitlabBindingItem[]>>('/api/gitlab/bindings/options')
  return data.data
}

export const listRepositoryScanRulesets = async () => {
  const { data } = await http.get<ApiResponse<RepositoryScanRulesetItem[]>>('/api/gitlab/scan-rulesets')
  return data.data
}

export const createGitlabBinding = async (payload: GitlabBindingPayload) => {
  const { data } = await http.post<ApiResponse<ProjectGitlabBindingItem>>('/api/gitlab/bindings', payload)
  return data.data
}

export const updateGitlabBinding = async (id: number, payload: GitlabBindingPayload) => {
  const { data } = await http.put<ApiResponse<ProjectGitlabBindingItem>>(`/api/gitlab/bindings/${id}`, payload)
  return data.data
}

export const deleteGitlabBinding = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/bindings/${id}`)
}

export const testGitlabBinding = async (id: number) => {
  const { data } = await http.post<ApiResponse<ProjectGitlabBindingItem>>(`/api/gitlab/bindings/${id}/test`)
  return data.data
}

export const createGitlabBindingScanTask = async (id: number, payload: GitlabBindingScanTaskPayload) => {
  const { data } = await http.post<ApiResponse<ExecutionTaskItem>>(`/api/gitlab/bindings/${id}/scan-tasks`, payload)
  return data.data
}

export const previewBindingMergeRequests = async (id: number, targetBranch?: string) => {
  const { data } = await http.get<ApiResponse<GitlabMergeRequestItem[]>>(`/api/gitlab/bindings/${id}/merge-requests`, {
    params: cleanParams({ targetBranch })
  })
  return data.data
}

export const listGitlabBranches = async (id: number, search?: string) => {
  const { data } = await http.get<ApiResponse<GitlabBranchItem[]>>(`/api/gitlab/bindings/${id}/branches`, {
    params: cleanParams({ search })
  })
  return data.data
}

export const getGitlabCodeStructure = async (id: number, branch?: string) => {
  const { data } = await http.get<ApiResponse<GitlabCodeStructureSnapshotItem>>(`/api/gitlab/bindings/${id}/code-structure`, {
    params: cleanParams({ branch, _ts: Date.now() })
  })
  return data.data
}

export const refreshGitlabCodeStructure = async (id: number, payload: GitlabCodeStructureRefreshPayload = {}) => {
  const { data } = await http.post<ApiResponse<GitlabCodeStructureRefreshAcceptedResultItem>>(`/api/gitlab/bindings/${id}/code-structure/refresh`, payload)
  return data.data
}

export const queryGitlabCodeStructure = async (id: number, payload: GitlabCodeStructureQueryRequest) => {
  const { data } = await http.post<ApiResponse<GitlabCodeStructureQueryResultItem>>(`/api/gitlab/bindings/${id}/code-structure/query`, payload)
  return data.data
}

export const launchGitlabBindingGitnexus = async (id: number, payload: GitlabGitnexusLaunchRequestItem = {}) => {
  const { data } = await http.post<ApiResponse<GitlabGitnexusLaunchResultItem>>(`/api/gitlab/bindings/${id}/gitnexus-launch`, payload)
  return data.data
}

export const createGitlabTag = async (id: number, payload: GitlabTagPayload) => {
  const { data } = await http.post<ApiResponse<GitlabTagCreateResultItem>>(`/api/gitlab/bindings/${id}/tags`, payload)
  return data.data
}

export const createGitlabMergeRequest = async (id: number, payload: GitlabCreateMergeRequestPayload) => {
  const { data } = await http.post<ApiResponse<GitlabCreateMergeRequestResultItem>>(`/api/gitlab/bindings/${id}/merge-requests`, payload)
  return data.data
}

export const listGitlabProductBranches = async (id: number) => {
  const { data } = await http.get<ApiResponse<GitlabProductBranchItem[]>>(`/api/gitlab/bindings/${id}/product-branches`)
  return data.data
}

export const createGitlabProductBranch = async (id: number, payload: GitlabProductBranchPayload) => {
  const { data } = await http.post<ApiResponse<GitlabProductBranchItem>>(`/api/gitlab/bindings/${id}/product-branches`, payload)
  return data.data
}

export const updateGitlabProductBranch = async (id: number, branchId: number, payload: GitlabProductBranchPayload) => {
  const { data } = await http.put<ApiResponse<GitlabProductBranchItem>>(`/api/gitlab/bindings/${id}/product-branches/${branchId}`, payload)
  return data.data
}

export const deleteGitlabProductBranch = async (id: number, branchId: number) => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/bindings/${id}/product-branches/${branchId}`)
}

export const listGitlabProductBranchSyncLogs = async (id: number) => {
  const { data } = await http.get<ApiResponse<GitlabProductBranchSyncLogItem[]>>(`/api/gitlab/bindings/${id}/product-branches/sync-logs`)
  return data.data
}

export const createGitlabProductBranchSyncMergeRequests = async (id: number, payload: GitlabProductBranchSyncPayload) => {
  const { data } = await http.post<ApiResponse<GitlabProductBranchSyncRunResult>>(`/api/gitlab/bindings/${id}/product-branches/sync-merge-requests`, payload)
  return data.data
}

export const getCurrentUserGitlabOauthBinding = async () => {
  const { data } = await http.get<ApiResponse<GitlabUserOauthBindingItem>>('/api/gitlab/user-oauth-binding')
  return data.data
}

export const createCurrentUserGitlabOauthAuthorizeUrl = async (payload: GitlabUserOauthAuthorizePayload = {}) => {
  const { data } = await http.post<ApiResponse<{ authorizeUrl: string }>>('/api/gitlab/user-oauth-binding/authorize', payload)
  return data.data
}

export const handleCurrentUserGitlabOauthCallback = async (payload: GitlabUserOauthCallbackPayload) => {
  const { data } = await http.post<ApiResponse<GitlabUserOauthBindingItem>>('/api/gitlab/user-oauth-binding/callback', payload)
  return data.data
}

export const deleteCurrentUserGitlabOauthBinding = async () => {
  await http.delete<ApiResponse<null>>('/api/gitlab/user-oauth-binding')
}

export const pageGitlabAutoMergeConfigs = async (query: GitlabAutoMergeQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<GitlabAutoMergeConfigItem>>>('/api/gitlab/auto-merge-configs', {
    params: cleanParams(query)
  })
  return data.data
}

export const createGitlabAutoMergeConfig = async (payload: GitlabAutoMergePayload) => {
  const { data } = await http.post<ApiResponse<GitlabAutoMergeConfigItem>>('/api/gitlab/auto-merge-configs', payload)
  return data.data
}

export const pageGitlabAutoMergeLogs = async (query: GitlabAutoMergeLogQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<GitlabAutoMergeLogItem>>>('/api/gitlab/auto-merge-logs', {
    params: cleanParams(query)
  })
  return data.data
}

export const updateGitlabAutoMergeConfig = async (id: number, payload: GitlabAutoMergePayload) => {
  const { data } = await http.put<ApiResponse<GitlabAutoMergeConfigItem>>(`/api/gitlab/auto-merge-configs/${id}`, payload)
  return data.data
}

export const deleteGitlabAutoMergeConfig = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/auto-merge-configs/${id}`)
}

export const testGitlabAutoMergeConfig = async (id: number) => {
  const { data } = await http.post<ApiResponse<GitlabAutoMergeConfigItem>>(`/api/gitlab/auto-merge-configs/${id}/test`)
  return data.data
}

export const previewAutoMergeConfigMergeRequests = async (id: number) => {
  const { data } = await http.get<ApiResponse<GitlabMergeRequestItem[]>>(`/api/gitlab/auto-merge-configs/${id}/merge-requests`)
  return data.data
}

export const runAutoMergeConfig = async (id: number) => {
  const { data } = await http.post<ApiResponse<GitlabAutoMergeRunResult>>(`/api/gitlab/auto-merge-configs/${id}/run`)
  return data.data
}
