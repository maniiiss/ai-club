/**
 * Hermes 助手 API。
 * 公众端直接复用后端 /api/hermes/** 会话协议，流式接口使用 fetch 以便携带 Bearer Token。
 */
import { AUTH_TOKEN_KEY, cleanParams, http, resolvedApiBaseUrl, unwrap } from './http'
import { parseHermesSseChunk } from '@/src/lib/hermesUtils'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  CreateHermesConversationSessionPayload,
  HermesConversationDetailItem,
  HermesConversationSessionQuery,
  HermesConversationSessionSummaryItem,
  HermesFileLibraryItem,
  HermesMemoryConsolidationStatus,
  HermesMemoryConsolidationTask,
  HermesMemoryOverview,
  HermesSessionChatRequestPayload,
  HermesSessionChatResponsePayload,
  HermesSpeechTranscriptionPayload,
  HermesStreamDeltaEvent,
  HermesStreamDoneEvent,
  HermesStreamErrorEvent,
  HermesStreamMetaEvent,
  HermesStreamStatusEvent,
  RenameHermesConversationSessionPayload,
  UpdateHermesFileLibraryItemPayload,
} from '@/src/types/hermes'

export interface HermesStreamHandlers {
  onStatus?: (payload: HermesStreamStatusEvent) => void
  onMeta?: (payload: HermesStreamMetaEvent) => void
  onDelta?: (payload: HermesStreamDeltaEvent) => void
  onDone?: (payload: HermesStreamDoneEvent) => void
  onError?: (payload: HermesStreamErrorEvent) => void
}

const isAbortLikeError = (error: unknown, signal: AbortSignal) => {
  if (signal.aborted) return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /aborted|abort/i.test(error.message)
}

const notifyInterruptedHermesStream = (handlers: HermesStreamHandlers, signal: AbortSignal) => {
  if (signal.aborted) return
  handlers.onError?.({
    message: 'Hermes 连接已中断，可直接重试；如果页面里已经出现确认卡片，也可以继续使用当前结果',
  })
}

export const createHermesConversationSession = async (
  payload: CreateHermesConversationSessionPayload,
): Promise<HermesConversationSessionSummaryItem> => {
  const res = await http.post<ApiResponse<HermesConversationSessionSummaryItem>>('/api/hermes/sessions', payload)
  return unwrap(res)
}

export const pageHermesConversationSessions = async (
  query: HermesConversationSessionQuery,
): Promise<PageResponse<HermesConversationSessionSummaryItem>> => {
  const res = await http.get<ApiResponse<PageResponse<HermesConversationSessionSummaryItem>>>('/api/hermes/sessions', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

export const getHermesConversationDetail = async (sessionId: number): Promise<HermesConversationDetailItem> => {
  const res = await http.get<ApiResponse<HermesConversationDetailItem>>(`/api/hermes/sessions/${sessionId}`)
  return unwrap(res)
}

export const renameHermesConversationSession = async (
  sessionId: number,
  payload: RenameHermesConversationSessionPayload,
): Promise<HermesConversationSessionSummaryItem> => {
  const res = await http.put<ApiResponse<HermesConversationSessionSummaryItem>>(`/api/hermes/sessions/${sessionId}`, payload)
  return unwrap(res)
}

export const archiveHermesConversationSession = async (sessionId: number): Promise<HermesConversationSessionSummaryItem> => {
  const res = await http.post<ApiResponse<HermesConversationSessionSummaryItem>>(`/api/hermes/sessions/${sessionId}/archive`)
  return unwrap(res)
}

export const restoreHermesConversationSession = async (sessionId: number): Promise<HermesConversationSessionSummaryItem> => {
  const res = await http.post<ApiResponse<HermesConversationSessionSummaryItem>>(`/api/hermes/sessions/${sessionId}/restore`)
  return unwrap(res)
}

export const deleteHermesConversationSession = async (sessionId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/hermes/sessions/${sessionId}`)
}

export const markHermesActionExecuted = async (
  sessionId: number,
  actionKey: string,
): Promise<HermesConversationDetailItem> => {
  const res = await http.post<ApiResponse<HermesConversationDetailItem>>(
    `/api/hermes/sessions/${sessionId}/actions/executed`,
    { actionKey },
  )
  return unwrap(res)
}

export const listHermesUserMemories = async (query?: string, limit?: number): Promise<HermesMemoryOverview> => {
  const res = await http.get<ApiResponse<HermesMemoryOverview>>('/api/hermes/memories', {
    params: cleanParams({ query, limit }),
  })
  return unwrap(res)
}

export const deleteHermesUserMemory = async (documentId: string): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/hermes/memories/${encodeURIComponent(documentId)}`)
}

export const clearHermesUserMemories = async (): Promise<number> => {
  const res = await http.delete<ApiResponse<number>>('/api/hermes/memories')
  return unwrap(res)
}

export const consolidateHermesUserMemories = async (): Promise<HermesMemoryConsolidationTask> => {
  const res = await http.post<ApiResponse<HermesMemoryConsolidationTask>>('/api/hermes/memories/consolidate')
  return unwrap(res)
}

export const getHermesMemoryConsolidationStatus = async (
  operationId: string,
): Promise<HermesMemoryConsolidationStatus> => {
  const res = await http.get<ApiResponse<HermesMemoryConsolidationStatus>>(
    `/api/hermes/memories/consolidate/${encodeURIComponent(operationId)}`,
  )
  return unwrap(res)
}

export const listHermesFileLibraryItems = async (query?: string): Promise<HermesFileLibraryItem[]> => {
  const res = await http.get<ApiResponse<HermesFileLibraryItem[]>>('/api/hermes/file-library', {
    params: cleanParams({ query }),
  })
  return unwrap(res) || []
}

export const uploadHermesFileLibraryItem = async (file: File): Promise<HermesFileLibraryItem> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await http.post<ApiResponse<HermesFileLibraryItem>>('/api/hermes/file-library/upload', formData)
  return unwrap(res)
}

