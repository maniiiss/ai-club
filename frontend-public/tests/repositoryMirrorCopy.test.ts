import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('repository mirror copy', () => {
  it('uses repository mirror copy in public development UI', () => {
    const panel = readFileSync(resolve(__dirname, '../src/pages/development/OwnerRepoPushPanel.tsx'), 'utf8')
    const page = readFileSync(resolve(__dirname, '../src/pages/development/DevelopmentPage.tsx'), 'utf8')

    assert.ok(panel.includes('仓库镜像'))
    assert.ok(page.includes("label: '仓库镜像'"))
    assert.equal(panel.includes('业主仓库'), false)
    assert.equal(page.includes('业主仓库'), false)
  })
})
