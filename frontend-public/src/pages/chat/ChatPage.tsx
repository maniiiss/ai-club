/**
 * 多人聊天室页面。
 * 业务意图：把房间管理、实时消息和 @Hermes 协作聚合到公众端的一个工作台入口。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChevronDown, Circle, RefreshCcw, Settings2, UserPlus, Users, Zap } from 'lucide-react'
import {
  getChatRoomDetail,
  getChatRoomAgentConfig,
  listChatRoomAgentTasks,
  listChatRoomAgentTools,
  listChatRooms,
  markChatRoomAgentActionExecuted,
  openChatSocket,
  sendChatMessage,
  selectChatRoomAgentCandidate,
  updateChatRoomAgentConfig,
  updateChatRoomAgentTools,
  updateChatRoomMembers,
  cancelChatRoomAgentAction,
} from '@/src/api/chat'
import { listUserOptions, type UserOptionItem } from '@/src/api/users'
import { ChatComposer } from '@/src/components/chat/ChatComposer'
import { ChatMessageList } from '@/src/components/chat/ChatMessageList'
import { ChatRoomDialog } from '@/src/components/chat/ChatRoomDialog'
import { ChatRoomList } from '@/src/components/chat/ChatRoomList'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { useAuthStore } from '@/src/stores/auth'
import { useGuide } from '@/src/components/guide'
import type { ChatMessageItem, ChatRoomAgentConfig, ChatRoomAgentTask, ChatRoomAgentToolPolicy, ChatRoomItem, ChatSocketEvent } from '@/src/types/chat'
import type { HermesActionItem, HermesSelectionCardItem, HermesSelectionPayload } from '@/src/types/hermes'
import {
  appendChatStreamDelta,
  markAgentActionStatusInMessage,
  mergeAgentActionsIntoMessage,
  mergeAgentSelectionCardsIntoMessage,
  mergeChatMessage,
  parseChatSocketEvent,
  shouldCollapseChatSummary,
} from '@/src/lib/chatUtils'
import { executeHermesAction, getHermesActionErrorMessage } from '@/src/lib/hermesActionExecutor'
import { computeHermesActionKey } from '@/src/lib/hermesUtils'
import { cn, getErrorMessage, getInitials } from '@/src/lib/utils'

type RoomFilter = 'all' | 'project' | 'global'
type SocketState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
const TASK_STATUS_OPTIONS = ['SUCCESS', 'FAILED', 'CANCELED', 'RUNNING', 'WAITING_CONFIRMATION']
const AGENT_TASK_STATUS_LABELS: Record<string, string> = {
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELED: '已取消',
  RUNNING: '运行中',
  WAITING_CONFIRMATION: '待确认',
  DONE: '已完成',
  ERROR: '异常',
  PENDING: '待处理',
  CREATED: '已创建',
  EXECUTED: '已执行',
}
const TOOL_RISK_LEVEL_LABELS: Record<string, string> = {
  NONE: '无风险',
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
  CRITICAL: '关键风险',
}

export const ChatPage = () => {
  const currentUser = useAuthStore((state) => state.user)
  const [rooms, setRooms] = useState<ChatRoomItem[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [roomKeyword, setRoomKeyword] = useState('')
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all')
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [socketState, setSocketState] = useState<SocketState>('idle')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [memberEditorOpen, setMemberEditorOpen] = useState(false)
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [agentConfig, setAgentConfig] = useState<ChatRoomAgentConfig | null>(null)
  const [agentTools, setAgentTools] = useState<ChatRoomAgentToolPolicy[]>([])
  const [agentTasks, setAgentTasks] = useState<ChatRoomAgentTask[]>([])
  const [resolvingActionKey, setResolvingActionKey] = useState('')
  const [resolvingSelectionKey, setResolvingSelectionKey] = useState('')
  const socketRef = useRef<WebSocket | null>(null)
  const { isCompleted: guideCompleted, startGuide } = useGuide('chat')
  const authUser = useAuthStore((s) => s.user)

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId],
  )
  const canManageAgent = !!selectedRoom && !!currentUser && selectedRoom.creatorUserId === currentUser.id
  const canInviteRoomMembers = !!selectedRoom && !!currentUser && (
    selectedRoom.creatorUserId === currentUser.id ||
    selectedRoom.members.some((member) => member.userId === currentUser.id)
  )

  const filteredRooms = useMemo(() => {
    const keyword = roomKeyword.trim().toLowerCase()
    return rooms.filter((room) => {
      const matchesFilter =
        roomFilter === 'all' ||
        (roomFilter === 'project' && room.visibilityType === 'PROJECT') ||
        (roomFilter === 'global' && room.visibilityType !== 'PROJECT')
      if (!matchesFilter) return false
      if (!keyword) return true
      return [room.title, room.projectName, room.latestPreview].some((value) => (value || '').toLowerCase().includes(keyword))
    })
  }, [rooms, roomFilter, roomKeyword])

  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true)
    setError(null)
    try {
      const result = await listChatRooms()
      setRooms(result)
      setSelectedRoomId((current) => current || result[0]?.id || null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoadingRooms(false)
    }
  }, [])

  useEffect(() => {
    refreshRooms()
  }, [refreshRooms])

  useEffect(() => {
    if (!guideCompleted && authUser && !loadingRooms && !error) {
      const timer = setTimeout(() => startGuide(), 500)
      return () => clearTimeout(timer)
    }
  }, [guideCompleted, authUser, loadingRooms, error, startGuide])

  useEffect(() => {
    if (!selectedRoomId) {
      setMessages([])
      return
    }
    let alive = true
    setLoadingMessages(true)
    setError(null)
    getChatRoomDetail(selectedRoomId)
      .then((detail) => {
        if (!alive) return
        setRooms((current) => mergeRoom(current, detail.room))
        setMessages(detail.messages)
      })
      .catch((err) => {
        if (alive) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (alive) setLoadingMessages(false)
      })
    return () => {
      alive = false
    }
  }, [selectedRoomId])

  useEffect(() => {
    if (!selectedRoomId || !canManageAgent) {
      setAgentConfig(null)
      setAgentTools([])
      setAgentTasks([])
      return
    }
    let alive = true
    Promise.all([
      getChatRoomAgentConfig(selectedRoomId),
      listChatRoomAgentTools(selectedRoomId),
      listChatRoomAgentTasks(selectedRoomId),
    ])
      .then(([config, tools, tasks]) => {
        if (!alive) return
        setAgentConfig(config)
        setAgentTools(tools)
        setAgentTasks(tasks)
      })
      .catch((err) => {
        if (alive) setError(getErrorMessage(err))
      })
    return () => {
      alive = false
    }
  }, [canManageAgent, selectedRoomId])

  const handleSocketEvent = useCallback((event: ChatSocketEvent) => {
    if (event.type === 'ROOM_MESSAGE_CREATED' && 'message' in event) {
      setMessages((current) => mergeChatMessage(current, event.message as ChatMessageItem))
    } else if (event.type === 'HERMES_STREAM_DELTA' && 'messageId' in event && 'delta' in event) {
      setMessages((current) => appendChatStreamDelta(current, Number(event.messageId), String(event.delta || '')))
    } else if ((event.type === 'HERMES_MESSAGE_DONE' || event.type === 'HERMES_MESSAGE_ERROR') && 'message' in event) {
      setMessages((current) => mergeChatMessage(current, event.message as ChatMessageItem))
    } else if (event.type === 'ROOM_UPDATED' && 'room' in event) {
      setRooms((current) => mergeRoom(current, event.room as ChatRoomItem))
    } else if (event.type === 'AGENT_CONFIG_UPDATED' && 'config' in event) {
      setAgentConfig(event.config as ChatRoomAgentConfig)
    } else if (event.type === 'AGENT_TOOLS_UPDATED' && 'tools' in event) {
      setAgentTools(event.tools as ChatRoomAgentToolPolicy[])
    } else if ((event.type === 'AGENT_TASK_CREATED' || event.type === 'AGENT_TASK_UPDATED') && 'task' in event) {
      const task = event.task as ChatRoomAgentTask
      setAgentTasks((current) => mergeAgentTask(current, task))
      setMessages((current) => mergeAgentTaskIntoMessages(current, task))
    } else if (event.type === 'AGENT_ACTION_PENDING') {
      const actions = Array.isArray(event.actions) ? event.actions as HermesActionItem[] : []
      setMessages((current) => mergeAgentActionsIntoMessage(current, toNullableNumber(event.messageId), toNullableNumber(event.taskId), actions))
    } else if (event.type === 'AGENT_SELECTION_PENDING') {
      const selectionCards = Array.isArray(event.selectionCards) ? event.selectionCards as HermesSelectionCardItem[] : []
      setMessages((current) => mergeAgentSelectionCardsIntoMessage(current, toNullableNumber(event.messageId), toNullableNumber(event.taskId), selectionCards))
    } else if (event.type === 'AGENT_ACTION_EXECUTED') {
      setMessages((current) => markAgentActionStatusInMessage(
        current,
        toNullableNumber(event.messageId),
        toNullableNumber(event.taskId),
        typeof event.actionKey === 'string' ? event.actionKey : '',
        typeof event.status === 'string' ? event.status : 'executed',
      ))
    }
  }, [])

  useEffect(() => {
    if (!selectedRoomId) return
    const socket = openChatSocket()
    socketRef.current = socket
    setSocketState('connecting')

    socket.onopen = () => {
      setSocketState('connected')
      socket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: selectedRoomId }))
    }
    socket.onmessage = (messageEvent) => {
      const event = parseChatSocketEvent(String(messageEvent.data))
      if (event) handleSocketEvent(event)
    }
    socket.onerror = () => setSocketState('error')
    socket.onclose = () => {
      if (socketRef.current === socket) {
        setSocketState('disconnected')
        socketRef.current = null
      }
    }

    const pingTimer = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING' }))
      }
    }, 25000)

    return () => {
      window.clearInterval(pingTimer)
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'LEAVE_ROOM' }))
      }
      socket.close()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [selectedRoomId, handleSocketEvent])

  const handleSend = async (content: string, files: File[]) => {
    if (!selectedRoomId) return
    setSending(true)
    setError(null)
    try {
      const message = await sendChatMessage(selectedRoomId, { content }, files)
      setMessages((current) => mergeChatMessage(current, message))
      await refreshRooms()
      setSelectedRoomId(selectedRoomId)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const handleConfirmAgentAction = async (message: ChatMessageItem, action: HermesActionItem, index: number, actionKey: string) => {
    if (!selectedRoomId || !message.agentTaskId) return
    setResolvingActionKey(actionKey)
    setError(null)
    try {
      await executeHermesAction(action)
      await markChatRoomAgentActionExecuted(selectedRoomId, message.agentTaskId, { actionKey })
      setMessages((current) => markAgentActionStatusInMessage(current, message.id, message.agentTaskId, actionKey, 'executed'))
    } catch (err) {
      setError(getHermesActionErrorMessage(err))
    } finally {
      setResolvingActionKey('')
    }
  }

  const handleCancelAgentAction = async (message: ChatMessageItem, actionKey: string) => {
    if (!selectedRoomId || !message.agentTaskId) return
    setResolvingActionKey(actionKey)
    setError(null)
    try {
      await cancelChatRoomAgentAction(selectedRoomId, message.agentTaskId, { actionKey })
      setMessages((current) => markAgentActionStatusInMessage(current, message.id, message.agentTaskId, actionKey, 'canceled'))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setResolvingActionKey('')
    }
  }

  const handleSelectAgentCandidate = async (message: ChatMessageItem, selection: HermesSelectionPayload) => {
    if (!selectedRoomId || !message.agentTaskId) return
    const selectionKey = `${message.agentTaskId}:${selection.slot}:${selection.entityType}:${selection.entityId}`
    setResolvingSelectionKey(selectionKey)
    setError(null)
    try {
      const task = await selectChatRoomAgentCandidate(selectedRoomId, message.agentTaskId, selection)
      setAgentTasks((current) => mergeAgentTask(current, task))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setResolvingSelectionKey('')
    }
  }

  const handleRoomCreated = (room: ChatRoomItem) => {
    setRooms((current) => mergeRoom(current, room))
    setSelectedRoomId(room.id)
    setDialogOpen(false)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 animate-fadeIn lg:grid-cols-[320px_minmax(0,1fr)_280px]">
      <ChatRoomList
        rooms={filteredRooms}
        selectedRoomId={selectedRoomId}
        keyword={roomKeyword}
        filter={roomFilter}
        loading={loadingRooms}
        onKeywordChange={setRoomKeyword}
        onFilterChange={setRoomFilter}
        onSelectRoom={(room) => setSelectedRoomId(room.id)}
        onCreateRoom={() => setDialogOpen(true)}
        data-guide-id="chat-room-list"
      />

      <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] lg:min-h-0" data-guide-id="chat-message-area">
        <ChatHeader
          room={selectedRoom}
          socketState={socketState}
          error={error}
          onRefresh={refreshRooms}
        />
        {selectedRoom ? (
          <>
            <ChatMessageList
              messages={messages}
              currentUserId={currentUser?.id}
              loading={loadingMessages}
              onRetryHermes={() => handleSend('@hermes 请重试上一条问题，并基于当前房间上下文重新回复。', [])}
              resolvingActionKey={resolvingActionKey}
              resolvingSelectionKey={resolvingSelectionKey}
              computeActionKey={computeHermesActionKey}
              onConfirmAgentAction={handleConfirmAgentAction}
              onCancelAgentAction={handleCancelAgentAction}
              onSelectAgentCandidate={handleSelectAgentCandidate}
            />
            <ChatComposer
              disabled={!selectedRoom}
              sending={sending}
              members={selectedRoom.members}
              onSend={handleSend}
              data-guide-id="chat-input"
            />
          </>
        ) : loadingRooms ? (
          <LoadingSpinner fullscreen text="加载聊天室..." />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <Bot className="mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
            <p className="text-[16px] font-semibold text-[var(--color-text-primary)]">选择或创建一个聊天室</p>
            <Button className="mt-4" size="sm" onClick={() => setDialogOpen(true)}>
              创建聊天室
            </Button>
          </div>
        )}
      </section>

      <ChatContextPanel
        room={selectedRoom}
        agentConfig={agentConfig}
        agentTasks={agentTasks}
        canManageAgent={canManageAgent}
        canManageMembers={canInviteRoomMembers}
        onManageMembers={() => setMemberEditorOpen(true)}
        onManageAgent={() => setAgentDialogOpen(true)}
      />

      {dialogOpen && (
        <ChatRoomDialog
          onClose={() => setDialogOpen(false)}
          onCreated={handleRoomCreated}
        />
      )}
      {memberEditorOpen && selectedRoom && (
        <ChatMemberEditor
          room={selectedRoom}
          currentUserId={currentUser?.id ?? null}
          onClose={() => setMemberEditorOpen(false)}
          onSaved={(room) => {
            setRooms((current) => mergeRoom(current, room))
            setMemberEditorOpen(false)
          }}
        />
      )}
      {agentDialogOpen && canManageAgent && selectedRoom && agentConfig && (
        <ChatAgentSettingsDialog
          room={selectedRoom}
          config={agentConfig}
          tools={agentTools}
          currentUserId={currentUser?.id ?? null}
          onClose={() => setAgentDialogOpen(false)}
          onSaved={(nextConfig, nextTools) => {
            setAgentConfig(nextConfig)
            setAgentTools(nextTools)
            setAgentDialogOpen(false)
          }}
        />
      )}
    </div>
  )
}

const mergeRoom = (rooms: ChatRoomItem[], nextRoom: ChatRoomItem): ChatRoomItem[] => {
  const index = rooms.findIndex((room) => room.id === nextRoom.id)
  if (index < 0) return [nextRoom, ...rooms]
  const copy = rooms.slice()
  copy[index] = nextRoom
  return copy.sort((a, b) => String(b.lastMessageAt || b.updatedAt || '').localeCompare(String(a.lastMessageAt || a.updatedAt || '')))
}

const mergeAgentTask = (tasks: ChatRoomAgentTask[], nextTask: ChatRoomAgentTask): ChatRoomAgentTask[] => {
  const index = tasks.findIndex((task) => task.id === nextTask.id)
  const copy = index < 0 ? [nextTask, ...tasks] : tasks.slice()
  if (index >= 0) copy[index] = nextTask
  return copy.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 20)
}

const mergeAgentTaskIntoMessages = (messages: ChatMessageItem[], task: ChatRoomAgentTask): ChatMessageItem[] =>
  messages.map((message) => (
    task.assistantMessageId && message.id === task.assistantMessageId
      ? { ...message, agentTaskId: task.id, agentTaskStatus: task.status.toLowerCase() }
      : message
  ))

const toNullableNumber = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 业务意图：后端仍使用稳定英文枚举，前端右侧助手区域统一翻译为中文展示。 */
const formatAgentTaskStatus = (status: string): string => {
  const normalized = (status || '').trim().toUpperCase()
  return AGENT_TASK_STATUS_LABELS[normalized] || status || '-'
}

