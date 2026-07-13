/**
 * 执行产物展示整理工具。
 * 业务意图：将后端返回的无序产物按执行步骤重新编排，保证公众端按照执行流程阅读结果。
 */
import type { ExecutionArtifactDetailItem, ExecutionStepItem } from '@/src/types/execution'

export interface ExecutionArtifactGroup {
  key: string
  step: ExecutionStepItem | null
  artifacts: ExecutionArtifactDetailItem[]
}

/**
 * 按步骤顺序分组执行产物。
 * 未关联步骤或步骤已不存在的产物统一放到最后，避免打断主流程顺序。
 */
export const groupExecutionArtifactsByStep = (
  artifacts: ExecutionArtifactDetailItem[],
  steps: ExecutionStepItem[],
): ExecutionArtifactGroup[] => {
  const artifactsByStep = new Map<number, ExecutionArtifactDetailItem[]>()
  const taskLevelArtifacts: ExecutionArtifactDetailItem[] = []
  const knownStepIds = new Set(steps.map((step) => step.id))

  artifacts.forEach((artifact) => {
    if (artifact.stepId == null || !knownStepIds.has(artifact.stepId)) {
      taskLevelArtifacts.push(artifact)
      return
    }
    const current = artifactsByStep.get(artifact.stepId) || []
    current.push(artifact)
    artifactsByStep.set(artifact.stepId, current)
  })

  const groups = [...steps]
    .sort((left, right) => left.stepNo - right.stepNo)
    .map((step) => ({
      key: `step-${step.id}`,
      step,
      artifacts: artifactsByStep.get(step.id) || [],
    }))
    .filter((group) => group.artifacts.length > 0)

  if (taskLevelArtifacts.length > 0) {
    groups.push({ key: 'task-level', step: null, artifacts: taskLevelArtifacts })
  }
  return groups
}
