/**
 * 研发模块类型定义。
 * 涵盖 GitLab 仓库绑定、产品分支、代码结构。
 */

/** 项目 GitLab 仓库绑定。 */
export interface ProjectGitlabBindingItem {
  id: number
  projectId: number
  projectName: string
  apiBaseUrl: string
  gitlabProjectRef: string
  gitlabProjectId: string | null
  gitlabProjectName: string | null
  gitlabProjectPath: string | null
  gitlabProjectWebUrl: string | null
  defaultTargetBranch: string | null
  productMainBranch: string | null
  tokenConfigured: boolean
  enabled: boolean
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestedAt: string | null
  codeStructureStatus: string | null
  codeStructureGeneratedAt: string | null
  codeStructureDegraded: boolean | null
}

/** GitLab 分支。 */
export interface GitlabBranchItem {
  name: string
  defaultBranch: boolean
  protectedBranch: boolean
  merged: boolean
  webUrl: string | null
  latestCommitTitle?: string | null
}

/** 创建 GitLab Tag 的载荷。 */
export interface GitlabTagPayload {
  tagName: string
  branchName: string
  message?: string
}

/** GitLab Tag 创建结果。 */
export interface GitlabTagCreateResultItem {
  projectName: string
  projectRef: string
  branchName: string
  tagName: string
  message: string | null
  targetSha: string | null
  protectedTag: boolean
  webUrl: string | null
  createdAt: string
}

/** GitLab 合并请求。 */
export interface GitlabMergeRequestItem {
  iid: number
  title: string
  state: string
  sourceBranch: string
  targetBranch: string
  draft: boolean
  hasConflicts: boolean
  detailedMergeStatus: string
  pipelineStatus: string
  authorName: string
  webUrl: string
  updatedAt: string
}

/** 产品分支条目。 */
export interface GitlabProductBranchItem {
  id: number
  bindingId: number
  lineCode: string
  lineName: string
  branchName: string
  enabled: boolean
  behindCount: number
  hasDiffWithMainline: boolean
  hasOpenSyncMr: boolean
  openSyncMergeRequestIid: number | null
  openSyncMergeRequestTitle: string | null
  openSyncMergeRequestWebUrl: string | null
  lastSyncStatus: string | null
  lastSyncMessage: string | null
  lastSyncAt: string | null
  lastSyncMrUrl: string | null
}

/** 创建或更新产品分支的载荷。 */
export interface GitlabProductBranchPayload {
  lineCode: string
  lineName: string
  branchName: string
  enabled: boolean
}

/** 产品分支同步日志。 */
export interface GitlabProductBranchSyncLogItem {
  id: number
  productBranchId: number | null
  lineCode: string
  lineName: string
  sourceBranchName: string
  targetBranchName: string
  sourceCommitSha: string | null
  targetCommitSha: string | null
  mergeRequestIid: number | null
  mergeRequestTitle: string | null
  mergeRequestWebUrl: string | null
  result: string
  reason: string | null
  executedByUserId: number | null
  executedAt: string
}

/** 产品分支批量同步请求。 */
export interface GitlabProductBranchSyncPayload {
  productBranchIds: number[]
}

/** 产品分支同步结果明细。 */
export interface GitlabProductBranchSyncRunItem {
  productBranchId: number
  lineCode: string
  lineName: string
  targetBranchName: string
  result: string
  message: string
  behindCount: number | null
  mergeRequestIid: number | null
  mergeRequestWebUrl: string | null
}

/** 产品分支批量同步结果。 */
export interface GitlabProductBranchSyncRunResult {
  bindingId: number
  projectName: string
  sourceBranchName: string
  targetCount: number
  createdCount: number
  noChangeCount: number
  existingOpenMrCount: number
  failedCount: number
  items: GitlabProductBranchSyncRunItem[]
}

/** 代码结构快照。 */
export interface GitlabCodeStructureSnapshotItem {
  bindingId: number
  branch: string | null
  status: string
  generatedAt: string | null
  degraded: boolean | null
  totalFileCount: number
  totalSymbolCount: number
  overviewMarkdown: string | null
  files: GitlabCodeStructureFileItem[]
}

/** 代码结构文件条目。 */
export interface GitlabCodeStructureFileItem {
  path: string
  language: string | null
  symbolCount: number
  lineCount: number
}

/** 质量扫描规则集。 */
export interface RepositoryScanRulesetItem {
  id?: number
  code: string
  name: string
  description: string
  engineType: string
  defaultSelected: boolean
}

