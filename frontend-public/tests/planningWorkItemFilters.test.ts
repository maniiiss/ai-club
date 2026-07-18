import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('公众端工作项列表支持负责人和高级筛选', async () => {
  const types = await readFile(new URL('../src/types/planning.ts', import.meta.url), 'utf8')
  const page = await readFile(new URL('../src/pages/planning/PlanningPage.tsx', import.meta.url), 'utf8')
  const assigneePicker = await readFile(new URL('../src/components/common/AssigneePicker.tsx', import.meta.url), 'utf8')
  const select = await readFile(new URL('../src/components/common/Select.tsx', import.meta.url), 'utf8')

  assert.match(types, /assigneeUserId\?: number/)
  assert.match(types, /assigneeUnassigned\?: boolean/)
  assert.match(types, /createdFrom\?: string/)
  assert.match(types, /planDateTo\?: string/)
  assert.match(types, /sortBy\?: WorkItemSortField/)
  assert.match(page, /<AssigneeFilterPicker/)
  assert.match(assigneePicker, /未分配/)
  assert.match(assigneePicker, /我负责的/)
  assert.match(assigneePicker, /GroupLabel label="项目成员"/)
  assert.match(assigneePicker, /GroupLabel label="企业成员"/)
  assert.match(page, /label="高级筛选"|高级筛选/)
  assert.match(page, /label="创建时间"/)
  assert.match(page, /label="计划时间"/)
  assert.match(page, /label="优先级"/)
  assert.match(page, /absolute right-0 top-full z-50/)
  assert.match(select, /data-select-menu/)
  assert.match(page, /document\.addEventListener\('click', handleOutsideClick\)/)
  assert.match(page, /<SlidersHorizontal className="h-3\.5 w-3\.5" \/>\n\s+筛选/)
  assert.match(page, /aria-label="关闭高级筛选"/)
  assert.match(page, /<SortableWorkItemHeader label="工作项"/)
  assert.match(page, /<SortableWorkItemHeader label="创建时间"/)
})

test('高级日期筛选先保存草稿，点击应用后才提交查询状态', async () => {
  const page = await readFile(new URL('../src/pages/planning/PlanningPage.tsx', import.meta.url), 'utf8')

  assert.match(page, /const \[advancedFilterDraft, setAdvancedFilterDraft\]/)
  assert.match(page, /setAdvancedFilters\(\{ \.\.\.advancedFilterDraft \}\)/)
  assert.match(page, /onClick=\{applyAdvancedFilters\}/)
})
