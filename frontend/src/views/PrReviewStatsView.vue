<template>
  <div class="management-list-page pr-review-page">
    <section class="pr-review-hero">
      <div class="pr-review-hero-copy">
        <span class="pr-review-hero-kicker">评审看板</span>
        <h2>PR 评审统计</h2>
      </div>
      <a class="pr-review-oa-link" href="http://192.168.110.251:9000/oa/#/" target="_blank" rel="noreferrer">
        打开 OA 原页面
      </a>
    </section>

    <section class="management-list-toolbar pr-review-toolbar">
      <div class="pr-review-form-grid">
        <label class="pr-review-form-item">
          <span>统计时间</span>
          <el-date-picker
            v-model="form.timeRange"
            type="daterange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            range-separator="至"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </label>
        <label class="pr-review-form-item">
          <span>开发组</span>
          <el-select
            v-model="form.groupId"
            class="pr-review-select"
            filterable
            placeholder="请选择开发组"
            style="width: 100%"
            :loading="groupLoading"
          >
            <el-option
              v-for="item in groupOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </label>
      </div>

      <div class="pr-review-toolbar-actions">
        <el-button :disabled="groupLoading || !canLoadGroups" @click="handleLoadGroups">
          <el-icon><RefreshRight /></el-icon>
          <span>刷新开发组</span>
        </el-button>
        <el-button type="primary" :disabled="loading || !canQuery" @click="handleQuery">
          <el-icon><DataAnalysis /></el-icon>
          <span>开始统计</span>
        </el-button>
      </div>
    </section>

    <section v-if="summary" class="pr-review-metrics">
      <article class="pr-review-metric-card" :class="summary.rejectRateQualified ? 'success' : 'danger'">
        <span class="pr-review-metric-label">PR 打回率</span>
        <strong>{{ formatPercent(summary.rejectRate) }}</strong>
        <small>目标 {{ formatPercent(summary.rejectTargetRate) }} · {{ summary.rejectRateQualified ? '已达标' : '未达标' }}</small>
      </article>
      <article class="pr-review-metric-card">
        <span class="pr-review-metric-label">关闭 PR / 总 PR</span>
        <strong>{{ summary.closedPrCount }} / {{ summary.totalPrCount }}</strong>
        <small>当前开发组已统计的全部 PR 数量</small>
      </article>
      <article class="pr-review-metric-card" :class="summary.allMerged ? 'success' : 'warning'">
        <span class="pr-review-metric-label">开发任务合并情况</span>
        <strong>{{ summary.mergedOrClosedDevelopmentCount }}</strong>
        <small>{{ summary.allMerged ? '开发任务 PR 已全部完成合并或关闭' : `仍有 ${summary.unmergedDevelopmentCount} 个任务未合并` }}</small>
      </article>
      <article class="pr-review-metric-card">
        <span class="pr-review-metric-label">当前开发组</span>
        <strong>{{ summary.groupName }}</strong>
        <small>{{ formatDateRange(summary.startTime, summary.endTime) }}</small>
      </article>
    </section>

    <section class="pr-review-panels" v-loading="loading">
      <article class="pr-review-panel">
        <header class="pr-review-panel-head">
          <div>
            <h3>结果摘要</h3>
          </div>
          <button
            class="management-list-toolbar-button"
            type="button"
            :disabled="!summary?.summaryMarkdown"
            @click="copyText(summary?.summaryMarkdown || '', '统计摘要已复制')"
          >
            <el-icon><DocumentCopy /></el-icon>
            <span>复制摘要</span>
          </button>
        </header>
        <div class="pr-review-panel-body pr-review-summary-body">
          <div v-if="summary" class="pr-review-summary-shell">
            <div class="pr-review-summary-markdown">
              <MdPreview
                editor-id="pr-review-summary-preview"
                language="zh-CN"
                preview-theme="github"
                code-theme="atom"
                :model-value="summary.summaryMarkdown || '-'"
              />
            </div>
          </div>
          <el-empty v-else description="请先选择条件并开始统计" />
        </div>
      </article>

      <article class="pr-review-panel">
        <header class="pr-review-panel-head">
          <div>
            <h3>未合并开发任务</h3>
          </div>
          <button
            class="management-list-toolbar-button"
            type="button"
            :disabled="!summary?.issueBracketSuggestion"
            @click="copyText(summary?.issueBracketSuggestion || '', '任务编号建议已复制')"
          >
            <el-icon><CopyDocument /></el-icon>
            <span>复制任务编号建议</span>
          </button>
        </header>
        <div class="pr-review-panel-body pr-review-pending-body">
          <template v-if="summary && summary.pendingTaskGroups.length">
            <div class="pr-review-pending-groups">
              <article v-for="group in summary.pendingTaskGroups" :key="group.assigneeRemark" class="pr-review-pending-card">
                <div class="pr-review-pending-card-head">
                  <div>
                    <strong>{{ group.assigneeRemark }}</strong>
                    <span>{{ group.count }} 个任务待合并</span>
                  </div>
                  <button
                    class="management-list-row-button pr-review-inline-copy"
                    type="button"
                    :disabled="!group.issueBracketText"
                    @click="copyText(group.issueBracketText, `${group.assigneeRemark} 的任务编号已复制`)"
                  >
                    <el-icon><CopyDocument /></el-icon>
                  </button>
                </div>
                <code class="pr-review-issue-code">{{ group.issueBracketText || '暂无可复制任务号' }}</code>
                <ul class="pr-review-task-list">
                  <li v-for="task in group.tasks" :key="`${group.assigneeRemark}-${task.ident}`">
                    <span class="pr-review-task-ident">{{ task.ident }}</span>
                    <div class="pr-review-task-copy">
                      <strong>{{ task.title }}</strong>
                      <small>{{ task.projectName || '未识别项目' }} · {{ task.prState || '未知状态' }}</small>
                    </div>
                  </li>
                </ul>
              </article>
            </div>
          </template>
          <el-empty v-else-if="summary" description="当前开发组的开发任务已经全部完成合并" />
          <el-empty v-else description="暂无统计结果" />
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MdPreview } from 'md-editor-v3'
import { CopyDocument, DataAnalysis, DocumentCopy, RefreshRight } from '@element-plus/icons-vue'
import { getPrReviewStatsConfig, listPrReviewStatsGroups, queryPrReviewStats } from '@/api/pr-review'
import type { PrReviewStatsGroupItem, PrReviewStatsSummaryItem } from '@/types/platform'

