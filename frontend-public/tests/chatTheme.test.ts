import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot chat theme contract', () => {
  it('keeps assistant messages, agent panels and composer surfaces theme-aware', () => {
    const messageList = readFileSync(new URL('../src/components/chat/ChatMessageList.tsx', import.meta.url), 'utf8')
    const chatPage = readFileSync(new URL('../src/pages/chat/ChatPage.tsx', import.meta.url), 'utf8')
    const composer = readFileSync(new URL('../src/components/chat/ChatComposer.tsx', import.meta.url), 'utf8')
    const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

    assert.match(messageList, /chat-assistant-message/)
    assert.match(messageList, /chat-agent-action-card/)
    assert.match(chatPage, /chat-agent-panel/)
    assert.match(composer, /chat-composer/)
    assert.match(styles, /\.chat-assistant-message \.prose-markdown/)
    assert.match(styles, /\.chat-agent-panel/)
    assert.match(styles, /data-theme="carbon-black"[\s\S]*\.chat-assistant-message/)
    assert.match(styles, /\.assistant-thinking-block/)
    assert.match(styles, /data-theme="carbon-black"[\s\S]*\.assistant-thinking-block/)
  })
})
