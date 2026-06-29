<template>
  <div class="wiki-graph-page">
    <div class="graph-toolbar">
      <div class="toolbar-left">
        <el-button text @click="goBack">返回空间</el-button>
        <span class="page-title">{{ graph?.spaceName || 'Wiki 知识图谱' }}</span>
        <span v-if="!search && selectedNodeName" class="selected-hint">
          已选中：{{ selectedNodeName }}<template v-if="selectedNodeType"> · {{ typeLabel(selectedNodeType) }}</template>（点击空白处取消）
        </span>
      </div>
      <el-button :loading="loading" @click="loadGraph">刷新</el-button>
    </div>

    <div v-if="hasGraphData" class="graph-body">
      <!-- 图谱容器：抽屉打开时收窄右侧 -->
      <div class="graph-area" :class="{ 'has-drawer': !!search }">
        <div class="graph-legend-row">
          <div class="graph-search-box">
            <input
              v-model="query"
              class="graph-search-input"
              placeholder="搜索需求 / 模块 / 功能点…"
            />
            <button
              v-if="query"
              class="graph-search-clear"
              @click="clearSearch"
            >✕</button>
          </div>
          <div class="graph-legend">
            <span v-for="t in legendTypes" :key="t" class="legend-item">
              <span class="legend-dot" :style="{ background: colorForType(t) }"></span>
              {{ typeLabel(t) }}
            </span>
          </div>
        </div>

        <div ref="graphContainerRef" class="graph-container"></div>
      </div>

      <!-- 右侧召回抽屉 -->
      <div v-if="search" class="search-drawer">
        <div class="drawer-header">
          <div class="drawer-title-wrap">
            <span class="drawer-title">召回明细</span>
            <span class="drawer-query">「{{ query.trim() }}」</span>
          </div>
          <button class="drawer-close" @click="clearSearch">✕</button>
        </div>

        <div v-if="search.entities.length === 0" class="drawer-empty">
          没有匹配的实体，换个关键词试试
        </div>

        <div v-else class="drawer-body">
          <!-- 命中实体 -->
          <div class="drawer-section">
            <div class="section-label">
              <span class="section-title">命中实体</span>
              <span class="section-count">{{ search.entities.length }}</span>
            </div>
            <div class="entity-list">
              <button
                v-for="e in search.entities"
                :key="e.id"
                class="entity-item"
                :class="{ 'is-selected': selectedNodeId === e.id }"
                @click="focusEntity(e.id)"
              >
                <span class="entity-dot" :style="{ background: colorForType(e.type) }"></span>
                <span class="entity-name">{{ e.name }}</span>
                <span class="entity-tag">{{ typeLabel(e.type) }}</span>
              </button>
            </div>
          </div>

          <!-- 关联关系 -->
          <div v-if="search.relations.length > 0" class="drawer-section">
            <div class="section-label">
              <span class="section-title">关联关系</span>
              <span class="section-count">{{ search.relations.length }}</span>
            </div>
            <div class="relation-list">
              <div v-for="r in search.relations" :key="r.id" class="relation-item">
                <div class="relation-nodes">
                  <span class="relation-name">{{ r.fromName }}</span>
                  <span class="relation-arrow">→</span>
                  <span class="relation-name">{{ r.toName }}</span>
                </div>
                <p v-if="r.description" class="relation-desc">{{ r.description }}</p>
              </div>
            </div>
          </div>

          <!-- 来源文档 -->
          <div v-if="search.sources.length > 0" class="drawer-section">
            <div class="section-label">
              <span class="section-title">来源文档</span>
              <span class="section-count">{{ search.sources.length }}</span>
            </div>
            <div class="source-list">
              <div v-for="s in search.sources" :key="s.pageId" class="source-item">
                <p class="source-title">{{ s.title }}</p>
                <p class="source-summary">
                  含 {{ s.entityNames.length }} 个命中实体：{{ s.entityNames.slice(0, 4).join('、') }}{{ s.entityNames.length > 4 ? '…' : '' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading && !hasGraphData" class="graph-empty">
      <el-empty :description="emptyDescription" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { getWikiSpaceKnowledgeGraph, getWikiDirectoryTree } from '@/api/platform'
import type { WikiSpaceKnowledgeGraphItem, WikiDirectoryTreeNodeItem, WikiSpacePageSummaryItem } from '@/types/platform'

cytoscape.use(fcose)

const route = useRoute()
const router = useRouter()
const spaceId = Number(route.params.spaceId)

const graph = ref<WikiSpaceKnowledgeGraphItem | null>(null)
const loading = ref(false)
const graphContainerRef = ref<HTMLDivElement | null>(null)
const query = ref('')
const selectedNodeId = ref<number | null>(null)
const selectedNodeName = ref('')
const selectedNodeType = ref('')
const pageMap = ref<Map<number, string>>(new Map())

let cy: cytoscape.Core | null = null

// ── 实体类型配色 ────────────────────────────────────────────────────────────
const TYPE_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#ca8a04']
const colorCache = new Map<string, string>()
const colorForType = (type: string): string => {
  if (!colorCache.has(type)) colorCache.set(type, TYPE_COLORS[colorCache.size % TYPE_COLORS.length])
  return colorCache.get(type)!
}

// ── 类型标签 ────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  requirement: '需求', module: '模块', feature: '功能点',
  datasource: '数据来源', businessrule: '业务规则',
  role: '角色/干系人', other: '其他', unknown: '未分类'
}
const typeLabel = (type: string): string => TYPE_LABELS[type.toLowerCase()] || type

// ── metadata 解析 ──────────────────────────────────────────────────────────
const parseNodeMeta = (metadataJson: string | null | undefined): { entityType: string; sourceId: string } => {
  if (!metadataJson) return { entityType: '', sourceId: '' }
  try {
    const meta = JSON.parse(metadataJson)
    return {
      entityType: typeof meta?.entityType === 'string' ? meta.entityType : '',
      sourceId: typeof meta?.sourceId === 'string' ? meta.sourceId : ''
    }
  } catch { return { entityType: '', sourceId: '' } }
}

const pageIdsFromSourceId = (sourceId: string): number[] => {
  const ids = new Set<number>()
  for (const m of sourceId.matchAll(/(\d+)-chunk-\d+/g)) ids.add(Number(m[1]))
  return [...ids]
}

// ── 计算属性 ────────────────────────────────────────────────────────────────
const nodeCount = computed(() => graph.value?.nodes.length || 0)
const hasGraphData = computed(() => nodeCount.value > 0)
const emptyDescription = computed(() =>
  graph.value && !graph.value.vectorEnabled
    ? '该空间尚未建立知识索引，补充文档内容后稍候重试'
    : '暂无可展示的知识关系'
)

const legendTypes = computed(() => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const node of graph.value?.nodes || []) {
    const type = parseNodeMeta(node.metadataJson).entityType || '实体'
    if (!seen.has(type)) { seen.add(type); result.push(type) }
  }
  return result
})

