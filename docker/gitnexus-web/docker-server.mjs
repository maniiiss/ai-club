import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, normalize, relative, resolve } from 'node:path'

const host = '0.0.0.0'
const port = Number(process.env.PORT || '4173')
const root = resolve(process.cwd(), 'dist')
const proxyPrefix = '/api/gitnexus-ai/v1'

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

const readEnv = (name, fallback = '') => {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

const readBool = (name, fallback) => {
  const value = readEnv(name).toLowerCase()
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value)
}

const readAiEnv = (name, hermesName = '') => {
  const value = readEnv(name)
  if (value) return value
  return readBool('GITNEXUS_AI_FALLBACK_TO_HERMES', true) && hermesName ? readEnv(hermesName) : ''
}

const chineseSystemPrompt = '你是 GitNexus 的代码理解助手。最终回答必须使用简体中文；表格标题、总结、步骤说明和结论都使用中文。代码符号、文件路径、类名、方法名和错误信息保持原文。'

const collectRequestBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const buildProxyBody = async (req, suffix, headers) => {
  if (['GET', 'HEAD'].includes(req.method ?? 'GET')) return undefined

  const rawBody = await collectRequestBody(req)
  const shouldInjectChinesePrompt = readBool('GITNEXUS_AI_FORCE_CHINESE', true)
    && suffix.endsWith('/chat/completions')
    && (headers.get('content-type') || '').toLowerCase().includes('application/json')
  if (!shouldInjectChinesePrompt || rawBody.length === 0) return rawBody

  try {
    const payload = JSON.parse(rawBody.toString('utf8'))
    if (!Array.isArray(payload.messages)) return rawBody
    const prompt = readEnv('GITNEXUS_AI_SYSTEM_PROMPT', chineseSystemPrompt)
    payload.messages = [
      { role: 'system', content: prompt },
      ...payload.messages
    ]

    const lastUserIndex = payload.messages.map((message) => message?.role).lastIndexOf('user')
    if (lastUserIndex >= 0) {
      const message = payload.messages[lastUserIndex]
      if (typeof message.content === 'string') {
        message.content = `${prompt}\n\n用户问题：\n${message.content}`
      } else if (Array.isArray(message.content)) {
        message.content = [
          { type: 'text', text: `${prompt}\n\n` },
          ...message.content
        ]
      }
    }
    const nextBody = Buffer.from(JSON.stringify(payload), 'utf8')
    headers.set('content-length', String(nextBody.length))
    return nextBody
  } catch {
    return rawBody
  }
}

const writeJson = (res, status, body) => {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type,x-requested-with',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json; charset=utf-8'
  })
  res.end(JSON.stringify(body))
}

// Nexus AI 在浏览器里运行，很多私有 OpenAI 兼容网关没有完整 CORS；这里用同源代理统一转发并保护真实 API Key。
const handleGitNexusAiProxy = async (req, res, urlPath) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-requested-with'
    })
    res.end()
    return
  }

  if (!readBool('GITNEXUS_AI_PROXY_ENABLED', true)) {
    writeJson(res, 404, { error: { message: 'GitNexus AI proxy is disabled' } })
    return
  }

  const baseUrl = readAiEnv('GITNEXUS_AI_BASE_URL', 'HERMES_LLM_BASE_URL').replace(/\/+$/, '')
  const apiKey = readAiEnv('GITNEXUS_AI_API_KEY', 'HERMES_LLM_API_KEY')
  if (!baseUrl || !apiKey) {
    writeJson(res, 503, { error: { message: 'GitNexus AI proxy is missing base URL or API key' } })
    return
  }

  const suffix = urlPath.slice(proxyPrefix.length) || '/'
  if (!suffix.startsWith('/')) {
    writeJson(res, 400, { error: { message: 'Bad proxy path' } })
    return
  }

  let target
  try {
    target = new URL(`${baseUrl}${suffix}`)
  } catch {
    writeJson(res, 500, { error: { message: 'Invalid GitNexus AI upstream URL' } })
    return
  }

  try {
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      const lowerName = name.toLowerCase()
      if (['host', 'connection', 'content-length', 'origin', 'referer'].includes(lowerName)) continue
      headers.set(name, Array.isArray(value) ? value.join(',') : value)
    }
    headers.set('Authorization', `Bearer ${apiKey}`)

    const method = req.method ?? 'GET'
    const requestBody = await buildProxyBody(req, suffix, headers)
    const upstream = await fetch(target, {
      method,
      headers,
      body: requestBody,
      duplex: requestBody ? 'half' : undefined
    })

    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-requested-with',
      'Cache-Control': 'no-cache'
    }
    for (const [name, value] of upstream.headers.entries()) {
      const lowerName = name.toLowerCase()
      if (['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(lowerName)) continue
      responseHeaders[name] = value
    }

    res.writeHead(upstream.status, responseHeaders)
    if (!upstream.body) {
      res.end()
      return
    }
    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch (error) {
    writeJson(res, 502, {
      error: {
        message: error instanceof Error ? error.message : 'GitNexus AI upstream request failed'
      }
    })
  }
}

// 静态资源路径处理沿用官方镜像的 containment 思路：每个文件读取点前都用 path.relative 校验仍在 dist 目录内。
const server = createServer(async (req, res) => {
  const urlPath = req.url?.split('?')[0] || '/'

  if (urlPath === proxyPrefix || urlPath.startsWith(`${proxyPrefix}/`)) {
    await handleGitNexusAiProxy(req, res, urlPath)
    return
  }

  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    res.writeHead(400)
    res.end('Bad request')
    return
  }
  if (decoded.includes('\0')) {
    res.writeHead(400)
    res.end('Bad request')
    return
  }

  const cleanPath = normalize(decoded.replace(/^\/+/, ''))
  const initialPath = resolve(root, cleanPath)
  const initialRel = relative(root, initialPath)
  if (initialRel.startsWith('..') || isAbsolute(initialRel)) {
    res.writeHead(400)
    res.end('Bad request')
    return
  }

  try {
    const initialStat = await stat(initialPath).catch(() => null)

    let finalPath
    if (initialStat?.isDirectory()) {
      finalPath = resolve(initialPath, 'index.html')
    } else if (!initialStat?.isFile()) {
      finalPath = resolve(root, 'index.html')
    } else {
      finalPath = initialPath
    }

    const finalRel = relative(root, finalPath)
    if (finalRel.startsWith('..') || isAbsolute(finalRel)) {
      res.writeHead(400)
      res.end('Bad request')
      return
    }

    const finalStat = await stat(finalPath).catch(() => null)
    if (!finalStat?.isFile()) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    res.writeHead(200, {
      'Cache-Control': finalPath.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'Content-Type': contentTypes[extname(finalPath)] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    })
    const stream = createReadStream(finalPath)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  } catch (error) {
    res.writeHead(500)
    res.end(error instanceof Error ? error.message : 'Internal server error')
  }
})

server.listen(port, host, () => {
  console.log(`gitnexus-web listening on http://${host}:${port}`)
})