export const updateHermesFileLibraryItem = async (
  id: number,
  payload: UpdateHermesFileLibraryItemPayload,
): Promise<HermesFileLibraryItem> => {
  const res = await http.patch<ApiResponse<HermesFileLibraryItem>>(`/api/hermes/file-library/${id}`, payload)
  return unwrap(res)
}

export const deleteHermesFileLibraryItem = async (id: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/hermes/file-library/${id}`)
}

export const reindexHermesFileLibraryItem = async (id: number): Promise<HermesFileLibraryItem> => {
  const res = await http.post<ApiResponse<HermesFileLibraryItem>>(`/api/hermes/file-library/${id}/reindex`)
  return unwrap(res)
}

export const getHermesFileLibraryDownloadUrl = (assetId: number, inline = false): string =>
  `${resolvedApiBaseUrl}/api/common/files/${assetId}?inline=${inline ? 'true' : 'false'}`

export const transcribeHermesSpeech = async (file: File): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await http.post<ApiResponse<HermesSpeechTranscriptionPayload>>('/api/hermes/speech/transcriptions', formData)
  return unwrap(res).text || ''
}

export const chatHermesSession = async (
  sessionId: number,
  payload: HermesSessionChatRequestPayload,
): Promise<HermesSessionChatResponsePayload> => {
  const res = await http.post<ApiResponse<HermesSessionChatResponsePayload>>(`/api/hermes/sessions/${sessionId}/chat`, payload)
  return unwrap(res)
}

const consumeHermesEvent = (eventChunk: string, handlers: HermesStreamHandlers) => {
  const parsed = parseHermesSseChunk(eventChunk)
  if (!parsed) return false
  if (parsed.eventName === 'meta') handlers.onMeta?.(parsed.data as HermesStreamMetaEvent)
  if (parsed.eventName === 'status') handlers.onStatus?.(parsed.data as HermesStreamStatusEvent)
  if (parsed.eventName === 'delta') handlers.onDelta?.(parsed.data as HermesStreamDeltaEvent)
  if (parsed.eventName === 'done') handlers.onDone?.(parsed.data as HermesStreamDoneEvent)
  if (parsed.eventName === 'error') handlers.onError?.(parsed.data as HermesStreamErrorEvent)
  return parsed.eventName === 'done' || parsed.eventName === 'error'
}

const readHermesStream = async (
  response: Response,
  controller: AbortController,
  handlers: HermesStreamHandlers,
) => {
  if (!response.body) throw new Error('Hermes 流式响应为空')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let didReceiveTerminalEvent = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      if (buffer.trim()) {
        didReceiveTerminalEvent = consumeHermesEvent(buffer, handlers) || didReceiveTerminalEvent
      }
      if (!didReceiveTerminalEvent) {
        notifyInterruptedHermesStream(handlers, controller.signal)
      }
      break
    }
    buffer += decoder.decode(value, { stream: true })
    let boundaryIndex = buffer.indexOf('\n\n')
    while (boundaryIndex >= 0) {
      const eventChunk = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + 2)
      if (eventChunk.trim()) {
        didReceiveTerminalEvent = consumeHermesEvent(eventChunk, handlers) || didReceiveTerminalEvent
      }
      boundaryIndex = buffer.indexOf('\n\n')
    }
  }
}

const assertStreamResponseOk = async (response: Response) => {
  if (response.ok) return
  let message = 'Hermes 助手暂时不可用'
  try {
    const errorBody = await response.json()
    message = errorBody?.message || message
  } catch {
    // 保留默认错误消息即可。
  }
  throw new Error(message)
}

export const streamHermesSessionChat = async (
  sessionId: number,
  payload: HermesSessionChatRequestPayload,
  handlers: HermesStreamHandlers,
) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const response = await fetch(`${resolvedApiBaseUrl}/api/hermes/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  await assertStreamResponseOk(response)
  readHermesStream(response, controller, handlers).catch((error: unknown) => {
    if (isAbortLikeError(error, controller.signal)) return
    handlers.onError?.({ message: error instanceof Error ? error.message : 'Hermes 流式连接已中断' })
  })
  return { abort: () => controller.abort() }
}

export const streamHermesSessionChatWithFiles = async (
  sessionId: number,
  payload: HermesSessionChatRequestPayload,
  files: File[],
  handlers: HermesStreamHandlers,
) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const formData = new FormData()
  formData.append('question', payload.question)
  if (payload.selection) formData.append('selectionJson', JSON.stringify(payload.selection))
  if (payload.debug != null) formData.append('debug', String(payload.debug))
  if (payload.slashCommand) formData.append('slashCommand', payload.slashCommand)
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${resolvedApiBaseUrl}/api/hermes/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
    signal: controller.signal,
  })
  await assertStreamResponseOk(response)
  readHermesStream(response, controller, handlers).catch((error: unknown) => {
    if (isAbortLikeError(error, controller.signal)) return
    handlers.onError?.({ message: error instanceof Error ? error.message : 'Hermes 流式连接已中断' })
  })
  return { abort: () => controller.abort() }
}
