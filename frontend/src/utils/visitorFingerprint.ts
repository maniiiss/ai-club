/**
 * 分享页访问者指纹工具。
 *
 * 用途：
 * - 项目分享页（凭 token 匿名访问）需要给"同来源覆盖式反馈"提供一个稳定标识；
 * - 不引入第三方指纹库，仅基于浏览器可直接读到的少量信号生成 SHA-256；
 * - 服务端会再做一次 SHA-256(fp + salt) 加盐，避免直接信任客户端数据；
 * - 使用 sessionStorage 缓存，分享页关闭即释放，避免跨会话/跨项目追踪。
 */

const STORAGE_KEY = 'gitlab_share_visitor_fingerprint'

/** 计算字符串的 SHA-256 hex digest。 */
async function sha256Hex(input: string): Promise<string> {
  const buffer = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 获取（或生成）当前访问者指纹。
 *
 * 信号来源：UA、语言、时区、屏幕尺寸、硬件并发数。
 * 单一信号都不强，但组合后能在 share 会话内稳定区分不同访客，对反馈去重已经够用。
 */
export async function getVisitorFingerprint(): Promise<string> {
  const cached = sessionStorage.getItem(STORAGE_KEY)
  if (cached && cached.length >= 16) {
    return cached
  }
  const signals = [
    navigator.userAgent || '',
    navigator.language || '',
    new Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    `${screen.width}x${screen.height}`,
    String(navigator.hardwareConcurrency || ''),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? '')
  ]
  const fingerprint = await sha256Hex(signals.join('|'))
  sessionStorage.setItem(STORAGE_KEY, fingerprint)
  return fingerprint
}
