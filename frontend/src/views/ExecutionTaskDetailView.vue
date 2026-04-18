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
          <el-button v-if="canSubmitMergeRequest" type="success" @click="openQuickMergeDialog">提交MR</el-button>
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

      <div v-if="developmentRepositories.length" class="execution-detail-repo-strip">
        <span class="execution-detail-repo-label">涉及仓库</span>
        <a
          v-for="repository in developmentRepositories"
          :key="`${repository.bindingId}-${repository.order}`"
          class="execution-detail-repo-chip"
          :href="repository.webUrl || undefined"
          target="_blank"
          rel="noreferrer"
        >
          {{ repository.order }}. {{ repository.displayName }} @ {{ repository.targetBranch || '-' }}
        </a>
      </div>
    </section>

    <template v-if="taskDetail">
      <section class="execution-run-card">
        <div class="execution-run-head">
          <div>
            <h2>运行进度</h2>
            <p>{{ runCardDescription }}</p>
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
            <span>流式：{{ runDetail.hasLiveStream ? '已启用' : '历史快照' }}</span>
            <span>最后事件：{{ runDetail.lastEventAt || '-' }}</span>
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
          <div class="execution-panel-body">
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
                <div class="execution-step-live-meta">
                  <span>当前命令：{{ step.currentCommand || '-' }}</span>
                  <span>最后事件：{{ step.lastEventAt || '-' }}</span>
                  <span>最近心跳：{{ step.lastHeartbeatAt || '-' }}</span>
                </div>
                <div v-if="step.tailLogText" class="execution-step-tail">
                  <div class="execution-step-tail-head">
                    <strong>最近尾日志</strong>
                    <span>{{ step.tailLogLineCount || 0 }} 行</span>
                  </div>
                  <pre>{{ step.tailLogText }}</pre>
                </div>
                <el-collapse>
                  <el-collapse-item title="输入快照">
                    <pre>{{ previewLongText(step.inputSnapshot) }}</pre>
                  </el-collapse-item>
                  <el-collapse-item title="输出快照">
                    <pre>{{ previewLongText(step.outputSnapshot || step.errorMessage || '-') }}</pre>
                  </el-collapse-item>
                </el-collapse>
              </div>
            </el-timeline-item>
            </el-timeline>
          </div>
        </article>

        <article class="execution-panel">
          <div class="execution-panel-head">
            <h2>执行产物</h2>
          </div>
          <div class="execution-panel-body">
            <div v-if="displayArtifacts.length" class="execution-artifact-list">
              <section
                v-for="artifact in displayArtifacts"
                :key="artifact.key"
                class="execution-artifact-card"
                :class="{ 'execution-artifact-card-install': isInstallationDisplayArtifact(artifact) }"
              >
                <div class="execution-artifact-head">
                  <div class="execution-artifact-title-block">
                    <span v-if="isInstallationDisplayArtifact(artifact)" class="execution-artifact-step-badge">安装步骤</span>
                    <span v-if="displayArtifactStepLabel(artifact)" class="execution-artifact-step-name">{{ displayArtifactStepLabel(artifact) }}</span>
                    <strong>{{ displayArtifactTitle(artifact) }}</strong>
                  </div>
                </div>
                <div v-if="isDisplayArtifactMarkdown(artifact)" class="execution-artifact-markdown">
                  <MdPreview
                    :editor-id="`execution-artifact-preview-${artifact.key}`"
                    language="zh-CN"
                    preview-theme="github"
                    :model-value="displayArtifactText(artifact) || '-'"
                  />
                </div>
                <template v-else-if="isDisplayArtifactLog(artifact)">
                  <div class="execution-artifact-log-toggle">
                    <div class="execution-artifact-log-hint">日志预览默认收起，展开后仅展示尾部内容，完整日志请下载。</div>
                    <button
                      type="button"
                      class="execution-artifact-toggle-button"
                      :aria-label="isDisplayArtifactExpanded(artifact) ? '收起日志预览' : '展开日志预览'"
                      :title="isDisplayArtifactExpanded(artifact) ? '收起日志预览' : '展开日志预览'"
                      @click="toggleDisplayArtifactPreview(artifact)"
                    >
                      <el-icon>
                        <ArrowDown v-if="isDisplayArtifactExpanded(artifact)" />
                        <ArrowRight v-else />
                      </el-icon>
                    </button>
                  </div>
                  <div v-if="isDisplayArtifactExpanded(artifact)" class="execution-artifact-log-group">
                    <section
                      v-for="logArtifact in artifact.items"
                      :key="logArtifact.id"
                      class="execution-artifact-log-entry"
                    >
                      <div class="execution-artifact-log-entry-head">
                        <div class="execution-artifact-log-entry-title">
                          <span v-if="artifactStepLabel(logArtifact)" class="execution-artifact-step-name">
                            {{ artifactStepLabel(logArtifact) }}
                          </span>
                          <strong>{{ logArtifact.title }}</strong>
                        </div>
                        <el-link
                          v-if="logArtifact.contentRef"
                          type="primary"
                          @click.prevent="handleArtifactDownload(logArtifact)"
                        >
                          下载产物
                        </el-link>
                      </div>
                      <pre>{{ previewLongText(logArtifact.contentText || '-', 3000) }}</pre>
                    </section>
                  </div>
                </template>
                <pre v-else>{{ previewLongText(displayArtifactText(artifact) || '-') }}</pre>
                <div v-if="!isDisplayArtifactLog(artifact)" class="execution-artifact-foot">
                  <span v-if="displayArtifactWriteback(artifact)">已回写工作项</span>
                  <el-link v-if="displayArtifactContentRef(artifact)" type="primary" @click.prevent="handleDisplayArtifactDownload(artifact)">下载产物</el-link>
                </div>
              </section>
            </div>
            <el-empty v-else description="暂无产物" />
          </div>
        </article>
      </section>
    </template>

    <el-empty v-else-if="!loading" description="执行任务不存在或无权访问" />

    <el-dialog v-model="quickMergeDialogVisible" title="快速提交 MR" width="720px" class="platform-form-dialog" align-center>
      <el-form ref="quickMergeFormRef" :model="quickMergeForm" :rules="quickMergeRules" label-position="top" class="platform-form-layout">
        <el-form-item label="仓库" prop="bindingId">
          <el-select v-model="quickMergeForm.bindingId" placeholder="请选择需要提交 MR 的仓库" style="width: 100%">
            <el-option
              v-for="repository in developmentQuickMergeRepositories"
              :key="repository.bindingId"
              :label="`${repository.order}. ${repository.displayName}`"
              :value="repository.bindingId"
            />
          </el-select>
          <div class="form-tip">仅展示本次开发执行中实际参与的仓库，目标分支会按执行任务自动带入。</div>
        </el-form-item>
        <div class="execution-quick-merge-auth-card" :class="{ connected: !quickMergeSubmitDisabledReason }">
          <div class="execution-quick-merge-auth-title">GitLab 发起身份</div>
          <div class="execution-quick-merge-auth-text">{{ quickMergeActorDisplay }}</div>
          <div v-if="quickMergeSubmitDisabledReason" class="execution-quick-merge-auth-warning">{{ quickMergeSubmitDisabledReason }}</div>
          <div v-if="currentQuickMergeRepository?.mergeRequestUrl" class="execution-quick-merge-auth-link">
            <el-link :href="currentQuickMergeRepository.mergeRequestUrl" target="_blank" type="primary">打开当前步骤已返回的 MR 链接</el-link>
          </div>
          <div v-if="quickMergeSubmitDisabledReason" class="execution-quick-merge-auth-link">
            <el-button link type="primary" @click="router.push('/profile')">前往个人中心绑定</el-button>
          </div>
        </div>
        <el-form-item label="源分支" prop="sourceBranch">
          <el-select
            v-model="quickMergeForm.sourceBranch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索源分支"
            style="width: 100%"
            :remote-method="handleQuickMergeSourceSearch"
            :loading="sourceBranchLoading"
          >
            <el-option
              v-for="branch in quickMergeSourceBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
          <div v-if="currentQuickMergeRepository?.sourceBranch" class="form-tip">已自动带入开发执行产出的工作分支，可按需修改。</div>
        </el-form-item>
        <el-form-item label="目标分支" prop="targetBranch">
          <el-select
            v-model="quickMergeForm.targetBranch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索目标分支"
            style="width: 100%"
            :remote-method="handleQuickMergeTargetSearch"
            :loading="targetBranchLoading"
          >
            <el-option
              v-for="branch in quickMergeTargetBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="MR 标题" prop="title">
          <el-input v-model="quickMergeForm.title" placeholder="请输入本次合并请求标题" />
        </el-form-item>
        <el-form-item label="MR 描述">
          <el-input v-model="quickMergeForm.description" type="textarea" :rows="4" placeholder="可选，补充本次 MR 的背景、变更点或注意事项" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="quickMergeDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="quickMergeSubmitting" :disabled="Boolean(quickMergeSubmitDisabledReason)" @click="handleQuickMergeSubmit">
            创建 MR
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="quickMergeResultVisible" title="MR 创建结果" width="720px">
      <template v-if="quickMergeResult">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="项目">{{ quickMergeResult.projectName }}</el-descriptions-item>
          <el-descriptions-item label="仓库">{{ quickMergeResult.projectRef }}</el-descriptions-item>
          <el-descriptions-item label="MR IID">!{{ quickMergeResult.iid }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ quickMergeResult.state }}</el-descriptions-item>
          <el-descriptions-item label="源分支">{{ quickMergeResult.sourceBranch }}</el-descriptions-item>
          <el-descriptions-item label="目标分支">{{ quickMergeResult.targetBranch }}</el-descriptions-item>
          <el-descriptions-item label="发起人">{{ quickMergeResult.actorName || quickMergeResult.actorUsername || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ quickMergeResult.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="标题" :span="2">{{ quickMergeResult.title }}</el-descriptions-item>
        </el-descriptions>
        <div class="execution-quick-merge-result-link">
          <el-link v-if="quickMergeResult.webUrl" :href="quickMergeResult.webUrl" target="_blank" type="primary">打开 GitLab MR</el-link>
        </div>
      </template>
      <template #footer>
        <el-button @click="quickMergeResultVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { MdPreview } from 'md-editor-v3'
import {
  createGitlabMergeRequest,
  getCurrentUserGitlabOauthBinding,
  listGitlabBindingOptions,
  listGitlabBranches
} from '@/api/gitlab'
import {
  cancelExecutionTask,
  downloadExecutionArtifact,
  getExecutionArtifactDetail,
  getExecutionRunDetail,
  getExecutionTaskDetail,
  retryExecutionTask,
  streamExecutionRunEvents
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type {
  ExecutionArtifactItem,
  ExecutionRunDetailItem,
  ExecutionStepItem,
  ExecutionStreamEvent,
  ExecutionTaskDetailItem,
  GitlabBranchItem,
  GitlabCreateMergeRequestResultItem,
  GitlabUserOauthBindingItem,
  ProjectGitlabBindingItem
} from '@/types/platform'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const taskDetail = ref<ExecutionTaskDetailItem | null>(null)
const runDetail = ref<ExecutionRunDetailItem | null>(null)
const selectedRunId = ref<number | null>(null)
const gitlabBindingOptions = ref<ProjectGitlabBindingItem[]>([])
const runStreamController = ref<{ abort: () => void } | null>(null)
const runStreamReconnectTimer = ref<number | null>(null)
const snapshotRefreshTimer = ref<number | null>(null)
const streamLastEventId = ref<number>(0)
const artifactHydrationRetryTimers = new Map<number, number>()
const expandedArtifactPreviewMap = ref<Record<string, boolean>>({})
const quickMergeDialogVisible = ref(false)
const quickMergeResultVisible = ref(false)
const quickMergeSubmitting = ref(false)
const quickMergeFormRef = ref<FormInstance>()
const quickMergeOauthBinding = ref<GitlabUserOauthBindingItem>(fallbackQuickMergeOauthBinding())
const quickMergeSourceBranchOptions = ref<GitlabBranchItem[]>([])
const quickMergeTargetBranchOptions = ref<GitlabBranchItem[]>([])
const sourceBranchLoading = ref(false)
const targetBranchLoading = ref(false)
const quickMergeResult = ref<GitlabCreateMergeRequestResultItem | null>(null)

type DisplayArtifactItem =
  | { key: string; kind: 'artifact'; artifact: ExecutionArtifactItem }
  | { key: string; kind: 'log-group'; items: ExecutionArtifactItem[] }

interface QuickMergeForm {
  bindingId: number | null
  sourceBranch: string
  targetBranch: string
  title: string
  description: string
}

interface DevelopmentQuickMergeRepository {
  order: number
  bindingId: number
  displayName: string
  targetBranch: string
  webUrl: string | null
  sourceBranch: string
  mergeRequestUrl: string | null
}

interface ImplementationArtifactState {
  workBranch: string
  mergeRequestUrl: string | null
}

const quickMergeForm = reactive<QuickMergeForm>({
  bindingId: null,
  sourceBranch: '',
  targetBranch: '',
  title: '',
  description: ''
})

const executionTaskId = computed(() => Number(route.params.executionTaskId))
const canCancelExecution = computed(() => authStore.hasPermission('task:execution:cancel'))
const canRetryExecution = computed(() => authStore.hasPermission('task:execution:retry'))
const canManageGitlab = computed(() => authStore.hasPermission('gitlab:manage'))
const quickMergeRules: FormRules<QuickMergeForm> = {
  bindingId: [{ required: true, message: '请选择仓库', trigger: 'change' }],
  sourceBranch: [{ required: true, message: '请选择源分支', trigger: 'change' }],
  targetBranch: [{ required: true, message: '请选择目标分支', trigger: 'change' }],
  title: [{ required: true, message: '请输入 MR 标题', trigger: 'blur' }]
}
const runCardDescription = computed(() =>
  taskDetail.value?.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION'
    ? '当前运行会先加载快照，再通过事件流持续刷新；规划、开发、测试和报告都会沉淀为执行产物。'
    : '当前运行会先加载快照，再通过事件流持续刷新，最终结果会沉淀为产物并回写工作项评论。'
)
const parsedInputPayload = computed<Record<string, any>>(() => {
  if (!taskDetail.value?.inputPayload) {
    return {}
  }
  try {
    return JSON.parse(taskDetail.value.inputPayload)
  } catch (error) {
    return {}
  }
})
const bindingOptionMap = computed(() => {
  const map = new Map<number, ProjectGitlabBindingItem>()
  for (const binding of gitlabBindingOptions.value) {
    if (binding.projectId === taskDetail.value?.projectId) {
      map.set(binding.id, binding)
    }
  }
  return map
})
const developmentRepositories = computed(() => {
  const repositories = Array.isArray(parsedInputPayload.value.repositories) ? parsedInputPayload.value.repositories : []
  return repositories.map((repository: any, index: number) => {
    const bindingId = Number(repository?.bindingId || 0)
    const binding = bindingOptionMap.value.get(bindingId)
    return {
      order: index + 1,
      bindingId,
      displayName: binding?.gitlabProjectPath || binding?.gitlabProjectRef || `GitLab 绑定 #${bindingId || '-'}`,
      targetBranch: String(repository?.targetBranch || ''),
      webUrl: binding?.gitlabProjectWebUrl || null
    }
  })
})

/**
 * 开发实现步骤会把 workBranch / MR 链接写回 JSON 产物，这里按仓库名提取出来，
 * 供右上角“提交MR”弹窗自动带入源分支，减少用户手工查找。
 */
const implementationArtifactStateMap = computed(() => {
  const map = new Map<string, ImplementationArtifactState>()
  for (const artifact of runDetail.value?.artifacts || []) {
    if (artifact.artifactType !== 'IMPLEMENT_RESULT_JSON') {
      continue
    }
    const repositoryDisplayName = extractRepositoryDisplayNameFromStepName(artifactStepLabel(artifact))
    if (!repositoryDisplayName) {
      continue
    }
    map.set(repositoryDisplayName, parseImplementationArtifactState(artifact.contentText))
  }
  return map
})

const developmentQuickMergeRepositories = computed<DevelopmentQuickMergeRepository[]>(() =>
  developmentRepositories.value.map((repository) => ({
    ...repository,
    sourceBranch: implementationArtifactStateMap.value.get(repository.displayName)?.workBranch || '',
    mergeRequestUrl: implementationArtifactStateMap.value.get(repository.displayName)?.mergeRequestUrl || null
  }))
)

const currentQuickMergeRepository = computed(() =>
  developmentQuickMergeRepositories.value.find((repository) => repository.bindingId === quickMergeForm.bindingId) || null
)
const currentQuickMergeBinding = computed(() =>
  quickMergeForm.bindingId == null ? null : bindingOptionMap.value.get(quickMergeForm.bindingId) || null
)
const quickMergeBindingSupportsOauth = computed(() => {
  if (!currentQuickMergeBinding.value) {
    return false
  }
  return currentQuickMergeBinding.value.apiBaseUrl === quickMergeOauthBinding.value.apiBaseUrl
})
const quickMergeActorDisplay = computed(() => {
  if (!quickMergeOauthBinding.value.connected) {
    return '当前尚未绑定 GitLab 用户身份'
  }
  const actorName = quickMergeOauthBinding.value.gitlabName || '-'
  const actorUsername = quickMergeOauthBinding.value.gitlabUsername || '-'
  return `将以 ${actorName}（${actorUsername}）身份发起`
})
const quickMergeSubmitDisabledReason = computed(() => {
  if (!currentQuickMergeRepository.value) {
    return '请先选择仓库'
  }
  if (!quickMergeBindingSupportsOauth.value) {
    return '当前仓库实例暂不支持使用个人 GitLab 授权发起 MR'
  }
  if (!quickMergeOauthBinding.value.connected) {
    return '当前用户尚未绑定 GitLab 账户，请先前往个人中心完成授权'
  }
  return ''
})
const canSubmitMergeRequest = computed(() =>
  Boolean(
    canManageGitlab.value
      && taskDetail.value?.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION'
      && runDetail.value?.status === 'SUCCESS'
      && developmentQuickMergeRepositories.value.length
  )
)

const displayArtifacts = computed<DisplayArtifactItem[]>(() => {
  const artifacts = runDetail.value?.artifacts || []
  const normalArtifacts: DisplayArtifactItem[] = []
  const logArtifacts: ExecutionArtifactItem[] = []
  for (const artifact of artifacts) {
    if (isLogArtifact(artifact)) {
      logArtifacts.push(artifact)
      continue
    }
    normalArtifacts.push({ key: `artifact-${artifact.id}`, kind: 'artifact', artifact })
  }
  if (logArtifacts.length) {
    normalArtifacts.push({ key: 'log-group', kind: 'log-group', items: logArtifacts })
  }
  return normalArtifacts
})

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

const isMarkdownArtifact = (artifact: ExecutionArtifactItem) =>
  ['PLAN_MARKDOWN', 'REPORT_MARKDOWN', 'FIX_PLAN_MARKDOWN', 'FIX_SHARDS_MARKDOWN', 'EXEC_PLAN_MARKDOWN'].includes(artifact.artifactType)

const isLogArtifact = (artifact: ExecutionArtifactItem) =>
  ['STEP_RAW_LOG', 'STEP_STDOUT_LOG', 'STEP_STDERR_LOG'].includes(artifact.artifactType) || artifact.artifactType.endsWith('_LOG')

const findArtifactStep = (artifact: ExecutionArtifactItem) =>
  runDetail.value?.steps.find((step) => step.id === artifact.stepId) || null

const artifactStepLabel = (artifact: ExecutionArtifactItem) => findArtifactStep(artifact)?.stepName || ''

const extractRepositoryDisplayNameFromStepName = (stepName: string | null | undefined) => {
  const normalized = String(stepName || '').trim()
  if (!normalized) {
    return ''
  }
  const separatorIndex = normalized.indexOf('·')
  if (separatorIndex >= 0) {
    return normalized.slice(separatorIndex + 1).trim()
  }
  return normalized.replace(/^开发实现/, '').trim()
}

const parseImplementationArtifactState = (contentText: string | null | undefined): ImplementationArtifactState => {
  try {
    const parsed = JSON.parse(String(contentText || '{}'))
    const workBranch = String(parsed?.workBranch || '').trim()
    const mergeRequestUrl = String(parsed?.mergeRequestUrl || '').trim()
    return {
      workBranch,
      mergeRequestUrl: mergeRequestUrl || null
    }
  } catch (error) {
    return { workBranch: '', mergeRequestUrl: null }
  }
}

/**
 * 安装相关产物需要在列表中更容易被识别，这里统一按步骤名关键词做高亮归类。
 */
const isInstallationArtifact = (artifact: ExecutionArtifactItem) => {
  const stepName = artifactStepLabel(artifact).toLowerCase()
  return ['安装', 'install', '依赖', '部署环境', '环境准备', 'setup'].some((keyword) => stepName.includes(keyword.toLowerCase()))
}

const isDisplayArtifactLog = (artifact: DisplayArtifactItem) => artifact.kind === 'log-group'

const isDisplayArtifactMarkdown = (artifact: DisplayArtifactItem) =>
  artifact.kind === 'artifact' && isMarkdownArtifact(artifact.artifact)

const displayArtifactTitle = (artifact: DisplayArtifactItem) => (artifact.kind === 'artifact' ? artifact.artifact.title : '日志')

const displayArtifactText = (artifact: DisplayArtifactItem) => (artifact.kind === 'artifact' ? artifact.artifact.contentText : '')

const displayArtifactStepLabel = (artifact: DisplayArtifactItem) =>
  artifact.kind === 'artifact' ? artifactStepLabel(artifact.artifact) : '已合并多个日志产物'

const displayArtifactWriteback = (artifact: DisplayArtifactItem) =>
  artifact.kind === 'artifact' ? artifact.artifact.workItemWriteback : false

const displayArtifactContentRef = (artifact: DisplayArtifactItem) =>
  artifact.kind === 'artifact' ? artifact.artifact.contentRef : null

const isInstallationDisplayArtifact = (artifact: DisplayArtifactItem) =>
  artifact.kind === 'artifact' ? isInstallationArtifact(artifact.artifact) : false

const displayArtifactExpandKey = (artifact: DisplayArtifactItem) =>
  artifact.kind === 'artifact' ? `artifact-${artifact.artifact.id}` : artifact.key

const isDisplayArtifactExpanded = (artifact: DisplayArtifactItem) =>
  !isDisplayArtifactLog(artifact) || Boolean(expandedArtifactPreviewMap.value[displayArtifactExpandKey(artifact)])

const toggleArtifactPreview = (artifactId: number) => {
  expandedArtifactPreviewMap.value = {
    ...expandedArtifactPreviewMap.value,
    [`artifact-${artifactId}`]: !expandedArtifactPreviewMap.value[`artifact-${artifactId}`]
  }
}

const toggleDisplayArtifactPreview = (artifact: DisplayArtifactItem) => {
  const key = displayArtifactExpandKey(artifact)
  expandedArtifactPreviewMap.value = {
    ...expandedArtifactPreviewMap.value,
    [key]: !expandedArtifactPreviewMap.value[key]
  }
}

const isTerminalRunStatus = (status: string | null | undefined) =>
  ['SUCCESS', 'FAILED', 'CANCELED'].includes(String(status || '').toUpperCase())

const previewLongText = (text: string | null | undefined, maxChars = 6000) => {
  const normalized = String(text || '').trim()
  if (!normalized) {
    return '-'
  }
  if (normalized.length <= maxChars) {
    return normalized
  }
  return `${normalized.slice(0, maxChars)}\n\n... 内容较长，已截断预览，请下载完整产物查看。`
}

const hasText = (value: string | null | undefined) => String(value || '').trim().length > 0

const pickLatestTime = (...values: Array<string | null | undefined>) =>
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1) || null

const pickPreferredText = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (hasText(value)) {
      return String(value).trim()
    }
  }
  return null
}

