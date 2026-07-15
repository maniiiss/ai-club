/** 管理端 GitPilot 反馈运营类型。 */
export interface AssistantFeedbackItem {
  id: number
  sessionId: number
  assistantMessageId: number
  userMessageId: number | null
  submitterUserId: number
  submitterUsername: string
  submitterNickname: string
  vote: 'UP' | 'DOWN' | string
  reasonCodes: string[]
  comment: string
  questionSnapshot: string
  answerSnapshot: string
  runtimeRegistryCode: string
  routeName: string
  projectId: number | null
  status: string
  assigneeUserId: number | null
  resolutionCode: string | null
  resolutionNote: string
  improvementTags: string[]
  datasetStatus: string
  createdAt: string | null
  updatedAt: string | null
  resolvedAt: string | null
}

export interface AssistantFeedbackActivity {
  id: number
  actionType: string
  fromStatus: string | null
  toStatus: string | null
  note: string
  actorUserId: number | null
  createdAt: string | null
}

export interface AssistantFeedbackDetail {
  feedback: AssistantFeedbackItem
  activities: AssistantFeedbackActivity[]
}

export interface AssistantFeedbackStats {
  newCount: number
  inProgressCount: number
  resolvedCount: number
  negativeCount: number
  totalCount: number
}

export interface AssistantFeedbackPageQuery {
  page: number
  size: number
  keyword?: string
  vote?: string
  status?: string
  datasetStatus?: string
  projectId?: number
  assigneeUserId?: number
}
