/**
 * 多人聊天室页面。
 * 业务意图：把房间管理、实时消息和 @Hermes 协作聚合到公众端的一个工作台入口。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChevronDown, Circle, RefreshCcw, UserPlus, Users } from 'lucide-react'
import {
  getChatRoomDetail,
  listChatRooms,
  openChatSocket,
  sendChatMessage,
  updateChatRoomMembers,
} from '@/src/api/chat'
import { listUserOptions, type UserOptionItem } from '@/src/api/users'
import { ChatComposer } from '@/src/components/chat/ChatComposer'
import { ChatMessageList } from '@/src/components/chat/ChatMessageList'
import { ChatRoomDialog } from '@/src/components/chat/ChatRoomDialog'
import { ChatRoomList } from '@/src/components/chat/ChatRoomList'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { useAuthStore } from '@/src/stores/auth'
import type { ChatMessageItem, ChatRoomItem, ChatSocketEvent } from '@/src/types/chat'
import { appendChatStreamDelta, mergeChatMessage, parseChatSocketEvent, shouldCollapseChatSummary } from '@/src/lib/chatUtils'
import { cn, getErrorMessage, getInitials } from '@/src/lib/utils'

type RoomFilter = 'all' | 'project' | 'global'
type SocketState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

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
  const socketRef = useRef<WebSocket | null>(null)

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId],
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

  const handleSocketEvent = useCallback((event: ChatSocketEvent) => {
    if (event.type === 'ROOM_MESSAGE_CREATED' && 'message' in event) {
      setMessages((current) => mergeChatMessage(current, event.message as ChatMessageItem))
    } else if (event.type === 'HERMES_STREAM_DELTA' && 'messageId' in event && 'delta' in event) {
      setMessages((current) => appendChatStreamDelta(current, Number(event.messageId), String(event.delta || '')))
    } else if ((event.type === 'HERMES_MESSAGE_DONE' || event.type === 'HERMES_MESSAGE_ERROR') && 'message' in event) {
      setMessages((current) => mergeChatMessage(current, event.message as ChatMessageItem))
    } else if (event.type === 'ROOM_UPDATED' && 'room' in event) {
      setRooms((current) => mergeRoom(current, event.room as ChatRoomItem))
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

  const handleRoomCreated = (room: ChatRoomItem) => {
    setRooms((current) => mergeRoom(current, room))
    setSelectedRoomId(room.id)
    setDialogOpen(false)
  }

  const canInviteRoomMembers = !!selectedRoom && !!currentUser && (
    selectedRoom.creatorUserId === currentUser.id ||
    selectedRoom.members.some((member) => member.userId === currentUser.id)
  )

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
      />

      <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] lg:min-h-0">
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
            />
            <ChatComposer
              disabled={!selectedRoom}
              sending={sending}
              members={selectedRoom.members}
              onSend={handleSend}
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
        canManageMembers={canInviteRoomMembers}
        onManageMembers={() => setMemberEditorOpen(true)}
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
  canManageMembers,
  onManageMembers,
}: {
  room: ChatRoomItem | null
  canManageMembers: boolean
  onManageMembers: () => void
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
