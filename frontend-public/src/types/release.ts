/**
 * 发布与观测模块类型定义。
 * 涵盖流水线中心、AI Club 流水线、Jenkins 构建和可观测性。
 */

/** 流水线中心条目（合并 AI Club 流水线和 Jenkins 绑定）。 */
export interface PipelineCenterEntryItem {
  entryType: 'AI_CLUB' | 'JENKINS' | string
  entryId: number
  projectId: number
  projectName: string
  displayName: string
  providerCode: string
  defaultBranch: string | null
  enabled: boolean
  lastRunStatus: string | null
  lastRunMessage: string | null
  lastTriggeredAt: string | null
  primaryLabel: string
  primaryValue: string | null
  primaryUrl: string | null
  secondaryLabel: string | null
  secondaryValue: string | null
  configStatus: string | null
  cronCount: number
  triggerWebhookEnabled: boolean
  callbackWebhookEnabled: boolean
}

/** AI Club 流水线。 */
export interface AiClubPipelineItem {
  id: number
  projectId: number
  projectName: string
  gitlabBindingId: number
  gitlabProjectName: string | null
  name: string
  defaultBranch: string | null
  configPath: string
  enabled: boolean
  lastRunStatus: string | null
  lastRunMessage: string | null
  lastRunNumber: number | null
  lastRunUrl: string | null
  lastTriggeredAt: string | null
}

/** AI Club 流水线运行记录。 */
export interface AiClubPipelineRunItem {
  number: number
  status: string | null
  branch: string | null
  event: string | null
  message: string | null
  commit: string | null
  url: string | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  durationMillis: number | null
  durationText: string
}

/** Jenkins 构建记录。 */
export interface JenkinsBuildItem {
  number: number
  url: string | null
  result: string | null
  building: boolean
  executedAt: string | null
  durationMillis: number
  durationText: string
  description: string | null
}

/* ── 可观测性 ── */

/** 可观测性项目摘要。 */
export interface ObservabilityProjectItem {
  projectId: number
  projectName: string
  projectStatus: string
  instanceCount: number
  enabledInstanceCount: number
  abnormalInstanceCount: number
  projectHealthScore: number | null
  projectHealthLevel: string | null
  lastHealthCheckedAt: string | null
  lastLogCollectedAt: string | null
  lastLogCollectStatus: string | null
}

/** 可观测性健康摘要。 */
export interface ObservabilityProjectHealthItem {
  projectId: number
  projectName: string
  projectHealthScore: number | null
  projectHealthLevel: string | null
  lastHealthCheckedAt: string | null
  totalInstanceCount: number
  enabledInstanceCount: number
  abnormalInstanceCount: number
}

/** 可观测性日志。 */
export interface ObservabilityProjectLogItem {
  id: number
  runtimeInstanceId: number
  runtimeInstanceName: string
  sourceType: string
  sourcePath: string | null
  logLevel: string | null
  logger: string | null
  traceId: string | null
  message: string
  loggedAt: string | null
}

/** 健康趋势数据点。 */
export interface ObservabilityHealthTimelinePointItem {
  sampledAt: string
  healthScore: number | null
  healthLevel: string | null
}
