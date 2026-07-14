/**
 * 规范 AI 生成内容里的常见 Markdown 边界问题。
 * 业务意图：流式模型偶尔会省略标题、列表、表格和强调语法前后的换行/空格，统一在渲染入口修正，避免各业务页面重复兜底。
 */
export const normalizeGeneratedMarkdown = (content: string): string => {
  const normalized = normalizeGeneratedTables(normalizeGeneratedHeadingBoundaries(normalizeGeneratedInlineMarkdown(normalizeGeneratedTicketIdLines(normalizeGeneratedLooseTableRows((content || '')
    .replace(/\r\n?/g, '\n')
    // 归一化行首全角井号 ＃（U+FF03）为半角 #（U+0023），AI 在中文语境下偶尔输出全角井号导致 ATX 标题不被 react-markdown 识别
    .replace(/^[ \t]*[＃#]{1,6}/gm, (match) => match.replace(/＃/g, '#'))
    // 合并括号内被空行打断的极短内容，如「项目（项目\n\n4）」->「项目（项目4）」
    // 业务意图：AI 流式输出偶尔在括号内的编号/短词间插入空行，react-markdown 会把括号拆成两段，破坏语义；只合并两侧内容均 ≤4 字的极短场景，避免误伤合法的多段括号内容
    .replace(/([（(])((?:[^\n）)]){0,4})\n{2,}((?:[^\n）)]){0,4}[）)])/g, '$1$2$3')
    .replace(/\*\*([^\n*]{1,80})\n([^\n*]{1,80})\s+\*(?=\n[-*+]|\n\d+[.)]\s|\n\n|$)/g, '\\*\\*$1\n$2 \\*')
    .replace(/(\\\*\n)([-*+]\s+)/g, '$1\n$2')))))
  )

  return normalizeGeneratedLabelSpacing(normalizeGeneratedPriorityLabelSpacing(normalizeGeneratedEmptyListItems(normalizeGeneratedPriorityRecommendationBoundaries(normalizeGeneratedStandalonePriorityMarkers(normalized))))).replace(/\n{3,}/g, '\n\n')
}

/** 根据调用方的内容契约决定是否执行生成内容归一化。 */
export const resolveMarkdownContent = (content: string, normalize = true): string =>
  normalize ? normalizeGeneratedMarkdown(content) : content || ''

/**
 * 保护行首工单号，避免 `#LHR8GU` 被 Markdown 当成一级标题。
 * 表格单元格内的工单号（如 `| # UZ69HL |`）无需在此转义，
 * 由 normalizeGeneratedHeadingBoundaries 跳过含 `|` 的行来保护。
 */
