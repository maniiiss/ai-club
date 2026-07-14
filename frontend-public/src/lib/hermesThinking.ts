/**
 * Hermes 助手消息中的一个可展示片段。
 */
export interface HermesMessageContentSection {
  /** 片段类别：思考过程或正式回复。 */
  type: 'thinking' | 'final'
  /** 已移除 think 标签后的 Markdown 文本。 */
  content: string
  /** 思考过程是否已收到结束标签；正式回复固定为 true。 */
  completed: boolean
}

/**
 * 将 Hermes 模型输出切分为思考过程与正式回复。
 * 业务意图：`react-markdown` 不会把 `<think>` 当作结构化区域，若直接渲染会泄露标签并打乱排版；
 * 因此在进入 UI 前移除标签，并保留未闭合思考块以兼容流式生成中的中间状态。
 */
export const splitHermesMessageContent = (content?: string | null): HermesMessageContentSection[] => {
  const source = content || ''
  const sections: HermesMessageContentSection[] = []
  const openingTagPattern = /<think\b[^>]*>/gi
  const closingTagPattern = /<\/think\s*>/gi
  let cursor = 0
  let openingMatch: RegExpExecArray | null

  const appendFinalSection = (value: string) => {
    // 容错移除孤立结束标签，避免异常模型输出再次显示为用户可见文本。
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
