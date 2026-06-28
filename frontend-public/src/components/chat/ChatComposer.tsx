/**
 * 聊天室输入区。
 * 业务意图：统一处理 Markdown 文本、附件和 @hermes mention，让发送动作始终走 REST 落库。
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AtSign, Bot, Paperclip, Send, UserRound, X } from 'lucide-react'
import { Button } from '@/src/components/common/Button'
import {
  containsHermesMention,
  formatChatFileSize,
  replaceMentionAtCaret,
  resolveMentionQuery,
} from '@/src/lib/chatUtils'
import { cn } from '@/src/lib/utils'
import type { ChatMemberItem } from '@/src/types/chat'

interface ChatComposerProps {
  disabled?: boolean
  sending: boolean
  members?: ChatMemberItem[]
  onSend: (content: string, files: File[]) => Promise<void>
}

interface MentionOption {
  key: string
  label: string
  description: string
  token: string
  type: 'assistant' | 'member'
}

export const ChatComposer = ({ disabled = false, sending, members = [], onSend }: ChatComposerProps) => {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasHermesMention = containsHermesMention(content)
  const activeMention = useMemo(() => resolveMentionQuery(content, caret), [content, caret])
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const query = (activeMention?.query || '').toLowerCase()
    const baseOptions: MentionOption[] = [
      {
        key: 'assistant-hermes',
        label: 'Hermes 助手',
        description: '基于整房间上下文回复、总结或汇总',
        token: '@hermes ',
        type: 'assistant',
      },
      ...members.map((member) => {
        const label = member.nickname || member.username
        return {
          key: `member-${member.userId}`,
          label,
          description: member.nickname ? member.username : member.role,
          token: `@${member.username} `,
          type: 'member' as const,
        }
      }),
    ]
    if (!activeMention) return []
    if (!query) return baseOptions.slice(0, 8)
    return baseOptions
      .filter((option) => `${option.label} ${option.description} ${option.token}`.toLowerCase().includes(query))
      .slice(0, 8)
  }, [activeMention, members])
  const mentionOpen = !!activeMention && mentionOptions.length > 0 && !disabled && !sending

  useEffect(() => {
    setActiveMentionIndex(0)
  }, [activeMention?.start, activeMention?.query, mentionOptions.length])

  const syncCaret = () => {
    setCaret(textareaRef.current?.selectionStart || 0)
  }

  const selectMention = (option: MentionOption) => {
    const textarea = textareaRef.current
    const currentCaret = textarea?.selectionStart ?? caret
    const next = replaceMentionAtCaret(content, currentCaret, option.token)
    setContent(next.text)
    setCaret(next.caret)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const insertHermesMention = () => {
    if (containsHermesMention(content)) {
      textareaRef.current?.focus()
      return
    }
    const textarea = textareaRef.current
    const currentCaret = textarea?.selectionStart ?? content.length
    const active = resolveMentionQuery(content, currentCaret)
    const next = active
      ? replaceMentionAtCaret(content, currentCaret, '@hermes ')
      : {
        text: content.trim() ? `${content.trimEnd()} @hermes ` : '@hermes ',
        caret: (content.trim() ? `${content.trimEnd()} @hermes ` : '@hermes ').length,
      }
    setContent(next.text)
    setCaret(next.caret)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const handleFilesSelected = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return
    const nextFiles = [...files, ...Array.from(selectedFiles)].slice(0, 5)
    setFiles(nextFiles)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (disabled || sending) return
    const normalizedContent = content.trim()
    if (!normalizedContent && files.length === 0) {
      setError('请输入消息或添加附件')
      return
    }
    setError(null)
    await onSend(normalizedContent, files)
    setContent('')
    setFiles([])
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (mentionOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setActiveMentionIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1
        return (current + offset + mentionOptions.length) % mentionOptions.length
      })
      return
    }
    if (mentionOpen && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault()
      selectMention(mentionOptions[activeMentionIndex] || mentionOptions[0])
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[var(--color-border-light)] bg-[var(--color-bg-card)] px-4 py-3 sm:px-6"
    >
      <div className="mx-auto max-w-4xl">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file, index) => (
              <span
                key={`${file.name}-${file.lastModified}-${index}`}
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)]"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-[var(--color-text-tertiary)]">{formatChatFileSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
                  title="移除附件"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          className={cn(
            'relative rounded-xl border bg-white shadow-[var(--shadow-xs)] transition-all',
            hasHermesMention ? 'border-amber-300 ring-2 ring-amber-100' : 'border-[var(--color-border-strong)] focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20',
          )}
        >
          {mentionOpen && (
            <div className="absolute bottom-full left-2 right-2 z-20 mb-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)]">
              {mentionOptions.map((option, index) => (
                <button
                  key={option.key}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectMention(option)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    index === activeMentionIndex ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-bg-hover)]',
                  )}
                >
                  <span className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    option.type === 'assistant'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]',
                  )}>
                    {option.type === 'assistant' ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{option.label}</span>
                    <span className="block truncate text-[11.5px] text-[var(--color-text-tertiary)]">{option.description}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-[var(--color-bg-page)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)]">
                    {option.token.trim()}
                  </span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => {
              setContent(event.target.value)
              setCaret(event.target.selectionStart)
            }}
            onClick={syncCaret}
            onKeyUp={syncCaret}
            onSelect={syncCaret}
            onKeyDown={handleTextareaKeyDown}
            rows={3}
            disabled={disabled || sending}
            placeholder="写一条消息，输入 @ 提及成员或 Hermes 助手..."
            className="max-h-44 min-h-24 w-full resize-y rounded-t-xl border-0 bg-transparent px-3.5 py-3 text-[14px] leading-relaxed text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-placeholder)] disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-light)] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => handleFilesSelected(event.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || sending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" />
                附件
              </button>
              <button
                type="button"
                onClick={insertHermesMention}
                disabled={disabled || sending}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50',
                  hasHermesMention
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-[var(--color-text-secondary)] hover:bg-amber-50 hover:text-amber-700',
                )}
              >
                <AtSign className="h-4 w-4" />
                Hermes
              </button>
              {hasHermesMention && (
                <span className="hidden text-[12px] text-amber-700 sm:inline">将触发房间助手回复</span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-[11.5px] text-[var(--color-text-tertiary)] lg:inline">Enter 发送 · Shift + Enter 换行</span>
              <Button
                type="submit"
                size="sm"
                loading={sending}
                disabled={disabled}
                icon={<Send className="h-4 w-4" />}
              >
                发送
              </Button>
            </div>
          </div>
        </div>
        {error && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
      </div>
    </form>
  )
}