// 节点度（关联数）
const degreeMap = computed(() => {
  const m = new Map<number, number>()
  graph.value?.edges.forEach(e => {
    m.set(e.fromNodeId, (m.get(e.fromNodeId) || 0) + 1)
    m.set(e.toNodeId, (m.get(e.toNodeId) || 0) + 1)
  })
  return m
})

// ── 节点附加信息表 ─────────────────────────────────────────────────────────
const nodeExtraMap = computed(() => {
  const m = new Map<number, { type: string; pageIds: number[] }>()
  for (const n of graph.value?.nodes || []) {
    const meta = parseNodeMeta(n.metadataJson)
    m.set(n.id, { type: meta.entityType || '实体', pageIds: pageIdsFromSourceId(meta.sourceId) })
  }
  return m
})

// ── 搜索召回（纯前端计算） ─────────────────────────────────────────────────
interface SearchEntity { id: number; name: string; type: string }
interface SearchRelation { id: string; fromName: string; toName: string; type: string; description: string }
interface SearchSource { pageId: number; title: string; entityNames: string[] }

const search = computed<null | { entities: SearchEntity[]; matchedIds: Set<number>; relations: SearchRelation[]; sources: SearchSource[] }>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q || !graph.value) return null

  // 1) 命中实体
  const scored = (graph.value.nodes || [])
    .map(n => {
      const name = n.name.toLowerCase()
      const meta = parseNodeMeta(n.metadataJson)
      const type = meta.entityType || '实体'
      let score = 0
      if (name === q) score += 100
      else if (name.includes(q)) score += 40
      if (typeLabel(type).includes(query.value.trim()) || type.toLowerCase().includes(q)) score += 4
      score += Math.min(degreeMap.value.get(n.id) || 0, 10) * 0.2
      return { id: n.id, name: n.name, type, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)

  const entities = scored.map(x => ({ id: x.id, name: x.name, type: x.type }))
  const matchedIds = new Set(entities.map(e => e.id))

  // 2) 关联关系
  const relSeen = new Set<string>()
  const relations: SearchRelation[] = []
  const nodeById = new Map(graph.value.nodes.map(n => [n.id, n]))
  for (const e of graph.value.edges) {
    if (!matchedIds.has(e.fromNodeId) && !matchedIds.has(e.toNodeId)) continue
    const key = `${e.fromNodeId}-${e.toNodeId}`
    if (relSeen.has(key)) continue
    relSeen.add(key)
    relations.push({
      id: String(e.id),
      fromName: nodeById.get(e.fromNodeId)?.name ?? `#${e.fromNodeId}`,
      toName: nodeById.get(e.toNodeId)?.name ?? `#${e.toNodeId}`,
      type: e.edgeType,
      description: e.evidenceText || ''
    })
    if (relations.length >= 40) break
  }

  // 3) 来源文档
  const srcMap = new Map<number, Set<string>>()
  for (const ent of entities) {
    for (const pid of (nodeExtraMap.value.get(ent.id)?.pageIds || [])) {
      if (!srcMap.has(pid)) srcMap.set(pid, new Set())
      srcMap.get(pid)!.add(ent.name)
    }
  }
  const sources: SearchSource[] = [...srcMap.entries()]
    .map(([pageId, names]) => ({
      pageId,
      title: pageMap.value.get(pageId) ?? `页面 #${pageId}`,
      entityNames: [...names]
    }))
    .sort((a, b) => b.entityNames.length - a.entityNames.length)

  return { entities, matchedIds, relations, sources }
})

