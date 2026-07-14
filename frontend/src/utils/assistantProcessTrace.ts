export type AssistantProcessTone = 'running' | 'success' | 'warning' | 'danger' | 'muted'

export interface AssistantToolStatusMeta {
  statusText: string
  tone: AssistantProcessTone
  icon: string
}

export interface AssistantToolExecutionViewItem extends AssistantToolStatusMeta {
  id: string
  toolName: string
  compactLabel: string
  functionName: string
  toolCallId: string
  rawStatus: string
  message: string
}

export interface AssistantToolTraceSummary {
  title: string
  description: string
  countText: string
  tone: AssistantProcessTone
}

const readStringField = (source: Record<string, unknown>, fieldName: string) => {
  const value = source[fieldName]
  return typeof value === 'string' ? value.trim() : ''
}

const ASSISTANT_TOOL_DISPLAY_NAMES: Record<string, string> = {
  'project.search': '搜索项目',
  'project.get_detail': '项目详情',
  'project.list_iterations': '项目迭代列表',
  'project.get_iteration_detail': '迭代详情',
  'user.resolve_project_member': '解析项目成员',
  'user.list_project_members': '项目成员列表',
  'work_item.search': '搜索工作项',
  'work_item.get_detail': '工作项详情',
  'work_item.create_draft': '创建工作项草稿',
  'work_item.assign': '指派工作项',
  'agent.list_available': '可用 Agent 列表',
  'agent.get_detail': 'Agent 详情',
  'gitlab_binding.search': '搜索仓库绑定',
  'repo_scan.start': '发起仓库扫描',
  'repo_scan.search': '搜索仓库扫描',
  'repo_scan.list_rulesets': '扫描规则集列表',
  'execution_task.search': '搜索执行任务',
  'execution_task.get_detail': '执行任务详情',
  'execution_task.create': '创建执行任务',
  'execution_task.retry': '重试执行任务',
  'execution_task.cancel': '取消执行任务',
  'test_plan.search': '搜索测试计划',
  'test_plan.get_detail': '测试计划详情',
  'test_plan.create_draft': '创建测试计划草稿',
  'test_case.append': '追加测试用例',
  'document.convert_markdown': '文档转 Markdown',
  'wiki_space.search': '搜索 Wiki 页面',
  'wiki_page.get_detail': '读取 Wiki 页面',
  'wiki.page.get_detail': '读取 Wiki 页面'
}

const resolveAssistantToolDisplayName = (toolCode: string, functionName: string) => {
  const normalizedToolCode = toolCode.trim()
  const normalizedFunctionName = functionName.trim()
  return ASSISTANT_TOOL_DISPLAY_NAMES[normalizedToolCode]
    || ASSISTANT_TOOL_DISPLAY_NAMES[normalizedFunctionName]
    || normalizedToolCode
    || normalizedFunctionName
    || '未知工具'
}

/**
 * 将 Assistant 后端调试状态收敛成前端可读语义，避免模板里散落状态字符串判断。
 */
export const resolveAssistantToolStatusMeta = (status?: string | null): AssistantToolStatusMeta => {
  const normalized = (status || '').trim().toUpperCase()
  if (normalized === 'SUCCESS' || normalized === 'SUCCEEDED') {
    return { statusText: '成功', tone: 'success', icon: '✓' }
  }
  if (normalized === 'STOPPED' || normalized === 'PENDING' || normalized === 'WAITING') {
    return { statusText: '等待确认', tone: 'warning', icon: '!' }
  }
  if (normalized === 'FAILED' || normalized === 'ERROR') {
    return { statusText: '失败', tone: 'danger', icon: '×' }
  }
  if (normalized === 'RUNNING' || normalized === 'STARTED' || normalized === 'EXECUTING') {
    return { statusText: '执行中', tone: 'running', icon: '↯' }
  }
  return { statusText: normalized || '未知', tone: 'muted', icon: '·' }
}

export const normalizeAssistantToolExecutions = (toolExecutions: Array<Record<string, unknown>> = []): AssistantToolExecutionViewItem[] =>
  toolExecutions.map((item, index) => {
    const toolCode = readStringField(item, 'toolCode')
    const functionName = readStringField(item, 'functionName')
    const toolCallId = readStringField(item, 'toolCallId')
    const rawStatus = readStringField(item, 'status')
    const meta = resolveAssistantToolStatusMeta(rawStatus)
    const fallbackId = `${toolCode || functionName || 'tool'}-${index}`
    const toolName = resolveAssistantToolDisplayName(toolCode, functionName)
    return {
      ...meta,
      id: toolCallId || fallbackId,
      toolName,
      compactLabel: `${toolName} · ${meta.statusText}`,
      functionName,
      toolCallId,
      rawStatus,
      message: readStringField(item, 'message')
    }
  })

export const buildAssistantToolTraceSummary = (
  items: AssistantToolExecutionViewItem[]
): AssistantToolTraceSummary | null => {
  if (!items.length) {
    return null
  }

  const failedCount = items.filter((item) => item.tone === 'danger').length
  const warningCount = items.filter((item) => item.tone === 'warning').length
  const runningCount = items.filter((item) => item.tone === 'running').length
  const tone: AssistantProcessTone = failedCount > 0
    ? 'danger'
    : warningCount > 0
      ? 'warning'
      : runningCount > 0
        ? 'running'
        : 'success'
  const statusFragments = [
    `${items.length} 次调用`,
    failedCount ? `${failedCount} 次失败` : '',
    warningCount ? `${warningCount} 次等待确认` : '',
    runningCount ? `${runningCount} 次执行中` : ''
  ].filter(Boolean)

  return {
    title: '工具调用',
    description: statusFragments.join('，'),
    countText: `${items.length} 次`,
    tone
  }
}

export const buildAssistantStreamingThinkMarkdown = (statusText?: string | null) =>
  `<think>${(statusText || '').trim() || 'GitPilot 正在思考'}`
