/**
 * Assistant 助手 API。
 * 公众端使用后端 /api/assistant/** 会话协议，流式接口使用 fetch 以便携带 Bearer Token。
 */
import { AUTH_TOKEN_KEY, cleanParams, http, resolvedApiBaseUrl, unwrap } from './http'
import { parseAssistantSseChunk } from '@/src/lib/assistantUtils'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type {
  CreateAssistantConversationSessionPayload,
  AssistantConversationDetailItem,
  AssistantConversationSessionQuery,
  AssistantConversationSessionSummaryItem,
  AssistantFeedbackDetail,
  AssistantFeedbackQuery,
  AssistantMessageFeedbackPayload,
  AssistantMessageFeedbackSummary,
  AssistantFileLibraryItem,
  AssistantMemoryConsolidationStatus,
  AssistantMemoryConsolidationTask,
  AssistantMemoryOverview,
  AssistantSessionChatRequestPayload,
  AssistantSessionChatResponsePayload,
  AssistantSpeechTranscriptionPayload,
  AssistantStreamDeltaEvent,
  AssistantStreamDoneEvent,
  AssistantStreamErrorEvent,
  AssistantStreamMetaEvent,
  AssistantStreamStatusEvent,
  RenameAssistantConversationSessionPayload,
  UpdateAssistantFileLibraryItemPayload,
} from '@/src/types/assistant'

export interface AssistantStreamHandlers {
  onStatus?: (payload: AssistantStreamStatusEvent) => void
  onMeta?: (payload: AssistantStreamMetaEvent) => void
  onDelta?: (payload: AssistantStreamDeltaEvent) => void
  onDone?: (payload: AssistantStreamDoneEvent) => void
  onError?: (payload: AssistantStreamErrorEvent) => void
}

const isAbortLikeError = (error: unknown, signal: AbortSignal) => {
  if (signal.aborted) return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /aborted|abort/i.test(error.message)
}

const notifyInterruptedAssistantStream = (handlers: AssistantStreamHandlers, signal: AbortSignal) => {
  if (signal.aborted) return
  handlers.onError?.({
    message: 'GitPilot 连接已中断，可直接重试；如果页面里已经出现确认卡片，也可以继续使用当前结果',
  })
}

export const createAssistantConversationSession = async (
  payload: CreateAssistantConversationSessionPayload,
): Promise<AssistantConversationSessionSummaryItem> => {
  const res = await http.post<ApiResponse<AssistantConversationSessionSummaryItem>>('/api/assistant/sessions', payload)
  return unwrap(res)
}

