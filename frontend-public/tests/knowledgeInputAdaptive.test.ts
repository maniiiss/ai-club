import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const wikiPage = readFileSync(new URL('../src/pages/knowledge/KnowledgePage.tsx', import.meta.url), 'utf8')
const apiStudio = readFileSync(new URL('../src/pages/knowledge/ApiStudioPanel.tsx', import.meta.url), 'utf8')
const graphView = readFileSync(new URL('../src/components/knowledge/KnowledgeGraphView.tsx', import.meta.url), 'utf8')

describe('knowledge search inputs', () => {
  it('uses the shared adaptive input for Wiki and API searches', () => {
    assert.match(wikiPage, /<Input\b[\s\S]*adaptiveIcon/)
    assert.match(apiStudio, /<Input\b[\s\S]*adaptiveIcon/)
    assert.doesNotMatch(wikiPage, /<Search className="absolute left-3 top-1\/2/)
    assert.doesNotMatch(apiStudio, /<Search className="absolute left-2\.5 top-1\/2/)
  })

  it('places Wiki search inside the selected space and scopes it to that space', () => {
    const listSection = wikiPage.slice(wikiPage.indexOf('// ── 空间列表'), wikiPage.indexOf('// ── 空间详情'))
    const detailSection = wikiPage.slice(wikiPage.indexOf('// ── 空间详情'))
    assert.doesNotMatch(listSection, /<Input\b/)
    assert.match(detailSection, /搜索当前 Wiki 页面…/)
    assert.match(detailSection, /absolute left-0 right-0 top-full z-30/)
    assert.match(wikiPage, /searchWikiPages\(\{ keyword, spaceId: selectedSpace\.id \}\)/)
    assert.doesNotMatch(wikiPage, /searchWikiPages\(\{ keyword, projectId: pid \}\)/)
    assert.doesNotMatch(listSection, /shadow-\[var\(--shadow-card\)/)
  })

  it('uses the shared adaptive input for knowledge graph search', () => {
    assert.match(graphView, /import .*Input.*from ['"]@\/src\/components\/common\/Input['"]|import .*Input from ['"]@\/src\/components\/common\/Input['"] /)
    assert.match(graphView, /<Input\b[\s\S]*adaptiveIcon/)
    assert.doesNotMatch(graphView, /<input\b/)
  })
})
