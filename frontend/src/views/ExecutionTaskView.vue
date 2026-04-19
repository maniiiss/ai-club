<template>
  <div class="execution-center-page">
    <section class="execution-kpi-row">
      <article v-for="item in summaryCards" :key="item.label" class="execution-kpi-card" :class="{ active: item.active }">
        <div>
          <div class="execution-kpi-label">{{ item.label }}</div>
          <div class="execution-kpi-value">{{ item.value }}</div>
        </div>
        <el-icon class="execution-kpi-icon"><component :is="item.icon" /></el-icon>
      </article>
    </section>

    <section class="management-list-page execution-list-page">
      <section class="management-list-toolbar">
        <div class="management-list-toolbar-main">
          <div class="management-list-search-shell">
            <el-icon class="management-list-search-icon"><Search /></el-icon>
            <input
              v-model="filters.keyword"
              class="management-list-search-input"
              type="text"
              placeholder="搜索执行标题、工作项、项目或摘要..."
              @keyup.enter="handleSearch"
            />
          </div>
          <span class="management-list-toolbar-divider" aria-hidden="true"></span>
          <el-popover
            v-model:visible="filterPopoverVisible"
            trigger="click"
            placement="bottom-start"
            :width="340"
            popper-class="management-list-popper"
          >
            <template #reference>
              <button class="management-list-toolbar-button" type="button">
                <el-icon><Filter /></el-icon>
                <span>筛选</span>
              </button>
            </template>

            <div class="management-list-filter-panel management-list-compact-input">
              <div class="management-list-filter-field">
                <label>执行场景</label>
                  <el-select v-model="filters.scenarioCode" clearable placeholder="全部场景" style="width: 100%" :teleported="false">
                    <el-option label="需求拆解" value="REQUIREMENT_BREAKDOWN" />
                    <el-option label="开发执行" value="DEVELOPMENT_IMPLEMENTATION" />
                    <el-option label="测试设计/评审" value="TEST_DESIGN_OR_REVIEW" />
                    <el-option label="仓库规范扫描" value="CODEBASE_COMPLIANCE_SCAN" />
                  </el-select>
              </div>
              <div class="management-list-filter-field">
                <label>执行状态</label>
                <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 100%" :teleported="false">
                  <el-option label="待执行" value="PENDING" />
                  <el-option label="待确认" value="WAITING_CONFIRMATION" />
                  <el-option label="执行中" value="RUNNING" />
                  <el-option label="成功" value="SUCCESS" />
                  <el-option label="失败" value="FAILED" />
                  <el-option label="已取消" value="CANCELED" />
                </el-select>
              </div>
              <div class="management-list-filter-field">
                <label>所属项目</label>
                <el-select
                  v-model="filters.projectId"
                  clearable
                  filterable
                  placeholder="全部项目"
                  style="width: 100%"
                  :teleported="false"
                >
                  <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
                </el-select>
              </div>
              <div class="management-list-filter-actions">
                <el-button type="primary" @click="handleSearch">查询</el-button>
                <el-button @click="handleReset">重置</el-button>
              </div>
            </div>
          </el-popover>
          <button class="management-list-toolbar-button" type="button" @click="handleReset">
            <el-icon><RefreshRight /></el-icon>
            <span>重置</span>
          </button>
        </div>

        <div class="management-list-toolbar-side">
          <button class="management-list-toolbar-button execution-refresh-button" type="button" @click="loadExecutionTasks">
            <el-icon><RefreshRight /></el-icon>
            <span>刷新</span>
          </button>
        </div>
      </section>

      <section class="management-list-shell execution-table-shell">
        <div v-if="!isMobileViewport" class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
          <table class="management-list-table execution-table mobile-card-table">
            <thead>
              <tr>
                <th class="execution-col-main">执行任务</th>
                <th class="execution-col-scenario center">场景</th>
                <th class="execution-col-work-item">来源工作项</th>
                <th class="execution-col-project">项目</th>
                <th class="execution-col-status center">状态</th>
                <th class="execution-col-progress">进度</th>
                <th class="execution-col-initiator">发起人</th>
                <th class="execution-col-updated">更新时间</th>
                <th class="execution-col-actions right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in executionTasks" :key="row.id" class="management-list-row execution-list-row" @click="openDetail(row)">
                <td class="execution-col-main" data-label="执行任务">
                  <button class="management-list-title-trigger" type="button" @click.stop="openDetail(row)">
                    <span class="management-list-title-cell">
                      <span class="management-list-title-icon execution-title-icon">
                        <el-icon><Tickets /></el-icon>
                      </span>
                      <span class="management-list-title-copy">
                        <span class="management-list-title">{{ row.title }}</span>
                        <span class="management-list-subtitle">{{ executionListSummary(row) }}</span>
                      </span>
                    </span>
                  </button>
                </td>
                <td class="execution-col-scenario center" data-label="场景">
                  <span class="management-list-pill execution-scenario-pill" :class="scenarioTone(row.scenarioCode)">
                    {{ row.scenarioName || '未分类' }}
                  </span>
                </td>
                <td class="execution-col-work-item" data-label="来源工作项">
                  <button
                    v-if="row.workItemId"
                    class="management-list-link execution-work-item-button"
                    type="button"
                    @click.stop="openWorkItem(row)"
                  >
                    {{ workItemLabel(row) }}
                  </button>
                  <span v-else class="management-list-empty">-</span>
                </td>
                <td class="execution-col-project" data-label="项目">
                  <span class="management-list-text">{{ row.projectName || '-' }}</span>
                </td>
                <td class="execution-col-status center" data-label="状态">
                  <span class="management-list-pill execution-status-pill" :class="statusTone(row.status)">
                    {{ statusLabel(row.status) }}
                  </span>
                </td>
                <td class="execution-col-progress" data-label="进度">
                  <div class="execution-progress-cell">
                    <div class="execution-progress-track">
                      <div class="execution-progress-fill" :style="{ width: `${progressPercent(row)}%` }"></div>
                    </div>
                    <span class="execution-progress-meta">
                      {{ progressPercent(row) }}% · {{ row.currentStepName || '暂无步骤' }}
                    </span>
                  </div>
                </td>
                <td class="execution-col-initiator" data-label="发起人">
                  <span class="management-list-text">{{ row.createdByName || '系统触发' }}</span>
                </td>
                <td class="execution-col-updated" data-label="更新时间">
                  <span class="management-list-updated">{{ formatDateTime(row.updatedAt) }}</span>
                </td>
                <td class="execution-col-actions right" data-label="操作">
                  <div class="management-list-row-actions execution-row-actions">
                    <el-tooltip content="查看详情" placement="top">
                      <button class="execution-action-button" type="button" aria-label="查看执行详情" @click.stop="openDetail(row)">
                        <el-icon><View /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip v-if="canCancelExecution && canCancel(row.status)" content="取消执行" placement="top">
                      <button
                        class="execution-action-button warning"
                        type="button"
                        aria-label="取消执行"
                        @click.stop="handleCancel(row)"
                      >
                        <el-icon><CloseBold /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip v-if="canRetryExecution && canRetry(row.status)" content="重新执行" placement="top">
                      <button
                        class="execution-action-button success"
                        type="button"
                        aria-label="重新执行"
                        @click.stop="handleRetry(row)"
                      >
                        <el-icon><RefreshRight /></el-icon>
                      </button>
                    </el-tooltip>
                  </div>
                </td>
              </tr>
              <tr v-if="!executionTasks.length && !loading">
                <td colspan="9" class="execution-empty-cell">
                  <el-empty description="暂无执行任务" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="execution-mobile-list-shell" v-loading="loading">
          <div v-if="executionTasks.length" class="execution-mobile-list">
            <article v-for="row in executionTasks" :key="row.id" class="execution-mobile-card">
              <header class="execution-mobile-card-header">
                <button class="execution-mobile-title-trigger" type="button" @click="openDetail(row)">
                  <span class="management-list-title-cell">
                    <span class="management-list-title-icon execution-title-icon">
                      <el-icon><Tickets /></el-icon>
                    </span>
                    <span class="management-list-title-copy">
                      <span class="management-list-title">{{ row.title }}</span>
                      <span class="management-list-subtitle">{{ executionListSummary(row) }}</span>
                    </span>
                  </span>
                </button>
                <span class="management-list-pill execution-status-pill" :class="statusTone(row.status)">
                  {{ statusLabel(row.status) }}
                </span>
              </header>

              <div class="execution-mobile-fields">
                <div class="execution-mobile-field">
                  <span class="execution-mobile-label">场景</span>
                  <div class="execution-mobile-content">
                    <span class="management-list-pill execution-scenario-pill" :class="scenarioTone(row.scenarioCode)">
                      {{ row.scenarioName || '未分类' }}
                    </span>
                  </div>
                </div>
                <div class="execution-mobile-field">
                  <span class="execution-mobile-label">项目</span>
                  <div class="execution-mobile-content">
                    <span class="management-list-text">{{ row.projectName || '-' }}</span>
                  </div>
                </div>
                <div class="execution-mobile-field execution-mobile-field-full">
                  <span class="execution-mobile-label">来源工作项</span>
                  <div class="execution-mobile-content">
                    <button
                      v-if="row.workItemId"
                      class="management-list-link execution-work-item-button"
                      type="button"
                      @click="openWorkItem(row)"
                    >
                      {{ workItemLabel(row) }}
                    </button>
                    <span v-else class="management-list-empty">-</span>
                  </div>
                </div>
                <div class="execution-mobile-field execution-mobile-field-full">
                  <span class="execution-mobile-label">进度</span>
                  <div class="execution-mobile-content">
                    <div class="execution-progress-cell">
                      <div class="execution-progress-track">
                        <div class="execution-progress-fill" :style="{ width: `${progressPercent(row)}%` }"></div>
                      </div>
                      <span class="execution-progress-meta">
                        {{ progressPercent(row) }}% · {{ row.currentStepName || '暂无步骤' }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="execution-mobile-field">
                  <span class="execution-mobile-label">发起人</span>
                  <div class="execution-mobile-content">
                    <span class="management-list-text">{{ row.createdByName || '系统触发' }}</span>
                  </div>
                </div>
                <div class="execution-mobile-field">
                  <span class="execution-mobile-label">更新时间</span>
                  <div class="execution-mobile-content">
                    <span class="management-list-updated">{{ formatDateTime(row.updatedAt) }}</span>
                  </div>
                </div>
              </div>

              <footer class="execution-mobile-actions">
                <button class="execution-mobile-action-button" type="button" @click="openDetail(row)">
                  <el-icon><View /></el-icon>
                  <span>详情</span>
                </button>
                <button
                  v-if="canCancelExecution && canCancel(row.status)"
                  class="execution-mobile-action-button warning"
                  type="button"
                  @click="handleCancel(row)"
                >
                  <el-icon><CloseBold /></el-icon>
                  <span>取消</span>
                </button>
                <button
                  v-if="canRetryExecution && canRetry(row.status)"
                  class="execution-mobile-action-button success"
                  type="button"
                  @click="handleRetry(row)"
                >
                  <el-icon><RefreshRight /></el-icon>
                  <span>重试</span>
                </button>
              </footer>
            </article>
          </div>
          <div v-else class="execution-mobile-empty-state">
            <el-empty description="暂无执行任务" />
          </div>
        </div>

        <div class="management-list-footer execution-footer">
          <div class="management-list-footer-total">共 <span>{{ pagination.total }}</span> 条</div>
          <div class="management-list-footer-controls">
            <div class="management-list-page-size management-list-compact-input">
              <span>每页</span>
              <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
                <el-option :value="10" label="10" />
                <el-option :value="20" label="20" />
                <el-option :value="50" label="50" />
              </el-select>
            </div>
            <div class="management-list-page-nav">
              <button class="management-list-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
                <el-icon><ArrowLeft /></el-icon>
              </button>
              <span class="management-list-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
              <button class="management-list-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, CloseBold, Filter, Lightning, PieChart, RefreshRight, Search, Tickets, TrendCharts, View } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  cancelExecutionTask,
  listProjectOptions,
  pageExecutionTasks,
  retryExecutionTask
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type { ExecutionTaskItem, ProjectItem } from '@/types/platform'

interface ExecutionSummaryCard {
  /** 概览卡片标题。 */
  label: string
  /** 概览卡片数值。 */
  value: string | number
  /** 概览卡片图标。 */
  icon: object
  /** 是否高亮当前主指标。 */
  active: boolean
}

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const executionTasks = ref<ExecutionTaskItem[]>([])
const projectOptions = ref<ProjectItem[]>([])
const refreshTimer = ref<number | null>(null)
const filterPopoverVisible = ref(false)
const isMobileViewport = ref(false)

const pagination = reactive({
  page: 1,
  size: 10,
  total: 0
})

const filters = reactive<{
  keyword: string
  status: string
  scenarioCode: string
  projectId?: number
}>({
  keyword: '',
  status: '',
  scenarioCode: '',
  projectId: undefined
})

const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const canCancelExecution = computed(() => authStore.hasPermission('task:execution:cancel'))
const canRetryExecution = computed(() => authStore.hasPermission('task:execution:retry'))

/**
 * 顶部概览卡片统一基于当前筛选结果生成，避免为了纯展示再增加统计接口。
 */
const summaryCards = computed<ExecutionSummaryCard[]>(() => {
  const currentPageTasks = executionTasks.value
  const pendingOrRunningCount = currentPageTasks.filter((item) => ['PENDING', 'RUNNING', 'WAITING_CONFIRMATION'].includes(item.status)).length
  const successCount = currentPageTasks.filter((item) => item.status === 'SUCCESS').length
  const averageProgress = currentPageTasks.length
    ? Math.round(currentPageTasks.reduce((sum, item) => sum + progressPercent(item), 0) / currentPageTasks.length)
    : 0

  return [
    { label: '当前筛选任务', value: pagination.total, icon: Tickets, active: true },
    { label: '进行中 / 待执行', value: pendingOrRunningCount, icon: Lightning, active: false },
    { label: '成功数量', value: successCount, icon: TrendCharts, active: false },
    { label: '平均进度', value: `${averageProgress}%`, icon: PieChart, active: false }
  ]
})

const canCancel = (status: string) => ['PENDING', 'RUNNING', 'WAITING_CONFIRMATION'].includes(status)
const canRetry = (status: string) => ['SUCCESS', 'FAILED', 'CANCELED'].includes(status)

const statusLabel = (status: string) => {
  const labelMap: Record<string, string> = {
    PENDING: '待执行',
    WAITING_CONFIRMATION: '待确认',
    RUNNING: '执行中',
    SUCCESS: '成功',
    FAILED: '失败',
    CANCELED: '已取消'
  }
  return labelMap[status] || status
}

const statusTone = (status: string) => {
  const toneMap: Record<string, string> = {
    PENDING: 'pending',
    WAITING_CONFIRMATION: 'waiting',
    RUNNING: 'running',
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELED: 'canceled'
  }
  return toneMap[status] || 'pending'
}

const scenarioTone = (scenarioCode: string) => {
  const toneMap: Record<string, string> = {
    REQUIREMENT_BREAKDOWN: 'requirement',
    DEVELOPMENT_IMPLEMENTATION: 'development',
    TEST_DESIGN_OR_REVIEW: 'test'
  }
  return toneMap[scenarioCode] || 'default'
}

/**
 * 列表里展示的进度条需要强制兜底到 0-100，避免后端异步更新窗口期出现异常宽度。
 */
const progressPercent = (row: ExecutionTaskItem) => {
  const rawValue = Number(row.progressPercent ?? 0)
  if (!Number.isFinite(rawValue)) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round(rawValue)))
}

