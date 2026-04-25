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

const nodeScore = (node: MemoryFactVisualizationNode) => node.degree * 3 + node.factCount * 4

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
 * 将当前筛选后的图谱裁成更适合视觉渲染的一份子集。
 * 优先保留当前选中的节点及其邻域，再按关联度和事实量做排序，
 * 这样既能复用 Hindsight 的“重点优先”视觉逻辑，也不会把用户当前关注点裁掉。
 */
export const buildRenderableGraphData = (
  data: MemoryFactVisualizationData,
  options?: {
    maxNodes?: number | null
    selectedNodeId?: string | null
    selectedEdgeId?: string | null
  }
) => {
  const selectedNodeId = options?.selectedNodeId || null
  const selectedEdgeId = options?.selectedEdgeId || null
  const maxNodes = options?.maxNodes && options.maxNodes > 0 ? options.maxNodes : null

  if (!maxNodes || data.nodes.length <= maxNodes) {
    return data
  }

  const neighborIds = new Set<string>()
  if (selectedNodeId) {
    neighborIds.add(selectedNodeId)
    for (const link of data.links) {
      if (link.source === selectedNodeId || link.target === selectedNodeId) {
        neighborIds.add(link.source)
        neighborIds.add(link.target)
      }
    }
  }
  if (selectedEdgeId) {
    const selectedEdge = data.links.find((item) => item.id === selectedEdgeId)
    if (selectedEdge) {
      neighborIds.add(selectedEdge.source)
      neighborIds.add(selectedEdge.target)
    }
  }

  const orderedNodes = [...data.nodes].sort((left, right) => {
    const leftIsSelected = left.id === selectedNodeId
    const rightIsSelected = right.id === selectedNodeId
    if (leftIsSelected !== rightIsSelected) return leftIsSelected ? -1 : 1

    const leftIsNeighbor = neighborIds.has(left.id)
    const rightIsNeighbor = neighborIds.has(right.id)
    if (leftIsNeighbor !== rightIsNeighbor) return leftIsNeighbor ? -1 : 1

    const scoreDelta = nodeScore(right) - nodeScore(left)
    if (scoreDelta !== 0) return scoreDelta
    return left.label.localeCompare(right.label, 'zh-CN')
  })

  const keptNodes = orderedNodes.slice(0, maxNodes)
  const keptNodeIds = new Set(keptNodes.map((item) => item.id))
  const keptLinks = data.links.filter((item) => keptNodeIds.has(item.source) && keptNodeIds.has(item.target))

  return {
    nodes: keptNodes,
    links: keptLinks
  } satisfies MemoryFactVisualizationData
}
