/**
 * 知识图谱可视化。
 * 基于 react-force-graph-2d（Canvas 渲染），展示 LightRAG 从文档抽取的实体与关系。
 *
 * 关键点：力导向模拟在 cooldownTicks 后冻结，onEngineStop 时自动缩放到合适大小，
 * 因此节点收敛后不再漂移 —— 拖动单个节点是用户主动交互，不是「乱跳」。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { WikiSpaceKnowledgeGraphItem } from '@/src/types/knowledge'

// 实体类型 -> 颜色，按首次出现顺序从调色板分配，普通用户一眼区分不同类别。
const PALETTE = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#ca8a04']

// 需求领域实体类型 -> 中文标签。LightRAG 抽取出的类型是小写英文，这里统一转中文展示。
const TYPE_LABELS: Record<string, string> = {
  requirement: '需求',
  module: '模块',
  feature: '功能点',
  datasource: '数据来源',
  businessrule: '业务规则',
  role: '角色/干系人',
  other: '其他',
  unknown: '未分类',
}
const typeLabel = (type: string): string => TYPE_LABELS[type.toLowerCase()] || type

interface GraphNode {
  id: number
  name: string
  type: string
  color: string
  degree: number
  x?: number
  y?: number
}

// 解析 LightRAG 塞进 metadataJson 的 entityType（真实实体类别在这里，nodeType 统一是 WIKI_PAGE）。
const parseEntityType = (metadataJson: string | null | undefined): string => {
  if (!metadataJson) return ''
  try {
    const meta = JSON.parse(metadataJson)
    return typeof meta?.entityType === 'string' ? meta.entityType : ''
  } catch {
    return ''
  }
}

export const KnowledgeGraphView = ({ graph }: { graph: WikiSpaceKnowledgeGraphItem }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  // 图实例 ref，用 any 规避不同版本的泛型类型差异。
  const fgRef = useRef<any>(null)
  const [width, setWidth] = useState(800)
  const [selected, setSelected] = useState<number | null>(null)

  // 容器宽度自适应。
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // 将 LightRAG 图谱转换为 react-force-graph 需要的 { nodes, links }，并按实体类型分配颜色。
  const { data, typeColors } = useMemo(() => {
    const degree = new Map<number, number>()
    graph.edges.forEach((e) => {
      degree.set(e.fromNodeId, (degree.get(e.fromNodeId) || 0) + 1)
      degree.set(e.toNodeId, (degree.get(e.toNodeId) || 0) + 1)
    })
    const colorMap = new Map<string, string>()
    const colorFor = (t: string) => {
      if (!colorMap.has(t)) colorMap.set(t, PALETTE[colorMap.size % PALETTE.length])
      return colorMap.get(t)!
    }
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    const nodes: GraphNode[] = graph.nodes.map((n) => {
      const type = parseEntityType(n.metadataJson) || '实体'
      return { id: n.id, name: n.name, type, color: colorFor(type), degree: degree.get(n.id) || 0 }
    })
    const links = graph.edges
      .filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId))
      .map((e) => ({ source: e.fromNodeId, target: e.toNodeId }))
    return { data: { nodes, links }, typeColors: colorMap }
  }, [graph])

  // 相邻表：点击节点时高亮其直接关联。
  const adjacency = useMemo(() => {
    const map = new Map<number, Set<number>>()
    graph.edges.forEach((e) => {
      if (!map.has(e.fromNodeId)) map.set(e.fromNodeId, new Set())
      if (!map.has(e.toNodeId)) map.set(e.toNodeId, new Set())
      map.get(e.fromNodeId)!.add(e.toNodeId)
      map.get(e.toNodeId)!.add(e.fromNodeId)
    })
    return map
  }, [graph])

  const isDimmed = useCallback(
    (id: number) => selected != null && selected !== id && !adjacency.get(selected)?.has(id),
    [selected, adjacency],
  )

  // 节点绘制：圆点 + 重要/相关节点的标签。
  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = Math.min(10, 3 + Math.sqrt(node.degree) * 1.2)
      const isSel = selected === node.id
      const isNeighbor = selected != null && adjacency.get(selected)?.has(node.id)
      const dimmed = isDimmed(node.id)

      ctx.globalAlpha = dimmed ? 0.12 : 1
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
      ctx.fillStyle = node.color
      ctx.fill()
      if (isSel) {
        ctx.strokeStyle = '#111827'
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }

      // 仅给高关联或选中相关节点常驻标签，避免大量标签糊成一片。
      const showLabel = node.degree >= 4 || isSel || isNeighbor
      if (showLabel && globalScale > 0.5 && !dimmed) {
        const label = node.name.length > 12 ? node.name.slice(0, 12) + '…' : node.name
        ctx.font = '400 4px sans-serif'
        ctx.fillStyle = '#334155'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, node.x! + r + 1.5, node.y!)
      }
      ctx.globalAlpha = 1
    },
    [selected, adjacency, isDimmed],
  )

  const legend = useMemo(() => Array.from(typeColors.entries()), [typeColors])

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]"
    >
      {/* 图例 */}
      <div className="absolute left-3 top-3 z-10 flex max-w-[70%] flex-wrap gap-1.5">
        {legend.map(([type, color]) => (
          <span
            key={type}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white/85 px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] backdrop-blur"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {typeLabel(type)}
          </span>
        ))}
      </div>

      {/* 操作提示 */}
      <div className="absolute right-3 top-3 z-10 rounded-lg bg-white/85 px-2.5 py-1 text-[11px] text-[var(--color-text-tertiary)] backdrop-blur">
        拖拽节点 · 滚轮缩放 · 点击查看关联
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={width}
        height={600}
        backgroundColor="#fafbff"
        nodeRelSize={4}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
          const r = Math.min(10, 3 + Math.sqrt(node.degree) * 1.2) + 2
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
          ctx.fill()
        }}
        linkColor={(link: any) => {
          const s = typeof link.source === 'object' ? link.source.id : link.source
          const t = typeof link.target === 'object' ? link.target.id : link.target
          if (selected != null) {
            return selected === s || selected === t ? 'rgba(79,70,229,0.6)' : 'rgba(203,213,225,0.12)'
          }
          return 'rgba(148,163,184,0.35)'
        }}
        linkWidth={(link: any) => {
          const s = typeof link.source === 'object' ? link.source.id : link.source
          const t = typeof link.target === 'object' ? link.target.id : link.target
          return selected != null && (selected === s || selected === t) ? 1.5 : 0.6
        }}
        cooldownTicks={120}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
        onNodeClick={(node: GraphNode) => setSelected((prev) => (prev === node.id ? null : node.id))}
        onBackgroundClick={() => setSelected(null)}
      />

      {/* 选中节点详情条 */}
      {selected != null && (
        <SelectedBar
          node={data.nodes.find((n) => n.id === selected)!}
          neighborCount={adjacency.get(selected)?.size ?? 0}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

const SelectedBar = ({
  node,
  neighborCount,
  onClose,
}: {
  node: GraphNode
  neighborCount: number
  onClose: () => void
}) => (
  <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-white/95 px-4 py-2.5 shadow-[var(--shadow-md)] backdrop-blur">
    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: node.color }} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{node.name}</p>
      <p className="text-[11px] text-[var(--color-text-tertiary)]">
        {typeLabel(node.type)} · 关联 {neighborCount} 个节点
      </p>
    </div>
    <button
      onClick={onClose}
      className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
    >
      取消
    </button>
  </div>
)
