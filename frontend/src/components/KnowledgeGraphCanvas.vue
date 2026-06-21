<template>
  <div v-if="!nodes.length" class="graph-empty">
    <el-empty description="暂无图谱数据" />
  </div>
  <div v-else class="graph-panel">
    <div class="graph-legend">
      <button
        v-for="item in nodeTypeOptions"
        :key="item"
        type="button"
        class="legend-item"
        :class="{ active: selectedNode?.nodeType === item }"
        @click="focusFirstNode(item)"
      >
        <span class="legend-dot" :style="{ background: nodeColor(item) }"></span>
        <span>{{ nodeTypeLabel(item) }}</span>
      </button>
    </div>
    <div ref="graphContainerRef" class="graph-container" @contextmenu.prevent></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElEmpty } from 'element-plus'
import { Graph as G6Graph } from '@antv/g6'
import type { ComboData, EdgeData, GraphData, NodeData } from '@antv/g6'
import type { KnowledgeGraphEdgeItem, KnowledgeGraphNodeItem } from '@/types/platform'

type LayoutMode = 'network' | 'ring' | 'grid'

const props = defineProps<{
  nodes: KnowledgeGraphNodeItem[]
  edges: KnowledgeGraphEdgeItem[]
  layoutMode: LayoutMode
  selectedNodeId: number | null
  selectedEdgeId: number | null
}>()

const emit = defineEmits<{
  (e: 'select-node', id: number): void
  (e: 'select-edge', id: number): void
  (e: 'clear-selection'): void
}>()

const graphContainerRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(1100)
const containerHeight = ref(680)

let graphInstance: G6Graph | null = null
let resizeObserver: ResizeObserver | null = null
let renderToken = 0

const nodeTypeOrder = ['PROJECT', 'ITERATION', 'REQUIREMENT', 'TASK', 'BUG', 'TEST_PLAN', 'TEST_CASE', 'WIKI_DIRECTORY', 'WIKI_PAGE', 'USER', 'AGENT']

const nodeTypeOptions = computed(() => {
  const values = new Set(props.nodes.map((item) => item.nodeType))
  return nodeTypeOrder.filter((item) => values.has(item))
})

const selectedNode = computed(() => props.nodes.find((item) => item.id === props.selectedNodeId) || null)

const nodeColor = (nodeType: string) => {
  const map: Record<string, string> = {
    PROJECT: '#1f7a8c',
    ITERATION: '#2fa56b',
    REQUIREMENT: '#f59e0b',
    TASK: '#3b82f6',
    BUG: '#e25555',
    TEST_PLAN: '#f97316',
    TEST_CASE: '#f8b55a',
    WIKI_DIRECTORY: '#d97706',
    WIKI_PAGE: '#c0841a',
    USER: '#7c8ea3',
    AGENT: '#475569'
  }
  return map[nodeType] || '#7c8ea3'
}

const edgeColor = (edgeType: string) => {
  if (edgeType === 'SEMANTIC_SIMILAR') return '#8b5cf6'
  if (edgeType === 'BELONGS_TO_DIRECTORY' || edgeType.includes('WIKI')) return '#d97706'
  if (edgeType.includes('TEST')) return '#f59e0b'
  if (edgeType.includes('AGENT')) return '#64748b'
  if (edgeType.includes('ASSIGNED') || edgeType.includes('MEMBER') || edgeType.includes('OWNED')) return '#1f7a8c'
  if (edgeType.includes('REQUIREMENT')) return '#f59e0b'
  return '#8ca0b3'
}

const nodeTypeLabel = (nodeType: string) => {
  const map: Record<string, string> = {
    PROJECT: '项目',
    ITERATION: '迭代',
    REQUIREMENT: '需求',
    TASK: '任务',
    BUG: '缺陷',
    TEST_PLAN: '测试计划',
    TEST_CASE: '测试用例',
    WIKI_DIRECTORY: 'Wiki 目录',
    WIKI_PAGE: 'Wiki 页面',
    USER: '用户',
    AGENT: 'Agent'
  }
  return map[nodeType] || nodeType
}

