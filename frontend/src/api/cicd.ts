import { http } from './http'
import type {
  AiClubPipelineConfigCompleteResult,
  AiClubPipelineConfigEditContextItem,
  AiClubPipelineConfigPreviewResult,
  AiClubPipelineConfigStatusItem,
  AiClubPipelineCallbackWebhookItem,
  AiClubPipelineConfigTemplateItem,
  AiClubPipelineCronItem,
  AiClubPipelineItem,
  AiClubPipelineRunItem,
  AiClubPipelineRunLogDetailItem,
  AiClubPipelineTriggerWebhookItem,
  AiClubPipelineTriggerResult,
  ApiResponse,
  JenkinsBuildItem,
  JenkinsBuildLogDetailItem,
  JenkinsBuildTriggerResult,
  JenkinsJobItem,
  JenkinsServerItem,
  PageResponse,
  PipelineCenterEntryItem,
  ProjectPipelineBindingItem,
  ProjectRuntimeInstanceItem,
  WoodpeckerHealthItem
} from '@/types/platform'

export interface JenkinsServerPayload {
  name: string
  baseUrl: string
  username: string
  apiToken: string
  description: string
  enabled: boolean
}

export interface JenkinsServerQuery {
  page: number
  size: number
  keyword?: string
  enabled?: boolean
}

export interface PipelineBindingPayload {
  projectId: number
  jenkinsServerId: number
  jobName: string
  defaultBranch: string
  buildParametersJson: string
  enabled: boolean
  runtimeInstances?: ProjectRuntimeInstancePayload[]
}

export interface ProjectRuntimeInstancePayload {
  name: string
  environment: string
  serviceName: string
  enabled: boolean
  serverMode: 'MANAGED_SERVER' | 'EXTERNAL_ENDPOINT'
  serverId?: number | null
  externalBaseUrl?: string
  logEnabled: boolean
  logPaths: string[]
  healthEnabled: boolean
  healthProbeType: 'HTTP' | 'TCP'
  healthTarget: string
}

export interface PipelineBindingQuery {
  page: number
  size: number
  keyword?: string
  serverId?: number
  enabled?: boolean
}

export interface AiClubPipelinePayload {
  projectId: number
  gitlabBindingId: number
  name: string
  defaultBranch: string
  configPath: string
  triggerVariables?: Record<string, string>
  enabled: boolean
}

export interface AiClubPipelineQuery {
  page: number
  size: number
  keyword?: string
  projectId?: number
  enabled?: boolean
}

export interface AiClubPipelineCronPayload {
  name: string
  branch: string
  cronExpression: string
  enabled: boolean
}

export interface AiClubPipelineTriggerWebhookPayload {
  enabled: boolean
  regenerateToken: boolean
}

export interface AiClubPipelineCallbackWebhookPayload {
  enabled: boolean
  callbackUrl: string
  subscribedStatuses: string[]
}

export interface PipelineCenterEntryQuery {
  page: number
  size: number
  keyword?: string
  projectId?: number
  enabled?: boolean
  entryType?: string
}

export interface AiClubPipelineConfigPreviewPayload {
  templateCode: string
  parameters?: Record<string, string>
  manualEdit?: boolean
  content?: string
}

export interface AiClubPipelineConfigCompletePayload {
  templateCode: string
  parameters?: Record<string, string>
  manualEdit?: boolean
  content?: string
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const getWoodpeckerHealth = async () => {
  const { data } = await http.get<ApiResponse<WoodpeckerHealthItem>>('/api/cicd/woodpecker/health')
  return data.data
}

export const listAiClubPipelineConfigTemplates = async () => {
  const { data } = await http.get<ApiResponse<AiClubPipelineConfigTemplateItem[]>>('/api/cicd/pipeline-config-templates')
  return data.data
}

export const listAiClubPipelineConfigTemplatesForPipeline = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineConfigTemplateItem[]>>(`/api/cicd/pipelines/${id}/config/templates`)
  return data.data
}

export const pageAiClubPipelines = async (query: AiClubPipelineQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<AiClubPipelineItem>>>('/api/cicd/pipelines', {
    params: cleanParams(query)
  })
  return data.data
}