const pickPreferredArtifactText = (currentText: string | null | undefined, nextText: string | null | undefined) => {
  if (!hasText(nextText)) {
    return currentText || null
  }
  if (!hasText(currentText)) {
    return nextText || null
  }
  const normalizedCurrent = String(currentText).trim()
  const normalizedNext = String(nextText).trim()
  if (normalizedCurrent.includes('正在同步预览内容与下载地址') && !normalizedNext.includes('正在同步预览内容与下载地址')) {
    return normalizedNext
  }
  return normalizedNext.length >= normalizedCurrent.length ? normalizedNext : normalizedCurrent
}

const statusRank = (status: string | null | undefined) => {
  switch (String(status || '').toUpperCase()) {
    case 'PENDING':
      return 0
    case 'RUNNING':
      return 1
    case 'SUCCESS':
    case 'FAILED':
    case 'CANCELED':
      return 2
    default:
      return -1
  }
}

const pickPreferredStatus = (currentStatus: string | null | undefined, nextStatus: string | null | undefined) => {
  if (!hasText(nextStatus)) {
    return currentStatus || ''
  }
  if (!hasText(currentStatus)) {
    return String(nextStatus).trim().toUpperCase()
  }
  const normalizedCurrent = String(currentStatus).trim().toUpperCase()
  const normalizedNext = String(nextStatus).trim().toUpperCase()
  return statusRank(normalizedNext) >= statusRank(normalizedCurrent) ? normalizedNext : normalizedCurrent
}

