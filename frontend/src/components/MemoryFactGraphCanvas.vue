<template>
  <div v-if="!nodes.length" class="graph-empty">
    <el-empty description="暂无记忆事实图数据" />
  </div>
  <div v-else class="graph-panel">
    <div class="graph-legend">
      <button
        v-for="item in entityTypeOptions"
        :key="item"
        type="button"
        class="legend-item"
        :class="{ active: selectedNode?.entityType === item }"
        @click="focusFirstNode(item)"
      >
        <span class="legend-dot" :style="{ background: entityColor(item) }"></span>
        <span>{{ entityTypeLabel(item) }}</span>
      </button>
    </div>
    <div ref="graphContainerRef" class="graph-container"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ConcentricLayout, ForceLayout, Graph as G6Graph } from '@antv/g6'
import type { ComboData, EdgeData, GraphData, NodeData } from '@antv/g6'
import type { MemoryFactEdgeItem, MemoryFactNodeItem } from '@/types/platform'

type LayoutMode = 'cluster' | 'ring' | 'grid'

const props = defineProps<{
  nodes: MemoryFactNodeItem[]
  edges: MemoryFactEdgeItem[]
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
const containerHeight = ref(700)

let graphInstance: G6Graph | null = null
let resizeObserver: ResizeObserver | null = null
let renderToken = 0

const selectedNode = computed(() => props.nodes.find((item) => item.id === props.selectedNodeId) || null)

const entityTypeOptions = computed(() => {
  const values = new Set(props.nodes.map((item) => item.entityType || 'ENTITY'))
  return Array.from(values)
})

const entityColor = (entityType: string) => {
  const map: Record<string, string> = {
    ENTITY: '#4f46e5',
    LOCATION: '#0891b2',
    PERSON: '#ef4444',
    ORGANIZATION: '#16a34a',
    DOCUMENT: '#d97706',
    EVENT: '#7c3aed'
  }
  return map[entityType] || '#64748b'
}

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

const edgeColor = (relationType: string) => {
  if (relationType.includes('cause')) return '#ef4444'
  if (relationType.includes('contain')) return '#d97706'
  if (relationType.includes('co_occurrence')) return '#2563eb'
  return '#7c8ea3'
}

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value)

const comboId = (entityType: string) => `combo-${entityType.toLowerCase()}`

