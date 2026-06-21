/**
 * 右侧滑出抽屉组件
 * 基于 React Portal 渲染到 body，不受父容器 overflow 限制
 * 支持点击外部区域关闭
 */
import { type ReactNode, useRef, useCallback, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'

interface SlideDrawerProps {
  /** 是否打开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 抽屉标题 */
  title?: string
  /** 抽屉副标题/描述 */
  description?: string
  /** 抽屉内容 */
  children: ReactNode
  /** 底部操作栏 */
  footer?: ReactNode
  /** 最大宽度，默认 720px */
  maxWidth?: string
  /** 是否禁用点击外部关闭，默认 false */
  disableCloseOnOutsideClick?: boolean
  /** 头部右侧操作按钮区域，渲染在关闭按钮之前 */
  headerActions?: ReactNode
}

export const SlideDrawer = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = '720px',
  disableCloseOnOutsideClick = false,
  headerActions,
}: SlideDrawerProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldRender, setShouldRender] = useState(open)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setShouldRender(true)
      // 下一帧再移除关闭动画 class，确保打开动画正常播放
      requestAnimationFrame(() => setIsClosing(false))
    } else if (shouldRender) {
      // 触发关闭动画，300ms 后卸载 DOM
      setIsClosing(true)
      const timer = setTimeout(() => setShouldRender(false), 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disableCloseOnOutsideClick) return
      // 点击的是最外层容器（遮罩区域）则关闭
      if (e.target === containerRef.current) {
        onClose()
      }
    },
    [onClose, disableCloseOnOutsideClick]
  )

  if (!shouldRender) return null

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-50"
      onClick={handleContainerClick}
    >
      <div
        className={`absolute inset-y-0 right-0 flex flex-col w-full bg-white shadow-[var(--shadow-xl)] ${isClosing ? 'animate-slideRight' : 'animate-slideLeft'} overflow-hidden`}
        style={{ maxWidth }}
      >
        {/* 头部 */}
        {(title || description) && (
          <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
            <div>
              {title && (
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
                  {description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* 内容区域 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>

        {/* 底部操作栏 */}
        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border-light)] px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

/**
 * 标准抽屉底部操作栏（取消 + 保存按钮）
 * 简化常用场景的使用
 */
interface SlideDrawerFooterProps {
  /** 取消按钮文本，默认 "取消" */
  cancelText?: string
  /** 确认按钮文本，默认 "保存" */
  confirmText?: string
  /** 确认按钮加载状态 */
  loading?: boolean
  /** 点击取消 */
  onCancel: () => void
  /** 点击确认 */
  onConfirm: () => void
  /** 额外的前置按钮，如 "管理 Webhook" */
  extraButtons?: ReactNode
}

export const SlideDrawerFooter = ({
  cancelText = '取消',
  confirmText = '保存',
  loading = false,
  onCancel,
  onConfirm,
  extraButtons,
}: SlideDrawerFooterProps) => (
  <>
    {extraButtons}
    <Button variant="secondary" onClick={onCancel}>
      {cancelText}
    </Button>
    <Button onClick={onConfirm} loading={loading}>
      {confirmText}
    </Button>
  </>
)
