<template>
  <div class="observability-detail-page" v-loading="loading">
    <section class="observability-hero" v-if="projectDetail">
      <button class="observability-back-link" type="button" @click="router.push({ name: 'observability-projects' })">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回可观测性中心</span>
      </button>

      <div class="observability-hero-head">
        <div>
          <h1>{{ projectDetail.summary.projectName }}</h1>
          <p>{{ projectDetail.summary.projectStatus }} · {{ formatHealthLevel(projectDetail.summary.projectHealthLevel) }}</p>
        </div>
        <div class="observability-hero-pills">
          <span class="management-list-pill" :class="resolveHealthTone(projectDetail.summary.projectHealthLevel)">
            {{ formatHealthLevel(projectDetail.summary.projectHealthLevel) }}
          </span>
          <span class="management-list-pill neutral">
            {{ projectDetail.summary.enabledInstanceCount }}/{{ projectDetail.summary.instanceCount }} 实例
          </span>
        </div>
      </div>

      <div class="observability-hero-kpis">
        <article class="observability-hero-kpi">
          <span>项目健康分</span>
          <strong>{{ projectDetail.summary.projectHealthScore ?? '-' }}</strong>
        </article>
        <article class="observability-hero-kpi">
          <span>异常实例</span>
          <strong>{{ projectDetail.summary.abnormalInstanceCount }}</strong>
        </article>
        <article class="observability-hero-kpi">
          <span>最近健康检查</span>
          <strong>{{ projectDetail.summary.lastHealthCheckedAt || '暂无' }}</strong>
        </article>
        <article class="observability-hero-kpi">
          <span>最近日志采集</span>
          <strong>{{ projectDetail.summary.lastLogCollectedAt || '暂无' }}</strong>
        </article>
      </div>
    </section>

    <section class="observability-tabs-shell" v-if="projectDetail">
      <el-tabs v-model="activeTab" class="observability-tabs">
        <el-tab-pane label="日志" name="logs">
          <section class="observability-panel">
            <div class="observability-panel-head">
              <div>
                <h2>应用日志</h2>
                <p>按实例、级别、关键字和 TraceId 检索当前项目的应用日志。</p>
              </div>
              <div class="observability-inline-filters">
                <el-select v-model="logFilters.runtimeInstanceId" clearable placeholder="运行实例" style="width: 180px">
                  <el-option v-for="item in projectDetail.instances" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
                <el-select v-model="logFilters.level" clearable placeholder="级别" style="width: 120px">
                  <el-option label="INFO" value="INFO" />
                  <el-option label="WARN" value="WARN" />
                  <el-option label="ERROR" value="ERROR" />
                </el-select>
                <el-date-picker
                  v-model="logFilters.timeRange"
                  type="datetimerange"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  style="width: 340px"
                />
                <el-input v-model="logFilters.keyword" placeholder="关键字" style="width: 180px" @keyup.enter="handleLogSearch" />
                <el-input v-model="logFilters.traceId" placeholder="TraceId" style="width: 180px" @keyup.enter="handleLogSearch" />
                <el-button type="primary" @click="handleLogSearch">查询</el-button>
                <el-button @click="handleLogReset">重置</el-button>
              </div>
            </div>

            <div v-if="logPage.records.length" class="observability-log-list">
              <article v-for="item in logPage.records" :key="item.id" class="observability-log-card">
                <header class="observability-log-head">
                  <div class="observability-log-tags">
                    <span class="management-list-pill neutral">{{ item.runtimeInstanceName }}</span>
                    <span class="management-list-pill" :class="resolveLogTone(item.logLevel)">{{ item.logLevel || 'LOG' }}</span>
                    <span v-if="item.traceId" class="management-list-pill neutral mono">{{ item.traceId }}</span>
                  </div>
                  <span class="observability-log-time">{{ item.loggedAt || item.collectedAt || '暂无时间' }}</span>
                </header>
                <div class="observability-log-meta">
                  <span>{{ item.logger || '未识别 Logger' }}</span>
                  <span>{{ item.sourcePath || '主动上报' }}</span>
                </div>
                <pre class="observability-log-message">{{ item.message }}</pre>
              </article>
            </div>
            <el-empty v-else description="暂无日志数据" />

            <div v-if="logPage.total > 0" class="work-list-footer">
              <div class="work-list-footer-total">
                共 <span>{{ logPage.total }}</span> 条
              </div>
              <div class="work-list-footer-controls">
                <div class="work-list-page-size work-list-compact-input">
                  <span>每页</span>
                  <el-select v-model="logPagination.size" size="small" style="width: 92px" @change="handleLogPageSizeChange">
                    <el-option :value="20" label="20" />
                    <el-option :value="50" label="50" />
                    <el-option :value="100" label="100" />
                  </el-select>
                </div>
                <div class="work-list-page-nav">
                  <button class="work-list-page-button" type="button" :disabled="logPagination.page <= 1" @click="handleLogPrevPage">
                    <el-icon><ArrowLeft /></el-icon>
                  </button>
                  <span class="work-list-page-text">第 {{ logPagination.page }} / {{ logTotalPages }} 页</span>
                  <button class="work-list-page-button" type="button" :disabled="logPagination.page >= logTotalPages" @click="handleLogNextPage">
                    <el-icon><ArrowRight /></el-icon>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </el-tab-pane>

        <el-tab-pane label="健康" name="health">
          <section class="observability-panel" v-if="healthDetail">
            <div class="observability-panel-head">
              <div>
                <h2>健康状态</h2>
                <p>查看项目当前健康分、实例探测结果以及最近趋势。</p>
              </div>
              <div class="observability-inline-filters">
                <el-select v-model="healthTimelineRuntimeInstanceId" clearable placeholder="趋势实例" style="width: 180px" @change="loadHealthTimeline">
                  <el-option v-for="item in projectDetail.instances" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </div>
            </div>

            <div class="observability-health-summary">
              <article class="observability-health-stat">
                <span>项目健康分</span>
                <strong>{{ healthDetail.projectHealthScore ?? '-' }}</strong>
              </article>
              <article class="observability-health-stat">
                <span>健康等级</span>
                <strong>{{ formatHealthLevel(healthDetail.projectHealthLevel) }}</strong>
              </article>
              <article class="observability-health-stat">
                <span>最近健康检查</span>
                <strong>{{ healthDetail.lastHealthCheckedAt || '暂无' }}</strong>
              </article>
            </div>

            <div class="observability-timeline">
              <h3>健康趋势</h3>
              <div v-if="healthTimeline.length" class="observability-timeline-list">
                <article v-for="point in healthTimeline" :key="`${point.sampledAt}-${point.healthScore}`" class="observability-timeline-card">
                  <span>{{ point.sampledAt }}</span>
                  <strong>{{ point.healthScore ?? '-' }}</strong>
                  <span :class="['observability-timeline-level', resolveHealthTone(point.healthLevel)]">
                    {{ formatHealthLevel(point.healthLevel) }}
                  </span>
                </article>
              </div>
              <el-empty v-else description="暂无趋势数据" />
            </div>

            <div class="observability-instance-list">
              <article v-for="item in healthDetail.instances" :key="item.runtimeInstanceId" class="observability-instance-card">
                <header class="observability-instance-head">
                  <div>
                    <h3>{{ item.runtimeInstanceName }}</h3>
                    <p>{{ item.environment || '未标记环境' }} · {{ item.serviceName || '未标记服务' }}</p>
                  </div>
                  <span class="management-list-pill" :class="resolveHealthTone(item.healthLevel)">
                    {{ formatHealthLevel(item.healthLevel) }}
                  </span>
                </header>
                <div class="observability-instance-grid">
                  <span>探针：{{ item.probeType || '-' }}</span>
                  <span>目标：{{ item.probeTarget || '-' }}</span>
                  <span>耗时：{{ item.latencyMs ?? '-' }} ms</span>
                  <span>采样时间：{{ item.sampledAt || '暂无' }}</span>
                </div>
                <div v-if="item.failureReason" class="observability-instance-message">{{ item.failureReason }}</div>
              </article>
            </div>
          </section>
        </el-tab-pane>

        <el-tab-pane label="实例配置" name="instances">
          <section class="observability-panel">
            <div class="observability-panel-head">
              <div>
                <h2>运行实例配置</h2>
                <p>维护日志采集和健康检查配置，不改动 Jenkins 绑定主记录。</p>
              </div>
            </div>

            <div class="observability-instance-list">
              <article v-for="item in projectDetail.instances" :key="item.id" class="observability-instance-card">
                <header class="observability-instance-head">
                  <div>
                    <h3>{{ item.name }}</h3>
                    <p>{{ item.environment || '未标记环境' }} · {{ item.serviceName || '未标记服务' }}</p>
                  </div>
                  <div class="observability-instance-actions">
                    <span class="management-list-pill neutral">{{ item.serverMode === 'MANAGED_SERVER' ? '受管服务器' : '外部地址' }}</span>
                    <el-button type="primary" plain @click="openInstanceDialog(item)">编辑配置</el-button>
                  </div>
                </header>
                <div class="observability-instance-grid">
                  <span>日志采集：{{ item.logEnabled ? '已开启' : '未开启' }}</span>
                  <span>健康检查：{{ item.healthEnabled ? '已开启' : '未开启' }}</span>
                  <span>最近日志：{{ item.lastLogCollectedAt || '暂无' }}</span>
                  <span>最近健康：{{ item.lastHealthCheckedAt || '暂无' }}</span>
                </div>
              </article>
            </div>
          </section>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog v-model="instanceDialogVisible" width="680px" class="platform-form-dialog" align-center destroy-on-close>
      <template #header>
        <div class="observability-dialog-head">
          <div class="observability-dialog-title">编辑运行实例观测配置</div>
          <div class="observability-dialog-subtitle">仅更新日志采集与健康探测相关配置。</div>
        </div>
      </template>

      <el-form label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">{{ instanceForm.name || '运行实例' }}</div>
          </div>
          <div class="observability-form-grid">
            <el-form-item label="实例名称">
              <el-input v-model="instanceForm.name" />
            </el-form-item>
            <el-form-item label="环境">
              <el-input v-model="instanceForm.environment" />
            </el-form-item>
            <el-form-item label="服务名">
              <el-input v-model="instanceForm.serviceName" />
            </el-form-item>
            <el-form-item label="启用实例">
              <el-switch v-model="instanceForm.enabled" />
            </el-form-item>
            <el-form-item label="实例类型">
              <el-input :model-value="instanceForm.serverMode === 'MANAGED_SERVER' ? '受管服务器' : '外部地址'" disabled />
            </el-form-item>
            <el-form-item label="目标地址">
              <el-input :model-value="instanceForm.serverMode === 'MANAGED_SERVER' ? (instanceForm.serverName || '受管服务器') : instanceForm.externalBaseUrl" disabled />
            </el-form-item>
            <el-form-item label="开启日志采集" class="observability-form-span-2">
              <el-switch v-model="instanceForm.logEnabled" :disabled="instanceForm.serverMode !== 'MANAGED_SERVER'" />
            </el-form-item>
            <el-form-item label="日志路径" class="observability-form-span-2">
              <el-input v-model="instanceForm.logPathsText" type="textarea" :rows="4" :disabled="!instanceForm.logEnabled" placeholder="每行一个日志路径" />
            </el-form-item>
            <el-form-item label="开启健康检查">
              <el-switch v-model="instanceForm.healthEnabled" />
            </el-form-item>
            <el-form-item label="健康探针">
              <el-select v-model="instanceForm.healthProbeType" :disabled="!instanceForm.healthEnabled">
                <el-option label="HTTP" value="HTTP" />
                <el-option label="TCP" value="TCP" />
              </el-select>
            </el-form-item>
            <el-form-item label="健康检查目标" class="observability-form-span-2">
              <el-input v-model="instanceForm.healthTarget" :disabled="!instanceForm.healthEnabled" />
            </el-form-item>
          </div>
        </section>
      </el-form>

      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="instanceDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="instanceSaving" @click="handleSaveInstance">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  getObservabilityProjectDetail,
  getObservabilityProjectHealth,
  getObservabilityProjectHealthTimeline,
  pageObservabilityProjectLogs,
  updateObservabilityRuntimeInstance
} from '@/api/observability'
import type {
  ObservabilityHealthTimelinePointItem,
  ObservabilityProjectDetailItem,
  ObservabilityProjectHealthItem,
  ObservabilityProjectLogItem,
  PageResponse,
  ProjectRuntimeInstanceItem
} from '@/types/platform'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const activeTab = ref('logs')
const projectDetail = ref<ObservabilityProjectDetailItem | null>(null)
const healthDetail = ref<ObservabilityProjectHealthItem | null>(null)
const healthTimeline = ref<ObservabilityHealthTimelinePointItem[]>([])
const healthTimelineRuntimeInstanceId = ref<number | undefined>(undefined)
const logPage = ref<PageResponse<ObservabilityProjectLogItem>>({
  records: [],
  total: 0,
  page: 1,
  size: 20,
  totalPages: 0
})
const logPagination = reactive({
  page: 1,
  size: 20
})
const logFilters = reactive({
  runtimeInstanceId: undefined as number | undefined,
  level: '',
  timeRange: [] as string[],
  keyword: '',
  traceId: ''
})

