export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

export interface PageResponse<T> {
  records: T[]
  total: number
  page: number
  size: number
  totalPages: number
}

export interface ProjectMemberItem {
  /** 成员用户ID。 */
  id: number
  /** 成员展示名称。 */
  name: string
  /** 成员头像地址，为空时前端回退显示姓名首字。 */
  avatarUrl: string | null
}

export interface ProjectItem {
  id: number
  name: string
  owner: string
  ownerUserId: number | null
  /** 项目创建人用户ID。 */
  creatorUserId: number | null
  /** 负责人头像地址，为空时前端回退显示负责人首字。 */
  ownerAvatarUrl?: string | null
  memberUserIds: number[]
  memberNames: string[]
  /** 项目成员轻量摘要，供项目列表头像与弹层展示复用。 */
  memberItems?: ProjectMemberItem[]
  status: string
  description: string
  agentCount: number
  taskCount: number
  repoCount: number
  /** 当前用户是否可以编辑项目。 */
  canEdit: boolean
  /** 当前用户是否可以删除项目。 */
  canDelete: boolean
}

export interface IterationItem {
  id: number
  projectId: number
  projectName: string
  /** 迭代创建人用户ID。 */
  creatorUserId: number | null
  name: string
  goal: string
  status: string
  startDate: string | null
  endDate: string | null
  description: string
  sortOrder: number
  workItemCount: number
  /** 当前用户是否可以删除迭代。 */
  canDelete: boolean
}

export interface IterationBoardItem {
  project: ProjectItem
  unplannedCount: number
  totalWorkItemCount: number
  iterations: IterationItem[]
}

export interface ProjectBurndownItem {
  startDate: string
  endDate: string
  totalWorkItemCount: number
  completedWorkItemCount: number
  remainingWorkItemCount: number
  labels: string[]
  idealRemaining: number[]
  actualRemaining: number[]
}

export interface KnowledgeGraphNodeItem {
  id: number
  nodeType: string
  bizId: number
  name: string
  description: string
  metadataJson: string
}

export interface KnowledgeGraphEdgeItem {
  id: number
  fromNodeId: number
  toNodeId: number
  edgeType: string
  sourceType: string
  confidence: number | null
  status: string
  evidenceText: string
}

export interface KnowledgeGraphItem {
  projectId: number
  nodeCount: number
  edgeCount: number
  generatedAt: string
  nodes: KnowledgeGraphNodeItem[]
  edges: KnowledgeGraphEdgeItem[]
}

export interface AgentItem {
  id: number
  name: string
  type: string
  category: string
  status: string
  enabled: boolean
  accessType: 'BUILT_IN' | 'LLM_PROMPT' | 'HTTP_API' | 'AGENT_RUNTIME'
  builtinCode: 'CODE_REVIEW' | 'TEST_SUGGESTION' | 'REQUIREMENT_BREAKDOWN' | null
  capability: string
  description: string
  aiModelConfigId: number | null
  aiModelConfigName: string | null
  systemPrompt: string | null
  userPromptTemplate: string | null
  endpointUrl: string | null
  runtimeType: 'OPENCLAW' | string | null
  runtimeAgentRef: string | null
  runtimeSessionKeyTemplate: string | null
  httpMethod: string | null
  httpHeaders: string | null
  httpAuthType: 'NONE' | 'BEARER' | null
  httpAuthTokenConfigured: boolean
  httpRequestTemplate: string | null
  httpResponsePath: string | null
  timeoutSeconds: number | null
  projectId: number | null
  projectName: string | null
}

export interface AgentTestResult {
  agentId: number
  agentName: string
  success: boolean
  message: string
  output: string | null
  testedAt: string
}