export const pagePipelineCenterEntries = async (query: PipelineCenterEntryQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<PipelineCenterEntryItem>>>('/api/cicd/pipeline-center/entries', {
    params: cleanParams(query)
  })
  return data.data
}

export const getAiClubPipeline = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineItem>>(`/api/cicd/pipelines/${id}`)
  return data.data
}

export const getPipelineBinding = async (id: number) => {
  const { data } = await http.get<ApiResponse<ProjectPipelineBindingItem>>(`/api/cicd/pipeline-bindings/${id}`)
  return data.data
}

export const listPipelineBindingRuntimeInstances = async (id: number) => {
  const { data } = await http.get<ApiResponse<ProjectRuntimeInstanceItem[]>>(`/api/cicd/pipeline-bindings/${id}/runtime-instances`)
  return data.data
}

export const createAiClubPipeline = async (payload: AiClubPipelinePayload) => {
  const { data } = await http.post<ApiResponse<AiClubPipelineItem>>('/api/cicd/pipelines', payload)
  return data.data
}

export const updateAiClubPipeline = async (id: number, payload: AiClubPipelinePayload) => {
  const { data } = await http.put<ApiResponse<AiClubPipelineItem>>(`/api/cicd/pipelines/${id}`, payload)
  return data.data
}

export const deleteAiClubPipeline = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/cicd/pipelines/${id}`)
}

export const syncAiClubPipelineRepository = async (id: number) => {
  const { data } = await http.post<ApiResponse<AiClubPipelineItem>>(`/api/cicd/pipelines/${id}/sync-repository`)
  return data.data
}

export const triggerAiClubPipeline = async (id: number) => {
  const { data } = await http.post<ApiResponse<AiClubPipelineTriggerResult>>(`/api/cicd/pipelines/${id}/trigger`)
  return data.data
}

export const getAiClubPipelineConfigStatus = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineConfigStatusItem>>(`/api/cicd/pipelines/${id}/config/status`)
  return data.data
}

export const getAiClubPipelineConfigEditContext = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineConfigEditContextItem>>(`/api/cicd/pipelines/${id}/config/edit-context`)
  return data.data
}

export const previewAiClubPipelineConfig = async (id: number, payload: AiClubPipelineConfigPreviewPayload) => {
  const { data } = await http.post<ApiResponse<AiClubPipelineConfigPreviewResult>>(`/api/cicd/pipelines/${id}/config/preview`, payload)
  return data.data
}

export const completeAiClubPipelineConfig = async (id: number, payload: AiClubPipelineConfigCompletePayload) => {
  const { data } = await http.post<ApiResponse<AiClubPipelineConfigCompleteResult>>(`/api/cicd/pipelines/${id}/config/complete`, payload)
  return data.data
}

export const listAiClubPipelineRuns = async (id: number, limit = 20) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineRunItem[]>>(`/api/cicd/pipelines/${id}/runs`, {
    params: cleanParams({ limit })
  })
  return data.data
}

export const getAiClubPipelineRunLog = async (id: number, runNumber: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineRunLogDetailItem>>(`/api/cicd/pipelines/${id}/runs/${runNumber}/log`)
  return data.data
}

export const listAiClubPipelineCronJobs = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineCronItem[]>>(`/api/cicd/pipelines/${id}/cron-jobs`)
  return data.data
}

export const createAiClubPipelineCronJob = async (id: number, payload: AiClubPipelineCronPayload) => {
  const { data } = await http.post<ApiResponse<AiClubPipelineCronItem>>(`/api/cicd/pipelines/${id}/cron-jobs`, payload)
  return data.data
}

export const updateAiClubPipelineCronJob = async (id: number, cronJobId: number, payload: AiClubPipelineCronPayload) => {
  const { data } = await http.put<ApiResponse<AiClubPipelineCronItem>>(`/api/cicd/pipelines/${id}/cron-jobs/${cronJobId}`, payload)
  return data.data
}

export const deleteAiClubPipelineCronJob = async (id: number, cronJobId: number) => {
  await http.delete<ApiResponse<null>>(`/api/cicd/pipelines/${id}/cron-jobs/${cronJobId}`)
}

export const getAiClubPipelineTriggerWebhook = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineTriggerWebhookItem>>(`/api/cicd/pipelines/${id}/trigger-webhook`)
  return data.data
}

export const updateAiClubPipelineTriggerWebhook = async (id: number, payload: AiClubPipelineTriggerWebhookPayload) => {
  const { data } = await http.put<ApiResponse<AiClubPipelineTriggerWebhookItem>>(`/api/cicd/pipelines/${id}/trigger-webhook`, payload)
  return data.data
}

export const getAiClubPipelineCallbackWebhook = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineCallbackWebhookItem>>(`/api/cicd/pipelines/${id}/callback-webhook`)
  return data.data
}

export const updateAiClubPipelineCallbackWebhook = async (id: number, payload: AiClubPipelineCallbackWebhookPayload) => {
  const { data } = await http.put<ApiResponse<AiClubPipelineCallbackWebhookItem>>(`/api/cicd/pipelines/${id}/callback-webhook`, payload)
  return data.data
}

export const pageJenkinsServers = async (query: JenkinsServerQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<JenkinsServerItem>>>('/api/cicd/jenkins-servers', {
    params: cleanParams(query)
  })
  return data.data
}

export const listJenkinsServerOptions = async () => {
  const { data } = await http.get<ApiResponse<JenkinsServerItem[]>>('/api/cicd/jenkins-servers/options')
  return data.data
}

export const createJenkinsServer = async (payload: JenkinsServerPayload) => {
  const { data } = await http.post<ApiResponse<JenkinsServerItem>>('/api/cicd/jenkins-servers', payload)
  return data.data
}

export const updateJenkinsServer = async (id: number, payload: JenkinsServerPayload) => {
  const { data } = await http.put<ApiResponse<JenkinsServerItem>>(`/api/cicd/jenkins-servers/${id}`, payload)
  return data.data
}

export const deleteJenkinsServer = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/cicd/jenkins-servers/${id}`)
}

