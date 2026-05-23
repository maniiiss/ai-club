<template>
  <div class="work-list-page">
    <section class="work-list-toolbar">
      <div class="work-list-toolbar-main">
        <div class="work-list-search-shell">
          <el-icon class="work-list-search-icon"><Search /></el-icon>
          <input
            v-model="pipelineFilters.keyword"
            class="work-list-search-input"
            type="text"
            placeholder="搜索项目、仓库、流水线或分支..."
            @keyup.enter="handlePipelineSearch"
          />
        </div>
        <span class="work-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="pipelineFilterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="work-list-filter-popper">
          <template #reference>
            <button class="work-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="work-list-filter-panel work-list-compact-input">
            <div class="work-list-filter-field">
              <label>平台项目</label>
              <el-select v-model="pipelineFilters.projectId" clearable filterable placeholder="平台项目" style="width: 100%" :teleported="false">
                <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
            <div class="work-list-filter-field">
              <label>启用状态</label>
              <el-select v-model="pipelineFilters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="停用" :value="false" />
              </el-select>
            </div>
            <div class="work-list-filter-actions">
              <el-button type="primary" @click="handlePipelineSearch">查询</el-button>
              <el-button @click="handlePipelineReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="work-list-toolbar-button" type="button" @click="handlePipelineReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
        <button v-if="canManage && isMobileViewport" class="work-list-create-button" type="button" @click="formDialogVisible = true">
          <el-icon><Plus /></el-icon>
          <span>新建流水线</span>
        </button>
      </div>

      <div v-if="canManage && !isMobileViewport" class="work-list-toolbar-side">
        <button class="work-list-create-button" type="button" @click="formDialogVisible = true">
          <el-icon><Plus /></el-icon>
          <span>新建流水线</span>
        </button>
      </div>
    </section>

    <section class="work-list-shell">
      <div class="work-list-scroll mobile-card-scroll" v-loading="pipelineLoading">
        <section v-if="pipelineList.length" class="pipeline-card-grid">
          <article
            v-for="row in pipelineList"
            :key="row.id"
            class="pipeline-card"
            role="button"
            tabindex="0"
            @click="openPipelineDetail(row.id)"
            @keyup.enter="openPipelineDetail(row.id)"
          >
            <header class="pipeline-card-head">
              <div class="pipeline-card-heading">
                <h2>{{ row.name }}</h2>
                <div class="pipeline-card-subtitle">{{ row.projectName }}</div>
              </div>
              <div class="pipeline-card-tag-group">
                <span class="management-list-pill success">{{ row.providerCode }}</span>
                <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">
                  {{ row.enabled ? '启用' : '停用' }}
                </span>
                <span class="management-list-pill" :class="aiClubPipelineStatusTone(row.lastRunStatus)">
                  {{ formatAiClubPipelineStatus(row.lastRunStatus) }}
                </span>
              </div>
            </header>

            <div class="pipeline-card-meta-line">
              <span>分支：{{ row.defaultBranch || '-' }}</span>
              <span>最近触发：{{ formatAiClubPipelineDateTime(row.lastTriggeredAt) }}</span>
            </div>

            <div class="pipeline-card-info-grid">
              <div class="pipeline-card-info-item pipeline-card-info-item-full">
                <span class="pipeline-card-info-label">仓库</span>
                <div class="pipeline-card-info-value">
                  <el-link
                    v-if="row.gitlabProjectWebUrl || row.woodpeckerRepoUrl"
                    :href="row.gitlabProjectWebUrl || row.woodpeckerRepoUrl || ''"
                    target="_blank"
                    type="primary"
                    class="pipeline-job-link"
                    @click.stop
                  >
                    {{ row.gitlabProjectPath || row.woodpeckerRepoFullName || '-' }}
                  </el-link>
                  <span v-else class="management-list-empty">{{ row.gitlabProjectPath || row.woodpeckerRepoFullName || '-' }}</span>
                </div>
              </div>

              <div class="pipeline-card-info-item pipeline-card-info-item-full">
                <span class="pipeline-card-info-label">配置</span>
                <div class="pipeline-card-info-value pipeline-config-cell">
                  <span class="management-list-empty">{{ row.configPath }}</span>
                  <span class="management-list-pill" :class="aiClubPipelineConfigStatusTone(configStatusOf(row)?.status)">
                    {{ formatAiClubPipelineConfigStatus(configStatusOf(row)?.status) }}
                  </span>
                </div>
              </div>
            </div>

            <div v-if="canView" class="pipeline-card-actions-shell">
              <div class="pipeline-card-actions">
                <el-button v-if="canBuild" type="primary" @click.stop="handleTriggerPipeline(row.id)">
                  <el-icon><VideoPlay /></el-icon>
                  <span>触发</span>
                </el-button>
              </div>
            </div>
          </article>
        </section>
        <div v-if="hasMoreMobileItems" ref="sentinelRef" class="mobile-waterfall-sentinel"></div>
        <div v-if="!pipelineList.length" class="work-list-empty-state">
          <el-empty description="当前筛选条件下暂无 AI Club Pipeline" />
        </div>
      </div>

      <div v-if="showDesktopPagination" class="work-list-footer">
        <div class="work-list-footer-total">
          共 <span>{{ pipelinePagination.total }}</span> 条
        </div>
        <div class="work-list-footer-controls">
          <div class="work-list-page-size work-list-compact-input">
            <span>每页</span>
            <el-select v-model="pipelinePagination.size" size="small" style="width: 92px" @change="handlePipelineSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="work-list-page-nav">
            <button class="work-list-page-button" type="button" :disabled="pipelinePagination.page <= 1" @click="handlePipelinePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="work-list-page-text">第 {{ pipelinePagination.page }} / {{ pipelineTotalPages }} 页</span>
            <button class="work-list-page-button" type="button" :disabled="pipelinePagination.page >= pipelineTotalPages" @click="handlePipelineNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <AiClubPipelineFormDialog
      v-model="formDialogVisible"
      @saved="handlePipelineSaved"
    />
    <AiClubPipelineConfigCompletionDialog
      v-model="configDialogVisible"
      :pipeline="selectedConfigPipeline"
      @completed="handleConfigCompleted"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Connection, DataAnalysis, Filter, Plus, RefreshRight, Search, VideoPlay, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import AiClubPipelineConfigCompletionDialog from '@/components/AiClubPipelineConfigCompletionDialog.vue'
