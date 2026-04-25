<template>
  <div v-if="!nodes.length" class="graph-empty">
    <el-empty description="暂无记忆事实图数据" />
  </div>
  <div v-else class="graph-panel">
    <div
      ref="graphContainerRef"
      class="graph-container"
      :class="{ transitioning: isTransitioning }"
      @contextmenu.prevent
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Graph as G6Graph } from '@antv/g6'
import type { ComboData, EdgeData, GraphData, NodeData } from '@antv/g6'
import type { MemoryFactEdgeItem, MemoryFactNodeItem } from '@/types/platform'

type LayoutMode = 'network' | 'ring' | 'grid'
type DensityMode = 'compact' | 'standard' | 'loose'

const props = defineProps<{
  nodes: MemoryFactNodeItem[]
  edges: MemoryFactEdgeItem[]
  layoutMode: LayoutMode
  densityMode: DensityMode
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
const containerHeight = ref(700)
const isTransitioning = ref(false)

let graphInstance: G6Graph | null = null
let resizeObserver: ResizeObserver | null = null
let renderToken = 0
let resizeFrameId: number | null = null
let transitionFrameId: number | null = null

const entityColor = (entityType: string) => {
  const map: Record<string, string> = {
    FACT: '#2563eb',
    ENTITY: '#4f46e5',
    LOCATION: '#0891b2',
    PERSON: '#ef4444',
    ORGANIZATION: '#16a34a',
    DOCUMENT: '#d97706',
    EVENT: '#7c3aed'
  }
  return map[entityType] || '#64748b'
}

const edgeColor = (relationType: string) => {
  if (relationType.includes('cause')) return '#ef4444'
  if (relationType.includes('contain')) return '#d97706'
  if (relationType.includes('co_occurrence')) return '#2563eb'
  return '#7c8ea3'
}

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value)
const entityNodeScore = (degree: number, factCount: number) => degree * 3 + factCount * 4
const circleSize = (degree: number, factCount: number) => {
  const normalizedDegree = Math.max(degree, 1)
  const normalizedFactCount = Math.max(factCount, 1)
  return Math.max(14, Math.min(28, 9 + Math.sqrt(normalizedDegree) * 2.8 + Math.sqrt(normalizedFactCount) * 2.2))
}
const compareScore = (left: number, right: number) => {
  if (left === right) return 0
  return left > right ? -1 : 1
}
const isHeavyGraph = computed(() => props.edges.length >= 300 || props.nodes.length >= 60)
const disableEdgeInteraction = computed(() => props.edges.length >= 500)
const shouldShowDefaultLabel = (degree: number, factCount: number) =>
  isHeavyGraph.value
    ? degree >= 8 || factCount >= 12
    : degree >= 4 || factCount >= 5

const graphData = computed<GraphData>(() => {
  const nodes: NodeData[] = props.nodes.map((item) => ({
    id: item.id,
    data: {
      label: item.label,
      shortLabel: truncate(item.label, 26),
      entityType: item.entityType || 'ENTITY',
      factCount: item.factCount,
      degree: item.degree
    }
  }))
  const edges: EdgeData[] = props.edges.map((item) => ({
    id: item.id,
    source: item.sourceId,
    target: item.targetId,
    data: {
      relationType: item.relationType,
      weight: item.weight ?? 1
    }
  }))
  return { nodes, edges, combos: [] as ComboData[] }
})

const densityConfig = computed(() => {
  const map: Record<DensityMode, { nodeSpacing: number; sweep: number; gridColsBoost: number }> = {
    compact: { nodeSpacing: 12, sweep: Math.PI * 1.2, gridColsBoost: 1 },
    standard: { nodeSpacing: 22, sweep: (Math.PI * 3) / 2, gridColsBoost: 0 },
    loose: { nodeSpacing: 38, sweep: Math.PI * 2, gridColsBoost: -1 }
  }
  return map[props.densityMode]
})
const viewTransition = {
  duration: 560,
  easing: 'cubic-bezier(0.18, 0.92, 0.24, 1)'
} as const

const measureContainerSize = () => {
  const container = graphContainerRef.value
  if (!container) return { width: containerWidth.value, height: containerHeight.value, changed: false }
  const nextWidth = Math.max(container.clientWidth, 980)
  const nextHeight = Math.max(container.clientHeight, 620)
  const changed = nextWidth !== containerWidth.value || nextHeight !== containerHeight.value
  containerWidth.value = nextWidth
  containerHeight.value = nextHeight
  return { width: nextWidth, height: nextHeight, changed }
}

const beginTransition = () => {
  isTransitioning.value = true
  if (transitionFrameId !== null) {
    cancelAnimationFrame(transitionFrameId)
    transitionFrameId = null
  }
}

const finishTransition = () => {
  if (transitionFrameId !== null) {
    cancelAnimationFrame(transitionFrameId)
  }
  transitionFrameId = requestAnimationFrame(() => {
    transitionFrameId = requestAnimationFrame(() => {
      isTransitioning.value = false
      transitionFrameId = null
    })
  })
}

