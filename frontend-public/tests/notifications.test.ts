import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildNotificationQuery,
  formatNotificationTime,
  formatUnreadCount,
  mergeNotificationItems,
  resolveNotificationAction,
  resolveNotificationContextLabel,
  resolveNotificationLevelLabel,
} from '../src/lib/notificationUtils'
import type { NotificationItem } from '../src/types/notifications'

const notification = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 1,
  type: 'TASK',
  level: 'INFO',
  title: '工作项已更新',
  content: '请查看最新安排。',
  bizType: 'TASK_STATUS_CHANGED',
  bizId: 12,
  actionUrl: '/projects/1/iterations?openTaskId=12',
  read: false,
  senderName: '产品团队',
  createdAt: '2026-07-12 11:42:00',
  readAt: null,
  ...overrides,
})

describe('notification utilities', () => {
  it('builds all and unread query parameters without sending a false filter', () => {
    assert.deepEqual(buildNotificationQuery(1, 20, false), { page: 1, size: 20 })
    assert.deepEqual(buildNotificationQuery(2, 10, true), { page: 2, size: 10, unreadOnly: true })
  })

  it('merges realtime notifications at the front and removes duplicate ids', () => {
    const existing = [notification({ id: 1 }), notification({ id: 2 })]
    const merged = mergeNotificationItems(existing, [notification({ id: 2, title: '更新后的标题' }), notification({ id: 3 })], 'prepend')

    assert.deepEqual(merged.map((item) => item.id), [2, 3, 1])
    assert.equal(merged[0].title, '更新后的标题')
  })

  it('appends paginated notifications without duplicating ids', () => {
    const existing = [notification({ id: 1 }), notification({ id: 2 })]
    const merged = mergeNotificationItems(existing, [notification({ id: 2 }), notification({ id: 3 })], 'append')

    assert.deepEqual(merged.map((item) => item.id), [1, 2, 3])
  })

  it('formats relative times and falls back to the original value when invalid', () => {
    const now = new Date('2026-07-12T12:00:00')

    assert.equal(formatNotificationTime('2026-07-12 11:42:00', now), '18 分钟前')
    assert.equal(formatNotificationTime('2026-07-11 12:00:00', now), '昨天')
    assert.equal(formatNotificationTime('无法识别的时间', now), '无法识别的时间')
  })

  it('maps business and level labels for the public message card', () => {
    assert.equal(resolveNotificationContextLabel(notification()), '状态变更')
    assert.equal(resolveNotificationLevelLabel(notification({ level: 'ERROR' })), '优先级：高')
    assert.equal(resolveNotificationLevelLabel(notification({ level: 'SUCCESS' })), '处理结果：成功')
  })

  it('formats unread count and distinguishes internal from external actions', () => {
    assert.equal(formatUnreadCount(0), '')
    assert.equal(formatUnreadCount(8), '8')
    assert.equal(formatUnreadCount(100), '99+')
    assert.deepEqual(resolveNotificationAction('/notifications'), { kind: 'internal', target: '/notifications' })
    assert.deepEqual(resolveNotificationAction('https://example.com/task/12'), { kind: 'external', target: 'https://example.com/task/12' })
  })

  it('maps management notification links to public routes and drops unsupported links', () => {
    assert.deepEqual(
      resolveNotificationAction('/projects/7/iterations?openTaskId=42'),
      { kind: 'internal', target: '/projects/7/planning?openTaskId=42' },
    )
    assert.deepEqual(resolveNotificationAction('/tasks/99'), { kind: 'internal', target: '/tasks/99' })
    assert.equal(resolveNotificationAction('/cicd/pipeline-bindings'), null)
  })
})
