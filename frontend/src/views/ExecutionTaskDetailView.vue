<template>
  <div class="execution-detail-page" v-loading="loading">
    <section v-if="taskDetail" class="execution-detail-hero">
      <button class="execution-back-button" type="button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回执行中心</span>
      </button>
      <div class="execution-detail-heading">
        <div>
          <p class="execution-eyebrow">{{ taskDetail.scenarioName }}</p>
          <h1>{{ taskDetail.title }}</h1>
        </div>
        <div class="execution-detail-actions">
          <el-button v-if="canCancelExecution && canCancel(taskDetail.status)" type="success" @click="handleCancel">取消</el-button>
          <el-button v-if="canRetryExecution && canRetry(taskDetail.status)" type="success" @click="handleRetry">重试</el-button>
        </div>
      </div>

      <div class="execution-detail-meta">
        <button v-if="taskDetail.workItemId" type="button" @click="openWorkItem">
          工作项：{{ taskDetail.workItemCode || '#' + taskDetail.workItemId }} {{ taskDetail.workItemName }}
        </button>
        <span>项目：{{ taskDetail.projectName }}</span>
        <span>发起人：{{ taskDetail.createdByName || '-' }}</span>
        <span>创建时间：{{ taskDetail.createdAt }}</span>
      </div>
    </section>

    <template v-if="taskDetail">
      <section class="execution-run-card">
        <div class="execution-run-head">
          <div>
            <h2>运行进度</h2>
            <p>当前运行会持续轮询更新，最终结果会沉淀为产物并回写工作项评论。</p>
          </div>
          <el-select v-model="selectedRunId" placeholder="选择运行记录" style="width: 180px" @change="loadSelectedRun">
            <el-option v-for="run in taskDetail.runs" :key="run.id" :label="`第 ${run.runNo} 次运行`" :value="run.id" />
          </el-select>
        </div>

        <template v-if="runDetail">
          <el-progress :percentage="runDetail.progressPercent || 0" :status="progressStatus(runDetail.status)" />
          <div class="execution-run-status">
            <span>状态：{{ statusLabel(runDetail.status) }}</span>
            <span>当前步骤：{{ runDetail.currentStepName || '-' }}</span>
            <span>开始：{{ runDetail.startedAt || '-' }}</span>
            <span>结束：{{ runDetail.finishedAt || '-' }}</span>
          </div>
        </template>
        <el-empty v-else description="执行运行尚未创建，请稍后刷新" />
      </section>

      <section v-if="runDetail" class="execution-detail-grid">
        <article class="execution-panel">
          <div class="execution-panel-head">
            <h2>步骤日志</h2>
          </div>
          <el-timeline>
            <el-timeline-item
              v-for="step in runDetail.steps"
              :key="step.id"
              :type="timelineType(step.status)"
              :timestamp="step.startedAt || '-'"
            >
              <div class="execution-step-log">
                <div class="execution-step-log-head">
                  <strong>{{ step.stepNo }}. {{ step.stepName }}</strong>
                  <el-tag size="small" :type="statusTagType(step.status)">{{ statusLabel(step.status) }}</el-tag>
                </div>
                <div class="execution-step-log-agent">Agent：{{ step.agentName || '-' }}</div>
                <div class="execution-step-log-progress">
                  <el-progress :percentage="step.progressPercent || 0" :status="progressStatus(step.status)" />
                  <span>{{ step.latestMessage || '等待执行' }}</span>
                </div>
                <el-collapse>
                  <el-collapse-item title="输入快照">
                    <pre>{{ step.inputSnapshot || '-' }}</pre>
                  </el-collapse-item>
                  <el-collapse-item title="输出结果">
                    <pre>{{ step.outputSnapshot || step.errorMessage || '-' }}</pre>
                  </el-collapse-item>
                </el-collapse>
              </div>
            </el-timeline-item>
          </el-timeline>
        </article>

        <article class="execution-panel">
          <div class="execution-panel-head">
            <h2>执行产物</h2>
          </div>
          <div v-if="runDetail.artifacts.length" class="execution-artifact-list">
            <section v-for="artifact in runDetail.artifacts" :key="artifact.id" class="execution-artifact-card">
              <div class="execution-artifact-head">
                <strong>{{ artifact.title }}</strong>
                <el-tag size="small">{{ artifact.artifactType }}</el-tag>
              </div>
              <div v-if="isMarkdownArtifact(artifact)" class="execution-artifact-markdown" v-html="renderArtifactMarkdown(artifact.contentText)"></div>
              <pre v-else>{{ artifact.contentText || '-' }}</pre>
              <div class="execution-artifact-foot">
                <span>{{ artifact.workItemWriteback ? '已回写工作项' : '未回写工作项' }}</span>
                <el-link v-if="artifact.contentRef" type="primary" @click.prevent="handleArtifactDownload(artifact)">下载产物</el-link>
              </div>
            </section>
          </div>
          <el-empty v-else description="暂无产物" />
        </article>
      </section>
    </template>

    <el-empty v-else-if="!loading" description="执行任务不存在或无权访问" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import {
  cancelExecutionTask,
  downloadExecutionArtifact,
  getExecutionRunDetail,
  getExecutionTaskDetail,
  retryExecutionTask
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type { ExecutionArtifactItem, ExecutionRunDetailItem, ExecutionTaskDetailItem } from '@/types/platform'
import { renderMarkdownToHtml } from '@/utils/markdown'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const taskDetail = ref<ExecutionTaskDetailItem | null>(null)
const runDetail = ref<ExecutionRunDetailItem | null>(null)
const selectedRunId = ref<number | null>(null)
const refreshTimer = ref<number | null>(null)

const executionTaskId = computed(() => Number(route.params.executionTaskId))
const canCancelExecution = computed(() => authStore.hasPermission('task:execution:cancel'))
const canRetryExecution = computed(() => authStore.hasPermission('task:execution:retry'))

const canCancel = (status: string) => ['PENDING', 'RUNNING'].includes(status)
const canRetry = (status: string) => ['SUCCESS', 'FAILED', 'CANCELED'].includes(status)

const statusLabel = (status: string) => {
  const labelMap: Record<string, string> = {
    PENDING: '待执行',
    RUNNING: '执行中',
    SUCCESS: '成功',
    FAILED: '失败',
    CANCELED: '已取消'
  }
  return labelMap[status] || status
}

const statusTagType = (status: string) => {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'CANCELED') return 'info'
  if (status === 'RUNNING') return 'warning'
  return 'primary'
}

