/**
 * 需求 AI 助手类型定义。
 * 对齐后端 TaskRequirementAiResult / TaskRequirementAiSuggestion / TaskRequirementAiTestCaseSuggestion。
 * 模型由后端自动选择，公众端不需要指定 modelConfigId。
 */

/** AI 生成的子任务拆解建议。 */
export interface TaskSuggestionItem {
  name: string
  category: string
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

/** AI 生成结果（统一结构，对齐后端 TaskRequirementAiResult）。 */
export interface RequirementAiResult {
  action: string
  title: string
  markdown: string
  modelConfigId: number | null
  modelConfigName: string | null
  taskSuggestions: TaskSuggestionItem[]
  testCaseSuggestions: TestCaseSuggestionItem[]
}

/** AI 生成请求参数。 */
export interface RequirementAiRequest {
  action: string
}
