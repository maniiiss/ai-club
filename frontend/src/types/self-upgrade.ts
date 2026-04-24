/**
 * 自升级中心使用的环境档案摘要。
 */
export interface SelfUpgradeEnvironmentProfile {
  id: number
  code: string
  name: string
  baseUrl: string
  allowedHostPatternsJson: string
  loginScriptJson: string
  sandboxUsername: string
  sandboxPasswordConfigured: boolean
  sessionStateConfigured: boolean
  writeAllowlistJson: string
  enabled: boolean
}

/**
 * 自升级中心配置单例。
 */
export interface SelfUpgradeCenterConfig {
  id: number
  defaultEnvironmentProfileId: number | null
  carrierProjectId: number | null
  defaultRepositoryBindingIdsJson: string
  developmentPlanAgentId: number | null
  developmentImplementAgentId: number | null
  developmentTestAgentId: number | null
  developmentReportAgentId: number | null
  environmentProfiles: SelfUpgradeEnvironmentProfile[]
}

export interface SelfUpgradePatrolTarget {
  id: number | null
  name: string
  seedUrl: string
  goalPrompt: string
  readySelector: string
  allowWrite: boolean
  writeAllowlistOverrideJson: string
  maxStepsOverride: number | null
  sortOrder: number
  enabled: boolean
}

export interface SelfUpgradePatrolPlan {
  id: number
  name: string
  description: string
  environmentProfileId: number | null
  environmentProfileName: string
  aiModelConfigId: number | null
  aiModelConfigName: string
  aiModelProvider: string
  aiModelName: string
  schedulerCron: string
  schedulerEnabled: boolean
  maxExplorationSteps: number | null
  targetTimeoutSeconds: number | null
  runTimeoutSeconds: number | null
  enabled: boolean
  lastRunStatus: string
  lastRunMessage: string
  lastRunAt: string | null
  lastScheduledAt: string | null
  targets: SelfUpgradePatrolTarget[]
}

export interface SelfUpgradeArtifactLink {
  executionArtifactId: number | null
  artifactType: string
  title: string
  contentRef: string | null
  previewText: string | null
  downloadUrl: string | null
}

export interface SelfUpgradePatrolRunTarget {
  id: number
  planTargetId: number | null
  targetName: string
  seedUrl: string
  status: string
  pagePath: string | null
  stepCount: number | null
  findingCount: number | null
  skippedGuardrailCount: number | null
  summary: string
  artifacts: SelfUpgradeArtifactLink[]
  startedAt: string | null
  finishedAt: string | null
}

export interface SelfUpgradePatrolRun {
  id: number
  planId: number | null
  planName: string
  environmentProfileId: number | null
  environmentProfileName: string
  status: string
  triggerMode: string
  linkedExecutionTaskId: number | null
  totalTargetCount: number | null
  successTargetCount: number | null
  partialSuccessTargetCount: number | null
  failedTargetCount: number | null
  suggestionCount: number | null
  openedSuggestionCount: number | null
  reopenedSuggestionCount: number | null
  summary: string
  createdByUserId: number | null
  createdByName: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
  targets: SelfUpgradePatrolRunTarget[]
}

export interface SelfUpgradeWorkItem {
  id: number
  suggestionId: number | null
  title: string
  description: string
  priority: string
  status: string
  assigneeUserId: number | null
  assigneeUserName: string
  repositoryBindingsJson: string
  executionPrompt: string
  latestExecutionTaskId: number | null
  acceptedByUserId: number | null
  acceptedByName: string
  acceptedAt: string | null
  resolvedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface SelfUpgradeSuggestionCard {
  id: number
  fingerprint: string
  title: string
  category: string
  severity: string
  status: string
  hitCount: number | null
  reopenCount: number | null
  firstFoundAt: string | null
  lastFoundAt: string | null
  latestSummary: string
  latestEvidenceMarkdown: string
  latestRunId: number | null
  latestTargetId: number | null
  linkedWorkItemId: number | null
}

export interface SelfUpgradeSuggestionOccurrence {
  id: number
  runId: number | null
  runTargetId: number | null
  foundAt: string | null
  evidenceMarkdown: string
  artifacts: SelfUpgradeArtifactLink[]
  pagePath: string | null
  domHintJson: string
}

export interface SelfUpgradeSuggestionDetail extends SelfUpgradeSuggestionCard {
  occurrences: SelfUpgradeSuggestionOccurrence[]
  workItem: SelfUpgradeWorkItem | null
}

export interface SelfUpgradeEnvironmentProfilePayload {
  id?: number | null
  code: string
  name: string
  baseUrl: string
  allowedHostPatternsJson?: string
  loginScriptJson?: string
  sandboxUsername?: string
  sandboxPassword?: string
  sessionStateJson?: string | null
  writeAllowlistJson?: string
  enabled?: boolean
}

export interface SelfUpgradeCenterConfigPayload {
  defaultEnvironmentProfileId?: number | null
  carrierProjectId?: number | null
  defaultRepositoryBindingIdsJson?: string
  developmentPlanAgentId?: number | null
  developmentImplementAgentId?: number | null
  developmentTestAgentId?: number | null
  developmentReportAgentId?: number | null
  environmentProfiles?: SelfUpgradeEnvironmentProfilePayload[]
}

export interface SelfUpgradePatrolTargetPayload {
  id?: number | null
  name: string
  seedUrl: string
  goalPrompt?: string
  readySelector?: string
  allowWrite?: boolean
  writeAllowlistOverrideJson?: string
  maxStepsOverride?: number | null
  sortOrder?: number | null
  enabled?: boolean
}

export interface SelfUpgradePatrolPlanPayload {
  name: string
  description?: string
  environmentProfileId: number
  aiModelConfigId: number
  schedulerCron?: string
  schedulerEnabled?: boolean
  maxExplorationSteps?: number | null
  targetTimeoutSeconds?: number | null
  runTimeoutSeconds?: number | null
  enabled?: boolean
  targets?: SelfUpgradePatrolTargetPayload[]
}

export interface SelfUpgradeWorkItemUpdatePayload {
  title: string
  description?: string
  priority: string
  status: string
  assigneeUserId?: number | null
  repositoryBindingsJson?: string
  executionPrompt?: string
}

export interface SelfUpgradeWorkItemCompletePayload {
  status: string
}

export interface SelfUpgradePatrolPlanQuery {
  page: number
  size: number
  keyword?: string
  enabled?: boolean
}

export interface SelfUpgradePatrolRunQuery {
  page: number
  size: number
  planId?: number
  status?: string
}

export interface SelfUpgradeSuggestionQuery {
  page: number
  size: number
  keyword?: string
  status?: string
  category?: string
  severity?: string
}