export const pageAssistantConversationSessions = async (
  query: AssistantConversationSessionQuery,
): Promise<PageResponse<AssistantConversationSessionSummaryItem>> => {
  const res = await http.get<ApiResponse<PageResponse<AssistantConversationSessionSummaryItem>>>('/api/assistant/sessions', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

export const getAssistantConversationDetail = async (sessionId: number): Promise<AssistantConversationDetailItem> => {
  const res = await http.get<ApiResponse<AssistantConversationDetailItem>>(`/api/assistant/sessions/${sessionId}`)
  return unwrap(res)
}

/** 提交或覆盖当前用户对某条 GitPilot 回答的评价。 */
export const submitAssistantMessageFeedback = async (
  sessionId: number,
  messageId: number,
  payload: AssistantMessageFeedbackPayload,
): Promise<AssistantMessageFeedbackSummary> => {
  const res = await http.post<ApiResponse<AssistantMessageFeedbackSummary>>(
    `/api/assistant/sessions/${sessionId}/messages/${messageId}/feedback`,
    payload,
  )
  return unwrap(res)
}

/** 分页读取当前用户的 GitPilot 反馈。 */
export const pageAssistantFeedback = async (
  query: AssistantFeedbackQuery,
): Promise<PageResponse<AssistantMessageFeedbackSummary>> => {
  const res = await http.get<ApiResponse<PageResponse<AssistantMessageFeedbackSummary>>>('/api/assistant/feedback', {
    params: cleanParams(query),
  })
  return unwrap(res)
}

/** 读取当前用户的一条反馈详情。 */
export const getAssistantFeedback = async (id: number): Promise<AssistantFeedbackDetail> => {
  const res = await http.get<ApiResponse<AssistantFeedbackDetail>>(`/api/assistant/feedback/${id}`)
  return unwrap(res)
}

export const renameAssistantConversationSession = async (
  sessionId: number,
  payload: RenameAssistantConversationSessionPayload,
): Promise<AssistantConversationSessionSummaryItem> => {
  const res = await http.put<ApiResponse<AssistantConversationSessionSummaryItem>>(`/api/assistant/sessions/${sessionId}`, payload)
  return unwrap(res)
}

export const archiveAssistantConversationSession = async (sessionId: number): Promise<AssistantConversationSessionSummaryItem> => {
  const res = await http.post<ApiResponse<AssistantConversationSessionSummaryItem>>(`/api/assistant/sessions/${sessionId}/archive`)
  return unwrap(res)
}

export const restoreAssistantConversationSession = async (sessionId: number): Promise<AssistantConversationSessionSummaryItem> => {
  const res = await http.post<ApiResponse<AssistantConversationSessionSummaryItem>>(`/api/assistant/sessions/${sessionId}/restore`)
  return unwrap(res)
}

export const deleteAssistantConversationSession = async (sessionId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/assistant/sessions/${sessionId}`)
}

export const markAssistantActionExecuted = async (
  sessionId: number,
  actionKey: string,
): Promise<AssistantConversationDetailItem> => {
  const res = await http.post<ApiResponse<AssistantConversationDetailItem>>(
    `/api/assistant/sessions/${sessionId}/actions/executed`,
    { actionKey },
  )
  return unwrap(res)
}

export const listAssistantUserMemories = async (query?: string, limit?: number): Promise<AssistantMemoryOverview> => {
  const res = await http.get<ApiResponse<AssistantMemoryOverview>>('/api/assistant/memories', {
    params: cleanParams({ query, limit }),
  })
  return unwrap(res)
}

export const deleteAssistantUserMemory = async (documentId: string): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/assistant/memories/${encodeURIComponent(documentId)}`)
}

export const clearAssistantUserMemories = async (): Promise<number> => {
  const res = await http.delete<ApiResponse<number>>('/api/assistant/memories')
  return unwrap(res)
}

export const consolidateAssistantUserMemories = async (): Promise<AssistantMemoryConsolidationTask> => {
  const res = await http.post<ApiResponse<AssistantMemoryConsolidationTask>>('/api/assistant/memories/consolidate')
  return unwrap(res)
}

export const getAssistantMemoryConsolidationStatus = async (
  operationId: string,
): Promise<AssistantMemoryConsolidationStatus> => {
  const res = await http.get<ApiResponse<AssistantMemoryConsolidationStatus>>(
    `/api/assistant/memories/consolidate/${encodeURIComponent(operationId)}`,
  )
  return unwrap(res)
}

export const listAssistantFileLibraryItems = async (query?: string): Promise<AssistantFileLibraryItem[]> => {
  const res = await http.get<ApiResponse<AssistantFileLibraryItem[]>>('/api/assistant/file-library', {
    params: cleanParams({ query }),
  })
  return unwrap(res) || []
}

export const uploadAssistantFileLibraryItem = async (file: File): Promise<AssistantFileLibraryItem> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await http.post<ApiResponse<AssistantFileLibraryItem>>('/api/assistant/file-library/upload', formData)
  return unwrap(res)
}

export const updateAssistantFileLibraryItem = async (
  id: number,
  payload: UpdateAssistantFileLibraryItemPayload,
): Promise<AssistantFileLibraryItem> => {
  const res = await http.put<ApiResponse<AssistantFileLibraryItem>>(`/api/assistant/file-library/${id}`, payload)
  return unwrap(res)
}

