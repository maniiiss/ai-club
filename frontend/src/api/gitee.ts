import { http } from './http'
import type {
  ApiResponse,
  GiteeMilestoneItem,
  GiteeProgramItem,
  GiteeProjectBindingDiscoveryResultItem,
  GiteeTestPlanPushContextItem,
  GiteeTestPlanPushResultItem,
  GiteeWorkItemSyncLogItem,
  GiteeWorkItemSyncResultItem,
  IterationGiteeBindingItem,
  ProjectGiteeBindingItem
} from '@/types/platform'

export interface ProjectGiteeBindingPayload {
  enterpriseId: number
  apiBaseUrl: string
  giteeProgramId: number
  accessToken?: string
  enabled: boolean
}

export interface GiteeProjectBindingDiscoveryPayload {
  enterpriseId: number
  apiBaseUrl: string
  accessToken?: string
}

export interface IterationGiteeBindingPayload {
  giteeMilestoneId: number
}

export const getProjectGiteeBinding = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<ProjectGiteeBindingItem | null>>(`/api/gitee/projects/${projectId}/binding`)
  return data.data
}

export const discoverProjectGiteePrograms = async (projectId: number, payload: GiteeProjectBindingDiscoveryPayload) => {
  const { data } = await http.post<ApiResponse<GiteeProjectBindingDiscoveryResultItem>>(`/api/gitee/projects/${projectId}/binding/discover`, payload)
  return data.data
}

export const createProjectGiteeBinding = async (projectId: number, payload: ProjectGiteeBindingPayload) => {
  const { data } = await http.post<ApiResponse<ProjectGiteeBindingItem>>(`/api/gitee/projects/${projectId}/binding`, payload)
  return data.data
}

export const updateProjectGiteeBinding = async (projectId: number, payload: ProjectGiteeBindingPayload) => {
  const { data } = await http.put<ApiResponse<ProjectGiteeBindingItem>>(`/api/gitee/projects/${projectId}/binding`, payload)
  return data.data
}

export const listProjectGiteeMilestones = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<GiteeMilestoneItem[]>>(`/api/gitee/projects/${projectId}/milestones`)
  return data.data
}

export const getIterationGiteeBinding = async (iterationId: number) => {
  const { data } = await http.get<ApiResponse<IterationGiteeBindingItem | null>>(`/api/gitee/iterations/${iterationId}/binding`)
  return data.data
}

export const createIterationGiteeBinding = async (iterationId: number, payload: IterationGiteeBindingPayload) => {
  const { data } = await http.post<ApiResponse<IterationGiteeBindingItem>>(`/api/gitee/iterations/${iterationId}/binding`, payload)
  return data.data
}

export const updateIterationGiteeBinding = async (iterationId: number, payload: IterationGiteeBindingPayload) => {
  const { data } = await http.put<ApiResponse<IterationGiteeBindingItem>>(`/api/gitee/iterations/${iterationId}/binding`, payload)
  return data.data
}

export const syncIterationGiteeWorkItems = async (iterationId: number) => {
  const { data } = await http.post<ApiResponse<GiteeWorkItemSyncResultItem>>(`/api/gitee/iterations/${iterationId}/sync-work-items`)
  return data.data
}

export const listIterationGiteeWorkItemSyncLogs = async (iterationId: number) => {
  const { data } = await http.get<ApiResponse<GiteeWorkItemSyncLogItem[]>>(`/api/gitee/iterations/${iterationId}/sync-work-item-logs`)
  return data.data
}

export const getTestPlanGiteePushContext = async (testPlanId: number) => {
  const { data } = await http.get<ApiResponse<GiteeTestPlanPushContextItem>>(`/api/gitee/test-plans/${testPlanId}/push-context`)
  return data.data
}

export const pushTestPlanToGitee = async (testPlanId: number) => {
  const { data } = await http.post<ApiResponse<GiteeTestPlanPushResultItem>>(`/api/gitee/test-plans/${testPlanId}/push`)
  return data.data
}
