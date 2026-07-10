/**
 * 研发模块 API。
 * 与后端 /api/gitlab/* 接口对齐，面向项目维度的仓库绑定、分支、合并请求、代码结构、扫描、自动合并和 Webhook。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  AgentOptionItem,
  GitlabAutoMergeConfigItem,
  GitlabAutoMergeConfigPayload,
  GitlabAutoMergeLogItem,
  GitlabAutoMergeRunResult,
  GitlabAutoMergeWebhookItem,
  GitlabAutoMergeWebhookPayload,
  GitlabBranchItem,
  GitlabCodeStructureQueryPayload,
  GitlabCodeStructureQueryResultItem,
  GitlabCodeStructureRefreshAcceptedResultItem,
  GitlabCodeStructureSnapshotItem,
  GitlabGitnexusLaunchResultItem,
  GitlabCreateMergeRequestPayload,
  GitlabCreateMergeRequestResultItem,
  GitlabMergeRequestItem,
  GitlabProductBranchItem,
  GitlabProductBranchPayload,
  GitlabProductBranchSyncLogItem,
  GitlabProductBranchSyncPayload,
  GitlabProductBranchSyncRunResult,
  GitlabTagCreateResultItem,
  GitlabTagPayload,
  GitlabUserOauthBindingItem,
  OwnerRepoBindingItem,
  OwnerRepoPushContextItem,
  OwnerRepoPushLogItem,
  OwnerRepoPushPayload,
  OwnerRepoPushResultItem,
  ProjectGitlabBindingItem,
  RepositoryScanRulesetItem,
} from '@/src/types/development'

/** 分页查询 GitLab 绑定列表。 */
export const pageGitlabBindings = async (query: {
  page: number
  size: number
  keyword?: string
  projectId?: number
}): Promise<PageResponse<ProjectGitlabBindingItem>> => {
  const res = await http.get<ApiResponse<PageResponse<ProjectGitlabBindingItem>>>('/api/gitlab/bindings', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 列出 GitLab 绑定选项（轻量列表）。 */
export const listGitlabBindingOptions = async (): Promise<ProjectGitlabBindingItem[]> => {
  const res = await http.get<ApiResponse<ProjectGitlabBindingItem[]>>('/api/gitlab/bindings/options')
  return unwrap(res)
}

/** 获取指定绑定的分支列表。 */
export const listGitlabBranches = async (
  bindingId: number,
  search?: string,
): Promise<GitlabBranchItem[]> => {
  const res = await http.get<ApiResponse<GitlabBranchItem[]>>(
    `/api/gitlab/bindings/${bindingId}/branches`,
    { params: cleanParams({ search }) },
  )
  return unwrap(res)
}

/** 获取指定绑定的合并请求列表。 */
export const previewBindingMergeRequests = async (
  bindingId: number,
  targetBranch?: string,
): Promise<GitlabMergeRequestItem[]> => {
  const res = await http.get<ApiResponse<GitlabMergeRequestItem[]>>(
    `/api/gitlab/bindings/${bindingId}/merge-requests`,
    { params: cleanParams({ targetBranch }) },
  )
  return unwrap(res)
}

/** 在指定 GitLab 绑定中创建 Tag。 */
export const createGitlabTag = async (
  bindingId: number,
  payload: GitlabTagPayload,
): Promise<GitlabTagCreateResultItem> => {
  const res = await http.post<ApiResponse<GitlabTagCreateResultItem>>(
    `/api/gitlab/bindings/${bindingId}/tags`,
    payload,
  )
  return unwrap(res)
}

/* ── 产品分支管理 ── */

/** 获取指定绑定的产品分支列表。 */
export const listGitlabProductBranches = async (
  bindingId: number,
): Promise<GitlabProductBranchItem[]> => {
  const res = await http.get<ApiResponse<GitlabProductBranchItem[]>>(
    `/api/gitlab/bindings/${bindingId}/product-branches`,
  )
  return unwrap(res)
}

/** 创建产品分支。 */
export const createGitlabProductBranch = async (
  bindingId: number,
  payload: GitlabProductBranchPayload,
): Promise<GitlabProductBranchItem> => {
  const res = await http.post<ApiResponse<GitlabProductBranchItem>>(
    `/api/gitlab/bindings/${bindingId}/product-branches`,
    payload,
  )
  return unwrap(res)
}

/** 更新产品分支。 */
export const updateGitlabProductBranch = async (
  bindingId: number,
  productBranchId: number,
  payload: GitlabProductBranchPayload,
): Promise<GitlabProductBranchItem> => {
  const res = await http.put<ApiResponse<GitlabProductBranchItem>>(
    `/api/gitlab/bindings/${bindingId}/product-branches/${productBranchId}`,
    payload,
  )
  return unwrap(res)
}

/** 删除产品分支。 */
export const deleteGitlabProductBranch = async (
  bindingId: number,
  productBranchId: number,
): Promise<void> => {
  await http.delete<ApiResponse<null>>(
    `/api/gitlab/bindings/${bindingId}/product-branches/${productBranchId}`,
  )
}

/** 获取产品分支同步日志。 */
export const listGitlabProductBranchSyncLogs = async (
  bindingId: number,
): Promise<GitlabProductBranchSyncLogItem[]> => {
  const res = await http.get<ApiResponse<GitlabProductBranchSyncLogItem[]>>(
    `/api/gitlab/bindings/${bindingId}/product-branches/sync-logs`,
  )
  return unwrap(res)
}

/** 为所选产品分支创建主线同步 MR。 */
export const createGitlabProductBranchSyncMergeRequests = async (
  bindingId: number,
  payload: GitlabProductBranchSyncPayload,
): Promise<GitlabProductBranchSyncRunResult> => {
  const res = await http.post<ApiResponse<GitlabProductBranchSyncRunResult>>(
    `/api/gitlab/bindings/${bindingId}/product-branches/sync-merge-requests`,
    payload,
  )
  return unwrap(res)
}

/** 获取代码结构快照。 */
export const getGitlabCodeStructure = async (
  bindingId: number,
  branch?: string,
): Promise<GitlabCodeStructureSnapshotItem> => {
  const res = await http.get<ApiResponse<GitlabCodeStructureSnapshotItem>>(
    `/api/gitlab/bindings/${bindingId}/code-structure`,
    { params: cleanParams({ branch, _ts: Date.now() }) },
  )
  return unwrap(res)
}

/** 后台刷新代码结构快照。 */
export const refreshGitlabCodeStructure = async (
  bindingId: number,
  payload: { branch?: string } = {},
): Promise<GitlabCodeStructureRefreshAcceptedResultItem> => {
  const res = await http.post<ApiResponse<GitlabCodeStructureRefreshAcceptedResultItem>>(
    `/api/gitlab/bindings/${bindingId}/code-structure/refresh`,
    payload,
  )
  return unwrap(res)
}

/** 基于已缓存 GitNexus 索引执行局部查询。 */
export const queryGitlabCodeStructure = async (
  bindingId: number,
  payload: GitlabCodeStructureQueryPayload,
): Promise<GitlabCodeStructureQueryResultItem> => {
  const res = await http.post<ApiResponse<GitlabCodeStructureQueryResultItem>>(
    `/api/gitlab/bindings/${bindingId}/code-structure/query`,
    payload,
  )
  return unwrap(res)
}

/** 准备并打开 GitNexus 全仓图。 */
export const launchGitlabBindingGitnexus = async (
  bindingId: number,
  payload: { branch?: string } = {},
): Promise<GitlabGitnexusLaunchResultItem> => {
  const res = await http.post<ApiResponse<GitlabGitnexusLaunchResultItem>>(
    `/api/gitlab/bindings/${bindingId}/gitnexus-launch`,
    payload,
  )
  return unwrap(res)
}

/* ── 质量扫描 ── */

/** 列出扫描规则集。 */
export const listRepositoryScanRulesets = async (): Promise<RepositoryScanRulesetItem[]> => {
  const res = await http.get<ApiResponse<RepositoryScanRulesetItem[]>>('/api/gitlab/scan-rulesets')
  return unwrap(res)
}

/** 触发仓库扫描任务。 */
export const createGitlabBindingScanTask = async (
  bindingId: number,
  payload: { branch: string; rulesetCode: string; planAgentId?: number | null },
): Promise<{ id: number }> => {
  const res = await http.post<ApiResponse<{ id: number }>>(
    `/api/gitlab/bindings/${bindingId}/scan-tasks`,
    payload,
  )
  return unwrap(res)
}

/* ── 自动合并日志 ── */

/** 分页查询自动合并日志。 */
export const pageGitlabAutoMergeLogs = async (query: {
  page: number
  size: number
  configId?: number
  result?: string
  triggerType?: 'MANUAL' | 'SCHEDULED'
}): Promise<PageResponse<GitlabAutoMergeLogItem>> => {
  const res = await http.get<ApiResponse<PageResponse<GitlabAutoMergeLogItem>>>(
    '/api/gitlab/auto-merge-logs',
    { params: cleanParams(query) },
  )
  return unwrap(res)
}

/* ── 自动合并策略 CRUD ── */

/** 分页查询自动合并策略列表。 */
export const pageGitlabAutoMergeConfigs = async (query: {
  page: number
  size: number
  keyword?: string
  executionMode?: 'PROJECT_BOUND' | 'STANDALONE'
  enabled?: boolean
}): Promise<PageResponse<GitlabAutoMergeConfigItem>> => {
  const res = await http.get<ApiResponse<PageResponse<GitlabAutoMergeConfigItem>>>(
    '/api/gitlab/auto-merge-configs',
    { params: cleanParams(query) },
  )
  return unwrap(res)
}

/** 创建自动合并策略。 */
export const createGitlabAutoMergeConfig = async (
  payload: GitlabAutoMergeConfigPayload,
): Promise<GitlabAutoMergeConfigItem> => {
  const res = await http.post<ApiResponse<GitlabAutoMergeConfigItem>>(
    '/api/gitlab/auto-merge-configs',
    payload,
  )
  return unwrap(res)
}

/** 更新自动合并策略。 */
export const updateGitlabAutoMergeConfig = async (
  id: number,
  payload: GitlabAutoMergeConfigPayload,
): Promise<GitlabAutoMergeConfigItem> => {
  const res = await http.put<ApiResponse<GitlabAutoMergeConfigItem>>(
    `/api/gitlab/auto-merge-configs/${id}`,
    payload,
  )
  return unwrap(res)
}

/** 删除自动合并策略。 */
export const deleteGitlabAutoMergeConfig = async (id: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/auto-merge-configs/${id}`)
}

/** 测试自动合并策略连通性。 */
export const testGitlabAutoMergeConfig = async (
  id: number,
): Promise<GitlabAutoMergeConfigItem> => {
  const res = await http.post<ApiResponse<GitlabAutoMergeConfigItem>>(
    `/api/gitlab/auto-merge-configs/${id}/test`,
  )
  return unwrap(res)
}

/** 预览自动合并策略匹配的合并请求。 */
export const previewAutoMergeConfigMergeRequests = async (
  id: number,
): Promise<GitlabMergeRequestItem[]> => {
  const res = await http.get<ApiResponse<GitlabMergeRequestItem[]>>(
    `/api/gitlab/auto-merge-configs/${id}/merge-requests`,
  )
  return unwrap(res)
}

/** 立即执行自动合并策略。 */
export const runAutoMergeConfig = async (
  id: number,
): Promise<GitlabAutoMergeRunResult> => {
  const res = await http.post<ApiResponse<GitlabAutoMergeRunResult>>(
    `/api/gitlab/auto-merge-configs/${id}/run`,
  )
  return unwrap(res)
}

/* ── Webhook 管理 ── */

/** 列出指定自动合并配置下的全部 Webhook。 */
export const listAutoMergeWebhooks = async (
  configId: number,
): Promise<GitlabAutoMergeWebhookItem[]> => {
  const res = await http.get<ApiResponse<GitlabAutoMergeWebhookItem[]>>(
    `/api/gitlab/auto-merge-configs/${configId}/webhooks`,
  )
  return unwrap(res)
}

/** 创建 Webhook。 */
export const createAutoMergeWebhook = async (
  configId: number,
  payload: GitlabAutoMergeWebhookPayload,
): Promise<GitlabAutoMergeWebhookItem> => {
  const res = await http.post<ApiResponse<GitlabAutoMergeWebhookItem>>(
    `/api/gitlab/auto-merge-configs/${configId}/webhooks`,
    payload,
  )
  return unwrap(res)
}

/** 更新 Webhook。 */
export const updateAutoMergeWebhook = async (
  webhookId: number,
  payload: GitlabAutoMergeWebhookPayload,
): Promise<GitlabAutoMergeWebhookItem> => {
  const res = await http.put<ApiResponse<GitlabAutoMergeWebhookItem>>(
    `/api/gitlab/auto-merge-webhooks/${webhookId}`,
    payload,
  )
  return unwrap(res)
}

/** 删除 Webhook。 */
export const deleteAutoMergeWebhook = async (webhookId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/auto-merge-webhooks/${webhookId}`)
}

/** 触发 Webhook 测试投递。 */
export const testAutoMergeWebhook = async (
  webhookId: number,
): Promise<GitlabAutoMergeWebhookItem> => {
  const res = await http.post<ApiResponse<GitlabAutoMergeWebhookItem>>(
    `/api/gitlab/auto-merge-webhooks/${webhookId}/test`,
  )
  return unwrap(res)
}

/* ── Agent 选项 ── */

/** 列出可用的 Agent 选项（轻量列表）。 */
export const listAgentOptions = async (
  projectId?: number,
): Promise<AgentOptionItem[]> => {
  const res = await http.get<ApiResponse<AgentOptionItem[]>>('/api/agents/options', {
    params: cleanParams({ projectId }),
  })
  return unwrap(res)
}

/* ── GitLab OAuth 与快速发起 MR ── */

/** 获取当前登录用户的 GitLab OAuth 绑定状态（用于判断能否以本人身份发起 MR）。 */
export const getCurrentUserGitlabOauthBinding = async (): Promise<GitlabUserOauthBindingItem> => {
  const res = await http.get<ApiResponse<GitlabUserOauthBindingItem>>('/api/gitlab/user-oauth-binding')
  return unwrap(res)
}

/** 在指定 GitLab 绑定中快速发起一条 Merge Request。 */
export const createGitlabMergeRequest = async (
  bindingId: number,
  payload: GitlabCreateMergeRequestPayload,
): Promise<GitlabCreateMergeRequestResultItem> => {
  const res = await http.post<ApiResponse<GitlabCreateMergeRequestResultItem>>(
    `/api/gitlab/bindings/${bindingId}/merge-requests`,
    payload,
  )
  return unwrap(res)
}

/* ── 仓库镜像推送（公众端只做推送与查看历史，配置在管理端完成） ── */

/** 查询指定项目下的全部仓库镜像绑定。 */
export const listOwnerRepoBindings = async (projectId: number): Promise<OwnerRepoBindingItem[]> => {
  const res = await http.get<ApiResponse<OwnerRepoBindingItem[]>>(`/api/gitlab/owner-repos/bindings/by-project/${projectId}`)
  return unwrap(res)
}

/** 获取仓库镜像推送前置上下文。 */
export const getOwnerRepoPushContext = async (bindingId: number): Promise<OwnerRepoPushContextItem> => {
  const res = await http.get<ApiResponse<OwnerRepoPushContextItem>>(`/api/gitlab/owner-repos/bindings/${bindingId}/push-context`)
  return unwrap(res)
}

/** 触发推送到仓库镜像（长任务，单独设置 10 分钟超时）。 */
export const pushToOwnerRepo = async (bindingId: number, payload: OwnerRepoPushPayload): Promise<OwnerRepoPushResultItem> => {
  const res = await http.post<ApiResponse<OwnerRepoPushResultItem>>(`/api/gitlab/owner-repos/bindings/${bindingId}/push`, payload, { timeout: 600000 })
  return unwrap(res)
}

/** 分页查询仓库镜像推送历史日志。 */
export const listOwnerRepoPushLogs = async (bindingId: number, page: number, size: number): Promise<PageResponse<OwnerRepoPushLogItem>> => {
  const res = await http.get<ApiResponse<PageResponse<OwnerRepoPushLogItem>>>(`/api/gitlab/owner-repos/bindings/${bindingId}/push-logs`, {
    params: cleanParams({ page, size }),
  })
  return unwrap(res)
}
