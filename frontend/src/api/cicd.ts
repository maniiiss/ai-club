import { http } from './http'
import type {
  AiClubPipelineConfigCompleteResult,
  AiClubPipelineConfigPreviewResult,
  AiClubPipelineConfigStatusItem,
  AiClubPipelineConfigTemplateItem,
  AiClubPipelineItem,
  AiClubPipelineRunItem,
  AiClubPipelineRunLogDetailItem,
  AiClubPipelineTriggerResult,
  ApiResponse,
  JenkinsBuildItem,
  JenkinsBuildLogDetailItem,
  JenkinsBuildTriggerResult,
  JenkinsJobItem,
  JenkinsServerItem,
  PageResponse,
  ProjectPipelineBindingItem,
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
  enabled: boolean
}

export interface AiClubPipelineQuery {
  page: number
  size: number
  keyword?: string
  projectId?: number
  enabled?: boolean
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

export const getAiClubPipeline = async (id: number) => {
  const { data } = await http.get<ApiResponse<AiClubPipelineItem>>(`/api/cicd/pipelines/${id}`)
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