import AiClubPipelineFormDialog from '@/components/AiClubPipelineFormDialog.vue'
import {
  getAiClubPipelineConfigStatus,
  pageAiClubPipelines,
  triggerAiClubPipeline
} from '@/api/cicd'
import { listProjectOptions } from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type {
  AiClubPipelineConfigStatusItem,
  AiClubPipelineItem,
  ProjectItem
} from '@/types/platform'
import {
  aiClubPipelineConfigStatusTone,
  aiClubPipelineStatusTone,
  formatAiClubPipelineConfigStatus,
  formatAiClubPipelineDateTime,
  formatAiClubPipelineStatus
} from '@/utils/aiClubPipeline'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'

const router = useRouter()
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('cicd:manage'))
const canBuild = computed(() => authStore.hasPermission('cicd:build'))
const canView = computed(() => authStore.hasPermission('cicd:view'))
const { isMobileViewport } = useMobileViewport()

const projectOptions = ref<ProjectItem[]>([])
const pipelineList = ref<AiClubPipelineItem[]>([])
const pipelineLoading = ref(false)
const configStatusMap = reactive<Record<number, AiClubPipelineConfigStatusItem | undefined>>({})
const formDialogVisible = ref(false)
const configDialogVisible = ref(false)
const selectedConfigPipeline = ref<AiClubPipelineItem | null>(null)

const pipelinePagination = reactive({ page: 1, size: 10, total: 0 })
const pipelineFilters = reactive<{ keyword: string; projectId: number | undefined; enabled: boolean | undefined }>({
  keyword: '',
  projectId: undefined,
  enabled: undefined
})
const pipelineFilterPopoverVisible = ref(false)

const pipelineTotalPages = computed(() => Math.max(1, Math.ceil(pipelinePagination.total / pipelinePagination.size) || 1))
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading: pipelineLoading,
  itemCount: computed(() => pipelineList.value.length),
  pagination: pipelinePagination,
  loadPage: async () => loadPipelines()
})

const configStatusOf = (row?: AiClubPipelineItem | null) => (row ? configStatusMap[row.id] : undefined)

async function loadBaseOptions() {
  projectOptions.value = await listProjectOptions()
}

async function loadPipelines() {
  pipelineLoading.value = true
  try {
    const pageData = await pageAiClubPipelines({
      page: requestPage.value,
      size: requestSize.value,
      keyword: pipelineFilters.keyword,
      projectId: pipelineFilters.projectId,
      enabled: pipelineFilters.enabled
    })
    pipelineList.value = pageData.records
    pipelinePagination.total = pageData.total
    void loadVisibleConfigStatuses(pageData.records)
  } finally {
    pipelineLoading.value = false
  }
}

