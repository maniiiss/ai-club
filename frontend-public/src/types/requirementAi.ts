/**
 * 需求 AI 助手类型定义。
 * 对齐后端 TaskRequirementAiResult / TaskRequirementAiSuggestion / TaskRequirementAiTestCaseSuggestion。
 * 模型由后端自动选择，公众端不需要指定 modelConfigId。
 */

/** AI 生成的子任务拆解建议。 */
export interface TaskSuggestionItem {
  name: string
  /** 任务细分类型，创建拆解子任务时写入 taskType。 */
  taskType: string
  /** 兼容旧版后端/缓存返回的 category，前端统一归一化为 taskType。 */
  category?: string
  priority: string
  description: string
}

/** AI 生成的测试用例步骤建议。 */
export interface TestCaseStepSuggestionItem {
  stepNo: number
  action: string
  expectedResult: string
}

/** AI 生成的测试用例建议。 */
export interface TestCaseSuggestionItem {
  title: string
  moduleName: string
  caseType: string
  priority: string
  precondition: string
  remarks: string
  steps: TestCaseStepSuggestionItem[]
}

/** 标准化结果中的受控图片资产元数据。 */
export interface RequirementAiResultImage {
  assetId: number
  mediaType: string
  altText: string
  sourceName: string
  order: number
  section: string
  renderUrl: string
}

/** AI 生成结果（统一结构，对齐后端 TaskRequirementAiResult）。 */
export interface RequirementAiResult {
  action: string
  title: string
  markdown: string
  modelConfigId: number | null
  modelConfigName: string | null
  taskSuggestions: TaskSuggestionItem[]
  testCaseSuggestions: TestCaseSuggestionItem[]
  images?: RequirementAiResultImage[]
}

/** AI 生成请求参数。 */
export interface RequirementAiRequest {
  action: string
}

/** 公众端批量需求 AI 的单条任务创建结果。 */
export interface BatchRequirementAiOperationResult {
  taskId: number
  executionTask: import('@/src/types/execution').ExecutionTaskItem | null
  errorMessage: string | null
}
