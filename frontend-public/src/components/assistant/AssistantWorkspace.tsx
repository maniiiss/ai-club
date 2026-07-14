import { Brain } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import {
  archiveAssistantConversationSession,
  createAssistantConversationSession,
  deleteAssistantConversationSession,
  getAssistantConversationDetail,
  markAssistantActionExecuted,
  pageAssistantConversationSessions,
  renameAssistantConversationSession,
  restoreAssistantConversationSession,
  streamAssistantSessionChat,
  streamAssistantSessionChatWithFiles,
  transcribeAssistantSpeech,
  type AssistantStreamHandlers,
} from '@/src/api/assistant'
import {
  buildAssistantSessionQuery,
  markAssistantStreamStopped,
  shouldIgnoreAssistantStreamEvent,
  shouldRenderAssistantWorkspaceHeader,
} from '@/src/lib/assistantUtils'
import { executeAssistantAction } from '@/src/lib/assistantActionExecutor'
import { getErrorMessage } from '@/src/lib/utils'
import { AssistantActionCards } from './AssistantActionCards'
import { AssistantComposer } from './AssistantComposer'
import { AssistantMemoryPanel } from './AssistantMemoryPanel'
import { AssistantMessageList } from './AssistantMessageList'
import { AssistantSelectionCards } from './AssistantSelectionCards'
import { AssistantSessionSidebar } from './AssistantSessionSidebar'
import type {
  AssistantActionItem,
  AssistantConversationDetailItem,
  AssistantConversationMode,
  AssistantConversationSessionSummaryItem,
  AssistantDebugInfoItem,
  AssistantMessageItem,
  AssistantReferenceItem,
  AssistantSelectionCardItem,
  AssistantSelectionPayload,
} from '@/src/types/assistant'

interface AssistantWorkspaceProps {
  mode: AssistantConversationMode
  projectId?: number
  compact?: boolean
}

interface StreamController {
  abort: () => void
}

// 助手展示名称与当前登录用户角色无关，避免流式响应中的用户角色覆盖助手标签。
const ASSISTANT_DISPLAY_NAME = '协作助手'

const buildSessionPayload = (projectId?: number) => ({
  routeName: 'projects',
  projectId: projectId ?? null,
})

