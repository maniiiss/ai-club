/**
 * 保护少数会被 Markdown 误识别为标题的编号行。
 * 业务意图：模型偶尔把工单号或项目编号写成 `#ABC123`、`# 4 当前...`，
 * 这类井号不是章节层级；除此之外不猜测正文语义，保留原始 Markdown 交给渲染器处理。
 */
const protectSpecialHeadingIds = (content: string): string => content
  .split('\n')
  .map((line) => {
    // 明确的字母数字工单号，例如 `#LHR8GU`、`# 6I4IXF)`。
    const ticketMatch = line.match(/^(\s{0,3})(#{1,6})(\s*)([A-Z0-9][A-Z0-9_-]{3,})(?=$|[\s|()[\]{}<>:：，。！？,.!?）】])/u)
    if (ticketMatch) {
      const [, indent, hashes, spacing, ticketId] = ticketMatch
      const suffix = line.slice(ticketMatch[0].length)
      return `${indent}\\${hashes}${spacing}${ticketId}${suffix}`
    }

    // 数字编号只有在明显带有项目元数据或中文说明时才按伪标题处理，
    // 保留真正的 `# 1. 章节` 标题语义。
    const numericMatch = line.match(/^(\s{0,3})#{1,6}\s+(\d+)(?=\s*(?:[（(]\s*ID[：:]\s*\d+|[\u4e00-\u9fff]))(.*)$/u)
    if (numericMatch) {
      return `${numericMatch[1]}${numericMatch[2]}${numericMatch[3]}`
    }

    return line
  })
  .join('\n')

/**
 * 归一化 AI 消息的最小入口。
 * 业务意图：展示层不再通过大范围正则修复强调、列表、表格或标题边界，避免把合法 Markdown 改坏。
 */
export const normalizeGeneratedMarkdown = (content: string): string =>
  protectSpecialHeadingIds((content || '').replace(/\r\n?/g, '\n'))

/** 根据调用方的内容契约决定是否执行最小化归一化。 */
export const resolveMarkdownContent = (content: string, normalize = true): string =>
  normalize ? normalizeGeneratedMarkdown(content) : content || ''
