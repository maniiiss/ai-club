import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('model usage page separates model and user token dimensions', async () => {
  const [apiSource, pageSource] = await Promise.all([
    read('src/api/model-usage.ts'),
    read('src/views/ModelUsageStatsView.vue')
  ])

  assert.match(apiSource, /interface UserBreakdown/)
  assert.match(apiSource, /\/api\/model-usage-stats\/by-user/)
  assert.match(apiSource, /modelConfigName: string \| null/)
  assert.doesNotMatch(apiSource, /uniqueUsers|uniqueUserNames/)
  assert.match(pageSource, /用户 Token 用量/)
  assert.match(pageSource, /getModelUsageByUser\(\{ \.\.\.buildPayload\(\), limit: 20 \}\)/)
  assert.doesNotMatch(pageSource, /label="独立用户"|uniqueUsers|uniqueUserNames|sortByUniqueUsers/)
})

test('model usage ranking prefers model configuration names and falls back to actual names', async () => {
  const [apiSource, pageSource] = await Promise.all([
    read('src/api/model-usage.ts'),
    read('src/views/ModelUsageStatsView.vue')
  ])

  assert.match(apiSource, /modelConfigName: string \| null/)
  assert.match(pageSource, /const names = rows\.map\(\(r\) => r\.modelConfigName \|\| r\.modelName\)/)
})

test('model usage trend gives the token and hit-rate axes separate right offsets', async () => {
  const pageSource = await read('src/views/ModelUsageStatsView.vue')

  assert.match(pageSource, /right: 112/)
  assert.match(pageSource, /name: 'Token 数'[\s\S]*position: 'right'[\s\S]*offset: 56/)
  assert.match(pageSource, /name: '命中率'[\s\S]*position: 'right'[\s\S]*offset: 0/)
})
