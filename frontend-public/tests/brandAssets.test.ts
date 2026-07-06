import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('public brand assets', () => {
  it('exposes the AI Club icon as the browser favicon', () => {
    const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

    assert.match(index, /rel="icon"/)
    assert.match(index, /href="\/brand-icon\.svg"/)
    assert.equal(existsSync(new URL('../public/brand-icon.svg', import.meta.url)), true)
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