export interface TaskItem {
  id: number
  /** 工作项编号，由后端自动生成。 */
  workItemCode: string
  name: string
  workItemType: '需求' | '任务' | '缺陷'
  /** 工作项创建人用户ID。 */
  creatorUserId: number | null
  /** 工作项创建人展示名称。 */
  creatorName: string
  status: string
  priority: string
  /** 预估工时，单位为小时。 */
  workHours: number | null
  devPassed: boolean
  testPassed: boolean
  requirementDevPassed: boolean | null
  requirementTestPassed: boolean | null
  assignee: string
  assigneeUserId: number | null
  collaboratorUserIds: number[]
  collaboratorNames: string[]
  /** 工作项计划开始日期。 */
  planStartDate: string | null
  /** 工作项计划结束日期。 */
  planEndDate: string | null
  updatedAt: string
  description: string
  requirementMarkdown: string
  prototypeUrl: string
  projectId: number
  projectName: string
  agentId: number | null
  agentName: string | null
  iterationId: number | null
  iterationName: string | null
  requirementTaskId: number | null
  requirementTaskName: string | null
  /** 当前用户是否可以删除当前工作项。 */
  canDelete: boolean
}

export interface TaskCommentItem {
  id: number
  taskId: number
  authorUserId: number | null
  authorName: string
  content: string
  createdAt: string
}

export interface UploadedFileItem {
  url: string
  fileName: string
  size: number
}

export interface TaskRequirementAiSuggestionItem {
  name: string
  category: string
  priority: string
  description: string
}

export interface TaskRequirementAiTestCaseStepSuggestionItem {
  stepNo: number
  action: string
  expectedResult: string
}

export interface TaskRequirementAiTestCaseSuggestionItem {
  title: string
  moduleName: string
  caseType: string
  priority: string
  precondition: string
  remarks: string
  steps: TaskRequirementAiTestCaseStepSuggestionItem[]
}

export interface TaskRequirementAiResultItem {
  action: 'STANDARDIZE' | 'BREAKDOWN' | 'TEST_CASES' | string
  title: string
  markdown: string
  modelConfigId: number | null
  modelConfigName: string | null
  taskSuggestions: TaskRequirementAiSuggestionItem[]
  testCaseSuggestions: TaskRequirementAiTestCaseSuggestionItem[]
}

export interface TaskAgentRunItem {
  id: number
  taskId: number
  taskName: string
  agentId: number | null
  agentName: string | null
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | string
  input: string
  output: string | null
  errorMessage: string | null
  requesterUserId: number | null
  requesterName: string | null
  createdAt: string
}

export interface TestCaseStepItem {
  id: number | null
  stepNo: number
  action: string
  expectedResult: string
}

export interface TestCaseItem {
  id: number | null
  title: string
  moduleName: string
  caseType: string
  priority: string
  precondition: string
  remarks: string
  sortOrder: number
  steps: TestCaseStepItem[]
}

export interface TestPlanItem {
  id: number
  name: string
  status: string
  description: string
  projectId: number
  projectName: string
  iterationId: number | null
  iterationName: string | null
  caseCount: number
  createdAt: string | null
  updatedAt: string | null
  cases: TestCaseItem[]
}

export interface DashboardStats {
  projectCount: number
  agentCount: number
  taskCount: number
  repoCount: number
  myTaskCount?: number
  myInProgressTaskCount?: number
  myPendingTaskCount?: number
  myMergeLogCount?: number
  mergeAlertCount?: number
}

export interface DashboardOverview {
  stats: DashboardStats
  activeProjects: ProjectItem[]
  onlineAgents: AgentItem[]
  recentTasks: TaskItem[]
  currentUserGitlabUsername: string | null
  currentUserGitlabMergeLogs: GitlabAutoMergeLogItem[]
  myTasks?: TaskItem[]
  mergeAlerts?: GitlabAutoMergeLogItem[]
  focusIterationBoard?: IterationBoardItem | null
  focusProjectBurndown?: ProjectBurndownItem | null
}

export interface DashboardQuickTaskItem {
  /** 快捷任务主键ID。 */
  id: number
  /** 前端用来匹配本地草稿行的稳定键。 */
  clientKey: string
  /** 用户填写的临时笔记内容。 */
  content: string
  /** 是否已完成。 */
  checked: boolean
  /** 当前展示顺序。 */
  sortOrder: number
}

