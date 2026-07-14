import http from 'node:http'
import { RuntimeManager } from './runtime-manager.mjs'
import { SessionStore } from './session-store.mjs'

const port = Number(process.env.PI_RUNTIME_PORT || 9010)
const serviceToken = process.env.PI_RUNTIME_SERVICE_TOKEN || 'git-ai-club-internal-service-token'
const backendBaseUrl = (process.env.PI_RUNTIME_BACKEND_BASE_URL || '').replace(/\/$/, '')

const json = (response, status, payload) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const readBody = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const authorized = (request) => request.headers.authorization === `Bearer ${serviceToken}`

const postBackendEvent = async (event) => {
  if (!backendBaseUrl) return
  const response = await fetch(`${backendBaseUrl}/internal/runtime/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
  if (!response.ok) throw new Error(`Backend runtime event rejected: ${response.status}`)
}

const executeBackendTool = async (toolRequest) => {
  if (!backendBaseUrl) throw new Error('PI_RUNTIME_BACKEND_BASE_URL is not configured')
  const response = await fetch(`${backendBaseUrl}/internal/runtime/tools/execute`, {
    method: 'POST',
    headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(toolRequest),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.message || payload.detail || 'Platform tool execution failed')
  return payload
}

const manager = new RuntimeManager({
  emitEvent: postBackendEvent,
  executeTool: executeBackendTool,
  modelProvider: process.env.PI_RUNTIME_MODEL_PROVIDER,
  modelId: process.env.PI_RUNTIME_MODEL_ID,
  sessionStore: new SessionStore({
    redisUrl: process.env.PI_RUNTIME_REDIS_URL,
    ttlMs: Number(process.env.PI_RUNTIME_SESSION_TTL_MS || 86400000),
  }),
})

const server = http.createServer(async (request, response) => {
  if (request.url === '/healthz' && request.method === 'GET') return json(response, 200, { status: 'UP', runtimeCode: 'PI_RUNTIME' })
  if (!authorized(request)) return json(response, 401, { message: 'Runtime service authentication failed' })

  try {
    if (request.url === '/internal/runtime/runs' && request.method === 'POST') {
      const body = await readBody(request)
      const accepted = await manager.start(body)
      return json(response, 202, accepted)
    }
    if (request.url?.startsWith('/internal/runtime/sessions/') && request.url.endsWith('/resume') && request.method === 'POST') {
      const sessionId = request.url.split('/')[4]
      const accepted = await manager.resume(sessionId, await readBody(request))
      return json(response, 202, accepted)
    }
    if (request.url?.startsWith('/internal/runtime/runs/') && request.url.endsWith('/cancel') && request.method === 'POST') {
      const runId = request.url.split('/')[4]
      return json(response, 200, { runId, canceled: manager.cancel(runId) })
    }
    if (request.url === '/internal/runtime/tools/execute' && request.method === 'POST') {
      return json(response, 200, await executeBackendTool(await readBody(request)))
    }
    return json(response, 404, { message: 'Runtime endpoint not found' })
  } catch (error) {
    return json(response, 500, { message: error.message })
  }
})

server.listen(port, '0.0.0.0', () => console.log(`PI_RUNTIME listening on ${port}`))