const instanceDialogVisible = ref(false)
const instanceSaving = ref(false)
const editingInstanceId = ref<number | null>(null)
const instanceForm = reactive({
  name: '',
  environment: '',
  serviceName: '',
  enabled: true,
  serverMode: 'MANAGED_SERVER' as 'MANAGED_SERVER' | 'EXTERNAL_ENDPOINT',
  serverId: null as number | null,
  serverName: '',
  externalBaseUrl: '',
  logEnabled: false,
  logPathsText: '',
  healthEnabled: true,
  healthProbeType: 'HTTP' as 'HTTP' | 'TCP',
  healthTarget: ''
})

const projectId = computed(() => Number(route.params.projectId))
const logTotalPages = computed(() => Math.max(1, logPage.value.totalPages || 1))

async function loadProjectDetail() {
  projectDetail.value = await getObservabilityProjectDetail(projectId.value)
}

async function loadProjectHealth() {
  healthDetail.value = await getObservabilityProjectHealth(projectId.value)
}

async function loadHealthTimeline() {
  healthTimeline.value = await getObservabilityProjectHealthTimeline(projectId.value, healthTimelineRuntimeInstanceId.value, 50)
}

async function loadLogs() {
  logPage.value = await pageObservabilityProjectLogs(projectId.value, {
    page: logPagination.page,
    size: logPagination.size,
      runtimeInstanceId: logFilters.runtimeInstanceId,
      level: logFilters.level || undefined,
      startTime: logFilters.timeRange[0] || undefined,
      endTime: logFilters.timeRange[1] || undefined,
      keyword: logFilters.keyword || undefined,
      traceId: logFilters.traceId || undefined
    })
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([loadProjectDetail(), loadProjectHealth(), loadHealthTimeline(), loadLogs()])
  } finally {
    loading.value = false
  }
}

