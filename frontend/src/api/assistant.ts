import { AUTH_TOKEN_KEY } from '@/constants/auth'
import { http, getResolvedApiBaseUrl } from './http'
import type { ApiResponse, PageResponse } from '@/types/platform'
import type {
  CreateAssistantConversationSessionPayload,
  AssistantAttachmentItem,
  AssistantFileLibraryItem,
  AssistantMemoryConsolidationStatus,
  AssistantMemoryConsolidationTask,
  AssistantMemoryOverview,
  AssistantConversationDetailItem,
  AssistantConversationSessionQuery,
  AssistantConversationSessionSummaryItem,
  AssistantSpeechTranscriptionPayload,
  AssistantSessionChatRequestPayload,
  AssistantSessionChatResponsePayload,
  AssistantStreamDeltaEvent,
  AssistantStreamDoneEvent,
  AssistantStreamErrorEvent,
  AssistantStreamMetaEvent,
  AssistantStreamStatusEvent,
  AssistantUserMemoryItem,
  RenameAssistantConversationSessionPayload,
  UpdateAssistantFileLibraryItemPayload
} from '@/types/assistant'

interface StreamHandlers {
  onStatus?: (payload: AssistantStreamStatusEvent) => void
  onMeta?: (payload: AssistantStreamMetaEvent) => void
  onDelta?: (payload: AssistantStreamDeltaEvent) => void
  onDone?: (payload: AssistantStreamDoneEvent) => void
  onError?: (payload: AssistantStreamErrorEvent) => void
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

/**
 * 网络或代理层异常断开时，不能伪造空 done 事件，否则会把前端正在展示的确认卡片清空。
 */
const notifyInterruptedAssistantStream = (handlers: StreamHandlers, signal: AbortSignal) => {
  if (signal.aborted) {
    return
  }
  handlers.onError?.({
    message: 'GitPilot 连接已中断，可直接重试；如果页面里已经出现确认卡片，也可以继续使用当前结果'
  })
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

/**
 * 创建一条新的 Assistant 云端会话。
 */
export const createAssistantConversationSession = async (payload: CreateAssistantConversationSessionPayload) => {
  const { data } = await http.post<ApiResponse<AssistantConversationSessionSummaryItem>>('/api/assistant/sessions', payload)
  return data.data
}

/**
 * 分页读取当前用户的 Assistant 会话列表。
 */
export const pageAssistantConversationSessions = async (query: AssistantConversationSessionQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<AssistantConversationSessionSummaryItem>>>('/api/assistant/sessions', {
    params: cleanParams(query)
  })
  return data.data
}

/**
 * 读取指定会话的详情与历史消息。
 */
export const getAssistantConversationDetail = async (sessionId: number) => {
  const { data } = await http.get<ApiResponse<AssistantConversationDetailItem>>(`/api/assistant/sessions/${sessionId}`)
  return data.data
}

/**
 * 重命名指定会话。
 */
export const renameAssistantConversationSession = async (sessionId: number, payload: RenameAssistantConversationSessionPayload) => {
  const { data } = await http.put<ApiResponse<AssistantConversationSessionSummaryItem>>(`/api/assistant/sessions/${sessionId}`, payload)
  return data.data
}

/**
 * 归档指定会话。
 */
export const archiveAssistantConversationSession = async (sessionId: number) => {
  const { data } = await http.post<ApiResponse<AssistantConversationSessionSummaryItem>>(`/api/assistant/sessions/${sessionId}/archive`)
  return data.data
}

/**
 * 恢复指定会话。
 */
export const restoreAssistantConversationSession = async (sessionId: number) => {
  const { data } = await http.post<ApiResponse<AssistantConversationSessionSummaryItem>>(`/api/assistant/sessions/${sessionId}/restore`)
  return data.data
}

/**
 * 删除指定会话及其历史消息。
 */
export const deleteAssistantConversationSession = async (sessionId: number) => {
  await http.delete<ApiResponse<null>>(`/api/assistant/sessions/${sessionId}`)
}

/**
 * 上报某条 Assistant 可执行动作已被用户确认执行，后端会按会话累积保存动作 key，
 * 让"已执行"状态在刷新或换设备登录后仍能恢复。
 */
export const markAssistantActionExecuted = async (sessionId: number, actionKey: string) => {
  const { data } = await http.post<ApiResponse<AssistantConversationDetailItem>>(
    `/api/assistant/sessions/${sessionId}/actions/executed`,
    { actionKey }
  )
  return data.data
}

/**
 * 列出当前用户的 Assistant 记忆。
 */
export const listAssistantUserMemories = async (query?: string, limit?: number) => {
  const { data } = await http.get<ApiResponse<AssistantMemoryOverview>>('/api/assistant/memories', {
    params: cleanParams({ query, limit })
  })
  return data.data
}

/**
 * 删除当前用户的一条 Assistant 记忆。
 */
export const deleteAssistantUserMemory = async (documentId: string) => {
  await http.delete<ApiResponse<null>>(`/api/assistant/memories/${encodeURIComponent(documentId)}`)
}

/**
 * 清空当前用户的全部 Assistant 记忆。
 */
export const clearAssistantUserMemories = async () => {
  const { data } = await http.delete<ApiResponse<number>>('/api/assistant/memories')
  return data.data
}

/**
 * 触发当前用户 Assistant 记忆的整合。
 * Hindsight 会返回异步 operation，前端需要继续查询真实执行状态。
 */
export const consolidateAssistantUserMemories = async () => {
  const { data } = await http.post<ApiResponse<AssistantMemoryConsolidationTask>>('/api/assistant/memories/consolidate')
  return data.data
}

/**
 * 查询某次 Assistant 记忆整理任务的当前执行状态。
 */
export const getAssistantMemoryConsolidationStatus = async (operationId: string) => {
  const { data } = await http.get<ApiResponse<AssistantMemoryConsolidationStatus>>(`/api/assistant/memories/consolidate/${encodeURIComponent(operationId)}`)
  return data.data
}

/**
 * 列出当前用户的 Assistant 个人文件库。
 */
export const listAssistantFileLibraryItems = async (query?: string) => {
  const { data } = await http.get<ApiResponse<AssistantFileLibraryItem[]>>('/api/assistant/file-library', {
    params: cleanParams({ query })
  })
  return data.data || []
}

/**
 * 上传文档到当前用户的 Assistant 个人文件库。
 */
export const uploadAssistantFileLibraryItem = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<AssistantFileLibraryItem>>('/api/assistant/file-library/upload', formData)
  return data.data
}

/**
 * 更新个人文件库条目的标题、描述或启停状态。
 */
export const updateAssistantFileLibraryItem = async (id: number, payload: UpdateAssistantFileLibraryItemPayload) => {
  const { data } = await http.put<ApiResponse<AssistantFileLibraryItem>>(`/api/assistant/file-library/${id}`, payload)
  return data.data
}

/**
 * 删除当前用户的个人文件库条目。
 */
export const deleteAssistantFileLibraryItem = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/assistant/file-library/${id}`)
}

/**
 * 重新转换并索引个人文件库条目。
 */
export const reindexAssistantFileLibraryItem = async (id: number) => {
  const { data } = await http.post<ApiResponse<AssistantFileLibraryItem>>(`/api/assistant/file-library/${id}/reindex`)
  return data.data
}

/**
 * 将 Assistant 录制的短语音转写为文本，再回填到输入框。
 */
export const transcribeAssistantSpeech = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<AssistantSpeechTranscriptionPayload>>('/api/assistant/speech/transcriptions', formData)
  return data.data.text || ''
}

/**
 * 指定会话的普通问答接口，主要供测试或兜底消费使用。
 */
export const chatAssistantSession = async (sessionId: number, payload: AssistantSessionChatRequestPayload) => {
  const { data } = await http.post<ApiResponse<AssistantSessionChatResponsePayload>>(`/api/assistant/sessions/${sessionId}/chat`, payload)
  return data.data
}

/**
 * 通过 fetch 读取后端转发的 SSE 流。
 * 这里不能直接复用 EventSource，因为平台需要带 Bearer Token 且请求方式为 POST。
 */
export const streamAssistantSessionChat = async (sessionId: number, payload: AssistantSessionChatRequestPayload, handlers: StreamHandlers) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const response = await fetch(`${getResolvedApiBaseUrl()}/api/assistant/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  })

  if (!response.ok) {
    let message = 'GitPilot 助手暂时不可用'
    try {
      const errorBody = await response.json()
      message = errorBody?.message || message
    } catch {
      // 保持兜底提示即可，避免解析失败反而吞掉原始错误。
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('GitPilot 流式响应为空')
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
      handlers.onMeta?.(JSON.parse(data) as AssistantStreamMetaEvent)
      return
    }
    if (eventName === 'status') {
      handlers.onStatus?.(JSON.parse(data) as AssistantStreamStatusEvent)
      return
    }
    if (eventName === 'delta') {
      handlers.onDelta?.(JSON.parse(data) as AssistantStreamDeltaEvent)
      return
    }
    if (eventName === 'done') {
      didReceiveTerminalEvent = true
      handlers.onDone?.(JSON.parse(data) as AssistantStreamDoneEvent)
      return
    }
    if (eventName === 'error') {
      didReceiveTerminalEvent = true
      handlers.onError?.(JSON.parse(data) as AssistantStreamErrorEvent)
    }
  }

  ;(async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        if (buffer.trim()) {
          consumeChunk(buffer)
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
      message: error instanceof Error ? error.message : 'GitPilot 流式连接已中断'
    })
  })

  return {
    abort: () => controller.abort()
  }
}

export const streamAssistantSessionChatWithFiles = async (
  sessionId: number,
  payload: AssistantSessionChatRequestPayload,
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
  if (payload.slashCommand) {
    formData.append('slashCommand', payload.slashCommand)
  }
  files.forEach((file) => formData.append('files', file))

  const response = await fetch(`${getResolvedApiBaseUrl()}/api/assistant/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData,
    signal: controller.signal
  })

  if (!response.ok) {
    let message = 'GitPilot 助手暂时不可用'
    try {
      const errorBody = await response.json()
      message = errorBody?.message || message
    } catch {
      // 忽略解析失败，保留默认提示。
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('GitPilot 流式响应为空')
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
      message: error instanceof Error ? error.message : 'GitPilot 流式连接已中断'
    })
  })

  return {
    abort: () => controller.abort()
  }
}
