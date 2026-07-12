import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('需求 AI 弹窗通过执行中心后台运行并恢复结果', async () => {
  const source = await readFile(new URL('../src/components/RequirementAiDialog.vue', import.meta.url), 'utf8')

  assert.match(source, /'IDLE'[^\n]*'SUBMITTING'[^\n]*'RUNNING'[^\n]*'COMPLETED'[^\n]*'FAILED'/)
  assert.match(source, /getExecutionTaskDetail/)
  assert.match(source, /getExecutionRunDetail/)
  assert.match(source, /REQUIREMENT_AI_RESULT/)
  assert.match(source, /localStorage/)
  assert.match(source, /查看执行详情/)
  assert.match(source, /normalizeRequirementAiImageMarkdown/)
  assert.match(source, /:upload-image="uploadMarkdownImage"/)
})