/**
 * SSE 事件有机会先于 run 快照到达，这里把同一条产物按 id 做“增量合并”，
 * 防止稍旧的快照把刚刚通过事件插入的占位卡片或预览内容覆盖掉。
 */
const mergeArtifactItem = (
  currentArtifact: ExecutionArtifactItem | null | undefined,
  nextArtifact: ExecutionArtifactItem
): ExecutionArtifactItem => {
  if (!currentArtifact) {
    return nextArtifact
  }
  const nextType =
    hasText(nextArtifact.artifactType) && nextArtifact.artifactType !== 'LIVE_ARTIFACT_PENDING'
      ? nextArtifact.artifactType
      : currentArtifact.artifactType
  return {
    ...currentArtifact,
    ...nextArtifact,
    stepId: nextArtifact.stepId ?? currentArtifact.stepId ?? null,
    artifactType: nextType,
    title: pickPreferredText(nextArtifact.title, currentArtifact.title) || `执行产物 #${nextArtifact.id}`,
    contentRef: pickPreferredText(nextArtifact.contentRef, currentArtifact.contentRef),
    contentText: pickPreferredArtifactText(currentArtifact.contentText, nextArtifact.contentText),
    workItemWriteback: Boolean(nextArtifact.workItemWriteback || currentArtifact.workItemWriteback)
  }
}

