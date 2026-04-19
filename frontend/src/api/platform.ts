import { AUTH_TOKEN_KEY } from '@/constants/auth'
import { http, getResolvedApiBaseUrl } from './http'
import type {
  AgentItem,
  AgentTestResult,
  ApiResponse,
  DashboardOverview,
  DashboardQuickTaskItem,
  ExecutionArtifactItem,
  ExecutionRunDetailItem,
  ExecutionRunItem,
  ExecutionStreamEvent,
  ExecutionTaskDetailItem,
  ExecutionTaskItem,
  IterationBoardItem,
  IterationItem,
  KnowledgeGraphItem,
  PageResponse,
  ProjectBurndownItem,
  ProjectItem,
  TestPlanItem,
  TaskAgentRunItem,
  TaskCommentItem,
  TaskRequirementAiResultItem,
  TaskItem,
  UploadedFileItem,
  DocumentAssetItem,
  DocumentMarkdownResultItem,
  WikiDirectorySummaryItem,
  WikiDirectoryTreeNodeItem,
  WikiSpaceDetailItem,
  WikiSpaceItem,
  WikiSpaceMemberItem,
  WikiSpacePageDetailItem,
  WikiSpacePageSummaryItem,
  WikiSpacePageVersionItem,
  WikiSpaceSearchResultItem
} from '@/types/platform'

interface ExecutionRunStreamHandlers {
  onEvent?: (event: ExecutionStreamEvent) => void
  onDone?: () => void
  onError?: (error: Error) => void
}

export interface ProjectPayload {
  name: string
  owner: string
  ownerUserId?: number | null
  memberUserIds?: number[]
  status: string
  description: string
}

export interface AgentPayload {
  name: string
  type: string
  category: string
  status: string
  enabled: boolean
  accessType: 'BUILT_IN' | 'LLM_PROMPT' | 'HTTP_API' | 'AGENT_RUNTIME'
  builtinCode?: 'CODE_REVIEW' | 'TEST_SUGGESTION' | 'REQUIREMENT_BREAKDOWN' | 'REPOSITORY_SCAN_PLAN' | null
  capability: string
  description: string
  aiModelConfigId?: number | null
  systemPrompt?: string
  userPromptTemplate?: string
  endpointUrl?: string
  runtimeType?: 'OPENCLAW' | 'CODEX_CLI' | 'CLAUDE_CODE_CLI' | null
  runtimeAgentRef?: string
  runtimeSessionKeyTemplate?: string
  httpMethod?: string
  httpHeaders?: string
  httpAuthType?: 'NONE' | 'BEARER' | null
  httpAuthToken?: string
  httpRequestTemplate?: string
  httpResponsePath?: string
  timeoutSeconds?: number | null
  projectId?: number | null
}


export interface TaskPayload {
  name: string
  workItemType?: '需求' | '任务' | '缺陷'
  status: string
  priority: string
  /** 预估工时，单位为小时。 */
  workHours?: number | null
  assignee: string
  assigneeUserId?: number | null
  collaboratorUserIds?: number[]
  description: string
  requirementMarkdown?: string
  prototypeUrl?: string
  /** 工作项计划开始日期，格式为 yyyy-MM-dd。 */
  planStartDate?: string | null
  /** 工作项计划结束日期，格式为 yyyy-MM-dd。 */
  planEndDate?: string | null
  projectId: number
  agentId: number | null
  iterationId?: number | null
  requirementTaskId?: number | null
}

export interface DashboardQuickTaskPayloadItem {
  /** 已存在快捷任务ID；新增时传空。 */
  id?: number | null
  /** 前端本地草稿唯一键，用于保存后回填对应行。 */
  clientKey: string
  /** 当前快捷任务内容。 */
  content: string
  /** 是否勾选完成。 */
  checked: boolean
}

export interface IterationPayload {
  name: string
  goal: string
  status: string
  startDate: string
  endDate: string
  description: string
  sortOrder: number
}

export interface TestCaseStepPayload {
  stepNo: number
  action: string
  expectedResult: string
}

export interface TestCasePayload {
  title: string
  moduleName: string
  caseType: string
  priority: string
  precondition: string
  remarks: string
  sortOrder: number
  steps: TestCaseStepPayload[]
}

