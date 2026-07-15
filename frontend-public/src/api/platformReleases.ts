import { http } from '@/src/api/http'
import type { ApiResponse } from '@/src/types/api'
import type { PlatformRelease } from '@/src/types/platformRelease'

/** 查询当前用户尚未展示的最新版本。 */
export const getPendingPlatformRelease = async () => {
  const response = await http.get<ApiResponse<PlatformRelease | null>>('/api/platform-releases/pending')
  return response.data.data
}

/** 记录用户已展示版本，关闭弹窗和点击确认共用该接口。 */
export const acknowledgePlatformRelease = async (releaseId: number) => {
  const response = await http.post<ApiResponse<{ releaseId: number; viewed: boolean }>>(`/api/platform-releases/${releaseId}/acknowledge`)
  return response.data.data
}
