import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildGitlabTagPayload, resolveDefaultTagBranch } from '../src/lib/gitlabTagUtils'
import type { GitlabBranchItem } from '../src/types/development'

describe('gitlab tag utilities', () => {
  it('prefers binding default target branch when resolving the default tag source branch', () => {
    const branches: Pick<GitlabBranchItem, 'name' | 'defaultBranch'>[] = [
      { name: 'main', defaultBranch: true },
      { name: 'release/a', defaultBranch: false },
    ]

    assert.equal(resolveDefaultTagBranch('develop', branches), 'develop')
  })

  it('falls back to GitLab default branch and then first branch', () => {
    assert.equal(resolveDefaultTagBranch('', [
      { name: 'main', defaultBranch: true },
      { name: 'release/a', defaultBranch: false },
    ]), 'main')
    assert.equal(resolveDefaultTagBranch('', [
      { name: 'feature/x', defaultBranch: false },
    ]), 'feature/x')
  })

  it('trims tag payload and omits blank message', () => {
    assert.deepEqual(buildGitlabTagPayload({
      tagName: ' v1.2.0 ',
      branchName: ' main ',
      message: '   ',
    }), {
      tagName: 'v1.2.0',
      branchName: 'main',
      message: undefined,
    })
  })
})
