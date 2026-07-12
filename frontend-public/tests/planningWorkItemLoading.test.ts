import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const planningPage = readFileSync(
  join(import.meta.dirname, '..', 'src', 'pages', 'planning', 'PlanningPage.tsx'),
  'utf8',
)

test('工作项空列表加载保持稳定并忽略重复请求结果', () => {
  assert.match(planningPage, /wiLoading && !workItems/)
  assert.match(planningPage, /!workItems && !wiError/)
  assert.match(planningPage, /min-h-\[240px\]/)
  assert.match(planningPage, /boardRequestIdRef/)
  assert.match(planningPage, /workItemRequestIdRef/)
  assert.match(planningPage, /const refreshAll = \(\) => \{ fetchBoard\(\); fetchStats\(\) \}/)
})