export const testJenkinsServer = async (id: number) => {
  const { data } = await http.post<ApiResponse<JenkinsServerItem>>(`/api/cicd/jenkins-servers/${id}/test`)
  return data.data
}

export const listJenkinsJobs = async (id: number) => {
  const { data } = await http.get<ApiResponse<JenkinsJobItem[]>>(`/api/cicd/jenkins-servers/${id}/jobs`)
  return data.data
}

export const triggerJenkinsJob = async (id: number, jobName: string) => {
  const { data } = await http.post<ApiResponse<JenkinsBuildTriggerResult>>(`/api/cicd/jenkins-servers/${id}/jobs/trigger`, null, {
    params: cleanParams({ jobName })
  })
  return data.data
}

export const pagePipelineBindings = async (query: PipelineBindingQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ProjectPipelineBindingItem>>>('/api/cicd/pipeline-bindings', {
    params: cleanParams(query)
  })
  return data.data
}

export const createPipelineBinding = async (payload: PipelineBindingPayload) => {
  const { data } = await http.post<ApiResponse<ProjectPipelineBindingItem>>('/api/cicd/pipeline-bindings', payload)
  return data.data
}

export const listPipelineBuilds = async (id: number, limit = 20) => {
  const { data } = await http.get<ApiResponse<JenkinsBuildItem[]>>(`/api/cicd/pipeline-bindings/${id}/builds`, {
    params: cleanParams({ limit })
  })
  return data.data
}

export const getPipelineBuildLog = async (id: number, buildNumber: number) => {
  const { data } = await http.get<ApiResponse<JenkinsBuildLogDetailItem>>(`/api/cicd/pipeline-bindings/${id}/builds/${buildNumber}/log`)
  return data.data
}

export const updatePipelineBinding = async (id: number, payload: PipelineBindingPayload) => {
  const { data } = await http.put<ApiResponse<ProjectPipelineBindingItem>>(`/api/cicd/pipeline-bindings/${id}`, payload)
  return data.data
}

export const deletePipelineBinding = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/cicd/pipeline-bindings/${id}`)
}

export const triggerPipelineBuild = async (id: number) => {
  const { data } = await http.post<ApiResponse<JenkinsBuildTriggerResult>>(`/api/cicd/pipeline-bindings/${id}/trigger`)
  return data.data
}
