import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('management carbon theme coverage', () => {
  it('covers shared layout, list and Element Plus surfaces', () => {
    const styles = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8')
    const layout = readFileSync(new URL('../src/layout/AppLayout.vue', import.meta.url), 'utf8')

    for (const selector of [
      '.layout-aside',
      '.layout-header',
      '.page-card',
      '.management-list-shell',
      '.task-table-shell',
      '.atelier-table-shell',
      '.el-table',
      '.el-button--default',
      '.platform-form-section',
      '.project-kpi-card',
      '.wiki-space-card',
      '.profile-theme-card',
      '.execution-kpi-card',
      '.orchestration-editor-card',
      '.api-studio-editor-shell',
      '.benchmark-metric-table',
      '.hermes-footer',
    ]) {
      assert.match(styles, new RegExp(`data-theme="carbon-black"[\\s\\S]*${selector.replace('.', '\\.')}`), selector)
    }
    assert.match(layout, /class="layout-aside"/)
    assert.match(layout, /class="layout-header"/)
  })
})
