import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('助手反馈原因按钮布局', () => {
  it('选中态保留边框占位，避免 flex 行布局抖动', () => {
    const source = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')

    assert.match(source, /aria-pressed=\{feedbackDialog\.reasonCodes\.includes\(value\)\}/)
    assert.match(source, /\? 'rounded-full border border-rose-100 bg-rose-100/)
    assert.match(source, /: 'rounded-full border border-\[var\(--color-border\)\]/)
  })
})
