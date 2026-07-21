import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HANDOFF_ERROR_CODES,
  HANDOFF_LIMITS,
  HandoffValidationError,
  validateHandoffEnvelope,
} from '../src/handoff/envelope.js'

const validEnvelope = () => ({
  protocolVersion: 'v1',
  sourceClient: { runtimeCode: 'PI_LOCAL', runtimeVersion: '0.73.1', cliVersion: '0.1.0' },
  conversationHistory: [
    { role: 'user', content: '继续完成登录功能' },
    { role: 'assistant', content: '已完成接口，待补前端测试' },
  ],
  summary: '已完成后端登录接口，待完成前端表单和测试',
  decisions: ['沿用现有 JWT 登录链路'],
  pendingItems: ['实现登录页', '运行前端测试'],
  workspace: { baseCommit: 'a'.repeat(40), handoffCommit: 'b'.repeat(40), currentBranch: 'feature/login' },
})

const assertCode = (callback: () => unknown, code: string) => {
  assert.throws(callback, (error) => error instanceof HandoffValidationError && error.code === code)
}

test('accepts and preserves a valid v1 envelope', () => {
  const value = validEnvelope()
  assert.deepEqual(validateHandoffEnvelope(value), value)
})

test('rejects unsupported versions, unknown fields and empty required fields', () => {
  const unsupported = { ...validEnvelope(), protocolVersion: 'v2' }
  assertCode(() => validateHandoffEnvelope(unsupported), HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED)

  const unknown = { ...validEnvelope(), extra: true }
  assertCode(() => validateHandoffEnvelope(unknown), HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED)

  const empty = validEnvelope()
  empty.workspace.currentBranch = ''
  assertCode(() => validateHandoffEnvelope(empty), HANDOFF_ERROR_CODES.PROTOCOL_UNSUPPORTED)
})

test('enforces UTF-8 byte limits for messages and context items', () => {
  const messageTooLarge = validEnvelope()
  messageTooLarge.conversationHistory = [{ role: 'user', content: '中'.repeat(HANDOFF_LIMITS.maxMessageBytes) }]
  assertCode(() => validateHandoffEnvelope(messageTooLarge), HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE)

  const itemTooLarge = validEnvelope()
  itemTooLarge.pendingItems = ['x'.repeat(HANDOFF_LIMITS.maxContextItemBytes + 1)]
  assertCode(() => validateHandoffEnvelope(itemTooLarge), HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE)
})

test('rejects sensitive values without returning their contents in the error', () => {
  const value = validEnvelope()
  value.summary = 'API_KEY=top-secret-value-123456'
  assertCode(() => validateHandoffEnvelope(value), HANDOFF_ERROR_CODES.SENSITIVE_CONTENT)

  const privateKey = validEnvelope()
  privateKey.pendingItems = ['-----BEGIN PRIVATE KEY-----']
  assertCode(() => validateHandoffEnvelope(privateKey), HANDOFF_ERROR_CODES.SENSITIVE_CONTENT)
})

test('rejects history and total envelope size limits', () => {
  const tooMany = validEnvelope()
  tooMany.conversationHistory = Array.from({ length: HANDOFF_LIMITS.maxHistoryMessages + 1 }, () => ({ role: 'user', content: 'x' }))
  assertCode(() => validateHandoffEnvelope(tooMany), HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE)

  const tooLarge = validEnvelope()
  tooLarge.summary = 'x'.repeat(HANDOFF_LIMITS.maxSummaryBytes + 1)
  assertCode(() => validateHandoffEnvelope(tooLarge), HANDOFF_ERROR_CODES.ENVELOPE_TOO_LARGE)
})
