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
 * Hermes 流式问答请求体。
 */
export interface HermesChatRequestPayload {
  question: string
  routeName: string
  projectId?: number | null
  taskId?: number | null
  iterationId?: number | null
  planId?: number | null
  clientConversationId?: string
  selection?: HermesSelectionPayload | null
  debug?: boolean
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
 * Hermes 非流式问答返回体。
 */
export interface HermesChatResponsePayload {
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
 * Hermes 抽屉内的消息项。
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

/**
 * 当前抽屉内缓存的一段会话可见状态。
 */
export interface HermesConversationSession {
  scopeKey: string
  messages: HermesMessageItem[]
  references: HermesReferenceItem[]
  suggestions: string[]
  roleName: string
  actions: HermesActionItem[]
  selectionCards: HermesSelectionCardItem[]
  debug: HermesDebugInfoItem | null
}
