import { http } from './http'
import type { ApiResponse, PageResponse } from '@/types/platform'
import type { PlatformRelease, PlatformReleaseRequest } from '@/types/platform-release'

/** 分页读取管理端版本发布历史。 */
export const pagePlatformReleases = async (page = 1, size = 10) => {
  const { data } = await http.get<ApiResponse<PageResponse<PlatformRelease>>>('/api/platform-releases/admin', { params: { page, size } })
  return data.data
}

/** 发布一个新的平台版本。 */
export const publishPlatformRelease = async (payload: PlatformReleaseRequest) => {
  const { data } = await http.post<ApiResponse<PlatformRelease>>('/api/platform-releases', payload)
  return data.data
}

/** 查询单条版本的完整 Markdown 内容。 */
export const getPlatformRelease = async (id: number) => {
  const { data } = await http.get<ApiResponse<PlatformRelease>>(`/api/platform-releases/admin/${id}`)
  return data.data
}
