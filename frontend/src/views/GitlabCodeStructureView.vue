<template>
  <div class="gitlab-code-structure-page" v-loading="loading">
    <section class="execution-detail-hero">
      <button class="execution-back-button" type="button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回代码仓库管理</span>
      </button>
      <div class="execution-detail-heading">
        <div>
          <h1>{{ snapshot?.repositoryName || '代码结构' }}</h1>
        </div>
        <div class="execution-detail-actions">
          <el-select
            v-model="selectedBranch"
            filterable
            remote
            reserve-keyword
            placeholder="选择分支"
            style="width: 260px"
            :remote-method="handleBranchSearch"
            :loading="branchLoading"
            @change="handleBranchChange"
          >
            <el-option
              v-for="item in branchOptions"
              :key="item.name"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
          <el-button v-if="isQueryMode" @click="resetQueryMode">返回概览</el-button>
          <el-button type="primary" :loading="refreshing" @click="handleRefresh">刷新代码结构</el-button>
        </div>
      </div>
      <div class="execution-detail-meta">
        <span>项目：{{ snapshot?.projectName || '-' }}</span>
        <span>路径：{{ snapshot?.repositoryPath || '-' }}</span>
        <span>状态：{{ formatStatusLabel(snapshot?.status) }}</span>
        <span>分支：{{ selectedBranch || '-' }}</span>
        <span>提交：{{ shortSha(snapshot?.commitSha) }}</span>
        <span>更新时间：{{ snapshot?.generatedAt || '-' }}</span>
      </div>
      <div class="structure-query-bar">
        <el-input
          v-model="queryText"
          placeholder="输入关键词定位局部代码结构，例如：createBindingScanTask"
          clearable
          @keyup.enter="handleQuery"
        >
          <template #append>
            <el-button :loading="queryLoading" @click="handleQuery">查询</el-button>
          </template>
        </el-input>
      </div>
      <div v-if="snapshot?.lastErrorMessage" class="structure-alert danger">
        {{ snapshot.lastErrorMessage }}
      </div>
      <div v-else-if="snapshot?.degraded" class="structure-alert warning">
        当前快照包含降级结果，请结合实际代码继续核对。
      </div>
    </section>

    <div class="structure-overview-grid">
      <article v-for="item in activeOverviewCards" :key="item.key" class="execution-panel overview-card">
        <span class="overview-card-label">{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </div>

    <div class="structure-main-grid">
      <article class="execution-panel structure-side-panel">
        <div class="execution-panel-head section-header">
          <div>
            <h2>{{ isQueryMode ? '命中符号' : '候选关键符号' }}</h2>
          </div>
          <el-tag type="info" size="small">{{ activeSymbols.length }}</el-tag>
        </div>
        <div class="execution-panel-body">
          <div v-if="activeSymbols.length" class="structure-list">
            <button
              v-for="item in activeSymbols"
              :key="item.uid"
              type="button"
              class="structure-list-item"
              @click="focusSymbol(item.uid)"
            >
              <strong>{{ item.name }}</strong>
              <span>{{ item.symbolKind }} · {{ item.filePath || '未知路径' }}</span>
            </button>
          </div>
          <el-empty v-else description="当前没有可展示的关键符号" />
        </div>
      </article>

      <article class="execution-panel structure-graph-panel">
        <div class="execution-panel-head section-header">
          <div>
            <h2>{{ isQueryMode ? '局部结果图' : '仓库概览图' }}</h2>
          </div>
          <el-space wrap>
            <el-select v-model="layoutMode" style="width: 120px" size="small">
              <el-option label="网络布局" value="network" />
              <el-option label="环形布局" value="ring" />
              <el-option label="网格布局" value="grid" />
            </el-select>
            <el-tag type="info" size="small">{{ activeGraphNodes.length }} 节点</el-tag>
            <el-tag type="info" size="small">{{ activeGraphEdges.length }} 边</el-tag>
          </el-space>
        </div>
        <div class="execution-panel-body" style="padding: 0; min-height: 480px; display: flex; flex-direction: column;">
          <GitlabCodeStructureGraphCanvas
            :nodes="activeGraphNodes"
            :edges="activeGraphEdges"
            :layout-mode="layoutMode"
            :selected-node-id="selectedNodeId"
            :selected-edge-id="selectedEdgeId"
            @select-node="handleSelectNode"
            @select-edge="handleSelectEdge"
            @clear-selection="handleClearSelection"
          />
        </div>
      </article>

      <article class="execution-panel structure-side-panel">
        <div class="execution-panel-head section-header">
          <div>
            <h2>{{ isQueryMode ? '命中流程' : '候选流程' }}</h2>
          </div>
          <el-tag type="info" size="small">{{ activeProcesses.length }}</el-tag>
        </div>
        <div class="execution-panel-body">
          <div v-if="activeProcesses.length" class="structure-list">
            <button
              v-for="item in activeProcesses"
              :key="item.id"
              type="button"
              class="structure-list-item"
              @click="focusProcess(item.id)"
            >
              <strong>{{ item.name }}</strong>
              <span>步骤 {{ item.stepIndex || '-' }} / {{ item.stepCount || '-' }}</span>
            </button>
          </div>
          <el-empty v-else description="当前没有可展示的流程结果" />
        </div>
      </article>
    </div>

    <div class="structure-detail-grid">
      <article class="execution-panel">
        <div class="execution-panel-head section-header">
          <div>
            <h2>选中详情</h2>
          </div>
          <el-tag v-if="selectedNode" size="small" :style="{ background: nodeColor(selectedNode.nodeType), color: '#fff', border: 'none' }">
            {{ nodeTypeLabel(selectedNode.nodeType) }}
          </el-tag>
          <el-tag v-else-if="selectedEdge" type="info" size="small">{{ selectedEdge.edgeType }}</el-tag>
        </div>
        <div class="execution-panel-body">
          <div v-if="selectedNode" class="detail-panel">
            <div class="detail-title">{{ selectedNode.label }}</div>
            <div class="detail-meta">类型：{{ nodeTypeLabel(selectedNode.nodeType) }}</div>
            <div class="detail-meta">路径：{{ selectedNode.filePath || '-' }}</div>
            <div class="detail-meta">UID：{{ selectedNode.symbolUid || selectedNode.id }}</div>
            <div v-if="selectedNode.detailText" class="detail-block">
              <div class="detail-block-title">说明</div>
              <div class="detail-block-content">{{ selectedNode.detailText }}</div>
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
          </div>

          <div v-else-if="selectedEdge" class="detail-panel">
            <div class="detail-title">{{ selectedEdge.edgeType }}</div>
            <div class="detail-meta">{{ selectedEdge.sourceId }} → {{ selectedEdge.targetId }}</div>
            <div class="detail-block">
              <div class="detail-block-title">说明</div>
              <div class="detail-block-content">{{ selectedEdge.detailText || '-' }}</div>
            </div>
          </div>

          <el-empty v-else description="点击图谱中的节点或边查看详情" />
        </div>
      </article>

      <article class="execution-panel">
        <div class="execution-panel-head section-header">
          <div>
            <h2>概览摘要</h2>
          </div>
          <el-tag v-if="snapshot?.truncated" type="warning" size="small">结果已截断</el-tag>
        </div>
        <div class="execution-panel-body">
          <div class="structure-markdown">
            <MdPreview
              editor-id="gitlab-code-structure-summary"
              language="zh-CN"
              preview-theme="github"
              :model-value="snapshot?.summaryMarkdown || '暂无摘要'"
            />
          </div>
          <div class="structure-hints">
            <div class="detail-block-title">Harness 提示</div>
            <div v-if="snapshot?.harnessHints?.length" class="hint-list">
              <span v-for="item in snapshot.harnessHints" :key="item" class="hint-pill">{{ item }}</span>
            </div>
            <div v-else class="hint-empty">当前没有额外的验证提示。</div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { MdPreview } from 'md-editor-v3'
import { useRoute, useRouter } from 'vue-router'
import { getGitlabCodeStructure, listGitlabBranches, queryGitlabCodeStructure, refreshGitlabCodeStructure } from '@/api/gitlab'
import type {
  GitlabBranchItem,
  GitlabCodeStructureGraphEdgeItem,
  GitlabCodeStructureGraphNodeItem,
  GitlabCodeStructureProcessItem,
  GitlabCodeStructureQueryResultItem,
  GitlabCodeStructureSnapshotItem
} from '@/types/platform'

type LayoutMode = 'network' | 'ring' | 'grid'

const GitlabCodeStructureGraphCanvas = defineAsyncComponent(() => import('@/components/GitlabCodeStructureGraphCanvas.vue'))

const route = useRoute()
const router = useRouter()
const bindingId = computed(() => Number(route.params.id))

const loading = ref(false)
const refreshing = ref(false)
const queryLoading = ref(false)
const branchLoading = ref(false)
const snapshot = ref<GitlabCodeStructureSnapshotItem | null>(null)
const queryResult = ref<GitlabCodeStructureQueryResultItem | null>(null)
const queryText = ref('')
const selectedBranch = ref('')
const branchOptions = ref<GitlabBranchItem[]>([])
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const layoutMode = ref<LayoutMode>('network')
let refreshPollingTimer: number | null = null

const isQueryMode = computed(() => queryResult.value !== null)
const activeGraphNodes = computed(() => isQueryMode.value ? (queryResult.value?.graphNodes || []) : (snapshot.value?.graphNodes || []))
const activeGraphEdges = computed(() => isQueryMode.value ? (queryResult.value?.graphEdges || []) : (snapshot.value?.graphEdges || []))
const activeSymbols = computed(() => isQueryMode.value ? (queryResult.value?.hitSymbols || []) : (snapshot.value?.candidateSymbols || []))
const activeProcesses = computed(() => isQueryMode.value ? (queryResult.value?.hitProcesses || []) : (snapshot.value?.candidateProcesses || []))
const activeOverviewCards = computed(() => snapshot.value?.overviewCards || [])
const selectedNode = computed(() => activeGraphNodes.value.find((item) => item.id === selectedNodeId.value) || null)
const selectedEdge = computed(() => activeGraphEdges.value.find((item) => item.id === selectedEdgeId.value) || null)

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const selectedNodeMetaEntries = computed(() => {
  const metadata = parseMetadata(selectedNode.value?.metadataJson)
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => ({ key, value: String(value) }))
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

const formatStatusLabel = (status?: string | null) => {
  if (status === 'READY') return '已生成'
  if (status === 'DEGRADED') return '已降级'
  if (status === 'BUILDING') return '生成中'
  if (status === 'FAILED') return '生成失败'
  return '未生成'
}

const shortSha = (value?: string | null) => value ? value.slice(0, 12) : '-'

const clearSelection = () => {
  selectedNodeId.value = null
  selectedEdgeId.value = null
}

const stopRefreshPolling = () => {
  if (refreshPollingTimer !== null) {
    window.clearInterval(refreshPollingTimer)
    refreshPollingTimer = null
  }
}

const ensureRefreshPolling = () => {
  stopRefreshPolling()
  if (snapshot.value?.status !== 'BUILDING') {
    return
  }
  // 结构化刷新属于后台异步任务，这里用轻量轮询把 BUILDING 态及时收敛回最新快照。
  refreshPollingTimer = window.setInterval(async () => {
    try {
      const latest = await getGitlabCodeStructure(bindingId.value, selectedBranch.value || undefined)
      snapshot.value = latest
      selectedBranch.value = latest.branchName || selectedBranch.value
      if (latest.status !== 'BUILDING') {
        stopRefreshPolling()
      }
    } catch {
      stopRefreshPolling()
    }
  }, 5000)
}

const loadBranches = async (search = '') => {
  branchLoading.value = true
  try {
    branchOptions.value = await listGitlabBranches(bindingId.value, search || undefined)
  } finally {
    branchLoading.value = false
  }
}

const loadSnapshot = async (branch?: string) => {
  loading.value = true
  try {
    const detail = await getGitlabCodeStructure(bindingId.value, branch)
    snapshot.value = detail
    selectedBranch.value = detail.branchName || branch || selectedBranch.value
    clearSelection()
    ensureRefreshPolling()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载代码结构失败')
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  void router.push({ name: 'gitlab' })
}

const handleBranchSearch = (keyword: string) => {
  void loadBranches(keyword)
}

const handleBranchChange = async (branch: string) => {
  resetQueryMode()
  await loadSnapshot(branch)
}

const handleRefresh = async () => {
  refreshing.value = true
  try {
    const result = await refreshGitlabCodeStructure(bindingId.value, { branch: selectedBranch.value || undefined })
    ElMessage.success(result.accepted ? '代码结构刷新已开始' : '当前分支正在刷新，请稍候')
    await loadSnapshot(result.branchName || selectedBranch.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '刷新代码结构失败')
  } finally {
    refreshing.value = false
  }
}

const handleQuery = async () => {
  const normalized = queryText.value.trim()
  if (normalized.length < 2) {
    ElMessage.warning('查询关键词至少需要 2 个字符')
    return
  }
  queryLoading.value = true
  try {
    queryResult.value = await queryGitlabCodeStructure(bindingId.value, {
      branch: selectedBranch.value,
      query: normalized
    })
    clearSelection()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '执行代码结构查询失败')
  } finally {
    queryLoading.value = false
  }
}

const resetQueryMode = () => {
  queryResult.value = null
  clearSelection()
}

const handleSelectNode = (id: string) => {
  selectedNodeId.value = id
  selectedEdgeId.value = null
}

const handleSelectEdge = (id: string) => {
  selectedEdgeId.value = id
  selectedNodeId.value = null
}

const handleClearSelection = () => {
  clearSelection()
}

const focusSymbol = (uid: string) => {
  const targetNode = activeGraphNodes.value.find((item) => item.symbolUid === uid || item.id === uid)
  if (!targetNode) return
  handleSelectNode(targetNode.id)
}

const focusProcess = (processId: string) => {
  const targetNode = activeGraphNodes.value.find((item) => item.id === `process:${processId}`)
  if (!targetNode) return
  handleSelectNode(targetNode.id)
}

watch(
  () => snapshot.value?.status,
  () => {
    ensureRefreshPolling()
  }
)

onMounted(async () => {
  await Promise.all([loadBranches(), loadSnapshot()])
})

onBeforeUnmount(() => {
  stopRefreshPolling()
})
</script>

<style scoped>
.gitlab-code-structure-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 104px);
  min-height: 0;
  gap: 10px;
  overflow: hidden;
}

