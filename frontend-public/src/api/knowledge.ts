/**
 * 知识模块 API。
 * Wiki 空间/目录/页面 + 知识图谱 + 记忆事实图。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse } from '@/src/types/api'
import type {
  KnowledgeGraphItem,
  MemoryFactFactsResponseItem,
  MemoryFactGraphItem,
  WikiSpaceDetailItem,
  WikiSpaceItem,
  WikiSpacePageDetailItem,
  WikiSpacePageSummaryItem,
  WikiDirectoryTreeNodeItem,
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

/* ── 知识图谱 ── */

export const getProjectKnowledgeGraph = async (projectId: number): Promise<KnowledgeGraphItem> => {
  const res = await http.get<ApiResponse<KnowledgeGraphItem>>(`/api/projects/${projectId}/knowledge-graph`)
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
