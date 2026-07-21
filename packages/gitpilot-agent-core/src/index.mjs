import { Agent } from '@mariozechner/pi-agent-core'
import { getModel, getModels, streamSimple } from '@mariozechner/pi-ai'

export const GITPILOT_AGENT_CORE_VERSION = '0.1.0'
export const HANDOFF_PROTOCOL_VERSION = 'v1'
export const HANDOFF_LIMITS = Object.freeze({
  maxHistoryMessages: 50,
  maxMessageBytes: 16 * 1024,
  maxHistoryBytes: 256 * 1024,
  maxSummaryBytes: 32 * 1024,
  maxContextItemCount: 50,
  maxContextItemBytes: 1024,
  maxEnvelopeBytes: 512 * 1024,
})

export const HANDOFF_ERROR_CODES = Object.freeze({
  PROTOCOL_UNSUPPORTED: 'HANDOFF_PROTOCOL_UNSUPPORTED',
  ENVELOPE_TOO_LARGE: 'HANDOFF_ENVELOPE_TOO_LARGE',
  SENSITIVE_CONTENT: 'HANDOFF_SENSITIVE_CONTENT',
  INVALID_WORKSPACE: 'HANDOFF_INVALID_WORKSPACE',
})

const HANDOFF_FIELDS = new Set(['protocolVersion', 'sourceClient', 'conversationHistory', 'summary', 'decisions', 'pendingItems', 'workspace'])
const SOURCE_CLIENT_FIELDS = new Set(['runtimeCode', 'runtimeVersion', 'cliVersion'])
const WORKSPACE_FIELDS = new Set(['baseCommit', 'handoffCommit', 'currentBranch'])
const ROLES = new Set(['user', 'assistant'])
const SENSITIVE_PATTERNS = [
  /(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|cli[_ -]?token|git[_ -]?token|private[_ -]?key|authorization)\s*[:=]\s*['"]?[\w./+=-]{8,}/i,
  /(?:authorization\s*:\s*(?:bearer|basic)|x-api-key\s*:)\s*\S+/i,
  /\b(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /(^|[\\/])\.env(?:$|[.\\/])/i,
  /(?:^|\s)(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*\S+/i,
]

export class HandoffValidationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'HandoffValidationError'
    this.code = code
  }
}

const bytes = (value) => Buffer.byteLength(String(value || ''), 'utf8')
const assertObject = (value, message, code = HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HandoffValidationError(code, message)
}
const assertFields = (value, allowed, message) => {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new HandoffValidationError(HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED, `${message}: ${field}`)
  }
}
const assertString = (value, field, maxBytes = 0) => {
  if (typeof value !== 'string' || !value.trim()) throw new HandoffValidationError(HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED, `${field} 必须是非空字符串`)
  if (maxBytes > 0 && bytes(value) > maxBytes) throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, `${field} 超过大小限制`)
}
const scanSensitive = (value, path = '$') => {
  if (typeof value === 'string') {
    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new HandoffValidationError(HANDOFF_ERROR_CODES.SENSITIVE_CONTENT, `handoff 内容命中敏感信息规则: ${path}`)
    }
    return
  }
  if (Array.isArray(value)) return value.forEach((item, index) => scanSensitive(item, `${path}[${index}]`))
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) scanSensitive(child, `${path}.${key}`)
  }
}

/**
 * 校验跨 Runtime 的标准化接力上下文。
 * 业务意图：把 Pi SDK 私有消息与凭据挡在协议边界外，保证 P1 可以安全接入不同云端 Runtime。
 */
