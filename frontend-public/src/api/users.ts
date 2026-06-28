/**
 * 用户轻量选项 API。
 * 供聊天室邀请、项目负责人选择等公共选择器复用。
 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'

export interface UserOptionItem {
  id: number
  username: string
  nickname: string
  avatarUrl: string | null
  enabled: boolean
}

/** 查询可选用户列表。 */
export const listUserOptions = async (): Promise<UserOptionItem[]> => {
  const response = await http.get<ApiResponse<UserOptionItem[]>>('/api/users/options')
  return unwrap(response)
}
