import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeGeneratedMarkdown } from '../src/lib/markdownUtils'

describe('normalizeGeneratedMarkdown - 工单号保护', () => {
  it('不应把表格行内的数字开头工单号（# 6I4IXF)）误判为一级标题', () => {
    // 复现线上 bug：周报表格中「（# 6I4IXF)」被渲染成 h1 巨型标题
    const input = [
      '| 日期 | 工作内容 | 状态 |',
      '|---|---|---|',
      '| 3/16 | 修复【0429生成反馈】中标交底推进草稿箱提交报错（# 6I4IXF) | ✅ 已通过 |',
      '| 3/12 | 修复...（# UZ69HL) | ✅ 已通过 |',
    ].join('\n')

    const result = normalizeGeneratedMarkdown(input)

    // 修复前：# 6I4IXF) 会被单独断行成一级标题；修复后：应保留在表格单元格内
    const headingLines = result.split('\n').filter((line) => /^#\s/.test(line))
    assert.equal(headingLines.length, 0, `不应产生行首标题，实际产生：${JSON.stringify(headingLines)}`)
    // 工单号应保留在原表格行内，不被断行
    assert.match(result, /修复【0429生成反馈】中标交底推进草稿箱提交报错（# 6I4IXF\)/, '工单号应保留在表格行内')
  })

  it('应保留表格行内字母开头工单号（# UZ69HL)）原样', () => {
    const input = '| 3/12 | 修复【通用】使用资质要求-回显字段错误（# UZ69HL) | ✅ 已通过 |'
    const result = normalizeGeneratedMarkdown(input)
    const headingLines = result.split('\n').filter((line) => /^#\s/.test(line))
    assert.equal(headingLines.length, 0, '不应产生行首标题')
    assert.match(result, /（# UZ69HL\)/, '工单号应保留原样')
  })

  it('应保护行内紧贴括号的工单号（#ABC123)）在表格单元格内不被断成标题', () => {
    const input = '| 需求 | 参见（#ABC123） | 进行中 |'
    const result = normalizeGeneratedMarkdown(input)
    const headingLines = result.split('\n').filter((line) => /^#/.test(line))
    assert.equal(headingLines.length, 0, '不应产生行首标题')
  })
})

describe('normalizeGeneratedMarkdown - 标题回归保护', () => {
  it('应保留真正的行首一级标题', () => {
    const input = '# 第一周工作计划\n\n正文内容'
    const result = normalizeGeneratedMarkdown(input)
    assert.match(result, /^# 第一周工作计划$/m, '行首真标题不应被转义')
  })

  it('应保留真正的行首二级标题', () => {
    const input = '## 子标题\n\n正文'
    const result = normalizeGeneratedMarkdown(input)
    assert.match(result, /^## 子标题$/m)
  })

  it('应正确断开粘连在正文后的数字标题（非表格行）', () => {
    // 非表格行内「正文#1」这类粘连的真标题仍应被断行
    const input = '前置说明# 1. 开始部分'
    const result = normalizeGeneratedMarkdown(input)
    assert.match(result, /^# 1\. 开始部分$/m, '非表格行的数字标题应被断行')
  })

  it('不应误伤行内的多井号文本（### ABCD需求）', () => {
    const input = '前文 ### ABCD需求 后文'
    const result = normalizeGeneratedMarkdown(input)
    // 多井号不应被误转义
    assert.doesNotMatch(result, /\\###/, '多井号不应被转义')
  })
})

describe('normalizeGeneratedMarkdown - 孤立强调标记清理', () => {
  it('应清理全角冒号后行尾的孤立单星号（核心风险：*）', () => {
    // 复现线上反馈：AI 输出「核心风险：*」末尾孤立 * 显示为多余星号
    const input = '核心风险：*\n关键任务已阻塞** 工作项：** \n`LHR8GU` '
    const result = normalizeGeneratedMarkdown(input)
    // 孤立 * 应被清理，不再出现在「核心风险：」后
    assert.doesNotMatch(result, /核心风险：\*/, '全角冒号后孤立星号应被清理')
    // 合法加粗 **工作项：** 应保留
    assert.match(result, /\*\*工作项：\*\*/)
    // 工单号代码应保留
    assert.match(result, /`LHR8GU`/)
  })

  it('应清理单独成行的全角标点后孤立星号', () => {
    assert.equal(normalizeGeneratedMarkdown('核心风险：*'), '核心风险：')
    assert.equal(normalizeGeneratedMarkdown('风险：*'), '风险：')
  })

  it('应清理换行前的孤立星号（说明：*\\n下一行）', () => {
    const result = normalizeGeneratedMarkdown('说明：*\n下一行')
    assert.doesNotMatch(result, /说明：\*/, '换行前孤立星号应被清理')
    assert.match(result, /下一行/)
  })

  it('应保留合法的单星斜体（*重点*）', () => {
    assert.equal(normalizeGeneratedMarkdown('这是*重点*内容'), '这是*重点*内容')
    assert.equal(normalizeGeneratedMarkdown('说明：*重点*结束'), '说明：*重点*结束')
    assert.equal(normalizeGeneratedMarkdown('风险：*高*，需关注'), '风险：*高*，需关注')
  })

  it('不应把列表标记（* 项目A）当孤立星号清理', () => {
    // 列表标记 * 后跟空格和内容，不应被清理
    const result = normalizeGeneratedMarkdown('列表：* 项目A')
    assert.match(result, /\* 项目A/)
  })
})

describe('normalizeGeneratedMarkdown - 全角井号归一化', () => {
  it('应把行首全角井号 ＃＃＃ 归一化为半角，使 ATX 标题被正确识别', () => {
    // 复现线上反馈：AI 输出全角 ＃＃＃ 导致 ### 原样显示，未渲染成标题
    const input = '根据当前 CRM项目的概况，我来分析一下最大的风险点。\n\n从项目数据来看，目前最突出的风险是 一个关键任务已处于阻塞状态：\n\n＃＃＃ 🔴最大风险： 核心功能任务已阻塞'
    const result = normalizeGeneratedMarkdown(input)
    // 全角 ＃ 不应残留，应转为半角 #
    assert.doesNotMatch(result, /＃/, '全角井号应被归一化为半角')
    // 应生成半角 ### 标题行
    assert.match(result, /^### 🔴最大风险： 核心功能任务已阻塞$/m)
  })

  it('应处理全角井号无空格形式（＃＃＃🔴），补空格后识别为标题', () => {
    const result = normalizeGeneratedMarkdown('＃＃＃🔴最大风险')
    assert.doesNotMatch(result, /＃/)
    assert.match(result, /^### 🔴最大风险$/m)
  })

  it('应处理全角一级标题（＃ 标题）', () => {
    const result = normalizeGeneratedMarkdown('＃ 标题')
    assert.doesNotMatch(result, /＃/)
    assert.match(result, /^# 标题$/m)
  })

  it('应处理全角半角混合井号（＃＃# 标题）', () => {
    const result = normalizeGeneratedMarkdown('＃＃# 标题')
    assert.doesNotMatch(result, /＃/)
    assert.match(result, /^### 标题$/m)
  })

  it('应处理缩进的全角井号标题（  ＃＃ 缩进标题）', () => {
    const result = normalizeGeneratedMarkdown('  ＃＃ 缩进标题')
    assert.doesNotMatch(result, /＃/)
    assert.match(result, /## 缩进标题/)
  })

  it('不应转换正文中的全角井号（参见编号＃123）', () => {
    const result = normalizeGeneratedMarkdown('参见编号＃123了解详情')
    // 正文中的全角井号应保留，不转换
    assert.match(result, /编号＃123/)
  })

  it('行首全角井号工单号应正确转义（＃AAC896）', () => {
    const result = normalizeGeneratedMarkdown('＃AAC896 |移动端缺陷 |待开始 |')
    // 全角井号归一化后，工单号转义逻辑应生效
    assert.doesNotMatch(result, /＃/)
    assert.doesNotMatch(result, /^#AAC896/m, '不应变成一级标题')
    assert.match(result, /\\#AAC896/)
  })
})

describe('normalizeGeneratedMarkdown - 括号内空行打断合并', () => {
  it('应合并全角括号内被空行打断的短内容（项目（项目\\n\\n4））', () => {
    // 复现线上反馈：AI 在括号内编号间插入空行，react-markdown 把括号拆成两段
    const input = '根据当前 CRM项目（项目\n\n4）的数据，我来分析一下项目面临的主要风险：'
    const result = normalizeGeneratedMarkdown(input)
    assert.match(result, /项目（项目4）/, '括号内空行应被合并')
    assert.doesNotMatch(result, /项目（项目\n/, '不应残留空行')
  })

  it('应合并半角括号内被空行打断的短内容', () => {
    const result = normalizeGeneratedMarkdown('根据当前 CRM项目(项目\n\n4)的数据')
    assert.match(result, /\(项目4\)/)
  })

  it('应合并多空行打断的括号短内容', () => {
    const result = normalizeGeneratedMarkdown('项目（项目\n\n\n\n4）的数据')
    assert.match(result, /项目（项目4）的数据/)
  })

  it('应合并右括号前空行（项目4\\n\\n））', () => {
    const result = normalizeGeneratedMarkdown('项目（项目4\n\n）的数据')
    assert.match(result, /项目（项目4）的数据/)
  })

  it('应合并编号类短内容（任务（ID\\n\\n5））', () => {
    const result = normalizeGeneratedMarkdown('任务（ID\n\n5）已完成')
    assert.match(result, /任务（ID5）已完成/)
  })

  it('不应合并合法的多段括号内容（两侧内容较长）', () => {
    // 两段都是完整句子，空行是合法段落分隔，不应合并
    const input = '（根据当前项目数据分析\n\n可以得出结论）的说明'
    const result = normalizeGeneratedMarkdown(input)
    assert.match(result, /\n\n/, '合法多段空行应保留')
  })

  it('不应改动无空行的正常括号', () => {
    const input = '项目（项目4）的数据'
    const result = normalizeGeneratedMarkdown(input)
    assert.match(result, /项目（项目4）的数据/)
  })
})