// ── 高亮集合（搜索优先，其次单击） ─────────────────────────────────────────
const highlightIds = computed<Set<number> | null>(() => {
  if (search.value) return search.value.matchedIds
  if (selectedNodeId.value != null) {
    const set = new Set<number>([selectedNodeId.value])
    graph.value?.edges.forEach(e => {
      if (e.fromNodeId === selectedNodeId.value) set.add(e.toNodeId)
      if (e.toNodeId === selectedNodeId.value) set.add(e.fromNodeId)
    })
    return set
  }
  return null
})

// ── 点击召回结果中的实体：选中 + 居中 ──────────────────────────────────────
const focusEntity = (id: number) => {
  selectedNodeId.value = id
  const n = graph.value?.nodes.find(x => x.id === id)
  selectedNodeName.value = n?.name || ''
  selectedNodeType.value = parseNodeMeta(n?.metadataJson).entityType || ''
  if (!cy) return
  const node = cy.getElementById(String(id))
  if (node && !node.empty()) {
    cy.animate({ fit: { eles: node, padding: 120 } } as any, { duration: 400 } as any)
  }
  applyHighlight()
}

const clearSearch = () => {
  query.value = ''
  selectedNodeId.value = null
  selectedNodeName.value = ''
  selectedNodeType.value = ''
  applyHighlight()
}

// ── 图渲染 ─────────────────────────────────────────────────────────────────
const buildElements = (): cytoscape.ElementDefinition[] => {
  const elements: cytoscape.ElementDefinition[] = []
  const nodeIds = new Set<number>()
  for (const node of graph.value?.nodes || []) {
    nodeIds.add(node.id)
    const type = parseNodeMeta(node.metadataJson).entityType || '实体'
    elements.push({
      data: { id: String(node.id), label: node.name, color: colorForType(type), entityType: type }
    })
  }
  for (const edge of graph.value?.edges || []) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) continue
    elements.push({
      data: { id: `e${edge.id}`, source: String(edge.fromNodeId), target: String(edge.toNodeId) }
    })
  }
  return elements
}

const applyHighlight = () => {
  if (!cy) return
  const h = highlightIds.value
  cy.elements().removeClass('faded highlighted highlighted-node matched-node')
  if (!h) return
  cy.elements().addClass('faded')
  for (const id of h) {
    const node = cy.getElementById(String(id))
    node.removeClass('faded').addClass('highlighted-node')
    node.connectedEdges().removeClass('faded').addClass('highlighted')
  }
  if (selectedNodeId.value != null) {
    cy.getElementById(String(selectedNodeId.value)).addClass('matched-node')
  }
}

