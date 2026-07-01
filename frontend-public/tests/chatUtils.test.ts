import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  appendChatStreamDelta,
  containsHermesMention,
  mergeChatMessage,
  parseChatSocketEvent,
  replaceMentionAtCaret,
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
