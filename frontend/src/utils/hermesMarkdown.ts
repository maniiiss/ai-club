const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderInline = (value: string) => {
  const placeholders: string[] = []
  let text = escapeHtml(value)

  text = text.replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `__CODE_${placeholders.length}__`
    placeholders.push(`<code>${escapeHtml(code)}</code>`)
    return token
  })

  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt: string, url: string) => {
    const token = `__IMG_${placeholders.length}__`
    placeholders.push(`<img src="${url}" alt="${escapeHtml(alt)}" />`)
    return token
  })

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>')

  placeholders.forEach((placeholder, index) => {
    text = text.replace(`__CODE_${index}__`, placeholder)
    text = text.replace(`__IMG_${index}__`, placeholder)
  })

  return text
}

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
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

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
        const thinkLabel = thinkStatus === 'thinking' ? '思考中' : '已完成思考'
        const thinkOpenAttr = thinkBlockKey && options.isThinkBlockOpen?.(thinkBlockKey) ? ' open' : ''
        const thinkDots = thinkStatus === 'thinking'
          ? '<span class="hermes-think-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>'
          : ''
        const thinkIcon = thinkStatus === 'thinking'
          ? '<span class="hermes-think-status-icon thinking" aria-hidden="true">◌</span>'
          : '<span class="hermes-think-status-icon done" aria-hidden="true">✓</span>'

        thinkPlaceholders.push(
          `<details class="hermes-think-block is-${thinkStatus}"${thinkOpenAttr}${thinkBlockKey ? ` data-think-key="${escapeHtml(thinkBlockKey)}"` : ''}><summary><span class="hermes-think-summary-main">${thinkIcon}<span class="hermes-think-summary-label">${thinkLabel}</span>${thinkDots}</span></summary><div class="hermes-think-content">${thinkHtml}</div></details>`
        )
        return `\n${token}\n`
      })

  const lines = normalizeRichHtmlMarkup(normalizedMarkdown).replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let codeBlock: string[] | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${renderInline(paragraph.join('<br />'))}</p>`)
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

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      closeList()
      const level = headingMatch[1].length
      html.push(`<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`)
      continue
    }

    const blockquoteMatch = line.match(/^\s*>\s+(.*)$/)
    if (blockquoteMatch) {
      flushParagraph()
      closeList()
      html.push(`<blockquote>${renderInline(blockquoteMatch[1].trim())}</blockquote>`)
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
      const bodyRows: string[][] = []
      index += 2

      while (index < lines.length) {
        const candidateLine = lines[index].replace(/\t/g, '    ')
        if (!candidateLine.trim() || !candidateLine.includes('|')) {
          index -= 1
          break
        }
        bodyRows.push(parseTableCells(candidateLine))
        index += 1
      }

      html.push('<div class="hermes-table-wrap"><table><thead><tr>')
      headerCells.forEach((cell) => {
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
