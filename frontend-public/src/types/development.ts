/**
 * 研发模块类型定义。
 * 涵盖 GitLab 仓库绑定、分支、合并请求、代码结构。
 */

/** 项目 GitLab 仓库绑定。 */
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
  codeStructureStatus: string | null
  codeStructureGeneratedAt: string | null
  codeStructureDegraded: boolean | null
}

/** GitLab 分支。 */
export interface GitlabBranchItem {
  name: string
  defaultBranch: boolean
  protectedBranch: boolean
  merged: boolean
  webUrl: string | null
  latestCommitTitle?: string | null
}

/** GitLab 合并请求。 */
export interface GitlabMergeRequestItem {
  iid: number
  title: string
  state: string
  sourceBranch: string
  targetBranch: string
  draft: boolean
  hasConflicts: boolean
  detailedMergeStatus: string
  pipelineStatus: string
  authorName: string
  webUrl: string
  updatedAt: string
}

/** 代码结构快照。 */
export interface GitlabCodeStructureSnapshotItem {
  bindingId: number
  branch: string | null
  status: string
  generatedAt: string | null
  degraded: boolean | null
  totalFileCount: number
  totalSymbolCount: number
  overviewMarkdown: string | null
  files: GitlabCodeStructureFileItem[]
}

/** 代码结构文件条目。 */
export interface GitlabCodeStructureFileItem {
  path: string
  language: string | null
  symbolCount: number
  lineCount: number
}

/** 质量扫描规则集。 */
export interface RepositoryScanRulesetItem {
  id?: number
  code: string
  name: string
  description: string
  engineType: string
  defaultSelected: boolean
}

/** 自动合并日志条目。 */
export interface GitlabAutoMergeLogItem {
  id: number
  configId: number | null
  configName: string
  triggerType: 'MANUAL' | 'SCHEDULED'
  mergeRequestIid: number | null
  mergeRequestTitle: string | null
  mergeRequestAuthorName: string | null
  result: string
  reason: string
  detailMarkdown: string | null
  webUrl: string | null
  executedAt: string
}
