/**
 * 测试与执行模块类型定义。
 * 涵盖测试计划、测试用例、执行任务、执行运行和产物。
 */

/** 测试用例步骤。 */
export interface TestCaseStepItem {
  id: number | null
  stepNo: number
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
