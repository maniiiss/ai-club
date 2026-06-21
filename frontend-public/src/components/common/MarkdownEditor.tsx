/**
 * Markdown 编辑器组件。
 * 默认以预览态展示内容；双击内部进入编辑态；双击编辑器外部退出编辑态。
 * 编辑态默认纯编辑（无双栏），textarea 充满剩余空间。
 * 使用 react-markdown 渲染预览，样式完全对齐设计系统 Token。
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Quote,
  Link,
  Image,
  Code,
  List,
  ListOrdered,
  ListChecks,
  Table,
  Minus,
  Eye,
  Columns,
  PenLine,
  FileText,
  ChevronDown,
  Loader2,
  Pencil,
} from 'lucide-react'
import { cn } from '@/src/lib/utils'
import { useMarkdownShortcuts } from '@/src/hooks/useMarkdownShortcuts'
import type { MarkdownTemplate } from '@/src/lib/markdownTemplates'

/** 编辑器属性。 */
interface MarkdownEditorProps {
  /** 编辑器内容（受控值）。 */
  value: string
  /** 内容变化回调。 */
  onChange: (value: string) => void
  /** 空内容占位符。 */
  placeholder?: string
  /** 编辑器整体高度（px 数字 / CSS 字符串 / 'auto' 随父容器撑满），默认 400。 */
  height?: number | string
  /** 可选模板列表，显示在工具栏下拉菜单中。 */
  templates?: MarkdownTemplate[]
  /** 可选图片上传回调，返回图片 URL。 */
  uploadImage?: (file: File) => Promise<string>
  /** 是否默认进入编辑态（用于新建场景）。 */
  startInEditMode?: boolean
  /** 编辑态变化回调。 */
  onEditStateChange?: (editing: boolean) => void
  /** 额外 CSS class。 */
  className?: string
}

/**
 * Markdown 编辑器。
 * 预览态：仅展示渲染后的 Markdown 内容，双击进入编辑。
 * 编辑态：工具栏 → 编辑/预览双栏 → 状态栏，双击外部退出编辑。
 */
