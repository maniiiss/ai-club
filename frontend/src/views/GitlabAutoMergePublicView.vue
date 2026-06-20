<template>
  <div class="gitlab-public-page">
    <section class="gitlab-public-hero">
      <div class="gitlab-public-hero-copy">
        <h1>{{ pageTitle }}</h1>
      </div>
      <button class="gitlab-public-refresh" type="button" :disabled="logLoading || pipelineLoading" @click="refreshActiveTab">
        <el-icon><Refresh /></el-icon>
        <span>刷新</span>
      </button>
    </section>

    <!-- tab 切换：自动合并日志 / 流水线发布记录；同一 token 即可，无需重新分享 -->
    <nav class="gitlab-public-tab-bar">
      <button
        class="gitlab-public-tab"
        type="button"
        :class="{ active: activeTab === 'auto-merge' }"
        @click="switchTab('auto-merge')"
      >
        自动合并日志
      </button>
      <button
        class="gitlab-public-tab"
        type="button"
        :class="{ active: activeTab === 'pipelines' }"
        @click="switchTab('pipelines')"
      >
        流水线发布记录
      </button>
    </nav>

    <!-- ============ 自动合并日志 tab ============ -->
    <section v-if="activeTab === 'auto-merge'" class="gitlab-public-shell" v-loading="logLoading">
      <div class="gitlab-public-toolbar">
        <label class="gitlab-public-filter">
          <span>结果筛选</span>
          <select v-model="resultFilter" @change="handleFilterChange">
            <option value="">全部</option>
            <option value="MERGED">已合并</option>
            <option value="AI_REJECTED">AI 拒绝</option>
            <option value="FAILED">失败</option>
            <option value="SKIPPED">已跳过</option>
          </select>
        </label>
        <span class="gitlab-public-next-merge">
          下次合并时间：<strong>{{ nextMergeAt || '未设置定时合并' }}</strong>
        </span>
      </div>

      <div v-if="logErrorMessage" class="gitlab-public-error">
        <strong>链接当前不可用</strong>
        <span>{{ logErrorMessage }}</span>
      </div>

      <template v-else>
        <div class="gitlab-public-list">
          <article v-for="item in logs" :key="item.id" class="gitlab-public-card">
            <header class="gitlab-public-card-head">
              <div>
                <h2>{{ item.mergeRequestTitle || `MR !${item.mergeRequestIid || '-'}` }}</h2>
                <p>{{ item.configName }} · {{ formatDateTimeText(item.executedAt) }}</p>
              </div>
              <span class="gitlab-public-result" :class="resultClass(item.result)">{{ resultText(item.result) }}</span>
            </header>
            <p class="gitlab-public-reason">{{ item.reason || '无原因摘要' }}</p>
            <div class="gitlab-public-meta">
              <span>触发：{{ item.triggerType === 'SCHEDULED' ? '定时调度' : '手动执行' }}</span>
              <span>作者：{{ item.mergeRequestAuthorName || item.mergeRequestAuthorUsername || '-' }}</span>
              <a v-if="item.webUrl" :href="item.webUrl" target="_blank" rel="noreferrer">打开 MR</a>
            </div>
            <button class="gitlab-public-detail-button" type="button" @click="openDetail(item)">查看完整详情</button>
          </article>
        </div>

        <div v-if="logTotal > logSize" class="gitlab-public-pagination">
          <button type="button" :disabled="logPage <= 1" @click="changeLogPage(logPage - 1)">上一页</button>
          <span>第 {{ logPage }} / {{ logTotalPages }} 页</span>
          <button type="button" :disabled="logPage >= logTotalPages" @click="changeLogPage(logPage + 1)">下一页</button>
        </div>

        <div v-if="!logs.length" class="gitlab-public-empty">当前条件下暂无自动合并日志。</div>
      </template>
    </section>

    <!-- ============ 流水线发布记录 tab ============ -->
    <section v-else class="gitlab-public-shell" v-loading="pipelineLoading">
      <div v-if="pipelineErrorMessage" class="gitlab-public-error">
        <strong>链接当前不可用</strong>
        <span>{{ pipelineErrorMessage }}</span>
      </div>

      <template v-else-if="!pipelineList.length">
        <div class="gitlab-public-empty">当前项目尚未绑定任何流水线。</div>
      </template>

      <template v-else>
        <div class="gitlab-public-pipeline-shell">
          <!-- 左侧：流水线列表，按 kind 分组（Woodpecker / Jenkins） -->
          <aside class="gitlab-public-pipeline-aside">
            <div v-for="group in groupedPipelines" :key="group.kind" class="gitlab-public-pipeline-group">
              <h3 class="gitlab-public-pipeline-group-title">{{ group.label }}</h3>
              <button
                v-for="pipeline in group.items"
                :key="`${pipeline.kind}-${pipeline.id}`"
                type="button"
                class="gitlab-public-pipeline-item"
                :class="{ active: isActivePipeline(pipeline) }"
                @click="selectPipeline(pipeline)"
              >
                <span class="gitlab-public-pipeline-name">{{ pipeline.name }}</span>
                <span class="gitlab-public-pipeline-meta">
                  <span v-if="pipeline.defaultBranch">{{ pipeline.defaultBranch }}</span>
                  <span v-if="pipeline.lastStatus" :class="['gitlab-public-pipeline-status', statusTone(pipeline.lastStatus)]">{{ pipeline.lastStatus }}</span>
                </span>
              </button>
            </div>
          </aside>

          <!-- 右侧：选中流水线的运行历史表格 -->
          <div class="gitlab-public-pipeline-runs">
            <header class="gitlab-public-pipeline-runs-head">
              <div>
                <h2>{{ selectedPipeline?.name || '-' }}</h2>
                <p>{{ selectedPipeline ? `${kindLabel(selectedPipeline.kind)} · ${selectedPipeline.defaultBranch || '默认分支未设置'}` : '请选择流水线' }}</p>
              </div>
            </header>

            <div v-if="!selectedPipeline" class="gitlab-public-empty">请从左侧选择一条流水线。</div>

            <template v-else>
              <div v-if="runsWarning" class="gitlab-public-inline-error">{{ runsWarning }}</div>

              <table v-else class="gitlab-public-pipeline-table">
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>状态</th>
                    <th>分支</th>
                    <th>事件</th>
                    <th>触发时间</th>
                    <th>外链</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(run, idx) in runs" :key="`${run.runNumber || ''}-${idx}`">
                    <td>{{ run.runNumber ?? '-' }}</td>
                    <td><span :class="['gitlab-public-pipeline-status', statusTone(run.status)]">{{ run.status || '-' }}</span></td>
                    <td>{{ run.branch || '-' }}</td>
                    <td>{{ run.event || '-' }}</td>
                    <td>{{ formatDateTimeText(run.triggeredAt) }}</td>
                    <td>
                      <a v-if="run.runUrl" :href="run.runUrl" target="_blank" rel="noreferrer">打开</a>
                      <span v-else>-</span>
                    </td>
                  </tr>
                  <tr v-if="!runs.length">
                    <td colspan="6" class="gitlab-public-pipeline-empty-row">暂无运行记录</td>
                  </tr>
                </tbody>
              </table>

              <div v-if="!runsWarning && runTotal > runSize" class="gitlab-public-pagination">
                <button type="button" :disabled="runPage <= 1" @click="changeRunPage(runPage - 1)">上一页</button>
                <span>第 {{ runPage }} / {{ runTotalPages }} 页</span>
                <button type="button" :disabled="runPage >= runTotalPages" @click="changeRunPage(runPage + 1)">下一页</button>
              </div>
            </template>
          </div>
        </div>
      </template>
    </section>

    <el-dialog v-model="detailVisible" title="日志详情" width="860px" class="platform-form-dialog gitlab-log-detail-dialog" align-center>
      <div v-if="currentLogDetail" class="gitlab-public-detail-shell">
        <div class="gitlab-public-detail-meta">
          <span>{{ currentLogDetail.configName }}</span>
          <span>{{ formatDateTimeText(currentLogDetail.executedAt) }}</span>
          <span>{{ currentLogDetail.reason || '-' }}</span>
        </div>
        <div class="log-detail-markdown" v-html="detailHtml"></div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import {
  listPublicPipelinesByShare,
  pageProjectAutoMergeLogsByShare,
  pagePublicPipelineRunsByShare,
  type ProjectPublicPipelineItem,
  type ProjectPublicPipelineRunItem
} from '@/api/gitlab'
import type { GitlabAutoMergeLogItem } from '@/types/platform'
import { renderMarkdownToHtml } from '@/utils/markdown'

