import { http } from './http'
import type {
  ApiResponse,
  JenkinsBuildItem,
  JenkinsBuildLogDetailItem,
  JenkinsBuildTriggerResult,
  JenkinsJobItem,
  JenkinsServerItem,
  PageResponse,
  ProjectPipelineBindingItem
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

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

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
