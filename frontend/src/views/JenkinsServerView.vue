<template>
  <div class="work-list-page">
    <section class="work-list-toolbar">
      <div class="work-list-toolbar-main">
        <div class="work-list-search-shell">
          <el-icon class="work-list-search-icon"><Search /></el-icon>
          <input
            v-model="serverFilters.keyword"
            class="work-list-search-input"
            type="text"
            placeholder="搜索 Jenkins 名称、地址或用户名..."
            @keyup.enter="handleServerSearch"
          />
        </div>
        <span class="work-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="serverFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="work-list-filter-popper">
          <template #reference>
            <button class="work-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="work-list-filter-panel work-list-compact-input">
            <div class="work-list-filter-field">
              <label>启用状态</label>
              <el-select v-model="serverFilters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="停用" :value="false" />
              </el-select>
            </div>
            <div class="work-list-filter-actions">
              <el-button type="primary" @click="handleServerSearch">查询</el-button>
              <el-button @click="handleServerReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="work-list-toolbar-button" type="button" @click="handleServerReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>

      <div class="work-list-toolbar-side">
        <button v-if="canManage" class="work-list-create-button" type="button" @click="openServerCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增 Jenkins 服务</span>
        </button>
      </div>
    </section>

    <section class="work-list-shell">
      <div class="work-list-scroll mobile-card-scroll" v-loading="serverLoading">
        <table v-if="serverList.length" class="work-list-table jenkins-list-table mobile-card-table">
          <thead>
            <tr>
              <th class="jenkins-col-main">服务</th>
              <th class="jenkins-col-url">Jenkins 地址</th>
              <th class="jenkins-col-user">用户名</th>
              <th class="center jenkins-col-count">任务数</th>
              <th class="center jenkins-col-enabled">启用</th>
              <th class="center jenkins-col-test">测试状态</th>
              <th class="jenkins-col-time">最近测试时间</th>
              <th class="jenkins-col-message">测试信息</th>
              <th v-if="canManage" class="right jenkins-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in serverList" :key="row.id" class="work-list-row">
              <td class="jenkins-col-main" data-label="服务">
                <button class="management-list-title-trigger" type="button" @click="openServerDetailDialog(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon">
                      <el-icon><Connection /></el-icon>
                    </span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">{{ row.name }}</div>
                      <div class="management-list-subtitle">{{ row.description || '暂无描述' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="jenkins-col-url" data-label="Jenkins 地址">
                <a class="management-list-link" :href="row.baseUrl" target="_blank" rel="noreferrer">{{ row.baseUrl }}</a>
              </td>
              <td class="jenkins-col-user" data-label="用户名">
                <span class="management-list-text">{{ row.username }}</span>
              </td>
              <td class="center jenkins-col-count" data-label="任务数">
                <span class="management-list-pill neutral">{{ row.lastJobCount ?? 0 }}</span>
              </td>
              <td class="center jenkins-col-enabled" data-label="启用">
                <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">
                  {{ row.enabled ? '启用' : '停用' }}
                </span>
              </td>
              <td class="center jenkins-col-test" data-label="测试状态">
                <span class="management-list-pill" :class="testStatusTone(row.lastTestStatus)">
                  {{ formatTestStatus(row.lastTestStatus) }}
                </span>
              </td>
              <td class="jenkins-col-time" data-label="最近测试时间">
                <span class="management-list-updated">{{ formatDateTime(row.lastTestedAt) }}</span>
              </td>
              <td class="jenkins-col-message" data-label="测试信息">
                <span class="management-list-empty">{{ row.lastTestMessage || '-' }}</span>
              </td>
              <td v-if="canManage" class="right jenkins-col-actions" data-label="操作">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="测试连接" @click="handleServerTest(row.id)">
                    <el-icon><Promotion /></el-icon>
                  </button>
                  <button class="management-list-row-button" type="button" title="查看任务" @click="openJobDrawer(row)">
                    <el-icon><Tickets /></el-icon>
                  </button>
                  <button class="management-list-row-button" type="button" title="编辑服务" @click="openServerEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button class="management-list-row-button danger" type="button" title="删除服务" @click="handleServerDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="work-list-empty-state">
          <el-empty description="当前筛选条件下暂无 Jenkins 服务" />
        </div>
      </div>

      <div class="work-list-footer">
        <div class="work-list-footer-total">
          共 <span>{{ serverPagination.total }}</span> 条
        </div>
        <div class="work-list-footer-controls">
          <div class="work-list-page-size work-list-compact-input">
            <span>每页</span>
            <el-select v-model="serverPagination.size" size="small" style="width: 92px" @change="handleServerSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="work-list-page-nav">
            <button class="work-list-page-button" type="button" :disabled="serverPagination.page <= 1" @click="handleServerPrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="work-list-page-text">第 {{ serverPagination.page }} / {{ serverTotalPages }} 页</span>
            <button class="work-list-page-button" type="button" :disabled="serverPagination.page >= serverTotalPages" @click="handleServerNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <el-dialog v-model="serverDialogVisible" :title="serverDialogTitle" width="640px" class="platform-form-dialog" align-center>
      <el-form ref="serverFormRef" :model="serverForm" :rules="serverRules" :disabled="serverReadonlyMode" label-width="110px" class="platform-form-layout">
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
            <el-input
              v-model="serverForm.apiToken"
              type="password"
              show-password
              :placeholder="serverIsEditing ? '留空则保留原令牌' : '请输入 API 令牌'"
            />
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
        <el-button @click="serverDialogVisible = false">{{ serverReadonlyMode ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!serverReadonlyMode" type="primary" :loading="serverSubmitting" @click="handleServerSubmit">保存</el-button>
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
              :loading="jobTriggeringName === (row.fullName || row.name)"
              @click="handleTriggerJenkinsJob(row)"
            >
              构建
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Connection, Delete, EditPen, Filter, Plus, Promotion, RefreshRight, Search, Tickets } from '@element-plus/icons-vue'
import {
  createJenkinsServer,
  deleteJenkinsServer,
  listJenkinsJobs,
  pageJenkinsServers,
  testJenkinsServer,
  triggerJenkinsJob,
  updateJenkinsServer
} from '@/api/cicd'
import { useAuthStore } from '@/stores/auth'
import type { JenkinsJobItem, JenkinsServerItem } from '@/types/platform'

/**
 * Jenkins 服务表单。
 */
interface JenkinsServerForm {
  /** 服务名称。 */
  name: string
  /** Jenkins 基础地址。 */
  baseUrl: string
  /** 登录用户名。 */
  username: string
  /** API 令牌。 */
  apiToken: string
  /** 服务描述。 */
  description: string
  /** 是否启用。 */
  enabled: boolean
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('cicd:manage'))

const serverLoading = ref(false)
const serverSubmitting = ref(false)
const serverDialogVisible = ref(false)
const serverIsEditing = ref(false)
const serverReadonlyMode = ref(false)
const currentServerId = ref<number | null>(null)
const serverList = ref<JenkinsServerItem[]>([])
const serverFormRef = ref<FormInstance>()
const serverPagination = reactive({ page: 1, size: 10, total: 0 })
const serverFilters = reactive<{ keyword: string; enabled: boolean | undefined }>({ keyword: '', enabled: undefined })
const serverFilterPopoverVisible = ref(false)
const serverForm = reactive<JenkinsServerForm>({ name: '', baseUrl: '', username: '', apiToken: '', description: '', enabled: true })

const jobDrawerVisible = ref(false)
const jobDrawerTitle = ref('Jenkins Job 列表')
const jobLoading = ref(false)
const jobList = ref<JenkinsJobItem[]>([])
const currentJobServerId = ref<number | null>(null)
const jobTriggeringName = ref('')

const serverTotalPages = computed(() => Math.max(1, Math.ceil(serverPagination.total / serverPagination.size) || 1))
const serverDialogTitle = computed(() => {
  if (serverReadonlyMode.value) {
    return '查看 Jenkins 服务'
  }
  return serverIsEditing.value ? '编辑 Jenkins 服务' : '新增 Jenkins 服务'
})

const serverRules: FormRules<JenkinsServerForm> = {
  name: [{ required: true, message: '请输入 Jenkins 名称', trigger: 'blur' }],
  baseUrl: [{ required: true, message: '请输入 Jenkins 地址', trigger: 'blur' }],
  username: [{ required: true, message: '请输入 Jenkins 用户名', trigger: 'blur' }]
}

/**
 * 将后端返回的时间串格式化为列表适合展示的短时间。
 */
const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

const formatTestStatus = (status?: string | null) => {
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  return status || '未测试'
}

const testStatusTone = (status?: string | null) => {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'neutral'
}

/**
 * 重置服务表单，避免新增和编辑场景相互污染。
 */
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

const handleServerSearch = async () => {
  serverFilterPopoverVisible.value = false
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

const handleServerPrevPage = async () => {
  if (serverPagination.page <= 1) return
  serverPagination.page -= 1
  await loadServers()
}

const handleServerNextPage = async () => {
  if (serverPagination.page >= serverTotalPages.value) return
  serverPagination.page += 1
  await loadServers()
}

const openServerCreateDialog = () => {
  serverReadonlyMode.value = false
  serverIsEditing.value = false
  resetServerForm()
  serverDialogVisible.value = true
}

const fillServerForm = (row: JenkinsServerItem) => {
  serverIsEditing.value = true
  currentServerId.value = row.id
  serverForm.name = row.name
  serverForm.baseUrl = row.baseUrl
  serverForm.username = row.username
  serverForm.apiToken = ''
  serverForm.description = row.description
  serverForm.enabled = row.enabled
}

const openServerDetailDialog = (row: JenkinsServerItem) => {
  serverReadonlyMode.value = true
  fillServerForm(row)
  serverDialogVisible.value = true
}

const openServerEditDialog = (row: JenkinsServerItem) => {
  serverReadonlyMode.value = false
  fillServerForm(row)
  serverDialogVisible.value = true
}

/**
 * 统一处理 Jenkins 服务的新增与编辑保存。
 */
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
    await loadServers()
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
    await loadServers()
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
    await loadServers()
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

/**
 * 在任务抽屉中直接触发指定 Job 构建，完成后刷新当前服务的任务列表。
 */
const handleTriggerJenkinsJob = async (row: JenkinsJobItem) => {
  if (currentJobServerId.value === null) return
  const jobName = row.fullName || row.name
  jobTriggeringName.value = jobName
  try {
    const result = await triggerJenkinsJob(currentJobServerId.value, jobName)
    ElMessage.success(result.message)
    jobList.value = await listJenkinsJobs(currentJobServerId.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '触发构建失败')
  } finally {
    jobTriggeringName.value = ''
  }
}

onMounted(async () => {
  await loadServers()
})
</script>

<style scoped>
.jenkins-list-table {
  min-width: 0;
}

.jenkins-col-main {
  width: 21%;
}

.jenkins-col-url {
  width: 15%;
}

.jenkins-col-user {
  width: 8%;
}

.jenkins-col-count {
  width: 6%;
}

.jenkins-col-enabled {
  width: 7%;
}

.jenkins-col-test {
  width: 9%;
}

.jenkins-col-time {
  width: 10%;
}

.jenkins-col-message {
  width: 13%;
}

.jenkins-col-actions {
  width: 11%;
}

.jenkins-col-url .management-list-link,
.jenkins-col-user .management-list-text,
.jenkins-col-message .management-list-empty {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jenkins-col-url .management-list-link {
  color: var(--app-text);
}

.jenkins-col-url .management-list-link:hover {
  color: var(--app-primary);
}
</style>
