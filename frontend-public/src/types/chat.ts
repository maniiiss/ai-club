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

export type ChatSocketEvent =
  | { type: 'ROOM_JOINED'; roomId: number }
  | { type: 'ROOM_LEFT' }
  | { type: 'PONG' }
  | { type: 'ROOM_MESSAGE_CREATED'; message: ChatMessageItem }
  | { type: 'HERMES_STREAM_DELTA'; messageId: number; delta: string }
  | { type: 'HERMES_MESSAGE_DONE'; message: ChatMessageItem }
  | { type: 'HERMES_MESSAGE_ERROR'; message: ChatMessageItem }
  | { type: 'ROOM_UPDATED'; room: ChatRoomItem }
  | { type: string; [key: string]: unknown }