/**
 * 工作项文案优先展示编码和名称，兼容只返回 ID 或只返回名称的场景。
 */
const workItemLabel = (row: ExecutionTaskItem) => {
  const code = row.workItemCode || (row.workItemId ? `#${row.workItemId}` : '')
  const name = row.workItemName || ''
  return [code, name].filter(Boolean).join(' ')
}

/**
 * 列表页只展示简短状态摘要，避免失败堆栈或 SQL 错误把表格撑开。
 * 详细错误仍保留在执行详情页的步骤日志和产物中。
 */
const executionListSummary = (row: ExecutionTaskItem) => {
  if (row.status === 'WAITING_CONFIRMATION') {
    return row.latestSummary || '执行规划已完成，等待发起人确认'
  }
  if (row.status === 'FAILED') {
    return '执行失败，请进入详情查看错误信息'
  }
  if (row.status === 'CANCELED') {
    return '执行已取消'
  }
  return row.latestSummary || '暂无执行摘要'
}

/**
 * 列表态统一使用分钟级时间，减少桌面表格和移动卡片之间的展示差异。
 */
const formatDateTime = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '-'

/**
 * 所有列表交互都走同一数据加载入口，保证查询、重置、翻页、轮询行为一致。
 */
const loadExecutionTasks = async () => {
  loading.value = true
  try {
    const pageData = await pageExecutionTasks({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      status: filters.status,
      scenarioCode: filters.scenarioCode,
      projectId: filters.projectId
    })
    executionTasks.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const loadOptions = async () => {
  projectOptions.value = await listProjectOptions()
}

const handleSearch = async () => {
  filterPopoverVisible.value = false
  pagination.page = 1
  await loadExecutionTasks()
}

const handleReset = async () => {
  filterPopoverVisible.value = false
  filters.keyword = ''
  filters.status = ''
  filters.scenarioCode = ''
  filters.projectId = undefined
  pagination.page = 1
  await loadExecutionTasks()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadExecutionTasks()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) {
    return
  }
  pagination.page -= 1
  await loadExecutionTasks()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) {
    return
  }
  pagination.page += 1
  await loadExecutionTasks()
}