export interface TestPlanPayload {
  name: string
  projectId: number
  iterationId: number
  status: string
  description: string
  cases: TestCasePayload[]
}

export interface WikiSpacePayload {
  name: string
  description: string
  readScope: 'MEMBERS_ONLY' | 'ALL_LOGGED_IN'
  boundProjectId?: number | null
  memberDefaultSource?: 'MANUAL' | 'PROJECT_MEMBERS'
}

export interface WikiSpaceMemberPayloadItem {
  userId: number
  memberRole: 'ADMIN' | 'EDITOR' | 'VIEWER'
}

export interface WikiDirectoryPayload {
  name: string
  content: string
  parentDirectoryId?: number | null
  boundProjectId?: number | null
}

export interface WikiSpacePagePayload {
  directoryId: number
  parentPageId?: number | null
  title: string
  content: string
  changeSummary?: string
}

export interface WikiImportPagePayload {
  assetId: number
  directoryId: number
  parentPageId?: number | null
  title: string
  content?: string
}

export interface ProjectQuery {
  page: number
  size: number
  keyword?: string
  status?: string
}

export interface AgentQuery {
  page: number
  size: number
  keyword?: string
  status?: string
  type?: string
  accessType?: 'BUILT_IN' | 'LLM_PROMPT' | 'HTTP_API' | 'AGENT_RUNTIME'
  category?: string
  projectId?: number
}

export interface TaskQuery {
  page: number
  size: number
  keyword?: string
  status?: string
  priority?: string
  projectId?: number
  agentId?: number
}

export interface ExecutionTaskQuery {
  page: number
  size: number
  keyword?: string
  status?: string
  scenarioCode?: string
  projectId?: number
}

export interface ExecutionAgentBindingPayload {
  stepCode: string
  agentId: number
}

export interface CreateExecutionTaskPayload {
  scenarioCode: string
  projectId: number
  workItemId?: number | null
  title?: string
  triggerSource?: string
  planConfirmationRequired?: boolean
  agentBindings?: ExecutionAgentBindingPayload[]
  inputPayload?: Record<string, unknown>
}

export interface UpdateExecutionPlanMarkdownPayload {
  planMarkdown: string
}

export interface ConfirmExecutionPlanPayload {
  planMarkdown: string
}

export interface WorkItemQuery {
  iterationId?: number
  unplanned?: boolean
  workItemType?: '需求' | '任务' | '缺陷' | '全部'
  keyword?: string
}

export interface WorkItemPageQuery extends WorkItemQuery {
  page: number
  size: number
  status?: string
  priority?: string
  assigneeUserId?: number
}

export interface TestPlanQuery {
  page: number
  size: number
  keyword?: string
  projectId?: number
  iterationId?: number
  status?: string
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const getDashboardOverview = async () => {
  const { data } = await http.get<ApiResponse<DashboardOverview>>('/api/dashboard/overview')
  return data.data
}

export const listDashboardQuickTasks = async () => {
  const { data } = await http.get<ApiResponse<DashboardQuickTaskItem[]>>('/api/dashboard/quick-tasks')
  return data.data
}

export const saveDashboardQuickTasks = async (items: DashboardQuickTaskPayloadItem[]) => {
  const { data } = await http.put<ApiResponse<DashboardQuickTaskItem[]>>('/api/dashboard/quick-tasks', { items })
  return data.data
}

export const pageProjects = async (query: ProjectQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ProjectItem>>>('/api/projects', {
    params: cleanParams(query)
  })
  return data.data
}

export const listProjectOptions = async () => {
  const { data } = await http.get<ApiResponse<ProjectItem[]>>('/api/projects/options')
  return data.data
}

export const createProject = async (payload: ProjectPayload) => {
  const { data } = await http.post<ApiResponse<ProjectItem>>('/api/projects', payload)
  return data.data
}

export const updateProject = async (id: number, payload: ProjectPayload) => {
  const { data } = await http.put<ApiResponse<ProjectItem>>(`/api/projects/${id}`, payload)
  return data.data
}

export const getProjectDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ProjectItem>>(`/api/projects/${id}`)
  return data.data
}

