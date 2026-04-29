<template>
  <div v-if="!renderableData.nodes.length" class="constellation-empty">
    <el-empty description="当前筛选条件下暂无可展示的星图" />
  </div>
  <div v-else ref="wrapperRef" class="constellation-shell" @contextmenu.prevent>
    <canvas ref="canvasRef" class="constellation-canvas"></canvas>
    <div class="constellation-hud">
      <span>滚轮缩放</span>
      <span>拖动画布</span>
      <span>悬停联动</span>
      <span>点击锁定关联</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MemoryFactVisualizationData } from '@/utils/memoryFactVisualization'
import { buildRenderableGraphData, relationCategory } from '@/utils/memoryFactVisualization'

const props = defineProps<{
  data: MemoryFactVisualizationData
  selectedNodeId: string | null
  maxNodes: number | null
  showLabels: boolean
}>()

const emit = defineEmits<{
  (e: 'select-node', id: string): void
  (e: 'hover-node', payload: { id: string; x: number; y: number }): void
  (e: 'clear-hover'): void
  (e: 'clear-selection'): void
}>()

interface PreparedNode {
  id: string
  shortLabel: string
  fullLabel: string
  color: string
  heatColor: string
  wx: number
  wy: number
  linkCount: number
  degree: number
  factCount: number
}

interface PreparedLink {
  id: string
  a: number
  b: number
  color: string
  width: number
  category: RelationVisualCategory
}

type RelationVisualCategory = 'semantic' | 'temporal' | 'entity' | 'causal'

const wrapperRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const renderableData = computed(() =>
  buildRenderableGraphData(props.data, {
    maxNodes: props.maxNodes,
    selectedNodeId: props.selectedNodeId
  })
)

const lerp = (from: number, to: number, factor: number) => from + (to - from) * factor
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp01(value), 3)

const heatColor = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value))
  const stops = [
    [56, 130, 220],
    [170, 130, 200],
    [240, 100, 60]
  ]
  const segment = clamped * (stops.length - 1)
  const leftIndex = Math.min(Math.floor(segment), stops.length - 2)
  const ratio = segment - leftIndex
  const left = stops[leftIndex]
  const right = stops[leftIndex + 1]
  const red = Math.round(left[0] + (right[0] - left[0]) * ratio)
  const green = Math.round(left[1] + (right[1] - left[1]) * ratio)
  const blue = Math.round(left[2] + (right[2] - left[2]) * ratio)
  return `rgb(${red}, ${green}, ${blue})`
}

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return hash
}

const relationDashPattern = (category: RelationVisualCategory) => {
  switch (category) {
    case 'temporal':
      return [10, 6]
    case 'entity':
      return [3, 5]
    case 'causal':
      return [14, 6, 3, 6]
    default:
      return []
  }
}

