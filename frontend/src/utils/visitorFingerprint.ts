/**
 * 分享页访问者指纹工具。
 *
 * 用途：
 * - 项目分享页（凭 token 匿名访问）需要给"同来源覆盖式反馈"提供一个稳定标识；
 * - 不引入第三方指纹库，仅基于浏览器可直接读到的少量信号生成哈希；
 * - 服务端会再做一次 SHA-256(fp + salt) 加盐，避免直接信任客户端数据；
 * - 使用 sessionStorage 缓存，分享页关闭即释放，避免跨会话/跨项目追踪。
 *
 * 安全上下文兼容：
 * - `crypto.subtle` 仅在 Secure Context（HTTPS / localhost）可用；
 * - 分享页常通过内网 HTTP 域名访问，所以需要 fallback 到纯 JS 哈希，
 *   否则 `crypto.subtle.digest` 会抛错，导致提交反馈时"指纹生成失败"。
 * - 后端反正会再加盐 SHA-256，前端哈希不需要密码学强度，仅需稳定 + 长度足够区分。
 */

const STORAGE_KEY = 'gitlab_share_visitor_fingerprint'

/** 计算字符串的 SHA-256 hex digest（仅在 Secure Context 可用）。 */
async function sha256Hex(input: string): Promise<string> {
  const buffer = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 非 Secure Context 下的纯 JS 哈希 fallback：
 * 用 cyrb53 风格的双 32 位混合得到 128bit 输出（再拼一遍翻倍到 64 char hex），
 * 同一输入稳定，分布足够区分不同访问者，且不依赖任何浏览器 API。
 */
function fallbackHashHex(input: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const part1 = (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
  // 再扰动一次得到第二段，凑齐 64 char 与 SHA-256 输出长度一致，减少后端字段长度差异
  let g1 = h1 ^ 0x9e3779b9
  let g2 = h2 ^ 0x85ebca6b
  g1 = Math.imul(g1 ^ (g1 >>> 15), 2246822507)
  g2 = Math.imul(g2 ^ (g2 >>> 13), 3266489909)
  const part2 = (g2 >>> 0).toString(16).padStart(8, '0') + (g1 >>> 0).toString(16).padStart(8, '0')
  return (part1 + part2 + part1 + part2).slice(0, 64)
}

/** 判断当前运行环境的 `crypto.subtle` 是否真的可用。 */
function hasSubtleCrypto(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.digest === 'function'
  )
}

/**
 * 获取（或生成）当前访问者指纹。
 *
 * 信号来源：UA、语言、时区、屏幕尺寸、硬件并发数、deviceMemory。
 * 单一信号都不强，但组合后能在 share 会话内稳定区分不同访客，对反馈去重已经够用。
 */
export async function getVisitorFingerprint(): Promise<string> {
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY)
    if (cached && cached.length >= 16) {
      return cached
    }
  } catch {
    // sessionStorage 可能在隐私模式 / iframe 中被禁用，忽略，走重新计算
  }

  const signals = [
    navigator.userAgent || '',
    navigator.language || '',
    new Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    `${screen.width}x${screen.height}`,
    String(navigator.hardwareConcurrency || ''),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? '')
  ]
  const raw = signals.join('|')

  let fingerprint = ''
  if (hasSubtleCrypto()) {
    try {
      fingerprint = await sha256Hex(raw)
    } catch (error) {
      // 即便 subtle 存在，某些环境（被 CSP 拦截 / 旧实现）仍可能抛错，降级到 fallback
      console.warn('SubtleCrypto 不可用，降级为纯 JS 指纹哈希', error)
    }
  }
  if (!fingerprint) {
    fingerprint = fallbackHashHex(raw)
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, fingerprint)
  } catch {
    // 同上，存不进去也不影响本次提交
  }
  return fingerprint
}
