<template>
  <div class="wiki-graph-page">
    <el-card class="page-card" shadow="never">
      <div class="page-header">
        <div>
          <el-button text @click="goBack">返回空间</el-button>
          <div class="page-title">{{ graph?.spaceName || 'Wiki 知识图谱' }}</div>
          <div class="page-subtitle">展示文档中的关键内容及其相互关系</div>
        </div>
        <el-space wrap>
          <el-button :loading="loading" @click="loadGraph">刷新</el-button>
        </el-space>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">节点</span>
          <strong>{{ nodeCount }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">关系连线</span>
          <strong>{{ edgeCount }}</strong>
        </div>
      </div>
    </el-card>

    <el-card class="page-card graph-card" shadow="never">
      <template #header>
        <div class="section-header">
          <span>知识关系图</span>
          <span v-if="selectedNodeName" class="selected-hint">
            已选中：{{ selectedNodeName }}<template v-if="selectedNodeType"> · {{ typeLabel(selectedNodeType) }}</template>（点击空白处取消）
          </span>
        </div>
      </template>

      <div v-if="hasGraphData" class="graph-legend">
        <span v-for="t in legendTypes" :key="t" class="legend-item">
          <span class="legend-dot" :style="{ background: colorForType(t) }"></span>
          {{ typeLabel(t) }}
        </span>
      </div>

      <div v-show="hasGraphData" ref="graphContainerRef" class="graph-container"></div>
      <div v-if="!loading && !hasGraphData" class="graph-empty">
        <el-empty :description="emptyDescription" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { getWikiSpaceKnowledgeGraph } from '@/api/platform'
import type { WikiSpaceKnowledgeGraphItem } from '@/types/platform'

cytoscape.use(fcose)

const route = useRoute()
const router = useRouter()
const spaceId = Number(route.params.spaceId)

const graph = ref<WikiSpaceKnowledgeGraphItem | null>(null)
const loading = ref(false)
const graphContainerRef = ref<HTMLDivElement | null>(null)
const selectedNodeName = ref('')
const selectedNodeType = ref('')

let cy: cytoscape.Core | null = null

const nodeCount = computed(() => graph.value?.nodes.length || 0)
const edgeCount = computed(() => graph.value?.edges.length || 0)
const hasGraphData = computed(() => nodeCount.value > 0)
const emptyDescription = computed(() =>
  graph.value && !graph.value.vectorEnabled
    ? '该空间尚未建立知识索引，补充文档内容后稍候重试'
    : '暂无可展示的知识关系'
)

// 实体类型 -> 配色，让普通用户一眼区分不同类别的节点。
const TYPE_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#ca8a04']
const colorCache = new Map<string, string>()
const colorForType = (type: string): string => {
  if (!colorCache.has(type)) {
    colorCache.set(type, TYPE_COLORS[colorCache.size % TYPE_COLORS.length])
  }
  return colorCache.get(type)!
}

// 需求领域实体类型 -> 中文标签。LightRAG 抽取出的类型是小写英文，这里统一转中文展示。
const TYPE_LABELS: Record<string, string> = {
  requirement: '需求',
  module: '模块',
  feature: '功能点',
  datasource: '数据来源',
  businessrule: '业务规则',
  role: '角色/干系人',
  other: '其他',
  unknown: '未分类'
}
const typeLabel = (type: string): string => TYPE_LABELS[type.toLowerCase()] || type

// 图谱中出现过的实体类型（用于图例），保持稳定顺序。
const legendTypes = computed(() => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const node of graph.value?.nodes || []) {
    const type = parseEntityType(node.metadataJson) || '实体'
    if (!seen.has(type)) {
      seen.add(type)
      result.push(type)
    }
  }
  return result
})

// LightRAG 把实体类型塞进 metadataJson.entityType，这里解析出来用于着色。
const parseEntityType = (metadataJson: string | null | undefined): string => {
  if (!metadataJson) return ''
  try {
    const meta = JSON.parse(metadataJson)
    return typeof meta?.entityType === 'string' ? meta.entityType : ''
  } catch {
    return ''
  }
}

