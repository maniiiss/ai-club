import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeAssistantReferenceRoute, resolveAssistantReferenceHref } from '../src/lib/assistantReferenceUtils'

describe('GitPilot 引用对象路由', () => {
  it('将历史计划路由兼容到公众端计划页并保留定位参数', () => {
    assert.equal(
      normalizeAssistantReferenceRoute('/projects/12/iterations?openTaskId=34#detail'),
      '/projects/12/planning?openTaskId=34#detail',
    )
  })

  it('保留公众端当前路由和查询参数', () => {
    assert.equal(
      normalizeAssistantReferenceRoute('/projects/12/knowledge?spaceId=7&pageId=8'),
      '/projects/12/knowledge?spaceId=7&pageId=8',
    )
    assert.equal(resolveAssistantReferenceHref({ route: '/dashboard' }), '/dashboard')
  })

  it('拒绝外部地址、脚本地址和空路由', () => {
    assert.equal(normalizeAssistantReferenceRoute('https://example.com'), null)
    assert.equal(normalizeAssistantReferenceRoute('//example.com/path'), null)
    assert.equal(normalizeAssistantReferenceRoute('javascript:alert(1)'), null)
    assert.equal(normalizeAssistantReferenceRoute(''), null)
  })
})
