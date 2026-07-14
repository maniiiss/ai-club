import { Agent } from '@mariozechner/pi-agent-core'
import { getModel, getModels, streamSimple } from '@mariozechner/pi-ai'
import { createPlatformTools } from './agent-tools.mjs'

const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])

/**
 * Pi 会话管理器。
 * 会话快照暂存于进程内，生产环境通过外层部署保证单实例或替换为 Redis Store；
 * 任务和审计事实始终由 backend 保存，服务重启后只能恢复 backend 允许恢复的会话。
 */
export class RuntimeManager {
  constructor({ emitEvent, executeTool, modelProvider, modelId, modelBaseUrl, thinkingLevel, sessionStore }) {
    this.emitEvent = emitEvent
    this.executeTool = executeTool
    this.modelProvider = modelProvider
    this.modelId = modelId
    this.modelBaseUrl = modelBaseUrl
    this.thinkingLevel = normalizeThinkingLevel(thinkingLevel)
    this.sessionStore = sessionStore || { save: async () => {}, load: async () => null }
    this.sessions = new Map()
    this.runs = new Map()
    this.sequences = new Map()
  }

  async start(request) {
    const sessionId = request.sessionId || `pi-session-${crypto.randomUUID()}`
    const runId = request.runId || `pi-run-${crypto.randomUUID()}`
    const agent = this.#createAgent(request, sessionId, runId)
    this.sessions.set(sessionId, { agent, request: structuredClone(request), snapshot: request.profileSnapshot || {} })
    await this.sessionStore.save(sessionId, { request: structuredClone(request), messages: [] })
    void this.#run({ agent, sessionId, runId, request }).catch((error) => console.error('Pi run failed', error))
    return { runId, sessionId, status: 'ACCEPTED' }
  }