export const deleteProject = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/projects/${id}`)
}

export const pageAgents = async (query: AgentQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<AgentItem>>>('/api/agents', {
    params: cleanParams(query)
  })
  return data.data
}

export const listAgentOptions = async (projectId?: number) => {
  const { data } = await http.get<ApiResponse<AgentItem[]>>('/api/agents/options', {
    params: cleanParams({ projectId })
  })
  return data.data
}

export const createAgent = async (payload: AgentPayload) => {
  const { data } = await http.post<ApiResponse<AgentItem>>('/api/agents', payload)
  return data.data
}

export const updateAgent = async (id: number, payload: AgentPayload) => {
  const { data } = await http.put<ApiResponse<AgentItem>>(`/api/agents/${id}`, payload)
  return data.data
}

export const deleteAgent = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/agents/${id}`)
}

export const testAgent = async (id: number, input: string) => {
  const { data } = await http.post<ApiResponse<AgentTestResult>>(`/api/agents/${id}/test`, { input })
  return data.data
}

export const pageTasks = async (query: TaskQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<TaskItem>>>('/api/tasks', {
    params: cleanParams(query)
  })
  return data.data
}

export const createTask = async (payload: TaskPayload) => {
  const { data } = await http.post<ApiResponse<TaskItem>>('/api/tasks', payload)
  return data.data
}

export const updateTask = async (id: number, payload: TaskPayload) => {
  const { data } = await http.put<ApiResponse<TaskItem>>(`/api/tasks/${id}`, payload)
  return data.data
}

