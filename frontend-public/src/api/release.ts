/**
 * 发布与观测模块 API。
 * 流水线中心 + AI Club 流水线 + Jenkins + 可观测性。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  AiClubPipelineConfigStatus,
  AiClubPipelineCallbackWebhook,
  AiClubPipelineCallbackWebhookPayload,
  AiClubPipelineCronItem,
  AiClubPipelineCronPayload,
  AiClubPipelineItem,
  AiClubPipelinePayload,
  AiClubPipelineRunItem,
  AiClubPipelineRunLogDetail,
  AiClubPipelineTriggerResult,
  AiClubPipelineTriggerWebhook,
  AiClubPipelineTriggerWebhookPayload,
  JenkinsBuildItem,
  JenkinsBuildLogDetail,
  JenkinsBuildTriggerResult,
  JenkinsJobItem,
  JenkinsServerItem,
  JenkinsServerPayload,
  ObservabilityHealthTimelinePointItem,
  ObservabilityProjectDetail,
  ObservabilityProjectHealthItem,
  ObservabilityProjectItem,
  ObservabilityProjectLogItem,
  PipelineBindingItem,
  PipelineBindingPayload,
  PipelineCenterEntryItem,
  RuntimeInstanceItem,
  RuntimeInstancePayload,
} from '@/src/types/release'

/* ── 流水线中心 ── */

