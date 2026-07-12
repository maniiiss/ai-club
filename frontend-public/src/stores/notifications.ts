/**
 * 公众端消息中心状态。
 * 业务意图：把顶栏未读数、消息页面列表和实时推送放到同一个生命周期中，避免多处重复连接后端。
 */
import { create } from 'zustand'
import { getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead, pageNotifications } from '@/src/api/notifications'
import { AUTH_TOKEN_KEY, resolvedApiBaseUrl } from '@/src/api/http'
import { buildNotificationQuery, mergeNotificationItems } from '@/src/lib/notificationUtils'
import type { NotificationItem, NotificationRealtimeEvent, NotificationToast } from '@/src/types/notifications'
import { getErrorMessage } from '@/src/lib/utils'

interface NotificationState {
  items: NotificationItem[]
  unreadCount: number
  loading: boolean
  error: string | null
  unreadOnly: boolean
  page: number
  size: number
  total: number
  connected: boolean
  toast: NotificationToast | null
  bootstrap: () => Promise<void>
  loadNotifications: (append?: boolean) => Promise<void>
  loadNextPage: () => Promise<void>
  toggleUnreadOnly: (unreadOnly: boolean) => Promise<void>
  markRead: (id: number) => Promise<NotificationItem | null>
  markAllRead: () => Promise<void>
  connect: () => void
  disconnect: () => void
  clearToast: () => void
}

let socket: WebSocket | null = null
let reconnectTimer: number | null = null
let allowReconnect = false
let notificationRequestSequence = 0

const resolveWsBaseUrl = (): string => {
  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').trim() || resolvedApiBaseUrl
  if (configuredBaseUrl.startsWith('https://')) return configuredBaseUrl.replace(/^https:\/\//, 'wss://')
  if (configuredBaseUrl.startsWith('http://')) return configuredBaseUrl.replace(/^http:\/\//, 'ws://')
  return `ws://${configuredBaseUrl}`
}

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

const scheduleReconnect = (connect: () => void) => {
  if (!allowReconnect || reconnectTimer !== null || !localStorage.getItem(AUTH_TOKEN_KEY)) return
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 3000)
}

export const useNotificationStore = create<NotificationState>((set, get) => {
  const loadUnreadCount = async () => {
    try {
      const data = await getUnreadNotificationCount()
      set({ unreadCount: data.unreadCount })
    } catch {
      // 未读数加载失败不阻塞消息页面，下一次进入布局时会再次刷新。
    }
  }

  const loadNotifications = async (append = false) => {
    const state = get()
    const requestId = ++notificationRequestSequence
    set({ loading: true, error: null })
    try {
      const data = await pageNotifications({
        ...buildNotificationQuery(state.page, state.size, state.unreadOnly),
      })
      if (requestId !== notificationRequestSequence) return
      set((current) => ({
        items: append ? mergeNotificationItems(current.items, data.records, 'append') : data.records,
        total: data.total,
        loading: false,
        error: null,
      }))
    } catch (error) {
      if (requestId === notificationRequestSequence) {
        set({ loading: false, error: getErrorMessage(error) })
      }
      throw error
    }
  }

  const connect = () => {
    allowReconnect = true
    if (socket || !localStorage.getItem(AUTH_TOKEN_KEY)) return
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) return

    const currentSocket = new WebSocket(`${resolveWsBaseUrl()}/ws/notifications?token=${encodeURIComponent(token)}`)
    socket = currentSocket
    currentSocket.onopen = () => set({ connected: true })
    currentSocket.onerror = () => set({ connected: false })
    currentSocket.onclose = () => {
      if (socket === currentSocket) socket = null
      set({ connected: false })
      scheduleReconnect(connect)
    }
    currentSocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as NotificationRealtimeEvent
        if (payload.eventType !== 'NEW_NOTIFICATION' || !payload.notification) return
        set((current) => {
          const exists = current.items.some((item) => item.id === payload.notification.id)
          return {
            items: mergeNotificationItems(current.items, [payload.notification], 'prepend').slice(0, 50),
            unreadCount: payload.unreadCount,
            total: exists ? current.total : current.total + 1,
            toast: payload.notification,
          }
        })
      } catch {
        // 忽略格式异常的推送，避免破坏当前页面连接。
      }
    }
  }

  const disconnect = () => {
    allowReconnect = false
    clearReconnectTimer()
    if (socket) {
      socket.close()
      socket = null
    }
    set({ connected: false, toast: null })
  }

  return {
    items: [],
    unreadCount: 0,
    loading: false,
    error: null,
    unreadOnly: false,
    page: 1,
    size: 20,
    total: 0,
    connected: false,
    toast: null,
    bootstrap: async () => {
      await Promise.allSettled([loadUnreadCount(), loadNotifications()])
    },
    loadNotifications,
    loadNextPage: async () => {
      const state = get()
      if (state.loading || state.items.length >= state.total) return
      set({ page: state.page + 1 })
      await loadNotifications(true)
    },
    toggleUnreadOnly: async (unreadOnly) => {
      set({ unreadOnly, page: 1 })
      await loadNotifications()
    },
    markRead: async (id) => {
      const current = get().items.find((item) => item.id === id)
      if (!current || current.read) return current || null
      const updated = await markNotificationRead(id)
      set((state) => ({
        items: state.unreadOnly
          ? state.items.filter((item) => item.id !== id)
          : state.items.map((item) => (item.id === id ? updated : item)),
        unreadCount: Math.max(state.unreadCount - 1, 0),
      }))
      return updated
    },
    markAllRead: async () => {
      await markAllNotificationsRead()
      set((state) => ({
        unreadCount: 0,
        items: state.items.map((item) => ({ ...item, read: true, readAt: item.readAt || new Date().toISOString() })),
      }))
    },
    connect,
    disconnect,
    clearToast: () => set({ toast: null }),
  }
})
