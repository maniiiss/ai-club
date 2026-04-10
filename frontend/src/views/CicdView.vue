<template>
  <div class="cicd-page">
    <el-space direction="vertical" fill size="20" class="cicd-page-stack">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="Jenkins 服务" name="servers">
          <el-card class="page-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span>Jenkins 服务管理</span>
                <el-button v-if="canManage" type="primary" @click="openServerCreateDialog">新增 Jenkins 服务</el-button>
              </div>
            </template>

            <el-form :inline="true" class="filter-form">
              <el-form-item>
                <el-input v-model="serverFilters.keyword" clearable placeholder="搜索名称 / 地址 / 用户名" @keyup.enter="handleServerSearch" />
              </el-form-item>
              <el-form-item>
                <el-select v-model="serverFilters.enabled" clearable placeholder="状态" style="width: 140px">
                  <el-option label="启用" :value="true" />
                  <el-option label="停用" :value="false" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="handleServerSearch">查询</el-button>
                <el-button @click="handleServerReset">重置</el-button>
              </el-form-item>
            </el-form>

            <el-table v-loading="serverLoading" :data="serverList" style="width: 100%">
              <el-table-column prop="name" label="名称" min-width="160" />
              <el-table-column prop="baseUrl" label="Jenkins 地址" min-width="240" show-overflow-tooltip />
              <el-table-column prop="username" label="用户名" width="140" />
              <el-table-column prop="lastJobCount" label="任务数" width="90" />
              <el-table-column label="启用" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="测试状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="testStatusType(row.lastTestStatus)">{{ row.lastTestStatus || '未测试' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="lastTestedAt" label="最近测试时间" width="180" />
              <el-table-column prop="lastTestMessage" label="测试信息" min-width="280" show-overflow-tooltip />
              <el-table-column v-if="canManage" label="操作" width="320" fixed="right">
                <template #default="{ row }">
                  <el-space wrap>
                    <el-button link type="success" @click="handleServerTest(row.id)">测试连接</el-button>
                    <el-button link type="primary" @click="openJobDrawer(row)">查看任务</el-button>
                    <el-button link type="warning" @click="openServerEditDialog(row)">编辑</el-button>
                    <el-button link type="danger" @click="handleServerDelete(row.id)">删除</el-button>
                  </el-space>
                </template>
              </el-table-column>
            </el-table>

            <div class="pagination-wrap">
              <el-pagination
                v-model:current-page="serverPagination.page"
                v-model:page-size="serverPagination.size"
                background
                layout="total, sizes, prev, pager, next, jumper"
                :page-sizes="[5, 10, 20, 50]"
                :total="serverPagination.total"
                @current-change="loadServers"
                @size-change="handleServerSizeChange"
              />
            </div>
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="项目流水线" name="pipelines">
          <el-card class="page-card" shadow="never">
            <template #header>
              <div class="card-header">
                <span>项目流水线绑定</span>
                <el-button v-if="canManage" type="primary" @click="openBindingCreateDialog">新增流水线绑定</el-button>
              </div>
            </template>

            <el-form :inline="true" class="filter-form">
              <el-form-item>
                <el-input v-model="bindingFilters.keyword" clearable placeholder="搜索项目 / Jenkins / Job / 分支" @keyup.enter="handleBindingSearch" />
              </el-form-item>
              <el-form-item>
                <el-select v-model="bindingFilters.serverId" clearable placeholder="Jenkins 服务" style="width: 220px">
                  <el-option v-for="item in serverOptions" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-select v-model="bindingFilters.enabled" clearable placeholder="状态" style="width: 140px">
                  <el-option label="启用" :value="true" />
                  <el-option label="停用" :value="false" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="handleBindingSearch">查询</el-button>
                <el-button @click="handleBindingReset">重置</el-button>
              </el-form-item>
            </el-form>

            <el-table v-loading="bindingLoading" :data="bindingList" style="width: 100%">
              <el-table-column prop="projectName" label="项目" min-width="160" />
              <el-table-column prop="jenkinsServerName" label="Jenkins 服务" min-width="160" />
              <el-table-column label="构建任务" min-width="240" show-overflow-tooltip>
                <template #default="{ row }">
                  <el-link v-if="row.jobUrl" :href="row.jobUrl" target="_blank" type="primary">{{ row.jobName }}</el-link>
                  <span v-else>{{ row.jobName }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="defaultBranch" label="默认分支" width="140" />
              <el-table-column label="启用" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="最近触发状态" width="120">
                <template #default="{ row }">
                  <el-tag :type="triggerStatusType(row.lastTriggerStatus)">{{ formatTriggerStatus(row.lastTriggerStatus) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="lastTriggeredAt" label="最近触发时间" width="180" />
              <el-table-column prop="lastTriggerMessage" label="最近结果" min-width="260" show-overflow-tooltip />
              <el-table-column v-if="canView" label="操作" width="380" fixed="right">
                <template #default="{ row }">
                  <el-space wrap>
                    <el-button link type="primary" @click="openBuildHistoryDrawer(row)">构建历史</el-button>
                    <el-button v-if="canManage" link type="success" @click="handleTriggerBuild(row.id)">触发构建</el-button>
                    <el-button v-if="canManage" link type="warning" @click="openBindingEditDialog(row)">编辑</el-button>
                    <el-button v-if="canManage" link type="danger" @click="handleBindingDelete(row.id)">删除</el-button>
                  </el-space>
                </template>
              </el-table-column>
            </el-table>

            <div class="pagination-wrap">
              <el-pagination
                v-model:current-page="bindingPagination.page"
                v-model:page-size="bindingPagination.size"
                background
                layout="total, sizes, prev, pager, next, jumper"
                :page-sizes="[5, 10, 20, 50]"
                :total="bindingPagination.total"
                @current-change="loadBindings"
                @size-change="handleBindingSizeChange"
              />
            </div>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </el-space>
  </div>

  <el-dialog v-model="serverDialogVisible" :title="serverIsEditing ? '编辑 Jenkins 服务' : '新增 Jenkins 服务'" width="640px" class="platform-form-dialog" align-center>
    <el-form ref="serverFormRef" :model="serverForm" :rules="serverRules" label-width="110px" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">Jenkins 服务</div>
          <div class="platform-form-section-subtitle">配置 Jenkins 地址、认证信息和启用状态。</div>
        </div>
        <el-form-item label="名称" prop="name">
          <el-input v-model="serverForm.name" placeholder="例如：测试环境 Jenkins" />
        </el-form-item>
        <el-form-item label="Jenkins 地址" prop="baseUrl">
          <el-input v-model="serverForm.baseUrl" placeholder="例如：http://jenkins.example.com" />
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="serverForm.username" placeholder="请输入 Jenkins 用户名" />
        </el-form-item>
        <el-form-item label="API 令牌">
          <el-input v-model="serverForm.apiToken" type="password" show-password :placeholder="serverIsEditing ? '留空则保留原令牌' : '请输入 API 令牌'" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="serverForm.description" type="textarea" :rows="3" placeholder="可填写用途、环境说明等" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="serverForm.enabled" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="serverDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="serverSubmitting" @click="handleServerSubmit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="bindingDialogVisible" :title="bindingIsEditing ? '编辑流水线绑定' : '新增流水线绑定'" width="720px" class="platform-form-dialog" align-center>
    <el-form ref="bindingFormRef" :model="bindingForm" :rules="bindingRules" label-width="120px" class="platform-form-layout">
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
          <div class="form-tip">触发构建时，如参数 JSON 中未配置 branch / BRANCH，会自动补充 branch={{ bindingForm.defaultBranch || '你的默认分支' }}。</div>
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
      <el-button @click="bindingDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="bindingSubmitting" @click="handleBindingSubmit">保存</el-button>
    </template>
  </el-dialog>

  <el-drawer v-model="jobDrawerVisible" :title="jobDrawerTitle" size="60%">
    <el-table v-loading="jobLoading" :data="jobList" style="width: 100%">
      <el-table-column label="名称" min-width="180">
        <template #default="{ row }">
          <el-link v-if="row.url" :href="row.url" target="_blank" type="primary">{{ row.name }}</el-link>
          <span v-else>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="fullName" label="完整名称" min-width="240" show-overflow-tooltip />
      <el-table-column prop="color" label="状态色" width="110" />
      <el-table-column prop="lastBuildNumber" label="最近构建号" width="110" />
      <el-table-column prop="lastBuildResult" label="最近结果" width="120" />
      <el-table-column prop="lastBuildAt" label="最近构建时间" width="180" />
      <el-table-column v-if="canManage" label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="success"
            :loading="jobTriggeringName === row.fullName"
            @click="handleTriggerJenkinsJob(row)"
          >
            构建
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-drawer>

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
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { listProjectOptions } from '@/api/platform'
import {
  createJenkinsServer,
  createPipelineBinding,
  deleteJenkinsServer,
  deletePipelineBinding,
  getPipelineBuildLog,
  listJenkinsJobs,
  listJenkinsServerOptions,
  listPipelineBuilds,
  pageJenkinsServers,
  pagePipelineBindings,
  testJenkinsServer,
  triggerJenkinsJob,
  triggerPipelineBuild,
  updateJenkinsServer,
  updatePipelineBinding
} from '@/api/cicd'
import { useAuthStore } from '@/stores/auth'
import type {
  JenkinsBuildItem,
  JenkinsBuildLogDetailItem,
  JenkinsJobItem,
  JenkinsServerItem,
  ProjectItem,
  ProjectPipelineBindingItem
} from '@/types/platform'

interface JenkinsServerForm {
  name: string
  baseUrl: string
  username: string
  apiToken: string
  description: string
  enabled: boolean
}

interface PipelineBindingForm {
  projectId: number | null
  jenkinsServerId: number | null
  jobName: string
  defaultBranch: string
  buildParametersJson: string
  enabled: boolean
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('cicd:manage'))
const canView = computed(() => authStore.hasPermission('cicd:view'))
const activeTab = ref('servers')

const projectOptions = ref<ProjectItem[]>([])
const serverOptions = ref<JenkinsServerItem[]>([])

const serverLoading = ref(false)
const serverSubmitting = ref(false)
const serverDialogVisible = ref(false)
const serverIsEditing = ref(false)
const currentServerId = ref<number | null>(null)
const serverList = ref<JenkinsServerItem[]>([])
const serverFormRef = ref<FormInstance>()
const serverPagination = reactive({ page: 1, size: 10, total: 0 })
const serverFilters = reactive<{ keyword: string; enabled: boolean | undefined }>({ keyword: '', enabled: undefined })
const serverForm = reactive<JenkinsServerForm>({ name: '', baseUrl: '', username: '', apiToken: '', description: '', enabled: true })

const bindingLoading = ref(false)
const bindingSubmitting = ref(false)
const bindingDialogVisible = ref(false)
const bindingIsEditing = ref(false)
const currentBindingId = ref<number | null>(null)
const bindingList = ref<ProjectPipelineBindingItem[]>([])
const bindingFormRef = ref<FormInstance>()
const bindingPagination = reactive({ page: 1, size: 10, total: 0 })
const bindingFilters = reactive<{ keyword: string; serverId: number | undefined; enabled: boolean | undefined }>({ keyword: '', serverId: undefined, enabled: undefined })
const bindingForm = reactive<PipelineBindingForm>({ projectId: null, jenkinsServerId: null, jobName: '', defaultBranch: '', buildParametersJson: '', enabled: true })

const jobDrawerVisible = ref(false)
const jobDrawerTitle = ref('Jenkins Job 列表')
const jobLoading = ref(false)
const jobList = ref<JenkinsJobItem[]>([])
const currentJobServerId = ref<number | null>(null)
const jobTriggeringName = ref('')

const buildDrawerVisible = ref(false)
const buildDrawerTitle = ref('构建历史')
const buildLoading = ref(false)
const buildHistoryLimit = ref(20)
const buildList = ref<JenkinsBuildItem[]>([])
const currentBuildBindingId = ref<number | null>(null)
const buildLogVisible = ref(false)
const currentBuildLog = ref<JenkinsBuildLogDetailItem | null>(null)

const serverRules: FormRules<JenkinsServerForm> = {
  name: [{ required: true, message: '请输入 Jenkins 名称', trigger: 'blur' }],
  baseUrl: [{ required: true, message: '请输入 Jenkins 地址', trigger: 'blur' }],
  username: [{ required: true, message: '请输入 Jenkins 用户名', trigger: 'blur' }]
}

const bindingRules: FormRules<PipelineBindingForm> = {
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
  jenkinsServerId: [{ required: true, message: '请选择 Jenkins 服务', trigger: 'change' }],
  jobName: [{ required: true, message: '请输入 Job 名称', trigger: 'blur' }]
}

const testStatusType = (status?: string | null) => (status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : 'info')
const triggerStatusType = (status?: string | null) => (status === 'QUEUED' || status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : 'info')
const formatTriggerStatus = (status?: string | null) => {
  if (status === 'QUEUED') return '已排队'
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  return status || '未触发'
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

const resetServerForm = () => {
  currentServerId.value = null
  serverForm.name = ''
  serverForm.baseUrl = ''
  serverForm.username = ''
  serverForm.apiToken = ''
  serverForm.description = ''
  serverForm.enabled = true
  serverFormRef.value?.clearValidate()
}

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

const loadBaseOptions = async () => {
  const [projects, servers] = await Promise.all([listProjectOptions(), listJenkinsServerOptions()])
  projectOptions.value = projects
  serverOptions.value = servers
  if (!bindingForm.projectId && projectOptions.value.length > 0) bindingForm.projectId = projectOptions.value[0].id
  if (!bindingForm.jenkinsServerId && serverOptions.value.length > 0) bindingForm.jenkinsServerId = serverOptions.value[0].id
}

const loadServers = async () => {
  serverLoading.value = true
  try {
    const pageData = await pageJenkinsServers({
      page: serverPagination.page,
      size: serverPagination.size,
      keyword: serverFilters.keyword,
      enabled: serverFilters.enabled
    })
    serverList.value = pageData.records
    serverPagination.total = pageData.total
  } finally {
    serverLoading.value = false
  }
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

const refreshAll = async () => {
  await loadBaseOptions()
  await Promise.all([loadServers(), loadBindings()])
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

const handleServerSearch = async () => {
  serverPagination.page = 1
  await loadServers()
}

const handleServerReset = async () => {
  serverFilters.keyword = ''
  serverFilters.enabled = undefined
  serverPagination.page = 1
  await loadServers()
}

const handleServerSizeChange = async () => {
  serverPagination.page = 1
  await loadServers()
}

const handleBindingSearch = async () => {
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

const openServerCreateDialog = () => {
  serverIsEditing.value = false
  resetServerForm()
  serverDialogVisible.value = true
}

const openServerEditDialog = (row: JenkinsServerItem) => {
  serverIsEditing.value = true
  currentServerId.value = row.id
  serverForm.name = row.name
  serverForm.baseUrl = row.baseUrl
  serverForm.username = row.username
  serverForm.apiToken = ''
  serverForm.description = row.description
  serverForm.enabled = row.enabled
  serverDialogVisible.value = true
}

const handleServerSubmit = async () => {
  const valid = await serverFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!serverIsEditing.value && !serverForm.apiToken.trim()) {
    ElMessage.warning('新增 Jenkins 服务时必须填写 API Token')
    return
  }
  serverSubmitting.value = true
  try {
    const payload = { ...serverForm }
    if (serverIsEditing.value && currentServerId.value !== null) {
      await updateJenkinsServer(currentServerId.value, payload)
      ElMessage.success('Jenkins 服务已更新')
    } else {
      await createJenkinsServer(payload)
      ElMessage.success('Jenkins 服务已创建')
    }
    serverDialogVisible.value = false
    await refreshAll()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    serverSubmitting.value = false
  }
}

const handleServerDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认继续吗？', '提示', { type: 'warning' })
    await deleteJenkinsServer(id)
    ElMessage.success('Jenkins 服务已删除')
    await refreshAll()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

const handleServerTest = async (id: number) => {
  try {
    const result = await testJenkinsServer(id)
    ElMessage.success(result.lastTestMessage || '连接成功')
    await refreshAll()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '测试连接失败')
    await loadServers()
  }
}

const openJobDrawer = async (row: JenkinsServerItem) => {
  currentJobServerId.value = row.id
  jobDrawerTitle.value = `Jenkins Job 列表 - ${row.name}`
  jobDrawerVisible.value = true
  jobLoading.value = true
  try {
    jobList.value = await listJenkinsJobs(row.id)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Job 列表失败')
  } finally {
    jobLoading.value = false
  }
}

const handleTriggerJenkinsJob = async (row: JenkinsJobItem) => {
  if (currentJobServerId.value === null) return
  jobTriggeringName.value = row.fullName
  try {
    const result = await triggerJenkinsJob(currentJobServerId.value, row.fullName || row.name)
    ElMessage.success(result.message)
    jobList.value = await listJenkinsJobs(currentJobServerId.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '触发构建失败')
  } finally {
    jobTriggeringName.value = ''
  }
}

const openBindingCreateDialog = () => {
  bindingIsEditing.value = false
  resetBindingForm()
  bindingDialogVisible.value = true
}

const openBindingEditDialog = (row: ProjectPipelineBindingItem) => {
  bindingIsEditing.value = true
  currentBindingId.value = row.id
  bindingForm.projectId = row.projectId
  bindingForm.jenkinsServerId = row.jenkinsServerId
  bindingForm.jobName = row.jobName
  bindingForm.defaultBranch = row.defaultBranch || ''
  bindingForm.buildParametersJson = row.buildParametersJson || ''
  bindingForm.enabled = row.enabled
  bindingDialogVisible.value = true
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
    await refreshAll()
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
  await refreshAll()
})
</script>

<style scoped>
.cicd-page,
.cicd-page-stack {
  width: 100%;
}

.cicd-page :deep(.el-space),
.cicd-page :deep(.el-space__wrapper),
.cicd-page :deep(.el-tabs),
.cicd-page :deep(.el-tabs__content),
.cicd-page :deep(.el-tab-pane),
.cicd-page :deep(.el-card) {
  width: 100%;
}

.card-header,
.filter-form,
.pagination-wrap {
  display: flex;
  align-items: center;
}

.card-header {
  justify-content: space-between;
}

.filter-form {
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.pagination-wrap {
  justify-content: flex-end;
  margin-top: 18px;
}

.form-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
  margin-top: 6px;
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
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: Consolas, 'Courier New', monospace;
  line-height: 1.6;
}
</style>