const form = reactive({
  timeRange: [] as string[],
  groupId: null as number | null
})

const loading = ref(false)
const groupLoading = ref(false)
const summary = ref<PrReviewStatsSummaryItem | null>(null)
const groupOptions = ref<PrReviewStatsGroupItem[]>([])

const canLoadGroups = computed(() => form.timeRange.length === 2)
const canQuery = computed(() => canLoadGroups.value && form.groupId !== null)

const handleLoadGroups = async () => {
  if (!canLoadGroups.value) {
    ElMessage.warning('请先选择统计时间')
    return
  }
  groupLoading.value = true
  try {
    groupOptions.value = await listPrReviewStatsGroups({
      startTime: form.timeRange[0],
      endTime: form.timeRange[1]
    })
    if (groupOptions.value.length && !groupOptions.value.some((item) => item.id === form.groupId)) {
      form.groupId = groupOptions.value[0].id
    }
  } finally {
    groupLoading.value = false
  }
}

const handleQuery = async () => {
  if (!canQuery.value || form.groupId === null) {
    ElMessage.warning('请先选择开发组后再开始统计')
    return
  }
  const selectedGroup = groupOptions.value.find((item) => item.id === form.groupId)
  loading.value = true
  try {
    summary.value = await queryPrReviewStats({
      startTime: form.timeRange[0],
      endTime: form.timeRange[1],
      groupId: form.groupId,
      groupName: selectedGroup?.name || ''
    })
  } finally {
    loading.value = false
  }
}

const copyText = async (text: string, successMessage: string) => {
  if (!text) {
    ElMessage.warning('当前没有可复制内容')
    return
  }
  await navigator.clipboard.writeText(text)
  ElMessage.success(successMessage)
}

const formatPercent = (value: number) => `${value.toFixed(2)}%`
const formatDateOnly = (value: string) => value?.slice(0, 10) || value
const formatDateRange = (startTime: string, endTime: string) => `${formatDateOnly(startTime)} 至 ${formatDateOnly(endTime)}`

onMounted(async () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const formatDate = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  form.timeRange = [formatDate(firstDay), formatDate(lastDay)]

  const config = await getPrReviewStatsConfig({
    startTime: form.timeRange[0],
    endTime: form.timeRange[1]
  })
  groupOptions.value = config.groups
  const matchedGroup = config.groups.find((item) => item.name === config.defaultDevGroupName)
  form.groupId = matchedGroup?.id ?? config.groups[0]?.id ?? null

  if (canQuery.value) {
    await handleQuery()
  }
})
</script>

<style scoped>
.pr-review-page {
  height: calc(100vh - 104px);
  min-height: 0;
  gap: 14px;
  overflow: hidden;
}

.pr-review-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 18px;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.28), transparent 36%),
    linear-gradient(135deg, #0f766e, #14532d 68%, #1d4ed8);
  color: #f8fffd;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.pr-review-hero-kicker {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 10px;
  letter-spacing: 0.06em;
}

