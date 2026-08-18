import { http, unwrap } from './http'
import type { DesktopReleaseLatest } from '@/src/types/desktop-release'

/** 公开读取 Windows x64 stable 最新桌面版本，不要求登录。 */
export const fetchLatestDesktopRelease = async (): Promise<DesktopReleaseLatest | null> => {
  const response = await http.get<{ success: boolean; message: string; data: DesktopReleaseLatest | null }>('/api/desktop-releases/latest', {
    params: { channel: 'stable', platform: 'windows', arch: 'x86_64' },
  })
  return unwrap(response)
}
