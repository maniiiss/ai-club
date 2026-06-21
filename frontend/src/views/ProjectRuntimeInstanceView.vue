<template>
  <div class="work-list-page runtime-instance-page">
    <section class="work-list-toolbar">
      <div class="work-list-toolbar-main">
        <div class="work-list-search-shell">
          <el-icon class="work-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="work-list-search-input"
            type="text"
            placeholder="搜索实例、环境、服务、服务器或健康目标..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="work-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="filterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="work-list-filter-popper">
          <template #reference>
            <button class="work-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="work-list-filter-panel work-list-compact-input">
            <div class="work-list-filter-field">
              <label>平台项目</label>
              <el-select v-model="selectedProjectId" filterable placeholder="请选择项目" style="width: 100%" :teleported="false" @change="handleProjectChange">
                <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
            <div class="work-list-filter-field">
              <label>来源</label>
              <el-select v-model="filters.sourceType" clearable placeholder="全部来源" style="width: 100%" :teleported="false">
                <el-option label="手工维护" value="MANUAL" />
                <el-option label="Jenkins" value="JENKINS" />
                <el-option label="Woodpecker" value="WOODPECKER" />
              </el-select>
            </div>
            <div class="work-list-filter-field">
              <label>启用状态</label>
              <el-select v-model="filters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="停用" :value="false" />
              </el-select>
            </div>
            <div class="work-list-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="work-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
        <button v-if="canManage" class="work-list-create-button runtime-mobile-create" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增实例</span>
        </button>
      </div>

      <div v-if="canManage" class="work-list-toolbar-side runtime-desktop-create">
        <button class="work-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增实例</span>
        </button>
      </div>
    </section>

    <section class="runtime-instance-project-strip">
      <div class="runtime-instance-project-copy">
        <span class="runtime-instance-project-label">当前项目</span>
        <strong>{{ currentProjectName }}</strong>
      </div>
      <el-select v-model="selectedProjectId" filterable placeholder="请选择项目" class="runtime-instance-project-select" @change="handleProjectChange">
        <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
    </section>

    <section class="runtime-instance-stats">
      <div class="runtime-instance-stat">
        <span>运行实例</span>
        <strong>{{ instanceList.length }}</strong>
      </div>
      <div class="runtime-instance-stat">
        <span>启用</span>
        <strong>{{ enabledCount }}</strong>
      </div>
      <div class="runtime-instance-stat">
        <span>日志采集</span>
        <strong>{{ logEnabledCount }}</strong>
      </div>
      <div class="runtime-instance-stat">
        <span>健康探测</span>
        <strong>{{ healthEnabledCount }}</strong>
      </div>
    </section>

    <section class="work-list-shell">
      <div class="work-list-scroll" v-loading="loading">
        <section v-if="pagedInstances.length" class="runtime-instance-grid">
          <article v-for="item in pagedInstances" :key="item.id" class="runtime-instance-card">
            <header class="runtime-instance-card-head">
              <div class="runtime-instance-heading">
                <h2>{{ item.name }}</h2>
                <div>{{ item.environment || '未标记环境' }} / {{ item.serviceName || '未标记服务' }}</div>
              </div>
              <div class="runtime-instance-tags">
                <span class="management-list-pill info">{{ formatRuntimeInstanceSource(item.sourceType) }}</span>
                <span class="management-list-pill" :class="item.enabled ? 'success' : 'neutral'">{{ item.enabled ? '启用' : '停用' }}</span>
                <span class="management-list-pill" :class="runtimeInstanceStatusTone(item.lastStatus)">{{ formatRuntimeInstanceStatus(item.lastStatus) }}</span>
              </div>
            </header>

            <div class="runtime-instance-meta">
              <span>{{ formatRuntimeInstanceServerMode(item.serverMode) }}</span>
              <span v-if="item.serverMode === 'MANAGED_SERVER'">服务器：{{ item.serverName || '-' }}</span>
              <span v-else>地址：{{ item.externalBaseUrl || '-' }}</span>
            </div>

            <div class="runtime-instance-info-grid">
              <div class="runtime-instance-info-item">
                <span>日志采集</span>
                <strong>{{ item.logEnabled ? `${item.logPaths.length} 条路径` : '未开启' }}</strong>
              </div>
              <div class="runtime-instance-info-item">
                <span>健康探测</span>
                <strong>{{ item.healthEnabled ? (item.healthProbeType || 'HTTP') : '未开启' }}</strong>
              </div>
              <div class="runtime-instance-info-item runtime-instance-info-wide">
                <span>健康目标</span>
                <strong>{{ item.healthTarget || '-' }}</strong>
              </div>
              <div class="runtime-instance-info-item runtime-instance-info-wide">
                <span>最近部署/状态</span>
                <strong>{{ item.lastDeployedAt || '-' }}{{ item.lastStatusMessage ? ` · ${item.lastStatusMessage}` : '' }}</strong>
              </div>
            </div>

            <div class="runtime-instance-actions">
              <el-button v-if="item.sourceType === 'JENKINS' && item.sourceBindingId" @click="openPipelineBinding(item)">
                <el-icon><DataAnalysis /></el-icon>
                <span>流水线</span>
              </el-button>
              <el-button v-if="canManage" @click="openEditDialog(item)">
                <el-icon><EditPen /></el-icon>
                <span>编辑</span>
              </el-button>
              <el-button v-if="canManage" type="danger" plain @click="handleDelete(item)">
                <el-icon><Delete /></el-icon>
                <span>删除</span>
              </el-button>
            </div>
          </article>
        </section>
        <div v-if="!pagedInstances.length" class="work-list-empty-state">
          <el-empty :description="selectedProjectId ? '当前筛选条件下暂无运行实例' : '请选择项目后查看运行实例'" />
        </div>
      </div>

      <div v-if="filteredInstances.length" class="work-list-footer">
        <div class="work-list-footer-total">
          共 <span>{{ filteredInstances.length }}</span> 条
        </div>
        <div class="work-list-footer-controls">
          <div class="work-list-page-size work-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handlePageSizeChange">
              <el-option :value="6" label="6" />
              <el-option :value="12" label="12" />
              <el-option :value="24" label="24" />
              <el-option :value="48" label="48" />
            </el-select>
          </div>
          <div class="work-list-page-nav">
            <button class="work-list-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="work-list-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="work-list-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="820px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Connection" />
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基础信息</div>
            <div class="platform-form-section-subtitle">描述实例所属环境、服务名和来源项目。</div>
          </div>
          <div class="runtime-instance-form-grid">
            <el-form-item label="平台项目">
              <el-select v-model="formProjectId" filterable placeholder="请选择项目" :disabled="isEditing" style="width: 100%">
                <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="实例名称" prop="name">
              <el-input v-model="form.name" placeholder="例如：生产 API" />
            </el-form-item>
            <el-form-item label="环境">
              <el-input v-model="form.environment" placeholder="例如：prod / staging" />
            </el-form-item>
            <el-form-item label="服务名">
              <el-input v-model="form.serviceName" placeholder="例如：api-service" />
            </el-form-item>
            <el-form-item label="启用">
              <el-switch v-model="form.enabled" />
            </el-form-item>
          </div>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">运行位置</div>
            <div class="platform-form-section-subtitle">受管服务器支持 SSH 日志采集；外部地址只作为健康检查目标。</div>
          </div>
          <el-form-item label="服务器模式">
            <el-radio-group v-model="form.serverMode" @change="handleServerModeChange">
              <el-radio-button label="MANAGED_SERVER">受管服务器</el-radio-button>
              <el-radio-button label="EXTERNAL_ENDPOINT">外部地址</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <div class="runtime-instance-form-grid">
            <el-form-item v-if="form.serverMode === 'MANAGED_SERVER'" label="受管服务器">
              <el-select v-model="form.serverId" filterable clearable placeholder="请选择服务器" style="width: 100%">
                <el-option v-for="server in serverOptions" :key="server.id" :label="`${server.name} / ${server.host}`" :value="server.id" />
              </el-select>
            </el-form-item>
            <el-form-item v-else label="外部访问地址">
              <el-input v-model="form.externalBaseUrl" placeholder="例如：https://api.example.com" />
            </el-form-item>
            <el-form-item label="健康探针">
              <el-select v-model="form.healthProbeType" style="width: 100%">
                <el-option label="HTTP" value="HTTP" />
                <el-option label="TCP" value="TCP" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="健康检查">
            <div class="runtime-instance-health-row">
              <el-switch v-model="form.healthEnabled" />
              <el-input v-model="form.healthTarget" :disabled="!form.healthEnabled" placeholder="例如：https://api.example.com/health 或 10.10.10.10:8080" />
            </div>
          </el-form-item>
        </section>

        <section v-if="form.serverMode === 'MANAGED_SERVER'" class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">日志采集</div>
            <div class="platform-form-section-subtitle">每行一个绝对路径或 ~/ 开头路径，后续日志归集从这里读取目标。</div>
          </div>
          <el-form-item label="开启日志采集">
            <el-switch v-model="form.logEnabled" />
          </el-form-item>
          <el-form-item label="日志路径">
            <el-input v-model="form.logPathsText" type="textarea" :rows="4" :disabled="!form.logEnabled" placeholder="/srv/app/logs/app.log" />
          </el-form-item>
        </section>
      </el-form>

      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Connection, DataAnalysis, Delete, EditPen, Filter, Plus, RefreshRight, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  createProjectRuntimeInstance,
  deleteProjectRuntimeInstance,
  listProjectRuntimeInstances,
  updateProjectRuntimeInstance
} from '@/api/cicd'
import { listProjectOptions } from '@/api/platform'
import { pageServers } from '@/api/servers'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import { useAuthStore } from '@/stores/auth'
import type { ProjectItem, ProjectRuntimeInstanceItem, ServerSummaryItem } from '@/types/platform'
import {
  buildRuntimeInstancePayload,
  createEmptyRuntimeInstanceForm,
  formatRuntimeInstanceServerMode,
  formatRuntimeInstanceSource,
  formatRuntimeInstanceStatus,
  runtimeInstanceStatusTone,
  toRuntimeInstanceForm,
  type RuntimeInstanceFormModel
} from '@/utils/projectRuntimeInstance'

