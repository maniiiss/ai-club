import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildCurrentRequirementAiMarkdown,
  getRequirementAiActions,
  isRequirementAiEntryVisible,
  mergeTaskSuggestions,
  normalizeTaskSuggestion,
  normalizeTaskType,
} from '../src/lib/requirementAiUtils'

describe('Requirement AI public utilities', () => {
  it('normalizes legacy task categories into the supported task type list', () => {
    assert.equal(normalizeTaskType('开发'), '开发任务')
    assert.equal(normalizeTaskType('测试'), '测试任务')
    assert.equal(normalizeTaskType('部署'), '运维任务')
    assert.equal(normalizeTaskType('运维'), '运维任务')
    assert.equal(normalizeTaskType('技术设计'), '技术设计')
    assert.equal(normalizeTaskType(''), '开发任务')
  })

  it('prefers taskType and falls back to legacy category in AI breakdown suggestions', () => {
    assert.deepEqual(
      normalizeTaskSuggestion({
        name: '接口联调',
        taskType: '测试',
        category: '开发',
        priority: '高',
        description: '覆盖支付回调',
      }),
      {
        name: '接口联调',
        taskType: '测试任务',
        priority: '高',
        description: '覆盖支付回调',
      },
    )

    assert.equal(normalizeTaskSuggestion({ category: '部署' }).taskType, '运维任务')
  })

  it('uses the editable draft only for STANDARDIZE results', () => {
    assert.equal(buildCurrentRequirementAiMarkdown('STANDARDIZE', '原始', '已编辑'), '已编辑')
    assert.equal(buildCurrentRequirementAiMarkdown('BREAKDOWN', '原始', '已编辑'), '原始')
  })

  it('only exposes requirement AI actions for requirements and testing tasks', () => {
    assert.equal(isRequirementAiEntryVisible({ workItemType: '需求' }), true)
    assert.deepEqual(getRequirementAiActions({ workItemType: '需求' }), ['STANDARDIZE', 'BREAKDOWN'])
    assert.equal(isRequirementAiEntryVisible({ workItemType: '任务', taskType: '测试任务' }), true)
    assert.deepEqual(getRequirementAiActions({ workItemType: '任务', taskType: '测试任务' }), ['TEST_CASES'])
    assert.equal(isRequirementAiEntryVisible({ workItemType: '任务', taskType: '开发任务' }), false)
    assert.deepEqual(getRequirementAiActions({ workItemType: '任务', taskType: '开发任务' }), [])
  })

  it('merges selected breakdown suggestions into one editable task', () => {
    assert.deepEqual(
      mergeTaskSuggestions([
        { name: '设计交互', taskType: 'UI设计', priority: '中', description: '补齐流程图' },
        { name: '开发接口', taskType: '开发任务', priority: '高', description: '实现保存接口' },
      ]),
      {
        name: '设计交互 / 开发接口',
        taskType: 'UI设计',
        priority: '高',
        description: '### 设计交互\n\n补齐流程图\n\n### 开发接口\n\n实现保存接口',
      },
    )
  })
})
