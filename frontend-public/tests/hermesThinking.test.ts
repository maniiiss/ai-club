import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { splitHermesMessageContent } from '../src/lib/hermesThinking'

describe('splitHermesMessageContent - Hermes 思考过程展示', () => {
  it('应将成对 think 标签中的内容拆为默认可折叠的思考片段', () => {
    const sections = splitHermesMessageContent('开始查询。<think>先确认迭代，再统计工作项。</think>查询结果：共有 53 个工作项。')

    assert.deepEqual(sections, [
      { type: 'final', content: '开始查询。', completed: true },
      { type: 'thinking', content: '先确认迭代，再统计工作项。', completed: true },
      { type: 'final', content: '查询结果：共有 53 个工作项。', completed: true },
    ])
  })

  it('应兼容流式传输中尚未闭合的 think 块，并标记为进行中', () => {
    const sections = splitHermesMessageContent('<think>正在读取项目上下文')

    assert.deepEqual(sections, [
      { type: 'thinking', content: '正在读取项目上下文', completed: false },
    ])
  })

  it('应移除孤立 think 结束标签，避免标签原样显示在助手消息中', () => {
    const sections = splitHermesMessageContent('已完成。</think>这是正式结论。')

    assert.deepEqual(sections, [
      { type: 'final', content: '已完成。这是正式结论。', completed: true },
    ])
  })
})