const graphData = computed<GraphData>(() => {
  const nodes: NodeData[] = props.nodes.map((item) => ({
    id: item.id,
    combo: props.layoutMode === 'cluster' ? comboId(item.entityType || 'ENTITY') : undefined,
    data: {
      label: item.label,
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
  const combos: ComboData[] = props.layoutMode !== 'cluster'
    ? []
    : entityTypeOptions.value.map((item) => ({
        id: comboId(item),
        data: {
          label: entityTypeLabel(item),
          entityType: item
        }
      }))
  return { nodes, edges, combos }
})

const createLayoutConfig = () => {
  const width = Math.max(containerWidth.value, 980)
  const height = Math.max(containerHeight.value, 620)
  const center: [number, number] = [width / 2, height / 2]
  if (props.layoutMode === 'ring') {
    return {
      type: 'circular',
      width,
      height,
      center,
      startAngle: -Math.PI / 2,
      endAngle: (Math.PI * 3) / 2
    }
  }
  if (props.layoutMode === 'grid') {
    return {
      type: 'grid',
      width,
      height,
      center,
      preventOverlap: true,
      cols: Math.max(Math.ceil(Math.sqrt(Math.max(props.nodes.length, 1))), 3)
    }
  }
  return {
    type: 'combo-combined',
    width,
    height,
    center,
    comboPadding: 30,
    spacing: 24,
    outerLayout: new ForceLayout({
      width,
      height,
      center,
      gravity: 0.9,
      linkDistance: 220,
      preventOverlap: true,
      nodeSize: 48
    }),
    innerLayout: new ConcentricLayout({
      width,
      height,
      center,
      nodeSpacing: 14,
      preventOverlap: true,
      sortBy: 'id'
    })
  } as any
}

const nodeWidth = (factCount: number) => Math.max(150, Math.min(220, 150 + factCount * 8))

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
  containerWidth.value = Math.max(container.clientWidth, 980)
  containerHeight.value = Math.max(container.clientHeight, 620)
  if (graphInstance) {
    graphInstance.destroy()
    graphInstance = null
  }

  graphInstance = new G6Graph({
    container,
    width: containerWidth.value,
    height: containerHeight.value,
    autoFit: 'view',
    animation: true,
    data: graphData.value,
    layout: createLayoutConfig(),
    node: {
      type: 'rect',
      style: {
        size: (datum: NodeData) => [nodeWidth(Number(datum.data?.factCount || 1)), 72],
        radius: 18,
        lineWidth: 1.8,
        fill: (datum: NodeData) => `${entityColor(String(datum.data?.entityType || 'ENTITY'))}16`,
        stroke: (datum: NodeData) => entityColor(String(datum.data?.entityType || 'ENTITY')),
        shadowColor: 'rgba(15, 23, 42, 0.08)',
        shadowBlur: 10,
        shadowOffsetY: 4,
        labelText: (datum: NodeData) => truncate(String(datum.data?.label || ''), 18),
        labelFontWeight: 700,
        labelFontSize: 14,
        labelFill: '#17324c',
        labelPlacement: 'center'
      },
      state: {
        selected: { lineWidth: 3, shadowBlur: 18, shadowColor: 'rgba(23, 50, 76, 0.18)' },
        related: { lineWidth: 2.4 },
        dimmed: { opacity: 0.22 }
      }
    },
    combo: {
      type: 'rect',
      style: {
        radius: 26,
        fill: (datum: ComboData) => `${entityColor(String(datum.data?.entityType || 'ENTITY'))}10`,
        stroke: (datum: ComboData) => `${entityColor(String(datum.data?.entityType || 'ENTITY'))}88`,
        lineWidth: 1.6,
        padding: [28, 24, 24, 24],
        labelText: (datum: ComboData) => String(datum.data?.label || ''),
        labelFill: '#385166',
        labelFontWeight: 700,
        labelPlacement: 'top'
      },
      state: {
        related: { lineWidth: 2.4 },
        dimmed: { opacity: 0.14 }
      }
    },
    edge: {
      type: 'cubic',
      style: {
        stroke: (datum: EdgeData) => edgeColor(String(datum.data?.relationType || 'co_occurrence')),
        lineWidth: (datum: EdgeData) => Math.max(1.6, Math.min(4.2, Number(datum.data?.weight || 1))),
        endArrow: true,
        opacity: 0.7
      },
      state: {
        selected: { lineWidth: 3.2, opacity: 1 },
        related: { opacity: 0.92 },
        dimmed: { opacity: 0.12 }
      }
    },
    behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element']
  } as any)

  graphInstance.on('node:click', (event: any) => {
    const id = String(event?.target?.id || '')
    if (id) emit('select-node', id)
  })
  graphInstance.on('edge:click', (event: any) => {
    const id = String(event?.target?.id || '')
    if (id) emit('select-edge', id)
  })
  graphInstance.on('canvas:click', () => emit('clear-selection'))

  await graphInstance.render()
  if (token !== renderToken) {
    graphInstance.destroy()
    graphInstance = null
    return
  }
  await graphInstance.fitView()
  await applySelectionState()
}

const applySelectionState = async () => {
  if (!graphInstance) return
  const states: Record<string, string[]> = {}
  const nodeIds = props.nodes.map((item) => item.id)
  const edgeIds = props.edges.map((item) => item.id)
  const comboIds = entityTypeOptions.value.map((item) => comboId(item))

  if (!props.selectedNodeId && !props.selectedEdgeId) {
    ;[...nodeIds, ...edgeIds, ...comboIds].forEach((id) => {
      states[id] = []
    })
    await graphInstance.setElementState(states, false)
    return
  }

  const relatedNodeIds = new Set<string>()
  const relatedEdgeIds = new Set<string>()
  const relatedComboIds = new Set<string>()

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
  for (const node of props.nodes) {
    if (relatedNodeIds.has(node.id)) {
      relatedComboIds.add(comboId(node.entityType || 'ENTITY'))
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
  comboIds.forEach((id) => {
    states[id] = relatedComboIds.has(id) ? ['related'] : ['dimmed']
  })
  await graphInstance.setElementState(states, false)
}

const focusFirstNode = (entityType: string) => {
  const target = props.nodes.find((item) => item.entityType === entityType)
  if (target) emit('select-node', target.id)
}

watch(
  [() => props.nodes, () => props.edges, () => props.layoutMode, containerWidth, containerHeight],
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
    const container = graphContainerRef.value
    if (!container) return
    containerWidth.value = Math.max(container.clientWidth, 980)
    containerHeight.value = Math.max(container.clientHeight, 620)
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
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(206, 217, 226, 0.92);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #3f5568;
  font-size: 12px;
  font-weight: 700;
}

.legend-item.active {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(233, 241, 255, 0.9);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.graph-container {
  width: 100%;
  min-height: 700px;
  border-radius: 20px;
  border: 1px solid rgba(209, 219, 229, 0.92);
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.08), transparent 24%),
    radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.08), transparent 24%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 250, 253, 0.98) 100%);
  overflow: hidden;
}

.graph-empty {
  min-height: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
