<template>
  <div class="management-list-page">
    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索用户、模块、动作、路径或结果消息..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="filterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="management-list-popper">
          <template #reference>
            <button class="management-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="management-list-filter-panel management-list-compact-input">
            <div class="management-list-filter-field">
              <label>操作用户</label>
              <el-select v-model="filters.userId" clearable placeholder="全部用户" style="width: 100%" :teleported="false">
                <el-option v-for="item in userOptions" :key="item.id" :label="item.nickname || item.username" :value="item.id" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>结果状态</label>
              <el-select v-model="filters.operationStatus" clearable placeholder="全部状态" style="width: 100%" :teleported="false">
                <el-option label="成功" value="SUCCESS" />
                <el-option label="失败" value="FAILED" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>模块编码</label>
              <el-input v-model="filters.moduleCode" placeholder="例如 AUTH / USER / TASK" />
            </div>
            <div class="management-list-filter-field">
              <label>业务类型</label>
              <el-input v-model="filters.bizType" placeholder="例如 USER / PROJECT / TASK" />
            </div>
            <div class="management-list-filter-field">
              <label>时间范围</label>
              <el-date-picker
                v-model="filters.timeRange"
                type="datetimerange"
                start-placeholder="开始时间"
                end-placeholder="结束时间"
                range-separator="至"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
                :teleported="false"
              />
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
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
          <template v-if="logList.length">
            <table class="management-list-table operation-log-table mobile-card-table">
              <thead>
                <tr>
                  <th class="operation-col-time">操作时间</th>
                  <th class="operation-col-user">用户</th>
                  <th class="operation-col-module">模块</th>
                  <th class="operation-col-action">动作</th>
                  <th class="operation-col-biz">业务对象</th>
                  <th class="operation-col-path">请求路径</th>
                  <th class="operation-col-result">结果</th>
                  <th class="operation-col-status center">状态码</th>
                  <th class="operation-col-duration center">耗时</th>
                  <th class="operation-col-ip">IP</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in logList" :key="row.id" class="management-list-row">
                  <td class="operation-col-time" data-label="操作时间">
                    <button class="management-list-title-trigger" type="button" @click="openDetail(row)">
                      <div class="management-list-title-cell">
                        <span class="management-list-avatar">{{ operationInitial(row) }}</span>
                        <div class="management-list-title-copy">
                          <div class="management-list-title">{{ row.createdAt }}</div>
                          <div class="management-list-subtitle">{{ row.httpMethod }}</div>
                        </div>
                      </div>
                    </button>
                  </td>
                  <td class="operation-col-user" data-label="用户">
                    <div class="operation-list-stack">
                      <span class="operation-list-main">{{ resolveUserDisplay(row) }}</span>
                      <span class="operation-list-sub">{{ resolveUserSubline(row) }}</span>
                    </div>
                  </td>
                  <td class="operation-col-module" data-label="模块">
                    <div class="operation-list-stack">
                      <span class="operation-list-main">{{ row.moduleName || '-' }}</span>
                      <span class="operation-list-sub">{{ row.moduleCode || '-' }}</span>
                    </div>
                  </td>
                  <td class="operation-col-action" data-label="动作">
                    <div class="operation-list-stack">
                      <span class="operation-list-main">{{ row.actionName || '-' }}</span>
                      <span class="operation-list-sub">{{ row.actionCode || '-' }}</span>
                    </div>
                  </td>
                  <td class="operation-col-biz" data-label="业务对象">
                    <div class="operation-list-stack">
                      <span class="operation-list-main">{{ resolveBizDisplay(row) }}</span>
                      <span class="operation-list-sub">{{ resolveBizTypeText(row.bizType) }}</span>
                    </div>
                  </td>
                  <td class="operation-col-path" data-label="请求路径">
                    <div class="operation-list-stack operation-list-path">
                      <span class="operation-list-main">{{ row.requestUri }}</span>
                      <span class="operation-list-sub">{{ row.routePattern || '-' }}</span>
                    </div>
                  </td>
                  <td class="operation-col-result" data-label="结果">
                    <div class="operation-list-stack">
                      <span class="management-list-pill" :class="resolveOperationStatusTone(row.operationStatus)">{{ resolveOperationStatusLabel(row.operationStatus) }}</span>
                      <span class="operation-list-sub">{{ row.resultMessage || '-' }}</span>
                    </div>
                  </td>
                  <td class="operation-col-status center" data-label="状态码">
                    <span class="operation-list-main">{{ row.responseStatus }}</span>
                  </td>
                  <td class="operation-col-duration center" data-label="耗时">
                    <span class="operation-list-main">{{ formatDuration(row.durationMs) }}</span>
                  </td>
                  <td class="operation-col-ip" data-label="IP">
                    <span class="operation-list-main">{{ row.ipAddress || '-' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>
          <div v-else class="mobile-entity-empty-state operation-log-empty-state">
            <el-empty description="当前筛选条件下暂无操作日志" />
          </div>
        </template>

        <template v-else>
          <div v-if="logList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in logList" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetail(row)">
                    <span class="mobile-entity-icon">{{ operationInitial(row) }}</span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.actionName || '操作日志' }}</span>
                      <span class="mobile-entity-description">{{ row.createdAt }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">用户</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ resolveUserDisplay(row) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">模块</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.moduleName || row.moduleCode || '-' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">业务对象</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ resolveBizDisplay(row) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">请求路径</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.requestUri }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">结果</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="resolveOperationStatusTone(row.operationStatus)">{{ resolveOperationStatusLabel(row.operationStatus) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态码</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.responseStatus }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">耗时</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ formatDuration(row.durationMs) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">IP</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.ipAddress || '-' }}</span>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
          <div v-else class="mobile-entity-empty-state operation-log-empty-state">
            <el-empty description="当前筛选条件下暂无操作日志" />
          </div>
        </template>
      </div>

      <div class="management-list-footer">
        <div class="management-list-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="management-list-footer-controls">
          <div class="management-list-page-size management-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
              <el-option :value="100" label="100" />
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

    <el-drawer v-model="detailVisible" :title="detailTitle" :size="detailDrawerSize" append-to-body>
      <template v-if="currentLog">
        <section class="operation-log-detail-section">
          <div class="operation-log-detail-grid">
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">操作时间</div>
              <div class="operation-log-detail-value">{{ currentLog.createdAt }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">用户</div>
              <div class="operation-log-detail-value">{{ resolveUserDisplay(currentLog) }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">模块</div>
              <div class="operation-log-detail-value">{{ currentLog.moduleName || '-' }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">动作</div>
              <div class="operation-log-detail-value">{{ currentLog.actionName || '-' }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">业务对象</div>
              <div class="operation-log-detail-value">{{ resolveBizDisplay(currentLog) }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">请求方法</div>
              <div class="operation-log-detail-value">{{ currentLog.httpMethod || '-' }}</div>
            </div>
            <div class="operation-log-detail-item operation-log-detail-item-full">
              <div class="operation-log-detail-label">请求路径</div>
              <div class="operation-log-detail-value">{{ currentLog.requestUri || '-' }}</div>
            </div>
            <div class="operation-log-detail-item operation-log-detail-item-full">
              <div class="operation-log-detail-label">路由模板</div>
              <div class="operation-log-detail-value">{{ currentLog.routePattern || '-' }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">结果</div>
              <div class="operation-log-detail-value">
                <span class="management-list-pill" :class="resolveOperationStatusTone(currentLog.operationStatus)">{{ resolveOperationStatusLabel(currentLog.operationStatus) }}</span>
              </div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">HTTP 状态</div>
              <div class="operation-log-detail-value">{{ currentLog.responseStatus }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">耗时</div>
              <div class="operation-log-detail-value">{{ formatDuration(currentLog.durationMs) }}</div>
            </div>
            <div class="operation-log-detail-item">
              <div class="operation-log-detail-label">IP</div>
              <div class="operation-log-detail-value">{{ currentLog.ipAddress || '-' }}</div>
            </div>
            <div class="operation-log-detail-item operation-log-detail-item-full">
              <div class="operation-log-detail-label">权限码</div>
              <div class="operation-log-detail-value">{{ currentLog.permissionCode || '-' }}</div>
            </div>
            <div class="operation-log-detail-item operation-log-detail-item-full">
              <div class="operation-log-detail-label">浏览器标识</div>
              <div class="operation-log-detail-value">{{ currentLog.userAgent || '-' }}</div>
            </div>
          </div>
        </section>

        <section class="operation-log-detail-section">
          <div class="operation-log-detail-section-title">结果消息</div>
          <div class="operation-log-detail-pre operation-log-detail-message">{{ currentLog.resultMessage || '-' }}</div>
        </section>

        <section class="operation-log-detail-section">
          <div class="operation-log-detail-section-title">请求摘要</div>
          <pre class="operation-log-detail-pre">{{ detailRequestSnapshot }}</pre>
        </section>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowLeft, ArrowRight, Filter, RefreshRight, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listUserOptions } from '@/api/access'
import { pageOperationLogs } from '@/api/operation-logs'
import type { OperationLogItem, UserOptionItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

interface OperationLogFilters {
  /** 搜索关键字。 */
  keyword: string
  /** 指定用户ID。 */
  userId?: number
  /** 模块编码。 */
  moduleCode: string
  /** 结果状态。 */
  operationStatus: '' | 'SUCCESS' | 'FAILED'
  /** 业务对象类型。 */
  bizType: string
  /** 时间范围，直接使用组件格式化后的字符串数组。 */
  timeRange: string[]
}

const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const filterPopoverVisible = ref(false)
const logList = ref<OperationLogItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const detailVisible = ref(false)
const currentLog = ref<OperationLogItem | null>(null)

const pagination = reactive({ page: 1, size: 10, total: 0 })
const filters = reactive<OperationLogFilters>({
  keyword: '',
  userId: undefined,
  moduleCode: '',
  operationStatus: '',
  bizType: '',
  timeRange: []
})

const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const detailDrawerSize = computed(() => (isMobileViewport.value ? '100%' : '680px'))
const detailTitle = computed(() => (currentLog.value ? `${currentLog.value.actionName || '操作日志'} · ${currentLog.value.createdAt}` : '操作日志详情'))
const detailRequestSnapshot = computed(() => prettyPrintJson(currentLog.value?.requestSnapshot))

/**
 * 将筛选表单统一转换为接口参数，避免列表刷新时各处重复拼接时间范围。
 */
const buildQueryParams = () => ({
  page: pagination.page,
  size: pagination.size,
  keyword: filters.keyword,
  userId: filters.userId,
  moduleCode: filters.moduleCode.trim() || undefined,
  operationStatus: filters.operationStatus || undefined,
  bizType: filters.bizType.trim() || undefined,
  startTime: filters.timeRange[0] || undefined,
  endTime: filters.timeRange[1] || undefined
})

const loadUserOptions = async () => {
  try {
    userOptions.value = await listUserOptions()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载用户选项失败')
  }
}

const loadLogs = async () => {
  loading.value = true
  try {
    const data = await pageOperationLogs(buildQueryParams())
    logList.value = data.records
    pagination.total = data.total
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载操作日志失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  filterPopoverVisible.value = false
  pagination.page = 1
  await loadLogs()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.userId = undefined
  filters.moduleCode = ''
  filters.operationStatus = ''
  filters.bizType = ''
  filters.timeRange = []
  pagination.page = 1
  await loadLogs()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadLogs()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) {
    return
  }
  pagination.page -= 1
  await loadLogs()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) {
    return
  }
  pagination.page += 1
  await loadLogs()
}

const openDetail = (row: OperationLogItem) => {
  currentLog.value = row
  detailVisible.value = true
}

const resolveUserDisplay = (row: OperationLogItem) => row.nicknameSnapshot || row.usernameSnapshot || '-'

const resolveUserSubline = (row: OperationLogItem) => {
  if (row.nicknameSnapshot && row.usernameSnapshot && row.nicknameSnapshot !== row.usernameSnapshot) {
    return row.usernameSnapshot
  }
  if (row.userId !== null) {
    return `用户ID：${row.userId}`
  }
  return '-'
}

const resolveBizDisplay = (row: OperationLogItem) => {
  if (row.bizType && row.bizId !== null) {
    return `${row.bizType} #${row.bizId}`
  }
  if (row.bizType) {
    return row.bizType
  }
  if (row.bizId !== null) {
    return `#${row.bizId}`
  }
  return '-'
}

const resolveBizTypeText = (bizType?: string | null) => bizType || '-'

const resolveOperationStatusLabel = (status: string) => {
  if (status === 'SUCCESS') {
    return '成功'
  }
  if (status === 'FAILED') {
    return '失败'
  }
  return status || '-'
}

const resolveOperationStatusTone = (status: string) => {
  if (status === 'SUCCESS') {
    return 'success'
  }
  if (status === 'FAILED') {
    return 'danger'
  }
  return 'warning'
}

const formatDuration = (durationMs: number) => `${durationMs} ms`

const operationInitial = (row: OperationLogItem) => (row.moduleName || row.actionName || '日志').slice(0, 1).toUpperCase()

/**
 * 请求摘要默认尝试格式化成漂亮 JSON，解析失败时退回原始文本。
 */
const prettyPrintJson = (value?: string | null) => {
  if (!value || value.trim() === '') {
    return '-'
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

onMounted(async () => {
  await Promise.all([loadUserOptions(), loadLogs()])
})
</script>

<style scoped>
.operation-log-table {
  min-width: 1580px;
}

.operation-col-time {
  width: 16%;
}

.operation-col-user {
  width: 11%;
}

.operation-col-module {
  width: 12%;
}

.operation-col-action {
  width: 14%;
}

.operation-col-biz {
  width: 10%;
}

.operation-col-path {
  width: 17%;
}

.operation-col-result {
  width: 12%;
}

.operation-col-status {
  width: 8%;
}

.operation-col-duration {
  width: 8%;
}

.operation-col-ip {
  width: 12%;
}

.operation-list-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.operation-list-main,
.operation-list-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operation-list-main {
  color: #191c1d;
  font-size: 13px;
  font-weight: 700;
}

.operation-list-sub {
  color: #64748b;
  font-size: 12px;
}

.operation-list-path .operation-list-main,
.operation-list-path .operation-list-sub {
  max-width: 100%;
}

.operation-log-empty-state {
  padding-top: 36px;
  padding-bottom: 36px;
}

.operation-log-detail-section + .operation-log-detail-section {
  margin-top: 20px;
}

.operation-log-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.operation-log-detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(248, 249, 250, 0.98);
}

.operation-log-detail-item-full {
  grid-column: 1 / -1;
}

.operation-log-detail-label,
.operation-log-detail-section-title {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

.operation-log-detail-value {
  color: #191c1d;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  word-break: break-all;
}

.operation-log-detail-pre {
  margin: 0;
  padding: 16px;
  border-radius: 16px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.operation-log-detail-message {
  background: rgba(248, 249, 250, 0.98);
  color: #191c1d;
  font-family: inherit;
}

@media (max-width: 900px) {
  .operation-log-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .operation-log-detail-item-full {
    grid-column: auto;
  }
}
</style>
