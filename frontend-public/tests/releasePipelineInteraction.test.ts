import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const source = readFileSync(new URL('../src/pages/release/panels/PipelinesPanel.tsx', import.meta.url), 'utf8')
const logsSource = readFileSync(new URL('../src/pages/release/panels/LogsPanel.tsx', import.meta.url), 'utf8')
const inputSource = readFileSync(new URL('../src/components/common/Input.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

describe('release pipeline interaction stability', () => {
  it('isolates loading state by pipeline action instead of the whole entry', () => {
    assert.match(source, /const actionKey =/)
    assert.match(source, /setActionLoading\(actionKey\(entry\.entryType, entry\.entryId, 'detail'\)\)/)
    assert.match(source, /setActionLoading\(actionKey\(entry\.entryType, entry\.entryId, 'sync'\)\)/)
    assert.match(source, /actionLoading === actionKey\(entry\.entryType, entry\.entryId, 'trigger'\)/)
    assert.doesNotMatch(source, /actionLoading === entry\.entryId/)
  })

  it('keeps the search focus state to one local ring and stabilizes text actions', () => {
    assert.match(source, /<Input\b/)
    assert.match(logsSource, /<Input\b/)
    assert.doesNotMatch(source, /release-pipeline-search/)
    assert.doesNotMatch(logsSource, /<input\b/)
    assert.match(inputSource, /adaptiveIcon\?: boolean/)
    assert.match(inputSource, /size\?: 'sm' \| 'md'/)
    assert.match(inputSource, /wrapperClassName\?: string/)
    assert.match(inputSource, /common-input-control--adaptive-icon/)
    assert.match(css, /\.common-input-control--adaptive-icon:focus-visible\s*\{[\s\S]*?outline:\s*none/)
    assert.match(css, /@container common-input \(max-width: 280px\)/)
    assert.match(css, /\.common-input-control--adaptive-icon:focus\s*\{[\s\S]*?box-shadow:\s*none/)

    const actionStart = source.indexOf('{/* 操作按钮 */}')
    const actionEnd = source.indexOf('{entry.primaryUrl', actionStart)
    const actionArea = source.slice(actionStart, actionEnd)
    const buttons = actionArea.match(/<button\b[^>]*>/g) || []
    assert.ok(buttons.length >= 7)
    assert.ok(buttons.every((button) => /type="button"/.test(button)))
    assert.match(source, /const pipelineActionButtonClass = .*focus-visible:outline-none focus-visible:ring-2/)
  })
})
