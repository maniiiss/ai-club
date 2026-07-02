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
  resolveAgentActionStatus,
  resolveMentionQuery,
  insertTextAtCaret,
  shouldCollapseChatSummary,
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
