import { ExternalLink, Loader2 } from 'lucide-react'
import { Markdown } from '@/src/components/common/Markdown'
import { cn } from '@/src/lib/utils'
import type {
  HermesAttachmentItem,
  HermesDebugInfoItem,
  HermesMessageItem,
  HermesReferenceItem,
} from '@/src/types/hermes'
import { resolveHermesAssistantDisplayState } from '@/src/lib/hermesUtils'

interface HermesMessageListProps {
  messages: HermesMessageItem[]
  roleName: string
  references: HermesReferenceItem[]
  suggestions: string[]
  debug: HermesDebugInfoItem | null
  streamStatusText: string
  streamingActive: boolean
  disabled: boolean
  onSuggestion: (question: string) => void
}

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const AttachmentBar = ({ attachments }: { attachments: HermesAttachmentItem[] }) => {
  if (!attachments.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <span
          key={`${attachment.assetId}-${attachment.fileName}`}
          className="rounded-md border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]"
        >
          {attachment.fileName} · {formatFileSize(attachment.fileSize)}
        </span>
      ))}
    </div>
  )
}

const ToolTrace = ({ message }: { message: HermesMessageItem }) => {
  const toolExecutions = message.toolExecutions || []
  if (!toolExecutions.length) return null
  const failedCount = toolExecutions.filter((item) => String(item.status || '').toUpperCase() === 'FAILED').length
  return (
    <details className={cn(
      'mt-3 rounded-lg border px-3 py-2 text-[12px]',
      failedCount ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    )}>
      <summary className="cursor-pointer font-medium">工具调用 · {toolExecutions.length} 次</summary>
      <div className="mt-2 space-y-1 text-[11px]">
        {toolExecutions.slice(0, 8).map((item, index) => (
          <div key={`${String(item.toolCallId || item.toolCode || index)}`} className="flex justify-between gap-2">
            <span>{String(item.toolCode || item.functionName || '未知工具')}</span>
            <span>{String(item.status || 'UNKNOWN')}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

export const HermesMessageList = ({
  messages,
  roleName,
  references,
  suggestions,
  debug,
  streamStatusText,
  streamingActive,
  disabled,
  onSuggestion,
}: HermesMessageListProps) => (
  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-5">
    {messages.length === 0 ? (
      <div className="m-auto max-w-lg text-center">
        <div className="text-[12px] font-semibold uppercase text-[var(--color-primary)]">Hermes</div>
        <h1 className="mt-2 text-[22px] font-semibold text-[var(--color-text-primary)]">从一个问题开始</h1>
        <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">
          Hermes 会结合当前权限、页面上下文和平台内数据回答；涉及写入的动作会先请求确认。
        </p>
      </div>
    ) : (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {messages.map((message) => {
          const assistantDisplay = message.role === 'assistant'
            ? resolveHermesAssistantDisplayState(message, streamingActive)
            : null
          return (
          <article key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[88%] rounded-2xl px-4 py-3 shadow-[var(--shadow-xs)]',
              message.role === 'user'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border-light)] bg-white text-[var(--color-text-primary)]',
            )}>
              <div className={cn(
                'mb-1 text-[11px] font-semibold',
                message.role === 'user' ? 'text-white/70' : 'text-[var(--color-text-tertiary)]',
              )}>
                {message.role === 'user' ? '我' : `Hermes · ${roleName || '协作助手'}`}
              </div>
              {message.role === 'user' ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-6">{message.content || '暂无内容'}</pre>
              ) : (
                <>
                  {assistantDisplay?.content ? (
                    <Markdown content={assistantDisplay.content} normalize={false} variant="assistant" className="text-[13px]" />
                  ) : assistantDisplay?.showThinking ? (
                    <div className="inline-flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {streamStatusText || 'Hermes 正在思考'}
                    </div>
                  ) : null}
                  {assistantDisplay?.showContinuation && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {streamStatusText || '继续生成中'}
                    </div>
                  )}
                  <ToolTrace message={message} />
                </>
              )}
              <AttachmentBar attachments={message.attachments} />
            </div>
          </article>
        )})}
      </div>
    )}

    {(references.length > 0 || suggestions.length > 0 || debug) && (
      <div className="mx-auto mt-4 w-full max-w-4xl space-y-3">
        {references.length > 0 && (
          <section className="rounded-lg border border-[var(--color-border-light)] bg-white p-3">
            <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">引用对象</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {references.map((reference) => (
                <a
                  key={`${reference.type}-${reference.id}-${reference.title}`}
                  href={reference.route || '#'}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[12px] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
                >
                  {reference.title}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </section>
        )}
        {suggestions.length > 0 && (
          <section className="rounded-lg border border-[var(--color-border-light)] bg-white p-3">
            <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">你可以继续问</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={disabled}
                  className="rounded-full border border-[var(--color-border-light)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                  onClick={() => onSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        )}
        {debug && (
          <details className="rounded-lg border border-[var(--color-border-light)] bg-white p-3 text-[12px]">
            <summary className="cursor-pointer font-semibold text-[var(--color-text-primary)]">调试轨迹</summary>
            <pre className="mt-2 max-h-[320px] overflow-auto rounded-lg bg-[#111827] p-3 text-[11px] leading-5 text-white">
              {JSON.stringify(debug, null, 2)}
            </pre>
          </details>
        )}
      </div>
    )}
  </div>
)