export const MarkdownEditor = ({
  value,
  onChange,
  placeholder = '输入 Markdown 内容…',
  height = 400,
  templates,
  uploadImage,
  startInEditMode = false,
  onEditStateChange,
  className,
}: MarkdownEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(startInEditMode)
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('edit')
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 })
  const [isMobile, setIsMobile] = useState(false)

  // 快捷键
  const { handleKeyDown } = useMarkdownShortcuts(textareaRef, onChange)

  // 响应式：移动端检测
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 进入编辑态
  const enterEditMode = useCallback(() => {
    if (editing) return
    setEditing(true)
    setViewMode('edit')
    onEditStateChange?.(true)
    // 进入后聚焦 textarea
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [editing, onEditStateChange])

  // 退出编辑态
  const exitEditMode = useCallback(() => {
    if (!editing) return
    setEditing(false)
    onEditStateChange?.(false)
  }, [editing, onEditStateChange])

  // 双击编辑器内部 → 进入编辑态
  const handleContainerDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!editing) {
        e.preventDefault()
        enterEditMode()
      }
    },
    [editing, enterEditMode],
  )

  // 双击编辑器外部 → 退出编辑态
  useEffect(() => {
    if (!editing) return
    const handleDocumentDoubleClick = (e: MouseEvent) => {
      const container = editorContainerRef.current
      if (!container) return
      // 检查双击目标是否在编辑器外部
      if (!container.contains(e.target as Node)) {
        exitEditMode()
      }
    }
    // 延迟添加监听，避免当前双击事件冒泡触发
    const timer = setTimeout(() => {
      document.addEventListener('dblclick', handleDocumentDoubleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('dblclick', handleDocumentDoubleClick)
    }
  }, [editing, exitEditMode])

  // 关闭模板菜单（点击外部）
  useEffect(() => {
    if (!templateMenuOpen) return
    const close = () => setTemplateMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [templateMenuOpen])

  // 光标位置追踪
  const updateCursorInfo = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const textBefore = ta.value.slice(0, pos)
    const lines = textBefore.split('\n')
    setCursorInfo({ line: lines.length, col: lines[lines.length - 1].length + 1 })
  }, [])

  // 字数统计
  const charCount = useMemo(() => value.length, [value])

  // ── 工具栏操作 ──

  /** 在 textarea 中包裹选区或插入文本。 */
  const wrapText = useCallback(
    (before: string, after: string, ph: string) => {
      const ta = textareaRef.current
      if (!ta) return
      const { selectionStart: s, selectionEnd: e } = ta
      const selected = value.slice(s, e) || ph
      const newVal = value.slice(0, s) + before + selected + after + value.slice(e)
      onChange(newVal)
      requestAnimationFrame(() => {
        ta.selectionStart = s + before.length
        ta.selectionEnd = s + before.length + selected.length
        ta.focus()
      })
    },
    [value, onChange],
  )

  /** 在当前行首插入前缀。 */
  const insertPrefix = useCallback(
    (prefix: string) => {
      const ta = textareaRef.current
      if (!ta) return
      const { selectionStart: s } = ta
      const lineStart = value.lastIndexOf('\n', s - 1) + 1
      const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart)
      onChange(newVal)
      requestAnimationFrame(() => {
        ta.selectionStart = s + prefix.length
        ta.selectionEnd = s + prefix.length
        ta.focus()
      })
    },
    [value, onChange],
  )

  /** 在光标处插入文本块。 */
  const insertBlock = useCallback(
    (block: string) => {
      const ta = textareaRef.current
      if (!ta) return
      const { selectionStart: s } = ta
      const needBefore = s > 0 && value[s - 1] !== '\n' ? '\n' : ''
      const newVal = value.slice(0, s) + needBefore + block + '\n' + value.slice(s)
      onChange(newVal)
      requestAnimationFrame(() => {
        const newPos = s + needBefore.length + block.length + 1
        ta.selectionStart = newPos
        ta.selectionEnd = newPos
        ta.focus()
      })
    },
    [value, onChange],
  )

  /** 插入模板。 */
  const insertTemplate = useCallback(
    (template: MarkdownTemplate) => {
      if (!value.trim()) {
        onChange(template.content)
      } else {
        insertBlock(template.content)
      }
      setTemplateMenuOpen(false)
    },
    [value, onChange, insertBlock],
  )

  // ── 图片处理 ──

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!uploadImage) return
      setUploading(true)
      try {
        const url = await uploadImage(file)
        const name = file.name.replace(/\.[^.]+$/, '')
        insertBlock(`![${name}](${url})`)
      } catch {
        // 上传失败静默处理
      } finally {
        setUploading(false)
      }
    },
    [uploadImage, insertBlock],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!uploadImage) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) handleImageFile(file)
          return
        }
      }
    },
    [uploadImage, handleImageFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!uploadImage) return
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
      if (imageFile) {
        e.preventDefault()
        e.stopPropagation()
        handleImageFile(imageFile)
      }
    },
    [uploadImage, handleImageFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (uploadImage) e.preventDefault()
  }, [uploadImage])

  // ── 工具栏按钮定义 ──

  const toolbarGroups = useMemo(
    () => [
      [
        { icon: Bold, title: '加粗 (Ctrl+B)', action: () => wrapText('**', '**', '粗体文本') },
        { icon: Italic, title: '斜体 (Ctrl+I)', action: () => wrapText('*', '*', '斜体文本') },
        { icon: Strikethrough, title: '删除线', action: () => wrapText('~~', '~~', '删除线文本') },
      ],
      [
        { icon: Heading1, title: '一级标题', action: () => insertPrefix('# ') },
        { icon: Heading2, title: '二级标题', action: () => insertPrefix('## ') },
        { icon: Quote, title: '引用', action: () => insertPrefix('> ') },
      ],
      [
        { icon: Link, title: '链接 (Ctrl+K)', action: () => wrapText('[', '](url)', '链接文本') },
        { icon: Image, title: '图片', action: () => wrapText('![', '](url)', '图片描述') },
        { icon: Code, title: '行内代码 (Ctrl+Shift+K)', action: () => wrapText('`', '`', 'code') },
      ],
      [
        { icon: List, title: '无序列表', action: () => insertPrefix('- ') },
        { icon: ListOrdered, title: '有序列表', action: () => insertPrefix('1. ') },
        { icon: ListChecks, title: '任务列表', action: () => insertPrefix('- [ ] ') },
      ],
      [
        {
          icon: Table,
          title: '表格',
          action: () =>
            insertBlock('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |'),
        },
        { icon: Minus, title: '分割线', action: () => insertBlock('---') },
      ],
    ],
    [wrapText, insertPrefix, insertBlock],
  )

  // ── 高度计算 ──

  const isAuto = height === 'auto'
  const resolvedHeight = typeof height === 'number' ? `${height}px` : (height === 'auto' ? undefined : height)

  if (!editing) {
    return (
      <div
        ref={editorContainerRef}
        onDoubleClick={handleContainerDoubleClick}
        className={cn(
          'relative rounded-lg border border-[var(--color-border-light)] bg-white overflow-hidden',
          'hover:border-[var(--color-border-strong)] transition-colors cursor-text group',
          isAuto && 'flex-1 min-h-0',
          className,
        )}
        style={resolvedHeight ? { minHeight: resolvedHeight } : undefined}
      >
        {/* 编辑提示角标 */}
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg-hover)] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]">
            <Pencil className="h-3 w-3" strokeWidth={1.75} />
            双击编辑
          </span>
        </div>

        <div className={cn('px-4 py-3', isAuto ? 'flex-1 min-h-0 overflow-y-auto' : 'overflow-y-auto')} style={!isAuto && resolvedHeight ? { maxHeight: resolvedHeight } : undefined}>
          {value.trim() ? (
            <div className="prose-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-[var(--color-text-tertiary)] text-[14px]">
              {placeholder}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── 编辑态渲染 ──

  return (
    <div
      ref={editorContainerRef}
      className={cn(
        'flex flex-col min-h-0 rounded-lg border border-[var(--color-border-strong)] bg-white overflow-hidden',
        isAuto && 'flex-1',
        'focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20',
        className,
      )}
      style={resolvedHeight ? { height: resolvedHeight } : undefined}
    >
      {/* ── 工具栏 ── */}
      <div className="flex-shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-[var(--color-border-light)] bg-[var(--color-bg-page)]">
        {/* 格式按钮（可横向滚动） */}
        <div className="flex items-center gap-0.5 overflow-x-auto min-w-0">
          {toolbarGroups.map((group, gi) => (
            <div key={gi} className="flex items-center shrink-0">
              {gi > 0 && <div className="w-px h-4 mx-1 bg-[var(--color-border-light)]" />}
              {group.map((btn, bi) => (
                <button
                  key={bi}
                  type="button"
                  title={btn.title}
                  onClick={(e) => {
                    e.preventDefault()
                    btn.action()
                  }}
                  className="rounded p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <btn.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 模板下拉菜单（不在 overflow 容器内） */}
        {templates && templates.length > 0 && (
          <div className="relative shrink-0 ml-auto flex items-center">
            <div className="w-px h-4 mx-1 bg-[var(--color-border-light)]" />
            <button
              type="button"
              title="插入模板"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setTemplateMenuOpen(!templateMenuOpen)
              }}
              className="flex items-center gap-1 rounded px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">模板</span>
              <ChevronDown className="h-3 w-3" strokeWidth={2} />
            </button>
            {templateMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)] py-1 animate-fadeIn">
                {templates.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      insertTemplate(tpl)
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 视图模式切换 */}
        <div className={cn('flex items-center shrink-0', templates && templates.length > 0 ? '' : 'ml-auto')}>
          <div className="w-px h-4 mx-1 bg-[var(--color-border-light)]" />
          {!isMobile && (
            <button
              type="button"
              title="分屏模式"
              onClick={() => setViewMode('split')}
              className={cn(
                'rounded p-1.5 transition-colors',
                viewMode === 'split'
                  ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              <Columns className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            title="编辑模式"
            onClick={() => setViewMode('edit')}
            className={cn(
              'rounded p-1.5 transition-colors',
              viewMode === 'edit'
                ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
            )}
          >
            <PenLine className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="预览模式"
            onClick={() => setViewMode('preview')}
            className={cn(
              'rounded p-1.5 transition-colors',
              viewMode === 'preview'
                ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
            )}
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── 内容区域 ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 编辑区 */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            className={cn(
              'flex-1 min-w-0 flex flex-col',
              viewMode === 'split' && 'border-r border-[var(--color-border-light)]',
            )}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                onChange(e.target.value)
                updateCursorInfo()
              }}
              onKeyUp={updateCursorInfo}
              onClick={updateCursorInfo}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              placeholder={placeholder}
              spellCheck={false}
              className={cn(
                'flex-1 w-full resize-none border-0 bg-transparent px-4 py-3',
                'text-[14px] font-mono leading-relaxed',
                'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]',
                'focus:outline-none focus:ring-0',
              )}
            />
          </div>
        )}

        {/* 预览区 */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="flex-1 min-w-0 overflow-y-auto px-4 py-3">
            {value.trim() ? (
              <div className="prose-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-[var(--color-text-tertiary)] text-[14px]">预览区域 — 编辑后将在此显示渲染效果</p>
            )}
          </div>
        )}
      </div>

      {/* ── 状态栏 ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 border-t border-[var(--color-border-light)] bg-[var(--color-bg-page)] text-[11px] text-[var(--color-text-tertiary)]">
        <div className="flex items-center gap-3">
          <span>行 {cursorInfo.line}, 列 {cursorInfo.col}</span>
          <span>{charCount} 字</span>
          {uploading && (
            <span className="flex items-center gap-1 text-[var(--color-primary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              上传中…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden sm:inline">Markdown · 双击外部退出编辑</span>
          {uploadImage && (
            <span className="hidden sm:inline text-[var(--color-text-placeholder)]">· 支持拖拽/粘贴图片</span>
          )}
        </div>
      </div>
    </div>
  )
}
