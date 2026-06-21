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

test('renders malformed Hermes release-summary markdown into headings and tables', async () => {
  const { renderHermesMarkdownToHtml } = await loadModule()

  const html = renderHermesMarkdownToHtml(`📊当前迭代「20260429」发版内容总结###一、迭代基本信息|项目|内容|
|---|---|
|迭代名称|20260429|
|所属项目|CRM项目|

###二、整体交付概览
|指标|数量|占比|
|---|---|---|
|工作项总数|76|100%|`)

  assert.match(html, /<p>📊当前迭代「20260429」发版内容总结<\/p>/)
  assert.match(html, /<h3>一、迭代基本信息<\/h3>/)
  assert.match(html, /<h3>二、整体交付概览<\/h3>/)
  assert.match(html, /<th>项目<\/th>/)
  assert.match(html, /<th>内容<\/th>/)
  assert.match(html, /<th>指标<\/th>/)
  assert.doesNotMatch(html, /###一、迭代基本信息/)
  assert.doesNotMatch(html, /\|---\|---\|/)
})

test('does not misread table rows with ticket ids as headings', async () => {
  const { renderHermesMarkdownToHtml } = await loadModule()

  const html = renderHermesMarkdownToHtml(`### ✅近期已通过的缺陷（部分）
| 编号 | 标题 | 负责人 |
|---|---|---|
| #46FGB9 | 合同补充协议数据权限问题 | 车车 |
| #S3EG7L | 联合体协议单位名称过长弹窗样式 | liuqunyan |
| #G57X9F | 表单字段不能记住填写内容 | wuyongsheng |`)

  assert.match(html, /<h3>✅近期已通过的缺陷（部分）<\/h3>/)
  assert.match(html, /<td>#46FGB9<\/td>/)
  assert.match(html, /<td>合同补充协议数据权限问题<\/td>/)
  assert.match(html, /<td>车车<\/td>/)
  assert.match(html, /<td>#S3EG7L<\/td>/)
  assert.match(html, /<td>#G57X9F<\/td>/)
  assert.doesNotMatch(html, /<h1>46FGB9<\/h1>/)
  assert.doesNotMatch(html, /<p>\| 合同补充协议数据权限问题/)
})

test('does not split bold ticket ids inside table rows', async () => {
  const { renderHermesMarkdownToHtml } = await loadModule()

  const html = renderHermesMarkdownToHtml(`2.存在【待开始】且【未分配负责人】的缺陷
| 编号 | 标题 | 类型 | 状态 | 负责人 |
|---|---|---|---|---|
| **#W1PDF7** | 【生产】团队维护弹窗没有回显值 | 缺陷 | 待开始 | **未分配** |`)

  assert.match(html, /<th>编号<\/th>/)
  assert.match(html, /<td><strong>#W1PDF7<\/strong><\/td>/)
  assert.match(html, /<td>【生产】团队维护弹窗没有回显值<\/td>/)
  assert.match(html, /<td>缺陷<\/td>/)
  assert.match(html, /<td>待开始<\/td>/)
  assert.match(html, /<td><strong>未分配<\/strong><\/td>/)
  assert.doesNotMatch(html, /<h1>W1PDF7\*\*<\/h1>/)
  assert.doesNotMatch(html, /<td>\*\*<\/td>/)
})

test('does not split ticket ids wrapped in parentheses inside table cells', async () => {
  const { renderHermesMarkdownToHtml } = await loadModule()

  const html = renderHermesMarkdownToHtml(`| 指标 | 数值 |
|---|---|
| 当前可确认 | 仅 1项（#W1PDF7） |`)

  assert.match(html, /<th>指标<\/th>/)
  assert.match(html, /<th>数值<\/th>/)
  assert.match(html, /<td>当前可确认<\/td>/)
  assert.match(html, /<td>仅 1项（#W1PDF7）<\/td>/)
  assert.doesNotMatch(html, /<td>仅 1项（<\/td>/)
  assert.doesNotMatch(html, /<td>#W1PDF7）<\/td>/)
})

test('renders risk matrix table when divider row uses malformed center markers', async () => {
  const { renderHermesMarkdownToHtml } = await loadModule()

  const html = renderHermesMarkdownToHtml(`### 风险矩阵总览
|风险项|严重程度|可能性|建议动作|
|------|-:-|-:-|------|
|迭代超期未关闭|🔴 高|已发生|确认是否需要延期或关闭|
|生产缺陷无人负责|🔴 高|已发生|**立即分配负责人**|`)

  assert.match(html, /<h3>风险矩阵总览<\/h3>/)
  assert.match(html, /<table>/)
  assert.match(html, /<th>风险项<\/th>/)
  assert.match(html, /<th>严重程度<\/th>/)
  assert.match(html, /<td>迭代超期未关闭<\/td>/)
  assert.match(html, /<td><strong>立即分配负责人<\/strong><\/td>/)
  assert.doesNotMatch(html, /<p>\|风险项\|严重程度/)
})

test('merges multiline hermes table rows in risk analysis output', async () => {
  const { renderHermesMarkdownToHtml } = await loadModule()

  const html = renderHermesMarkdownToHtml(`### 🔴高风险
| # | 风险项 |
|---|---|
| 1
#W1PDF7【生产】团队维护弹窗没有回显值 - 状态【待开始】、负责人未分配，属于生产环境问题。 |
| 2
迭代测试任务仍在进行中，收尾验证存在延迟风险。 |

### 🟡中风险
| # | 风险项 |
|---|---|
| 3 | **7项待跟进细节不透明**
#W1PDF7的具体信息，其余6项待跟进项的状态和负责人尚不明确，存在遗漏风险。 |`)

  assert.match(html, /<h3>🔴高风险<\/h3>/)
  assert.match(html, /<td>1<br \/>#W1PDF7【生产】团队维护弹窗没有回显值 - 状态【待开始】、负责人未分配，属于生产环境问题。<\/td>/)
  assert.match(html, /<td>2<br \/>迭代测试任务仍在进行中，收尾验证存在延迟风险。<\/td>/)
  assert.match(html, /<h3>🟡中风险<\/h3>/)
  assert.match(html, /<td>3<\/td>/)
  assert.match(html, /<td><strong>7项待跟进细节不透明<\/strong><br \/>#W1PDF7的具体信息，其余6项待跟进项的状态和负责人尚不明确，存在遗漏风险。<\/td>/)
  assert.doesNotMatch(html, /<h1>W1PDF7/)
  assert.doesNotMatch(html, /<td>3<\/td><\/tr><tr><td>#W1PDF7的具体信息/)
})
