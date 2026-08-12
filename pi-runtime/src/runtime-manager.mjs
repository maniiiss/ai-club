import {
  createPiAgent,
  normalizeThinkingLevel,
  lastAssistantText,
  normalizePiEvent,
  resolvePiModel,
  toPiHistoryMessages,
} from '@aiclub/gitpilot-agent-core'
import { createPlatformTools } from './agent-tools.mjs'

export { normalizeThinkingLevel, resolvePiModel, toPiHistoryMessages }

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
      await agent.prompt(request.input || '')
      const content = lastAssistantText(agent.state.messages)
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
    const agent = this.#createAgent(request, sessionId, runId, null, eventSink)
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

  #createAgent(request, sessionId, runId, restoredMessages = null, eventSink = null) {
    const provider = request.modelProvider || this.modelProvider
    const modelId = request.modelId || this.modelId
    if (!provider || !modelId) throw new Error('Pi Runtime model provider and model id are required')

    const model = resolvePiModel(provider, modelId, request.modelBaseUrl || this.modelBaseUrl)
    const messages = Array.isArray(restoredMessages)
      ? restoredMessages
      : toPiHistoryMessages(request.history, model)
    const maxOutputTokens = Number(request.contextProfile?.maxOutputTokens || 8192)
    const systemPrompt = request.systemPrompt || request.profileSnapshot?.systemPrompt || ''
    const toolContract = this.#toolContract(request)
    const allowedTools = toolContract.policy.allowedToolCodes
    const sessionToken = toolContract.policy.sessionToken || request.sessionToken || request.profileSnapshot?.sessionToken || ''
    const agent = createPiAgent({
      sessionId,
      model,
      systemPrompt,
      initialMessages: messages,
      maxOutputTokens,
      getApiKey: async (name) => process.env[`PI_RUNTIME_${String(name).toUpperCase()}_API_KEY`] || process.env.PI_RUNTIME_API_KEY,
      thinkingLevel: request.thinkingLevel || request.profileSnapshot?.thinkingLevel || this.thinkingLevel,
      tools: createPlatformTools({ executeTool: this.executeTool, sessionToken, tools: toolContract.tools, allowedTools }),
      transformContext: async (nextMessages) => this.#transformContext(nextMessages, request),
      beforeToolCall: async (context) => {
        // Pi 的预检只用于提前拒绝明显不允许的调用，backend 仍会再次鉴权。
        const matched = toolContract.tools.find((item) => item.name === context.toolCall.name)
        if (allowedTools.length > 0 && (!matched || !allowedTools.includes(matched.toolCode))) {
          return { block: true, reason: `Tool is not allowed by profile: ${context.toolCall.name}` }
        }
        return undefined
      },
      afterToolCall: async () => undefined,
      onEvent: async (event) => {
        await this.#mapEvent(event, { runId, sessionId }, eventSink)
      },
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
    const normalized = normalizePiEvent(event)
    if (normalized) await this.#emit({ ...identity, ...normalized }, eventSink)
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

  /**
   * 使用 pi-agent-core 的 transformContext 钩子完成 Runtime 原生裁剪。
   * backend 已把历史摘要和结构化事实放入当前输入，因此这里只保留最近完整消息，避免超窗。
   */
  async #transformContext(messages, request) {
    const profile = request.contextProfile || {}
    const contextWindow = Number(profile.contextWindowTokens || 128000)
    const maxOutput = Number(profile.maxOutputTokens || 8192)
    const threshold = Number(profile.compactionThresholdPercent || 80) / 100
    const strategy = String(profile.compactionStrategy || 'NATIVE_FIRST').toUpperCase()
    const budget = Math.max(512, Math.floor((contextWindow - maxOutput) * threshold))
    const estimate = (items) => items.reduce((total, item) => total + Math.max(1, Math.ceil(JSON.stringify(item || {}).length / 4)), 0)
    const estimatedTokens = estimate(messages)
    if (strategy === 'DISABLED' || estimatedTokens <= budget || messages.length <= 8) return messages
    const recent = messages.slice(-8)
    // 事件只报告实际发生的原生裁剪，backend 可据此记录压缩次数和上下文使用率。
    await this.#emit({
      runId: request.runId || '',
      sessionId: request.sessionId || '',
      eventType: 'CONTEXT_COMPACTED',
      payload: {
        strategy: 'NATIVE_PI',
        estimatedContextTokens: estimatedTokens,
        retainedMessageCount: recent.length,
        contextWindowTokens: contextWindow,
      },
    })
    return [{
      // 使用 user 消息承载平台摘要，避免伪造缺少 provider/api 元数据的 Pi assistant 消息。
      role: 'user',
      content: '更早的对话已由 GitPilot backend 保存并摘要；请以当前输入中的历史摘要和结构化事实为准。',
      timestamp: Date.now(),
    }, ...recent]
  }

}
