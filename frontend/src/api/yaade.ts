import { http } from './http'
import type { ApiResponse } from '@/types/platform'

export interface YaadeProjectContextItem {
  projectId: number
  projectName: string
  yaadeCollectionId: number
  yaadeGroupName: string
}

export interface YaadeProjectBindingItem {
  projectId: number | null
  publicSpace: boolean
  exists: boolean
  yaadeCollectionId: number | null
  yaadeGroupName: string
  status: string
  collectionName: string
  archivedName: string | null
  lastSyncedAt: string | null
}

export interface YaadeEmbedSessionItem {
  binding: YaadeProjectBindingItem
  iframePath: string
  createdBinding: boolean
  projectContexts: YaadeProjectContextItem[]
}

export interface YaadeHealthItem {
  available: boolean
  baseUrl: string
  message: string
}

export const getYaadeHealth = async () => {
  const { data } = await http.get<ApiResponse<YaadeHealthItem>>('/api/yaade/health')
  return data.data
}

export const createYaadeEmbedSession = async (projectId?: number | null) => {
  const { data } = await http.post<ApiResponse<YaadeEmbedSessionItem>>(
    '/api/yaade/embed-sessions',
    { projectId: projectId ?? null },
    { withCredentials: true }
  )
  return data.data
}

export const getYaadeProjectBinding = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<YaadeProjectBindingItem>>(`/api/yaade/projects/${projectId}/binding`)
  return data.data
}

export const repairYaadeProjectBinding = async (projectId: number) => {
  const { data } = await http.post<ApiResponse<YaadeProjectBindingItem>>(`/api/yaade/projects/${projectId}/repair-sync`)
  return data.data
}
