import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const apiSource = readFileSync(new URL('../src/api/platformReleases.ts', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/layouts/ProductLayout.tsx', import.meta.url), 'utf8')
const dialogSource = readFileSync(new URL('../src/components/platformRelease/PlatformReleaseDialog.tsx', import.meta.url), 'utf8')

describe('platform release prompt', () => {
  it('uses dedicated pending and acknowledge endpoints', () => {
    assert.match(apiSource, /platform-releases\/pending/)
    assert.match(apiSource, /platform-releases\/\$\{releaseId\}\/acknowledge/)
  })

  it('loads the pending release in the protected public layout and acknowledges close', () => {
    assert.match(layoutSource, /getPendingPlatformRelease/)
    assert.match(layoutSource, /acknowledgePlatformRelease\(release\.id\)/)
    assert.match(layoutSource, /<PlatformReleaseDialog/)
  })

  it('renders Markdown content inside an accessible dialog', () => {
    assert.match(dialogSource, /<Markdown content=\{release\.content\}/)
    assert.match(dialogSource, /role="dialog"/)
    assert.match(dialogSource, /我知道了/)
  })
})