.execution-detail-hero,
.execution-panel {
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.execution-detail-hero {
  flex: 0 0 auto;
  padding: 12px 14px;
}

.execution-back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.18s ease;
}

.execution-back-button .el-icon {
  font-size: 14px;
}

.execution-back-button:hover {
  color: var(--app-primary);
}

.execution-detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
}

.execution-detail-heading h1 {
  margin: 0;
  color: #0f172a;
  font-size: 21px;
  font-weight: 900;
  line-height: 1.15;
}

.execution-detail-actions,
.execution-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.execution-detail-meta {
  margin-top: 8px;
}

.execution-detail-meta span {
  border: 0;
  border-radius: 999px;
  padding: 4px 8px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  line-height: 1.25;
}

.structure-query-bar {
  margin-top: 14px;
}

.structure-alert {
  margin-top: 12px;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
}

.structure-alert.warning {
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.structure-alert.danger {
  background: rgba(239, 68, 68, 0.1);
  color: #991b1b;
}

.structure-overview-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  flex: 0 0 auto;
}

.overview-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
}

.overview-card-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.overview-card strong {
  color: #0f172a;
  font-size: 22px;
  line-height: 1.1;
}

.structure-main-grid,
.structure-detail-grid {
  display: grid;
  flex: 1 1 auto;
  min-height: 0;
  gap: 10px;
}

