import { Agent } from '@mariozechner/pi-agent-core'
import { getModel, streamSimple } from '@mariozechner/pi-ai'
import { createPlatformTools } from './agent-tools.mjs'

/**
 * Pi 会话管理器。
 * 会话快照暂存于进程内，生产环境通过外层部署保证单实例或替换为 Redis Store；
 * 任务和审计事实始终由 backend 保存，服务重启后只能恢复 backend 允许恢复的会话。
 */
export class RuntimeManager {
  constructor({ emitEvent, executeTool, modelProvider, modelId, sessionStore }) {
    this.emitEvent = emitEvent
    this.executeTool = executeTool
    this.modelProvider = modelProvider
    this.modelId = modelId
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

  #createAgent(request, sessionId, runId, messages = []) {
    const provider = request.modelProvider || this.modelProvider
    const modelId = request.modelId || this.modelId
    if (!provider || !modelId) throw new Error('Pi Runtime model provider and model id are required')

    const model = getModel(provider, modelId)
    const systemPrompt = request.systemPrompt || request.profileSnapshot?.systemPrompt || ''
    const allowedTools = this.#allowedTools(request)
    const sessionToken = request.sessionToken || request.profileSnapshot?.sessionToken || ''
    const agent = new Agent({
      sessionId,
      toolExecution: 'sequential',
      streamFn: streamSimple,
      getApiKey: async (name) => process.env[`PI_RUNTIME_${String(name).toUpperCase()}_API_KEY`] || process.env.PI_RUNTIME_API_KEY,
      initialState: {
        model,
        systemPrompt,
        messages,
        tools: createPlatformTools({ executeTool: this.executeTool, sessionToken, allowedTools }),
      },
      beforeToolCall: async (context) => {
        // Pi 的预检只用于提前拒绝明显不允许的调用，backend 仍会再次鉴权。
        if (allowedTools.length > 0 && !allowedTools.some((item) => `platform_${item.replace(/[^a-zA-Z0-9_]/g, '_')}` === context.toolCall.name)) {
          return { block: true, reason: `Tool is not allowed by profile: ${context.toolCall.name}` }
        }
        return undefined
      },
      afterToolCall: async () => undefined,
    })

    // 通过 Agent 事件统一转发文本、工具和生命周期，不把 Pi 原始事件直接暴露给前端。
    agent.subscribe(async (event) => {
      await this.#mapEvent(event, { runId, sessionId })
    })
    return agent
  }

  async #run({ agent, sessionId, runId, request }) {
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
      })
      await agent.prompt(request.input || '')
      await this.#emit({ runId, sessionId, eventType: 'RUN_COMPLETED', payload: { status: 'SUCCESS' } })
      return { runId, sessionId, status: 'ACCEPTED' }
    } catch (error) {
      await this.#emit({ runId, sessionId, eventType: 'RUN_FAILED', payload: { message: error.message } })
      throw error
    } finally {
      if (timeout) clearTimeout(timeout)
      await this.sessionStore.save(sessionId, {
        request: structuredClone({ ...request, input: '' }),
        messages: agent.state.messages,
      })
      this.runs.delete(runId)
    }
  }

  async #mapEvent(event, identity) {
    if (event.type === 'message_update') {
      const delta = event.assistantMessageEvent
      if (delta?.type === 'text_delta' && delta.delta) {
        await this.#emit({ ...identity, eventType: 'TEXT_DELTA', payload: { delta: delta.delta } })
      }
      return
    }
    if (event.type === 'tool_execution_start') {
      await this.#emit({ ...identity, eventType: 'TOOL_CALL_REQUESTED', payload: { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args } })
    } else if (event.type === 'tool_execution_update') {
      await this.#emit({ ...identity, eventType: 'TOOL_PROGRESS', payload: { toolCallId: event.toolCallId, toolName: event.toolName, partialResult: event.partialResult } })
    } else if (event.type === 'tool_execution_end') {
      await this.#emit({ ...identity, eventType: 'TOOL_FINISHED', payload: { toolCallId: event.toolCallId, toolName: event.toolName, result: event.result } })
    }
  }

  async #emit(event) {
    const nextSequence = (this.sequences.get(event.runId) || 0) + 1
    this.sequences.set(event.runId, nextSequence)
    await this.emitEvent({ ...event, sequence: nextSequence })
  }

  #allowedTools(request) {
    if (Array.isArray(request.toolPolicy?.allowedTools)) return request.toolPolicy.allowedTools
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
