<template>
  <div ref="pageRootRef" class="memory-fact-page">
    <el-card class="page-card toolbar-card" shadow="never">
      <div class="page-header">
        <div class="page-headline">
          <button class="memory-back-link" type="button" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            <span>{{ backLabel }}</span>
          </button>
        </div>
        <div class="memory-toolbar-shell">
          <div class="management-list-toolbar-main memory-toolbar-main">
            <div class="management-list-search-shell memory-search-shell">
              <el-icon class="management-list-search-icon"><Search /></el-icon>
              <input
                v-model="searchKeyword"
                class="management-list-search-input"
                type="text"
                placeholder="搜索内容或关键词..."
                @keyup.enter="handleSearch"
              />
            </div>
            <span class="management-list-toolbar-divider" aria-hidden="true"></span>
            <el-popover
              v-model:visible="filterPopoverVisible"
              trigger="click"
              placement="bottom-start"
              :width="340"
              popper-class="management-list-popper"
            >
              <template #reference>
                <button class="management-list-toolbar-button" type="button">
                  <el-icon><Filter /></el-icon>
                  <span>{{ activeFilterCount > 0 ? `筛选（${activeFilterCount}）` : '筛选' }}</span>
                </button>
              </template>

              <div class="management-list-filter-panel management-list-compact-input memory-filter-panel">
                <div class="management-list-filter-field">
                  <label>图谱范围</label>
                  <el-select v-model="graphScopeMode" style="width: 100%" :teleported="false">
                    <el-option label="当前周边" value="local" />
                    <el-option label="全部内容" value="all" />
                  </el-select>
                </div>
                <div class="management-list-filter-field">
                  <label>显示多少内容</label>
                  <el-select v-model="maxRenderableNodesValue" style="width: 100%" :teleported="false">
                    <el-option label="少一点（20 个）" :value="20" />
                    <el-option label="适中（40 个）" :value="40" />
                    <el-option label="多一点（80 个）" :value="80" />
                    <el-option label="全部显示" :value="0" />
                  </el-select>
                </div>
                <div class="management-list-filter-field">
                  <label>内容类型</label>
                  <el-select v-model="entityTypeFilter" clearable placeholder="筛选内容类型" style="width: 100%" :teleported="false">
                    <el-option v-for="item in entityTypeOptions" :key="item" :label="entityTypeLabel(item)" :value="item" />
                  </el-select>
                </div>
                <div class="management-list-filter-field">
                  <label>关系类型</label>
                  <el-select v-model="relationTypeFilter" clearable placeholder="筛选关系类型" style="width: 100%" :teleported="false">
                    <el-option v-for="item in relationTypeOptions" :key="item" :label="relationTypeLabel(item)" :value="item" />
                  </el-select>
                </div>
                <div class="management-list-filter-field">
                  <label>来源</label>
                  <el-select v-model="sourceTypeFilter" clearable placeholder="筛选来源" style="width: 100%" :teleported="false">
                    <el-option v-for="item in sourceTypeOptions" :key="item" :label="sourceTypeLabel(item)" :value="item" />
                  </el-select>
                </div>
                <div class="management-list-filter-field">
                  <label>标签显示</label>
                  <div class="memory-filter-switch-row">
                    <span>{{ showLabels ? '当前显示标签' : '当前隐藏标签' }}</span>
                    <el-switch v-model="showLabels" />
                  </div>
                </div>
                <div class="management-list-filter-actions">
                  <el-button type="primary" @click="closeFilterPopover">完成</el-button>
                  <el-button @click="handleResetFilters">重置</el-button>
                </div>
              </div>
            </el-popover>
            <button class="management-list-toolbar-button" type="button" :disabled="searchSubmitting" @click="handleSearch">
              <el-icon><Search /></el-icon>
              <span>{{ searchSubmitting ? '搜索中...' : '搜索' }}</span>
            </button>
            <button class="management-list-toolbar-button" type="button" @click="handleResetFilters">
              <el-icon><RefreshRight /></el-icon>
              <span>重置</span>
            </button>
            <button class="management-list-toolbar-button" type="button" :disabled="loading" @click="loadGraph">
              <el-icon><RefreshRight /></el-icon>
              <span>{{ loading ? '刷新中...' : '刷新' }}</span>
            </button>
          </div>
        </div>
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

    </el-card>

    <div class="main-grid">
      <el-card class="page-card graph-card" shadow="never">
        <template #header>
          <div class="section-header">
            <div class="section-header-copy">
              <span>{{ currentViewTitle }}</span>
            </div>
            <div class="graph-header-actions">
              <el-segmented
                v-model="viewMode"
                :options="viewModeOptions"
                class="view-mode-switch"
              />
            </div>
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
            :facts="tableFacts"
            :facts-loading="tableFactsLoading"
            :selected-fact-id="selectedTableFactId"
            @select-fact="handleSelectTableFact"
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
            :selected-fact="selectedTableFact"
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
import { ArrowLeft, Filter, RefreshRight, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
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
  MemoryFactItem,
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
const appStore = useAppStore()
const pageRootRef = ref<HTMLElement | null>(null)
const viewStageRef = ref<HTMLElement | null>(null)
const projectId = Number(route.params.projectId)
const spaceId = Number(route.params.spaceId)
const isWikiSpaceMode = computed(() => route.name === 'wiki-space-memory-fact-graph')
const pageRouteName = computed(() => String(route.name || ''))
const scopeName = ref('')
const wikiSpaceDetail = ref<WikiSpaceDetailItem | null>(null)
const wikiDirectoryTree = ref<WikiDirectoryTreeNodeItem[]>([])
const graph = ref<MemoryFactGraphItem | null>(null)
const entityDetail = ref<MemoryFactEntityDetailItem | null>(null)
const factsResponse = ref<MemoryFactFactsResponseItem | null>(null)
const tableFactsResponse = ref<MemoryFactFactsResponseItem | null>(null)
const entityDetailCache = ref<Record<string, MemoryFactEntityDetailItem>>({})
const loading = ref(false)
const factsLoading = ref(false)
const tableFactsLoading = ref(false)
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const selectedTableFactId = ref<string | null>(null)
const scopeAnchorNodeId = ref<string | null>(null)
const viewMode = ref<ViewMode>('constellation')
// 与 Hindsight 首屏保持一致，默认先展示当前空间的整张事实图，
// 避免进入详情页后被首个锚点自动收窄成局部子图。
const graphScopeMode = ref<GraphScopeMode>('all')
const showLabels = ref(true)
// Hindsight 首屏在节点较多时默认先看一屏可读范围，这里用 20 作为默认值对齐它的 Graph 行为。
const maxRenderableNodesValue = ref(20)
const entityTypeFilter = ref('FACT')
const relationTypeFilter = ref('')
const sourceTypeFilter = ref('')
const searchKeyword = ref('')
const filterPopoverVisible = ref(false)
const searchSubmitting = ref(false)
const hoverPreview = ref<{ nodeId: string; left: number; top: number } | null>(null)
const hoverPreviewLoading = ref(false)

const backLabel = computed(() => isWikiSpaceMode.value ? '返回 Wiki 空间' : '返回 Wiki 中心')
const normalizeEntityType = (value?: string) => String(value || 'ENTITY').toUpperCase()
const maxRenderableNodes = computed(() => maxRenderableNodesValue.value > 0 ? maxRenderableNodesValue.value : null)

const baseNodes = computed(() => graph.value?.nodes || [])
const baseNodeIds = computed(() => new Set(baseNodes.value.map((item) => item.id)))
const baseEdges = computed(() =>
  (graph.value?.edges || []).filter((item) => baseNodeIds.value.has(item.sourceId) && baseNodeIds.value.has(item.targetId))
)
const defaultEntityTypeFilter = computed(() =>
  baseNodes.value.some((item) => normalizeEntityType(item.entityType) === 'FACT') ? 'FACT' : ''
)
const activeFilterCount = computed(() => {
  let count = 0
  if (graphScopeMode.value !== 'all') count += 1
  if (maxRenderableNodesValue.value !== 20) count += 1
  if (entityTypeFilter.value !== defaultEntityTypeFilter.value) count += 1
  if (relationTypeFilter.value) count += 1
  if (sourceTypeFilter.value) count += 1
  if (!showLabels.value) count += 1
  return count
})

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

const asStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const normalizeKeyword = (value?: string) => String(value || '').trim().toLowerCase()

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
const visibleFactIds = computed(() => {
  const values = new Set<string>()
  visibleEdges.value.forEach((item) => {
    ;(item.factIds || []).forEach((factId) => {
      if (factId) values.add(factId)
    })
  })
  return values
})
const visibleNodeKeywords = computed(() => {
  const values = new Set<string>()
  visibleNodes.value.forEach((item) => {
    values.add(normalizeKeyword(item.label))
    ;(item.aliases || []).forEach((alias) => values.add(normalizeKeyword(alias)))
  })
  values.delete('')
  return values
})

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
  for (const item of tableFactsResponse.value?.warnings || []) values.add(item)
  return Array.from(values)
})

