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

        <!--
          逐条审查问题反馈：仅展示 "本次新增问题" 和 "当前仍需处理问题" 两个区块里的 issue，
          每条独立提供"分析正确 / 分析错误 + 可选理由"控件，同来源覆盖式提交。
        -->
        <section v-if="detailIssues.length" class="gitlab-public-feedback-panel">
          <header class="gitlab-public-feedback-head">
            <h3>这次 AI 审查准确吗？</h3>
            <p>对下面每一条问题单独打标，理由可选。后续会用作智能体复盘优化。</p>
          </header>
          <ul class="gitlab-public-feedback-list">
            <li v-for="issue in detailIssues" :key="issue.issueId" class="gitlab-public-feedback-item">
              <div class="gitlab-public-feedback-item-head">
                <span class="gitlab-public-feedback-section-tag" :class="`section-${issue.section.toLowerCase()}`">
                  {{ issue.section === 'NEWLY_RAISED' ? '本次新增' : '仍需处理' }}
                </span>
                <p class="gitlab-public-feedback-item-text">{{ issue.text }}</p>
              </div>
              <div class="gitlab-public-feedback-controls">
                <label class="gitlab-public-feedback-radio">
                  <input
                    type="radio"
                    :name="`verdict-${issue.issueId}`"
                    value="CORRECT"
                    :checked="feedbackState[issue.issueId]?.verdict === 'CORRECT'"
                    @change="onVerdictChange(issue.issueId, 'CORRECT')"
                  />
                  <span>分析正确</span>
                </label>
                <label class="gitlab-public-feedback-radio">
                  <input
                    type="radio"
                    :name="`verdict-${issue.issueId}`"
                    value="INCORRECT"
                    :checked="feedbackState[issue.issueId]?.verdict === 'INCORRECT'"
                    @change="onVerdictChange(issue.issueId, 'INCORRECT')"
                  />
                  <span>分析错误</span>
                </label>
                <input
                  type="text"
                  class="gitlab-public-feedback-reason"
                  :placeholder="feedbackState[issue.issueId]?.verdict === 'INCORRECT' ? '请简述错在哪（可选）' : '理由（可选）'"
                  maxlength="2000"
                  :value="feedbackState[issue.issueId]?.reason || ''"
                  @input="onReasonChange(issue.issueId, ($event.target as HTMLInputElement).value)"
                />
                <button
                  type="button"
                  class="gitlab-public-feedback-submit"
                  :disabled="!feedbackState[issue.issueId]?.verdict || feedbackState[issue.issueId]?.submitting"
                  @click="submitFeedback(issue)"
                >
                  {{ feedbackState[issue.issueId]?.persistedId ? '更新反馈' : '提交反馈' }}
                </button>
              </div>
              <p v-if="feedbackState[issue.issueId]?.persistedId" class="gitlab-public-feedback-status">
                您已反馈：{{ feedbackState[issue.issueId]?.verdict === 'CORRECT' ? '分析正确' : '分析错误' }}
                <span v-if="feedbackState[issue.issueId]?.updatedAt">（{{ feedbackState[issue.issueId]?.updatedAt }}）</span>
              </p>
            </li>
          </ul>
        </section>

        <div class="log-detail-markdown" v-html="detailHtml"></div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import {
  listIssueFeedbackByLog,
  listPublicPipelinesByShare,
  pageProjectAutoMergeLogsByShare,
  pagePublicPipelineRunsByShare,
  submitIssueFeedback,
  type ProjectPublicPipelineItem,
  type ProjectPublicPipelineRunItem
} from '@/api/gitlab'
import type {
  GitlabAutoMergeLogItem,
  GitlabAutoMergeLogIssueFeedbackItem
} from '@/types/platform'
import { renderMarkdownToHtml } from '@/utils/markdown'
import { getVisitorFingerprint } from '@/utils/visitorFingerprint'

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

// ===== 逐条审查问题反馈 =====
/** 当前访问者指纹，会话级缓存。 */
const visitorFingerprint = ref<string>('')

/** 详情对话框内解析出的可反馈 issue 列表（仅本次新增 + 当前仍需处理两个区块）。 */
interface DetailIssue {
  issueId: string
  text: string
  section: 'NEWLY_RAISED' | 'PENDING'
}
const detailIssues = ref<DetailIssue[]>([])

/** 每条 issue 的反馈表单状态，key 是 issueId。 */
interface IssueFeedbackState {
  verdict: 'CORRECT' | 'INCORRECT' | null
  reason: string
  submitting: boolean
  persistedId: number | null
  updatedAt: string | null
}
const feedbackState = reactive<Record<string, IssueFeedbackState>>({})

/**
 * 从 markdown 文本里抽取 "### 本次新增问题" 与 "### 当前仍需处理问题" 两个区块下
 * 带 `<!-- issue-id: xxx -->` 注释的 bullet。后端在序列化时为每条 issue 分配了稳定 issueId，
 * 这里按区块和 id 抽取即可。
 */
