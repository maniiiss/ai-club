import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlatformTools } from '../src/agent-tools.mjs'

test('builds runtime-neutral tool definitions with backend schema and canonical code', async () => {
  const calls = []
  const tools = createPlatformTools({
    sessionToken: 'session-token',
    executeTool: async (request) => {
      calls.push(request)
      return { summary: '项目查询完成' }
    },
    tools: [{
      toolCode: 'project.search',
      name: 'project__search',
      displayName: '搜索项目',
      description: '按名称搜索项目',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string' } },
        required: ['keyword'],
        additionalProperties: false,
      },
    }],
  })

  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'project__search')
  assert.deepEqual(tools[0].parameters.required, ['keyword'])

  const result = await tools[0].execute('call-1', { keyword: 'CRM' }, new AbortController().signal)
  assert.equal(result.content[0].text, JSON.stringify({ summary: '项目查询完成' }))
  assert.deepEqual(calls, [{
    sessionToken: 'session-token',
    toolCode: 'project.search',
    arguments: { keyword: 'CRM' },
  }])
})

test('keeps legacy allowlist fallback for older runtime requests', () => {
  const tools = createPlatformTools({
    executeTool: async () => ({ ok: true }),
    allowedTools: ['project.search'],
  })

  assert.equal(tools[0].name, 'platform_project_search')
  assert.equal(tools[0].label, 'project.search')
})
