/**
 * 研发模块 API。
 * 与后端 /api/gitlab/* 接口对齐，面向项目维度的仓库绑定、分支、合并请求、代码结构、扫描和自动合并。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  GitlabBranchItem,
  GitlabCodeStructureSnapshotItem,
  GitlabMergeRequestItem,
  ProjectGitlabBindingItem,
  RepositoryScanRulesetItem,
  GitlabAutoMergeLogItem,
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

/** 获取代码结构快照。 */
export const getGitlabCodeStructure = async (
  bindingId: number,
  branch?: string,
): Promise<GitlabCodeStructureSnapshotItem> => {
  const res = await http.get<ApiResponse<GitlabCodeStructureSnapshotItem>>(
    `/api/gitlab/bindings/${bindingId}/code-structure`,
    { params: cleanParams({ branch }) },
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
    `/api/gitlab/bindings/${bindingId}/scan`,
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
    '/api/gitlab/auto-merge/logs',
    { params: cleanParams(query) },
  )
  return unwrap(res)
}
