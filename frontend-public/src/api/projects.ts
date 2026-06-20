/**
 * 项目相关 API 调用。
 * 与后端 /api/projects/* 接口对齐。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageParams, PageResponse } from '@/src/types/api'
import type { ProjectItem, ProjectListStatsItem, ProjectPayload } from '@/src/types/project'

/** 分页查询项目列表。 */
export const pageProjects = async (query: PageParams): Promise<PageResponse<ProjectItem>> => {
  const response = await http.get<ApiResponse<PageResponse<ProjectItem>>>('/api/projects', {
    params: cleanParams(query),
  })
  return unwrap(response)
}

/** 获取项目列表统计信息。 */
export const getProjectListStats = async (query?: PageParams): Promise<ProjectListStatsItem> => {
  const response = await http.get<ApiResponse<ProjectListStatsItem>>('/api/projects/stats', {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(response)
}

/** 获取项目下拉选项（轻量列表）。 */
export const listProjectOptions = async (): Promise<ProjectItem[]> => {
  const response = await http.get<ApiResponse<ProjectItem[]>>('/api/projects/options')
  return unwrap(response)
}

/** 获取项目详情。 */
export const getProjectDetail = async (id: number): Promise<ProjectItem> => {
  const response = await http.get<ApiResponse<ProjectItem>>(`/api/projects/${id}`)
  return unwrap(response)
}

/** 创建项目。 */
export const createProject = async (payload: ProjectPayload): Promise<ProjectItem> => {
  const response = await http.post<ApiResponse<ProjectItem>>('/api/projects', payload)
  return unwrap(response)
}

/** 更新项目。 */
export const updateProject = async (id: number, payload: ProjectPayload): Promise<ProjectItem> => {
  const response = await http.put<ApiResponse<ProjectItem>>(`/api/projects/${id}`, payload)
  return unwrap(response)
}

/** 删除项目。 */
export const deleteProject = async (id: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/projects/${id}`)
}
