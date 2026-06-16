<template>
  <div class="atelier-list-page benchmark-page">
    <!-- 顶部工具栏：搜索 + 状态筛选 + 新建按钮 -->
    <section class="atelier-toolbar">
      <div class="atelier-toolbar-main">
        <div v-if="props.modelValue !== undefined" class="model-tab-switcher" role="tablist" aria-label="模型管理页面切换">
          <button class="model-tab-button" :class="{ active: props.modelValue === 'configs' }" type="button" @click="emit('update:modelValue', 'configs')">模型配置</button>
          <button class="model-tab-button" :class="{ active: props.modelValue === 'benchmark' }" type="button" @click="emit('update:modelValue', 'benchmark')">对比测试</button>
        </div>
        <span v-if="props.modelValue !== undefined" class="atelier-toolbar-divider" aria-hidden="true"></span>
        <div class="atelier-search-shell">
          <el-icon class="atelier-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="atelier-search-input"
            type="text"
            placeholder="搜索对比测试名称..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="atelier-toolbar-divider" aria-hidden="true"></span>
        <el-select
          v-model="filters.status"
          placeholder="状态"
          clearable
          class="benchmark-status-select"
          @change="handleSearch"
        >
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <button class="atelier-toolbar-button" type="button" @click="handleSearch">
          <el-icon><Search /></el-icon>
          查询
        </button>
        <button class="atelier-toolbar-button" type="button" @click="resetFilters">
          <el-icon><RefreshRight /></el-icon>
          重置
        </button>
        <button v-if="isMobileViewport" class="atelier-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新建对比
        </button>
      </div>
      <div v-if="!isMobileViewport" class="atelier-toolbar-side">
        <button class="atelier-create-button" type="button" @click="openCreateDialog" :disabled="!canBenchmark">
          <el-icon><Plus /></el-icon>
          新建对比测试
        </button>
      </div>
    </section>

    <!-- 桌面端：列表（与模型配置页同款 atelier 风格） -->
    <section v-if="!isMobileViewport" class="atelier-table-shell">
      <div class="atelier-table-scroll" v-loading="loading">
        <div class="atelier-data-list benchmark-list-table">
          <div class="atelier-data-head benchmark-list-head">
            <div class="atelier-data-head-item benchmark-col-name">名称</div>
            <div class="atelier-data-head-item benchmark-col-status center">状态</div>
            <div class="atelier-data-head-item benchmark-col-progress">进度</div>
            <div class="atelier-data-head-item benchmark-col-concurrency center">并发</div>
            <div class="atelier-data-head-item benchmark-col-total center">总请求</div>
            <div class="atelier-data-head-item benchmark-col-model center">模型数</div>
            <div class="atelier-data-head-item benchmark-col-creator">创建人</div>
            <div class="atelier-data-head-item benchmark-col-time">创建时间</div>
            <div class="atelier-data-head-item benchmark-col-actions right">操作</div>
          </div>
          <div v-for="row in list" :key="row.id" class="atelier-data-row benchmark-list-row">
            <div class="atelier-data-cell benchmark-col-name" data-label="名称">
              <button class="management-list-title-trigger" type="button" @click="openDetail(row.id)">
                <div class="management-list-title-cell">
                  <span class="management-list-title-icon"><el-icon><DataAnalysis /></el-icon></span>
                  <div class="management-list-title-copy">
                    <div class="management-list-title">{{ row.name }}</div>
                    <div class="management-list-subtitle">{{ row.streamEnabled ? '流式' : '非流式' }} · max_tokens {{ row.maxTokens }}</div>
                  </div>
                </div>
              </button>
            </div>
            <div class="atelier-data-cell benchmark-col-status center" data-label="状态">
              <span class="management-list-pill" :class="statusPillClass(row.status)">{{ statusLabel(row.status) }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-progress" data-label="进度">
              <el-progress
                :percentage="progressPercent(row)"
                :status="progressStatus(row.status)"
                :stroke-width="8"
                :show-text="true"
              />
            </div>
            <div class="atelier-data-cell benchmark-col-concurrency center" data-label="并发">
              <span class="management-list-text">{{ row.concurrency }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-total center" data-label="总请求">
              <span class="management-list-text">{{ row.totalRequests }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-model center" data-label="模型数">
              <span class="management-list-text">{{ row.modelCount }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-creator" data-label="创建人">
              <span class="management-list-text">{{ row.createdByName || '-' }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-time" data-label="创建时间">
              <span class="management-list-text">{{ formatTime(row.createdAt) }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-actions right" data-label="操作">
              <div class="management-list-row-actions">
                <button class="management-list-row-button" type="button" title="详情" @click="openDetail(row.id)">
                  <el-icon><View /></el-icon>
                </button>
                <button
                  v-if="row.status === 'RUNNING' || row.status === 'PENDING'"
                  class="management-list-row-button warning"
                  type="button"
                  title="取消"
                  :disabled="!canBenchmark"
                  @click="handleCancel(row)"
                >
                  <el-icon><CircleClose /></el-icon>
                </button>
                <button
                  v-if="row.status === 'CANCELED' || row.status === 'FAILED' || row.status === 'SUCCESS'"
                  class="management-list-row-button"
                  type="button"
                  title="重跑（基于此配置发起新一次对比测试）"
                  :disabled="!canBenchmark"
                  @click="handleRerun(row)"
                >
                  <el-icon><VideoPlay /></el-icon>
                </button>
                <button
                  class="management-list-row-button danger"
                  type="button"
                  title="删除"
                  :disabled="!canBenchmark || row.status === 'RUNNING'"
                  @click="handleDelete(row)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>
          <div v-if="!list.length && !loading" class="benchmark-empty-row">暂无对比测试</div>
        </div>
      </div>

      <div class="atelier-table-footer">
        <div class="atelier-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="atelier-footer-controls">
          <div class="atelier-page-size atelier-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="atelier-page-nav">
            <button class="atelier-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="atelier-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="atelier-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 移动端：卡片列表 -->
    <section v-else class="atelier-mobile-list" v-loading="loading">
      <div v-for="row in list" :key="row.id" class="benchmark-card">
        <div class="benchmark-card-head">
          <span class="benchmark-card-title">{{ row.name }}</span>
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </div>
        <div class="benchmark-card-progress">
          <el-progress
            :percentage="progressPercent(row)"
            :status="progressStatus(row.status)"
            :stroke-width="8"
          />
        </div>
        <div class="benchmark-card-meta">
          <span>并发 {{ row.concurrency }}</span>
          <span>·</span>
          <span>请求 {{ row.totalRequests }}</span>
          <span>·</span>
          <span>模型 {{ row.modelCount }}</span>
        </div>
        <div class="benchmark-card-footer">
          <span class="benchmark-card-time">{{ formatTime(row.createdAt) }}</span>
          <div class="benchmark-card-actions">
            <el-button text type="primary" size="small" @click="openDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.status === 'RUNNING' || row.status === 'PENDING'"
              text
              type="warning"
              size="small"
              :disabled="!canBenchmark"
              @click="handleCancel(row)"
            >取消</el-button>
            <el-button
              v-if="row.status === 'CANCELED' || row.status === 'FAILED' || row.status === 'SUCCESS'"
              text
              type="primary"
              size="small"
              :disabled="!canBenchmark"
              @click="handleRerun(row)"
            >重跑</el-button>
            <el-button
              text
              type="danger"
              size="small"
              :disabled="!canBenchmark || row.status === 'RUNNING'"
              @click="handleDelete(row)"
            >删除</el-button>
          </div>
        </div>
      </div>
      <div v-if="list.length === 0 && !loading" class="benchmark-empty">暂无对比测试</div>
    </section>

    <!-- 创建对话框 -->
    <el-dialog
      v-model="createDialogVisible"
      :width="isMobileViewport ? '92%' : '720px'"
      title="新建对比测试"
      align-center
      class="platform-form-dialog"
      @closed="resetCreateForm"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="110px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="可留空，自动生成" maxlength="160" show-word-limit />
        </el-form-item>
        <el-form-item label="参与模型" prop="modelIds">
          <el-select
            v-model="createForm.modelIds"
            multiple
            filterable
            placeholder="选择 1~8 个 CHAT 模型"
            style="width: 100%"
          >
            <el-option
              v-for="item in chatModelOptions"
              :key="item.id"
              :label="`${item.name} (${item.modelName})`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="并发数" prop="concurrency">
          <el-input-number v-model="createForm.concurrency" :min="1" :max="64" />
          <span class="form-help">建议 ≤ 16，避免触发模型限流。</span>
        </el-form-item>
        <el-form-item label="总请求数" prop="totalRequests">
          <el-input-number v-model="createForm.totalRequests" :min="1" :max="500" />
          <span class="form-help">每个模型都会执行这么多次。</span>
        </el-form-item>
        <el-form-item label="流式调用">
          <el-switch v-model="createForm.streamEnabled" />
          <span class="form-help">开启后才能准确测量"首 token 耗时"（TTFT）。</span>
        </el-form-item>
        <el-form-item label="max_tokens">
          <el-input-number v-model="createForm.maxTokens" :min="16" :max="8192" :step="64" />
        </el-form-item>
        <el-form-item label="System Prompt">
          <el-input
            v-model="createForm.systemPrompt"
            type="textarea"
            :rows="2"
            :placeholder="defaultSystemPrompt"
          />
        </el-form-item>
        <el-form-item label="User Prompt">
          <el-input
            v-model="createForm.userPrompt"
            type="textarea"
            :rows="4"
            :placeholder="defaultUserPrompt"
          />
          <el-button text type="primary" size="small" @click="useDefaultPrompts">使用默认模板</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">启动测试</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="detailVisible"
      :size="isMobileViewport ? '100%' : '720px'"
      :title="detail?.name || '对比测试详情'"
      destroy-on-close
      @closed="stopPolling"
    >
      <template v-if="detail">
        <div class="benchmark-detail">
          <div class="benchmark-detail-summary">
            <el-tag :type="statusTagType(detail.status)" size="default">{{ statusLabel(detail.status) }}</el-tag>
            <el-progress
              :percentage="progressPercent(detail)"
              :status="progressStatus(detail.status)"
              style="flex: 1; margin: 0 16px"
            />
            <span class="benchmark-detail-progress-text">
              {{ detail.progressDone }} / {{ detail.progressTotal }}
            </span>
          </div>

          <div class="benchmark-detail-config">
            <div><span>并发</span><b>{{ detail.concurrency }}</b></div>
            <div><span>总请求</span><b>{{ detail.totalRequests }}</b></div>
            <div><span>流式</span><b>{{ detail.streamEnabled ? '开启' : '关闭' }}</b></div>
            <div><span>max_tokens</span><b>{{ detail.maxTokens }}</b></div>
            <div><span>创建人</span><b>{{ detail.createdByName || '-' }}</b></div>
            <div><span>创建时间</span><b>{{ formatTime(detail.createdAt) }}</b></div>
            <div v-if="detail.finishedAt"><span>结束时间</span><b>{{ formatTime(detail.finishedAt) }}</b></div>
          </div>

          <div v-if="detail.errorMessage" class="benchmark-detail-error">
            <el-icon><Warning /></el-icon>
            {{ detail.errorMessage }}
          </div>

          <h3 class="benchmark-detail-title">指标对比</h3>
          <div v-if="!isMobileViewport" class="benchmark-metric-table">
            <el-table
              :data="detail.metrics"
              stripe
              size="small"
              border
              style="width: 100%"
              :row-class-name="metricRowClass"
            >
              <el-table-column label="模型" width="220" fixed="left" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="metric-model-cell">
                    <span class="metric-model-icon"><el-icon><DataAnalysis /></el-icon></span>
                    <div class="metric-model-copy">
                      <span class="metric-model-name">{{ row.modelName }}</span>
                      <span class="metric-model-sub">{{ row.provider || '-' }} · {{ row.modelRealName || '-' }}</span>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="92" align="center">
                <template #default="{ row }">
                  <span class="management-list-pill" :class="metricStatusPill(row.status)">{{ metricStatusLabel(row.status) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="失败率" width="100" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="failureRateClass(row.failureRate)">{{ formatPercent(row.failureRate) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="平均输出" width="108" align="right">
                <template #default="{ row }">
                  <span class="metric-num">
                    {{ formatNumber(row.avgOutputTokens, 1) }}
                    <span v-if="row.tokenEstimated" class="metric-estimated-badge" title="按文本长度估算">估</span>
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="首 token" width="100" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="bestClass('avgTtftMs', row, 'min')">{{ formatMs(row.avgTtftMs) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="平均耗时" width="100" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="bestClass('avgLatencyMs', row, 'min')">{{ formatMs(row.avgLatencyMs) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="P50" width="90" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="bestClass('p50LatencyMs', row, 'min')">{{ formatMs(row.p50LatencyMs) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="P95" width="90" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="bestClass('p95LatencyMs', row, 'min')">{{ formatMs(row.p95LatencyMs) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="总 Token/s" width="108" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="bestClass('totalTokenPerSec', row, 'max')">{{ formatNumber(row.totalTokenPerSec, 2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="生成 Token/s" width="120" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="bestClass('genTokenPerSec', row, 'max')">{{ formatNumber(row.genTokenPerSec, 2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="吞吐(QPS)" width="108" align="right">
                <template #default="{ row }">
                  <span class="metric-num" :class="bestClass('throughput', row, 'max')">{{ formatNumber(row.throughput, 2) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- 移动端指标卡片 -->
          <div v-else class="benchmark-metric-mobile">
            <div v-for="metric in detail.metrics" :key="metric.id" class="benchmark-metric-card">
              <div class="benchmark-metric-card-head">
                <span class="benchmark-metric-card-title">{{ metric.modelName }}</span>
                <el-tag :type="metricStatusTagType(metric.status)" size="small">{{ metricStatusLabel(metric.status) }}</el-tag>
              </div>
              <div class="benchmark-metric-card-grid">
                <div><span>失败率</span><b>{{ formatPercent(metric.failureRate) }}</b></div>
                <div><span>平均输出</span><b>{{ formatNumber(metric.avgOutputTokens, 1) }}</b></div>
                <div><span>首 token</span><b>{{ formatMs(metric.avgTtftMs) }}</b></div>
                <div><span>平均耗时</span><b>{{ formatMs(metric.avgLatencyMs) }}</b></div>
                <div><span>P50</span><b>{{ formatMs(metric.p50LatencyMs) }}</b></div>
                <div><span>P95</span><b>{{ formatMs(metric.p95LatencyMs) }}</b></div>
                <div><span>总 Token/s</span><b>{{ formatNumber(metric.totalTokenPerSec, 2) }}</b></div>
                <div><span>生成 Token/s</span><b>{{ formatNumber(metric.genTokenPerSec, 2) }}</b></div>
                <div><span>吞吐</span><b>{{ formatNumber(metric.throughput, 2) }}</b></div>
              </div>
              <div v-if="metric.sampleError" class="benchmark-metric-card-error">{{ metric.sampleError }}</div>
            </div>
          </div>

          <details class="benchmark-detail-prompt">
            <summary>Prompt 配置</summary>
            <p><strong>System：</strong>{{ detail.systemPrompt || '（空）' }}</p>
            <p><strong>User：</strong>{{ detail.userPrompt || '（空）' }}</p>
          </details>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, CircleClose, DataAnalysis, Delete, Plus, RefreshRight, Search, VideoPlay, View, Warning } from '@element-plus/icons-vue'
import {
  cancelBenchmark,
  createBenchmark,
  deleteBenchmark,
  getBenchmarkDetail,
  pageBenchmarks,
  rerunBenchmark
} from '@/api/modelBenchmark'
import type { ModelBenchmarkCreatePayload } from '@/api/modelBenchmark'
import { listModelConfigOptions } from '@/api/models'
import type {
  AiModelConfigItem,
  ModelBenchmarkRunDetail,
  ModelBenchmarkRunStatus,
  ModelBenchmarkRunSummary,
  ModelBenchmarkMetricStatus
} from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useAuthStore } from '@/stores/auth'

/** 嵌入模式下用于双向绑定外部 activeTab，独立使用时不传即可。 */
const props = defineProps<{
  modelValue?: 'configs' | 'benchmark'
}>()
const emit = defineEmits<{
  'update:modelValue': [value: 'configs' | 'benchmark']
}>()

const defaultSystemPrompt = 'You are a concise technical writer.'
const defaultUserPrompt =
  '请用中文写一段约 200 字的产品介绍，介绍一款叫做"AI 工程平台"的协作工具，需包含核心能力、目标人群与使用场景。请直接给出正文，不要列项目编号。'

const statusOptions: Array<{ label: string; value: ModelBenchmarkRunStatus }> = [
  { label: '待开始', value: 'PENDING' },
  { label: '运行中', value: 'RUNNING' },
  { label: '已完成', value: 'SUCCESS' },
  { label: '失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELED' }
]

const authStore = useAuthStore()
const canBenchmark = computed(() => authStore.hasPermission('model:benchmark'))

const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const list = ref<ModelBenchmarkRunSummary[]>([])
const pagination = reactive({ page: 1, size: 10, total: 0 })
const filters = reactive({
  keyword: '',
  status: undefined as ModelBenchmarkRunStatus | undefined
})

const chatModelOptions = ref<AiModelConfigItem[]>([])

const createDialogVisible = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive<ModelBenchmarkCreatePayload>({
  name: '',
  modelIds: [],
  concurrency: 4,
  totalRequests: 20,
  streamEnabled: true,
  maxTokens: 512,
  systemPrompt: '',
  userPrompt: ''
})
const createRules: FormRules = {
  modelIds: [{ required: true, message: '请选择至少一个模型', trigger: 'change' }],
  concurrency: [{ required: true, message: '请输入并发数', trigger: 'blur' }],
  totalRequests: [{ required: true, message: '请输入总请求数', trigger: 'blur' }]
}

const detailVisible = ref(false)
const detail = ref<ModelBenchmarkRunDetail | null>(null)
let pollingTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await Promise.all([loadData(), loadChatModelOptions()])
})

onBeforeUnmount(() => {
  stopPolling()
})

async function loadData() {
  loading.value = true
  try {
    const result = await pageBenchmarks({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword || undefined,
      status: filters.status
    })
    list.value = result.records
    pagination.total = result.total
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '加载对比测试失败')
  } finally {
    loading.value = false
  }
}

async function loadChatModelOptions() {
  try {
    chatModelOptions.value = await listModelConfigOptions('CHAT')
  } catch {
    chatModelOptions.value = []
  }
}

function handleSearch() {
  pagination.page = 1
  void loadData()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = undefined
  pagination.page = 1
  void loadData()
}

function handlePageChange(page: number) {
  pagination.page = page
  void loadData()
}

const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))

function handlePrevPage() {
  if (pagination.page > 1) {
    pagination.page -= 1
    void loadData()
  }
}

function handleNextPage() {
  if (pagination.page < totalPages.value) {
    pagination.page += 1
    void loadData()
  }
}

function handleSizeChange(size: number) {
  pagination.size = size
  pagination.page = 1
  void loadData()
}

function statusPillClass(status: ModelBenchmarkRunStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'CANCELED':
      return 'neutral'
    case 'RUNNING':
      return 'warning'
    default:
      return 'info'
  }
}

function openCreateDialog() {
  resetCreateForm()
  createDialogVisible.value = true
}

function resetCreateForm() {
  createForm.name = ''
  createForm.modelIds = []
  createForm.concurrency = 4
  createForm.totalRequests = 20
  createForm.streamEnabled = true
  createForm.maxTokens = 512
  createForm.systemPrompt = ''
  createForm.userPrompt = ''
  createFormRef.value?.clearValidate()
}

function useDefaultPrompts() {
  createForm.systemPrompt = defaultSystemPrompt
  createForm.userPrompt = defaultUserPrompt
}

async function handleCreate() {
  if (!createFormRef.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload: ModelBenchmarkCreatePayload = {
      ...createForm,
      name: createForm.name?.trim() || undefined,
      systemPrompt: createForm.systemPrompt?.trim() || undefined,
      userPrompt: createForm.userPrompt?.trim() || undefined
    }
    const created = await createBenchmark(payload)
    ElMessage.success('对比测试已启动')
    createDialogVisible.value = false
    await loadData()
    openDetail(created.id)
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '启动失败')
  } finally {
    submitting.value = false
  }
}

async function handleCancel(row: ModelBenchmarkRunSummary) {
  await ElMessageBox.confirm(`确认取消"${row.name}"？已发出的请求仍会计入指标。`, '取消对比测试', {
    type: 'warning'
  }).catch(() => 'cancel')
  try {
    await cancelBenchmark(row.id)
    ElMessage.success('已请求取消')
    void loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '取消失败')
  }
}

/**
 * 基于已有 run 的配置重新发起一次对比测试，旧 run 与历史指标不变。
 * 重跑产生的新 run 名称会自动追加"-重跑"后缀，便于区分。
 */
async function handleRerun(row: ModelBenchmarkRunSummary) {
  try {
    const created = await rerunBenchmark(row.id)
    ElMessage.success('已重新发起对比测试')
    await loadData()
    openDetail(created.id)
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '重跑失败')
  }
}

async function handleDelete(row: ModelBenchmarkRunSummary) {
  await ElMessageBox.confirm(`确认删除"${row.name}"？历史指标将一并清除。`, '删除对比测试', {
    type: 'warning'
  }).catch(() => 'cancel')
  try {
    await deleteBenchmark(row.id)
    ElMessage.success('已删除')
    void loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '删除失败')
  }
}

async function openDetail(id: number) {
  try {
    detail.value = await getBenchmarkDetail(id)
    detailVisible.value = true
    if (detail.value && (detail.value.status === 'RUNNING' || detail.value.status === 'PENDING')) {
      startPolling(id)
    }
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '加载详情失败')
  }
}

function startPolling(id: number) {
  stopPolling()
  pollingTimer = setInterval(async () => {
    if (!detailVisible.value) {
      stopPolling()
      return
    }
    try {
      const next = await getBenchmarkDetail(id)
      detail.value = next
      if (next.status !== 'RUNNING' && next.status !== 'PENDING') {
        stopPolling()
        void loadData()
      }
    } catch {
      // 静默忽略瞬时错误，下个 tick 重试
    }
  }, 1500)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// ============ 显示工具 ============

function statusLabel(status: ModelBenchmarkRunStatus) {
  return statusOptions.find(item => item.value === status)?.label || status
}

function statusTagType(status: ModelBenchmarkRunStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'CANCELED':
      return 'info'
    case 'RUNNING':
      return 'warning'
    default:
      return ''
  }
}

function progressStatus(status: ModelBenchmarkRunStatus) {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'exception'
  return undefined
}

function progressPercent(row: { progressDone: number; progressTotal: number }) {
  if (!row.progressTotal) return 0
  return Math.min(100, Math.round((row.progressDone / row.progressTotal) * 100))
}

function metricStatusLabel(status: ModelBenchmarkMetricStatus) {
  switch (status) {
    case 'PENDING':
      return '待开始'
    case 'RUNNING':
      return '运行中'
    case 'SUCCESS':
      return '已完成'
    case 'FAILED':
      return '失败'
    case 'SKIPPED':
      return '已跳过'
    default:
      return status
  }
}

function metricStatusTagType(status: ModelBenchmarkMetricStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'SKIPPED':
      return 'info'
    case 'RUNNING':
      return 'warning'
    default:
      return ''
  }
}

function metricRowClass({ row }: { row: { failureRate: number } }) {
  return row.failureRate > 0.5 ? 'benchmark-row-warn' : ''
}

/** 把 metric 状态映射到 management-list-pill 的颜色（与列表页保持视觉一致）。 */
function metricStatusPill(status: ModelBenchmarkMetricStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'SKIPPED':
      return 'neutral'
    case 'RUNNING':
      return 'warning'
    default:
      return 'info'
  }
}

/** 失败率分档着色：≤5% 绿，5-20% 橙，>20% 红。 */
function failureRateClass(rate: number | null | undefined) {
  if (rate == null) return ''
  if (rate <= 0.05) return 'metric-num-good'
  if (rate <= 0.2) return 'metric-num-warn'
  return 'metric-num-bad'
}

/**
 * 在所有指标行中挑出某字段的最优值（min 或 max），命中即返回高亮 class。
 * 仅 success_count > 0 的行参与比较，避免失败行抢占 best 标记。
 */
function bestClass(field: keyof import('@/types/platform').ModelBenchmarkMetricView, row: any, dir: 'min' | 'max') {
  const metrics = detail.value?.metrics
  if (!metrics || metrics.length < 2) return ''
  const candidates = metrics.filter(m => (m.successCount ?? 0) > 0 && typeof (m as any)[field] === 'number')
  if (candidates.length === 0) return ''
  const values = candidates.map(m => (m as any)[field] as number)
  const target = dir === 'min' ? Math.min(...values) : Math.max(...values)
  if ((row as any)[field] === target && (row.successCount ?? 0) > 0) {
    return 'metric-num-best'
  }
  return ''
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value == null) return '-'
  return value.toFixed(fractionDigits)
}

function formatMs(value: number | null | undefined) {
  if (value == null) return '-'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${value.toFixed(0)} ms`
}
</script>

<style scoped>
/* ── 列表列宽（与模型配置同款 atelier 风格） ── */
.benchmark-list-table {
  width: 100%;
  min-width: 0;
}

.benchmark-list-head,
.benchmark-list-row {
  display: grid;
  grid-template-columns:
    minmax(0, 2.4fr)
    minmax(96px, 0.7fr)
    minmax(160px, 1.6fr)
    minmax(64px, 0.4fr)
    minmax(72px, 0.45fr)
    minmax(72px, 0.45fr)
    minmax(96px, 0.7fr)
    minmax(140px, 1fr)
    minmax(140px, 0.9fr);
}

.benchmark-col-name,
.benchmark-col-status,
.benchmark-col-progress,
.benchmark-col-concurrency,
.benchmark-col-total,
.benchmark-col-model,
.benchmark-col-creator,
.benchmark-col-time,
.benchmark-col-actions {
  min-width: 0;
}

.benchmark-empty-row {
  text-align: center;
  color: #9ca3af;
  padding: 36px 0;
}

@media (max-width: 1280px) and (min-width: 901px) {
  .benchmark-list-head,
  .benchmark-list-row {
    grid-template-columns:
      minmax(0, 2fr)
      minmax(80px, 0.6fr)
      minmax(140px, 1.2fr)
      minmax(56px, 0.4fr)
      minmax(64px, 0.4fr)
      minmax(64px, 0.4fr)
      minmax(80px, 0.6fr)
      minmax(120px, 0.9fr)
      minmax(132px, 0.8fr);
  }
}

/* Tab 切换按钮样式（嵌入到 ModelView 时使用，独立访问 /model-benchmarks 时不显示） */
.model-tab-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: 8px;
  background: rgba(225, 227, 228, 0.56);
}

.model-tab-button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7c8794;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.model-tab-button:hover {
  color: var(--app-primary, #409eff);
}

.model-tab-button.active {
  background: #fff;
  color: var(--app-primary, #409eff);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.benchmark-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.benchmark-status-select {
  width: 140px;
}

.atelier-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
}

.atelier-mobile-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.benchmark-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.benchmark-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.benchmark-card-title {
  font-weight: 600;
  font-size: 15px;
  color: #1f2937;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.benchmark-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: #6b7280;
  font-size: 13px;
}

.benchmark-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
}

.benchmark-card-time {
  color: #9ca3af;
  font-size: 12px;
}

.benchmark-empty {
  text-align: center;
  color: #9ca3af;
  padding: 32px 0;
}

.form-help {
  margin-left: 12px;
  color: #9ca3af;
  font-size: 12px;
}

.benchmark-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
}

.benchmark-detail-summary {
  display: flex;
  align-items: center;
  gap: 12px;
}

.benchmark-detail-progress-text {
  color: #4b5563;
  font-size: 13px;
}

.benchmark-detail-config {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  background: #f9fafb;
  padding: 12px 16px;
  border-radius: 10px;
}

.benchmark-detail-config div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.benchmark-detail-config span {
  color: #9ca3af;
}

.benchmark-detail-config b {
  color: #111827;
  font-weight: 600;
}

.benchmark-detail-error {
  background: #fef2f2;
  color: #b91c1c;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.benchmark-detail-title {
  font-size: 15px;
  font-weight: 600;
  margin: 8px 0 4px;
  color: #1f2937;
}

.token-estimated {
  color: #f59e0b;
  margin-left: 2px;
  font-size: 12px;
}

:deep(.benchmark-row-warn) {
  background-color: #fff7ed !important;
}

/* 指标对比表格容器：抽屉宽度有限时自动出现横向滚动条；
   显式抬高 fixed 列层级，并给 fixed 列单元格强制白底/条纹底色，
   彻底避免滚动时下层数据列透过来造成的"重叠"观感。 */
.benchmark-metric-table {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.benchmark-metric-table :deep(.el-table) {
  --el-table-border-color: #e5e7eb;
  background: #fff;
}

/* Element Plus 较新版本（v2.4+）使用 .el-table__fixed-column-left 类，
   旧版本使用 .el-table__fixed 容器；这里两套都覆盖，保险。 */
.benchmark-metric-table :deep(.el-table__fixed),
.benchmark-metric-table :deep(.el-table__fixed-right),
.benchmark-metric-table :deep(.el-table__cell.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__cell.is-first-column) {
  z-index: 3;
  background-color: #ffffff !important;
}

/* 条纹行的 fixed 列也要跟上颜色，避免奇偶行错位时模型列变白 */
.benchmark-metric-table :deep(.el-table__row--striped .el-table__cell.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__row--striped .el-table__cell.is-first-column),
.benchmark-metric-table :deep(.el-table__row--striped td.el-table-fixed-column--left) {
  background-color: #fafbfc !important;
}

/* hover 行的 fixed 列同步换色 */
.benchmark-metric-table :deep(.el-table__body tr:hover > td.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__body tr:hover > td.is-first-column) {
  background-color: #f5f7fa !important;
}

/* 表头 fixed 列也保持纯色背景 */
.benchmark-metric-table :deep(.el-table__header-wrapper th.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__header-wrapper th.is-first-column) {
  background-color: #f5f7fa !important;
  z-index: 4;
}

/* 隐藏默认渐变线 + 右侧加阴影，提示用户可横向滚动 */
.benchmark-metric-table :deep(.el-table__fixed::before),
.benchmark-metric-table :deep(.el-table__fixed-right::before) {
  display: none;
}

.benchmark-metric-table :deep(.el-table__fixed) {
  box-shadow: 4px 0 6px -4px rgba(15, 23, 42, 0.16);
}

.benchmark-metric-table :deep(.el-table-fixed-column--left.is-last-column::before) {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 6px;
  pointer-events: none;
  box-shadow: inset 4px 0 6px -4px rgba(15, 23, 42, 0.16);
}

/* ── 表格美化 ── */

/* 行高 / 内边距统一调高一点，更舒展 */
.benchmark-metric-table :deep(.el-table .el-table__cell) {
  padding: 10px 8px;
  vertical-align: middle;
}

.benchmark-metric-table :deep(.el-table__header-wrapper th) {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background-color: #f8fafc !important;
  letter-spacing: 0.02em;
}

/* 模型列：图标 + 主名 + 副信息（provider / 真实模型名） */
.metric-model-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.metric-model-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #eef2ff, #dbeafe);
  color: #4f46e5;
  font-size: 14px;
}

.metric-model-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.metric-model-name {
  font-weight: 600;
  color: #0f172a;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-model-sub {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 数值列：等宽数字字体，数值从右贴近，与单位对齐更整齐 */
.metric-num {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  font-size: 13px;
  color: #1f2937;
}

/* 最优值高亮：绿色加粗，左侧加一个小三角提示 */
.metric-num-best {
  color: #059669;
  font-weight: 700;
  position: relative;
}

.metric-num-best::before {
  content: '▲';
  font-size: 9px;
  margin-right: 2px;
  color: #10b981;
}

/* 失败率色阶 */
.metric-num-good {
  color: #059669;
  font-weight: 600;
}

.metric-num-warn {
  color: #d97706;
  font-weight: 600;
}

.metric-num-bad {
  color: #dc2626;
  font-weight: 600;
}

/* token 估算角标 */
.metric-estimated-badge {
  font-size: 10px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 1px 5px;
  line-height: 1.4;
}

/* 行 hover 微强调 */
.benchmark-metric-table :deep(.el-table__body tr:hover > td) {
  background-color: #f8fafc !important;
}

/* 失败率高于 50% 的行底色变浅红，比之前 fff7ed 更明显但不刺眼 */
.benchmark-metric-table :deep(.benchmark-row-warn > td) {
  background-color: #fef2f2 !important;
}

.benchmark-metric-mobile {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.benchmark-metric-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
}

.benchmark-metric-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.benchmark-metric-card-title {
  font-weight: 600;
  color: #1f2937;
}

.benchmark-metric-card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 16px;
  font-size: 13px;
}

.benchmark-metric-card-grid div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.benchmark-metric-card-grid span {
  color: #9ca3af;
}

.benchmark-metric-card-grid b {
  color: #111827;
  font-weight: 600;
}

.benchmark-metric-card-error {
  margin-top: 8px;
  font-size: 12px;
  color: #b91c1c;
  background: #fef2f2;
  padding: 6px 8px;
  border-radius: 6px;
}

.benchmark-detail-prompt {
  background: #f9fafb;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: #4b5563;
}

.benchmark-detail-prompt summary {
  cursor: pointer;
  font-weight: 600;
  color: #374151;
}

.benchmark-detail-prompt p {
  margin: 8px 0 0;
  white-space: pre-wrap;
}
</style>