const panelWarnings = computed(() => {
  const values = new Set<string>()
  for (const item of entityDetail.value?.warnings || []) values.add(item)
  for (const item of factsResponse.value?.warnings || []) values.add(item)
  for (const item of tableFactsResponse.value?.warnings || []) values.add(item)
  return Array.from(values)
})

const extractFactEntities = (item: MemoryFactItem) => {
  const metadata = parseMetadata(item.metadataJson)
  const sourceFact = metadata.sourceFact && typeof metadata.sourceFact === 'object'
    ? metadata.sourceFact as Record<string, unknown>
    : null
  const rawEntityValues = [
    ...asStringList(sourceFact?.entities),
    ...asStringList(metadata.entities),
    ...asStringList((metadata.raw as Record<string, unknown> | undefined)?.entities),
    item.subject,
    item.object
  ]
  const values = new Set<string>()
  rawEntityValues
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => values.add(value))
  return Array.from(values)
}

const factSourceType = (item: MemoryFactItem) => {
  const metadata = parseMetadata(item.metadataJson)
  return String(metadata.sourceType || item.sourceType || '')
}

const matchesFactVisibleScope = (item: MemoryFactItem) => {
  if (visibleFactIds.value.has(item.id)) {
    return true
  }
  const entityNames = extractFactEntities(item)
  if (entityNames.some((name) => visibleNodeKeywords.value.has(normalizeKeyword(name)))) {
    return true
  }
  const haystack = normalizeKeyword(`${item.summary} ${item.subject} ${item.predicate} ${item.object}`)
  for (const keyword of visibleNodeKeywords.value) {
    if (keyword && haystack.includes(keyword)) {
      return true
    }
  }
  return false
}

