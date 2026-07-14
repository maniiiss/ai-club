/**
 * 聊天室消息流。
 * 业务意图：用户消息、附件与 Assistant 流式回复在同一条时间线上呈现，确保协作上下文对房间成员一致。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, Bot, CheckCircle2, FileText, MousePointer2, PlayCircle, RefreshCcw, UserRound, XCircle } from 'lucide-react'
import type { ChatMessageItem } from '@/src/types/chat'
import type { AssistantActionItem, AssistantSelectionOptionItem, AssistantSelectionPayload } from '@/src/types/assistant'
import { Button } from '@/src/components/common/Button'
import { AssistantMarkdown } from '@/src/components/common/AssistantMarkdown'
import {
  buildAgentSelectionStatusKey,
  formatChatFileSize,
  isAgentSelectionCardResolved,
  resolveChatAssistantContent,
  resolveAgentActionStatus,
  resolveChatScrollBehavior,
  shouldShowBackToLatest,
} from '@/src/lib/chatUtils'
import { cn, getInitials } from '@/src/lib/utils'

interface ChatMessageListProps {
  roomId: number
  messages: ChatMessageItem[]
  currentUserId?: number | null
  loading: boolean
  onRetryAssistant: () => void
  resolvingActionKey?: string
  resolvingSelectionKey?: string
  computeActionKey: (action: Pick<AssistantActionItem, 'type' | 'title' | 'params'>, index: number) => string
  onConfirmAgentAction: (message: ChatMessageItem, action: AssistantActionItem, index: number, actionKey: string) => void
  onCancelAgentAction: (message: ChatMessageItem, actionKey: string) => void
  onSelectAgentCandidate: (message: ChatMessageItem, selection: AssistantSelectionPayload) => void
}

const formatMessageTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const ChatMessageList = ({
  roomId,
  messages,
  currentUserId,
  loading,
  onRetryAssistant,
  resolvingActionKey = '',
  resolvingSelectionKey = '',
  computeActionKey,
  onConfirmAgentAction,
  onCancelAgentAction,
  onSelectAgentCandidate,
}: ChatMessageListProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldForceLatestRef = useRef(true)
  const [showBackToLatest, setShowBackToLatest] = useState(false)

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  const updateBackToLatestVisibility = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    setShowBackToLatest(shouldShowBackToLatest({
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
    }))
  }, [])

  const handleScroll = useCallback(() => {
    updateBackToLatestVisibility()
  }, [updateBackToLatestVisibility])

  useEffect(() => {
    const shouldForceLatest = shouldForceLatestRef.current
    const behavior = resolveChatScrollBehavior(shouldForceLatest, !showBackToLatest)
    const rafId = window.requestAnimationFrame(() => {
      if (behavior) {
        scrollToLatest(behavior)
      }
      shouldForceLatestRef.current = false
      updateBackToLatestVisibility()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [messages, scrollToLatest, showBackToLatest, updateBackToLatestVisibility])

  useEffect(() => {
    shouldForceLatestRef.current = true
    setShowBackToLatest(false)
    scrollToLatest('auto')
    updateBackToLatestVisibility()
  }, [roomId, scrollToLatest, updateBackToLatestVisibility])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--color-text-tertiary)]">
        加载消息中...
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Bot className="mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
        <p className="text-[16px] font-semibold text-[var(--color-text-primary)]">开始一次房间协作</p>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-[var(--color-text-tertiary)]">
          发送 Markdown 消息，附上文档，或直接输入 @gitpilot 让 GitPilot 基于房间上下文汇总。
        </p>
      </div>
    )
  }

  return (
    <div className="chat-message-list relative min-h-0 flex-1">
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto px-4 py-5 sm:px-6"
        onScroll={handleScroll}
      >
        <div className="mx-auto max-w-4xl space-y-5">
          {messages.map((message) => {
            const isAssistant = message.role === 'assistant'
            const isMine = !isAssistant && message.senderUserId === currentUserId
            return (
              <div
                key={message.id}
                className={cn('flex gap-3', isMine ? 'justify-end' : 'justify-start')}
              >
                {!isMine && <MessageAvatar message={message} />}
                <div className={cn('min-w-0 max-w-[min(760px,88%)]', isMine && 'items-end')}>
                  <div className={cn('mb-1 flex items-center gap-2', isMine && 'justify-end')}>
                    <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">
                      {isAssistant ? 'GitPilot' : message.senderName || message.senderUsername || '用户'}
                    </span>
                    {message.mentionsAssistant && !isAssistant && (
                      <span className="chat-mention-badge rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold">
                        @gitpilot
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">
                      {formatMessageTime(message.createdAt)}
                    </span>
                  </div>

                <div
                  className={cn(
                    'rounded-xl border px-4 py-3 shadow-[var(--shadow-xs)]',
                    isAssistant
                      ? 'chat-assistant-message'
                      : isMine
                        ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary-light)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
                  )}
                >
                  {message.status === 'error' && (
                    <div className="chat-message-error mb-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      GitPilot 回复失败，可重试生成。
                    </div>
                  )}
                  <AssistantMarkdown content={resolveChatAssistantContent(message)} />
                  {isAssistant && message.agentTaskId && (
                    <span className="chat-agent-task-chip mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium">
                      Agent task #{message.agentTaskId} · {formatAgentTaskStatus(message.agentTaskStatus)}
                    </span>
                  )}
                  {isAssistant && Boolean(message.actions?.length) && (
                    <div className="mt-3 grid gap-2">
                      {message.actions?.map((action, index) => (
                        <AgentActionPreview
                          key={`${action.type}-${index}`}
                          message={message}
                          action={action}
                          index={index}
                          actionKey={computeActionKey(action, index)}
                          status={resolveAgentActionStatus(message, computeActionKey(action, index))}
                          busy={resolvingActionKey === computeActionKey(action, index)}
                          onConfirm={onConfirmAgentAction}
                          onCancel={onCancelAgentAction}
                        />
                      ))}
                    </div>
                  )}
                  {isAssistant && Boolean(message.selectionCards?.length) && (
                    <div className="mt-3 grid gap-2">
                      {message.selectionCards?.map((card) => {
                        const cardResolved = isAgentSelectionCardResolved(message, card)
                        return (
                        <article key={`${card.slot}-${card.title}`} className="chat-selection-card rounded-lg border border-[var(--color-border-light)] p-3">
                          <div className="text-[12.5px] font-semibold text-[var(--color-text-primary)]">{card.title || '候选对象待确认'}</div>
                          {card.description && <p className="mt-1 text-[11.5px] text-[var(--color-text-secondary)]">{card.description}</p>}
                          <div className="mt-2 grid gap-1.5">
                            {card.options.map((option) => {
                              const selection = toSelection(card.resumeQuestion, option)
                              const selectionStatusKey = buildAgentSelectionStatusKey(selection)
                              const resolvingKey = `${message.agentTaskId || ''}:${selectionStatusKey}`
                              const selected = message.selectionStatuses?.[selectionStatusKey] === 'selected'
                              return (
                              <button
                                key={`${option.entityType}-${option.entityId}-${option.title}`}
                                type="button"
                                disabled={!selection || cardResolved || resolvingSelectionKey === resolvingKey}
                                onClick={() => selection && onSelectAgentCandidate(message, selection)}
                                className={cn(
                                  'chat-selection-option flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] disabled:cursor-not-allowed',
                                  selected ? 'is-selected border-emerald-200' : 'border-[var(--color-border-light)]',
                                  cardResolved && !selected && 'opacity-55',
                                )}
                              >
                                {selected ? (
                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                ) : (
                                  <MousePointer2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                                )}
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-medium text-[var(--color-text-primary)]">{option.title}</span>
                                  <span className="block text-[11px] text-[var(--color-text-tertiary)]">{selected ? '已确认' : cardResolved ? '已确认其他候选' : (option.subtitle || option.entityType)}</span>
                                </span>
                              </button>
                            )})}
                          </div>
                        </article>
                      )})}
                    </div>
                  )}
                  {message.attachments.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {message.attachments.map((attachment) => (
                        <div
                          key={`${message.id}-${attachment.id || attachment.assetId}`}
                          className="chat-attachment-card flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-2.5 py-2"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-medium text-[var(--color-text-primary)]">
                              {attachment.fileName || attachment.suggestedTitle}
                            </p>
                            <p className="text-[11px] text-[var(--color-text-tertiary)]">
                              {attachment.sourceFormat || attachment.contentType || '文件'} · {formatChatFileSize(attachment.fileSize)}
                              {attachment.truncated ? ' · 已截断' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isAssistant && message.status === 'error' && (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        icon={<RefreshCcw className="h-3.5 w-3.5" />}
                        onClick={onRetryAssistant}
                      >
                        重试 GitPilot
                      </Button>
                    </div>
                  )}
                </div>
              </div>
                {isMine && <MessageAvatar message={message} />}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>
      {showBackToLatest && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
                  className="absolute bottom-4 right-4 z-10 rounded-full border-[var(--color-primary)]/30 bg-[var(--color-bg-elevated)] px-3 text-[var(--color-primary)] shadow-[var(--shadow-md)] backdrop-blur hover:bg-[var(--color-primary-light)] sm:right-6"
          onClick={() => {
            scrollToLatest('smooth')
            setShowBackToLatest(false)
          }}
        >
          返回最新
        </Button>
      )}
    </div>
  )
}

const AgentActionPreview = ({
  message,
  action,
  index,
  actionKey,
  status,
  busy,
  onConfirm,
  onCancel,
}: {
  message: ChatMessageItem
  action: AssistantActionItem
  index: number
  actionKey: string
  status?: string
  busy: boolean
  onConfirm: (message: ChatMessageItem, action: AssistantActionItem, index: number, actionKey: string) => void
  onCancel: (message: ChatMessageItem, actionKey: string) => void
}) => {
  const normalizedStatus = (status || '').toLowerCase()
  const executed = normalizedStatus === 'executed' || normalizedStatus === 'done'
  const canceled = normalizedStatus === 'canceled'
  const resolved = executed || canceled
  return (
    <article className="chat-agent-action-card rounded-lg border p-3">
      <div className="flex items-start gap-2">
        {executed ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : canceled ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-[var(--color-text-primary)]">{action.title || action.type}</div>
          {action.description && <p className="mt-1 text-[11.5px] leading-5 text-[var(--color-text-secondary)]">{action.description}</p>}
                  <span className={cn(
                    'chat-action-status mt-2 inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                    executed ? 'is-done' : canceled ? 'is-canceled' : 'is-pending',
                  )}>
            {executed ? '已执行' : canceled ? '已取消' : '待确认'}
          </span>
          {!resolved && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-[11.5px]"
                loading={busy}
                disabled={busy || !message.agentTaskId}
                onClick={() => onConfirm(message, action, index, actionKey)}
              >
                确认执行
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-[11.5px]"
                disabled={busy || !message.agentTaskId}
                onClick={() => onCancel(message, actionKey)}
              >
                取消
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

const toSelection = (resumeQuestion: string, option: AssistantSelectionOptionItem): AssistantSelectionPayload | null => {
  if (option.entityId == null) return null
  return {
    slot: option.slot,
    entityType: option.entityType,
    entityId: option.entityId,
    resumeQuestion,
  }
}

const formatAgentTaskStatus = (status?: string) => {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'pending') return '排队中'
  if (normalized === 'running' || normalized === 'streaming') return '处理中'
  if (normalized === 'done') return '已完成'
  if (normalized === 'error') return '失败'
  if (normalized === 'canceled') return '已取消'
  if (normalized === 'awaiting_confirmation') return '待确认'
  if (normalized === 'executed') return '已执行'
  return normalized || '已创建'
}

const MessageAvatar = ({ message }: { message: ChatMessageItem }) => {
  const isAssistant = message.role === 'assistant'
  if (isAssistant) {
    return (
      <div className="chat-assistant-avatar mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <Bot className="h-4.5 w-4.5" />
      </div>
    )
  }
  if (message.senderAvatarUrl) {
    return (
      <img
        src={message.senderAvatarUrl}
        alt={message.senderName || message.senderUsername || '用户'}
        className="mt-5 h-9 w-9 shrink-0 rounded-lg object-cover"
      />
    )
  }
  return (
    <div className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-hover)] text-[12px] font-semibold text-[var(--color-text-secondary)]">
      {message.senderName || message.senderUsername ? getInitials(message.senderName || message.senderUsername) : <UserRound className="h-4 w-4" />}
    </div>
  )
}
