/**
 * Hermes 歧义对象选择请求。
 */
export interface HermesSelectionPayload {
  slot: string
  entityType: string
  entityId: number
  resumeQuestion?: string
}

/**
 * 创建 Hermes 云端会话时使用的请求体。
 */
export interface CreateHermesConversationSessionPayload {
  routeName: string
  projectId?: number | null
  taskId?: number | null
  iterationId?: number | null
  planId?: number | null
  wikiSpaceId?: number | null
  wikiPageId?: number | null
}

/**
 * Hermes 会话列表查询条件。
 */
export interface HermesConversationSessionQuery {
  page: number
  size: number
  archived?: boolean
}

/**
 * 重命名 Hermes 会话时使用的请求体。
 */
export interface RenameHermesConversationSessionPayload {
  title: string
}

/**
 * 指定会话的问答请求体。
 */
export interface HermesSessionChatRequestPayload {
  question: string
  selection?: HermesSelectionPayload | null
  debug?: boolean
}

/**
 * Hermes 会话列表摘要项。
 */
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

/**
 * Hermes 会话详情中的单条消息项。
 */
export interface HermesConversationMessageItem {
  id: number
  role: 'user' | 'assistant' | string
  content: string
  status: 'done' | 'error' | string
  createdAt: string | null
}

/**
 * Hermes 回答中引用的业务对象摘要。
 */
export interface HermesReferenceItem {
  type: string
  id: number | null
  title: string
  route: string
}

/**
 * Hermes 返回给前端的动作卡片。
 */
export interface HermesActionItem {
  type: string
  title: string
  description: string
  requiresConfirm: boolean
  params: Record<string, unknown>
}

/**
 * 歧义候选中的单个选项。
 */
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

/**
 * 多候选歧义时展示给用户的选择卡片。
 */
export interface HermesSelectionCardItem {
  slot: string
  title: string
  description: string
  resumeQuestion: string
  options: HermesSelectionOptionItem[]
}

/**
 * 调试模式下透出的内部规划轨迹。
 */
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

/**
 * 会话详情回显所需的最新展示态。
 */
export interface HermesLatestDisplayState {
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
}

/**
 * Hermes 云端会话详情。
 */
export interface HermesConversationDetailItem extends HermesConversationSessionSummaryItem {
  latestDisplayState: HermesLatestDisplayState
  messages: HermesConversationMessageItem[]
}

/**
 * Hermes 非流式问答返回体。
 */
export interface HermesSessionChatResponsePayload {
  scopeKey: string
  roleName: string
  content: string
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
}

/**
 * Hermes 抽屉内的本地消息项。
 */
export interface HermesMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'error'
  actions?: HermesActionItem[]
}

/**
 * Hermes 流式 meta 事件。
 */
export interface HermesStreamMetaEvent {
  scopeKey: string
  roleName: string
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
}

/**
 * Hermes 流式 delta 事件。
 */
export interface HermesStreamDeltaEvent {
  content: string
}

/**
 * Hermes 流式状态事件。
 */
export interface HermesStreamStatusEvent {
  stage: string
  message: string
}

/**
 * Hermes 流式 done 事件。
 */
export interface HermesStreamDoneEvent {
  scopeKey: string
  roleName: string
  content: string
  references: HermesReferenceItem[]
  suggestions: string[]
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
}

/**
 * Hermes 流式 error 事件。
 */
export interface HermesStreamErrorEvent {
  message: string
}