const tableFacts = computed(() => {
  const items = tableFactsResponse.value?.facts || []
  return items.filter((item) => {
    if (entityTypeFilter.value && entityTypeFilter.value !== 'FACT') {
      return false
    }
    if (sourceTypeFilter.value && factSourceType(item) !== sourceTypeFilter.value) {
      return false
    }
    if (relationTypeFilter.value && !visibleFactIds.value.has(item.id)) {
      return false
    }
    if (graphScopeMode.value !== 'all' && !matchesFactVisibleScope(item)) {
      return false
    }
    return true
  })
})
const selectedTableFact = computed(() =>
  tableFacts.value.find((item) => item.id === selectedTableFactId.value) || null
)

const panelFacts = computed(() => {
  if (selectedTableFact.value) {
    return [selectedTableFact.value]
  }
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

const syncGlobalPageTitle = (title?: string | null) => {
  const nextTitle = String(title || '').trim()
  if (!nextTitle) {
    return
  }
  appStore.setDynamicPageTitle(nextTitle, pageRouteName.value)
}

const loadProject = async () => {
  const project = await getProjectDetail(projectId)
  scopeName.value = project.name
  syncGlobalPageTitle(project.name)
}

const loadWikiSpace = async () => {
  const [space, tree] = await Promise.all([getWikiSpaceDetail(spaceId), getWikiDirectoryTree(spaceId)])
  wikiSpaceDetail.value = space
  wikiDirectoryTree.value = tree
  scopeName.value = space.name
  syncGlobalPageTitle(space.name)
}

const loadGraph = async () => {
  loading.value = true
  tableFactsResponse.value = null
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
  selectedTableFactId.value = null
  await loadEntityDetail(id)
}

const handleHoverPreviewNode = ({ id, x, y }: { id: string; x: number; y: number }) => {
  const host = viewStageRef.value
  if (!host) {
    hoverPreview.value = { nodeId: id, left: 24, top: 24 }
    hoverPreviewLoading.value = false
    return
  }
  const previewWidth = 360
  const previewHeight = 220
  const offset = 18
  const safePadding = 16
  const stageWidth = host.clientWidth
  const stageHeight = host.clientHeight

  const clampPosition = (left: number, top: number) => {
    const maxLeft = Math.max(safePadding, stageWidth - previewWidth - safePadding)
    const maxTop = Math.max(safePadding, stageHeight - previewHeight - safePadding)
    return {
      left: Math.min(Math.max(safePadding, left), maxLeft),
      top: Math.min(Math.max(safePadding, top), maxTop)
    }
  }

  /**
   * 星图上的节点标题会在节点右侧展开，这里把该区域当成避让框，
   * 让悬停卡片优先尝试放到左侧/上下方，尽量不要把当前节点标题盖住。
   */
  const avoidRect = {
    left: Math.max(0, x - 28),
    top: Math.max(0, y - 42),
    right: Math.min(stageWidth, x + 236),
    bottom: Math.min(stageHeight, y + 58)
  }

  const overlapArea = (left: number, top: number) => {
    const right = left + previewWidth
    const bottom = top + previewHeight
    const overlapWidth = Math.max(0, Math.min(right, avoidRect.right) - Math.max(left, avoidRect.left))
    const overlapHeight = Math.max(0, Math.min(bottom, avoidRect.bottom) - Math.max(top, avoidRect.top))
    return overlapWidth * overlapHeight
  }

  const candidates = [
    { left: x - previewWidth - offset, top: y - 46 },
    { left: x - previewWidth * 0.18, top: y + offset },
    { left: x - previewWidth * 0.18, top: y - previewHeight - offset },
    { left: x + offset, top: y - 46 },
    { left: x + offset, top: y - previewHeight + 34 },
    { left: x - previewWidth - offset, top: y - previewHeight + 34 }
  ]

  const bestPlacement = candidates
    .map((candidate, index) => {
      const clamped = clampPosition(candidate.left, candidate.top)
      const clampDrift = Math.abs(clamped.left - candidate.left) + Math.abs(clamped.top - candidate.top)
      return {
        ...clamped,
        score: overlapArea(clamped.left, clamped.top) * 100 + clampDrift + index * 4
      }
    })
    .sort((left, right) => left.score - right.score)[0]

  hoverPreview.value = {
    nodeId: id,
    left: bestPlacement.left,
    top: bestPlacement.top
  }
  hoverPreviewLoading.value = false
}

const clearHoverPreview = () => {
  hoverPreview.value = null
  hoverPreviewLoading.value = false
}

const handleSelectEdge = async (id: string) => {
  selectedEdgeId.value = id
  selectedNodeId.value = null
  selectedTableFactId.value = null
  await loadEdgeFacts(id)
}

const loadTableFacts = async (force = false) => {
  if (!force && tableFactsResponse.value) {
    return
  }
  tableFactsLoading.value = true
  try {
    tableFactsResponse.value = isWikiSpaceMode.value
      ? await getWikiSpaceMemoryFactGraphFacts(spaceId, { limit: 200 })
      : await getProjectMemoryFactGraphFacts(projectId, { limit: 200 })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载表格事实失败')
  } finally {
    tableFactsLoading.value = false
  }
}

const handleSelectTableFact = (item: MemoryFactItem) => {
  selectedTableFactId.value = item.id
  selectedNodeId.value = null
  selectedEdgeId.value = null
  entityDetail.value = null
  factsResponse.value = null
  clearHoverPreview()
}

const clearSelection = () => {
  selectedNodeId.value = null
  selectedEdgeId.value = null
  selectedTableFactId.value = null
  entityDetail.value = null
  factsResponse.value = null
  clearHoverPreview()
}

const closeFilterPopover = () => {
  filterPopoverVisible.value = false
}

const handleResetFilters = () => {
  graphScopeMode.value = 'all'
  maxRenderableNodesValue.value = 20
  showLabels.value = true
  entityTypeFilter.value = defaultEntityTypeFilter.value
  relationTypeFilter.value = ''
  sourceTypeFilter.value = ''
  searchKeyword.value = ''
  clearSelection()
  filterPopoverVisible.value = false
}

const handleSearch = async () => {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    return
  }
  try {
    searchSubmitting.value = true
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
      selectedTableFactId.value = null
      viewMode.value = 'timeline'
    } finally {
      factsLoading.value = false
    }
  } finally {
    searchSubmitting.value = false
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
    if (!entityTypeFilter.value || entityTypeFilter.value === 'FACT') {
      entityTypeFilter.value = defaultEntityTypeFilter.value
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
  if (selectedTableFactId.value && !tableFacts.value.some((item) => item.id === selectedTableFactId.value)) {
    selectedTableFactId.value = null
  }
})

watch([selectedNodeId, selectedEdgeId], ([nextNodeId, nextEdgeId]) => {
  if (!nextNodeId && !nextEdgeId) {
    clearHoverPreview()
  }
})

watch(viewMode, async (nextValue) => {
  if (nextValue === 'table') {
    await loadTableFacts()
  }
  if (nextValue !== 'constellation' && nextValue !== 'graph') {
    clearHoverPreview()
  }
})

watch(
  () => graph.value?.generatedAt,
  async () => {
    if (viewMode.value === 'table') {
      await loadTableFacts(true)
    }
  }
)

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
  appStore.clearDynamicPageTitle(pageRouteName.value)
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
  align-items: center;
  justify-content: center;
  flex: 0 0 168px;
  min-width: 168px;
}

