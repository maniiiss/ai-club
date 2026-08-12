import {
  HANDOFF_ERROR_CODES,
  HANDOFF_LIMITS,
  HANDOFF_PROTOCOL_VERSION,
  HandoffValidationError,
  validateHandoffSessionEnvelope,
} from '@aiclub/gitpilot-agent-core'

export interface HandoffSessionEnvelope {
  protocolVersion: 'v1'
  sourceClient: { runtimeCode: string; runtimeVersion: string; cliVersion: string }
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  summary: string
  decisions: string[]
  pendingItems: string[]
  workspace: { baseCommit: string; handoffCommit: string; currentBranch: string }
}

/**
 * CLI 接力上下文的显式入口。
 * 业务意图：CLI 不直接依赖 Pi SDK 私有对象，所有上传前数据都经过同一套 Core 协议校验。
 */
export const validateHandoffEnvelope = (value: unknown): HandoffSessionEnvelope =>
  validateHandoffSessionEnvelope(value) as HandoffSessionEnvelope

export {
  HANDOFF_ERROR_CODES,
  HANDOFF_LIMITS,
  HANDOFF_PROTOCOL_VERSION,
  HandoffValidationError,
}
