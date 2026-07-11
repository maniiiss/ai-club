import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('management API and types expose the orchestration lifecycle contract', async () => {
  const [apiSource, typeSource] = await Promise.all([
    read('src/api/platform.ts'),
    read('src/types/platform.ts')
  ])

  assert.match(apiSource, /listExecutionOrchestrationScenarios/)
  assert.match(apiSource, /listExecutionOrchestrationProfiles/)
  assert.match(apiSource, /createExecutionOrchestrationDraft/)
  assert.match(apiSource, /updateExecutionOrchestrationVersion/)
  assert.match(apiSource, /publishExecutionOrchestrationVersion/)
  assert.match(apiSource, /deleteExecutionOrchestrationVersion/)
  assert.match(apiSource, /abandonExecutionOrchestrationProfile/)
  assert.match(apiSource, /sourceVersionId/)
  assert.match(typeSource, /interface ExecutionOrchestrationScenarioItem/)
  assert.match(typeSource, /interface ExecutionOrchestrationProfileItem/)
  assert.match(typeSource, /interface ExecutionOrchestrationVersionItem/)
  assert.match(typeSource, /revision: number/)
  assert.match(typeSource, /timeoutSeconds: number/)
})

test('execution center exposes a permission guarded orchestration management page', async () => {
  const [routeSource, layoutSource, pageSource] = await Promise.all([
    read('src/router/index.ts'),
    read('src/layout/AppLayout.vue'),
    read('src/views/ExecutionOrchestrationView.vue')
  ])

  assert.match(routeSource, /path: 'execution-orchestrations'/)
  assert.match(routeSource, /name: 'execution-orchestrations'/)
  assert.match(routeSource, /permission: \['execution:orchestration:manage', 'project:manage'\]/)
  assert.match(layoutSource, /fallbackPath: '\/execution-orchestrations'/)
  assert.match(layoutSource, /fallbackLabel: '编排管理'/)
  assert.match(pageSource, /平台默认/)
  assert.match(pageSource, /项目覆盖/)
  assert.match(pageSource, /场景就绪/)
  assert.match(pageSource, /revision/)
  assert.match(pageSource, /timeoutSeconds/)
  assert.match(pageSource, /publishExecutionOrchestrationVersion/)
  assert.match(pageSource, /deleteExecutionOrchestrationVersion/)
  assert.match(pageSource, /abandonExecutionOrchestrationProfile/)
  assert.match(pageSource, /sourceVersionId/)
})

test('managed launchers consume published orchestration and never send agent overrides', async () => {
  const [developmentDialog, technicalDialog, technicalUtility] = await Promise.all([
    read('src/components/ExecutionTaskCreateDialog.vue'),
    read('src/components/TechnicalDesignAiDialog.vue'),
    read('src/utils/technicalDesignAi.ts')
  ])

  for (const source of [developmentDialog, technicalDialog]) {
    assert.doesNotMatch(source, /listAgentOptions/)
    assert.doesNotMatch(source, /stepAgentMap/)
    assert.doesNotMatch(source, /步骤 Agent 绑定|请选择 CLI Runtime|每一步都可独立选择/)
    assert.match(source, /listExecutionOrchestrationScenarios/)
    assert.match(source, /编排尚未就绪/)
  }

  assert.doesNotMatch(developmentDialog, /agentBindings\s*:/)
  assert.doesNotMatch(technicalUtility, /agentBindings\s*:/)
})