const renderGraph = async () => {
  if (!hasGraphData.value) return
  await nextTick()
  const container = graphContainerRef.value
  if (!container) return

  if (cy) { cy.destroy(); cy = null }

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
          width: 26, height: 26,
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
      { selector: 'node.highlighted-node', style: { 'border-width': 3, 'border-color': '#4f46e5' } },
      { selector: 'node.matched-node', style: { 'border-width': 4, 'border-color': '#111827' } },
      { selector: 'edge.highlighted', style: { 'line-color': '#4f46e5', width: 2.5, opacity: 1 } },
      { selector: '.faded', style: { opacity: 0.12 } }
    ],
    layout: {
      name: 'fcose',
      // 用短动画让节点从初始位置平滑过渡到最终位置，避免瞬间从左上角跳到中心。
      animate: true,
      animationDuration: 300,
      animationEasing: 'ease-out-cubic',
      randomize: true,
      nodeRepulsion: 6000,
      idealEdgeLength: 90,
      padding: 30
    } as any,
    minZoom: 0.2, maxZoom: 3
  })

  cy.on('tap', 'node', (event) => {
    const node = event.target
    selectedNodeId.value = Number(node.id())
    selectedNodeName.value = node.data('label')
    selectedNodeType.value = node.data('entityType') || ''
    applyHighlight()
  })

  cy.on('tap', (event) => {
    if (event.target === cy) {
      selectedNodeId.value = null
      selectedNodeName.value = ''
      selectedNodeType.value = ''
      applyHighlight()
    }
  })

  applyHighlight()
}

// ── 搜索变化时刷新高亮 ─────────────────────────────────────────────────────
watch(search, () => {
  applyHighlight()
  // 有命中时自动聚焦命中实体
  if (search.value && search.value.entities.length > 0 && cy) {
    const matchedNodes = cy.nodes().filter(n => search.value!.matchedIds.has(Number(n.id())))
    if (matchedNodes.length > 0) {
      cy.animate({ fit: { eles: matchedNodes, padding: 80 } } as any, { duration: 500 } as any)
    }
  }
})

