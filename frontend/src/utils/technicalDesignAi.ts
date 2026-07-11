import type { TechnicalDesignExecutionPayload } from '@/types/platform'

export const TECHNICAL_DESIGN_SCENARIO_CODE = 'TECHNICAL_DESIGN_AUTHORING'

interface WorkItemTypeInput {
  workItemType?: string | null
  taskType?: string | null
}

/** 技术设计 AI 只服务任务类型下的“技术设计”细分任务，避免入口与需求 AI、开发执行混用。 */
export const isTechnicalDesignWorkItem = (workItem?: WorkItemTypeInput | null) =>
  String(workItem?.workItemType || '').trim() === '任务'
  && String(workItem?.taskType || '').trim() === '技术设计'

interface BuildTechnicalDesignExecutionPayloadInput {
  projectId: number
  workItemId: number
  repositories: Array<{ bindingId: number; targetBranch: string }>
  inputText: string
  preferGitNexus: boolean
}

/** 将界面状态收敛成后端专用创建接口的固定三步请求，步骤顺序不可由页面改写。 */
export const buildTechnicalDesignExecutionPayload = (
  input: BuildTechnicalDesignExecutionPayloadInput
): TechnicalDesignExecutionPayload => {
  const inputPayload: TechnicalDesignExecutionPayload['inputPayload'] = {
    repositories: input.repositories.map((repository) => ({
      bindingId: repository.bindingId,
      targetBranch: repository.targetBranch.trim()
    })),
    preferGitNexus: input.preferGitNexus,
    source: 'TECHNICAL_DESIGN_AI'
  }
  const inputText = input.inputText.trim()
  if (inputText) {
    inputPayload.inputText = inputText
  }
  return {
    scenarioCode: TECHNICAL_DESIGN_SCENARIO_CODE,
    projectId: input.projectId,
    workItemId: input.workItemId,
    triggerSource: 'PAGE',
    inputPayload
  }
}
