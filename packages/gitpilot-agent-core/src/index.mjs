import { Agent } from '@mariozechner/pi-agent-core'
import { getModel, getModels, streamSimple } from '@mariozechner/pi-ai'

const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])

/**
 * 创建跨宿主复用的 Pi Agent。
 * 业务意图：CLI 与 pi-runtime 只替换工具、凭据和事件输出，不再各自复制 Pi 初始化逻辑。
 */
export const createPiAgent = ({
  sessionId,
  model,
  systemPrompt = '',
  history = [],
  initialMessages = null,
  tools = [],
  thinkingLevel = 'off',
  maxOutputTokens = 8192,
  getApiKey = async () => '',
  transformContext,
  beforeToolCall,
  afterToolCall,
  onEvent,
}) => {
  const agent = new Agent({
    sessionId,
    toolExecution: 'sequential',
    // Pi Core 不在 AgentState 保存 maxTokens，因此统一在 stream 层注入会话预算。
    streamFn: (streamModel, streamContext, streamOptions) => streamSimple(
      streamModel,
      streamContext,
      { ...streamOptions, maxTokens: maxOutputTokens },
    ),
    getApiKey,
    initialState: {
      model,
      thinkingLevel: normalizeThinkingLevel(thinkingLevel),
      systemPrompt,
      messages: Array.isArray(initialMessages) ? initialMessages : toPiHistoryMessages(history, model),
      tools,
    },
    transformContext,
    beforeToolCall,
    afterToolCall,
  })
  if (onEvent) agent.subscribe((event) => onEvent(event))
  return agent
}

/** 解析平台模型，并用平台代理地址覆盖 Pi 的上游地址。 */
export const resolvePiModel = (provider, modelId, modelBaseUrl = '') => {
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  const normalizedModelId = String(modelId || '').trim()
  const registeredModel = getModel(normalizedProvider, normalizedModelId)
  const template = registeredModel || getModels(normalizedProvider)[0]
  if (!template) {
    throw new Error(`Pi 模型 provider 或 model 不受支持: ${normalizedProvider}/${normalizedModelId}`)
  }
  const normalizedBaseUrl = String(modelBaseUrl || '').trim()
  if (registeredModel && !normalizedBaseUrl) return registeredModel
  return {
    ...template,
    id: normalizedModelId,
    name: normalizedModelId,
    // CLI 平台代理首版固定实现 Chat Completions，避免 OpenAI 内置 Responses 模板绕过代理协议。
    ...(normalizedProvider === 'openai' ? { api: 'openai-completions' } : {}),
    ...(normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : {}),
  }
}

/** 将推理档位限制到 Pi Core 支持的枚举。 */
export const normalizeThinkingLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  return THINKING_LEVELS.has(normalized) ? normalized : 'off'
}

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

/** 将平台中性的 role/content 历史转换为 Pi 原生消息。 */
export const toPiHistoryMessages = (history, model) => {
  if (!Array.isArray(history)) return []
  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => {
      const content = typeof item.content === 'string' ? item.content : ''
      if (item.role === 'assistant') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: content }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: EMPTY_USAGE,
          stopReason: 'stop',
          timestamp: Date.now(),
        }
      }
      return { role: 'user', content, timestamp: Date.now() }
    })
}

/** 提取最后一条 assistant 文本，供 CLI 输出和会话落盘使用。 */
export const lastAssistantText = (messages = []) => {
  const message = [...messages].reverse().find((item) => item?.role === 'assistant')
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''
  return message.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/** 将 Pi 原始事件归一化为 CLI 可消费的事件。 */
export const normalizePiEvent = (event) => {
  if (event?.type === 'message_update') {
    const delta = event.assistantMessageEvent
    if (!delta) return null
    const eventType = {
      text_delta: 'TEXT_DELTA',
      thinking_start: 'THINKING_START',
      thinking_delta: 'THINKING_DELTA',
      thinking_end: 'THINKING_END',
    }[delta.type]
    return eventType ? { eventType, payload: delta } : null
  }
  if (event?.type === 'tool_execution_start') return { eventType: 'TOOL_CALL_STARTED', payload: event }
  if (event?.type === 'tool_execution_update') return { eventType: 'TOOL_PROGRESS', payload: event }
  if (event?.type === 'tool_execution_end') return { eventType: 'TOOL_CALL_FINISHED', payload: event }
  return null
}
