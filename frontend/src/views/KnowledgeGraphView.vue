<template>
  <div class="knowledge-graph-page">
    <el-card class="page-card" shadow="never">
      <div class="page-header">
        <div>
          <el-button text @click="goBack">返回项目</el-button>
          <div class="page-title">{{ projectName || '逻辑图谱' }}</div>
          <div class="page-subtitle">图谱页已经拆分成独立组件，G6 画布会按需动态加载。</div>
        </div>
        <el-space wrap>
          <el-select v-model="layoutMode" style="width: 180px">
            <el-option v-for="item in layoutOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select v-model="nodeTypeFilter" clearable placeholder="筛选节点类型" style="width: 220px">
            <el-option v-for="item in nodeTypeOptions" :key="item" :label="nodeTypeLabel(item)" :value="item" />
          </el-select>
          <el-button :loading="loading" @click="loadGraph(true)">刷新数据</el-button>
          <el-button type="primary" :loading="rebuilding" @click="handleRebuild">重建图谱</el-button>
        </el-space>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">项目</span>
          <strong>{{ graph?.projectId ?? projectId }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">布局</span>
          <strong>{{ currentLayoutLabel }}</strong>
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
              <el-tag type="info">{{ visibleNodes.length }} 个节点</el-tag>
              <el-tag type="info">{{ visibleEdges.length }} 条边</el-tag>
            </el-space>
          </div>
        </template>

        <KnowledgeGraphCanvas
          :nodes="visibleNodes"
          :edges="visibleEdges"
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
            <span>详情</span>
            <el-tag v-if="selectedNode" :style="{ background: nodeColor(selectedNode.nodeType), color: '#fff', border: 'none' }">
              {{ nodeTypeLabel(selectedNode.nodeType) }}
            </el-tag>
            <el-tag v-else-if="selectedEdge" type="info">{{ selectedEdge.edgeType }}</el-tag>
          </div>
        </template>

        <div v-if="selectedNode" class="detail-panel">
          <div class="detail-title">{{ selectedNode.name }}</div>
          <div class="detail-meta">业务 ID：{{ selectedNode.bizId }}</div>
          <div class="detail-meta">节点类型：{{ nodeTypeLabel(selectedNode.nodeType) }}</div>
          <div v-if="selectedNode.description" class="detail-block">
            <div class="detail-block-title">说明</div>
            <div class="detail-block-content">{{ selectedNode.description }}</div>
          </div>
          <div class="detail-block">
            <div class="detail-block-title">元数据</div>
            <div class="meta-grid">
              <div v-for="entry in selectedNodeMetaEntries" :key="entry.key" class="meta-item">
                <span class="meta-key">{{ entry.key }}</span>
                <span class="meta-value">{{ entry.value }}</span>
              </div>
            </div>
          </div>
          <div class="detail-block">
            <div class="detail-block-title">关联关系</div>
            <div class="relation-chips">
              <span v-for="item in selectedNodeEdges" :key="item.id" class="relation-chip">
                {{ item.edgeType }} · {{ item.otherName }}
              </span>
            </div>
          </div>
        </div>

        <div v-else-if="selectedEdge" class="detail-panel">
          <div class="detail-title">{{ selectedEdge.edgeType }}</div>
          <div class="detail-meta">{{ selectedEdge.fromName }} → {{ selectedEdge.toName }}</div>
          <div class="detail-meta">状态：{{ selectedEdge.status }}</div>
          <div class="detail-meta">来源：{{ selectedEdge.sourceType }}</div>
          <div class="detail-meta">置信度：{{ selectedEdge.confidence ?? '-' }}</div>
          <div v-if="selectedEdge.evidenceText" class="detail-block">
            <div class="detail-block-title">证据</div>
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
            <span>节点列表</span>
            <el-tag type="info">{{ filteredNodes.length }}</el-tag>
          </div>
        </template>

        <el-table v-loading="loading" :data="filteredNodes" height="420" @row-click="handleNodeRowClick">
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-tag :type="nodeTagType(row.nodeType)">{{ nodeTypeLabel(row.nodeType) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="bizId" label="业务ID" width="110" />
          <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        </el-table>
      </el-card>

      <el-card class="page-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>关系列表</span>
            <el-tag type="info">{{ edgeRows.length }}</el-tag>
          </div>
        </template>

        <el-table v-loading="loading" :data="edgeRows" height="420" @row-click="handleEdgeRowClick">
          <el-table-column prop="edgeType" label="关系类型" width="180" />
          <el-table-column prop="fromName" label="起点" min-width="180" show-overflow-tooltip />
          <el-table-column prop="toName" label="终点" min-width="180" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="置信度" width="100">
            <template #default="{ row }">
              {{ row.confidence ?? '-' }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getProjectDetail, getProjectKnowledgeGraph, rebuildProjectKnowledgeGraph } from '@/api/platform'
import type { KnowledgeGraphEdgeItem, KnowledgeGraphItem, KnowledgeGraphNodeItem } from '@/types/platform'

type LayoutMode = 'flat' | 'ring' | 'cluster' | 'grid'

interface GraphEdgeRow extends KnowledgeGraphEdgeItem {
  fromName: string
  toName: string
}

const KnowledgeGraphCanvas = defineAsyncComponent(() => import('@/components/KnowledgeGraphCanvas.vue'))

const route = useRoute()
const router = useRouter()

const projectId = Number(route.params.projectId)
const projectName = ref('')
const graph = ref<KnowledgeGraphItem | null>(null)
const loading = ref(false)
const rebuilding = ref(false)
const nodeTypeFilter = ref('')
const layoutMode = ref<LayoutMode>('cluster')
const selectedNodeId = ref<number | null>(null)
const selectedEdgeId = ref<number | null>(null)

const layoutOptions: Array<{ label: string; value: LayoutMode }> = [
  { label: '平铺', value: 'flat' },
  { label: '环形', value: 'ring' },
  { label: '聚簇', value: 'cluster' },
  { label: '网格', value: 'grid' }
]

const nodeTypeOrder = ['PROJECT', 'ITERATION', 'REQUIREMENT', 'TASK', 'BUG', 'TEST_PLAN', 'TEST_CASE', 'WIKI_SPACE', 'WIKI_DIRECTORY', 'WIKI_PAGE', 'USER', 'AGENT']

const currentLayoutLabel = computed(() => layoutOptions.find((item) => item.value === layoutMode.value)?.label || layoutMode.value)

const nodeTypeOptions = computed(() => {
  const values = new Set((graph.value?.nodes || []).map((item) => item.nodeType))
  return nodeTypeOrder.filter((item) => values.has(item))
})

const nodeMap = computed(() => {
  const result = new Map<number, KnowledgeGraphNodeItem>()
  for (const item of graph.value?.nodes || []) {
    result.set(item.id, item)
  }
  return result
})

const filteredNodes = computed(() => {
  if (!nodeTypeFilter.value) return graph.value?.nodes || []
  return (graph.value?.nodes || []).filter((item) => item.nodeType === nodeTypeFilter.value)
})

const visibleNodeIds = computed(() => {
  if (!nodeTypeFilter.value) {
    return new Set((graph.value?.nodes || []).map((item) => item.id))
  }
  const selectedIds = new Set(filteredNodes.value.map((item) => item.id))
  for (const edge of graph.value?.edges || []) {
    if (selectedIds.has(edge.fromNodeId) || selectedIds.has(edge.toNodeId)) {
      selectedIds.add(edge.fromNodeId)
      selectedIds.add(edge.toNodeId)
    }
  }
  return selectedIds
})

const visibleNodes = computed(() => (graph.value?.nodes || []).filter((item) => visibleNodeIds.value.has(item.id)))
const visibleEdges = computed(() =>
  (graph.value?.edges || []).filter((item) => visibleNodeIds.value.has(item.fromNodeId) && visibleNodeIds.value.has(item.toNodeId))
)

const edgeRows = computed<GraphEdgeRow[]>(() =>
  visibleEdges.value.map((item) => ({
    ...item,
    fromName: nodeMap.value.get(item.fromNodeId)?.name || `#${item.fromNodeId}`,
    toName: nodeMap.value.get(item.toNodeId)?.name || `#${item.toNodeId}`
  }))
)

const selectedNode = computed(() => visibleNodes.value.find((item) => item.id === selectedNodeId.value) || null)
const selectedEdge = computed(() => edgeRows.value.find((item) => item.id === selectedEdgeId.value) || null)

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const selectedNodeMetaEntries = computed(() => {
  const meta = parseMetadata(selectedNode.value?.metadataJson)
  return Object.entries(meta).map(([key, value]) => ({
    key,
    value: String(value)
  }))
})

const selectedNodeEdges = computed(() => {
  if (!selectedNode.value) return []
  return edgeRows.value
    .filter((item) => item.fromNodeId === selectedNode.value?.id || item.toNodeId === selectedNode.value?.id)
    .map((item) => ({
      ...item,
      otherName: item.fromNodeId === selectedNode.value?.id ? item.toName : item.fromName
    }))
})

const nodeTypeLabel = (nodeType: string) => {
  const map: Record<string, string> = {
    PROJECT: '项目',
    ITERATION: '迭代',
    REQUIREMENT: '需求',
    TASK: '任务',
    BUG: '缺陷',
    TEST_PLAN: '测试计划',
    TEST_CASE: '测试用例',
    WIKI_SPACE: 'Wiki 空间',
    WIKI_DIRECTORY: 'Wiki 目录',
    WIKI_PAGE: 'Wiki 页面',
    USER: '用户',
    AGENT: 'Agent'
  }
  return map[nodeType] || nodeType
}

const nodeTagType = (nodeType: string) => {
  if (nodeType === 'PROJECT') return 'primary'
  if (nodeType === 'ITERATION') return 'success'
  if (nodeType === 'REQUIREMENT') return 'warning'
  if (nodeType === 'BUG') return 'danger'
  if (nodeType === 'WIKI_SPACE') return 'primary'
  if (nodeType === 'WIKI_DIRECTORY') return 'warning'
  if (nodeType === 'WIKI_PAGE') return 'warning'
  return 'info'
}

const nodeColor = (nodeType: string) => {
  const map: Record<string, string> = {
    PROJECT: '#1f7a8c',
    ITERATION: '#2fa56b',
    REQUIREMENT: '#f59e0b',
    TASK: '#3b82f6',
    BUG: '#e25555',
    TEST_PLAN: '#f97316',
    TEST_CASE: '#f8b55a',
    WIKI_SPACE: '#8b5cf6',
    WIKI_DIRECTORY: '#d97706',
    WIKI_PAGE: '#c0841a',
    USER: '#7c8ea3',
    AGENT: '#475569'
  }
  return map[nodeType] || '#7c8ea3'
}

const loadProject = async () => {
  const project = await getProjectDetail(projectId)
  projectName.value = project.name
}

const loadGraph = async (refresh = false) => {
  loading.value = true
  try {
    graph.value = await getProjectKnowledgeGraph(projectId, refresh)
  } finally {
    loading.value = false
  }
}

const handleRebuild = async () => {
  rebuilding.value = true
  try {
    graph.value = await rebuildProjectKnowledgeGraph(projectId)
    ElMessage.success('逻辑图谱已重建')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '重建失败')
  } finally {
    rebuilding.value = false
  }
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

const handleNodeRowClick = (row: KnowledgeGraphNodeItem) => {
  handleSelectNode(row.id)
}

const handleEdgeRowClick = (row: GraphEdgeRow) => {
  handleSelectEdge(row.id)
}

const goBack = () => {
  router.push({ name: 'projects' })
}

watch(
  () => graph.value,
  (value) => {
    if (!value?.nodes.length) {
      selectedNodeId.value = null
      selectedEdgeId.value = null
      return
    }
    const projectNode = value.nodes.find((item) => item.nodeType === 'PROJECT')
    selectedNodeId.value = projectNode?.id || value.nodes[0].id
    selectedEdgeId.value = null
  },
  { immediate: true }
)

watch(nodeTypeFilter, () => {
  if (selectedNodeId.value && !visibleNodeIds.value.has(selectedNodeId.value)) {
    const nextNode = visibleNodes.value[0]
    selectedNodeId.value = nextNode?.id || null
  }
  if (selectedEdgeId.value && !visibleEdges.value.some((item) => item.id === selectedEdgeId.value)) {
    selectedEdgeId.value = null
  }
})

onMounted(async () => {
  if (Number.isNaN(projectId) || projectId <= 0) {
    ElMessage.error('项目参数不正确')
    goBack()
    return
  }
  try {
    await Promise.all([loadProject(), loadGraph()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载逻辑图谱失败')
  }
})
</script>

<style scoped>
.knowledge-graph-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header,
.section-header,
.stats-grid {
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

.stats-grid {
  margin-top: 18px;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-card {
  min-width: 150px;
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4fb 100%);
  border: 1px solid #dbe7f3;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.graph-card,
.detail-card {
  min-height: 0;
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-title {
  font-size: 20px;
  font-weight: 700;
  color: #17324c;
}

.detail-block {
  margin-top: 8px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(248, 251, 255, 0.92);
  border: 1px solid rgba(221, 230, 238, 0.92);
}

.detail-block-title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #385166;
}

.detail-block-content {
  line-height: 1.7;
  color: #284259;
  white-space: pre-wrap;
  word-break: break-word;
}

.meta-grid,
.relation-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-item,
.relation-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(216, 226, 235, 0.92);
  color: #284259;
  font-size: 12px;
}

.meta-key {
  color: #6d8092;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 1280px) {
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
