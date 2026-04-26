<template>
  <div v-if="!data.nodes.length" class="graph-empty">
    <el-empty description="当前筛选条件下暂无可展示的关系图" />
  </div>
  <div v-else class="graph-shell">
    <div class="graph-hud">
      <span>拖动画布</span>
      <span>滚轮缩放</span>
      <span>点击查看</span>
    </div>
    <div ref="graphContainerRef" class="graph-surface" @contextmenu.prevent></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import type { Core } from 'cytoscape'
import type {
  MemoryFactVisualizationData,
  MemoryFactVisualizationLink,
  MemoryFactVisualizationNode
} from '@/utils/memoryFactVisualization'
import { buildRenderableGraphData } from '@/utils/memoryFactVisualization'

cytoscape.use(fcose)

const props = defineProps<{
  data: MemoryFactVisualizationData
  selectedNodeId: string | null
  selectedEdgeId: string | null
  showLabels: boolean
  maxNodes: number | null
}>()

const emit = defineEmits<{
  (e: 'select-node', id: string): void
  (e: 'select-edge', id: string): void
  (e: 'hover-node', payload: { id: string; x: number; y: number }): void
  (e: 'clear-hover'): void
  (e: 'clear-selection'): void
}>()

const graphContainerRef = ref<HTMLDivElement | null>(null)

let graphInstance: Core | null = null
let resizeObserver: ResizeObserver | null = null

const renderableData = computed(() =>
  buildRenderableGraphData(props.data, {
    maxNodes: props.maxNodes,
    selectedNodeId: props.selectedNodeId,
    selectedEdgeId: props.selectedEdgeId
  })
)

const connectionCounts = computed(() => {
  const counts = new Map<string, number>()
  renderableData.value.links.forEach((link) => {
    counts.set(link.source, (counts.get(link.source) || 0) + 1)
    counts.set(link.target, (counts.get(link.target) || 0) + 1)
  })
  return counts
})

const nodeSize = (node: MemoryFactVisualizationNode) =>
  Math.max(16, Math.min(40, 16 + (connectionCounts.value.get(node.id) || 0) * 4))
const edgeWidth = (link: MemoryFactVisualizationLink) => Math.max(1, Math.min(3, link.width || link.weight || 1))

const toElements = () => {
  const nodes = renderableData.value.nodes.map((item) => ({
    data: {
      id: item.id,
      label: item.label,
      color: item.color,
      size: nodeSize(item),
      originalNode: item
    }
  }))

  const edges = renderableData.value.links.map((item) => ({
    data: {
      id: item.id,
      source: item.source,
      target: item.target,
      color: item.color,
      width: edgeWidth(item),
      originalLink: item
    }
  }))

  return [...nodes, ...edges]
}

const runLayout = () => {
  if (!graphInstance) return
  graphInstance.layout({
    name: 'fcose',
    quality: 'default',
    randomize: false,
    animate: true,
    animationDuration: 1500,
    fit: true,
    padding: 20,
    nodeSeparation: 200,
    idealEdgeLength: () => 250,
    edgeElasticity: () => 0.05,
    nestingFactor: 0.05,
    gravity: 0.05,
    numIter: 2500,
    nodeOverlap: 30,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    tile: true,
    tilingPaddingVertical: 30,
    tilingPaddingHorizontal: 30,
    uniformNodeDimensions: false,
    packComponents: false
  } as any).run()
}

const clearFocusMode = () => {
  if (!graphInstance) return
  graphInstance.elements().removeClass('focus-dimmed focus-node focus-related focus-edge')
}

const applyFocusMode = () => {
  clearFocusMode()
}

const applySelectionState = () => {
  if (!graphInstance) return
  graphInstance.elements().removeClass('selection-dimmed selection-node selection-edge selection-related-node selection-related-edge')
  if (!props.selectedNodeId && !props.selectedEdgeId) {
    clearFocusMode()
    return
  }

  graphInstance.elements().addClass('selection-dimmed')
  if (props.selectedNodeId) {
    const selectedNode = graphInstance.getElementById(props.selectedNodeId)
    if (selectedNode?.length) {
      selectedNode.removeClass('selection-dimmed').addClass('selection-node')
      selectedNode.neighborhood('node').removeClass('selection-dimmed').addClass('selection-related-node')
      selectedNode.connectedEdges().removeClass('selection-dimmed').addClass('selection-related-edge')
    }
  }

  if (props.selectedEdgeId) {
    const selectedEdge = graphInstance.getElementById(props.selectedEdgeId)
    if (selectedEdge?.length) {
      selectedEdge.removeClass('selection-dimmed').addClass('selection-edge')
      selectedEdge.connectedNodes().removeClass('selection-dimmed').addClass('selection-related-node')
    }
  }

  clearFocusMode()
}

