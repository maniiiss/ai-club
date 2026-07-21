import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { normalizePiEvent, normalizeThinkingLevel, resolvePiModel, toPiHistoryMessages } from '@aiclub/gitpilot-agent-core'
import { isDangerousShell } from '../src/local-tools.js'
import { filterMenuItems, TerminalUi } from '../src/terminal-ui.js'

test('CLI uses a platform proxy URL while preserving provider protocol', () => {
  const model = resolvePiModel('openai', 'platform-model', 'http://localhost:8080/api/cli/model-sessions/demo')
  assert.equal(model.id, 'platform-model')
  assert.equal(model.baseUrl, 'http://localhost:8080/api/cli/model-sessions/demo')
  assert.equal(model.api, 'openai-completions')
})

test('CLI converts standard history and rejects unsafe shell commands', () => {
  const model = resolvePiModel('openai', 'platform-model', 'http://localhost:8080/proxy')
  const history = toPiHistoryMessages([{ role: 'user', content: '读取文件' }, { role: 'assistant', content: '好的' }], model)
  assert.equal(history.length, 2)
  assert.equal(history[1].content[0].text, '好的')
  assert.equal(normalizeThinkingLevel('HIGH'), 'high')
  assert.equal(isDangerousShell('git reset --hard HEAD'), true)
  assert.equal(isDangerousShell('npm test'), false)
})

test('CLI and pi-runtime consume the same canonical event names', () => {
  assert.deepEqual(normalizePiEvent({
    type: 'tool_execution_start',
    toolCallId: 'call-1',
    toolName: 'local__git_status',
    args: {},
  }), {
    eventType: 'TOOL_CALL_REQUESTED',
    payload: { toolCallId: 'call-1', toolName: 'local__git_status', args: {} },
  })
  assert.deepEqual(normalizePiEvent({
    type: 'message_update',
    assistantMessageEvent: { type: 'text_delta', delta: '继续' },
  }), { eventType: 'TEXT_DELTA', payload: { delta: '继续' } })
})

test('slash command menu filters as soon as a command prefix is entered', () => {
  const commands = [
    { value: '/models', label: '/models', description: '切换模型' },
    { value: '/status', label: '/status', description: '查看当前状态' },
    { value: '/exit', label: '/exit', description: '退出 GitPilot' },
  ] as const
  assert.deepEqual(filterMenuItems('/', commands).map((item) => item.value), ['/models', '/status', '/exit'])
  assert.deepEqual(filterMenuItems('/mo', commands).map((item) => item.value), ['/models'])
  assert.deepEqual(filterMenuItems('fix', commands), [])
})

test('core exposes streaming lifecycle events for the terminal UI', () => {
  assert.deepEqual(normalizePiEvent({ type: 'agent_start' }), { eventType: 'STREAM_STARTED', payload: {} })
  assert.deepEqual(normalizePiEvent({
    type: 'message_update',
    assistantMessageEvent: { type: 'text_start', contentIndex: 0 },
  }), { eventType: 'TEXT_START', payload: { contentIndex: 0 } })
  assert.deepEqual(normalizePiEvent({
    type: 'message_update',
    assistantMessageEvent: { type: 'error', errorMessage: '模型不可用' },
  }), { eventType: 'STREAM_ERROR', payload: { errorMessage: '模型不可用' } })
})

test('terminal UI opens, navigates and closes the slash menu in raw mode', async () => {
  class FakeInput extends EventEmitter {
    isTTY = true
    rawMode = false
    setRawMode(value: boolean) { this.rawMode = value; return this }
    resume() { return this }
  }
  class FakeOutput {
    isTTY = true
    columns = 100
    chunks: string[] = []
    write(value: string) { this.chunks.push(value); return true }
  }

  const input = new FakeInput()
  const output = new FakeOutput()
  const commands = [
    { value: '/models', label: '/models', description: '切换模型' },
    { value: '/status', label: '/status', description: '查看当前状态' },
  ] as const
  const ui = new TerminalUi({ input: input as never, output: output as never })
  const line = ui.readLine('❯ ', (buffer) => filterMenuItems(buffer, commands))

  input.emit('keypress', '/', { name: '/' })
  assert.match(output.chunks.join(''), /\/models/)
  input.emit('keypress', '', { name: 'down' })
  input.emit('keypress', '', { name: 'enter' })
  assert.equal(await line, '/status')
  assert.equal(input.rawMode, false)

  const secondInput = new FakeInput()
  const secondOutput = new FakeOutput()
  const secondUi = new TerminalUi({ input: secondInput as never, output: secondOutput as never })
  const secondLine = secondUi.readLine('❯ ', (buffer) => filterMenuItems(buffer, commands))
  secondInput.emit('keypress', '/', { name: '/' })
  secondInput.emit('keypress', '', { name: 'escape' })
  secondInput.emit('keypress', 'x', { name: 'x' })
  secondInput.emit('keypress', '', { name: 'enter' })
  assert.equal(await secondLine, 'x')
  assert.equal(secondInput.rawMode, false)
})

test('terminal UI falls back to readline when stdin is not a TTY', async () => {
  const input = new PassThrough()
  Object.defineProperty(input, 'isTTY', { value: false })
  const output = { isTTY: false, write: () => true }
  const ui = new TerminalUi({ input: input as never, output: output as never })
  const line = ui.readLine('❯ ')
  input.end('普通输入\n')
  assert.equal(await line, '普通输入')
})
