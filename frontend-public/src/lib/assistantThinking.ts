/**
 * 助手消息中的一个可展示片段。
 * 业务意图：展示层只关心思考区与正式回复区，不绑定具体的 Agent Runtime 或后端实现名称。
 */
export interface AssistantMessageContentSection {
  /** 片段类别：思考过程或正式回复。 */
  type: 'thinking' | 'final'
  /** 已移除 think 标签后的 Markdown 文本。 */
  content: string
  /** 思考过程是否已收到结束标签；正式回复固定为 true。 */
  completed: boolean
}

/**
 * 将助手输出切分为思考过程与正式回复。
 * 业务意图：`react-markdown` 不会把 `<think>` 当作结构化区域，先在展示边界处理，避免标签泄露并兼容流式未闭合内容。
 */
export const splitAssistantMessageContent = (content?: string | null): AssistantMessageContentSection[] => {
  const source = content || ''
  const sections: AssistantMessageContentSection[] = []
  const openingTagPattern = /<think\b[^>]*>/gi
  const closingTagPattern = /<\/think\s*>/gi
  let cursor = 0
  let openingMatch: RegExpExecArray | null

  const appendFinalSection = (value: string) => {
    const normalized = value.replace(/<\/think\s*>/gi, '').trim()
    if (normalized) {
      sections.push({ type: 'final', content: normalized, completed: true })
    }
  }

  while ((openingMatch = openingTagPattern.exec(source))) {
    appendFinalSection(source.slice(cursor, openingMatch.index))

    closingTagPattern.lastIndex = openingTagPattern.lastIndex
    const closingMatch = closingTagPattern.exec(source)
    const hasClosingTag = Boolean(closingMatch)
    const thinkingEnd = closingMatch?.index ?? source.length
    const thinkingContent = source.slice(openingTagPattern.lastIndex, thinkingEnd).trim()

    if (thinkingContent) {
      sections.push({ type: 'thinking', content: thinkingContent, completed: hasClosingTag })
    }

    cursor = hasClosingTag ? closingTagPattern.lastIndex : source.length
    if (!hasClosingTag) {
      break
    }
    openingTagPattern.lastIndex = cursor
  }

  appendFinalSection(source.slice(cursor))
  return sections
}