.pr-review-hero h2 {
  margin: 6px 0 0;
  font-size: 22px;
  line-height: 1.1;
}

.pr-review-oa-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 116px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.16);
  color: #f8fffd;
  text-decoration: none;
  font-size: 12px;
  transition: transform 0.2s ease, background 0.2s ease;
}

.pr-review-oa-link:hover {
  background: rgba(255, 255, 255, 0.24);
  transform: translateY(-1px);
}

.pr-review-toolbar {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.pr-review-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 12px;
}

.pr-review-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #1f2937;
  font-size: 12px;
  font-weight: 600;
}

.pr-review-toolbar-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.pr-review-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.pr-review-metric-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
}

.pr-review-metric-card.success {
  background: linear-gradient(180deg, #ecfdf5, #f0fdf4);
}

.pr-review-metric-card.warning {
  background: linear-gradient(180deg, #fffbeb, #fff7ed);
}

.pr-review-metric-card.danger {
  background: linear-gradient(180deg, #fef2f2, #fff7ed);
}

.pr-review-metric-label {
  font-size: 11px;
  color: #64748b;
}

.pr-review-metric-card strong {
  font-size: 20px;
  line-height: 1.1;
  color: #0f172a;
}

.pr-review-metric-card small {
  font-size: 11px;
  color: #475569;
}

.pr-review-panels {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: 1.05fr 1.15fr;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
}

.pr-review-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  padding: 24px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.pr-review-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.pr-review-panel-head h3 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #0f172a;
}

.pr-review-panel-head p {
  margin: 0;
  color: #64748b;
  line-height: 1.6;
}

.pr-review-summary-shell {
  flex: 1;
  min-height: 0;
}

.pr-review-panel-body {
  flex: 1 1 auto;
  min-height: 0;
}

.pr-review-summary-body,
.pr-review-pending-body {
  overflow-x: hidden;
  overflow-y: auto;
}

.pr-review-summary-markdown {
  min-height: 100%;
  padding: 14px 16px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.pr-review-summary-markdown :deep(.md-editor-previewOnly) {
  padding: 0;
  background: transparent;
}

.pr-review-summary-markdown :deep(.md-editor-preview) {
  font-size: 13px;
  line-height: 1.7;
  color: #1f2937;
}

.pr-review-summary-markdown :deep(.md-editor-preview h1),
.pr-review-summary-markdown :deep(.md-editor-preview h2),
.pr-review-summary-markdown :deep(.md-editor-preview h3),
.pr-review-summary-markdown :deep(.md-editor-preview h4) {
  margin-top: 0;
}

.pr-review-summary-markdown :deep(.md-editor-preview p:last-child),
.pr-review-summary-markdown :deep(.md-editor-preview ul:last-child),
.pr-review-summary-markdown :deep(.md-editor-preview ol:last-child) {
  margin-bottom: 0;
}

.pr-review-pending-groups {
  display: grid;
  gap: 16px;
}

.pr-review-pending-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 22px;
  background: linear-gradient(180deg, #f8fafc, #ffffff);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.pr-review-pending-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.pr-review-pending-card-head strong {
  display: block;
  color: #0f172a;
  font-size: 16px;
}

.pr-review-pending-card-head span {
  color: #64748b;
  font-size: 13px;
}

.pr-review-inline-copy {
  width: 36px;
  height: 36px;
}

.pr-review-issue-code {
  display: block;
  padding: 12px 14px;
  border-radius: 14px;
  background: #eff6ff;
  color: #1d4ed8;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  word-break: break-all;
}

.pr-review-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pr-review-task-list li {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 12px;
  align-items: flex-start;
}

.pr-review-task-ident {
  display: inline-flex;
  justify-content: center;
  padding: 8px 10px;
  border-radius: 12px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.pr-review-task-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pr-review-task-copy strong {
  color: #0f172a;
  font-size: 14px;
}

.pr-review-task-copy small {
  color: #64748b;
  line-height: 1.5;
}

@media (max-width: 1100px) {
  .pr-review-form-grid,
  .pr-review-metrics,
  .pr-review-panels {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .pr-review-page {
    height: auto;
    overflow: visible;
  }

  .pr-review-hero,
  .pr-review-panel-head,
  .pr-review-toolbar-actions {
    flex-direction: column;
  }

  .pr-review-form-grid,
  .pr-review-metrics,
  .pr-review-panels {
    grid-template-columns: 1fr;
  }

  .pr-review-panels,
  .pr-review-panel,
  .pr-review-summary-body,
  .pr-review-pending-body {
    overflow: visible;
  }

  .pr-review-toolbar-actions :deep(.el-button) {
    width: 100%;
  }

  .pr-review-task-list li {
    grid-template-columns: 1fr;
  }
}
</style>