/** 自动合并日志条目。 */
export interface GitlabAutoMergeLogItem {
  id: number
  configId: number | null
  configName: string
  triggerType: 'MANUAL' | 'SCHEDULED'
  mergeRequestIid: number | null
  mergeRequestTitle: string | null
  mergeRequestAuthorName: string | null
  result: string
  reason: string
  detailMarkdown: string | null
  webUrl: string | null
  executedAt: string
}

/* ── 自动合并策略 ── */

/** 自动合并流水线目标条目。 */
export interface GitlabAutoMergePipelineTargetItem {
  targetType: 'AI_CLUB' | 'JENKINS' | string
  targetId: number
  targetName: string
  providerName: string
  defaultBranch: string | null
  enabled: boolean
}

/** 自动合并策略条目。 */
export interface GitlabAutoMergeConfigItem {
  id: number
  name: string
  executionMode: 'PROJECT_BOUND' | 'STANDALONE'
  description: string
  bindingId: number | null
  projectId: number | null
  projectName: string
  apiBaseUrl: string
  gitlabProjectRef: string
  tokenConfigured: boolean
  reviewAgentId: number | null
  reviewAgentName: string | null
  aiModelConfigId: number | null
  aiModelConfigName: string | null
  aiModelProvider: string | null
  aiModelName: string | null
  sourceBranch: string | null
  targetBranch: string | null
  titleKeyword: string | null
  enabled: boolean
  autoMerge: boolean
  squashOnMerge: boolean
  removeSourceBranch: boolean
  triggerPipelineAfterMerge: boolean
  requirePipelineSuccess: boolean
  schedulerEnabled: boolean
  schedulerCron: string | null
  nextExecutionTime: string | null
  aiReviewEnabled: boolean
  aiReviewPrompt: string | null
  reviewStrictness: 'HIGH' | 'MEDIUM' | 'LOW'
  pipelineTargets: GitlabAutoMergePipelineTargetItem[]
  lastRunStatus: string | null
  lastRunMessage: string | null
  lastRunAt: string | null
}

/** 创建/更新自动合并策略的表单载荷。 */
export interface GitlabAutoMergeConfigPayload {
  name: string
  executionMode: 'PROJECT_BOUND' | 'STANDALONE'
  description: string
  bindingId: number | null
  apiBaseUrl: string
  gitlabProjectRef: string
  apiToken: string
  sourceBranch: string
  targetBranch: string
  titleKeyword: string
  enabled: boolean
  autoMerge: boolean
  squashOnMerge: boolean
  removeSourceBranch: boolean
  triggerPipelineAfterMerge: boolean
  requirePipelineSuccess: boolean
  schedulerEnabled: boolean
  schedulerCron: string
  reviewAgentId: number | null
  aiModelConfigId?: number | null
  aiReviewEnabled: boolean
  aiReviewPrompt: string
  reviewStrictness: 'HIGH' | 'MEDIUM' | 'LOW'
  pipelineTargets: { targetType: 'AI_CLUB' | 'JENKINS'; targetId: number }[]
}

/** 自动合并立即执行结果中的单条 MR 操作记录。 */
export interface GitlabAutoMergeRunItem {
  iid: number
  title: string
  action: string
  message: string
  webUrl: string
}

/** 自动合并立即执行结果。 */
export interface GitlabAutoMergeRunResult {
  configId: number
  configName: string
  matchedCount: number
  mergedCount: number
  skippedCount: number
  items: GitlabAutoMergeRunItem[]
}

/* ── Webhook ── */

/** 自动合并外发 Webhook 条目（URL 已脱敏）。 */
export interface GitlabAutoMergeWebhookItem {
  id: number
  configId: number
  name: string
  targetUrlMasked: string
  subscribedEvents: string[]
  messageTemplate: string | null
  enabled: boolean
  lastDeliveryAt: string | null
  lastDeliveryStatus: string | null
  lastDeliveryMessage: string | null
}

/** 创建/更新 Webhook 的表单载荷。 */
export interface GitlabAutoMergeWebhookPayload {
  name: string
  targetUrl: string
  subscribedEvents: string[]
  messageTemplate?: string | null
  enabled: boolean
}

/** Webhook 可订阅的事件选项。 */
export const GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'MERGED', label: '合并成功' },
  { value: 'AI_REJECTED', label: 'AI 审核拒绝' },
  { value: 'FAILED', label: '合并失败' },
  { value: 'SKIPPED', label: '已跳过' },
  { value: 'BRANCH_BEHIND', label: '源分支落后' },
  { value: 'EMPTY', label: '无可处理 MR' },
]

/* ── Agent 选项 ── */

/** Agent 轻量选项（用于下拉选择）。 */
export interface AgentOptionItem {
  id: number
  name: string
  type: string
  accessType: string
  builtinCode: string | null
  description: string
}
