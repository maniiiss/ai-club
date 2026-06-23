<template>
  <div class="api-group-page">
    <section class="management-list-toolbar api-group-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索项目名称、负责人或 GROUP..."
          />
        </div>

        <span class="management-list-toolbar-divider" aria-hidden="true"></span>

        <button class="management-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
        <button class="management-list-toolbar-button" type="button" @click="loadGroupRows">
          <el-icon><Connection /></el-icon>
          <span>刷新状态</span>
        </button>
      </div>
    </section>

    <section class="api-group-grid" :class="{ 'api-group-grid-empty': !loading && !filteredRows.length }" v-loading="loading">
      <article v-for="row in filteredRows" :key="row.project.id" class="api-group-card">
        <header class="api-group-card-head">
          <div>
            <span class="api-group-kicker">API GROUP</span>
            <h2>{{ row.project.name }}</h2>
          </div>
          <div class="api-group-tag-group">
            <span class="management-list-pill" :class="bindingStateTone(resolveBindingState(row))">
              {{ bindingStateLabel(resolveBindingState(row)) }}
            </span>
            <span class="management-list-pill" :class="projectStatusTone(row.project.status)">
              {{ projectStatusLabel(row.project.status) }}
            </span>
          </div>
        </header>

        <div class="api-group-meta-line">
          <span>负责人：{{ ownerName(row.project) }}</span>
          <span>GROUP：{{ groupName(row) }}</span>
          <span>Collection：{{ collectionName(row) }}</span>
          <span>最近同步：{{ syncedAt(row) }}</span>
        </div>

        <div class="api-group-chip-list">
          <span class="management-list-chip">任务 {{ row.project.taskCount }}</span>
          <span class="management-list-chip">仓库 {{ row.project.repoCount }}</span>
          <span class="management-list-chip">智能体 {{ row.project.agentCount }}</span>
        </div>

        <div v-if="row.bindingError" class="api-group-warning" :title="row.bindingError">
          {{ row.bindingError }}
        </div>

        <div class="api-group-card-actions-shell">
          <div class="api-group-card-actions">
            <el-button type="primary" @click="openApiProject(row.project.id)">
              <el-icon><View /></el-icon>
              <span>进入 API</span>
            </el-button>
          </div>
        </div>
      </article>

      <el-empty v-if="!loading && !filteredRows.length" :description="emptyDescription" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, RefreshRight, Search, View } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { getYaadeProjectBinding, type YaadeProjectBindingItem } from '@/api/yaade'
import { listProjectOptions } from '@/api/platform'
import type { ProjectItem } from '@/types/platform'

type ApiGroupState = 'ready' | 'pending' | 'archived' | 'error'

interface ApiGroupRow {
  project: ProjectItem
  binding: YaadeProjectBindingItem | null
  bindingError: string
}

const router = useRouter()
const loading = ref(false)
const keyword = ref('')
const groupRows = ref<ApiGroupRow[]>([])

const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
const filteredRows = computed(() => {
  if (!normalizedKeyword.value) {
    return groupRows.value
  }
  return groupRows.value.filter((row) => buildSearchText(row).includes(normalizedKeyword.value))
})
const emptyDescription = computed(() => groupRows.value.length ? '没有找到匹配的 API 项目' : '当前没有可访问的 API 项目')

onMounted(async () => {
  await loadGroupRows()
})

/**
 * GROUP 首页只读取项目与绑定摘要，不创建 Yaade 嵌入会话，避免用户浏览列表时产生远端 collection 副作用。
 */
async function loadGroupRows() {
  loading.value = true
  try {
    const projects = await listProjectOptions()
    groupRows.value = await Promise.all(projects.map(loadProjectBindingRow))
  } catch (error: any) {
    groupRows.value = []
    ElMessage.error(error?.response?.data?.message || '加载 API 项目失败')
  } finally {
    loading.value = false
  }
}

async function loadProjectBindingRow(project: ProjectItem): Promise<ApiGroupRow> {
  try {
    return {
      project,
      binding: await getYaadeProjectBinding(project.id),
      bindingError: ''
    }
  } catch (error) {
    return {
      project,
      binding: null,
      bindingError: extractErrorMessage(error, '读取 GROUP 状态失败')
    }
  }
}

function handleReset() {
  keyword.value = ''
}

function openApiProject(projectId: number) {
  router.push({ name: 'api-project-detail-legacy', params: { projectId } })
}

function buildSearchText(row: ApiGroupRow) {
  return [
    row.project.name,
    row.project.owner,
    row.project.status,
    row.binding?.yaadeGroupName,
    row.binding?.collectionName,
    bindingStateLabel(resolveBindingState(row))
  ].filter(Boolean).join(' ').toLowerCase()
}

