export interface DevelopmentExecutionStepOption {
  stepCode: string
  stepName: string
  description: string
}

export interface DevelopmentExecutionRepositoryDraft {
  bindingId: number
  targetBranch: string
}

export interface DevelopmentExecutionValidationInput {
  repositories: DevelopmentExecutionRepositoryDraft[]
  resolveRepositoryName: (bindingId: number) => string
}

export type DevelopmentExecutionValidationResult =
  | { valid: true }
  | { valid: false; message: string }

export const DEVELOPMENT_EXECUTION_STEPS: DevelopmentExecutionStepOption[] = [
  { stepCode: 'PLAN', stepName: '执行规划', description: '扫描所选仓库并生成开发执行规划。' },
  { stepCode: 'IMPLEMENT', stepName: '开发实现', description: '由可真实执行的 Runtime / API Agent 完成代码开发。' },
  { stepCode: 'TEST', stepName: '执行测试', description: '由可真实执行的 Runtime / API Agent 完成仓库级验证。' },
  { stepCode: 'REPORT', stepName: '交付报告', description: '汇总多仓执行结果、失败位置与遗留风险。' },
]

/**
 * 发起人只负责确认仓库与分支；步骤执行器由已发布编排统一解析。
 */
export const validateDevelopmentExecutionDraft = ({
  repositories,
  resolveRepositoryName,
}: DevelopmentExecutionValidationInput): DevelopmentExecutionValidationResult => {
  if (!repositories.length) {
    return { valid: false, message: '开发执行至少需要选择一个 GitLab 仓库' }
  }
  for (const repository of repositories) {
    if (!repository.targetBranch.trim()) {
      return { valid: false, message: `${resolveRepositoryName(repository.bindingId)} 还没有填写目标分支` }
    }
  }
  return { valid: true }
}
