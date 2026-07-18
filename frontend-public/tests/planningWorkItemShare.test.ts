import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildPlanningIterationPath, buildPlanningIterationRoute, buildPlanningWorkItemPath, buildPlanningWorkItemRoute, buildWorkItemShareUrl } from '../src/lib/planningShareUtils'

const planningPage = readFileSync(join(import.meta.dirname, '..', 'src', 'pages', 'planning', 'PlanningPage.tsx'), 'utf8')
const router = readFileSync(join(import.meta.dirname, '..', 'src', 'app', 'router.tsx'), 'utf8')

describe('计划工作项分享链接', () => {
  it('构造带迭代和工作项路径参数的详情地址，并保留已有参数', () => {
    assert.equal(buildPlanningIterationPath(7, 8), '/projects/7/planning/8')
    assert.equal(buildPlanningWorkItemPath(7, 8, 42), '/projects/7/planning/8/42')
    assert.equal(
      buildPlanningWorkItemRoute(7, 8, 42, '?iterationId=8&view=kanban'),
      '/projects/7/planning/8/42?view=kanban',
    )
  })

  it('关闭抽屉时回到迭代页并清理旧详情参数', () => {
    assert.equal(
      buildPlanningIterationRoute(7, 8, '?iterationId=8&openTaskId=42'),
      '/projects/7/planning/8',
    )
  })

  it('未规划工作项保留无迭代的兼容路径', () => {
    assert.equal(buildPlanningWorkItemPath(7, null, 42), '/projects/7/planning/work-items/42')
  })

  it('构造可直接打开工作项详情抽屉的完整地址', () => {
    assert.equal(
      buildWorkItemShareUrl(
        { origin: 'https://club.example.com', search: '?iterationId=8&openTaskId=42' },
        7,
        8,
        42,
      ),
      'https://club.example.com/projects/7/planning/8/42',
    )
  })

  it('将地址同步和复制入口接入计划详情抽屉', () => {
    assert.match(planningPage, /syncDetailUrl\(id, targetIterationId\)/)
    assert.match(planningPage, /navigator\.clipboard\.writeText\(buildWorkItemShareUrl\(window\.location, item\.projectId, item\.iterationId, item\.id\)\)/)
    assert.match(planningPage, /title="复制工作项链接"/)
    assert.match(planningPage, /const requestedWorkItemId = Number\(workItemId \|\| searchParams\.get\('openTaskId'\)\)/)
    assert.match(planningPage, /const requestedIterationId = Number\(iterationId\)/)
    assert.match(router, /path: 'planning\/:iterationId', element: <PlanningPage \/>/)
    assert.match(router, /path: 'planning\/:iterationId\/:workItemId', element: <PlanningPage \/>/)
  })
})
