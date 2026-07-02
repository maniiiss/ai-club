/**
 * 新手引导状态 API。
 * 与后端 /api/auth/guide-status 接口对齐。
 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type { CurrentUserInfo } from '@/src/types/auth'

/** 更新用户新手引导完成状态（全量覆盖）。 */
export const updateGuideStatus = async (pageKeys: string[]): Promise<CurrentUserInfo> => {
  const response = await http.put<ApiResponse<CurrentUserInfo>>('/api/auth/guide-status', {
    pageKeys,
  })
  return unwrap(response)
}