const router = useRouter()
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('cicd:manage'))

const projectOptions = ref<ProjectItem[]>([])
const serverOptions = ref<ServerSummaryItem[]>([])
const selectedProjectId = ref<number | null>(null)
const instanceList = ref<ProjectRuntimeInstanceItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const filterPopoverVisible = ref(false)
const dialogVisible = ref(false)
const editingInstance = ref<ProjectRuntimeInstanceItem | null>(null)
const formProjectId = ref<number | null>(null)
const formRef = ref<FormInstance>()

const filters = reactive<{ keyword: string; sourceType: string; enabled: boolean | '' | undefined }>({
  keyword: '',
  sourceType: '',
  enabled: ''
})
const pagination = reactive({ page: 1, size: 12 })
const form = reactive<RuntimeInstanceFormModel>(createEmptyRuntimeInstanceForm())

const isEditing = computed(() => Boolean(editingInstance.value))
const currentProject = computed(() => projectOptions.value.find((item) => item.id === selectedProjectId.value) || null)
const currentProjectName = computed(() => currentProject.value?.name || '未选择项目')
const dialogTitle = computed(() => (isEditing.value ? '编辑运行实例' : '新增运行实例'))
const dialogSubtitle = computed(() => (isEditing.value ? '调整运行实例采集目标和探测配置。' : '新增手工维护的可观测采集目标。'))
const enabledCount = computed(() => instanceList.value.filter((item) => item.enabled).length)
const logEnabledCount = computed(() => instanceList.value.filter((item) => item.logEnabled).length)
const healthEnabledCount = computed(() => instanceList.value.filter((item) => item.healthEnabled).length)
const filteredInstances = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return instanceList.value.filter((item) => {
    if (filters.sourceType && item.sourceType !== filters.sourceType) {
      return false
    }
    if (typeof filters.enabled === 'boolean' && item.enabled !== filters.enabled) {
      return false
    }
    if (!keyword) {
      return true
    }
    return [
      item.name,
      item.environment,
      item.serviceName,
      item.serverName,
      item.externalBaseUrl,
      item.healthTarget,
      item.lastStatusMessage
    ].some((value) => String(value || '').toLowerCase().includes(keyword))
  })
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredInstances.value.length / pagination.size) || 1))
const pagedInstances = computed(() => {
  const start = (pagination.page - 1) * pagination.size
  return filteredInstances.value.slice(start, start + pagination.size)
})