const truncate = (value: string, max: number) => {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}
const compareScore = (left: number, right: number) => {
  if (left === right) return 0
  return left > right ? -1 : 1
}
const disableEdgeInteraction = computed(() => props.edges.length >= 350)

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const nodeSecondary = (node: KnowledgeGraphNodeItem) => {
  const meta = parseMetadata(node.metadataJson)
  return String(meta.status || meta.priority || meta.category || meta.type || meta.username || '')
}

const degreeMap = computed(() => {
  const result = new Map<number, number>()
  props.nodes.forEach((node) => result.set(node.id, 0))
  props.edges.forEach((edge) => {
    result.set(edge.fromNodeId, (result.get(edge.fromNodeId) || 0) + 1)
    result.set(edge.toNodeId, (result.get(edge.toNodeId) || 0) + 1)
  })
  return result
})
const knowledgeNodeScore = (nodeType: string, degree: number) => {
  const typeWeight: Record<string, number> = {
    PROJECT: 10,
    ITERATION: 8,
    REQUIREMENT: 7,
    TASK: 6,
    BUG: 5,
    TEST_PLAN: 4,
    TEST_CASE: 3,
    USER: 2,
    AGENT: 2
  }
  return degree * 4 + (typeWeight[nodeType] || 1)
}
const circleSize = (nodeType: string, degree: number) => {
  const base = nodeType === 'PROJECT' ? 22 : nodeType === 'REQUIREMENT' ? 18 : 15
  return Math.max(base, Math.min(32, base + Math.sqrt(Math.max(degree, 1)) * 2.8))
}
const shouldShowDefaultLabel = (nodeType: string, degree: number) =>
  nodeType === 'PROJECT' || nodeType === 'REQUIREMENT' || degree >= 5

const graphData = computed<GraphData>(() => {
  const nodes: NodeData[] = props.nodes.map((item) => {
    return {
      id: String(item.id),
      data: {
        bizId: item.bizId,
        name: item.name,
        shortLabel: truncate(item.name, 22),
        description: item.description,
        nodeType: item.nodeType,
        degree: degreeMap.value.get(item.id) || 0,
        secondary: nodeSecondary(item),
        metadataJson: item.metadataJson
      }
    }
  })

  const edges: EdgeData[] = props.edges.map((item) => ({
    id: String(item.id),
    source: String(item.fromNodeId),
    target: String(item.toNodeId),
    data: {
      edgeType: item.edgeType,
      status: item.status,
      sourceType: item.sourceType,
      confidence: item.confidence,
      evidenceText: item.evidenceText
      }
    }))

  return { nodes, edges, combos: [] as ComboData[] }
})

const createLayoutConfig = () => {
  const width = Math.max(containerWidth.value, 980)
  const height = Math.max(containerHeight.value, 620)
  const center: [number, number] = [width / 2, height / 2]
  const common = { width, height, center }

  if (props.layoutMode === 'network') {
    return {
      type: 'force',
      ...common,
      gravity: 0.08,
      linkDistance: 240,
      preventOverlap: true,
      nodeSize: 26
    }
  }

  if (props.layoutMode === 'grid') {
    return {
      type: 'grid',
      ...common,
      preventOverlap: true,
      cols: Math.max(Math.ceil(Math.sqrt(Math.max(props.nodes.length, 1))), 3)
    }
  }

  if (props.layoutMode === 'ring') {
    return {
      type: 'circular',
      ...common,
      startAngle: -Math.PI / 2,
      endAngle: (Math.PI * 3) / 2,
      clockwise: true,
      divisions: 1
    }
  }

  return undefined
}

