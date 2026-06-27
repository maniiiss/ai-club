import { Mic, Paperclip, Send, Square, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/src/components/common/Button'

interface HermesComposerProps {
  disabled: boolean
  sending: boolean
  pendingFiles: File[]
  onFilesChange: (files: File[]) => void
  onSubmit: (question: string) => void
  onStop: () => void
  onTranscribe: (file: File) => Promise<string>
  onError: (message: string) => void
}

const acceptedFileTypes = '.pdf,.docx,.pptx,.xlsx'

export const HermesComposer = ({
  disabled,
  sending,
  pendingFiles,
  onFilesChange,
  onSubmit,
  onStop,
  onTranscribe,
  onError,
}: HermesComposerProps) => {
  const [question, setQuestion] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const submit = () => {
    const normalized = question.trim()
    if (!normalized || disabled || sending) return
    onSubmit(normalized)
    setQuestion('')
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
        <textarea
          value={question}
          rows={3}
          disabled={disabled || sending || recording || transcribing}
          placeholder={recording ? '正在录音...' : transcribing ? '正在转写语音...' : '问 Hermes 一个问题'}
          className="block w-full resize-none border-0 bg-transparent px-2 py-1 text-[13px] leading-6 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-placeholder)] disabled:opacity-60"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
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
            <span className="hidden text-[11px] text-[var(--color-text-tertiary)] sm:inline">Ctrl/⌘ + Enter 发送</span>
          </div>
          {sending ? (
            <Button type="button" variant="secondary" size="sm" icon={<Square className="h-4 w-4" />} onClick={onStop}>
              停止
            </Button>
          ) : (
            <Button type="button" size="sm" icon={<Send className="h-4 w-4" />} disabled={disabled || !question.trim()} onClick={submit}>
              发送
            </Button>
          )}
        </div>
      </div>
    </footer>
  )
}