const progressStatus = (status: string) => {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'exception'
  return undefined
}

const timelineType = (status: string) => {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'RUNNING') return 'warning'
  return 'info'
}

const isMarkdownArtifact = (artifact: ExecutionArtifactItem) => artifact.artifactType === 'REPORT_MARKDOWN'
const renderArtifactMarkdown = (content?: string | null) => renderMarkdownToHtml(content || '')

const handleArtifactDownload = async (artifact: ExecutionArtifactItem) => {
  try {
    const { blob, fileName } = await downloadExecutionArtifact(artifact.id)
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(objectUrl)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '下载产物失败')
  }
}

const loadTaskDetail = async () => {
  loading.value = true
  try {
    const detail = await getExecutionTaskDetail(executionTaskId.value)
    taskDetail.value = detail
    const nextRunId = detail.currentRunId || detail.runs[0]?.id || null
    if (nextRunId && selectedRunId.value !== nextRunId) {
      selectedRunId.value = nextRunId
    }
    await loadSelectedRun()
  } finally {
    loading.value = false
  }
}

const loadSelectedRun = async () => {
  if (!selectedRunId.value) {
    runDetail.value = null
    return
  }
  runDetail.value = await getExecutionRunDetail(selectedRunId.value)
}

const goBack = async () => {
  await router.push({ name: 'tasks' })
}

const openWorkItem = async () => {
  if (!taskDetail.value?.workItemId) {
    return
  }
  await router.push({
    name: 'project-iterations',
    params: { projectId: taskDetail.value.projectId },
    query: { openTaskId: String(taskDetail.value.workItemId) }
  })
}