async function refreshPipelineConfigStatus(pipelineId: number) {
  try {
    const status = await getAiClubPipelineConfigStatus(pipelineId)
    configStatusMap[pipelineId] = status
    return status
  } catch (error: any) {
    const fallback: AiClubPipelineConfigStatusItem = {
      status: 'UNKNOWN',
      branch: '-',
      configPath: '-',
      message: error?.response?.data?.message || '配置文件状态检查失败',
      checkedAt: null
    }
    configStatusMap[pipelineId] = fallback
    return fallback
  }
}

async function loadVisibleConfigStatuses(rows = pipelineList.value) {
  await Promise.all(rows.map((row) => refreshPipelineConfigStatus(row.id)))
}

async function handlePipelineSearch() {
  pipelineFilterPopoverVisible.value = false
  resetMobilePagination()
  await loadPipelines()
}

async function handlePipelineReset() {
  pipelineFilters.keyword = ''
  pipelineFilters.projectId = undefined
  pipelineFilters.enabled = undefined
  resetMobilePagination()
  await loadPipelines()
}

async function handlePipelineSizeChange() {
  resetMobilePagination()
  await loadPipelines()
}

async function handlePipelinePrevPage() {
  if (pipelinePagination.page <= 1) return
  pipelinePagination.page -= 1
  await loadPipelines()
}

async function handlePipelineNextPage() {
  if (pipelinePagination.page >= pipelineTotalPages.value) return
  pipelinePagination.page += 1
  await loadPipelines()
}

function openPipelineDetail(id: number) {
  router.push({ name: 'cicd-pipeline-detail', params: { pipelineId: String(id) } })
}

async function handleTriggerPipeline(id: number) {
  try {
    const result = await triggerAiClubPipeline(id)
    ElMessage.success(result.message)
    await loadPipelines()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '触发流水线失败')
    await Promise.all([loadPipelines(), refreshPipelineConfigStatus(id)])
  }
}

async function handlePipelineSaved(saved: AiClubPipelineItem) {
  await loadPipelines()
  const status = await refreshPipelineConfigStatus(saved.id)
  if (status.status === 'MISSING') {
    selectedConfigPipeline.value = saved
    configDialogVisible.value = true
    ElMessage.warning('目标分支缺少流水线配置文件，请继续补全配置。')
  }
}

async function handleConfigCompleted() {
  if (selectedConfigPipeline.value) {
    await refreshPipelineConfigStatus(selectedConfigPipeline.value.id)
  }
  await loadPipelines()
}

onMounted(async () => {
  await loadBaseOptions()
  await loadPipelines()
})
</script>

<style scoped>
.pipeline-card-grid {
  --pipeline-card-width: 360px;
  --pipeline-card-min-height: 260px;

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--pipeline-card-width)), var(--pipeline-card-width)));
  grid-auto-rows: minmax(var(--pipeline-card-min-height), auto);
  gap: 14px;
  align-items: stretch;
}

.pipeline-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  height: 100%;
  padding: 18px;
  box-sizing: border-box;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.94)),
    radial-gradient(circle at 94% 2%, rgba(37, 99, 235, 0.09), transparent 34%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  cursor: pointer;
}

.pipeline-card-head,
.pipeline-card-meta-line,
.pipeline-card-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.pipeline-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: flex-start;
}

.pipeline-card-heading {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.pipeline-card-heading h2 {
  margin: 0;
  color: #172033;
  font-size: 20px;
  line-height: 1.35;
}

.pipeline-card-subtitle {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.pipeline-card-tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  max-width: 100%;
}

.pipeline-card-meta-line {
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  row-gap: 4px;
}

.pipeline-card-meta-line span {
  max-width: 100%;
  word-break: break-word;
}

.pipeline-card-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.pipeline-card-info-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.pipeline-card-info-item-full {
  grid-column: 1 / -1;
}

.pipeline-card-info-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.pipeline-card-info-value,
.pipeline-job-link {
  min-width: 0;
}

.pipeline-card-info-value .management-list-empty,
.pipeline-job-link {
  display: inline-block;
  max-width: 100%;
  white-space: normal;
  word-break: break-word;
}

.pipeline-card-actions-shell {
  display: flex;
  flex: 0 0 auto;
  align-self: stretch;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.pipeline-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
  min-height: 36px;
}

.pipeline-card-actions :deep(.el-button) {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 14px;
  margin-left: 0;
  white-space: nowrap;
  border-radius: 12px;
}

.pipeline-config-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pipeline-config-cell .management-list-empty {
  min-width: 0;
}

@media (max-width: 980px) {
  .pipeline-card-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .pipeline-card-tag-group {
    justify-content: flex-start;
  }

  .pipeline-card-info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
