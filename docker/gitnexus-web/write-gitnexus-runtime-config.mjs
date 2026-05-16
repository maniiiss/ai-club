import { writeFileSync } from 'node:fs'

const outputPath = '/app/dist/gitnexus-runtime-config.js'

// GitNexus 官方 Web 的 Nexus AI 只读取浏览器侧 sessionStorage，不能直接复用平台后端的模型配置。
// 这里在容器启动时把 .env 透传的配置写成运行时 JS，由页面加载前注入默认 AI 设置。
const readEnv = (name, fallback = '') => {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

const readBool = (name, fallback) => {
  const value = readEnv(name).toLowerCase()
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value)
}

const readNumber = (name, fallback) => {
  const raw = readEnv(name)
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

const readAiEnv = (name, hermesName = '') => {
  const value = readEnv(name)
  if (value) return value
  return readBool('GITNEXUS_AI_FALLBACK_TO_HERMES', true) && hermesName ? readEnv(hermesName) : ''
}

const defaults = {
  activeProvider: 'gemini',
  openai: { apiKey: '', model: 'gpt-4o', temperature: 0.1 },
  gemini: { apiKey: '', model: 'gemini-2.0-flash', temperature: 0.1 },
  azureOpenAI: {
    apiKey: '',
    endpoint: '',
    deploymentName: '',
    model: 'gpt-4o',
    apiVersion: '2024-08-01-preview',
    temperature: 0.1
  },
  anthropic: { apiKey: '', model: 'claude-sonnet-4-20250514', temperature: 0.1 },
  ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2', temperature: 0.1 },
  openrouter: { apiKey: '', model: '', baseUrl: 'https://openrouter.ai/api/v1', temperature: 0.1 },
  minimax: { apiKey: '', model: 'MiniMax-M2.5', temperature: 0.1 },
  glm: { apiKey: '', model: 'GLM-5', baseUrl: 'https://api.z.ai/api/coding/paas/v4', temperature: 0.1 }
}

// 平台中的 Hermes 常使用 custom 表示 OpenAI 兼容网关；GitNexus 前端需要映射到自己支持的 provider。
const normalizeProvider = (provider) => {
  const value = provider.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
  if (['azure', 'azure-openai', 'azureopenai'].includes(value)) return 'azure-openai'
  if (['google', 'google-gemini'].includes(value)) return 'gemini'
  if (['claude'].includes(value)) return 'anthropic'
  if (['zai', 'z-ai', 'z.ai'].includes(value)) return 'glm'
  if (['custom', 'openai-compatible', 'openai-compatible-api', 'minimax-cn'].includes(value)) return ''
  return value
}

const providerFromBaseUrl = (baseUrl) => {
  const value = baseUrl.toLowerCase()
  if (value.includes('openrouter.ai')) return 'openrouter'
  if (value.includes('api.z.ai')) return 'glm'
  if (value.includes('localhost:11434') || value.includes('127.0.0.1:11434')) return 'ollama'
  // MiniMax 的 OpenAI 兼容地址应走 openai provider；GitNexus 内置 minimax provider 固定使用 Anthropic 兼容端点。
  return 'openai'
}

// 专用 GITNEXUS_AI_* 优先级最高；也可显式开启回退到 HERMES_LLM_*，减少本地部署重复填 key。
const resolveProvider = (baseUrl) => {
  const explicit = normalizeProvider(readEnv('GITNEXUS_AI_PROVIDER'))
  if (explicit) return explicit

  const hermesProvider = readBool('GITNEXUS_AI_FALLBACK_TO_HERMES', true)
    ? normalizeProvider(readEnv('HERMES_LLM_PROVIDER'))
    : ''
  if (hermesProvider) return hermesProvider

  return baseUrl ? providerFromBaseUrl(baseUrl) : 'openai'
}

const buildSettings = () => {
  if (!readBool('GITNEXUS_AI_AUTO_CONFIG_ENABLED', true)) return null

  const baseUrl = readAiEnv('GITNEXUS_AI_BASE_URL', 'HERMES_LLM_BASE_URL')
  const apiKey = readAiEnv('GITNEXUS_AI_API_KEY', 'HERMES_LLM_API_KEY')
  const model = readAiEnv('GITNEXUS_AI_MODEL', 'HERMES_LLM_MODEL')
  const provider = resolveProvider(baseUrl)
  const useProxy = readBool('GITNEXUS_AI_PROXY_ENABLED', true)
  const temperature = readNumber('GITNEXUS_AI_TEMPERATURE', 0.1)
  const maxTokens = readNumber('GITNEXUS_AI_MAX_TOKENS', undefined)

  const settings = JSON.parse(JSON.stringify(defaults))
  settings.activeProvider = provider

  const withOptionalMaxTokens = (value) => {
    if (maxTokens !== undefined) value.maxTokens = maxTokens
    return value
  }

  if (provider === 'openai') {
    if (!apiKey) return null
    settings.openai = withOptionalMaxTokens({
      ...settings.openai,
      apiKey: useProxy ? 'gitnexus-local-proxy' : apiKey,
      model: model || settings.openai.model,
      temperature,
      ...(useProxy ? { baseUrl: '/api/gitnexus-ai/v1' } : baseUrl ? { baseUrl } : {})
    })
    return settings
  }

  if (provider === 'azure-openai') {
    const endpoint = readEnv('GITNEXUS_AI_AZURE_ENDPOINT', baseUrl)
    const deploymentName = readEnv('GITNEXUS_AI_AZURE_DEPLOYMENT', model)
    if (!apiKey || !endpoint) return null
    settings.azureOpenAI = withOptionalMaxTokens({
      ...settings.azureOpenAI,
      apiKey,
      endpoint,
      deploymentName,
      model: model || settings.azureOpenAI.model,
      apiVersion: readEnv('GITNEXUS_AI_AZURE_API_VERSION', settings.azureOpenAI.apiVersion),
      temperature
    })
    return settings
  }

  if (provider === 'ollama') {
    settings.ollama = withOptionalMaxTokens({
      ...settings.ollama,
      baseUrl: baseUrl || settings.ollama.baseUrl,
      model: model || settings.ollama.model,
      temperature
    })
    return settings
  }

  if (!apiKey) return null

  if (provider === 'gemini') {
    settings.gemini = withOptionalMaxTokens({
      ...settings.gemini,
      apiKey,
      model: model || settings.gemini.model,
      temperature
    })
    return settings
  }

  if (provider === 'anthropic') {
    settings.anthropic = withOptionalMaxTokens({
      ...settings.anthropic,
      apiKey,
      model: model || settings.anthropic.model,
      temperature
    })
    return settings
  }

  if (provider === 'openrouter') {
    settings.openrouter = withOptionalMaxTokens({
      ...settings.openrouter,
      apiKey,
      model: model || settings.openrouter.model,
      baseUrl: baseUrl || settings.openrouter.baseUrl,
      temperature
    })
    return settings
  }

  if (provider === 'minimax') {
    settings.minimax = withOptionalMaxTokens({
      ...settings.minimax,
      apiKey,
      model: model || settings.minimax.model,
      temperature
    })
    return settings
  }

  if (provider === 'glm') {
    settings.glm = withOptionalMaxTokens({
      ...settings.glm,
      apiKey,
      model: model || settings.glm.model,
      baseUrl: baseUrl || settings.glm.baseUrl,
      temperature
    })
    return settings
  }

  return null
}

const payload = {
  ai: {
    forceConfig: readBool('GITNEXUS_AI_FORCE_CONFIG', false),
    settings: buildSettings()
  }
}

const script = `window.GIT_AI_CLUB_GITNEXUS_CONFIG = ${JSON.stringify(payload)};
(function seedGitNexusAiSettings() {
  var key = 'gitnexus-llm-settings';
  var config = window.GIT_AI_CLUB_GITNEXUS_CONFIG && window.GIT_AI_CLUB_GITNEXUS_CONFIG.ai;
  if (!config || !config.settings || typeof sessionStorage === 'undefined') return;

  var normalizeBaseUrl = function (settings) {
    if (settings && settings.openai && settings.openai.baseUrl && settings.openai.baseUrl.indexOf('/') === 0) {
      settings.openai.baseUrl = window.location.origin + settings.openai.baseUrl;
    }
    return settings;
  };

  var hasValidProvider = function (settings) {
    if (!settings || typeof settings !== 'object') return false;
    var provider = settings.activeProvider;
    if (provider === 'openai') return !!(settings.openai && settings.openai.apiKey);
    if (provider === 'azure-openai') return !!(settings.azureOpenAI && settings.azureOpenAI.apiKey && settings.azureOpenAI.endpoint);
    if (provider === 'gemini') return !!(settings.gemini && settings.gemini.apiKey);
    if (provider === 'anthropic') return !!(settings.anthropic && settings.anthropic.apiKey);
    if (provider === 'ollama') return true;
    if (provider === 'openrouter') return !!(settings.openrouter && settings.openrouter.apiKey);
    if (provider === 'minimax') return !!(settings.minimax && settings.minimax.apiKey);
    if (provider === 'glm') return !!(settings.glm && settings.glm.apiKey);
    return false;
  };

  try {
    var existing = sessionStorage.getItem(key);
    if (!config.forceConfig && existing && hasValidProvider(JSON.parse(existing))) return;
  } catch (error) {}

  try {
    sessionStorage.setItem(key, JSON.stringify(normalizeBaseUrl(config.settings)));
  } catch (error) {}
})();
`

writeFileSync(outputPath, script, 'utf8')
