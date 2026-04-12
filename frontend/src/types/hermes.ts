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
  toolResults: HermesToolResultItem[]
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
 * Hermes 返回的动作卡片。
 * 第一版主要用于创建执行中心任务。
 */
export interface HermesActionItem {
  type: string
  title: string
  description: string
  requiresConfirm: boolean
  params: Record<string, unknown>
}

/**
 * Hermes 返回的工具查询结果。
 */
export interface HermesToolResultItem {
  toolCode: string
  toolName: string
  summary: string
  candidates: HermesToolCandidateItem[]
  actions: HermesToolActionItem[]
  metadata: Record<string, unknown>
}

/**
 * Hermes 工具返回的候选对象卡片。
 */
export interface HermesToolCandidateItem {
  type: string
  id: number | null
  title: string
  subtitle: string
  route: string
  payload: Record<string, unknown>
  actions: HermesToolActionItem[]
}

/**
 * Hermes 工具候选对象下挂的动作。
 */
export interface HermesToolActionItem {
  type: string
  title: string
  description: string
  requiresConfirm: boolean
  params: Record<string, unknown>
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
  toolResults: HermesToolResultItem[]
}

/**
 * Hermes 流式 delta 事件。
 */
export interface HermesStreamDeltaEvent {
  content: string
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
  toolResults: HermesToolResultItem[]
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
  toolResults: HermesToolResultItem[]
}