const mergeArtifactList = (
  currentArtifacts: ExecutionArtifactItem[] | null | undefined,
  nextArtifacts: ExecutionArtifactItem[] | null | undefined
) => {
  const currentList = Array.isArray(currentArtifacts) ? currentArtifacts : []
  const nextList = Array.isArray(nextArtifacts) ? nextArtifacts : []
  const mergedMap = new Map<number, ExecutionArtifactItem>()
  for (const artifact of currentList) {
    mergedMap.set(artifact.id, artifact)
  }
  for (const artifact of nextList) {
    mergedMap.set(artifact.id, mergeArtifactItem(mergedMap.get(artifact.id), artifact))
  }
  const orderedIds = [
    ...nextList.map((artifact) => artifact.id),
    ...currentList.filter((artifact) => !nextList.some((item) => item.id === artifact.id)).map((artifact) => artifact.id)
  ]
  return orderedIds.map((artifactId) => mergedMap.get(artifactId)).filter(Boolean) as ExecutionArtifactItem[]
}

const stepMergeKey = (step: Partial<ExecutionStepItem>) =>
  step.stepNo != null ? `step-no-${step.stepNo}` : `step-id-${step.id ?? 0}`

const mergeStepItem = (currentStep: ExecutionStepItem | null | undefined, nextStep: ExecutionStepItem): ExecutionStepItem => {
  if (!currentStep) {
    return nextStep
  }
  return {
    ...currentStep,
    ...nextStep,
    status: pickPreferredStatus(currentStep.status, nextStep.status),
    progressPercent: Math.max(currentStep.progressPercent || 0, nextStep.progressPercent || 0),
    latestMessage: pickPreferredText(nextStep.latestMessage, currentStep.latestMessage) || '等待执行',
    currentCommand: pickPreferredText(nextStep.currentCommand, currentStep.currentCommand),
    lastEventId: Math.max(currentStep.lastEventId || 0, nextStep.lastEventId || 0) || null,
    lastEventAt: pickLatestTime(currentStep.lastEventAt, nextStep.lastEventAt),
    lastHeartbeatAt: pickLatestTime(currentStep.lastHeartbeatAt, nextStep.lastHeartbeatAt),
    tailLogText: pickPreferredText(nextStep.tailLogText, currentStep.tailLogText),
    tailLogLineCount: Math.max(currentStep.tailLogLineCount || 0, nextStep.tailLogLineCount || 0) || null,
    hasLiveStream: Boolean(currentStep.hasLiveStream || nextStep.hasLiveStream),
    inputSnapshot: pickPreferredText(nextStep.inputSnapshot, currentStep.inputSnapshot) || '',
    outputSnapshot: pickPreferredText(nextStep.outputSnapshot, currentStep.outputSnapshot),
    errorMessage: pickPreferredText(nextStep.errorMessage, currentStep.errorMessage),
    startedAt: pickPreferredText(currentStep.startedAt, nextStep.startedAt),
    finishedAt: pickPreferredText(nextStep.finishedAt, currentStep.finishedAt)
  }
}

