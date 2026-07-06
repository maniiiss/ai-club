import type { HermesActionItem, HermesSelectionCardItem } from './hermes'
import type { HermesSelectionPayload } from './hermes'

/**
 * 多人聊天室类型定义。
 * 与后端 /api/chat/** 和 /ws/chat 事件契约对齐。
 */

export interface ChatAttachmentItem {
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

export interface ChatMemberItem {
  userId: number
  username: string
  nickname: string
  avatarUrl: string
  role: string
}

export interface ChatRoomItem {
  id: number
  title: string
  visibilityType: 'PROJECT' | 'GLOBAL_INVITE' | string
  projectId: number | null
  projectName: string
  creatorUserId: number | null
  creatorName: string
  latestPreview: string
  historySummary: string
  archived: boolean
  members: ChatMemberItem[]
  createdAt: string | null
  updatedAt: string | null
  lastMessageAt: string | null
}

export interface ChatRoomAgentConfig {
  roomId: number
  enabled: boolean
  displayName: string
  systemInstruction: string
  proactiveSummaryEnabled: boolean
  keywordWatchEnabled: boolean
  taskStatusCallbackEnabled: boolean
  proactiveSummaryMessageThreshold: number
  proactiveSummaryMinIntervalMinutes: number
  keywordWatchTerms: string[]
  keywordWatchCooldownMinutes: number
  taskStatusCallbackStatuses: string[]
  authorizedByUserId: number | null
  authorizedByName: string
  authorizedAt: string | null
  updatedAt: string | null
}

export interface ChatRoomAgentToolPolicy {
  toolCode: string
  toolName: string
  moduleCode: string
  readOnly: boolean
  riskLevel: string
  enabled: boolean
  autoExecute: boolean
  autoExecuteAllowed: boolean
  permissionCode: string
  updatedAt: string | null
}

export interface ChatRoomAgentTask {
  id: number
  roomId: number
  assistantMessageId: number | null
  triggerMessageId: number | null
  triggerUserId: number | null
  authorizedByUserId: number | null
  triggerType: string
  status: string
  source: string
  sourceRef: string
  payloadJson: string
  errorMessage: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface ChatRoomAgentTaskEvent {
  id: number | null
  taskId: number
  roomId: number
  eventType: string
  message: string
  payloadJson: string
  createdAt: string | null
}

export interface ChatMessageItem {
  id: number
  roomId: number
  role: 'user' | 'assistant'
  senderUserId: number | null
  senderUsername: string
  senderName: string
  senderAvatarUrl: string | null
  content: string
  status: 'done' | 'streaming' | 'error'
  mentionsHermes: boolean
  attachments: ChatAttachmentItem[]
  agentTaskId?: number | null
  agentTaskStatus?: string
  actions?: HermesActionItem[]
  actionStatuses?: Record<string, string>
  selectionCards?: HermesSelectionCardItem[]
  selectionStatuses?: Record<string, string>
  createdAt: string | null
  updatedAt: string | null
}

export interface ChatRoomDetail {
  room: ChatRoomItem
  messages: ChatMessageItem[]
}

export interface CreateChatRoomPayload {
  title: string
  projectId?: number | null
  invitedUserIds: number[]
}

export interface SendChatMessagePayload {
  content: string
  attachmentAssetIds?: number[]
}

export interface UpdateChatRoomMembersPayload {
  memberUserIds: number[]
}

export interface UpdateChatRoomAgentConfigPayload {
  enabled: boolean
  displayName: string
  systemInstruction: string
  proactiveSummaryEnabled: boolean
  keywordWatchEnabled: boolean
  taskStatusCallbackEnabled: boolean
  proactiveSummaryMessageThreshold: number
  proactiveSummaryMinIntervalMinutes: number
  keywordWatchTerms: string[]
  keywordWatchCooldownMinutes: number
  taskStatusCallbackStatuses: string[]
}

export interface UpdateChatRoomAgentToolPoliciesPayload {
  tools: Array<{
    toolCode: string
    enabled: boolean
    autoExecute: boolean
  }>
}

export type ChatSocketEvent =
  | { type: 'ROOM_JOINED'; roomId: number }
  | { type: 'ROOM_LEFT' }
  | { type: 'PONG' }
  | { type: 'ROOM_MESSAGE_CREATED'; message: ChatMessageItem }
  | { type: 'HERMES_STREAM_DELTA'; messageId: number; delta: string }
  | { type: 'HERMES_MESSAGE_DONE'; message: ChatMessageItem }
  | { type: 'HERMES_MESSAGE_ERROR'; message: ChatMessageItem }
  | { type: 'ROOM_UPDATED'; room: ChatRoomItem }
  | { type: 'AGENT_CONFIG_UPDATED'; config: ChatRoomAgentConfig }
  | { type: 'AGENT_TOOLS_UPDATED'; tools: ChatRoomAgentToolPolicy[] }
  | { type: 'AGENT_TASK_CREATED'; task: ChatRoomAgentTask }
  | { type: 'AGENT_TASK_UPDATED'; task: ChatRoomAgentTask }
  | { type: 'AGENT_TASK_EVENT'; event: ChatRoomAgentTaskEvent }
  | { type: 'AGENT_ACTION_PENDING'; taskId: number | null; messageId: number | null; actions: HermesActionItem[] }
  | { type: 'AGENT_SELECTION_PENDING'; taskId: number | null; messageId: number | null; selectionCards: HermesSelectionCardItem[] }
  | { type: 'AGENT_SELECTION_RESOLVED'; taskId: number | null; messageId: number | null; selectionKey: string; status: string }
  | { type: 'AGENT_ACTION_EXECUTED'; taskId: number | null; messageId: number | null; action: HermesActionItem | null; status: string; actionKey?: string }
  | { type: string; [key: string]: unknown }

export interface ChatRoomAgentActionResolutionPayload {
  actionKey: string
}

export type ChatRoomAgentSelectionPayload = HermesSelectionPayload