const createLayoutConfig = () => {
  const width = Math.max(containerWidth.value, 980)
  const height = Math.max(containerHeight.value, 620)
  const center: [number, number] = [width / 2, height / 2]
  if (props.layoutMode === 'network') {
    const currentDensity = densityConfig.value
    return {
      type: 'concentric',
      width,
      height,
      center,
      preventOverlap: true,
      nodeSize: 28,
      nodeSpacing: currentDensity.nodeSpacing,
      sweep: currentDensity.sweep,
      equidistant: true,
      sortBy: 'degree'
    }
  }
  if (props.layoutMode === 'ring') {
    const currentDensity = densityConfig.value
    return {
      type: 'circular',
      width,
      height,
      center,
      startAngle: -Math.PI / 2,
      endAngle: -Math.PI / 2 + currentDensity.sweep
    }
  }
  if (props.layoutMode === 'grid') {
    const currentDensity = densityConfig.value
    const baseCols = Math.max(Math.ceil(Math.sqrt(Math.max(props.nodes.length, 1))), 3)
    return {
      type: 'grid',
      width,
      height,
      center,
      preventOverlap: true,
      cols: Math.max(baseCols + currentDensity.gridColsBoost, 2)
    }
  }
  return undefined
}

const createGraphOptions = () => ({
  container: graphContainerRef.value as HTMLDivElement,
  width: containerWidth.value,
  height: containerHeight.value,
  autoFit: false,
  animation: false,
  data: graphData.value,
  layout: createLayoutConfig(),
  node: {
    type: 'circle',
    style: {
      size: (datum: NodeData) => circleSize(Number(datum.data?.degree || 1), Number(datum.data?.factCount || 1)),
      lineWidth: 1.2,
      fill: (datum: NodeData) => `${entityColor(String(datum.data?.entityType || 'ENTITY'))}16`,
      stroke: (datum: NodeData) => entityColor(String(datum.data?.entityType || 'ENTITY')),
      shadowColor: 'rgba(59, 130, 246, 0.12)',
      shadowBlur: isHeavyGraph.value ? 0 : 8,
      shadowOffsetY: 2,
      halo: !isHeavyGraph.value,
      haloLineWidth: isHeavyGraph.value ? 0 : 4,
      haloStroke: (datum: NodeData) => entityColor(String(datum.data?.entityType || 'ENTITY')),
      haloStrokeOpacity: isHeavyGraph.value ? 0 : 0.06,
      label: true,
      labelText: (datum: NodeData) =>
        shouldShowDefaultLabel(Number(datum.data?.degree || 0), Number(datum.data?.factCount || 0))
          ? String(datum.data?.shortLabel || '')
          : '',
      labelPlacement: 'right',
      labelOffsetX: 7,
      labelFontWeight: 600,
      labelFontSize: (datum: NodeData) => Number(datum.data?.degree || 0) >= 6 ? 13 : 11,
      labelFill: '#334155',
      labelMaxWidth: 180
    },
    state: {
      selected: { lineWidth: 2.4, haloStrokeOpacity: 0.22, shadowBlur: 14, opacity: 1 },
      related: { lineWidth: 1.8, haloStrokeOpacity: 0.14, opacity: 1 },
      active: { haloStrokeOpacity: 0.12, shadowBlur: 12, opacity: 1 },
      dimmed: { opacity: 0.1 }
    }
  },
  edge: {
    type: isHeavyGraph.value ? 'line' : 'quadratic',
    style: {
      stroke: (datum: EdgeData) => edgeColor(String(datum.data?.relationType || 'co_occurrence')),
      lineWidth: (datum: EdgeData) => Math.max(1, Math.min(isHeavyGraph.value ? 1.6 : 2.4, Number(datum.data?.weight || 1) * 0.85)),
      lineCap: 'round',
      opacity: 0.08,
      pointerEvents: disableEdgeInteraction.value ? 'none' : 'visiblestroke'
    },
    state: {
      selected: { lineWidth: 3, opacity: 0.75 },
      related: { opacity: 0.24 },
      active: { opacity: 0.18 },
      dimmed: { opacity: 0.02 }
    }
  },
  behaviors: [
    'drag-canvas',
    'zoom-canvas',
    'drag-element',
    'optimize-viewport-transform',
    {
      type: 'auto-adapt-label',
      padding: [10, 20, 10, 20],
      // 按业务价值优先显示高连接、高事实量实体标签，避免大图时标签噪声淹没重点节点。
      sortNode: (left: NodeData, right: NodeData) =>
        compareScore(
          entityNodeScore(Number(right.data?.degree || 0), Number(right.data?.factCount || 0)),
          entityNodeScore(Number(left.data?.degree || 0), Number(left.data?.factCount || 0))
        )
    }
  ]
})

