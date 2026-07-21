import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeThinkingLevel, resolvePiModel, toPiHistoryMessages } from '@aiclub/gitpilot-agent-core'
import { isDangerousShell } from '../src/local-tools.js'

test('CLI uses a platform proxy URL while preserving provider protocol', () => {
  const model = resolvePiModel('openai', 'platform-model', 'http://localhost:8080/api/cli/model-sessions/demo')
  assert.equal(model.id, 'platform-model')
  assert.equal(model.baseUrl, 'http://localhost:8080/api/cli/model-sessions/demo')
  assert.equal(model.api, 'openai-completions')
})

test('CLI converts standard history and rejects unsafe shell commands', () => {
  const model = resolvePiModel('openai', 'platform-model', 'http://localhost:8080/proxy')
  const history = toPiHistoryMessages([{ role: 'user', content: '读取文件' }, { role: 'assistant', content: '好的' }], model)
  assert.equal(history.length, 2)
  assert.equal(history[1].content[0].text, '好的')
  assert.equal(normalizeThinkingLevel('HIGH'), 'high')
  assert.equal(isDangerousShell('git reset --hard HEAD'), true)
  assert.equal(isDangerousShell('npm test'), false)
})
