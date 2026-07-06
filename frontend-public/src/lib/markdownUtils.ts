/**
 * 规范 AI 生成内容里的常见 Markdown 边界问题。
 * 业务意图：流式模型偶尔会省略标题、列表和强调语法前后的换行/空格，统一在渲染入口修正，避免各业务页面重复兜底。
 */
export const normalizeGeneratedMarkdown = (content: string): string => {
  const normalized = (content || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*([^*\n]{1,60}?)\s+\*\*/g, '**$1**')
    .replace(/\*\*([^\s*][^*\n]{1,60}?)\*\*(?=[^\s\p{P}])/gu, '**$1** ')
    .replace(/\*\*([^*\n]{1,24}[：:])\s+\*\*\s*/g, '**$1** ')
    .replace(/([^\n#])\s*(#{1,6})(?=\s*\d)/g, '$1\n\n$2')
    .replace(/([^\n#])\s*(#{1,6}\s+)/g, '$1\n\n$2')
    .replace(/^(#{1,6})(?!#)([^\s#])/gm, '$1 $2')
    .replace(/^(#{1,6}\s+.{1,80}?\S)([-*+]\s+)/gm, '$1\n\n$2')

  return normalized.replace(/\n{3,}/g, '\n\n')
}
