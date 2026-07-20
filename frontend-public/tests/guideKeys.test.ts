import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { GUIDE_PAGE_KEYS, getAllGuidePageKeys } from '../src/components/guide/guideSteps'

describe('public onboarding guide keys', () => {
  it('uses chat and development as the only assistant/development guide page keys', () => {
    assert.deepEqual(GUIDE_PAGE_KEYS, [
      'dashboard', 'projects', 'chat', 'development',
      'project-detail', 'planning', 'knowledge', 'testing',
      'test-plan-detail', 'execution', 'execution-task-detail',
      'assistant',
    ])
    assert.deepEqual(getAllGuidePageKeys(), GUIDE_PAGE_KEYS)
    const pageKeys: readonly string[] = GUIDE_PAGE_KEYS
    assert.equal(pageKeys.includes('ai-assistant'), false)
    assert.equal(pageKeys.includes('dev-tools'), false)
  })

  it('uses the replay wording in the top navigation menu', () => {
    const source = readFileSync(new URL('../src/components/navigation/TopNav.tsx', import.meta.url), 'utf8')

    assert.match(source, /重播新手引导/)
    assert.doesNotMatch(source, /重新播放新手引导/)
  })
})