/** 分页查询流水线中心条目。 */
export const pagePipelineCenterEntries = async (query: {
  page: number
  size: number
  keyword?: string
  projectId?: number
  enabled?: boolean
  entryType?: string
}): Promise<PageResponse<PipelineCenterEntryItem>> => {
  const res = await http.get<ApiResponse<PageResponse<PipelineCenterEntryItem>>>('/api/cicd/pipeline-center/entries', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/* ── AI Club 流水线 ── */

/** 分页查询 AI Club 流水线。 */
export const pageAiClubPipelines = async (query: {
  page: number
  size: number
  keyword?: string
  projectId?: number
  enabled?: boolean
}): Promise<PageResponse<AiClubPipelineItem>> => {
  const res = await http.get<ApiResponse<PageResponse<AiClubPipelineItem>>>('/api/cicd/pipelines', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 获取流水线运行历史。 */
export const listAiClubPipelineRuns = async (
  pipelineId: number,
  limit = 20,
): Promise<AiClubPipelineRunItem[]> => {
  const res = await http.get<ApiResponse<AiClubPipelineRunItem[]>>(
    `/api/cicd/pipelines/${pipelineId}/runs`,
    { params: cleanParams({ limit }) },
  )
  return unwrap(res)
}

/* ── Jenkins ── */

/** 获取 Jenkins 绑定构建历史。 */
export const listPipelineBuilds = async (
  bindingId: number,
  limit = 20,
): Promise<JenkinsBuildItem[]> => {
  const res = await http.get<ApiResponse<JenkinsBuildItem[]>>(
    `/api/cicd/pipeline-bindings/${bindingId}/builds`,
    { params: cleanParams({ limit }) },
  )
  return unwrap(res)
}

/* ── 可观测性 ── */

/** 分页查询可观测性项目。 */
export const pageObservabilityProjects = async (query: {
  page: number
  size: number
  keyword?: string
  healthLevel?: string
}): Promise<PageResponse<ObservabilityProjectItem>> => {
  const res = await http.get<ApiResponse<PageResponse<ObservabilityProjectItem>>>('/api/observability/projects', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 获取项目可观测性健康摘要。 */
export const getObservabilityProjectHealth = async (
  projectId: number,
): Promise<ObservabilityProjectHealthItem> => {
  const res = await http.get<ApiResponse<ObservabilityProjectHealthItem>>(
    `/api/observability/projects/${projectId}/health`,
  )
  return unwrap(res)
}

/** 分页查询项目日志。 */
export const pageObservabilityProjectLogs = async (
  projectId: number,
  query: {
    page: number
    size: number
    runtimeInstanceId?: number
    level?: string
    keyword?: string
    traceId?: string
    startTime?: string
    endTime?: string
  },
): Promise<PageResponse<ObservabilityProjectLogItem>> => {
  const res = await http.get<ApiResponse<PageResponse<ObservabilityProjectLogItem>>>(
    `/api/observability/projects/${projectId}/logs`,
    { params: cleanParams(query) },
  )
  return unwrap(res)
}

/** 获取健康趋势数据。 */
export const getObservabilityProjectHealthTimeline = async (
  projectId: number,
  limit = 50,
): Promise<ObservabilityHealthTimelinePointItem[]> => {
  const res = await http.get<ApiResponse<ObservabilityHealthTimelinePointItem[]>>(
    `/api/observability/projects/${projectId}/health/timeline`,
    { params: cleanParams({ limit }) },
  )
  return unwrap(res)
}

/* ── 项目公开分享 ── */

export interface ProjectShareItem {
  projectId: number
  projectName: string
  enabled: boolean
  expiresAt: string | null
  shareUrl: string | null
}

/** 获取项目分享状态。 */
export const getProjectShare = async (projectId: number): Promise<ProjectShareItem> => {
  const res = await http.get<ApiResponse<ProjectShareItem>>(`/api/gitlab/projects/${projectId}/auto-merge-share`)
  return unwrap(res)
}

/** 创建或刷新项目分享链接。 */
export const createOrRefreshProjectShare = async (
  projectId: number,
  payload: { permanent: boolean; expiresInDays?: number | null },
): Promise<ProjectShareItem> => {
  const res = await http.post<ApiResponse<ProjectShareItem>>(
    `/api/gitlab/projects/${projectId}/auto-merge-share`,
    payload,
  )
  return unwrap(res)
}

/** 禁用项目分享。 */
export const disableProjectShare = async (projectId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/gitlab/projects/${projectId}/auto-merge-share`)
}

/* ── 流水线触发 ── */

/** 触发 AI Club 流水线。 */
export const triggerAiClubPipeline = async (
  pipelineId: number,
): Promise<AiClubPipelineTriggerResult> => {
  const res = await http.post<ApiResponse<AiClubPipelineTriggerResult>>(
    `/api/cicd/pipelines/${pipelineId}/trigger`,
  )
  return unwrap(res)
}

/** 触发 Jenkins 流水线绑定构建。 */
export const triggerPipelineBuild = async (
  bindingId: number,
): Promise<JenkinsBuildTriggerResult> => {
  const res = await http.post<ApiResponse<JenkinsBuildTriggerResult>>(
    `/api/cicd/pipeline-bindings/${bindingId}/trigger`,
  )
  return unwrap(res)
}

/* ── AI Club 流水线增删改 ── */

/** 获取单个 AI Club 流水线详情。 */
export const getAiClubPipeline = async (pipelineId: number): Promise<AiClubPipelineItem> => {
  const res = await http.get<ApiResponse<AiClubPipelineItem>>(`/api/cicd/pipelines/${pipelineId}`)
  return unwrap(res)
}

/** 创建 AI Club 流水线。 */
export const createAiClubPipeline = async (
  payload: AiClubPipelinePayload,
): Promise<AiClubPipelineItem> => {
  const res = await http.post<ApiResponse<AiClubPipelineItem>>('/api/cicd/pipelines', payload)
  return unwrap(res)
}

/** 更新 AI Club 流水线。 */
export const updateAiClubPipeline = async (
  pipelineId: number,
  payload: AiClubPipelinePayload,
): Promise<AiClubPipelineItem> => {
  const res = await http.put<ApiResponse<AiClubPipelineItem>>(
    `/api/cicd/pipelines/${pipelineId}`,
    payload,
  )
  return unwrap(res)
}

/** 删除 AI Club 流水线。 */
export const deleteAiClubPipeline = async (pipelineId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/cicd/pipelines/${pipelineId}`)
}

/** 同步流水线 GitLab 仓库信息。 */
export const syncAiClubPipelineRepository = async (
  pipelineId: number,
): Promise<AiClubPipelineItem> => {
  const res = await http.post<ApiResponse<AiClubPipelineItem>>(
    `/api/cicd/pipelines/${pipelineId}/sync-repository`,
  )
  return unwrap(res)
}

/** 获取流水线运行日志详情。 */
export const getAiClubPipelineRunLog = async (
  pipelineId: number,
  runNumber: number,
): Promise<AiClubPipelineRunLogDetail> => {
  const res = await http.get<ApiResponse<AiClubPipelineRunLogDetail>>(
    `/api/cicd/pipelines/${pipelineId}/runs/${runNumber}/log`,
  )
  return unwrap(res)
}

/** 获取流水线配置状态。 */
export const getAiClubPipelineConfigStatus = async (
  pipelineId: number,
): Promise<AiClubPipelineConfigStatus> => {
  const res = await http.get<ApiResponse<AiClubPipelineConfigStatus>>(
    `/api/cicd/pipelines/${pipelineId}/config/status`,
  )
  return unwrap(res)
}

/* ── Cron 定时任务增删改查 ── */

/** 列出流水线 Cron 定时任务。 */
export const listAiClubPipelineCronJobs = async (
  pipelineId: number,
): Promise<AiClubPipelineCronItem[]> => {
  const res = await http.get<ApiResponse<AiClubPipelineCronItem[]>>(
    `/api/cicd/pipelines/${pipelineId}/cron-jobs`,
  )
  return unwrap(res)
}

/** 创建 Cron 定时任务。 */
export const createAiClubPipelineCronJob = async (
  pipelineId: number,
  payload: AiClubPipelineCronPayload,
): Promise<AiClubPipelineCronItem> => {
  const res = await http.post<ApiResponse<AiClubPipelineCronItem>>(
    `/api/cicd/pipelines/${pipelineId}/cron-jobs`,
    payload,
  )
  return unwrap(res)
}

/** 更新 Cron 定时任务。 */
export const updateAiClubPipelineCronJob = async (
  pipelineId: number,
  cronJobId: number,
  payload: AiClubPipelineCronPayload,
): Promise<AiClubPipelineCronItem> => {
  const res = await http.put<ApiResponse<AiClubPipelineCronItem>>(
    `/api/cicd/pipelines/${pipelineId}/cron-jobs/${cronJobId}`,
    payload,
  )
  return unwrap(res)
}

/** 删除 Cron 定时任务。 */
export const deleteAiClubPipelineCronJob = async (
  pipelineId: number,
  cronJobId: number,
): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/cicd/pipelines/${pipelineId}/cron-jobs/${cronJobId}`)
}

/* ── Webhook 配置 ── */

/** 获取触发 Webhook 配置。 */
export const getAiClubPipelineTriggerWebhook = async (
  pipelineId: number,
): Promise<AiClubPipelineTriggerWebhook> => {
  const res = await http.get<ApiResponse<AiClubPipelineTriggerWebhook>>(
    `/api/cicd/pipelines/${pipelineId}/trigger-webhook`,
  )
  return unwrap(res)
}

/** 更新触发 Webhook 配置。 */
export const updateAiClubPipelineTriggerWebhook = async (
  pipelineId: number,
  payload: AiClubPipelineTriggerWebhookPayload,
): Promise<AiClubPipelineTriggerWebhook> => {
  const res = await http.put<ApiResponse<AiClubPipelineTriggerWebhook>>(
    `/api/cicd/pipelines/${pipelineId}/trigger-webhook`,
    payload,
  )
  return unwrap(res)
}

/** 获取回调 Webhook 配置。 */
export const getAiClubPipelineCallbackWebhook = async (
  pipelineId: number,
): Promise<AiClubPipelineCallbackWebhook> => {
  const res = await http.get<ApiResponse<AiClubPipelineCallbackWebhook>>(
    `/api/cicd/pipelines/${pipelineId}/callback-webhook`,
  )
  return unwrap(res)
}

/** 更新回调 Webhook 配置。 */
export const updateAiClubPipelineCallbackWebhook = async (
  pipelineId: number,
  payload: AiClubPipelineCallbackWebhookPayload,
): Promise<AiClubPipelineCallbackWebhook> => {
  const res = await http.put<ApiResponse<AiClubPipelineCallbackWebhook>>(
    `/api/cicd/pipelines/${pipelineId}/callback-webhook`,
    payload,
  )
  return unwrap(res)
}

/* ── Jenkins 服务增删改查 ── */

/** 分页查询 Jenkins 服务。 */
export const pageJenkinsServers = async (query: {
  page: number
  size: number
  keyword?: string
  enabled?: boolean
}): Promise<PageResponse<JenkinsServerItem>> => {
  const res = await http.get<ApiResponse<PageResponse<JenkinsServerItem>>>('/api/cicd/jenkins-servers', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 获取 Jenkins 服务选项列表（无分页，适合下拉框）。 */
export const listJenkinsServerOptions = async (): Promise<JenkinsServerItem[]> => {
  const res = await http.get<ApiResponse<JenkinsServerItem[]>>('/api/cicd/jenkins-servers/options')
  return unwrap(res)
}

/** 创建 Jenkins 服务。 */
export const createJenkinsServer = async (
  payload: JenkinsServerPayload,
): Promise<JenkinsServerItem> => {
  const res = await http.post<ApiResponse<JenkinsServerItem>>('/api/cicd/jenkins-servers', payload)
  return unwrap(res)
}

/** 更新 Jenkins 服务。 */
export const updateJenkinsServer = async (
  serverId: number,
  payload: JenkinsServerPayload,
): Promise<JenkinsServerItem> => {
  const res = await http.put<ApiResponse<JenkinsServerItem>>(
    `/api/cicd/jenkins-servers/${serverId}`,
    payload,
  )
  return unwrap(res)
}

/** 删除 Jenkins 服务。 */
export const deleteJenkinsServer = async (serverId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/cicd/jenkins-servers/${serverId}`)
}

/** 测试 Jenkins 服务连通性。 */
export const testJenkinsServer = async (serverId: number): Promise<JenkinsServerItem> => {
  const res = await http.post<ApiResponse<JenkinsServerItem>>(
    `/api/cicd/jenkins-servers/${serverId}/test`,
  )
  return unwrap(res)
}

/** 列出 Jenkins 服务下的 Job。 */
export const listJenkinsJobs = async (serverId: number): Promise<JenkinsJobItem[]> => {
  const res = await http.get<ApiResponse<JenkinsJobItem[]>>(
    `/api/cicd/jenkins-servers/${serverId}/jobs`,
  )
  return unwrap(res)
}

/* ── Pipeline 绑定增删改查 ── */

/** 分页查询流水线绑定。 */
export const pagePipelineBindings = async (query: {
  page: number
  size: number
  keyword?: string
  serverId?: number
  enabled?: boolean
}): Promise<PageResponse<PipelineBindingItem>> => {
  const res = await http.get<ApiResponse<PageResponse<PipelineBindingItem>>>('/api/cicd/pipeline-bindings', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 获取单个流水线绑定详情。 */
export const getPipelineBinding = async (bindingId: number): Promise<PipelineBindingItem> => {
  const res = await http.get<ApiResponse<PipelineBindingItem>>(
    `/api/cicd/pipeline-bindings/${bindingId}`,
  )
  return unwrap(res)
}

/** 创建流水线绑定。 */
export const createPipelineBinding = async (
  payload: PipelineBindingPayload,
): Promise<PipelineBindingItem> => {
  const res = await http.post<ApiResponse<PipelineBindingItem>>('/api/cicd/pipeline-bindings', payload)
  return unwrap(res)
}

/** 更新流水线绑定。 */
export const updatePipelineBinding = async (
  bindingId: number,
  payload: PipelineBindingPayload,
): Promise<PipelineBindingItem> => {
  const res = await http.put<ApiResponse<PipelineBindingItem>>(
    `/api/cicd/pipeline-bindings/${bindingId}`,
    payload,
  )
  return unwrap(res)
}

/** 删除流水线绑定。 */
export const deletePipelineBinding = async (bindingId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/cicd/pipeline-bindings/${bindingId}`)
}

/** 列出绑定关联的运行实例。 */
export const listPipelineBindingRuntimeInstances = async (
  bindingId: number,
): Promise<RuntimeInstanceItem[]> => {
  const res = await http.get<ApiResponse<RuntimeInstanceItem[]>>(
    `/api/cicd/pipeline-bindings/${bindingId}/runtime-instances`,
  )
  return unwrap(res)
}

/** 获取 Jenkins 构建日志详情。 */
export const getPipelineBuildLog = async (
  bindingId: number,
  buildNumber: number,
): Promise<JenkinsBuildLogDetail> => {
  const res = await http.get<ApiResponse<JenkinsBuildLogDetail>>(
    `/api/cicd/pipeline-bindings/${bindingId}/builds/${buildNumber}/log`,
  )
  return unwrap(res)
}

/* ── 可观测性项目详情与运行实例配置 ── */

/** 获取可观测性项目详情（含运行实例列表）。 */
export const getObservabilityProjectDetail = async (
  projectId: number,
): Promise<ObservabilityProjectDetail> => {
  const res = await http.get<ApiResponse<ObservabilityProjectDetail>>(
    `/api/observability/projects/${projectId}`,
  )
  return unwrap(res)
}

/** 更新运行实例观测配置。 */
export const updateObservabilityRuntimeInstance = async (
  projectId: number,
  runtimeInstanceId: number,
  payload: RuntimeInstancePayload,
): Promise<RuntimeInstanceItem> => {
  const res = await http.put<ApiResponse<RuntimeInstanceItem>>(
    `/api/observability/projects/${projectId}/runtime-instances/${runtimeInstanceId}`,
    payload,
  )
  return unwrap(res)
}
