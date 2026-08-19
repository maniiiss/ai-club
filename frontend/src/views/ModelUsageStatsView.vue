<template>
  <div class="model-usage-stats">
    <!-- 筛选区 -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-bar">
        <el-date-picker
          v-model="filters.range"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format="YYYY-MM-DD HH:mm:ss"
          :shortcuts="rangeShortcuts"
        />
        <el-select
          v-model="filters.modelNames"
          multiple
          collapse-tags
          collapse-tags-tooltip
          filterable
          clearable
          placeholder="模型"
          style="width: 260px"
        >
          <el-option
            v-for="m in options?.models ?? []"
            :key="m.modelName + '|' + m.provider"
            :label="m.modelName + ' (' + m.provider + ')'"
            :value="m.modelName"
          />
        </el-select>
        <el-select
          v-model="filters.providers"
          multiple
          collapse-tags
          clearable
          placeholder="供应商"
          style="width: 180px"
        >
          <el-option
            v-for="p in options?.providers ?? []"
            :key="p.code"
            :label="p.label"
            :value="p.code"
          />
        </el-select>
        <el-select
          v-model="filters.agentTypes"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          placeholder="来源"
          style="width: 220px"
        >
          <el-option
            v-for="t in options?.agentTypes ?? []"
            :key="t.code"
            :label="t.label"
            :value="t.code"
          />
        </el-select>
        <el-radio-group v-model="filters.granularity">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
          <el-radio-button value="month">月</el-radio-button>
        </el-radio-group>
        <el-button type="primary" :loading="loading.overview" @click="reload">查询</el-button>
      </div>
    </el-card>

    <!-- KPI 卡片 -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">总调用</div>
        <div class="kpi-value">{{ overview?.totalCalls ?? 0 }}</div>
        <div class="kpi-sub">成功 {{ overview?.successCount ?? 0 }} / 失败 {{ overview?.failureCount ?? 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">总 Token</div>
        <div class="kpi-value">{{ formatNumber(overview?.totalTokens ?? 0) }}</div>
        <div class="kpi-sub">输入 {{ formatNumber(overview?.inputTokens ?? 0) }} / 输出 {{ formatNumber(overview?.outputTokens ?? 0) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">成功率</div>
        <div class="kpi-value" :class="successRateClass">{{ formatPercent(overview?.successRate ?? 0) }}</div>
        <div class="kpi-sub">Token 覆盖率 {{ formatPercent(overview?.tokenCoverage ?? 0) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">活跃模型</div>
        <div class="kpi-value">{{ overview?.activeModelCount ?? 0 }}</div>
        <div class="kpi-sub">独立用户 {{ overview?.distinctUsers ?? 0 }} / P95 {{ formatNumber(overview?.p95DurationMs ?? 0) }}ms</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">缓存命中</div>
        <div class="kpi-value">{{ formatNumber(overview?.cachedTokens ?? 0) }}</div>
        <div class="kpi-sub" v-if="overview?.cacheHitRate != null">命中率 {{ formatPercent(overview.cacheHitRate) }}</div>
        <div class="kpi-sub" v-else>命中率 -</div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-row">
      <el-card class="chart-card" shadow="never" v-loading="loading.byModel">
        <template #header><span>模型调用量排行</span></template>
        <v-chart class="chart" :option="rankingBarOption" autoresize />
      </el-card>
      <el-card class="chart-card" shadow="never" v-loading="loading.overview">
        <template #header><span>Token 输入/输出分布</span></template>
        <v-chart class="chart" :option="tokenPieOption" autoresize />
      </el-card>
      <el-card class="chart-card" shadow="never" v-loading="loading.bySource">
        <template #header><span>调用量来源分布</span></template>
        <v-chart class="chart" :option="sourceBarOption" autoresize />
      </el-card>
    </div>

    <el-card class="chart-card full" shadow="never" v-loading="loading.trend">
      <template #header><span>调用趋势</span></template>
      <v-chart class="chart tall" :option="trendLineOption" autoresize />
    </el-card>

    <!-- 模型明细表格 -->
    <el-card class="table-card" shadow="never" v-loading="loading.byModel">
      <template #header><span>模型明细</span></template>
      <el-table :data="byModel" stripe size="default">
        <el-table-column prop="modelName" label="模型" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.modelName }}<el-tag size="small" style="margin-left: 6px">{{ row.provider }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="total" label="调用数" width="100" sortable />
        <el-table-column label="成功率" width="110" sortable :sort-method="sortBySuccessRate">
          <template #default="{ row }">
            <el-progress :percentage="Math.round((row.successRate ?? 0) * 100)" :stroke-width="8" :status="successStatus(row.successRate)" />
          </template>
        </el-table-column>
        <el-table-column prop="inputTokens" label="输入Token" width="120" sortable>
          <template #default="{ row }">{{ formatNumber(row.inputTokens) }}</template>
        </el-table-column>
        <el-table-column prop="outputTokens" label="输出Token" width="120" sortable>
          <template #default="{ row }">{{ formatNumber(row.outputTokens) }}</template>
        </el-table-column>
        <el-table-column prop="totalTokens" label="总Token" width="120" sortable>
          <template #default="{ row }">{{ formatNumber(row.totalTokens) }}</template>
        </el-table-column>
        <el-table-column prop="cachedTokens" label="缓存命中Token" width="130" sortable>
          <template #default="{ row }">{{ formatNumber(row.cachedTokens) }}</template>
        </el-table-column>
        <el-table-column label="缓存命中率" width="120" sortable>
          <template #default="{ row }">
            <span v-if="row.cacheHitRate != null">{{ formatPercent(row.cacheHitRate) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="avgDurationMs" label="平均耗时" width="110" sortable>
          <template #default="{ row }">{{ formatNumber(Math.round(row.avgDurationMs)) }}ms</template>
        </el-table-column>
        <el-table-column prop="p95DurationMs" label="P95耗时" width="110" sortable>
          <template #default="{ row }">{{ formatNumber(row.p95DurationMs) }}ms</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 用户 Token 用量单独展示，避免用户维度挤占模型统计表的横向空间。 -->
    <el-card class="table-card user-token-card" shadow="never" v-loading="loading.byUser">
      <template #header>
        <div class="table-card-header">
          <span>用户 Token 用量</span>
          <span class="table-card-tip">按总 Token 取前 20 名</span>
        </div>
      </template>
      <el-table :data="byUser" stripe size="default" empty-text="暂无用户 Token 用量">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <strong>{{ row.nickname || row.username || '匿名/系统' }}</strong>
              <span v-if="row.nickname && row.username" class="user-sub">{{ row.username }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="total" label="调用数" width="100" sortable />
        <el-table-column prop="inputTokens" label="输入 Token" width="130" sortable>
          <template #default="{ row }">{{ formatNumber(row.inputTokens) }}</template>
        </el-table-column>
        <el-table-column prop="outputTokens" label="输出 Token" width="130" sortable>
          <template #default="{ row }">{{ formatNumber(row.outputTokens) }}</template>
        </el-table-column>
        <el-table-column prop="totalTokens" label="总 Token" width="130" sortable>
          <template #default="{ row }">{{ formatNumber(row.totalTokens) }}</template>
        </el-table-column>
        <el-table-column prop="cachedTokens" label="缓存命中 Token" width="150" sortable>
          <template #default="{ row }">{{ formatNumber(row.cachedTokens) }}</template>
        </el-table-column>
        <el-table-column label="缓存命中率" width="120" sortable>
          <template #default="{ row }">
            <span v-if="row.cacheHitRate != null">{{ formatPercent(row.cacheHitRate) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="lastInvokedAt" label="最近调用" min-width="180" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, TitleComponent } from 'echarts/components'
import {
  getModelUsageOptions,
  getModelUsageOverview,
  getModelUsageByModel,
  getModelUsageByUser,
  getModelUsageTrend,
  getModelUsageBySource
} from '@/api/model-usage'
import type {
  ModelBreakdown,
  ModelOverview,
  ModelTrendPoint,
  ModelUsageOptions,
  ModelUsageQueryPayload,
  SourceBreakdown,
  UserBreakdown
} from '@/api/model-usage'

// 按需注册 ECharts 模块，避免全量引入增大打包体积。
use([
  CanvasRenderer,
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, TitleComponent
])

interface Filters {
  range: [string, string] | null
  modelNames: string[]
  providers: string[]
  agentTypes: string[]
  granularity: 'day' | 'week' | 'month'
}

const options = ref<ModelUsageOptions | null>(null)
const overview = ref<ModelOverview | null>(null)
const byModel = ref<ModelBreakdown[]>([])
const byUser = ref<UserBreakdown[]>([])
const bySource = ref<SourceBreakdown[]>([])
const trend = ref<ModelTrendPoint[]>([])
const loading = reactive({ overview: false, byModel: false, byUser: false, bySource: false, trend: false })

const filters = reactive<Filters>({
  range: defaultRange(),
  modelNames: [],
  providers: [],
  agentTypes: [],
  granularity: 'day'
})

const rangeShortcuts = [
  { text: '最近 7 天', value: () => defaultRange(7) },
  { text: '最近 30 天', value: () => defaultRange(30) },
  { text: '最近 90 天', value: () => defaultRange(90) }
]

function defaultRange(days = 7): [string, string] {
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return [fmt(start), fmt(end)]
}

function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function buildPayload(): ModelUsageQueryPayload {
  const payload: ModelUsageQueryPayload = { granularity: filters.granularity }
  if (filters.range && filters.range.length === 2) {
    payload.startTime = filters.range[0]
    payload.endTime = filters.range[1]
  }
  if (filters.modelNames.length) payload.modelNames = [...filters.modelNames]
  if (filters.providers.length) payload.providers = [...filters.providers]
  if (filters.agentTypes.length) payload.agentTypes = [...filters.agentTypes]
  return payload
}

async function loadOptions() {
  try {
    options.value = await getModelUsageOptions()
  } catch (e) {
    ElMessage.error('加载筛选项失败')
  }
}

async function loadOverview() {
  loading.overview = true
  try {
    overview.value = await getModelUsageOverview(buildPayload())
  } catch (e) {
    ElMessage.error('加载总览失败')
  } finally {
    loading.overview = false
  }
}

async function loadByModel() {
  loading.byModel = true
  try {
    byModel.value = await getModelUsageByModel(buildPayload())
  } catch (e) {
    ElMessage.error('加载模型明细失败')
  } finally {
    loading.byModel = false
  }
}

async function loadByUser() {
  loading.byUser = true
  try {
    byUser.value = await getModelUsageByUser({ ...buildPayload(), limit: 20 })
  } catch (e) {
    ElMessage.error('加载用户 Token 用量失败')
  } finally {
    loading.byUser = false
  }
}

async function loadBySource() {
  loading.bySource = true
  try {
    bySource.value = await getModelUsageBySource(buildPayload())
  } catch (e) {
    ElMessage.error('加载来源分布失败')
  } finally {
    loading.bySource = false
  }
}

async function loadTrend() {
  loading.trend = true
  try {
    trend.value = await getModelUsageTrend(buildPayload())
  } catch (e) {
    ElMessage.error('加载趋势失败')
  } finally {
    loading.trend = false
  }
}

function reload() {
  loadOverview()
  loadByModel()
  loadByUser()
  loadBySource()
  loadTrend()
}

onMounted(() => {
  loadOptions()
  reload()
})

// ---------- 图表配置 ----------

const rankingBarOption = computed(() => {
  const rows = [...byModel.value].slice(0, 15)
  // 排行面向管理员展示可识别的配置名称；历史或系统调用没有配置时回退实际模型名。
  const names = rows.map((r) => r.modelConfigName || r.modelName)
  const totals = rows.map((r) => r.total)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: names, inverse: true },
    series: [{ name: '调用数', type: 'bar', data: totals, itemStyle: { color: '#409eff' } }]
  }
})

const tokenPieOption = computed(() => {
  const input = overview.value?.inputTokens ?? 0
  const output = overview.value?.outputTokens ?? 0
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: [
        { name: '输入 Token', value: input, itemStyle: { color: '#67c23a' } },
        { name: '输出 Token', value: output, itemStyle: { color: '#e6a23c' } }
      ]
    }]
  }
})

const sourceBarOption = computed(() => {
  // Top 15 来源 + 其余合并为「其他」，避免 20 个类型切片过碎。
  const top = bySource.value.slice(0, 15)
  const rest = bySource.value.slice(15)
  const names: string[] = []
  const data: (number | { value: number; itemStyle: { color: string } })[] = []
  for (const r of top) {
    names.push(r.label || r.agentType)
    data.push(r.total)
  }
  if (rest.length) {
    names.push('其他')
    data.push({ value: rest.reduce((s, r) => s + r.total, 0), itemStyle: { color: '#909399' } })
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: names, inverse: true },
    series: [{ name: '调用数', type: 'bar', data, itemStyle: { color: '#409eff' } }]
  }
})

const trendLineOption = computed(() => {
  const buckets = trend.value.map((p) => p.bucket)
  const totals = trend.value.map((p) => p.total)
  const tokens = trend.value.map((p) => p.totalTokens)
  const rates = trend.value.map((p) => (p.cacheHitRate == null ? null : Math.round(p.cacheHitRate * 100)))
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['调用数', 'Token 数', '缓存命中率'] },
    grid: { left: '3%', right: 112, bottom: '10%', containLabel: true },
    dataZoom: [{ type: 'inside' }],
    xAxis: { type: 'category', data: buckets, boundaryGap: false },
    yAxis: [
      { type: 'value', name: '调用数' },
      {
        type: 'value',
        name: 'Token 数',
        position: 'right',
        offset: 56,
        axisLabel: { formatter: (value: number) => formatNumber(value) },
        splitLine: { show: false }
      },
      {
        type: 'value',
        name: '命中率',
        min: 0,
        max: 100,
        position: 'right',
        offset: 0,
        axisLabel: { formatter: (value: number) => `${value}%` },
        splitLine: { show: false }
      }
    ],
    series: [
      { name: '调用数', type: 'line', smooth: true, data: totals, itemStyle: { color: '#409eff' } },
      { name: 'Token 数', type: 'line', smooth: true, yAxisIndex: 1, data: tokens, itemStyle: { color: '#67c23a' } },
      { name: '缓存命中率', type: 'line', smooth: true, yAxisIndex: 2, data: rates, lineStyle: { type: 'dashed' }, itemStyle: { color: '#e6a23c' }, connectNulls: true }
    ]
  }
})

// ---------- 辅助 ----------

function formatNumber(n: number): string {
  return (n ?? 0).toLocaleString('zh-CN')
}

function formatPercent(r: number): string {
  return ((r ?? 0) * 100).toFixed(1) + '%'
}

const successRateClass = computed(() => {
  const r = overview.value?.successRate ?? 0
  if (r >= 0.9) return 'success'
  if (r >= 0.7) return 'warning'
  return 'danger'
})

function successStatus(rate: number): 'success' | 'warning' | 'exception' | undefined {
  if (rate >= 0.9) return 'success'
  if (rate >= 0.7) return 'warning'
  return 'exception'
}

function sortBySuccessRate(a: ModelBreakdown, b: ModelBreakdown) {
  return (a.successRate ?? 0) - (b.successRate ?? 0)
}

</script>

<style scoped>
.model-usage-stats {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.filter-card :deep(.el-card__body) {
  padding: 16px;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
.kpi-card {
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-light, #ebeef5);
  border-radius: 8px;
  padding: 16px 20px;
}
.kpi-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}
.kpi-value {
  font-size: 26px;
  font-weight: 600;
  margin: 6px 0;
  color: var(--el-text-color-primary, #303133);
}
.kpi-value.success { color: var(--el-color-success, #67c23a); }
.kpi-value.warning { color: var(--el-color-warning, #e6a23c); }
.kpi-value.danger { color: var(--el-color-danger, #f56c6c); }
.kpi-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
.table-card-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.table-card-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
.user-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.user-sub {
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
.chart-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.chart-card.full {
  width: 100%;
}
.chart {
  height: 320px;
}
.chart.tall {
  height: 360px;
}
@media (max-width: 1100px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .chart-row { grid-template-columns: 1fr; }
}
</style>
