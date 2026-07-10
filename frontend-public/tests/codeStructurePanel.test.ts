import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const typesSource = readFileSync(new URL('../src/types/development.ts', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../src/api/development.ts', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/development/DevelopmentPage.tsx', import.meta.url), 'utf8')

describe('public development code structure panel', () => {
  it('uses the backend code-structure snapshot contract instead of the removed file list contract', () => {
    assert.match(typesSource, /GitlabCodeStructureOverviewCardItem/)
    assert.match(typesSource, /GitlabCodeStructureCandidateSymbolItem/)
    assert.match(typesSource, /summaryMarkdown/)
    assert.match(typesSource, /graphNodes/)
    assert.doesNotMatch(typesSource, /totalFileCount/)
    assert.doesNotMatch(typesSource, /overviewMarkdown/)
  })

  it('exposes refresh, local query, and GitNexus launch APIs for the public panel', () => {
    assert.match(apiSource, /refreshGitlabCodeStructure/)
    assert.match(apiSource, /queryGitlabCodeStructure/)
    assert.match(apiSource, /launchGitlabBindingGitnexus/)
    assert.match(apiSource, /code-structure\/refresh/)
    assert.match(apiSource, /code-structure\/query/)
    assert.match(apiSource, /gitnexus-launch/)
  })

  it('renders operational controls and structured sections in the development tab', () => {
    assert.match(pageSource, /刷新结构/)
    assert.match(pageSource, /局部查询/)
    assert.match(pageSource, /打开全仓图/)
    assert.match(pageSource, /关键符号/)
    assert.match(pageSource, /执行流程/)
    assert.match(pageSource, /Harness 提示/)
  })

  it('keeps snapshot status visible before structured content is generated', () => {
    assert.match(pageSource, /hasCodeStructureSnapshotStatus/)
    assert.match(pageSource, /snapshotHasStatus/)
    assert.match(pageSource, /lastErrorMessage/)
  })

  it('guards code-structure requests against stale repository switches', () => {
    assert.match(pageSource, /requestSeqRef/)
    assert.match(pageSource, /activeRequest/)
    assert.match(pageSource, /if \(activeRequest !== requestSeqRef\.current\) return/)
  })

  it('allows the development tab strip to scroll on narrow screens', () => {
    assert.match(pageSource, /overflow-x-auto/)
    assert.match(pageSource, /min-w-max/)
  })
})
