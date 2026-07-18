import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('日期范围选择器使用单个双月 DayPicker 处理跨月范围', async () => {
  const source = await readFile(new URL('../src/components/common/DateRangePicker.tsx', import.meta.url), 'utf8')
  const dayPickerInstances = source.match(/<DayPicker\b/g) || []

  assert.equal(dayPickerInstances.length, 1)
  assert.match(source, /month=\{leftMonth\}/)
  assert.match(source, /onMonthChange=\{setLeftMonth\}/)
  assert.match(source, /numberOfMonths=\{2\}/)
  assert.match(source, /resetOnSelect: true/)
  assert.match(source, /clickCountRef\.current >= 2 && from && to\)/)
  assert.doesNotMatch(source, /from !== to/)
  assert.doesNotMatch(source, /rightMonth/)
})
