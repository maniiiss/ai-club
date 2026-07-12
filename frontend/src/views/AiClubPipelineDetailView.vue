<template>
  <div class="pipeline-detail-page" v-loading="loading">
    <section v-if="detailEntry" class="pipeline-detail-hero">
      <button class="pipeline-detail-back-link" type="button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回流水线中心</span>
      </button>

      <div class="pipeline-detail-hero-heading">
        <div>
          <h1>{{ detailEntry.name }}</h1>
          <div class="pipeline-detail-hero-subtitle">{{ detailEntry.projectName }}</div>
        </div>
        <div class="pipeline-detail-hero-actions">
          <el-button v-if="canBuild" type="primary" :loading="triggering" @click="handleTrigger">
            <el-icon><VideoPlay /></el-icon>
            <span>触发</span>
          </el-button>
          <el-button v-if="canManage && isAiEntry" @click="handleSync">
            <el-icon><Connection /></el-icon>
            <span>同步仓库</span>
          </el-button>
          <el-button
            v-if="canManage && isAiEntry"
            :type="configStatus?.status === 'MISSING' ? 'warning' : 'default'"
            @click="configDialogVisible = true"
          >
            <el-icon><Plus /></el-icon>
            <span>{{ configStatus?.status === 'MISSING' ? '补全配置' : '修改配置' }}</span>
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
        <span class="management-list-pill success">{{ detailEntry.providerCode }}</span>
        <span class="management-list-pill" :class="detailEntry.enabled ? 'success' : 'neutral'">
          {{ detailEntry.enabled ? '启用' : '停用' }}
        </span>
        <span class="management-list-pill" :class="aiClubPipelineStatusTone(detailEntry.lastRunStatus)">
          {{ formatAiClubPipelineStatus(detailEntry.lastRunStatus) }}
        </span>
        <span v-if="isAiEntry" class="management-list-pill" :class="aiClubPipelineConfigStatusTone(configStatus?.status)">
          {{ formatAiClubPipelineConfigStatus(configStatus?.status) }}
        </span>
        <span>默认分支：{{ detailEntry.defaultBranch || '-' }}</span>
        <span>最近触发：{{ formatAiClubPipelineDateTime(detailEntry.lastTriggeredAt) }}</span>
        <a
          v-if="detailEntry.primaryUrl"
          class="pipeline-detail-repo-chip"
          :href="detailEntry.primaryUrl"
          target="_blank"
          rel="noreferrer"
        >
          {{ detailEntry.primaryLabel }}：{{ detailEntry.primaryValue || '-' }}
        </a>
      </div>

      <el-alert
        v-if="isAiEntry && configStatus?.status === 'MISSING'"
        type="warning"
        show-icon
        :closable="false"
        class="pipeline-detail-hero-alert"
      >
        <template #title>{{ configStatus.message }}</template>
      </el-alert>
    </section>

    <section v-if="detailEntry" class="pipeline-detail-content">
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

            <template v-if="selectedRunNumber !== null">
              <el-descriptions v-if="selectedRunLog" :column="2" border class="pipeline-detail-log-summary">
                <el-descriptions-item label="平台项目">{{ selectedRunLog.projectName }}</el-descriptions-item>
                <el-descriptions-item label="流水线">{{ selectedRunLog.pipelineName }}</el-descriptions-item>
                <el-descriptions-item :label="selectedRunSourceLabel">{{ selectedRunLog.sourceName || '-' }}</el-descriptions-item>
                <el-descriptions-item :label="selectedRunNumberLabel">#{{ selectedRunLog.runNumber }}</el-descriptions-item>
                <el-descriptions-item label="状态">{{ formatAiClubPipelineStatus(selectedRunLog.status) }}</el-descriptions-item>
                <el-descriptions-item label="分支">{{ selectedRunLog.branch || '-' }}</el-descriptions-item>
                <el-descriptions-item label="开始时间">{{ selectedRunLog.startedAt || '-' }}</el-descriptions-item>
                <el-descriptions-item label="结束时间">{{ selectedRunLog.finishedAt || '-' }}</el-descriptions-item>
              </el-descriptions>

              <div class="pipeline-detail-log-shell" v-loading="runLogLoading" element-loading-text="正在加载运行日志...">
                <div class="pipeline-detail-log-head">
                  <div class="pipeline-detail-log-head-main">
                    <strong>聚合日志</strong>
                    <span v-if="isLogTailing" class="management-list-pill warning pipeline-detail-log-tail-badge">实时追踪中</span>
                  </div>
                  <el-link v-if="selectedRunLog?.url" :href="selectedRunLog.url" target="_blank" type="primary">打开运行</el-link>
                </div>
                <el-scrollbar ref="logScrollbarRef" max-height="520px">
                  <pre class="pipeline-detail-log-content">{{ selectedRunLog?.consoleLog || logPlaceholderText }}</pre>
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
                <p>查看当前流水线条目的基础配置和最近运行摘要。</p>
              </div>
            </div>

            <el-descriptions :column="2" border class="pipeline-detail-basic-summary">
              <el-descriptions-item label="平台项目">{{ detailEntry.projectName }}</el-descriptions-item>
              <el-descriptions-item label="名称">{{ detailEntry.name }}</el-descriptions-item>
              <el-descriptions-item label="Provider">{{ detailEntry.providerCode }}</el-descriptions-item>
              <el-descriptions-item label="启用状态">{{ detailEntry.enabled ? '启用' : '停用' }}</el-descriptions-item>
              <el-descriptions-item label="默认分支">{{ detailEntry.defaultBranch || '-' }}</el-descriptions-item>
              <el-descriptions-item label="最近运行">{{ formatAiClubPipelineStatus(detailEntry.lastRunStatus) }}</el-descriptions-item>
              <el-descriptions-item :label="detailEntry.primaryLabel">{{ detailEntry.primaryValue || '-' }}</el-descriptions-item>
              <el-descriptions-item v-if="detailEntry.secondaryLabel" :label="detailEntry.secondaryLabel">{{ detailEntry.secondaryValue || '-' }}</el-descriptions-item>
              <template v-if="isAiEntry && aiPipelineDetail">
                <el-descriptions-item label="配置文件">{{ aiPipelineDetail.configPath }}</el-descriptions-item>
                <el-descriptions-item label="Woodpecker 仓库">{{ aiPipelineDetail.woodpeckerRepoFullName || '-' }}</el-descriptions-item>
                <el-descriptions-item label="配置状态">{{ formatAiClubPipelineConfigStatus(configStatus?.status) }}</el-descriptions-item>
                <el-descriptions-item label="最近运行号">#{{ aiPipelineDetail.lastRunNumber || '-' }}</el-descriptions-item>
                <el-descriptions-item label="固定触发变量" :span="2">
                  <template v-if="Object.keys(aiPipelineDetail.triggerVariables || {}).length">
                    <div class="pipeline-detail-trigger-variables">
                      <code
                        v-for="(value, key) in aiPipelineDetail.triggerVariables"
                        :key="key"
                        class="pipeline-detail-trigger-variable-chip"
                      >{{ key }}={{ value }}</code>
                    </div>
                  </template>
                  <span v-else>-</span>
                </el-descriptions-item>
                <el-descriptions-item label="运行链接" :span="2">
                  <el-link v-if="aiPipelineDetail.lastRunUrl" :href="aiPipelineDetail.lastRunUrl" target="_blank" type="primary">
                    {{ aiPipelineDetail.lastRunUrl }}
                  </el-link>
                  <span v-else>-</span>
                </el-descriptions-item>
                <el-descriptions-item label="配置说明" :span="2">
                  <span>{{ configStatus?.message || '-' }}</span>
                </el-descriptions-item>
              </template>
              <template v-else-if="jenkinsBindingDetail">
                <el-descriptions-item label="Jenkins 服务">{{ jenkinsBindingDetail.jenkinsServerName }}</el-descriptions-item>
                <el-descriptions-item label="Jenkins Job">{{ jenkinsBindingDetail.jobName }}</el-descriptions-item>
                <el-descriptions-item label="构建参数 JSON" :span="2">
                  <span>{{ jenkinsBindingDetail.buildParametersJson || '-' }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="最近触发链接" :span="2">
                  <el-link v-if="jenkinsBindingDetail.lastTriggerUrl" :href="jenkinsBindingDetail.lastTriggerUrl" target="_blank" type="primary">
                    {{ jenkinsBindingDetail.lastTriggerUrl }}
                  </el-link>
                  <span v-else>-</span>
                </el-descriptions-item>
              </template>
              <el-descriptions-item label="最近结果" :span="2">
                <span>{{ detailEntry.lastRunMessage || '-' }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </section>
        </el-tab-pane>

        <el-tab-pane v-if="isAiEntry" label="自动化" name="automation">
          <section class="pipeline-detail-panel">
            <div class="pipeline-detail-panel-head">
              <div>
                <h2>Woodpecker Cron</h2>
                <p>在平台内维护仓库级 cron，并同步到当前 GitPilot Pipeline 关联的 Woodpecker 仓库。</p>
              </div>
              <el-button v-if="canManage" type="primary" @click="openCreateCronDialog">新增 Cron</el-button>
            </div>

            <el-table v-if="cronList.length" :data="cronList" style="width: 100%">
              <el-table-column prop="name" label="名称" min-width="160" />
              <el-table-column prop="branch" label="分支" width="140">
                <template #default="{ row }">{{ row.branch || detailEntry?.defaultBranch || '-' }}</template>
              </el-table-column>
              <el-table-column prop="cronExpression" label="Cron 表达式" min-width="180" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="nextRunAt" label="下一次执行" width="180">
                <template #default="{ row }">{{ row.nextRunAt || '-' }}</template>
              </el-table-column>
              <el-table-column prop="lastSyncedAt" label="最近同步" width="180">
                <template #default="{ row }">{{ row.lastSyncedAt || '-' }}</template>
              </el-table-column>
              <el-table-column v-if="canManage" label="操作" width="170" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openEditCronDialog(row)">编辑</el-button>
                  <el-button link type="danger" @click="handleDeleteCron(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="当前流水线还没有配置 Cron" />
            <el-alert type="info" show-icon :closable="false" class="pipeline-detail-automation-alert">
              <template #title>Woodpecker 需要使用带秒的 Cron 语法，并确保 `.woodpecker.yml` 对应 workflow 支持 `event: cron`。</template>
            </el-alert>
          </section>

          <section class="pipeline-detail-panel">
            <div class="pipeline-detail-panel-head">
              <div>
                <h2>公开 Trigger Webhook</h2>
                <p>供外部系统固定配置触发当前流水线，只会按平台默认分支执行，不允许覆盖变量。</p>
              </div>
            </div>

            <el-form label-position="top" class="platform-form-layout pipeline-automation-form">
              <el-form-item label="启用状态">
                <el-switch v-model="triggerWebhookForm.enabled" :disabled="!canManage" />
              </el-form-item>
              <el-form-item label="触发地址">
                <el-input :model-value="triggerWebhookDetail?.triggerUrl || ''" readonly placeholder="保存后生成公开触发地址">
                  <template #append>
                    <el-button :disabled="!triggerWebhookDetail?.triggerUrl" @click="handleCopyText(triggerWebhookDetail?.triggerUrl || '')">复制</el-button>
                  </template>
                </el-input>
              </el-form-item>
              <el-form-item label="当前 Token">
                <el-input :model-value="triggerWebhookDetail?.maskedToken || ''" readonly placeholder="保存后生成 token" />
              </el-form-item>
              <div class="pipeline-automation-actions">
                <el-button v-if="canManage" type="primary" :loading="triggerWebhookSaving" @click="saveTriggerWebhook(false)">保存配置</el-button>
                <el-button v-if="canManage" :loading="triggerWebhookSaving" @click="saveTriggerWebhook(true)">重新生成 Token</el-button>
                <span class="pipeline-automation-meta">最近更新：{{ triggerWebhookDetail?.updatedAt || '-' }}</span>
              </div>
            </el-form>
          </section>

          <section class="pipeline-detail-panel">
            <div class="pipeline-detail-panel-head">
              <div>
                <h2>结果 Callback Webhook</h2>
                <p>按选定状态向外部 URL 推送运行结果，适合企业微信机器人、中转服务或自建编排系统。</p>
              </div>
            </div>

            <el-form label-position="top" class="platform-form-layout pipeline-automation-form">
              <el-form-item label="启用状态">
                <el-switch v-model="callbackWebhookForm.enabled" :disabled="!canManage" />
              </el-form-item>
              <el-form-item label="回调地址">
                <el-input v-model="callbackWebhookForm.callbackUrl" :readonly="!canManage" placeholder="请输入 http 或 https 地址" />
                <div class="form-tip">如接收方需要 token，可直接拼在 URL 上，平台不会额外注入鉴权头。</div>
              </el-form-item>
              <el-form-item label="订阅状态">
                <el-checkbox-group v-model="callbackWebhookForm.subscribedStatuses" :disabled="!canManage">
                  <el-checkbox v-for="status in callbackStatusOptions" :key="status" :label="status">{{ status }}</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <div class="pipeline-automation-actions">
                <el-button v-if="canManage" type="primary" :loading="callbackWebhookSaving" @click="saveCallbackWebhook">保存配置</el-button>
                <span class="pipeline-automation-meta">最近投递：{{ callbackWebhookDetail?.lastDeliveryAt || '-' }}</span>
                <span class="pipeline-automation-meta">最近结果：{{ callbackWebhookDetail?.lastDeliveryStatus || '-' }}</span>
              </div>
              <div v-if="callbackWebhookDetail?.callbackUrlMasked" class="pipeline-automation-preview">
                当前目标：{{ callbackWebhookDetail.callbackUrlMasked }}
              </div>
            </el-form>
          </section>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-result v-else-if="!loading" icon="warning" title="流水线不存在" sub-title="请确认流水线标识是否正确，或返回列表重新选择。">
      <template #extra>
        <el-button type="primary" @click="goBack">返回流水线中心</el-button>
      </template>
    </el-result>

    <AiClubPipelineFormDialog
      v-model="editDialogVisible"
      :entry-type="entryType"
      :ai-pipeline="aiPipelineDetail"
      :jenkins-binding="jenkinsBindingDetail"
      @saved="handleDetailSaved"
    />
    <AiClubPipelineConfigCompletionDialog
      v-if="isAiEntry"
      v-model="configDialogVisible"
      :pipeline="aiPipelineDetail"
      @completed="handleConfigCompleted"
    />
    <el-dialog v-if="!isMobileViewport" v-model="cronDialogVisible" :title="cronDialogTitle" width="560px" class="platform-form-dialog" align-center>
      <el-form label-position="top" class="platform-form-layout pipeline-automation-form">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">Cron 配置</div>
            <div class="platform-form-section-subtitle">使用带秒的 Cron 表达式，并按需指定分支。</div>
          </div>
          <el-form-item label="名称">
            <el-input v-model="cronForm.name" placeholder="例如：工作日夜间构建" />
          </el-form-item>
          <el-form-item label="分支">
            <el-input v-model="cronForm.branch" placeholder="留空则回退流水线默认分支" />
          </el-form-item>
          <el-form-item label="Cron 表达式">
            <el-input v-model="cronForm.cronExpression" placeholder="例如：0 0 2 * * 1-5" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="cronForm.enabled" />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="cronDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="cronSaving" @click="saveCron">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 移动端 Cron 配置抽屉。 -->
    <MobileFormDrawer
      v-else
      v-model="cronDialogVisible"
      :title="cronDialogTitle"
      :submit-text="'保存'"
      :submitting="cronSaving"
      :header-icon="Connection"
      :close-on-click-modal="true"
      size="88%"
      @submit="saveCron"
      @cancel="cronDialogVisible = false"
    >
      <el-form label-position="top" class="platform-form-layout pipeline-automation-form">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">Cron 配置</div>
            <div class="platform-form-section-subtitle">使用带秒的 Cron 表达式，并按需指定分支。</div>
          </div>
          <el-form-item label="名称">
            <el-input v-model="cronForm.name" placeholder="例如：工作日夜间构建" />
          </el-form-item>
          <el-form-item label="分支">
            <el-input v-model="cronForm.branch" placeholder="留空则回退流水线默认分支" />
          </el-form-item>
          <el-form-item label="Cron 表达式">
            <el-input v-model="cronForm.cronExpression" placeholder="例如：0 0 2 * * 1-5" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="cronForm.enabled" />
          </el-form-item>
        </section>
      </el-form>
    </MobileFormDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Connection, Delete, EditPen, Plus, VideoPlay } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import AiClubPipelineConfigCompletionDialog from '@/components/AiClubPipelineConfigCompletionDialog.vue'
import AiClubPipelineFormDialog from '@/components/AiClubPipelineFormDialog.vue'
import MobileFormDrawer from '@/components/MobileFormDrawer.vue'
import { useMobileViewport } from '@/utils/mobileViewport'
import {
  deleteAiClubPipeline,
  deleteAiClubPipelineCronJob,
  deletePipelineBinding,
  getAiClubPipelineCallbackWebhook,
  getAiClubPipeline,
  getAiClubPipelineConfigStatus,
  getAiClubPipelineRunLog,
  getAiClubPipelineTriggerWebhook,
  getPipelineBinding,
  getPipelineBuildLog,
  listAiClubPipelineCronJobs,
  listAiClubPipelineRuns,
  listPipelineBuilds,
  createAiClubPipelineCronJob,
  syncAiClubPipelineRepository,
  triggerAiClubPipeline,
  triggerPipelineBuild,
  updateAiClubPipelineCallbackWebhook,
  updateAiClubPipelineCronJob,
  updateAiClubPipelineTriggerWebhook
} from '@/api/cicd'
import { useAuthStore } from '@/stores/auth'
import type {
  AiClubPipelineCallbackWebhookItem,
  AiClubPipelineConfigStatusItem,
  AiClubPipelineCronItem,
  AiClubPipelineItem,
  AiClubPipelineTriggerWebhookItem,
  JenkinsBuildLogDetailItem,
  JenkinsBuildItem,
  ProjectPipelineBindingItem
} from '@/types/platform'
import {
  aiClubPipelineConfigStatusTone,
  aiClubPipelineRunStatusType,
  aiClubPipelineStatusTone,
  formatAiClubPipelineConfigStatus,
  formatAiClubPipelineDateTime,
  formatAiClubPipelineStatus
} from '@/utils/aiClubPipeline'

type EntryType = 'AI_CLUB' | 'JENKINS'

interface RunHistoryItem {
  number: number
  status: string | null
  branch: string | null
  event: string | null
  message: string | null
  url: string | null
  startedAt: string | null
  finishedAt: string | null
  durationText: string
}

interface RunLogItem {
  projectName: string
  pipelineName: string
  sourceName: string | null
  runNumber: number
  status: string | null
  branch: string | null
  url: string | null
  startedAt: string | null
  finishedAt: string | null
  consoleLog: string
}

interface LoadRunLogOptions {
  showLoading?: boolean
  silentError?: boolean
}

interface CronFormState {
  name: string
  branch: string
  cronExpression: string
  enabled: boolean
}

interface CallbackWebhookFormState {
  enabled: boolean
  callbackUrl: string
  subscribedStatuses: string[]
}

const route = useRoute()
const router = useRouter()
// 移动端视口断点 900，统一使用全局 composable，弹窗在移动端切换为底部抽屉。
const { isMobileViewport } = useMobileViewport()
const authStore = useAuthStore()

const canManage = computed(() => authStore.hasPermission('cicd:manage'))
const canBuild = computed(() => authStore.hasPermission('cicd:build'))

const loading = ref(false)
const runLoading = ref(false)
const runLogLoading = ref(false)
const triggering = ref(false)
const activeTab = ref('history')
const runHistoryLimit = ref(20)
const aiPipelineDetail = ref<AiClubPipelineItem | null>(null)
const jenkinsBindingDetail = ref<ProjectPipelineBindingItem | null>(null)
const configStatus = ref<AiClubPipelineConfigStatusItem | null>(null)
const cronList = ref<AiClubPipelineCronItem[]>([])
const triggerWebhookDetail = ref<AiClubPipelineTriggerWebhookItem | null>(null)
const callbackWebhookDetail = ref<AiClubPipelineCallbackWebhookItem | null>(null)
const runList = ref<RunHistoryItem[]>([])
const selectedRunNumber = ref<number | null>(null)
const selectedRunLog = ref<RunLogItem | null>(null)
const editDialogVisible = ref(false)
const configDialogVisible = ref(false)
const cronDialogVisible = ref(false)
const isLogTailing = ref(false)
const logScrollbarRef = ref<{ setScrollTop: (value: number) => void } | null>(null)
const cronEditingId = ref<number | null>(null)
const cronSaving = ref(false)
const triggerWebhookSaving = ref(false)
const callbackWebhookSaving = ref(false)

const callbackStatusOptions = ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED']
const cronForm = reactive<CronFormState>({
  name: '',
  branch: '',
  cronExpression: '',
  enabled: true
})
const triggerWebhookForm = reactive({
  enabled: false
})
const callbackWebhookForm = reactive<CallbackWebhookFormState>({
  enabled: false,
  callbackUrl: '',
  subscribedStatuses: ['SUCCESS', 'FAILED', 'CANCELED']
})

const LOG_TAIL_INTERVAL_MS = 5000
const ACTIVE_RUN_STATUSES = new Set(['CREATED', 'PENDING', 'QUEUED', 'RUNNING', 'WAITING'])

let logTailTimer: number | null = null
let runLogRequestSequence = 0

const entryType = computed<EntryType | null>(() => {
  const value = String(route.params.entryType || '').toUpperCase()
  if (value === 'AI_CLUB' || value === 'JENKINS') {
    return value
  }
  return null
})
const entryId = computed(() => Number(route.params.entryId))

const isAiEntry = computed(() => entryType.value === 'AI_CLUB')
const isJenkinsEntry = computed(() => entryType.value === 'JENKINS')

const detailEntry = computed(() => {
  if (isAiEntry.value && aiPipelineDetail.value) {
    return {
      name: aiPipelineDetail.value.name,
      projectName: aiPipelineDetail.value.projectName,
      providerCode: aiPipelineDetail.value.providerCode,
      enabled: aiPipelineDetail.value.enabled,
      defaultBranch: aiPipelineDetail.value.defaultBranch,
      lastRunStatus: aiPipelineDetail.value.lastRunStatus,
      lastRunMessage: aiPipelineDetail.value.lastRunMessage,
      lastTriggeredAt: aiPipelineDetail.value.lastTriggeredAt,
      primaryLabel: '仓库',
      primaryValue: aiPipelineDetail.value.gitlabProjectPath || aiPipelineDetail.value.woodpeckerRepoFullName,
      primaryUrl: aiPipelineDetail.value.gitlabProjectWebUrl || aiPipelineDetail.value.woodpeckerRepoUrl,
      secondaryLabel: '配置文件',
      secondaryValue: aiPipelineDetail.value.configPath
    }
  }
  if (isJenkinsEntry.value && jenkinsBindingDetail.value) {
    return {
      name: jenkinsBindingDetail.value.jobName,
      projectName: jenkinsBindingDetail.value.projectName,
      providerCode: 'JENKINS',
      enabled: jenkinsBindingDetail.value.enabled,
      defaultBranch: jenkinsBindingDetail.value.defaultBranch,
      lastRunStatus: jenkinsBindingDetail.value.lastTriggerStatus,
      lastRunMessage: jenkinsBindingDetail.value.lastTriggerMessage,
      lastTriggeredAt: jenkinsBindingDetail.value.lastTriggeredAt,
      primaryLabel: 'Jenkins Job',
      primaryValue: jenkinsBindingDetail.value.jobName,
      primaryUrl: jenkinsBindingDetail.value.jobUrl,
      secondaryLabel: 'Jenkins 服务',
      secondaryValue: jenkinsBindingDetail.value.jenkinsServerName
    }
  }
  return null
})
const cronDialogTitle = computed(() => (cronEditingId.value ? '编辑 Cron' : '新增 Cron'))

const selectedRunSummary = computed(() => runList.value.find((item) => item.number === selectedRunNumber.value) || null)
const selectedRunSourceLabel = computed(() => (isAiEntry.value ? '仓库' : 'Jenkins 服务'))
const selectedRunNumberLabel = computed(() => (isAiEntry.value ? '运行号' : '构建号'))
const logPlaceholderText = computed(() => {
  if (runLogLoading.value) {
    return '日志加载中，请稍候...'
  }
  return '当前运行暂无可用日志输出。'
})

watch(
  () => [route.params.entryType, route.params.entryId],
  async () => {
    await loadDetail()
  }
)

watch(activeTab, async (value) => {
  if (value === 'log') {
    if (selectedRunNumber.value !== null && selectedRunLog.value === null) {
      await loadRunLog(selectedRunNumber.value)
      return
    }
    resumeLogTailIfNeeded()
    await scrollLogToBottom()
    return
  }
  stopLogTail()
})

onMounted(async () => {
  await loadDetail()
})

onBeforeUnmount(() => {
  stopLogTail()
})

function goBack() {
  router.push({ name: 'cicd-pipelines' })
}

async function loadDetail(preferredRunNumber?: number | null) {
  stopLogTail()
  if (!entryType.value || !Number.isFinite(entryId.value) || entryId.value <= 0) {
    aiPipelineDetail.value = null
    jenkinsBindingDetail.value = null
    configStatus.value = null
    runList.value = []
    selectedRunNumber.value = null
    selectedRunLog.value = null
    return
  }
  loading.value = true
  try {
    if (isAiEntry.value) {
      const [detail, status, runs, cronJobs, triggerWebhook, callbackWebhook] = await Promise.all([
        getAiClubPipeline(entryId.value),
        getAiClubPipelineConfigStatus(entryId.value),
        listAiClubPipelineRuns(entryId.value, runHistoryLimit.value),
        listAiClubPipelineCronJobs(entryId.value),
        getAiClubPipelineTriggerWebhook(entryId.value),
        getAiClubPipelineCallbackWebhook(entryId.value)
      ])
      aiPipelineDetail.value = detail
      jenkinsBindingDetail.value = null
      configStatus.value = status
      cronList.value = cronJobs
      triggerWebhookDetail.value = triggerWebhook
      callbackWebhookDetail.value = callbackWebhook
      syncAutomationForms()
      runList.value = runs.map((run) => ({
        number: run.number,
        status: run.status,
        branch: run.branch,
        event: run.event,
        message: run.message,
        url: run.url,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationText: run.durationText
      }))
    } else {
      const [detail, runs] = await Promise.all([
        getPipelineBinding(entryId.value),
        listPipelineBuilds(entryId.value, runHistoryLimit.value)
      ])
      aiPipelineDetail.value = null
      jenkinsBindingDetail.value = detail
      configStatus.value = null
      cronList.value = []
      triggerWebhookDetail.value = null
      callbackWebhookDetail.value = null
      resetAutomationForms()
      runList.value = runs.map((run) => ({
        number: run.number,
        status: run.building ? 'RUNNING' : run.result,
        branch: detail.defaultBranch,
        event: 'build',
        message: run.description,
        url: run.url,
        startedAt: run.executedAt,
        finishedAt: run.building ? null : run.executedAt,
        durationText: run.durationText
      }))
    }
    const nextRunNumber = resolveSelectedRunNumber(preferredRunNumber)
    selectedRunNumber.value = nextRunNumber
    if (nextRunNumber !== null) {
      await loadRunLog(nextRunNumber)
    } else {
      selectedRunLog.value = null
    }
  } catch (error: any) {
    aiPipelineDetail.value = null
    jenkinsBindingDetail.value = null
    configStatus.value = null
    cronList.value = []
    triggerWebhookDetail.value = null
    callbackWebhookDetail.value = null
    runList.value = []
    selectedRunNumber.value = null
    selectedRunLog.value = null
    ElMessage.error(error?.response?.data?.message || '加载流水线详情失败')
  } finally {
    loading.value = false
  }
}

function resolveSelectedRunNumber(preferredRunNumber?: number | null) {
  if (!runList.value.length) return null
  const candidate = preferredRunNumber ?? selectedRunNumber.value ?? runList.value[0]?.number ?? null
  return runList.value.some((item) => item.number === candidate) ? candidate : (runList.value[0]?.number ?? null)
}

async function reloadRuns() {
  if (!detailEntry.value) return
  runLoading.value = true
  try {
    if (isAiEntry.value) {
      const runs = await listAiClubPipelineRuns(entryId.value, runHistoryLimit.value)
      runList.value = runs.map((run) => ({
        number: run.number,
        status: run.status,
        branch: run.branch,
        event: run.event,
        message: run.message,
        url: run.url,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationText: run.durationText
      }))
    } else {
      const runs = await listPipelineBuilds(entryId.value, runHistoryLimit.value)
      runList.value = runs.map((run) => ({
        number: run.number,
        status: run.building ? 'RUNNING' : run.result,
        branch: jenkinsBindingDetail.value?.defaultBranch || null,
        event: 'build',
        message: run.description,
        url: run.url,
        startedAt: run.executedAt,
        finishedAt: run.building ? null : run.executedAt,
        durationText: run.durationText
      }))
    }
    const nextRunNumber = resolveSelectedRunNumber()
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

async function handleSelectRun(run: RunHistoryItem) {
  await handleSelectRunByNumber(run.number)
}

async function handleSelectRunByNumber(runNumber?: number | null) {
  if (runNumber === null || runNumber === undefined) return
  selectedRunNumber.value = runNumber
  await loadRunLog(runNumber)
}

async function handleOpenRunLog(runNumber: number) {
  activeTab.value = 'log'
  await handleSelectRunByNumber(runNumber)
}

function isActiveRunStatus(status: string | null | undefined) {
  return ACTIVE_RUN_STATUSES.has(String(status || '').trim().toUpperCase())
}

function stopLogTail() {
  if (logTailTimer !== null) {
    window.clearTimeout(logTailTimer)
    logTailTimer = null
  }
  isLogTailing.value = false
}

function scheduleLogTail(runNumber: number, status: string | null) {
  stopLogTail()
  if (activeTab.value !== 'log' || !isActiveRunStatus(status) || selectedRunNumber.value !== runNumber) {
    return
  }
  // 运行中的日志用轻量轮询模拟 tail，避免一次性加载大日志后界面无反馈。
  isLogTailing.value = true
  logTailTimer = window.setTimeout(async () => {
    await loadRunLog(runNumber, { showLoading: false, silentError: true })
  }, LOG_TAIL_INTERVAL_MS)
}

function resumeLogTailIfNeeded() {
  if (selectedRunNumber.value === null || !selectedRunLog.value) {
    stopLogTail()
    return
  }
  scheduleLogTail(selectedRunNumber.value, selectedRunLog.value.status)
}

async function scrollLogToBottom() {
  await nextTick()
  logScrollbarRef.value?.setScrollTop(Number.MAX_SAFE_INTEGER)
}

async function loadRunLog(runNumber: number, options: LoadRunLogOptions = {}) {
  const { showLoading = true, silentError = false } = options
  const requestId = ++runLogRequestSequence
  stopLogTail()
  if (showLoading) {
    runLogLoading.value = true
  }
  try {
    let nextLog: RunLogItem
    if (isAiEntry.value) {
      const log = await getAiClubPipelineRunLog(entryId.value, runNumber)
      nextLog = {
        projectName: log.projectName,
        pipelineName: log.pipelineName,
        sourceName: log.repoFullName,
        runNumber: log.runNumber,
        status: log.status,
        branch: log.branch,
        url: log.url,
        startedAt: log.startedAt,
        finishedAt: log.finishedAt,
        consoleLog: log.consoleLog
      }
    } else {
      const log: JenkinsBuildLogDetailItem = await getPipelineBuildLog(entryId.value, runNumber)
      nextLog = {
        projectName: log.projectName,
        pipelineName: log.jobName,
        sourceName: log.jenkinsServerName,
        runNumber: log.buildNumber,
        status: log.building ? 'RUNNING' : log.result,
        branch: jenkinsBindingDetail.value?.defaultBranch || null,
        url: log.url,
        startedAt: log.executedAt,
        finishedAt: log.building ? null : log.executedAt,
        consoleLog: log.consoleLog
      }
    }
    if (requestId !== runLogRequestSequence) {
      return
    }
    selectedRunLog.value = nextLog
    await scrollLogToBottom()
    scheduleLogTail(runNumber, nextLog.status)
  } catch (error: any) {
    if (!silentError && requestId === runLogRequestSequence) {
      selectedRunLog.value = null
    }
    if (!silentError) {
      ElMessage.error(error?.response?.data?.message || '加载运行日志失败')
    }
  } finally {
    if (showLoading && requestId === runLogRequestSequence) {
      runLogLoading.value = false
    }
  }
}

async function handleTrigger() {
  triggering.value = true
  try {
    const result = isAiEntry.value
      ? await triggerAiClubPipeline(entryId.value)
      : await triggerPipelineBuild(entryId.value)
    ElMessage.success(result.message)
    await loadDetail()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '触发流水线失败')
    await loadDetail()
  } finally {
    triggering.value = false
  }
}

async function handleSync() {
  if (!isAiEntry.value) return
  try {
    aiPipelineDetail.value = await syncAiClubPipelineRepository(entryId.value)
    configStatus.value = await getAiClubPipelineConfigStatus(entryId.value)
    await loadAutomationSettings()
    ElMessage.success('Woodpecker 仓库已同步')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '同步仓库失败')
  }
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认继续吗？', '提示', { type: 'warning' })
    if (isAiEntry.value) {
      await deleteAiClubPipeline(entryId.value)
    } else {
      await deletePipelineBinding(entryId.value)
    }
    ElMessage.success('流水线已删除')
    goBack()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

async function handleDetailSaved(payload: { entryType: EntryType; entry: AiClubPipelineItem | ProjectPipelineBindingItem }) {
  if (payload.entryType === 'AI_CLUB') {
    aiPipelineDetail.value = payload.entry as AiClubPipelineItem
  } else {
    jenkinsBindingDetail.value = payload.entry as ProjectPipelineBindingItem
  }
  await loadDetail(selectedRunNumber.value)
}

async function handleConfigCompleted() {
  await loadDetail(selectedRunNumber.value)
}

function syncAutomationForms() {
  triggerWebhookForm.enabled = Boolean(triggerWebhookDetail.value?.enabled)
  callbackWebhookForm.enabled = Boolean(callbackWebhookDetail.value?.enabled)
  callbackWebhookForm.subscribedStatuses = callbackWebhookDetail.value?.subscribedStatuses?.length
    ? [...callbackWebhookDetail.value.subscribedStatuses]
    : ['SUCCESS', 'FAILED', 'CANCELED']
  if (!callbackWebhookDetail.value?.enabled) {
    callbackWebhookForm.callbackUrl = ''
  }
}

function resetAutomationForms() {
  triggerWebhookForm.enabled = false
  callbackWebhookForm.enabled = false
  callbackWebhookForm.callbackUrl = ''
  callbackWebhookForm.subscribedStatuses = ['SUCCESS', 'FAILED', 'CANCELED']
}

async function loadAutomationSettings() {
  if (!isAiEntry.value) return
  const [cronJobs, triggerWebhook, callbackWebhook] = await Promise.all([
    listAiClubPipelineCronJobs(entryId.value),
    getAiClubPipelineTriggerWebhook(entryId.value),
    getAiClubPipelineCallbackWebhook(entryId.value)
  ])
  cronList.value = cronJobs
  triggerWebhookDetail.value = triggerWebhook
  callbackWebhookDetail.value = callbackWebhook
  syncAutomationForms()
}

function openCreateCronDialog() {
  cronEditingId.value = null
  cronForm.name = ''
  cronForm.branch = aiPipelineDetail.value?.defaultBranch || ''
  cronForm.cronExpression = ''
  cronForm.enabled = true
  cronDialogVisible.value = true
}

function openEditCronDialog(row: AiClubPipelineCronItem) {
  cronEditingId.value = row.id
  cronForm.name = row.name
  cronForm.branch = row.branch || ''
  cronForm.cronExpression = row.cronExpression
  cronForm.enabled = row.enabled
  cronDialogVisible.value = true
}

async function saveCron() {
  if (!isAiEntry.value) return
  if (!cronForm.name.trim()) {
    ElMessage.warning('请输入 Cron 名称')
    return
  }
  if (!cronForm.cronExpression.trim()) {
    ElMessage.warning('请输入 Cron 表达式')
    return
  }
  cronSaving.value = true
  try {
    const payload = {
      name: cronForm.name.trim(),
      branch: cronForm.branch.trim(),
      cronExpression: cronForm.cronExpression.trim(),
      enabled: cronForm.enabled
    }
    if (cronEditingId.value) {
      await updateAiClubPipelineCronJob(entryId.value, cronEditingId.value, payload)
      ElMessage.success('Cron 已更新')
    } else {
      await createAiClubPipelineCronJob(entryId.value, payload)
      ElMessage.success('Cron 已创建')
    }
    cronDialogVisible.value = false
    await loadAutomationSettings()
    await loadDetail(selectedRunNumber.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存 Cron 失败')
  } finally {
    cronSaving.value = false
  }
}

async function handleDeleteCron(row: AiClubPipelineCronItem) {
  if (!isAiEntry.value) return
  try {
    await ElMessageBox.confirm(`确认删除 Cron《${row.name}》吗？`, '提示', { type: 'warning' })
    await deleteAiClubPipelineCronJob(entryId.value, row.id)
    ElMessage.success('Cron 已删除')
    await loadAutomationSettings()
    await loadDetail(selectedRunNumber.value)
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除 Cron 失败')
    }
  }
}

async function saveTriggerWebhook(regenerateToken: boolean) {
  if (!isAiEntry.value) return
  triggerWebhookSaving.value = true
  try {
    triggerWebhookDetail.value = await updateAiClubPipelineTriggerWebhook(entryId.value, {
      enabled: triggerWebhookForm.enabled,
      regenerateToken
    })
    syncAutomationForms()
    await loadDetail(selectedRunNumber.value)
    ElMessage.success(regenerateToken ? '触发 Webhook Token 已重新生成' : '触发 Webhook 配置已保存')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存触发 Webhook 失败')
  } finally {
    triggerWebhookSaving.value = false
  }
}

async function saveCallbackWebhook() {
  if (!isAiEntry.value) return
  const shouldValidateCallbackUrl = callbackWebhookForm.enabled && (
    callbackWebhookForm.callbackUrl.trim().length > 0 || !callbackWebhookDetail.value?.callbackUrlMasked
  )
  if (shouldValidateCallbackUrl && !isValidHttpUrl(callbackWebhookForm.callbackUrl)) {
    ElMessage.warning('请输入合法的 http 或 https 回调地址')
    return
  }
  callbackWebhookSaving.value = true
  try {
    callbackWebhookDetail.value = await updateAiClubPipelineCallbackWebhook(entryId.value, {
      enabled: callbackWebhookForm.enabled,
      callbackUrl: callbackWebhookForm.callbackUrl.trim(),
      subscribedStatuses: callbackWebhookForm.subscribedStatuses
    })
    syncAutomationForms()
    await loadDetail(selectedRunNumber.value)
    ElMessage.success('回调 Webhook 配置已保存')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存回调 Webhook 失败')
  } finally {
    callbackWebhookSaving.value = false
  }
}

async function handleCopyText(value: string) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
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

.pipeline-detail-log-head-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pipeline-detail-log-tail-badge {
  flex: 0 0 auto;
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

.pipeline-detail-trigger-variables {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pipeline-detail-trigger-variable-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  color: var(--app-primary);
  background: rgba(37, 99, 235, 0.08);
  border-radius: 999px;
  font-size: 12px;
}

.pipeline-detail-automation-alert {
  margin-top: 4px;
}

.pipeline-automation-form {
  gap: 12px;
}

.pipeline-automation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.pipeline-automation-meta {
  color: var(--app-muted);
  font-size: 13px;
}

.pipeline-automation-preview {
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.6;
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