const rules: FormRules<RuntimeInstanceFormModel> = {
  name: [{ required: true, message: '请输入运行实例名称', trigger: 'blur' }]
}

async function loadBaseOptions() {
  const [projects, servers] = await Promise.all([
    listProjectOptions(),
    pageServers({ page: 1, size: 100, enabled: true })
  ])
  projectOptions.value = projects
  serverOptions.value = servers.records
  selectedProjectId.value = selectedProjectId.value ?? projects[0]?.id ?? null
}

async function loadInstances() {
  if (!selectedProjectId.value) {
    instanceList.value = []
    return
  }
  loading.value = true
  try {
    instanceList.value = await listProjectRuntimeInstances(selectedProjectId.value)
  } finally {
    loading.value = false
  }
}

async function handleProjectChange() {
  pagination.page = 1
  await loadInstances()
}

function handleSearch() {
  filterPopoverVisible.value = false
  pagination.page = 1
}

async function handleReset() {
  filters.keyword = ''
  filters.sourceType = ''
  filters.enabled = ''
  pagination.page = 1
  await loadInstances()
}

function handlePageSizeChange() {
  pagination.page = 1
}

function handlePrevPage() {
  if (pagination.page > 1) {
    pagination.page -= 1
  }
}

function handleNextPage() {
  if (pagination.page < totalPages.value) {
    pagination.page += 1
  }
}

function applyForm(nextForm: RuntimeInstanceFormModel) {
  Object.assign(form, nextForm)
}

