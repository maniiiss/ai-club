<template>
  <div class="pipeline-detail-page" v-loading="loading">
    <section v-if="pipelineDetail" class="pipeline-detail-hero">
      <button class="pipeline-detail-back-link" type="button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回流水线中心</span>
      </button>

      <div class="pipeline-detail-hero-heading">
        <div>
          <h1>{{ pipelineDetail.name }}</h1>
          <div class="pipeline-detail-hero-subtitle">{{ pipelineDetail.projectName }}</div>
        </div>
        <div class="pipeline-detail-hero-actions">
          <el-button v-if="canBuild" type="primary" @click="handleTrigger">
            <el-icon><VideoPlay /></el-icon>
            <span>触发</span>
          </el-button>
          <el-button v-if="canManage" @click="handleSync">
            <el-icon><Connection /></el-icon>
            <span>同步仓库</span>
          </el-button>
          <el-button v-if="canManage && configStatus?.status === 'MISSING'" type="warning" @click="configDialogVisible = true">
            <el-icon><Plus /></el-icon>
            <span>补全配置</span>
          </el-button>
          <el-button v-if="canManage" @click="editDialogVisible = true">
            <el-icon><EditPen /></el-icon>
            <span>编辑</span>
          </el-button>
          <el-button v-if="canManage" type="danger" plain @click="handleDelete">
            <el-icon><Delete /></el-icon>
            <span>删除</span>
          </el-button>
        </div>
      </div>

      <div class="pipeline-detail-hero-meta">
        <span class="management-list-pill success">{{ pipelineDetail.providerCode }}</span>
        <span class="management-list-pill" :class="pipelineDetail.enabled ? 'success' : 'neutral'">
          {{ pipelineDetail.enabled ? '启用' : '停用' }}
        </span>
        <span class="management-list-pill" :class="aiClubPipelineStatusTone(pipelineDetail.lastRunStatus)">
          {{ formatAiClubPipelineStatus(pipelineDetail.lastRunStatus) }}
        </span>
        <span class="management-list-pill" :class="aiClubPipelineConfigStatusTone(configStatus?.status)">
          {{ formatAiClubPipelineConfigStatus(configStatus?.status) }}
        </span>
        <span>默认分支：{{ pipelineDetail.defaultBranch || '-' }}</span>
        <span>配置文件：{{ pipelineDetail.configPath }}</span>
        <span>最近触发：{{ formatAiClubPipelineDateTime(pipelineDetail.lastTriggeredAt) }}</span>
        <a
          v-if="pipelineDetail.gitlabProjectWebUrl || pipelineDetail.woodpeckerRepoUrl"
          class="pipeline-detail-repo-chip"
          :href="pipelineDetail.gitlabProjectWebUrl || pipelineDetail.woodpeckerRepoUrl || undefined"
          target="_blank"
          rel="noreferrer"
        >
          仓库：{{ pipelineDetail.gitlabProjectPath || pipelineDetail.woodpeckerRepoFullName || '-' }}
        </a>
      </div>

      <el-alert
        v-if="configStatus?.status === 'MISSING'"
        type="warning"
        show-icon
        :closable="false"
        class="pipeline-detail-hero-alert"
      >
        <template #title>{{ configStatus.message }}</template>
      </el-alert>
    </section>

    <section v-if="pipelineDetail" class="pipeline-detail-content">
      <el-tabs v-model="activeTab" class="pipeline-detail-tabs">
        <el-tab-pane label="运行历史" name="history">
          <section class="pipeline-detail-panel">
            <div class="pipeline-detail-panel-head">
              <div>
                <h2>运行历史</h2>
                <p>查看当前流水线最近运行记录，并切换查看对应日志。</p>
              </div>
              <div class="pipeline-detail-history-tools">
                <el-select v-model="runHistoryLimit" style="width: 150px" @change="handleRunHistoryLimitChange">
                  <el-option :value="10" label="最近 10 条" />
                  <el-option :value="20" label="最近 20 条" />
                  <el-option :value="50" label="最近 50 条" />
                </el-select>
                <el-button @click="reloadRuns">刷新</el-button>
              </div>
            </div>

            <el-table v-if="runList.length" v-loading="runLoading" :data="runList" style="width: 100%" @row-click="handleSelectRun">
              <el-table-column prop="number" label="运行号" width="100">
                <template #default="{ row }">#{{ row.number }}</template>
              </el-table-column>
              <el-table-column label="状态" width="120">
                <template #default="{ row }">
                  <el-tag :type="aiClubPipelineRunStatusType(row.status)">{{ formatAiClubPipelineStatus(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="branch" label="分支" width="140" show-overflow-tooltip />
              <el-table-column prop="event" label="事件" width="100" />
              <el-table-column prop="startedAt" label="开始时间" width="180">
                <template #default="{ row }">{{ formatAiClubPipelineDateTime(row.startedAt) }}</template>
              </el-table-column>
              <el-table-column prop="durationText" label="耗时" width="120" />
              <el-table-column prop="message" label="说明" min-width="220" show-overflow-tooltip />
              <el-table-column label="操作" width="110" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click.stop="handleOpenRunLog(row.number)">查看日志</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="当前流水线还没有运行记录" />
          </section>
        </el-tab-pane>

        <el-tab-pane label="运行日志" name="log">
          <section class="pipeline-detail-panel">
            <div class="pipeline-detail-panel-head">
              <div>
                <h2>运行日志</h2>
                <p v-if="selectedRunSummary">当前查看第 {{ selectedRunSummary.number }} 次运行的聚合日志。</p>
                <p v-else>当前还没有可查看的运行日志。</p>
              </div>
              <el-select
                v-if="runList.length"
                v-model="selectedRunNumber"
                placeholder="选择运行记录"
                style="width: 180px"
                @change="handleSelectRunByNumber"
              >
                <el-option v-for="run in runList" :key="run.number" :label="`第 ${run.number} 次运行`" :value="run.number" />
              </el-select>
            </div>

            <template v-if="selectedRunLog">
              <el-descriptions :column="2" border class="pipeline-detail-log-summary">
                <el-descriptions-item label="平台项目">{{ selectedRunLog.projectName }}</el-descriptions-item>
                <el-descriptions-item label="流水线">{{ selectedRunLog.pipelineName }}</el-descriptions-item>
                <el-descriptions-item label="仓库">{{ selectedRunLog.repoFullName || '-' }}</el-descriptions-item>
                <el-descriptions-item label="运行号">#{{ selectedRunLog.runNumber }}</el-descriptions-item>
                <el-descriptions-item label="状态">{{ formatAiClubPipelineStatus(selectedRunLog.status) }}</el-descriptions-item>
                <el-descriptions-item label="分支">{{ selectedRunLog.branch || '-' }}</el-descriptions-item>
                <el-descriptions-item label="开始时间">{{ selectedRunLog.startedAt || '-' }}</el-descriptions-item>
                <el-descriptions-item label="结束时间">{{ selectedRunLog.finishedAt || '-' }}</el-descriptions-item>
              </el-descriptions>

              <div class="pipeline-detail-log-shell" v-loading="runLogLoading">
                <div class="pipeline-detail-log-head">
                  <strong>聚合日志</strong>
                  <el-link v-if="selectedRunLog.url" :href="selectedRunLog.url" target="_blank" type="primary">打开 Woodpecker 运行</el-link>
                </div>
                <el-scrollbar max-height="520px">
                  <pre class="pipeline-detail-log-content">{{ selectedRunLog.consoleLog }}</pre>
                </el-scrollbar>
              </div>
            </template>
            <el-empty v-else description="请选择一条运行记录查看日志" />
          </section>
        </el-tab-pane>

        <el-tab-pane label="基础信息" name="basic">
          <section class="pipeline-detail-panel">
            <div class="pipeline-detail-panel-head">
              <div>
                <h2>基础信息</h2>
                <p>查看当前流水线与 GitLab / Woodpecker 绑定信息，以及最近运行摘要。</p>
              </div>
            </div>

            <el-descriptions :column="2" border class="pipeline-detail-basic-summary">
              <el-descriptions-item label="平台项目">{{ pipelineDetail.projectName }}</el-descriptions-item>
              <el-descriptions-item label="流水线">{{ pipelineDetail.name }}</el-descriptions-item>
              <el-descriptions-item label="GitLab 仓库">{{ pipelineDetail.gitlabProjectPath || '-' }}</el-descriptions-item>
              <el-descriptions-item label="Provider">{{ pipelineDetail.providerCode }}</el-descriptions-item>
              <el-descriptions-item label="默认分支">{{ pipelineDetail.defaultBranch || '-' }}</el-descriptions-item>
              <el-descriptions-item label="配置文件">{{ pipelineDetail.configPath }}</el-descriptions-item>
              <el-descriptions-item label="Woodpecker 仓库">{{ pipelineDetail.woodpeckerRepoFullName || '-' }}</el-descriptions-item>
              <el-descriptions-item label="启用状态">{{ pipelineDetail.enabled ? '启用' : '停用' }}</el-descriptions-item>
              <el-descriptions-item label="配置状态">{{ formatAiClubPipelineConfigStatus(configStatus?.status) }}</el-descriptions-item>
              <el-descriptions-item label="最近运行">{{ formatAiClubPipelineStatus(pipelineDetail.lastRunStatus) }}</el-descriptions-item>
              <el-descriptions-item label="最近运行号">#{{ pipelineDetail.lastRunNumber || '-' }}</el-descriptions-item>
              <el-descriptions-item label="最近触发">{{ formatAiClubPipelineDateTime(pipelineDetail.lastTriggeredAt) }}</el-descriptions-item>
              <el-descriptions-item label="运行链接" :span="2">
                <el-link v-if="pipelineDetail.lastRunUrl" :href="pipelineDetail.lastRunUrl" target="_blank" type="primary">
                  {{ pipelineDetail.lastRunUrl }}
                </el-link>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="配置说明" :span="2">
                <span>{{ configStatus?.message || '-' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="最近结果" :span="2">
                <span>{{ pipelineDetail.lastRunMessage || '-' }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </section>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-result v-else-if="!loading" icon="warning" title="流水线不存在" sub-title="请确认流水线 ID 是否正确，或返回列表重新选择。">
      <template #extra>
        <el-button type="primary" @click="goBack">返回流水线中心</el-button>
      </template>
    </el-result>

    <AiClubPipelineFormDialog
      v-model="editDialogVisible"
      :pipeline="pipelineDetail"
      @saved="handlePipelineSaved"
    />
    <AiClubPipelineConfigCompletionDialog
      v-model="configDialogVisible"
      :pipeline="pipelineDetail"
      @completed="handleConfigCompleted"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Connection, DataAnalysis, Delete, EditPen, Plus, Tickets, VideoPlay } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import AiClubPipelineConfigCompletionDialog from '@/components/AiClubPipelineConfigCompletionDialog.vue'
import AiClubPipelineFormDialog from '@/components/AiClubPipelineFormDialog.vue'
import {
  deleteAiClubPipeline,
  getAiClubPipeline,
  getAiClubPipelineConfigStatus,
  getAiClubPipelineRunLog,
  listAiClubPipelineRuns,
  syncAiClubPipelineRepository,
  triggerAiClubPipeline
} from '@/api/cicd'
import { useAuthStore } from '@/stores/auth'
import type {
  AiClubPipelineConfigStatusItem,
  AiClubPipelineItem,
  AiClubPipelineRunItem,
  AiClubPipelineRunLogDetailItem
} from '@/types/platform'
import {
  aiClubPipelineConfigStatusTone,
  aiClubPipelineRunStatusType,
  aiClubPipelineStatusTone,
  formatAiClubPipelineConfigStatus,
  formatAiClubPipelineDateTime,
  formatAiClubPipelineStatus
} from '@/utils/aiClubPipeline'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const canManage = computed(() => authStore.hasPermission('cicd:manage'))
const canBuild = computed(() => authStore.hasPermission('cicd:build'))

const loading = ref(false)
const runLoading = ref(false)
const runLogLoading = ref(false)
const activeTab = ref('history')
const runHistoryLimit = ref(20)
const pipelineDetail = ref<AiClubPipelineItem | null>(null)
const configStatus = ref<AiClubPipelineConfigStatusItem | null>(null)
const runList = ref<AiClubPipelineRunItem[]>([])
const selectedRunNumber = ref<number | null>(null)
const selectedRunLog = ref<AiClubPipelineRunLogDetailItem | null>(null)
const editDialogVisible = ref(false)
const configDialogVisible = ref(false)

const pipelineId = computed(() => Number(route.params.pipelineId))

const selectedRunSummary = computed(() => runList.value.find((item) => item.number === selectedRunNumber.value) || null)

watch(
  () => route.params.pipelineId,
  async () => {
    await loadPipelineDetail()
  }
)

onMounted(async () => {
  await loadPipelineDetail()
})

function goBack() {
  router.push({ name: 'cicd-pipelines' })
}

async function loadPipelineDetail(preferredRunNumber?: number | null) {
  if (!Number.isFinite(pipelineId.value) || pipelineId.value <= 0) {
    pipelineDetail.value = null
    configStatus.value = null
    runList.value = []
    selectedRunNumber.value = null
    selectedRunLog.value = null
    return
  }

  loading.value = true
  try {
    const [detail, status, runs] = await Promise.all([
      getAiClubPipeline(pipelineId.value),
      getAiClubPipelineConfigStatus(pipelineId.value),
      listAiClubPipelineRuns(pipelineId.value, runHistoryLimit.value)
    ])
    pipelineDetail.value = detail
    configStatus.value = status
    runList.value = runs
    const nextRunNumber = resolveSelectedRunNumber(runs, preferredRunNumber)
    selectedRunNumber.value = nextRunNumber
    if (nextRunNumber !== null) {
      await loadRunLog(nextRunNumber)
    } else {
      selectedRunLog.value = null
    }
  } catch (error: any) {
    pipelineDetail.value = null
    configStatus.value = null
    runList.value = []
    selectedRunNumber.value = null
    selectedRunLog.value = null
    ElMessage.error(error?.response?.data?.message || '加载流水线详情失败')
  } finally {
    loading.value = false
  }
}

function resolveSelectedRunNumber(runs: AiClubPipelineRunItem[], preferredRunNumber?: number | null) {
  const nextRunNumber = preferredRunNumber
    ?? selectedRunNumber.value
    ?? pipelineDetail.value?.lastRunNumber
    ?? runs[0]?.number
    ?? null
  return runs.some((item) => item.number === nextRunNumber) ? nextRunNumber : (runs[0]?.number ?? null)
}

async function reloadRuns() {
  if (!pipelineDetail.value) return
  runLoading.value = true
  try {
    const runs = await listAiClubPipelineRuns(pipelineDetail.value.id, runHistoryLimit.value)
    runList.value = runs
    const nextRunNumber = resolveSelectedRunNumber(runs)
    selectedRunNumber.value = nextRunNumber
    if (nextRunNumber !== null) {
      await loadRunLog(nextRunNumber)
    } else {
      selectedRunLog.value = null
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载运行历史失败')
  } finally {
    runLoading.value = false
  }
}

async function handleRunHistoryLimitChange() {
  await reloadRuns()
}

async function handleSelectRun(run: AiClubPipelineRunItem) {
  await handleSelectRunByNumber(run.number)
}

async function handleSelectRunByNumber(runNumber?: number | null) {
  if (runNumber === null || runNumber === undefined) return
  selectedRunNumber.value = runNumber
  await loadRunLog(runNumber)
}

async function handleOpenRunLog(runNumber: number) {
  await handleSelectRunByNumber(runNumber)
  activeTab.value = 'log'
}

async function loadRunLog(runNumber: number) {
  if (!pipelineDetail.value) return
  runLogLoading.value = true
  try {
    selectedRunLog.value = await getAiClubPipelineRunLog(pipelineDetail.value.id, runNumber)
  } catch (error: any) {
    selectedRunLog.value = null
    ElMessage.error(error?.response?.data?.message || '加载运行日志失败')
  } finally {
    runLogLoading.value = false
  }
}

async function handleTrigger() {
  if (!pipelineDetail.value) return
  try {
    const result = await triggerAiClubPipeline(pipelineDetail.value.id)
    ElMessage.success(result.message)
    await loadPipelineDetail(result.runNumber)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '触发流水线失败')
    await loadPipelineDetail()
  }
}

async function handleSync() {
  if (!pipelineDetail.value) return
  try {
    pipelineDetail.value = await syncAiClubPipelineRepository(pipelineDetail.value.id)
    configStatus.value = await getAiClubPipelineConfigStatus(pipelineDetail.value.id)
    ElMessage.success('Woodpecker 仓库已同步')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '同步仓库失败')
  }
}

async function handleDelete() {
  if (!pipelineDetail.value) return
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认继续吗？', '提示', { type: 'warning' })
    await deleteAiClubPipeline(pipelineDetail.value.id)
    ElMessage.success('流水线已删除')
    goBack()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

async function handlePipelineSaved(saved: AiClubPipelineItem) {
  pipelineDetail.value = saved
  await loadPipelineDetail(selectedRunNumber.value)
}

async function handleConfigCompleted() {
  await loadPipelineDetail(selectedRunNumber.value)
}
</script>

<style scoped>
.pipeline-detail-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pipeline-detail-hero,
.pipeline-detail-panel {
  padding: 20px 22px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
}

.pipeline-detail-hero {
  display: grid;
  gap: 16px;
}

.pipeline-detail-back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 0;
  color: var(--app-primary);
  font-size: 13px;
  font-weight: 600;
  background: transparent;
  border: none;
  cursor: pointer;
}

.pipeline-detail-hero-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.pipeline-detail-hero-heading h1 {
  margin: 0;
  color: var(--app-text);
}

.pipeline-detail-hero-subtitle {
  margin-top: 6px;
  color: var(--app-muted);
  font-size: 14px;
}

.pipeline-detail-hero-actions,
.pipeline-detail-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.pipeline-detail-repo-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0 12px;
  min-height: 32px;
  color: var(--app-primary);
  text-decoration: none;
  background: rgba(37, 99, 235, 0.08);
  border-radius: 999px;
}

.pipeline-detail-hero-alert {
  margin-top: 2px;
}

.pipeline-detail-content :deep(.el-tabs__header) {
  margin-bottom: 14px;
}

.pipeline-detail-panel {
  display: grid;
  gap: 16px;
}

.pipeline-detail-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.pipeline-detail-panel-head h2 {
  margin: 0;
  color: var(--app-text);
}

.pipeline-detail-panel-head p {
  margin: 6px 0 0;
  color: var(--app-muted);
  font-size: 13px;
}

.pipeline-detail-history-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pipeline-detail-log-summary,
.pipeline-detail-basic-summary {
  width: 100%;
}

.pipeline-detail-log-shell {
  display: grid;
  gap: 10px;
}

.pipeline-detail-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pipeline-detail-log-content {
  margin: 0;
  padding: 16px;
  color: #f8fafc;
  background: #111827;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 980px) {
  .pipeline-detail-hero-heading,
  .pipeline-detail-panel-head {
    flex-direction: column;
  }

  .pipeline-detail-history-tools {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