const normalizeGeneratedTicketIdLines = (content: string): string =>
  content
    // 聊天室摘要会把「# 4（ID:4，进行中，负责人：管理员）」这类项目元数据误写成标题；其本质是明细正文。
    .replace(/^#{1,6}\s*(\d+\s*[（(]\s*ID[：:]\s*\d+[^\n）)]*[）)]?)$/gimu, '$1')
    // 风险建议偶发把「##994.* 🟡低优」当作标题开头；其中编号与优先级是正文，需在标题归一化前还原。
    .replace(/^#{1,6}\s*(\d+[.、])\*\s*([🔴🟡🟢⚪])/gmu, '$1 $2')
    // AI 偶尔把「##99的开发执行任务4.」这类编号句子误写成 ATX 标题；它不是章节标题，需移除任意层级的标题标记，避免在聊天卡片中被放大。
    .replace(/^#{1,6}\s*(\d+的[^\n]*[。.]$)/gm, '$1')
    .replace(/^#\s+([A-Z0-9]{4,}\)?[^\n]*)$/gm, '\\# $1')
    .replace(/^#([A-Z0-9]{4,}\)?[^\n]*)$/gm, '\\#$1')
    .replace(/^\s*[-*+]\s*$/gm, '')
    .replace(/[^\S\n+-]-\s*\*$/gm, (match) => match.slice(0, -3).trimEnd())
    .replace(/^(\s*[-*+]\s+.+?)[^\S\n]+-$/gm, '$1')

const normalizeGeneratedHeadingBoundaries = (content: string): string =>
  content
    // 在 `#` 前断行补空行，但跳过含 `|` 的表格行：表格单元格内的 `# 6I4IXF)` 等工单号不应被断成一级标题
    .replace(/([^\n#\\])\s*(#{1,6})(?=\s*\d)/g, (match, prefix: string, hashes: string, offset: number, fullText: string) => {
      const lineStart = fullText.lastIndexOf('\n', offset) + 1
      const lineEndIndex = fullText.indexOf('\n', offset)
      const lineEnd = lineEndIndex < 0 ? fullText.length : lineEndIndex
      const currentLine = fullText.slice(lineStart, lineEnd)
      return currentLine.includes('|') ? match : `${prefix}\n\n${hashes}`
    })
    .replace(/([^\n#\\])\s*(#{1,6})(?!#)([^\s#])/g, (match, prefix: string, hashes: string, next: string, offset: number, fullText: string) => {
      if (prefix === '|') return match
      // 跳过含 `|` 的表格行：表格单元格内的 `#ABC123` 等工单号不应被断成标题
      const lineStart = fullText.lastIndexOf('\n', offset) + 1
      const lineEndIndex = fullText.indexOf('\n', offset)
      const lineEnd = lineEndIndex < 0 ? fullText.length : lineEndIndex
      const currentLine = fullText.slice(lineStart, lineEnd)
      return currentLine.includes('|') ? match : `${prefix}\n\n${hashes} ${next}`
    })
    .replace(/(^|[^\n#\\])\s*(#{1,6}\s+)/g, (match, prefix: string, hashes: string, offset: number, fullText: string) => {
      const lineStart = fullText.lastIndexOf('\n', offset) + 1
      const lineEndIndex = fullText.indexOf('\n', offset)
      const lineEnd = lineEndIndex < 0 ? fullText.length : lineEndIndex
      const currentLine = fullText.slice(lineStart, lineEnd)
      return currentLine.includes('|') ? match : `${prefix}\n\n${hashes}`
    })
    .replace(/^(#{1,6})(?!#)([^\s#].*)$/gm, (match, hashes: string, text: string) =>
      text.includes('|') ? match : `${hashes} ${text}`)
    .replace(/^(#{1,6}\s+.{1,80}?\S)([-*+]\s+)/gm, '$1\n\n$2')

const normalizeGeneratedInlineMarkdown = (content: string): string =>
  cleanupGeneratedOrphanEmphasisMarkers(content
    // 模型偶发把加粗起止标记写在「高优先级**—说明.**」的说明部分两端；将强调收敛到优先级标签本身。
    .replace(/((?:高|中|低)优先级)\*\*([—–-])/g, '**$1** $2')
    .replace(/([。！？!?])\*\*(?=\s|$)/g, '$1')
    .replace(/^([A-Za-z0-9][A-Za-z0-9_-]{1,31})\*$/gm, '$1')
    // 汇总统计偶发输出「总数：* 53」，该单星号没有成对闭合语义，应移除而非原样显示。
    .replace(/([：:])\s*\*\s+(?=\d)/g, '$1 ')
    .replace(/^\s*--\s*-\s+([^：:\n]{1,24}[：:])\s*/gm, '- **$1** ')
    .replace(/\*\*([^\s*][^*\n]{0,24}?)\*(?=[\s，。；：:、,.!?！？)\]】）]|$|\n(?:[-*+]\s|\d+[.)]\s|$))/g, '**$1**')
    .replace(/([^\s])\*\*["“”']([^*"“”'\n]{1,40})["“”']\*\*/g, '$1 **$2**')
    .replace(/\*\*[^\S\n]*([^*\n]{1,24}[：:])[^\S\n]*\*\*[^\S\n]*/g, '**$1** ')
    .replace(/\*\*[^\S\n]+([^*\n]{1,60}?)\*\*/g, '**$1**')
    .replace(/\*\*([^\s*：:|][^*\n]{0,59}?)[^\S\n]+\*\*/g, '**$1**')
    .replace(/([A-Za-z0-9）)\]】])\*\*([^*\n]{1,24}[：:])\*\*/gu, '$1 **$2**')
    .replace(/([^\s\n])-\s*\*\*\s*([^*\n]{1,60}?)\s*\*\*/g, '$1 - **$2**')
    .replace(/-\s+\*\*\s+([^*\n]{1,60}?)\*\*/g, '- **$1**')
    .replace(/\*\*([^*：:\s\n][^*：:\n]{0,59}?)\*\*(?=[^\s\p{P}])/gu, '**$1** ')
    .replace(/([^\s])\*\*(需求(?:标题|内容)[：:])\*\*/g, '$1 **$2**')
    .replace(/\*\*[^\S\n]+(需求(?:标题|内容)[：:])\*\*/g, ' **$1**')
    .replace(/\*\*([^*\n]{1,24}[：:])\*\*([^\s\n])/g, '**$1** $2'))

const cleanupGeneratedOrphanEmphasisMarkers = (content: string): string => {
  const placeholders: string[] = []
  const protect = (value: string) => {
    const token = `@@BOLD_${placeholders.length}@@`
    placeholders.push(value)
    return token
  }

  let normalized = content
    .replace(/\*\*[^*\n]+?\*\*/g, protect)
    // 保护合法的单星斜体（同行内 *文本*），避免后续孤立星号清理误伤
    .replace(/(?<!\*)\*[^*\n]+?\*(?!\*)/g, protect)
    .replace(/\*\*/g, '')
    // 清理孤立单星号：前面是字母/数字/中文/全角标点，后面是标点、换行或行尾
    .replace(/(?<=[\p{L}\p{N}_\u4e00-\u9fff：，。；！？、])\*(?=[，。；：:、,.!?！？)\]】）\n]|$)/gmu, '')

  placeholders.forEach((placeholder, index) => {
    normalized = normalized.replace(`@@BOLD_${index}@@`, placeholder)
  })

  return normalized
}

/**
 * 在强调、标题等语法修复完成后再次移除空列表项。
 * 业务意图：`- **` 会在强调标记清理后变成 `- `；若不做末端清理，react-markdown 仍会渲染一个没有文本的圆点。
 */
const normalizeGeneratedEmptyListItems = (content: string): string =>
  content.replace(/^[\t ]*(?:[-*+•‣◦])[\t ]*$/gmu, '')

/**
 * 清理风险建议序号与优先级表情之间的孤立星号。
 * 业务意图：模型将未闭合强调符输出为 `1. * 🔴` 时，星号既不是合法斜体也不是列表标记，直接显示会干扰阅读。
 */
const normalizeGeneratedStandalonePriorityMarkers = (content: string): string =>
  content.replace(/(\d+[.、])\s*\*\s*(?=[🔴🟡🟢⚪])/gmu, '$1 ')

/**
 * 拆分被流式输出粘连的编号优先级建议。
 * 业务意图：风险结论常连续输出 `建议优先级1. 🔴...2. 🟡...`，缺少段落边界会让多条行动项挤成一行；只匹配带优先级表情的 1-2 位编号，避免影响普通数字正文。
 */
const normalizeGeneratedPriorityRecommendationBoundaries = (content: string): string =>
  content
    .replace(/(建议优先级)\s*((?:[1-9]|[1-9]\d)[.、]\s*[🔴🟡🟢⚪])/gmu, '$1\n\n$2')
    .replace(/([^\n\d])((?:[1-9]|[1-9]\d)[.、]\s*[🔴🟡🟢⚪])/gmu, '$1\n\n$2')

/** 保持优先级加粗标签与后续说明之间的可读分隔，避免后续语法归一化吞掉空格。 */
const normalizeGeneratedPriorityLabelSpacing = (content: string): string =>
  content.replace(/(\*\*(?:高|中|低)优先级\*\*)\s*([—–-])\s*/g, '$1 $2 ')

/** 将聊天室摘要中紧贴正文的“绑定项目”标签分开，并清除模型遗留的行尾空白。 */
const normalizeGeneratedLabelSpacing = (content: string): string =>
  content
    .replace(/([^\s])(\*\*绑定项目：\*\*)/g, '$1 $2')
    .replace(/[\t ]+$/gm, '')

const tableAlignmentCellPattern = /^:?-{3,}:?$/

const splitMarkdownTableRow = (line: string): string[] | null => {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null
  const cells = trimmed.split('|').map((cell) => cell.trim())
  if (cells[0] === '') cells.shift()
  if (cells[cells.length - 1] === '') cells.pop()
  return cells.length > 0 ? cells : null
}

const formatMarkdownTableRow = (cells: string[]): string => `| ${cells.join(' | ')} |`

const isMarkdownTableDelimiter = (line: string): boolean => {
  const cells = splitMarkdownTableRow(line)
  return Boolean(cells?.length && cells.every((cell) => tableAlignmentCellPattern.test(cell)))
}

/**
 * 补齐模型在表格体中漏掉的首尾竖线。
 * 业务意图：Hermes 偶发输出 `#AAC896 |标题 |状态 |负责人 |`，如果不先修复，后续标题归一化会把 `#AAC896` 当成一级标题。
 */
const normalizeGeneratedLooseTableRows = (content: string): string => {
  const lines = content.split('\n')
  const normalizedLines: string[] = []
  let expectedColumns = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const previousLine = normalizedLines[normalizedLines.length - 1] || ''

    if (isMarkdownTableDelimiter(line) && splitMarkdownTableRow(previousLine)?.length) {
      expectedColumns = splitMarkdownTableRow(previousLine)?.length || 0
      normalizedLines.push(line)
      continue
    }

    const cells = splitMarkdownTableRow(line)
    const splitTicketRows = collectSplitTicketTableRows(lines, index, expectedColumns)
    if (splitTicketRows) {
      normalizedLines.push(...splitTicketRows.rows)
      index = splitTicketRows.nextIndex - 1
      continue
    }

    if (expectedColumns > 0 && cells?.length === expectedColumns && line.includes('|')) {
      normalizedLines.push(formatMarkdownTableRow(cells))
      continue
    }

    if (!line.trim()) {
      expectedColumns = 0
    }
    normalizedLines.push(line)
  }

  return normalizedLines.join('\n')
}

/**
 * 合并模型把表格行断在工单号前的输出。
 * 业务意图：聊天室周报类内容常出现 `3/12 | 标题（` 换行 `# ABC123) | 状态 | |3/13 ...`，
 * 如果不先拼回表格行，`# ABC123)` 会被渲染成标题或普通段落，整段计划表也会散掉。
 */
const collectSplitTicketTableRows = (
  lines: string[],
  startIndex: number,
  expectedColumns: number,
): { rows: string[]; nextIndex: number } | null => {
  if (expectedColumns < 3) return null
  let rowStart = lines[startIndex]
  let nextIndex = startIndex + 1
  const rows: string[] = []

  while (nextIndex < lines.length) {
    const startCells = splitMarkdownTableRow(rowStart)
    const continuationMatch = lines[nextIndex].trim().match(/^(#\s*[A-Z0-9]{4,}\)?[^|]*)\|\s*([^|]+?)\s*\|\s*(.*)$/)

    if (!startCells || startCells.length !== expectedColumns - 1 || !continuationMatch) {
      break
    }

    rows.push(formatMarkdownTableRow([
      startCells[0],
      `${startCells[1]}${continuationMatch[1].trim()}`,
      continuationMatch[2].trim(),
    ]))

    const nextRowStart = continuationMatch[3].trim()
    nextIndex += 1
    if (!nextRowStart.startsWith('|')) {
      break
    }
    rowStart = nextRowStart.slice(1).trim()
  }

  return rows.length ? { rows, nextIndex } : null
}

/**
 * 修复模型常见的“标题 + 表头”粘连问题。
 * 业务意图：Hermes 经常输出 `### 标题|列 A|列 B`，GFM 会把后续分隔行当普通文本；这里把标题拆开，并丢弃对应的占位分隔列。
 */
const normalizeGeneratedTables = (content: string): string => {
  const lines = content.split('\n')
  const normalizedLines: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1]
    const tableStartMatch = line.match(/^(\s*#{1,6}\s+[^|\n]+?)\s*\|(.+)$/)

    if (tableStartMatch && nextLine && isMarkdownTableDelimiter(nextLine)) {
      const headerCells = splitMarkdownTableRow(`|${tableStartMatch[2]}`)
      const delimiterCells = splitMarkdownTableRow(nextLine)

      if (headerCells?.length && delimiterCells?.length && delimiterCells.length === headerCells.length + 1) {
        normalizedLines.push(tableStartMatch[1].trimEnd(), '', formatMarkdownTableRow(headerCells), `|${delimiterCells.slice(1).join('|')}|`)
        index += 1
        continue
      }
    }

    const titledTableStartMatch = line.match(/^(\s*[^|\n]+?)\s*\|(.+)$/)
    if (titledTableStartMatch && nextLine && isMarkdownTableDelimiter(nextLine)) {
      const headerCells = splitMarkdownTableRow(`|${titledTableStartMatch[2]}`)
      const delimiterCells = splitMarkdownTableRow(nextLine)

      if (headerCells?.length && delimiterCells?.length && delimiterCells.length === headerCells.length) {
        normalizedLines.push(titledTableStartMatch[1].trimEnd(), '', formatMarkdownTableRow(headerCells), nextLine.trim())
        index += 1
        continue
      }
    }

    normalizedLines.push(line)
  }

  return normalizedLines.join('\n')
}
