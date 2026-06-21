/**
 * Markdown 编辑器快捷键处理 Hook。
 * 拦截 textarea 的 keydown 事件，支持常用 Markdown 快捷键。
 */
import { useCallback } from 'react'

/** 文本操作辅助：在 textarea 中包裹选区或插入文本。 */
interface TextareaAction {
  /** 操作前的选区起始位置。 */
  start: number
  /** 操作前的选区结束位置。 */
  end: number
  /** textarea 当前文本。 */
  text: string
}

/**
 * 包裹选区文本：在选区前后插入标记。
 * 若选区为空则在光标处插入占位符并选中。
 */
const wrapSelection = (
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
  onChange: (value: string) => void,
) => {
  const { selectionStart: start, selectionEnd: end, value: text } = textarea
  const selected = text.slice(start, end) || placeholder
  const newText = text.slice(0, start) + before + selected + after + text.slice(end)
  onChange(newText)

  // 恢复光标：若原选区为空则选中占位符，否则保持选区范围
  requestAnimationFrame(() => {
    if (start === end) {
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = start + before.length + selected.length
    } else {
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = start + before.length + selected.length
    }
    textarea.focus()
  })
}

/**
 * 行首前缀插入：在当前行首添加前缀（如 > 、# 、- 等）。
 */
const insertLinePrefix = (
  textarea: HTMLTextAreaElement,
  prefix: string,
  onChange: (value: string) => void,
) => {
  const { selectionStart: start, value: text } = textarea
  // 找到当前行的起始位置
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart)
  onChange(newText)

  requestAnimationFrame(() => {
    textarea.selectionStart = start + prefix.length
    textarea.selectionEnd = start + prefix.length
    textarea.focus()
  })
}

/**
 * Tab 缩进：在光标或选区每行前插入 2 个空格。
 */
const indentSelection = (
  textarea: HTMLTextAreaElement,
  onChange: (value: string) => void,
) => {
  const { selectionStart: start, selectionEnd: end, value: text } = textarea
  const newText = text.slice(0, start) + '  ' + text.slice(end)
  onChange(newText)

  requestAnimationFrame(() => {
    textarea.selectionStart = start + 2
    textarea.selectionEnd = start + 2
    textarea.focus()
  })
}

/**
 * Shift+Tab 反缩进：移除当前行首最多 2 个空格。
 */
const outdentSelection = (
  textarea: HTMLTextAreaElement,
  onChange: (value: string) => void,
) => {
  const { selectionStart: start, value: text } = textarea
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const linePrefix = text.slice(lineStart, lineStart + 2)
  const spacesToRemove = linePrefix === '  ' ? 2 : linePrefix.startsWith(' ') ? 1 : 0
  if (spacesToRemove === 0) return

  const newText = text.slice(0, lineStart) + text.slice(lineStart + spacesToRemove)
  onChange(newText)

  requestAnimationFrame(() => {
    textarea.selectionStart = Math.max(lineStart, start - spacesToRemove)
    textarea.selectionEnd = Math.max(lineStart, start - spacesToRemove)
    textarea.focus()
  })
}

/**
 * Markdown 快捷键处理 Hook。
 * 返回一个 keydown 事件处理函数，绑定到 textarea。
 */
export const useMarkdownShortcuts = (
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  onChange: (value: string) => void,
) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const mod = e.ctrlKey || e.metaKey

      // Tab 缩进
      if (e.key === 'Tab' && !mod) {
        e.preventDefault()
        if (e.shiftKey) {
          outdentSelection(textarea, onChange)
        } else {
          indentSelection(textarea, onChange)
        }
        return
      }

      if (!mod) return

      // Ctrl/Cmd + B → 加粗
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        wrapSelection(textarea, '**', '**', '粗体文本', onChange)
        return
      }

      // Ctrl/Cmd + I → 斜体
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        wrapSelection(textarea, '*', '*', '斜体文本', onChange)
        return
      }

      // Ctrl/Cmd + K → 链接（无 Shift）或行内代码（有 Shift）
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        if (e.shiftKey) {
          wrapSelection(textarea, '`', '`', 'code', onChange)
        } else {
          const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
          wrapSelection(textarea, '[', '](url)', selected || '链接文本', onChange)
        }
        return
      }

      // Ctrl/Cmd + Shift + . → 引用
      if (e.shiftKey && (e.key === '.' || e.key === '>')) {
        e.preventDefault()
        insertLinePrefix(textarea, '> ', onChange)
        return
      }
    },
    [textareaRef, onChange],
  )

  return { handleKeyDown }
}