async function handleLogSearch() {
  logPagination.page = 1
  await loadLogs()
}

async function handleLogReset() {
  logFilters.runtimeInstanceId = undefined
  logFilters.level = ''
  logFilters.timeRange = []
  logFilters.keyword = ''
  logFilters.traceId = ''
  logPagination.page = 1
  await loadLogs()
}

async function handleLogPrevPage() {
  if (logPagination.page <= 1) return
  logPagination.page -= 1
  await loadLogs()
}

async function handleLogNextPage() {
  if (logPagination.page >= logTotalPages.value) return
  logPagination.page += 1
  await loadLogs()
}

async function handleLogPageSizeChange() {
  logPagination.page = 1
  await loadLogs()
}

function openInstanceDialog(item: ProjectRuntimeInstanceItem) {
  editingInstanceId.value = item.id
  instanceForm.name = item.name
  instanceForm.environment = item.environment || ''
  instanceForm.serviceName = item.serviceName || ''
  instanceForm.enabled = item.enabled
  instanceForm.serverMode = item.serverMode === 'EXTERNAL_ENDPOINT' ? 'EXTERNAL_ENDPOINT' : 'MANAGED_SERVER'
  instanceForm.serverId = item.serverId
  instanceForm.serverName = item.serverName || ''
  instanceForm.externalBaseUrl = item.externalBaseUrl || ''
  instanceForm.logEnabled = item.logEnabled
  instanceForm.logPathsText = (item.logPaths || []).join('\n')
  instanceForm.healthEnabled = item.healthEnabled
  instanceForm.healthProbeType = item.healthProbeType === 'TCP' ? 'TCP' : 'HTTP'
  instanceForm.healthTarget = item.healthTarget || ''
  instanceDialogVisible.value = true
}