.structure-main-grid {
  grid-template-columns: 320px minmax(0, 1fr) 320px;
}

.structure-detail-grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  flex: 0 0 320px;
}

.execution-panel {
  display: flex;
  flex-direction: column;
  padding: 14px;
  min-width: 0;
  min-height: 0;
  overflow: visible;
}

.execution-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
  margin-bottom: 10px;
}

.execution-panel-head h2 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  font-weight: 700;
}

.execution-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.structure-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.structure-list-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.82);
  color: #334155;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease;
}

.structure-list-item:hover {
  border-color: rgba(37, 99, 235, 0.26);
  transform: translateY(-1px);
}

.structure-list-item strong {
  color: #0f172a;
  font-size: 13px;
}

.structure-list-item span {
  color: #64748b;
  font-size: 11px;
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-title {
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
}

.detail-meta {
  color: #475569;
  font-size: 12px;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.detail-block-title {
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.detail-block-content {
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.meta-item {
  border-radius: 8px;
  background: rgba(241, 245, 249, 0.86);
  padding: 8px 10px;
}

.meta-key {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.meta-value {
  display: block;
  margin-top: 4px;
  color: #0f172a;
  font-size: 12px;
}

.structure-markdown {
  min-height: 240px;
}

.structure-hints {
  margin-top: 16px;
}

.hint-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.hint-pill {
  border: 1px solid rgba(15, 118, 110, 0.18);
  border-radius: 999px;
  background: rgba(240, 253, 250, 0.9);
  color: #115e59;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
}

.hint-empty {
  margin-top: 8px;
  color: #64748b;
  font-size: 11px;
}

@media (max-width: 1280px) {
  .structure-overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .structure-main-grid {
    grid-template-columns: 1fr;
  }
  .structure-detail-grid {
    grid-template-columns: 1fr;
    flex: 1 1 auto;
  }
}

@media (max-width: 768px) {
  .execution-detail-heading {
    flex-direction: column;
    align-items: stretch;
  }
  .execution-detail-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .structure-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
