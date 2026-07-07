import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { describe, it } from 'node:test'
import { globSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

describe('public UI harness', () => {
  it('keeps native clickable controls on a hand cursor despite the default body cursor', () => {
    assert.match(css, /button:not\(:disabled\)/)
    assert.match(css, /a\[href\]/)
    assert.match(css, /cursor:\s*pointer/)
  })

  it('uses the shared Select component instead of raw select tags in app source', () => {
    const sourceRoot = new URL('../src/', import.meta.url)
    const files = globSync('**/*.{tsx,ts}', {
      cwd: sourceRoot,
      exclude: ['components/common/Select.tsx'],
    })

    const offenders = files.filter((file) => {
      const content = readFileSync(new URL(file, sourceRoot), 'utf8')
      return /<select\b/.test(content) || /<option\b/.test(content)
    })

    assert.deepEqual(
      offenders.map((file) => relative(sourceRoot.pathname, new URL(file, sourceRoot).pathname)),
      [],
      '公众端下拉应统一使用 components/common/Select，避免原生 select 样式和交互漂移',
    )
  })
})
