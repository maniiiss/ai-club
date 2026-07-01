import { Brain } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import {
  archiveHermesConversationSession,
  createHermesConversationSession,
  deleteHermesConversationSession,
  getHermesConversationDetail,
  markHermesActionExecuted,
  pageHermesConversationSessions,
  renameHermesConversationSession,
  restoreHermesConversationSession,
  streamHermesSessionChat,
  streamHermesSessionChatWithFiles,
  transcribeHermesSpeech,
  type HermesStreamHandlers,
} from '@/src/api/hermes'
import { buildHermesSessionQuery, shouldRenderHermesWorkspaceHeader } from '@/src/lib/hermesUtils'
import { executeHermesAction } from '@/src/lib/hermesActionExecutor'
import { getErrorMessage } from '@/src/lib/utils'
import { HermesActionCards } from './HermesActionCards'
import { HermesComposer } from './HermesComposer'
import { HermesMemoryPanel } from './HermesMemoryPanel'
import { HermesMessageList } from './HermesMessageList'
import { HermesSelectionCards } from './HermesSelectionCards'
import { HermesSessionSidebar } from './HermesSessionSidebar'
import type {
  HermesActionItem,
  HermesConversationDetailItem,
  HermesConversationMode,
  HermesConversationSessionSummaryItem,
  HermesDebugInfoItem,
  HermesMessageItem,
  HermesReferenceItem,
  HermesSelectionCardItem,
  HermesSelectionPayload,
} from '@/src/types/hermes'

interface HermesWorkspaceProps {
  mode: HermesConversationMode
  projectId?: number
  compact?: boolean
}

interface StreamController {
  abort: () => void
}

const buildSessionPayload = (projectId?: number) => ({
  routeName: 'projects',
  projectId: projectId ?? null,
})

const toLocalMessages = (detail: HermesConversationDetailItem): HermesMessageItem[] =>
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

