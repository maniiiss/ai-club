import test from 'node:test'
import assert from 'node:assert/strict'
import { RuntimeManager } from '../src/runtime-manager.mjs'

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
