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
})
