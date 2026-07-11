export interface TechnicalDesignStepOption {
  stepCode: 'CODE_CONTEXT' | 'DESIGN_DRAFT' | 'DESIGN_REVIEW'
  stepName: string
  description: string
}

export interface TechnicalDesignRepositoryDraft {
  bindingId: number
  targetBranch: string
}

export const TECHNICAL_DESIGN_STEPS: TechnicalDesignStepOption[] = [
  { stepCode: 'CODE_CONTEXT', stepName: '代码理解', description: '只读扫描仓库、GitNexus 影响面与现有测试。' },
  { stepCode: 'DESIGN_DRAFT', stepName: '设计生成', description: '基于源码证据生成可执行的技术设计。' },
  { stepCode: 'DESIGN_REVIEW', stepName: '设计自检', description: '检查影响范围、兼容迁移、风险与 Harness。' },
]

export const TECHNICAL_DESIGN_ARTIFACT_TYPES = [
  'CODE_CONTEXT_MARKDOWN',
  'TECHNICAL_DESIGN_MARKDOWN',
  'DESIGN_REVIEW_MARKDOWN',
] as const

/** 技术设计入口只面向“任务 / 技术设计”，避免与需求 AI、开发执行入口交叉。 */
export const isTechnicalDesignEntryVisible = (item: { workItemType?: string | null; taskType?: string | null }): boolean =>
  item.workItemType === '任务' && item.taskType === '技术设计'

export const validateTechnicalDesignDraft = ({
  repositories,
  resolveRepositoryName,
}: {
  repositories: TechnicalDesignRepositoryDraft[]
  resolveRepositoryName: (bindingId: number) => string
}): { valid: true } | { valid: false; message: string } => {
  if (!repositories.length) return { valid: false, message: '技术设计至少需要选择一个 GitLab 仓库' }
  for (const repository of repositories) {
    if (!repository.targetBranch.trim()) {
      return { valid: false, message: `${resolveRepositoryName(repository.bindingId)} 还没有填写目标分支` }
    }
  }
  return { valid: true }
}

/** 构建后端统一场景合同；工作项 id 由公众端 REST 路径承载。 */
export const buildTechnicalDesignExecutionPayload = ({
  projectId,
  repositories,
  inputText,
}: {
  projectId: number
  repositories: TechnicalDesignRepositoryDraft[]
  inputText: string
}) => ({
  scenarioCode: 'TECHNICAL_DESIGN_AUTHORING',
  projectId,
  triggerSource: 'PAGE',
  inputPayload: {
    repositories: repositories.map((repository) => ({
      bindingId: repository.bindingId,
      targetBranch: repository.targetBranch.trim(),
    })),
    preferGitNexus: true,
    source: 'TECHNICAL_DESIGN_AI',
    ...(inputText.trim() ? { inputText: inputText.trim() } : {}),
  },
})

export const isTechnicalDesignMarkdownArtifact = (artifactType: string): boolean =>
  TECHNICAL_DESIGN_ARTIFACT_TYPES.includes(artifactType as typeof TECHNICAL_DESIGN_ARTIFACT_TYPES[number])

/** 从代码理解产物中提取明确的 GitNexus 降级说明，用于详情页醒目提示。 */
export const detectGitNexusDegradation = (contentText?: string | null): string | null => {
  if (!contentText || !/GitNexus/i.test(contentText) || !/降级/.test(contentText)) return null
  const line = contentText.split(/\r?\n/).find((item) => /降级/.test(item))
  return line?.replace(/^[-*>\s]+/, '').trim() || 'GitNexus 不可用，本次已降级为源码搜索。'
}

export const shouldShowTechnicalDesignWriteback = ({
  scenarioCode,
  artifactType,
  contentText,
}: {
  scenarioCode: string
  artifactType: string
  contentText?: string | null
}): boolean => scenarioCode === 'TECHNICAL_DESIGN_AUTHORING'
  && artifactType === 'TECHNICAL_DESIGN_MARKDOWN'
  && Boolean(contentText?.trim())
