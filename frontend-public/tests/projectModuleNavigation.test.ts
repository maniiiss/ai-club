import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('项目测试与执行模块导航', () => {
  it('将测试和执行中心作为两个独立的项目导航入口', () => {
    const nav = read('src/components/navigation/ProjectNav.tsx')
    const detail = read('src/pages/projects/ProjectDetailPage.tsx')

    assert.match(nav, /path: 'testing', label: '测试'/)
    assert.match(nav, /path: 'execution', label: '执行中心'/)
    assert.doesNotMatch(nav, /测试与执行/)
    assert.match(detail, /path: 'testing'/)
    assert.match(detail, /label: '测试'/)
    assert.match(detail, /path: 'execution'/)
    assert.match(detail, /label: '执行中心'/)
  })

  it('为两个入口配置独立页面路由，并保留旧测试计划详情地址兼容', () => {
    const router = read('src/app/router.tsx')

    assert.match(router, /path: 'testing', element: <TestPlansPage \/>/)
    assert.match(router, /path: 'execution', element: <ExecutionCenterPage \/>/)
    assert.match(router, /projects\/:projectId\/testing\/test-plans\/:planId/)
    assert.match(router, /projects\/:projectId\/execution\/test-plans\/:planId/)
  })

  it('移除执行页面内部的合并 Tab', () => {
    const page = read('src/pages/execution/ExecutionPage.tsx')

    assert.match(page, /export const TestPlansPage/)
    assert.match(page, /export const ExecutionCenterPage/)
    assert.doesNotMatch(page, /type ExecutionTab/)
    assert.doesNotMatch(page, /const tabs:/)
  })
})