const openDetail = async (row: ExecutionTaskItem) => {
  await router.push({ name: 'execution-task-detail', params: { executionTaskId: row.id } })
}

const openWorkItem = async (row: ExecutionTaskItem) => {
  if (!row.workItemId) {
    return
  }
  await router.push({
    name: 'project-iterations',
    params: { projectId: row.projectId },
    query: { openTaskId: String(row.workItemId) }
  })
}

const handleCancel = async (row: ExecutionTaskItem) => {
  try {
    await ElMessageBox.confirm(`确认取消执行任务“${row.title}”吗？`, '提示', { type: 'warning' })
    await cancelExecutionTask(row.id)
    ElMessage.success('已提交取消')
    await loadExecutionTasks()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '取消失败')
    }
  }
}

const handleRetry = async (row: ExecutionTaskItem) => {
  try {
    await retryExecutionTask(row.id)
    ElMessage.success('已重新排队')
    await loadExecutionTasks()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '重试失败')
  }
}

/**
 * 页面改成桌面/移动双模后，用统一阈值与项目管理页保持响应式切换一致。
 */
const updateMobileViewport = () => {
  if (typeof window === 'undefined') {
    return
  }
  isMobileViewport.value = window.innerWidth <= 900
}

/**
 * 列表页只做轻量轮询，执行详情页会展示更完整的步骤与产物。
 */