const initGraph = async () => {
  const container = graphContainerRef.value
  if (!container || !props.nodes.length) {
    if (graphInstance) {
      graphInstance.destroy()
      graphInstance = null
    }
    return
  }

  const currentToken = ++renderToken
  const width = Math.max(container.clientWidth, 980)
  const height = Math.max(container.clientHeight, 620)
  containerWidth.value = width
  containerHeight.value = height

  if (graphInstance) {
    graphInstance.destroy()
    graphInstance = null
  }

  graphInstance = new G6Graph({
    container,
    width,
    height,
    autoFit: false,
    animation: true,
    data: graphData.value,
    layout: createLayoutConfig(),
    node: {
      type: 'circle',
      style: {
        size: (datum: NodeData) => circleSize(String(datum.data?.nodeType || ''), Number(datum.data?.degree || 0)),
        lineWidth: 1.1,
        fill: (datum: NodeData) => `${nodeColor(String(datum.data?.nodeType || ''))}18`,
        stroke: (datum: NodeData) => nodeColor(String(datum.data?.nodeType || '')),
        shadowColor: 'rgba(14, 116, 144, 0.14)',
        shadowBlur: 8,
        shadowOffsetY: 2,
        halo: true,
        haloLineWidth: 4,
        haloStroke: (datum: NodeData) => nodeColor(String(datum.data?.nodeType || '')),
        haloStrokeOpacity: 0.05,
        label: true,
        labelText: (datum: NodeData) =>
          shouldShowDefaultLabel(String(datum.data?.nodeType || ''), Number(datum.data?.degree || 0))
            ? String(datum.data?.shortLabel || '')
            : '',
        labelPlacement: 'right',
        labelOffsetX: 7,
        labelFontWeight: 600,
        labelFontSize: (datum: NodeData) => String(datum.data?.nodeType || '') === 'PROJECT' ? 13 : 11,
        labelFill: '#334155',
        labelMaxWidth: 180
      },
      state: {
        selected: { lineWidth: 2.2, haloStrokeOpacity: 0.18, shadowBlur: 12, opacity: 1 },
        related: { lineWidth: 1.6, haloStrokeOpacity: 0.12, opacity: 1 },
        active: { haloStrokeOpacity: 0.1, shadowBlur: 10, opacity: 1 },
        dimmed: { opacity: 0.1 }
      }
    },
    edge: {
      type: 'quadratic',
      style: {
        stroke: (datum: EdgeData) => edgeColor(String(datum.data?.edgeType || '')),
        lineWidth: 1.1,
        lineCap: 'round',
        endArrow: true,
        opacity: 0.08,
        pointerEvents: disableEdgeInteraction.value ? 'none' : 'visiblestroke'
      },
      state: {
        selected: { lineWidth: 2.4, opacity: 0.72 },
        related: { opacity: 0.22 },
        active: { opacity: 0.16 },
        dimmed: { opacity: 0.02 }
      }
    },
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      'drag-element',
      {
        type: 'hover-activate',
        enable: (event: any) => event?.targetType === 'node',
        degree: 0,
        state: 'active',
        inactiveState: undefined
      },
      {
        type: 'auto-adapt-label',
        padding: [10, 20, 10, 20],
        // 逻辑图谱优先展示项目、需求和高连接节点标签，让复杂关系图里先看到业务骨架。
        sortNode: (left: NodeData, right: NodeData) =>
          compareScore(
            knowledgeNodeScore(String(right.data?.nodeType || ''), Number(right.data?.degree || 0)),
            knowledgeNodeScore(String(left.data?.nodeType || ''), Number(left.data?.degree || 0))
          )
      }
    ]
  } as any)

  graphInstance.on('node:click', (event: any) => {
    const id = Number(event?.target?.id)
    if (!Number.isNaN(id)) emit('select-node', id)
  })

  graphInstance.on('edge:click', (event: any) => {
    const id = Number(event?.target?.id)
    if (!Number.isNaN(id)) emit('select-edge', id)
  })

  graphInstance.on('canvas:click', () => {
    emit('clear-selection')
  })

  await graphInstance.render()
  if (currentToken !== renderToken) {
    graphInstance.destroy()
    graphInstance = null
    return
  }
  await graphInstance.fitView({ when: 'overflow' })
  await applySelectionStates()
}

