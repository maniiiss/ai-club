/**
 * Assistant 歧义对象选择请求。
 */
export interface AssistantSelectionPayload {
  slot: string
  entityType: string
  entityId: number
  resumeQuestion?: string
}

/**
 * 创建 Assistant 云端会话时使用的请求体。
 */
export interface CreateAssistantConversationSessionPayload {
  routeName: string
  projectId?: number | null
  taskId?: number | null
  iterationId?: number | null
  planId?: number | null
  wikiSpaceId?: number | null
  wikiPageId?: number | null
}

/**
 * Assistant 会话列表查询条件。
 */
export interface AssistantConversationSessionQuery {
  page: number
  size: number
  archived?: boolean
}

/**
 * 重命名 Assistant 会话时使用的请求体。
 */
export interface RenameAssistantConversationSessionPayload {
  title: string
}

/**
 * 指定会话的问答请求体。
 */
export interface AssistantSessionChatRequestPayload {
  question: string
  selection?: AssistantSelectionPayload | null
  debug?: boolean
  slashCommand?: string | null
}

/**
 * Assistant 语音转写返回体。
 */
export interface AssistantSpeechTranscriptionPayload {
  text: string
}

/**
 * Assistant 会话列表摘要项。
 */
export interface AssistantConversationSessionSummaryItem {
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
 * Assistant 会话详情中的单条消息项。
 */
export interface AssistantConversationMessageItem {
  id: number
  role: 'user' | 'assistant' | string
  content: string
  status: 'done' | 'error' | string
  createdAt: string | null
  attachments: AssistantAttachmentItem[]
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

/**
 * Assistant 回答中引用的业务对象摘要。
 */
export interface AssistantReferenceItem {
  type: string
  id: number | null
  title: string
  route: string
}

/**
 * Assistant 返回给前端的动作卡片。
 */
export interface AssistantActionItem {
  type: string
  title: string
  description: string
  requiresConfirm: boolean
  params: Record<string, unknown>
}

/**
 * 歧义候选中的单个选项。
 */
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

/**
 * 多候选歧义时展示给用户的选择卡片。
 */
export interface AssistantSelectionCardItem {
  slot: string
  title: string
  description: string
  resumeQuestion: string
  options: AssistantSelectionOptionItem[]
}

/**
 * 调试模式下透出的内部规划轨迹。
 */
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

/**
 * 会话详情回显所需的最新展示态。
 */
export interface AssistantLatestDisplayState {
  references: AssistantReferenceItem[]
  suggestions: string[]
  actions: AssistantActionItem[]
  selectionCards: AssistantSelectionCardItem[]
  debug: AssistantDebugInfoItem | null
}

/**
 * Assistant 云端会话详情。
 */
export interface AssistantConversationDetailItem extends AssistantConversationSessionSummaryItem {
  latestDisplayState: AssistantLatestDisplayState
  messages: AssistantConversationMessageItem[]
  /**
   * 后端累积记录的已执行动作 key 列表，供前端把"可执行动作"按钮恢复为"已执行"。
   */
  executedActionKeys?: string[]
}

/**
 * Assistant 非流式问答返回体。
 */
export interface AssistantSessionChatResponsePayload {
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

/**
 * Assistant 抽屉内的本地消息项。
 */
export interface AssistantMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'done' | 'streaming' | 'error'
  attachments: AssistantAttachmentItem[]
  actions?: AssistantActionItem[]
  /**
   * Assistant 本轮回答过程中触发的平台工具执行轨迹，前端用于生成可折叠的过程查看面板。
   */
  toolExecutions?: Array<Record<string, unknown>>
}

/**
 * Assistant 流式 meta 事件。
 */
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

/**
 * Assistant 流式 delta 事件。
 */
export interface AssistantStreamDeltaEvent {
  content: string
}

/**
 * Assistant 流式状态事件。
 */
export interface AssistantStreamStatusEvent {
  stage: string
  message: string
}

/**
 * Assistant 流式 done 事件。
 */
export interface AssistantStreamDoneEvent {
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

/**
 * Assistant 流式 error 事件。
 */
export interface AssistantStreamErrorEvent {
  message: string
}

/**
 * Assistant 用户记忆条目。
 */
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

/**
 * Assistant 记忆整理后生成的结构化事实。
 */
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

/**
 * Assistant 记忆管理页的聚合视图。
 */
export interface AssistantMemoryOverview {
  conversationMemories: AssistantUserMemoryItem[]
  consolidatedFacts: AssistantMemoryFactItem[]
}

/**
 * Assistant 记忆整理任务的启动结果。
 */
export interface AssistantMemoryConsolidationTask {
  operationId: string
  deduplicated: boolean
}

/**
 * Assistant 记忆整理任务的当前状态。
 */
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

/**
 * Assistant 个人文件库条目。
 */
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

/**
 * 更新 Assistant 个人文件库条目时使用的请求体。
 */
export interface UpdateAssistantFileLibraryItemPayload {
  title?: string
  description?: string
  enabled?: boolean
}
