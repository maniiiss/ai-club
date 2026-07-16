import test from 'node:test'
import assert from 'node:assert/strict'
import { RuntimeManager, normalizeThinkingLevel, resolvePiModel, toPiHistoryMessages } from '../src/runtime-manager.mjs'

test('runtime manager creates stable session and emits lifecycle events', async () => {
  const events = []
  const manager = new RuntimeManager({
    emitEvent: async (event) => events.push(event),
    executeTool: async () => ({ ok: true }),
    modelProvider: '',
    modelId: '',
  })

  await assert.rejects(() => manager.start({ input: 'hello' }), /model provider and model id/)
  assert.equal(events.length, 0)
})

test('runtime manager overrides model base URL and supports custom model ids', () => {
  const model = resolvePiModel('openrouter', 'my-custom-model', 'https://model-gateway.example.com/v1')

  assert.equal(model.id, 'my-custom-model')
  assert.equal(model.baseUrl, 'https://model-gateway.example.com/v1')
  assert.equal(model.api, 'openai-completions')
})

test('normalizes runtime thinking level and keeps unsupported values disabled', () => {
  assert.equal(normalizeThinkingLevel('HIGH'), 'high')
  assert.equal(normalizeThinkingLevel('invalid'), 'off')
  assert.equal(normalizeThinkingLevel(''), 'off')
})

test('converts common AgentRuntime history into valid Pi native messages', () => {
  const model = resolvePiModel('openrouter', 'my-custom-model', 'https://model-gateway.example.com/v1')

  const history = toPiHistoryMessages([
    { role: 'user', content: '第一轮问题' },
    { role: 'assistant', content: '第一轮回答' },
  ], model)

  assert.deepEqual(history[0], { role: 'user', content: '第一轮问题', timestamp: history[0].timestamp })
  assert.equal(history[1].role, 'assistant')
  assert.deepEqual(history[1].content, [{ type: 'text', text: '第一轮回答' }])
  assert.equal(history[1].api, model.api)
  assert.equal(history[1].provider, model.provider)
  assert.equal(history[1].model, model.id)
  assert.equal(history[1].stopReason, 'stop')
})
