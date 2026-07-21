import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureSessionsDir, sessionsDir } from './config.js'

export interface StandardMessage { role: 'user' | 'assistant'; content: string }
export interface LocalSession { sessionId: string; modelConfigId: number; history: StandardMessage[]; updatedAt: string }

const fileFor = (sessionId: string) => join(sessionsDir(), `${sessionId}.json`)

/** 从 Pi 消息中提取标准文本，避免把工具结果和模型凭据写入长期会话。 */
const normalizeMessages = (messages: any[]): StandardMessage[] => messages
  .filter((message) => message?.role === 'user' || message?.role === 'assistant')
  .map((message) => {
    const content = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content.filter((block: any) => block?.type === 'text').map((block: any) => block.text || '').join('')
        : ''
    return { role: message.role, content }
  })
  .filter((message) => message.content.trim())

export const loadSession = async (sessionId: string): Promise<LocalSession | null> => {
  try {
    return JSON.parse(await readFile(fileFor(sessionId), 'utf8')) as LocalSession
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export const saveSession = async (sessionId: string, modelConfigId: number, messages: any[]): Promise<LocalSession> => {
  await ensureSessionsDir()
  const session: LocalSession = {
    sessionId,
    modelConfigId,
    history: normalizeMessages(messages),
    updatedAt: new Date().toISOString(),
  }
  await writeFile(fileFor(sessionId), `${JSON.stringify(session, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return session
}
