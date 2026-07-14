import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadModule() {
  const source = await readFile(new URL('../src/utils/assistantProcessTrace.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('maps Assistant tool execution status to readable tones', async () => {
  const { resolveAssistantToolStatusMeta } = await loadModule()

  assert.deepEqual(resolveAssistantToolStatusMeta('SUCCEEDED'), {
    statusText: '成功',
    tone: 'success',
    icon: '✓'
  })
  assert.deepEqual(resolveAssistantToolStatusMeta('STOPPED'), {
    statusText: '等待确认',
    tone: 'warning',
    icon: '!'
  })
  assert.deepEqual(resolveAssistantToolStatusMeta('FAILED'), {
    statusText: '失败',
    tone: 'danger',
    icon: '×'
  })
})

test('normalizes raw Assistant tool execution debug rows into compact display items', async () => {
  const { normalizeAssistantToolExecutions } = await loadModule()

  const items = normalizeAssistantToolExecutions([
    {
      toolCode: 'wiki.page.get_detail',
      functionName: 'wiki_page_get_detail',
      toolCallId: 'call-1',
      status: 'SUCCESS',
      arguments: { pageId: 7, spaceId: 5 },
      message: '已读取 Wiki 页面'
    }
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'call-1')
  assert.equal(items[0].toolName, '读取 Wiki 页面')
  assert.equal(items[0].statusText, '成功')
  assert.equal(items[0].tone, 'success')
  assert.equal(items[0].compactLabel, '读取 Wiki 页面 · 成功')
  assert.equal(Object.hasOwn(items[0], 'argumentsPreview'), false)
  assert.equal(items[0].message, '已读取 Wiki 页面')
})

test('renders known Assistant tool codes as Chinese display names', async () => {
  const { normalizeAssistantToolExecutions } = await loadModule()

  const items = normalizeAssistantToolExecutions([
    { toolCode: 'project.search', status: 'SUCCESS' },
    { toolCode: 'project.list_iterations', status: 'SUCCESS' },
    { toolCode: 'unknown.custom_tool', status: 'SUCCESS' }
  ])

  assert.deepEqual(items.map((item) => item.compactLabel), [
    '搜索项目 · 成功',
    '项目迭代列表 · 成功',
    'unknown.custom_tool · 成功'
  ])
})

test('builds collapsed tool trace summary only when tools exist', async () => {
  const { buildAssistantToolTraceSummary, normalizeAssistantToolExecutions } = await loadModule()

  assert.equal(buildAssistantToolTraceSummary([]), null)

  const summary = buildAssistantToolTraceSummary(normalizeAssistantToolExecutions([
    { toolCode: 'project.search', status: 'SUCCESS', message: '查到 2 个项目' },
    { toolCode: 'repo.scan.start', status: 'STOPPED', message: '生成待确认动作' }
  ]), null)

  assert.equal(summary.title, '工具调用')
  assert.equal(summary.description, '2 次调用，1 次等待确认')
  assert.equal(summary.countText, '2 次')
  assert.equal(summary.tone, 'warning')
})

test('builds streaming thinking placeholder as an unclosed think block', async () => {
  const { buildAssistantStreamingThinkMarkdown } = await loadModule()

  assert.equal(buildAssistantStreamingThinkMarkdown('GitPilot 正在思考'), '<think>GitPilot 正在思考')
  assert.equal(buildAssistantStreamingThinkMarkdown(''), '<think>GitPilot 正在思考')
})