export interface NotificationItem {
  id: number
  type: 'TASK' | 'GITLAB' | 'CICD' | 'SYSTEM' | string
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | string
  title: string
  content: string
  bizType: string | null
  bizId: number | null
  actionUrl: string | null
  read: boolean
  senderName: string
  createdAt: string
  readAt: string | null
}

export interface NotificationUnreadSummary {
  unreadCount: number
}

export interface NotificationRealtimeEvent {
  eventType: 'NEW_NOTIFICATION' | string
  notification: NotificationItem
  unreadCount: number
}

export interface ProjectGitlabBindingItem {
  id: number
  projectId: number
  projectName: string
  apiBaseUrl: string
  gitlabProjectRef: string
  gitlabProjectId: string | null
  gitlabProjectName: string | null
  gitlabProjectPath: string | null
  gitlabProjectWebUrl: string | null
  defaultTargetBranch: string | null
  tokenConfigured: boolean
  enabled: boolean
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestedAt: string | null
}

export interface JenkinsServerItem {
  id: number
  name: string
  baseUrl: string
  username: string
  description: string
  enabled: boolean
  tokenConfigured: boolean
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestedAt: string | null
  lastJobCount: number | null
}

export interface JenkinsJobItem {
  name: string
  fullName: string
  url: string
  color: string
  lastBuildNumber: number | null
  lastBuildResult: string | null
  lastBuildUrl: string | null
  lastBuildAt: string | null
}

export interface ProjectPipelineBindingItem {
  id: number
  projectId: number
  projectName: string
  jenkinsServerId: number
  jenkinsServerName: string
  jobName: string
  jobUrl: string | null
  defaultBranch: string | null
  buildParametersJson: string | null
  enabled: boolean
  lastTriggerStatus: string | null
  lastTriggerMessage: string | null
  lastTriggeredAt: string | null
  lastTriggerUrl: string | null
}

export interface JenkinsBuildTriggerResult {
  bindingId: number
  projectName: string
  jenkinsServerName: string
  jobName: string
  triggerUrl: string | null
  message: string
  triggeredAt: string
}

export interface JenkinsBuildItem {
  number: number
  url: string | null
  result: string | null
  building: boolean
  executedAt: string | null
  durationMillis: number
  durationText: string
  description: string | null
}

export interface JenkinsBuildLogDetailItem {
  projectName: string
  jenkinsServerName: string
  jobName: string
  buildNumber: number
  result: string | null
  building: boolean
  executedAt: string | null
  durationMillis: number
  durationText: string
  url: string | null
  description: string | null
  consoleLog: string
}

export interface GitlabAutoMergeConfigItem {
  id: number
  name: string
  executionMode: 'PROJECT_BOUND' | 'STANDALONE'
  description: string
  bindingId: number | null
  projectId: number | null
  projectName: string
  apiBaseUrl: string
  gitlabProjectRef: string
  tokenConfigured: boolean
  reviewAgentId: number | null
  reviewAgentName: string | null
  aiModelConfigId: number | null
  aiModelConfigName: string | null
  aiModelProvider: string | null
  aiModelName: string | null
  sourceBranch: string | null
  targetBranch: string | null
  titleKeyword: string | null
  enabled: boolean
  autoMerge: boolean
  squashOnMerge: boolean
  removeSourceBranch: boolean
  triggerPipelineAfterMerge: boolean
  requirePipelineSuccess: boolean
  schedulerEnabled: boolean
  schedulerCron: string | null
  nextExecutionTime: string | null
  aiReviewEnabled: boolean
  aiReviewPrompt: string | null
  lastRunStatus: string | null
  lastRunMessage: string | null
  lastRunAt: string | null
}

/**
 * GitLab 分支下拉项，供仓库页与首页 MR 弹窗共用。
 */
