<template>
  <div class="memory-fact-page">
    <el-card class="page-card" shadow="never">
      <div class="page-header">
        <div>
          <el-button text @click="goBack">{{ backLabel }}</el-button>
          <div class="page-title">{{ scopeName || '记忆事实图' }}</div>
          <div class="page-subtitle">{{ pageSubtitle }}</div>
        </div>
        <el-space wrap>
          <el-select v-model="layoutMode" style="width: 160px">
            <el-option label="聚簇" value="cluster" />
            <el-option label="环形" value="ring" />
            <el-option label="网格" value="grid" />
          </el-select>
          <el-select v-model="entityTypeFilter" clearable placeholder="筛选实体类型" style="width: 180px">
            <el-option v-for="item in entityTypeOptions" :key="item" :label="entityTypeLabel(item)" :value="item" />
          </el-select>
          <el-select v-model="relationTypeFilter" clearable placeholder="筛选关系类型" style="width: 180px">
            <el-option v-for="item in relationTypeOptions" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="sourceTypeFilter" clearable placeholder="筛选来源" style="width: 160px">
            <el-option v-for="item in sourceTypeOptions" :key="item" :label="sourceTypeLabel(item)" :value="item" />
          </el-select>
          <el-input
            v-model="searchKeyword"
            placeholder="搜索实体名或事实"
            style="width: 220px"
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
          <span class="stat-label">节点数</span>
          <strong>{{ visibleNodes.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">边数</span>
          <strong>{{ visibleEdges.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">事实估算</span>
          <strong>{{ graph?.factCount ?? 0 }}</strong>
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
            <span>图谱视图</span>
            <el-space wrap>
              <el-tag type="info">{{ visibleNodes.length }} 个实体</el-tag>
              <el-tag type="info">{{ visibleEdges.length }} 条关系</el-tag>
            </el-space>
          </div>
        </template>

        <MemoryFactGraphCanvas
          :nodes="visibleNodes"
          :edges="visibleEdges"
          :layout-mode="layoutMode"
          :selected-node-id="selectedNodeId"
          :selected-edge-id="selectedEdgeId"
          @select-node="handleSelectNode"
          @select-edge="handleSelectEdge"
          @clear-selection="clearSelection"
        />
      </el-card>

      <el-card class="page-card detail-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>详情面板</span>
            <el-tag v-if="selectedNode" type="primary">{{ entityTypeLabel(selectedNode.entityType) }}</el-tag>
            <el-tag v-else-if="selectedEdgeDetail" type="info">{{ selectedEdgeDetail.relationType }}</el-tag>
          </div>
        </template>

        <MemoryFactPanel
          :selected-node="selectedNode"
          :selected-edge="selectedEdgeDetail"
          :entity-detail="entityDetail"
          :facts="panelFacts"
          :facts-loading="factsLoading"
          :warnings="panelWarnings"
        />
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import {
  getProjectDetail,
  getProjectMemoryFactGraph,
  getProjectMemoryFactGraphEntityDetail,
  getProjectMemoryFactGraphFacts,
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
  MemoryFactNodeItem
} from '@/types/platform'

type LayoutMode = 'cluster' | 'ring' | 'grid'

interface SelectedEdgeDetail extends MemoryFactEdgeItem {
  sourceLabel: string
  targetLabel: string
}

const MemoryFactGraphCanvas = defineAsyncComponent(() => import('@/components/MemoryFactGraphCanvas.vue'))
const MemoryFactPanel = defineAsyncComponent(() => import('@/components/MemoryFactPanel.vue'))

const route = useRoute()
const router = useRouter()
const projectId = Number(route.params.projectId)
const spaceId = Number(route.params.spaceId)
const isWikiSpaceMode = computed(() => route.name === 'wiki-space-memory-fact-graph')
const scopeName = ref('')
const graph = ref<MemoryFactGraphItem | null>(null)
const entityDetail = ref<MemoryFactEntityDetailItem | null>(null)
const factsResponse = ref<MemoryFactFactsResponseItem | null>(null)
const loading = ref(false)
const factsLoading = ref(false)
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const layoutMode = ref<LayoutMode>('cluster')
const entityTypeFilter = ref('')
const relationTypeFilter = ref('')
const sourceTypeFilter = ref('')
const searchKeyword = ref('')

const backLabel = computed(() => isWikiSpaceMode.value ? '返回 Wiki 空间' : '返回 Wiki 中心')
const pageSubtitle = computed(() =>
  isWikiSpaceMode.value
    ? '图结构来自当前 Wiki 空间的 Hindsight 实体关系，右侧面板展示实体观察与事实证据。'
    : '图结构来自 Hindsight 实体关系，右侧面板展示实体观察与事实证据。'
)
const scopeStatLabel = computed(() => isWikiSpaceMode.value ? 'Wiki 空间' : '项目')
const scopeStatValue = computed(() => isWikiSpaceMode.value ? spaceId : graph.value?.projectId ?? projectId)

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const entityTypeOptions = computed(() => Array.from(new Set((graph.value?.nodes || []).map((item) => item.entityType))))
const relationTypeOptions = computed(() => Array.from(new Set((graph.value?.edges || []).map((item) => item.relationType))))
const sourceTypeOptions = computed(() => {
  const values = new Set<string>()
  for (const item of graph.value?.nodes || []) {
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

const visibleNodes = computed(() => (graph.value?.nodes || []).filter(passesNodeFilter))
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((item) => item.id)))
const visibleEdges = computed(() =>
  (graph.value?.edges || []).filter((item) => {
    if (relationTypeFilter.value && item.relationType !== relationTypeFilter.value) return false
    if (!visibleNodeIds.value.has(item.sourceId) || !visibleNodeIds.value.has(item.targetId)) return false
    if (sourceTypeFilter.value) {
      const metadata = parseMetadata(item.metadataJson)
      if (String(metadata.sourceType || '') !== sourceTypeFilter.value) {
        return false
      }
    }
    return true
  })
)

const nodeMap = computed(() => {
  const map = new Map<string, MemoryFactNodeItem>()
  for (const item of graph.value?.nodes || []) {
    map.set(item.id, item)
  }
  return map
})

const selectedNode = computed(() => visibleNodes.value.find((item) => item.id === selectedNodeId.value) || null)
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

const entityTypeLabel = (entityType: string) => {
  const map: Record<string, string> = {
    ENTITY: '实体',
    LOCATION: '地点',
    PERSON: '人物',
    ORGANIZATION: '组织',
    DOCUMENT: '文档',
    EVENT: '事件'
  }
  return map[entityType] || entityType
}

const sourceTypeLabel = (sourceType: string) => {
  const map: Record<string, string> = {
    WIKI: 'Wiki',
    WIKI_SPACE: '空间 Wiki',
    MEMORY: '记忆'
  }
  return map[sourceType] || sourceType
}

const loadProject = async () => {
  const project = await getProjectDetail(projectId)
  scopeName.value = project.name
}

const loadWikiSpace = async () => {
  const space = await getWikiSpaceDetail(spaceId)
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
  factsLoading.value = true
  try {
    entityDetail.value = isWikiSpaceMode.value
      ? await getWikiSpaceMemoryFactGraphEntityDetail(spaceId, entityId)
      : await getProjectMemoryFactGraphEntityDetail(projectId, entityId)
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
}

const handleSearch = async () => {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    return
  }
  const matchedNode = (graph.value?.nodes || []).find((item) => item.label.toLowerCase().includes(keyword.toLowerCase()))
  if (matchedNode) {
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

watch(
  () => graph.value,
  async (value) => {
    if (!value?.nodes.length) {
      clearSelection()
      return
    }
    const firstNode = value.nodes[0]
    if (!firstNode) {
      return
    }
    if (!selectedNodeId.value && !selectedEdgeId.value) {
      await handleSelectNode(firstNode.id)
    }
  },
  { immediate: true }
)

watch([entityTypeFilter, relationTypeFilter, sourceTypeFilter], () => {
  if (selectedNodeId.value && !visibleNodes.value.some((item) => item.id === selectedNodeId.value)) {
    clearSelection()
  }
  if (selectedEdgeId.value && !visibleEdges.value.some((item) => item.id === selectedEdgeId.value)) {
    clearSelection()
  }
})

onMounted(async () => {
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
</script>

<style scoped>
.memory-fact-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  gap: 16px;
}

.page-title {
  margin-top: 4px;
  font-size: 24px;
  font-weight: 800;
  color: #17324c;
}

.page-subtitle,
.stat-label {
  color: #6b7f91;
  font-size: 13px;
}

.warning-list {
  margin-top: 16px;
  flex-direction: column;
  gap: 10px;
}

.stats-grid {
  margin-top: 18px;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-card {
  min-width: 150px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(206, 217, 226, 0.92);
  background: linear-gradient(135deg, rgba(248, 251, 255, 0.98) 0%, rgba(238, 244, 251, 0.98) 100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-card strong {
  color: #17324c;
  font-size: 20px;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(340px, 0.95fr);
  gap: 16px;
}

.graph-card,
.detail-card {
  min-height: 0;
}

@media (max-width: 1280px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}
</style>
