import type {
  AssistantActionItem,
  AssistantConversationMode,
  AssistantConversationSessionQuery,
  AssistantMessageItem,
} from '@/src/types/assistant'

/**
 * 根据入口模式生成 Assistant 会话查询条件。
 * 业务意图：项目助手历史必须在后端分页前按项目过滤，避免本地过滤导致分页错乱。
 */
export const buildAssistantSessionQuery = (
  mode: AssistantConversationMode,
  page: number,
  archived: boolean,
  projectId?: number,
): AssistantConversationSessionQuery => ({
  page,
  size: 20,
  archived,
  scope: 'PROJECT',
  ...(mode && projectId ? { projectId } : {}),
})

/**
 * compact 模式通常嵌在抽屉内，外层抽屉已经展示业务标题，内层只保留操作区避免重复。
 */
export const shouldRenderAssistantWorkspaceHeader = (compact: boolean): boolean => !compact

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export const computeAssistantParamsHash = (params: Record<string, unknown> | null | undefined): string => {
  try {
    const sortedJson = stableStringify(params ?? {})
    let hash = 5381
    for (let index = 0; index < sortedJson.length; index += 1) {
      hash = ((hash << 5) + hash + sortedJson.charCodeAt(index)) | 0
    }
    return (hash >>> 0).toString(36)
  } catch {
    return '0'
  }
}

/**
 * 生成动作确认后的持久化 key，用于刷新后恢复"已执行"状态。
 */
export const computeAssistantActionKey = (action: Pick<AssistantActionItem, 'type' | 'title' | 'params'>, index: number): string =>
  `${action.type}:${index}:${action.title}|${computeAssistantParamsHash(action.params)}`

/**
 * 业务意图：用户主动停止流式生成后，前端必须立刻把当前助手消息收束为终态，
 * 否则消息列表会继续按 streaming 状态展示“正在思考”。
 */
export const markAssistantStreamStopped = (
  messages: AssistantMessageItem[],
  assistantMessageId: string | null | undefined,
): AssistantMessageItem[] =>
  messages.map((message) => {
    const matchesActiveMessage = assistantMessageId
      ? message.id === assistantMessageId
      : message.role === 'assistant'
    if (!matchesActiveMessage || message.status !== 'streaming') return message
    return {
      ...message,
      content: message.content?.trim() ? message.content : '已停止生成',
      status: 'done',
      attachments: message.attachments || [],
    }
  })

export interface AssistantDisplayState {
  content: string
  showThinking: boolean
  showContinuation: boolean
}

/**
 * 业务意图：本地发送态已经结束时，即使某条消息因迟到事件残留为 streaming，
 * 也不能继续渲染“正在思考”的动效，避免用户误以为 Assistant 仍在运行。
 */
export const resolveAssistantDisplayState = (
  message: Pick<AssistantMessageItem, 'content' | 'status'>,
  streamingActive: boolean,
): AssistantDisplayState => {
  const content = message.content || ''
  const activeStreaming = message.status === 'streaming' && streamingActive
  return {
    content: content || (message.status === 'streaming' && !activeStreaming ? '已停止生成' : ''),
    showThinking: activeStreaming && !content.trim(),
    showContinuation: activeStreaming && Boolean(content.trim()),
  }
}

/**
 * 业务意图：AbortController 取消后，浏览器仍可能交付已经读到的 SSE 分片。
 * 这些迟到事件不能再改写已停止的消息，也不能把新的回答内容追加回来。
 */
export const shouldIgnoreAssistantStreamEvent = (
  eventAssistantMessageId: string,
  activeAssistantMessageId: string | null | undefined,
  stopRequested: boolean,
): boolean => stopRequested || !activeAssistantMessageId || eventAssistantMessageId !== activeAssistantMessageId

export interface ParsedAssistantSseChunk {
  eventName: string
  data: unknown
}

/**
 * 解析单个 SSE 事件块。网络分片拼接由 API 层负责，这里只处理已按空行切好的事件。
 */
export const parseAssistantSseChunk = (chunk: string): ParsedAssistantSseChunk | null => {
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
  if (!eventName || !dataLines.length) {
    return null
  }
  return {
    eventName,
    data: JSON.parse(dataLines.join('\n')),
  }
}

/**
 * 业务意图：Assistant Skill 菜单支持键盘循环选择，避免组件里散落上下键边界判断。
 */
export const resolveSlashMenuActiveIndex = (
  currentIndex: number,
  direction: 1 | -1,
  commandCount: number,
): number => {
  if (commandCount <= 0) return -1
  const normalizedCurrent = currentIndex >= 0 && currentIndex < commandCount ? currentIndex : 0
  return (normalizedCurrent + direction + commandCount) % commandCount
}