const buildElements = (): cytoscape.ElementDefinition[] => {
  const elements: cytoscape.ElementDefinition[] = []
  const nodeIds = new Set<number>()
  for (const node of graph.value?.nodes || []) {
    nodeIds.add(node.id)
    const type = parseEntityType(node.metadataJson) || '实体'
    elements.push({
      data: { id: String(node.id), label: node.name, color: colorForType(type), entityType: type }
    })
  }
  for (const edge of graph.value?.edges || []) {
    // 跳过两端不在节点集合中的边，避免 cytoscape 报错。
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) continue
    elements.push({
      data: { id: `e${edge.id}`, source: String(edge.fromNodeId), target: String(edge.toNodeId) }
    })
  }
  return elements
}

const renderGraph = async () => {
  if (!hasGraphData.value) return
  await nextTick()
  const container = graphContainerRef.value
  if (!container) return

  if (cy) {
    cy.destroy()
    cy = null
  }

  cy = cytoscape({
    container,
    elements: buildElements(),
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          label: 'data(label)',
          color: '#334155',
          'font-size': '11px',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 4,
          'text-max-width': '120px',
          'text-wrap': 'ellipsis',
          width: 26,
          height: 26,
          'border-width': 2,
          'border-color': '#ffffff'
        }
      },
      {
        selector: 'edge',
        style: {
          width: 1.5,
          'line-color': '#cbd5e1',
          'curve-style': 'bezier',
          'target-arrow-shape': 'none',
          opacity: 0.6
        }
      },
      {
        // 选中节点时高亮自身。
        selector: 'node.highlighted',
        style: { 'border-color': '#111827', 'border-width': 3, 'font-weight': 'bold' }
      },
      {
        // 高亮选中节点的相邻边。
        selector: 'edge.highlighted',
        style: { 'line-color': '#4f46e5', width: 2.5, opacity: 1 }
      },
      {
        // 非相关元素淡出。
        selector: '.faded',
        style: { opacity: 0.12 }
      }
    ],
    layout: {
      name: 'fcose',
      // animate:false 让布局一次性算完即停，节点不会持续抖动。
      animate: false,
      randomize: true,
      nodeRepulsion: 6000,
      idealEdgeLength: 90,
      padding: 30
    } as any,
    minZoom: 0.2,
    maxZoom: 3
  })

  cy.on('tap', 'node', (event) => {
    const node = event.target
    selectedNodeName.value = node.data('label')
    selectedNodeType.value = node.data('entityType') || ''
    const neighborhood = node.closedNeighborhood()
    cy!.elements().addClass('faded')
    neighborhood.removeClass('faded')
    cy!.elements().removeClass('highlighted')
    node.addClass('highlighted')
    node.connectedEdges().addClass('highlighted')
  })

  cy.on('tap', (event) => {
    // 点击空白处取消选中。
    if (event.target === cy) {
      selectedNodeName.value = ''
      selectedNodeType.value = ''
      cy!.elements().removeClass('faded highlighted')
    }
  })
}

const loadGraph = async () => {
  loading.value = true
  try {
    graph.value = await getWikiSpaceKnowledgeGraph(spaceId)
    selectedNodeName.value = ''
    await renderGraph()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push({ name: 'wiki-space', params: { spaceId } })
}

onMounted(() => {
  if (Number.isNaN(spaceId) || spaceId <= 0) {
    ElMessage.error('空间参数不正确')
    goBack()
    return
  }
  loadGraph()
})

onBeforeUnmount(() => {
  if (cy) {
    cy.destroy()
    cy = null
  }
})
</script>

<style scoped>
.wiki-graph-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #17324d;
}

.page-subtitle {
  color: #6b7f91;
  font-size: 13px;
  margin-top: 2px;
}

.stats-grid {
  display: flex;
  gap: 16px;
  margin-top: 18px;
}

.stat-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4fb 100%);
  border: 1px solid #dbe7f3;
  min-width: 140px;
}

.stat-label {
  display: block;
  color: #6b7f91;
  font-size: 13px;
  margin-bottom: 4px;
}

.stat-card strong {
  font-size: 24px;
  font-weight: 600;
  color: #17324d;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #385166;
}

.selected-hint {
  font-size: 12px;
  font-weight: 400;
  color: #6b7f91;
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(191, 219, 254, 0.6);
  background: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  color: #475569;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.graph-container {
  width: 100%;
  height: 600px;
  border-radius: 16px;
  border: 1px solid rgba(191, 219, 254, 0.5);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.graph-empty {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
