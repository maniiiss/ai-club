/**
 * Hermes 助手消息的统一展示组件。
 * 业务意图：项目助手与聊天室都可能收到 `<think>` 思考过程，必须复用同一展示规则，
 * 避免一个入口折叠、另一个入口把标签和推理文本直接输出给用户。
 */
import { ChevronRight, Loader2 } from 'lucide-react'
import { Markdown } from '@/src/components/common/Markdown'
import { splitHermesMessageContent } from '@/src/lib/hermesThinking'

interface HermesAssistantMessageContentProps {
  /** 已完成上游 Markdown 归一化的助手原文。 */
  content: string
  /** 正式回复区的额外样式，用于适配不同消息容器的字号。 */
  finalClassName?: string
}

/**
 * Hermes 的思考过程默认折叠，避免长推理文本抢占正式回复；用户可按需展开查看。
 */
const HermesThinkingBlock = ({ content, completed }: { content: string; completed: boolean }) => (
  <details className="group my-2 overflow-hidden rounded-lg border border-sky-200/80 bg-sky-50/70 text-[var(--color-text-secondary)]">
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

/**
 * 将助手回复中的 `<think>` 块从正式结果中隔离出来，防止标签直出及思考内容默认展开。
 */
export const HermesAssistantMessageContent = ({
  content,
  finalClassName = 'text-[13px]',
}: HermesAssistantMessageContentProps) => {
  const sections = splitHermesMessageContent(content)
  return (
    <>
      {sections.map((section, index) => (
        section.type === 'thinking' ? (
          <HermesThinkingBlock key={`thinking-${index}`} content={section.content} completed={section.completed} />
        ) : (
          <Markdown key={`final-${index}`} content={section.content} normalize={false} variant="assistant" className={finalClassName} />
        )
      ))}
    </>
  )
}
