export interface MemoryFactVisualizationNode {
  id: string
  label: string
  shortLabel: string
  entityType: string
  degree: number
  factCount: number
  color: string
  metadata: Record<string, unknown>
}

export interface MemoryFactVisualizationLink {
  id: string
  source: string
  target: string
  type: string
  width: number
  weight: number
  color: string
  metadata: Record<string, unknown>
}

export interface MemoryFactVisualizationData {
  nodes: MemoryFactVisualizationNode[]
  links: MemoryFactVisualizationLink[]
}

export const entityColor = (entityType: string) => {
  const map: Record<string, string> = {
    FACT: '#0074d9',
    ENTITY: '#4f46e5',
    LOCATION: '#0891b2',
    PERSON: '#ef4444',
    ORGANIZATION: '#16a34a',
    DOCUMENT: '#d97706',
    EVENT: '#7c3aed'
  }
  return map[String(entityType || '').toUpperCase()] || '#64748b'
}

export const relationCategory = (relationType: string) => {
  const normalized = String(relationType || '').toLowerCase()
  if (normalized === 'semantic') return 'semantic'
  if (normalized === 'temporal') return 'temporal'
  if (normalized === 'entity') return 'entity'
  if (['cause', 'causes', 'caused_by', 'enables', 'prevents'].includes(normalized)) return 'causal'
  return 'semantic'
}

export const relationColor = (relationType: string) => {
  const map: Record<string, string> = {
    semantic: '#0074d9',
    temporal: '#009296',
    entity: '#f59e0b',
    causal: '#8b5cf6'
  }
  return map[relationCategory(relationType)] || '#7c8ea3'
}

/**
 * 按 Hindsight Graph/Constellation 的处理方式截取渲染子集。
 * 只在节点数量超过上限时保留后端返回顺序中的前 N 个节点，
 * 再展示这些可见节点之间的全部关系，避免因为前端二次重排导致内容不一致。
 */
export const buildRenderableGraphData = (
  data: MemoryFactVisualizationData,
  options?: {
    maxNodes?: number | null
    selectedNodeId?: string | null
    selectedEdgeId?: string | null
  }
) => {
  const maxNodes = options?.maxNodes && options.maxNodes > 0 ? options.maxNodes : null

  if (!maxNodes || data.nodes.length <= maxNodes) {
    return data
  }

  const keptNodes = data.nodes.slice(0, maxNodes)
  const keptNodeIds = new Set(keptNodes.map((item) => item.id))
  const keptLinks = data.links.filter((item) => keptNodeIds.has(item.source) && keptNodeIds.has(item.target))

  return {
    nodes: keptNodes,
    links: keptLinks
  } satisfies MemoryFactVisualizationData
}