const toLocalMessages = (detail: AssistantConversationDetailItem): AssistantMessageItem[] =>
  detail.messages.map((message) => ({
    id: String(message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content,
    status: message.status === 'error' ? 'error' : 'done',
    attachments: message.attachments || [],
  }))

const buildLocalAttachment = (file: File) => ({
  id: null,
  assetId: 0,
  fileName: file.name,
  contentType: file.type || 'application/octet-stream',
  fileSize: file.size,
  sourceFormat: '',
  suggestedTitle: file.name,
  truncated: false,
  warnings: [],
  createdAt: null,
})

export const AssistantWorkspace = ({ mode, projectId, compact = false }: AssistantWorkspaceProps) => {
  const [sessions, setSessions] = useState<AssistantConversationSessionSummaryItem[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [archivedView, setArchivedView] = useState(false)
  const [page, setPage] = useState(1)
  const [canLoadMore, setCanLoadMore] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [messages, setMessages] = useState<AssistantMessageItem[]>([])
  const [references, setReferences] = useState<AssistantReferenceItem[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [actions, setActions] = useState<AssistantActionItem[]>([])
  const [selectionCards, setSelectionCards] = useState<AssistantSelectionCardItem[]>([])
  const [debug, setDebug] = useState<AssistantDebugInfoItem | null>(null)
  const [executedActionKeys, setExecutedActionKeys] = useState<Set<string>>(new Set())
  const [executingActionKey, setExecutingActionKey] = useState('')
  const [sending, setSending] = useState(false)
  const [streamStatusText, setStreamStatusText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [memoryVisible, setMemoryVisible] = useState(false)
  const [renameDialog, setRenameDialog] = useState<{ session: AssistantConversationSessionSummaryItem; title: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<AssistantConversationSessionSummaryItem | null>(null)
  const [actionDialog, setActionDialog] = useState<{ action: AssistantActionItem; actionKey: string } | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [error, setError] = useState('')
  const streamControllerRef = useRef<StreamController | null>(null)
  const currentStreamingAssistantMessageIdRef = useRef<string | null>(null)
  const stopRequestedRef = useRef(false)

  const canUseProjectMode = Boolean(projectId)
  const disabled = !canUseProjectMode || sending || detailLoading

  const resetDisplayState = useCallback(() => {
    setMessages([])
    setReferences([])
    setSuggestions([])
    setActions([])
    setSelectionCards([])
    setDebug(null)
    setExecutedActionKeys(new Set())
  }, [])

  const loadSessions = useCallback(async (nextPage = 1, append = false, nextArchived = archivedView) => {
    if (mode === 'project' && !projectId) return
    if (append) setLoadingMore(true)
    else setSessionLoading(true)
    setError('')
    try {
      const data = await pageAssistantConversationSessions(buildAssistantSessionQuery(mode, nextPage, nextArchived, projectId))
      setSessions((prev) => (append ? [...prev, ...data.records] : data.records))
      setPage(nextPage)
      setCanLoadMore(nextPage < data.totalPages)
      if (!append && data.records.length === 0) {
        setSelectedSessionId(null)
        resetDisplayState()
      } else if (!append) {
        setSelectedSessionId((current) => (
          current && data.records.some((record) => record.id === current) ? current : data.records[0].id
        ))
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSessionLoading(false)
      setLoadingMore(false)
    }
  }, [archivedView, mode, projectId, resetDisplayState])

  const applyDetail = (detail: AssistantConversationDetailItem) => {
    setMessages(toLocalMessages(detail))
    setReferences(detail.latestDisplayState.references || [])
    setSuggestions(detail.latestDisplayState.suggestions || [])
    setActions(detail.latestDisplayState.actions || [])
    setSelectionCards(detail.latestDisplayState.selectionCards || [])
    setDebug(detail.latestDisplayState.debug || null)
    setExecutedActionKeys(new Set(detail.executedActionKeys || []))
  }

  const loadDetail = useCallback(async (sessionId: number) => {
    setDetailLoading(true)
    setError('')
    try {
      const detail = await getAssistantConversationDetail(sessionId)
      applyDetail(detail)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions(1, false, archivedView)
  }, [archivedView, mode, projectId, loadSessions])

  useEffect(() => {
    setSelectedSessionId(null)
    resetDisplayState()
  }, [mode, projectId, archivedView, resetDisplayState])

  useEffect(() => {
    if (selectedSessionId) {
      loadDetail(selectedSessionId)
    }
  }, [selectedSessionId, loadDetail])

  const ensureSession = async () => {
    if (selectedSessionId) return selectedSessionId
    if (!projectId) throw new Error('缺少项目上下文')
    const session = await createAssistantConversationSession(buildSessionPayload(projectId))
    setSelectedSessionId(session.id)
    setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)])
    return session.id
  }

  const createSession = async () => {
    try {
      const session = await createAssistantConversationSession(buildSessionPayload(projectId))
      setSelectedSessionId(session.id)
      setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)])
      resetDisplayState()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const updateMessage = (messageId: string, updater: (message: AssistantMessageItem) => AssistantMessageItem) => {
    setMessages((prev) => prev.map((item) => (item.id === messageId ? updater(item) : item)))
  }

  const applyStreamDisplayState = (
    nextReferences: AssistantReferenceItem[],
    nextSuggestions: string[],
    nextActions: AssistantActionItem[],
    nextSelectionCards: AssistantSelectionCardItem[],
    nextDebug: AssistantDebugInfoItem | null,
  ) => {
    setReferences(nextReferences || [])
    setSuggestions(nextSuggestions || [])
    setActions(nextActions || [])
    setSelectionCards(nextSelectionCards || [])
    setDebug(nextDebug || null)
  }

  const submitQuestion = async (question: string, selection?: AssistantSelectionPayload | null, slashCommand?: string | null) => {
    if (!question.trim() || sending) return
    setSending(true)
    stopRequestedRef.current = false
    setError('')
    setStreamStatusText('GitPilot 正在理解上下文')
    const userMessageId = `user-${Date.now()}`
    const assistantMessageId = `assistant-${Date.now()}`
    currentStreamingAssistantMessageIdRef.current = assistantMessageId
    const filesForRequest = pendingFiles
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: question, status: 'done', attachments: filesForRequest.map(buildLocalAttachment) },
      { id: assistantMessageId, role: 'assistant', content: '', status: 'streaming', attachments: [] },
    ])
    try {
      const sessionId = await ensureSession()
      const payload = { question, selection: selection || null, debug: Boolean(debug), slashCommand: slashCommand || null }
      const handlers: AssistantStreamHandlers = {
        onStatus: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          setStreamStatusText(event.message || event.stage || 'GitPilot 正在处理')
        },
        onMeta: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          applyStreamDisplayState(event.references, event.suggestions, event.actions, event.selectionCards, event.debug)
        },
        onDelta: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          updateMessage(assistantMessageId, (current) => ({ ...current, content: `${current.content}${event.content || ''}` }))
        },
        onDone: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          applyStreamDisplayState(event.references, event.suggestions, event.actions, event.selectionCards, event.debug)
          updateMessage(assistantMessageId, (current) => ({
            ...current,
            content: event.content || current.content,
            status: 'done',
            attachments: event.attachments || [],
            toolExecutions: event.debug?.toolExecutions || [],
          }))
          setPendingFiles([])
          setSending(false)
          setStreamStatusText('')
          currentStreamingAssistantMessageIdRef.current = null
          stopRequestedRef.current = false
          loadSessions(1, false, archivedView)
        },
        onError: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          updateMessage(assistantMessageId, (current) => ({ ...current, content: event.message || current.content, status: 'error' }))
          setError(event.message || 'GitPilot 流式连接已中断')
          setSending(false)
          setStreamStatusText('')
          currentStreamingAssistantMessageIdRef.current = null
          stopRequestedRef.current = false
        },
      }
      streamControllerRef.current = filesForRequest.length
        ? await streamAssistantSessionChatWithFiles(sessionId, payload, filesForRequest, handlers)
        : await streamAssistantSessionChat(sessionId, payload, handlers)
    } catch (err) {
      updateMessage(assistantMessageId, (current) => ({ ...current, content: getErrorMessage(err), status: 'error' }))
      setError(getErrorMessage(err))
      setSending(false)
      setStreamStatusText('')
      currentStreamingAssistantMessageIdRef.current = null
      stopRequestedRef.current = false
    }
  }

  const stopStream = () => {
    stopRequestedRef.current = true
    setMessages((current) => markAssistantStreamStopped(current, currentStreamingAssistantMessageIdRef.current))
    streamControllerRef.current?.abort()
    streamControllerRef.current = null
    currentStreamingAssistantMessageIdRef.current = null
    setSending(false)
    setStreamStatusText('')
  }

  const executeAction = async (action: AssistantActionItem, actionKey: string) => {
    if (!selectedSessionId) return
    setExecutingActionKey(actionKey)
    try {
      await executeAssistantAction(action)
      setExecutedActionKeys((prev) => new Set([...prev, actionKey]))
      await markAssistantActionExecuted(selectedSessionId, actionKey)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setExecutingActionKey('')
    }
  }

  const requestActionConfirm = (action: AssistantActionItem, _index: number, actionKey: string) => {
    if (action.requiresConfirm) {
      setActionDialog({ action, actionKey })
      return
    }
    executeAction(action, actionKey)
  }

  const confirmRenameSession = async () => {
    if (!renameDialog) return
    const title = renameDialog.title.trim()
    if (!title) return
    setDialogLoading(true)
    setError('')
    try {
      await renameAssistantConversationSession(renameDialog.session.id, { title })
      setRenameDialog(null)
      await loadSessions(1, false, archivedView)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDialogLoading(false)
    }
  }

  const confirmDeleteSession = async () => {
    if (!deleteDialog) return
    setDialogLoading(true)
    setError('')
    try {
      await deleteAssistantConversationSession(deleteDialog.id)
      if (selectedSessionId === deleteDialog.id) setSelectedSessionId(null)
      setDeleteDialog(null)
      await loadSessions(1, false, archivedView)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDialogLoading(false)
    }
  }

  const currentTitle = 'GitPilot 项目助手'
  const renderWorkspaceHeader = shouldRenderAssistantWorkspaceHeader(compact)

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setMemoryVisible(true)}>
        知识
      </Button>
    </div>
  )

  if (memoryVisible) {
    return <AssistantMemoryPanel onClose={() => setMemoryVisible(false)} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-bg-page)]">
      {renderWorkspaceHeader ? (
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-light)] bg-white px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{currentTitle}</h2>
            </div>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
              已绑定当前项目上下文
            </p>
          </div>
          {headerActions}
        </header>
      ) : (
        <div className="flex flex-shrink-0 justify-end border-b border-[var(--color-border-light)] bg-white px-4 py-3">
          {headerActions}
        </div>
      )}
      {error && <div className="flex-shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-[13px] text-red-700">{error}</div>}
      <div className="flex min-h-0 flex-1">
        <AssistantSessionSidebar
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          archivedView={archivedView}
          loading={sessionLoading}
          loadingMore={loadingMore}
          canLoadMore={canLoadMore}
          disabled={sending}
          onCreate={createSession}
          onSelect={setSelectedSessionId}
          onToggleArchivedView={(next) => {
            setArchivedView(next)
            setSelectedSessionId(null)
          }}
          onLoadMore={() => loadSessions(page + 1, true, archivedView)}
          onRename={(session) => setRenameDialog({ session, title: session.title || '新会话' })}
          onArchive={async (session) => {
            await archiveAssistantConversationSession(session.id)
            await loadSessions(1, false, archivedView)
          }}
          onRestore={async (session) => {
            await restoreAssistantConversationSession(session.id)
            await loadSessions(1, false, archivedView)
          }}
          onDelete={(session) => setDeleteDialog(session)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <AssistantMessageList
            messages={messages}
            roleName={ASSISTANT_DISPLAY_NAME}
            references={references}
            suggestions={suggestions}
            debug={debug}
            streamStatusText={streamStatusText}
            streamingActive={sending}
            disabled={disabled}
            onSuggestion={submitQuestion}
          />
          <div className="space-y-3 px-4 pb-3 sm:px-5">
            <AssistantSelectionCards cards={selectionCards} disabled={disabled} onSelect={(selection) => submitQuestion(selection.resumeQuestion || '继续处理', selection)} />
            <AssistantActionCards actions={actions} executedActionKeys={executedActionKeys} executingActionKey={executingActionKey} disabled={disabled} onConfirm={requestActionConfirm} />
          </div>
          <AssistantComposer
            disabled={disabled}
            sending={sending}
            pendingFiles={pendingFiles}
            onFilesChange={(files) => setPendingFiles(files.slice(0, 3))}
            onSubmit={(question, slashCommand) => submitQuestion(question, null, slashCommand)}
            onStop={stopStream}
            onTranscribe={transcribeAssistantSpeech}
            onError={setError}
          />
        </main>
      </div>
      <ConfirmDialog
        open={Boolean(renameDialog)}
        title="重命名会话"
        description="输入一个更容易识别的会话标题。"
        variant="edit"
        confirmText="保存"
        loading={dialogLoading}
        confirmDisabled={!renameDialog?.title.trim()}
        input={{
          label: '会话标题',
          value: renameDialog?.title || '',
          maxLength: 100,
          autoFocus: true,
          placeholder: '输入会话标题',
          onChange: (title) => {
            if (renameDialog) setRenameDialog({ ...renameDialog, title })
          },
        }}
        onCancel={() => setRenameDialog(null)}
        onConfirm={confirmRenameSession}
      />
      <ConfirmDialog
        open={Boolean(deleteDialog)}
        title="删除会话"
        description={<>确定要删除会话「{deleteDialog?.title || '新会话'}」吗？此操作不可撤销。</>}
        variant="danger"
        confirmText="删除"
        loading={dialogLoading}
        onCancel={() => setDeleteDialog(null)}
        onConfirm={confirmDeleteSession}
      />
      <ConfirmDialog
        open={Boolean(actionDialog)}
        title="确认执行动作"
        description={actionDialog?.action.description || `确认执行「${actionDialog?.action.title || actionDialog?.action.type || '该动作'}」吗？`}
        confirmText="执行"
        loading={Boolean(actionDialog && executingActionKey === actionDialog.actionKey)}
        onCancel={() => setActionDialog(null)}
        onConfirm={() => {
          if (!actionDialog) return
          const pendingAction = actionDialog
          setActionDialog(null)
          executeAction(pendingAction.action, pendingAction.actionKey)
        }}
      />
    </div>
  )
}