const bindEvents = () => {
  if (!graphInstance) return

  graphInstance.on('tap', 'node', (event) => {
    const id = String(event.target.id())
    if (id) {
      emit('select-node', id)
    }
  })

  graphInstance.on('tap', 'edge', (event) => {
    const id = String(event.target.id())
    if (id) emit('select-edge', id)
  })

  graphInstance.on('tap', (event) => {
    if (event.target === graphInstance) {
      emit('clear-selection')
    }
  })

  graphInstance.on('mouseover', 'node, edge', () => {
    if (graphContainerRef.value) graphContainerRef.value.style.cursor = 'pointer'
  })

  graphInstance.on('mouseover', 'node', (event) => {
    const id = String(event.target.id())
    const position = event.target.renderedPosition()
    emit('hover-node', {
      id,
      x: Number(position?.x || 0),
      y: Number(position?.y || 0)
    })
  })

  graphInstance.on('mousemove', 'node', (event) => {
    const id = String(event.target.id())
    const position = event.target.renderedPosition()
    emit('hover-node', {
      id,
      x: Number(position?.x || 0),
      y: Number(position?.y || 0)
    })
  })

  graphInstance.on('mouseout', 'node', () => {
    emit('clear-hover')
  })

  graphInstance.on('mouseout', 'node, edge', () => {
    if (graphContainerRef.value) graphContainerRef.value.style.cursor = 'default'
  })
}

const initGraph = async () => {
  if (!graphContainerRef.value) return
  if (!renderableData.value.nodes.length) {
    if (graphInstance) {
      graphInstance.destroy()
      graphInstance = null
    }
    return
  }

  if (!graphInstance) {
    graphInstance = cytoscape({
      container: graphContainerRef.value,
      elements: toElements(),
      selectionType: 'single',
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      layout: { name: 'preset' },
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            width: 'data(size)',
            height: 'data(size)',
            label: props.showLabels ? 'data(label)' : '',
            color: '#1f2937',
            'font-size': 8,
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 3,
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'text-background-color': 'rgba(255,255,255,0.9)',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'border-width': 1,
            'border-color': 'rgba(0,0,0,0.12)',
            'border-opacity': 0.3
          }
        },
        {
          selector: 'edge',
          style: {
            width: 'data(width)',
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'target-arrow-size': 6,
            'curve-style': 'bezier',
            opacity: 0.7
          }
        },
        {
          selector: '.selection-dimmed',
          style: {
            opacity: 0.12
          }
        },
        {
          selector: 'node.selection-node',
          style: {
            'border-width': 4,
            'border-color': '#0f172a',
            'z-index': 999
          }
        },
        {
          selector: 'edge.selection-edge',
          style: {
            width: 4,
            opacity: 0.96,
            'z-index': 999
          }
        },
        {
          selector: 'node.selection-related-node',
          style: {
            'border-width': 2.4,
            'border-color': '#0074d9',
            opacity: 1
          }
        },
        {
          selector: 'edge.selection-related-edge',
          style: {
            opacity: 0.86
          }
        },
        {
          selector: '.focus-dimmed',
          style: {
            opacity: 0.08
          }
        },
        {
          selector: 'node.focus-node',
          style: {
            'border-width': 4,
            'border-color': '#f97316',
            'z-index': 998
          }
        },
        {
          selector: 'node.focus-related',
          style: {
            opacity: 1
          }
        },
        {
          selector: 'edge.focus-edge',
          style: {
            width: 3,
            opacity: 0.92
          }
        }
      ] as any
    })

    bindEvents()
  } else {
    graphInstance.elements().remove()
    graphInstance.add(toElements())
  }

  graphInstance.style()
    .selector('node')
    .style('label', props.showLabels ? 'data(label)' : '')
    .update()
  runLayout()
  applySelectionState()
}

onMounted(async () => {
  resizeObserver = new ResizeObserver(() => {
    if (!graphInstance) return
    graphInstance.resize()
    graphInstance.fit(undefined, 80)
  })

  await nextTick()
  if (graphContainerRef.value) {
    resizeObserver.observe(graphContainerRef.value)
  }
  await initGraph()
})

watch(
  [() => renderableData.value, () => props.showLabels],
  async () => {
    await nextTick()
    await initGraph()
  },
  { deep: true }
)

watch([() => props.selectedNodeId, () => props.selectedEdgeId], () => {
  applySelectionState()
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
.graph-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(206, 217, 226, 0.92);
  background-image: radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.06) 1px, transparent 0);
  background-size: 20px 20px;
  background-color: #f8fafc;
}

.graph-surface {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.graph-hud {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  font-size: 11px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.graph-empty {
  height: 100%;
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
