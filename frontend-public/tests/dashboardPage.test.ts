import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hasDashboardMyTaskStats } from '../src/lib/dashboardUtils'
import type { DashboardOverview } from '../src/types/dashboard'

const baseStats: DashboardOverview['stats'] = {
  projectCount: 0,
  agentCount: 0,
  taskCount: 0,
  repoCount: 0,
  myTaskCount: 0,
  myInProgressTaskCount: 0,
  myPendingTaskCount: 0,
}

describe('dashboard page', () => {
  it('does not expose a zero text node when all my-task counts are zero', () => {
    assert.equal(hasDashboardMyTaskStats(baseStats), false)
  })

  it('shows my-task stats when any my-task count is positive', () => {
    assert.equal(hasDashboardMyTaskStats({ ...baseStats, myPendingTaskCount: 1 }), true)
  })
})
