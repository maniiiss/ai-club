/**
 * 发布与观测模块类型定义。
 * 涵盖流水线中心、GitPilot 流水线、Jenkins 构建和可观测性。
 */

/** 流水线中心条目（合并 GitPilot 流水线和 Jenkins 绑定）。 */
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

/** GitPilot 流水线。 */
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

/** GitPilot 流水线运行记录。 */
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

/** 触发 GitPilot 流水线的结果。 */
export interface AiClubPipelineTriggerResult {
  pipelineId: number
  projectName: string
  pipelineName: string
  providerCode: string
  runNumber: number | null
  status: string
  triggerUrl: string | null
  message: string
  triggeredAt: string
}

/** 触发 Jenkins 构建的结果。 */
export interface JenkinsBuildTriggerResult {
  bindingId: number
  projectName: string
  jenkinsServerName: string
  jobName: string
  triggerUrl: string | null
  message: string
  triggeredAt: string
}

/* ══ GitPilot 流水线 Cron 定时任务 ══ */

/** GitPilot 流水线 Cron 定时任务摘要。 */
export interface AiClubPipelineCronItem {
  id: number
  remoteCronId: number | null
  name: string
  branch: string | null
  cronExpression: string
  enabled: boolean
  nextRunAt: string | null
  lastSyncedAt: string | null
}

/** 创建/更新 Cron 定时任务的请求载荷。 */
export interface AiClubPipelineCronPayload {
  name: string
  branch?: string | null
  cronExpression: string
  enabled: boolean
}

/* ══ GitPilot 流水线 Webhook 配置 ══ */

/** 触发 Webhook 配置摘要。 */
export interface AiClubPipelineTriggerWebhook {
  enabled: boolean
  triggerUrl: string | null
  maskedToken: string | null
  updatedAt: string | null
}

/** 更新触发 Webhook 的请求载荷。 */
export interface AiClubPipelineTriggerWebhookPayload {
  enabled: boolean
  regenerateToken: boolean
}

/** 回调 Webhook 配置摘要。 */
export interface AiClubPipelineCallbackWebhook {
  enabled: boolean
  callbackUrlMasked: string | null
  subscribedStatuses: string[]
  updatedAt: string | null
  lastDeliveryAt: string | null
  lastDeliveryStatus: string | null
}

/** 更新回调 Webhook 的请求载荷。 */
export interface AiClubPipelineCallbackWebhookPayload {
  enabled: boolean
  callbackUrl: string | null
  subscribedStatuses: string[]
}

/* ══ Jenkins 服务 ══ */

/** Jenkins 服务实例摘要。 */
export interface JenkinsServerItem {
  id: number
  name: string
  baseUrl: string
  username: string
  description: string | null
  enabled: boolean
  tokenConfigured: boolean
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestedAt: string | null
  lastJobCount: number | null
}

/** Jenkins Job 摘要。 */
export interface JenkinsJobItem {
  name: string
  fullName: string | null
  url: string | null
  color: string | null
  lastBuildNumber: number | null
  lastBuildResult: string | null
  lastBuildUrl: string | null
  lastBuildAt: string | null
}

/** 创建/更新 Jenkins 服务的请求载荷。 */
export interface JenkinsServerPayload {
  name: string
  baseUrl: string
  username: string
  apiToken?: string | null
  description?: string | null
  enabled: boolean
}

/* ══ Pipeline 绑定（Jenkins）══ */

/** 流水线绑定摘要。 */
export interface PipelineBindingItem {
  id: number
  projectId: number
  projectName: string
  jenkinsServerId: number
  jenkinsServerName: string
  jobName: string
  jobUrl: string | null
  defaultBranch: string | null
  buildParametersJson: string | null
  enabled: boolean
  lastTriggerStatus: string | null
  lastTriggerMessage: string | null
  lastTriggeredAt: string | null
  lastTriggerUrl: string | null
}

/** 创建/更新流水线绑定的请求载荷。 */
export interface PipelineBindingPayload {
  projectId: number
  jenkinsServerId: number
  jobName: string
  defaultBranch?: string | null
  buildParametersJson?: string | null
  enabled: boolean
}

/* ══ 运行时实例 ══ */

/** 运行时实例摘要（可观测性 + 绑定关联）。 */
export interface RuntimeInstanceItem {
  id: number
  projectId: number
  projectName: string
  sourceType: string
  sourceBindingId: number | null
  name: string
  environment: string | null
  serviceName: string | null
  enabled: boolean
  serverMode: string | null
  serverId: number | null
  serverName: string | null
  externalBaseUrl: string | null
  logEnabled: boolean
  logPaths: string[]
  healthEnabled: boolean
  healthProbeType: string | null
  healthTarget: string | null
  lastDeployedAt: string | null
  lastStatus: string | null
  lastStatusMessage: string | null
  lastLogCollectedAt: string | null
  lastLogCollectStatus: string | null
  lastLogCollectMessage: string | null
  lastHealthCheckedAt: string | null
  lastHealthScore: number | null
  lastHealthLevel: string | null
  lastHealthMessage: string | null
  lastHealthLatencyMs: number | null
}

/** 更新运行实例观测配置的请求载荷。 */
export interface RuntimeInstancePayload {
  name?: string
  environment?: string | null
  serviceName?: string | null
  enabled?: boolean
  serverMode?: string | null
  serverId?: number | null
  externalBaseUrl?: string | null
  logEnabled?: boolean
  logPaths?: string[]
  healthEnabled?: boolean
  healthProbeType?: string | null
  healthTarget?: string | null
}

/* ══ 日志详情 ══ */

/** GitPilot 流水线运行日志详情。 */
export interface AiClubPipelineRunLogDetail {
  projectName: string
  pipelineName: string
  repoFullName: string | null
  runNumber: number
  status: string | null
  branch: string | null
  url: string | null
  startedAt: string | null
  finishedAt: string | null
  consoleLog: string
}

/** Jenkins 构建日志详情。 */
export interface JenkinsBuildLogDetail {
  projectName: string
  jenkinsServerName: string
  jobName: string
  buildNumber: number
  result: string | null
  building: boolean | null
  executedAt: string | null
  durationMillis: number | null
  durationText: string | null
  url: string | null
  description: string | null
  consoleLog: string
}

/* ══ 可观测性项目详情 ══ */

/** 可观测性项目详情（含运行实例列表）。 */
export interface ObservabilityProjectDetail {
  summary: ObservabilityProjectItem
  instances: RuntimeInstanceItem[]
}

/* ══ 流水线配置状态 ══ */

/** GitPilot 流水线配置状态。 */
export interface AiClubPipelineConfigStatus {
  status: string
  branch: string | null
  configPath: string | null
  message: string | null
  checkedAt: string | null
}

/* ══ GitPilot 流水线创建/更新请求载荷 ══ */

/** 创建/更新 GitPilot 流水线的请求载荷。 */
export interface AiClubPipelinePayload {
  projectId: number
  gitlabBindingId: number
  name: string
  defaultBranch?: string | null
  configPath?: string | null
  enabled: boolean
}