const parseDetailIssues = (markdown: string): DetailIssue[] => {
  if (!markdown) return []
  const issues: DetailIssue[] = []
  const lines = markdown.split(/\r?\n/)
  let currentSection: 'NEWLY_RAISED' | 'PENDING' | null = null
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('### ')) {
      // 新区块开始，切换 section
      if (line.includes('本次新增问题')) {
        currentSection = 'NEWLY_RAISED'
      } else if (line.includes('当前仍需处理问题')) {
        currentSection = 'PENDING'
      } else {
        currentSection = null
      }
      continue
    }
    if (currentSection && line.startsWith('-')) {
      const match = line.match(/<!--\s*issue-id:\s*([\w-]+)\s*-->/)
      if (!match) continue
      const issueId = match[1]
      // 提取 bullet 文本，去掉前导 -、注释本身
      const text = line.replace(/^-\s*/, '').replace(/<!--\s*issue-id:[^>]+-->/, '').trim()
      if (text) {
        issues.push({ issueId, text, section: currentSection })
      }
    }
  }
  return issues
}

const onVerdictChange = (issueId: string, verdict: 'CORRECT' | 'INCORRECT') => {
  if (!feedbackState[issueId]) {
    feedbackState[issueId] = { verdict, reason: '', submitting: false, persistedId: null, updatedAt: null }
  } else {
    feedbackState[issueId].verdict = verdict
  }
}

const onReasonChange = (issueId: string, reason: string) => {
  if (!feedbackState[issueId]) {
    feedbackState[issueId] = { verdict: null, reason, submitting: false, persistedId: null, updatedAt: null }
  } else {
    feedbackState[issueId].reason = reason
  }
}

const submitFeedback = async (issue: DetailIssue) => {
  if (!currentLogDetail.value) return
  const state = feedbackState[issue.issueId]
  if (!state || !state.verdict) {
    ElMessage.warning('请先选择"分析正确"或"分析错误"')
    return
  }
  if (!visitorFingerprint.value) {
    ElMessage.error('指纹生成失败，无法提交反馈')
    return
  }
  state.submitting = true
  try {
    const saved = await submitIssueFeedback(projectId, token, currentLogDetail.value.id, {
      issueId: issue.issueId,
      verdict: state.verdict,
      reason: state.reason || undefined,
      fingerprint: visitorFingerprint.value,
      section: issue.section
    })
    state.persistedId = saved.id
    state.updatedAt = saved.updatedAt
    ElMessage.success('感谢反馈')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '提交反馈失败')
  } finally {
    state.submitting = false
  }
}

const loadExistingFeedback = async (logId: number) => {
  if (!visitorFingerprint.value) return
  try {
    const list = await listIssueFeedbackByLog(projectId, token, logId, visitorFingerprint.value)
    for (const fb of list) {
      feedbackState[fb.issueId] = {
        verdict: fb.verdict,
        reason: fb.reason || '',
        submitting: false,
        persistedId: fb.id,
        updatedAt: fb.updatedAt
      }
    }
  } catch (error) {
    // 反馈拉取失败不影响主流程，静默处理
    console.warn('加载已有反馈失败', error)
  }
}

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

const openDetail = async (item: GitlabAutoMergeLogItem) => {
  currentLogDetail.value = item
  detailVisible.value = true
  // 清空上次状态，避免不同 log 之间反馈表单残留
  for (const key of Object.keys(feedbackState)) {
    delete feedbackState[key]
  }
  detailIssues.value = parseDetailIssues(item.detailMarkdown || '')
  // 先初始化空状态，再用已有反馈覆盖
  for (const issue of detailIssues.value) {
    feedbackState[issue.issueId] = {
      verdict: null,
      reason: '',
      submitting: false,
      persistedId: null,
      updatedAt: null
    }
  }
  await loadExistingFeedback(item.id)
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
  // 先生成访客指纹，反馈接口需要用到；失败时降级为空字符串（提交反馈会被前端拦截）
  try {
    visitorFingerprint.value = await getVisitorFingerprint()
  } catch (error) {
    console.warn('生成访客指纹失败', error)
    visitorFingerprint.value = ''
  }
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

/* ===== 面板卡片 ===== */
.gitlab-public-feedback-panel {
  margin-bottom: 20px;
  padding: 16px 20px;
  background: #fbfbfd;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.gitlab-public-feedback-head h3 {
  margin: 0 0 2px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.gitlab-public-feedback-head p {
  margin: 0 0 12px;
  font-size: 12px;
  color: #9ca3af;
}

.gitlab-public-feedback-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gitlab-public-feedback-item {
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.gitlab-public-feedback-item-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.gitlab-public-feedback-section-tag {
  flex-shrink: 0;
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  font-weight: 500;
  white-space: nowrap;
}

.gitlab-public-feedback-section-tag.section-newly_raised {
  background: #dbeafe;
  color: #1d4ed8;
}

.gitlab-public-feedback-section-tag.section-pending {
  background: #fef3c7;
  color: #b45309;
}

.gitlab-public-feedback-item-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #374151;
}

.gitlab-public-feedback-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.gitlab-public-feedback-radio {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
}

.gitlab-public-feedback-radio input[type='radio'] {
  margin: 0;
  accent-color: #6366f1;
}

.gitlab-public-feedback-reason {
  flex: 1 1 180px;
  min-width: 120px;
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
  color: #374151;
  background: #fff;
  outline: none;
}

.gitlab-public-feedback-reason:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.gitlab-public-feedback-submit {
  flex-shrink: 0;
  padding: 5px 14px;
  border: 1px solid #6366f1;
  border-radius: 6px;
  background: #6366f1;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}

.gitlab-public-feedback-submit:hover:not(:disabled) {
  background: #4f46e5;
}

.gitlab-public-feedback-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gitlab-public-feedback-status {
  margin: 6px 0 0;
  font-size: 12px;
  color: #6b7280;
}
</style>
