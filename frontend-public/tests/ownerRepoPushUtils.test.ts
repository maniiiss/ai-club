import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ownerRepoPushModeLabel,
  ownerRepoPushModeStyle,
  ownerRepoPushStatus,
  ownerRepoPushStatusStyle,
  isDangerousPushMode,
} from '../src/lib/ownerRepoPushUtils'

describe('owner repo push utilities', () => {
  it('labels known push modes for owner repo delivery', () => {
    assert.equal(ownerRepoPushModeLabel('DIRECT'), '直接推送')
    assert.equal(ownerRepoPushModeLabel('MERGE_REQUEST'), '创建 MR')
    assert.equal(ownerRepoPushModeLabel('NEW_BRANCH'), '推到新分支')
    assert.equal(ownerRepoPushModeLabel(null), '-')
  })

  it('maps push modes to stable tone classes', () => {
    assert.match(ownerRepoPushModeStyle('DIRECT'), /red/)
    assert.match(ownerRepoPushModeStyle('MERGE_REQUEST'), /emerald/)
    assert.match(ownerRepoPushModeStyle('NEW_BRANCH'), /blue/)
  })

  it('labels push execution status', () => {
    assert.equal(ownerRepoPushStatus('SUCCESS'), '成功')
    assert.equal(ownerRepoPushStatus('PARTIAL'), '部分成功')
    assert.equal(ownerRepoPushStatus('FAILED'), '失败')
    assert.equal(ownerRepoPushStatus(null), '-')
  })

  it('maps execution status to tone classes', () => {
    assert.match(ownerRepoPushStatusStyle('SUCCESS'), /emerald/)
    assert.match(ownerRepoPushStatusStyle('PARTIAL'), /amber/)
    assert.match(ownerRepoPushStatusStyle('FAILED'), /red/)
  })

  it('flags DIRECT as dangerous push mode', () => {
    assert.equal(isDangerousPushMode('DIRECT'), true)
    assert.equal(isDangerousPushMode('NEW_BRANCH'), false)
    assert.equal(isDangerousPushMode('MERGE_REQUEST'), false)
    assert.equal(isDangerousPushMode(null), false)
  })
})