export const deleteTask = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/tasks/${id}`)
}

export const getTaskDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<TaskItem>>(`/api/tasks/${id}`)
  return data.data
}

export const listTaskAgentRuns = async (id: number) => {
  const { data } = await http.get<ApiResponse<TaskAgentRunItem[]>>(`/api/tasks/${id}/agent-runs`)
  return data.data
}

export const listTaskComments = async (id: number) => {
  const { data } = await http.get<ApiResponse<TaskCommentItem[]>>(`/api/tasks/${id}/comments`)
  return data.data
}

export const createTaskComment = async (id: number, content: string) => {
  const { data } = await http.post<ApiResponse<TaskCommentItem>>(`/api/tasks/${id}/comments`, { content })
  return data.data
}

export const uploadTaskCommentImage = async (id: number, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<UploadedFileItem>>(`/api/tasks/${id}/comment-images`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return data.data
}

export const uploadTaskImage = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<UploadedFileItem>>('/api/tasks/images', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return data.data
}

export const generateTaskRequirementAi = async (
  id: number,
  payload: { action: string; modelConfigId?: number | null }
) => {
  const { data } = await http.post<ApiResponse<TaskRequirementAiResultItem>>(`/api/tasks/${id}/requirement-ai`, payload)
  return data.data
}

export const runTaskAgent = async (id: number, input: string) => {
  const { data } = await http.post<ApiResponse<TaskAgentRunItem>>(`/api/tasks/${id}/agent-runs`, { input })
  return data.data
}

export const pageExecutionTasks = async (query: ExecutionTaskQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<ExecutionTaskItem>>>('/api/execution-tasks', {
    params: cleanParams(query)
  })
  return data.data
}

export const getExecutionTaskDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ExecutionTaskDetailItem>>(`/api/execution-tasks/${id}`, {
    params: { _ts: Date.now() }
  })
  return data.data
}

export const listExecutionTaskRuns = async (id: number) => {
  const { data } = await http.get<ApiResponse<ExecutionRunItem[]>>(`/api/execution-tasks/${id}/runs`)
  return data.data
}

export const getExecutionRunDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ExecutionRunDetailItem>>(`/api/execution-runs/${id}`, {
    params: { _ts: Date.now() }
  })
  return data.data
}

export const getExecutionArtifactDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ExecutionArtifactItem>>(`/api/execution-artifacts/${id}`, {
    params: { _ts: Date.now() }
  })
  return data.data
}

/**
 * 执行详情页需要携带登录态并支持 afterId 断线续传，因此采用 fetch 手动消费 SSE。
 */
export const streamExecutionRunEvents = async (
  runId: number,
  afterId: number | null,
  handlers: ExecutionRunStreamHandlers
) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const controller = new AbortController()
  const params = afterId && afterId > 0 ? `?afterId=${afterId}` : ''
  const response = await fetch(`${getResolvedApiBaseUrl()}/api/execution-runs/${runId}/events/stream${params}`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    signal: controller.signal
  })

  if (!response.ok) {
    let message = '执行流连接失败'
    try {
      const errorBody = await response.json()
      message = errorBody?.message || message
    } catch {
      // 保留默认提示即可。
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('执行流响应为空')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const consumeChunk = (chunk: string) => {
    const normalized = chunk.replace(/\r/g, '')
    const lines = normalized.split('\n')
    let eventName = ''
    let payloadText = ''
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        payloadText += line.slice('data:'.length).trim()
      }
    }
    if (eventName !== 'execution-step-event' || !payloadText) {
      return
    }
    handlers.onEvent?.(JSON.parse(payloadText) as ExecutionStreamEvent)
  }

  ;(async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        if (buffer.trim()) {
          consumeChunk(buffer)
        }
        handlers.onDone?.()
        break
      }
      buffer += decoder.decode(value, { stream: true })
      let boundaryIndex = buffer.indexOf('\n\n')
      while (boundaryIndex >= 0) {
        const eventChunk = buffer.slice(0, boundaryIndex)
        buffer = buffer.slice(boundaryIndex + 2)
        if (eventChunk.trim() && !eventChunk.trim().startsWith(':')) {
          consumeChunk(eventChunk)
        }
        boundaryIndex = buffer.indexOf('\n\n')
      }
    }
  })().catch((error: unknown) => {
    if (controller.signal.aborted) {
      return
    }
    handlers.onError?.(error instanceof Error ? error : new Error('执行流连接已中断'))
  })

  return {
    abort: () => controller.abort()
  }
}

export const downloadExecutionArtifact = async (artifactId: number) => {
  const response = await http.get(`/api/execution-artifacts/${artifactId}/download`, {
    responseType: 'blob'
  })
  const disposition = String(response.headers['content-disposition'] || '')
  const matched = disposition.match(/filename="?([^"]+)"?/)
  const fileName = matched?.[1] || `execution-artifact-${artifactId}`
  return {
    blob: response.data as Blob,
    fileName
  }
}

export const createExecutionTask = async (payload: CreateExecutionTaskPayload) => {
  const { data } = await http.post<ApiResponse<ExecutionTaskItem>>('/api/execution-tasks', payload)
  return data.data
}

export const updateExecutionPlanMarkdown = async (id: number, payload: UpdateExecutionPlanMarkdownPayload) => {
  const { data } = await http.put<ApiResponse<ExecutionTaskDetailItem>>(`/api/execution-tasks/${id}/plan-markdown`, payload)
  return data.data
}

export const confirmExecutionPlan = async (id: number, payload: ConfirmExecutionPlanPayload) => {
  const { data } = await http.post<ApiResponse<ExecutionTaskDetailItem>>(`/api/execution-tasks/${id}/confirm-plan`, payload)
  return data.data
}

export const cancelExecutionTask = async (id: number) => {
  const { data } = await http.post<ApiResponse<ExecutionTaskItem>>(`/api/execution-tasks/${id}/cancel`)
  return data.data
}

export const retryExecutionTask = async (id: number) => {
  const { data } = await http.post<ApiResponse<ExecutionTaskItem>>(`/api/execution-tasks/${id}/retry`)
  return data.data
}

export const passRequirementDev = async (id: number) => {
  const { data } = await http.post<ApiResponse<TaskItem>>(`/api/tasks/${id}/requirement-dev-pass`)
  return data.data
}

export const passRequirementTest = async (id: number) => {
  const { data } = await http.post<ApiResponse<TaskItem>>(`/api/tasks/${id}/requirement-test-pass`)
  return data.data
}

export const pageTestPlans = async (query: TestPlanQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<TestPlanItem>>>('/api/test-plans', {
    params: cleanParams(query)
  })
  return data.data
}

export const getTestPlanDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<TestPlanItem>>(`/api/test-plans/${id}`)
  return data.data
}

export const listTestPlanIterations = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<IterationItem[]>>(`/api/test-plans/projects/${projectId}/iterations`)
  return data.data
}

export const createTestPlan = async (payload: TestPlanPayload) => {
  const { data } = await http.post<ApiResponse<TestPlanItem>>('/api/test-plans', payload)
  return data.data
}

export const updateTestPlan = async (id: number, payload: TestPlanPayload) => {
  const { data } = await http.put<ApiResponse<TestPlanItem>>(`/api/test-plans/${id}`, payload)
  return data.data
}

export const deleteTestPlan = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/test-plans/${id}`)
}

