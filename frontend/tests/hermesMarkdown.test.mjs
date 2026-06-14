import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadModule() {
  const source = await readFile(new URL('../src/utils/hermesMarkdown.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('renders ReAct think block with process-specific styling hook separate from final answer', async () => {
  const { renderHermesMarkdownToHtml } = await loadModule()

  const html = renderHermesMarkdownToHtml('<think>先确认项目，再调用工具查询迭代。</think>最终结论：迭代风险较低。')

  assert.match(html, /class="hermes-think-block hermes-react-process-block is-done"/)
  assert.match(html, /ReAct 推理完成/)
  assert.match(html, /<div class="hermes-think-content">[\s\S]*先确认项目，再调用工具查询迭代。[\s\S]*<\/div>/)
  assert.match(html, /<p>最终结论：迭代风险较低。<\/p>/)
})
