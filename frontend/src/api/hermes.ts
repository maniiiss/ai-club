import { AUTH_TOKEN_KEY } from '@/constants/auth'
import { getResolvedApiBaseUrl } from './http'
import type {
  HermesChatResponsePayload,
  HermesChatRequestPayload,
  HermesStreamDeltaEvent,
  HermesStreamDoneEvent,
  HermesStreamErrorEvent,
  HermesStreamMetaEvent
} from '@/types/hermes'

interface StreamHandlers {
  onMeta?: (payload: HermesStreamMetaEvent) => void
  onDelta?: (payload: HermesStreamDeltaEvent) => void
  onDone?: (payload: HermesStreamDoneEvent) => void
  onError?: (payload: HermesStreamErrorEvent) => void
}

/**
 * 普通问答接口，作为页面主用链路，避免 Hermes Responses API 与前端 SSE 兼容差异影响体验。
 */
export const chatWithHermes = async (payload: HermesChatRequestPayload) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const response = await fetch(`${getResolvedApiBaseUrl()}/api/hermes/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  })

  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.success) {
    throw new Error(body?.message || 'Hermes 助手暂时不可用')
  }
  return body.data as HermesChatResponsePayload
}

/**
 * 通过 fetch 读取后端转发的 SSE 流。
 * 这里不能直接复用 EventSource，因为平台需要带 Bearer Token 且请求方式为 POST。
 */
export const streamHermesChat = async (payload: HermesChatRequestPayload, handlers: StreamHandlers) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const response = await fetch(`${getResolvedApiBaseUrl()}/api/hermes/chat/stream`, {
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

    if (eventName === 'meta') {
      handlers.onMeta?.(JSON.parse(data) as HermesStreamMetaEvent)
      return
    }
    if (eventName === 'delta') {
      handlers.onDelta?.(JSON.parse(data) as HermesStreamDeltaEvent)
      return
    }
    if (eventName === 'done') {
      handlers.onDone?.(JSON.parse(data) as HermesStreamDoneEvent)
      return
    }
    if (eventName === 'error') {
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
    handlers.onError?.({
      message: error instanceof Error ? error.message : 'Hermes 流式连接已中断'
    })
  })

  return {
    abort: () => controller.abort()
  }
}
