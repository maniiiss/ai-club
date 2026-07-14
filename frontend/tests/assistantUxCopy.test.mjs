import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Assistant drawer exposes assistant boundary copy through header tooltip instead of inline paragraphs', async () => {
  const source = await readFile(new URL('../src/components/AssistantDrawer.vue', import.meta.url), 'utf8')

  assert.match(source, /QuestionFilled/)
  assert.match(source, /el-tooltip/)
  assert.match(source, /平台内协作助手/)
  assert.match(source, /不会直接代替外部浏览器、联网搜索/)
  assert.doesNotMatch(source, /<p>{{ assistantEmptyStateIntro }}<\/p>/)
  assert.doesNotMatch(source, /<p class="hermes-section-description">{{ assistantPromptSectionDescription }}<\/p>/)
})

test('Assistant drawer keeps confirmation flow concise without expanded inline explanation blocks', async () => {
  const source = await readFile(new URL('../src/components/AssistantDrawer.vue', import.meta.url), 'utf8')

  assert.match(source, /需要你确认后继续/)
  assert.doesNotMatch(source, /<p class="hermes-section-description">{{ assistantSelectionHint }}<\/p>/)
  assert.doesNotMatch(source, /<p class="hermes-section-description">{{ assistantActionHint }}<\/p>/)
  assert.doesNotMatch(source, /<small class="hermes-inline-note">确认后才会真正创建或执行。<\/small>/)
})

test('Assistant stream interruption copy tells users they can retry or continue with existing confirmations', async () => {
  const source = await readFile(new URL('../src/api/assistant.ts', import.meta.url), 'utf8')

  assert.match(source, /连接已中断，可直接重试；如果页面里已经出现确认卡片，也可以继续使用当前结果/)
})

test('Assistant drawer initializes footerDisabled before slash menu visibility', async () => {
  const source = await readFile(new URL('../src/components/AssistantDrawer.vue', import.meta.url), 'utf8')

  const footerDisabledIndex = source.indexOf('const footerDisabled = computed(')
  const slashMenuVisibleIndex = source.indexOf('const slashMenuVisible = computed(')
  assert.ok(footerDisabledIndex >= 0)
  assert.ok(slashMenuVisibleIndex > footerDisabledIndex)
})
