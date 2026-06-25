/**
 * 文档模块类型定义。
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

/** 上传文档资产摘要。 */
export interface DocumentAssetItem {
  id: number
  fileName: string
  contentType: string
  fileSize: number
  sourceFormat: string
  bindingStatus: string
  url: string
}

/** 文档导入预览结果（后端将文档转换为 Markdown 后的摘要）。 */
export interface DocumentMarkdownResultItem {
  assetId: number
  fileName: string
  suggestedTitle: string
  sourceFormat: string
  markdown: string
  truncated: boolean
  warnings: string[]
}

/** 页面版本历史摘要。 */
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

/* ── Wiki 空间级 LightRAG 知识图谱 ── */

/** LightRAG 抽取的实体节点；真实实体类型在 metadataJson.entityType 里。 */
export interface WikiKnowledgeGraphNodeItem {
  id: number
  nodeType: string
  bizId: number | null
  name: string
  slug: string | null
  directoryId: number | null
  chunkCount: number | null
  metadataJson: string
}

/** LightRAG 抽取的实体关系边。 */
export interface WikiKnowledgeGraphEdgeItem {
  id: number
  fromNodeId: number
  toNodeId: number
  edgeType: string
  similarity: number | null
  evidenceText: string
}

/** 空间级 LightRAG 知识图谱聚合结果。 */
export interface WikiSpaceKnowledgeGraphItem {
  spaceId: number
  spaceName: string
  /** 向量/图谱索引是否就绪；false 时通常无可展示数据。 */
  vectorEnabled: boolean
  generatedAt: string
  nodes: WikiKnowledgeGraphNodeItem[]
  edges: WikiKnowledgeGraphEdgeItem[]
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
