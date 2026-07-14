/**
 * 聊天室输入区。
 * 业务意图：统一处理 Markdown 文本、附件和 @gitpilot mention，让发送动作始终走 REST 落库。
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AtSign, Bot, Laugh, Paperclip, Send, UserRound, X } from 'lucide-react'
import { Button } from '@/src/components/common/Button'
import {
  containsAssistantMention,
  formatChatFileSize,
  insertTextAtCaret,
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

const EMOJI_PACKS = [
  {
    title: '常用',
    items: ['😀', '😄', '😂', '😊', '😍', '😭', '😅', '😎', '🤔', '👍', '👏', '🙏'],
  },
  {
    title: '协作',
    items: ['🚀', '🔥', '✨', '✅', '🎉', '💡', '📌', '👀', '🙌', '💪', '🫡', '☕'],
  },
]

export const ChatComposer = ({ disabled = false, sending, members = [], onSend }: ChatComposerProps) => {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const emojiPanelRef = useRef<HTMLDivElement>(null)

  const hasAssistantMention = containsAssistantMention(content)
  const activeMention = useMemo(() => resolveMentionQuery(content, caret), [content, caret])
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const query = (activeMention?.query || '').toLowerCase()
    const baseOptions: MentionOption[] = [
      {
        key: 'assistant-gitpilot',
        label: 'GitPilot 助手',
        description: '基于整房间上下文回复、总结或汇总',
        token: '@gitpilot ',
        type: 'assistant',
      },
      ...members.map((member) => {
        const label = member.nickname || member.username
        return {
          key: `member-${member.userId}`,
          label,
          description: member.nickname ? member.username : member.role,
          token: `@${label} `,
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

  useEffect(() => {
    if (activeMention) setEmojiOpen(false)
  }, [activeMention])

  useEffect(() => {
    if (!emojiOpen) return
    const closeWhenClickOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (emojiPanelRef.current?.contains(target) || emojiButtonRef.current?.contains(target)) return
      setEmojiOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenClickOutside)
    return () => document.removeEventListener('pointerdown', closeWhenClickOutside)
  }, [emojiOpen])

  const syncCaret = () => {
    setCaret(textareaRef.current?.selectionStart || 0)
  }

  const selectMention = (option: MentionOption) => {
    const textarea = textareaRef.current
    const currentCaret = textarea?.selectionStart ?? caret
    const next = replaceMentionAtCaret(content, currentCaret, option.token)
    setContent(next.text)
    setCaret(next.caret)
    setEmojiOpen(false)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current
    const currentCaret = textarea?.selectionStart ?? caret
    const next = insertTextAtCaret(content, currentCaret, emoji)
    setContent(next.text)
    setCaret(next.caret)
    setEmojiOpen(false)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const insertAssistantMention = () => {
    if (containsAssistantMention(content)) {
      textareaRef.current?.focus()
      return
    }
    const textarea = textareaRef.current
    const currentCaret = textarea?.selectionStart ?? content.length
    const active = resolveMentionQuery(content, currentCaret)
    const next = active
      ? replaceMentionAtCaret(content, currentCaret, '@gitpilot ')
      : {
        text: content.trim() ? `${content.trimEnd()} @gitpilot ` : '@gitpilot ',
        caret: (content.trim() ? `${content.trimEnd()} @gitpilot ` : '@gitpilot ').length,
      }
    setContent(next.text)
    setCaret(next.caret)
    setEmojiOpen(false)
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
    if (event.key === 'Escape' && emojiOpen) {
      event.preventDefault()
      setEmojiOpen(false)
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
      className="chat-composer border-t border-[var(--color-border-light)] bg-[var(--color-bg-card)] px-4 py-3 sm:px-6"
    >
      <div className="mx-auto max-w-4xl">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file, index) => (
              <span
                key={`${file.name}-${file.lastModified}-${index}`}
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)]"
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
            'chat-composer-surface relative rounded-xl border bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xs)] transition-colors',
            hasAssistantMention ? 'is-hermes' : 'border-[var(--color-border-strong)] focus-within:border-[var(--color-primary)]',
          )}
        >
          {mentionOpen && (
            <div className="absolute bottom-full left-2 right-2 z-20 mb-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-lg)]">
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
                      ? 'chat-assistant-avatar'
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
          {emojiOpen && !disabled && !sending && (
            <div
              ref={emojiPanelRef}
              className="absolute bottom-12 left-2 z-20 w-[min(320px,calc(100%-16px))] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-lg)]"
            >
              <div className="border-b border-[var(--color-border-light)] px-3 py-2 text-[12px] font-semibold text-[var(--color-text-secondary)]">
                表情
              </div>
              <div className="max-h-56 overflow-y-auto p-3">
                {EMOJI_PACKS.map((pack) => (
                  <div key={pack.title} className="mb-3 last:mb-0">
                    <p className="mb-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">{pack.title}</p>
                    <div className="grid grid-cols-8 gap-1">
                      {pack.items.map((emoji) => (
                        <button
                          key={`${pack.title}-${emoji}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            insertEmoji(emoji)
                          }}
                          className="flex aspect-square items-center justify-center rounded-lg text-[19px] transition-colors hover:bg-[var(--color-bg-hover)]"
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
            onFocus={() => {
              if (mentionOpen) setEmojiOpen(false)
            }}
            onKeyDown={handleTextareaKeyDown}
            rows={3}
            disabled={disabled || sending}
            placeholder="写一条消息，输入 @ 提及成员或 GitPilot 助手..."
            className="max-h-44 min-h-24 w-full resize-y rounded-t-xl border-0 bg-transparent px-3.5 py-3 text-[14px] leading-relaxed text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus-visible:outline-none disabled:opacity-60"
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
                ref={emojiButtonRef}
                type="button"
                onClick={() => setEmojiOpen((open) => !open)}
                disabled={disabled || sending}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50',
                  emojiOpen
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <Laugh className="h-4 w-4" />
                表情
              </button>
              <button
                type="button"
                onClick={insertAssistantMention}
                disabled={disabled || sending}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50',
                  hasAssistantMention
                    ? 'chat-hermes-button is-active'
                    : 'chat-hermes-button is-inactive',
                )}
              >
                <AtSign className="h-4 w-4" />
                GitPilot
              </button>
              {hasAssistantMention && (
                <span className="chat-hermes-hint hidden text-[12px] sm:inline">将触发 GitPilot 回复</span>
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
