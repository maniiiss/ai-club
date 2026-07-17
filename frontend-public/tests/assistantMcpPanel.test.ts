import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('GitPilot MCP panel exposes personal service management controls', () => {
  const panel = fs.readFileSync(new URL('../src/components/assistant/AssistantMcpPanel.tsx', import.meta.url), 'utf8')
  const api = fs.readFileSync(new URL('../src/api/assistant.ts', import.meta.url), 'utf8')
  assert.match(panel, /外部 MCP 服务/)
  assert.match(panel, /测试并发现工具/)
  assert.match(panel, /默认所有工具都需要确认/)
  assert.match(panel, /工具启用与确认策略/)
  assert.match(panel, /toolConfirmationOverrides/)
  assert.match(panel, /toolEnabledOverrides/)
  assert.match(panel, /role="switch"/)
  assert.match(panel, /已启用/)
  assert.match(panel, /可自动调用（人工授权）/)
  assert.match(api, /\/api\/assistant\/mcp-servers/)
})
