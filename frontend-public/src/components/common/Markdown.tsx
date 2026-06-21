/**
 * Markdown 渲染组件。
 * 使用 react-markdown + remark-gfm 渲染 GitHub 风格 Markdown。
 * 所有元素样式对齐设计系统 Token。
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/src/lib/utils'

interface MarkdownProps {
  /** Markdown 源文本。 */
  content: string
  /** 额外 CSS class。 */
  className?: string
}

export const Markdown = ({ content, className }: MarkdownProps) => {
  if (!content) {
    return <p className="text-[var(--color-text-tertiary)] text-[14px]">（内容为空）</p>
  }

  return (
    <div className={cn('prose-markdown', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
