/**
 * Pi 会话短期存储。
 * 配置 Redis 时保存可恢复的请求和消息快照；Redis 不可用时降级到进程内缓存，
 * 业务任务事实仍以 backend 数据库为准。
 */
export class SessionStore {
  constructor({ redisUrl, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this.redisUrl = redisUrl
    this.ttlSeconds = Math.max(60, Math.floor(ttlMs / 1000))
    this.local = new Map()
    this.client = null
    this.ready = this.#connect()
  }

  async save(sessionId, snapshot) {
    const normalized = { ...snapshot, savedAt: Date.now() }
    this.local.set(sessionId, normalized)
    const client = await this.ready
    if (client) await client.set(this.#key(sessionId), JSON.stringify(normalized), { EX: this.ttlSeconds })
  }

  async load(sessionId) {
    const client = await this.ready
    if (client) {
      const value = await client.get(this.#key(sessionId))
      if (value) {
        const parsed = JSON.parse(value)
        this.local.set(sessionId, parsed)
        return parsed
      }
    }
    const local = this.local.get(sessionId)
    if (local && Date.now() - local.savedAt <= this.ttlSeconds * 1000) return local
    this.local.delete(sessionId)
    return null
  }

  async #connect() {
    if (!this.redisUrl) return null
    try {
      const { createClient } = await import('redis')
      const client = createClient({ url: this.redisUrl })
      client.on('error', (error) => console.error('Pi Redis session store error', error.message))
      await client.connect()
      this.client = client
      return client
    } catch (error) {
      console.error('Pi Redis unavailable; using memory session store', error.message)
      return null
    }
  }

  #key(sessionId) { return `gitpilot:pi-runtime:session:${sessionId}` }
}
