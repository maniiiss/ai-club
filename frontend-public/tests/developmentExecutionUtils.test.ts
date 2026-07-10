import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEVELOPMENT_EXECUTION_STEPS,
  recommendDevelopmentExecutionAgentId,
  validateDevelopmentExecutionDraft,
} from '../src/lib/developmentExecutionUtils'

const agents = [
  {
    id: 1,
    name: 'Claude 规划助手',
    type: 'CUSTOM',
    accessType: 'HTTP_API',
    builtinCode: null,
    description: '',
    runtimeType: null,
    capability: 'planning',
  },
  {
    id: 2,
    name: 'Codex Runtime',
    type: 'CUSTOM',
    accessType: 'AGENT_RUNTIME',
    builtinCode: null,
    description: '',
    runtimeType: 'CODEX_CLI',
    capability: 'code implement test',
  },
  {
    id: 3,
    name: '只读评审',
    type: 'BUILTIN',
    accessType: 'CHAT',
    builtinCode: 'CODE_REVIEW',
    description: '',
    runtimeType: null,
    capability: 'review',
  },
]

describe('development execution utilities', () => {
  it('keeps the public development execution steps aligned with backend step codes', () => {
    assert.deepEqual(
      DEVELOPMENT_EXECUTION_STEPS.map((step) => step.stepCode),
      ['PLAN', 'IMPLEMENT', 'TEST', 'REPORT'],
    )
  })

  it('recommends executable runtime agents for implementation and testing steps', () => {
    assert.equal(recommendDevelopmentExecutionAgentId('IMPLEMENT', agents), 2)
    assert.equal(recommendDevelopmentExecutionAgentId('TEST', agents), 2)
    assert.equal(recommendDevelopmentExecutionAgentId('PLAN', agents), 1)
    assert.equal(recommendDevelopmentExecutionAgentId('REPORT', agents), 1)
  })

  it('validates repositories and executable agents before creating a task', () => {
    assert.deepEqual(
      validateDevelopmentExecutionDraft({
        repositories: [],
        agentOptions: agents,
        stepAgentMap: {},
        resolveRepositoryName: () => '仓库',
      }),
      { valid: false, message: '开发执行至少需要选择一个 GitLab 仓库' },
    )

    assert.deepEqual(
      validateDevelopmentExecutionDraft({
        repositories: [{ bindingId: 10, targetBranch: '' }],
        agentOptions: agents,
        stepAgentMap: {},
        resolveRepositoryName: () => '主仓库',
      }),
      { valid: false, message: '主仓库 还没有填写目标分支' },
    )

    assert.deepEqual(
      validateDevelopmentExecutionDraft({
        repositories: [{ bindingId: 10, targetBranch: 'main' }],
        agentOptions: agents,
        stepAgentMap: { IMPLEMENT: 3 },
        resolveRepositoryName: () => '主仓库',
      }),
      { valid: false, message: '开发实现必须绑定 HTTP_API 或 AGENT_RUNTIME 智能体' },
    )

    assert.deepEqual(
      validateDevelopmentExecutionDraft({
        repositories: [{ bindingId: 10, targetBranch: 'main' }],
        agentOptions: agents,
        stepAgentMap: { IMPLEMENT: 2, TEST: 2 },
        resolveRepositoryName: () => '主仓库',
      }),
      { valid: true },
    )
  })
})
