import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = async (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('智能体 API 类型允许图片理解接入方式和内置编码', async () => {
  const source = await readSource('../src/api/platform.ts')

  assert.match(source, /accessType:[^\n]*'LLM_VISION'/)
  assert.match(source, /builtinCode\?:[^\n]*'IMAGE_UNDERSTANDING'/)
  assert.match(source, /accessType\?:[^\n]*'LLM_VISION'/)
})

test('智能体管理表单可配置图片理解模型和系统提示词', async () => {
  const source = await readSource('../src/views/AgentView.vue')

  assert.match(source, /accessType:[^\n]*'LLM_VISION'/)
  assert.match(source, /\{ label: '图片理解', value: 'LLM_VISION' \}/)
  assert.match(source, /form\.accessType === 'LLM_VISION'/)
  assert.match(source, /图片理解智能体需要绑定模型配置/)
})