const mergeStepList = (currentSteps: ExecutionStepItem[] | null | undefined, nextSteps: ExecutionStepItem[] | null | undefined) => {
  const currentList = Array.isArray(currentSteps) ? currentSteps : []
  const nextList = Array.isArray(nextSteps) ? nextSteps : []
  const mergedMap = new Map<string, ExecutionStepItem>()
  for (const step of currentList) {
    mergedMap.set(stepMergeKey(step), step)
  }
  for (const step of nextList) {
    const key = stepMergeKey(step)
    mergedMap.set(key, mergeStepItem(mergedMap.get(key), step))
  }
  const orderedKeys = [
    ...nextList.map((step) => stepMergeKey(step)),
    ...currentList.filter((step) => !nextList.some((item) => stepMergeKey(item) === stepMergeKey(step))).map((step) => stepMergeKey(step))
  ]
  return orderedKeys.map((key) => mergedMap.get(key)).filter(Boolean) as ExecutionStepItem[]
}

/**
 * 运行详情刷新时保留事件流里已经拿到的中间态，避免“刚出现的产物卡片”
 * 被稍早返回的旧快照整页覆盖掉。
 */
const mergeRunDetailSnapshot = (
  currentDetail: ExecutionRunDetailItem | null,
  nextDetail: ExecutionRunDetailItem
): ExecutionRunDetailItem => {
  if (!currentDetail || currentDetail.id !== nextDetail.id) {
    return nextDetail
  }
  return {
    ...currentDetail,
    ...nextDetail,
    status: pickPreferredStatus(currentDetail.status, nextDetail.status),
    progressPercent: Math.max(currentDetail.progressPercent || 0, nextDetail.progressPercent || 0),
    currentStepNo: nextDetail.currentStepNo ?? currentDetail.currentStepNo ?? null,
    currentStepName: pickPreferredText(nextDetail.currentStepName, currentDetail.currentStepName),
    outputSummary: pickPreferredText(nextDetail.outputSummary, currentDetail.outputSummary),
    errorMessage: pickPreferredText(nextDetail.errorMessage, currentDetail.errorMessage),
    lastEventId: Math.max(currentDetail.lastEventId || 0, nextDetail.lastEventId || 0) || null,
    lastEventAt: pickLatestTime(currentDetail.lastEventAt, nextDetail.lastEventAt),
    hasLiveStream: Boolean(currentDetail.hasLiveStream || nextDetail.hasLiveStream),
    startedAt: pickPreferredText(currentDetail.startedAt, nextDetail.startedAt),
    finishedAt: pickPreferredText(nextDetail.finishedAt, currentDetail.finishedAt),
    steps: mergeStepList(currentDetail.steps, nextDetail.steps),
    artifacts: mergeArtifactList(currentDetail.artifacts, nextDetail.artifacts)
  }
}

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

const handleDisplayArtifactDownload = async (artifact: DisplayArtifactItem) => {
  if (artifact.kind !== 'artifact') {
    return
  }
  await handleArtifactDownload(artifact.artifact)
}

function fallbackQuickMergeOauthBinding(): GitlabUserOauthBindingItem {
  return {
    connected: false,
    apiBaseUrl: '',
    gitlabUserId: null,
    gitlabUsername: null,
    gitlabName: null,
    expiresAt: null
  }
}

const buildQuickMergeDefaultTitle = () => {
  const workItemCode = String(taskDetail.value?.workItemCode || '').trim()
  const workItemName = String(taskDetail.value?.workItemName || '').trim()
  const taskTitle = String(taskDetail.value?.title || '').trim()
  return `${workItemCode ? `${workItemCode} ` : ''}${workItemName || taskTitle}`.trim()
}

const limitPlainText = (text: string | null | undefined, maxChars = 240) => {
  const normalized = String(text || '').trim()
  if (!normalized) {
    return ''
  }
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized
}

const buildQuickMergeDefaultDescription = () => {
  const lines = [
    taskDetail.value?.title ? `关联执行任务：${taskDetail.value.title}` : '',
    runDetail.value ? `执行运行：第 ${runDetail.value.runNo} 次运行` : '',
    runDetail.value?.outputSummary ? `执行摘要：${limitPlainText(runDetail.value.outputSummary, 300)}` : ''
  ].filter(Boolean)
  return lines.join('\n')
}

const prependBranchOptionIfMissing = (branches: GitlabBranchItem[], branchName: string) => {
  const normalized = branchName.trim()
  if (!normalized || branches.some((item) => item.name === normalized)) {
    return branches
  }
  return [{ name: normalized, defaultBranch: false, protectedBranch: false, merged: false, webUrl: null }, ...branches]
}

const resetQuickMergeForm = () => {
  quickMergeForm.bindingId = null
  quickMergeForm.sourceBranch = ''
  quickMergeForm.targetBranch = ''
  quickMergeForm.title = ''
  quickMergeForm.description = ''
  quickMergeSourceBranchOptions.value = []
  quickMergeTargetBranchOptions.value = []
  quickMergeFormRef.value?.clearValidate()
}

