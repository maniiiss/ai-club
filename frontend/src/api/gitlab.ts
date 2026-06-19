import { http } from './http'
import axios from 'axios'
import { getResolvedApiBaseUrl } from './http'
import type {
  ApiResponse,
  ExecutionTaskItem,
  GitlabAutoMergeConfigItem,
  GitlabAutoMergeLogItem,
  GitlabAutoMergeRunResult,
  GitlabAutoMergeWebhookItem,
  GitlabApiSyncRequestItem,
  GitlabApiSyncResultItem,
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
  GitlabUserItem,
  GitlabUserOauthBindingItem,
  PageResponse,
  ProjectGitlabBindingItem,
  RepositoryScanRulesetItem
} from '@/types/platform'

const publicHttp = axios.create({
  baseURL: getResolvedApiBaseUrl(),
  timeout: 60000
})

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
  reviewStrictness: 'HIGH' | 'MEDIUM' | 'LOW'
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

export const listGitlabUsers = async (keyword?: string) => {
  const { data } = await http.get<ApiResponse<GitlabUserItem[]>>('/api/gitlab/users', {
    params: keyword?.trim() ? { keyword: keyword.trim() } : undefined
  })
  return data.data
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

export const syncGitlabBindingApi = async (id: number, payload: GitlabApiSyncRequestItem = {}) => {
  const { data } = await http.post<ApiResponse<GitlabApiSyncResultItem>>(`/api/gitlab/bindings/${id}/api-sync`, payload)
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

export interface GitlabAutoMergeProjectSharePayload {
  permanent: boolean
  expiresInDays?: number | null
}

export interface GitlabAutoMergeProjectShareItem {
  projectId: number
  projectName: string
  enabled: boolean
  expiresAt: string | null
  shareUrl: string | null
}

export interface GitlabAutoMergePublicLogPageItem {
  projectId: number
  projectName: string
  nextMergeAt: string | null
  logs: PageResponse<GitlabAutoMergeLogItem>
}

export const getProjectAutoMergeShare = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<GitlabAutoMergeProjectShareItem>>(`/api/gitlab/projects/${projectId}/auto-merge-share`)
  return data.data
}

export const createOrRefreshProjectAutoMergeShare = async (projectId: number, payload: GitlabAutoMergeProjectSharePayload) => {
  const { data } = await http.post<ApiResponse<GitlabAutoMergeProjectShareItem>>(`/api/gitlab/projects/${projectId}/auto-merge-share`, payload)
  return data.data
}

export const disableProjectAutoMergeShare = async (projectId: number) => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/projects/${projectId}/auto-merge-share`)
}

export const pageProjectAutoMergeLogsByShare = async (
  projectId: number,
  token: string,
  query: { page: number; size: number; result?: string }
) => {
  const { data } = await publicHttp.get<ApiResponse<GitlabAutoMergePublicLogPageItem>>(`/api/gitlab/public/projects/${projectId}/auto-merge-logs/${token}`, {
    params: cleanParams(query)
  })
  return data.data
}

/**
 * 项目只读分享：暴露给公开页的流水线摘要（Woodpecker / Jenkins 合并）。
 *
 * 字段严格脱敏，不携带触发者邮箱、提交信息、控制台日志等内容。
 */
export interface ProjectPublicPipelineItem {
  id: number
  kind: 'WOODPECKER' | 'JENKINS'
  name: string
  defaultBranch: string | null
  lastStatus: string | null
  lastTriggeredAt: string | null
  lastUrl: string | null
}

/** 单次流水线运行摘要，仅含 6 个非敏感字段。 */
export interface ProjectPublicPipelineRunItem {
  runNumber: number | null
  status: string | null
  branch: string | null
  event: string | null
  triggeredAt: string | null
  runUrl: string | null
}

/** 流水线运行历史分页结果；warning 用于在 Jenkins 远端不可达时提示用户。 */
export interface ProjectPublicPipelineRunPageItem {
  projectId: number
  projectName: string
  pipelineKind: 'WOODPECKER' | 'JENKINS'
  pipelineId: number
  pipelineName: string
  runs: PageResponse<ProjectPublicPipelineRunItem>
  warning: string | null
}

/** 公开页：列出该项目下绑定的所有流水线（脱敏摘要）。 */
export const listPublicPipelinesByShare = async (projectId: number, token: string) => {
  const { data } = await publicHttp.get<ApiResponse<ProjectPublicPipelineItem[]>>(
    `/api/gitlab/public/projects/${projectId}/pipelines/${token}`
  )
  return data.data
}

/** 公开页：分页拉取某条流水线的运行历史摘要。 */
export const pagePublicPipelineRunsByShare = async (
  projectId: number,
  token: string,
  query: { kind: 'WOODPECKER' | 'JENKINS'; pipelineId: number; page: number; size: number }
) => {
  const { data } = await publicHttp.get<ApiResponse<ProjectPublicPipelineRunPageItem>>(
    `/api/gitlab/public/projects/${projectId}/pipelines/${token}/runs`,
    { params: cleanParams(query) }
  )
  return data.data
}

/**
 * 自动合并外发 Webhook 的前端请求体。URL 由后端加密落库，此处仅在新建/更新时携带明文。
 */
export interface GitlabAutoMergeWebhookPayload {
  name: string
  targetUrl: string
  subscribedEvents: string[]
  messageTemplate?: string | null
  enabled: boolean
}

/** 列出指定自动合并配置下的全部外发 Webhook（URL 已脱敏）。 */
export const listAutoMergeWebhooks = async (configId: number) => {
  const { data } = await http.get<ApiResponse<GitlabAutoMergeWebhookItem[]>>(`/api/gitlab/auto-merge-configs/${configId}/webhooks`)
  return data.data
}

/** 为指定自动合并配置新增一条外发 Webhook。 */
export const createAutoMergeWebhook = async (configId: number, payload: GitlabAutoMergeWebhookPayload) => {
  const { data } = await http.post<ApiResponse<GitlabAutoMergeWebhookItem>>(`/api/gitlab/auto-merge-configs/${configId}/webhooks`, payload)
  return data.data
}

/** 更新指定外发 Webhook。 */
export const updateAutoMergeWebhook = async (webhookId: number, payload: GitlabAutoMergeWebhookPayload) => {
  const { data } = await http.put<ApiResponse<GitlabAutoMergeWebhookItem>>(`/api/gitlab/auto-merge-webhooks/${webhookId}`, payload)
  return data.data
}

/** 删除指定外发 Webhook。 */
export const deleteAutoMergeWebhook = async (webhookId: number) => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/auto-merge-webhooks/${webhookId}`)
}

/** 触发一次测试投递，返回最新一次投递状态。 */
export const testAutoMergeWebhook = async (webhookId: number) => {
  const { data } = await http.post<ApiResponse<GitlabAutoMergeWebhookItem>>(`/api/gitlab/auto-merge-webhooks/${webhookId}/test`)
  return data.data
}