const handleCancel = async () => {
  if (!taskDetail.value) {
    return
  }
  try {
    await ElMessageBox.confirm(`确认取消执行任务“${taskDetail.value.title}”吗？`, '提示', { type: 'warning' })
    await cancelExecutionTask(taskDetail.value.id)
    ElMessage.success('已提交取消')
    await loadTaskDetail()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '取消失败')
    }
  }
}

const handleRetry = async () => {
  if (!taskDetail.value) {
    return
  }
  try {
    await retryExecutionTask(taskDetail.value.id)
    ElMessage.success('已重新排队')
    await loadTaskDetail()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '重试失败')
  }
}

/**
 * 详情页轮询完整任务与当前运行，确保异步队列执行时用户能看到步骤状态变化。
 */
const startPolling = () => {
  if (typeof window === 'undefined') {
    return
  }
  refreshTimer.value = window.setInterval(() => {
    if (taskDetail.value && ['PENDING', 'RUNNING'].includes(taskDetail.value.status)) {
      void loadTaskDetail()
    }
  }, 5000)
}

onMounted(async () => {
  await loadTaskDetail()
  startPolling()
})

onBeforeUnmount(() => {
  if (refreshTimer.value != null && typeof window !== 'undefined') {
    window.clearInterval(refreshTimer.value)
  }
})
</script>

<style scoped>
.execution-detail-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.execution-detail-hero,
.execution-run-card,
.execution-panel {
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.execution-detail-hero {
  padding: 24px;
}

.execution-back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.18s ease;
}

.execution-back-button .el-icon {
  font-size: 15px;
}

.execution-back-button:hover {
  color: var(--app-primary);
}

.execution-detail-actions :deep(.el-button--success) {
  --el-button-bg-color: var(--app-primary);
  --el-button-border-color: var(--app-primary);
  --el-button-hover-bg-color: var(--app-primary);
  --el-button-hover-border-color: var(--app-primary);
  --el-button-active-bg-color: var(--app-primary);
  --el-button-active-border-color: var(--app-primary);
  transform: none;
}

.execution-detail-actions :deep(.el-button--success:hover),
.execution-detail-actions :deep(.el-button--success:focus),
.execution-detail-actions :deep(.el-button--success:active) {
  transform: none;
}

.execution-detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-top: 14px;
}

.execution-detail-heading h1 {
  margin: 0;
  color: #0f172a;
  font-size: 28px;
  font-weight: 900;
}

.execution-detail-heading p,
.execution-eyebrow {
  color: #64748b;
}

.execution-eyebrow {
  margin: 0 0 6px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.execution-detail-actions,
.execution-detail-meta,
.execution-run-status {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.execution-detail-meta {
  margin-top: 18px;
}

.execution-detail-meta span,
.execution-detail-meta button,
.execution-run-status span {
  border: 0;
  border-radius: 999px;
  padding: 7px 12px;
  background: #f1f5f9;
  color: #475569;
  font-size: 13px;
}

.execution-detail-meta button {
  color: #0f766e;
  cursor: pointer;
  font-weight: 800;
}

.execution-run-card {
  padding: 20px;
}

.execution-run-head,
.execution-artifact-head,
.execution-step-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.execution-run-head h2,
.execution-panel-head h2 {
  margin: 0;
  color: #0f172a;
}

.execution-run-head p,
.execution-panel-head p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.execution-run-status {
  margin-top: 14px;
}

.execution-run-alert {
  margin-top: 14px;
}

.execution-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 16px;
}

.execution-panel {
  padding: 18px;
  min-width: 0;
}

.execution-panel-head {
  margin-bottom: 18px;
}

.execution-step-log {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.execution-step-log-agent,
.execution-artifact-foot {
  color: #64748b;
  font-size: 12px;
}

.execution-step-log-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

pre {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}

.execution-artifact-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.execution-artifact-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.execution-artifact-markdown {
  max-height: 420px;
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
}

.execution-artifact-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 1100px) {
  .execution-detail-grid {
    grid-template-columns: 1fr;
  }

  .execution-detail-heading,
  .execution-run-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