const loadQuickMergeOauthBinding = async () => {
  try {
    quickMergeOauthBinding.value = await getCurrentUserGitlabOauthBinding()
  } catch (error: any) {
    quickMergeOauthBinding.value = fallbackQuickMergeOauthBinding()
    ElMessage.error(error?.response?.data?.message || '加载 GitLab 授权状态失败')
  }
}

const loadQuickMergeBranches = async (kind: 'source' | 'target', keyword = '') => {
  if (!quickMergeForm.bindingId) {
    return
  }
  if (kind === 'source') {
    sourceBranchLoading.value = true
  } else {
    targetBranchLoading.value = true
  }
  try {
    const branches = await listGitlabBranches(quickMergeForm.bindingId, keyword)
    if (kind === 'source') {
      quickMergeSourceBranchOptions.value = branches
    } else {
      quickMergeTargetBranchOptions.value = branches
    }
  } finally {
    if (kind === 'source') {
      sourceBranchLoading.value = false
    } else {
      targetBranchLoading.value = false
    }
  }
}

const handleQuickMergeSourceSearch = (keyword: string) => {
  void loadQuickMergeBranches('source', keyword)
}

const handleQuickMergeTargetSearch = (keyword: string) => {
  void loadQuickMergeBranches('target', keyword)
}

const openQuickMergeDialog = async () => {
  try {
    resetQuickMergeForm()
    if (!gitlabBindingOptions.value.length) {
      await loadGitlabBindings()
    }
    if (!developmentQuickMergeRepositories.value.length) {
      throw new Error('当前执行任务未携带可提交 MR 的仓库信息')
    }
    await loadQuickMergeOauthBinding()
    const preferredRepository = developmentQuickMergeRepositories.value.find((repository) => hasText(repository.sourceBranch))
      || developmentQuickMergeRepositories.value[0]
    quickMergeForm.bindingId = preferredRepository.bindingId
    quickMergeForm.title = buildQuickMergeDefaultTitle()
    quickMergeForm.description = buildQuickMergeDefaultDescription()
    quickMergeDialogVisible.value = true
  } catch (error: any) {
    ElMessage.warning(error?.message || '暂无可提交 MR 的 GitLab 仓库')
  }
}

