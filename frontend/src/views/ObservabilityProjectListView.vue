<template>
  <div class="work-list-page observability-page">
    <section class="work-list-toolbar">
      <div class="work-list-toolbar-main">
        <div class="work-list-search-shell">
          <el-icon class="work-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="work-list-search-input"
            type="text"
            placeholder="搜索项目名称、状态或负责人..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="work-list-toolbar-divider" aria-hidden="true"></span>
        <el-select v-model="filters.healthLevel" clearable placeholder="健康等级" class="work-list-inline-select">
          <el-option label="健康" value="HEALTHY" />
          <el-option label="亚健康" value="DEGRADED" />
          <el-option label="异常" value="ABNORMAL" />
          <el-option label="未知" value="UNKNOWN" />
        </el-select>
        <button class="work-list-toolbar-button" type="button" @click="handleSearch">
          <el-icon><Filter /></el-icon>
          <span>查询</span>
        </button>
        <button class="work-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>
    </section>

    <section class="work-list-shell">
      <div class="work-list-scroll" v-loading="loading">
        <div v-if="pageData.records.length" class="observability-card-grid">
          <article
            v-for="item in pageData.records"
            :key="item.projectId"
            class="observability-card"
            role="button"
            tabindex="0"
            @click="openDetail(item.projectId)"
            @keyup.enter="openDetail(item.projectId)"
          >
            <header class="observability-card-head">
              <div class="observability-card-copy">
                <h2>{{ item.projectName }}</h2>
                <p>{{ item.projectStatus }}</p>
              </div>
              <div class="observability-card-pills">
                <span class="management-list-pill" :class="resolveHealthTone(item.projectHealthLevel)">
                  {{ formatHealthLevel(item.projectHealthLevel) }}
                </span>
                <span class="management-list-pill neutral">
                  {{ item.enabledInstanceCount }}/{{ item.instanceCount }} 实例
                </span>
              </div>
            </header>

            <div class="observability-card-kpis">
              <div class="observability-kpi">
                <span>健康分</span>
                <strong>{{ item.projectHealthScore ?? '-' }}</strong>
              </div>
              <div class="observability-kpi">
                <span>异常实例</span>
                <strong>{{ item.abnormalInstanceCount }}</strong>
              </div>
            </div>

            <div class="observability-card-meta">
              <span>最近健康检查：{{ item.lastHealthCheckedAt || '暂无' }}</span>
              <span>最近日志采集：{{ item.lastLogCollectedAt || '暂无' }}</span>
            </div>

            <div v-if="item.lastLogCollectMessage" class="observability-card-message">
              {{ item.lastLogCollectStatus || 'INFO' }} · {{ item.lastLogCollectMessage }}
            </div>
          </article>
        </div>

        <div v-else class="work-list-empty-state">
          <el-empty description="当前筛选条件下暂无观测项目" />
        </div>
      </div>

      <div v-if="pageData.total > 0" class="work-list-footer">
        <div class="work-list-footer-total">
          共 <span>{{ pageData.total }}</span> 条
        </div>
        <div class="work-list-footer-controls">
          <div class="work-list-page-size work-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handlePageSizeChange">
              <el-option :value="6" label="6" />
              <el-option :value="12" label="12" />
              <el-option :value="24" label="24" />
            </el-select>
          </div>
          <div class="work-list-page-nav">
            <button class="work-list-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="work-list-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="work-list-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Filter, RefreshRight, Search } from '@element-plus/icons-vue'
import type { PageResponse, ObservabilityProjectItem } from '@/types/platform'
import { pageObservabilityProjects } from '@/api/observability'

const router = useRouter()
const loading = ref(false)
const filters = reactive({
  keyword: '',
  healthLevel: ''
})
const pagination = reactive({
  page: 1,
  size: 12
})
const pageData = ref<PageResponse<ObservabilityProjectItem>>({
  records: [],
  total: 0,
  page: 1,
  size: 12,
  totalPages: 0
})

const totalPages = computed(() => Math.max(1, pageData.value.totalPages || 1))

async function loadData() {
  loading.value = true
  try {
    pageData.value = await pageObservabilityProjects({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      healthLevel: filters.healthLevel || undefined
    })
  } finally {
    loading.value = false
  }
}

async function handleSearch() {
  pagination.page = 1
  await loadData()
}

async function handleReset() {
  filters.keyword = ''
  filters.healthLevel = ''
  pagination.page = 1
  await loadData()
}

async function handlePrevPage() {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadData()
}

async function handleNextPage() {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadData()
}

async function handlePageSizeChange() {
  pagination.page = 1
  await loadData()
}

function openDetail(projectId: number) {
  router.push({ name: 'observability-project-detail', params: { projectId } })
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

onMounted(async () => {
  await loadData()
})
</script>

<style scoped>
.observability-page .work-list-scroll,
.observability-page .work-list-footer {
  background: transparent;
  box-shadow: none;
}

.work-list-inline-select {
  width: 140px;
}

.observability-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.observability-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 20px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.92)),
    radial-gradient(circle at right top, rgba(37, 99, 235, 0.08), transparent 30%);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  cursor: pointer;
}

.observability-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.observability-card-copy {
  min-width: 0;
}

.observability-card-copy h2 {
  margin: 0;
  color: #172033;
  font-size: 20px;
  line-height: 1.35;
}

.observability-card-copy p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
}

.observability-card-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.observability-card-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.observability-kpi {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.76);
}

.observability-kpi span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.observability-kpi strong {
  color: #172033;
  font-size: 22px;
}

.observability-card-meta,
.observability-card-message {
  display: grid;
  gap: 6px;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .work-list-inline-select {
    width: 100%;
  }

  .observability-card-grid {
    grid-template-columns: 1fr;
  }

  .observability-card-head {
    flex-direction: column;
  }

  .observability-card-pills {
    justify-content: flex-start;
  }
}
</style>
