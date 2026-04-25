<template>
  <div class="knowledge-graph-page">
    <el-card class="page-card" shadow="never">
      <div class="page-header">
        <div>
          <el-button text @click="goBack">返回项目</el-button>
          <div class="page-title">{{ projectName || '需求关联图谱' }}</div>
          <div class="page-subtitle">默认围绕单个需求展示关联范围与当前阶段状态，帮助产品和开发快速判断影响面与推进进度。</div>
        </div>
        <el-space wrap>
          <el-select v-model="layoutMode" style="width: 160px">
            <el-option v-for="item in layoutOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select
            v-model="selectedRequirementId"
            filterable
            placeholder="选择需求"
            style="width: 320px"
            :disabled="!requirementOptions.length"
          >
            <el-option
              v-for="item in requirementOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <el-button :loading="loading" @click="loadGraph(true)">刷新数据</el-button>
          <el-button type="primary" :loading="rebuilding" @click="handleRebuild">重建图谱</el-button>
        </el-space>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">项目</span>
          <strong>{{ graph?.projectId ?? projectId }}</strong>
        </div>
        <div class="stat-card emphasis">
          <span class="stat-label">当前需求</span>
          <strong>{{ selectedRequirement?.name || '未选择' }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">关联节点</span>
          <strong>{{ visibleNodes.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">关联边</span>
          <strong>{{ visibleEdges.length }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">更新时间</span>
          <strong>{{ graph?.generatedAt || '-' }}</strong>
        </div>
      </div>
    </el-card>

    <div class="analysis-grid">
      <el-card class="page-card summary-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>需求关联性</span>
            <el-tag v-if="selectedRequirement" type="warning">{{ requirementStatusText }}</el-tag>
          </div>
        </template>

        <div v-if="selectedRequirement" class="summary-panel">
          <div class="summary-main">
            <div class="summary-title">{{ selectedRequirement.name }}</div>
            <div class="summary-description">
              {{ selectedRequirement.description || '当前需求暂无补充说明。' }}
            </div>
          </div>

          <div class="summary-metrics">
            <div class="metric-pill">
              <span class="metric-label">关联任务</span>
              <strong>{{ relatedTasks.length }}</strong>
            </div>
            <div class="metric-pill danger">
              <span class="metric-label">关联缺陷</span>
              <strong>{{ relatedBugs.length }}</strong>
            </div>
            <div class="metric-pill info">
              <span class="metric-label">关联测试</span>
              <strong>{{ relatedTestArtifacts.length }}</strong>
            </div>
            <div class="metric-pill neutral">
              <span class="metric-label">协作成员</span>
              <strong>{{ relatedUsers.length }}</strong>
            </div>
          </div>

          <div class="summary-section">
            <div class="summary-section-title">当前判断</div>
            <div class="insight-list">
              <div class="insight-item">
                <span class="insight-label">影响范围</span>
                <span class="insight-value">{{ impactSummary }}</span>
              </div>
              <div class="insight-item">
                <span class="insight-label">测试覆盖</span>
                <span class="insight-value">{{ testCoverageSummary }}</span>
              </div>
              <div class="insight-item">
                <span class="insight-label">协作状态</span>
                <span class="insight-value">{{ collaborationSummary }}</span>
              </div>
            </div>
          </div>
        </div>

        <el-empty v-else description="当前项目暂无需求节点" />
      </el-card>

      <el-card class="page-card stage-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>当前阶段变化</span>
            <el-tag type="info">基于当前图谱快照</el-tag>
          </div>
        </template>

        <div v-if="selectedRequirement" class="stage-panel">
          <div class="stage-highlight">
            <span class="stage-highlight-label">需求当前状态</span>
            <strong>{{ requirementStatusText }}</strong>
            <span class="stage-highlight-subtitle">
              {{ requirementPriorityText }}
            </span>
          </div>

          <div class="stage-columns">
            <div class="stage-column">
              <div class="stage-column-title">任务阶段分布</div>
              <div v-if="taskStatusEntries.length" class="stage-list">
                <div v-for="entry in taskStatusEntries" :key="entry.label" class="stage-item">
                  <span class="stage-item-label">{{ entry.label }}</span>
                  <strong>{{ entry.count }}</strong>
                </div>
              </div>
              <div v-else class="stage-empty">当前需求下暂无关联任务</div>
            </div>

            <div class="stage-column">
              <div class="stage-column-title">缺陷阶段分布</div>
              <div v-if="bugStatusEntries.length" class="stage-list">
                <div v-for="entry in bugStatusEntries" :key="entry.label" class="stage-item">
                  <span class="stage-item-label">{{ entry.label }}</span>
                  <strong>{{ entry.count }}</strong>
                </div>
              </div>
              <div v-else class="stage-empty">当前需求下暂无关联缺陷</div>
            </div>
          </div>

          <div class="summary-section">
            <div class="summary-section-title">说明</div>
            <div class="stage-note">
              当前图谱还没有完整的状态变更时间线，所以这里先展示“当前快照下的阶段分布”。
              如果后续要看真正的阶段变化趋势，我建议后端补一层需求/任务状态流转历史，再做阶段演进时间线。
            </div>
          </div>
        </div>

        <el-empty v-else description="选择需求后查看阶段分布" />
      </el-card>
    </div>

    <div class="main-grid">
      <el-card class="page-card graph-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>需求局部关系图</span>
            <el-space wrap>
              <el-tag type="info">{{ visibleNodes.length }} 个节点</el-tag>
              <el-tag type="info">{{ visibleEdges.length }} 条关系</el-tag>
            </el-space>
          </div>
        </template>

        <KnowledgeGraphCanvas
          :nodes="visibleNodes"
          :edges="visibleEdges"
          :layout-mode="layoutMode"
          :selected-node-id="selectedNodeId"
          :selected-edge-id="selectedEdgeId"
          @select-node="handleSelectNode"
          @select-edge="handleSelectEdge"
          @clear-selection="handleClearSelection"
        />
      </el-card>

      <el-card class="page-card detail-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>选中详情</span>
            <el-tag v-if="selectedNode" :style="{ background: nodeColor(selectedNode.nodeType), color: '#fff', border: 'none' }">
              {{ nodeTypeLabel(selectedNode.nodeType) }}
            </el-tag>
            <el-tag v-else-if="selectedEdge" type="info">{{ selectedEdge.edgeType }}</el-tag>
          </div>
        </template>

        <div v-if="selectedNode" class="detail-panel">
          <div class="detail-title">{{ selectedNode.name }}</div>
          <div class="detail-meta">业务 ID：{{ selectedNode.bizId }}</div>
          <div class="detail-meta">节点类型：{{ nodeTypeLabel(selectedNode.nodeType) }}</div>
          <div v-if="selectedNode.description" class="detail-block">
            <div class="detail-block-title">说明</div>
            <div class="detail-block-content">{{ selectedNode.description }}</div>
          </div>
          <div class="detail-block">
            <div class="detail-block-title">元数据</div>
            <div class="meta-grid">
              <div v-for="entry in selectedNodeMetaEntries" :key="entry.key" class="meta-item">
                <span class="meta-key">{{ entry.key }}</span>
                <span class="meta-value">{{ entry.value }}</span>
              </div>
            </div>
          </div>
          <div class="detail-block">
            <div class="detail-block-title">关联关系</div>
            <div class="relation-chips">
              <span v-for="item in selectedNodeEdges" :key="item.id" class="relation-chip">
                {{ item.edgeType }} · {{ item.otherName }}
              </span>
            </div>
          </div>
        </div>

        <div v-else-if="selectedEdge" class="detail-panel">
          <div class="detail-title">{{ edgeTypeLabel(selectedEdge.edgeType) }}</div>
          <div class="detail-meta">{{ selectedEdge.fromName }} → {{ selectedEdge.toName }}</div>
          <div class="detail-meta">状态：{{ selectedEdge.status }}</div>
          <div class="detail-meta">来源：{{ selectedEdge.sourceType }}</div>
          <div class="detail-meta">置信度：{{ selectedEdge.confidence ?? '-' }}</div>
          <div v-if="selectedEdge.evidenceText" class="detail-block">
            <div class="detail-block-title">证据</div>
            <div class="detail-block-content">{{ selectedEdge.evidenceText }}</div>
          </div>
        </div>

        <el-empty v-else description="点击局部关系图中的节点或边查看详情" />
      </el-card>
    </div>

    <div class="content-grid">
      <el-card class="page-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>关联节点列表</span>
            <el-tag type="info">{{ visibleNodes.length }}</el-tag>
          </div>
        </template>

        <el-table v-loading="loading" :data="visibleNodes" height="420" @row-click="handleNodeRowClick">
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-tag :type="nodeTagType(row.nodeType)">{{ nodeTypeLabel(row.nodeType) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="bizId" label="业务ID" width="110" />
          <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        </el-table>
      </el-card>

      <el-card class="page-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>关联关系列表</span>
            <el-tag type="info">{{ edgeRows.length }}</el-tag>
          </div>
        </template>

        <el-table v-loading="loading" :data="edgeRows" height="420" @row-click="handleEdgeRowClick">
          <el-table-column label="关系类型" width="180">
            <template #default="{ row }">
              {{ edgeTypeLabel(row.edgeType) }}
            </template>
          </el-table-column>
          <el-table-column prop="fromName" label="起点" min-width="180" show-overflow-tooltip />
          <el-table-column prop="toName" label="终点" min-width="180" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="置信度" width="100">
            <template #default="{ row }">
              {{ row.confidence ?? '-' }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getProjectDetail, getProjectKnowledgeGraph, rebuildProjectKnowledgeGraph } from '@/api/platform'
import type { KnowledgeGraphEdgeItem, KnowledgeGraphItem, KnowledgeGraphNodeItem } from '@/types/platform'

type LayoutMode = 'network' | 'ring' | 'grid'

interface GraphEdgeRow extends KnowledgeGraphEdgeItem {
  fromName: string
  toName: string
}

interface CountEntry {
  label: string
  count: number
}

const KnowledgeGraphCanvas = defineAsyncComponent(() => import('@/components/KnowledgeGraphCanvas.vue'))

const route = useRoute()
const router = useRouter()

const projectId = Number(route.params.projectId)
const projectName = ref('')
const graph = ref<KnowledgeGraphItem | null>(null)
const loading = ref(false)
const rebuilding = ref(false)
const layoutMode = ref<LayoutMode>('network')
const selectedRequirementId = ref<number | null>(null)
const selectedNodeId = ref<number | null>(null)
const selectedEdgeId = ref<number | null>(null)

const layoutOptions: Array<{ label: string; value: LayoutMode }> = [
  { label: '关系云', value: 'network' },
  { label: '环形', value: 'ring' },
  { label: '网格', value: 'grid' }
]

const nodeMap = computed(() => {
  const result = new Map<number, KnowledgeGraphNodeItem>()
  for (const item of graph.value?.nodes || []) {
    result.set(item.id, item)
  }
  return result
})

const requirementOptions = computed(() =>
  (graph.value?.nodes || []).filter((item) => item.nodeType === 'REQUIREMENT')
)

const selectedRequirement = computed(() =>
  requirementOptions.value.find((item) => item.id === selectedRequirementId.value) || null
)

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const metadataValue = (node: KnowledgeGraphNodeItem | null, key: string) => {
  if (!node) return ''
  const metadata = parseMetadata(node.metadataJson)
  return String(metadata[key] || '')
}

const relatedNodeIds = computed(() => {
  const requirement = selectedRequirement.value
  if (!requirement) return new Set<number>()

  const ids = new Set<number>([requirement.id])
  const queue: number[] = [requirement.id]
  let depth = 0
  while (queue.length && depth < 2) {
    const currentLevel = [...queue]
    queue.length = 0
    for (const currentId of currentLevel) {
      for (const edge of graph.value?.edges || []) {
        if (edge.fromNodeId === currentId || edge.toNodeId === currentId) {
          if (!ids.has(edge.fromNodeId)) {
            ids.add(edge.fromNodeId)
            queue.push(edge.fromNodeId)
          }
          if (!ids.has(edge.toNodeId)) {
            ids.add(edge.toNodeId)
            queue.push(edge.toNodeId)
          }
        }
      }
    }
    depth++
  }
  return ids
})

const visibleNodes = computed(() =>
  (graph.value?.nodes || []).filter((item) => relatedNodeIds.value.has(item.id))
)

const visibleEdges = computed(() =>
  (graph.value?.edges || []).filter((item) => relatedNodeIds.value.has(item.fromNodeId) && relatedNodeIds.value.has(item.toNodeId))
)

const edgeRows = computed<GraphEdgeRow[]>(() =>
  visibleEdges.value.map((item) => ({
    ...item,
    fromName: nodeMap.value.get(item.fromNodeId)?.name || `#${item.fromNodeId}`,
    toName: nodeMap.value.get(item.toNodeId)?.name || `#${item.toNodeId}`
  }))
)

const relatedTasks = computed(() =>
  visibleNodes.value.filter((item) => item.nodeType === 'TASK')
)

const relatedBugs = computed(() =>
  visibleNodes.value.filter((item) => item.nodeType === 'BUG')
)

const relatedTestArtifacts = computed(() =>
  visibleNodes.value.filter((item) => item.nodeType === 'TEST_PLAN' || item.nodeType === 'TEST_CASE')
)

const relatedUsers = computed(() =>
  visibleNodes.value.filter((item) => item.nodeType === 'USER' || item.nodeType === 'AGENT')
)

const requirementStatusText = computed(() => metadataValue(selectedRequirement.value, 'status') || '未标注状态')
const requirementPriorityText = computed(() => metadataValue(selectedRequirement.value, 'priority') || '未标注优先级')

const countStatuses = (nodes: KnowledgeGraphNodeItem[]) => {
  const counts = new Map<string, number>()
  nodes.forEach((node) => {
    const status = metadataValue(node, 'status') || '未标注'
    counts.set(status, (counts.get(status) || 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
}

const taskStatusEntries = computed<CountEntry[]>(() => countStatuses(relatedTasks.value))
const bugStatusEntries = computed<CountEntry[]>(() => countStatuses(relatedBugs.value))

const impactSummary = computed(() => {
  if (!selectedRequirement.value) return '-'
  const taskCount = relatedTasks.value.length
  const bugCount = relatedBugs.value.length
  const testCount = relatedTestArtifacts.value.length
  if (taskCount >= 4 || bugCount >= 2) return '影响范围偏大，建议按子任务和缺陷联动评估排期。'
  if (taskCount >= 1 || testCount >= 1) return '已有明确下游动作，可继续关注测试与交付闭环。'
  return '当前主要停留在需求层，尚未形成明显执行链路。'
})

const testCoverageSummary = computed(() => {
  if (!selectedRequirement.value) return '-'
  if (relatedTestArtifacts.value.length >= 3) return '已经形成测试计划或测试用例关联。'
  if (relatedTestArtifacts.value.length >= 1) return '已有部分测试关联，建议继续补充验证范围。'
  return '暂未看到测试关联，交付前建议补足测试设计。'
})

const collaborationSummary = computed(() => {
  if (!selectedRequirement.value) return '-'
  if (relatedUsers.value.length >= 3) return '多人协作中，适合关注职责拆分和同步成本。'
  if (relatedUsers.value.length >= 1) return '已有明确责任人或协作者。'
  return '暂未建立人员或 Agent 关联。'
})

const selectedNode = computed(() => visibleNodes.value.find((item) => item.id === selectedNodeId.value) || null)
const selectedEdge = computed(() => edgeRows.value.find((item) => item.id === selectedEdgeId.value) || null)

const selectedNodeMetaEntries = computed(() => {
  const meta = parseMetadata(selectedNode.value?.metadataJson)
  return Object.entries(meta).map(([key, value]) => ({
    key,
    value: String(value)
  }))
})

const selectedNodeEdges = computed(() => {
  if (!selectedNode.value) return []
  return edgeRows.value
    .filter((item) => item.fromNodeId === selectedNode.value?.id || item.toNodeId === selectedNode.value?.id)
    .map((item) => ({
      ...item,
      otherName: item.fromNodeId === selectedNode.value?.id ? item.toName : item.fromName
    }))
})

const nodeTypeLabel = (nodeType: string) => {
  const map: Record<string, string> = {
    PROJECT: '项目',
    ITERATION: '迭代',
    REQUIREMENT: '需求',
    TASK: '任务',
    BUG: '缺陷',
    TEST_PLAN: '测试计划',
    TEST_CASE: '测试用例',
    WIKI_SPACE: 'Wiki 空间',
    WIKI_DIRECTORY: 'Wiki 目录',
    WIKI_PAGE: 'Wiki 页面',
    USER: '用户',
    AGENT: 'Agent'
  }
  return map[nodeType] || nodeType
}

const edgeTypeLabel = (edgeType: string) => {
  const map: Record<string, string> = {
    HAS_WORK_ITEM: '包含工作项',
    RELATES_TO_REQUIREMENT: '关联需求',
    HAS_ITERATION: '归属迭代',
    ASSIGNED_TO: '指派给',
    COLLABORATES_WITH: '协作',
    EXECUTED_BY_AGENT: '由 Agent 执行',
    HAS_TEST_PLAN: '关联测试计划',
    HAS_TEST_CASE: '关联测试用例',
    OWNED_BY: '负责人',
    HAS_MEMBER: '项目成员',
    HAS_AGENT: '项目 Agent',
    HAS_WIKI_SPACE: '关联 Wiki 空间',
    HAS_WIKI_DIRECTORY: '关联 Wiki 目录',
    HAS_WIKI_PAGE: '关联 Wiki 页面',
    PROJECT_HAS_WIKI_DIRECTORY: '项目绑定 Wiki 目录',
    WIKI_CHILD_OF: 'Wiki 层级'
  }
  return map[edgeType] || edgeType
}

const nodeTagType = (nodeType: string) => {
  if (nodeType === 'PROJECT') return 'primary'
  if (nodeType === 'ITERATION') return 'success'
  if (nodeType === 'REQUIREMENT') return 'warning'
  if (nodeType === 'BUG') return 'danger'
  return 'info'
}

const nodeColor = (nodeType: string) => {
  const map: Record<string, string> = {
    PROJECT: '#1f7a8c',
    ITERATION: '#2fa56b',
    REQUIREMENT: '#f59e0b',
    TASK: '#3b82f6',
    BUG: '#e25555',
    TEST_PLAN: '#f97316',
    TEST_CASE: '#f8b55a',
    WIKI_SPACE: '#8b5cf6',
    WIKI_DIRECTORY: '#d97706',
    WIKI_PAGE: '#c0841a',
    USER: '#7c8ea3',
    AGENT: '#475569'
  }
  return map[nodeType] || '#7c8ea3'
}

const loadProject = async () => {
  const project = await getProjectDetail(projectId)
  projectName.value = project.name
}

const loadGraph = async (refresh = false) => {
  loading.value = true
  try {
    graph.value = await getProjectKnowledgeGraph(projectId, refresh)
  } finally {
    loading.value = false
  }
}

const handleRebuild = async () => {
  rebuilding.value = true
  try {
    graph.value = await rebuildProjectKnowledgeGraph(projectId)
    ElMessage.success('需求关联图谱已重建')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '重建失败')
  } finally {
    rebuilding.value = false
  }
}

const handleSelectNode = (id: number) => {
  selectedNodeId.value = id
  selectedEdgeId.value = null
}

const handleSelectEdge = (id: number) => {
  selectedEdgeId.value = id
  selectedNodeId.value = null
}

const handleClearSelection = () => {
  selectedNodeId.value = selectedRequirement.value?.id || null
  selectedEdgeId.value = null
}

const handleNodeRowClick = (row: KnowledgeGraphNodeItem) => {
  handleSelectNode(row.id)
}

const handleEdgeRowClick = (row: GraphEdgeRow) => {
  handleSelectEdge(row.id)
}

const goBack = () => {
  router.push({ name: 'projects' })
}

watch(
  () => graph.value,
  (value) => {
    const requirements = (value?.nodes || []).filter((item) => item.nodeType === 'REQUIREMENT')
    if (!requirements.length) {
      selectedRequirementId.value = null
      selectedNodeId.value = null
      selectedEdgeId.value = null
      return
    }
    if (!selectedRequirementId.value || !requirements.some((item) => item.id === selectedRequirementId.value)) {
      selectedRequirementId.value = requirements[0].id
    }
    selectedNodeId.value = selectedRequirementId.value
    selectedEdgeId.value = null
  },
  { immediate: true }
)

watch(selectedRequirementId, (value) => {
  if (!value) {
    selectedNodeId.value = null
    selectedEdgeId.value = null
    return
  }
  selectedNodeId.value = value
  selectedEdgeId.value = null
})

watch(visibleNodes, (nodes) => {
  if (selectedNodeId.value && !nodes.some((item) => item.id === selectedNodeId.value)) {
    selectedNodeId.value = selectedRequirement.value?.id || nodes[0]?.id || null
  }
  if (selectedEdgeId.value && !visibleEdges.value.some((item) => item.id === selectedEdgeId.value)) {
    selectedEdgeId.value = null
  }
})

onMounted(async () => {
  if (Number.isNaN(projectId) || projectId <= 0) {
    ElMessage.error('项目参数不正确')
    goBack()
    return
  }
  try {
    await Promise.all([loadProject(), loadGraph()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载需求关联图谱失败')
  }
})
</script>

<style scoped>
.knowledge-graph-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header,
.section-header,
.stats-grid,
.summary-metrics,
.insight-list,
.stage-columns,
.stage-list,
.meta-grid,
.relation-chips {
  display: flex;
}

.page-header,
.section-header {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-title {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.page-subtitle,
.stat-label,
.detail-meta,
.stage-highlight-subtitle {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.stats-grid {
  margin-top: 18px;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-card {
  min-width: 150px;
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4fb 100%);
  border: 1px solid #dbe7f3;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-card.emphasis {
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.98) 0%, rgba(255, 237, 213, 0.96) 100%);
  border-color: rgba(251, 191, 36, 0.34);
}

.stat-card strong {
  font-size: 20px;
  color: #17324d;
}

.analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.9fr);
  gap: 16px;
}

.summary-panel,
.detail-panel,
.summary-main,
.summary-section,
.stage-panel,
.stage-column {
  display: flex;
  flex-direction: column;
}

.summary-panel,
.detail-panel,
.summary-main,
.summary-section,
.stage-panel,
.stage-column {
  gap: 12px;
}

.summary-title,
.detail-title {
  font-size: 20px;
  font-weight: 700;
  color: #17324c;
}

.summary-description,
.detail-block-content,
.stage-note {
  line-height: 1.7;
  color: #284259;
  white-space: pre-wrap;
  word-break: break-word;
}

.summary-metrics,
.insight-list,
.meta-grid,
.relation-chips {
  flex-wrap: wrap;
  gap: 10px;
}

.metric-pill,
.meta-item,
.relation-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(216, 226, 235, 0.92);
  background: rgba(255, 255, 255, 0.92);
  color: #284259;
  font-size: 12px;
}

.metric-pill {
  flex-direction: column;
  align-items: flex-start;
  min-width: 110px;
  border-radius: 16px;
}

.metric-pill strong {
  font-size: 20px;
  color: #17324c;
}

.metric-pill.danger {
  background: rgba(254, 242, 242, 0.92);
  border-color: rgba(248, 113, 113, 0.26);
}

.metric-pill.info {
  background: rgba(239, 246, 255, 0.92);
  border-color: rgba(96, 165, 250, 0.24);
}

.metric-pill.neutral {
  background: rgba(248, 250, 252, 0.92);
}

.metric-label,
.meta-key {
  color: #6d8092;
  font-size: 12px;
}

.summary-section,
.detail-block {
  padding: 14px;
  border-radius: 16px;
  background: rgba(248, 251, 255, 0.92);
  border: 1px solid rgba(221, 230, 238, 0.92);
}

.summary-section-title,
.detail-block-title,
.stage-column-title {
  font-size: 13px;
  font-weight: 700;
  color: #385166;
}

.insight-list {
  flex-direction: column;
  gap: 10px;
}

.insight-item,
.stage-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(216, 226, 235, 0.88);
}

.insight-label,
.stage-item-label {
  color: #5f7386;
}

.insight-value,
.stage-item strong {
  color: #17324c;
  font-weight: 700;
}

.stage-highlight {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.98) 0%, rgba(255, 237, 213, 0.94) 100%);
  border: 1px solid rgba(251, 191, 36, 0.28);
}

.stage-highlight-label {
  font-size: 12px;
  color: #8a5a12;
}

.stage-highlight strong {
  font-size: 22px;
  color: #8a4b08;
}

.stage-columns {
  gap: 12px;
}

.stage-column {
  flex: 1;
  min-width: 0;
}

.stage-list {
  flex-direction: column;
  gap: 10px;
}

.stage-empty {
  padding: 14px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  color: #6b7f91;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(320px, 0.9fr);
  gap: 16px;
}

.graph-card,
.detail-card {
  min-height: 0;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 1380px) {
  .analysis-grid,
  .main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1100px) {
  .content-grid,
  .stage-columns {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
}
</style>
