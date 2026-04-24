import { http } from './http'
import type {
  AgentItem,
  ApiResponse,
  PageResponse,
  ProjectGitlabBindingItem,
  ProjectItem,
  UserOptionItem
} from '@/types/platform'
import type {
  SelfUpgradeCenterConfig,
  SelfUpgradeCenterConfigPayload,
  SelfUpgradePatrolPlan,
  SelfUpgradePatrolPlanPayload,
  SelfUpgradePatrolPlanQuery,
  SelfUpgradePatrolRun,
  SelfUpgradePatrolRunQuery,
  SelfUpgradeSuggestionCard,
  SelfUpgradeSuggestionDetail,
  SelfUpgradeSuggestionQuery,
  SelfUpgradeWorkItem,
  SelfUpgradeWorkItemCompletePayload,
  SelfUpgradeWorkItemUpdatePayload
} from '@/types/self-upgrade'

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const getSelfUpgradeConfig = async () => {
  const { data } = await http.get<ApiResponse<SelfUpgradeCenterConfig>>('/api/self-upgrade/config')
  return data.data
}

export const updateSelfUpgradeConfig = async (payload: SelfUpgradeCenterConfigPayload) => {
  const { data } = await http.put<ApiResponse<SelfUpgradeCenterConfig>>('/api/self-upgrade/config', payload)
  return data.data
}

export const pageSelfUpgradePatrolPlans = async (query: SelfUpgradePatrolPlanQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<SelfUpgradePatrolPlan>>>('/api/self-upgrade/plans', {
    params: cleanParams(query)
  })
  return data.data
}

export const getSelfUpgradePatrolPlan = async (id: number) => {
  const { data } = await http.get<ApiResponse<SelfUpgradePatrolPlan>>(`/api/self-upgrade/plans/${id}`)
  return data.data
}

export const createSelfUpgradePatrolPlan = async (payload: SelfUpgradePatrolPlanPayload) => {
  const { data } = await http.post<ApiResponse<SelfUpgradePatrolPlan>>('/api/self-upgrade/plans', payload)
  return data.data
}

export const updateSelfUpgradePatrolPlan = async (id: number, payload: SelfUpgradePatrolPlanPayload) => {
  const { data } = await http.put<ApiResponse<SelfUpgradePatrolPlan>>(`/api/self-upgrade/plans/${id}`, payload)
  return data.data
}

export const deleteSelfUpgradePatrolPlan = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/self-upgrade/plans/${id}`)
}

export const enableSelfUpgradePatrolPlan = async (id: number) => {
  const { data } = await http.post<ApiResponse<SelfUpgradePatrolPlan>>(`/api/self-upgrade/plans/${id}/enable`)
  return data.data
}

export const disableSelfUpgradePatrolPlan = async (id: number) => {
  const { data } = await http.post<ApiResponse<SelfUpgradePatrolPlan>>(`/api/self-upgrade/plans/${id}/disable`)
  return data.data
}

export const runSelfUpgradePatrolPlanNow = async (id: number) => {
  const { data } = await http.post<ApiResponse<SelfUpgradePatrolRun>>(`/api/self-upgrade/plans/${id}/run`)
  return data.data
}

export const pageSelfUpgradePatrolRuns = async (query: SelfUpgradePatrolRunQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<SelfUpgradePatrolRun>>>('/api/self-upgrade/runs', {
    params: cleanParams(query)
  })
  return data.data
}

export const getSelfUpgradePatrolRun = async (id: number) => {
  const { data } = await http.get<ApiResponse<SelfUpgradePatrolRun>>(`/api/self-upgrade/runs/${id}`)
  return data.data
}

export const pageSelfUpgradeSuggestions = async (query: SelfUpgradeSuggestionQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<SelfUpgradeSuggestionCard>>>('/api/self-upgrade/suggestions', {
    params: cleanParams(query)
  })
  return data.data
}

export const getSelfUpgradeSuggestion = async (id: number) => {
  const { data } = await http.get<ApiResponse<SelfUpgradeSuggestionDetail>>(`/api/self-upgrade/suggestions/${id}`)
  return data.data
}

export const acceptSelfUpgradeSuggestion = async (id: number) => {
  const { data } = await http.post<ApiResponse<SelfUpgradeSuggestionDetail>>(`/api/self-upgrade/suggestions/${id}/accept`)
  return data.data
}

export const rejectSelfUpgradeSuggestion = async (id: number) => {
  const { data } = await http.post<ApiResponse<SelfUpgradeSuggestionDetail>>(`/api/self-upgrade/suggestions/${id}/reject`)
  return data.data
}

export const getSelfUpgradeWorkItem = async (id: number) => {
  const { data } = await http.get<ApiResponse<SelfUpgradeWorkItem>>(`/api/self-upgrade/work-items/${id}`)
  return data.data
}

export const updateSelfUpgradeWorkItem = async (id: number, payload: SelfUpgradeWorkItemUpdatePayload) => {
  const { data } = await http.put<ApiResponse<SelfUpgradeWorkItem>>(`/api/self-upgrade/work-items/${id}`, payload)
  return data.data
}

export const startSelfUpgradeWorkItemExecution = async (id: number) => {
  const { data } = await http.post<ApiResponse<SelfUpgradeWorkItem>>(`/api/self-upgrade/work-items/${id}/execute`)
  return data.data
}

export const completeSelfUpgradeWorkItem = async (id: number, payload: SelfUpgradeWorkItemCompletePayload) => {
  const { data } = await http.post<ApiResponse<SelfUpgradeWorkItem>>(`/api/self-upgrade/work-items/${id}/complete`, payload)
  return data.data
}

export const listSelfUpgradeProjectOptions = async () => {
  const { data } = await http.get<ApiResponse<ProjectItem[]>>('/api/projects/options')
  return data.data
}

export const listSelfUpgradeAgentOptions = async (projectId?: number) => {
  const { data } = await http.get<ApiResponse<AgentItem[]>>('/api/agents/options', {
    params: cleanParams({ projectId })
  })
  return data.data
}

export const listSelfUpgradeUserOptions = async () => {
  const { data } = await http.get<ApiResponse<UserOptionItem[]>>('/api/users/options')
  return data.data
}

export const listSelfUpgradeGitlabBindingOptions = async () => {
  const { data } = await http.get<ApiResponse<ProjectGitlabBindingItem[]>>('/api/gitlab/bindings/options')
  return data.data
}