export const getIterationBoard = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<IterationBoardItem>>(`/api/projects/${projectId}/iteration-board`)
  return data.data
}

export const getProjectBurndown = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<ProjectBurndownItem>>(`/api/projects/${projectId}/burndown`)
  return data.data
}

export const getProjectKnowledgeGraph = async (projectId: number, refresh = false) => {
  const { data } = await http.get<ApiResponse<KnowledgeGraphItem>>(`/api/projects/${projectId}/knowledge-graph`, {
    params: cleanParams({ refresh })
  })
  return data.data
}

export const rebuildProjectKnowledgeGraph = async (projectId: number) => {
  const { data } = await http.post<ApiResponse<KnowledgeGraphItem>>(`/api/projects/${projectId}/knowledge-graph/rebuild`)
  return data.data
}

export const listWikiSpaces = async (query?: { keyword?: string; mineOnly?: boolean; publicOnly?: boolean; projectId?: number | null }) => {
  const { data } = await http.get<ApiResponse<WikiSpaceItem[]>>('/api/wiki/spaces', {
    params: cleanParams(query || {})
  })
  return data.data
}

export const createWikiSpace = async (payload: WikiSpacePayload) => {
  const { data } = await http.post<ApiResponse<WikiSpaceDetailItem>>('/api/wiki/spaces', payload)
  return data.data
}

export const getWikiSpaceDetail = async (spaceId: number) => {
  const { data } = await http.get<ApiResponse<WikiSpaceDetailItem>>(`/api/wiki/spaces/${spaceId}`)
  return data.data
}

export const updateWikiSpace = async (spaceId: number, payload: WikiSpacePayload) => {
  const { data } = await http.put<ApiResponse<WikiSpaceDetailItem>>(`/api/wiki/spaces/${spaceId}`, payload)
  return data.data
}

export const deleteWikiSpace = async (spaceId: number) => {
  await http.delete<ApiResponse<null>>(`/api/wiki/spaces/${spaceId}`)
}

export const listWikiSpaceMembers = async (spaceId: number) => {
  const { data } = await http.get<ApiResponse<WikiSpaceMemberItem[]>>(`/api/wiki/spaces/${spaceId}/members`)
  return data.data
}

export const replaceWikiSpaceMembers = async (spaceId: number, members: WikiSpaceMemberPayloadItem[]) => {
  const { data } = await http.put<ApiResponse<WikiSpaceMemberItem[]>>(`/api/wiki/spaces/${spaceId}/members`, { members })
  return data.data
}

export const getWikiDirectoryTree = async (spaceId: number) => {
  const { data } = await http.get<ApiResponse<WikiDirectoryTreeNodeItem[]>>(`/api/wiki/spaces/${spaceId}/directories/tree`)
  return data.data
}

export const createWikiDirectory = async (spaceId: number, payload: WikiDirectoryPayload) => {
  const { data } = await http.post<ApiResponse<WikiDirectorySummaryItem>>(`/api/wiki/spaces/${spaceId}/directories`, payload)
  return data.data
}

export const updateWikiDirectory = async (spaceId: number, directoryId: number, payload: WikiDirectoryPayload) => {
  const { data } = await http.put<ApiResponse<WikiDirectorySummaryItem>>(`/api/wiki/spaces/${spaceId}/directories/${directoryId}`, payload)
  return data.data
}

export const deleteWikiDirectory = async (spaceId: number, directoryId: number) => {
  await http.delete<ApiResponse<null>>(`/api/wiki/spaces/${spaceId}/directories/${directoryId}`)
}

export const getWikiSpacePage = async (spaceId: number, pageId: number) => {
  const { data } = await http.get<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}`)
  return data.data
}

export const getWikiSpacePageBySlug = async (spaceId: number, slug: string) => {
  const { data } = await http.get<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/by-slug/${encodeURIComponent(slug)}`)
  return data.data
}

