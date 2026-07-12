import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRequirementAiImageMarkdown } from '../src/utils/requirementAiImageMarkdown.ts'

test('管理端将 AI 结果中的图片 URL 规范为 Markdown 图片', () => {
  assert.equal(
    normalizeRequirementAiImageMarkdown('原型： https://foruda.gitee.com/images/demo.jpg'),
    '原型： ![图片](https://foruda.gitee.com/images/demo.jpg)',
  )
})

test('管理端不转换代码块中的图片 URL', () => {
  const markdown = '```\nhttps://example.com/demo.png\n```'
  assert.equal(normalizeRequirementAiImageMarkdown(markdown), markdown)
})

test('管理端支持后端生成的平台图片路径', async () => {
  assert.equal(
    normalizeRequirementAiImageMarkdown('原型： /api/common/public-files/501?inline=true'),
    '原型： ![图片](/api/common/public-files/501?inline=true)',
  )
})
