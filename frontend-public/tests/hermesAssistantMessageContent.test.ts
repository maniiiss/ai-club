import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'node:test'

import { HermesAssistantMessageContent } from '../src/components/hermes/HermesAssistantMessageContent'
import { normalizeGeneratedMarkdown } from '../src/lib/markdownUtils'

describe('HermesAssistantMessageContent - 聊天室 Hermes 展示', () => {
  it('应折叠 think 内容，并渲染经过修复的加粗统计标签', () => {
    const rawContent = '查询完成。<think>正在确认 ** 20260528迭代** 的工作项。</think>\n- 总数：* 53 个工作项\n- 已完成：24 - ** 待办的： ** 13'
    const html = renderToStaticMarkup(createElement(HermesAssistantMessageContent, {
      content: normalizeGeneratedMarkdown(rawContent),
    }))

    assert.match(html, /<details/)
    assert.match(html, /查看思考过程/)
    assert.match(html, /<strong>20260528迭代<\/strong>/)
    assert.match(html, /<strong>待办的：<\/strong> 13/)
    assert.match(html, /总数： 53 个工作项/)
    assert.doesNotMatch(html, /&lt;think&gt;|&lt;\/think&gt;/)
  })
})
