import { normalizePiEvent } from '@aiclub/gitpilot-agent-core'

/** 将 Pi 事件输出为适合终端阅读的 UTF-8 文本，不打印任何凭据字段。 */
export const printPiEvent = (event: any) => {
  const normalized = normalizePiEvent(event)
  if (!normalized) return
  if (normalized.eventType === 'TEXT_DELTA') process.stdout.write(normalized.payload.delta || '')
  if (normalized.eventType === 'THINKING_START') process.stdout.write('\n[思考] ')
  if (normalized.eventType === 'THINKING_DELTA') process.stdout.write(normalized.payload.delta || '')
  if (normalized.eventType === 'THINKING_END') process.stdout.write('\n')
  if (normalized.eventType === 'TOOL_CALL_STARTED') process.stderr.write(`\n[工具] ${normalized.payload.toolName || normalized.payload.toolCall?.name || ''}\n`)
  if (normalized.eventType === 'TOOL_CALL_FINISHED') process.stderr.write('[工具完成]\n')
}