const route = useRoute()
const projectId = Number(route.params.projectId)
const token = String(route.params.token || '')

/**
 * 默认 tab：当路由里带了 ?tab=pipelines 直接展示流水线发布记录，
 * 否则进入自动合并日志（保持旧链接行为）。
 */
const initialTab = (route.query.tab === 'pipelines' ? 'pipelines' : 'auto-merge') as 'auto-merge' | 'pipelines'
const activeTab = ref<'auto-merge' | 'pipelines'>(initialTab)
const projectName = ref('项目分享')

/** 项目名称加载完成后同步浏览器页签标题，格式：{项目名称}分享 */
watch(projectName, (name) => {
  document.title = `${name}分享`
})

// ===== 自动合并日志 tab 状态 =====
const logLoading = ref(false)
const logErrorMessage = ref('')
const logs = ref<GitlabAutoMergeLogItem[]>([])
const logPage = ref(1)
const logSize = ref(10)
const logTotal = ref(0)
const nextMergeAt = ref<string | null>(null)
const resultFilter = ref('')
const detailVisible = ref(false)
const currentLogDetail = ref<GitlabAutoMergeLogItem | null>(null)

const logTotalPages = computed(() => Math.max(1, Math.ceil(logTotal.value / logSize.value) || 1))
const detailHtml = computed(() => renderMarkdownToHtml(currentLogDetail.value?.detailMarkdown || '无日志详情'))

