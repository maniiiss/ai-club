import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildHermesSessionQuery,
  computeHermesActionKey,
  parseHermesSseChunk,
  shouldRenderHermesWorkspaceHeader,
} from '../src/lib/hermesUtils'

describe('Hermes public utilities', () => {
  it('builds project session queries without leaking unrelated context', () => {
    assert.deepEqual(buildHermesSessionQuery('project', 8, true, 42), {
      page: 8,
      size: 20,
      archived: true,
      scope: 'PROJECT',
      projectId: 42,
    })
  })

  it('computes stable action keys from type, index, title and sorted params', () => {
    const first = computeHermesActionKey({
      type: 'CREATE_EXECUTION_TASK',
      title: '创建扫描任务',
      params: { branch: 'main', bindingId: 7 },
    }, 0)
    const second = computeHermesActionKey({
      type: 'CREATE_EXECUTION_TASK',
      title: '创建扫描任务',
      params: { bindingId: 7, branch: 'main' },
    }, 0)

    assert.equal(first, second)
    assert.match(first, /^CREATE_EXECUTION_TASK:0:创建扫描任务\|[a-z0-9]+$/)
  })

  it('parses one SSE event chunk into event name and JSON payload', () => {
    assert.deepEqual(parseHermesSseChunk('event: delta\ndata: {"content":"你好"}\n\n'), {
      eventName: 'delta',
      data: { content: '你好' },
    })
  })

  it('hides the duplicated workspace title inside compact drawers', () => {
    assert.equal(shouldRenderHermesWorkspaceHeader(true), false)
    assert.equal(shouldRenderHermesWorkspaceHeader(false), true)
  })
})
