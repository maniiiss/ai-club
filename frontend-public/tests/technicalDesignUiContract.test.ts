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
    assert.doesNotMatch(dialog, /技术设计编排已就绪，三步只读 Runtime 由管理员发布的项目或平台编排统一确定。/)
    assert.doesNotMatch(dialog, /listAgentOptions/)
    assert.doesNotMatch(dialog, /stepAgentMap/)
    assert.doesNotMatch(dialog, /agentBindings/)
  })

  it('keeps the dialog frame stable while loading orchestration options', () => {
    const dialog = read('src/pages/planning/TechnicalDesignAiDialog.tsx')
    assert.match(dialog, /h-\[min\(720px,90vh\)\]/)
    assert.match(dialog, /relative min-h-0 flex-1/)
    assert.match(dialog, /absolute inset-0 z-10/)
    assert.match(dialog, /transition-opacity duration-200/)
    assert.doesNotMatch(dialog, /loading \? <div className="min-h-\[420px\]"/)
  })

  it('shows the technical-design scenario in execution filters and supports semantic artifact writeback', () => {
    const executionPage = read('src/pages/execution/ExecutionPage.tsx')
    const detailPage = read('src/pages/execution/ExecutionTaskDetailPage.tsx')
    assert.match(executionPage, /TECHNICAL_DESIGN_AUTHORING/)
    assert.match(detailPage, /CODE_CONTEXT_MARKDOWN/)
    assert.match(detailPage, /TECHNICAL_DESIGN_MARKDOWN/)
    assert.match(detailPage, /DESIGN_REVIEW_MARKDOWN/)
    assert.match(detailPage, /DESCRIPTION/)
    assert.match(detailPage, /COMMENT/)
    assert.match(detailPage, /writebackTechnicalDesignArtifact/)
  })

  it('keeps public execution details focused on user-facing results', () => {
    const detailPage = read('src/pages/execution/ExecutionTaskDetailPage.tsx')

    assert.doesNotMatch(detailPage, /执行器快照/)
    assert.doesNotMatch(detailPage, /GitNexus 已降级/)
    assert.doesNotMatch(detailPage, /上下文快照/)
    assert.doesNotMatch(detailPage, /taskDetail\.latestSummary/)
  })

  it('renders execution Markdown artifacts through the shared Markdown renderer', () => {
    const detailPage = read('src/pages/execution/ExecutionTaskDetailPage.tsx')

    assert.match(detailPage, /import \{ Markdown \} from '@\/src\/components\/common\/Markdown'/)
    assert.match(detailPage, /<Markdown content=\{artifact\.contentText\}/)
    assert.doesNotMatch(detailPage, /import ReactMarkdown from 'react-markdown'/)
    assert.doesNotMatch(detailPage, /import remarkGfm from 'remark-gfm'/)
  })

  it('shows the originating execution step on each artifact card', () => {
    const detailPage = read('src/pages/execution/ExecutionTaskDetailPage.tsx')

    assert.match(detailPage, /sourceStep/)
    assert.match(detailPage, /来源步骤/)
    assert.match(detailPage, /任务级产物/)
  })

  it('renders artifact groups in execution-step order', () => {
    const detailPage = read('src/pages/execution/ExecutionTaskDetailPage.tsx')

    assert.match(detailPage, /groupExecutionArtifactsByStep/)
    assert.match(detailPage, /第 \$\{group\.step\.stepNo\} 步/)
    assert.match(detailPage, /group\.artifacts\.map/)
  })
})
