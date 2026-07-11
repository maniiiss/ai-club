import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadUtility() {
  const source = await readFile(new URL('../src/utils/technicalDesignAi.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('only task / technical design work items expose technical design AI', async () => {
  const { isTechnicalDesignWorkItem } = await loadUtility()

  assert.equal(isTechnicalDesignWorkItem({ workItemType: '任务', taskType: '技术设计' }), true)
  assert.equal(isTechnicalDesignWorkItem({ workItemType: '任务', taskType: '开发任务' }), false)
  assert.equal(isTechnicalDesignWorkItem({ workItemType: '需求', taskType: '技术设计' }), false)
})

test('builds a managed technical design payload without agent overrides', async () => {
  const { buildTechnicalDesignExecutionPayload } = await loadUtility()

  assert.deepEqual(buildTechnicalDesignExecutionPayload({
    projectId: 8,
    workItemId: 21,
    repositories: [
      { bindingId: 3, targetBranch: ' main ' },
      { bindingId: 4, targetBranch: 'release/1.0' }
    ],
    inputText: ' 兼容旧接口 ',
    preferGitNexus: true
  }), {
    scenarioCode: 'TECHNICAL_DESIGN_AUTHORING',
    projectId: 8,
    workItemId: 21,
    triggerSource: 'PAGE',
    inputPayload: {
      repositories: [
        { bindingId: 3, targetBranch: 'main' },
        { bindingId: 4, targetBranch: 'release/1.0' }
      ],
      preferGitNexus: true,
      source: 'TECHNICAL_DESIGN_AI',
      inputText: '兼容旧接口'
    }
  })
})

test('management integration uses execution permission and dedicated endpoints', async () => {
  const iterationSource = await readFile(new URL('../src/views/IterationView.vue', import.meta.url), 'utf8')
  const smartActionSource = await readFile(new URL('../src/components/WorkItemSmartActionDialog.vue', import.meta.url), 'utf8')
  const apiSource = await readFile(new URL('../src/api/platform.ts', import.meta.url), 'utf8')

  assert.match(iterationSource, /hasPermission\('task:execution:create'\)/)
  assert.match(iterationSource, /:can-execute="canExecuteWorkItem"/)
  assert.match(smartActionSource, /TechnicalDesignAiDialog/)
  assert.match(smartActionSource, /label="技术设计 AI"/)
  assert.match(apiSource, /\/api\/tasks\/\$\{taskId\}\/technical-design-executions/)
  assert.match(apiSource, /\/api\/execution-tasks\/\$\{executionTaskId\}\/technical-design-writeback/)
})

test('execution center exposes technical design scenario and semantic artifacts', async () => {
  const listSource = await readFile(new URL('../src/views/ExecutionTaskView.vue', import.meta.url), 'utf8')
  const detailSource = await readFile(new URL('../src/views/ExecutionTaskDetailView.vue', import.meta.url), 'utf8')

  assert.match(listSource, /技术设计 AI/)
  assert.match(listSource, /TECHNICAL_DESIGN_AUTHORING/)
  assert.match(detailSource, /CODE_CONTEXT_MARKDOWN/)
  assert.match(detailSource, /TECHNICAL_DESIGN_MARKDOWN/)
  assert.match(detailSource, /DESIGN_REVIEW_MARKDOWN/)
  assert.match(detailSource, /GitNexus/)
  assert.match(detailSource, /DESCRIPTION/)
  assert.match(detailSource, /COMMENT/)
})