function resolveBindingState(row: ApiGroupRow): ApiGroupState {
  if (row.bindingError) {
    return 'error'
  }
  if (row.binding?.status === 'ARCHIVED') {
    return 'archived'
  }
  if (!row.binding?.exists || !row.binding.yaadeCollectionId) {
    return 'pending'
  }
  return 'ready'
}

function bindingStateLabel(state: ApiGroupState) {
  if (state === 'ready') return '已初始化'
  if (state === 'pending') return '待初始化'
  if (state === 'archived') return '已归档'
  return '状态异常'
}

function bindingStateTone(state: ApiGroupState) {
  if (state === 'ready') return 'success'
  if (state === 'pending') return 'info'
  if (state === 'archived') return 'warning'
  return 'danger'
}

function projectStatusTone(status?: string | null) {
  if (status === '进行中') return 'success'
  if (status === '规划中' || status === '已立项') return 'info'
  if (status === '已完成') return 'neutral'
  return 'warning'
}

function projectStatusLabel(status?: string | null) {
  return status?.trim() || '未设置'
}

function ownerName(project: ProjectItem) {
  return project.owner?.trim() || '未设置'
}

function groupName(row: ApiGroupRow) {
  if (row.bindingError) return '读取失败'
  return row.binding?.yaadeGroupName || '进入后自动生成'
}

function collectionName(row: ApiGroupRow) {
  if (row.bindingError) return '读取失败'
  return row.binding?.collectionName || row.project.name
}

function syncedAt(row: ApiGroupRow) {
  if (row.bindingError) return '-'
  if (resolveBindingState(row) === 'pending') return '进入后同步'
  return row.binding?.lastSyncedAt || '-'
}

function extractErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
  const instanceMessage = error instanceof Error ? error.message : ''
  return responseMessage || instanceMessage || fallback
}
</script>

<style scoped>
.api-group-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.api-group-toolbar {
  margin-bottom: 0;
}

.api-group-grid {
  --api-group-card-width: 360px;
  --api-group-card-height: 286px;

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--api-group-card-width)), var(--api-group-card-width)));
  grid-auto-rows: var(--api-group-card-height);
  gap: 14px;
  align-items: stretch;
}

.api-group-grid-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 300px);
}

.api-group-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  height: 100%;
  padding: 18px;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 252, 0.92)),
    radial-gradient(circle at 88% 0%, rgba(42, 157, 143, 0.12), transparent 34%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.api-group-card-head,
.api-group-meta-line,
.api-group-card-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.api-group-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
}

.api-group-card-head > div:first-child {
  display: contents;
  min-width: 0;
}

.api-group-kicker {
  grid-column: 1;
  grid-row: 1;
  width: fit-content;
  color: #0f766e;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
}

.api-group-card h2 {
  margin: 18px 0 0;
  color: #172033;
  grid-column: 1;
  grid-row: 1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
}

.api-group-tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  grid-column: 2;
  grid-row: 1;
  flex: 0 0 auto;
  max-width: 100%;
  max-height: 62px;
  overflow: hidden;
}

.api-group-meta-line {
  color: #475569;
  font-size: 13px;
  line-height: 1.45;
  max-height: 78px;
  margin: 0;
  overflow: hidden;
}

.api-group-meta-line span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-group-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 0 0 auto;
  max-height: 66px;
  overflow: hidden;
}

.api-group-warning {
  flex: 0 0 auto;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-group-card-actions-shell {
  display: flex;
  flex: 0 0 auto;
  align-self: stretch;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.api-group-card-actions {
  display: flex;
  flex-wrap: nowrap;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  align-self: stretch;
  min-width: 0;
  min-height: 52px;
  padding: 0 0 2px;
  overflow-x: auto;
  overflow-y: visible;
  justify-content: flex-start;
  scrollbar-width: none;
}

.api-group-card-actions::-webkit-scrollbar {
  display: none;
}

.api-group-card-actions :deep(.el-button) {
  flex: 0 0 auto;
  min-height: 40px;
  padding: 0 16px;
  margin-left: 0;
  box-shadow: none;
  transform: none;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  white-space: nowrap;
  border-radius: 12px;
}

.api-group-card-actions :deep(.el-button:hover),
.api-group-card-actions :deep(.el-button:focus-visible) {
  box-shadow: none;
  transform: none;
}

@media (max-width: 980px) {
  .api-group-grid {
    grid-auto-rows: minmax(286px, auto);
  }

  .api-group-toolbar .management-list-toolbar-main {
    width: fit-content;
    max-width: 100%;
    justify-self: start;
    flex: 0 1 auto;
  }

  .api-group-card-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .api-group-tag-group {
    grid-column: 1;
    grid-row: 3;
    max-height: none;
  }
}
</style>
