import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ExecutionArtifactDetailItem, ExecutionStepItem } from '../src/types/execution'
import { groupExecutionArtifactsByStep } from '../src/lib/executionArtifactUtils'

const step = (id: number, stepNo: number, stepName: string): ExecutionStepItem => ({
  id,
  stepNo,
  stepCode: `STEP_${stepNo}`,
  stepName,
} as ExecutionStepItem)

const artifact = (id: number, stepId: number | null): ExecutionArtifactDetailItem => ({
  id,
  stepId,
} as ExecutionArtifactDetailItem)

describe('执行产物分组', () => {
  it('按步骤序号排序分组，并将任务级产物放在最后', () => {
    const groups = groupExecutionArtifactsByStep(
      [artifact(30, null), artifact(21, 2), artifact(11, 1), artifact(22, 2)],
      [step(2, 2, '方案生成'), step(1, 1, '代码理解')],
    )

    assert.deepEqual(groups.map((group) => group.step?.stepNo ?? null), [1, 2, null])
    assert.deepEqual(groups.map((group) => group.artifacts.map((item) => item.id)), [[11], [21, 22], [30]])
  })

  it('忽略没有产物的步骤，不生成空分组', () => {
    const groups = groupExecutionArtifactsByStep([artifact(11, 1)], [step(1, 1, '代码理解'), step(2, 2, '方案生成')])

    assert.deepEqual(groups.map((group) => group.step?.stepName ?? null), ['代码理解'])
  })
})
