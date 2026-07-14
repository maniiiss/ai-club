import type { ChatMessageItem, ChatSocketEvent } from '@/src/types/chat'
import type { AssistantActionItem, AssistantSelectionCardItem, AssistantSelectionOptionItem } from '@/src/types/assistant'
import { resolveAssistantDisplayState } from '@/src/lib/assistantUtils'
export { normalizeGeneratedMarkdown } from '@/src/lib/markdownUtils'

// GitPilot 使用中性 mention，同时保留 @hermes 作为旧客户端兼容别名。
const assistantMentionPattern = /(^|\s)@(hermes|gitpilot|assistant)(?=\s|$)/i

export const containsAssistantMention = (content: string): boolean => assistantMentionPattern.test(content || '')

export const parseChatSocketEvent = (raw: string): ChatSocketEvent | null => {
  try {
    const parsed = JSON.parse(raw) as ChatSocketEvent
    if (!parsed || typeof parsed.type !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export const mergeChatMessage = (messages: ChatMessageItem[], nextMessage: ChatMessageItem): ChatMessageItem[] => {
  const index = messages.findIndex((message) => message.id === nextMessage.id)
  if (index < 0) return [...messages, nextMessage]
  const copy = messages.slice()
  copy[index] = nextMessage
  return copy
}

export const appendChatStreamDelta = (
  messages: ChatMessageItem[],
  messageId: number,
  delta: string,
): ChatMessageItem[] =>
  messages.map((message) => (
    message.id === messageId
      ? { ...message, content: `${message.content || ''}${delta || ''}`, status: 'streaming' }
      : message
  ))

export const mergeAgentActionsIntoMessage = (
  messages: ChatMessageItem[],
  messageId: number | null | undefined,
  taskId: number | null | undefined,
  actions: AssistantActionItem[],
): ChatMessageItem[] =>
  messages.map((message) => {
    const matchesMessage = messageId != null && message.id === messageId
    const matchesTask = taskId != null && message.agentTaskId === taskId
    if (!matchesMessage && !matchesTask) return message
    return {
      ...message,
      agentTaskId: message.agentTaskId ?? taskId ?? null,
      agentTaskStatus: message.agentTaskStatus || 'awaiting_confirmation',
      actions: actions || [],
    }
  })

export const mergeAgentSelectionCardsIntoMessage = (
  messages: ChatMessageItem[],
  messageId: number | null | undefined,
  taskId: number | null | undefined,
  selectionCards: AssistantSelectionCardItem[],
): ChatMessageItem[] =>
  messages.map((message) => {
    const matchesMessage = messageId != null && message.id === messageId
    const matchesTask = taskId != null && message.agentTaskId === taskId
    if (!matchesMessage && !matchesTask) return message
    return {
      ...message,
      agentTaskId: message.agentTaskId ?? taskId ?? null,
      agentTaskStatus: message.agentTaskStatus || 'awaiting_selection',
      selectionCards: selectionCards || [],
    }
  })

export const resolveAgentActionStatus = (
  message: Pick<ChatMessageItem, 'actionStatuses'>,
  actionKey: string | null | undefined,
): string => {
  const normalizedKey = actionKey || ''
  return normalizedKey ? message.actionStatuses?.[normalizedKey] || '' : ''
}

export const markAgentActionStatusInMessage = (
  messages: ChatMessageItem[],
  messageId: number | null | undefined,
  taskId: number | null | undefined,
  actionKey: string | null | undefined,
  status: string,
): ChatMessageItem[] =>
  messages.map((message) => {
    const matchesMessage = messageId != null && message.id === messageId
    const matchesTask = taskId != null && message.agentTaskId === taskId
    if (!matchesMessage && !matchesTask) return message
    const normalizedKey = actionKey || ''
    if (!normalizedKey) return message
    const actionStatuses = normalizedKey
      ? { ...(message.actionStatuses || {}), [normalizedKey]: status || 'executed' }
      : message.actionStatuses || {}
    return {
      ...message,
      agentTaskStatus: status || 'executed',
      actionStatuses,
    }
  })

export const markAgentSelectionStatusInMessage = (
  messages: ChatMessageItem[],
  messageId: number | null | undefined,
  taskId: number | null | undefined,
  selectionKey: string | null | undefined,
  status: string,
): ChatMessageItem[] =>
  messages.map((message) => {
    const matchesMessage = messageId != null && message.id === messageId
    const matchesTask = taskId != null && message.agentTaskId === taskId
    if (!matchesMessage && !matchesTask) return message
    const normalizedKey = selectionKey || ''
    const selectionStatuses = normalizedKey
      ? { ...(message.selectionStatuses || {}), [normalizedKey]: status || 'selected' }
      : message.selectionStatuses || {}
    return {
      ...message,
      agentTaskStatus: status || 'selected',
      selectionStatuses,
    }
  })

export const buildAgentSelectionStatusKey = (
  selection: Pick<AssistantSelectionOptionItem, 'slot' | 'entityType' | 'entityId'> | null | undefined,
): string => {
  if (!selection || selection.entityId == null) return ''
  return `${selection.slot || ''}:${selection.entityType || ''}:${selection.entityId}`
}

/**
 * 业务意图：候选卡片是单选确认，同一 slot 一旦选中任意候选，就锁定整张卡片，避免继续确认产生二次任务分叉。
 */
export const isAgentSelectionCardResolved = (
  message: Pick<ChatMessageItem, 'selectionStatuses'>,
  card: AssistantSelectionCardItem,
): boolean => card.options.some((option) => (
  message.selectionStatuses?.[buildAgentSelectionStatusKey(option)] === 'selected'
))

export const formatChatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export const shouldCollapseChatSummary = (summary: string, threshold = 120): boolean =>
  (summary || '').trim().length > threshold

export interface ChatScrollMetrics {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

/**
 * 业务意图：只有用户明显离开消息底部时才露出返回最新入口，避免实时消息打断正在回看的上下文。
 */
export const shouldShowBackToLatest = (metrics: ChatScrollMetrics, threshold = 72): boolean => {
  const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
  return distanceFromBottom > threshold
}

export const resolveChatScrollBehavior = (shouldForceLatest: boolean, wasAtLatest: boolean): ScrollBehavior | null => {
  if (shouldForceLatest) return 'auto'
  if (wasAtLatest) return 'smooth'
  return null
}

export const isActiveChatAssistantStream = (message: Pick<ChatMessageItem, 'role' | 'status' | 'agentTaskStatus'>): boolean =>
  message.role === 'assistant' && message.status === 'streaming' && message.agentTaskStatus !== 'canceled'

/**
 * 业务意图：聊天室 Assistant 占位消息刚创建时正文为空，但用户需要在正文区域看到明确的回复中状态。
 */
export const resolveChatAssistantContent = (message: Pick<ChatMessageItem, 'role' | 'content' | 'status' | 'agentTaskStatus'>): string => {
  if (message.role !== 'assistant') return message.content || ''
  const display = resolveAssistantDisplayState(message, isActiveChatAssistantStream(message))
  return display.content || (display.showThinking ? 'GitPilot 正在回复' : '')
}

export interface ActiveMentionQuery {
  start: number
  end: number
  query: string
}

/**
 * 业务意图：只在当前光标所在词以 @ 开头时触发候选，避免邮箱或普通正文里的 @ 误弹出成员列表。
 */
export const resolveMentionQuery = (content: string, caret: number): ActiveMentionQuery | null => {
  const safeCaret = Math.max(0, Math.min(caret, content.length))
  const beforeCaret = content.slice(0, safeCaret)
  const tokenStart = Math.max(beforeCaret.lastIndexOf(' '), beforeCaret.lastIndexOf('\n'), beforeCaret.lastIndexOf('\t')) + 1
  const token = beforeCaret.slice(tokenStart)
  if (!token.startsWith('@')) return null
  if (token.slice(1).includes('@')) return null
  return {
    start: tokenStart,
    end: safeCaret,
    query: token.slice(1),
  }
}

export const replaceMentionAtCaret = (
  content: string,
  caret: number,
  token: string,
): { text: string; caret: number } => {
  const activeMention = resolveMentionQuery(content, caret)
  if (!activeMention) return { text: content, caret }
  const shouldSkipNextSpace = token.endsWith(' ') && /\s/.test(content.charAt(activeMention.end))
  const suffixStart = shouldSkipNextSpace ? activeMention.end + 1 : activeMention.end
  const text = `${content.slice(0, activeMention.start)}${token}${content.slice(suffixStart)}`
  return {
    text,
    caret: activeMention.start + token.length,
  }
}

export const insertTextAtCaret = (
  content: string,
  caret: number,
  textToInsert: string,
): { text: string; caret: number } => {
  const safeCaret = Math.max(0, Math.min(caret, content.length))
  return {
    text: `${content.slice(0, safeCaret)}${textToInsert}${content.slice(safeCaret)}`,
    caret: safeCaret + textToInsert.length,
  }
}
