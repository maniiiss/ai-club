export interface PiModel {
  id: string
  name: string
  provider: string
  api: string
  baseUrl?: string
  [key: string]: unknown
}

export function createPiAgent(options: Record<string, unknown>): any
export function resolvePiModel(provider: string, modelId: string, modelBaseUrl?: string): PiModel
export function normalizeThinkingLevel(value?: string): string
export function toPiHistoryMessages(history: unknown[], model: PiModel): any[]
export function lastAssistantText(messages?: any[]): string
export function normalizePiEvent(event: any): { eventType: string; payload: any } | null
