import test from 'node:test'
import assert from 'node:assert/strict'
import { RuntimeManager, normalizeThinkingLevel, resolvePiModel } from '../src/runtime-manager.mjs'

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