const handleQuickMergeSubmit = async () => {
  const valid = await quickMergeFormRef.value?.validate().catch(() => false)
  if (!valid || quickMergeForm.bindingId == null) {
    return
  }
  if (quickMergeSubmitDisabledReason.value) {
    ElMessage.warning(quickMergeSubmitDisabledReason.value)
    return
  }
  if (quickMergeForm.sourceBranch.trim() === quickMergeForm.targetBranch.trim()) {
    ElMessage.warning('源分支与目标分支不能相同')
    return
  }
  quickMergeSubmitting.value = true
  try {
    const result = await createGitlabMergeRequest(quickMergeForm.bindingId, {
      sourceBranch: quickMergeForm.sourceBranch.trim(),
      targetBranch: quickMergeForm.targetBranch.trim(),
      title: quickMergeForm.title.trim(),
      description: quickMergeForm.description.trim() || undefined
    })
    quickMergeResult.value = result
    quickMergeDialogVisible.value = false
    quickMergeResultVisible.value = true
    ElMessage.success(`MR !${result.iid} 已创建`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建 MR 失败')
  } finally {
    quickMergeSubmitting.value = false
  }
}

watch(
  () => quickMergeForm.bindingId,
  async (bindingId) => {
    quickMergeForm.sourceBranch = ''
    quickMergeForm.targetBranch = ''
    quickMergeSourceBranchOptions.value = []
    quickMergeTargetBranchOptions.value = []
    if (!bindingId) {
      return
    }
    await Promise.all([loadQuickMergeBranches('source'), loadQuickMergeBranches('target')])
    const currentRepository = developmentQuickMergeRepositories.value.find((repository) => repository.bindingId === bindingId)
    const binding = bindingOptionMap.value.get(bindingId)
    const preferredSource = currentRepository?.sourceBranch || ''
    const preferredTarget = currentRepository?.targetBranch || binding?.defaultTargetBranch || quickMergeTargetBranchOptions.value.find((item) => item.defaultBranch)?.name || ''
    if (preferredSource) {
      quickMergeSourceBranchOptions.value = prependBranchOptionIfMissing(quickMergeSourceBranchOptions.value, preferredSource)
      quickMergeForm.sourceBranch = preferredSource
    }
    if (preferredTarget) {
      quickMergeTargetBranchOptions.value = prependBranchOptionIfMissing(quickMergeTargetBranchOptions.value, preferredTarget)
      quickMergeForm.targetBranch = preferredTarget
    }
  }
)

/**
 * 只有运行中的 run 才继续持有 SSE 连接；
 * 历史成功/失败 run 即使带有 hasLiveStream，也只需要展示快照，不应该继续频繁重连 stream。
 */
const shouldKeepStreaming = (detail: ExecutionRunDetailItem | null) =>
  Boolean(detail && !isTerminalRunStatus(detail.status) && ['PENDING', 'RUNNING'].includes(detail.status))

const stopRunStream = () => {
  if (runStreamReconnectTimer.value != null && typeof window !== 'undefined') {
    window.clearTimeout(runStreamReconnectTimer.value)
    runStreamReconnectTimer.value = null
  }
  runStreamController.value?.abort()
  runStreamController.value = null
}

const scheduleSnapshotRefresh = (delay = 800) => {
  if (typeof window === 'undefined') {
    return
  }
  if (snapshotRefreshTimer.value != null) {
    window.clearTimeout(snapshotRefreshTimer.value)
  }
  snapshotRefreshTimer.value = window.setTimeout(() => {
    snapshotRefreshTimer.value = null
    void refreshTaskAndRunSnapshot()
  }, delay)
}

const appendTailLog = (existingText: string | null | undefined, incomingText: string | null | undefined) => {
  const nextText = String(incomingText || '').replace(/\r/g, '').trim()
  if (!nextText) {
    return existingText || null
  }
  const existingLines = String(existingText || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim())
  const nextLines = nextText.split('\n').filter((line) => line.trim())
  const merged = [...existingLines, ...nextLines]
  while (merged.length > 200) {
    merged.shift()
  }
  return merged.join('\n')
}

const inferStepNameFromEvent = (event: ExecutionStreamEvent) => {
  const summary = String(event.summary || '').trim()
  if (summary.startsWith('开始执行：')) {
    return summary.slice('开始执行：'.length).trim()
  }
  if (summary.startsWith('开始执行:')) {
    return summary.slice('开始执行:'.length).trim()
  }
  if (summary.startsWith('执行中：')) {
    return summary.slice('执行中：'.length).trim()
  }
  return event.stepNo != null ? `步骤 ${event.stepNo}` : '执行步骤'
}

/**
 * 新步骤刚开始时，后端 run 快照里可能还没有这条 step。
 * 先基于事件生成一个本地占位步骤，让页面完全依赖流式事件也能持续更新。
 */
const ensureStepFromStreamEvent = (event: ExecutionStreamEvent) => {
  if (!runDetail.value || event.stepNo == null) {
    return null
  }
  const existingStep = runDetail.value.steps.find((item) => item.id === event.stepId || item.stepNo === event.stepNo)
  if (existingStep) {
    return existingStep
  }
  const placeholderStep: ExecutionStepItem = {
    id: event.stepId ?? -event.stepNo,
    runId: runDetail.value.id,
    stepNo: event.stepNo,
    stepCode: `STEP_${event.stepNo}`,
    stepName: inferStepNameFromEvent(event),
    agentId: null,
    agentName: null,
    status: event.eventType === 'step_finished' ? 'SUCCESS' : 'RUNNING',
    progressPercent: event.progressPercent ?? (event.eventType === 'step_finished' ? 100 : 0),
    latestMessage: event.summary || '执行中',
    currentCommand: event.currentCommand || null,
    lastEventId: event.id || null,
    lastEventAt: event.createdAt || null,
    lastHeartbeatAt: event.eventType === 'heartbeat' ? event.createdAt || null : null,
    tailLogText: event.text || null,
    tailLogLineCount: event.text ? event.text.split('\n').filter((line) => line.trim()).length : null,
    hasLiveStream: true,
    inputSnapshot: '',
    outputSnapshot: null,
    errorMessage: null,
    startedAt: event.createdAt || null,
    finishedAt: event.eventType === 'step_finished' ? event.createdAt || null : null
  }
  runDetail.value.steps = [...runDetail.value.steps, placeholderStep].sort((left, right) => left.stepNo - right.stepNo)
  return placeholderStep
}

/**
 * `artifact_ready` 到达时，后端快照有时还在路上；
 * 这里先把占位卡片插入列表，让用户马上看到“产物已经出来了”，随后再用快照补全真实内容与下载地址。
 */
const upsertArtifactFromStreamEvent = (event: ExecutionStreamEvent) => {
  if (!runDetail.value || event.eventType !== 'artifact_ready' || !event.artifactId || event.artifactId <= 0) {
    return
  }
  const existingArtifact = runDetail.value.artifacts.find((artifact) => artifact.id === event.artifactId)
  if (existingArtifact) {
    existingArtifact.stepId = event.stepId ?? existingArtifact.stepId
    existingArtifact.title = event.summary || existingArtifact.title
    return
  }
  runDetail.value.artifacts = [
    ...runDetail.value.artifacts,
    {
      id: event.artifactId,
      runId: runDetail.value.id,
      stepId: event.stepId ?? null,
      artifactType: 'LIVE_ARTIFACT_PENDING',
      title: event.summary || `执行产物 #${event.artifactId}`,
      contentRef: null,
      contentText: '产物已生成，正在同步预览内容与下载地址...',
      workItemWriteback: false
    }
  ]
}

const hydrateArtifactFromEvent = async (event: ExecutionStreamEvent, attempt = 0) => {
  if (!runDetail.value || event.eventType !== 'artifact_ready' || !event.artifactId || event.artifactId <= 0) {
    return
  }
  try {
    const artifact = await getExecutionArtifactDetail(event.artifactId)
    if (!runDetail.value || artifact.runId !== runDetail.value.id) {
      return
    }
    const nextArtifacts = runDetail.value.artifacts.slice()
    const existingIndex = nextArtifacts.findIndex((item) => item.id === artifact.id)
    if (existingIndex >= 0) {
      nextArtifacts.splice(existingIndex, 1, artifact)
    } else {
      nextArtifacts.push(artifact)
    }
    runDetail.value.artifacts = nextArtifacts
  } catch (error) {
    console.warn('hydrate execution artifact failed', error)
    if (attempt >= 3 || typeof window === 'undefined') {
      return
    }
    const previousTimer = artifactHydrationRetryTimers.get(event.artifactId)
    if (previousTimer != null) {
      window.clearTimeout(previousTimer)
    }
    const timer = window.setTimeout(() => {
      artifactHydrationRetryTimers.delete(event.artifactId!)
      void hydrateArtifactFromEvent(event, attempt + 1)
    }, 300 * (attempt + 1))
    artifactHydrationRetryTimers.set(event.artifactId, timer)
  }
}

const applyExecutionStreamEvent = (event: ExecutionStreamEvent) => {
  if (!runDetail.value || event.runId !== runDetail.value.id) {
    return
  }
  streamLastEventId.value = Math.max(streamLastEventId.value, event.id || 0)
  runDetail.value = {
    ...runDetail.value,
    lastEventId: streamLastEventId.value,
    lastEventAt: event.createdAt || runDetail.value.lastEventAt,
    hasLiveStream: true
  }
  upsertArtifactFromStreamEvent(event)
  if (event.eventType === 'artifact_ready') {
    void hydrateArtifactFromEvent(event)
  }
  const step = ensureStepFromStreamEvent(event)
  if (!step) {
    return
  }
  step.lastEventId = event.id
  step.lastEventAt = event.createdAt || step.lastEventAt
  step.hasLiveStream = true
  if (event.currentCommand) {
    step.currentCommand = event.currentCommand
  }
  if (event.progressPercent != null) {
    step.progressPercent = event.progressPercent
  }
  if (event.summary) {
    step.latestMessage = event.summary
  }
  if (event.eventType === 'heartbeat') {
    step.lastHeartbeatAt = event.createdAt || step.lastHeartbeatAt
  }
  if (event.eventType === 'stdout_chunk' || event.eventType === 'stderr_chunk') {
    step.tailLogText = appendTailLog(step.tailLogText, event.text)
    step.tailLogLineCount = step.tailLogText ? step.tailLogText.split('\n').length : 0
  }
  if (event.eventType === 'step_started') {
    step.status = 'RUNNING'
    step.startedAt = step.startedAt || event.createdAt || null
    step.stepName = inferStepNameFromEvent(event)
    runDetail.value.currentStepNo = step.stepNo
    runDetail.value.currentStepName = step.stepName
  }
  if (event.eventType === 'step_finished') {
    step.status = pickPreferredStatus(step.status, 'SUCCESS')
    step.finishedAt = event.createdAt || step.finishedAt
  }
}

/**
 * SSE 结束时先做一次最终快照校准，只在 run 仍处于执行中时才重连，
 * 避免已完成/失败的任务继续无意义地重建 stream。
 */
const handleRunStreamClosed = async (currentRunId: number, reconnectDelay: number) => {
  if (selectedRunId.value !== currentRunId) {
    return
  }
  try {
    await refreshTaskAndRunSnapshot()
  } catch (error) {
    console.warn('refresh execution snapshot after stream close failed', error)
  }
  if (selectedRunId.value !== currentRunId || !shouldKeepStreaming(runDetail.value) || typeof window === 'undefined') {
    return
  }
  runStreamReconnectTimer.value = window.setTimeout(() => {
    runStreamReconnectTimer.value = null
    void connectRunStream()
  }, reconnectDelay)
}

const connectRunStream = async () => {
  if (!selectedRunId.value || !shouldKeepStreaming(runDetail.value)) {
    return
  }
  const currentRunId = selectedRunId.value
  stopRunStream()
  try {
    runStreamController.value = await streamExecutionRunEvents(
      currentRunId,
      streamLastEventId.value || runDetail.value?.lastEventId || null,
      {
        onEvent: (event) => {
          if (selectedRunId.value !== currentRunId) {
            return
          }
          applyExecutionStreamEvent(event)
        },
        onDone: () => {
          void handleRunStreamClosed(currentRunId, 1500)
        },
        onError: (error) => {
          console.warn('execution stream interrupted', error)
          void handleRunStreamClosed(currentRunId, 2000)
        }
      }
    )
  } catch (error: any) {
    console.warn('connect execution stream failed', error)
    if (typeof window === 'undefined') {
      return
    }
    runStreamReconnectTimer.value = window.setTimeout(() => {
      runStreamReconnectTimer.value = null
      void connectRunStream()
    }, 2500)
  }
}

const loadSelectedRun = async (connectStream = true) => {
  if (!selectedRunId.value) {
    stopRunStream()
    runDetail.value = null
    streamLastEventId.value = 0
    return
  }
  const detail = await getExecutionRunDetail(selectedRunId.value)
  runDetail.value = mergeRunDetailSnapshot(runDetail.value, detail)
  streamLastEventId.value = detail.lastEventId || 0
  if (!shouldKeepStreaming(detail)) {
    stopRunStream()
    return
  }
  if (connectStream) {
    await connectRunStream()
  }
}

const refreshTaskAndRunSnapshot = async () => {
  const detail = await getExecutionTaskDetail(executionTaskId.value)
  taskDetail.value = detail
  if (detail.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION' && !gitlabBindingOptions.value.length) {
    await loadGitlabBindings()
  }
  const nextRunId = selectedRunId.value || detail.currentRunId || detail.runs[0]?.id || null
  if (nextRunId !== selectedRunId.value) {
    selectedRunId.value = nextRunId
  }
  await loadSelectedRun(false)
}

const loadTaskDetail = async () => {
  loading.value = true
  try {
    const detail = await getExecutionTaskDetail(executionTaskId.value)
    taskDetail.value = detail
    if (detail.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION') {
      await loadGitlabBindings()
    }
    const nextRunId = selectedRunId.value || detail.currentRunId || detail.runs[0]?.id || null
    if (nextRunId !== selectedRunId.value) {
      selectedRunId.value = nextRunId
    }
    await loadSelectedRun(true)
  } finally {
    loading.value = false
  }
}

const loadGitlabBindings = async () => {
  try {
    gitlabBindingOptions.value = await listGitlabBindingOptions()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 GitLab 绑定失败')
  }
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

onMounted(async () => {
  await loadTaskDetail()
})

onBeforeUnmount(() => {
  stopRunStream()
  if (snapshotRefreshTimer.value != null && typeof window !== 'undefined') {
    window.clearTimeout(snapshotRefreshTimer.value)
  }
  if (typeof window !== 'undefined') {
    for (const timer of artifactHydrationRetryTimers.values()) {
      window.clearTimeout(timer)
    }
  }
  artifactHydrationRetryTimers.clear()
})
</script>

<style scoped>
.execution-detail-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 104px);
  min-height: 0;
  gap: 10px;
  overflow: hidden;
}