.memory-back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #516072;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.memory-back-link .el-icon {
  font-size: 15px;
}

.memory-back-link:hover {
  color: var(--app-primary);
}

.memory-toolbar-shell {
  display: flex;
  flex: 1 1 auto;
  justify-content: flex-end;
  min-width: 0;
}

.memory-toolbar-main {
  width: 100%;
  max-width: 100%;
  flex-wrap: wrap;
  justify-self: auto;
  box-sizing: border-box;
}

.memory-search-shell {
  flex: 1 1 260px;
  width: auto;
  max-width: min(360px, 100%);
}

.memory-toolbar-main .management-list-toolbar-button:disabled {
  opacity: 0.64;
  cursor: not-allowed;
}

.memory-filter-panel {
  min-width: 0;
}

.memory-filter-switch-row {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
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

.graph-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
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
  will-change: transform, opacity;
  transition: opacity 120ms ease;
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

@media (max-width: 1480px) {
  .page-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .page-headline {
    flex: 0 0 auto;
    width: auto;
    min-width: fit-content;
    justify-content: flex-start;
  }

  .memory-toolbar-shell {
    flex: 1 1 720px;
    width: auto;
  }
}

@media (max-width: 960px) {
  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .memory-toolbar-main {
    gap: 10px;
    padding: 10px 12px;
  }

  .memory-search-shell {
    flex-basis: 100%;
    width: 100%;
    max-width: none;
  }

  .memory-toolbar-main .management-list-toolbar-divider {
    display: none;
  }

  .graph-header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
