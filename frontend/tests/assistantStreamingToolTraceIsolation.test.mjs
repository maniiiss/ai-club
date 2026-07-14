import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('streaming assistant trace no longer falls back to global currentDebug state', async () => {
  const source = await readFile(new URL('../src/components/AssistantDrawer.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /message\.toolExecutions \|\| \(\s*message\.id === currentStreamingAssistantMessageId\.value\s*\?\s*currentDebug\.value\?\.toolExecutions \|\| \[\]\s*:\s*\[\]\s*\)/)
})

test('new streaming assistant message starts with its own empty tool execution list', async () => {
  const source = await readFile(new URL('../src/components/AssistantDrawer.vue', import.meta.url), 'utf8')

  assert.match(source, /role: 'assistant', content: '', status: 'streaming', attachments: \[\], toolExecutions: \[\]/)
})
