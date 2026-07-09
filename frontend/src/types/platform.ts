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

export interface ProjectListStatsItem {
  /** 当前筛选结果中的项目总数。 */
  activeProjectCount: number
  /** 当前筛选结果下的任务总量。 */
  totalTaskCount: number
  /** 当前筛选结果中进行中项目占比，范围 0-100。 */
  resourceLoadPercent: number
  /** 当前筛选结果下的平均任务数。 */
  averageTaskCount: number
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

export interface ProjectRequirementModuleOptionItem {
  id: number
  moduleName: string
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

/** Wiki 向量化知识图谱节点：页面或目录。 */
export interface WikiKnowledgeGraphNodeItem {
  id: number
  /** WIKI_PAGE | WIKI_DIRECTORY */
  nodeType: string
  /** 对应业务主键（页面 id 或目录 id）。 */
  bizId: number
  name: string
  slug: string
  directoryId: number | null
  /** 页面下聚合的 chunk 数量，目录节点为 null。 */
  chunkCount: number | null
  metadataJson: string
}

/** Wiki 向量化知识图谱边：目录归属或向量语义相似。 */
export interface WikiKnowledgeGraphEdgeItem {
  id: number
  fromNodeId: number
  toNodeId: number
  /** BELONGS_TO_DIRECTORY | SEMANTIC_SIMILAR */
  edgeType: string
  /** 语义相似边的余弦相似度，结构边为 null。 */
  similarity: number | null
  evidenceText: string
}

/** Wiki 向量化知识图谱聚合结果。 */
export interface WikiSpaceKnowledgeGraphItem {
  spaceId: number
  spaceName: string
  /** 向量索引是否启用：false 时仅有目录骨架。 */
  vectorEnabled: boolean
  generatedAt: string
  nodes: WikiKnowledgeGraphNodeItem[]
  edges: WikiKnowledgeGraphEdgeItem[]
}

export interface MemoryFactItem {
  id: string
  type: string
  subject: string
  predicate: string
  object: string
  summary: string
  confidence: number | null
  sourceType: string
  createdAt: string
  tags: string[]
  metadataJson: string
}

export interface WikiSpaceItem {
  /** 空间ID。 */
  id: number
  /** 空间名称。 */
  name: string
  /** 空间说明。 */
  description: string
  /** 读取范围。 */
  readScope: 'MEMBERS_ONLY' | 'ALL_LOGGED_IN' | string
  /** 空间绑定项目ID。 */
  boundProjectId: number | null
  /** 空间绑定项目名称。 */
  boundProjectName: string
  /** 空间成员默认来源。 */
  memberDefaultSource: 'MANUAL' | 'PROJECT_MEMBERS' | string
  /** 当前用户在空间中的角色。 */
  currentUserRole: 'ADMIN' | 'EDITOR' | 'VIEWER' | string
  /** 目录数量。 */
  directoryCount: number
  /** 页面数量。 */
  pageCount: number
  /** 绑定项目数量。 */
  boundProjectCount: number
  /** 当前用户是否可管理空间。 */
  canManage: boolean
  createdAt: string
  updatedAt: string
}

export interface WikiSpaceDetailItem extends WikiSpaceItem {
  /** 创建者名称。 */
  creatorName: string
}

export interface WikiSpaceMemberItem {
  /** 成员用户ID。 */
  userId: number
  /** 用户名。 */
  username: string
  /** 昵称。 */
  nickname: string
  /** 头像地址。 */
  avatarUrl: string
  /** 空间角色。 */
  memberRole: 'ADMIN' | 'EDITOR' | 'VIEWER' | string
}

export interface WikiDirectorySummaryItem {
  id: number
  spaceId: number
  parentDirectoryId: number | null
  name: string
  slug: string
  content: string
  sortOrder: number
  boundProjectId: number | null
  boundProjectName: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

export interface WikiSpacePageSummaryItem {
  id: number
  spaceId: number
  spaceName: string
  directoryId: number
  directoryName: string
  parentPageId: number | null
  boundProjectId: number | null
  boundProjectName: string
  title: string
  slug: string
  currentVersionNumber: number
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED' | string
  authorName: string
  canEdit: boolean
  updatedAt: string
  children: WikiSpacePageSummaryItem[]
}

export interface WikiDirectoryTreeNodeItem {
  id: number
  parentDirectoryId: number | null
  name: string
  slug: string
  content: string
  boundProjectId: number | null
  boundProjectName: string
  children: WikiDirectoryTreeNodeItem[]
  pages: WikiSpacePageSummaryItem[]
}

export interface WikiSpacePageDetailItem {
  id: number
  spaceId: number
  spaceName: string
  directoryId: number
  directoryName: string
  parentPageId: number | null
  boundProjectId: number | null
  boundProjectName: string
  title: string
  slug: string
  content: string
  currentVersionNumber: number
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED' | string
  lastSyncedAt: string
  lastSyncError: string
  authorName: string
  canEdit: boolean
  importSource: WikiImportSourceItem | null
  relatedPages: WikiSpacePageSummaryItem[]
  createdAt: string
  updatedAt: string
}

export interface WikiImportSourceItem {
  assetId: number
  fileName: string
  contentType: string
  fileSize: number
  sourceFormat: string
  truncated: boolean
  warnings: string[]
}

export interface DocumentAssetItem {
  id: number
  fileName: string
  contentType: string
  fileSize: number
  sourceFormat: string
  bindingStatus: string
  url: string
}

export interface DocumentMarkdownResultItem {
  assetId: number
  fileName: string
  suggestedTitle: string
  sourceFormat: string
  markdown: string
  truncated: boolean
  warnings: string[]
}

export interface WikiSpacePageVersionItem {
  id: number
  pageId: number
  versionNumber: number
  title: string
  content: string
  authorName: string
  changeSummary: string
  createdAt: string
}

export interface WikiSpaceSearchResultItem {
  page: WikiSpacePageSummaryItem
  score: number | null
  snippet: string
}

export interface AgentItem {
  id: number
  name: string
  type: string
  status: string
  enabled: boolean
  accessType: 'BUILT_IN' | 'LLM_PROMPT' | 'HTTP_API' | 'AGENT_RUNTIME'
  builtinCode: 'CODE_REVIEW' | 'TEST_SUGGESTION' | 'REQUIREMENT_BREAKDOWN' | 'REPOSITORY_SCAN_PLAN' | 'REQUIREMENT_AI_STANDARDIZE' | 'REQUIREMENT_AI_BREAKDOWN' | 'REQUIREMENT_AI_TEST_CASES' | null
  capability: string
  description: string
  aiModelConfigId: number | null
  aiModelConfigName: string | null
  systemPrompt: string | null
  userPromptTemplate: string | null
  endpointUrl: string | null
  runtimeType: 'OPENCLAW' | 'CODEX_CLI' | 'CLAUDE_CODE_CLI' | string | null
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
  workItemType: '需求' | '任务' | '缺陷' | string
  /** 工作项创建人用户ID。 */
  creatorUserId: number | null
  /** 工作项创建人展示名称。 */
  creatorName: string
  status: string
  priority: string
  /** 任务细分类型，仅任务工作项返回。 */
  taskType: string | null
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
  moduleName?: string | null
  prdStatus?: 'PENDING' | 'READY' | 'FAILED' | string | null
  prdStatusMessage?: string | null
  prdWikiSpaceId?: number | null
  prdWikiDirectoryId?: number | null
  prdWikiPageId?: number | null
  projectId: number
  projectName: string
  agentId: number | null
  agentName: string | null
  iterationId: number | null
  iterationName: string | null
  requirementTaskId: number | null
  requirementTaskName: string | null
  /** 外部来源系统编码，例如 GITEE。 */
  externalSource?: string | null
  /** 外部来源系统中的主键快照。 */
  externalRemoteId?: string | null
  /** 外部来源系统中的工作项链接。 */
  externalRemoteUrl?: string | null
  /** 当前用户是否可以删除当前工作项。 */
  canDelete: boolean
}

export interface LinkedTestCaseItem {
  id: number
  title: string
  moduleName: string
  caseType: string
  priority: string
  testPlanId: number
  testPlanName: string
  projectId: number
  projectName: string
}

export interface TaskAttachmentItem {
  id: number
  assetId: number
  fileName: string
  contentType: string
  fileSize: number
  sourceFormat: string
  uploaderUserId: number | null
  uploaderName: string
  createdAt: string | null
}

export interface TaskLinksItem {
  children: TaskItem[]
  parentWorkItems: TaskItem[]
  relatedWorkItems: TaskItem[]
  testCases: LinkedTestCaseItem[]
  attachments: TaskAttachmentItem[]
}

export interface ProjectWorkItemStatsItem {
  /** 当前筛选结果总数。 */
  totalCount: number
  /** 当前筛选结果中满足完成态的数量。 */
  completedCount: number
  /** 当前筛选结果中的未完成数量。 */
  openCount: number
  /** 当前筛选结果中的缺陷数量。 */
  defectCount: number
  /** 当前筛选结果完成率，范围 0-100。 */
  completionRate: number
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
  /** 任务细分类型，创建拆解子任务时写入 taskType。 */
  taskType: string
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

export interface TaskPrdDetailItem {
  taskId: number
  moduleName: string
  status: 'PENDING' | 'READY' | 'FAILED' | string | null
  statusMessage: string
  wikiSpaceId: number | null
  wikiSpaceName: string | null
  prdWikiDirectoryId: number | null
  prdWikiDirectoryName: string | null
  prdWikiPageId: number | null
  prdWikiPageTitle: string | null
  prdWikiPageContent: string | null
  prdWikiPageUpdatedAt: string | null
  lastGeneratedAt: string | null
  lastAiSuggestedAt: string | null
  lastUserConfirmedAt: string | null
}

export interface TaskPrdRecallReferenceItem {
  spaceId: number
  pageId: number
  title: string
  directoryName: string
  snippet: string
  score: number | null
}

export interface TaskPrdAnalyzeResultItem {
  action: 'GAP_CHECK' | 'SUGGEST_UPDATE' | string
  title: string
  markdown: string
  suggestionMarkdown: string
  modelConfigId: number | null
  modelConfigName: string | null
  gaps: string[]
  questions: string[]
  references: TaskPrdRecallReferenceItem[]
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

export interface ExecutionArtifactItem {
  id: number
  runId: number
  stepId: number | null
  artifactType: string
  title: string
  contentRef: string | null
  contentText: string | null
  workItemWriteback: boolean
}

export interface ExecutionStepItem {
  id: number
  runId: number
  stepNo: number
  stepCode: string
  stepName: string
  agentId: number | null
  agentName: string | null
  status: string
  progressPercent: number
  latestMessage: string
  currentCommand: string | null
  lastEventId: number | null
  lastEventAt: string | null
  lastHeartbeatAt: string | null
  tailLogText: string | null
  tailLogLineCount: number | null
  hasLiveStream: boolean
  inputSnapshot: string
  outputSnapshot: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface ExecutionRunItem {
  id: number
  executionTaskId: number
  runNo: number
  status: string
  progressPercent: number
  currentStepNo: number | null
  currentStepName: string | null
  inputSnapshot: string
  outputSummary: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export interface ExecutionRunDetailItem extends ExecutionRunItem {
  lastEventId: number | null
  lastEventAt: string | null
  hasLiveStream: boolean
  steps: ExecutionStepItem[]
  artifacts: ExecutionArtifactItem[]
}

export interface ExecutionStreamEvent {
  id: number
  runId: number
  stepId: number | null
  stepNo: number | null
  stepName: string | null
  eventType: string
  streamKind: string | null
  text: string | null
  currentCommand: string | null
  progressPercent: number | null
  summary: string | null
  artifactId: number | null
  createdAt: string | null
}

export interface ExecutionTaskItem {
  id: number
  title: string
  scenarioCode: string
  scenarioName: string
  sourceType: string
  sourceId: number | null
  projectId: number
  projectName: string
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
  status: string
  currentRunId: number | null
  currentRunStatus: string | null
  progressPercent: number
  currentStepNo: number | null
  currentStepName: string | null
  latestSummary: string
  planConfirmationRequired: boolean
  planConfirmationPending: boolean
  createdByUserId: number | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

export interface ExecutionTaskListStatsItem {
  /** 当前筛选结果中的任务总数。 */
  totalCount: number
  /** 当前筛选结果中的待执行、执行中和待确认任务总数。 */
  pendingOrRunningCount: number
  /** 当前筛选结果中的成功任务总数。 */
  successCount: number
  /** 当前筛选结果中的平均进度，范围 0-100。 */
  averageProgressPercent: number
}

export interface ExecutionWorkspaceCleanupSummaryItem {
  /** 是否启用工作区清理摘要展示。 */
  enabled: boolean
  /** 工作区保留时长，单位为小时。 */
  retentionHours: number
  /** 当前清理状态，例如 SCHEDULED、DELETED、DELETE_FAILED。 */
  status: string
  /** 对应执行结果状态，例如 SUCCESS、FAILED、CANCELED；无清理记录时允许为空。 */
  executionResultStatus: string | null
  /** 预计或实际过期时间。 */
  expiresAt: string | null
  /** 实际删除完成时间。 */
  deletedAt: string | null
  /** 删除失败时间。 */
  deleteFailedAt: string | null
  /** 删除失败时的错误信息。 */
  deleteErrorMessage: string | null
  /** 当前任务下纳入追踪的工作区数量。 */
  trackedWorkspaceCount: number
  /** 后端直接生成的详情提示文案。 */
  message: string
}

export interface ExecutionTaskDetailItem {
  id: number
  title: string
  scenarioCode: string
  scenarioName: string
  sourceType: string
  sourceId: number | null
  triggerSource: string
  projectId: number
  projectName: string
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
  status: string
  cancelRequested: boolean
  latestSummary: string
  createdByUserId: number | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  currentRunId: number | null
  inputPayload: string
  planConfirmationRequired: boolean
  planConfirmationPending: boolean
  canCurrentUserConfirmPlan: boolean
  runs: ExecutionRunItem[]
  workspaceCleanup: ExecutionWorkspaceCleanupSummaryItem
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
  automationType: '手工' | '自动化' | string
  automationHint: string
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
  startDate: string | null
  endDate: string | null
  caseCount: number
  automationBindingId: number | null
  automationTargetBranch: string | null
  automationEnabledCaseCount: number
  lastAutomationStatus: 'IDLE' | 'PENDING' | 'SUCCESS' | 'FAILED' | string | null
  lastAutomationTaskId: number | null
  lastAutomationRunId: number | null
  lastAutomationSummary: string | null
  lastAutomationAt: string | null
  lastAutomationMrUrl: string | null
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
  shortcutOverview: DashboardShortcutOverviewItem
  currentUserGitlabUsername: string | null
  currentUserGitlabMergeLogs: GitlabAutoMergeLogItem[]
  myTasks?: TaskItem[]
  mergeAlerts?: GitlabAutoMergeLogItem[]
  focusIterationBoard?: IterationBoardItem | null
  focusProjectBurndown?: ProjectBurndownItem | null
}

export interface DashboardCardOverviewItem {
  stats: DashboardStats
  activeProjects: ProjectItem[]
  onlineAgents: AgentItem[]
  recentTasks: TaskItem[]
  shortcutOverview: DashboardShortcutOverviewItem
}

export interface DashboardShortcutEntryItem {
  /** 快捷入口主键ID。 */
  id: number
  /** 归属范围：SYSTEM / USER。 */
  scopeType: 'SYSTEM' | 'USER' | string
  /** 入口名称。 */
  name: string
  /** 跳转地址。 */
  url: string
  /** 图标名称或上传后的图片地址。 */
  icon: string
  /** 是否启用。 */
  enabled: boolean
  /** 当前展示顺序。 */
  sortOrder: number
}

export interface DashboardShortcutOverviewItem {
  /** 系统管理员统一维护的系统入口。 */
  systemEntries: DashboardShortcutEntryItem[]
  /** 当前登录用户自己的入口。 */
  userEntries: DashboardShortcutEntryItem[]
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

/**
 * 反馈类型枚举值，前后端统一使用大写编码传输。
 */
export type FeedbackType = 'BUG' | 'SUGGESTION' | 'EXPERIENCE' | 'OTHER'

/**
 * 提交反馈与建议时使用的请求体。
 */
export interface CreateFeedbackPayload {
  /** 反馈类型。 */
  type: FeedbackType
  /** 反馈标题。 */
  title: string
  /** 反馈详细内容。 */
  content: string
}

/**
 * 操作日志列表项，供列表页与详情抽屉复用。
 */
export interface OperationLogItem {
  /** 日志主键ID。 */
  id: number
  /** 发起操作的用户ID，匿名或历史用户已删除时允许为空。 */
  userId: number | null
  /** 用户名历史快照。 */
  usernameSnapshot: string
  /** 用户昵称历史快照。 */
  nicknameSnapshot: string
  /** 模块编码。 */
  moduleCode: string
  /** 模块名称。 */
  moduleName: string
  /** 动作编码。 */
  actionCode: string
  /** 动作名称。 */
  actionName: string
  /** 业务对象类型。 */
  bizType: string | null
  /** 业务对象ID。 */
  bizId: number | null
  /** 请求HTTP方法。 */
  httpMethod: string
  /** 实际请求路径。 */
  requestUri: string
  /** 匹配到的路由模板。 */
  routePattern: string
  /** 关联权限码。 */
  permissionCode: string | null
  /** 操作结果状态，例如 SUCCESS、FAILED。 */
  operationStatus: string
  /** HTTP响应状态码。 */
  responseStatus: number
  /** 请求耗时，单位毫秒。 */
  durationMs: number
  /** 请求来源IP。 */
  ipAddress: string | null
  /** 浏览器或客户端标识。 */
  userAgent: string | null
  /** 已脱敏请求摘要。 */
  requestSnapshot: string | null
  /** 结果消息。 */
  resultMessage: string | null
  /** 操作发生时间。 */
  createdAt: string
}

/**
 * 操作日志分页查询条件。
 */
export interface OperationLogQuery {
  /** 当前页码，从 1 开始。 */
  page: number
  /** 每页条数。 */
  size: number
  /** 关键词，匹配用户、模块、动作、路径、结果消息。 */
  keyword?: string
  /** 指定操作者ID。 */
  userId?: number
  /** 模块编码。 */
  moduleCode?: string
  /** 操作结果状态。 */
  operationStatus?: string
  /** 业务对象类型。 */
  bizType?: string
  /** 查询开始时间。 */
  startTime?: string
  /** 查询结束时间。 */
  endTime?: string
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
  productMainBranch: string | null
  tokenConfigured: boolean
  enabled: boolean
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestedAt: string | null
  testProfileJson: string | null
  codeStructureStatus: string | null
  codeStructureGeneratedAt: string | null
  codeStructureDegraded: boolean | null
}

/** 业主代码仓库绑定项。 */
export interface OwnerRepoBindingItem {
  id: number
  projectId: number
  projectName: string
  name: string
  apiBaseUrl: string
  gitlabProjectRef: string
  gitlabProjectId: string | null
  gitlabProjectName: string | null
  gitlabProjectPath: string | null
  gitlabProjectWebUrl: string | null
  gitlabHttpCloneUrl: string | null
  gitlabSshCloneUrl: string | null
  defaultTargetBranch: string | null
  defaultPushMode: string
  tokenConfigured: boolean
  enabled: boolean
  lastPushStatus: string | null
  lastPushMessage: string | null
  lastPushedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** 业主仓库推送上下文。 */
export interface OwnerRepoPushContextItem {
  bindingId: number
  canPush: boolean
  disabledReason: string | null
  lastPushStatus: string | null
  lastPushMessage: string | null
  lastPushedAt: string | null
}

/** 业主仓库推送结果。 */
export interface OwnerRepoPushResultItem {
  executionStatus: string
  summaryMessage: string
  sourceCommitSha: string | null
  targetCommitSha: string | null
  pushedBranch: string | null
  mergeRequestIid: string | null
  mergeRequestWebUrl: string | null
}

/** 业主仓库推送历史日志项。 */
export interface OwnerRepoPushLogItem {
  id: number
  sourceBindingId: number | null
  sourceBindingName: string | null
  sourceBranch: string
  targetBranch: string
  pushMode: string
  sourceCommitSha: string | null
  targetCommitSha: string | null
  mergeRequestIid: string | null
  mergeRequestWebUrl: string | null
  executionStatus: string
  summaryMessage: string | null
  executedAt: string | null
}

export interface GitlabCodeStructureOverviewCardItem {
  key: string
  label: string
  value: string
}

export interface GitlabCodeStructureCandidateSymbolItem {
  uid: string
  name: string
  filePath: string
  startLine: number | null
  endLine: number | null
  symbolKind: string
}

export interface GitlabCodeStructureProcessItem {
  id: string
  name: string
  stepIndex: number | null
  stepCount: number | null
}

export interface GitlabCodeStructureGraphNodeItem {
  id: string
  nodeType: string
  label: string
  secondaryLabel: string
  detailText: string
  filePath: string
  symbolUid: string
  startLine: number | null
  endLine: number | null
  metadataJson: string
}

export interface GitlabCodeStructureGraphEdgeItem {
  id: string
  sourceId: string
  targetId: string
  edgeType: string
  detailText: string
}

export interface GitlabCodeStructureSnapshotItem {
  bindingId: number
  projectId: number
  projectName: string
  repositoryName: string
  repositoryPath: string
  branchName: string
  commitSha: string | null
  status: string
  degraded: boolean
  truncated: boolean
  generatedAt: string | null
  refreshStartedAt: string | null
  refreshFinishedAt: string | null
  summaryMarkdown: string
  lastErrorMessage: string | null
  overviewCards: GitlabCodeStructureOverviewCardItem[]
  candidateSymbols: GitlabCodeStructureCandidateSymbolItem[]
  candidateProcesses: GitlabCodeStructureProcessItem[]
  harnessHints: string[]
  graphNodes: GitlabCodeStructureGraphNodeItem[]
  graphEdges: GitlabCodeStructureGraphEdgeItem[]
}

export interface GitlabCodeStructureQueryRequest {
  branch: string
  query: string
}

export interface GitlabCodeStructureQueryResultItem {
  branchName: string
  commitSha: string | null
  degraded: boolean
  truncated: boolean
  lastErrorMessage: string | null
  hitSymbols: GitlabCodeStructureCandidateSymbolItem[]
  hitProcesses: GitlabCodeStructureProcessItem[]
  graphNodes: GitlabCodeStructureGraphNodeItem[]
  graphEdges: GitlabCodeStructureGraphEdgeItem[]
}

export interface GitlabCodeStructureRefreshAcceptedResultItem {
  bindingId: number
  branchName: string
  status: string
  accepted: boolean
  refreshStartedAt: string | null
  generatedAt: string | null
  lastErrorMessage: string | null
}

export interface GitlabGitnexusLaunchRequestItem {
  branch?: string
}

export interface GitlabGitnexusLaunchResultItem {
  branchName: string
  commitSha: string
  repoAlias: string
  gitnexusUiUrl: string
  gitnexusServerUrl: string
  launchUrl: string
  serveReady: boolean
}

export interface GitlabApiSyncRequestItem {
  branch?: string
}

export interface GitlabApiSyncResultItem {
  bindingId: number
  projectId: number
  branch: string
  commitSha: string
  scannedCount: number
  createdCount: number
  updatedCount: number
  deletedCount: number
  skippedCount: number
  warnings: string[]
  syncedAt: string
}

export interface GiteeProgramItem {
  id: number
  name: string
  ident: string | null
}

export interface GiteeMilestoneItem {
  id: number
  title: string
  state: string | null
  startDate: string | null
  endDate: string | null
}

export interface GiteeMemberItem {
  id: number
  username: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface ProjectGiteeBindingItem {
  id: number
  projectId: number
  projectName: string
  enterpriseId: number
  apiBaseUrl: string
  giteeProgramId: number
  giteeProgramName: string
  tokenConfigured: boolean
  enabled: boolean
  lastTestStatus: string | null
  lastTestMessage: string | null
  lastTestedAt: string | null
}

export interface IterationGiteeBindingItem {
  id: number
  iterationId: number
  projectId: number
  projectName: string
  iterationName: string
  giteeMilestoneId: number
  giteeMilestoneTitle: string
}

export interface GiteeWorkItemSyncResultItem {
  executionStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | string
  totalIssueCount: number
  createdCount: number
  updatedCount: number
  removedCount: number
  failedCount: number
  summaryMessage: string
  executedAt: string | null
}

export interface GiteeWorkItemSyncLogItem {
  id: number
  projectId: number
  iterationId: number
  executionStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | string
  totalIssueCount: number
  createdCount: number
  updatedCount: number
  removedCount: number
  failedCount: number
  summaryMessage: string
  executedAt: string | null
}

export interface GiteeTestPlanPushContextItem {
  testPlanId: number
  pushable: boolean
  disabledReason: string | null
  remoteTestPlanId: number | null
  lastPushStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | string | null
  lastPushMessage: string | null
  lastPushedAt: string | null
}

export interface GiteeTestPlanPushResultItem {
  executionStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | string
  testPlanAction: 'CREATED' | 'UPDATED' | string
  remoteTestPlanId: number | null
  createdCaseCount: number
  updatedCaseCount: number
  failedCaseCount: number
  summaryMessage: string
  executedAt: string | null
}

export interface RepositoryScanRulesetItem {
  id?: number
  code: string
  name: string
  description: string
  engineType: string
  defaultSelected: boolean
  enabled?: boolean
  definitionContent?: string
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

export interface ProjectRuntimeInstanceItem {
  id: number
  projectId: number
  projectName: string
  sourceType: 'MANUAL' | 'JENKINS' | 'WOODPECKER' | string
  sourceBindingId: number | null
  name: string
  environment: string | null
  serviceName: string | null
  enabled: boolean
  serverMode: 'MANAGED_SERVER' | 'EXTERNAL_ENDPOINT' | string
  serverId: number | null
  serverName: string
  externalBaseUrl: string | null
  logEnabled: boolean
  logPaths: string[]
  healthEnabled: boolean
  healthProbeType: 'HTTP' | 'TCP' | string | null
  healthTarget: string | null
  lastDeployedAt: string | null
  lastStatus: string | null
  lastStatusMessage: string | null
  lastLogCollectedAt: string | null
  lastLogCollectStatus: string | null
  lastLogCollectMessage: string | null
  lastHealthCheckedAt: string | null
  lastHealthScore: number | null
  lastHealthLevel: string | null
  lastHealthMessage: string | null
  lastHealthLatencyMs: number | null
}

export interface ObservabilityProjectItem {
  projectId: number
  projectName: string
  projectStatus: string
  instanceCount: number
  enabledInstanceCount: number
  abnormalInstanceCount: number
  projectHealthScore: number | null
  projectHealthLevel: string | null
  lastHealthCheckedAt: string | null
  lastLogCollectedAt: string | null
  lastLogCollectStatus: string | null
  lastLogCollectMessage: string | null
}

export interface ObservabilityProjectDetailItem {
  summary: ObservabilityProjectItem
  instances: ProjectRuntimeInstanceItem[]
}

export interface ObservabilityProjectLogItem {
  id: number
  runtimeInstanceId: number
  runtimeInstanceName: string
  sourceType: string
  sourcePath: string | null
  logLevel: string | null
  logger: string | null
  traceId: string | null
  message: string
  raw: string | null
  loggedAt: string | null
  collectedAt: string | null
}

export interface ObservabilityRuntimeInstanceHealthItem {
  runtimeInstanceId: number
  runtimeInstanceName: string
  environment: string | null
  serviceName: string | null
  enabled: boolean
  probeType: string | null
  probeTarget: string | null
  healthScore: number | null
  healthLevel: string | null
  availabilityStatus: string | null
  httpStatus: number | null
  latencyMs: number | null
  failureReason: string | null
  sampledAt: string | null
}

export interface ObservabilityProjectHealthItem {
  projectId: number
  projectName: string
  projectHealthScore: number | null
  projectHealthLevel: string | null
  lastHealthCheckedAt: string | null
  totalInstanceCount: number
  enabledInstanceCount: number
  abnormalInstanceCount: number
  instances: ObservabilityRuntimeInstanceHealthItem[]
}

export interface ObservabilityHealthTimelinePointItem {
  sampledAt: string
  healthScore: number | null
  healthLevel: string | null
}

export interface PipelineCenterEntryItem {
  entryType: 'AI_CLUB' | 'JENKINS' | string
  entryId: number
  projectId: number
  projectName: string
  displayName: string
  providerCode: string
  defaultBranch: string | null
  enabled: boolean
  lastRunStatus: string | null
  lastRunMessage: string | null
  lastTriggeredAt: string | null
  primaryLabel: string
  primaryValue: string | null
  primaryUrl: string | null
  secondaryLabel: string | null
  secondaryValue: string | null
  configStatus: string | null
  cronCount: number
  triggerWebhookEnabled: boolean
  callbackWebhookEnabled: boolean
}

export interface AiClubPipelineItem {
  id: number
  projectId: number
  projectName: string
  gitlabBindingId: number
  gitlabProjectName: string | null
  gitlabProjectPath: string | null
  gitlabProjectWebUrl: string | null
  name: string
  providerCode: string
  defaultBranch: string | null
  configPath: string
  triggerVariables: Record<string, string>
  woodpeckerRepoId: number | null
  woodpeckerRepoFullName: string | null
  woodpeckerRepoUrl: string | null
  enabled: boolean
  lastRunStatus: string | null
  lastRunMessage: string | null
  lastRunNumber: number | null
  lastRunUrl: string | null
  lastTriggeredAt: string | null
  cronCount: number
  triggerWebhookEnabled: boolean
  callbackWebhookEnabled: boolean
  callbackSubscribedStatuses: string[]
}

export interface AiClubPipelineTriggerResult {
  pipelineId: number
  projectName: string
  pipelineName: string
  providerCode: string
  runNumber: number | null
  status: string
  triggerUrl: string | null
  message: string
  triggeredAt: string
}

export interface AiClubPipelineConfigTemplateParameterItem {
  key: string
  label: string
  type: 'text' | 'password' | 'textarea' | 'switch' | string
  required: boolean
  defaultValue: string
  placeholder: string
  helpText: string
  options: string[]
  secret: boolean
  dependsOnKey: string | null
  dependsOnValue: string | null
}

export interface AiClubPipelineConfigTemplateItem {
  code: string
  name: string
  description: string
  category: string
  defaultConfigPath: string
  contentPreview: string
  requirements: string[]
  readyToUse: boolean
  available: boolean
  unavailableReason: string
  requiresRegistry: boolean
  imageRepoPreview: string | null
  parameters: AiClubPipelineConfigTemplateParameterItem[]
}

export interface AiClubPipelineConfigStatusItem {
  status: 'PRESENT' | 'MISSING' | 'UNKNOWN'
  branch: string
  configPath: string
  message: string
  checkedAt: string | null
}

export interface AiClubPipelineConfigEditContextItem {
  branch: string
  configPath: string
  status: 'PRESENT' | 'MISSING'
  rawContent: string
  prefillMode: 'FORM' | 'MANUAL' | string
  templateCode: string | null
  parameters: Record<string, string>
  message: string | null
}

export interface AiClubPipelineConfigPreviewResult {
  templateCode: string
  content: string
  branch: string
  configPath: string
}

export interface AiClubPipelineConfigCompleteResult {
  branchName: string
  commitId: string | null
  commitUrl: string | null
  mergeRequestIid: number | null
  mergeRequestUrl: string | null
  message: string
}

export interface AiClubPipelineRunItem {
  number: number
  status: string | null
  branch: string | null
  event: string | null
  message: string | null
  commit: string | null
  url: string | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  durationMillis: number | null
  durationText: string
}

export interface AiClubPipelineCronItem {
  id: number
  remoteCronId: number | null
  name: string
  branch: string | null
  cronExpression: string
  enabled: boolean
  nextRunAt: string | null
  lastSyncedAt: string | null
}

export interface AiClubPipelineTriggerWebhookItem {
  enabled: boolean
  triggerUrl: string | null
  maskedToken: string | null
  updatedAt: string | null
}

export interface AiClubPipelineCallbackWebhookItem {
  enabled: boolean
  callbackUrlMasked: string | null
  subscribedStatuses: string[]
  updatedAt: string | null
  lastDeliveryAt: string | null
  lastDeliveryStatus: string | null
}

export interface AiClubPipelineRunLogDetailItem {
  projectName: string
  pipelineName: string
  repoFullName: string | null
  runNumber: number
  status: string | null
  branch: string | null
  url: string | null
  startedAt: string | null
  finishedAt: string | null
  consoleLog: string
}

export interface WoodpeckerHealthItem {
  enabled: boolean
  configured: boolean
  available: boolean
  internalBaseUrl: string
  publicBaseUrl: string
  message: string
  checkedAt: string | null
  userName: string | null
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
  reviewStrictness: 'HIGH' | 'MEDIUM' | 'LOW'
  pipelineTargets: GitlabAutoMergePipelineTargetItem[]
  lastRunStatus: string | null
  lastRunMessage: string | null
  lastRunAt: string | null
}

export interface GitlabAutoMergePipelineTargetItem {
  targetType: 'AI_CLUB' | 'JENKINS' | string
  targetId: number
  targetName: string
  providerName: string
  defaultBranch: string | null
  enabled: boolean
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
  latestCommitTitle?: string | null
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
 * GitLab 自动合并外发 Webhook（URL 已脱敏；明文不会从后端返回）。
 */
export interface GitlabAutoMergeWebhookItem {
  id: number
  configId: number
  name: string
  targetUrlMasked: string
  subscribedEvents: string[]
  messageTemplate: string | null
  enabled: boolean
  lastDeliveryAt: string | null
  lastDeliveryStatus: string | null
  lastDeliveryMessage: string | null
}

/**
 * GitLab 自动合并外发 Webhook 可订阅的事件列表，与后端 GitlabAutoMergeWebhookDispatcher.SUPPORTED_EVENTS 保持一致。
 */
export const GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'MERGED', label: '合并成功' },
  { value: 'AI_REJECTED', label: 'AI 审核拒绝' },
  { value: 'FAILED', label: '合并失败' },
  { value: 'SKIPPED', label: '已跳过' },
  { value: 'BRANCH_BEHIND', label: '源分支落后' },
  { value: 'EMPTY', label: '无可处理 MR' }
]


export interface GitlabProductBranchItem {
  id: number
  bindingId: number
  lineCode: string
  lineName: string
  branchName: string
  enabled: boolean
  behindCount: number
  hasDiffWithMainline: boolean
  hasOpenSyncMr: boolean
  openSyncMergeRequestIid: number | null
  openSyncMergeRequestTitle: string | null
  openSyncMergeRequestWebUrl: string | null
  lastSyncStatus: string | null
  lastSyncMessage: string | null
  lastSyncAt: string | null
  lastSyncMrUrl: string | null
}

export interface GitlabProductBranchSyncLogItem {
  id: number
  productBranchId: number | null
  lineCode: string | null
  lineName: string | null
  sourceBranchName: string
  targetBranchName: string
  sourceCommitSha: string | null
  targetCommitSha: string | null
  mergeRequestIid: number | null
  mergeRequestTitle: string | null
  mergeRequestWebUrl: string | null
  result: string
  reason: string
  executedByUserId: number | null
  executedAt: string
}

export interface GitlabProductBranchSyncRunItem {
  productBranchId: number
  lineCode: string
  lineName: string
  targetBranchName: string
  result: string
  message: string
  behindCount: number
  mergeRequestIid: number | null
  mergeRequestWebUrl: string | null
}

export interface GitlabProductBranchSyncRunResult {
  bindingId: number
  projectName: string
  sourceBranchName: string
  targetCount: number
  createdCount: number
  noChangeCount: number
  existingOpenMrCount: number
  failedCount: number
  items: GitlabProductBranchSyncRunItem[]
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
  actorName: string | null
  actorUsername: string | null
}

/**
 * 当前登录用户在默认 GitLab 实例上的 OAuth 绑定状态。
 */
export interface GitlabUserOauthBindingItem {
  connected: boolean
  apiBaseUrl: string
  gitlabUserId: number | null
  gitlabUsername: string | null
  gitlabName: string | null
  expiresAt: string | null
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

export interface GitlabAutoMergeProjectShareItem {
  projectId: number
  projectName: string
  enabled: boolean
  expiresAt: string | null
  shareUrl: string | null
}

/**
 * 自动合并日志逐条审查问题反馈。
 *
 * 分享页访问者可以对 detail_markdown 中"本次新增问题"或"当前仍需处理问题"
 * 区块里的每条 issue 单独评价（分析正确 / 分析错误 + 可选理由），后续 LLM 复盘
 * 智能体按 issueId 聚合所有反馈，分析自动合并审查智能体的失败模式。
 */
export interface GitlabAutoMergeLogIssueFeedbackItem {
  id: number
  logId: number
  issueId: string
  issueTextSnapshot: string
  /** issue 所在区块：NEWLY_RAISED（本次新增） / PENDING（当前仍需处理）。 */
  section: 'NEWLY_RAISED' | 'PENDING'
  /** 评价：CORRECT（分析正确） / INCORRECT（分析错误）。 */
  verdict: 'CORRECT' | 'INCORRECT'
  reason: string | null
  createdAt: string
  updatedAt: string
}

/** 提交反馈的请求体。 */
export interface GitlabAutoMergeLogIssueFeedbackPayload {
  issueId: string
  verdict: 'CORRECT' | 'INCORRECT'
  reason?: string
  fingerprint: string
  section: 'NEWLY_RAISED' | 'PENDING'
}

export type AiModelType = 'CHAT' | 'EMBEDDING'
export type OpenAiApiMode = 'AUTO' | 'RESPONSES' | 'CHAT_COMPLETIONS' | 'CHAT_COMPLETIONS_PLAIN'

export interface AiModelConfigItem {
  id: number
  name: string
  modelType: AiModelType
  provider: 'OPENAI' | 'ANTHROPIC'
  apiBaseUrl: string
  modelName: string
  openaiApiMode: OpenAiApiMode
  apiKeyConfigured: boolean
  description: string
  enabled: boolean
}

export interface ModelTestResult {
  id: number
  name: string
  modelType: AiModelType
  provider: 'OPENAI' | 'ANTHROPIC'
  modelName: string
  success: boolean
  message: string
  testedAt: string
}

/** 模型对比测试整体状态：从 PENDING 到 RUNNING，最终落到 SUCCESS/FAILED/CANCELED 三种终态之一。 */
export type ModelBenchmarkRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED'
/** 单个模型在某次 run 内的指标行状态。 */
export type ModelBenchmarkMetricStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'

export interface ModelBenchmarkMetricView {
  id: number
  runId: number
  modelId: number
  modelName: string
  provider: string
  modelRealName: string
  status: ModelBenchmarkMetricStatus
  totalCount: number
  successCount: number
  failureCount: number
  /** 失败率，0~1 浮点数。 */
  failureRate: number
  avgOutputTokens: number
  avgTtftMs: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  totalTokenPerSec: number
  genTokenPerSec: number
  throughput: number
  wallTimeMs: number
  /** true 表示该行的 token 数为按文本长度估算（接口未返回 usage）。 */
  tokenEstimated: boolean
  sampleError: string | null
  createdAt: string
  updatedAt: string
}

export interface ModelBenchmarkRunSummary {
  id: number
  /**
   * 关联的配置 id。新模型下每条 run 都挂在唯一一份 config 之下。
   */
  configId: number
  name: string
  status: ModelBenchmarkRunStatus
  concurrency: number
  totalRequests: number
  streamEnabled: boolean
  maxTokens: number
  modelCount: number
  modelIds: number[]
  progressTotal: number
  progressDone: number
  createdBy: number | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export interface ModelBenchmarkRunDetail extends Omit<ModelBenchmarkRunSummary, 'modelCount'> {
  systemPrompt: string
  userPrompt: string
  errorMessage: string | null
  metrics: ModelBenchmarkMetricView[]
}

export interface ModelBenchmarkProgress {
  id: number
  status: ModelBenchmarkRunStatus
  progressTotal: number
  progressDone: number
  errorMessage: string | null
}

/**
 * 模型对比测试配置：可重复编辑、可重复触发的"测试方案"。
 *
 * 列表行附带 latestRun + runCount，便于在列表页一眼看到"这份配置最近跑得怎么样"。
 */
export interface ModelBenchmarkConfigSummary {
  id: number
  name: string
  concurrency: number
  totalRequests: number
  streamEnabled: boolean
  maxTokens: number
  modelCount: number
  modelIds: number[]
  createdBy: number | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  /** 该 config 历史 run 总次数。 */
  runCount: number
  /** 最近一次 run 的轻量摘要；从未运行时为 null。 */
  latestRun: ModelBenchmarkRunSummary | null
}

/** 抽屉顶部用：配置摘要 + active run 标记。 */
export interface ModelBenchmarkConfigDetail {
  id: number
  name: string
  concurrency: number
  totalRequests: number
  streamEnabled: boolean
  maxTokens: number
  systemPrompt: string
  userPrompt: string
  modelIds: number[]
  createdBy: number | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  runCount: number
  /** 是否存在 PENDING/RUNNING 的 run。 */
  hasActiveRun: boolean
  /** 当前 active run 的 id（若有），便于直接发起 cancel。 */
  activeRunId: number | null
  latestRun: ModelBenchmarkRunSummary | null
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
  /** 用户管理中绑定的 GitLab 用户ID，供跨系统人员映射复用。 */
  gitlabUserId: number | null
  gitlabUsername: string
  /** GitLab 展示名快照，用于列表展示与关键字检索。 */
  gitlabName: string
  giteeMemberId: number | null
  giteeUsername: string
  giteeName: string
  enabled: boolean
  builtIn: boolean
  lastLoginAt: string | null
  roleIds: number[]
  roleCodes: string[]
  roleNames: string[]
}

export interface CreditGlobalConfigItem {
  /** 新用户注册后是否自动赠送积分。 */
  registerGrantEnabled: boolean
  /** 注册赠送积分数量，后端保证不小于 0。 */
  registerGrantAmount: number
  updatedAt: string | null
}

export interface CreditFeatureConfigItem {
  id: number | null
  /** AI 功能扣费编码，后续业务消费时用 featureCode 精确匹配。 */
  featureCode: string
  featureName: string
  costAmount: number
  enabled: boolean
  updatedAt: string | null
}

export interface CreditAccountItem {
  userId: number
  username: string
  nickname: string
  balance: number
  totalGranted: number
  totalConsumed: number
  totalRefunded: number
  updatedAt: string | null
}

export interface CreditAccountBackfillResult {
  createdCount: number
  grantedCount: number
  grantAmount: number
}

export interface CreditTransactionItem {
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

export interface GitlabUserItem {
  id: number
  username: string
  name: string
  email: string
  avatarUrl: string | null
  webUrl: string | null
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

export interface PlatformToolItem {
  code: string
  name: string
  moduleCode: string
  description: string
  readOnly: boolean
  riskLevel: string
  permissionCode: string
  requiresConfirm: boolean
  enabled: boolean
  allowAutoExecute: boolean
  displayNameOverride: string
  descriptionOverride: string
}

export interface DataWorkbenchAppItem {
  code: string
  name: string
  description: string
  enabled: boolean
}

export interface DataWorkbenchFieldItem {
  id: number | null
  fieldCode: string
  fieldName: string
  columnName: string
  dataType: string
  synonyms: string
  updatable: boolean
  locator: boolean
  sensitive: boolean
  enabled: boolean
  sortOrder: number
}

export interface DataWorkbenchEntityItem {
  id: number
  entityCode: string
  entityName: string
  description: string
  tableName: string
  primaryKeyColumn: string
  /** 归属的平台项目 ID，v2 起替代动态 project_id_column。 */
  platformProjectId: number | null
  /** 归属项目展示名称，供列表快速渲染，避免二次请求。 */
  platformProjectName: string
  maxAffectedRows: number
  requestScope: DataPermissionScopeValue
  executeScope: DataPermissionScopeValue
  rollbackScope: DataPermissionScopeValue
  enabled: boolean
  fields: DataWorkbenchFieldItem[]
}

export interface DataChangeDsl {
  version: string
  operation: string
  entityCode: string
  set: Record<string, unknown>
  where: Record<string, unknown>
}

export interface DataChangePreviewResult {
  dsl: DataChangeDsl
  entity: DataWorkbenchEntityItem
  sqlSummary: string
  affectedRows: number
  riskLevel: string
  riskReasons: string[]
  approvalRequired: boolean
}

export interface DataChangeRequestItem {
  id: number
  projectId: number
  projectName: string
  entityId: number
  entityCode: string
  entityName: string
  originalText: string
  dsl: DataChangeDsl
  previewSqlSummary: string
  riskLevel: string
  approvalStatus: string
  executionStatus: string
  rollbackStatus: string
  affectedRows: number
  riskReasons: string[]
  rejectReason: string
  rollbackConflictReason: string
  requesterName: string
  approverName: string
  executorName: string
  rollbackUserName: string
  createdAt: string
  approvedAt: string
  executedAt: string
  rolledBackAt: string
}

export interface DataChangeAuditItem {
  id: number
  requestId: number
  entityName: string
  primaryKeyValue: string
  beforeSnapshot: Record<string, unknown>
  afterSnapshot: Record<string, unknown>
  sqlSummary: string
  rollbackStatus: string
  rollbackConflictReason: string
  createdAt: string
  rolledBackAt: string
}

/**
 * DataWorkbench 实体解析草稿（后端返回，用于回填新增/编辑弹窗）。
 */
export interface DataWorkbenchEntityDraft {
  entityCode: string
  entityName: string
  description: string
  tableName: string
  primaryKeyColumn: string
  /** 由管理员在弹窗里选择平台项目，解析器不推断，返回 null。 */
  platformProjectId: number | null
  maxAffectedRows: number
  requestScope: DataPermissionScopeValue
  executeScope: DataPermissionScopeValue
  rollbackScope: DataPermissionScopeValue
  enabled: boolean
  fields: DataWorkbenchFieldItem[]
}

/**
 * DataWorkbench 实体解析结果：草稿 + warning 列表。
 */
export interface DataWorkbenchEntityParseResult {
  draft: DataWorkbenchEntityDraft
  warnings: string[]
}

export interface PlatformEnvVarItem {
  envKey: string
  displayName: string
  description: string
  sensitive: boolean
  sourceType: string | null
  effectiveSourceType: string
  configured: boolean
  effectiveStatus: 'ACTIVE' | 'ERROR' | 'MISSING' | string
  effectiveStatusMessage: string
  updatedAt: string | null
}

export interface PlatformEnvVarDetailItem extends PlatformEnvVarItem {
  staticValue: string
  staticValueConfigured: boolean
  httpUrl: string
  httpHeadersJson: string
  httpHeadersConfigured: boolean
  resolvedValuePreview: string
}

export interface RuntimeCapabilitiesItem {
  serverManagementEnabled: boolean
}

export interface ServerAlertConfigItem {
  connectivityAlertEnabled: boolean
  connectivityAlertEnabledOverride: boolean | null
  cpuThresholdPercent: number
  cpuThresholdPercentOverride: number | null
  memoryThresholdPercent: number
  memoryThresholdPercentOverride: number | null
  diskThresholdPercent: number
  diskThresholdPercentOverride: number | null
  consecutiveBreaches: number
  consecutiveBreachesOverride: number | null
  cooldownMinutes: number
  cooldownMinutesOverride: number | null
  recipientUsers: UserOptionItem[]
}

export interface ServerAlertStateItem {
  alertCode: string
  alertName: string
  active: boolean
  lastObservedValue: number | null
  consecutiveBreachCount: number | null
  lastNotifiedAt: string | null
  lastTriggeredAt: string | null
  lastRecoveredAt: string | null
  lastMessage: string
}

export interface ServerMetricSampleItem {
  probeStatus: string
  probeMessage: string
  cpuUsagePercent: number | null
  memoryUsagePercent: number | null
  diskUsagePercent: number | null
  sampledAt: string
}

export interface ServerSummaryItem {
  id: number
  name: string
  description: string
  host: string
  port: number
  username: string
  osType: string
  authType: string
  enabled: boolean
  jumpHostEnabled: boolean
  passwordConfigured: boolean
  privateKeyConfigured: boolean
  jumpPasswordConfigured: boolean
  jumpPrivateKeyConfigured: boolean
  lastProbeStatus: string | null
  lastProbeMessage: string | null
  lastProbedAt: string | null
  lastCpuUsagePercent: number | null
  lastMemoryUsagePercent: number | null
  lastDiskUsagePercent: number | null
  activeAlertCount: number
}

export interface ServerDetailItem extends ServerSummaryItem {
  jumpHost: string | null
  jumpPort: number | null
  jumpUsername: string | null
  jumpAuthType: string | null
  effectiveAlertConfig: ServerAlertConfigItem
  alertStates: ServerAlertStateItem[]
}

export interface ServerTerminalSessionCreatedItem {
  sessionId: string
  cols: number
  rows: number
}

export interface PrReviewStatsGroupItem {
  id: number
  name: string
}

export interface PrReviewStatsConfigItem {
  oaBaseUrl: string
  defaultDevGroupName: string
  groups: PrReviewStatsGroupItem[]
}

export interface PrReviewStatsPendingTaskItem {
  ident: string
  title: string
  assigneeRemark: string
  projectName: string
  prTitle: string
  prState: string
}

export interface PrReviewStatsPendingTaskGroupItem {
  assigneeRemark: string
  count: number
  issueBracketText: string
  tasks: PrReviewStatsPendingTaskItem[]
}

export interface PrReviewStatsSummaryItem {
  startTime: string
  endTime: string
  groupId: number
  groupName: string
  totalPrCount: number
  closedPrCount: number
  mergedOrClosedDevelopmentCount: number
  unmergedDevelopmentCount: number
  rejectRate: number
  rejectTargetRate: number
  rejectRateQualified: boolean
  allMerged: boolean
  issueBracketSuggestion: string
  summaryMarkdown: string
  pendingTaskGroups: PrReviewStatsPendingTaskGroupItem[]
}

export interface PrReviewStatsQueryPayload {
  startTime: string
  endTime: string
  groupId: number
  groupName?: string
}

/** SFTP 远程文件或目录项 */
export interface SftpFileItem {
  /** 文件/目录名称 */
  name: string
  /** 完整路径 */
  path: string
  /** 是否为目录 */
  isDirectory: boolean
  /** 是否为符号链接 */
  symbolicLink: boolean
  /** 符号链接目标路径 */
  linkTarget: string | null
  /** 文件大小（字节） */
  size: number
  /** 最后修改时间 */
  lastModified: string
  /** 权限字符串 */
  permissions: string
}

/** SFTP 远程目录列表结果 */
export interface SftpLsResult {
  /** 当前目录路径 */
  path: string
  /** 目录中的文件和子目录列表 */
  files: SftpFileItem[]
}

/** SFTP 短期下载票据 */
export interface SftpDownloadTicket {
  /** 绑定当前用户、服务器和路径的短期票据 */
  ticket: string
  /** 票据过期时间 */
  expiresAt: string
}
