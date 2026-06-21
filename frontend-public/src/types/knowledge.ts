/**
 * 知识模块类型定义。
 * 涵盖 Wiki 空间/页面/目录、知识图谱、记忆事实图。
 */

/* ── Wiki ── */

export interface WikiSpaceItem {
  id: number
  name: string
  description: string
  readScope: string
  boundProjectId: number | null
  boundProjectName: string
  memberDefaultSource: string
  currentUserRole: string
  directoryCount: number
  pageCount: number
  boundProjectCount: number
  canManage: boolean
  createdAt: string
  updatedAt: string
}

export interface WikiSpaceDetailItem extends WikiSpaceItem {
  creatorName: string
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

export interface WikiSpacePageSummaryItem {
  id: number
  spaceId: number
  spaceName: string
  directoryId: number
  directoryName: string
  parentPageId: number | null
  boundProjectId: number | null
  title: string
  slug: string
  currentVersionNumber: number
  syncStatus: string
  authorName: string
  canEdit: boolean
  updatedAt: string
  children: WikiSpacePageSummaryItem[]
}

export interface WikiSpacePageDetailItem {
  id: number
  spaceId: number
  spaceName: string
  directoryId: number
  directoryName: string
  parentPageId: number | null
  title: string
  slug: string
  content: string
  currentVersionNumber: number
  syncStatus: string
  lastSyncedAt: string
  lastSyncError: string
  authorName: string
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

/* ── 知识图谱 ── */

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

/* ── 记忆事实 ── */

export interface MemoryFactNodeItem {
  id: string
  entityType: string
  label: string
  aliases: string[]
  degree: number
  factCount: number
  metadataJson: string
}

export interface MemoryFactEdgeItem {
  id: string
  sourceId: string
  targetId: string
  relationType: string
  weight: number | null
  factIds: string[]
  metadataJson: string
}

export interface MemoryFactGraphItem {
  projectId: number | null
  bankId: string
  generatedAt: string
  nodeCount: number
  edgeCount: number
  factCount: number
  warnings: string[]
  nodes: MemoryFactNodeItem[]
  edges: MemoryFactEdgeItem[]
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

export interface MemoryFactFactsResponseItem {
  projectId: number | null
  scopeType: string
  scopeId: string
  query: string
  factCount: number
  warnings: string[]
  facts: MemoryFactItem[]
}
