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

const tableSeparatorPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u
const gluedTableSeparatorPattern = /^(\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|)\s+(\|.*)$/u
const gluedTableHeaderPattern = /^(.+?)(\|[^|\n]+(?:\|[^|\n]+)+\|)\s*$/u

const splitGluedTableSeparator = (line: string): [string, string] | null => {
  const match = line.match(gluedTableSeparatorPattern)
  return match ? [match[1], match[2]] : null
}

const splitAssistantTableCells = (line: string): string[] => {
  const trimmed = line.trim()
  const withoutBoundaryPipes = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return withoutBoundaryPipes.split('|').map((cell) => cell.trim())
}

const normalizeAssistantTableRow = (line: string): string => {
  const cells = splitAssistantTableCells(line)
  return `| ${cells.join(' | ')} |`
}

/**
 * 修复助手回答中模型粘连的 GFM 表格边界。
 * 业务意图：模型可能把“说明文字|表头”和“分隔线|首行”分别粘在一起，
 * 只在下一行确实是表格分隔线时补换行，避免把普通正文中的竖线误判成表格。
 */
export const normalizeAssistantMarkdown = (content: string): string => {
  const lines = normalizeGeneratedMarkdown(content).split('\n')
  const repairedLines: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1] || ''
    const headerMatch = line.match(gluedTableHeaderPattern)
    const nextSeparator = splitGluedTableSeparator(nextLine)

    if (
      headerMatch &&
      !line.trimStart().startsWith('|') &&
      (tableSeparatorPattern.test(nextLine) || Boolean(nextSeparator)) &&
      headerMatch[1].trim() &&
      headerMatch[2].trim().startsWith('|')
    ) {
      repairedLines.push(headerMatch[1].trimEnd(), '', headerMatch[2].trimStart())
      continue
    }

    const separator = splitGluedTableSeparator(line)
    if (separator) {
      repairedLines.push(separator[0], separator[1])
      continue
    }

    repairedLines.push(line)
  }

  const normalizedLines: string[] = []
  for (let index = 0; index < repairedLines.length;) {
    const line = repairedLines[index]
    const separator = repairedLines[index + 1] || ''
    if (line.trim().startsWith('|') && tableSeparatorPattern.test(separator)) {
      const headerCells = splitAssistantTableCells(line)
      const separatorCells = splitAssistantTableCells(separator)
      // 模型偶尔会多生成一个分隔单元格；按表头列数收敛，保证 GFM 能识别表格。
      const alignedSeparator = separatorCells.slice(0, headerCells.length)
      while (alignedSeparator.length < headerCells.length) alignedSeparator.push('---')
      normalizedLines.push(
        normalizeAssistantTableRow(line),
        `| ${alignedSeparator.join(' | ')} |`,
      )
      index += 2
      while (index < repairedLines.length && repairedLines[index].trim().startsWith('|')) {
        normalizedLines.push(normalizeAssistantTableRow(repairedLines[index]))
        index += 1
      }
      continue
    }
    normalizedLines.push(line)
    index += 1
  }

  return normalizedLines.join('\n')
}

/** 根据调用方的内容契约决定是否执行最小化归一化。 */
export const resolveMarkdownContent = (content: string, normalize = true): string =>
  normalize ? normalizeGeneratedMarkdown(content) : content || ''

interface AssistantMarkdownAstNode {
  type: string
  value?: string
  children?: AssistantMarkdownAstNode[]
}

/**
 * 修复助手中文正文中紧贴引号的强调标记。
 * 业务意图：CommonMark 会把 `状态为**"进行中"**的任务` 视为普通文本，
 * 仅在 Markdown AST 中补成 strong 节点，避免改写原始回答或影响其它 Markdown 场景。
 */
export const remarkAssistantPunctuatedStrong = () => (tree: AssistantMarkdownAstNode) => {
  const punctuatedStrongPattern = /\*\*([("“‘「『（【《][^*\n]*[)"”’」』）】》])\*\*/gu

  const visit = (node: AssistantMarkdownAstNode) => {
    if (!node.children) return
    const nextChildren: AssistantMarkdownAstNode[] = []
    node.children.forEach((child) => {
      if (child.type !== 'text' || !child.value) {
        visit(child)
        nextChildren.push(child)
        return
      }

      let cursor = 0
      let match: RegExpExecArray | null
      punctuatedStrongPattern.lastIndex = 0
      while ((match = punctuatedStrongPattern.exec(child.value))) {
        if (match.index > cursor) {
          nextChildren.push({ type: 'text', value: child.value.slice(cursor, match.index) })
        }
        nextChildren.push({
          type: 'strong',
          children: [{ type: 'text', value: match[1] }],
        })
        cursor = match.index + match[0].length
      }
      if (cursor > 0) {
        if (cursor < child.value.length) {
          nextChildren.push({ type: 'text', value: child.value.slice(cursor) })
        }
      } else {
        nextChildren.push(child)
      }
    })
    node.children = nextChildren
  }

  visit(tree)
}
