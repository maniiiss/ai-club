import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('工作项列表先乐观更新当前行，再同步保存并在失败时回滚', async () => {
  const source = await readFile(new URL('../src/pages/planning/PlanningPage.tsx', import.meta.url), 'utf8')

  assert.match(source, /const optimisticChanges = field === 'status'/)
  assert.match(source, /applyInlineWorkItemChanges\(item\.id, optimisticChanges\)\n    try \{\n      const updated = await updateWorkItemInline/)
  assert.match(source, /applyInlineWorkItemChanges\(item\.id, \{\s+assignee,/)
  assert.match(source, /applyInlineWorkItemChanges\(item\.id, \{\s+planStartDate: startDate \|\| null,/)
  assert.match(source, /catch \(err\) \{\n      applyInlineWorkItemChanges\(item\.id, \{ \[field\]: item\[field\]/)
})
