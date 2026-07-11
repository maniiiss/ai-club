/**
 * 测试与执行模块类型定义。
 * 涵盖测试计划、测试用例、执行任务、执行运行和产物。
 */

/** 测试用例步骤。 */
export interface TestCaseStepItem {
  id: number | null
  stepNo: number | null
  action: string
  expectedResult: string
}

/** 测试用例。 */
export interface TestCaseItem {
  id: number | null
  title: string
  moduleName: string
  caseType: string
  priority: string
  precondition: string
  remarks: string
  sortOrder: number
  automationType: string
  automationHint: string
  steps: TestCaseStepItem[]
}

/** 测试计划。 */
export interface TestPlanItem {
  id: number
  name: string
  status: string
  description: string
  projectId: number
  projectName: string
  iterationId: number | null
  iterationName: string | null
  startDate: string | null
  endDate: string | null
  caseCount: number
  automationBindingId: number | null
  automationTargetBranch: string | null
  automationEnabledCaseCount: number
  lastAutomationStatus: string | null
  lastAutomationTaskId: number | null
  lastAutomationRunId: number | null
  lastAutomationSummary: string | null
  lastAutomationAt: string | null
  lastAutomationMrUrl: string | null
  createdAt: string | null
  updatedAt: string | null
  cases: TestCaseItem[]
}

/** 执行产物。 */
export interface ExecutionArtifactItem {
  id: number
  runId: number
  stepId: number | null
  artifactType: string
  title: string
  contentRef: string | null
  contentText: string | null
}

/** 执行运行。 */
export interface ExecutionRunItem {
  id: number
  executionTaskId: number
  runNo: number
  status: string
  progressPercent: number
  currentStepNo: number | null
  currentStepName: string | null
  outputSummary: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

/** 执行任务（列表项）。 */
export interface ExecutionResolvedBindingItem {
  stepNo: number
  stepCode: string
  stepName: string
  agentId: number | null
  agentName: string | null
  accessType: string | null
  runtimeType: string | null
  timeoutSeconds: number | null
  repositoryBindingId: number | null
  repositoryTargetBranch: string | null
  repositoryDisplayName: string | null
}

export interface ExecutionTaskItem {
  id: number
  title: string
  scenarioCode: string
  scenarioName: string
  sourceType: string
  sourceId: number | null
  projectId: number
  projectName: string
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
  status: string
  currentRunId: number | null
  currentRunStatus: string | null
  progressPercent: number
  currentStepNo: number | null
  currentStepName: string | null
  latestSummary: string
  orchestrationVersionId: number | null
  resolvedBindings: ExecutionResolvedBindingItem[]
  planConfirmationRequired: boolean
  planConfirmationPending: boolean
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

/** 执行任务统计。 */
export interface ExecutionTaskListStatsItem {
  totalCount: number
  pendingOrRunningCount: number
  successCount: number
  averageProgressPercent: number
}

/* ── 详情页扩展类型 ── */

/** 执行产物（详情页扩展）。 */
export interface ExecutionArtifactDetailItem {
  id: number
  runId: number
  stepId: number | null
  artifactType: string
  title: string
  contentRef: string | null
  contentText: string | null
  workItemWriteback: boolean
}

/** 执行步骤。 */
export interface ExecutionStepItem {
  id: number
  runId: number
  stepNo: number
  stepCode: string
  stepName: string
  agentId: number | null
  agentName: string | null
  status: string
  progressPercent: number
  latestMessage: string
  currentCommand: string | null
  lastEventId: number | null
  lastEventAt: string | null
  lastHeartbeatAt: string | null
  tailLogText: string | null
  tailLogLineCount: number | null
  hasLiveStream: boolean
  inputSnapshot: string
  outputSnapshot: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
}

/** 执行运行详情（含步骤和产物）。 */
export interface ExecutionRunDetailItem extends ExecutionRunItem {
  lastEventId: number | null
  lastEventAt: string | null
  hasLiveStream: boolean
  steps: ExecutionStepItem[]
  artifacts: ExecutionArtifactDetailItem[]
}

/** 工作区清理摘要。 */
export interface ExecutionWorkspaceCleanupSummaryItem {
  enabled: boolean
  retentionHours: number
  status: string
  executionResultStatus: string | null
  expiresAt: string | null
  deletedAt: string | null
  deleteFailedAt: string | null
  deleteErrorMessage: string | null
  trackedWorkspaceCount: number
  message: string
}

/** 执行任务详情（含运行列表）。 */
export interface ExecutionTaskDetailItem {
  id: number
  title: string
  scenarioCode: string
  scenarioName: string
  sourceType: string
  sourceId: number | null
  triggerSource: string
  projectId: number
  projectName: string
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
  status: string
  cancelRequested: boolean
  latestSummary: string
  createdByUserId: number | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  currentRunId: number | null
  orchestrationVersionId: number | null
  resolvedBindings: ExecutionResolvedBindingItem[]
  inputPayload: string
  planConfirmationRequired: boolean
  planConfirmationPending: boolean
  canCurrentUserConfirmPlan: boolean
  runs: ExecutionRunItem[]
  workspaceCleanup: ExecutionWorkspaceCleanupSummaryItem | null
}

/** SSE 流事件。 */
export interface ExecutionStreamEvent {
  id: number
  runId: number
  stepId: number | null
  stepNo: number | null
  stepName: string | null
  eventType: string
  streamKind: string | null
  text: string | null
  currentCommand: string | null
  progressPercent: number | null
  summary: string | null
  artifactId: number | null
  createdAt: string | null
}
