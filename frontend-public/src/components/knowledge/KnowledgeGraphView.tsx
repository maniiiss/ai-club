/**
 * 知识图谱可视化 + 搜索召回。
 * 基于 react-force-graph-2d（Canvas 渲染），展示 LightRAG 从文档抽取的实体与关系。
 *
 * 关键点：
 * 1. 力导向模拟在 cooldownTicks 后冻结，onEngineStop 时自动缩放，节点收敛后不再漂移。
 * 2. 搜索召回是纯前端计算（图谱数据已全部在内存）：输入查询词 → 三段召回
 *    （命中实体 / 关联关系 / 来源文档），右侧抽屉展示，命中节点在图上高亮联动。
 *    之所以不走后端 LightRAG query：当前抽取 LLM（ark-code-latest）不支持 json_object，
 *    其 mix/local 检索模式无法工作，而图谱实体/关系本就已加载到前端，本地匹配更快更稳。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ForceGraph2D from 'react-force-graph-2d'
import { Search, X } from 'lucide-react'
import { Input } from '@/src/components/common/Input'
import { Markdown } from '@/src/components/common/Markdown'
import { getWikiPage } from '@/src/api/knowledge'
import type { WikiSpaceKnowledgeGraphItem } from '@/src/types/knowledge'
import { cn } from '@/src/lib/utils'

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
  description: string
  // 由实体 sourceId 反解出的来源页面 id 列表，用于「来源文档」召回段。
  pageIds: number[]
  // 邻域实体（度最高的 2-3 个），用于召回卡片展示链路。
  neighbors: Array<{ id: number; name: string; type: string; color: string }>
  x?: number
  y?: number
}

// 解析 LightRAG 塞进 metadataJson 的字段：entityType（实体类别）、sourceId（来源 chunk）、description（实体描述）。
const parseNodeMeta = (metadataJson: string | null | undefined): { entityType: string; sourceId: string; description: string } => {
  if (!metadataJson) return { entityType: '', sourceId: '', description: '' }
  try {
    const meta = JSON.parse(metadataJson)
    return {
      entityType: typeof meta?.entityType === 'string' ? meta.entityType : '',
      sourceId: typeof meta?.sourceId === 'string' ? meta.sourceId : '',
      description: typeof meta?.description === 'string' ? meta.description : '',
    }
  } catch {
    return { entityType: '', sourceId: '', description: '' }
  }
}

// 从 sourceId（形如 "wiki:space:5:21-chunk-001<SEP>wiki:space:5:21-chunk-000"）提取来源页面 id。
const pageIdsFromSourceId = (sourceId: string): number[] => {
  const ids = new Set<number>()
  for (const m of sourceId.matchAll(/(\d+)-chunk-\d+/g)) {
    ids.add(Number(m[1]))
  }
  return [...ids]
}

// 英文关系描述翻译：匹配常见句式模板，转换为中文
const translateRelation = (text: string): string => {
  if (!text) return text

  // 句式模板：英文 → 中文（按优先级排序）
  const patterns: Array<[RegExp, string]> = [
    [/\bdescribes\b/gi, '**描述了**'],
    [/\bdepends on\b/gi, '**依赖于**'],
    [/\bcontains and implements\b/gi, '**包含并实现了**'],
    [/\bcontains\b/gi, '**包含**'],
    [/\bimplements\b/gi, '**实现了**'],
    [/\bis related to\b/gi, '**关联**'],
    [/\bis used by\b/gi, '**被**'],
    [/\buses\b/gi, '**使用**'],
    [/\bbelongs to\b/gi, '**属于**'],
    [/\brequires\b/gi, '**需要**'],
    [/\btriggers\b/gi, '**触发**'],
    [/\bvalidates\b/gi, '**验证**'],
    [/\bconnects to\b/gi, '**连接到**'],
    [/\bsupports\b/gi, '**支持**'],
    [/\bmanages\b/gi, '**管理**'],
  ]

  let result = text
  for (const [pattern, replacement] of patterns) {
    result = result.replace(pattern, replacement)
  }

  // 如果没有任何匹配，返回原文（不翻译）
  return result === text ? text : result
}

interface SearchRelation {
  id: string
  fromName: string
  toName: string
  type: string
  description: string
}
interface SearchSource {
  pageId: number
  title: string
  entityNames: string[]
}
interface SearchResult {
  entities: GraphNode[]
  matchedIds: Set<number>
  relations: SearchRelation[]
  sources: SearchSource[]
}

export const KnowledgeGraphView = ({
  graph,
  pageMap,
  spaceId,
}: {
  graph: WikiSpaceKnowledgeGraphItem
  /** pageId -> 页面标题，用于「来源文档」召回段展示与跳转。 */
  pageMap?: Map<number, string>
  /** 当前空间 ID，用于来源文档预览 API 调用。 */
  spaceId: number
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  // 图实例 ref，用 any 规避不同版本的泛型类型差异。
  const fgRef = useRef<any>(null)
  // width/height 用 0 作为初始值，表示「尚未测量到真实容器尺寸」。
  // 必须等 ResizeObserver 测到真实尺寸后才渲染 ForceGraph2D，否则 force-graph 会以
  // 硬编码默认尺寸（如 800×600）建立画布并把节点摆放在「该尺寸的中心」，
  // 一旦后续 resize 到实际容器尺寸（如 1400×700），节点看起来就跑到左上角。
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [previewPage, setPreviewPage] = useState<{ pageId: number; title: string } | null>(null)
  // 是否已自动缩放过：只在首次布局完成 / 数据刷新后 fit 一次，
  // 避免用户拖动节点触发引擎重启 → onEngineStop 再次 zoomToFit 把手动缩放重置掉。
  const fitted = useRef(false)

  // 容器尺寸自适应：
  // - 首次挂载用 useLayoutEffect 在浏览器绘制前同步测量真实尺寸 → 一次 setState，
  //   保证 ForceGraph2D 一开始就拿到正确 width/height，避免初始/Observer 各触发一次动画。
  // - ResizeObserver 仅用于容器后续变化（如窗口缩放）的兜底；用阈值过滤掉亚像素抖动，
  //   且只在尺寸变化超过 1px 时才更新，防止小波动导致 force-graph 重启力导向模拟。
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w > 0 && h > 0) {
      setWidth(w)
      setHeight(h)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      if (w <= 0 || h <= 0) return
      setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w))
      setHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // 数据刷新时重置 fit 标记
  useEffect(() => {
    fitted.current = false
  }, [graph])

  // 将 LightRAG 图谱转换为 react-force-graph 需要的 { nodes, links }，并按实体类型分配颜色。
  const { data, typeColors, nodeById } = useMemo(() => {
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
    const byId = new Map<number, GraphNode>()
    // 第一轮：构建节点基础数据。
    // 给节点一个圆形分布的初始位置，避免堆在原点导致首帧巨大斥力造成「炸开」。
    // 半径用 √n × 40：半径足够大时，节点已经接近力导向的收敛尺度，
    // 起步阶段不需要剧烈位移，d3 alpha 高位时也不会窜动，整段动画节奏均匀。
    const total = graph.nodes.length
    const radius = 40 * Math.sqrt(Math.max(total, 1))
    const nodes: GraphNode[] = graph.nodes.map((n, i) => {
      const meta = parseNodeMeta(n.metadataJson)
      const type = meta.entityType || '实体'
      // 等角度分布在圆周上，配合微小随机扰动避免完美对称带来的同步抖动。
      const angle = (i / Math.max(total, 1)) * Math.PI * 2
      const jitter = 0.85 + Math.random() * 0.3
      const node: GraphNode = {
        id: n.id,
        name: n.name,
        type,
        color: colorFor(type),
        degree: degree.get(n.id) || 0,
        description: meta.description,
        pageIds: pageIdsFromSourceId(meta.sourceId),
        neighbors: [],
        x: Math.cos(angle) * radius * jitter,
        y: Math.sin(angle) * radius * jitter,
      }
      byId.set(n.id, node)
      return node
    })
    // 第二轮：按度（关联数）从高到低，取每个节点的 top-3 邻居展示在召回卡片。
    const adj = new Map<number, number[]>()
    graph.edges.forEach((e) => {
      if (!adj.has(e.fromNodeId)) adj.set(e.fromNodeId, [])
      if (!adj.has(e.toNodeId)) adj.set(e.toNodeId, [])
      adj.get(e.fromNodeId)!.push(e.toNodeId)
      adj.get(e.toNodeId)!.push(e.fromNodeId)
    })
    nodes.forEach((node) => {
      const neighborIds = adj.get(node.id) || []
      const ranked = neighborIds
        .map((nid) => ({ id: nid, deg: degree.get(nid) || 0 }))
        .sort((a, b) => b.deg - a.deg)
        .slice(0, 3)
      node.neighbors = ranked
        .map((r) => byId.get(r.id))
        .filter((n): n is GraphNode => n != null)
        .map((n) => ({ id: n.id, name: n.name, type: n.type, color: n.color }))
    })
    const links = graph.edges
      .filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId))
      .map((e) => ({ source: e.fromNodeId, target: e.toNodeId }))
    return { data: { nodes, links }, typeColors: colorMap, nodeById: byId }
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

  // 搜索召回：纯前端在已加载的图谱数据上做三段匹配。
  const search = useMemo<SearchResult | null>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null

    // 1) 命中实体：按 名称 > 描述 > 类型 加权打分。
    const scored = data.nodes
      .map((n) => {
        let score = 0
        const name = n.name.toLowerCase()
        if (name === q) score += 100
        else if (name.includes(q)) score += 40
        if (n.description && n.description.toLowerCase().includes(q)) score += 8
        if (typeLabel(n.type).includes(query.trim()) || n.type.toLowerCase().includes(q)) score += 4
        // 关联度高的实体更可能是用户想找的核心概念。
        score += Math.min(n.degree, 10) * 0.2
        return { n, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
    const entities = scored.map((x) => x.n)
    const matchedIds = new Set(entities.map((e) => e.id))

    // 2) 关联关系：与命中实体直接相连的边（任一端命中即纳入）。
    const relSeen = new Set<string>()
    const relations: SearchRelation[] = []
    for (const e of graph.edges) {
      if (!matchedIds.has(e.fromNodeId) && !matchedIds.has(e.toNodeId)) continue
      const key = `${e.fromNodeId}-${e.toNodeId}`
      if (relSeen.has(key)) continue
      relSeen.add(key)
      relations.push({
        id: String(e.id),
        fromName: nodeById.get(e.fromNodeId)?.name ?? `#${e.fromNodeId}`,
        toName: nodeById.get(e.toNodeId)?.name ?? `#${e.toNodeId}`,
        type: e.edgeType,
        description: translateRelation(e.evidenceText),
      })
      if (relations.length >= 40) break
    }

    // 3) 来源文档：命中实体的 sourceId 反解出的页面，按页面聚合实体名。
    const sourceMap = new Map<number, Set<string>>()
    for (const e of entities) {
      for (const pid of e.pageIds) {
        if (!sourceMap.has(pid)) sourceMap.set(pid, new Set())
        sourceMap.get(pid)!.add(e.name)
      }
    }
    const sources: SearchSource[] = [...sourceMap.entries()]
      .map(([pageId, names]) => ({
        pageId,
        title: pageMap?.get(pageId) ?? `页面 #${pageId}`,
        entityNames: [...names],
      }))
      .sort((a, b) => b.entityNames.length - a.entityNames.length)

    return { entities, matchedIds, relations, sources }
  }, [query, data, graph.edges, nodeById, pageMap])

  // 搜索命中后自动聚焦到命中实体；清空查询后恢复全图视野。
  useEffect(() => {
    if (!fgRef.current) return
    if (search && search.entities.length > 0) {
      fgRef.current.zoomToFit(500, 80, (n: GraphNode) => search.matchedIds.has(n.id))
    } else if (!search) {
      fgRef.current.zoomToFit(400, 40)
    }
  }, [search])

  // 当前需要高亮的节点集合：搜索优先，其次单击选中的邻域。
  const highlightIds = useMemo<Set<number> | null>(() => {
    if (search) return search.matchedIds
    if (selected != null) {
      const set = new Set<number>([selected])
      adjacency.get(selected)?.forEach((id) => set.add(id))
      return set
    }
    return null
  }, [search, selected, adjacency])

  // 节点绘制：圆点 + 重要/命中/相关节点的标签。
  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = Math.min(10, 3 + Math.sqrt(node.degree) * 1.2)
      const isSel = selected === node.id
      const isMatched = search?.matchedIds.has(node.id) ?? false
      const dimmed = highlightIds != null && !highlightIds.has(node.id)

      ctx.globalAlpha = dimmed ? 0.1 : 1
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
      ctx.fillStyle = node.color
      ctx.fill()
      // 搜索命中实体加一圈品牌色光环，单击选中加黑色描边。
      if (isMatched) {
        ctx.strokeStyle = '#4f46e5'
        ctx.lineWidth = 2.5 / globalScale
        ctx.stroke()
      }
      if (isSel) {
        ctx.strokeStyle = '#111827'
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }

      // 仅给高关联 / 命中 / 选中相关节点常驻标签，避免大量标签糊成一片。
      const showLabel = node.degree >= 4 || isSel || isMatched || (highlightIds?.has(node.id) ?? false)
      if (showLabel && globalScale > 0.5 && !dimmed) {
        const label = node.name.length > 12 ? node.name.slice(0, 12) + '…' : node.name
        ctx.font = `${isMatched ? 600 : 400} 4px sans-serif`
        ctx.fillStyle = '#334155'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, node.x! + r + 1.5, node.y!)
      }
      ctx.globalAlpha = 1
    },
    [selected, search, highlightIds],
  )

  const legend = useMemo(() => Array.from(typeColors.entries()), [typeColors])

  // 点击召回结果中的实体：选中 + 居中聚焦。
  const focusEntity = useCallback((id: number) => {
    setSelected(id)
    const node = data.nodes.find((n) => n.id === id)
    if (node && node.x != null && node.y != null && fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 500)
      fgRef.current.zoom(2.2, 500)
    }
  }, [data])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]"
    >
      {/* 顶部工具栏：搜索框 + 图例。抽屉打开时收窄右边界避免被遮挡。 */}
      <div className={cn('absolute left-3 top-3 z-20 flex flex-wrap items-start gap-2', search ? 'right-[396px]' : 'right-3')}>
        <div className="relative w-72">
          <Input
            size="sm"
            adaptiveIcon
            wrapperClassName="w-full"
            icon={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索需求 / 模块 / 功能点…"
            className="bg-white/90 pr-8 text-[var(--color-text-primary)] shadow-sm backdrop-blur placeholder:text-[var(--color-text-tertiary)]"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSelected(null) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* 图例 */}
        <div className="flex flex-wrap gap-1.5">
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
      </div>

      {/* 操作提示：仅在未搜索时显示。 */}
      {!search && (
        <div className="absolute bottom-3 right-3 z-10 rounded-lg bg-white/85 px-2.5 py-1 text-[11px] text-[var(--color-text-tertiary)] backdrop-blur">
          拖拽节点 · 滚轮缩放 · 点击查看关联
        </div>
      )}

      {/* 图谱主体：必须等容器测量出真实尺寸 (width > 0 && height > 0) 后再挂载。
          否则 ForceGraph2D 会用内部默认尺寸初始化画布与力导向，节点会被布局到「默认尺寸的中心」，
          后续 resize 时不会自动重排，看起来就像「卡在左上角」。 */}
      {width > 0 && height > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          width={width}
          height={height}
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
            if (highlightIds != null) {
              return highlightIds.has(s) && highlightIds.has(t) ? 'rgba(79,70,229,0.5)' : 'rgba(203,213,225,0.1)'
            }
            return 'rgba(148,163,184,0.35)'
          }}
          linkWidth={(link: any) => {
            const s = typeof link.source === 'object' ? link.source.id : link.source
            const t = typeof link.target === 'object' ? link.target.id : link.target
            return highlightIds != null && highlightIds.has(s) && highlightIds.has(t) ? 1.5 : 0.6
          }}
          // 容器尺寸正确后挂载，force-graph 以 (0,0) 为画布中心；节点带圆形分布的初始坐标，
          // 力导向从已展开状态开始平滑收敛，观感是「轻柔扩散」而非「炸开」。
          // d3AlphaDecay 调得更低 → 模拟温度衰减更缓，节点运动持续时间显著延长；
          // d3VelocityDecay 调得更高 → 速度阻尼更大，每一帧位移更小，运动更柔和；
          // 不用 warmupTicks（会把动画在用户看到之前跑完，只剩静止圆环 + 结束缩放），
          // 而是用更大的初始圆环半径让起步位移幅度天然就小，避免节点窜动。
          cooldownTicks={400}
          d3AlphaDecay={0.01}
          d3VelocityDecay={0.55}
          onEngineTick={() => {
            // 每帧持续 zoomToFit，让视图随节点散开同步缩放/平移，
            // 避免收敛完成后才一次性 zoomToFit 产生「整体突变缩放」的不顺畅感。
            // 仅在首次收敛过程中执行；用户操作（onEngineStop 后 fitted = true）后不再干扰视图。
            if (fitted.current) return
            fgRef.current?.zoomToFit(0, 40)
          }}
          onEngineStop={() => {
            if (fitted.current) return
            fitted.current = true
            // 收敛结束时再做一次 zoomToFit，确保最终视图精准；
            // 此时节点已几乎静止，瞬时缩放不会被感知为突变。
            fgRef.current?.zoomToFit(0, 40)
          }}
          onNodeClick={(node: GraphNode) => setSelected((prev) => (prev === node.id ? null : node.id))}
          onBackgroundClick={() => setSelected(null)}
        />
      )}

      {/* 搜索召回抽屉 */}
      {search && (
        <SearchDrawer
          query={query.trim()}
          result={search}
          selectedId={selected}
          onSelectEntity={focusEntity}
          onPreviewPage={(pageId, title) => setPreviewPage({ pageId, title })}
          onClose={() => { setQuery(''); setSelected(null) }}
        />
      )}

      {/* 来源文档预览弹窗 */}
      {previewPage && (
        <PagePreviewDialog
          spaceId={spaceId}
          pageId={previewPage.pageId}
          title={previewPage.title}
          onClose={() => setPreviewPage(null)}
        />
      )}

      {/* 选中节点详情条（无搜索时） */}
      {!search && selected != null && (
        <SelectedBar
          node={data.nodes.find((n) => n.id === selected)!}
          neighborCount={adjacency.get(selected)?.size ?? 0}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// 从翻译后的关系描述中提取高亮动词（去掉 ** 标记）
const extractVerb = (description: string): string => {
  const match = description.match(/\*\*(.+?)\*\*/)
  return match ? match[1] : ''
}

// 页面预览弹窗
const PagePreviewDialog = ({
  spaceId,
  pageId,
  title,
  onClose,
}: {
  spaceId: number
  pageId: number
  title: string
  onClose: () => void
}) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadContent = async () => {
      setLoading(true)
      setError(null)
      try {
        // 复用统一 http 客户端封装的接口，自动带认证头并解包 ApiResponse；
        // 之前直接用 globalThis.fetch 会返回 { code, data: {...} } 整体结构，
        // 取 data.content 拿不到内容，且缺认证可能直接 401 触发 catch 报「加载失败」。
        const page = await getWikiPage(spaceId, pageId)
        if (!cancelled) setContent(page.content || '')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadContent()
    return () => { cancelled = true }
  }, [spaceId, pageId])

  // 通过 createPortal 把弹窗挂载到 document.body：
  // 否则即便用 fixed inset-0，只要祖先节点上有 transform / filter / contain 等
  // 创建包含块的 CSS，fixed 就会退化为相对该祖先定位，弹窗会被限制在
  // KnowledgeGraphView 的容器内（且容器可能正在做收缩动画），高度变化时标题被遮挡。
  // Portal 后弹窗直接挂在 body 下，定位基于真实 viewport，永远完整可见。
  return createPortal(
    // z-[100] 高于知识图谱内部各覆盖层（工具栏 z-20、抽屉 z-30 等），
    // 确保来源文档预览始终在最顶层，不会被搜索抽屉或选中节点详情条压住。
    // 外层加 p-4 给视口留边距；弹窗本体改用 max-h-[calc(100vh-2rem)]，
    // 在浏览器变矮时能整体收缩，而不是固定 80vh 把 header 挤出视口。
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[calc(100vh-2rem)] min-h-0 w-[720px] max-w-full flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 shrink-0：在浏览器变矮、容器整体收缩时不会被 flex 压缩成 0 而看不见。 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <button onClick={onClose} className="shrink-0 rounded p-1 hover:bg-[var(--color-bg-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[var(--color-text-tertiary)]">
              加载中...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-[var(--color-danger)]">
              {error}
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <Markdown content={content} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** 右侧搜索召回抽屉：命中实体 / 关联关系 / 来源文档 三段。 */
const SearchDrawer = ({
  query,
  result,
  selectedId,
  onSelectEntity,
  onPreviewPage,
  onClose,
}: {
  query: string
  result: SearchResult
  selectedId: number | null
  onSelectEntity: (id: number) => void
  onPreviewPage?: (pageId: number, title: string) => void
  onClose: () => void
}) => {
  const empty = result.entities.length === 0
  return (
    <div className="absolute right-0 top-0 z-30 flex h-full w-[384px] flex-col border-l border-[var(--color-border)] bg-white/95 shadow-[var(--shadow-lg)] backdrop-blur">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">召回明细</p>
          <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">“{query}”</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {empty ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-[var(--color-text-tertiary)]">
          没有匹配的实体，换个关键词试试
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {/* 命中实体：每个卡片展示名称 + 类型 + 2-3个邻域链路 */}
          <Section title="命中实体" count={result.entities.length}>
            <div className="space-y-2">
              {result.entities.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelectEntity(e.id)}
                  className={cn(
                    'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                    selectedId === e.id
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                      : 'border-transparent hover:bg-[var(--color-bg-hover)]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-text-primary)]">{e.name}</span>
                    <span className="shrink-0 rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                      {typeLabel(e.type)}
                    </span>
                  </div>
                  {/* 邻域链路 */}
                  {e.neighbors.length > 0 && (
                    <div className="ml-5 mt-1.5 flex flex-col gap-0.5">
                      {e.neighbors.map((nb) => (
                        <div key={nb.id} className="flex items-center gap-1.5 text-[11px]">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: nb.color }} />
                          <span className="truncate text-[var(--color-text-secondary)]">{nb.name}</span>
                          <span className="shrink-0 text-[var(--color-text-tertiary)]">·</span>
                          <span className="shrink-0 text-[var(--color-text-tertiary)]">{typeLabel(nb.type)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </Section>

          {/* 关联关系：紧凑语义句，动词内联高亮 */}
          {result.relations.length > 0 && (
            <Section title="关联关系" count={result.relations.length}>
              <div className="space-y-1">
                {result.relations.map((r) => (
                  <div key={r.id} className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-[12px] leading-snug text-[var(--color-text-primary)]">
                      <span className="min-w-0 shrink truncate">{r.fromName}</span>
                      <span className="shrink-0 text-[11px] text-[var(--color-primary)]">
                        {extractVerb(r.description) || '→'}
                      </span>
                      <span className="min-w-0 shrink truncate">{r.toName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 来源文档：点击弹窗预览页面内容，不跳转 */}
          {result.sources.length > 0 && (
            <Section title="来源文档" count={result.sources.length}>
              <div className="space-y-1.5">
                {result.sources.map((s) => (
                  <button
                    key={s.pageId}
                    onClick={() => onPreviewPage?.(s.pageId, s.title)}
                    className="w-full rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg-page)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-[12px]">📄</span>
                      <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--color-text-primary)]">{s.title}</p>
                      <span className="shrink-0 text-[10px] text-[var(--color-text-tertiary)]">预览</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--color-text-tertiary)]">
                      含 {s.entityNames.length} 个命中实体：{s.entityNames.slice(0, 4).join('、')}
                      {s.entityNames.length > 4 ? '…' : ''}
                    </p>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

const Section = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
  <div>
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-[12px] font-semibold text-[var(--color-text-secondary)]">{title}</span>
      <span className="rounded-full bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">{count}</span>
    </div>
    {children}
  </div>
)

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