// ===== 流水线发布记录 tab 状态 =====
const pipelineLoading = ref(false)
const pipelineErrorMessage = ref('')
const pipelineList = ref<ProjectPublicPipelineItem[]>([])
const selectedPipeline = ref<ProjectPublicPipelineItem | null>(null)
const runs = ref<ProjectPublicPipelineRunItem[]>([])
const runPage = ref(1)
const runSize = ref(10)
const runTotal = ref(0)
const runsWarning = ref<string>('')

const runTotalPages = computed(() => Math.max(1, Math.ceil(runTotal.value / runSize.value) || 1))

/**
 * 流水线列表按 kind 分组渲染：Woodpecker（AI Club 内置）置顶，Jenkins 在下，
 * 让访问者一眼看出该项目"对外承诺的发布通道"由哪些来源构成。
 */
const groupedPipelines = computed(() => {
  const groups: Array<{ kind: 'WOODPECKER' | 'JENKINS'; label: string; items: ProjectPublicPipelineItem[] }> = [
    { kind: 'WOODPECKER', label: 'Woodpecker 流水线', items: [] },
    { kind: 'JENKINS', label: 'Jenkins 流水线', items: [] }
  ]
  for (const pipeline of pipelineList.value) {
    const target = groups.find((group) => group.kind === pipeline.kind)
    if (target) target.items.push(pipeline)
  }
  return groups.filter((group) => group.items.length > 0)
})

const pageTitle = computed(() => projectName.value)

const isActivePipeline = (pipeline: ProjectPublicPipelineItem) =>
  selectedPipeline.value?.kind === pipeline.kind && selectedPipeline.value?.id === pipeline.id

const kindLabel = (kind: string) => (kind === 'WOODPECKER' ? 'Woodpecker' : 'Jenkins')

const switchTab = async (tab: 'auto-merge' | 'pipelines') => {
  if (activeTab.value === tab) return
  activeTab.value = tab
  if (tab === 'pipelines' && !pipelineList.value.length && !pipelineErrorMessage.value) {
    await loadPipelines()
  }
}

const loadLogs = async () => {
  if (!Number.isFinite(projectId) || projectId <= 0 || !token) {
    logErrorMessage.value = '链接参数不完整，请联系项目负责人重新发送分享链接。'
    return
  }
  logLoading.value = true
  logErrorMessage.value = ''
  try {
    const response = await pageProjectAutoMergeLogsByShare(projectId, token, {
      page: logPage.value,
      size: logSize.value,
      result: resultFilter.value || undefined
    })
    projectName.value = response.projectName
    logs.value = response.logs.records
    logTotal.value = response.logs.total
    nextMergeAt.value = response.nextMergeAt
  } catch (error: any) {
    logs.value = []
    logTotal.value = 0
    logErrorMessage.value = error?.response?.data?.message || '分享链接不可用，请联系项目负责人刷新链接。'
  } finally {
    logLoading.value = false
  }
}

const loadPipelines = async () => {
  if (!Number.isFinite(projectId) || projectId <= 0 || !token) {
    pipelineErrorMessage.value = '链接参数不完整，请联系项目负责人重新发送分享链接。'
    return
  }
  pipelineLoading.value = true
  pipelineErrorMessage.value = ''
  try {
    pipelineList.value = await listPublicPipelinesByShare(projectId, token)
    if (pipelineList.value.length && !selectedPipeline.value) {
      await selectPipeline(pipelineList.value[0])
    }
  } catch (error: any) {
    pipelineList.value = []
    pipelineErrorMessage.value = error?.response?.data?.message || '分享链接不可用，请联系项目负责人刷新链接。'
  } finally {
    pipelineLoading.value = false
  }
}

