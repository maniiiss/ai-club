/**
 * 文档模块 API。
 * Wiki 空间/目录/页面 + 知识图谱 + 记忆事实图。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse } from '@/src/types/api'
import type {
  DocumentAssetItem,
  DocumentMarkdownResultItem,
  KnowledgeGraphItem,
  MemoryFactFactsResponseItem,
  MemoryFactGraphItem,
  WikiSpaceDetailItem,
  WikiSpaceItem,
  WikiSpacePageDetailItem,
  WikiSpacePageSummaryItem,
  WikiSpacePageVersionItem,
  WikiDirectoryTreeNodeItem,
  WikiSpaceKnowledgeGraphItem,
} from '@/src/types/knowledge'

/* ── Wiki 空间 ── */

export const listWikiSpaces = async (query?: {
  keyword?: string
  projectId?: number | null
}): Promise<WikiSpaceItem[]> => {
  const res = await http.get<ApiResponse<WikiSpaceItem[]>>('/api/wiki/spaces', {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}

export const getWikiSpaceDetail = async (spaceId: number): Promise<WikiSpaceDetailItem> => {
  const res = await http.get<ApiResponse<WikiSpaceDetailItem>>(`/api/wiki/spaces/${spaceId}`)
  return unwrap(res)
}

/* ── Wiki 目录树 ── */

export const getWikiDirectoryTree = async (spaceId: number): Promise<WikiDirectoryTreeNodeItem[]> => {
  const res = await http.get<ApiResponse<WikiDirectoryTreeNodeItem[]>>(`/api/wiki/spaces/${spaceId}/directories/tree`)
  return unwrap(res)
}

/* ── Wiki 页面 ── */

export const getWikiPage = async (spaceId: number, pageId: number): Promise<WikiSpacePageDetailItem> => {
  const res = await http.get<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}`)
  return unwrap(res)
}

export interface WikiPagePayload {
  directoryId: number
  parentPageId?: number | null
  title: string
  content: string
  changeSummary?: string
}

export const createWikiPage = async (spaceId: number, payload: WikiPagePayload): Promise<WikiSpacePageDetailItem> => {
  const res = await http.post<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages`, payload)
  return unwrap(res)
}

export const updateWikiPage = async (spaceId: number, pageId: number, payload: WikiPagePayload): Promise<WikiSpacePageDetailItem> => {
  const res = await http.put<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}`, payload)
  return unwrap(res)
}

export const deleteWikiPage = async (spaceId: number, pageId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}`)
}

/* ── Wiki 目录 ── */

export interface WikiDirectoryPayload {
  name: string
  content: string
  parentDirectoryId?: number | null
  boundProjectId?: number | null
}

export const createWikiDirectory = async (spaceId: number, payload: WikiDirectoryPayload): Promise<void> => {
  await http.post<ApiResponse<null>>(`/api/wiki/spaces/${spaceId}/directories`, payload)
}

export const deleteWikiDirectory = async (spaceId: number, directoryId: number): Promise<void> => {
  await http.delete<ApiResponse<null>>(`/api/wiki/spaces/${spaceId}/directories/${directoryId}`)
}

/* ── Wiki 搜索 ── */

export const searchWikiPages = async (query?: {
  keyword?: string
  spaceId?: number | null
  projectId?: number | null
}): Promise<WikiSpacePageSummaryItem[]> => {
  const res = await http.get<ApiResponse<WikiSpacePageSummaryItem[]>>('/api/wiki/search', {
    params: query ? cleanParams(query) : undefined,
  })
  return unwrap(res)
}

/* ── Wiki 版本历史 ── */

/** 查询页面的版本历史列表。 */
export const listWikiPageVersions = async (spaceId: number, pageId: number): Promise<WikiSpacePageVersionItem[]> => {
  const res = await http.get<ApiResponse<WikiSpacePageVersionItem[]>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}/versions`)
  return unwrap(res)
}

/** 恢复到指定版本，返回恢复后的页面详情。 */
export const restoreWikiPageVersion = async (spaceId: number, pageId: number, versionNumber: number): Promise<WikiSpacePageDetailItem> => {
  const res = await http.post<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/${pageId}/restore/${versionNumber}`)
  return unwrap(res)
}

/* ── Wiki 文档导入 ── */

/** 上传文档资产（PDF/DOCX/PPTX/XLSX），返回文档资产摘要。 */
export const uploadDocumentAsset = async (file: File, directory?: string): Promise<DocumentAssetItem> => {
  const formData = new FormData()
  formData.append('file', file)
  if (directory) {
    formData.append('directory', directory)
  }
  const res = await http.post<ApiResponse<DocumentAssetItem>>('/api/common/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return unwrap(res)
}

/** 预览导入：后端将文档转换为 Markdown 并返回预览结果。 */
export const previewWikiImport = async (spaceId: number, assetId: number): Promise<DocumentMarkdownResultItem> => {
  const res = await http.post<ApiResponse<DocumentMarkdownResultItem>>(`/api/wiki/spaces/${spaceId}/imports/preview`, { assetId })
  return unwrap(res)
}

/** 从导入的文档资产创建 Wiki 页面。 */
export interface WikiImportPagePayload {
  assetId: number
  directoryId: number
  parentPageId?: number | null
  title: string
  content?: string
}

export const importWikiPage = async (spaceId: number, payload: WikiImportPagePayload): Promise<WikiSpacePageDetailItem> => {
  const res = await http.post<ApiResponse<WikiSpacePageDetailItem>>(`/api/wiki/spaces/${spaceId}/pages/import`, payload)
  return unwrap(res)
}

/* ── 知识图谱 ── */

export const getProjectKnowledgeGraph = async (projectId: number): Promise<KnowledgeGraphItem> => {
  const res = await http.get<ApiResponse<KnowledgeGraphItem>>(`/api/projects/${projectId}/knowledge-graph`)
  return unwrap(res)
}

/** 读取 Wiki 空间级 LightRAG 知识图谱（Neo4j 真实实体关系）。 */
export const getWikiSpaceKnowledgeGraph = async (spaceId: number): Promise<WikiSpaceKnowledgeGraphItem> => {
  const res = await http.get<ApiResponse<WikiSpaceKnowledgeGraphItem>>(`/api/wiki/spaces/${spaceId}/knowledge-graph`)
  return unwrap(res)
}

/* ── 记忆事实图 ── */

export const getProjectMemoryFactGraph = async (projectId: number): Promise<MemoryFactGraphItem> => {
  const res = await http.get<ApiResponse<MemoryFactGraphItem>>(`/api/projects/${projectId}/memory-fact-graph`)
  return unwrap(res)
}

export const getProjectMemoryFactFacts = async (
  projectId: number,
  params?: { entityId?: string; query?: string; limit?: number },
): Promise<MemoryFactFactsResponseItem> => {
  const res = await http.get<ApiResponse<MemoryFactFactsResponseItem>>(`/api/projects/${projectId}/memory-fact-graph/facts`, {
    params: params ? cleanParams(params) : undefined,
  })
  return unwrap(res)
}
