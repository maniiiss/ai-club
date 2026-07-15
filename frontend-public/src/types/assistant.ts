/**
 * Assistant 助手类型定义。
 * 公众端复用后端 /api/assistant/** 协议，但保持 React 侧独立类型，避免跨前端耦合。
 */

export type AssistantConversationMode = 'project'

export type AssistantConversationScope = 'GLOBAL' | 'PROJECT' | 'ALL'

export interface AssistantSelectionPayload {
  slot: string
  entityType: string
  entityId: number
  resumeQuestion?: string
}

export interface CreateAssistantConversationSessionPayload {
  routeName: string
  projectId?: number | null
  taskId?: number | null
  iterationId?: number | null
  planId?: number | null
  wikiSpaceId?: number | null
  wikiPageId?: number | null
}

export interface AssistantConversationSessionQuery {
  page: number
  size: number
  archived?: boolean
  scope?: AssistantConversationScope
  projectId?: number
}

export interface RenameAssistantConversationSessionPayload {
  title: string
}

export interface AssistantSessionChatRequestPayload {
  question: string
  selection?: AssistantSelectionPayload | null
  debug?: boolean
  slashCommand?: string | null
}

export interface AssistantSpeechTranscriptionPayload {
  text: string
}

export interface AssistantConversationSessionSummaryItem {
  id: number
  title: string
  titleCustomized: boolean
  routeName: string
  runtimeRegistryCode: string
  runtimeProfileVersion: number
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

export interface AssistantAttachmentItem {
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

export interface AssistantConversationMessageItem {
  id: number
  role: 'user' | 'assistant' | string
  content: string
  status: 'done' | 'error' | string
  createdAt: string | null
  attachments: AssistantAttachmentItem[]
}

/** GitPilot 单条回答的当前用户反馈状态。 */
export interface AssistantMessageFeedbackSummary {
  id: number
  sessionId: number
  assistantMessageId: number
  userMessageId: number | null
  submitterUserId: number
  submitterUsername: string
  submitterNickname: string
  vote: 'UP' | 'DOWN' | string
  reasonCodes: string[]
  comment: string
  questionSnapshot: string
  answerSnapshot: string
  runtimeRegistryCode: string
  routeName: string
  projectId: number | null
  status: string
  assigneeUserId: number | null
  resolutionCode: string | null
  resolutionNote: string
  improvementTags: string[]
  datasetStatus: string
  createdAt: string | null
  updatedAt: string | null
  resolvedAt: string | null
}

/** 反馈活动时间线项。 */
export interface AssistantFeedbackActivitySummary {
  id: number
  actionType: string
  fromStatus: string | null
  toStatus: string | null
  note: string
  actorUserId: number | null
  createdAt: string | null
}

/** 用户反馈详情。 */
export interface AssistantFeedbackDetail {
  feedback: AssistantMessageFeedbackSummary
  activities: AssistantFeedbackActivitySummary[]
}

export type AssistantFeedbackVote = 'UP' | 'DOWN'

export interface AssistantMessageFeedbackPayload {
  vote: AssistantFeedbackVote
  reasonCodes?: string[]
  comment?: string
}

export interface AssistantReferenceItem {
  type: string
  id: number | null
  title: string
  route: string
}

export interface AssistantActionItem {
  type: string
  title: string
  description: string
  requiresConfirm: boolean
  params: Record<string, unknown>
}

export interface AssistantSelectionOptionItem {
  slot: string
  entityType: string
  entityId: number | null
  title: string
  subtitle: string
  route: string
  matchScore: number
  matchReasons: string[]
}

export interface AssistantSelectionCardItem {
  slot: string
  title: string
  description: string
  resumeQuestion: string
  options: AssistantSelectionOptionItem[]
}

export interface AssistantDebugInfoItem {
  model: string
  loopStatus: string
  loopRounds: number
  assistantTurns: Array<Record<string, unknown>>
  groundingBefore: Record<string, unknown>
  groundingAfter: Record<string, unknown>
  toolExecutions: Array<Record<string, unknown>>
  failureMessage: string
}

export interface AssistantLatestDisplayState {
  references: AssistantReferenceItem[]
  suggestions: string[]
  actions: AssistantActionItem[]
  selectionCards: AssistantSelectionCardItem[]
  debug: AssistantDebugInfoItem | null
}

export interface AssistantConversationDetailItem extends AssistantConversationSessionSummaryItem {
  latestDisplayState: AssistantLatestDisplayState
  messages: AssistantConversationMessageItem[]
  executedActionKeys?: string[]
}

export interface AssistantSessionChatResponsePayload {
  sessionId: number
  userMessageId: number | null
  assistantMessageId: number | null
  scopeKey: string
  roleName: string
  content: string
  references: AssistantReferenceItem[]
  suggestions: string[]
  actions: AssistantActionItem[]
  selectionCards: AssistantSelectionCardItem[]
  debug: AssistantDebugInfoItem | null
  attachments: AssistantAttachmentItem[]
}

export interface AssistantMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'error'
  attachments: AssistantAttachmentItem[]
  actions?: AssistantActionItem[]
  toolExecutions?: Array<Record<string, unknown>>
  feedback?: AssistantMessageFeedbackSummary | null
}

export interface AssistantStreamMetaEvent {
  scopeKey: string
  roleName: string
  references: AssistantReferenceItem[]
  suggestions: string[]
  actions: AssistantActionItem[]
  selectionCards: AssistantSelectionCardItem[]
  debug: AssistantDebugInfoItem | null
  attachments: AssistantAttachmentItem[]
}

export interface AssistantStreamDeltaEvent {
  content: string
}

export interface AssistantStreamStatusEvent {
  stage: string
  message: string
}

export interface AssistantStreamDoneEvent {
  sessionId: number
  userMessageId: number | null
  assistantMessageId: number | null
  scopeKey: string
  roleName: string
  content: string
  references: AssistantReferenceItem[]
  suggestions: string[]
  actions: AssistantActionItem[]
  selectionCards: AssistantSelectionCardItem[]
  debug: AssistantDebugInfoItem | null
  attachments: AssistantAttachmentItem[]
}

/** 我的反馈分页查询参数。 */
export interface AssistantFeedbackQuery {
  page: number
  size: number
  sessionId?: number
}

export interface AssistantStreamErrorEvent {
  message: string
}

export interface AssistantUserMemoryItem {
  documentId: string
  title: string
  snippet: string
  question: string
  answer: string
  scene: string
  createdAt: string | null
  metadata: Record<string, unknown>
}

export interface AssistantMemoryFactItem {
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

export interface AssistantMemoryOverview {
  conversationMemories: AssistantUserMemoryItem[]
  consolidatedFacts: AssistantMemoryFactItem[]
}

export interface AssistantMemoryConsolidationTask {
  operationId: string
  deduplicated: boolean
}

export interface AssistantMemoryConsolidationStatus {
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

export interface AssistantFileLibraryItem {
  id: number
  assetId: number
  fileName: string
  title: string
  description: string
  sourceFormat: string
  fileSize: number
  enabled: boolean
  indexStatus: 'PENDING' | 'INDEXED' | 'FAILED' | string
  warnings: string[]
  lastError: string
  createdAt: string | null
  updatedAt: string | null
}

export interface UpdateAssistantFileLibraryItemPayload {
  title?: string
  description?: string
  enabled?: boolean
}