const selectPipeline = async (pipeline: ProjectPublicPipelineItem) => {
  selectedPipeline.value = pipeline
  runPage.value = 1
  await loadRuns()
}

const loadRuns = async () => {
  if (!selectedPipeline.value) return
  pipelineLoading.value = true
  runsWarning.value = ''
  try {
    const response = await pagePublicPipelineRunsByShare(projectId, token, {
      kind: selectedPipeline.value.kind,
      pipelineId: selectedPipeline.value.id,
      page: runPage.value,
      size: runSize.value
    })
    runs.value = response.runs.records
    runTotal.value = response.runs.total
    runsWarning.value = response.warning || ''
  } catch (error: any) {
    runs.value = []
    runTotal.value = 0
    runsWarning.value = error?.response?.data?.message || '加载运行历史失败'
  } finally {
    pipelineLoading.value = false
  }
}

const changeLogPage = async (next: number) => {
  logPage.value = next
  await loadLogs()
}

const changeRunPage = async (next: number) => {
  runPage.value = next
  await loadRuns()
}

const handleFilterChange = async () => {
  logPage.value = 1
  await loadLogs()
}

/** 右上角刷新：按当前所在 tab 重新拉取数据。 */
const refreshActiveTab = async () => {
  if (activeTab.value === 'auto-merge') {
    await loadLogs()
  } else if (selectedPipeline.value) {
    // 已选中流水线则刷新其运行历史；否则重新拉流水线列表
    await loadRuns()
  } else {
    await loadPipelines()
  }
}

const openDetail = (item: GitlabAutoMergeLogItem) => {
  currentLogDetail.value = item
  detailVisible.value = true
}

const resultText = (value: string) => {
  if (value === 'MERGED') return '已合并'
  if (value === 'AI_REJECTED') return 'AI 拒绝'
  if (value === 'FAILED') return '失败'
  if (value === 'SKIPPED') return '已跳过'
  if (value === 'EMPTY') return '空执行'
  return value || '未知'
}

const resultClass = (value: string) => {
  if (value === 'MERGED') return 'success'
  if (value === 'FAILED' || value === 'AI_REJECTED') return 'danger'
  if (value === 'EMPTY') return 'neutral'
  return 'warning'
}

/**
 * 把 Woodpecker / Jenkins 各自原生的状态字符串映射成 4 类视觉色：
 * 成功 / 失败 / 运行中 / 中性。Woodpecker: success / failure / running / pending；
 * Jenkins: SUCCESS / FAILURE / UNSTABLE / ABORTED / RUNNING。
 */
const statusTone = (value?: string | null) => {
  if (!value) return 'neutral'
  const normalized = value.toUpperCase()
  if (normalized === 'SUCCESS' || normalized === 'SUCCEEDED') return 'success'
  if (['FAILURE', 'FAILED', 'KILLED', 'ABORTED', 'ERROR'].includes(normalized)) return 'danger'
  if (['RUNNING', 'PENDING', 'STARTED', 'BUILDING'].includes(normalized)) return 'warning'
  return 'neutral'
}

const formatDateTimeText = (value?: string | null) => value || '-'

onMounted(async () => {
  await loadLogs()
  if (logErrorMessage.value) {
    ElMessage.warning(logErrorMessage.value)
  }
  if (activeTab.value === 'pipelines') {
    await loadPipelines()
  }
})
</script>

<style scoped>
.gitlab-public-page {
  box-sizing: border-box;
  height: 100vh;
  overflow-y: auto;
  padding: 36px 24px 64px;
  background: #f7f8fa;
  color: #1f2937;
}

.gitlab-public-hero,
.gitlab-public-shell,
.gitlab-public-tab-bar {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.gitlab-public-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 0 4px;
}

.gitlab-public-hero h1 {
  margin: 6px 0 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.4;
  color: #1f2937;
}

.gitlab-public-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 7px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  font-size: 13px;
}

.gitlab-public-refresh:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.gitlab-public-refresh:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.gitlab-public-next-merge {
  font-size: 13px;
  color: #6b7280;
}

.gitlab-public-next-merge strong {
  color: #1f2937;
  font-weight: 500;
}

.gitlab-public-tab-bar {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  padding: 0 4px;
  border-bottom: 1px solid #e5e7eb;
}

.gitlab-public-tab {
  position: relative;
  padding: 10px 0;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.15s ease;
}

.gitlab-public-tab:hover {
  color: #1f2937;
}

.gitlab-public-tab.active {
  color: #1f2937;
  font-weight: 500;
}

.gitlab-public-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: #1783ff;
  border-radius: 2px;
}

.gitlab-public-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.gitlab-public-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #4b5563;
}

