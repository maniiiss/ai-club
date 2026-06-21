/**
 * 公众端积分 API。
 * 仅提供当前用户余额和流水查询，不暴露任何前端可直接调用的扣减入口。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse, PageResponse } from '@/src/types/api'
import type { CreditAccount, CreditTransaction } from '@/src/types/credits'

export const getMyCreditAccount = async (): Promise<CreditAccount> => {
  const res = await http.get<ApiResponse<CreditAccount>>('/api/credits/me')
  return unwrap(res)
}

export const pageMyCreditTransactions = async (params: { page?: number; size?: number } = {}): Promise<PageResponse<CreditTransaction>> => {
  const res = await http.get<ApiResponse<PageResponse<CreditTransaction>>>('/api/credits/me/transactions', {
    params: cleanParams(params),
  })
  return unwrap(res)
}
