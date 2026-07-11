import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  DEVELOPMENT_EXECUTION_STEPS,
  validateDevelopmentExecutionDraft,
} from '../src/lib/developmentExecutionUtils'

describe('development execution utilities', () => {
  it('keeps the public development execution steps aligned with backend step codes', () => {
    assert.deepEqual(
      DEVELOPMENT_EXECUTION_STEPS.map((step) => step.stepCode),
      ['PLAN', 'IMPLEMENT', 'TEST', 'REPORT'],
    )
  })

  it('validates repositories without requiring users to select agents', () => {
    assert.deepEqual(
      validateDevelopmentExecutionDraft({
        repositories: [],
        resolveRepositoryName: () => '仓库',
      }),
      { valid: false, message: '开发执行至少需要选择一个 GitLab 仓库' },
    )

    assert.deepEqual(
      validateDevelopmentExecutionDraft({
        repositories: [{ bindingId: 10, targetBranch: '' }],
        resolveRepositoryName: () => '主仓库',
      }),
      { valid: false, message: '主仓库 还没有填写目标分支' },
    )

    assert.deepEqual(
      validateDevelopmentExecutionDraft({
        repositories: [{ bindingId: 10, targetBranch: 'main' }],
        resolveRepositoryName: () => '主仓库',
      }),
      { valid: true },
    )
  })

  it('uses managed orchestration in the launcher without exposing agent selection', () => {
    const dialog = readFileSync(new URL('../src/pages/planning/DevelopmentExecutionDialog.tsx', import.meta.url), 'utf8')
    assert.match(dialog, /listExecutionOrchestrationScenarios/)
    assert.match(dialog, /orchestrationReady/)
    assert.match(dialog, /请联系管理员配置并发布编排/)
    assert.doesNotMatch(dialog, /listAgentOptions/)
    assert.doesNotMatch(dialog, /stepAgentMap/)
    assert.doesNotMatch(dialog, /agentBindings/)
  })
})
