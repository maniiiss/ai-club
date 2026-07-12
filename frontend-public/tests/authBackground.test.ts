import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot authentication background', () => {
  it('mounts the animated Git branch background in the auth layout', () => {
    const layout = readFileSync(new URL('../src/layouts/AuthLayout.tsx', import.meta.url), 'utf8')
    const background = readFileSync(new URL('../src/components/auth/AuthBackground.tsx', import.meta.url), 'utf8')
    const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

    assert.match(layout, /<AuthBackground \/>/)
    assert.match(background, /data-auth-background/)
    assert.match(background, /git-branch-route/)
    assert.match(background, /auth-background-particle/)
    assert.match(styles, /auth-background-particle-drift/)
    assert.match(styles, /prefers-reduced-motion: reduce/)
    assert.match(layout, /auth-theme-gitpilot/)
    assert.match(layout, /auth-background-seam/)
    assert.match(styles, /#071722/)
    assert.match(layout, /#dce5ec/)
    assert.match(styles, /#2f6bff/)
    assert.match(background, /#55d6c2/)
  })
})
