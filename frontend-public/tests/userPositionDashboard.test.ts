import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('用户定位工作台契约', () => {
  it('注册页必须提交五类用户定位，首页据定位渲染关注项', () => {
    const register = readFileSync(new URL('../src/pages/auth/RegisterPage.tsx', import.meta.url), 'utf8')
    const dashboard = readFileSync(new URL('../src/pages/dashboard/DashboardPage.tsx', import.meta.url), 'utf8')
    const dashboardTypes = readFileSync(new URL('../src/types/dashboard.ts', import.meta.url), 'utf8')

    assert.match(register, /userPosition: form\.userPosition/)
    assert.match(register, /PROJECT_MANAGER/)
    assert.match(register, /TECHNICAL_MANAGER/)
    assert.match(dashboard, /PositionFocusSection/)
    assert.match(dashboard, /userPosition === 'DEVELOPER'/)
    assert.match(dashboard, /item\.category === 'BUILD'/)
    assert.match(dashboardTypes, /DashboardFocusItem/)
  })
})
