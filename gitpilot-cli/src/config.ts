import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface GitPilotConfig {
  platformUrl: string
  modelConfigId?: number
  sessionsDir: string
}

const DEFAULT_PLATFORM_URL = 'http://localhost:8080'
const rootDir = join(homedir(), '.gitpilot')

/** 返回 CLI 的本地配置路径；配置只包含平台地址和模型 ID 等非敏感内容。 */
export const configPath = () => join(rootDir, 'config.toml')
export const sessionsDir = () => join(rootDir, 'sessions')
export const isPlatformRegistered = async (): Promise<boolean> => {
  try {
    await readFile(configPath(), 'utf8')
    return true
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

/** 所有需要访问平台的命令统一经过这里，确保用户先显式注册平台地址。 */
export const loadRegisteredConfig = async (): Promise<GitPilotConfig> => {
  if (!await isPlatformRegistered()) {
    throw new Error('尚未注册平台，请先执行 gitpilot register [平台地址]')
  }
  return loadConfig()
}

/** 校验并归一化用户输入的平台地址，避免把凭据发送到带路径穿越或认证信息的地址。 */
export const normalizePlatformUrl = (value: string): string => {
  const candidate = value.trim().replace(/\/$/, '')
  let parsed: URL
  try { parsed = new URL(candidate) } catch { throw new Error('平台地址格式不正确，例如：https://gitpilot.example.com') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error('平台地址必须是 HTTP/HTTPS 地址，且不能包含用户名、密码或 fragment')
  }
  return candidate
}

/** 读取最小 TOML 子集，避免把第三方解析器引入凭据边界。 */
export const loadConfig = async (): Promise<GitPilotConfig> => {
  const defaults: GitPilotConfig = { platformUrl: DEFAULT_PLATFORM_URL.replace(/\/$/, ''), sessionsDir: sessionsDir() }
  try {
    const content = await readFile(configPath(), 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*"?(.*?)"?$/)
      if (!match) continue
      if (match[1] === 'platformUrl') defaults.platformUrl = match[2].replace(/\/$/, '')
      if (match[1] === 'modelConfigId' && /^\d+$/.test(match[2])) defaults.modelConfigId = Number(match[2])
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
  return defaults
}

/** 保存非敏感配置，并确保目录和文件权限尽可能收敛到当前用户。 */
export const saveConfig = async (config: GitPilotConfig): Promise<void> => {
  await mkdir(rootDir, { recursive: true, mode: 0o700 })
  const lines = [`platformUrl = "${config.platformUrl.replace(/"/g, '')}"`]
  if (config.modelConfigId != null) lines.push(`modelConfigId = "${config.modelConfigId}"`)
  await writeFile(configPath(), `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
}

/** 确保会话目录存在；会话文件只保存脱敏后的文本历史。 */
export const ensureSessionsDir = async (): Promise<void> => {
  await mkdir(dirname(sessionsDir()), { recursive: true, mode: 0o700 })
  await mkdir(sessionsDir(), { recursive: true, mode: 0o700 })
}