const startPolling = () => {
  if (typeof window === 'undefined') {
    return
  }
  refreshTimer.value = window.setInterval(() => {
    if (executionTasks.value.some((item) => ['PENDING', 'RUNNING'].includes(item.status))) {
      void loadExecutionTasks()
    }
  }, 8000)
}

onMounted(async () => {
  updateMobileViewport()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateMobileViewport)
  }
  await Promise.all([loadOptions(), loadExecutionTasks()])
  startPolling()
})

onBeforeUnmount(() => {
  if (refreshTimer.value != null && typeof window !== 'undefined') {
    window.clearInterval(refreshTimer.value)
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateMobileViewport)
  }
})
</script>

<style scoped>
.execution-center-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 100%;
}

.execution-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.execution-kpi-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.execution-kpi-card.active {
  border-bottom: 2px solid var(--app-primary-container);
}

.execution-kpi-label {
  color: #8b97a7;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.execution-kpi-value {
  margin-top: 4px;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
}

.execution-kpi-icon {
  color: #8b97a7;
  font-size: 18px;
}

.execution-list-page {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.execution-table-shell {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.execution-table {
  min-width: 0;
}

.execution-refresh-button {
  min-height: 34px;
  padding: 0 14px;
}

.execution-title-icon {
  background: rgba(14, 116, 144, 0.08);
  color: #0f766e;
}

.execution-list-row {
  cursor: pointer;
}

.execution-col-main {
  width: 21%;
}

.execution-col-main,
.execution-col-main :deep(.management-list-title-trigger),
.execution-col-main :deep(.management-list-title-cell),
.execution-col-main :deep(.management-list-title-copy) {
  min-width: 0;
  max-width: 100%;
}

.execution-col-main :deep(.management-list-title-trigger) {
  overflow: hidden;
}

.execution-col-main :deep(.management-list-title-copy) {
  overflow: hidden;
}

.execution-col-main :deep(.management-list-title),
.execution-col-main :deep(.management-list-subtitle) {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.execution-col-scenario {
  width: 9%;
}

.execution-col-work-item {
  width: 14%;
}

.execution-col-project {
  width: 8%;
}

.execution-col-status {
  width: 8%;
}

.execution-col-progress {
  width: 11%;
}

.execution-col-initiator {
  width: 7%;
}

.execution-col-updated {
  width: 8%;
}

.execution-col-actions {
  width: 14%;
}

.execution-work-item-button {
  max-width: 100%;
}

.execution-progress-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.execution-progress-track {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.9);
}

.execution-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(var(--app-primary-container-rgb), 0.92) 0%,
    rgba(var(--app-primary-rgb), 0.96) 100%
  );
}

