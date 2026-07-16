/**
 * 助手 Markdown 展示组件。
 * 业务意图：聊天室和助手工作区共用同一套 Markdown 排版与思考区折叠规则，展示层不依赖具体 Agent Runtime 名称。
 */
import { ChevronRight, Loader2 } from 'lucide-react'
import { Markdown } from '@/src/components/common/Markdown'
import { normalizeAssistantMarkdown } from '@/src/lib/markdownUtils'
import { splitAssistantMessageContent } from '@/src/lib/assistantThinking'

interface AssistantMarkdownProps {
  /** 助手原文，组件会统一归一化后再渲染。 */
  content: string
  /** 正式回复区的额外样式。 */
  finalClassName?: string
}

const AssistantThinkingBlock = ({ content, completed }: { content: string; completed: boolean }) => (
  <details className="assistant-thinking-block group my-2 overflow-hidden rounded-lg border border-sky-200/80 bg-sky-50/70 text-[var(--color-text-secondary)]">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px] font-medium marker:hidden hover:bg-sky-100/70">
      <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
      <span>{completed ? '查看思考过程' : '正在思考'}</span>
      {!completed && <Loader2 className="h-3 w-3 animate-spin" aria-label="思考中" />}
      <span className="ml-auto text-[11px] font-normal text-[var(--color-text-tertiary)] group-open:hidden">展开</span>
      <span className="ml-auto hidden text-[11px] font-normal text-[var(--color-text-tertiary)] group-open:inline">收起</span>
    </summary>
    <div className="border-t border-sky-200/70 px-3 py-2.5">
      <Markdown content={content} normalize={false} variant="assistant" className="text-[12px] leading-6 opacity-90" />
    </div>
  </details>
)

/** 将思考过程作为可选细节展示，正式回复保持普通 Markdown 阅读节奏。 */
export const AssistantMarkdown = ({ content, finalClassName = 'text-[13px]' }: AssistantMarkdownProps) => {
  const sections = splitAssistantMessageContent(normalizeAssistantMarkdown(content))

  return (
    <>
      {sections.map((section, index) => (
        section.type === 'thinking' ? (
          <AssistantThinkingBlock key={`thinking-${index}`} content={section.content} completed={section.completed} />
        ) : (
          <Markdown key={`final-${index}`} content={section.content} normalize={false} variant="assistant" className={finalClassName} />
        )
      ))}
    </>
  )
}
