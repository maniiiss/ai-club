import { Mic, Paperclip, Send, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { resolveSlashMenuActiveIndex } from '@/src/lib/assistantUtils'
import { listAssistantMcpServers } from '@/src/api/assistant'
import type { AssistantMcpServerSummary } from '@/src/types/assistant'

interface AssistantComposerProps {
  disabled: boolean
  sending: boolean
  pendingFiles: File[]
  onFilesChange: (files: File[]) => void
  onSubmit: (question: string, slashCommand?: string | null) => void
  onStop: () => void
  onTranscribe: (file: File) => Promise<string>
  onError: (message: string) => void
}

const acceptedFileTypes = '.pdf,.docx,.pptx,.xlsx'
const builtinSlashCommands = [
  { command: '/文件库', label: '个人文件库问答' },
  { command: '/wiki', label: 'Wiki 问答' },
  { command: '/需求', label: '创建或整理需求' },
  { command: '/仓库扫描', label: '发起仓库扫描' },
  { command: '/执行任务', label: '查询或发起执行任务' },
] as const

type SlashCommandOption = { command: string; label: string; displayCommand?: string }

const visibleSlashCommand = (item: SlashCommandOption) => item.displayCommand || item.command

const parseSlashQuestion = (rawQuestion: string, slashCommands: SlashCommandOption[]) => {
  const normalized = rawQuestion.trim()
  const matchedCommand = slashCommands.find((item) => {
    const displayCommand = visibleSlashCommand(item)
    return normalized === item.command
      || normalized.startsWith(`${item.command} `)
      || normalized === displayCommand
      || normalized.startsWith(`${displayCommand} `)
  })
  if (!matchedCommand) return { question: normalized, slashCommand: null as string | null }
  const matchedPrefix = normalized === matchedCommand.command || normalized.startsWith(`${matchedCommand.command} `)
    ? matchedCommand.command
    : visibleSlashCommand(matchedCommand)
  return {
    question: normalized.slice(matchedPrefix.length).trim() || matchedCommand.label,
    slashCommand: matchedCommand.command,
  }
}

export const AssistantComposer = ({
  disabled,
  sending,
  pendingFiles,
  onFilesChange,
  onSubmit,
  onStop,
  onTranscribe,
  onError,
}: AssistantComposerProps) => {
  const [mcpServers, setMcpServers] = useState<AssistantMcpServerSummary[]>([])
  const [question, setQuestion] = useState('')
  const [selectedSlashCommand, setSelectedSlashCommand] = useState<string | null>(null)
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  /** 加载当前账号可用于专项提问的个人 MCP 服务。 */
  useEffect(() => {
    let active = true
    void listAssistantMcpServers()
      .then((servers) => {
        if (active) setMcpServers(servers.filter((server) => server.enabled))
      })
      .catch(() => {
        // MCP 菜单加载失败不应阻断普通 Slash Skill 和助手问答。
      })
    return () => { active = false }
  }, [])

  const slashCommands: SlashCommandOption[] = [
    ...builtinSlashCommands,
    ...mcpServers.map((server) => ({
      command: `/mcp/${server.id}`,
      displayCommand: `/mcp/${server.name}`,
      label: `MCP：${server.name}`,
    })),
  ]

  const submit = () => {
    const parsed = selectedSlashCommand
      ? {
          question: question.trim() || slashCommands.find((item) => item.command === selectedSlashCommand)?.label || '业务 Skill',
          slashCommand: selectedSlashCommand,
        }
      : parseSlashQuestion(question, slashCommands)
    if (!parsed.question || disabled || sending) return
    onSubmit(parsed.question, parsed.slashCommand)
    setQuestion('')
    setSelectedSlashCommand(null)
    setActiveSlashCommandIndex(0)
  }

  const slashMenuOpen = question.trimStart().startsWith('/') && !question.trim().includes(' ') && !selectedSlashCommand

  const selectSlashCommand = (command: string) => {
    setSelectedSlashCommand(command)
    setQuestion('')
    setActiveSlashCommandIndex(0)
  }

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 3)
    onFilesChange(files)
    event.target.value = ''
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('当前浏览器不支持语音输入')
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = async () => {
      setRecording(false)
      stream.getTracks().forEach((track) => track.stop())
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      if (!blob.size) return
      setTranscribing(true)
      try {
        const text = await onTranscribe(new File([blob], `hermes-voice-${Date.now()}.webm`, { type: blob.type }))
        setQuestion((prev) => [prev.trim(), text.trim()].filter(Boolean).join('\n'))
      } finally {
        setTranscribing(false)
      }
    }
    recorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  return (
    <footer className="flex-shrink-0 border-t border-[var(--color-border-light)] bg-white p-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFileTypes}
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingFiles.map((file) => (
            <span key={`${file.name}-${file.size}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]">
              {file.name}
              <button type="button" onClick={() => onFilesChange(pendingFiles.filter((item) => item !== file))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2 shadow-[var(--shadow-xs)]">
        {slashMenuOpen && (
          <div className="mb-2 grid gap-1 rounded-lg border border-[var(--color-border-light)] bg-white p-1 shadow-[var(--shadow-xs)]">
            {slashCommands.map((item, index) => (
              <button
                key={item.command}
                type="button"
                className={[
                  'flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-[var(--color-bg-hover)]',
                  activeSlashCommandIndex === index ? 'bg-[var(--color-bg-hover)]' : '',
                ].filter(Boolean).join(' ')}
                aria-selected={activeSlashCommandIndex === index}
                onMouseEnter={() => setActiveSlashCommandIndex(index)}
                onClick={() => selectSlashCommand(item.command)}
              >
                <strong className="text-[var(--color-text-primary)]">{visibleSlashCommand(item)}</strong>
                <span className="text-[var(--color-text-tertiary)]">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        {selectedSlashCommand && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-primary-light)] bg-[var(--color-primary-soft)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)]">
            <span className="text-[10px] font-black uppercase tracking-wide text-[var(--color-primary)]">Skill</span>
            <strong className="text-[var(--color-text-primary)]">{visibleSlashCommand(slashCommands.find((item) => item.command === selectedSlashCommand) || { command: selectedSlashCommand })}</strong>
            <span>{slashCommands.find((item) => item.command === selectedSlashCommand)?.label}</span>
            <button
              type="button"
              className="ml-1 rounded-full bg-black/5 px-1.5 text-[var(--color-text-tertiary)] hover:bg-black/10"
              onClick={() => setSelectedSlashCommand(null)}
            >
              ×
            </button>
          </div>
        )}
        <textarea
          value={question}
          rows={3}
          disabled={disabled || sending || recording || transcribing}
          placeholder={recording ? '正在录音...' : transcribing ? '正在转写语音...' : '问 GitPilot 一个问题'}
          className="block w-full resize-none border-0 bg-transparent px-2 py-1 text-[13px] leading-6 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-placeholder)] disabled:opacity-60"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (slashMenuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              setActiveSlashCommandIndex((current) => resolveSlashMenuActiveIndex(
                current,
                event.key === 'ArrowDown' ? 1 : -1,
                slashCommands.length,
              ))
              return
            }
            if (slashMenuOpen && event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              selectSlashCommand(slashCommands[activeSlashCommandIndex]?.command || slashCommands[0].command)
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="添加附件"
              disabled={disabled || sending}
              className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={recording ? '结束录音' : '语音输入'}
              disabled={disabled || sending || transcribing}
              className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
              onClick={() => (recording ? stopRecording() : startRecording())}
            >
              <Mic className={recording ? 'h-4 w-4 text-red-500' : 'h-4 w-4'} />
            </button>
            <span className="hidden text-[11px] text-[var(--color-text-tertiary)] sm:inline">Enter 发送 · Shift + Enter 换行</span>
          </div>
          {sending ? (
            <Button type="button" variant="secondary" size="sm" icon={<Square className="h-4 w-4" />} onClick={onStop}>
              停止
            </Button>
          ) : (
            <Button type="button" size="sm" icon={<Send className="h-4 w-4" />} disabled={disabled || (!question.trim() && !selectedSlashCommand)} onClick={submit}>
              发送
            </Button>
          )}
        </div>
      </div>
    </footer>
  )
}
