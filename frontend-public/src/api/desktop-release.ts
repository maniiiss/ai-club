import { http, unwrap } from './http'
import type { DesktopReleaseLatest } from '@/src/types/desktop-release'

/** 公开读取 Windows x64 stable 最新桌面版本，不要求登录。 */
export const fetchLatestDesktopRelease = async (): Promise<DesktopReleaseLatest | null> => {
  const response = await http.get<{ success: boolean; message: string; data: DesktopReleaseLatest | null }>('/api/desktop-releases/latest', {
    params: { channel: 'stable', platform: 'windows', arch: 'x86_64' },
    // 业务意图：管理员发布新版本后，宣传页必须立即重新确认版本状态，不能继续使用发布前的空结果缓存。
    headers: { 'Cache-Control': 'no-cache' },
  })
  return unwrap(response)
}
