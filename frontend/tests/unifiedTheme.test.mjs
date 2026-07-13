import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot unified theme contract', () => {
  it('shares the public theme ids and account sync endpoint', () => {
    const theme = readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8')
    const authApi = readFileSync(new URL('../src/api/auth.ts', import.meta.url), 'utf8')

    for (const id of ['deep-sea', 'ocean-mist', 'signal-teal']) {
      assert.match(theme, new RegExp(`id: '${id}'`))
    }
    assert.match(theme, /gitpilot-theme/)
    assert.match(authApi, /\/api\/auth\/theme/)
  })
})
