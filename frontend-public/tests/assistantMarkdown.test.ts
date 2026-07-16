import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'node:test'

import { AssistantMarkdown } from '../src/components/common/AssistantMarkdown'

describe('AssistantMarkdown - 通用助手消息展示', () => {
  it('应折叠思考内容，并归一化正式回复中的 Markdown', () => {
    const rawContent = '查询完成。<think>正在确认 **20260528迭代** 的工作项。</think>\n- 总数：53 个工作项\n- 已完成：24 - **待办的：** 13'
    const html = renderToStaticMarkup(createElement(AssistantMarkdown, { content: rawContent }))

    assert.match(html, /<details/)
    assert.match(html, /查看思考过程/)
    assert.match(html, /<strong>20260528迭代<\/strong>/)
    assert.match(html, /<strong>待办的：<\/strong> 13/)
    assert.match(html, /总数：53 个工作项/)
    assert.doesNotMatch(html, /&lt;think&gt;|&lt;\/think&gt;/)
  })

  it('应把数字伪标题按正文展示，避免编号撑大消息层级', () => {
    const html = renderToStaticMarkup(createElement(AssistantMarkdown, {
      content: '### 4 当前存在的缺陷工作项。\n\n##32等所有依赖 AI 调用任务的基础。',
    }))

    assert.match(html, /<p>4 当前存在的缺陷工作项。<\/p>/)
    assert.match(html, /<p>##32等所有依赖 AI 调用任务的基础。<\/p>/)
    assert.doesNotMatch(html, /<h[1-6]>/)
  })

  it('应把截图中的工单清单渲染为有序列表和正常强调文本', () => {
    const html = renderToStaticMarkup(createElement(AssistantMarkdown, {
      content: `1. **#2C2AKF**
- 投标资源管理-企业资质台账列表，每一列的字段，排序的升序降序都无效 — **延期解决**

2. **#AF376S** 【人员信息】demo账号，当前公司为“湖北工建房地产有限公司”，权限为人资专员，打开人员信息管理页面报错 — **已拒绝**

3. **#B3YSCS** 【PC端】营销激励模块，计提申请和激励申请，提交后的loading阶段，页面宽度一直在变化 — **已拒绝**

4. **#CL5L1V** 【审批详情】企微跳转只保留tab内的内容 — **延期解决**

5. **#D8HZEY**
- 人员信息管理，详情页停留1分钟左右，刷新页面，报错 — **已拒绝**`,
    }))

    assert.match(html, /<ol>/)
    assert.match(html, /<strong>#2C2AKF<\/strong>/)
    assert.match(html, /<strong>#AF376S<\/strong>/)
    assert.match(html, /<strong>延期解决<\/strong>/)
    assert.doesNotMatch(html, /<h[1-6]>/)
    assert.doesNotMatch(html, /\*\*|(?<!\*)\*(?!\*)/)
  })

  it('应渲染中文正文紧贴引号的强调文本', () => {
    const html = renderToStaticMarkup(createElement(AssistantMarkdown, {
      content: '当前平台的项目状态体系中，并没有**"已中标"**这一状态标记。',
    }))

    assert.match(html, /并没有<strong>&quot;已中标&quot;<\/strong>这一状态标记。/)
    assert.doesNotMatch(html, /\*\*|(?<!\*)\*(?!\*)/)
  })
})
