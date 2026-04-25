<template>
  <div class="work-list-page">
    <section class="work-list-toolbar">
      <div class="work-list-toolbar-main">
        <div class="work-list-search-shell">
          <el-icon class="work-list-search-icon"><Search /></el-icon>
          <input
            v-model="bindingFilters.keyword"
            class="work-list-search-input"
            type="text"
            placeholder="搜索项目、Jenkins、Job 或分支..."
            @keyup.enter="handleBindingSearch"
          />
        </div>
        <span class="work-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="bindingFilterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="work-list-filter-popper">
          <template #reference>
            <button class="work-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="work-list-filter-panel work-list-compact-input">
            <div class="work-list-filter-field">
              <label>Jenkins 服务</label>
              <el-select v-model="bindingFilters.serverId" clearable placeholder="Jenkins 服务" style="width: 100%" :teleported="false">
                <el-option v-for="item in serverOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
            <div class="work-list-filter-field">
              <label>启用状态</label>
              <el-select v-model="bindingFilters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="停用" :value="false" />
              </el-select>
            </div>
            <div class="work-list-filter-actions">
              <el-button type="primary" @click="handleBindingSearch">查询</el-button>
              <el-button @click="handleBindingReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="work-list-toolbar-button" type="button" @click="handleBindingReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>

      <div class="work-list-toolbar-side">
        <button v-if="canManage" class="work-list-create-button" type="button" @click="openBindingCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增流水线绑定</span>
        </button>
      </div>
    </section>

    <section class="work-list-shell">
      <div class="work-list-scroll mobile-card-scroll" v-loading="bindingLoading">
        <template v-if="!isMobileViewport">
        <table v-if="bindingList.length" class="work-list-table pipeline-list-table mobile-card-table">
          <thead>
            <tr>
              <th class="pipeline-col-main">项目</th>
              <th class="pipeline-col-server">Jenkins 服务</th>
              <th class="pipeline-col-job">构建任务</th>
              <th class="pipeline-col-branch">默认分支</th>
              <th class="center pipeline-col-enabled">启用</th>
              <th class="center pipeline-col-status">最近触发状态</th>
              <th class="pipeline-col-time">最近触发时间</th>
              <th class="pipeline-col-message">最近结果</th>
              <th v-if="canView" class="right pipeline-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in bindingList" :key="row.id" class="work-list-row">
              <td class="pipeline-col-main" data-label="项目">
                <button class="management-list-title-trigger" type="button" @click="openBindingDetailDialog(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon">
                      <el-icon><DataAnalysis /></el-icon>
                    </span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">{{ row.projectName }}</div>
                      <div class="management-list-subtitle">绑定 #{{ row.id }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="pipeline-col-server" data-label="Jenkins 服务">
                <span class="management-list-text">{{ row.jenkinsServerName }}</span>
              </td>
              <td class="pipeline-col-job" data-label="构建任务">
                <el-link v-if="row.jobUrl" :href="row.jobUrl" target="_blank" type="primary" class="pipeline-job-link">
                  {{ row.jobName }}
                </el-link>
                <span v-else class="management-list-link">{{ row.jobName }}</span>
              </td>
              <td class="pipeline-col-branch" data-label="默认分支">
                <span class="management-list-empty">{{ row.defaultBranch || '-' }}</span>
              </td>
              <td class="center pipeline-col-enabled" data-label="启用">
                <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">
                  {{ row.enabled ? '启用' : '停用' }}
                </span>
              </td>
              <td class="center pipeline-col-status" data-label="最近触发状态">
                <span class="management-list-pill" :class="triggerStatusTone(row.lastTriggerStatus)">
                  {{ formatTriggerStatus(row.lastTriggerStatus) }}
                </span>
              </td>
              <td class="pipeline-col-time" data-label="最近触发时间">
                <span class="management-list-updated">{{ formatDateTime(row.lastTriggeredAt) }}</span>
              </td>
              <td class="pipeline-col-message" data-label="最近结果">
                <span class="management-list-empty">{{ row.lastTriggerMessage || '-' }}</span>
              </td>
              <td v-if="canView" class="right pipeline-col-actions" data-label="操作">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="构建历史" @click="openBuildHistoryDrawer(row)">
                    <el-icon><Tickets /></el-icon>
                  </button>
                  <button v-if="canBuild" class="management-list-row-button" type="button" title="触发构建" @click="handleTriggerBuild(row.id)">
                    <el-icon><VideoPlay /></el-icon>
                  </button>
                  <button v-if="canManage" class="management-list-row-button" type="button" title="编辑绑定" @click="openBindingEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button v-if="canManage" class="management-list-row-button danger" type="button" title="删除绑定" @click="handleBindingDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="work-list-empty-state">
          <el-empty description="当前筛选条件下暂无项目流水线" />
        </div>
        </template>
        <template v-else>
          <div v-if="bindingList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in bindingList" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openBindingDetailDialog(row)">
                    <span class="mobile-entity-icon"><el-icon><DataAnalysis /></el-icon></span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.projectName }}</span>
                      <span class="mobile-entity-description">绑定 #{{ row.id }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">Jenkins</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.jenkinsServerName }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">任务</span>
                    <div class="mobile-entity-field-content">
                      <el-link v-if="row.jobUrl" :href="row.jobUrl" target="_blank" type="primary" class="pipeline-job-link">
                        {{ row.jobName }}
                      </el-link>
                      <span v-else class="mobile-entity-empty-text">{{ row.jobName }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">分支</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.defaultBranch || '-' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">启用</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">
                        {{ row.enabled ? '启用' : '停用' }}
                      </span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="triggerStatusTone(row.lastTriggerStatus)">
                        {{ formatTriggerStatus(row.lastTriggerStatus) }}
                      </span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">时间</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ formatDateTime(row.lastTriggeredAt) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">结果</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.lastTriggerMessage || '-' }}</span>
                    </div>
                  </div>
                </div>
                <footer v-if="canView" class="mobile-entity-actions">
                  <button class="mobile-entity-action-button info" type="button" @click="openBuildHistoryDrawer(row)">
                    <el-icon><Tickets /></el-icon>
                    <span>构建历史</span>
                  </button>
                  <button v-if="canBuild" class="mobile-entity-action-button info" type="button" @click="handleTriggerBuild(row.id)">
                    <el-icon><VideoPlay /></el-icon>
                    <span>触发构建</span>
                  </button>
                  <button v-if="canManage" class="mobile-entity-action-button" type="button" @click="openBindingEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button v-if="canManage" class="mobile-entity-action-button danger" type="button" @click="handleBindingDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
          <div v-else class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无项目流水线" />
          </div>
        </template>
      </div>

      <div class="work-list-footer">
        <div class="work-list-footer-total">
          共 <span>{{ bindingPagination.total }}</span> 条
        </div>
        <div class="work-list-footer-controls">
          <div class="work-list-page-size work-list-compact-input">
            <span>每页</span>
            <el-select v-model="bindingPagination.size" size="small" style="width: 92px" @change="handleBindingSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="work-list-page-nav">
            <button class="work-list-page-button" type="button" :disabled="bindingPagination.page <= 1" @click="handleBindingPrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="work-list-page-text">第 {{ bindingPagination.page }} / {{ bindingTotalPages }} 页</span>
            <button class="work-list-page-button" type="button" :disabled="bindingPagination.page >= bindingTotalPages" @click="handleBindingNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <el-dialog v-model="bindingDialogVisible" :title="bindingDialogTitle" width="720px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="bindingDialogTitle" :subtitle="bindingDialogSubtitle" :icon="DataAnalysis" />
      </template>
      <el-form ref="bindingFormRef" :model="bindingForm" :rules="bindingRules" :disabled="bindingReadonlyMode" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">流水线绑定</div>
            <div class="platform-form-section-subtitle">将平台项目映射到 Jenkins Job，并设置默认分支与构建参数。</div>
          </div>
          <el-form-item label="平台项目" prop="projectId">
            <el-select v-model="bindingForm.projectId" placeholder="请选择项目" style="width: 100%">
              <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Jenkins 服务" prop="jenkinsServerId">
            <el-select v-model="bindingForm.jenkinsServerId" placeholder="请选择 Jenkins 服务" style="width: 100%">
              <el-option v-for="item in serverOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="任务名称" prop="jobName">
            <el-input v-model="bindingForm.jobName" placeholder="支持 folder/job 形式，例如：backend/build" />
            <div class="form-tip">保存时会实时校验该任务是否存在。</div>
          </el-form-item>
          <el-form-item label="默认分支">
            <el-input v-model="bindingForm.defaultBranch" placeholder="例如：main" />
            <div class="form-tip">触发构建时，如参数 JSON 中未配置 branch / BRANCH，且 Jenkins Job 已声明对应参数，系统会自动补充分支参数。</div>
          </el-form-item>
          <el-form-item label="构建参数 JSON">
            <el-input v-model="bindingForm.buildParametersJson" type="textarea" :rows="6" placeholder='例如：{"env":"test","branch":"main"}' />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="bindingForm.enabled" />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="bindingDialogVisible = false">{{ bindingReadonlyMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!bindingReadonlyMode" type="primary" :loading="bindingSubmitting" @click="handleBindingSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="buildDrawerVisible" :title="buildDrawerTitle" size="68%">
      <div class="build-history-toolbar">
        <el-space wrap>
          <el-select v-model="buildHistoryLimit" style="width: 150px" @change="handleBuildHistoryLimitChange">
            <el-option :value="10" label="最近 10 条" />
            <el-option :value="20" label="最近 20 条" />
            <el-option :value="50" label="最近 50 条" />
          </el-select>
          <el-button @click="reloadBuildHistory">刷新</el-button>
        </el-space>
      </div>

      <el-table v-loading="buildLoading" :data="buildList" style="width: 100%">
        <el-table-column prop="number" label="构建号" width="100" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="buildStatusType(row)">{{ formatBuildStatus(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="执行中" width="90">
          <template #default="{ row }">
            <el-tag :type="row.building ? 'warning' : 'info'">{{ row.building ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="executedAt" label="执行时间" width="180" />
        <el-table-column prop="durationText" label="耗时" width="120" />
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="链接" width="90">
          <template #default="{ row }">
            <el-link v-if="row.url" :href="row.url" target="_blank" type="primary">打开</el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openBuildLog(row)">查看日志</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <el-dialog v-model="buildLogVisible" title="构建日志详情" width="900px">
      <el-descriptions v-if="currentBuildLog" :column="2" border>
        <el-descriptions-item label="平台项目">{{ currentBuildLog.projectName }}</el-descriptions-item>
        <el-descriptions-item label="Jenkins 服务">{{ currentBuildLog.jenkinsServerName }}</el-descriptions-item>
        <el-descriptions-item label="Job">{{ currentBuildLog.jobName }}</el-descriptions-item>
        <el-descriptions-item label="构建号">#{{ currentBuildLog.buildNumber }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ formatBuildLogStatus(currentBuildLog) }}</el-descriptions-item>
        <el-descriptions-item label="执行时间">{{ currentBuildLog.executedAt || '-' }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ currentBuildLog.durationText || '-' }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ currentBuildLog.description || '-' }}</el-descriptions-item>
        <el-descriptions-item label="链接" :span="2">
          <el-link v-if="currentBuildLog.url" :href="currentBuildLog.url" target="_blank" type="primary">打开 Jenkins 构建</el-link>
          <span v-else>-</span>
        </el-descriptions-item>
      </el-descriptions>

      <div class="build-log-block">
        <div class="build-log-title">控制台日志</div>
        <el-scrollbar max-height="420px">
          <pre class="build-log-content">{{ currentBuildLog?.consoleLog || '' }}</pre>
        </el-scrollbar>
      </div>

      <template #footer>
        <el-button @click="buildLogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, DataAnalysis, Delete, EditPen, Filter, Plus, RefreshRight, Search, Tickets, VideoPlay } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  createPipelineBinding,
  deletePipelineBinding,
  getPipelineBuildLog,
  listJenkinsServerOptions,
  listPipelineBuilds,
  pagePipelineBindings,
  triggerPipelineBuild,
  updatePipelineBinding
} from '@/api/cicd'
import { listProjectOptions } from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type {
  JenkinsBuildItem,
  JenkinsBuildLogDetailItem,
  JenkinsServerItem,
  ProjectItem,
  ProjectPipelineBindingItem
} from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

/**
 * 流水线绑定表单。
 */
interface PipelineBindingForm {
  /** 平台项目 ID。 */
  projectId: number | null
  /** Jenkins 服务 ID。 */
  jenkinsServerId: number | null
  /** Jenkins Job 名称。 */
  jobName: string
  /** 默认分支。 */
  defaultBranch: string
  /** 构建参数 JSON。 */
  buildParametersJson: string
  /** 是否启用。 */
  enabled: boolean
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('cicd:manage'))
const canBuild = computed(() => authStore.hasPermission('cicd:build'))
const canView = computed(() => authStore.hasPermission('cicd:view'))
const { isMobileViewport } = useMobileViewport()

const projectOptions = ref<ProjectItem[]>([])
const serverOptions = ref<JenkinsServerItem[]>([])

const bindingLoading = ref(false)
const bindingSubmitting = ref(false)
const bindingDialogVisible = ref(false)
const bindingIsEditing = ref(false)
const bindingReadonlyMode = ref(false)
const currentBindingId = ref<number | null>(null)
const bindingList = ref<ProjectPipelineBindingItem[]>([])
const bindingFormRef = ref<FormInstance>()
const bindingPagination = reactive({ page: 1, size: 10, total: 0 })
const bindingFilters = reactive<{ keyword: string; serverId: number | undefined; enabled: boolean | undefined }>({
  keyword: '',
  serverId: undefined,
  enabled: undefined
})
const bindingFilterPopoverVisible = ref(false)
const bindingForm = reactive<PipelineBindingForm>({
  projectId: null,
  jenkinsServerId: null,
  jobName: '',
  defaultBranch: '',
  buildParametersJson: '',
  enabled: true
})

const buildDrawerVisible = ref(false)
const buildDrawerTitle = ref('构建历史')
const buildLoading = ref(false)
const buildHistoryLimit = ref(20)
const buildList = ref<JenkinsBuildItem[]>([])
const currentBuildBindingId = ref<number | null>(null)
const buildLogVisible = ref(false)
const currentBuildLog = ref<JenkinsBuildLogDetailItem | null>(null)

const bindingTotalPages = computed(() => Math.max(1, Math.ceil(bindingPagination.total / bindingPagination.size) || 1))
const bindingDialogTitle = computed(() => {
  if (bindingReadonlyMode.value) {
    return '查看流水线绑定'
  }
  return bindingIsEditing.value ? '编辑流水线绑定' : '新增流水线绑定'
})
const bindingDialogSubtitle = computed(() => {
  if (bindingReadonlyMode.value) {
    return '查看项目与 Jenkins Job 的映射关系。'
  }
  if (bindingIsEditing.value) {
    return '调整项目、Jenkins 服务和构建参数配置。'
  }
  return '填写项目流水线绑定信息，并补充分支和构建参数。'
})

const bindingRules: FormRules<PipelineBindingForm> = {
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
  jenkinsServerId: [{ required: true, message: '请选择 Jenkins 服务', trigger: 'change' }],
  jobName: [{ required: true, message: '请输入 Job 名称', trigger: 'blur' }]
}

/**
 * 同步加载弹窗依赖的项目和 Jenkins 服务选项。
 */
const loadBaseOptions = async () => {
  const [projects, servers] = await Promise.all([listProjectOptions(), listJenkinsServerOptions()])
  projectOptions.value = projects
  serverOptions.value = servers
  if (!bindingForm.projectId && projectOptions.value.length) {
    bindingForm.projectId = projectOptions.value[0].id
  }
  if (!bindingForm.jenkinsServerId && serverOptions.value.length) {
    bindingForm.jenkinsServerId = serverOptions.value[0].id
  }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

const formatTriggerStatus = (status?: string | null) => {
  if (status === 'QUEUED') return '已排队'
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  return status || '未触发'
}

const triggerStatusTone = (status?: string | null) => {
  if (status === 'QUEUED' || status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'neutral'
}

const buildStatusType = (item: JenkinsBuildItem) => {
  if (item.building) return 'warning'
  if (item.result === 'SUCCESS') return 'success'
  if (item.result === 'FAILURE' || item.result === 'FAILED' || item.result === 'ABORTED') return 'danger'
  if (item.result === 'UNSTABLE') return 'warning'
  return 'info'
}

const formatBuildStatus = (item: JenkinsBuildItem) => {
  if (item.building) return '构建中'
  if (item.result === 'SUCCESS') return '成功'
  if (item.result === 'FAILURE' || item.result === 'FAILED') return '失败'
  if (item.result === 'ABORTED') return '已中止'
  if (item.result === 'UNSTABLE') return '不稳定'
  return item.result || '未知'
}

const formatBuildLogStatus = (item: JenkinsBuildLogDetailItem) => {
  if (item.building) return '构建中'
  if (item.result === 'SUCCESS') return '成功'
  if (item.result === 'FAILURE' || item.result === 'FAILED') return '失败'
  if (item.result === 'ABORTED') return '已中止'
  if (item.result === 'UNSTABLE') return '不稳定'
  return item.result || '未知'
}

/**
 * 重置流水线绑定表单，确保新增场景默认选中首个可用项。
 */
const resetBindingForm = () => {
  currentBindingId.value = null
  bindingForm.projectId = projectOptions.value[0]?.id ?? null
  bindingForm.jenkinsServerId = serverOptions.value[0]?.id ?? null
  bindingForm.jobName = ''
  bindingForm.defaultBranch = ''
  bindingForm.buildParametersJson = ''
  bindingForm.enabled = true
  bindingFormRef.value?.clearValidate()
}

const loadBindings = async () => {
  bindingLoading.value = true
  try {
    const pageData = await pagePipelineBindings({
      page: bindingPagination.page,
      size: bindingPagination.size,
      keyword: bindingFilters.keyword,
      serverId: bindingFilters.serverId,
      enabled: bindingFilters.enabled
    })
    bindingList.value = pageData.records
    bindingPagination.total = pageData.total
  } finally {
    bindingLoading.value = false
  }
}

const loadBuildHistory = async (bindingId: number) => {
  buildLoading.value = true
  try {
    buildList.value = await listPipelineBuilds(bindingId, buildHistoryLimit.value)
  } finally {
    buildLoading.value = false
  }
}

const reloadBuildHistory = async () => {
  if (currentBuildBindingId.value === null) return
  await loadBuildHistory(currentBuildBindingId.value)
}

const handleBuildHistoryLimitChange = async () => {
  await reloadBuildHistory()
}

const handleBindingSearch = async () => {
  bindingFilterPopoverVisible.value = false
  bindingPagination.page = 1
  await loadBindings()
}

const handleBindingReset = async () => {
  bindingFilters.keyword = ''
  bindingFilters.serverId = undefined
  bindingFilters.enabled = undefined
  bindingPagination.page = 1
  await loadBindings()
}

const handleBindingSizeChange = async () => {
  bindingPagination.page = 1
  await loadBindings()
}

const handleBindingPrevPage = async () => {
  if (bindingPagination.page <= 1) return
  bindingPagination.page -= 1
  await loadBindings()
}

const handleBindingNextPage = async () => {
  if (bindingPagination.page >= bindingTotalPages.value) return
  bindingPagination.page += 1
  await loadBindings()
}

const openBindingCreateDialog = () => {
  bindingReadonlyMode.value = false
  bindingIsEditing.value = false
  resetBindingForm()
  bindingDialogVisible.value = true
}

const fillBindingForm = (row: ProjectPipelineBindingItem) => {
  bindingIsEditing.value = true
  currentBindingId.value = row.id
  bindingForm.projectId = row.projectId
  bindingForm.jenkinsServerId = row.jenkinsServerId
  bindingForm.jobName = row.jobName
  bindingForm.defaultBranch = row.defaultBranch || ''
  bindingForm.buildParametersJson = row.buildParametersJson || ''
  bindingForm.enabled = row.enabled
}

const openBindingDetailDialog = (row: ProjectPipelineBindingItem) => {
  bindingReadonlyMode.value = true
  fillBindingForm(row)
  bindingDialogVisible.value = true
}

const openBindingEditDialog = (row: ProjectPipelineBindingItem) => {
  bindingReadonlyMode.value = false
  fillBindingForm(row)
  bindingDialogVisible.value = true
}

/**
 * 统一处理流水线绑定的新增与编辑保存。
 */
const handleBindingSubmit = async () => {
  const valid = await bindingFormRef.value?.validate().catch(() => false)
  if (!valid || bindingForm.projectId === null || bindingForm.jenkinsServerId === null) return
  bindingSubmitting.value = true
  try {
    const payload = {
      projectId: bindingForm.projectId,
      jenkinsServerId: bindingForm.jenkinsServerId,
      jobName: bindingForm.jobName,
      defaultBranch: bindingForm.defaultBranch,
      buildParametersJson: bindingForm.buildParametersJson,
      enabled: bindingForm.enabled
    }
    if (bindingIsEditing.value && currentBindingId.value !== null) {
      await updatePipelineBinding(currentBindingId.value, payload)
      ElMessage.success('流水线绑定已更新')
    } else {
      await createPipelineBinding(payload)
      ElMessage.success('流水线绑定已创建')
    }
    bindingDialogVisible.value = false
    await Promise.all([loadBaseOptions(), loadBindings()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    bindingSubmitting.value = false
  }
}

const handleBindingDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认继续吗？', '提示', { type: 'warning' })
    await deletePipelineBinding(id)
    ElMessage.success('流水线绑定已删除')
    await loadBindings()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

const openBuildHistoryDrawer = async (row: ProjectPipelineBindingItem) => {
  currentBuildBindingId.value = row.id
  buildDrawerTitle.value = `构建历史 - ${row.projectName} / ${row.jobName}`
  buildDrawerVisible.value = true
  buildLogVisible.value = false
  currentBuildLog.value = null
  try {
    await loadBuildHistory(row.id)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载构建历史失败')
  }
}

const openBuildLog = async (row: JenkinsBuildItem) => {
  if (currentBuildBindingId.value === null) return
  try {
    currentBuildLog.value = await getPipelineBuildLog(currentBuildBindingId.value, row.number)
    buildLogVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载构建日志失败')
  }
}

const handleTriggerBuild = async (id: number) => {
  try {
    const result = await triggerPipelineBuild(id)
    ElMessage.success(result.message)
    await loadBindings()
    if (currentBuildBindingId.value === id && buildDrawerVisible.value) {
      await loadBuildHistory(id)
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '触发构建失败')
    await loadBindings()
  }
}

onMounted(async () => {
  await loadBaseOptions()
  await loadBindings()
})
</script>

<style scoped>
.pipeline-list-table {
  min-width: 0;
}

.pipeline-col-main {
  width: 15%;
}

.pipeline-col-server {
  width: 12%;
}

.pipeline-col-job {
  width: 17%;
}

.pipeline-col-branch {
  width: 9%;
}

.pipeline-col-enabled {
  width: 7%;
}

.pipeline-col-status {
  width: 10%;
}

.pipeline-col-time {
  width: 11%;
}

.pipeline-col-message {
  width: 10%;
}

.pipeline-col-actions {
  width: 9%;
}

.pipeline-col-server .management-list-text,
.pipeline-col-job .management-list-link,
.pipeline-col-branch .management-list-empty,
.pipeline-col-message .management-list-empty {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pipeline-job-link {
  max-width: 100%;
}

.form-tip {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.build-history-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.build-log-block {
  margin-top: 16px;
}

.build-log-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.build-log-content {
  margin: 0;
  padding: 16px;
  color: #f8fafc;
  background: #111827;
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