// ── 数据加载 ────────────────────────────────────────────────────────────────
const loadGraph = async () => {
  loading.value = true
  try {
    const [g, tree] = await Promise.all([
      getWikiSpaceKnowledgeGraph(spaceId),
      getWikiDirectoryTree(spaceId).catch(() => [] as WikiDirectoryTreeNodeItem[])
    ])
    const pm = new Map<number, string>()
    const walkPages = (pages: WikiSpacePageSummaryItem[]) => {
      for (const p of pages) {
        pm.set(p.id, p.title)
        if (p.children?.length) walkPages(p.children)
      }
    }
    const walkDirs = (nodes: WikiDirectoryTreeNodeItem[]) => {
      for (const n of nodes) { walkPages(n.pages); walkDirs(n.children) }
    }
    walkDirs(tree)
    pageMap.value = pm
    graph.value = g
    selectedNodeId.value = null
    selectedNodeName.value = ''
    selectedNodeType.value = ''
    query.value = ''
    await renderGraph()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const goBack = () => router.push({ name: 'wiki-space', params: { spaceId } })

onMounted(() => {
  if (Number.isNaN(spaceId) || spaceId <= 0) {
    ElMessage.error('空间参数不正确')
    goBack()
    return
  }
  loadGraph()
})

onBeforeUnmount(() => { if (cy) { cy.destroy(); cy = null } })
</script>

<style scoped>
.wiki-graph-page {
  display: flex; flex-direction: column; gap: 12px;
  height: calc(100vh - 110px); padding: 0 24px; box-sizing: border-box;
}

.graph-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex: 0 0 auto;
}
.toolbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.page-title { font-size: 18px; font-weight: 600; color: #17324d; }
.selected-hint { font-size: 12px; font-weight: 400; color: #6b7f91; }

.graph-body { display: flex; flex: 1 1 auto; min-height: 0; gap: 0; }

.graph-area { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.graph-area.has-drawer { flex: 0 0 calc(100% - 384px); max-width: calc(100% - 384px); }

.graph-legend-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; }

.graph-search-box { position: relative; flex: 0 0 auto; }
.graph-search-input {
  height: 32px; width: 220px; padding: 0 28px 0 10px;
  border: 1px solid rgba(191, 219, 254, 0.6); border-radius: 6px;
  font-size: 13px; color: #334155; background: rgba(255,255,255,0.9); outline: none;
}
.graph-search-input:focus { border-color: #4f46e5; }
.graph-search-input::placeholder { color: #94a3b8; }
.graph-search-clear {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 20px; height: 20px; border: none; background: #f1f5f9; border-radius: 50%;
  font-size: 11px; color: #64748b; cursor: pointer; line-height: 1;
}
.graph-search-clear:hover { background: #e2e8f0; color: #334155; }

.graph-legend { display: flex; flex-wrap: wrap; gap: 6px; }
.legend-item {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px;
  border: 1px solid rgba(191, 219, 254, 0.6); background: rgba(255,255,255,0.85);
  font-size: 11px; color: #475569;
}
.legend-dot { width: 9px; height: 9px; border-radius: 50%; }

.graph-container {
  flex: 1 1 auto; min-height: 0;
  border-radius: 16px; border: 1px solid rgba(191,219,254,0.5);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

/* ── 召回抽屉 ────────────────────────────────────────────────────────────── */
.search-drawer {
  flex: 0 0 384px; width: 384px;
  display: flex; flex-direction: column;
  border-left: 1px solid rgba(191,219,254,0.5);
  background: rgba(255,255,255,0.97);
}
.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid rgba(191,219,254,0.5); flex: 0 0 auto;
}
.drawer-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.drawer-title { font-size: 13px; font-weight: 600; color: #17324d; }
.drawer-query { font-size: 11px; color: #6b7f91; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer-close {
  width: 28px; height: 28px; border: none; background: #f1f5f9; border-radius: 6px;
  font-size: 13px; color: #64748b; cursor: pointer; flex: 0 0 auto;
}
.drawer-close:hover { background: #e2e8f0; color: #334155; }

.drawer-empty {
  flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
  padding: 24px; font-size: 12px; color: #94a3b8; text-align: center;
}

.drawer-body { flex: 1 1 auto; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 14px; }

.drawer-section { display: flex; flex-direction: column; gap: 6px; }
.section-label { display: flex; align-items: center; gap: 8px; }
.section-title { font-size: 12px; font-weight: 600; color: #475569; }
.section-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 16px; padding: 0 5px;
  background: rgba(79,70,229,0.1); color: #4f46e5;
  border-radius: 999px; font-size: 10px; font-weight: 600;
}

/* 命中实体 */
.entity-list { display: flex; flex-direction: column; gap: 3px; }
.entity-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 9px; border: 1px solid transparent; border-radius: 7px;
  background: transparent; cursor: pointer; width: 100%; text-align: left;
}
.entity-item:hover { background: #f1f5f9; }
.entity-item.is-selected { border-color: #4f46e5; background: rgba(79,70,229,0.05); }
.entity-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.entity-name { flex: 1 1 auto; font-size: 12px; color: #17324d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entity-tag {
  flex: 0 0 auto; padding: 1px 6px; background: #f1f5f9; border-radius: 4px;
  font-size: 10px; color: #64748b; white-space: nowrap;
}

/* 关联关系 */
.relation-list { display: flex; flex-direction: column; gap: 5px; }
.relation-item {
  padding: 7px 9px; background: #f8fbff; border: 1px solid rgba(191,219,254,0.5); border-radius: 7px;
}
.relation-nodes { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #17324d; }
.relation-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.relation-arrow { flex: 0 0 auto; color: #94a3b8; font-size: 12px; }
.relation-desc {
  margin: 4px 0 0; font-size: 11px; color: #6b7f91; line-height: 1.5;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

/* 来源文档 */
.source-list { display: flex; flex-direction: column; gap: 5px; }
.source-item {
  padding: 7px 9px; background: #f8fbff; border: 1px solid rgba(191,219,254,0.5); border-radius: 7px;
}
.source-title {
  margin: 0; font-size: 12px; font-weight: 500; color: #17324d;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.source-summary {
  margin: 3px 0 0; font-size: 11px; color: #6b7f91; line-height: 1.5;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

.graph-empty { flex: 1 1 auto; min-height: 400px; display: flex; align-items: center; justify-content: center; }
</style>
