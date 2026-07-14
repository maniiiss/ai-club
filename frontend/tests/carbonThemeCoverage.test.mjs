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
      '.notification-item',
      '.api-studio-home-card',
      '.wiki-workbench',
      '.execution-detail-hero',
      '.execution-artifact-markdown',
      '.el-dialog.platform-form-dialog .el-dialog__footer',
      '.agent-tab-switcher',
      '.agent-list-row .management-list-title',
      '.atelier-data-head-item',
      '.management-list-title',
      '.management-list-footer',
      '.el-tabs__item',
      '.el-dialog__header',
      '.server-card',
      '.model-tab-switcher',
      '.agent-usage-page .hero',
      '.agent-usage-page .tabs-section',
      '.execution-artifact-markdown .md-editor-preview code',
      '.el-loading-mask',
      '.gitlab-overview-card',
      '.gitlab-main-card',
      '.gitlab-log-detail-shell',
      '.self-upgrade-card',
      '.self-upgrade-collapse-item',
      '.self-upgrade-markdown-shell',
      '.el-picker__popper',
      '.el-date-table-cell',
      '.el-time-spinner__item',
    ]) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')
      assert.match(styles, new RegExp(`data-theme="carbon-black"[\\s\\S]*${escapedSelector}`), selector)
    }
    assert.match(layout, /class="layout-aside"/)
    assert.match(layout, /class="layout-header"/)
  })

  it('keeps GitLab, self-upgrade and picker-specific hooks present', () => {
    const gitlab = readFileSync(new URL('../src/views/GitlabView.vue', import.meta.url), 'utf8')
    const selfUpgrade = readFileSync(new URL('../src/views/SelfUpgradeCenterView.vue', import.meta.url), 'utf8')

    for (const selector of [
      'gitlab-page',
      'gitlab-overview-card',
      'gitlab-main-card',
      'gitlab-log-detail-shell',
      'self-upgrade-page',
      'self-upgrade-card',
      'self-upgrade-collapse-item',
      'self-upgrade-markdown-shell',
    ]) {
      assert.match(`${gitlab}\n${selfUpgrade}`, new RegExp(selector), selector)
    }
  })
})