export const HermesWorkspace = ({ mode, projectId, compact = false }: HermesWorkspaceProps) => {
  const [sessions, setSessions] = useState<HermesConversationSessionSummaryItem[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [archivedView, setArchivedView] = useState(false)
  const [page, setPage] = useState(1)
  const [canLoadMore, setCanLoadMore] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [messages, setMessages] = useState<HermesMessageItem[]>([])
  const [roleName, setRoleName] = useState('协作助手')
  const [references, setReferences] = useState<HermesReferenceItem[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [actions, setActions] = useState<HermesActionItem[]>([])
  const [selectionCards, setSelectionCards] = useState<HermesSelectionCardItem[]>([])
  const [debug, setDebug] = useState<HermesDebugInfoItem | null>(null)
  const [executedActionKeys, setExecutedActionKeys] = useState<Set<string>>(new Set())
  const [executingActionKey, setExecutingActionKey] = useState('')
  const [sending, setSending] = useState(false)
  const [streamStatusText, setStreamStatusText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [memoryVisible, setMemoryVisible] = useState(false)
  const [renameDialog, setRenameDialog] = useState<{ session: HermesConversationSessionSummaryItem; title: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<HermesConversationSessionSummaryItem | null>(null)
  const [actionDialog, setActionDialog] = useState<{ action: HermesActionItem; actionKey: string } | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [error, setError] = useState('')
  const streamControllerRef = useRef<StreamController | null>(null)

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
      const data = await pageHermesConversationSessions(buildHermesSessionQuery(mode, nextPage, nextArchived, projectId))
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

  const applyDetail = (detail: HermesConversationDetailItem) => {
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
      const detail = await getHermesConversationDetail(sessionId)
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
    const session = await createHermesConversationSession(buildSessionPayload(projectId))
    setSelectedSessionId(session.id)
    setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)])
    return session.id
  }

  const createSession = async () => {
    try {
      const session = await createHermesConversationSession(buildSessionPayload(projectId))
      setSelectedSessionId(session.id)
      setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)])
      resetDisplayState()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const updateMessage = (messageId: string, updater: (message: HermesMessageItem) => HermesMessageItem) => {
    setMessages((prev) => prev.map((item) => (item.id === messageId ? updater(item) : item)))
  }

  const applyStreamDisplayState = (
    nextRoleName: string,
    nextReferences: HermesReferenceItem[],
    nextSuggestions: string[],
    nextActions: HermesActionItem[],
    nextSelectionCards: HermesSelectionCardItem[],
    nextDebug: HermesDebugInfoItem | null,
  ) => {
    setRoleName(nextRoleName || '协作助手')
    setReferences(nextReferences || [])
    setSuggestions(nextSuggestions || [])
    setActions(nextActions || [])
    setSelectionCards(nextSelectionCards || [])
    setDebug(nextDebug || null)
  }

  const submitQuestion = async (question: string, selection?: HermesSelectionPayload | null) => {
    if (!question.trim() || sending) return
    setSending(true)
    setError('')
    setStreamStatusText('Hermes 正在理解上下文')
    const userMessageId = `user-${Date.now()}`
    const assistantMessageId = `assistant-${Date.now()}`
    const filesForRequest = pendingFiles
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: question, status: 'done', attachments: filesForRequest.map(buildLocalAttachment) },
      { id: assistantMessageId, role: 'assistant', content: '', status: 'streaming', attachments: [] },
    ])
    try {
      const sessionId = await ensureSession()
      const payload = { question, selection: selection || null, debug: Boolean(debug) }
      const handlers: HermesStreamHandlers = {
        onStatus: (event) => setStreamStatusText(event.message || event.stage || 'Hermes 正在处理'),
        onMeta: (event) => applyStreamDisplayState(event.roleName, event.references, event.suggestions, event.actions, event.selectionCards, event.debug),
        onDelta: (event) => updateMessage(assistantMessageId, (current) => ({ ...current, content: `${current.content}${event.content || ''}` })),
        onDone: (event) => {
          applyStreamDisplayState(event.roleName, event.references, event.suggestions, event.actions, event.selectionCards, event.debug)
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
          loadSessions(1, false, archivedView)
        },
        onError: (event) => {
          updateMessage(assistantMessageId, (current) => ({ ...current, content: event.message || current.content, status: 'error' }))
          setError(event.message || 'Hermes 流式连接已中断')
          setSending(false)
          setStreamStatusText('')
        },
      }
      streamControllerRef.current = filesForRequest.length
        ? await streamHermesSessionChatWithFiles(sessionId, payload, filesForRequest, handlers)
        : await streamHermesSessionChat(sessionId, payload, handlers)
    } catch (err) {
      updateMessage(assistantMessageId, (current) => ({ ...current, content: getErrorMessage(err), status: 'error' }))
      setError(getErrorMessage(err))
      setSending(false)
      setStreamStatusText('')
    }
  }

  const stopStream = () => {
    streamControllerRef.current?.abort()
    streamControllerRef.current = null
    setSending(false)
    setStreamStatusText('')
  }

  const executeAction = async (action: HermesActionItem, actionKey: string) => {
    if (!selectedSessionId) return
    setExecutingActionKey(actionKey)
    try {
      await executeHermesAction(action)
      setExecutedActionKeys((prev) => new Set([...prev, actionKey]))
      await markHermesActionExecuted(selectedSessionId, actionKey)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setExecutingActionKey('')
    }
  }

  const requestActionConfirm = (action: HermesActionItem, _index: number, actionKey: string) => {
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
      await renameHermesConversationSession(renameDialog.session.id, { title })
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
      await deleteHermesConversationSession(deleteDialog.id)
      if (selectedSessionId === deleteDialog.id) setSelectedSessionId(null)
      setDeleteDialog(null)
      await loadSessions(1, false, archivedView)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDialogLoading(false)
    }
  }

  const currentTitle = 'Hermes 项目助手'
  const renderWorkspaceHeader = shouldRenderHermesWorkspaceHeader(compact)

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setMemoryVisible(true)}>
        记忆管理
      </Button>
    </div>
  )

  if (memoryVisible) {
    return <HermesMemoryPanel onClose={() => setMemoryVisible(false)} />
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
        <HermesSessionSidebar
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
            await archiveHermesConversationSession(session.id)
            await loadSessions(1, false, archivedView)
          }}
          onRestore={async (session) => {
            await restoreHermesConversationSession(session.id)
            await loadSessions(1, false, archivedView)
          }}
          onDelete={(session) => setDeleteDialog(session)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <HermesMessageList
            messages={messages}
            roleName={roleName}
            references={references}
            suggestions={suggestions}
            debug={debug}
            streamStatusText={streamStatusText}
            disabled={disabled}
            onSuggestion={submitQuestion}
          />
          <div className="space-y-3 px-4 pb-3 sm:px-5">
            <HermesSelectionCards cards={selectionCards} disabled={disabled} onSelect={(selection) => submitQuestion(selection.resumeQuestion || '继续处理', selection)} />
            <HermesActionCards actions={actions} executedActionKeys={executedActionKeys} executingActionKey={executingActionKey} disabled={disabled} onConfirm={requestActionConfirm} />
          </div>
          <HermesComposer
            disabled={disabled}
            sending={sending}
            pendingFiles={pendingFiles}
            onFilesChange={(files) => setPendingFiles(files.slice(0, 3))}
            onSubmit={submitQuestion}
            onStop={stopStream}
            onTranscribe={transcribeHermesSpeech}
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
