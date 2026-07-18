import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('工作项列表通过日期范围编辑器提交完整计划周期', async () => {
  const planningPage = await readFile(new URL('../src/pages/planning/PlanningPage.tsx', import.meta.url), 'utf8')

  assert.match(planningPage, /onPlanDateChange=\{handleInlineWorkItemDateChange\}/)
  assert.match(planningPage, /<InlinePlanDateRangePicker item=\{item\} onChange=\{onPlanDateChange\} \/>/)
  assert.match(planningPage, /planStartDate: startDate \|\| null/)
  assert.match(planningPage, /planEndDate: endDate \|\| null/)
})

test('工作项列表接入负责人内联编辑', async () => {
  const planningPage = await readFile(new URL('../src/pages/planning/PlanningPage.tsx', import.meta.url), 'utf8')

  assert.match(planningPage, /onAssigneeChange=\{handleInlineWorkItemAssigneeChange\}/)
  assert.match(planningPage, /<InlineAssigneePicker item=\{item\} userOptions=\{userOptions\} projectMemberIds=\{projectMemberIds\} onChange=\{onAssigneeChange\} \/>/)
  assert.match(planningPage, /field: 'ASSIGNEE', assigneeUserId \}/)
})

test('工作项列表展示内联保存中的轻量 loading', async () => {
  const planningPage = await readFile(new URL('../src/pages/planning/PlanningPage.tsx', import.meta.url), 'utf8')

  assert.match(planningPage, /const \[inlineEditingIds, setInlineEditingIds\]/)
  assert.match(planningPage, /inlineEditingIds=\{inlineEditingIds\}/)
  assert.match(planningPage, /Loader2 className="h-3\.5 w-3\.5 animate-spin/)
  assert.match(planningPage, /aria-label="保存中"/)
})
