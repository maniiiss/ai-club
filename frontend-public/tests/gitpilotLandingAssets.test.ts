import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot landing page assets', () => {
  it('uses the three real desktop mode screenshots', () => {
    const page = readFileSync(new URL('../src/pages/landing/GitPilotLandingPage.tsx', import.meta.url), 'utf8')

    for (const asset of ['gitpilot-code-mode.png', 'gitpilot-work-mode.png', 'gitpilot-design-mode.png']) {
      assert.equal(existsSync(new URL(`../public/${asset}`, import.meta.url)), true)
      assert.match(page, new RegExp(`/${asset}`))
    }
  })

  it('marks Work and Design as in development in copy', () => {
    const page = readFileSync(new URL('../src/pages/landing/GitPilotLandingPage.tsx', import.meta.url), 'utf8')

    assert.match(page, /02 \/ Work <span className="gitpilot-landing__mode-status">开发中<\/span>/)
    assert.match(page, /03 \/ Design <span className="gitpilot-landing__mode-status">开发中<\/span>/)
    assert.match(page, /Work 模式开发中/)
    assert.match(page, /Design 模式开发中/)
  })

  it('describes the Web product alongside Desktop modes', () => {
    const page = readFileSync(new URL('../src/pages/landing/GitPilotLandingPage.tsx', import.meta.url), 'utf8')

    assert.match(page, /桌面端与 Web 端<br \/>协同完成每一项工作/)
    for (const feature of ['工作台与项目', '需求与规划', '知识库与聊天室', 'GitPilot AI 助手', '开发、测试与执行', '发布与设计版本']) {
      assert.match(page, new RegExp(feature))
    }
  })
})
