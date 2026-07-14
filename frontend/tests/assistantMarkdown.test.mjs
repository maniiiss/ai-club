import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadModule() {
  const source = await readFile(new URL('../src/utils/assistantMarkdown.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('renders ReAct think block with process-specific styling hook separate from final answer', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml('<think>先确认项目，再调用工具查询迭代。</think>最终结论：迭代风险较低。')

  assert.match(html, /class="assistant-think-block assistant-process-block is-done"/)
  assert.match(html, /ReAct 推理完成/)
  assert.match(html, /<div class="assistant-think-content">[\s\S]*先确认项目，再调用工具查询迭代。[\s\S]*<\/div>/)
  assert.match(html, /<p>最终结论：迭代风险较低。<\/p>/)
})

test('renders malformed Assistant release-summary markdown into headings and tables', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`📊当前迭代「20260429」发版内容总结###一、迭代基本信息|项目|内容|
|---|---|
|迭代名称|20260429|
|所属项目|示例项目|

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

test('normalizes quoted bold status text in Assistant prose', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml('根据当前项目（示例项目）的近期工作项列表，状态为**"进行中"**的工作项有：')

  assert.match(html, /状态为<strong>(?:"|&quot;)进行中(?:"|&quot;)<\/strong>的工作项有：/)
})

test('renders valid inline bold markers in Assistant risk prose', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`🔴 最高风险：存在 **已阻塞**
- 工作项当前项目中有一个工作项处于 **"已阻塞"** 状态：
2. 人力与工作量不匹配：项目共121个任务，但团队成员仅 **4人**，人均任务量约30个`)

  assert.match(html, /存在\s*<strong>已阻塞<\/strong>/)
  assert.match(html, /处于\s*<strong>(?:"|&quot;)已阻塞(?:"|&quot;)<\/strong>\s*状态/)
  assert.match(html, /仅\s*<strong>4人<\/strong>/)
})

test('renders numeric pseudo-headings as normal paragraphs', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`### 4 当前存在的缺陷工作项。

### 4当前没有正式登记为缺陷类型的工作项。

##32等所有依赖 AI 调用任务的基础。
##77和
##79的底层原因，确保投标智能体开发链路畅通。`)

  assert.match(html, /<p>4 当前存在的缺陷工作项。<\/p>/)
  assert.match(html, /<p>4当前没有正式登记为缺陷类型的工作项。<\/p>/)
  assert.match(html, /<p>32等所有依赖 AI 调用任务的基础。<br \/>77和<br \/>79的底层原因，确保投标智能体开发链路畅通。<\/p>/)
  assert.doesNotMatch(html, /<h[1-6]>4 当前存在/)
  assert.doesNotMatch(html, /<h[1-6]>32等/)
})

test('preserves ordinary prose instead of applying global emphasis cleanup', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml('项目：**示例项目** | 负责人：* 管理员 | ** 状态：进行中')

  assert.match(html, /项目：<strong>示例项目<\/strong> \| 负责人：\* 管理员 \| \*\* 状态：进行中/)
})

test('keeps inline project ids in the paragraph instead of splitting them into headings', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml('示例项目 #4 下当前登记的缺陷如下（按项目范围统计，未限制迭代）：')

  assert.match(html, /<p>示例项目 #4 下当前登记的缺陷如下（按项目范围统计，未限制迭代）：<\/p>/)
  assert.doesNotMatch(html, /<h[1-6]>4 下当前登记/)
})

test('renders valid alphanumeric ticket lists without heading promotion', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`1. **#2C2AKF**
- 投标资源管理-企业资质台账列表，每一列的字段，排序的升序降序都无效 — **延期解决**

2. **#AF376S** 【人员信息】demo账号，当前公司为“湖北工建房地产有限公司”，权限为人资专员，打开人员信息管理页面报错 — **已拒绝**

3. **#B3YSCS** 【PC端】营销激励模块，计提申请和激励申请，提交后的loading阶段，页面宽度一直在变化 — **已拒绝**

4. **#CL5L1V** 【审批详情】企微跳转只保留tab内的内容 — **延期解决**

5. **#D8HZEY**
- 人员信息管理，详情页停留1分钟左右，刷新页面，报错 — **已拒绝**`)

  assert.match(html, /<ol>/)
  assert.match(html, /<strong>#2C2AKF<\/strong>/)
  assert.match(html, /<strong>#AF376S<\/strong>/)
  assert.match(html, /<strong>延期解决<\/strong>/)
  assert.doesNotMatch(html, /<h[1-6]>/)
})

test('renders malformed resume markdown with glued headings, bold labels and table headers', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`📋 某候选人简历总结###基本信息
- 求职意向：后端开发工程师 /技术经理 - **籍贯**：某地 - **毕业院校**：某大学
🔑 核心项目经验|项目 |时间 |技术栈亮点 |
|------|------|----------|
| 企业管理平台 |近期 | 后端服务与自动化测试 |`)

  assert.match(html, /<p>📋 某候选人简历总结<\/p>/)
  assert.match(html, /<h3>基本信息<\/h3>/)
  assert.match(html, /<strong>籍贯<\/strong>/)
  assert.match(html, /<strong>毕业院校<\/strong>/)
  assert.match(html, /<p>🔑 核心项目经验<\/p>/)
  assert.match(html, /<th>项目<\/th>/)
  assert.match(html, /<th>时间<\/th>/)
  assert.match(html, /<th>技术栈亮点<\/th>/)
  assert.doesNotMatch(html, /###基本信息/)
  assert.doesNotMatch(html, /\|------\|/)
})

test('does not misread table rows with ticket ids as headings', async () => {
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`### ✅近期已通过的缺陷（部分）
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
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`2.存在【待开始】且【未分配负责人】的缺陷
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
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`| 指标 | 数值 |
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
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`### 风险矩阵总览
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
  const { renderAssistantMarkdownToHtml } = await loadModule()

  const html = renderAssistantMarkdownToHtml(`### 🔴高风险
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
