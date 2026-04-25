import { AUTH_TOKEN_KEY } from '@/constants/auth'
import { http, getResolvedApiBaseUrl } from './http'
import type { ApiResponse, PageResponse } from '@/types/platform'
import type {
  CreateHermesConversationSessionPayload,
  HermesAttachmentItem,
  HermesConversationDetailItem,
  HermesConversationSessionQuery,
  HermesConversationSessionSummaryItem,
  HermesSpeechTranscriptionPayload,
  HermesSessionChatRequestPayload,
  HermesSessionChatResponsePayload,
  HermesStreamDeltaEvent,
  HermesStreamDoneEvent,
  HermesStreamErrorEvent,
  HermesStreamMetaEvent,
  HermesStreamStatusEvent,
  RenameHermesConversationSessionPayload
} from '@/types/hermes'

interface StreamHandlers {
  onStatus?: (payload: HermesStreamStatusEvent) => void
  onMeta?: (payload: HermesStreamMetaEvent) => void
  onDelta?: (payload: HermesStreamDeltaEvent) => void
  onDone?: (payload: HermesStreamDoneEvent) => void
  onError?: (payload: HermesStreamErrorEvent) => void
}

/**
 * 手动点击“停止”会触发 fetch/reader 的取消，这类错误不应该继续冒泡成业务报错提示。
 */
const isAbortLikeError = (error: unknown, signal: AbortSignal) => {
  if (signal.aborted) {
    return true
  }
  if (!(error instanceof Error)) {
    return false
  }
  return error.name === 'AbortError' || /aborted|abort/i.test(error.message)
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

/**
 * 创建一条新的 Hermes 云端会话。
 */
export const createHermesConversationSession = async (payload: CreateHermesConversationSessionPayload) => {
  const { data } = await http.post<ApiResponse<HermesConversationSessionSummaryItem>>('/api/hermes/sessions', payload)
  return data.data
}

/**
 * 分页读取当前用户的 Hermes 会话列表。
 */
export const pageHermesConversationSessions = async (query: HermesConversationSessionQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<HermesConversationSessionSummaryItem>>>('/api/hermes/sessions', {
    params: cleanParams(query)
  })
  return data.data
}

/**
 * 读取指定会话的详情与历史消息。
 */
export const getHermesConversationDetail = async (sessionId: number) => {
  const { data } = await http.get<ApiResponse<HermesConversationDetailItem>>(`/api/hermes/sessions/${sessionId}`)
  return data.data
}

/**
 * 重命名指定会话。
 */
export const renameHermesConversationSession = async (sessionId: number, payload: RenameHermesConversationSessionPayload) => {
  const { data } = await http.put<ApiResponse<HermesConversationSessionSummaryItem>>(`/api/hermes/sessions/${sessionId}`, payload)
  return data.data
}

/**
 * 归档指定会话。
 */
export const archiveHermesConversationSession = async (sessionId: number) => {
  const { data } = await http.post<ApiResponse<HermesConversationSessionSummaryItem>>(`/api/hermes/sessions/${sessionId}/archive`)
  return data.data
}

/**
 * 恢复指定会话。
 */
export const restoreHermesConversationSession = async (sessionId: number) => {
  const { data } = await http.post<ApiResponse<HermesConversationSessionSummaryItem>>(`/api/hermes/sessions/${sessionId}/restore`)
  return data.data
}

/**
 * 删除指定会话及其历史消息。
 */
export const deleteHermesConversationSession = async (sessionId: number) => {
  await http.delete<ApiResponse<null>>(`/api/hermes/sessions/${sessionId}`)
}

/**
 * 将 Hermes 录制的短语音转写为文本，再回填到输入框。
 */
export const transcribeHermesSpeech = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<HermesSpeechTranscriptionPayload>>('/api/hermes/speech/transcriptions', formData)
  return data.data.text || ''
}

/**
 * 指定会话的普通问答接口，主要供测试或兜底消费使用。
 */
export const chatHermesSession = async (sessionId: number, payload: HermesSessionChatRequestPayload) => {
  const { data } = await http.post<ApiResponse<HermesSessionChatResponsePayload>>(`/api/hermes/sessions/${sessionId}/chat`, payload)
  return data.data
}

/**
 * 通过 fetch 读取后端转发的 SSE 流。
 * 这里不能直接复用 EventSource，因为平台需要带 Bearer Token 且请求方式为 POST。
 */