.execution-progress-meta {
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.execution-scenario-pill.requirement {
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.execution-scenario-pill.development {
  background: rgba(20, 184, 166, 0.14);
  color: #0f766e;
}

.execution-scenario-pill.test {
  background: rgba(168, 85, 247, 0.12);
  color: #7c3aed;
}

.execution-scenario-pill.default {
  background: rgba(148, 163, 184, 0.14);
  color: #475569;
}

.execution-status-pill.pending {
  background: rgba(251, 191, 36, 0.18);
  color: #b45309;
}

.execution-status-pill.waiting {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
}

.execution-status-pill.running {
  background: rgba(14, 165, 233, 0.14);
  color: #0369a1;
}

.execution-status-pill.success {
  background: rgba(34, 197, 94, 0.16);
  color: #15803d;
}

.execution-status-pill.failed {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.execution-status-pill.canceled {
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
}

.execution-row-actions {
  flex-wrap: wrap;
  min-width: 0;
}

.execution-action-button,
.execution-mobile-action-button {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: rgba(243, 244, 245, 0.92);
  color: #516174;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.execution-action-button.warning,
.execution-mobile-action-button.warning {
  color: var(--app-warning, #b45309);
}

.execution-action-button.success,
.execution-mobile-action-button.success {
  color: var(--app-success);
}

.execution-action-button:hover,
.execution-mobile-action-button:hover {
  background: rgba(255, 255, 255, 0.96);
  color: var(--app-primary);
  transform: translateY(-1px);
}

.execution-action-button.warning:hover,
.execution-mobile-action-button.warning:hover {
  color: var(--app-warning, #b45309);
}

.execution-action-button.success:hover,
.execution-mobile-action-button.success:hover {
  color: var(--app-success);
}

.execution-action-button {
  width: 28px;
  padding: 0;
}

.execution-mobile-action-button {
  min-height: 38px;
  padding: 0 14px;
}

.execution-empty-cell {
  padding: 32px 0 !important;
  text-align: center !important;
}

.execution-mobile-list-shell {
  min-height: 320px;
}

.execution-mobile-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.execution-mobile-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--app-shadow-soft);
}

.execution-mobile-card-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.execution-mobile-title-trigger {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.execution-mobile-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.execution-mobile-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.78);
}

.execution-mobile-field-full {
  grid-column: 1 / -1;
}

.execution-mobile-label {
  color: #94a3b8;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.execution-mobile-content {
  min-width: 0;
}

.execution-mobile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.execution-mobile-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  padding: 24px;
}

@media (max-width: 1200px) {
  .execution-kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .execution-kpi-row {
    grid-template-columns: 1fr;
  }

  .execution-mobile-fields {
    grid-template-columns: 1fr;
  }
}
</style>