const bindGraphEvents = () => {
  if (!graphInstance) return
  graphInstance.on('node:click', (event: any) => {
    const id = String(event?.target?.id || '')
    if (id) emit('select-node', id)
  })
  graphInstance.on('edge:click', (event: any) => {
    const id = String(event?.target?.id || '')
    if (id) emit('select-edge', id)
  })
  graphInstance.on('canvas:click', () => emit('clear-selection'))
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

  const token = ++renderToken
  beginTransition()
  measureContainerSize()
  if (!graphInstance) {
    graphInstance = new G6Graph(createGraphOptions() as any)
    bindGraphEvents()
  } else {
    graphInstance.setSize(containerWidth.value, containerHeight.value)
    graphInstance.setData(graphData.value)
    graphInstance.setLayout(createLayoutConfig() as any)
  }

  await graphInstance.render()
  if (token !== renderToken) {
    graphInstance.destroy()
    graphInstance = null
    finishTransition()
    return
  }
  await graphInstance.fitView({ when: 'overflow' }, viewTransition)
  await applySelectionState()
  finishTransition()
}

const applySelectionState = async () => {
  if (!graphInstance) return
  const states: Record<string, string[]> = {}
  const nodeIds = props.nodes.map((item) => item.id)
  const edgeIds = props.edges.map((item) => item.id)

  if (!props.selectedNodeId && !props.selectedEdgeId) {
    ;[...nodeIds, ...edgeIds].forEach((id) => {
      states[id] = []
    })
    await graphInstance.setElementState(states, false)
    return
  }

  const relatedNodeIds = new Set<string>()
  const relatedEdgeIds = new Set<string>()

  if (props.selectedNodeId) {
    relatedNodeIds.add(props.selectedNodeId)
    for (const edge of props.edges) {
      if (edge.sourceId === props.selectedNodeId || edge.targetId === props.selectedNodeId) {
        relatedEdgeIds.add(edge.id)
        relatedNodeIds.add(edge.sourceId)
        relatedNodeIds.add(edge.targetId)
      }
    }
  }
  if (props.selectedEdgeId) {
    relatedEdgeIds.add(props.selectedEdgeId)
    const edge = props.edges.find((item) => item.id === props.selectedEdgeId)
    if (edge) {
      relatedNodeIds.add(edge.sourceId)
      relatedNodeIds.add(edge.targetId)
    }
  }

  nodeIds.forEach((id) => {
    if (props.selectedNodeId === id) states[id] = ['selected']
    else if (relatedNodeIds.has(id)) states[id] = ['related']
    else states[id] = ['dimmed']
  })
  edgeIds.forEach((id) => {
    if (props.selectedEdgeId === id) states[id] = ['selected']
    else if (relatedEdgeIds.has(id)) states[id] = ['related']
    else states[id] = ['dimmed']
  })
  await graphInstance.setElementState(states, false)
}

watch(
  [() => props.nodes, () => props.edges, () => props.layoutMode, () => props.densityMode],
  async () => {
    await nextTick()
    await initGraph()
  },
  { deep: true }
)

watch(
  [() => props.selectedNodeId, () => props.selectedEdgeId],
  async () => {
    await applySelectionState()
  }
)

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    if (resizeFrameId !== null) {
      cancelAnimationFrame(resizeFrameId)
    }
    resizeFrameId = requestAnimationFrame(() => {
      resizeFrameId = null
      const { width, height, changed } = measureContainerSize()
      if (!changed || !graphInstance) return
      graphInstance.setSize(width, height)
      void graphInstance.fitView({ when: 'overflow' })
    })
  })
  await nextTick()
  if (graphContainerRef.value) {
    resizeObserver.observe(graphContainerRef.value)
  }
  await initGraph()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeFrameId !== null) {
    cancelAnimationFrame(resizeFrameId)
    resizeFrameId = null
  }
  if (transitionFrameId !== null) {
    cancelAnimationFrame(transitionFrameId)
    transitionFrameId = null
  }
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
  height: 100%;
  min-height: 0;
}

.graph-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  height: 100%;
  border-radius: 24px;
  border: 1px solid rgba(191, 219, 254, 0.52);
  background:
    radial-gradient(circle at 18% 16%, rgba(56, 189, 248, 0.12), transparent 28%),
    radial-gradient(circle at 82% 14%, rgba(96, 165, 250, 0.1), transparent 24%),
    radial-gradient(circle at 72% 78%, rgba(168, 85, 247, 0.08), transparent 26%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 248, 252, 0.98) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 24px 60px rgba(148, 163, 184, 0.12);
  overflow: hidden;
  transition:
    opacity 420ms ease,
    transform 620ms cubic-bezier(0.18, 0.92, 0.24, 1),
    filter 620ms ease;
  will-change: transform, opacity, filter;
  transform-origin: 54% 46%;
}

.graph-container.transitioning {
  opacity: 0.72;
  transform: translate3d(16px, 10px, 0) scale(1.018);
  filter: saturate(0.98) blur(0.5px);
}

.graph-empty {
  min-height: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
