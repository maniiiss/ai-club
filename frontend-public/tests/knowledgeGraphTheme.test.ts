import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot knowledge graph theme contract', () => {
  it('derives canvas colors from the active theme and uses themed overlay surfaces', () => {
    const graph = readFileSync(new URL('../src/components/knowledge/KnowledgeGraphView.tsx', import.meta.url), 'utf8')

    assert.match(graph, /MutationObserver/)
    assert.match(graph, /data-theme/)
    assert.match(graph, /canvasBackground/)
    assert.match(graph, /backgroundColor=\{graphTheme\.canvasBackground\}/)
    assert.doesNotMatch(graph, /backgroundColor="#fafbff"/)
    assert.match(graph, /bg-\[var\(--color-bg-elevated\)\]/)
    assert.match(graph, /bg-\[var\(--color-bg-card\)\]/)
  })
})