.gitlab-public-filter select {
  min-width: 160px;
  padding: 7px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  color: #1f2937;
}

.gitlab-public-list {
  display: grid;
  gap: 12px;
}

.gitlab-public-card,
.gitlab-public-error,
.gitlab-public-empty {
  padding: 18px 20px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.gitlab-public-empty {
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
  padding: 32px 20px;
}

.gitlab-public-card-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}

.gitlab-public-card-head h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.gitlab-public-card-head p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.gitlab-public-reason,
.gitlab-public-meta {
  margin: 0;
  color: #4b5563;
}

.gitlab-public-result {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  font-weight: 500;
}

.gitlab-public-result.success,
.gitlab-public-pipeline-status.success {
  background: #ecfdf5;
  color: #047857;
}

.gitlab-public-result.danger,
.gitlab-public-pipeline-status.danger {
  background: #fef2f2;
  color: #b91c1c;
}

.gitlab-public-result.warning,
.gitlab-public-pipeline-status.warning {
  background: #fffbeb;
  color: #b45309;
}

.gitlab-public-result.neutral,
.gitlab-public-pipeline-status.neutral {
  background: #f3f4f6;
  color: #4b5563;
}

.gitlab-public-reason {
  margin-top: 12px;
  line-height: 1.7;
  font-size: 14px;
}

.gitlab-public-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 12px;
  font-size: 13px;
}

.gitlab-public-meta a {
  color: #1783ff;
  text-decoration: none;
}

.gitlab-public-meta a:hover {
  text-decoration: underline;
}

.gitlab-public-detail-button {
  margin-top: 14px;
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
  font-size: 13px;
}

.gitlab-public-detail-button:hover {
  background: #f9fafb;
}

.gitlab-public-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  font-size: 13px;
  color: #6b7280;
}

.gitlab-public-pagination button {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
  font-size: 13px;
}

.gitlab-public-pagination button:hover:not(:disabled) {
  background: #f9fafb;
}

.gitlab-public-pagination button:disabled {
  cursor: not-allowed;
  color: #9ca3af;
  background: #f9fafb;
}

.gitlab-public-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 14px;
  color: #6b7280;
  font-size: 13px;
}

/* ===== 流水线发布记录布局 ===== */
.gitlab-public-pipeline-shell {
  display: grid;
  grid-template-columns: minmax(240px, 280px) 1fr;
  gap: 16px;
}

.gitlab-public-pipeline-aside,
.gitlab-public-pipeline-runs {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.gitlab-public-pipeline-group + .gitlab-public-pipeline-group {
  margin-top: 14px;
}

.gitlab-public-pipeline-group-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.gitlab-public-pipeline-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.gitlab-public-pipeline-item:hover {
  background: #f9fafb;
}

.gitlab-public-pipeline-item.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.gitlab-public-pipeline-item.active .gitlab-public-pipeline-name {
  color: #1d4ed8;
}

.gitlab-public-pipeline-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}

.gitlab-public-pipeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.gitlab-public-pipeline-status {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.gitlab-public-pipeline-runs-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
}

.gitlab-public-pipeline-runs-head h2 {
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.gitlab-public-pipeline-runs-head p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.gitlab-public-pipeline-warning {
  padding: 4px 10px;
  border-radius: 6px;
  background: #fffbeb;
  color: #b45309;
  font-size: 12px;
  max-width: 280px;
}

.gitlab-public-inline-error {
  padding: 16px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: #fffbeb;
  color: #b45309;
  font-size: 13px;
  line-height: 1.6;
}

.gitlab-public-pipeline-table {
  width: 100%;
  border-collapse: collapse;
}

.gitlab-public-pipeline-table th,
.gitlab-public-pipeline-table td {
  padding: 10px 8px;
  border-bottom: 1px solid #f3f4f6;
  text-align: left;
  font-size: 13px;
  color: #1f2937;
}

.gitlab-public-pipeline-table th {
  font-weight: 500;
  color: #6b7280;
  background: #fafbfc;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.gitlab-public-pipeline-table a {
  color: #1783ff;
  text-decoration: none;
}

.gitlab-public-pipeline-table a:hover {
  text-decoration: underline;
}

.gitlab-public-pipeline-empty-row {
  text-align: center;
  color: #9ca3af;
  padding: 24px 0;
}

@media (max-width: 768px) {
  .gitlab-public-page {
    padding: 24px 16px 48px;
  }

  .gitlab-public-card-head {
    flex-direction: column;
  }

  .gitlab-public-pipeline-shell {
    grid-template-columns: 1fr;
  }
}
</style>