  /**
   * 同步聊天入口，供 GitPilot 会话和聊天室在需要即时文本结果时调用。
   * 仍复用同一套 Agent、平台工具和事件归一化逻辑，只把最终助手文本随 HTTP 响应返回。
   */
  async chat(request) {
    const sessionId = request.sessionId || `pi-session-${crypto.randomUUID()}`
    const runId = request.runId || `pi-run-${crypto.randomUUID()}`
    const agent = this.#createAgent(request, sessionId, runId)
    this.sessions.set(sessionId, { agent, request: structuredClone(request), snapshot: request.profileSnapshot || {} })
    await this.sessionStore.save(sessionId, { request: structuredClone(request), messages: [] })
    try {
      await this.#emit({
        runId,
        sessionId,
        eventType: 'RUN_STARTED',
        payload: { runtimeCode: 'PI_RUNTIME', execution: request.context || request.execution || {} },
      })
      await agent.prompt(this.#chatInput(request))
      const content = this.#lastAssistantText(agent.state.messages)
      await this.#emit({ runId, sessionId, eventType: 'RUN_COMPLETED', payload: { status: 'SUCCESS' } })
      return { runId, sessionId, content, status: 'COMPLETED' }
    } catch (error) {
      await this.#emit({ runId, sessionId, eventType: 'RUN_FAILED', payload: { message: error.message } })
      throw error
    } finally {
      await this.sessionStore.save(sessionId, {
        request: structuredClone({ ...request, input: '' }),
        messages: agent.state.messages,
      })
      this.sessions.delete(sessionId)
    }
  }

  /**
   * 以统一 Runtime 事件协议执行实时聊天。
   * 业务意图：HTTP 层只负责承载 NDJSON，Pi 产生的文本、工具和生命周期事件沿原顺序直接交给调用方。
   */
  async stream(request, eventSink) {
    const sessionId = request.sessionId || `pi-session-${crypto.randomUUID()}`
    const runId = request.runId || `pi-run-${crypto.randomUUID()}`
    const agent = this.#createAgent(request, sessionId, runId, [], eventSink)
    this.sessions.set(sessionId, { agent, request: structuredClone(request), snapshot: request.profileSnapshot || {} })
    await this.sessionStore.save(sessionId, { request: structuredClone(request), messages: [] })
    await this.#run({ agent, sessionId, runId, request, eventSink, disposeSession: true })
    return { runId, sessionId, status: 'COMPLETED' }
  }

  async resume(sessionId, request) {
    let session = this.sessions.get(sessionId)
    if (!session) {
      const snapshot = await this.sessionStore.load(sessionId)
      if (!snapshot?.request) throw new Error(`Pi session not found: ${sessionId}; session cache expired`)
      const requestSnapshot = snapshot.request
      const agent = this.#createAgent(requestSnapshot, sessionId, request.runId || `pi-run-${crypto.randomUUID()}`, snapshot.messages || [])
      agent.state.messages = snapshot.messages || []
      session = { agent, request: requestSnapshot, snapshot: requestSnapshot.profileSnapshot || {} }
      this.sessions.set(sessionId, session)
    }
    const runId = request.runId || `pi-run-${crypto.randomUUID()}`
    void this.#run({ agent: session.agent, sessionId, runId, request }).catch((error) => console.error('Pi resume failed', error))
    return { runId, sessionId, status: 'ACCEPTED' }
  }

  cancel(runId) {
    const run = this.runs.get(runId)
    if (!run) return false
    run.controller.abort()
    run.agent.abort()
    return true
  }

  #createAgent(request, sessionId, runId, messages = [], eventSink = null) {
    const provider = request.modelProvider || this.modelProvider
    const modelId = request.modelId || this.modelId
    if (!provider || !modelId) throw new Error('Pi Runtime model provider and model id are required')

    const model = resolvePiModel(provider, modelId, request.modelBaseUrl || this.modelBaseUrl)
    const systemPrompt = request.systemPrompt || request.profileSnapshot?.systemPrompt || ''
    const toolContract = this.#toolContract(request)
    const allowedTools = toolContract.policy.allowedToolCodes
    const sessionToken = toolContract.policy.sessionToken || request.sessionToken || request.profileSnapshot?.sessionToken || ''
    const agent = new Agent({
      sessionId,
      toolExecution: 'sequential',
      streamFn: streamSimple,
      getApiKey: async (name) => process.env[`PI_RUNTIME_${String(name).toUpperCase()}_API_KEY`] || process.env.PI_RUNTIME_API_KEY,
      initialState: {
        model,
        thinkingLevel: normalizeThinkingLevel(request.thinkingLevel || request.profileSnapshot?.thinkingLevel || this.thinkingLevel),
        systemPrompt,
        messages,
        tools: createPlatformTools({ executeTool: this.executeTool, sessionToken, tools: toolContract.tools, allowedTools }),
      },
      beforeToolCall: async (context) => {
        // Pi 的预检只用于提前拒绝明显不允许的调用，backend 仍会再次鉴权。
        const matched = toolContract.tools.find((item) => item.name === context.toolCall.name)
        if (allowedTools.length > 0 && (!matched || !allowedTools.includes(matched.toolCode))) {
          return { block: true, reason: `Tool is not allowed by profile: ${context.toolCall.name}` }
        }
        return undefined
      },
      afterToolCall: async () => undefined,
    })

    // 通过 Agent 事件统一转发文本、工具和生命周期，不把 Pi 原始事件直接暴露给前端。
    agent.subscribe(async (event) => {
      await this.#mapEvent(event, { runId, sessionId }, eventSink)
    })
    return agent
  }

  async #run({ agent, sessionId, runId, request, eventSink = null, disposeSession = false }) {
    const controller = new AbortController()
    this.runs.set(runId, { controller, sessionId, agent })
    const timeoutSeconds = Number(request.timeoutSeconds || request.profileSnapshot?.timeoutSeconds || 0)
    const timeout = timeoutSeconds > 0 ? setTimeout(() => agent.abort(), timeoutSeconds * 1000) : null
    try {
      await this.#emit({
        runId,
        sessionId,
        eventType: 'RUN_STARTED',
        payload: { runtimeCode: 'PI_RUNTIME', execution: request.context || request.execution || {} },
      }, eventSink)
      await agent.prompt(request.input || '')
      await this.#emit({ runId, sessionId, eventType: 'RUN_COMPLETED', payload: { status: 'SUCCESS' } }, eventSink)
      return { runId, sessionId, status: 'ACCEPTED' }
    } catch (error) {
      await this.#emit({ runId, sessionId, eventType: 'RUN_FAILED', payload: { message: error.message } }, eventSink)
      throw error
    } finally {
      if (timeout) clearTimeout(timeout)
      await this.sessionStore.save(sessionId, {
        request: structuredClone({ ...request, input: '' }),
        messages: agent.state.messages,
      })
      if (disposeSession) this.sessions.delete(sessionId)
      this.runs.delete(runId)
    }
  }

  async #mapEvent(event, identity, eventSink = null) {
    if (event.type === 'message_update') {
      const delta = event.assistantMessageEvent
      if (delta?.type === 'text_delta' && delta.delta) {
        await this.#emit({ ...identity, eventType: 'TEXT_DELTA', payload: { delta: delta.delta } }, eventSink)
      } else if (delta?.type === 'thinking_start') {
        await this.#emit({ ...identity, eventType: 'THINKING_START', payload: { contentIndex: delta.contentIndex } }, eventSink)
      } else if (delta?.type === 'thinking_delta' && delta.delta) {
        await this.#emit({ ...identity, eventType: 'THINKING_DELTA', payload: { delta: delta.delta, contentIndex: delta.contentIndex } }, eventSink)
      } else if (delta?.type === 'thinking_end') {
        await this.#emit({ ...identity, eventType: 'THINKING_END', payload: { contentIndex: delta.contentIndex } }, eventSink)
      }
      return
    }
    if (event.type === 'tool_execution_start') {
      await this.#emit({ ...identity, eventType: 'TOOL_CALL_REQUESTED', payload: { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args } }, eventSink)
    } else if (event.type === 'tool_execution_update') {
      await this.#emit({ ...identity, eventType: 'TOOL_PROGRESS', payload: { toolCallId: event.toolCallId, toolName: event.toolName, partialResult: event.partialResult } }, eventSink)
    } else if (event.type === 'tool_execution_end') {
      await this.#emit({ ...identity, eventType: 'TOOL_FINISHED', payload: { toolCallId: event.toolCallId, toolName: event.toolName, result: event.result } }, eventSink)
    }
  }

  async #emit(event, eventSink = null) {
    const nextSequence = (this.sequences.get(event.runId) || 0) + 1
    this.sequences.set(event.runId, nextSequence)
    const envelope = { ...event, sequence: nextSequence }
    await this.emitEvent(envelope)
    if (eventSink) await eventSink(envelope)
  }

  #toolContract(request) {
    const policy = request.toolPolicy || request.runtimeToolPolicy || {}
    const tools = Array.isArray(request.tools) ? request.tools : []
    const allowedToolCodes = Array.isArray(policy.allowedToolCodes)
      ? policy.allowedToolCodes
      : Array.isArray(policy.allowedTools) ? policy.allowedTools : this.#legacyAllowedTools(request)
    return {
      tools: tools
        .filter((item) => item && typeof item.toolCode === 'string' && item.toolCode.trim())
        .map((item) => ({
          ...item,
          toolCode: item.toolCode.trim(),
          name: typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : `platform_${item.toolCode.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        })),
      policy: {
        sessionToken: typeof policy.sessionToken === 'string' ? policy.sessionToken : '',
        allowedToolCodes: allowedToolCodes.filter((item) => typeof item === 'string' && item.trim()),
        autoExecuteToolCodes: Array.isArray(policy.autoExecuteToolCodes) ? policy.autoExecuteToolCodes : [],
      },
    }
  }

  #legacyAllowedTools(request) {
    const raw = request.profileSnapshot?.toolPolicyJson
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed.allowedTools) ? parsed.allowedTools : []
    } catch {
      return []
    }
  }

  /** 将 backend 发送的房间历史压缩进本轮输入，避免同步入口丢失上下文。 */
  #chatInput(request) {
    const history = Array.isArray(request.history)
      ? request.history
        .map((item) => `${item.role || 'user'}：${item.content || ''}`)
        .filter((item) => item.trim().length > 0)
        .join('\n')
      : ''
    return history ? `${history}\n\n当前问题：\n${request.input || ''}` : (request.input || '')
  }

  /** 从 Pi Agent 最后一条 assistant 消息中提取可持久化的纯文本。 */
  #lastAssistantText(messages) {
    const message = [...(messages || [])].reverse().find((item) => item.role === 'assistant')
    if (!message) return ''
    if (typeof message.content === 'string') return message.content
    if (!Array.isArray(message.content)) return ''
    return message.content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
  }
}

/**
 * 解析 Pi 模型并覆盖部署级 Base URL。
 * 业务意图：Pi 的内置模型表负责协议和能力模板，管理员可以把同一协议转发到自建或兼容网关；
 * 自定义 model id 没有内置条目时，复用同 provider 的第一个模型模板，仅替换模型标识。
 */
export const resolvePiModel = (provider, modelId, modelBaseUrl) => {
  const normalizedProvider = String(provider || '').trim()
  const normalizedModelId = String(modelId || '').trim()
  const registeredModel = getModel(normalizedProvider, normalizedModelId)
  const template = registeredModel || getModels(normalizedProvider)[0]
  if (!template) {
    throw new Error(`Pi Runtime provider or model is unsupported: ${normalizedProvider}/${normalizedModelId}`)
  }

  const normalizedBaseUrl = String(modelBaseUrl || '').trim()
  if (registeredModel && !normalizedBaseUrl) return registeredModel

  return {
    ...template,
    id: normalizedModelId,
    name: normalizedModelId,
    ...(normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : {}),
  }
}

/** 将部署或会话传入的推理档位限制在 Pi Agent Core 支持的枚举内。 */
export const normalizeThinkingLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  return THINKING_LEVELS.has(normalized) ? normalized : 'off'
}
