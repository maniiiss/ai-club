import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('public brand assets', () => {
  it('exposes the GitPilot icon as the browser favicon', () => {
    const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const icon = readFileSync(new URL('../public/brand-icon.svg', import.meta.url), 'utf8')

    assert.match(index, /rel="icon"/)
    assert.match(index, /href="\/brand-icon\.svg"/)
    assert.match(index, /<title>GitPilot<\/title>/)
    assert.equal(existsSync(new URL('../public/brand-icon.svg', import.meta.url)), true)
    assert.match(icon, /aria-label="GitPilot"/)
    assert.match(icon, /git-branch/)
    assert.match(icon, /ai-spark/)
  })

  it('uses the shared brand mark in the public navigation entry points', () => {
    const topNav = readFileSync(new URL('../src/components/navigation/TopNav.tsx', import.meta.url), 'utf8')
    const sidebar = readFileSync(new URL('../src/components/navigation/Sidebar.tsx', import.meta.url), 'utf8')
    const authLayout = readFileSync(new URL('../src/layouts/AuthLayout.tsx', import.meta.url), 'utf8')

    assert.match(topNav, /BrandMark/)
    assert.match(sidebar, /BrandMark/)
    assert.match(authLayout, /BrandMark/)
  })
})
