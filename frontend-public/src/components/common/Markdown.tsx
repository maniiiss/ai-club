/**
 * Markdown 渲染组件。
 * 使用 react-markdown + remark-gfm 渲染 GitHub 风格 Markdown。
 * 内置图片灯箱：点击图片可放大查看、滚轮缩放、拖拽平移。
 * 所有元素样式对齐设计系统 Token。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { resolveMarkdownContent } from '@/src/lib/markdownUtils'
import { cn } from '@/src/lib/utils'

interface MarkdownProps {
  /** Markdown 源文本。 */
  content: string
  /** 额外 CSS class。 */
  className?: string
  /** 渲染场景。助手回复使用更紧凑的阅读节奏，避免长报告挤占聊天时间线。 */
  variant?: 'default' | 'assistant'
  /** 是否归一化模型生成的 Markdown；已在上游处理或已验证的原文应关闭。 */
  normalize?: boolean
}

/* ── 灯箱状态 ── */

interface LightboxState {
  src: string
  alt: string
}

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const ZOOM_STEP = 0.25

/* ── 灯箱组件 ── */

const ImageLightbox = ({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) => {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const imgRef = useRef<HTMLImageElement>(null)

  /* 重置缩放和偏移 */
  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  /* 缩放（以视口中心为锚点） */
  const zoom = useCallback((delta: number) => {
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta))
      if (next === 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])

  /* 鼠标滚轮缩放 */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      zoom(delta)
    },
    [zoom],
  )

  /* 拖拽平移 */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return
      setDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [scale, offset],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      })
    },
    [dragging],
  )

  const handlePointerUp = useCallback(() => {
    setDragging(false)
  }, [])

  /* 键盘快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case '+':
        case '=':
          zoom(ZOOM_STEP)
          break
        case '-':
          zoom(-ZOOM_STEP)
          break
        case '0':
          resetView()
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, zoom, resetView])

  /* 阻止背景滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onWheel={handleWheel}
    >
      {/* 顶部工具栏 */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
        <span className="text-[13px] text-white/70 truncate max-w-[60%]">{alt || src}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoom(-ZOOM_STEP)}
            className="rounded-lg p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="缩小 (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[48px] text-center text-[12px] font-mono text-white/80 tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => zoom(ZOOM_STEP)}
            className="rounded-lg p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="放大 (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={resetView}
            className="rounded-lg p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="重置 (0)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-white/20" />
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="关闭 (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 图片 */}
      <div
        className={cn(
          'flex-1 flex items-center justify-center w-full overflow-hidden',
          scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-[90vw] max-h-[85vh] object-contain select-none transition-transform duration-150 ease-out"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        />
      </div>

      {/* 底部提示 */}
      <div className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-white/40">
        滚轮缩放 · 拖拽平移 · Esc 关闭
      </div>
    </div>,
    document.body,
  )
}

/* ── Markdown 组件 ── */

export const Markdown = ({ content, className, variant = 'default', normalize = true }: MarkdownProps) => {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const normalizedContent = resolveMarkdownContent(content, normalize)

  if (!normalizedContent) {
    return <p className="text-[var(--color-text-tertiary)] text-[14px]">（内容为空）</p>
  }

  return (
    <>
      <div className={cn('prose-markdown', variant === 'assistant' && 'prose-markdown--assistant', className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children, ...rest }) => (
              <div className="markdown-table-wrap">
                <table {...rest}>{children}</table>
              </div>
            ),
            img: ({ src, alt, ...rest }) =>
              src ? (
                <img
                  src={src}
                  alt={alt || ''}
                  {...rest}
                  className="cursor-zoom-in hover:opacity-90 transition-opacity"
                  onClick={() => setLightbox({ src, alt: alt || '' })}
                />
              ) : null,
          }}
        >
          {normalizedContent}
        </ReactMarkdown>
      </div>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
