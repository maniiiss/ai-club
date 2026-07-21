import { normalizePiEvent } from '@aiclub/gitpilot-agent-core'

const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR)
const paint = (code: string, value: string) => useColor ? `\u001b[${code}m${value}\u001b[0m` : value

export interface GitPilotBannerOptions {
  model: string
  platformUrl: string
  workspace: string
}

const PIXEL_FONT: Record<string, readonly string[]> = {
  G: ['01110', '10000', '10000', '10111', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
}

const renderWordmark = (value: string) => {
  const rows = Array.from({ length: 7 }, (_, row) => [...value.toUpperCase()]
    .map((character) => PIXEL_FONT[character]?.[row] || '     ')
    .join(' ')
    .replaceAll('0', ' ')
    .replaceAll('1', '█'))
  const width = rows[0]?.length || 0
  const columns = process.stdout.columns || 80
  const indent = ' '.repeat(Math.max(2, Math.floor((columns - width) / 2)))
  return rows.map((row, index) => `${indent}${index < 3 ? paint('90', row) : paint('1;97', row)}`)
}

/** 展示 GitPilot 自有的 Coding Agent 启动界面，避免把底层 Agent 实现名称暴露给用户。 */
export const printGitPilotBanner = ({ model, platformUrl, workspace }: GitPilotBannerOptions) => {
  const accent = (value: string) => paint('38;5;75', value)
  const bright = (value: string) => paint('1;97', value)
  const muted = (value: string) => paint('90', value)
  const tip = (value: string) => paint('38;5;214', value)

  const lines = [
    '',
    ...renderWordmark('GitPilot'),
    '',
    `   ${accent('┃')} ${muted('Ask anything...')} ${bright('"Fix broken tests"')}`,
    `   ${accent('┃')} ${accent('Model')} ${muted('·')} ${bright(model)}`,
    '',
    `   ${muted('Workspace')} ${accent('·')} ${workspace}    ${muted('Platform')} ${accent('·')} ${platformUrl}`,
    '',
    `   ${muted('/')} ${muted('commands')}    ${muted('↑↓')} ${muted('select')}`,
    '',
    `   ${tip('● Tip')} ${muted('GitPilot can inspect, edit and test the current repository.')}`,
    `   ${muted('Type / for commands · exit or Ctrl+C to quit.')}`,
    '',
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
}

/** 将 Agent 事件输出为适合终端阅读的 UTF-8 文本，不打印任何凭据字段。 */
export const printAgentEvent = (event: any) => {
  const normalized = normalizePiEvent(event)
  if (!normalized) return
  if (normalized.eventType === 'STREAM_STARTED') process.stdout.write(`\n${paint('38;5;75', '●')} ${paint('90', 'thinking...')}\n`)
  if (normalized.eventType === 'THINKING_START') process.stdout.write(`${paint('90', '  thinking')} `)
  if (normalized.eventType === 'THINKING_DELTA') process.stdout.write(normalized.payload.delta || '')
  if (normalized.eventType === 'THINKING_END') process.stdout.write('\n')
  if (normalized.eventType === 'TEXT_START') process.stdout.write('\n\n')
  if (normalized.eventType === 'TEXT_DELTA') process.stdout.write(normalized.payload.delta || '')
  if (normalized.eventType === 'TEXT_END') process.stdout.write('\n')
  if (normalized.eventType === 'TOOL_CALL_REQUESTED') {
    const toolName = normalized.payload.toolName || normalized.payload.toolCall?.name || 'unknown'
    process.stdout.write(`\n${paint('38;5;214', '⚙')} ${toolName}\n`)
  }
  if (normalized.eventType === 'TOOL_PROGRESS') process.stdout.write(`${paint('90', '  ⠋ running...')}\n`)
  if (normalized.eventType === 'TOOL_FINISHED') process.stdout.write(`${paint('90', '  ✓ done')}\n`)
  if (normalized.eventType === 'STREAM_FINISHED') process.stdout.write('\n')
  // 错误由 prompt 级别统一打印，避免底层事件和 Promise reject 重复显示。
  return normalized
}
