const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderInline = (value: string) => {
  const placeholders: string[] = []
  let text = escapeHtml(normalizeInlineMarkdown(value))
  const pushPlaceholder = (html: string) => {
    const token = `@@INLINE_PLACEHOLDER_${placeholders.length}@@`
    placeholders.push(html)
    return token
  }

  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => pushPlaceholder(`<code>${code}</code>`))
  text = text.replace(
    /!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/|\/|\.\.?\/|#)[^\s)]+)\)/g,
    (_, alt: string, url: string) => pushPlaceholder(`<img src="${url}" alt="${alt}" />`)
  )
  text = text.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/|\.\.?\/|#)[^\s)]+)\)/g,
    (_, label: string, url: string) => pushPlaceholder(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
  )
  text = text.replace(
    /(^|[\s(])((?:https?:\/\/|mailto:|tel:)[^\s<]+[^<.,:;"')\]\s])/g,
    (_, prefix: string, url: string) => `${prefix}${pushPlaceholder(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)}`
  )
  text = text.replace(/(\*{2}|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
  text = text.replace(/(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(?=\S)([\s\S]*?\S)(?<!_)_(?!_)/g, (_match, a: string, b: string) => `<em>${a ?? b}</em>`)
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')

  placeholders.forEach((placeholder, index) => {
    text = text.replace(`@@INLINE_PLACEHOLDER_${index}@@`, placeholder)
  })

  return text.replace(/\n/g, '<br />')
}

/**
 * 修复 Hermes 句内强调语法的常见粘连。
 * 业务意图：模型常输出 `状态为**"进行中"**的...`，这里去掉仅用于转述的引号并补齐中文句内空格，让最终阅读节奏稳定。
 */
const normalizeInlineMarkdown = (value: string) =>
  value
    .replace(/\*\*([^\s*][^*\n]{0,24}?)\*(?=[\s，。；：:、,.!?！？)\]】）]|$|\n(?:[-*+]\s|\d+[.)]\s|$))/g, '**$1**')
    .replace(/([^\s])\*\*["“”']([^*"“”'\n]{1,40})["“”']\*\*/g, '$1 **$2**')
    .replace(/\*\*\s+([^*\n]{1,60}?)\*\*/g, '**$1**')
    .replace(/(^|[^-\s])\*\*([^*\n]{1,60}?)\s+\*\*/g, '$1**$2**')
    .replace(/([^\s\n])-\s*(\*\*[^*\n]{1,60}\*\*)/g, '$1 - $2')
    .replace(/\*\*\s+([^*\n]{1,60}?)\*\*/g, '**$1**')
    .replace(/(^|[^-\s])\*\*([^*\n]{1,60}?)\s+\*\*/g, '$1**$2**')
    .replace(/(^|[^\s*-])\*\*([^*：:\n]{1,40})\*\*(?=[^\s\p{P}])/gu, '$1**$2** ')
    .replace(/(-)\*\*\s+/g, '$1 **')
    .replace(/-\s+\*\*\s+([^*\n]{1,60}?)\*\*/g, '- **$1**')
    .replace(/\*\*([^*：:\n]{1,40})\*\*(?=[^\s\p{P}])/gu, '**$1** ')

/**
 * 去掉 HTML 标签并回收常见实体，供 Hermes 思考区兼容 HTML 回退渲染时复用。
 */
const stripHtmlTags = (value: string) =>
  value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()

/**
 * 仅对白名单标签做实体还原，避免把模型返回的任意 HTML 直接放进页面。
 */
const decodeWhitelistedHtmlEntities = (value: string) =>
  Array.from({ length: 3 }).reduce<string>((current) =>
    current
      .replace(/&amp;lt;/gi, '&lt;')
      .replace(/&amp;gt;/gi, '&gt;')
      .replace(/&amp;nbsp;/gi, '&nbsp;')
      .replace(/&lt;(\/?)(think)\b([^&]*)&gt;/gi, '<$1$2$3>')
      .replace(/&lt;(br)\s*\/?&gt;/gi, '<br />')
      .replace(/&lt;(\/?)(p|strong|b|em|i|s|del|blockquote|ul|ol|li|table|thead|tbody|tr|th|td)\b([^&]*)&gt;/gi, '<$1$2$3>')
  , value)

/**
 * 将 HTML 表格回退为 Markdown 表格，复用同一套表格渲染样式。
 */
const convertHtmlTableToMarkdown = (tableHtml: string) => {
  const rowMatches = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
  if (!rowMatches.length) {
    return ''
  }

  const rows = rowMatches
    .map((rowMatch) => [...rowMatch[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)])
    .map((cellMatches) => cellMatches.map((cellMatch) => stripHtmlTags(cellMatch[2]).replace(/\|/g, '\\|')))
    .filter((cells) => cells.length > 0)

  if (!rows.length) {
    return ''
  }

  const header = rows[0]
  const divider = header.map(() => '---')
  const bodyRows = rows.slice(1)

  return [
    `| ${header.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n')
}

/**
 * Hermes 经常返回少量 HTML 片段，这里先归一化再进入统一的 Markdown 渲染流程。
 */
const normalizeRichHtmlMarkup = (markdown: string) =>
  decodeWhitelistedHtmlEntities(markdown)
    .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml: string) => `\n${convertHtmlTableToMarkdown(tableHtml)}\n`)
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p\b[^>]*>/gi, '')
    .replace(/<(strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)\b[^>]*>/gi, '*')
    .replace(/<\/(em|i)>/gi, '*')
    .replace(/<(s|del)\b[^>]*>/gi, '~~')
    .replace(/<\/(s|del)>/gi, '~~')
    .replace(/<blockquote\b[^>]*>/gi, '> ')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<\/?(div|span|section|article|main|header|footer)\b[^>]*>/gi, '')

/**
 * Hermes 偶发会把标题、段落和表格头挤在同一行里，这里先做轻量纠偏，
 * 让后续统一的 Markdown 解析仍能识别出标题与表格结构。
 */
const normalizeCollapsedMarkdownBlocks = (markdown: string) =>
  markdown
    .replace(/^([^|\n#][^\n#]*?)\s*(#{1,6})(?!#)([^\s#])/gm, '$1\n\n$2 $3')
    .replace(/^([^|\n#][^\n#]*?)\s*(#{1,6}\s+)/gm, '$1\n\n$2')
    .replace(/^(\|\s*[^|\n]+)\n(#{1,6}[^\n]*\|)\s*$/gm, '$1\n$2')
    .replace(/^(#{1,6}\s*[^|\n]+?)(\|(?:[^|\n]*\|)+)\s*$/gm, '$1\n$2')

/**
 * 将 Markdown 表格行切成单元格，兼容首尾带竖线和普通竖线写法。
 */
const parseTableCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

/**
 * 判断下一行是否是 Markdown 表格分隔符。
 */
const isTableDividerLine = (line: string) => {
  const cells = parseTableCells(line)
  if (!cells.length) {
    return false
  }
  return cells.every((cell) => /^:?-+(?::?-+)*:?$/.test(cell))
}

const isHorizontalRuleLine = (line: string) =>
  /^\s{0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/.test(line)

/**
 * Hermes 偶尔会把表格体中的一行拆成“前半行 + 下一行续写”，这里用列数做兜底合并。
 */
const mergeTableContinuationLine = (rows: string[][], continuationLine: string, expectedColumns: number) => {
  if (!rows.length) {
    return false
  }
  const lastRow = rows[rows.length - 1]
  const normalizedContinuation = continuationLine.trim().replace(/\s+/g, ' ')
  if (!normalizedContinuation) {
    return false
  }
  if (lastRow.length < expectedColumns) {
    const mergedRow = [...lastRow]
    while (mergedRow.length < expectedColumns - 1) {
      mergedRow.push('')
    }
    const targetIndex = Math.max(mergedRow.length - 1, 0)
    mergedRow[targetIndex] = mergedRow[targetIndex]
      ? `${mergedRow[targetIndex]}\n${normalizedContinuation}`
      : normalizedContinuation
    rows[rows.length - 1] = mergedRow
    return true
  }
  if (lastRow.length === expectedColumns) {
    const mergedRow = [...lastRow]
    const targetIndex = expectedColumns - 1
    mergedRow[targetIndex] = mergedRow[targetIndex]
      ? `${mergedRow[targetIndex]}\n${normalizedContinuation}`
      : normalizedContinuation
    rows[rows.length - 1] = mergedRow
    return true
  }
  return false
}

const shouldMergePlainContinuationLine = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }
  if (/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/.test(trimmed)) {
    return false
  }
  return true
}

const shouldAppendTableCellsAsContinuation = (
  rawLine: string,
  candidateCells: string[],
  expectedColumns: number
) => {
  if (!candidateCells.length || candidateCells.length >= expectedColumns) {
    return false
  }
  if (candidateCells.length === 1) {
    const trimmed = rawLine.trim()
    return !trimmed.startsWith('|')
  }
  return true
}

/**
 * Hermes 常输出 GitHub 风格任务清单，这里补成只读复选框，避免在消息区退化成普通无序列表。
 */
const renderTaskListItem = (content: string, checked: boolean) =>
  `<li class="task-list-item"><label class="task-list-item-label"><input class="task-list-item-checkbox" type="checkbox" disabled${checked ? ' checked' : ''} /><span>${renderInline(content)}</span></label></li>`

interface RenderHermesMarkdownOptions {
  /** 内层递归渲染思考内容时关闭 think 解析，避免重复包裹。 */
  enableThink?: boolean
  /** 给同一条消息内的思考块生成稳定键，便于流式更新时恢复展开状态。 */
  thinkBlockKeyPrefix?: string
  /** 根据思考块稳定键回填展开状态，避免流式吐字时 `<details>` 被整块重绘后又自动收起。 */
  isThinkBlockOpen?: (thinkBlockKey: string) => boolean
}

type ThinkBlockStatus = 'thinking' | 'done'

/**
 * 根据 `<think>` 片段是否已经收到结束标签，判断当前思考块仍在进行中还是已经完成。
 */
const resolveThinkBlockStatus = (rawThinkBlock: string): ThinkBlockStatus =>
  /<\/think>\s*$/i.test(rawThinkBlock) ? 'done' : 'thinking'

/**
 * Hermes 专用 Markdown 渲染器，支持 `<think>` 思考块、HTML 回退和表格归一化。
 */
const renderHermesMarkdownToHtmlInternal = (
  markdown?: string | null,
  options: RenderHermesMarkdownOptions = {}
) => {
  if (!markdown || !markdown.trim()) {
    return '<p>-</p>'
  }

  const thinkPlaceholders: string[] = []
  const normalizedMarkdown = options.enableThink === false
    ? markdown
    : markdown.replace(/<think\b[^>]*>([\s\S]*?)(?:<\/think>|$)/gi, (rawThinkBlock: string, content: string) => {
        const token = `__THINK_BLOCK_${thinkPlaceholders.length}__`
        const thinkHtml = renderHermesMarkdownToHtmlInternal(content.trim(), { enableThink: false })
        const thinkBlockKey = options.thinkBlockKeyPrefix
          ? `${options.thinkBlockKeyPrefix}-${thinkPlaceholders.length}`
          : ''
        const thinkStatus = resolveThinkBlockStatus(rawThinkBlock)
        const thinkLabel = thinkStatus === 'thinking' ? 'ReAct 推理中' : 'ReAct 推理完成'
        const thinkOpenAttr = thinkBlockKey && options.isThinkBlockOpen?.(thinkBlockKey) ? ' open' : ''
        const thinkDots = thinkStatus === 'thinking'
          ? '<span class="hermes-think-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>'
          : ''
        const thinkIcon = thinkStatus === 'thinking'
          ? '<span class="hermes-think-status-icon thinking" aria-hidden="true">◌</span>'
          : '<span class="hermes-think-status-icon done" aria-hidden="true">✓</span>'

        thinkPlaceholders.push(
          `<details class="hermes-think-block hermes-react-process-block is-${thinkStatus}"${thinkOpenAttr}${thinkBlockKey ? ` data-think-key="${escapeHtml(thinkBlockKey)}"` : ''}><summary><span class="hermes-think-summary-main">${thinkIcon}<span class="hermes-think-summary-label">${thinkLabel}</span>${thinkDots}</span></summary><div class="hermes-think-content">${thinkHtml}</div></details>`
        )
        return `\n${token}\n`
      })

  const lines = normalizeCollapsedMarkdownBlocks(normalizeRichHtmlMarkup(normalizedMarkdown)).replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let codeBlock: string[] | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${renderInline(paragraph.join('\n'))}</p>`)
    paragraph = []
  }

  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  const flushCodeBlock = () => {
    if (!codeBlock) return
    html.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`)
    codeBlock = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.replace(/\t/g, '    ')

    const thinkTokenMatch = line.trim().match(/^__THINK_BLOCK_(\d+)__$/)
    if (thinkTokenMatch) {
      flushParagraph()
      closeList()
      flushCodeBlock()
      html.push(thinkPlaceholders[Number(thinkTokenMatch[1])] || '')
      continue
    }

    if (line.trim().startsWith('```')) {
      flushParagraph()
      closeList()
      if (codeBlock) {
        flushCodeBlock()
      } else {
        codeBlock = []
      }
      continue
    }

    if (codeBlock) {
      codeBlock.push(line)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }

    if (isHorizontalRuleLine(line)) {
      flushParagraph()
      closeList()
      html.push('<hr />')
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s*(.+)$/)
    if (headingMatch) {
      flushParagraph()
      closeList()
      const level = headingMatch[1].length
      html.push(`<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`)
      continue
    }

    const blockquoteMatch = line.match(/^\s*>\s?(.*)$/)
    if (blockquoteMatch) {
      flushParagraph()
      closeList()
      const quoteLines = [blockquoteMatch[1].trim()]
      while (index + 1 < lines.length) {
        const nextQuoteLine = lines[index + 1].replace(/\t/g, '    ')
        const nextQuoteMatch = nextQuoteLine.match(/^\s*>\s?(.*)$/)
        if (!nextQuoteMatch) {
          break
        }
        quoteLines.push(nextQuoteMatch[1].trim())
        index += 1
      }
      html.push(`<blockquote><p>${renderInline(quoteLines.join('\n'))}</p></blockquote>`)
      continue
    }

    const taskListMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/)
    if (taskListMatch) {
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(renderTaskListItem(taskListMatch[2].trim(), taskListMatch[1].toLowerCase() === 'x'))
      continue
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/)
    if (ulMatch) {
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(`<li>${renderInline(ulMatch[1].trim())}</li>`)
      continue
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/)
    if (olMatch) {
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      html.push(`<li>${renderInline(olMatch[1].trim())}</li>`)
      continue
    }

    const nextLine = lines[index + 1]?.replace(/\t/g, '    ') || ''
    if (line.includes('|') && nextLine && isTableDividerLine(nextLine)) {
      flushParagraph()
      closeList()
      const headerCells = parseTableCells(line)

      // 当行首不含 | 且第一个单元格像独立标题（含 emoji 或明显偏长）时，拆出前置标题段落
      const trimmedLine = line.trim()
      const startsWithPipe = trimmedLine.startsWith('|')
      let effectiveHeaderCells = headerCells
      if (!startsWithPipe && headerCells.length >= 2) {
        const firstCell = headerCells[0]
        const otherCells = headerCells.slice(1)
        const avgOtherLen = otherCells.reduce((sum, c) => sum + c.length, 0) / otherCells.length
        const hasEmoji = /[\p{Emoji_Presentation}\p{Emoji}\u{200D}\u{FE0F}]/u.test(firstCell)
        if (hasEmoji || firstCell.length > Math.max(avgOtherLen * 2.2, 8)) {
          html.push(`<p>${renderInline(firstCell)}</p>`)
          effectiveHeaderCells = otherCells
        }
      }

      const bodyRows: string[][] = []
      index += 2

      while (index < lines.length) {
        const candidateLine = lines[index].replace(/\t/g, '    ')
        if (!candidateLine.trim()) {
          index -= 1
          break
        }
        if (!candidateLine.includes('|')) {
          if (!shouldMergePlainContinuationLine(candidateLine)
            || !mergeTableContinuationLine(bodyRows, candidateLine, effectiveHeaderCells.length)) {
            index -= 1
            break
          }
          index += 1
          continue
        }
        const candidateCells = parseTableCells(candidateLine)
        const appendedAsContinuation = shouldAppendTableCellsAsContinuation(candidateLine, candidateCells, effectiveHeaderCells.length)
          && mergeTableContinuationLine(bodyRows, candidateCells.join(' | '), effectiveHeaderCells.length)
        if (appendedAsContinuation) {
          index += 1
          continue
        }
        bodyRows.push(candidateCells)
        index += 1
      }

      html.push('<div class="hermes-table-wrap"><table><thead><tr>')
      effectiveHeaderCells.forEach((cell) => {
        html.push(`<th>${renderInline(cell)}</th>`)
      })
      html.push('</tr></thead>')

      if (bodyRows.length) {
        html.push('<tbody>')
        bodyRows.forEach((row) => {
          html.push('<tr>')
          row.forEach((cell) => {
            html.push(`<td>${renderInline(cell)}</td>`)
          })
          html.push('</tr>')
        })
        html.push('</tbody>')
      }

      html.push('</table></div>')
      continue
    }

    closeList()
    paragraph.push(line.trim())
  }

  flushParagraph()
  closeList()
  flushCodeBlock()

  return html.join('') || '<p>-</p>'
}

/**
 * Hermes 对外暴露的渲染入口。
 */
export const renderHermesMarkdownToHtml = (
  markdown?: string | null,
  options: Omit<RenderHermesMarkdownOptions, 'enableThink'> = {}
) => renderHermesMarkdownToHtmlInternal(markdown, { enableThink: true, ...options })
