import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElNotification } from 'element-plus'
import { markAllNotificationsRead, markNotificationRead, pageNotifications, getUnreadNotificationCount } from '@/api/notifications'
import type { NotificationItem, NotificationRealtimeEvent } from '@/types/platform'
import { AUTH_TOKEN_KEY } from '@/constants/auth'

const resolveWsBaseUrl = () => {
  // WebSocket 地址与 HTTP 接口保持同一套直连规则，确保始终连到真实后端端口。
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl && configuredBaseUrl.trim() !== '') {
    if (configuredBaseUrl.startsWith('https://')) return configuredBaseUrl.replace(/^https:\/\//, 'wss://')
    if (configuredBaseUrl.startsWith('http://')) return configuredBaseUrl.replace(/^http:\/\//, 'ws://')
    return `ws://${configuredBaseUrl}`
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const backendPort = import.meta.env.VITE_API_PORT?.trim() || '8080'
    return `${protocol}//${window.location.hostname}:${backendPort}`
  }
  return 'ws://localhost:8080'
}

export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<NotificationItem[]>([])
  const unreadCount = ref(0)
  const drawerVisible = ref(false)
  const loading = ref(false)
  const unreadOnly = ref(false)
  const page = ref(1)
  const size = ref(20)
  const total = ref(0)
  const connected = ref(false)

  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null

  const displayItems = computed(() => items.value)

  const loadUnreadCount = async () => {
    const data = await getUnreadNotificationCount()
    unreadCount.value = data.unreadCount
  }

  const loadNotifications = async (append = false) => {
    loading.value = true
    try {
      const data = await pageNotifications({
        page: page.value,
        size: size.value,
        unreadOnly: unreadOnly.value || undefined
      })
      items.value = append ? [...items.value, ...data.records.filter((record) => !items.value.some((item) => item.id === record.id))] : data.records
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  const bootstrap = async () => {
    await Promise.all([loadUnreadCount(), loadNotifications()])
    connect()
  }

  const openDrawer = async () => {
    drawerVisible.value = true
    page.value = 1
    await loadNotifications()
  }

  const toggleUnreadOnly = async (value: boolean) => {
    unreadOnly.value = value
    page.value = 1
    await loadNotifications()
  }

  const markRead = async (id: number) => {
    const index = items.value.findIndex((item) => item.id === id)
    const current = index >= 0 ? items.value[index] : null
    if (current?.read) {
      return current
    }
    const updated = await markNotificationRead(id)
    if (index >= 0) {
      items.value[index] = updated
    }
    unreadCount.value = Math.max(unreadCount.value - 1, 0)
    return updated
  }

  const markAllRead = async () => {
    await markAllNotificationsRead()
    unreadCount.value = 0
    items.value = items.value.map((item) => ({ ...item, read: true, readAt: item.readAt || new Date().toISOString() }))
  }

  const connect = () => {
    if (socket || !localStorage.getItem(AUTH_TOKEN_KEY)) {
      return
    }
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) return
    socket = new WebSocket(`${resolveWsBaseUrl()}/ws/notifications?token=${encodeURIComponent(token)}`)
    socket.onopen = () => {
      connected.value = true
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }
    socket.onclose = () => {
      connected.value = false
      socket = null
      scheduleReconnect()
    }
    socket.onerror = () => {
      connected.value = false
    }
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as NotificationRealtimeEvent
        if (payload.eventType !== 'NEW_NOTIFICATION' || !payload.notification) {
          return
        }
        items.value = [payload.notification, ...items.value.filter((item) => item.id !== payload.notification.id)].slice(0, 50)
        unreadCount.value = payload.unreadCount
        total.value += 1
        const actionUrl = payload.notification.actionUrl
        ElNotification({
          title: payload.notification.title,
          message: payload.notification.content,
          position: 'bottom-right',
          duration: 5000,
          onClick: () => {
            if (!actionUrl || typeof window === 'undefined') {
              return
            }
            window.location.assign(actionUrl)
          }
        })
      } catch {
        // ignore malformed push events
      }
    }
  }

  const scheduleReconnect = () => {
    if (reconnectTimer !== null) return
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 3000)
  }

  const disconnect = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (socket) {
      socket.close()
      socket = null
    }
    connected.value = false
  }

  return {
    items: displayItems,
    unreadCount,
    drawerVisible,
    loading,
    unreadOnly,
    page,
    size,
    total,
    connected,
    bootstrap,
    openDrawer,
    toggleUnreadOnly,
    loadNotifications,
    loadUnreadCount,
    markRead,
    markAllRead,
    connect,
    disconnect
  }
})
