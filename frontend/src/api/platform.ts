import { http } from './http'
import type {
  AgentItem,
  AgentTestResult,
  ApiResponse,
  DashboardOverview,
  DashboardQuickTaskItem,
  ExecutionRunDetailItem,
  ExecutionRunItem,
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
  UploadedFileItem
} from '@/types/platform'

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
  runtimeType?: 'OPENCLAW' | null
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
  agentBindings?: ExecutionAgentBindingPayload[]
  inputPayload?: Record<string, unknown>
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
  const { data } = await http.get<ApiResponse<ExecutionTaskDetailItem>>(`/api/execution-tasks/${id}`)
  return data.data
}

export const listExecutionTaskRuns = async (id: number) => {
  const { data } = await http.get<ApiResponse<ExecutionRunItem[]>>(`/api/execution-tasks/${id}/runs`)
  return data.data
}

export const getExecutionRunDetail = async (id: number) => {
  const { data } = await http.get<ApiResponse<ExecutionRunDetailItem>>(`/api/execution-runs/${id}`)
  return data.data
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