export const validateHandoffSessionEnvelope = (candidate) => {
  assertObject(candidate, 'handoff envelope 必须是 JSON 对象')
  const serialized = JSON.stringify(candidate)
  if (bytes(serialized) > HANDOFF_LIMITS.maxEnvelopeBytes) {
    throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, 'handoff envelope 超过大小限制')
  }
  assertFields(candidate, HANDOFF_FIELDS, 'handoff envelope 含有未知字段')
  if (candidate.protocolVersion !== HANDOFF_PROTOCOL_VERSION) {
    throw new HandoffValidationError(HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED, `不支持的 handoff protocol: ${candidate.protocolVersion || '(empty)'}`)
  }

  assertObject(candidate.sourceClient, 'sourceClient 必须是对象')
  assertFields(candidate.sourceClient, SOURCE_CLIENT_FIELDS, 'sourceClient 含有未知字段')
  for (const field of SOURCE_CLIENT_FIELDS) assertString(candidate.sourceClient[field], `sourceClient.${field}`, 64)

  if (!Array.isArray(candidate.conversationHistory) || candidate.conversationHistory.length > HANDOFF_LIMITS.maxHistoryMessages) {
    throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, 'conversationHistory 超过条数限制')
  }
  let historyBytes = 0
  candidate.conversationHistory.forEach((message, index) => {
    assertObject(message, `conversationHistory[${index}] 必须是对象`)
    assertFields(message, new Set(['role', 'content']), `conversationHistory[${index}] 含有未知字段`)
    if (!ROLES.has(message.role)) throw new HandoffValidationError(HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED, `conversationHistory[${index}].role 不受支持`)
    if (typeof message.content !== 'string' || !message.content.trim()) throw new HandoffValidationError(HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED, `conversationHistory[${index}].content 必须是非空字符串`)
    const messageBytes = bytes(message.content)
    if (messageBytes > HANDOFF_LIMITS.maxMessageBytes) throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, `conversationHistory[${index}] 超过单条大小限制`)
    historyBytes += messageBytes
  })
  if (historyBytes > HANDOFF_LIMITS.maxHistoryBytes) throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, 'conversationHistory 超过总大小限制')

  if (typeof candidate.summary !== 'string' || bytes(candidate.summary) > HANDOFF_LIMITS.maxSummaryBytes) {
    throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, 'summary 不符合大小限制')
  }
  for (const field of ['decisions', 'pendingItems']) {
    if (!Array.isArray(candidate[field]) || candidate[field].length > HANDOFF_LIMITS.maxContextItemCount) {
      throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, `${field} 超过条数限制`)
    }
    candidate[field].forEach((item, index) => {
      if (typeof item !== 'string' || !item.trim()) throw new HandoffValidationError(HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED, `${field}[${index}] 必须是非空字符串`)
      if (bytes(item) > HANDOFF_LIMITS.maxContextItemBytes) throw new HandoffValidationError(HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE, `${field}[${index}] 超过单项大小限制`)
    })
  }

  assertObject(candidate.workspace, 'workspace 必须是对象', HANDOFF_ERROR_CODES.INVALID_WORKSPACE)
  assertFields(candidate.workspace, WORKSPACE_FIELDS, 'workspace 含有未知字段')
  assertString(candidate.workspace.baseCommit, 'workspace.baseCommit', 128)
  assertString(candidate.workspace.handoffCommit, 'workspace.handoffCommit', 128)
  assertString(candidate.workspace.currentBranch, 'workspace.currentBranch', 512)
  scanSensitive(candidate)
  return candidate
}

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

/** 将底层 Agent 事件归一化为各宿主可消费的生命周期事件。 */
export const normalizePiEvent = (event) => {
  if (event?.type === 'agent_start') return { eventType: 'STREAM_STARTED', payload: {} }
  if (event?.type === 'turn_start') return { eventType: 'TURN_STARTED', payload: {} }
  if (event?.type === 'turn_end') return { eventType: 'TURN_FINISHED', payload: { toolResults: event.toolResults || [] } }
  if (event?.type === 'agent_end') {
    const messages = Array.isArray(event.messages) ? event.messages : []
    const failure = [...messages].reverse().find((message) => message?.stopReason === 'error' || message?.stopReason === 'aborted' || message?.errorMessage)
    if (failure) {
      return {
        eventType: 'STREAM_ERROR',
        payload: {
          errorMessage: failure.errorMessage || (failure.stopReason === 'aborted' ? 'Agent 执行已取消' : '模型返回错误'),
          stopReason: failure.stopReason || 'error',
        },
      }
    }
    return { eventType: 'STREAM_FINISHED', payload: { messageCount: messages.length } }
  }
  if (event?.type === 'message_update') {
    const delta = event.assistantMessageEvent
    if (!delta) return null
    const eventType = {
      text_start: 'TEXT_START',
      text_delta: 'TEXT_DELTA',
      text_end: 'TEXT_END',
      thinking_start: 'THINKING_START',
      thinking_delta: 'THINKING_DELTA',
      thinking_end: 'THINKING_END',
      error: 'STREAM_ERROR',
    }[delta.type]
    if (!eventType) return null
    if (delta.type === 'text_delta') return { eventType, payload: { delta: delta.delta } }
    if (delta.type === 'thinking_delta') return { eventType, payload: { delta: delta.delta, contentIndex: delta.contentIndex } }
    if (delta.type === 'error') return {
      eventType,
      payload: { errorMessage: delta.errorMessage || delta.error?.message || delta.message || '模型流返回错误' },
    }
    return { eventType, payload: { contentIndex: delta.contentIndex } }
  }
  if (event?.type === 'tool_execution_start') return {
    eventType: 'TOOL_CALL_REQUESTED',
    payload: { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args },
  }
  if (event?.type === 'tool_execution_update') return {
    eventType: 'TOOL_PROGRESS',
    payload: { toolCallId: event.toolCallId, toolName: event.toolName, partialResult: event.partialResult },
  }
  if (event?.type === 'tool_execution_end') return {
    eventType: 'TOOL_FINISHED',
    payload: { toolCallId: event.toolCallId, toolName: event.toolName, result: event.result },
  }
  return null
}