function openCreateDialog() {
  if (!selectedProjectId.value) {
    ElMessage.warning('请先选择平台项目')
    return
  }
  editingInstance.value = null
  formProjectId.value = selectedProjectId.value
  applyForm(createEmptyRuntimeInstanceForm(currentProjectName.value, serverOptions.value[0]?.id ?? null))
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEditDialog(item: ProjectRuntimeInstanceItem) {
  editingInstance.value = item
  formProjectId.value = item.projectId
  applyForm(toRuntimeInstanceForm(item))
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function handleServerModeChange() {
  if (form.serverMode === 'EXTERNAL_ENDPOINT') {
    form.serverId = null
    form.logEnabled = false
    form.logPathsText = ''
    return
  }
  form.externalBaseUrl = ''
  form.serverId = form.serverId ?? serverOptions.value[0]?.id ?? null
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !formProjectId.value) {
    return
  }
  submitting.value = true
  try {
    const payload = buildRuntimeInstancePayload(form)
    if (editingInstance.value) {
      await updateProjectRuntimeInstance(formProjectId.value, editingInstance.value.id, payload)
      ElMessage.success('运行实例已更新')
    } else {
      await createProjectRuntimeInstance(formProjectId.value, payload)
      selectedProjectId.value = formProjectId.value
      ElMessage.success('运行实例已创建')
    }
    dialogVisible.value = false
    await loadInstances()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || error?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(item: ProjectRuntimeInstanceItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除运行实例「${item.name}」？${item.sourceType === 'JENKINS' ? '该实例来自 Jenkins 绑定，删除后可通过重新保存绑定恢复。' : ''}`,
      '删除运行实例',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await deleteProjectRuntimeInstance(item.projectId, item.id)
    ElMessage.success('运行实例已删除')
    await loadInstances()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return
    }
    ElMessage.error(error?.response?.data?.message || '删除失败')
  }
}

function openPipelineBinding(item: ProjectRuntimeInstanceItem) {
  if (!item.sourceBindingId) {
    return
  }
  router.push({ name: 'cicd-pipeline-detail', params: { entryType: 'JENKINS', entryId: String(item.sourceBindingId) } })
}

onMounted(async () => {
  await loadBaseOptions()
  await loadInstances()
})
</script>

<style scoped>
.runtime-mobile-create {
  display: none;
}

.runtime-instance-project-strip,
.runtime-instance-stats {
  display: grid;
  margin: 0 16px 14px;
}

.runtime-instance-project-strip {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
}

.runtime-instance-project-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.runtime-instance-project-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.runtime-instance-project-copy strong {
  min-width: 0;
  color: var(--app-text);
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-instance-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.runtime-instance-stat {
  display: grid;
  gap: 4px;
  min-height: 72px;
  padding: 14px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
}

.runtime-instance-stat span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.runtime-instance-stat strong {
  color: #172033;
  font-size: 24px;
  line-height: 1;
}

.runtime-instance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  gap: 14px;
}

.runtime-instance-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 300px;
  padding: 18px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.94));
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.runtime-instance-card-head,
.runtime-instance-meta,
.runtime-instance-tags,
.runtime-instance-actions,
.runtime-instance-health-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.runtime-instance-card-head {
  align-items: flex-start;
  justify-content: space-between;
}

.runtime-instance-heading {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.runtime-instance-heading h2 {
  margin: 0;
  color: #172033;
  font-size: 20px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.runtime-instance-heading div,
.runtime-instance-meta {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.runtime-instance-tags,
.runtime-instance-meta,
.runtime-instance-actions {
  flex-wrap: wrap;
}

.runtime-instance-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.runtime-instance-info-item {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(241, 245, 249, 0.74);
}

.runtime-instance-info-wide {
  grid-column: 1 / -1;
}

.runtime-instance-info-item span {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.runtime-instance-info-item strong {
  min-width: 0;
  color: #172033;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.runtime-instance-actions {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.runtime-instance-actions :deep(.el-button) {
  min-height: 36px;
  margin-left: 0;
  border-radius: 12px;
}

.runtime-instance-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.runtime-instance-health-row {
  width: 100%;
}

.runtime-instance-health-row .el-input {
  flex: 1 1 auto;
  min-width: 0;
}

@media (max-width: 900px) {
  .runtime-desktop-create {
    display: none;
  }

  .runtime-mobile-create {
    display: inline-flex;
  }

  .runtime-instance-project-strip {
    grid-template-columns: 1fr;
  }

  .runtime-instance-project-select {
    width: 100%;
  }

  .runtime-instance-stats,
  .runtime-instance-form-grid,
  .runtime-instance-info-grid {
    grid-template-columns: 1fr;
  }

  .runtime-instance-card-head {
    flex-direction: column;
  }
}
</style>
