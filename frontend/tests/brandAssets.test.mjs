import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('admin brand assets', () => {
  it('exposes the GitPilot favicon with Git and AI visual marks', () => {
    const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const icon = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')

    assert.match(index, /href="\/favicon\.svg"/)
    assert.match(icon, /aria-label="GitPilot"/)
    assert.match(icon, /git-branch/)
    assert.match(icon, /ai-spark/)
    assert.equal(existsSync(new URL('../public/favicon.svg', import.meta.url)), true)
  })
})
