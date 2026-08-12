export interface PiModel {
  id: string
  name: string
  provider: string
  api: string
  baseUrl?: string
  [key: string]: unknown
}

export type StandardMessageRole = 'user' | 'assistant'
export interface StandardMessage {
  role: StandardMessageRole
  content: string
}

export const GITPILOT_AGENT_CORE_VERSION: string
export const HANDOFF_PROTOCOL_VERSION: 'v1'
export const HANDOFF_LIMITS: Readonly<{
  maxHistoryMessages: number
  maxMessageBytes: number
  maxHistoryBytes: number
  maxSummaryBytes: number
  maxContextItemCount: number
  maxContextItemBytes: number
  maxEnvelopeBytes: number
}>
export const HANDOFF_ERROR_CODES: Readonly<Record<string, string>>
export class HandoffValidationError extends Error { code: string }
export interface HandoffSessionEnvelope {
  protocolVersion: 'v1'
  sourceClient: { runtimeCode: string; runtimeVersion: string; cliVersion: string }
  conversationHistory: StandardMessage[]
  summary: string
  decisions: string[]
  pendingItems: string[]
  workspace: { baseCommit: string; handoffCommit: string; currentBranch: string }
}
export function validateHandoffSessionEnvelope(candidate: unknown): HandoffSessionEnvelope

export function createPiAgent(options: Record<string, unknown>): any
export function resolvePiModel(provider: string, modelId: string, modelBaseUrl?: string): PiModel
export function normalizeThinkingLevel(value?: string): string
export function toPiHistoryMessages(history: unknown[], model: PiModel): any[]
export function lastAssistantText(messages?: any[]): string
export function normalizePiEvent(event: any): { eventType: string; payload: any } | null
