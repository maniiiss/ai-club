import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeGeneratedMarkdown, resolveMarkdownContent } from '../src/lib/markdownUtils'

describe('normalizeGeneratedMarkdown - 保守 Markdown 入口', () => {
  it('只统一换行符，不改写普通 Markdown', () => {
    const input = '## 标题\r\n\r\n正文 **加粗**、*斜体* 和 | 表格 |\r\n\r\n- 列表项'

    assert.equal(
      normalizeGeneratedMarkdown(input),
      '## 标题\n\n正文 **加粗**、*斜体* 和 | 表格 |\n\n- 列表项',
    )
  })

  it('保留合法标题、强调、表格和粘连正文的原文', () => {
    const input = '### 合法标题\n\n确认了 **项目**。\n\n| 项目 | 状态 |\n|---|---|\n| 示例项目 | 进行中 |\n\n正文###不是标题'

    assert.equal(normalizeGeneratedMarkdown(input), input)
  })

  it('只保护行首明确的字母数字工单号', () => {
    const input = '#LHR8GU\n# 6I4IXF) | ✅ 已通过 |\n\n正文中引用 #LHR8GU 和 **#2C2AKF**。'
    const result = normalizeGeneratedMarkdown(input)

    assert.equal(result, '\\#LHR8GU\n\\# 6I4IXF) | ✅ 已通过 |\n\n正文中引用 #LHR8GU 和 **#2C2AKF**。')
  })

  it('只把带项目元数据或中文说明的数字伪标题还原为正文', () => {
    const input = '# 4（ID:4，进行中，负责人：管理员）\n### 4 当前存在的缺陷\n\n# 1. 正式章节'

    assert.equal(
      normalizeGeneratedMarkdown(input),
      '4（ID:4，进行中，负责人：管理员）\n4 当前存在的缺陷\n\n# 1. 正式章节',
    )
  })

  it('不处理行内编号，也不处理全角井号等普通文本', () => {
    const input = '示例项目 #4 下有 #LHR8GU。\n参见编号＃123了解详情'

    assert.equal(normalizeGeneratedMarkdown(input), input)
  })
})

describe('resolveMarkdownContent', () => {
  it('禁用归一化时返回原文', () => {
    const raw = '示例项目 #4 中的 **合法强调**\r\n下一行'

    assert.equal(resolveMarkdownContent(raw, false), raw)
  })
})
