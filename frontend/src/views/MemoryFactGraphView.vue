<template>
  <div ref="pageRootRef" class="memory-fact-page">
    <el-card class="page-card toolbar-card" shadow="never">
      <div class="page-header">
        <div class="page-headline">
          <el-button text @click="goBack">{{ backLabel }}</el-button>
          <div class="page-title">{{ scopeName || '记忆事实图' }}</div>
        </div>
        <el-space wrap>
          <el-segmented
            v-model="viewMode"
            :options="viewModeOptions"
            class="view-mode-switch"
          />
          <el-select v-model="graphScopeMode" style="width: 132px">
            <el-option label="当前周边" value="local" />
            <el-option label="全部内容" value="all" />
          </el-select>
          <el-select v-model="maxRenderableNodesValue" style="width: 132px">
            <el-option label="节点 20" :value="20" />
            <el-option label="节点 40" :value="40" />
            <el-option label="节点 80" :value="80" />
            <el-option label="全部节点" :value="0" />
          </el-select>
          <el-button text @click="showLabels = !showLabels">
            {{ showLabels ? '隐藏标签' : '显示标签' }}
          </el-button>
          <el-select v-model="entityTypeFilter" clearable placeholder="筛选内容类型" style="width: 160px">
            <el-option v-for="item in entityTypeOptions" :key="item" :label="entityTypeLabel(item)" :value="item" />
          </el-select>
          <el-select v-model="relationTypeFilter" clearable placeholder="筛选关系类型" style="width: 170px">
            <el-option v-for="item in relationTypeOptions" :key="item" :label="relationTypeLabel(item)" :value="item" />
          </el-select>
          <el-select v-model="sourceTypeFilter" clearable placeholder="筛选来源" style="width: 140px">
            <el-option v-for="item in sourceTypeOptions" :key="item" :label="sourceTypeLabel(item)" :value="item" />
          </el-select>
          <el-input
            v-model="searchKeyword"
            placeholder="搜索内容或关键词"
            style="width: 200px"
            clearable
            @keyup.enter="handleSearch"
          />
          <el-button :loading="factsLoading" @click="handleSearch">搜索</el-button>
          <el-button :loading="loading" @click="loadGraph">刷新</el-button>
        </el-space>
      </div>

      <div v-if="combinedWarnings.length" class="warning-list">
        <el-alert
          v-for="item in combinedWarnings"
          :key="item"
          :title="item"
          type="warning"
          :closable="false"
          show-icon
        />
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">{{ scopeStatLabel }}</span>
          <strong>{{ scopeStatValue }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">当前视图</span>
          <strong>{{ currentViewTitle }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">关联数</span>
          <strong>{{ visibleEdges.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">{{ primaryCountLabel }}</span>
          <strong>{{ visibleNodes.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">更新时间</span>
          <strong>{{ graph?.generatedAt || '-' }}</strong>
        </div>
      </div>
    </el-card>

    <div class="main-grid">
      <el-card class="page-card graph-card" shadow="never">
        <template #header>
          <div class="section-header">
            <div class="section-header-copy">
              <span>{{ currentViewTitle }}</span>
              <small>{{ currentViewDescription }}</small>
            </div>
            <el-space wrap>
              <el-tag type="info">{{ visibleNodes.length }} 个内容</el-tag>
              <el-tag type="info">{{ visibleEdges.length }} 条关系</el-tag>
            </el-space>
          </div>
        </template>

        <div ref="viewStageRef" class="view-stage">
          <MemoryFactConstellationCanvas
            v-if="viewMode === 'constellation'"
            :data="visualizationData"
            :selected-node-id="selectedNodeId"
            :max-nodes="maxRenderableNodes"
            :show-labels="showLabels"
            @select-node="handleSelectNode"
            @hover-node="handleHoverPreviewNode"
            @clear-hover="clearHoverPreview"
            @clear-selection="clearSelection"
          />

          <MemoryFactHindsightGraphCanvas
            v-else-if="viewMode === 'graph'"
            :data="visualizationData"
            :selected-node-id="selectedNodeId"
            :selected-edge-id="selectedEdgeId"
            :show-labels="showLabels"
            :max-nodes="maxRenderableNodes"
            @select-node="handleSelectNode"
            @select-edge="handleSelectEdge"
            @hover-node="handleHoverPreviewNode"
            @clear-hover="clearHoverPreview"
            @clear-selection="clearSelection"
          />

          <MemoryFactTableView
            v-else-if="viewMode === 'table'"
            :nodes="visibleNodes"
            :selected-node-id="selectedNodeId"
            @select-node="handleSelectNode"
          />

          <MemoryFactTimelineView
            v-else
            :nodes="visibleNodes"
            :edges="visibleEdges"
            :facts="panelFacts"
            :facts-loading="factsLoading"
            :selected-edge-id="selectedEdgeId"
            @select-edge="handleSelectEdge"
          />

          <div
            v-if="hoverPreviewVisible && (viewMode === 'constellation' || viewMode === 'graph')"
            class="graph-preview-layer"
            :style="hoverPreviewStyle"
          >
            <MemoryFactQuickPreviewCard
              :selected-node="hoveredNode"
              :entity-detail="hoveredEntityDetail"
              :facts="hoveredFacts"
              :facts-loading="hoverPreviewLoading"
              :space-name="isWikiSpaceMode ? scopeName : ''"
              :project-name="!isWikiSpaceMode ? scopeName : ''"
              :directory-label-map="directoryLabelMap"
              :project-label-map="projectLabelMap"
            />
          </div>
        </div>
      </el-card>

      <el-card class="page-card detail-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>内容详情</span>
          </div>
        </template>

        <div class="detail-scroll">
          <MemoryFactPanel
            :selected-node="selectedNode"
            :selected-edge="selectedEdgeDetail"
            :entity-detail="entityDetail"
            :facts="panelFacts"
            :facts-loading="factsLoading"
            :warnings="panelWarnings"
            :space-name="isWikiSpaceMode ? scopeName : ''"
            :project-name="!isWikiSpaceMode ? scopeName : ''"
            :directory-label-map="directoryLabelMap"
            :project-label-map="projectLabelMap"
          />
        </div>
      </el-card>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import {
  getProjectDetail,
  getProjectMemoryFactGraph,
  getProjectMemoryFactGraphEntityDetail,
  getProjectMemoryFactGraphFacts,
  getWikiDirectoryTree,
  getWikiSpaceDetail,
  getWikiSpaceMemoryFactGraph,
  getWikiSpaceMemoryFactGraphEntityDetail,
  getWikiSpaceMemoryFactGraphFacts
} from '@/api/platform'
import type {
  MemoryFactEdgeItem,
  MemoryFactEntityDetailItem,
  MemoryFactFactsResponseItem,
  MemoryFactGraphItem,
  MemoryFactNodeItem,
  WikiDirectoryTreeNodeItem,
  WikiSpaceDetailItem
} from '@/types/platform'
import type { MemoryFactVisualizationData } from '@/utils/memoryFactVisualization'
import { entityColor, relationColor } from '@/utils/memoryFactVisualization'

type GraphScopeMode = 'local' | 'all'
type ViewMode = 'constellation' | 'graph' | 'table' | 'timeline'

interface SelectedEdgeDetail extends MemoryFactEdgeItem {
  sourceLabel: string
  targetLabel: string
}

const MemoryFactConstellationCanvas = defineAsyncComponent(() => import('@/components/MemoryFactConstellationCanvas.vue'))
const MemoryFactHindsightGraphCanvas = defineAsyncComponent(() => import('@/components/MemoryFactHindsightGraphCanvas.vue'))
const MemoryFactPanel = defineAsyncComponent(() => import('@/components/MemoryFactPanel.vue'))
const MemoryFactQuickPreviewCard = defineAsyncComponent(() => import('@/components/MemoryFactQuickPreviewCard.vue'))
const MemoryFactTableView = defineAsyncComponent(() => import('@/components/MemoryFactTableView.vue'))
const MemoryFactTimelineView = defineAsyncComponent(() => import('@/components/MemoryFactTimelineView.vue'))

const route = useRoute()
const router = useRouter()
const pageRootRef = ref<HTMLElement | null>(null)
const viewStageRef = ref<HTMLElement | null>(null)
const projectId = Number(route.params.projectId)
const spaceId = Number(route.params.spaceId)
const isWikiSpaceMode = computed(() => route.name === 'wiki-space-memory-fact-graph')
const scopeName = ref('')
const wikiSpaceDetail = ref<WikiSpaceDetailItem | null>(null)
const wikiDirectoryTree = ref<WikiDirectoryTreeNodeItem[]>([])
const graph = ref<MemoryFactGraphItem | null>(null)
const entityDetail = ref<MemoryFactEntityDetailItem | null>(null)
const factsResponse = ref<MemoryFactFactsResponseItem | null>(null)
const entityDetailCache = ref<Record<string, MemoryFactEntityDetailItem>>({})
const loading = ref(false)
const factsLoading = ref(false)
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const scopeAnchorNodeId = ref<string | null>(null)
const viewMode = ref<ViewMode>('constellation')
const graphScopeMode = ref<GraphScopeMode>('local')
const showLabels = ref(true)
const maxRenderableNodesValue = ref(40)
const entityTypeFilter = ref('FACT')
const relationTypeFilter = ref('')
const sourceTypeFilter = ref('')
const searchKeyword = ref('')
const hoverPreview = ref<{ nodeId: string; left: number; top: number } | null>(null)
const hoverPreviewLoading = ref(false)
let hoverPreviewTimer: number | null = null

const backLabel = computed(() => isWikiSpaceMode.value ? '返回 Wiki 空间' : '返回 Wiki 中心')
const scopeStatLabel = computed(() => isWikiSpaceMode.value ? '所在空间' : '所属项目')
const scopeStatValue = computed(() => isWikiSpaceMode.value ? spaceId : graph.value?.projectId ?? projectId)
const normalizeEntityType = (value?: string) => String(value || 'ENTITY').toUpperCase()
const maxRenderableNodes = computed(() => maxRenderableNodesValue.value > 0 ? maxRenderableNodesValue.value : null)

const baseNodes = computed(() => graph.value?.nodes || [])
const baseNodeIds = computed(() => new Set(baseNodes.value.map((item) => item.id)))
const baseEdges = computed(() =>
  (graph.value?.edges || []).filter((item) => baseNodeIds.value.has(item.sourceId) && baseNodeIds.value.has(item.targetId))
)

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const entityTypeOptions = computed(() => {
  const values = Array.from(new Set(baseNodes.value.map((item) => item.entityType)))
  return values.includes('FACT') ? ['FACT'] : values
})
const relationTypeOptions = computed(() => Array.from(new Set(baseEdges.value.map((item) => item.relationType))))
const sourceTypeOptions = computed(() => {
  const values = new Set<string>()
  for (const item of baseNodes.value) {
    const metadata = parseMetadata(item.metadataJson)
    const sourceType = String(metadata.sourceType || '')
    if (sourceType) values.add(sourceType)
  }
  return Array.from(values)
})

const passesNodeFilter = (item: MemoryFactNodeItem) => {
  if (entityTypeFilter.value && item.entityType !== entityTypeFilter.value) return false
  if (sourceTypeFilter.value) {
    const metadata = parseMetadata(item.metadataJson)
    if (String(metadata.sourceType || '') !== sourceTypeFilter.value) {
      return false
    }
  }
  return true
}

const filteredNodes = computed(() => baseNodes.value.filter(passesNodeFilter))
const filteredNodeIds = computed(() => new Set(filteredNodes.value.map((item) => item.id)))
const filteredEdges = computed(() =>
  baseEdges.value.filter((item) => {
    if (relationTypeFilter.value && item.relationType !== relationTypeFilter.value) return false
    if (!filteredNodeIds.value.has(item.sourceId) || !filteredNodeIds.value.has(item.targetId)) return false
    if (sourceTypeFilter.value) {
      const metadata = parseMetadata(item.metadataJson)
      if (String(metadata.sourceType || '') !== sourceTypeFilter.value) {
        return false
      }
    }
    return true
  })
)

const expandNeighborhood = (seedIds: string[], depth: number) => {
  const visited = new Set<string>(seedIds)
  let frontier = [...seedIds]
  for (let level = 0; level < depth; level++) {
    const nextFrontier: string[] = []
    for (const currentId of frontier) {
      for (const edge of filteredEdges.value) {
        if (edge.sourceId === currentId && !visited.has(edge.targetId)) {
          visited.add(edge.targetId)
          nextFrontier.push(edge.targetId)
        }
        if (edge.targetId === currentId && !visited.has(edge.sourceId)) {
          visited.add(edge.sourceId)
          nextFrontier.push(edge.sourceId)
        }
      }
    }
    frontier = nextFrontier
    if (!frontier.length) break
  }
  return visited
}

const scopedNodeIds = computed(() => {
  if (graphScopeMode.value === 'all') {
    return new Set(filteredNodes.value.map((item) => item.id))
  }
  const anchorNodeId = scopeAnchorNodeId.value && filteredNodeIds.value.has(scopeAnchorNodeId.value)
    ? scopeAnchorNodeId.value
    : filteredNodes.value[0]?.id
  return anchorNodeId ? expandNeighborhood([anchorNodeId], 1) : new Set<string>()
})

const visibleNodes = computed(() => filteredNodes.value.filter((item) => scopedNodeIds.value.has(item.id)))
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((item) => item.id)))
const visibleEdges = computed(() =>
  filteredEdges.value.filter((item) => visibleNodeIds.value.has(item.sourceId) && visibleNodeIds.value.has(item.targetId))
)

const nodeMap = computed(() => {
  const map = new Map<string, MemoryFactNodeItem>()
  for (const item of graph.value?.nodes || []) {
    map.set(item.id, item)
  }
  return map
})

const visualizationData = computed<MemoryFactVisualizationData>(() => ({
  nodes: visibleNodes.value.map((item) => {
    const metadata = parseMetadata(item.metadataJson)
    const rawColor = String(metadata.color || '')
    return {
      id: item.id,
      label: item.label,
      shortLabel: item.label.length > 18 ? `${item.label.slice(0, 18)}…` : item.label,
      entityType: item.entityType || 'ENTITY',
      degree: item.degree || 0,
      factCount: item.factCount || 0,
      color: rawColor || entityColor(item.entityType || 'ENTITY'),
      metadata
    }
  }),
  links: visibleEdges.value.map((item) => ({
    id: item.id,
    source: item.sourceId,
    target: item.targetId,
    type: item.relationType,
    width: Math.max(1, Math.min(3, Number(item.weight || 1))),
    weight: Number(item.weight || 1),
    color: relationColor(item.relationType),
    metadata: parseMetadata(item.metadataJson)
  }))
}))

const selectedNode = computed(() => visibleNodes.value.find((item) => item.id === selectedNodeId.value) || null)
const hoveredNode = computed(() => hoverPreview.value ? visibleNodes.value.find((item) => item.id === hoverPreview.value?.nodeId) || null : null)
const selectedEdgeDetail = computed<SelectedEdgeDetail | null>(() => {
  const edge = visibleEdges.value.find((item) => item.id === selectedEdgeId.value)
  if (!edge) return null
  return {
    ...edge,
    sourceLabel: nodeMap.value.get(edge.sourceId)?.label || edge.sourceId,
    targetLabel: nodeMap.value.get(edge.targetId)?.label || edge.targetId
  }
})

const combinedWarnings = computed(() => {
  const values = new Set<string>()
  for (const item of graph.value?.warnings || []) values.add(item)
  for (const item of entityDetail.value?.warnings || []) values.add(item)
  for (const item of factsResponse.value?.warnings || []) values.add(item)
  return Array.from(values)
})

const panelWarnings = computed(() => {
  const values = new Set<string>()
  for (const item of entityDetail.value?.warnings || []) values.add(item)
  for (const item of factsResponse.value?.warnings || []) values.add(item)
  return Array.from(values)
})

const panelFacts = computed(() => {
  if (selectedNode.value) {
    return entityDetail.value?.facts || []
  }
  return factsResponse.value?.facts || []
})

const hoveredEntityDetail = computed(() => {
  if (!hoveredNode.value) return null
  if (selectedNodeId.value === hoveredNode.value.id) return entityDetail.value
  return entityDetailCache.value[hoveredNode.value.id] || null
})

const hoveredFacts = computed(() => {
  if (!hoveredNode.value) return []
  if (selectedNodeId.value === hoveredNode.value.id) return panelFacts.value
  return hoveredEntityDetail.value?.facts || []
})

const hoverPreviewVisible = computed(() => Boolean(hoverPreview.value && hoveredNode.value))
const hoverPreviewStyle = computed(() => {
  if (!hoverPreview.value) return {}
  return {
    left: `${hoverPreview.value.left}px`,
    top: `${hoverPreview.value.top}px`
  }
})

const entityTypeLabel = (entityType: string) => {
  const map: Record<string, string> = {
    FACT: '事实',
    ENTITY: '实体',
    LOCATION: '地点',
    PERSON: '人物',
    ORGANIZATION: '组织',
    DOCUMENT: '文档',
    EVENT: '事件'
  }
  return map[entityType] || entityType
}

const relationTypeLabel = (relationType: string) => {
  const normalized = String(relationType || '').toLowerCase()
  const map: Record<string, string> = {
    semantic: '内容关联',
    entity: '实体关联',
    temporal: '时间关联',
    cause: '因果',
    contain: '包含',
    co_occurrence: '共现',
    relation: '关系',
    reference: '引用',
    mention: '提及'
  }
  return map[normalized] || relationType || '关系'
}

const sourceTypeLabel = (sourceType: string) => {
  const map: Record<string, string> = {
    WIKI: '知识库',
    WIKI_SPACE: '空间知识库',
    MEMORY: '记忆'
  }
  return map[sourceType] || sourceType
}

const primaryCountLabel = computed(() => {
  if (entityTypeFilter.value === 'FACT') return '事实数'
  if (entityTypeFilter.value) return `${entityTypeLabel(entityTypeFilter.value)}数`
  return '内容数'
})

const viewModeOptions = [
  { label: '星图', value: 'constellation' },
  { label: '关系图', value: 'graph' },
  { label: '表格', value: 'table' },
  { label: '时间线', value: 'timeline' }
]

const currentViewTitle = computed(() => {
  const map: Record<ViewMode, string> = {
    constellation: 'Constellation 星图',
    graph: 'Graph 关系图',
    table: 'Table 内容清单',
    timeline: 'Timeline 时间线'
  }
  return map[viewMode.value]
})

const currentViewDescription = computed(() => {
  const map: Record<ViewMode, string> = {
    constellation: '参考 Hindsight Constellation 的漂浮星图体验，适合快速看整体分布和热点。',
    graph: '基于 Hindsight Graph 的网络关系视角，适合查看节点之间的直接关联。',
    table: '将当前筛选结果整理成清单，方便产品和开发按内容逐条确认。',
    timeline: '优先展示已选内容的事实时间线，未选择时回退到关系最近变化时间。'
  }
  return map[viewMode.value]
})

const directoryLabelMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  const visit = (nodes: WikiDirectoryTreeNodeItem[], parentPath = '') => {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath} / ${node.name}` : node.name
      map[String(node.id)] = path
      visit(node.children || [], path)
    }
  }
  visit(wikiDirectoryTree.value)
  return map
})

const projectLabelMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  if (!Number.isNaN(projectId) && projectId > 0 && !isWikiSpaceMode.value && scopeName.value) {
    map[String(projectId)] = scopeName.value
  }
  if (wikiSpaceDetail.value?.boundProjectId && wikiSpaceDetail.value.boundProjectName) {
    map[String(wikiSpaceDetail.value.boundProjectId)] = wikiSpaceDetail.value.boundProjectName
  }
  const visit = (nodes: WikiDirectoryTreeNodeItem[]) => {
    for (const node of nodes) {
      if (node.boundProjectId && node.boundProjectName) {
        map[String(node.boundProjectId)] = node.boundProjectName
      }
      visit(node.children || [])
    }
  }
  visit(wikiDirectoryTree.value)
  return map
})

const loadProject = async () => {
  const project = await getProjectDetail(projectId)
  scopeName.value = project.name
}

const loadWikiSpace = async () => {
  const [space, tree] = await Promise.all([getWikiSpaceDetail(spaceId), getWikiDirectoryTree(spaceId)])
  wikiSpaceDetail.value = space
  wikiDirectoryTree.value = tree
  scopeName.value = space.name
}

const loadGraph = async () => {
  loading.value = true
  try {
    graph.value = isWikiSpaceMode.value
      ? await getWikiSpaceMemoryFactGraph(spaceId)
      : await getProjectMemoryFactGraph(projectId)
  } finally {
    loading.value = false
  }
}

const loadEntityDetail = async (entityId: string) => {
  const cached = entityDetailCache.value[entityId]
  if (cached) {
    entityDetail.value = cached
    factsResponse.value = null
    return
  }
  factsLoading.value = true
  try {
    const response = isWikiSpaceMode.value
      ? await getWikiSpaceMemoryFactGraphEntityDetail(spaceId, entityId)
      : await getProjectMemoryFactGraphEntityDetail(projectId, entityId)
    entityDetail.value = response
    entityDetailCache.value = {
      ...entityDetailCache.value,
      [entityId]: response
    }
    factsResponse.value = null
  } finally {
    factsLoading.value = false
  }
}

const loadEdgeFacts = async (edgeId: string) => {
  factsLoading.value = true
  try {
    factsResponse.value = isWikiSpaceMode.value
      ? await getWikiSpaceMemoryFactGraphFacts(spaceId, { edgeId, limit: 12 })
      : await getProjectMemoryFactGraphFacts(projectId, { edgeId, limit: 12 })
    entityDetail.value = null
  } finally {
    factsLoading.value = false
  }
}

const handleSelectNode = async (id: string) => {
  selectedNodeId.value = id
  selectedEdgeId.value = null
  await loadEntityDetail(id)
}

const handleHoverPreviewNode = ({ id, x, y }: { id: string; x: number; y: number }) => {
  const host = viewStageRef.value
  if (!host) {
    hoverPreview.value = { nodeId: id, left: 24, top: 24 }
    return
  }
  const previewWidth = 420
  const previewHeight = 300
  const offset = 18
  const stageWidth = host.clientWidth
  const stageHeight = host.clientHeight
  const placeLeft = x + offset + previewWidth <= stageWidth
  const nextLeft = placeLeft ? x + offset : Math.max(16, x - previewWidth - offset)
  const nextTop = Math.min(Math.max(16, y - 46), Math.max(16, stageHeight - previewHeight - 16))
  hoverPreview.value = {
    nodeId: id,
    left: nextLeft,
    top: nextTop
  }
  if (selectedNodeId.value === id || entityDetailCache.value[id]) {
    hoverPreviewLoading.value = false
    return
  }
  hoverPreviewLoading.value = true
  if (hoverPreviewTimer !== null) {
    window.clearTimeout(hoverPreviewTimer)
  }
  hoverPreviewTimer = window.setTimeout(async () => {
    try {
      const response = isWikiSpaceMode.value
        ? await getWikiSpaceMemoryFactGraphEntityDetail(spaceId, id)
        : await getProjectMemoryFactGraphEntityDetail(projectId, id)
      entityDetailCache.value = {
        ...entityDetailCache.value,
        [id]: response
      }
    } catch {
      // 悬停预览失败时只回退为基础信息卡片，不打断主流程。
    } finally {
      if (hoverPreview.value?.nodeId === id) {
        hoverPreviewLoading.value = false
      }
    }
  }, 180)
}

const clearHoverPreview = () => {
  hoverPreview.value = null
  hoverPreviewLoading.value = false
  if (hoverPreviewTimer !== null) {
    window.clearTimeout(hoverPreviewTimer)
    hoverPreviewTimer = null
  }
}

const handleSelectEdge = async (id: string) => {
  selectedEdgeId.value = id
  selectedNodeId.value = null
  await loadEdgeFacts(id)
}

const clearSelection = () => {
  selectedNodeId.value = null
  selectedEdgeId.value = null
  entityDetail.value = null
  factsResponse.value = null
  clearHoverPreview()
}

const handleSearch = async () => {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    return
  }
  const matchedNode = baseNodes.value.find((item) => item.label.toLowerCase().includes(keyword.toLowerCase()))
  if (matchedNode) {
    scopeAnchorNodeId.value = matchedNode.id
    await handleSelectNode(matchedNode.id)
    return
  }
  factsLoading.value = true
  try {
    factsResponse.value = isWikiSpaceMode.value
      ? await getWikiSpaceMemoryFactGraphFacts(spaceId, { query: keyword, limit: 12 })
      : await getProjectMemoryFactGraphFacts(projectId, { query: keyword, limit: 12 })
    entityDetail.value = null
    selectedNodeId.value = null
    selectedEdgeId.value = null
    viewMode.value = 'timeline'
  } finally {
    factsLoading.value = false
  }
}

const goBack = () => {
  if (isWikiSpaceMode.value) {
    router.push({ name: 'wiki-space', params: { spaceId } })
    return
  }
  const query = Number.isNaN(projectId) || projectId <= 0 ? undefined : { projectId }
  router.push({ name: 'wiki-home', query })
}

const hostLayoutMainClass = 'memory-fact-route-main'
const hostLayoutShellClass = 'memory-fact-route-shell'

const syncHostLayout = () => {
  const root = pageRootRef.value
  if (!root) return
  root.closest('.layout-main')?.classList.add(hostLayoutMainClass)
  root.closest('.layout-main-shell')?.classList.add(hostLayoutShellClass)
}

const clearHostLayout = () => {
  const root = pageRootRef.value
  if (!root) return
  root.closest('.layout-main')?.classList.remove(hostLayoutMainClass)
  root.closest('.layout-main-shell')?.classList.remove(hostLayoutShellClass)
}

watch(
  () => graph.value,
  async (value) => {
    const nodes = value?.nodes || []
    if (!nodes.length) {
      scopeAnchorNodeId.value = null
      clearSelection()
      return
    }
    if (nodes.some((item) => normalizeEntityType(item.entityType) === 'FACT')) {
      entityTypeFilter.value = 'FACT'
    } else if (entityTypeFilter.value === 'FACT') {
      entityTypeFilter.value = ''
    }
    const firstNode = nodes[0]
    if (!firstNode) return
    if (!scopeAnchorNodeId.value || !nodes.some((item) => item.id === scopeAnchorNodeId.value)) {
      scopeAnchorNodeId.value = firstNode.id
    }
    if (!selectedNodeId.value && !selectedEdgeId.value) {
      await handleSelectNode(firstNode.id)
    }
  },
  { immediate: true }
)

watch([entityTypeFilter, relationTypeFilter, sourceTypeFilter, graphScopeMode], () => {
  if (scopeAnchorNodeId.value && !filteredNodes.value.some((item) => item.id === scopeAnchorNodeId.value)) {
    scopeAnchorNodeId.value = filteredNodes.value[0]?.id || null
  }
  if (selectedNodeId.value && !visibleNodes.value.some((item) => item.id === selectedNodeId.value)) {
    clearSelection()
  }
  if (selectedEdgeId.value && !visibleEdges.value.some((item) => item.id === selectedEdgeId.value)) {
    clearSelection()
  }
})

watch([selectedNodeId, selectedEdgeId], ([nextNodeId, nextEdgeId]) => {
  if (!nextNodeId && !nextEdgeId) {
    clearHoverPreview()
  }
})

watch(viewMode, (nextValue) => {
  if (nextValue !== 'constellation' && nextValue !== 'graph') {
    clearHoverPreview()
  }
})

onMounted(async () => {
  await nextTick()
  syncHostLayout()
  const invalidScope = isWikiSpaceMode.value
    ? Number.isNaN(spaceId) || spaceId <= 0
    : Number.isNaN(projectId) || projectId <= 0
  if (invalidScope) {
    ElMessage.error(isWikiSpaceMode.value ? 'Wiki 空间参数不正确' : '项目参数不正确')
    goBack()
    return
  }
  try {
    await Promise.all([isWikiSpaceMode.value ? loadWikiSpace() : loadProject(), loadGraph()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载记忆事实图失败')
  }
})

onBeforeUnmount(() => {
  clearHoverPreview()
  clearHostLayout()
})
</script>

<style scoped>
:global(.layout-main-shell.memory-fact-route-shell) {
  height: 100%;
  min-height: 0;
}

:global(.layout-main.memory-fact-route-main) {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding-top: 14px;
  padding-bottom: 14px;
  overflow: hidden;
}

:global(.layout-main.memory-fact-route-main > *) {
  height: 100%;
  min-height: 0;
}

.memory-fact-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  gap: 12px;
}

.page-header,
.section-header,
.stats-grid,
.warning-list {
  display: flex;
}

.page-header,
.section-header {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-headline {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-title {
  margin-top: 0;
  font-size: 20px;
  font-weight: 800;
  color: #17324c;
}

.view-mode-switch {
  margin-right: 2px;
}

.toolbar-card :deep(.el-card__body) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.warning-list {
  margin-top: 6px;
  flex-direction: column;
  gap: 6px;
}

.warning-list :deep(.el-alert) {
  padding-top: 6px;
  padding-bottom: 6px;
}

.stats-grid {
  margin-top: 6px;
  gap: 8px;
  flex-wrap: wrap;
}

.stat-card {
  min-width: 120px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(206, 217, 226, 0.92);
  background: linear-gradient(135deg, rgba(248, 251, 255, 0.98) 0%, rgba(238, 244, 251, 0.98) 100%);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  color: #6b7f91;
  font-size: 12px;
  line-height: 1.45;
}

.stat-card strong {
  color: #17324c;
  font-size: 15px;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.45fr) minmax(320px, 0.78fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
  align-items: start;
}

.graph-card,
.detail-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.graph-card :deep(.el-card__body),
.detail-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.graph-card :deep(.el-card__body) {
  padding-top: 8px;
}

.detail-card :deep(.el-card__body) {
  padding-top: 8px;
}

.section-header-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.section-header-copy span,
.detail-card .section-header span {
  color: #17324c;
  font-size: 20px;
  font-weight: 800;
}

.section-header-copy small {
  color: #6b7f91;
  font-size: 12px;
  line-height: 1.45;
}

.view-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.graph-preview-layer {
  position: absolute;
  z-index: 10;
  pointer-events: none;
}

.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

@media (max-width: 1280px) {
  .main-grid {
    grid-template-columns: 1fr;
  }

  .graph-card,
  .detail-card {
    height: 100%;
  }

  .detail-scroll {
    overflow: visible;
    padding-right: 0;
  }
}
</style>
