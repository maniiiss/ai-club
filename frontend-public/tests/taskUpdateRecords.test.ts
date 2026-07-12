import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = join(import.meta.dirname, '..', 'src')
const planningApi = readFileSync(join(root, 'api', 'planning.ts'), 'utf8')
const planningTypes = readFileSync(join(root, 'types', 'planning.ts'), 'utf8')
const planningPage = readFileSync(join(root, 'pages', 'planning', 'PlanningPage.tsx'), 'utf8')
const timeline = readFileSync(join(root, 'components', 'planning', 'WorkItemUpdateTimeline.tsx'), 'utf8')

test('工作项更新记录契约', async (t) => {
  await t.test('提供分页查询 API 和类型', () => {
    assert.match(planningApi, /update-records/)
    assert.match(planningApi, /pageTaskUpdateRecords/)
    assert.match(planningTypes, /TaskUpdateRecord/)
  })

  await t.test('计划详情展示更新记录时间线', () => {
    assert.match(planningPage, /WorkItemUpdateTimeline/)
    assert.match(timeline, /更新记录/)
    assert.match(timeline, /pageTaskUpdateRecords/)
  })

  await t.test('评论和更新记录是默认评论的双 Tab，并显示数量', () => {
    assert.match(planningPage, /useState<DetailTab>\('detail'\)/)
    assert.match(planningPage, /detail-activity-tabs/)
    assert.match(planningPage, /activityTab === 'comments'/)
    assert.match(planningPage, /activityTab === 'updateRecords'/)
    assert.match(planningPage, /detailTabs.*detail/s)
    assert.match(planningPage, /detail-activity-tabs[^"']*min-h-\[420px\]/)
  })

  await t.test('更新记录 Tab 不重复渲染时间线标题', () => {
    assert.doesNotMatch(timeline, /字段与协作动作/)
  })
})
