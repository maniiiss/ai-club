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
import { Graph as G6Graph } from '@antv/g6'
import type { ComboData, EdgeData, GraphData, NodeData } from '@antv/g6'
import type { GitlabCodeStructureGraphEdgeItem, GitlabCodeStructureGraphNodeItem } from '@/types/platform'

type LayoutMode = 'network' | 'ring' | 'grid'

const props = defineProps<{
  nodes: GitlabCodeStructureGraphNodeItem[]
  edges: GitlabCodeStructureGraphEdgeItem[]
  layoutMode: LayoutMode
  selectedNodeId: string | null
  selectedEdgeId: string | null
}>()

const emit = defineEmits<{
  (e: 'select-node', id: string): void
  (e: 'select-edge', id: string): void
  (e: 'clear-selection'): void
}>()

const graphContainerRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(1100)
const containerHeight = ref(680)

let graphInstance: G6Graph | null = null
let resizeObserver: ResizeObserver | null = null
let renderToken = 0

const selectedNode = computed(() => props.nodes.find((item) => item.id === props.selectedNodeId) || null)

const nodeTypeOptions = computed(() => {
  const values = new Set(props.nodes.map((item) => item.nodeType))
  return ['PROCESS', 'METHOD', 'FUNCTION', 'CLASS', 'INTERFACE', 'CONSTRUCTOR', 'FILE', 'SYMBOL']
    .filter((item) => values.has(item))
})

const nodeColor = (nodeType: string) => {
  const map: Record<string, string> = {
    PROCESS: '#0f766e',
    METHOD: '#2563eb',
    FUNCTION: '#0284c7',
    CLASS: '#f59e0b',
    INTERFACE: '#7c3aed',
    CONSTRUCTOR: '#ea580c',
    FILE: '#64748b',
    SYMBOL: '#334155'
  }
  return map[nodeType] || '#64748b'
}

const edgeColor = (edgeType: string) => {
  if (edgeType.includes('PROCESS')) return '#0f766e'
  if (edgeType.includes('CALL')) return '#2563eb'
  return '#8ca0b3'
}

