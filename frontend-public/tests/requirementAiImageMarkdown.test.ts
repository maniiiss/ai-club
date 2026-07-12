import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRequirementAiImageMarkdown } from '../src/lib/requirementAiImageMarkdown'

test('将标准化结果中的独立图片 URL 转为 Markdown 图片', () => {
  const markdown = '原型参考： https://foruda.gitee.com/images/demo.png （单行展示效果）'

  assert.equal(
    normalizeRequirementAiImageMarkdown(markdown),
    '原型参考： ![图片](https://foruda.gitee.com/images/demo.png) （单行展示效果）',
  )
})

test('将同目标普通 Markdown 链接转为图片并保留已有图片语法', () => {
  const markdown = [
    '[弹窗效果](https://example.com/dialog.webp)',
    '![已有说明](https://example.com/existing.png)',
  ].join('\n')

  assert.equal(
    normalizeRequirementAiImageMarkdown(markdown),
    '![弹窗效果](https://example.com/dialog.webp)\n![已有说明](https://example.com/existing.png)',
  )
})

test('将平台文件路径转为图片，支持后端生成的 canonical Markdown', () => {
  assert.equal(
    normalizeRequirementAiImageMarkdown('原型： /api/common/public-files/501?inline=true'),
    '原型： ![图片](/api/common/public-files/501?inline=true)',
  )
})

test('不转换代码块、普通链接和危险协议', () => {
  const markdown = [
    '```text',
    'https://example.com/code.png',
    '```',
    '[产品主页](https://example.com/home)',
    'javascript://unsafe.png',
  ].join('\n')

  assert.equal(normalizeRequirementAiImageMarkdown(markdown), markdown)
})
