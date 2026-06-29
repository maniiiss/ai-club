<script setup lang="ts">
/**
 * 智能体调用统计看板。
 * 提供 KPI 卡片、UNKNOWN 告警横幅、按智能体/用户/模型聚合视图、明细列表。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAgentUsageOptions,
  getAgentUsageOverview,
  getAgentUsageTrend,
  getAgentUsageByAgent,
  getAgentUsageByUser,
  getAgentUsageByModel,
  getAgentUsageLogs,
  type AgentUsageOptions,
  type AgentUsageOverview,
  type AgentUsageTrendPoint,
  type AgentUsageAgentBreakdown,
  type AgentUsageUserBreakdown,
  type AgentUsageModelBreakdown,
  type AgentInvocationLogSummary,
  type AgentUsageQueryPayload
} from '@/api/agent-usage'

type Granularity = 'day' | 'week' | 'month'
type TabKey = 'by-agent' | 'by-user' | 'by-model' | 'logs'

const options = ref<AgentUsageOptions | null>(null)
const overview = ref<AgentUsageOverview | null>(null)
const trend = ref<AgentUsageTrendPoint[]>([])
const byAgent = ref<AgentUsageAgentBreakdown[]>([])
const byUser = ref<AgentUsageUserBreakdown[]>([])
const byModel = ref<AgentUsageModelBreakdown[]>([])
const logs = ref<AgentInvocationLogSummary[]>([])
const logsTotal = ref(0)

const loading = reactive({
  overview: false,
  trend: false,
  byAgent: false,
  byUser: false,
  byModel: false,
  logs: false
})

const formatDate = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

const now = new Date()
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

const filters = reactive({
  range: [formatDate(sevenDaysAgo), formatDate(now)] as [string, string],
  agentTypes: [] as string[],
  triggerSources: [] as string[],
  granularity: 'day' as Granularity
})

const activeTab = ref<TabKey>('by-agent')
const page = ref(1)
const size = ref(20)

const buildPayload = (): AgentUsageQueryPayload => ({
  startTime: filters.range?.[0] || undefined,
  endTime: filters.range?.[1] || undefined,
  agentTypes: filters.agentTypes.length ? filters.agentTypes : undefined,
  triggerSources: filters.triggerSources.length ? filters.triggerSources : undefined,
  granularity: filters.granularity
})

const loadOverview = async () => {
  loading.overview = true
  try {
    overview.value = await getAgentUsageOverview(buildPayload())
  } catch (err: unknown) {
    console.error(err)
    ElMessage.error('查询调用总览失败')
  } finally {
    loading.overview = false
  }
}

const loadTrend = async () => {
  loading.trend = true
  try {
    trend.value = await getAgentUsageTrend(buildPayload())
  } catch (err: unknown) {
    console.error(err)
  } finally {
    loading.trend = false
  }
}

const loadByAgent = async () => {
  loading.byAgent = true
  try {
    byAgent.value = await getAgentUsageByAgent(buildPayload())
  } catch (err: unknown) {
    console.error(err)
  } finally {
    loading.byAgent = false
  }
}

const loadByUser = async () => {
  loading.byUser = true
  try {
    byUser.value = await getAgentUsageByUser(buildPayload())
  } catch (err: unknown) {
    console.error(err)
  } finally {
    loading.byUser = false
  }
}

const loadByModel = async () => {
  loading.byModel = true
  try {
    byModel.value = await getAgentUsageByModel(buildPayload())
  } catch (err: unknown) {
    console.error(err)
  } finally {
    loading.byModel = false
  }
}

const loadLogs = async () => {
  loading.logs = true
  try {
    const result = await getAgentUsageLogs({ ...buildPayload(), page: page.value, size: size.value })
    logs.value = result.records
    logsTotal.value = result.total
  } catch (err: unknown) {
    console.error(err)
  } finally {
    loading.logs = false
  }
}

const reload = async () => {
  await Promise.all([loadOverview(), loadTrend(), loadByAgent(), loadByUser(), loadByModel()])
  if (activeTab.value === 'logs') {
    await loadLogs()
  }
}

const onTabChange = async (key: TabKey) => {
  activeTab.value = key
  if (key === 'logs') {
    page.value = 1
    await loadLogs()
  }
}

const onPageChange = async (newPage: number) => {
  page.value = newPage
  await loadLogs()
}

onMounted(async () => {
  try {
    options.value = await getAgentUsageOptions()
  } catch (err: unknown) {
    console.error(err)
  }
  await reload()
})

const successRatePercent = computed(() =>
  overview.value ? Math.round(overview.value.successRate * 1000) / 10 : 0
)
const tokenCoveragePercent = computed(() =>
  overview.value ? Math.round(overview.value.tokenCoverageRatio * 1000) / 10 : 0
)

// SVG 趋势图坐标（调用数）
const trendChart = computed(() => {
  if (!trend.value.length) return { points: '', maxTotal: 0 }
  const maxTotal = Math.max(1, ...trend.value.map(p => p.total))
  const width = 100
  const height = 40
  const step = trend.value.length > 1 ? width / (trend.value.length - 1) : 0
  const points = trend.value
    .map((p, i) => {
      const x = i * step
      const y = height - (p.total / maxTotal) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return { points, maxTotal }
})

const statusColor = (status: string) => {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILURE':
    case 'TIMEOUT':
      return 'danger'
    case 'CLIENT_DISCONNECTED':
    case 'RATE_LIMITED':
      return 'warning'
    default:
      return 'info'
  }
}
</script>

<template>
  <div class="management-list-page agent-usage-page">
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-kicker">智能体看板</span>
        <h1>智能体调用量统计</h1>
        <p class="hero-tip">按用户、智能体、模型和时间维度查看平台所有 AI 调用，含成功率与 token 趋势。</p>
      </div>
    </section>

    <!-- UNKNOWN 兜底告警横幅 -->
    <section v-if="overview && overview.unknownCallCount > 0" class="unknown-banner">
      <div class="unknown-banner-head">
        <span class="unknown-banner-icon">⚠</span>
        <div>
          <strong>检测到 {{ overview.unknownCallCount }} 次未分类的 AI 调用</strong>
          <p>这些调用走了 ModelConfigService 但未通过 AgentInvocationRecorder 显式埋点。请检查下列来源并补充 AgentType 枚举与埋点：</p>
        </div>
      </div>
      <ul class="unknown-banner-list">
        <li v-for="src in overview.unknownCallSources" :key="src.source">
          <span class="unknown-source">{{ src.source }}</span>
          <span class="unknown-count">{{ src.count }} 次</span>
        </li>
      </ul>
    </section>

    <section class="management-list-toolbar agent-usage-toolbar">
      <div class="toolbar-grid">
        <label class="toolbar-item">
          <span>时间范围</span>
          <el-date-picker
            v-model="filters.range"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm:ss"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
        </label>
        <label class="toolbar-item">
          <span>智能体类型</span>
          <el-select v-model="filters.agentTypes" multiple collapse-tags placeholder="全部" clearable>
            <el-option
              v-for="opt in options?.agentTypes || []"
              :key="opt.code"
              :label="opt.label"
              :value="opt.code"
            />
          </el-select>
        </label>
        <label class="toolbar-item">
          <span>触发来源</span>
          <el-select v-model="filters.triggerSources" multiple collapse-tags placeholder="全部" clearable>
            <el-option
              v-for="opt in options?.triggerSources || []"
              :key="opt.code"
              :label="opt.label"
              :value="opt.code"
            />
          </el-select>
        </label>
        <label class="toolbar-item">
          <span>趋势粒度</span>
          <el-radio-group v-model="filters.granularity">
            <el-radio-button label="day">日</el-radio-button>
            <el-radio-button label="week">周</el-radio-button>
            <el-radio-button label="month">月</el-radio-button>
          </el-radio-group>
        </label>
      </div>
      <div class="toolbar-actions">
        <el-button type="primary" :loading="loading.overview" @click="reload">查询</el-button>
      </div>
    </section>

    <section class="kpi-cards" v-loading="loading.overview">
      <article class="kpi-card">
        <span class="kpi-label">总调用数</span>
        <strong class="kpi-value">{{ overview?.totalCount ?? 0 }}</strong>
        <span class="kpi-extra">调用用户：{{ overview?.distinctUserCount ?? 0 }}</span>
      </article>
      <article class="kpi-card" :class="successRatePercent >= 90 ? 'success' : successRatePercent >= 70 ? 'warning' : 'danger'">
        <span class="kpi-label">成功率</span>
        <strong class="kpi-value">{{ successRatePercent }}%</strong>
        <span class="kpi-extra">失败 {{ overview?.failureCount ?? 0 }}</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">总 token</span>
        <strong class="kpi-value">{{ overview?.totalTotalTokens ?? 0 }}</strong>
        <span class="kpi-extra">覆盖率 {{ tokenCoveragePercent }}%</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">平均耗时 (ms)</span>
        <strong class="kpi-value">{{ Math.round(overview?.avgDurationMs ?? 0) }}</strong>
        <span class="kpi-extra">P95 {{ overview?.p95DurationMs ?? 0 }}</span>
      </article>
    </section>

    <section class="trend-section">
      <h3>调用趋势</h3>
      <div v-if="trend.length" class="trend-wrap">
        <svg class="trend-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
          <polyline :points="trendChart.points" fill="none" stroke="#4f8cf7" stroke-width="0.8" />
        </svg>
        <div class="trend-axis">
          <span>{{ trend[0]?.bucket }}</span>
          <span>{{ trend[trend.length - 1]?.bucket }}</span>
        </div>
        <p class="trend-meta">最高峰值 {{ trendChart.maxTotal }} 次 / {{ filters.granularity }}</p>
      </div>
      <el-empty v-else description="暂无趋势数据" :image-size="80" />
    </section>

    <section class="tabs-section">
      <el-tabs :model-value="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="按智能体" name="by-agent">
          <el-table :data="byAgent" v-loading="loading.byAgent" stripe>
            <el-table-column prop="agentLabel" label="智能体" min-width="160" />
            <el-table-column prop="total" label="总调用" width="100" sortable />
            <el-table-column label="成功率" width="160">
              <template #default="{ row }">
                <el-progress :percentage="Math.round(row.successRate * 100)" :status="row.successRate >= 0.9 ? 'success' : row.successRate >= 0.7 ? '' : 'exception'" />
              </template>
            </el-table-column>
            <el-table-column prop="totalTokens" label="总 token" width="120" sortable />
            <el-table-column label="平均耗时(ms)" width="140">
              <template #default="{ row }">{{ Math.round(row.avgDurationMs) }}</template>
            </el-table-column>
            <el-table-column prop="failure" label="失败" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="按用户" name="by-user">
          <el-table :data="byUser" v-loading="loading.byUser" stripe>
            <el-table-column label="用户" min-width="180">
              <template #default="{ row }">
                <div>
                  <strong>{{ row.nickname || row.username || '匿名/系统' }}</strong>
                  <div class="row-sub">{{ row.username }}</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="total" label="总调用" width="100" sortable />
            <el-table-column prop="success" label="成功" width="100" />
            <el-table-column prop="totalTokens" label="总 token" width="120" sortable />
            <el-table-column prop="lastInvokedAt" label="最近调用" min-width="180" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="按模型" name="by-model">
          <el-table :data="byModel" v-loading="loading.byModel" stripe>
            <el-table-column label="模型" min-width="200">
              <template #default="{ row }">
                <div>
                  <strong>{{ row.modelName || '(未记录)' }}</strong>
                  <div class="row-sub">{{ row.provider }}</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="total" label="调用数" width="120" sortable />
            <el-table-column prop="totalTokens" label="总 token" width="120" sortable />
            <el-table-column label="平均耗时(ms)" width="140">
              <template #default="{ row }">{{ Math.round(row.avgDurationMs) }}</template>
            </el-table-column>
            <el-table-column prop="p95DurationMs" label="P95(ms)" width="120" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="明细列表" name="logs">
          <el-table :data="logs" v-loading="loading.logs" stripe size="small">
            <el-table-column prop="createdAt" label="时间" min-width="170" fixed />
            <el-table-column prop="agentLabel" label="智能体" width="140" />
            <el-table-column prop="action" label="动作" width="140" />
            <el-table-column label="用户" width="140">
              <template #default="{ row }">{{ row.nickname || row.username || '系统' }}</template>
            </el-table-column>
            <el-table-column prop="modelName" label="模型" width="160" />
            <el-table-column label="状态" width="140">
              <template #default="{ row }">
                <el-tag :type="statusColor(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="durationMs" label="耗时(ms)" width="100" />
            <el-table-column prop="totalTokens" label="token" width="100" />
            <el-table-column prop="errorMessage" label="错误" show-overflow-tooltip min-width="200" />
          </el-table>
          <div class="logs-pagination">
            <el-pagination
              v-model:current-page="page"
              :page-size="size"
              :total="logsTotal"
              layout="total, prev, pager, next"
              @current-change="onPageChange"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<style scoped>
.agent-usage-page {
  padding: 16px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hero {
  background: linear-gradient(135deg, #eef4ff 0%, #fbfdff 100%);
  border: 1px solid #dde6f6;
  border-radius: 12px;
  padding: 20px 24px;
}
.hero-kicker {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #4f8cf7;
  color: #fff;
  font-size: 12px;
  margin-bottom: 8px;
}
.hero h1 {
  font-size: 22px;
  margin: 0 0 6px;
}
.hero-tip {
  margin: 0;
  color: #5a6b85;
  font-size: 14px;
}

.unknown-banner {
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 10px;
  padding: 14px 18px;
}
.unknown-banner-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.unknown-banner-icon {
  font-size: 22px;
  line-height: 1;
}
.unknown-banner strong {
  display: block;
  color: #ad6800;
  font-size: 15px;
}
.unknown-banner p {
  margin: 4px 0 0;
  color: #874d00;
  font-size: 13px;
}
.unknown-banner-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.unknown-banner-list li {
  background: #fff;
  border: 1px solid #ffd591;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 12px;
  display: inline-flex;
  gap: 8px;
}
.unknown-source { font-family: monospace; color: #ad6800; }
.unknown-count { color: #d46b08; }

.toolbar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}
.toolbar-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #5a6b85;
}
.toolbar-actions {
  display: flex;
  justify-content: flex-end;
}

.kpi-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.kpi-card {
  background: #fff;
  border: 1px solid #eaeef5;
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-card.success { border-color: #b7eb8f; background: #f6ffed; }
.kpi-card.warning { border-color: #ffd591; background: #fff7e6; }
.kpi-card.danger { border-color: #ffa39e; background: #fff1f0; }
.kpi-label { font-size: 12px; color: #8896a8; }
.kpi-value { font-size: 24px; color: #1f2d3d; }
.kpi-extra { font-size: 12px; color: #5a6b85; }

.trend-section {
  background: #fff;
  border: 1px solid #eaeef5;
  border-radius: 10px;
  padding: 16px;
}
.trend-section h3 { margin: 0 0 10px; font-size: 14px; }
.trend-chart {
  width: 100%;
  height: 80px;
  display: block;
}
.trend-axis {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #8896a8;
  margin-top: 4px;
}
.trend-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: #5a6b85;
}

.tabs-section {
  background: #fff;
  border: 1px solid #eaeef5;
  border-radius: 10px;
  padding: 8px 16px 16px;
}
.row-sub {
  font-size: 11px;
  color: #8896a8;
}
.logs-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}
</style>