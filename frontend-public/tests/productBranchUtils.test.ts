import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getEnabledProductBranchIds,
  productBranchSyncResultLabel,
  productBranchSyncResultStyle,
} from '../src/lib/productBranchUtils'
import type { GitlabProductBranchItem } from '../src/types/development'

describe('product branch utilities', () => {
  it('labels known sync results for product branch management', () => {
    assert.equal(productBranchSyncResultLabel('CREATED'), '已创建同步 MR')
    assert.equal(productBranchSyncResultLabel('NO_CHANGE'), '无变更')
    assert.equal(productBranchSyncResultLabel('EXISTING_OPEN_MR'), '已有开放 MR')
    assert.equal(productBranchSyncResultLabel('FAILED'), '失败')
    assert.equal(productBranchSyncResultLabel(null), '未同步')
  })

  it('maps sync results to stable tone classes', () => {
    assert.match(productBranchSyncResultStyle('CREATED'), /emerald/)
    assert.match(productBranchSyncResultStyle('EXISTING_OPEN_MR'), /blue/)
    assert.match(productBranchSyncResultStyle('FAILED'), /red/)
    assert.match(productBranchSyncResultStyle(null), /gray/)
  })

  it('only selects enabled product branches for batch sync', () => {
    const branches: Pick<GitlabProductBranchItem, 'id' | 'enabled'>[] = [
      { id: 1, enabled: true },
      { id: 2, enabled: false },
      { id: 3, enabled: true },
    ]

    assert.deepEqual(getEnabledProductBranchIds(branches), [1, 3])
  })
})
