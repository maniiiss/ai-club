/**
 * 发布与观测模块 API。
 * 流水线中心 + AI Club 流水线 + Jenkins + 可观测性。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  AiClubPipelineItem,
  AiClubPipelineRunItem,
  AiClubPipelineTriggerResult,
  JenkinsBuildItem,
  JenkinsBuildTriggerResult,
  ObservabilityHealthTimelinePointItem,
  ObservabilityProjectHealthItem,
  ObservabilityProjectItem,
  ObservabilityProjectLogItem,
  PipelineCenterEntryItem,
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
