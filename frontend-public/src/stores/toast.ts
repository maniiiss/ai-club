/**
 * 轻量 Toast 队列状态管理。
 * 公众端此前没有全局提示组件，这里用 Zustand 实现一个命令式可调用的 Toast 队列，
 * 便于在非组件代码（如 WebSocket 回调）中通过 useToastStore.getState().addToast() 触发提示。
 */
import { create } from 'zustand'

/** Toast 的视觉类型，决定配色。 */
export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

/** 单条 Toast 数据。 */
export interface ToastItem {
  /** 唯一标识 */
  id: string
  /** 标题 */
  title: string
  /** 详情文案 */
  message?: string
  /** 视觉类型，默认 info */
  tone?: ToastTone
  /** 自动消失时长（毫秒），0 表示不自动消失，默认 5000 */
  duration?: number
  /** 点击回调（如跳转到消息目标页） */
  onClick?: () => void
}

interface ToastState {
  toasts: ToastItem[]
  /** 新增一条 Toast，返回其 id。 */
  addToast: (toast: Omit<ToastItem, 'id'> & { id?: string }) => string
  /** 移除指定 Toast。 */
  removeToast: (id: string) => void
}

let toastSeq = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: ({ id, title, message, tone = 'info', duration = 5000, onClick }) => {
    const toastId = id || `toast-${Date.now()}-${++toastSeq}`
    set((state) => ({ toasts: [...state.toasts, { id: toastId, title, message, tone, duration, onClick }] }))
    // duration 为 0 时由调用方自行移除（常驻提示）。
    if (duration && duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== toastId) }))
      }, duration)
    }
    return toastId
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