export const createWikiSpacePage = async (spaceId: number, payload: WikiSpacePagePayload) => {
  const { data } = await http.post<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages`, payload)
  return data.data
}

export const updateWikiSpacePage = async (spaceId: number, pageId: number, payload: WikiSpacePagePayload) => {
  const { data } = await http.put<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}`, payload)
  return data.data
}

export const deleteWikiSpacePage = async (spaceId: number, pageId: number) => {
  await http.delete<ApiResponse<null>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}`)
}

export const listWikiSpacePageVersions = async (spaceId: number, pageId: number) => {
  const { data } = await http.get<ApiResponse<WikiSpacePageVersionItem[]>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}/versions`)
  return data.data
}

export const getWikiSpacePageVersion = async (spaceId: number, pageId: number, versionNumber: number) => {
  const { data } = await http.get<ApiResponse<WikiSpacePageVersionItem>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}/versions/${versionNumber}`)
  return data.data
}

export const restoreWikiSpacePageVersion = async (spaceId: number, pageId: number, versionNumber: number) => {
  const { data } = await http.post<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}/restore/${versionNumber}`)
  return data.data
}

export const searchWikiPages = async (query?: { keyword?: string; spaceId?: number | null; projectId?: number | null }) => {
  const { data } = await http.get<ApiResponse<WikiSpacePageSummaryItem[]>>('/api/wiki/search', {
    params: cleanParams(query || {})
  })
  return data.data
}

export const semanticSearchWikiPages = async (query?: { query?: string; spaceId?: number | null; projectId?: number | null }) => {
  const { data } = await http.get<ApiResponse<WikiSpaceSearchResultItem[]>>('/api/wiki/semantic-search', {
    params: cleanParams(query || {})
  })
  return data.data
}

export const listWikiRelatedPages = async (spaceId: number, pageId: number) => {
  const { data } = await http.get<ApiResponse<WikiSpacePageSummaryItem[]>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}/related`)
  return data.data
}

export const uploadWikiImage = async (spaceId: number, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<UploadedFileItem>>(`/api/wiki/spaces/${spaceId}/images`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return data.data
}

export const uploadDocumentAsset = async (file: File, directory?: string) => {
  const formData = new FormData()
  formData.append('file', file)
  if (directory) {
    formData.append('directory', directory)
  }
  const { data } = await http.post<ApiResponse<DocumentAssetItem>>('/api/document-assets', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return data.data
}

export const previewWikiImport = async (spaceId: number, assetId: number) => {
  const { data } = await http.post<ApiResponse<DocumentMarkdownResultItem>>(`/api/wiki/spaces/${spaceId}/imports/preview`, { assetId })
  return data.data
}

export const importWikiSpacePage = async (spaceId: number, payload: WikiImportPagePayload) => {
  const { data } = await http.post<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/import`, payload)
  return data.data
}

export const listProjectIterations = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<IterationItem[]>>(`/api/projects/${projectId}/iterations`)
  return data.data
}

export const createIteration = async (projectId: number, payload: IterationPayload) => {
  const { data } = await http.post<ApiResponse<IterationItem>>(`/api/projects/${projectId}/iterations`, payload)
  return data.data
}

export const updateIteration = async (projectId: number, iterationId: number, payload: IterationPayload) => {
  const { data } = await http.put<ApiResponse<IterationItem>>(`/api/projects/${projectId}/iterations/${iterationId}`, payload)
  return data.data
}

export const deleteIteration = async (projectId: number, iterationId: number) => {
  await http.delete<ApiResponse<null>>(`/api/projects/${projectId}/iterations/${iterationId}`)
}

export const listProjectWorkItems = async (projectId: number, query: WorkItemQuery) => {
  const { data } = await http.get<ApiResponse<TaskItem[]>>(`/api/projects/${projectId}/work-items`, {
    params: cleanParams(query)
  })
  return data.data
}

export const pageProjectWorkItems = async (projectId: number, query: WorkItemPageQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<TaskItem>>>(`/api/projects/${projectId}/work-items/page`, {
    params: cleanParams(query)
  })
  return data.data
}
