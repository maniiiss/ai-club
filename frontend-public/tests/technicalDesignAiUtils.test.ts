import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  TECHNICAL_DESIGN_ARTIFACT_TYPES,
  TECHNICAL_DESIGN_STEPS,
  buildTechnicalDesignExecutionPayload,
  detectGitNexusDegradation,
  isTechnicalDesignEntryVisible,
  isTechnicalDesignMarkdownArtifact,
  shouldShowTechnicalDesignWriteback,
  validateTechnicalDesignDraft,
} from '../src/lib/technicalDesignAiUtils'

describe('technical design AI utilities', () => {
  it('keeps the three authoring steps aligned with the backend workflow', () => {
    assert.deepEqual(TECHNICAL_DESIGN_STEPS.map((step) => step.stepCode), [
      'CODE_CONTEXT',
      'DESIGN_DRAFT',
      'DESIGN_REVIEW',
    ])
  })

  it('shows the entry only for technical-design tasks', () => {
    assert.equal(isTechnicalDesignEntryVisible({ workItemType: '任务', taskType: '技术设计' }), true)
    assert.equal(isTechnicalDesignEntryVisible({ workItemType: '任务', taskType: '开发' }), false)
    assert.equal(isTechnicalDesignEntryVisible({ workItemType: '需求', taskType: '技术设计' }), false)
  })

  it('validates repository branches without requiring users to select runtimes', () => {
    assert.deepEqual(validateTechnicalDesignDraft({ repositories: [], resolveRepositoryName: () => '仓库' }), {
      valid: false,
      message: '技术设计至少需要选择一个 GitLab 仓库',
    })
    assert.deepEqual(validateTechnicalDesignDraft({ repositories: [{ bindingId: 10, targetBranch: ' ' }], resolveRepositoryName: () => '主仓库' }), {
      valid: false,
      message: '主仓库 还没有填写目标分支',
    })
    assert.deepEqual(validateTechnicalDesignDraft({ repositories: [{ bindingId: 10, targetBranch: 'main' }], resolveRepositoryName: () => '主仓库' }), { valid: true })
  })

  it('builds the public endpoint payload without agent bindings', () => {
    assert.deepEqual(buildTechnicalDesignExecutionPayload({
      projectId: 8,
      repositories: [{ bindingId: 10, targetBranch: ' main ' }],
      inputText: '  保持兼容  ',
    }), {
      scenarioCode: 'TECHNICAL_DESIGN_AUTHORING',
      projectId: 8,
      triggerSource: 'PAGE',
      inputPayload: {
        repositories: [{ bindingId: 10, targetBranch: 'main' }],
        preferGitNexus: true,
        source: 'TECHNICAL_DESIGN_AI',
        inputText: '保持兼容',
      },
    })
  })

  it('recognizes semantic Markdown artifacts, degradation hints and writeback eligibility', () => {
    assert.deepEqual(TECHNICAL_DESIGN_ARTIFACT_TYPES, [
      'CODE_CONTEXT_MARKDOWN',
      'TECHNICAL_DESIGN_MARKDOWN',
      'DESIGN_REVIEW_MARKDOWN',
    ])
    assert.equal(isTechnicalDesignMarkdownArtifact('DESIGN_REVIEW_MARKDOWN'), true)
    assert.equal(isTechnicalDesignMarkdownArtifact('STEP_OUTPUT'), false)
    assert.equal(detectGitNexusDegradation('## GitNexus 使用情况\n已降级到 rg，原因：索引刷新失败'), '已降级到 rg，原因：索引刷新失败')
    assert.equal(shouldShowTechnicalDesignWriteback({ scenarioCode: 'TECHNICAL_DESIGN_AUTHORING', artifactType: 'TECHNICAL_DESIGN_MARKDOWN', contentText: '# 设计' }), true)
    assert.equal(shouldShowTechnicalDesignWriteback({ scenarioCode: 'TECHNICAL_DESIGN_AUTHORING', artifactType: 'CODE_CONTEXT_MARKDOWN', contentText: '# 上下文' }), false)
  })
})
