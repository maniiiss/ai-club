import type { AgentOptionItem } from '@/src/types/development'

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
  agentOptions: AgentOptionItem[]
  stepAgentMap: Record<string, number | undefined>
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

export const isExecutableDevelopmentAgent = (agent?: AgentOptionItem | null): boolean =>
  Boolean(agent && ['HTTP_API', 'AGENT_RUNTIME'].includes(agent.accessType))

const isRuntimeType = (agent: AgentOptionItem, runtimeType: string): boolean =>
  agent.accessType === 'AGENT_RUNTIME' && agent.runtimeType === runtimeType

/**
 * 开发执行默认推荐规则复用管理端口径，优先选择能真实执行代码的 Runtime/API Agent。
 */
export const recommendDevelopmentExecutionAgentId = (
  stepCode: string,
  agentOptions: AgentOptionItem[],
): number | undefined => {
  const normalizedStepCode = stepCode.toUpperCase()
  const findRecommendedAgent = (
    ...predicates: Array<(agent: AgentOptionItem, haystack: string) => boolean>
  ) => {
    for (const predicate of predicates) {
      const matched = agentOptions.find((agent) => {
        const haystack = `${agent.name} ${agent.type} ${agent.capability || ''} ${agent.description || ''}`.toLowerCase()
        return predicate(agent, haystack)
      })
      if (matched?.id) return matched.id
    }
    return undefined
  }

  if (normalizedStepCode === 'PLAN') {
    const planAgentId = findRecommendedAgent(
      (agent) => isRuntimeType(agent, 'CLAUDE_CODE_CLI'),
      (agent, haystack) => agent.accessType === 'HTTP_API' && /claude/.test(haystack) && /plan|planning|规划/.test(haystack),
      (agent, haystack) => agent.accessType === 'HTTP_API' && /执行规划|开发执行规划/.test(haystack),
      (_agent, haystack) => /claude/.test(haystack) && /plan|planning|规划/.test(haystack),
      (_agent, haystack) => /plan|planning|规划/.test(haystack),
    )
    if (planAgentId) return planAgentId
  }

  const matchedAgentId = findRecommendedAgent(
    (agent, haystack) => normalizedStepCode === 'IMPLEMENT'
      ? (isRuntimeType(agent, 'CODEX_CLI') || isRuntimeType(agent, 'CLAUDE_CODE_CLI')
        || (isExecutableDevelopmentAgent(agent) && /coder|code|开发|实现/.test(haystack) && agent.builtinCode !== 'CODE_REVIEW'))
      : false,
    (agent, haystack) => normalizedStepCode === 'TEST'
      ? (isRuntimeType(agent, 'CODEX_CLI') || isRuntimeType(agent, 'CLAUDE_CODE_CLI')
        || (isExecutableDevelopmentAgent(agent) && /test|qa|测试|quality/.test(haystack)))
      : false,
    (_agent, haystack) => normalizedStepCode === 'REPORT'
      ? /report|报告|summary|总结/.test(haystack)
      : false,
  )
  if (matchedAgentId) return matchedAgentId
  if (normalizedStepCode === 'TEST') return recommendDevelopmentExecutionAgentId('IMPLEMENT', agentOptions)
  if (normalizedStepCode === 'REPORT') return recommendDevelopmentExecutionAgentId('PLAN', agentOptions)
  return undefined
}

/**
 * 提交前统一校验多仓库与关键执行步骤，和后端失败原因保持一致。
 */
export const validateDevelopmentExecutionDraft = ({
  repositories,
  agentOptions,
  stepAgentMap,
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
  for (const stepCode of ['IMPLEMENT', 'TEST']) {
    const agentId = stepAgentMap[stepCode]
    if (typeof agentId !== 'number') continue
    const agent = agentOptions.find((item) => item.id === agentId)
    if (!isExecutableDevelopmentAgent(agent)) {
      return {
        valid: false,
        message: `${stepCode === 'IMPLEMENT' ? '开发实现' : '执行测试'}必须绑定 HTTP_API 或 AGENT_RUNTIME 智能体`,
      }
    }
  }
  return { valid: true }
}
