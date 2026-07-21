#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createPiAgent, resolvePiModel } from '@aiclub/gitpilot-agent-core'
import { createDeviceAuthorization, createModelSession, getCurrentUser, listModels, PlatformApiError, pollDeviceToken, revokeCliToken } from './api.js'
import { loadConfig, loadRegisteredConfig, normalizePlatformUrl, saveConfig } from './config.js'
import { deleteCliToken, readCliToken, saveCliToken } from './credentials.js'
import { createLocalTools } from './local-tools.js'
import { printAgentEvent, printGitPilotBanner } from './output.js'
import { loadSession, saveSession } from './session-store.js'
import { filterMenuItems, TerminalUi, type TerminalMenuItem } from './terminal-ui.js'

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

const createAgentRun = async (instruction: string, selectedModelId?: number, sessionId = `gitpilot-session-${randomUUID()}`) => {
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
  let lastStreamError: string | undefined
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
    onEvent: async (event: any) => {
      const normalized = printAgentEvent(event)
      if (normalized?.eventType === 'STREAM_ERROR') {
        lastStreamError = normalized.payload.errorMessage || '模型流返回错误'
      }
    },
  })
  return {
    agent,
    modelConfigId,
    sessionId,
    modelLabel: `${selected.name} · ${selected.provider}/${selected.modelName}`,
    platformUrl: config.platformUrl,
    consumeStreamError: () => {
      const error = lastStreamError
      lastStreamError = undefined
      return error
    },
  }
}

const PROMPT_TIMEOUT_MS = 120_000

/** 执行一轮 Agent 对话并统一处理流错误、Promise 错误和超时。 */
const promptWithTimeout = async (run: Awaited<ReturnType<typeof createAgentRun>>, instruction: string) => {
  run.consumeStreamError()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      run.agent.prompt(instruction),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try { run.agent.abort() } catch { /* Agent 已结束时无需重复处理取消 */ }
          reject(new Error('模型响应超时，请输入 /models 切换模型后重试'))
        }, PROMPT_TIMEOUT_MS)
      }),
    ])
    const streamError = run.consumeStreamError()
    if (streamError) throw new Error(streamError)
  } catch (error) {
    const streamError = run.consumeStreamError()
    if (streamError) throw new Error(streamError)
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const execute = async (instruction: string, modelId?: number) => {
  const run = await createAgentRun(instruction, modelId)
  await promptWithTimeout(run, instruction)
  process.stdout.write('\n')
  await saveSession(run.sessionId, run.modelConfigId, run.agent.state.messages)
}

const interactiveCommands = [
  { value: '/models', label: '/models', description: '切换模型' },
  { value: '/status', label: '/status', description: '查看当前状态' },
  { value: '/clear', label: '/clear', description: '清空当前对话' },
  { value: '/help', label: '/help', description: '查看命令帮助' },
  { value: '/exit', label: '/exit', description: '退出 GitPilot' },
] as const

const printInteractiveCommandMenu = () => {
  console.log('\nGitPilot commands')
  for (const item of interactiveCommands) console.log(`  ${item.value.padEnd(10)} ${item.description}`)
  console.log('  Type a command and press Enter.')
}

const getCommandMenuItems = (buffer: string): TerminalMenuItem[] => filterMenuItems(buffer, interactiveCommands)

const selectInteractiveModel = async (currentRun: Awaited<ReturnType<typeof createAgentRun>>) => {
  const config = await loadRegisteredConfig()
  const token = await requireToken(config.platformUrl)
  const availableModels = await listModels(config, token)
  if (availableModels.length === 0) {
    console.log('平台当前没有可用模型。')
    return currentRun
  }

  console.log('\nModels')
  availableModels.forEach((model, index) => {
    const current = model.id === currentRun.modelConfigId ? ' (current)' : ''
    console.log(`  ${index + 1}. ${model.name} · ${model.provider}/${model.modelName}${current}`)
  })
  // 只在模型选择期间创建 readline，避免它与主循环 raw mode 同时监听 stdin。
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  let selectedInput = ''
  try {
    selectedInput = (await readline.question('Select model number (Enter to cancel) › ')).trim()
  } finally {
    readline.close()
  }
  if (!selectedInput) return currentRun
  const selectedIndex = Number(selectedInput) - 1
  const selected = Number.isInteger(selectedIndex) ? availableModels[selectedIndex] : undefined
  if (!selected) {
    console.log('Invalid model selection.')
    return currentRun
  }
  if (selected.id === currentRun.modelConfigId) {
    console.log(`已在使用模型：${selected.name}`)
    return currentRun
  }

  await saveSession(currentRun.sessionId, currentRun.modelConfigId, currentRun.agent.state.messages)
  const nextRun = await createAgentRun('', selected.id, currentRun.sessionId)
  console.log(`\n已切换模型：${selected.name}`)
  printGitPilotBanner({ model: nextRun.modelLabel, platformUrl: nextRun.platformUrl, workspace: basename(process.cwd()) })
  return nextRun
}

const interactive = async (modelId?: number) => {
  let run = await createAgentRun('', modelId)
  printGitPilotBanner({ model: run.modelLabel, platformUrl: run.platformUrl, workspace: basename(process.cwd()) })
  const terminalUi = new TerminalUi()
  while (true) {
    const input = (await terminalUi.readLine('\n❯ ', getCommandMenuItems)).trim()
    if (!input) continue
    const command = input.split(/\s+/, 1)[0].toLowerCase()
    if (input === '/' || command === '/help') {
      printInteractiveCommandMenu()
      continue
    }
    if (command === '/models') {
      run = await selectInteractiveModel(run)
      continue
    }
    if (command === '/status') {
      console.log(`\nModel: ${run.modelLabel}`)
      console.log(`Platform: ${run.platformUrl}`)
      continue
    }
    if (command === '/clear') {
      run.agent.reset()
      console.log('\n当前对话已清空。')
      continue
    }
    if (['/exit', 'exit', 'quit', '退出'].includes(command)) break
    try {
      await promptWithTimeout(run, input)
      await saveSession(run.sessionId, run.modelConfigId, run.agent.state.messages)
    } catch (error) {
      console.error(`\n[error] ${error instanceof Error ? error.message : String(error)}`)
      console.log('可以输入 /models 切换模型，或直接继续输入新的指令。')
    }
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
