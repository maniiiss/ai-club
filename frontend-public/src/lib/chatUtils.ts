import type { ChatMessageItem, ChatSocketEvent } from '@/src/types/chat'
import type { HermesActionItem } from '@/src/types/hermes'

const hermesMentionPattern = /(^|\s)@hermes\b/i

export const containsHermesMention = (content: string): boolean => hermesMentionPattern.test(content || '')

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
  actions: HermesActionItem[],
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

export const markAgentActionExecutedInMessage = (
  messages: ChatMessageItem[],
  messageId: number | null | undefined,
  taskId: number | null | undefined,
  status: string,
): ChatMessageItem[] =>
  messages.map((message) => {
    const matchesMessage = messageId != null && message.id === messageId
    const matchesTask = taskId != null && message.agentTaskId === taskId
    if (!matchesMessage && !matchesTask) return message
    return {
      ...message,
      agentTaskStatus: status || 'executed',
    }
  })

export const formatChatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export const shouldCollapseChatSummary = (summary: string, threshold = 120): boolean =>
  (summary || '').trim().length > threshold

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
