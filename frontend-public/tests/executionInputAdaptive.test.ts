import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const executionPage = readFileSync(new URL('../src/pages/execution/ExecutionPage.tsx', import.meta.url), 'utf8')
const testPlanDetailPage = readFileSync(new URL('../src/pages/execution/TestPlanDetailPage.tsx', import.meta.url), 'utf8')

describe('execution search inputs', () => {
  it('uses the shared adaptive input for test plan and execution searches', () => {
    assert.ok((executionPage.match(/<Input\b/g) || []).length >= 2)
    assert.ok((executionPage.match(/adaptiveIcon/g) || []).length >= 2)
    assert.doesNotMatch(executionPage, /<Search className="absolute left-3 top-1\/2/)
  })

  it('uses the shared adaptive input for test case search', () => {
    assert.match(testPlanDetailPage, /<Input\b/)
    assert.match(testPlanDetailPage, /adaptiveIcon/)
    assert.doesNotMatch(testPlanDetailPage, /<Search className="absolute left-3 top-1\/2/)
  })
})