const preparedGraph = computed(() => {
  const nodes = renderableData.value.nodes
  const links = renderableData.value.links
  const nodeIndexMap = new Map<string, number>()
  const linkCounts = new Map<string, number>()

  nodes.forEach((item, index) => {
    nodeIndexMap.set(item.id, index)
    linkCounts.set(item.id, 0)
  })

  links.forEach((item) => {
    linkCounts.set(item.source, (linkCounts.get(item.source) || 0) + 1)
    linkCounts.set(item.target, (linkCounts.get(item.target) || 0) + 1)
  })

  let maxLinkCount = 1
  for (const count of linkCounts.values()) {
    maxLinkCount = Math.max(maxLinkCount, count)
  }

  const preparedNodes: PreparedNode[] = nodes.map((item, index) => {
    const seed = hashString(item.id)
    const count = Math.max(nodes.length, 1)
    const angle = (index / count) * Math.PI * 2 + ((seed % 100) / 100) * 0.5
    const baseRadius = Math.sqrt(count) * 34
    const radius = baseRadius * 0.3 + ((Math.abs(seed) % 1000) / 1000) * baseRadius * 0.7
    const linkCount = linkCounts.get(item.id) || 0
    return {
      id: item.id,
      shortLabel: item.shortLabel || item.label,
      fullLabel: item.label,
      color: item.color,
      heatColor: heatColor(Math.sqrt(linkCount / maxLinkCount)),
      wx: Math.cos(angle) * radius + ((seed % 200) - 100) * 0.5,
      wy: Math.sin(angle) * radius + (((seed >> 8) % 200) - 100) * 0.5,
      linkCount,
      degree: item.degree,
      factCount: item.factCount
    }
  })

  const linksByNode = new Map<number, number[]>()
  const preparedLinks: PreparedLink[] = []
  links.forEach((item) => {
    const leftIndex = nodeIndexMap.get(item.source)
    const rightIndex = nodeIndexMap.get(item.target)
    if (leftIndex === undefined || rightIndex === undefined) return
    const currentIndex = preparedLinks.length
    preparedLinks.push({
      id: item.id,
      a: leftIndex,
      b: rightIndex,
      color: item.color,
      width: Math.max(1, Number(item.width || item.weight || 1)),
      category: relationCategory(item.type) as RelationVisualCategory
    })
    if (!linksByNode.has(leftIndex)) linksByNode.set(leftIndex, [])
    if (!linksByNode.has(rightIndex)) linksByNode.set(rightIndex, [])
    linksByNode.get(leftIndex)!.push(currentIndex)
    linksByNode.get(rightIndex)!.push(currentIndex)
  })

  const revealRanks = new Int16Array(preparedNodes.length)
  preparedNodes
    .map((item, index) => ({
      index,
      linkCount: item.linkCount,
      factCount: item.factCount
    }))
    .sort((left, right) => {
      const linkDelta = right.linkCount - left.linkCount
      if (linkDelta !== 0) return linkDelta
      const factDelta = right.factCount - left.factCount
      if (factDelta !== 0) return factDelta
      return left.index - right.index
    })
    .forEach((item, rank) => {
      revealRanks[item.index] = rank
    })

  return {
    nodes: preparedNodes,
    links: preparedLinks,
    linksByNode,
    revealRanks
  }
})

/**
 * 星图里的悬停与选中共用一套邻接关系收集逻辑，
 * 这样点击锁定后也能持续看清与当前节点直接相关的对象和连线。
 */
const collectRelationState = (nodeIndex: number) => {
  const linkIndexes = new Set<number>()
  const neighborIndexes = new Set<number>()
  const semanticNeighborIndexes = new Set<number>()
  if (nodeIndex < 0) {
    return { linkIndexes, neighborIndexes, semanticNeighborIndexes }
  }
  for (const linkIndex of preparedGraph.value.linksByNode.get(nodeIndex) || []) {
    const link = preparedGraph.value.links[linkIndex]
    if (!link) continue
    linkIndexes.add(linkIndex)
    const neighborIndex = link.a === nodeIndex ? link.b : link.a
    neighborIndexes.add(neighborIndex)
    if (link.category === 'semantic') {
      semanticNeighborIndexes.add(neighborIndex)
    }
  }
  return { linkIndexes, neighborIndexes, semanticNeighborIndexes }
}

const state = {
  panX: 0,
  panY: 0,
  targetPanX: 0,
  targetPanY: 0,
  zoom: 0.68,
  targetZoom: 0.68,
  width: 0,
  height: 0,
  dpr: 1,
  mouseX: -1,
  mouseY: -1,
  hoverIndex: -1,
  isDragging: false,
  dragMoved: false,
  dragStartX: 0,
  dragStartY: 0,
  panStartX: 0,
  panStartY: 0,
  introStartedAt: 0
}

let animationFrameId: number | null = null
let resizeObserver: ResizeObserver | null = null
let lastHoverNodeId = ''
let lastHoverX = -1
let lastHoverY = -1
let observedWrapper: HTMLDivElement | null = null

const resizeCanvas = () => {
  const canvas = canvasRef.value
  const wrapper = wrapperRef.value
  if (!canvas || !wrapper) return
  const rect = wrapper.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  state.width = rect.width
  state.height = rect.height
  state.dpr = dpr
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
}