export interface GitlabBranchItem {
  name: string
  defaultBranch: boolean
  protectedBranch: boolean
  merged: boolean
  webUrl: string | null
}

export interface GitlabMergeRequestItem {
  iid: number
  title: string
  state: string
  sourceBranch: string
  targetBranch: string
  draft: boolean
  hasConflicts: boolean
  detailedMergeStatus: string
  divergedCommitsCount?: number | null
  diverged_commits_count?: number | null
  pipelineStatus: string
  authorName: string
  webUrl: string
  updatedAt: string
}

export interface GitlabAutoMergeRunItem {
  iid: number
  title: string
  action: string
  message: string
  webUrl: string
}

export interface GitlabAutoMergeRunResult {
  configId: number
  configName: string
  matchedCount: number
  mergedCount: number
  skippedCount: number
  items: GitlabAutoMergeRunItem[]
}

/**
 * GitLab Tag 创建结果，供结果弹窗展示。
 */
export interface GitlabTagCreateResultItem {
  projectName: string
  projectRef: string
  branchName: string
  tagName: string
  message: string | null
  targetSha: string | null
  protectedTag: boolean
  webUrl: string | null
  createdAt: string
}

/**
 * GitLab Merge Request 创建结果，供首页快捷入口展示。
 */
export interface GitlabCreateMergeRequestResultItem {
  projectName: string
  projectRef: string
  iid: number
  title: string
  sourceBranch: string
  targetBranch: string
  state: string
  webUrl: string | null
  createdAt: string
}

export interface GitlabAutoMergeLogItem {
  id: number
  configId: number | null
  configName: string
  triggerType: 'MANUAL' | 'SCHEDULED'
  mergeRequestIid: number | null
  mergeRequestTitle: string | null
  mergeRequestAuthorName: string | null
  mergeRequestAuthorUsername: string | null
  result: string
  reason: string
  detailMarkdown: string | null
  webUrl: string | null
  executedAt: string
}

export interface AiModelConfigItem {
  id: number
  name: string
  provider: 'OPENAI' | 'ANTHROPIC'
  apiBaseUrl: string
  modelName: string
  apiKeyConfigured: boolean
  description: string
  enabled: boolean
}

export interface ModelTestResult {
  id: number
  name: string
  provider: 'OPENAI' | 'ANTHROPIC'
  modelName: string
  success: boolean
  message: string
  testedAt: string
}

export interface CurrentUserInfo {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  avatarUrl: string
  enabled: boolean
  roleCodes: string[]
  roleNames: string[]
  permissionCodes: string[]
}

export interface LoginResult {
  token: string
  expiresAt: string
  user: CurrentUserInfo
}

export interface UserItem {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  enabled: boolean
  builtIn: boolean
  lastLoginAt: string | null
  roleIds: number[]
  roleCodes: string[]
  roleNames: string[]
}

export interface UserOptionItem {
  id: number
  username: string
  nickname: string
  /** 用户头像地址，为空时前端回退显示首字母头像。 */
  avatarUrl?: string | null
  enabled: boolean
}

export type DataPermissionScopeValue =
  | 'NONE'
  | 'OWNER_ONLY'
  | 'CREATOR_ONLY'
  | 'OWNER_OR_CREATOR'
  | 'PROJECT_PARTICIPANT'
  | 'ALL'

export interface RoleItem {
  id: number
  name: string
  code: string
  enabled: boolean
  builtIn: boolean
  description: string
  projectVisibilityScope: DataPermissionScopeValue
  projectManageScope: DataPermissionScopeValue
  iterationDeleteScope: DataPermissionScopeValue
  taskDeleteScope: DataPermissionScopeValue
  permissionIds: number[]
  permissionCodes: string[]
  permissionNames: string[]
}

export interface PermissionItem {
  id: number
  name: string
  code: string
  type: 'MENU' | 'ACTION'
  path: string | null
  component: string | null
  icon: string
  parentId: number | null
  sortOrder: number
  enabled: boolean
  builtIn: boolean
  description: string
}
