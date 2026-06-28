/**
 * 聊天室消息流。
 * 业务意图：用户消息、附件与 Hermes 流式回复在同一条时间线上呈现，确保协作上下文对房间成员一致。
 */
import { useEffect, useRef } from 'react'
import { AlertTriangle, Bot, FileText, RefreshCcw, UserRound } from 'lucide-react'
import type { ChatMessageItem } from '@/src/types/chat'
import { Button } from '@/src/components/common/Button'
import { Markdown } from '@/src/components/common/Markdown'
import { formatChatFileSize } from '@/src/lib/chatUtils'
import { cn, getInitials } from '@/src/lib/utils'

interface ChatMessageListProps {
  messages: ChatMessageItem[]
  currentUserId?: number | null
  loading: boolean
  onRetryHermes: () => void
}

const formatMessageTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const ChatMessageList = ({ messages, currentUserId, loading, onRetryHermes }: ChatMessageListProps) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

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
          发送 Markdown 消息，附上文档，或直接输入 @hermes 让 Hermes 基于房间上下文汇总。
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
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
                    {isAssistant ? 'Hermes' : message.senderName || message.senderUsername || '用户'}
                  </span>
                  {message.mentionsHermes && !isAssistant && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
                      @hermes
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
                      ? 'border-amber-200 bg-amber-50/70'
                      : isMine
                        ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary-light)]'
                        : 'border-[var(--color-border)] bg-white',
                  )}
                >
                  {message.status === 'error' && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-[12px] text-red-700">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Hermes 回复失败，可重试生成。
                    </div>
                  )}
                  <Markdown content={message.content || (message.status === 'streaming' ? 'Hermes 正在组织回复...' : '')} />
                  {message.status === 'streaming' && (
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                      Hermes 正在回复
                    </span>
                  )}
                  {message.attachments.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {message.attachments.map((attachment) => (
                        <div
                          key={`${message.id}-${attachment.id || attachment.assetId}`}
                          className="flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] bg-white/70 px-2.5 py-2"
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
                        onClick={onRetryHermes}
                      >
                        重试 Hermes
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
  )
}

const MessageAvatar = ({ message }: { message: ChatMessageItem }) => {
  const isAssistant = message.role === 'assistant'
  if (isAssistant) {
    return (
      <div className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
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
