import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildWorkItemInlineEditPayload } from '../src/lib/planningInlineEditUtils'
import type { WorkItem } from '../src/types/planning'

describe('planning inline edit utilities', () => {
  it('builds a full work item update payload while changing only status or priority', () => {
    const item: WorkItem = {
      id: 12,
      workItemCode: 'WI-12',
      name: '支付回调冒烟测试',
      workItemType: '任务',
      taskType: '测试',
      creatorUserId: 1,
      creatorName: '创建者',
      status: '待开始',
      priority: '中',
      workHours: 3,
      assignee: '张三',
      assigneeUserId: 9,
      collaboratorUserIds: [10, 11],
      collaboratorNames: ['李四', '王五'],
      planStartDate: '2026-07-01',
      planEndDate: '2026-07-03',
      createdAt: '2026-07-01 09:00:00',
      updatedAt: '2026-07-02 09:00:00',
      description: '覆盖支付回调主路径',
      moduleName: '支付',
      projectId: 5,
      projectName: 'SaaS 项目',
      agentId: 7,
      agentName: 'QA Agent',
      iterationId: 8,
      iterationName: '7 月迭代',
      requirementTaskId: 3,
      requirementTaskName: '支付回调需求',
      canDelete: true,
    }

    assert.deepEqual(buildWorkItemInlineEditPayload(item, { status: '进行中' }), {
      name: '支付回调冒烟测试',
      workItemType: '任务',
      taskType: '测试任务',
      status: '进行中',
      priority: '中',
      workHours: 3,
      assignee: '张三',
      assigneeUserId: 9,
      collaboratorUserIds: [10, 11],
      description: '覆盖支付回调主路径',
      moduleName: '支付',
      planStartDate: '2026-07-01',
      planEndDate: '2026-07-03',
      projectId: 5,
      agentId: 7,
      iterationId: 8,
      requirementTaskId: 3,
    })

    assert.equal(buildWorkItemInlineEditPayload(item, { priority: '高' }).priority, '高')
  })
})