async function handleSaveInstance() {
  if (!editingInstanceId.value) return
  if (!instanceForm.name.trim()) {
    ElMessage.warning('运行实例名称不能为空')
    return
  }
  if (instanceForm.healthEnabled && !instanceForm.healthTarget.trim()) {
    ElMessage.warning('健康检查目标不能为空')
    return
  }
  instanceSaving.value = true
  try {
    await updateObservabilityRuntimeInstance(projectId.value, editingInstanceId.value, {
      name: instanceForm.name.trim(),
      environment: instanceForm.environment.trim(),
      serviceName: instanceForm.serviceName.trim(),
      enabled: instanceForm.enabled,
      serverMode: instanceForm.serverMode,
      serverId: instanceForm.serverId,
      externalBaseUrl: instanceForm.externalBaseUrl.trim(),
      logEnabled: instanceForm.serverMode === 'MANAGED_SERVER' && instanceForm.logEnabled,
      logPaths: instanceForm.logEnabled
        ? instanceForm.logPathsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
        : [],
      healthEnabled: instanceForm.healthEnabled,
      healthProbeType: instanceForm.healthProbeType,
      healthTarget: instanceForm.healthEnabled ? instanceForm.healthTarget.trim() : ''
    })
    ElMessage.success('运行实例观测配置已更新')
    instanceDialogVisible.value = false
    await Promise.all([loadProjectDetail(), loadProjectHealth(), loadHealthTimeline()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新运行实例失败')
  } finally {
    instanceSaving.value = false
  }
}

function formatHealthLevel(level?: string | null) {
  switch ((level || '').toUpperCase()) {
    case 'HEALTHY':
      return '健康'
    case 'DEGRADED':
      return '亚健康'
    case 'ABNORMAL':
      return '异常'
    default:
      return '未知'
  }
}

function resolveHealthTone(level?: string | null) {
  switch ((level || '').toUpperCase()) {
    case 'HEALTHY':
      return 'success'
    case 'DEGRADED':
      return 'warning'
    case 'ABNORMAL':
      return 'danger'
    default:
      return 'neutral'
  }
}

function resolveLogTone(level?: string | null) {
  switch ((level || '').toUpperCase()) {
    case 'ERROR':
      return 'danger'
    case 'WARN':
      return 'warning'
    case 'INFO':
      return 'success'
    default:
      return 'neutral'
  }
}

watch(
  () => route.params.projectId,
  async () => {
    logPagination.page = 1
    await loadAll()
  }
)

onMounted(async () => {
  await loadAll()
})
</script>

<style scoped>
.observability-detail-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.observability-hero,
.observability-panel {
  padding: 20px 22px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.06);
}

.observability-back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-primary);
  font-size: 13px;
  font-weight: 700;
}

