import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('technical design AI public UI contract', () => {
  it('uses the dedicated public create endpoint and writeback endpoint', () => {
    const api = read('src/api/execution.ts')
    assert.match(api, /\/api\/public\/tasks\/\$\{taskId\}\/technical-design-executions/)
    assert.match(api, /\/api\/execution-tasks\/\$\{taskId\}\/technical-design-writeback/)
  })

  it('routes planning smart actions in requirement, technical design, development order', () => {
    const page = read('src/pages/planning/PlanningPage.tsx')
    assert.match(page, /isRequirementAiEntryVisible\(item\)[\s\S]*isTechnicalDesignEntryVisible\(item\)[\s\S]*isDevelopmentExecutionEntryVisible\(item\)/)
    assert.match(page, /<TechnicalDesignAiDialog/)
  })

  it('uses managed orchestration instead of exposing runtime selectors', () => {
    const dialog = read('src/pages/planning/TechnicalDesignAiDialog.tsx')
    assert.match(dialog, /repositories\.map/)
    assert.match(dialog, /TECHNICAL_DESIGN_AI/)
    assert.match(dialog, /getMyFeatureCosts/)
    assert.match(dialog, /createPublicTechnicalDesignExecution/)
    assert.match(dialog, /listExecutionOrchestrationScenarios/)
    assert.match(dialog, /orchestrationReady/)
    assert.match(dialog, /请联系管理员配置并发布编排/)
    assert.doesNotMatch(dialog, /listAgentOptions/)
    assert.doesNotMatch(dialog, /stepAgentMap/)
    assert.doesNotMatch(dialog, /agentBindings/)
  })

  it('shows the technical-design scenario in execution filters and supports semantic artifact writeback', () => {
    const executionPage = read('src/pages/execution/ExecutionPage.tsx')
    const detailPage = read('src/pages/execution/ExecutionTaskDetailPage.tsx')
    assert.match(executionPage, /TECHNICAL_DESIGN_AUTHORING/)
    assert.match(detailPage, /CODE_CONTEXT_MARKDOWN/)
    assert.match(detailPage, /TECHNICAL_DESIGN_MARKDOWN/)
    assert.match(detailPage, /DESIGN_REVIEW_MARKDOWN/)
    assert.match(detailPage, /GitNexus/)
    assert.match(detailPage, /DESCRIPTION/)
    assert.match(detailPage, /COMMENT/)
    assert.match(detailPage, /writebackTechnicalDesignArtifact/)
  })
})