.execution-detail-hero,
.execution-run-card,
.execution-panel {
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.execution-detail-hero {
  padding: 12px 14px;
}

.execution-back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.18s ease;
}

.execution-back-button .el-icon {
  font-size: 14px;
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
  gap: 12px;
  margin-top: 8px;
}

.execution-detail-heading h1 {
  margin: 0;
  color: #0f172a;
  font-size: 21px;
  font-weight: 900;
  line-height: 1.15;
}

.execution-detail-heading p,
.execution-eyebrow {
  color: #64748b;
}

.execution-eyebrow {
  margin: 0 0 2px;
  color: #0f766e;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.execution-detail-actions,
.execution-detail-meta,
.execution-run-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.execution-detail-meta {
  margin-top: 8px;
}

.execution-detail-repo-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.execution-detail-repo-label {
  display: inline-flex;
  align-items: center;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.execution-detail-meta span,
.execution-detail-meta button,
.execution-run-status span,
.execution-detail-repo-chip {
  border: 0;
  border-radius: 999px;
  padding: 4px 8px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  line-height: 1.25;
  text-decoration: none;
}

.execution-detail-meta button {
  color: #0f766e;
  cursor: pointer;
  font-weight: 800;
}

.execution-detail-repo-chip {
  color: #0f766e;
}

.execution-run-card {
  padding: 10px 14px 12px;
}

.execution-run-head,
.execution-artifact-head,
.execution-step-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.execution-run-head h2,
.execution-panel-head h2 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
}

.execution-run-head p,
.execution-panel-head p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}

.execution-run-status {
  margin-top: 8px;
}

.execution-run-alert {
  margin-top: 14px;
}

.execution-detail-grid {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 10px;
  min-height: 0;
}

.execution-panel {
  display: flex;
  flex-direction: column;
  padding: 14px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.execution-panel-head {
  flex: 0 0 auto;
  margin-bottom: 10px;
}

.execution-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
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

.execution-step-live-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.execution-step-live-meta span,
.execution-step-tail-head span,
.execution-artifact-log-hint {
  color: #64748b;
  font-size: 12px;
}

.execution-artifact-log-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.execution-artifact-log-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.execution-artifact-log-entry {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fbfdff;
}

.execution-artifact-log-entry-head,
.execution-artifact-log-entry-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.execution-artifact-toggle-button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.execution-artifact-toggle-button :deep(.el-icon) {
  font-size: 16px;
}

.execution-step-log-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.execution-step-tail {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.execution-step-tail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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

.execution-artifact-card-install {
  border-color: rgba(14, 116, 144, 0.28);
  background:
    linear-gradient(180deg, rgba(240, 249, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 100%);
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.24);
}

.execution-artifact-title-block {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.execution-artifact-title-block strong {
  color: #0f172a;
}

.execution-artifact-step-badge,
.execution-artifact-step-name {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.execution-artifact-step-badge {
  background: #0f766e;
  color: #f0fdfa;
}

.execution-artifact-step-name {
  background: rgba(14, 116, 144, 0.12);
  color: #0f766e;
}

.execution-artifact-markdown {
  max-height: 420px;
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
}

.execution-artifact-markdown :deep(.md-editor) {
  border: 0;
  background: transparent;
}

.execution-artifact-markdown :deep(.md-editor-preview) {
  padding: 0;
  color: #0f172a;
}

.execution-artifact-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.execution-quick-merge-auth-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.95);
}

.execution-quick-merge-auth-card.connected {
  border-color: rgba(34, 197, 94, 0.18);
  background: rgba(240, 253, 244, 0.92);
}

.execution-quick-merge-auth-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.execution-quick-merge-auth-text {
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.execution-quick-merge-auth-warning {
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
}

.execution-quick-merge-auth-link,
.execution-quick-merge-result-link {
  display: flex;
  justify-content: flex-end;
}

.execution-quick-merge-result-link {
  margin-top: 16px;
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