const nodeTypeLabel = (nodeType: string) => {
  const map: Record<string, string> = {
    PROCESS: '流程',
    METHOD: '方法',
    FUNCTION: '函数',
    CLASS: '类',
    INTERFACE: '接口',
    CONSTRUCTOR: '构造器',
    FILE: '文件',
    SYMBOL: '符号'
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

const degreeMap = computed(() => {
  const result = new Map<string, number>()
  props.nodes.forEach((node) => result.set(node.id, 0))
  props.edges.forEach((edge) => {
    result.set(edge.sourceId, (result.get(edge.sourceId) || 0) + 1)
    result.set(edge.targetId, (result.get(edge.targetId) || 0) + 1)
  })
  return result
})

const structureNodeScore = (nodeType: string, degree: number) => {
  const typeWeight: Record<string, number> = {
    PROCESS: 10,
    CLASS: 8,
    METHOD: 7,
    FUNCTION: 7,
    INTERFACE: 6,
    CONSTRUCTOR: 5,
    FILE: 4,
    SYMBOL: 3
  }
  return degree * 4 + (typeWeight[nodeType] || 1)
}

const circleSize = (nodeType: string, degree: number) => {
  const base = nodeType === 'PROCESS' ? 24 : nodeType === 'CLASS' ? 20 : nodeType === 'FILE' ? 16 : 15
  return Math.max(base, Math.min(34, base + Math.sqrt(Math.max(degree, 1)) * 2.5))
}

const shouldShowDefaultLabel = (nodeType: string, degree: number) =>
  nodeType === 'PROCESS' || nodeType === 'CLASS' || degree >= 4

const graphData = computed<GraphData>(() => {
  const nodes: NodeData[] = props.nodes.map((item) => ({
    id: item.id,
    data: {
      nodeType: item.nodeType,
      label: item.label,
      shortLabel: truncate(item.label, 20),
      secondaryLabel: item.secondaryLabel,
      detailText: item.detailText,
      degree: degreeMap.value.get(item.id) || 0
    }
  }))

  const edges: EdgeData[] = props.edges.map((item) => ({
    id: item.id,
    source: item.sourceId,
    target: item.targetId,
    data: {
      edgeType: item.edgeType,
      detailText: item.detailText
    }
  }))

  return { nodes, edges, combos: [] as ComboData[] }
})

const createLayoutConfig = () => {
  const width = Math.max(containerWidth.value, 980)
  const height = Math.max(containerHeight.value, 620)
  const center: [number, number] = [width / 2, height / 2]
  const common = { width, height, center }

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

  return {
    type: 'force',
    ...common,
    gravity: 0.08,
    linkDistance: 210,
    preventOverlap: true,
    nodeSize: 24
  }
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
        shadowColor: 'rgba(15, 118, 110, 0.14)',
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
        labelFontSize: 11,
        labelFill: '#334155',
        labelMaxWidth: 180
      },
      state: {
        selected: { lineWidth: 2.2, haloStrokeOpacity: 0.18, shadowBlur: 12, opacity: 1 },
        related: { lineWidth: 1.6, haloStrokeOpacity: 0.12, opacity: 1 },
        active: { haloStrokeOpacity: 0.1, shadowBlur: 10, opacity: 1 },
        dimmed: { opacity: 0.12 }
      }
    },
    edge: {
      type: 'quadratic',
      style: {
        stroke: (datum: EdgeData) => edgeColor(String(datum.data?.edgeType || '')),
        lineWidth: 1.1,
        lineCap: 'round',
        endArrow: true,
        opacity: 0.12
      },
      state: {
        selected: { lineWidth: 2.4, opacity: 0.76 },
        related: { opacity: 0.28 },
        active: { opacity: 0.18 },
        dimmed: { opacity: 0.03 }
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
        // 代码结构图谱优先展示流程、类和高连接符号，让用户先看到结构骨架。
        sortNode: (left: NodeData, right: NodeData) =>
          compareScore(
            structureNodeScore(String(right.data?.nodeType || ''), Number(right.data?.degree || 0)),
            structureNodeScore(String(left.data?.nodeType || ''), Number(left.data?.degree || 0))
          )
      }
    ]
  } as any)

  graphInstance.on('node:click', (event: any) => {
    const id = String(event?.target?.id || '')
    if (id) emit('select-node', id)
  })

  graphInstance.on('edge:click', (event: any) => {
    const id = String(event?.target?.id || '')
    if (id) emit('select-edge', id)
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
    relatedNodeIds.add(props.selectedNodeId)
    for (const edge of graphData.value.edges || []) {
      const source = String(edge.source)
      const target = String(edge.target)
      if (source === props.selectedNodeId || target === props.selectedNodeId) {
        relatedEdgeIds.add(String(edge.id))
        relatedNodeIds.add(source)
        relatedNodeIds.add(target)
      }
    }
  } else if (props.selectedEdgeId !== null) {
    relatedEdgeIds.add(props.selectedEdgeId)
    const selected = graphData.value.edges?.find((item) => String(item.id) === props.selectedEdgeId)
    if (selected) {
      relatedNodeIds.add(String(selected.source))
      relatedNodeIds.add(String(selected.target))
    }
  }

  nodeIds.forEach((id) => {
    if (props.selectedNodeId !== null && id === props.selectedNodeId) states[id] = ['selected']
    else if (relatedNodeIds.has(id)) states[id] = ['related']
    else states[id] = ['dimmed']
  })

  edgeIds.forEach((id) => {
    if (props.selectedEdgeId !== null && id === props.selectedEdgeId) states[id] = ['selected']
    else if (relatedEdgeIds.has(id)) states[id] = ['related']
    else states[id] = ['dimmed']
  })

  await graphInstance.setElementState(states, false)
}

const ensureContainerSize = () => {
  const container = graphContainerRef.value
  if (!container) return
  containerWidth.value = Math.max(container.clientWidth, 980)
  containerHeight.value = Math.max(container.clientHeight, 620)
}

const focusFirstNode = async (nodeType: string) => {
  const node = props.nodes.find((item) => item.nodeType === nodeType)
  if (!node) return
  emit('select-node', node.id)
  await nextTick()
  if (graphInstance) {
    await graphInstance.focusElement(node.id, false)
  }
}

onMounted(async () => {
  await nextTick()
  ensureContainerSize()
  await initGraph()
  if (graphContainerRef.value) {
    resizeObserver = new ResizeObserver(async () => {
      ensureContainerSize()
      await initGraph()
    })
    resizeObserver.observe(graphContainerRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (graphInstance) {
    graphInstance.destroy()
    graphInstance = null
  }
})

watch(
  () => [props.nodes, props.edges, props.layoutMode],
  async () => {
    await nextTick()
    await initGraph()
  },
  { deep: true }
)

watch(
  () => [props.selectedNodeId, props.selectedEdgeId],
  async () => {
    await nextTick()
    await applySelectionStates()
  }
)
</script>

<style scoped>
.graph-empty,
.graph-panel {
  min-height: 420px;
}

.graph-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #475569;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}

.legend-item.active,
.legend-item:hover {
  border-color: rgba(37, 99, 235, 0.38);
  color: #1e293b;
  transform: translateY(-1px);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.graph-container {
  width: 100%;
  min-height: 620px;
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(15, 118, 110, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92));
  border: 1px solid rgba(148, 163, 184, 0.18);
}

@media (max-width: 768px) {
  .graph-container {
    min-height: 520px;
  }
}
</style>
