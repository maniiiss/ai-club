<template>
  <div class="wiki-graph-page">
    <el-card class="page-card" shadow="never">
      <div class="page-header">
        <div>
          <el-button text @click="goBack">返回空间</el-button>
          <div class="page-title">{{ graph?.spaceName || 'Wiki 知识图谱' }}</div>
          <div class="page-subtitle">
            把当前空间的向量化数据在页面层聚合，展示目录归属结构与页面间向量语义相似关联，帮助快速发现内容聚簇与重复。
          </div>
        </div>
        <el-space wrap>
          <el-select v-model="layoutMode" style="width: 150px">
            <el-option v-for="item in layoutOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <div class="threshold-control">
            <span class="threshold-label">相似度阈值 {{ similarityThreshold.toFixed(2) }}</span>
            <el-slider
              v-model="similarityThreshold"
              :min="0.5"
              :max="0.99"
              :step="0.01"
              :show-tooltip="false"
              style="width: 180px"
            />
          </div>
          <el-button :loading="loading" @click="loadGraph">刷新数据</el-button>
        </el-space>
      </div>

      <el-alert
        v-if="graph && !graph.vectorEnabled"
        class="graph-alert"
        type="warning"
        :closable="false"
        title="当前未启用 Wiki 向量索引，仅展示目录结构骨架"
        description="在管理后台配置 Embedding 模型并重建 Wiki 知识索引后，即可看到页面间的语义相似关联。"
        show-icon
      />

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">页面节点</span>
          <strong>{{ pageNodeCount }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">目录节点</span>
          <strong>{{ directoryNodeCount }}</strong>
        </div>
        <div class="stat-card emphasis">
          <span class="stat-label">语义相似边</span>
          <strong>{{ semanticEdgeCount }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">目录归属边</span>
          <strong>{{ directoryEdgeCount }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">更新时间</span>
          <strong>{{ generatedAtText }}</strong>
        </div>
      </div>
    </el-card>

    <div class="main-grid">
      <el-card class="page-card graph-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>向量语义关系图</span>
            <el-space wrap>
              <el-tag type="info">{{ canvasNodes.length }} 个节点</el-tag>
              <el-tag type="info">{{ canvasEdges.length }} 条关系</el-tag>
            </el-space>
          </div>
        </template>

        <KnowledgeGraphCanvas
          :nodes="canvasNodes"
          :edges="canvasEdges"
          :layout-mode="layoutMode"
          :selected-node-id="selectedNodeId"
          :selected-edge-id="selectedEdgeId"
          @select-node="handleSelectNode"
          @select-edge="handleSelectEdge"
          @clear-selection="handleClearSelection"
        />
      </el-card>

      <el-card class="page-card detail-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>选中详情</span>
            <el-tag
              v-if="selectedNode"
              :style="{ background: nodeColor(selectedNode.nodeType), color: '#fff', border: 'none' }"
            >
              {{ nodeTypeLabel(selectedNode.nodeType) }}
            </el-tag>
            <el-tag v-else-if="selectedEdge" type="info">{{ edgeTypeLabel(selectedEdge.edgeType) }}</el-tag>
          </div>
        </template>

        <div v-if="selectedNode" class="detail-panel">
          <div class="detail-title">{{ selectedNode.name }}</div>
          <div class="detail-meta">节点类型：{{ nodeTypeLabel(selectedNode.nodeType) }}</div>
          <div v-if="selectedNode.slug" class="detail-meta">Slug：{{ selectedNode.slug }}</div>
          <div v-if="selectedNode.chunkCount != null" class="detail-meta">向量分块：{{ selectedNode.chunkCount }} 个</div>
          <el-button
            v-if="selectedNode.nodeType === 'WIKI_PAGE'"
            type="primary"
            plain
            size="small"
            @click="openPage(selectedNode.bizId)"
          >
            打开页面
          </el-button>
          <div class="detail-block">
            <div class="detail-block-title">关联关系</div>
            <div v-if="selectedNodeEdges.length" class="relation-chips">
              <span v-for="item in selectedNodeEdges" :key="item.id" class="relation-chip">
                {{ edgeTypeLabel(item.edgeType) }} · {{ item.otherName }}
                <template v-if="item.similarity != null"> · {{ item.similarity.toFixed(3) }}</template>
              </span>
            </div>
            <div v-else class="detail-empty">当前阈值下该节点暂无关联</div>
          </div>
        </div>

        <div v-else-if="selectedEdge" class="detail-panel">
          <div class="detail-title">{{ edgeTypeLabel(selectedEdge.edgeType) }}</div>
          <div class="detail-meta">{{ selectedEdge.fromName }} → {{ selectedEdge.toName }}</div>
          <div v-if="selectedEdge.similarity != null" class="detail-meta">相似度：{{ selectedEdge.similarity.toFixed(4) }}</div>
          <div v-if="selectedEdge.evidenceText" class="detail-block">
            <div class="detail-block-title">说明</div>
            <div class="detail-block-content">{{ selectedEdge.evidenceText }}</div>
          </div>
        </div>

        <el-empty v-else description="点击图中的节点或边查看详情" />
      </el-card>
    </div>

    <div class="content-grid">
      <el-card class="page-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>页面节点列表</span>
            <el-tag type="info">{{ pageNodeRows.length }}</el-tag>
          </div>
        </template>

        <el-table v-loading="loading" :data="pageNodeRows" height="420" @row-click="handleNodeRowClick">
          <el-table-column prop="name" label="页面标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="directoryName" label="所属目录" min-width="140" show-overflow-tooltip />
          <el-table-column label="向量分块" width="100">
            <template #default="{ row }">{{ row.chunkCount ?? '-' }}</template>
          </el-table-column>
          <el-table-column label="语义关联" width="100">
            <template #default="{ row }">{{ row.semanticDegree }}</template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="page-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>语义相似关系</span>
            <el-tag type="info">{{ semanticEdgeRows.length }}</el-tag>
          </div>
        </template>

        <el-table v-loading="loading" :data="semanticEdgeRows" height="420" @row-click="handleEdgeRowClick">
          <el-table-column prop="fromName" label="页面 A" min-width="180" show-overflow-tooltip />
          <el-table-column prop="toName" label="页面 B" min-width="180" show-overflow-tooltip />
          <el-table-column label="相似度" width="110">
            <template #default="{ row }">{{ row.similarity != null ? row.similarity.toFixed(4) : '-' }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getWikiSpaceKnowledgeGraph } from '@/api/platform'
import type {
  KnowledgeGraphEdgeItem,
  KnowledgeGraphNodeItem,
  WikiKnowledgeGraphEdgeItem,
  WikiKnowledgeGraphNodeItem,
  WikiSpaceKnowledgeGraphItem
} from '@/types/platform'

type LayoutMode = 'network' | 'ring' | 'grid'

interface SemanticEdgeRow extends KnowledgeGraphEdgeItem {
  fromName: string
  toName: string
  similarity: number | null
}

const KnowledgeGraphCanvas = defineAsyncComponent(() => import('@/components/KnowledgeGraphCanvas.vue'))

const route = useRoute()
const router = useRouter()

const spaceId = Number(route.params.spaceId)
const graph = ref<WikiSpaceKnowledgeGraphItem | null>(null)
const loading = ref(false)
const layoutMode = ref<LayoutMode>('network')
const similarityThreshold = ref(0.8)
const selectedNodeId = ref<number | null>(null)
const selectedEdgeId = ref<number | null>(null)

const layoutOptions: Array<{ label: string; value: LayoutMode }> = [
  { label: '关系云', value: 'network' },
  { label: '环形', value: 'ring' },
  { label: '网格', value: 'grid' }
]

// 节点名称索引，供边列表回填两端标题。
const nodeNameMap = computed(() => {
  const result = new Map<number, string>()
  for (const node of graph.value?.nodes || []) {
    result.set(node.id, node.name)
  }
  return result
})

const directoryNameByDirectoryId = computed(() => {
  const result = new Map<number, string>()
  for (const node of graph.value?.nodes || []) {
    if (node.nodeType === 'WIKI_DIRECTORY') {
      result.set(node.bizId, node.name)
    }
  }
  return result
})

// 语义边按前端阈值本地过滤，结构边始终保留。
const filteredEdges = computed<WikiKnowledgeGraphEdgeItem[]>(() =>
  (graph.value?.edges || []).filter((edge) => {
    if (edge.edgeType !== 'SEMANTIC_SIMILAR') return true
    return (edge.similarity ?? 0) >= similarityThreshold.value
  })
)

// 过滤后仍被边连接，或属于目录骨架的节点才进入画布，避免阈值收紧后出现孤立点。
const visibleNodeIds = computed(() => {
  const ids = new Set<number>()
  for (const edge of filteredEdges.value) {
    ids.add(edge.fromNodeId)
    ids.add(edge.toNodeId)
  }
  for (const node of graph.value?.nodes || []) {
    if (node.nodeType === 'WIKI_DIRECTORY') ids.add(node.id)
  }
  return ids
})

const wikiNodeById = computed(() => {
  const result = new Map<number, WikiKnowledgeGraphNodeItem>()
  for (const node of graph.value?.nodes || []) {
    result.set(node.id, node)
  }
  return result
})

// 适配通用画布的节点结构。
const canvasNodes = computed<KnowledgeGraphNodeItem[]>(() =>
  (graph.value?.nodes || [])
    .filter((node) => visibleNodeIds.value.has(node.id))
    .map((node) => ({
      id: node.id,
      nodeType: node.nodeType,
      bizId: node.bizId,
      name: node.name,
      description: node.slug || '',
      metadataJson: node.metadataJson
    }))
)

// 适配通用画布的边结构，相似度映射到 confidence 以便复用画布详情。
const canvasEdges = computed<KnowledgeGraphEdgeItem[]>(() =>
  filteredEdges.value.map((edge) => ({
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    edgeType: edge.edgeType,
    sourceType: 'WIKI_VECTOR',
    confidence: edge.similarity,
    status: '',
    evidenceText: edge.evidenceText
  }))
)

const pageNodeCount = computed(() => (graph.value?.nodes || []).filter((n) => n.nodeType === 'WIKI_PAGE').length)
const directoryNodeCount = computed(() => (graph.value?.nodes || []).filter((n) => n.nodeType === 'WIKI_DIRECTORY').length)
const semanticEdgeCount = computed(() => filteredEdges.value.filter((e) => e.edgeType === 'SEMANTIC_SIMILAR').length)
const directoryEdgeCount = computed(() => (graph.value?.edges || []).filter((e) => e.edgeType === 'BELONGS_TO_DIRECTORY').length)
const generatedAtText = computed(() => {
  const raw = graph.value?.generatedAt
  if (!raw) return '-'
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString()
})

// 每个页面节点的语义关联度，供列表展示。
const semanticDegreeMap = computed(() => {
  const result = new Map<number, number>()
  for (const edge of filteredEdges.value) {
    if (edge.edgeType !== 'SEMANTIC_SIMILAR') continue
    result.set(edge.fromNodeId, (result.get(edge.fromNodeId) || 0) + 1)
    result.set(edge.toNodeId, (result.get(edge.toNodeId) || 0) + 1)
  }
  return result
})

const pageNodeRows = computed(() =>
  (graph.value?.nodes || [])
    .filter((node) => node.nodeType === 'WIKI_PAGE')
    .map((node) => ({
      ...node,
      directoryName: node.directoryId != null ? directoryNameByDirectoryId.value.get(node.directoryId) || '-' : '-',
      semanticDegree: semanticDegreeMap.value.get(node.id) || 0
    }))
)

const semanticEdgeRows = computed<SemanticEdgeRow[]>(() =>
  filteredEdges.value
    .filter((edge) => edge.edgeType === 'SEMANTIC_SIMILAR')
    .map((edge) => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeType: edge.edgeType,
      sourceType: 'WIKI_VECTOR',
      confidence: edge.similarity,
      status: '',
      evidenceText: edge.evidenceText,
      similarity: edge.similarity,
      fromName: nodeNameMap.value.get(edge.fromNodeId) || `#${edge.fromNodeId}`,
      toName: nodeNameMap.value.get(edge.toNodeId) || `#${edge.toNodeId}`
    }))
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
)

const selectedNode = computed(() => (selectedNodeId.value == null ? null : wikiNodeById.value.get(selectedNodeId.value) || null))
const selectedEdge = computed(() => semanticEdgeRows.value.find((item) => item.id === selectedEdgeId.value) || null)

const selectedNodeEdges = computed(() => {
  if (!selectedNode.value) return []
  const currentId = selectedNode.value.id
  return filteredEdges.value
    .filter((edge) => edge.fromNodeId === currentId || edge.toNodeId === currentId)
    .map((edge) => {
      const otherId = edge.fromNodeId === currentId ? edge.toNodeId : edge.fromNodeId
      return {
        id: edge.id,
        edgeType: edge.edgeType,
        similarity: edge.similarity,
        otherName: nodeNameMap.value.get(otherId) || `#${otherId}`
      }
    })
})

const nodeTypeLabel = (nodeType: string) => {
  const map: Record<string, string> = {
    WIKI_DIRECTORY: 'Wiki 目录',
    WIKI_PAGE: 'Wiki 页面'
  }
  return map[nodeType] || nodeType
}

const edgeTypeLabel = (edgeType: string) => {
  const map: Record<string, string> = {
    SEMANTIC_SIMILAR: '语义相似',
    BELONGS_TO_DIRECTORY: '归属目录'
  }
  return map[edgeType] || edgeType
}

const nodeColor = (nodeType: string) => {
  const map: Record<string, string> = {
    WIKI_DIRECTORY: '#d97706',
    WIKI_PAGE: '#c0841a'
  }
  return map[nodeType] || '#7c8ea3'
}

const handleSelectNode = (id: number) => {
  selectedNodeId.value = id
  selectedEdgeId.value = null
}

const handleSelectEdge = (id: number) => {
  selectedEdgeId.value = id
  selectedNodeId.value = null
}

const handleClearSelection = () => {
  selectedNodeId.value = null
  selectedEdgeId.value = null
}

const handleNodeRowClick = (row: WikiKnowledgeGraphNodeItem) => handleSelectNode(row.id)
const handleEdgeRowClick = (row: SemanticEdgeRow) => handleSelectEdge(row.id)

const openPage = (pageId: number) => {
  router.push({ name: 'wiki-space-page', params: { spaceId, pageId } })
}

const goBack = () => {
  router.push({ name: 'wiki-space', params: { spaceId } })
}

const loadGraph = async () => {
  loading.value = true
  try {
    graph.value = await getWikiSpaceKnowledgeGraph(spaceId)
    selectedNodeId.value = null
    selectedEdgeId.value = null
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Wiki 知识图谱失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (Number.isNaN(spaceId) || spaceId <= 0) {
    ElMessage.error('空间参数不正确')
    goBack()
    return
  }
  loadGraph()
})
</script>

<style scoped>
.wiki-graph-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header,
.section-header,
.stats-grid,
.relation-chips {
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
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.page-subtitle,
.stat-label,
.detail-meta {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.threshold-control {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.threshold-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.graph-alert {
  margin-top: 14px;
}

.stats-grid {
  margin-top: 18px;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-card {
  min-width: 140px;
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4fb 100%);
  border: 1px solid #dbe7f3;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-card.emphasis {
  background: linear-gradient(135deg, rgba(245, 243, 255, 0.98) 0%, rgba(237, 233, 254, 0.96) 100%);
  border-color: rgba(139, 92, 246, 0.34);
}

.stat-card strong {
  font-size: 20px;
  color: #17324d;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(320px, 0.9fr);
  gap: 16px;
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-title {
  font-size: 20px;
  font-weight: 700;
  color: #17324c;
}

.detail-block {
  padding: 14px;
  border-radius: 16px;
  background: rgba(248, 251, 255, 0.92);
  border: 1px solid rgba(221, 230, 238, 0.92);
}

.detail-block-title {
  font-size: 13px;
  font-weight: 700;
  color: #385166;
  margin-bottom: 8px;
}

.detail-block-content {
  line-height: 1.7;
  color: #284259;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-empty {
  color: #6b7f91;
  font-size: 13px;
}

.relation-chips {
  flex-wrap: wrap;
  gap: 10px;
}

.relation-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(216, 226, 235, 0.92);
  background: rgba(255, 255, 255, 0.92);
  color: #284259;
  font-size: 12px;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 1380px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1100px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