const drawFrame = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return
  const now = performance.now()

  state.panX = lerp(state.panX, state.targetPanX, 0.12)
  state.panY = lerp(state.panY, state.targetPanY, 0.12)
  state.zoom = lerp(state.zoom, state.targetZoom, 0.12)

  const width = state.width
  const height = state.height
  const dpr = state.dpr
  const centerX = width / 2 + state.panX
  const centerY = height / 2 + state.panY

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.scale(dpr, dpr)

  const background = context.createLinearGradient(0, 0, 0, height)
  background.addColorStop(0, '#ffffff')
  background.addColorStop(1, '#f7fafc')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  const screenX = new Float32Array(preparedGraph.value.nodes.length)
  const screenY = new Float32Array(preparedGraph.value.nodes.length)
  const visible = new Uint8Array(preparedGraph.value.nodes.length)
  const revealProgress = new Float32Array(preparedGraph.value.nodes.length)
  const introElapsed = state.introStartedAt > 0 ? now - state.introStartedAt : Number.MAX_SAFE_INTEGER
  const revealDelayMs = 18
  const revealDurationMs = 320
  const margin = 56

  for (let index = 0; index < preparedGraph.value.nodes.length; index++) {
    const node = preparedGraph.value.nodes[index]
    const revealRank = preparedGraph.value.revealRanks[index] || 0
    const reveal = easeOutCubic((introElapsed - revealRank * revealDelayMs) / revealDurationMs)
    revealProgress[index] = reveal
    const sx = centerX + node.wx * state.zoom
    const sy = centerY + node.wy * state.zoom
    screenX[index] = sx
    screenY[index] = sy
    visible[index] = reveal > 0.02 && sx > -margin && sx < width + margin && sy > -margin && sy < height + margin ? 1 : 0
  }

  if (state.mouseX >= 0 && !state.isDragging) {
    let bestDistance = state.zoom > 1.4 ? 80 : 28
    let bestIndex = -1
    for (let index = 0; index < preparedGraph.value.nodes.length; index++) {
      if (!visible[index] || revealProgress[index] < 0.7) continue
      const dx = state.mouseX - screenX[index]
      const dy = state.mouseY - screenY[index]
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }
    state.hoverIndex = bestIndex
  }

  const selectedIndex = preparedGraph.value.nodes.findIndex((item) => item.id === props.selectedNodeId)
  const selectedRelationState = collectRelationState(selectedIndex)
  const focusIndex = state.hoverIndex >= 0 ? state.hoverIndex : selectedIndex
  const focusRelationState = focusIndex === selectedIndex ? selectedRelationState : collectRelationState(focusIndex)

  if (state.hoverIndex >= 0) {
    const hoveredNode = preparedGraph.value.nodes[state.hoverIndex]
    const hoverX = Math.round(screenX[state.hoverIndex])
    const hoverY = Math.round(screenY[state.hoverIndex])
    if (hoveredNode && (hoveredNode.id !== lastHoverNodeId || Math.abs(hoverX - lastHoverX) > 1 || Math.abs(hoverY - lastHoverY) > 1)) {
      lastHoverNodeId = hoveredNode.id
      lastHoverX = hoverX
      lastHoverY = hoverY
      emit('hover-node', {
        id: hoveredNode.id,
        x: hoverX,
        y: hoverY
      })
    }
  } else if (lastHoverNodeId) {
    lastHoverNodeId = ''
    lastHoverX = -1
    lastHoverY = -1
    emit('clear-hover')
  }

  context.lineCap = 'round'
  context.lineJoin = 'round'
  preparedGraph.value.links.forEach((link, index) => {
    const leftX = screenX[link.a]
    const leftY = screenY[link.a]
    const rightX = screenX[link.b]
    const rightY = screenY[link.b]
    if (!visible[link.a] && !visible[link.b]) return
    const reveal = Math.min(revealProgress[link.a], revealProgress[link.b])
    if (reveal <= 0.04) return

    const isFocusedLink = focusRelationState.linkIndexes.has(index)
    const isSelectedLink = selectedRelationState.linkIndexes.has(index)
    const baseLineWidth = 0.8 + link.width * 0.42
    context.lineWidth = isFocusedLink ? baseLineWidth + 1.5 : isSelectedLink ? baseLineWidth + 0.5 : baseLineWidth
    context.strokeStyle = link.color
    context.setLineDash(relationDashPattern(link.category))
    context.globalAlpha = (
      focusIndex >= 0
        ? isFocusedLink
          ? 0.92
          : isSelectedLink
            ? 0.24
            : 0.035
        : 0.12 + Math.min(link.width * 0.04, 0.14) + Math.min(state.zoom * 0.03, 0.08)
    ) * reveal
    context.shadowColor = isFocusedLink ? link.color : 'transparent'
    context.shadowBlur = isFocusedLink ? 12 : 0
    context.beginPath()
    context.moveTo(leftX, leftY)
    context.quadraticCurveTo((leftX + rightX) / 2 + (rightY - leftY) * 0.08, (leftY + rightY) / 2 - (rightX - leftX) * 0.08, rightX, rightY)
    context.stroke()
    context.shadowBlur = 0
    context.setLineDash([])
  })
  context.globalAlpha = 1

  const wrapLabelLines = (label: string, maxWidth: number, maxLines: number) => {
    const normalized = label.trim()
    if (!normalized) return []
    const lines: string[] = []
    let current = ''
    for (const char of normalized) {
      const candidate = current + char
      if (context.measureText(candidate).width <= maxWidth || !current) {
        current = candidate
        continue
      }
      lines.push(current)
      current = char
      if (lines.length >= maxLines - 1) break
    }
    if (current && lines.length < maxLines) {
      lines.push(current)
    }
    const consumedLength = lines.join('').length
    if (consumedLength < normalized.length && lines.length) {
      const lastIndex = lines.length - 1
      let lastLine = lines[lastIndex]
      while (lastLine.length > 1 && context.measureText(`${lastLine}…`).width > maxWidth) {
        lastLine = lastLine.slice(0, -1)
      }
      lines[lastIndex] = `${lastLine}…`
    }
    return lines
  }

  const labelGrid = new Set<string>()
  const labelGridCell = 88

  const canPlaceLabel = (left: number, top: number, boxWidth: number, boxHeight: number) => {
    const colStart = Math.floor(left / labelGridCell)
    const colEnd = Math.floor((left + boxWidth) / labelGridCell)
    const rowStart = Math.floor(top / labelGridCell)
    const rowEnd = Math.floor((top + boxHeight) / labelGridCell)
    for (let col = colStart; col <= colEnd; col++) {
      for (let row = rowStart; row <= rowEnd; row++) {
        if (labelGrid.has(`${col},${row}`)) return false
      }
    }
    return true
  }

  const claimLabel = (left: number, top: number, boxWidth: number, boxHeight: number) => {
    const colStart = Math.floor(left / labelGridCell)
    const colEnd = Math.floor((left + boxWidth) / labelGridCell)
    const rowStart = Math.floor(top / labelGridCell)
    const rowEnd = Math.floor((top + boxHeight) / labelGridCell)
    for (let col = colStart; col <= colEnd; col++) {
      for (let row = rowStart; row <= rowEnd; row++) {
        labelGrid.add(`${col},${row}`)
      }
    }
  }

  const drawNodeLabel = (node: PreparedNode, x: number, y: number, radius: number, hovered = false, selected = false) => {
    if (hovered || selected) {
      context.font = '11px "Segoe UI", sans-serif'
      const lines = wrapLabelLines(node.fullLabel, 188, hovered ? 4 : 3)
      if (!lines.length) return true
      const lineHeight = 14
      const boxWidth = Math.min(212, Math.max(...lines.map((line) => context.measureText(line).width)) + 18)
      const boxHeight = lines.length * lineHeight + 14
      const boxLeft = x - 8
      const boxTop = y - 16

      claimLabel(boxLeft, boxTop, boxWidth, boxHeight)
      context.fillStyle = hovered ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.92)'
      context.strokeStyle = hovered ? 'rgba(96,165,250,0.9)' : 'rgba(226,232,240,0.95)'
      context.lineWidth = hovered ? 1.2 : 1
      context.beginPath()
      context.roundRect(boxLeft, boxTop, boxWidth, boxHeight, 8)
      context.fill()
      context.stroke()
      context.fillStyle = hovered ? '#111827' : '#334155'
      lines.forEach((line, lineIndex) => {
        context.fillText(line, boxLeft + 9, boxTop + 10 + (lineIndex + 1) * lineHeight - 4)
      })
      return true
    }

    context.font = '11px "Segoe UI", sans-serif'
    const inlineLabel = node.shortLabel
    const textWidth = context.measureText(inlineLabel).width
    const textLeft = x + radius + 6
    const textTop = y - 10
    const boxWidth = textWidth + 8
    const boxHeight = 18
    if (!canPlaceLabel(textLeft, textTop, boxWidth, boxHeight)) {
      return false
    }
    claimLabel(textLeft, textTop, boxWidth, boxHeight)
    context.fillStyle = 'rgba(51,65,85,0.42)'
    context.fillText(inlineLabel, textLeft, y + 4)
    return true
  }

  /**
   * 点击节点后，为一跳关联节点展示更紧凑的标签气泡，
   * 让用户不用逐个悬停也能直接看到“当前节点关联了谁”。
   */
  const drawRelatedNodeLabel = (node: PreparedNode, x: number, y: number, radius: number) => {
    context.font = '11px "Segoe UI", sans-serif'
    const lines = wrapLabelLines(node.fullLabel, 132, 2)
    if (!lines.length) return false
    const lineHeight = 13
    const boxWidth = Math.min(150, Math.max(...lines.map((line) => context.measureText(line).width)) + 16)
    const boxHeight = lines.length * lineHeight + 12
    const candidates = [
      { left: x + radius + 8, top: y - boxHeight * 0.5 },
      { left: x - boxWidth - radius - 8, top: y - boxHeight * 0.5 },
      { left: x - boxWidth * 0.2, top: y - boxHeight - radius - 8 },
      { left: x - boxWidth * 0.2, top: y + radius + 8 }
    ]

    for (const candidate of candidates) {
      if (!canPlaceLabel(candidate.left, candidate.top, boxWidth, boxHeight)) {
        continue
      }
      claimLabel(candidate.left, candidate.top, boxWidth, boxHeight)
      context.fillStyle = 'rgba(255,255,255,0.94)'
      context.strokeStyle = 'rgba(203,213,225,0.92)'
      context.lineWidth = 1
      context.beginPath()
      context.roundRect(candidate.left, candidate.top, boxWidth, boxHeight, 8)
      context.fill()
      context.stroke()
      context.fillStyle = '#475569'
      lines.forEach((line, lineIndex) => {
        context.fillText(line, candidate.left + 8, candidate.top + 9 + (lineIndex + 1) * lineHeight - 4)
      })
      return true
    }

    return false
  }

  preparedGraph.value.nodes.forEach((node, index) => {
    if (!visible[index]) return
    const sx = screenX[index]
    const sy = screenY[index]
    const reveal = revealProgress[index]
    const isHovered = index === state.hoverIndex
    const isSelected = index === selectedIndex
    const isFocusedNeighbor = focusRelationState.neighborIndexes.has(index)
    const isSelectedNeighbor = selectedRelationState.neighborIndexes.has(index)
    const isSemanticSelectedNeighbor = selectedRelationState.semanticNeighborIndexes.has(index)
    const isFocusNode = index === focusIndex

    const baseRadius = 2.8 + Math.min(node.linkCount * 0.18, 2.8)
    const radiusBoost = isSelected ? 1.8 : isFocusNode ? 1.1 : isFocusedNeighbor ? 0.7 : 0
    const radius = Math.max(1.2, baseRadius * Math.min(state.zoom, 2.2) * (0.55 + reveal * 0.45) + radiusBoost)

    context.beginPath()
    context.arc(sx, sy, radius, 0, Math.PI * 2)
    context.fillStyle = node.heatColor
    context.globalAlpha = (
      focusIndex >= 0
        ? isSelected || isHovered || isFocusNode
          ? 1
          : isFocusedNeighbor
            ? 0.98
            : isSelectedNeighbor
              ? 0.46
              : 0.08
        : 0.42 + Math.min(node.linkCount * 0.04, 0.45)
    ) * reveal
    context.shadowColor = isSelected || isHovered || isFocusedNeighbor ? node.heatColor : 'transparent'
    context.shadowBlur = isSelected ? 18 : isHovered ? 14 : isFocusedNeighbor ? 9 : 0
    context.fill()
    context.shadowBlur = 0

    if (isFocusedNeighbor && !isSelected && !isHovered) {
      context.beginPath()
      context.arc(sx, sy, radius + 4, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(15,23,42,0.24)'
      context.lineWidth = 1.1
      context.globalAlpha = 0.72 * reveal
      context.stroke()
    }

    if (isSelected) {
      context.beginPath()
      context.arc(sx, sy, radius + 5, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(15,23,42,0.76)'
      context.lineWidth = 1.6
      context.globalAlpha = 0.9
      context.stroke()
    }

    if (reveal > 0.84 && node.linkCount > 3 && !isHovered && !isSelected && state.hoverIndex < 0) {
      context.beginPath()
      context.arc(sx, sy, radius * 2, 0, Math.PI * 2)
      context.fillStyle = node.heatColor
      context.globalAlpha = (0.05 + Math.min(node.linkCount * 0.005, 0.08)) * reveal
      context.fill()
    }

    context.globalAlpha = 1

    const shouldShowRelatedLabel = reveal > 0.72 && selectedIndex >= 0 && isSemanticSelectedNeighbor && !isSelected && !isHovered
    if (shouldShowRelatedLabel) {
      drawRelatedNodeLabel(node, sx, sy, radius)
    }

    const shouldKeepInlineName = props.showLabels && (
      isSelectedNeighbor
      || state.zoom > 0.72
      || node.degree >= 5
      || node.factCount >= 6
    )
    const shouldShowLabel = reveal > 0.72 && (
      isSelected
      || isHovered
      || (
        !shouldShowRelatedLabel
        && shouldKeepInlineName
      )
    )
    if (shouldShowLabel) {
      drawNodeLabel(node, sx + radius + 6, sy + 4, radius, isHovered, isSelected)
    }
  })

  context.textAlign = 'left'
  context.font = '600 10px "Segoe UI", sans-serif'
  context.fillStyle = '#64748b'
  context.fillText(`${renderableData.value.nodes.length} 个节点 · ${renderableData.value.links.length} 条关系 · ${state.zoom.toFixed(2)}x`, 14, height - 16)

  context.restore()
  animationFrameId = window.requestAnimationFrame(drawFrame)
}

const bindCanvasEvents = () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
    state.targetZoom = Math.max(0.25, Math.min(2.4, state.targetZoom * zoomFactor))
  }

  const handleMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    state.mouseX = event.clientX - rect.left
    state.mouseY = event.clientY - rect.top
    if (state.isDragging) {
      const nextX = event.clientX - state.dragStartX
      const nextY = event.clientY - state.dragStartY
      if (Math.abs(nextX) > 2 || Math.abs(nextY) > 2) {
        state.dragMoved = true
      }
      state.targetPanX = state.panStartX + nextX
      state.targetPanY = state.panStartY + nextY
      canvas.style.cursor = 'grabbing'
      return
    }
    canvas.style.cursor = state.hoverIndex >= 0 ? 'pointer' : 'default'
  }

  const handleMouseDown = (event: MouseEvent) => {
    state.isDragging = true
    state.dragMoved = false
    state.dragStartX = event.clientX
    state.dragStartY = event.clientY
    state.panStartX = state.targetPanX
    state.panStartY = state.targetPanY
    canvas.style.cursor = 'grabbing'
  }

  const handleMouseUp = () => {
    const clickedIndex = state.hoverIndex
    const dragged = state.dragMoved
    state.isDragging = false
    state.dragMoved = false
    canvas.style.cursor = clickedIndex >= 0 ? 'pointer' : 'default'
    if (!dragged && clickedIndex >= 0) {
      const node = preparedGraph.value.nodes[clickedIndex]
      if (node) {
        emit('select-node', node.id)
      }
      return
    }
    if (!dragged) {
      emit('clear-selection')
    }
  }

  const handleMouseLeave = () => {
    state.mouseX = -1
    state.mouseY = -1
    state.hoverIndex = -1
    state.isDragging = false
    state.dragMoved = false
    canvas.style.cursor = 'default'
    if (lastHoverNodeId) {
      lastHoverNodeId = ''
      lastHoverX = -1
      lastHoverY = -1
      emit('clear-hover')
    }
  }

  canvas.addEventListener('wheel', handleWheel, { passive: false })
  canvas.addEventListener('mousemove', handleMouseMove)
  canvas.addEventListener('mousedown', handleMouseDown)
  canvas.addEventListener('mouseup', handleMouseUp)
  canvas.addEventListener('mouseleave', handleMouseLeave)

  return () => {
    canvas.removeEventListener('wheel', handleWheel)
    canvas.removeEventListener('mousemove', handleMouseMove)
    canvas.removeEventListener('mousedown', handleMouseDown)
    canvas.removeEventListener('mouseup', handleMouseUp)
    canvas.removeEventListener('mouseleave', handleMouseLeave)
  }
}

