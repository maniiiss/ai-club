import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot unified theme contract', () => {
  it('defines the five shared theme ids and account sync endpoint', () => {
    const theme = readFileSync(new URL('../src/lib/theme.ts', import.meta.url), 'utf8')
    const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
    const authApi = readFileSync(new URL('../src/api/auth.ts', import.meta.url), 'utf8')

    for (const id of ['deep-sea', 'ocean-mist', 'signal-teal', 'paper-white', 'carbon-black']) {
      assert.match(theme, new RegExp(`key: '${id}'`))
      assert.match(tokens, new RegExp(`data-theme="${id}"`))
    }
    assert.match(tokens, /--auth-page-background: #080c12/i)
    assert.match(tokens, /--color-bg-page: #ffffff/i)
    assert.match(theme, /gitpilot-theme/)
    assert.match(authApi, /\/api\/auth\/theme/)
  })
})