.observability-hero-head,
.observability-panel-head,
.observability-instance-head,
.observability-log-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.observability-hero-head h1,
.observability-panel-head h2,
.observability-instance-head h3 {
  margin: 0;
  color: var(--app-text);
}

.observability-hero-head p,
.observability-panel-head p,
.observability-instance-head p,
.observability-dialog-subtitle {
  margin: 6px 0 0;
  color: var(--app-muted);
  font-size: 13px;
}

.observability-hero-pills,
.observability-inline-filters,
.observability-log-tags,
.observability-instance-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.observability-hero-kpis,
.observability-health-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.observability-hero-kpi,
.observability-health-stat,
.observability-timeline-card,
.observability-instance-card,
.observability-log-card {
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.observability-hero-kpi span,
.observability-health-stat span,
.observability-timeline-card span {
  color: var(--app-muted);
  font-size: 11px;
  font-weight: 700;
}

.observability-hero-kpi strong,
.observability-health-stat strong,
.observability-timeline-card strong {
  display: block;
  margin-top: 6px;
  color: var(--app-text);
  font-size: 20px;
}

.observability-tabs-shell :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.observability-panel {
  display: grid;
  gap: 16px;
}

.observability-log-list,
.observability-instance-list,
.observability-timeline-list {
  display: grid;
  gap: 12px;
}

.observability-log-meta,
.observability-instance-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  color: var(--app-muted);
  font-size: 12px;
}

.observability-log-time {
  color: var(--app-muted);
  font-size: 12px;
}

.observability-log-message {
  margin: 10px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #172033;
  font-family: JetBrains Mono, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.observability-instance-message {
  margin-top: 10px;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.observability-timeline-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.observability-timeline-level.success {
  color: #15803d;
}

.observability-timeline-level.warning {
  color: #b45309;
}

.observability-timeline-level.danger {
  color: #dc2626;
}

.observability-dialog-title {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 800;
}

.observability-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.observability-form-span-2 {
  grid-column: 1 / -1;
}

.mono {
  font-family: JetBrains Mono, Consolas, 'Courier New', monospace;
}

@media (max-width: 900px) {
  .observability-hero-head,
  .observability-panel-head,
  .observability-instance-head,
  .observability-log-head {
    flex-direction: column;
  }

  .observability-inline-filters {
    width: 100%;
  }

  .observability-inline-filters > * {
    width: 100% !important;
  }

  .observability-log-meta,
  .observability-instance-grid,
  .observability-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
