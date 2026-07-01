/**
 * 多人聊天室 API。
 * REST 负责房间与消息写入，WebSocket 只负责加入房间和接收实时广播。
 */
import { AUTH_TOKEN_KEY, http, resolvedApiBaseUrl, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type {
  ChatMessageItem,
  ChatRoomAgentActionResolutionPayload,
  ChatRoomAgentConfig,
  ChatRoomAgentSelectionPayload,
  ChatRoomAgentTask,
  ChatRoomAgentToolPolicy,
  ChatRoomDetail,
  ChatRoomItem,
  CreateChatRoomPayload,
  SendChatMessagePayload,
  UpdateChatRoomAgentConfigPayload,
  UpdateChatRoomAgentToolPoliciesPayload,
  UpdateChatRoomMembersPayload,
} from '@/src/types/chat'

export const listChatRooms = async (): Promise<ChatRoomItem[]> => {
  const response = await http.get<ApiResponse<ChatRoomItem[]>>('/api/chat/rooms')
  return unwrap(response)
}

export const createChatRoom = async (payload: CreateChatRoomPayload): Promise<ChatRoomItem> => {
  const response = await http.post<ApiResponse<ChatRoomItem>>('/api/chat/rooms', payload)
  return unwrap(response)
}

export const getChatRoomDetail = async (roomId: number): Promise<ChatRoomDetail> => {
  const response = await http.get<ApiResponse<ChatRoomDetail>>(`/api/chat/rooms/${roomId}`)
  return unwrap(response)
}

export const listChatMessages = async (roomId: number): Promise<ChatMessageItem[]> => {
  const response = await http.get<ApiResponse<ChatMessageItem[]>>(`/api/chat/rooms/${roomId}/messages`)
  return unwrap(response)
}

export const sendChatMessage = async (
  roomId: number,
  payload: SendChatMessagePayload,
  files: File[] = [],
): Promise<ChatMessageItem> => {
  if (files.length === 0) {
    const response = await http.post<ApiResponse<ChatMessageItem>>(`/api/chat/rooms/${roomId}/messages`, payload, {
      headers: { 'Content-Type': 'application/json' },
    })
    return unwrap(response)
  }

  const formData = new FormData()
  formData.append('content', payload.content)
  files.forEach((file) => formData.append('files', file))
  const response = await http.post<ApiResponse<ChatMessageItem>>(`/api/chat/rooms/${roomId}/messages`, formData)
  return unwrap(response)
}

export const updateChatRoomMembers = async (
  roomId: number,
  payload: UpdateChatRoomMembersPayload,
): Promise<ChatRoomItem> => {
  const response = await http.put<ApiResponse<ChatRoomItem>>(`/api/chat/rooms/${roomId}/members`, payload)
  return unwrap(response)
}

export const getChatRoomAgentConfig = async (roomId: number): Promise<ChatRoomAgentConfig> => {
  const response = await http.get<ApiResponse<ChatRoomAgentConfig>>(`/api/chat/rooms/${roomId}/agent`)
  return unwrap(response)
}

export const updateChatRoomAgentConfig = async (
  roomId: number,
  payload: UpdateChatRoomAgentConfigPayload,
): Promise<ChatRoomAgentConfig> => {
  const response = await http.put<ApiResponse<ChatRoomAgentConfig>>(`/api/chat/rooms/${roomId}/agent`, payload)
  return unwrap(response)
}

export const listChatRoomAgentTools = async (roomId: number): Promise<ChatRoomAgentToolPolicy[]> => {
  const response = await http.get<ApiResponse<ChatRoomAgentToolPolicy[]>>(`/api/chat/rooms/${roomId}/agent/tools`)
  return unwrap(response)
}

export const updateChatRoomAgentTools = async (
  roomId: number,
  payload: UpdateChatRoomAgentToolPoliciesPayload,
): Promise<ChatRoomAgentToolPolicy[]> => {
  const response = await http.put<ApiResponse<ChatRoomAgentToolPolicy[]>>(`/api/chat/rooms/${roomId}/agent/tools`, payload)
  return unwrap(response)
}

export const listChatRoomAgentTasks = async (roomId: number): Promise<ChatRoomAgentTask[]> => {
  const response = await http.get<ApiResponse<ChatRoomAgentTask[]>>(`/api/chat/rooms/${roomId}/agent/tasks`)
  return unwrap(response)
}

export const retryChatRoomAgentTask = async (roomId: number, taskId: number): Promise<ChatRoomAgentTask> => {
  const response = await http.post<ApiResponse<ChatRoomAgentTask>>(`/api/chat/rooms/${roomId}/agent/tasks/${taskId}/retry`)
  return unwrap(response)
}

export const cancelChatRoomAgentTask = async (roomId: number, taskId: number): Promise<ChatRoomAgentTask> => {
  const response = await http.post<ApiResponse<ChatRoomAgentTask>>(`/api/chat/rooms/${roomId}/agent/tasks/${taskId}/cancel`)
  return unwrap(response)
}

export const markChatRoomAgentActionExecuted = async (
  roomId: number,
  taskId: number,
  payload: ChatRoomAgentActionResolutionPayload,
): Promise<ChatRoomAgentTask> => {
  const response = await http.post<ApiResponse<ChatRoomAgentTask>>(
    `/api/chat/rooms/${roomId}/agent/tasks/${taskId}/actions/executed`,
    payload,
  )
  return unwrap(response)
}

export const cancelChatRoomAgentAction = async (
  roomId: number,
  taskId: number,
  payload: ChatRoomAgentActionResolutionPayload,
): Promise<ChatRoomAgentTask> => {
  const response = await http.post<ApiResponse<ChatRoomAgentTask>>(
    `/api/chat/rooms/${roomId}/agent/tasks/${taskId}/actions/canceled`,
    payload,
  )
  return unwrap(response)
}

export const selectChatRoomAgentCandidate = async (
  roomId: number,
  taskId: number,
  payload: ChatRoomAgentSelectionPayload,
): Promise<ChatRoomAgentTask> => {
  const response = await http.post<ApiResponse<ChatRoomAgentTask>>(
    `/api/chat/rooms/${roomId}/agent/tasks/${taskId}/selections`,
    payload,
  )
  return unwrap(response)
}

/** 将 HTTP API 地址转换为 WebSocket 地址，并带上当前认证 token。 */
export const buildChatSocketUrl = (): string => {
  const baseUrl = new URL(resolvedApiBaseUrl)
  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  baseUrl.pathname = '/ws/chat'
  baseUrl.search = ''
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (token) baseUrl.searchParams.set('token', token)
  return baseUrl.toString()
}

export const openChatSocket = (): WebSocket => new WebSocket(buildChatSocketUrl())

export const getChatAttachmentUrl = (assetId: number, inline = true): string =>
  `${resolvedApiBaseUrl}/api/common/files/${assetId}?inline=${inline ? 'true' : 'false'}`
