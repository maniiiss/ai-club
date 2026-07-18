import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot 助手工作区布局契约', () => {
  it('移除公众端调试轨迹，拆分记忆与文件库入口', () => {
    const workspace = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')
    const messages = readFileSync(new URL('../src/components/assistant/AssistantMessageList.tsx', import.meta.url), 'utf8')
    const memory = readFileSync(new URL('../src/components/assistant/AssistantMemoryPanel.tsx', import.meta.url), 'utf8')
    const fileLibrary = readFileSync(new URL('../src/components/assistant/AssistantFileLibraryPanel.tsx', import.meta.url), 'utf8')

    assert.doesNotMatch(workspace, /debug|memoryVisible/)
    assert.doesNotMatch(messages, /调试轨迹|工具调用|AssistantDebugInfoItem/)
    assert.match(workspace, /AssistantFileLibraryPanel/)
    assert.match(workspace, /更多助手选项/)
    assert.match(workspace, /记忆/)
    assert.match(workspace, /已归档/)
    assert.doesNotMatch(memory, /uploadAssistantFileLibraryItem/)
    assert.match(fileLibrary, /搜索文件库/)
  })

  it('将文件库放在会话搜索下方，并将会话操作改为悬停展开', () => {
    const workspace = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')
    const sidebar = readFileSync(new URL('../src/components/assistant/AssistantSessionSidebar.tsx', import.meta.url), 'utf8')

    assert.match(workspace, /onOpenFileLibrary=\{\(\) => setWorkspacePanel\('fileLibrary'\)\}/)
    assert.doesNotMatch(workspace, /title="文件库"/)
    assert.match(sidebar, /<FileText className="h-4 w-4 flex-shrink-0" \/>/)
    assert.match(sidebar, /<span>文件库<\/span>/)
    assert.match(sidebar, /group-hover:max-h-10/)
    assert.match(sidebar, /group-focus-within:max-h-10/)
  })

  it('紧凑抽屉不再渲染独立的空操作行', () => {
    const workspace = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')
    const sidebar = readFileSync(new URL('../src/components/assistant/AssistantSessionSidebar.tsx', import.meta.url), 'utf8')

    assert.match(workspace, /\) : null\}/)
    assert.match(workspace, /headerActions=\{renderWorkspaceHeader \? undefined : headerActions\}/)
    assert.doesNotMatch(workspace, /justify-end border-b border-\[var\(--color-border-light\)\]/)
    assert.match(sidebar, /紧凑抽屉中的全局助手操作并入会话栏首行/)
  })

  it('点击更多菜单外部区域时自动关闭', () => {
    const workspace = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')

    assert.match(workspace, /const moreMenuRef = useRef<HTMLDivElement \| null>\(null\)/)
    assert.match(workspace, /ref=\{moreMenuRef\}/)
    assert.match(workspace, /document\.addEventListener\('pointerdown', handleOutsidePointerDown\)/)
    assert.match(workspace, /setMoreMenuOpen\(false\)/)
    assert.match(workspace, /removeEventListener\('pointerdown', handleOutsidePointerDown\)/)
  })

  it('左侧搜索使用当前项目历史并延迟 250ms 请求', () => {
    const workspace = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')
    const api = readFileSync(new URL('../src/api/assistant.ts', import.meta.url), 'utf8')
    const sidebar = readFileSync(new URL('../src/components/assistant/AssistantSessionSidebar.tsx', import.meta.url), 'utf8')

    assert.match(api, /searchAssistantConversationSessions/)
    assert.match(api, /includeArchived: true/)
    assert.match(workspace, /setTimeout\(\(\) => void searchSessions\(sessionSearchQuery\), 250\)/)
    assert.match(sidebar, /搜索聊天内容/)
    assert.match(sidebar, /matchedContent/)
    assert.doesNotMatch(sidebar, /latestPreview/)
  })

  it('routes development actions through the repository-selection dialog', () => {
    const workspace = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')
    const dialog = readFileSync(new URL('../src/pages/planning/DevelopmentExecutionDialog.tsx', import.meta.url), 'utf8')

    assert.match(workspace, /getWorkItemDetail/)
    assert.match(workspace, /resolveDevelopmentExecutionActionContext/)
    assert.match(workspace, /<DevelopmentExecutionDialog/)
    assert.match(workspace, /triggerSource="HERMES"/)
    assert.match(dialog, /initialInputText = ''/)
    assert.match(dialog, /triggerSource = 'PAGE'/)
  })

  it('continues the assistant query after an external MCP confirmation', () => {
    const workspace = readFileSync(new URL('../src/components/assistant/AssistantWorkspace.tsx', import.meta.url), 'utf8')
    const executor = readFileSync(new URL('../src/lib/assistantActionExecutor.ts', import.meta.url), 'utf8')

    assert.match(executor, /return executeAssistantMcpTool\(/)
    assert.match(workspace, /buildExternalMcpResumeQuestion/)
    assert.match(workspace, /await submitQuestion\(\s*'继续查询'/)
    assert.match(workspace, /buildExternalMcpResumeQuestion\(action, toolResult\)/)
    assert.match(workspace, /不要重复调用这个工具/)
    assert.match(workspace, /后续用户提出新的问题时仍可正常使用外部 MCP 工具/)
    assert.match(workspace, /已授权，正在基于外部 MCP 结果继续查询…/)
    assert.match(workspace, /不要复述内部提示、XML 标签或原始 JSON/)
  })

  it('exposes enabled personal MCP services through the slash menu', () => {
    const composer = readFileSync(new URL('../src/components/assistant/AssistantComposer.tsx', import.meta.url), 'utf8')

    assert.match(composer, /listAssistantMcpServers/)
    assert.match(composer, /command: `\/mcp\/\$\{server\.id\}`/)
    assert.match(composer, /displayCommand: `\/mcp\/\$\{server\.name\}`/)
    assert.match(composer, /visibleSlashCommand/)
    assert.match(composer, /label: `MCP：\$\{server\.name\}`/)
    assert.match(composer, /server\.enabled/)
  })

  it('opens safe citation routes in a new tab instead of stacking assistant drawers', () => {
    const messages = readFileSync(new URL('../src/components/assistant/AssistantMessageList.tsx', import.meta.url), 'utf8')
    const references = readFileSync(new URL('../src/lib/assistantReferenceUtils.ts', import.meta.url), 'utf8')

    assert.match(messages, /target="_blank"/)
    assert.match(messages, /rel="noopener noreferrer"/)
    assert.match(messages, /resolveAssistantReferenceHref\(reference\)/)
    assert.match(references, /startsWith\('\/'\)/)
    assert.match(references, /normalizeAssistantReferencePath/)
    assert.match(references, /iterations/)
    assert.doesNotMatch(messages, /AssistantReferencePreviewDrawer/)
  })

  it('renders专项 Skill markers after the user label', () => {
    const messages = readFileSync(new URL('../src/components/assistant/AssistantMessageList.tsx', import.meta.url), 'utf8')

    assert.match(messages, /message\.skillLabel/)
    assert.match(messages, /\{message\.skillLabel\}/)
    assert.doesNotMatch(messages, /formatAssistantUserQuestion/)
  })
})