const formatToolRiskLevel = (riskLevel: string): string => {
  const normalized = (riskLevel || '').trim().toUpperCase()
  return TOOL_RISK_LEVEL_LABELS[normalized] || riskLevel || '-'
}

const ChatHeader = ({
  room,
  socketState,
  error,
  onRefresh,
}: {
  room: ChatRoomItem | null
  socketState: SocketState
  error: string | null
  onRefresh: () => void
}) => (
  <div className="border-b border-[var(--color-border-light)] px-4 py-3 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-[17px] font-bold text-[var(--color-text-primary)]">{room?.title || '聊天室'}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <Circle className={cn('h-2.5 w-2.5 fill-current', socketState === 'connected' ? 'text-emerald-500' : socketState === 'connecting' ? 'text-amber-500' : 'text-gray-400')} />
            {socketState === 'connected' ? '实时在线' : socketState === 'connecting' ? '连接中' : '未连接'}
          </span>
          {room?.projectName && <span>{room.projectName}</span>}
          {error && <span className="text-[var(--color-danger)]">{error}</span>}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={<RefreshCcw className="h-4 w-4" />}
        onClick={onRefresh}
      >
        刷新
      </Button>
    </div>
  </div>
)

const ChatContextPanel = ({
  room,
  agentConfig,
  agentTasks,
  canManageAgent,
  canManageMembers,
  onManageMembers,
  onManageAgent,
}: {
  room: ChatRoomItem | null
  agentConfig: ChatRoomAgentConfig | null
  agentTasks: ChatRoomAgentTask[]
  canManageAgent: boolean
  canManageMembers: boolean
  onManageMembers: () => void
  onManageAgent: () => void
}) => {
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  useEffect(() => {
    setSummaryExpanded(false)
  }, [room?.id])

  const summary = room?.historySummary?.trim() || 'Hermes 回复完成后会逐步沉淀房间摘要。'
  const summaryCollapsible = room ? shouldCollapseChatSummary(summary) : false

  return (
    <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] lg:flex">
      <div className="border-b border-[var(--color-border-light)] px-4 py-3">
        <h3 className="text-[14px] font-bold text-[var(--color-text-primary)]">上下文</h3>
      </div>
      {room ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-3">
            <p className="mb-1 text-[12px] font-semibold text-[var(--color-text-secondary)]">房间类型</p>
            <p className="text-[13px] text-[var(--color-text-primary)]">
              {room.visibilityType === 'PROJECT' ? `项目房间 · ${room.projectName || '-'}` : '全局邀请制房间'}
            </p>
          </div>
          {canManageAgent && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-amber-900">房间助手</p>
                  <p className="mt-0.5 truncate text-[12px] text-amber-700">
                    {agentConfig?.enabled ? `${agentConfig.displayName || 'Hermes'} 已启用` : 'Hermes 已关闭'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Settings2 className="h-3.5 w-3.5" />}
                  onClick={onManageAgent}
                  className="h-7 px-2 text-[11.5px]"
                >
                  设置
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <AgentFlag active={Boolean(agentConfig?.proactiveSummaryEnabled)} label="总结" />
                <AgentFlag active={Boolean(agentConfig?.keywordWatchEnabled)} label="监听" />
                <AgentFlag active={Boolean(agentConfig?.taskStatusCallbackEnabled)} label="回写" />
              </div>
              <div className="mt-3 space-y-1.5">
                {agentTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1.5 text-[11.5px]">
                    <span className="truncate text-[var(--color-text-secondary)]">{task.source || task.triggerType}</span>
                    <span className={cn('shrink-0 font-semibold', task.status === 'ERROR' ? 'text-red-600' : task.status === 'DONE' ? 'text-emerald-600' : 'text-amber-700')}>
                      {formatAgentTaskStatus(task.status)}
                    </span>
                  </div>
                ))}
                {agentTasks.length === 0 && (
                  <p className="text-[11.5px] text-amber-700">暂无助手任务。</p>
                )}
              </div>
            </div>
          )}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-[var(--color-text-secondary)]">
                成员 <span className="font-normal text-[var(--color-text-tertiary)]">{room.members.length}</span>
              </p>
              {canManageMembers && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<UserPlus className="h-3.5 w-3.5" />}
                  onClick={onManageMembers}
                  className="h-7 px-2 text-[11.5px]"
                >
                  添加成员
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {room.members.length === 0 ? (
                <p className="text-[12px] text-[var(--color-text-tertiary)]">
                  {room.visibilityType === 'PROJECT'
                    ? '项目参与人均可见。'
                    : canManageMembers ? '暂无成员信息，可点击右上角添加。' : '暂无成员信息'}
                </p>
              ) : room.members.map((member) => {
                const displayName = member.nickname || member.username
                const isCreator = member.userId === room.creatorUserId
                return (
                  <div key={member.userId} className="flex items-center gap-2">
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt={displayName} className="h-7 w-7 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-bg-hover)] text-[12px] font-semibold text-[var(--color-text-secondary)]">
                        {getInitials(displayName)}
                      </span>
                    )}
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-[12.5px] font-medium text-[var(--color-text-primary)]">{displayName}</p>
                      {isCreator && (
                        <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
                          群主
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-[var(--color-text-secondary)]">滚动摘要</p>
              {summaryCollapsible && (
                <button
                  type="button"
                  onClick={() => setSummaryExpanded((expanded) => !expanded)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                >
                  {summaryExpanded ? '收起' : '展开'}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', summaryExpanded && 'rotate-180')} />
                </button>
              )}
            </div>
            <p
              className={cn(
                'rounded-lg border border-[var(--color-border-light)] bg-white p-2.5 text-[12px] leading-5 text-[var(--color-text-tertiary)]',
                summaryCollapsible && !summaryExpanded && 'max-h-20 overflow-hidden',
                summaryExpanded && 'max-h-64 overflow-y-auto',
              )}
            >
              {summary}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-5 text-center text-[13px] text-[var(--color-text-tertiary)]">
          <Users className="mb-3 h-8 w-8" strokeWidth={1.5} />
          选择房间后查看成员与摘要。
        </div>
      )}
    </aside>
  )
}

const AgentFlag = ({ active, label }: { active: boolean; label: string }) => (
  <span className={cn(
    'rounded-md px-2 py-1 text-[11px] font-semibold',
    active ? 'bg-amber-200 text-amber-900' : 'bg-white/70 text-amber-600',
  )}>
    {label}
  </span>
)

const ChatMemberEditor = ({
  room,
  currentUserId,
  onClose,
  onSaved,
}: {
  room: ChatRoomItem
  currentUserId: number | null
  onClose: () => void
  onSaved: (room: ChatRoomItem) => void
}) => {
  const [users, setUsers] = useState<UserOptionItem[]>([])
  const isCreator = currentUserId !== null && room.creatorUserId === currentUserId
  const projectMemberIds = useMemo(
    () => new Set(room.visibilityType === 'PROJECT'
      ? room.members.filter((member) => member.role === 'PROJECT').map((member) => member.userId)
      : []),
    [room.members, room.visibilityType],
  )
  const [selectedIds, setSelectedIds] = useState<number[]>(
    room.members
      .filter((member) => !projectMemberIds.has(member.userId))
      .map((member) => member.userId),
  )
  const lockedUserIds = useMemo(
    () => new Set(room.members
      .filter((member) => member.role === 'PROJECT' || member.userId === room.creatorUserId || !isCreator)
      .map((member) => member.userId)),
    [isCreator, room.creatorUserId, room.members],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listUserOptions()
      .then((result) => setUsers(result.filter((user) => user.enabled)))
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  const toggleUser = (userId: number) => {
    if (lockedUserIds.has(userId)) return
    setSelectedIds((current) => (
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    ))
  }

  const saveMembers = async () => {
    setSaving(true)
    setError(null)
    try {
      const nextRoom = await updateChatRoomMembers(room.id, { memberUserIds: selectedIds })
      onSaved(nextRoom)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[84vh] w-full max-w-md flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)]">
        <div className="border-b border-[var(--color-border-light)] px-5 py-4">
          <h3 className="text-[17px] font-bold text-[var(--color-text-primary)]">邀请成员</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
          <div className="space-y-1">
            {users.map((user) => {
              const displayName = user.nickname || user.username
              const locked = lockedUserIds.has(user.id)
              const selected = projectMemberIds.has(user.id) || selectedIds.includes(user.id)
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleUser(user.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                    selected ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'hover:bg-[var(--color-bg-hover)]',
                    locked && 'cursor-default',
                  )}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[12px] font-semibold">
                    {getInitials(displayName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{displayName}</span>
                    <span className="block truncate text-[11px] text-[var(--color-text-tertiary)]">
                      {user.username}
                    </span>
                  </span>
                  <span className={cn('h-4 w-4 rounded border', selected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[var(--color-border-strong)] bg-white')} />
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border-light)] px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="button" loading={saving} onClick={saveMembers}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}

const ChatAgentSettingsDialog = ({
  room,
  config,
  tools,
  currentUserId,
  onClose,
  onSaved,
}: {
  room: ChatRoomItem
  config: ChatRoomAgentConfig
  tools: ChatRoomAgentToolPolicy[]
  currentUserId: number | null
  onClose: () => void
  onSaved: (config: ChatRoomAgentConfig, tools: ChatRoomAgentToolPolicy[]) => void
}) => {
  const isOwner = currentUserId !== null && room.creatorUserId === currentUserId
  const [enabled, setEnabled] = useState(config.enabled)
  const [displayName, setDisplayName] = useState(config.displayName || 'Hermes')
  const [systemInstruction, setSystemInstruction] = useState(config.systemInstruction || '')
  const [proactiveSummaryEnabled, setProactiveSummaryEnabled] = useState(config.proactiveSummaryEnabled)
  const [keywordWatchEnabled, setKeywordWatchEnabled] = useState(config.keywordWatchEnabled)
  const [taskStatusCallbackEnabled, setTaskStatusCallbackEnabled] = useState(config.taskStatusCallbackEnabled)
  const [proactiveSummaryMessageThreshold, setProactiveSummaryMessageThreshold] = useState(String(config.proactiveSummaryMessageThreshold || 20))
  const [proactiveSummaryMinIntervalMinutes, setProactiveSummaryMinIntervalMinutes] = useState(String(config.proactiveSummaryMinIntervalMinutes || 60))
  const [keywordWatchTermsText, setKeywordWatchTermsText] = useState((config.keywordWatchTerms || []).join('\n'))
  const [keywordWatchCooldownMinutes, setKeywordWatchCooldownMinutes] = useState(String(config.keywordWatchCooldownMinutes || 10))
  const [taskStatusCallbackStatuses, setTaskStatusCallbackStatuses] = useState<string[]>(
    config.taskStatusCallbackStatuses?.length ? config.taskStatusCallbackStatuses : ['SUCCESS', 'FAILED', 'CANCELED'],
  )
  const [toolDrafts, setToolDrafts] = useState(toToolDrafts(tools))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!isOwner) return
    setSaving(true)
    setError(null)
    try {
      const [nextConfig, nextTools] = await Promise.all([
        updateChatRoomAgentConfig(room.id, {
          enabled,
          displayName,
          systemInstruction,
          proactiveSummaryEnabled,
          keywordWatchEnabled,
          taskStatusCallbackEnabled,
          proactiveSummaryMessageThreshold: clampNumber(proactiveSummaryMessageThreshold, 1, 200, 20),
          proactiveSummaryMinIntervalMinutes: clampNumber(proactiveSummaryMinIntervalMinutes, 1, 1440, 60),
          keywordWatchTerms: parseTerms(keywordWatchTermsText),
          keywordWatchCooldownMinutes: clampNumber(keywordWatchCooldownMinutes, 0, 1440, 10),
          taskStatusCallbackStatuses,
        }),
        updateChatRoomAgentTools(room.id, {
          tools: toolDrafts.map((tool) => ({
            toolCode: tool.toolCode,
            enabled: tool.enabled,
            autoExecute: tool.autoExecute,
          })),
        }),
      ])
      onSaved(nextConfig, nextTools)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleTool = (toolCode: string, field: 'enabled' | 'autoExecute') => {
    setToolDrafts((current) => current.map((tool) => (
      tool.toolCode === toolCode
        ? { ...tool, [field]: field === 'autoExecute' && !tool.autoExecuteAllowed ? false : !tool[field] }
        : tool
    )))
  }

  const toggleStatus = (status: string) => {
    setTaskStatusCallbackStatuses((current) => (
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status]
    ))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)]">
        <div className="border-b border-[var(--color-border-light)] px-5 py-4">
          <h3 className="text-[17px] font-bold text-[var(--color-text-primary)]">房间助手设置</h3>
          {!isOwner && <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">只有房主可以修改授权。</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <label className="flex items-center justify-between rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-primary)]">
              启用 Hermes 助手
              <input type="checkbox" checked={enabled} disabled={!isOwner} onChange={(event) => setEnabled(event.target.checked)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">
              展示名称
              <input
                value={displayName}
                disabled={!isOwner}
                onChange={(event) => setDisplayName(event.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border-strong)] px-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
              />
            </label>
          </div>
          <label className="mt-4 flex flex-col gap-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">
            房间系统指令
            <textarea
              value={systemInstruction}
              disabled={!isOwner}
              onChange={(event) => setSystemInstruction(event.target.value)}
              rows={4}
              className="resize-y rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-[13px] leading-5 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
              placeholder="例如：回复时优先给出结论、风险和下一步。"
            />
          </label>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <AgentToggle label="定时总结" checked={proactiveSummaryEnabled} disabled={!isOwner} onChange={setProactiveSummaryEnabled} />
            <AgentToggle label="关键字监听" checked={keywordWatchEnabled} disabled={!isOwner} onChange={setKeywordWatchEnabled} />
            <AgentToggle label="任务状态回写" checked={taskStatusCallbackEnabled} disabled={!isOwner} onChange={setTaskStatusCallbackEnabled} />
          </div>
          <div className="mt-4 grid gap-3 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] p-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              总结消息阈值
              <input
                type="number"
                min={1}
                max={200}
                value={proactiveSummaryMessageThreshold}
                disabled={!isOwner || !proactiveSummaryEnabled}
                onChange={(event) => setProactiveSummaryMessageThreshold(event.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border-strong)] px-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] disabled:bg-white/60"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              总结最小间隔（分钟）
              <input
                type="number"
                min={1}
                max={1440}
                value={proactiveSummaryMinIntervalMinutes}
                disabled={!isOwner || !proactiveSummaryEnabled}
                onChange={(event) => setProactiveSummaryMinIntervalMinutes(event.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border-strong)] px-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] disabled:bg-white/60"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)] md:col-span-2">
              监听关键词
              <textarea
                value={keywordWatchTermsText}
                disabled={!isOwner || !keywordWatchEnabled}
                onChange={(event) => setKeywordWatchTermsText(event.target.value)}
                rows={3}
                className="resize-y rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-[13px] leading-5 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] disabled:bg-white/60"
                placeholder="每行一个关键词，例如：阻塞、失败、紧急"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              关键词冷却（分钟）
              <input
                type="number"
                min={0}
                max={1440}
                value={keywordWatchCooldownMinutes}
                disabled={!isOwner || !keywordWatchEnabled}
                onChange={(event) => setKeywordWatchCooldownMinutes(event.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border-strong)] px-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] disabled:bg-white/60"
              />
            </label>
            <div className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              回写状态
              <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-white px-2 py-1.5">
                {TASK_STATUS_OPTIONS.map((status) => (
                  <label key={status} className={cn('inline-flex items-center gap-1.5 text-[11.5px]', (!isOwner || !taskStatusCallbackEnabled) && 'opacity-50')}>
                    <input
                      type="checkbox"
                      checked={taskStatusCallbackStatuses.includes(status)}
                      disabled={!isOwner || !taskStatusCallbackEnabled}
                      onChange={() => toggleStatus(status)}
                    />
                    {formatAgentTaskStatus(status)}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600" />
              <p className="text-[13px] font-bold text-[var(--color-text-primary)]">工具授权</p>
            </div>
            <div className="grid gap-2">
              {toolDrafts.map((tool) => (
                <div key={tool.toolCode} className="rounded-lg border border-[var(--color-border-light)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{tool.toolName}</p>
                      <p className="text-[11.5px] text-[var(--color-text-tertiary)]">{tool.toolCode} · {tool.readOnly ? '只读' : formatToolRiskLevel(tool.riskLevel)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-[var(--color-text-secondary)]">
                      <label className="inline-flex items-center gap-1.5">
                        <input type="checkbox" checked={tool.enabled} disabled={!isOwner} onChange={() => toggleTool(tool.toolCode, 'enabled')} />
                        启用
                      </label>
                      <label className={cn('inline-flex items-center gap-1.5', !tool.autoExecuteAllowed && 'opacity-40')}>
                        <input type="checkbox" checked={tool.autoExecute} disabled={!isOwner || !tool.autoExecuteAllowed} onChange={() => toggleTool(tool.toolCode, 'autoExecute')} />
                        自动
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border-light)] px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="button" loading={saving} disabled={!isOwner} onClick={save}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}

const AgentToggle = ({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) => (
  <label className="flex items-center justify-between rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-3 py-2.5 text-[12.5px] font-semibold text-[var(--color-text-secondary)]">
    {label}
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
  </label>
)

const toToolDrafts = (tools: ChatRoomAgentToolPolicy[]) =>
  tools.map((tool) => ({
    ...tool,
    enabled: tool.enabled,
    autoExecute: tool.autoExecute && tool.autoExecuteAllowed,
  }))

const clampNumber = (value: string, min: number, max: number, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

const parseTerms = (value: string) =>
  Array.from(new Set(
    value
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )).slice(0, 50)
