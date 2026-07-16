import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAssistantSessionQuery,
  computeAssistantActionKey,
  isDevelopmentExecutionAction,
  markAssistantStreamStopped,
  resolveAssistantDoneContent,
  resolveAssistantDisplayState,
  resolveDevelopmentExecutionActionContext,
  resolveSlashMenuActiveIndex,
  shouldIgnoreAssistantStreamEvent,
  parseAssistantSseChunk,
  shouldRenderAssistantWorkspaceHeader,
} from '../src/lib/assistantUtils'
import type { AssistantMessageItem } from '../src/types/assistant'

describe('Assistant public utilities', () => {
  it('builds project session queries without leaking unrelated context', () => {
    assert.deepEqual(buildAssistantSessionQuery('project', 8, true, 42), {
      page: 8,
      size: 20,
      archived: true,
      scope: 'PROJECT',
      projectId: 42,
    })
  })

  it('computes stable action keys from type, index, title and sorted params', () => {
    const first = computeAssistantActionKey({
      type: 'CREATE_EXECUTION_TASK',
      title: '创建扫描任务',
      params: { branch: 'main', bindingId: 7 },
    }, 0)
    const second = computeAssistantActionKey({
      type: 'CREATE_EXECUTION_TASK',
      title: '创建扫描任务',
      params: { bindingId: 7, branch: 'main' },
    }, 0)

    assert.equal(first, second)
    assert.match(first, /^CREATE_EXECUTION_TASK:0:创建扫描任务\|[a-z0-9]+$/)
  })

  it('resolves GitPilot development execution context for the repository dialog', () => {
    const action = {
      type: 'CREATE_EXECUTION_TASK',
      title: '发起执行任务',
      description: '',
      requiresConfirm: true,
      params: {
        projectId: 41,
        workItemId: 99,
        inputPayload: { userQuestion: '优先保持接口兼容' },
      },
    }

    assert.equal(isDevelopmentExecutionAction(action), true)
    assert.deepEqual(resolveDevelopmentExecutionActionContext(action), {
      projectId: 41,
      workItemId: 99,
      initialInputText: '优先保持接口兼容',
    })
  })

  it('rejects invalid or non-development execution actions', () => {
    assert.equal(resolveDevelopmentExecutionActionContext({
      type: 'CREATE_EXECUTION_TASK',
      title: '发起执行任务',
      description: '',
      requiresConfirm: true,
      params: { projectId: 0, workItemId: 'not-a-number' },
    }), null)
    assert.equal(isDevelopmentExecutionAction({
      type: 'CREATE_EXECUTION_TASK',
      title: '其他执行',
      description: '',
      requiresConfirm: true,
      params: { scenarioCode: 'TEST_AUTOMATION' },
    }), false)
  })

  it('parses one SSE event chunk into event name and JSON payload', () => {
    assert.deepEqual(parseAssistantSseChunk('event: delta\ndata: {"content":"你好"}\n\n'), {
      eventName: 'delta',
      data: { content: '你好' },
    })
  })

  it('hides the duplicated workspace title inside compact drawers', () => {
    assert.equal(shouldRenderAssistantWorkspaceHeader(true), false)
    assert.equal(shouldRenderAssistantWorkspaceHeader(false), true)
  })

  it('cycles Assistant slash menu selection with arrow keys', () => {
    assert.equal(resolveSlashMenuActiveIndex(0, 1, 5), 1)
    assert.equal(resolveSlashMenuActiveIndex(4, 1, 5), 0)
    assert.equal(resolveSlashMenuActiveIndex(0, -1, 5), 4)
    assert.equal(resolveSlashMenuActiveIndex(-1, 1, 5), 1)
    assert.equal(resolveSlashMenuActiveIndex(2, 1, 0), -1)
  })

  it('marks the active streaming assistant message as done when users stop Assistant', () => {
    const messages: AssistantMessageItem[] = [
      { id: 'user-1', role: 'user', content: '帮我分析项目', status: 'done', attachments: [] },
      { id: 'assistant-1', role: 'assistant', content: '', status: 'streaming', attachments: [] },
    ]

    const stopped = markAssistantStreamStopped(messages, 'assistant-1')

    assert.equal(stopped[1].status, 'done')
    assert.equal(stopped[1].content, '已停止生成')
  })

  it('ignores late stream events after the active Assistant request has been stopped', () => {
    assert.equal(shouldIgnoreAssistantStreamEvent('assistant-1', 'assistant-1', true), true)
    assert.equal(shouldIgnoreAssistantStreamEvent('assistant-1', null, false), true)
    assert.equal(shouldIgnoreAssistantStreamEvent('assistant-1', 'assistant-2', false), true)
    assert.equal(shouldIgnoreAssistantStreamEvent('assistant-1', 'assistant-1', false), false)
  })

  it('does not render thinking copy for stale streaming assistant messages', () => {
    const display = resolveAssistantDisplayState(
      { content: '', status: 'streaming' },
      false,
    )

    assert.equal(display.content, '已停止生成')
    assert.equal(display.showThinking, false)
    assert.equal(display.showContinuation, false)
  })

  it('keeps displayed stream content when the done event carries a different final value', () => {
    assert.equal(resolveAssistantDoneContent('流式回复', '后端兜底后的最终回复'), '流式回复')
    assert.equal(resolveAssistantDoneContent('  ', '后端最终回复'), '后端最终回复')
  })

})
