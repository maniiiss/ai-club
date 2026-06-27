/**
 * Hermes 助手类型定义。
 * 公众端复用后端 /api/hermes/** 协议，但保持 React 侧独立类型，避免跨前端耦合。
 */

export type HermesConversationMode = 'project'

export type HermesConversationScope = 'GLOBAL' | 'PROJECT' | 'ALL'

export interface HermesSelectionPayload {
  slot: string
  entityType: string
  entityId: number
  resumeQuestion?: string
}

export interface CreateHermesConversationSessionPayload {
  routeName: string
  projectId?: number | null
  taskId?: number | null
  iterationId?: number | null
  planId?: number | null
  wikiSpaceId?: number | null
  wikiPageId?: number | null
}

export interface HermesConversationSessionQuery {
  page: number
  size: number
  archived?: boolean
  scope?: HermesConversationScope
  projectId?: number
}

export interface RenameHermesConversationSessionPayload {
  title: string
}

export interface HermesSessionChatRequestPayload {
  question: string
  selection?: HermesSelectionPayload | null
  debug?: boolean
}

export interface HermesSpeechTranscriptionPayload {
  text: string
}

export interface HermesConversationSessionSummaryItem {
  id: number
  title: string
  titleCustomized: boolean
  routeName: string
  projectId: number | null
  taskId: number | null
  iterationId: number | null
  planId: number | null
  wikiSpaceId: number | null
  wikiPageId: number | null
  latestPreview: string
  archived: boolean
  createdAt: string | null
  updatedAt: string | null
  lastMessageAt: string | null
}

export interface HermesAttachmentItem {
  id: number | null
  assetId: number
  fileName: string
  contentType: string
  fileSize: number
  sourceFormat: string
  suggestedTitle: string
  truncated: boolean
  warnings: string[]
  createdAt: string | null
}

export interface HermesConversationMessageItem {
  id: number
  role: 'user' | 'assistant' | string
  content: string
  status: 'done' | 'error' | string
  createdAt: string | null
  attachments: HermesAttachmentItem[]
}

export interface HermesReferenceItem {
  type: string
  id: number | null
  title: string
  route: string
}

export interface HermesActionItem {
  type: string
  title: string
  description: string
  requiresConfirm: boolean
  params: Record<string, unknown>
}

export interface HermesSelectionOptionItem {
  slot: string
  entityType: string
  entityId: number | null
  title: string
  subtitle: string
  route: string
  matchScore: number
  matchReasons: string[]
}

export interface HermesSelectionCardItem {
  slot: string
  title: string
  description: string
  resumeQuestion: string
  options: HermesSelectionOptionItem[]
}

export interface HermesDebugInfoItem {
  model: string
  loopStatus: string
  loopRounds: number
  assistantTurns: Array<Record<string, unknown>>
  groundingBefore: Record<string, unknown>
  groundingAfter: Record<string, unknown>
  toolExecutions: Array<Record<string, unknown>>
  failureMessage: string
}

export interface HermesLatestDisplayState {
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
}

export interface HermesConversationDetailItem extends HermesConversationSessionSummaryItem {
  latestDisplayState: HermesLatestDisplayState
  messages: HermesConversationMessageItem[]
  executedActionKeys?: string[]
}

export interface HermesSessionChatResponsePayload {
  scopeKey: string
  roleName: string
  content: string
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
  attachments: HermesAttachmentItem[]
}

export interface HermesMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'error'
  attachments: HermesAttachmentItem[]
  actions?: HermesActionItem[]
  toolExecutions?: Array<Record<string, unknown>>
}

export interface HermesStreamMetaEvent {
  scopeKey: string
  roleName: string
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
  attachments: HermesAttachmentItem[]
}

export interface HermesStreamDeltaEvent {
  content: string
}

export interface HermesStreamStatusEvent {
  stage: string
  message: string
}

export interface HermesStreamDoneEvent {
  scopeKey: string
  roleName: string
  content: string
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
  attachments: HermesAttachmentItem[]
}

export interface HermesStreamErrorEvent {
  message: string
}

export interface HermesUserMemoryItem {
  documentId: string
  title: string
  snippet: string
  question: string
  answer: string
  scene: string
  createdAt: string | null
  metadata: Record<string, unknown>
}

export interface HermesMemoryFactItem {
  id: string
  summary: string
  predicate: string
  subject: string
  object: string
  sourceType: string
  createdAt: string | null
  tags: string[]
  metadata: Record<string, unknown>
}

export interface HermesMemoryOverview {
  conversationMemories: HermesUserMemoryItem[]
  consolidatedFacts: HermesMemoryFactItem[]
}

export interface HermesMemoryConsolidationTask {
  operationId: string
  deduplicated: boolean
}

export interface HermesMemoryConsolidationStatus {
  operationId: string
  operationType: string
  status: string
  errorMessage: string
  retryCount: number | null
  nextRetryAt: string | null
  createdAt: string | null
  updatedAt: string | null
  completedAt: string | null
}
