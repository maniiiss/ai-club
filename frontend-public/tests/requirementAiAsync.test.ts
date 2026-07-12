import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('公众端需求 AI 后台执行且不发送模型配置', async () => {
  const source = await readFile(new URL('../src/pages/planning/RequirementAiDialog.tsx', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/api/requirementAi.ts', import.meta.url), 'utf8')

  assert.match(source, /'IDLE' \| 'SUBMITTING' \| 'RUNNING' \| 'COMPLETED' \| 'FAILED'/)
  assert.match(source, /getExecutionTaskDetail/)
  assert.match(source, /getExecutionRunDetail/)
  assert.match(source, /REQUIREMENT_AI_RESULT/)
  assert.match(source, /localStorage/)
  assert.match(source, /normalizeRequirementAiImageMarkdown/)
  assert.doesNotMatch(api, /modelConfigId/)
})
