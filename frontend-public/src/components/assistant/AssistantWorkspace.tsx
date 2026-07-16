import { Archive, Brain, MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import { getWorkItemDetail } from '@/src/api/planning'
import {
  archiveAssistantConversationSession,
  createAssistantConversationSession,
  deleteAssistantConversationSession,
  getAssistantConversationDetail,
  markAssistantActionExecuted,
  pageAssistantConversationSessions,
  searchAssistantConversationSessions,
  renameAssistantConversationSession,
  restoreAssistantConversationSession,
  streamAssistantSessionChat,
  streamAssistantSessionChatWithFiles,
  pageAssistantFeedback,
  submitAssistantMessageFeedback,
  transcribeAssistantSpeech,
  type AssistantStreamHandlers,
} from '@/src/api/assistant'
import {
  buildAssistantSessionQuery,
  isDevelopmentExecutionAction,
  markAssistantStreamStopped,
  resolveDevelopmentExecutionActionContext,
  shouldIgnoreAssistantStreamEvent,
  shouldRenderAssistantWorkspaceHeader,
} from '@/src/lib/assistantUtils'
import { executeAssistantAction } from '@/src/lib/assistantActionExecutor'
import { getErrorMessage } from '@/src/lib/utils'
import { AssistantActionCards } from './AssistantActionCards'
import { AssistantComposer } from './AssistantComposer'
import { AssistantFileLibraryPanel } from './AssistantFileLibraryPanel'
import { AssistantMemoryPanel } from './AssistantMemoryPanel'
import { AssistantMessageList } from './AssistantMessageList'
import { AssistantSelectionCards } from './AssistantSelectionCards'
import { AssistantSessionSidebar } from './AssistantSessionSidebar'
import { DevelopmentExecutionDialog } from '@/src/pages/planning/DevelopmentExecutionDialog'
import type {
  AssistantActionItem,
  AssistantFeedbackVote,
  AssistantConversationDetailItem,
  AssistantConversationMode,
  AssistantConversationSessionSummaryItem,
  AssistantConversationSearchResult,
  AssistantMessageItem,
  AssistantMessageFeedbackSummary,
  AssistantReferenceItem,
  AssistantSelectionCardItem,
  AssistantSelectionPayload,
} from '@/src/types/assistant'
import type { WorkItem } from '@/src/types/planning'

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

const toLocalMessages = (detail: AssistantConversationDetailItem, feedbackByMessageId: Map<number, AssistantMessageFeedbackSummary> = new Map()): AssistantMessageItem[] =>
  detail.messages.map((message) => ({
    id: String(message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content,
    status: message.status === 'error' ? 'error' : 'done',
    attachments: message.attachments || [],
    feedback: message.role === 'assistant' ? feedbackByMessageId.get(message.id) || null : undefined,
  }))

const FEEDBACK_REASON_OPTIONS = [
  ['WRONG_ANSWER', '事实错误'],
  ['IRRELEVANT', '答非所问'],
  ['MISSING_CONTEXT', '上下文缺失'],
  ['TOOL_FAILED', '工具执行失败'],
  ['INTERRUPTED', '响应中断'],
  ['UNCLEAR', '表达不清'],
  ['OTHER', '其他'],
] as const

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
  const [executedActionKeys, setExecutedActionKeys] = useState<Set<string>>(new Set())
  const [executingActionKey, setExecutingActionKey] = useState('')
  const [sending, setSending] = useState(false)
  const [streamStatusText, setStreamStatusText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [workspacePanel, setWorkspacePanel] = useState<'memory' | 'fileLibrary' | null>(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [sessionSearchQuery, setSessionSearchQuery] = useState('')
  const [sessionSearchResults, setSessionSearchResults] = useState<AssistantConversationSearchResult[]>([])
  const [sessionSearchLoading, setSessionSearchLoading] = useState(false)
  const [renameDialog, setRenameDialog] = useState<{ session: AssistantConversationSessionSummaryItem; title: string } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<AssistantConversationSessionSummaryItem | null>(null)
  const [actionDialog, setActionDialog] = useState<{ action: AssistantActionItem; actionKey: string } | null>(null)
  const [developmentExecutionDialog, setDevelopmentExecutionDialog] = useState<{
    action: AssistantActionItem
    actionKey: string
    workItem: WorkItem
    initialInputText: string
  } | null>(null)
  const [feedbackDialog, setFeedbackDialog] = useState<{ messageId: string; vote: AssistantFeedbackVote; reasonCodes: string[]; comment: string } | null>(null)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [error, setError] = useState('')
  const streamControllerRef = useRef<StreamController | null>(null)
  const currentStreamingAssistantMessageIdRef = useRef<string | null>(null)
  const stopRequestedRef = useRef(false)
  const searchRequestIdRef = useRef(0)
  const pendingSearchSessionIdRef = useRef<number | null>(null)

  const canUseProjectMode = Boolean(projectId)
  const disabled = !canUseProjectMode || sending || detailLoading || archivedView

  const resetDisplayState = useCallback(() => {
    setMessages([])
    setReferences([])
    setSuggestions([])
    setActions([])
    setSelectionCards([])
    setExecutedActionKeys(new Set())
    setDevelopmentExecutionDialog(null)
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

  const applyDetail = (detail: AssistantConversationDetailItem, feedbackByMessageId?: Map<number, AssistantMessageFeedbackSummary>) => {
    setMessages(toLocalMessages(detail, feedbackByMessageId))
    setReferences(detail.latestDisplayState.references || [])
    setSuggestions(detail.latestDisplayState.suggestions || [])
    setActions(detail.latestDisplayState.actions || [])
    setSelectionCards(detail.latestDisplayState.selectionCards || [])
    setExecutedActionKeys(new Set(detail.executedActionKeys || []))
  }

  const loadDetail = useCallback(async (sessionId: number) => {
    setDetailLoading(true)
    setError('')
    try {
      const detail = await getAssistantConversationDetail(sessionId)
      let feedbackByMessageId = new Map<number, AssistantMessageFeedbackSummary>()
      try {
        const feedbackPage = await pageAssistantFeedback({ page: 1, size: 100, sessionId })
        feedbackByMessageId = new Map(feedbackPage.records.map((item) => [item.assistantMessageId, item]))
      } catch {
        // 反馈读取失败不阻断历史消息回显。
      }
      applyDetail(detail, feedbackByMessageId)
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
    setSelectedSessionId(pendingSearchSessionIdRef.current)
    pendingSearchSessionIdRef.current = null
    resetDisplayState()
  }, [mode, projectId, archivedView, resetDisplayState])

  const searchSessions = useCallback(async (query: string) => {
    const normalizedQuery = query.trim()
    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId
    if (!normalizedQuery || !projectId) {
      setSessionSearchResults([])
      setSessionSearchLoading(false)
      return
    }
    setSessionSearchLoading(true)
    try {
      const data = await searchAssistantConversationSessions(normalizedQuery, projectId)
      if (requestId === searchRequestIdRef.current) setSessionSearchResults(data.records)
    } catch (err) {
      if (requestId === searchRequestIdRef.current) setError(getErrorMessage(err))
    } finally {
      if (requestId === searchRequestIdRef.current) setSessionSearchLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    const timer = window.setTimeout(() => void searchSessions(sessionSearchQuery), 250)
    return () => window.clearTimeout(timer)
  }, [searchSessions, sessionSearchQuery])

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
  ) => {
    setReferences(nextReferences || [])
    setSuggestions(nextSuggestions || [])
    setActions(nextActions || [])
    setSelectionCards(nextSelectionCards || [])
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
      const payload = { question, selection: selection || null, slashCommand: slashCommand || null }
      const handlers: AssistantStreamHandlers = {
        onStatus: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          setStreamStatusText(event.message || event.stage || 'GitPilot 正在处理')
        },
        onMeta: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          applyStreamDisplayState(event.references, event.suggestions, event.actions, event.selectionCards)
        },
        onDelta: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          updateMessage(assistantMessageId, (current) => ({ ...current, content: `${current.content}${event.content || ''}` }))
        },
        onDone: (event) => {
          if (shouldIgnoreAssistantStreamEvent(assistantMessageId, currentStreamingAssistantMessageIdRef.current, stopRequestedRef.current)) return
          applyStreamDisplayState(event.references, event.suggestions, event.actions, event.selectionCards)
          updateMessage(assistantMessageId, (current) => ({
            ...current,
            id: event.assistantMessageId ? String(event.assistantMessageId) : current.id,
            content: event.content || current.content,
            status: 'done',
            attachments: event.attachments || [],
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

  /**
   * 打开开发执行弹窗并准备工作项上下文。
   * 业务意图：GitPilot 的开发执行动作必须让用户选择仓库和目标分支后才能创建任务。
   */
  const openDevelopmentExecutionDialog = async (action: AssistantActionItem, actionKey: string) => {
    if (!selectedSessionId) return
    const context = resolveDevelopmentExecutionActionContext(action)
    if (!context) {
      setError('GitPilot 开发执行动作缺少有效的项目或工作项上下文')
      return
    }
    setExecutingActionKey(actionKey)
    setError('')
    try {
      const workItem = await getWorkItemDetail(context.workItemId)
      if (workItem.projectId !== context.projectId) {
        throw new Error('GitPilot 开发执行动作的工作项不属于当前项目')
      }
      setDevelopmentExecutionDialog({ action, actionKey, workItem, initialInputText: context.initialInputText })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setExecutingActionKey('')
    }
  }

  /** 开发执行成功后才持久化动作状态，取消或校验失败都保留待确认动作。 */
  const completeDevelopmentExecutionAction = async () => {
    if (!selectedSessionId || !developmentExecutionDialog) return
    const { actionKey } = developmentExecutionDialog
    setDevelopmentExecutionDialog(null)
    setExecutedActionKeys((prev) => new Set([...prev, actionKey]))
    try {
      await markAssistantActionExecuted(selectedSessionId, actionKey)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const requestActionConfirm = (action: AssistantActionItem, _index: number, actionKey: string) => {
    if (isDevelopmentExecutionAction(action)) {
      if (action.requiresConfirm) {
        setActionDialog({ action, actionKey })
      } else {
        void openDevelopmentExecutionDialog(action, actionKey)
      }
      return
    }
    if (action.requiresConfirm) {
      setActionDialog({ action, actionKey })
      return
    }
    executeAction(action, actionKey)
  }

  /** 点赞直接提交；点踩先打开原因补充面板，避免用户被迫输入长文本。 */
  const handleFeedback = (message: AssistantMessageItem, vote: AssistantFeedbackVote) => {
    if (!selectedSessionId || !Number.isSafeInteger(Number(message.id)) || message.status !== 'done') return
    if (vote === 'DOWN') {
      setFeedbackDialog({
        messageId: message.id,
        vote,
        reasonCodes: message.feedback?.reasonCodes || [],
        comment: message.feedback?.comment || '',
      })
      return
    }
    void submitFeedback(message.id, { vote, reasonCodes: [], comment: '' })
  }

  /** 提交反馈并将服务端返回的状态回写到当前消息。 */
  const submitFeedback = async (messageId: string, payload: { vote: AssistantFeedbackVote; reasonCodes: string[]; comment: string }) => {
    if (!selectedSessionId) return
    if (payload.vote === 'DOWN' && payload.reasonCodes.length === 0) {
      setError('点踩反馈至少选择一个原因')
      return
    }
    setFeedbackSubmitting(true)
    setError('')
    try {
      const saved = await submitAssistantMessageFeedback(selectedSessionId, Number(messageId), payload)
      updateMessage(messageId, (current) => ({ ...current, feedback: saved }))
      setFeedbackDialog(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const toggleFeedbackReason = (reason: string) => {
    setFeedbackDialog((current) => {
      if (!current) return current
      const reasonCodes = current.reasonCodes.includes(reason)
        ? current.reasonCodes.filter((item) => item !== reason)
        : [...current.reasonCodes, reason]
      return { ...current, reasonCodes }
    })
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

  const selectSearchResult = (result: AssistantConversationSearchResult) => {
    setSessionSearchQuery('')
    if (result.archived !== archivedView) {
      pendingSearchSessionIdRef.current = result.sessionId
      setArchivedView(result.archived)
      return
    }
    setSelectedSessionId(result.sessionId)
  }

  const currentTitle = 'GitPilot 项目助手'
  const renderWorkspaceHeader = shouldRenderAssistantWorkspaceHeader(compact)

  const headerActions = (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          title="更多助手选项"
          aria-label="更多助手选项"
          aria-expanded={moreMenuOpen}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-white text-[var(--color-text-secondary)] shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          onClick={() => setMoreMenuOpen((current) => !current)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {moreMenuOpen && (
          <div className="absolute right-0 top-11 z-20 w-36 rounded-xl border border-[var(--color-border-light)] bg-white p-1.5 shadow-[var(--shadow-lg)]">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              onClick={() => {
                setWorkspacePanel('memory')
                setMoreMenuOpen(false)
              }}
            >
              <Brain className="h-3.5 w-3.5" />记忆
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              onClick={() => {
                setArchivedView((current) => !current)
                setSelectedSessionId(null)
                setMoreMenuOpen(false)
              }}
            >
              <Archive className="h-3.5 w-3.5" />{archivedView ? '当前会话' : '已归档'}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  if (workspacePanel === 'memory') {
    return <AssistantMemoryPanel onClose={() => setWorkspacePanel(null)} />
  }

  if (workspacePanel === 'fileLibrary') {
    return <AssistantFileLibraryPanel onClose={() => setWorkspacePanel(null)} />
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
          searchQuery={sessionSearchQuery}
          searchResults={sessionSearchResults}
          searchLoading={sessionSearchLoading}
          onSearchChange={setSessionSearchQuery}
          onOpenFileLibrary={() => setWorkspacePanel('fileLibrary')}
          onCreate={createSession}
          onSelect={(sessionId) => {
            setSessionSearchQuery('')
            setSelectedSessionId(sessionId)
          }}
          onSelectSearchResult={selectSearchResult}
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
            streamStatusText={streamStatusText}
            streamingActive={sending}
            disabled={disabled}
            onSuggestion={submitQuestion}
            onFeedback={handleFeedback}
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
      {feedbackDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true" aria-label="反馈回答">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-lg)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">告诉我们哪里需要改进</h3>
                <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">选择原因后提交，帮助我们持续改进 GitPilot。</p>
              </div>
              <button type="button" className="text-[12px] text-[var(--color-text-tertiary)]" onClick={() => setFeedbackDialog(null)}>关闭</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {FEEDBACK_REASON_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleFeedbackReason(value)}
                  aria-pressed={feedbackDialog.reasonCodes.includes(value)}
                  className={value && feedbackDialog.reasonCodes.includes(value)
                    ? 'rounded-full border border-rose-100 bg-rose-100 px-3 py-1.5 text-[12px] text-rose-700'
                    : 'rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)]'}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={feedbackDialog.comment}
              maxLength={2000}
              onChange={(event) => setFeedbackDialog((current) => current ? { ...current, comment: event.target.value } : current)}
              placeholder="可以补充具体问题（可选）"
              className="mt-4 min-h-24 w-full rounded-xl border border-[var(--color-border)] p-3 text-[13px] outline-none focus:border-[var(--color-primary)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setFeedbackDialog(null)}>取消</Button>
              <Button
                type="button"
                loading={feedbackSubmitting}
                onClick={() => void submitFeedback(feedbackDialog.messageId, feedbackDialog)}
              >提交反馈</Button>
            </div>
          </div>
        </div>
      )}
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
          if (isDevelopmentExecutionAction(pendingAction.action)) {
            void openDevelopmentExecutionDialog(pendingAction.action, pendingAction.actionKey)
          } else {
            void executeAction(pendingAction.action, pendingAction.actionKey)
          }
        }}
      />
      {developmentExecutionDialog && (
        <DevelopmentExecutionDialog
          open
          workItem={developmentExecutionDialog.workItem}
          initialInputText={developmentExecutionDialog.initialInputText}
          triggerSource="HERMES"
          onClose={() => setDevelopmentExecutionDialog(null)}
          onCreated={() => void completeDevelopmentExecutionAction()}
        />
      )}
    </div>
  )
}
