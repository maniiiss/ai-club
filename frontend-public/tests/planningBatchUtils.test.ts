import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getBatchWorkItemAvailability,
  toggleAllBatchWorkItemSelection,
  toggleBatchWorkItemSelection,
} from '../src/lib/planningBatchUtils'

describe('planning batch utilities', () => {
  it('limits sensitive actions to fully eligible selections', () => {
    assert.deepEqual(getBatchWorkItemAvailability([]), {
      hasSelection: false,
      hasSameWorkItemType: false,
      canRequirementAi: false,
      canDelete: false,
    })
    assert.deepEqual(getBatchWorkItemAvailability([
      { workItemType: '需求', canDelete: true },
      { workItemType: '需求', canDelete: true },
    ]), {
      hasSelection: true,
      hasSameWorkItemType: true,
      canRequirementAi: true,
      canDelete: true,
    })
    assert.deepEqual(getBatchWorkItemAvailability([
      { workItemType: '需求', canDelete: true },
      { workItemType: '任务', canDelete: false },
    ]), {
      hasSelection: true,
      hasSameWorkItemType: false,
      canRequirementAi: false,
      canDelete: false,
    })
  })

  it('toggles a single item and only selects the visible page', () => {
    assert.deepEqual([...toggleBatchWorkItemSelection(new Set([1]), 2)], [1, 2])
    assert.deepEqual([...toggleBatchWorkItemSelection(new Set([1, 2]), 2)], [1])
    assert.deepEqual([...toggleAllBatchWorkItemSelection(new Set([9]), [1, 2])], [1, 2])
    assert.deepEqual([...toggleAllBatchWorkItemSelection(new Set([1, 2]), [1, 2])], [])
  })
})
