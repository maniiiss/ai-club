/**
 * 公众端积分只读类型。
 * 公众端只展示余额与个人流水，积分扣减由后端业务功能统一触发。
 */
export interface CreditAccount {
  userId: number
  username: string
  nickname: string
  balance: number
  totalGranted: number
  totalConsumed: number
  totalRefunded: number
  updatedAt: string | null
}

export interface CreditTransaction {
  id: number
  userId: number
  username: string
  transactionType: string
  amount: number
  balanceAfter: number
  featureCode: string
  businessKey: string
  reason: string
  operatorUserId: number | null
  relatedTransactionId: number | null
  createdAt: string | null
}