const applySelectionStates = async () => {
  if (!graphInstance) return

  const states: Record<string, string[]> = {}
  const nodeIds = graphData.value.nodes?.map((item) => String(item.id)) || []
  const edgeIds = graphData.value.edges?.map((item) => String(item.id)) || []

  if (props.selectedNodeId === null && props.selectedEdgeId === null) {
    ;[...nodeIds, ...edgeIds].forEach((id) => {
      states[id] = []
    })
    await graphInstance.setElementState(states, false)
    return
  }

  const relatedNodeIds = new Set<string>()
  const relatedEdgeIds = new Set<string>()

  if (props.selectedNodeId !== null) {
    const selectedId = String(props.selectedNodeId)
    relatedNodeIds.add(selectedId)
    for (const edge of graphData.value.edges || []) {
      const source = String(edge.source)
      const target = String(edge.target)
      if (source === selectedId || target === selectedId) {
        relatedEdgeIds.add(String(edge.id))
        relatedNodeIds.add(source)
        relatedNodeIds.add(target)
      }
    }
  } else if (props.selectedEdgeId !== null) {
    const selectedId = String(props.selectedEdgeId)
    relatedEdgeIds.add(selectedId)
    const selected = graphData.value.edges?.find((item) => String(item.id) === selectedId)
    if (selected) {
      relatedNodeIds.add(String(selected.source))
      relatedNodeIds.add(String(selected.target))
    }
  }

  nodeIds.forEach((id) => {
    if (props.selectedNodeId !== null && id === String(props.selectedNodeId)) states[id] = ['selected']
    else if (relatedNodeIds.has(id)) states[id] = ['related']
    else states[id] = ['dimmed']
  })

  edgeIds.forEach((id) => {
    if (props.selectedEdgeId !== null && id === String(props.selectedEdgeId)) states[id] = ['selected']
    else if (relatedEdgeIds.has(id)) states[id] = ['related']
    else states[id] = ['dimmed']
  })

  await graphInstance.setElementState(states, false)

  if (props.selectedNodeId !== null) {
    await graphInstance.focusElement(String(props.selectedNodeId), false)
  } else if (props.selectedEdgeId !== null) {
    await graphInstance.focusElement(String(props.selectedEdgeId), false)
  }
}

const ensureContainerSize = () => {
  const container = graphContainerRef.value
  if (!container) return
  containerWidth.value = Math.max(container.clientWidth, 980)
  containerHeight.value = Math.max(container.clientHeight, 620)
}

const focusFirstNode = (nodeType: string) => {
  const target = props.nodes.find((item) => item.nodeType === nodeType)
  if (target) emit('select-node', target.id)
}

watch(
  [() => props.nodes, () => props.edges, () => props.layoutMode, containerWidth, containerHeight],
  async () => {
    await nextTick()
    ensureContainerSize()
    await initGraph()
  },
  { deep: true }
)

watch(
  [() => props.selectedNodeId, () => props.selectedEdgeId],
  async () => {
    await applySelectionStates()
  }
)

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    ensureContainerSize()
  })
  await nextTick()
  if (graphContainerRef.value) {
    resizeObserver.observe(graphContainerRef.value)
    ensureContainerSize()
  }
  await initGraph()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (graphInstance) {
    graphInstance.destroy()
    graphInstance = null
  }
})
</script>

<style scoped>
.graph-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.graph-legend {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(191, 219, 254, 0.48);
  background: rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(12px);
  color: #334155;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.legend-item:hover {
  transform: translateY(-1px);
  border-color: rgba(14, 116, 144, 0.36);
  background: rgba(255, 255, 255, 0.92);
}

.legend-item.active {
  border-color: rgba(14, 116, 144, 0.36);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.94) 0%, rgba(224, 242, 254, 0.92) 100%);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.graph-container {
  width: 100%;
  min-height: 680px;
  border-radius: 24px;
  border: 1px solid rgba(191, 219, 254, 0.5);
  background:
    radial-gradient(circle at 16% 18%, rgba(15, 118, 110, 0.08), transparent 24%),
    radial-gradient(circle at 84% 12%, rgba(59, 130, 246, 0.08), transparent 22%),
    radial-gradient(circle at 70% 82%, rgba(245, 158, 11, 0.08), transparent 24%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 248, 252, 0.98) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 24px 60px rgba(148, 163, 184, 0.12);
  overflow: hidden;
}

.graph-empty {
  min-height: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
