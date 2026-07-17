import { createGitlabBindingScanTask } from '@/src/api/development'
import { executeAssistantMcpTool } from '@/src/api/assistant'
import { createExecutionTask, createTestPlan } from '@/src/api/execution'
import { createWorkItem } from '@/src/api/planning'
import type { AssistantActionItem } from '@/src/types/assistant'
import { getErrorMessage } from '@/src/lib/utils'
import { normalizeTaskType } from '@/src/lib/requirementAiUtils'

/**
 * 执行 Assistant 动作卡片对应的既有业务 API。
 * 业务意图：聊天室和 Assistant 抽屉共用同一套动作分发，避免为聊天室另起一套动作协议。
 */
export const executeAssistantAction = async (action: AssistantActionItem): Promise<string | void> => {
  const params = action.params || {}
  if (action.type === 'EXTERNAL_MCP_TOOL') {
    // 外部 MCP 的确认动作需要把真实工具结果交回工作区，才能继续当前用户问题。
    return executeAssistantMcpTool(
      String(params.toolCode || ''),
      (params.arguments || {}) as Record<string, unknown>,
      {
        scopeKey: String(params.scopeKey || ''),
        clientConversationId: String(params.clientConversationId || ''),
        confirmationToken: String(params.confirmationToken || ''),
      },
    )
  }
  if (action.type === 'CREATE_EXECUTION_TASK') {
    await createExecutionTask({
      scenarioCode: String(params.scenarioCode || ''),
      projectId: Number(params.projectId),
      workItemId: params.workItemId == null ? null : Number(params.workItemId),
      title: params.title == null ? undefined : String(params.title),
      triggerSource: String(params.triggerSource || 'HERMES'),
      inputPayload: (params.inputPayload || {}) as Record<string, unknown>,
    })
    return
  }
  if (action.type === 'CREATE_REPOSITORY_SCAN_TASK') {
    await createGitlabBindingScanTask(Number(params.bindingId), {
      branch: String(params.branch || ''),
      rulesetCode: String(params.rulesetCode || ''),
    })
    return
  }
  if (action.type === 'CREATE_WORK_ITEM_DRAFT') {
    const workItemType = String(params.workItemType || '需求')
    const content = String(params.content || '')
    await createWorkItem({
      name: String(params.name || content.slice(0, 40) || `GitPilot 创建的${workItemType}草稿`),
      workItemType,
      taskType: workItemType === '任务' ? normalizeTaskType(String(params.taskType || '')) : null,
      status: '草稿',
      priority: '中',
      assignee: params.assigneeUserId ? '待确认' : '',
      assigneeUserId: params.assigneeUserId == null ? null : Number(params.assigneeUserId),
      collaboratorUserIds: [],
      description: content,
      projectId: Number(params.projectId),
      agentId: null,
      iterationId: params.iterationId == null ? null : Number(params.iterationId),
      requirementTaskId: null,
    })
    return
  }
  if (action.type === 'CREATE_TEST_PLAN_DRAFT') {
    await createTestPlan({
      name: String(params.name || 'GitPilot 测试计划草稿'),
      projectId: Number(params.projectId),
      iterationId: params.iterationId == null ? null : Number(params.iterationId),
      status: '草稿',
      description: String(params.description || ''),
    })
    return
  }
  throw new Error('暂不支持该动作类型')
}

export const getAssistantActionErrorMessage = (error: unknown): string => getErrorMessage(error)
