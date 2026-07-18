import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('批量规划操作通过单次服务端接口提交', async () => {
  const planningApi = await readFile(new URL('../src/api/planning.ts', import.meta.url), 'utf8')
  const requirementAiApi = await readFile(new URL('../src/api/requirementAi.ts', import.meta.url), 'utf8')
  const planningPage = await readFile(new URL('../src/pages/planning/PlanningPage.tsx', import.meta.url), 'utf8')

  assert.match(planningApi, /http\.put<ApiResponse<BatchWorkItemOperationResult\[\]>>\('\/api\/tasks\/batch'/)
  assert.match(planningApi, /http\.put<ApiResponse<WorkItemInlineUpdateResult>>\(`\/api\/tasks\/\$\{id\}\/inline`/)
  assert.match(planningApi, /http\.delete<ApiResponse<BatchWorkItemOperationResult\[\]>>\('\/api\/tasks\/batch'/)
  assert.match(requirementAiApi, /'\/api\/public\/tasks\/batch-requirement-ai'/)
  assert.match(planningPage, /await batchUpdateWorkItems\(payload\)/)
  assert.match(planningPage, /await batchDeleteWorkItems\(selectedSnapshot\.map/)
  assert.match(planningPage, /await generateBatchRequirementAi\(selectedSnapshot\.map/)
  assert.doesNotMatch(planningPage, /for \(const item of selectedSnapshot\)[\s\S]{0,300}generateRequirementAi/)
})
