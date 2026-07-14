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
  text = text.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  text = text.replace(/(\*{2}|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
  text = text.replace(/(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(?=\S)([\s\S]*?\S)(?<!_)_(?!_)/g, (_match, a: string, b: string) => `<em>${a ?? b}</em>`)
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')

  placeholders.forEach((placeholder, index) => {
    text = text.replace(`@@INLINE_PLACEHOLDER_${index}@@`, placeholder)
  })

  return text.replace(/\n/g, '<br />')
}

/**
 * 只修复工单号周围明确缺失的一个强调结束符。
 * 业务意图：普通正文的 `*`/`**` 不再由展示层猜测，避免清洗规则改变用户实际看到的内容。
 */
const normalizeInlineMarkdown = (value: string) =>
  value.replace(/(\*\*)((?:\\#)?\s*[A-Z0-9]{4,})\*(?=\s*(?:\n|$))/g, '$1$2**')

/**
 * 去掉 HTML 标签并回收常见实体，供 Assistant 思考区兼容 HTML 回退渲染时复用。
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
 * Assistant 经常返回少量 HTML 片段，这里先归一化再进入统一的 Markdown 渲染流程。
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
 * 将模型把编号正文误写成标题的行还原为普通文本。
 * 业务意图：管理端聊天室和 GitPilot 抽屉共用自定义渲染器，`##32等…`、`### 4 当前…`
 * 这类伪标题不能占用标题字号，否则数字会被视觉上放大成独立章节。
 */
const normalizeNumericHeadingLines = (markdown: string) =>
  markdown.replace(/^(\s{0,3})#{1,6}\s*(\d+\s*(?=[\u4e00-\u9fff（(]))(.*)$/gmu, '$1$2$3')

/**
 * 保护正文中的数字对象引用，避免项目 ID 被粘连标题修复器拆成大标题。
 * 业务意图：`CRM项目 #4` 中的 4 是项目 ID，应作为正文的一部分展示。
 */
const normalizeInlineNumericReferences = (markdown: string) =>
  markdown.split('\n').map((line) => {
    // 表格单元格中的工单号交给表格解析分支处理，避免改变列内原文。
    if (line.includes('|')) return line
    return line
      .replace(/([^\n])\s+#\s*([A-Z0-9]+)\b/g, '$1 \\#$2')
      .replace(/(^|[^\n])#(\s*)([A-Z0-9]{4,})\b/g, (match, prefix: string, spacing: string, ticketId: string, offset: number, fullText: string) => {
        const hashOffset = offset + prefix.length
        // 已经转义的井号和标题语法中的连续井号不能重复处理。
        if (fullText[hashOffset - 1] === '\\' || fullText[hashOffset - 1] === '#') {
          return match
        }
        return `${prefix}\\#${spacing}${ticketId}`
      })
  }).join('\n')

/**
 * Assistant 偶发会把标题、段落和表格头挤在同一行里，这里先做轻量纠偏，
 * 让后续统一的 Markdown 解析仍能识别出标题与表格结构。
 */
const normalizeCollapsedMarkdownBlocks = (markdown: string) =>
  markdown
    .replace(/^([^|\n#][^\n#]*?)(?<!\\)\s*(#{1,6})(?!#)([^\s#])/gm, '$1\n\n$2 $3')
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
 * Assistant 偶尔会把表格体中的一行拆成“前半行 + 下一行续写”，这里用列数做兜底合并。
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
 * Assistant 常输出 GitHub 风格任务清单，这里补成只读复选框，避免在消息区退化成普通无序列表。
 */
const renderTaskListItem = (content: string, checked: boolean) =>
  `<li class="task-list-item"><label class="task-list-item-label"><input class="task-list-item-checkbox" type="checkbox" disabled${checked ? ' checked' : ''} /><span>${renderInline(content)}</span></label></li>`

interface RenderAssistantMarkdownOptions {
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
 * Assistant 专用 Markdown 渲染器，支持 `<think>` 思考块、HTML 回退和表格归一化。
 */
const renderAssistantMarkdownToHtmlInternal = (
  markdown?: string | null,
  options: RenderAssistantMarkdownOptions = {}
) => {
  if (!markdown || !markdown.trim()) {
    return '<p>-</p>'
  }

  const thinkPlaceholders: string[] = []
  const normalizedMarkdown = options.enableThink === false
    ? markdown
    : markdown.replace(/<think\b[^>]*>([\s\S]*?)(?:<\/think>|$)/gi, (rawThinkBlock: string, content: string) => {
        const token = `__THINK_BLOCK_${thinkPlaceholders.length}__`
        const thinkHtml = renderAssistantMarkdownToHtmlInternal(content.trim(), { enableThink: false })
        const thinkBlockKey = options.thinkBlockKeyPrefix
          ? `${options.thinkBlockKeyPrefix}-${thinkPlaceholders.length}`
          : ''
        const thinkStatus = resolveThinkBlockStatus(rawThinkBlock)
        const thinkLabel = thinkStatus === 'thinking' ? 'ReAct 推理中' : 'ReAct 推理完成'
        const thinkOpenAttr = thinkBlockKey && options.isThinkBlockOpen?.(thinkBlockKey) ? ' open' : ''
        const thinkDots = thinkStatus === 'thinking'
          ? '<span class="assistant-think-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>'
          : ''
        const thinkIcon = thinkStatus === 'thinking'
          ? '<span class="assistant-think-status-icon thinking" aria-hidden="true">◌</span>'
          : '<span class="assistant-think-status-icon done" aria-hidden="true">✓</span>'

        thinkPlaceholders.push(
          `<details class="assistant-think-block assistant-process-block is-${thinkStatus}"${thinkOpenAttr}${thinkBlockKey ? ` data-think-key="${escapeHtml(thinkBlockKey)}"` : ''}><summary><span class="assistant-think-summary-main">${thinkIcon}<span class="assistant-think-summary-label">${thinkLabel}</span>${thinkDots}</span></summary><div class="assistant-think-content">${thinkHtml}</div></details>`
        )
        return `\n${token}\n`
      })

  const lines = normalizeCollapsedMarkdownBlocks(normalizeNumericHeadingLines(normalizeInlineNumericReferences(normalizeRichHtmlMarkup(normalizedMarkdown)))).replace(/\\#(?=[A-Z0-9])/g, '#').replace(/\r\n/g, '\n').split('\n')
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

      html.push('<div class="assistant-table-wrap"><table><thead><tr>')
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
 * Assistant 对外暴露的渲染入口。
 */
export const renderAssistantMarkdownToHtml = (
  markdown?: string | null,
  options: Omit<RenderAssistantMarkdownOptions, 'enableThink'> = {}
) => renderAssistantMarkdownToHtmlInternal(markdown, { enableThink: true, ...options })
