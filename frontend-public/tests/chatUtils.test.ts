import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  appendChatStreamDelta,
  containsHermesMention,
  markAgentActionStatusInMessage,
  markAgentSelectionStatusInMessage,
  mergeAgentActionsIntoMessage,
  mergeAgentSelectionCardsIntoMessage,
  mergeChatMessage,
  normalizeGeneratedMarkdown,
  parseChatSocketEvent,
  replaceMentionAtCaret,
  isAgentSelectionCardResolved,
  resolveChatAssistantContent,
  resolveAgentActionStatus,
  resolveMentionQuery,
  insertTextAtCaret,
  resolveChatScrollBehavior,
  shouldCollapseChatSummary,
  shouldShowBackToLatest,
} from '../src/lib/chatUtils'
import type { ChatMessageItem } from '../src/types/chat'

describe('chat utilities', () => {
  it('detects Hermes mentions without matching plain words', () => {
    assert.equal(containsHermesMention('@hermes 帮我汇总'), true)
    assert.equal(containsHermesMention('@Hermes summarize'), true)
    assert.equal(containsHermesMention('这个 hermes 配置是什么'), false)
  })

  it('parses websocket event payloads defensively', () => {
    assert.deepEqual(parseChatSocketEvent('{"type":"PING"}'), { type: 'PING' })
    assert.equal(parseChatSocketEvent('not-json'), null)
  })

  it('merges messages by id without duplicating optimistic updates', () => {
    const existing: ChatMessageItem[] = [message(1, '旧内容')]
    const merged = mergeChatMessage(existing, message(1, '新内容'))
    assert.equal(merged.length, 1)
    assert.equal(merged[0].content, '新内容')
  })

  it('appends streamed Hermes delta to the target assistant message', () => {
    const existing: ChatMessageItem[] = [message(2, '', 'assistant', 'streaming')]
    const merged = appendChatStreamDelta(existing, 2, '你好')
    assert.equal(merged[0].content, '你好')
    assert.equal(merged[0].status, 'streaming')
  })

  it('merges pending actions into the matching assistant message', () => {
    const existing: ChatMessageItem[] = [message(2, '待确认', 'assistant')]
    existing[0].agentTaskId = 88
    const merged = mergeAgentActionsIntoMessage(existing, null, 88, [
      { type: 'CREATE_EXECUTION_TASK', title: '发起执行任务', description: '', requiresConfirm: true, params: { projectId: 1 } },
    ])

    assert.equal(merged[0].actions?.[0]?.title, '发起执行任务')
    assert.equal(merged[0].agentTaskStatus, 'awaiting_confirmation')
  })

  it('merges pending selection cards into the matching assistant message', () => {
    const existing: ChatMessageItem[] = [message(2, '请选择', 'assistant')]
    existing[0].agentTaskId = 88
    const merged = mergeAgentSelectionCardsIntoMessage(existing, null, 88, [{
      slot: 'workItem',
      title: '请选择需求',
      description: '命中多个候选需求',
      resumeQuestion: '继续创建执行任务',
      options: [{
        slot: 'workItem',
        entityType: 'WORK_ITEM',
        entityId: 99,
        title: '支付回调',
        subtitle: '需求 #99',
        route: '',
        matchScore: 0.9,
        matchReasons: ['标题命中'],
      }],
    }])

    assert.equal(merged[0].selectionCards?.[0]?.options[0]?.title, '支付回调')
    assert.equal(merged[0].agentTaskStatus, 'awaiting_selection')
  })

  it('marks action task status without replacing existing actions', () => {
    const existing: ChatMessageItem[] = [message(2, '待确认', 'assistant')]
    existing[0].agentTaskId = 88
    existing[0].actions = [
      { type: 'CREATE_EXECUTION_TASK', title: '发起执行任务', description: '', requiresConfirm: true, params: { projectId: 1 } },
      { type: 'CREATE_TEST_PLAN_DRAFT', title: '创建测试计划', description: '', requiresConfirm: true, params: { projectId: 1 } },
    ]
    const merged = markAgentActionStatusInMessage(existing, null, 88, 'CREATE_EXECUTION_TASK:0:key', 'executed')

    assert.equal(merged[0].agentTaskStatus, 'executed')
    assert.equal(merged[0].actionStatuses?.['CREATE_EXECUTION_TASK:0:key'], 'executed')
    assert.equal(merged[0].actions?.length, 2)
  })

  it('ignores executed action events without a concrete action key', () => {
    const existing: ChatMessageItem[] = [message(2, '待确认', 'assistant')]
    existing[0].agentTaskId = 88
    existing[0].agentTaskStatus = 'awaiting_confirmation'
    existing[0].actions = [
      { type: 'CREATE_WORK_ITEM_DRAFT', title: '创建需求草稿', description: '', requiresConfirm: true, params: { projectId: 1 } },
    ]

    const merged = markAgentActionStatusInMessage(existing, null, 88, '', 'executed')

    assert.equal(merged[0].agentTaskStatus, 'awaiting_confirmation')
    assert.deepEqual(merged[0].actionStatuses || {}, {})
  })

  it('resolves action card status only from the action key status', () => {
    const item = message(2, '待确认', 'assistant')
    item.agentTaskStatus = 'done'
    item.actionStatuses = { 'CREATE_WORK_ITEM_DRAFT:0:key': 'executed' }

    assert.equal(resolveAgentActionStatus(item, 'CREATE_WORK_ITEM_DRAFT:0:key'), 'executed')
    assert.equal(resolveAgentActionStatus(item, 'CREATE_WORK_ITEM_DRAFT:1:other'), '')
  })

  it('normalizes generated bold label markdown with stray inner spaces', () => {
    assert.equal(
      normalizeGeneratedMarkdown('**迭代： **迭代2（进行中，ID:2）\n**需求标题： **营销激励数据权限调整 **需求内容： **营销激励数据权限改为本单位及子单位'),
      '**迭代：** 迭代2（进行中，ID:2）\n**需求标题：** 营销激励数据权限调整 **需求内容：** 营销激励数据权限改为本单位及子单位',
    )
  })

  it('normalizes generated bold markers wrapped around quoted status text', () => {
    assert.equal(
      normalizeGeneratedMarkdown('状态为**"进行中"**的工作项有：'),
      '状态为 **进行中** 的工作项有：',
    )
  })

  it('repairs malformed inline bold markers in Hermes risk prose', () => {
    const normalized = normalizeGeneratedMarkdown(
      '🔴 最高风险：存在**已阻塞*\n- 工作项当前项目中有一个工作项处于**"已阻塞"**状态：\n2. 人力与工作量不匹配：项目共121个任务，但团队成员仅** 4人**，人均任务量约30个',
    )

    assert.doesNotMatch(normalized, /存在\*\*已阻塞\*(?:\n|$)/)
    assert.doesNotMatch(normalized, /\*\*"已阻塞"\*\*/)
    assert.doesNotMatch(normalized, /\*\*\s+4人\*\*/)
    assert.match(normalized, /存在\*\*已阻塞\*\*\n-/)
    assert.match(normalized, /处于 \*\*已阻塞\*\* 状态/)
    assert.match(normalized, /仅\*\*4人\*\*/)
  })

  it('removes orphan emphasis markers from Hermes public risk summaries', () => {
    const normalized = normalizeGeneratedMarkdown(
      [
        '🔴 最大风险： 关键任务已阻塞**工作项',
        '',
        'LHR8GU*',
        '',
        '| 风险类别 | 具体情况 |',
        '|---|---|',
        '| 任务量 vs 人员配比 | 项目共 121个任务，但成员仅** 4人**，人均约30个任务，压力较大 |',
        '',
        '-- - 总结： 当前最紧迫的风险是 **',
        '',
        'LHR8GU任务被阻塞**，建议优先排查阻塞原因。',
      ].join('\n'),
    )

    assert.doesNotMatch(normalized, /阻塞\*\*工作项/)
    assert.doesNotMatch(normalized, /^LHR8GU\*$/m)
    assert.doesNotMatch(normalized, /仅\*\*\s+4人\*\*/)
    assert.doesNotMatch(normalized, /风险是 \*\*$/m)
    assert.doesNotMatch(normalized, /阻塞\*\*，/)
    assert.doesNotMatch(normalized, /^-- -/m)
    assert.match(normalized, /关键任务已阻塞工作项/)
    assert.match(normalized, /^LHR8GU$/m)
    assert.match(normalized, /仅\*\*4人\*\*/)
    assert.match(normalized, /^- \*\*总结：\*\* 当前最紧迫的风险是$/m)
    assert.match(normalized, /LHR8GU任务被阻塞，建议优先排查阻塞原因。/)
  })

  it('keeps malformed ticket-id table rows inside generated tables', () => {
    const normalized = normalizeGeneratedMarkdown(
      [
        '| 编号 | 标题 | 状态 | 负责人 |',
        '|---|---|---|---|',
        '#AAC896 |移动端缺陷 |待开始 | — |',
        '',
        '目前只有这一个缺陷类型的工单。',
      ].join('\n'),
    )

    assert.match(normalized, /\| #AAC896 \| 移动端缺陷 \| 待开始 \| — \|/)
    assert.doesNotMatch(normalized, /^# AAC896/m)
    assert.doesNotMatch(normalized, /^#AAC896/m)
  })

  it('keeps ticket id lines from becoming headings in chat room summaries', () => {
    const normalized = normalizeGeneratedMarkdown(
      [
        '#FOD42G |',
        '',
        '| 已阻塞任务 |1个 | #LHR8GU需推动解决 | 草稿需求 |1个 | #DDWP20新增用户登录手机支持 |',
        '',
        '⚠️ 风险 &下一步 - *',
        '',
        '-',
        '',
        '#LHR8GU',
        '',
        '-',
        '- 已阻塞，需协调后端资源推动解决 -',
        '',
        '#DDWP20',
        '',
        '-',
        '- 草稿需求建议下月进入开发排期 -',
      ].join('\n'),
    )

    assert.match(normalized, /^\\#FOD42G \|$/m)
    assert.match(normalized, /^\\#LHR8GU$/m)
    assert.match(normalized, /^\\#DDWP20$/m)
    assert.doesNotMatch(normalized, /^# FOD42G/m)
    assert.doesNotMatch(normalized, /^# LHR8GU/m)
    assert.doesNotMatch(normalized, /^# DDWP20/m)
    assert.doesNotMatch(normalized, /^\s*[-*+]\s*$/m)
    assert.doesNotMatch(normalized, /下一步 - \*$/m)
    assert.match(normalized, /已阻塞，需协调后端资源推动解决/)
    assert.match(normalized, /草稿需求建议下月进入开发排期/)
  })

  it('keeps spaced ticket id headings from rendering as chat room headings', () => {
    const normalized = normalizeGeneratedMarkdown(
      [
        '# FOD42G |',
        '',
        '⚠️ 风险 &下一步 - *',
        '',
        '-',
        '',
        '# LHR8GU',
        '',
        '-',
        '- 已阻塞，需协调后端资源推动解决 -',
        '',
        '# DDWP20',
        '',
        '-',
        '- 草稿需求建议下月进入开发排期 -',
        '',
        '# CMODCM',
        '',
        '-',
        '- 和',
      ].join('\n'),
    )

    assert.match(normalized, /^\\# FOD42G \|$/m)
    assert.match(normalized, /^\\# LHR8GU$/m)
    assert.match(normalized, /^\\# DDWP20$/m)
    assert.match(normalized, /^\\# CMODCM$/m)
    assert.doesNotMatch(normalized, /^# FOD42G/m)
    assert.doesNotMatch(normalized, /^# LHR8GU/m)
    assert.doesNotMatch(normalized, /^# DDWP20/m)
    assert.doesNotMatch(normalized, /^# CMODCM/m)
    assert.doesNotMatch(normalized, /^\s*[-*+]\s*$/m)
    assert.doesNotMatch(normalized, /下一步 - \*$/m)
    assert.match(normalized, /^- 已阻塞，需协调后端资源推动解决$/m)
    assert.match(normalized, /^- 草稿需求建议下月进入开发排期$/m)
  })

  it('keeps malformed table continuation ticket ids from rendering as chat headings', () => {
    const normalized = normalizeGeneratedMarkdown(
      [
        '3/12 | 修复【通用】项目管理-招标评审-使用资质要求-回显字段错误（',
        '',
        '# UZ69HL) | ✅ 已通过 | |3/13 |修复【PC端】历史数据编辑按钮置灰问题（',
        '# FUVW1R) | ✅ 已通过 | |3/14 |修复【0428生产反馈】新增项目团队成员无法查看数据（',
        '# QL48KE) | ✅ 已通过 |',
        '',
        '\\',
        '',
        '# 6I4IXF) | ✅ 已通过 |',
        '',
        '|3/17 |回归验证已修复5个缺陷，确认线上环境正常 | ✅ 完成 |',
      ].join('\n'),
    )

    assert.match(normalized, /^\\# UZ69HL\) \| ✅ 已通过 \| \|3\/13/m)
    assert.match(normalized, /^\\# FUVW1R\) \| ✅ 已通过 \| \|3\/14/m)
    assert.match(normalized, /^\\# QL48KE\) \| ✅ 已通过 \|$/m)
    assert.match(normalized, /^\\# 6I4IXF\) \| ✅ 已通过 \|$/m)
    assert.doesNotMatch(normalized, /^# UZ69HL\)/m)
    assert.doesNotMatch(normalized, /^# 6I4IXF\)/m)
  })

  it('repairs chat room table rows split before ticket ids', () => {
    const normalized = normalizeGeneratedMarkdown(
      [
        '| 日期 | 工作内容 | 状态 |',
        '|---|---|---|',
        '3/12 | 修复【通用】项目管理-招标评审-使用资质要求-回显字段错误（',
        '# UZ69HL) | ✅ 已通过 | |3/13 |修复【PC端】历史数据编辑按钮置灰问题（',
        '# FUVW1R) | ✅ 已通过 | |3/14 |修复【0428生产反馈】新增项目团队成员无法查看数据（',
        '# QL48KE) | ✅ 已通过 |',
      ].join('\n'),
    )

    assert.match(normalized, /^\| 3\/12 \| 修复【通用】项目管理-招标评审-使用资质要求-回显字段错误（# UZ69HL\) \| ✅ 已通过 \|$/m)
    assert.match(normalized, /^\| 3\/13 \| 修复【PC端】历史数据编辑按钮置灰问题（# FUVW1R\) \| ✅ 已通过 \|$/m)
    assert.match(normalized, /^\| 3\/14 \| 修复【0428生产反馈】新增项目团队成员无法查看数据（# QL48KE\) \| ✅ 已通过 \|$/m)
    assert.doesNotMatch(normalized, /^\\# UZ69HL\)/m)
    assert.doesNotMatch(normalized, /\| \|3\/13/m)
  })

  it('normalizes generated headings that are glued to previous text', () => {
    assert.equal(
      normalizeGeneratedMarkdown('P1mini组装说明书### 1️⃣ 底框部分\n内容### 2️⃣ 底框组装图- 4件脚垫座安装脚垫'),
      'P1mini组装说明书\n\n### 1️⃣ 底框部分\n内容\n\n### 2️⃣ 底框组装图\n\n- 4件脚垫座安装脚垫',
    )
  })

  it('normalizes resume markdown with glued headings, label emphasis and tables', () => {
    assert.equal(
      normalizeGeneratedMarkdown(
        '📋 杜立宏简历总结###基本信息\n- 求职意向：Agent开发工程师 /技术经理-** 籍贯**：浙江金华-** 毕业院校**：宁波大学\n🔑 核心项目经验|项目 |时间 |技术栈亮点 |\n|------|------|----------|\n| AI代理工程管理平台 |2026.03 - 至今 | Spring Boot3、Vue3 |',
      ),
      '📋 杜立宏简历总结\n\n### 基本信息\n- 求职意向：Agent开发工程师 /技术经理 - **籍贯**：浙江金华 - **毕业院校**：宁波大学\n🔑 核心项目经验\n\n| 项目 | 时间 | 技术栈亮点 |\n|------|------|----------|\n| AI代理工程管理平台 |2026.03 - 至今 | Spring Boot3、Vue3 |',
    )
  })

  it('normalizes generated table headers glued to Hermes section headings', () => {
    assert.equal(
      normalizeGeneratedMarkdown(
        '### 📋 进行中的任务|工作项 |状态 |优先级 |负责人 |\n|-------:|---:|---:|----:|----:|\n| 测试单行展示和弹窗功能 | ✅ 进行中 | 中 | George_19 |',
      ),
      '### 📋 进行中的任务\n\n| 工作项 | 状态 | 优先级 | 负责人 |\n|---:|---:|----:|----:|\n| 测试单行展示和弹窗功能 | ✅ 进行中 | 中 | George_19 |',
    )
  })

  it('normalizes generated emphasis and headings missing marker spaces', () => {
    assert.equal(
      normalizeGeneratedMarkdown('确认了 **P1mini安装说明书（完整版） **这篇 Wiki 页面。\nP1mini组装说明书**作者： **怂人刘###1.底框部分-使用 p1mini打印文件内"底部框架"文件夹中的 *四个底座文件'),
      '确认了 **P1mini安装说明书（完整版）** 这篇 Wiki 页面。\nP1mini组装说明书**作者：** 怂人刘\n\n### 1.底框部分-使用 p1mini打印文件内"底部框架"文件夹中的 *四个底座文件',
    )
  })

  it('escapes broken bold markers before numeric headings', () => {
    assert.equal(
      normalizeGeneratedMarkdown('在 **CRM项目（项目\n4） *\n- 中，之前曾搜索过"杜立宏"。'),
      '在 \\*\\*CRM项目（项目\n4） \\*\n\n- 中，之前曾搜索过"杜立宏"。',
    )
  })

  it('marks selection status without replacing existing selection cards', () => {
    const existing: ChatMessageItem[] = [message(2, '请选择', 'assistant')]
    existing[0].agentTaskId = 88
    existing[0].selectionCards = [{
      slot: 'iteration',
      title: '请选择迭代',
      description: '命中多个候选迭代',
      resumeQuestion: '继续创建需求草稿',
      options: [{
        slot: 'iteration',
        entityType: 'ITERATION',
        entityId: 77,
        title: 'CRM 二期迭代',
        subtitle: '状态：进行中',
        route: '',
        matchScore: 0.9,
        matchReasons: ['名称命中'],
      }],
    }]
    const merged = markAgentSelectionStatusInMessage(existing, null, 88, 'iteration:ITERATION:77', 'selected')

    assert.equal(merged[0].agentTaskStatus, 'selected')
    assert.equal(merged[0].selectionStatuses?.['iteration:ITERATION:77'], 'selected')
    assert.equal(merged[0].selectionCards?.[0]?.options[0]?.title, 'CRM 二期迭代')
  })

  it('treats a candidate card as resolved after any option in the same slot is selected', () => {
    const item = message(2, '请选择项目', 'assistant')
    item.selectionStatuses = {
      'project:PROJECT:12': 'selected',
    }
    const card = {
      slot: 'project',
      title: '请确认你指的是哪个项目',
      description: '当前有多个候选命中',
      resumeQuestion: '继续查询项目',
      options: [
        {
          slot: 'project',
          entityType: 'PROJECT',
          entityId: 11,
          title: 'Agent Ops',
          subtitle: '进行中',
          route: '',
          matchScore: 0.9,
          matchReasons: [],
        },
        {
          slot: 'project',
          entityType: 'PROJECT',
          entityId: 12,
          title: 'CRM项目',
          subtitle: '已确认',
          route: '',
          matchScore: 0.95,
          matchReasons: [],
        },
      ],
    }

    assert.equal(isAgentSelectionCardResolved(item, card), true)
  })

  it('detects the active mention query before the caret', () => {
    assert.deepEqual(resolveMentionQuery('请 @he', 5), { start: 2, end: 5, query: 'he' })
    assert.deepEqual(resolveMentionQuery('@', 1), { start: 0, end: 1, query: '' })
    assert.equal(resolveMentionQuery('mail@example.com', 12), null)
    assert.equal(resolveMentionQuery('普通文本', 4), null)
  })

  it('replaces the active mention query and returns the next caret position', () => {
    assert.deepEqual(replaceMentionAtCaret('请 @he 汇总', 5, '@hermes '), {
      text: '请 @hermes 汇总',
      caret: 10,
    })
    assert.deepEqual(replaceMentionAtCaret('@张', 2, '@张三 '), {
      text: '@张三 ',
      caret: 4,
    })
    assert.deepEqual(replaceMentionAtCaret('没有 mention', 3, '@hermes '), {
      text: '没有 mention',
      caret: 3,
    })
  })

  it('inserts emoji text at the current caret position', () => {
    assert.deepEqual(insertTextAtCaret('今天状态很好', 2, ' 😊'), {
      text: '今天 😊状态很好',
      caret: 5,
    })
  })

  it('can replace member mentions with nickname display tokens', () => {
    assert.deepEqual(replaceMentionAtCaret('请 @zhang 看看', 8, '@张三 '), {
      text: '请 @张三 看看',
      caret: 6,
    })
  })

  it('only makes long rolling summaries collapsible', () => {
    assert.equal(shouldCollapseChatSummary('短摘要'), false)
    assert.equal(shouldCollapseChatSummary('这是一个很长的滚动摘要。'.repeat(12)), true)
  })

  it('shows back-to-latest only when the message viewport leaves the bottom', () => {
    assert.equal(shouldShowBackToLatest({ scrollTop: 600, clientHeight: 400, scrollHeight: 1000 }), false)
    assert.equal(shouldShowBackToLatest({ scrollTop: 500, clientHeight: 400, scrollHeight: 1000 }), true)
    assert.equal(shouldShowBackToLatest({ scrollTop: 520, clientHeight: 400, scrollHeight: 1000 }, 100), false)
  })

  it('jumps directly to latest when a room forces initial positioning', () => {
    assert.equal(resolveChatScrollBehavior(true, false), 'auto')
    assert.equal(resolveChatScrollBehavior(false, true), 'smooth')
    assert.equal(resolveChatScrollBehavior(false, false), null)
  })

  it('uses Hermes replying copy as chat assistant content before the first stream delta arrives', () => {
    const item = message(2, '', 'assistant', 'streaming')
    item.agentTaskStatus = 'running'

    assert.equal(resolveChatAssistantContent(item), 'Hermes 正在回复')
  })
})

const message = (
  id: number,
  content: string,
  role: ChatMessageItem['role'] = 'user',
  status: ChatMessageItem['status'] = 'done',
): ChatMessageItem => ({
  id,
  roomId: 7,
  role,
  content,
  status,
  senderUserId: role === 'user' ? 5 : null,
  senderName: role === 'user' ? '我' : 'Hermes',
  senderUsername: role === 'user' ? 'me' : 'hermes',
  senderAvatarUrl: null,
  mentionsHermes: content.includes('@hermes'),
  attachments: [],
  createdAt: '2026-06-28 10:00:00',
  updatedAt: '2026-06-28 10:00:00',
})