export const streamHermesSessionChat = async (sessionId: number, payload: HermesSessionChatRequestPayload, handlers: StreamHandlers) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const response = await fetch(`${getResolvedApiBaseUrl()}/api/hermes/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  })

  if (!response.ok) {
    let message = 'Hermes 助手暂时不可用'
    try {
      const errorBody = await response.json()
      message = errorBody?.message || message
    } catch {
      // 保持兜底提示即可，避免解析失败反而吞掉原始错误。
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Hermes 流式响应为空')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let didReceiveTerminalEvent = false
  let didReceiveAnyEvent = false

  /**
   * SSE 事件可能被切成多次网络分片，必须按空行边界重新拼装。
   */
  const consumeChunk = (chunk: string) => {
    const normalized = chunk.replace(/\r/g, '')
    const lines = normalized.split('\n')
    let eventName = ''
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim())
      }
    }

    const data = dataLines.join('\n')
    if (!eventName || !data) {
      return
    }
    didReceiveAnyEvent = true

    if (eventName === 'meta') {
      handlers.onMeta?.(JSON.parse(data) as HermesStreamMetaEvent)
      return
    }
    if (eventName === 'status') {
      handlers.onStatus?.(JSON.parse(data) as HermesStreamStatusEvent)
      return
    }
    if (eventName === 'delta') {
      handlers.onDelta?.(JSON.parse(data) as HermesStreamDeltaEvent)
      return
    }
    if (eventName === 'done') {
      didReceiveTerminalEvent = true
      handlers.onDone?.(JSON.parse(data) as HermesStreamDoneEvent)
      return
    }
    if (eventName === 'error') {
      didReceiveTerminalEvent = true
      handlers.onError?.(JSON.parse(data) as HermesStreamErrorEvent)
    }
  }

  ;(async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        if (buffer.trim()) {
          consumeChunk(buffer)
        }
        if (!didReceiveTerminalEvent && didReceiveAnyEvent) {
          handlers.onDone?.({
            scopeKey: '',
            roleName: '',
            content: '',
            references: [],
            suggestions: [],
            actions: [],
            selectionCards: [],
            debug: null,
            attachments: []
          })
        }
        break
      }
      buffer += decoder.decode(value, { stream: true })
      let boundaryIndex = buffer.indexOf('\n\n')
      while (boundaryIndex >= 0) {
        const eventChunk = buffer.slice(0, boundaryIndex)
        buffer = buffer.slice(boundaryIndex + 2)
        if (eventChunk.trim()) {
          consumeChunk(eventChunk)
        }
        boundaryIndex = buffer.indexOf('\n\n')
      }
    }
  })().catch((error: unknown) => {
    if (isAbortLikeError(error, controller.signal)) {
      return
    }
    handlers.onError?.({
      message: error instanceof Error ? error.message : 'Hermes 流式连接已中断'
    })
  })

  return {
    abort: () => controller.abort()
  }
}

export const streamHermesSessionChatWithFiles = async (
  sessionId: number,
  payload: HermesSessionChatRequestPayload,
  files: File[],
  handlers: StreamHandlers
) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const formData = new FormData()
  formData.append('question', payload.question)
  if (payload.selection) {
    formData.append('selectionJson', JSON.stringify(payload.selection))
  }
  if (payload.debug != null) {
    formData.append('debug', String(payload.debug))
  }
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${getResolvedApiBaseUrl()}/api/hermes/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData,
    signal: controller.signal
  })

  if (!response.ok) {
    let message = 'Hermes 助手暂时不可用'
    try {
      const errorBody = await response.json()
      message = errorBody?.message || message
    } catch {
      // 忽略解析失败，保留默认提示。
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Hermes 流式响应为空')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let didReceiveTerminalEvent = false
  let didReceiveAnyEvent = false

  const consumeChunk = (chunk: string) => {
    const normalized = chunk.replace(/\r/g, '')
    const lines = normalized.split('\n')
    let eventName = ''
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim())
      }
    }
    const data = dataLines.join('\n')
    if (!eventName || !data) {
      return
    }
    didReceiveAnyEvent = true
    if (eventName === 'meta') {
      handlers.onMeta?.(JSON.parse(data))
      return
    }
    if (eventName === 'status') {
      handlers.onStatus?.(JSON.parse(data))
      return
    }
    if (eventName === 'delta') {
      handlers.onDelta?.(JSON.parse(data))
      return
    }
    if (eventName === 'done') {
      didReceiveTerminalEvent = true
      handlers.onDone?.(JSON.parse(data))
      return
    }
    if (eventName === 'error') {
      didReceiveTerminalEvent = true
      handlers.onError?.(JSON.parse(data))
    }
  }

  ;(async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        if (buffer.trim()) {
          consumeChunk(buffer)
        }
        if (!didReceiveTerminalEvent && didReceiveAnyEvent) {
          handlers.onDone?.({
            scopeKey: '',
            roleName: '',
            content: '',
            references: [],
            suggestions: [],
            actions: [],
            selectionCards: [],
            debug: null,
            attachments: [] as HermesAttachmentItem[]
          })
        }
        break
      }
      buffer += decoder.decode(value, { stream: true })
      let boundaryIndex = buffer.indexOf('\n\n')
      while (boundaryIndex >= 0) {
        const eventChunk = buffer.slice(0, boundaryIndex)
        buffer = buffer.slice(boundaryIndex + 2)
        if (eventChunk.trim()) {
          consumeChunk(eventChunk)
        }
        boundaryIndex = buffer.indexOf('\n\n')
      }
    }
  })().catch((error: unknown) => {
    if (isAbortLikeError(error, controller.signal)) {
      return
    }
    handlers.onError?.({
      message: error instanceof Error ? error.message : 'Hermes 流式连接已中断'
    })
  })

  return {
    abort: () => controller.abort()
  }
}
