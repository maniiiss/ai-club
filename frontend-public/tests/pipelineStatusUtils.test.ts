import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pipelineRunStatusLabel } from '../src/lib/pipelineStatusUtils'

describe('pipeline status utilities', () => {
  it('formats quick build status labels in Chinese', () => {
    assert.equal(pipelineRunStatusLabel('FAILED'), '失败')
    assert.equal(pipelineRunStatusLabel('QUEUED'), '排队中')
    assert.equal(pipelineRunStatusLabel('RUNNING'), '运行中')
    assert.equal(pipelineRunStatusLabel('SUCCESS'), '成功')
  })
})