export const deleteAssistantFileLibraryItem = async (id: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/assistant/file-library/${id}`)
}

export const reindexAssistantFileLibraryItem = async (id: number): Promise<AssistantFileLibraryItem> => {
  const res = await http.post<ApiResponse<AssistantFileLibraryItem>>(`/api/assistant/file-library/${id}/reindex`)
  return unwrap(res)
}

export const downloadAssistantFileLibraryAsset = async (
  assetId: number,
  fileName?: string,
  inline = false,
): Promise<void> => {
  const res = await http.get<Blob>(`/api/common/files/${assetId}`, {
    params: { inline },
    responseType: 'blob',
  })
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
  const disposition = String(res.headers['content-disposition'] || '')
  const resolvedName = fileName || parseFileName(disposition) || `file-${assetId}`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = resolvedName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const parseFileName = (contentDisposition: string): string => {
  const utf8Match = /filename\\*=UTF-8''([^;]+)/i.exec(contentDisposition)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition)
  return quotedMatch?.[1] || ''
}

export const transcribeAssistantSpeech = async (file: File): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await http.post<ApiResponse<AssistantSpeechTranscriptionPayload>>('/api/assistant/speech/transcriptions', formData)
  return unwrap(res).text || ''
}

export const chatAssistantSession = async (
  sessionId: number,
  payload: AssistantSessionChatRequestPayload,
): Promise<AssistantSessionChatResponsePayload> => {
  const res = await http.post<ApiResponse<AssistantSessionChatResponsePayload>>(`/api/assistant/sessions/${sessionId}/chat`, payload)
  return unwrap(res)
}

const consumeAssistantEvent = (eventChunk: string, handlers: AssistantStreamHandlers) => {
  const parsed = parseAssistantSseChunk(eventChunk)
  if (!parsed) return false
  if (parsed.eventName === 'meta') handlers.onMeta?.(parsed.data as AssistantStreamMetaEvent)
  if (parsed.eventName === 'status') handlers.onStatus?.(parsed.data as AssistantStreamStatusEvent)
  if (parsed.eventName === 'delta') handlers.onDelta?.(parsed.data as AssistantStreamDeltaEvent)
  if (parsed.eventName === 'done') handlers.onDone?.(parsed.data as AssistantStreamDoneEvent)
  if (parsed.eventName === 'error') handlers.onError?.(parsed.data as AssistantStreamErrorEvent)
  return parsed.eventName === 'done' || parsed.eventName === 'error'
}

const readAssistantStream = async (
  response: Response,
  controller: AbortController,
  handlers: AssistantStreamHandlers,
) => {
  if (!response.body) throw new Error('GitPilot 流式响应为空')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let didReceiveTerminalEvent = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      if (buffer.trim()) {
        didReceiveTerminalEvent = consumeAssistantEvent(buffer, handlers) || didReceiveTerminalEvent
      }
      if (!didReceiveTerminalEvent) {
        notifyInterruptedAssistantStream(handlers, controller.signal)
      }
      break
    }
    buffer += decoder.decode(value, { stream: true })
    let boundaryIndex = buffer.indexOf('\n\n')
    while (boundaryIndex >= 0) {
      const eventChunk = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + 2)
      if (eventChunk.trim()) {
        didReceiveTerminalEvent = consumeAssistantEvent(eventChunk, handlers) || didReceiveTerminalEvent
      }
      boundaryIndex = buffer.indexOf('\n\n')
    }
  }
}

const assertStreamResponseOk = async (response: Response) => {
  if (response.ok) return
  let message = 'GitPilot 助手暂时不可用'
  try {
    const errorBody = await response.json()
    message = errorBody?.message || message
  } catch {
    // 保留默认错误消息即可。
  }
  throw new Error(message)
}

export const streamAssistantSessionChat = async (
  sessionId: number,
  payload: AssistantSessionChatRequestPayload,
  handlers: AssistantStreamHandlers,
) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const response = await fetch(`${resolvedApiBaseUrl}/api/assistant/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  await assertStreamResponseOk(response)
  readAssistantStream(response, controller, handlers).catch((error: unknown) => {
    if (isAbortLikeError(error, controller.signal)) return
    handlers.onError?.({ message: error instanceof Error ? error.message : 'GitPilot 流式连接已中断' })
  })
  return { abort: () => controller.abort() }
}

export const streamAssistantSessionChatWithFiles = async (
  sessionId: number,
  payload: AssistantSessionChatRequestPayload,
  files: File[],
  handlers: AssistantStreamHandlers,
) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const formData = new FormData()
  formData.append('question', payload.question)
  if (payload.selection) formData.append('selectionJson', JSON.stringify(payload.selection))
  if (payload.debug != null) formData.append('debug', String(payload.debug))
  if (payload.slashCommand) formData.append('slashCommand', payload.slashCommand)
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${resolvedApiBaseUrl}/api/assistant/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
    signal: controller.signal,
  })
  await assertStreamResponseOk(response)
  readAssistantStream(response, controller, handlers).catch((error: unknown) => {
    if (isAbortLikeError(error, controller.signal)) return
    handlers.onError?.({ message: error instanceof Error ? error.message : 'GitPilot 流式连接已中断' })
  })
  return { abort: () => controller.abort() }
}