let unbindCanvasEvents: (() => void) | null = null

const clearCanvasRuntime = () => {
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  if (observedWrapper && resizeObserver) {
    resizeObserver.unobserve(observedWrapper)
    observedWrapper = null
  }
  unbindCanvasEvents?.()
  unbindCanvasEvents = null
  state.hoverIndex = -1
  state.mouseX = -1
  state.mouseY = -1
  state.introStartedAt = 0
  if (lastHoverNodeId) {
    lastHoverNodeId = ''
    lastHoverX = -1
    lastHoverY = -1
    emit('clear-hover')
  }
}

/**
 * 星图首屏通常会先经历一次“空态挂载 -> 数据返回后切成 canvas”的过程，
 * 这里在真正出现 canvas 后再补初始化，避免必须切换 tab 才能触发重挂载。
 */
const ensureCanvasReady = () => {
  const wrapper = wrapperRef.value
  const canvas = canvasRef.value
  if (!wrapper || !canvas) return
  if (resizeObserver && observedWrapper !== wrapper) {
    if (observedWrapper) {
      resizeObserver.unobserve(observedWrapper)
    }
    resizeObserver.observe(wrapper)
    observedWrapper = wrapper
  }
  resizeCanvas()
  if (state.introStartedAt === 0) {
    state.introStartedAt = performance.now()
  }
  if (!unbindCanvasEvents) {
    unbindCanvasEvents = bindCanvasEvents() || null
  }
  if (animationFrameId === null) {
    drawFrame()
  }
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    resizeCanvas()
  })
  ensureCanvasReady()
})

watch(
  () => renderableData.value,
  () => {
    state.hoverIndex = -1
    state.introStartedAt = performance.now()
  },
  { deep: true }
)

watch(
  () => renderableData.value.nodes.length,
  async (length) => {
    await nextTick()
    if (!length) {
      clearCanvasRuntime()
      return
    }
    ensureCanvasReady()
  }
)

onBeforeUnmount(() => {
  clearCanvasRuntime()
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<style scoped>
.constellation-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(circle at 16% 16%, rgba(0, 116, 217, 0.08), transparent 24%),
    radial-gradient(circle at 84% 12%, rgba(139, 92, 246, 0.08), transparent 26%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%);
}

.constellation-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.constellation-hud {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  font-size: 11px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.constellation-empty {
  height: 100%;
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
