#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createPiAgent, resolvePiModel } from '@aiclub/gitpilot-agent-core'
import { createDeviceAuthorization, createModelSession, getCurrentUser, listModels, PlatformApiError, pollDeviceToken, revokeCliToken } from './api.js'
import { loadConfig, loadRegisteredConfig, normalizePlatformUrl, saveConfig } from './config.js'
import { deleteCliToken, readCliToken, saveCliToken } from './credentials.js'
import { createLocalTools } from './local-tools.js'
import { printPiEvent } from './output.js'
import { loadSession, saveSession } from './session-store.js'

const execFileAsync = promisify(execFile)

const openBrowser = async (url: string) => {
  if (process.platform === 'win32') await execFileAsync('cmd.exe', ['/c', 'start', '', url])
  else if (process.platform === 'darwin') await execFileAsync('open', [url])
  else await execFileAsync('xdg-open', [url])
}

const requireToken = async (platformUrl: string) => {
  const token = await readCliToken(platformUrl)
  if (!token) throw new Error('尚未登录，请先执行 gitpilot login')
  return token
}

const login = async () => {
  const config = await loadRegisteredConfig()
  const authorization = await createDeviceAuthorization(config)
  console.log(`请在浏览器中确认 GitPilot CLI 设备授权：${authorization.verificationUri}`)
  console.log(`设备验证码：${authorization.userCode}`)
  try { await openBrowser(authorization.verificationUri) } catch { console.log('无法自动打开浏览器，请手动复制上面的地址。') }

  const deadline = Date.now() + authorization.expiresInSeconds * 1000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, authorization.intervalSeconds * 1000))
    try {
      const result = await pollDeviceToken(config, authorization.deviceCode)
      await saveCliToken(config.platformUrl, result.accessToken)
      console.log(`登录成功：${result.user.nickname || result.user.username}`)
      return
    } catch (error) {
      if (error instanceof PlatformApiError && [400, 428, 429].includes(error.status)) continue
      throw error
    }
  }
  throw new Error('设备授权已过期，请重新执行 gitpilot login')
}

const models = async () => {
  const config = await loadRegisteredConfig()
  const token = await requireToken(config.platformUrl)
  const result = await listModels(config, token)
  if (result.length === 0) {
    console.log('平台当前没有启用的 CHAT 模型。')
    return
  }
  for (const model of result) console.log(`${model.id}\t${model.name}\t${model.provider}\t${model.modelName}${model.description ? `\t${model.description}` : ''}`)
}

const createAgentRun = async (instruction: string, selectedModelId?: number, sessionId = `pi-session-${randomUUID()}`) => {
  const config = await loadRegisteredConfig()
  const token = await requireToken(config.platformUrl)
  const availableModels = await listModels(config, token)
  if (availableModels.length === 0) throw new Error('平台没有可用 CHAT 模型，请先在管理端启用模型')
  const modelConfigId = selectedModelId || config.modelConfigId || availableModels[0].id
  const selected = availableModels.find((item) => item.id === modelConfigId)
  if (!selected) throw new Error(`平台不存在或未启用模型配置：${modelConfigId}`)
  if (config.modelConfigId !== modelConfigId) await saveConfig({ ...config, modelConfigId })
  const modelSession = await createModelSession(config, token, modelConfigId)
  const existing = await loadSession(sessionId)
  const model = resolvePiModel(selected.provider.toLowerCase(), selected.modelName, modelSession.proxyBaseUrl)
  const agent = createPiAgent({
    sessionId,
    model,
    history: existing?.history || [],
    systemPrompt: '你是运行在用户本地仓库中的 GitPilot Coding Agent。先理解现状，再谨慎修改；所有工具操作必须遵守本地工具返回的安全结果。',
    thinkingLevel: 'medium',
    maxOutputTokens: 8192,
    // 模型 session 只在当前进程使用，绝不写入会话 JSON 或日志。
    getApiKey: async () => modelSession.accessToken,
    tools: createLocalTools(process.cwd()),
    onEvent: async (event: any) => printPiEvent(event),
  })
  return { agent, modelConfigId, sessionId }
}

const execute = async (instruction: string, modelId?: number) => {
  const run = await createAgentRun(instruction, modelId)
  await run.agent.prompt(instruction)
  process.stdout.write('\n')
  await saveSession(run.sessionId, run.modelConfigId, run.agent.state.messages)
}

const interactive = async (modelId?: number) => {
  const run = await createAgentRun('', modelId)
  console.log('GitPilot Pi 已启动。输入 exit 或 Ctrl+C 退出。')
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    while (true) {
      const input = (await readline.question('\n> ')).trim()
      if (!input) continue
      if (['exit', 'quit', '退出'].includes(input.toLowerCase())) break
      await run.agent.prompt(input)
      process.stdout.write('\n')
      await saveSession(run.sessionId, run.modelConfigId, run.agent.state.messages)
    }
  } finally {
    readline.close()
  }
}

const status = async () => {
  const config = await loadRegisteredConfig()
  const token = await requireToken(config.platformUrl)
  const user = await getCurrentUser(config, token)
  console.log(`已登录：${user.nickname || user.username} (${user.username})`)
}

const logout = async () => {
  const config = await loadRegisteredConfig()
  const token = await readCliToken(config.platformUrl)
  if (token) {
    try { await revokeCliToken(config, token) } finally { await deleteCliToken(config.platformUrl) }
  }
  console.log('已退出 GitPilot。')
}

/** 注册当前 CLI 使用的平台地址，保存到本地配置而不是要求用户写环境变量。 */
const registerPlatform = async (providedUrl?: string) => {
  const config = await loadConfig()
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const input = providedUrl || (await readline.question(`请输入平台地址 [${config.platformUrl}]：`)).trim() || config.platformUrl
    const platformUrl = normalizePlatformUrl(input)
    await saveConfig({ ...config, platformUrl })
    console.log(`平台地址已保存：${platformUrl}`)
    console.log('现在可以执行 gitpilot login 登录。')
  } finally {
    readline.close()
  }
}

const parseModelId = (value: string | undefined) => value == null ? undefined : Number.isInteger(Number(value)) ? Number(value) : undefined

const main = async () => {
  const args = process.argv.slice(2)
  const command = args[0]
  if (command === 'auth') args.shift()
  const effective = args[0]
  if (effective === 'login') return login()
  if (effective === 'registe' || effective === 'register') return registerPlatform(args[1])
  if (effective === 'logout') return logout()
  if (effective === 'status') return status()
  if (effective === 'models' || effective === 'model') return models()
  if (effective === 'exec') {
    const promptIndex = args.indexOf('-p') >= 0 ? args.indexOf('-p') : args.indexOf('--prompt')
    if (promptIndex < 0 || !args[promptIndex + 1]) throw new Error('用法：gitpilot exec -p "指令" [--model 模型配置 ID]')
    const modelIndex = args.indexOf('--model')
    return execute(args[promptIndex + 1], parseModelId(modelIndex >= 0 ? args[modelIndex + 1] : undefined))
  }
  const modelIndex = args.indexOf('--model')
  return interactive(parseModelId(modelIndex >= 0 ? args[modelIndex + 1] : effective === '--model' ? args[1] : undefined))
}

main().catch((error) => {
  console.error(`GitPilot 执行失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
