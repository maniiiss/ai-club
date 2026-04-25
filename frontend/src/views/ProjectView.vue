<template>
  <div class="project-page">
    <section class="project-kpi-row">
      <article v-for="item in summaryCards" :key="item.label" class="project-kpi-card" :class="{ active: item.active }">
        <div>
          <div class="project-kpi-label">{{ item.label }}</div>
          <div class="project-kpi-value">{{ item.value }}</div>
        </div>
        <el-icon class="project-kpi-icon"><component :is="item.icon" /></el-icon>
      </article>
    </section>

    <section class="management-list-page project-list-page">
      <section class="management-list-toolbar">
        <div class="management-list-toolbar-main">
          <div class="management-list-search-shell">
            <el-icon class="management-list-search-icon"><Search /></el-icon>
            <input
              v-model="filters.keyword"
              class="management-list-search-input"
              type="text"
              placeholder="搜索项目名、负责人或描述..."
              @keyup.enter="handleSearch"
            />
          </div>
          <span class="management-list-toolbar-divider" aria-hidden="true"></span>
          <el-popover v-model:visible="projectFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
            <template #reference>
              <button class="management-list-toolbar-button" type="button">
                <el-icon><Filter /></el-icon>
                <span>筛选</span>
              </button>
            </template>

            <div class="management-list-filter-panel management-list-compact-input">
              <div class="management-list-filter-field">
                <label>项目状态</label>
                <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 100%" :teleported="false">
                  <el-option label="进行中" value="进行中" />
                  <el-option label="规划中" value="规划中" />
                  <el-option label="已立项" value="已立项" />
                  <el-option label="已完成" value="已完成" />
                </el-select>
              </div>
              <div class="management-list-filter-actions">
                <el-button type="primary" @click="handleSearch">查询</el-button>
                <el-button @click="handleReset">重置</el-button>
              </div>
            </div>
          </el-popover>
          <button class="management-list-toolbar-button" type="button" @click="handleReset">
            <el-icon><RefreshRight /></el-icon>
            <span>重置</span>
          </button>
        </div>

        <div class="management-list-toolbar-side">
          <button v-if="canManageProjects" class="management-list-create-button" type="button" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>
            <span>新建项目</span>
          </button>
        </div>
      </section>

      <section class="management-list-shell project-workspace">
      <div v-if="!isMobileViewport" class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <table class="management-list-table project-table mobile-card-table">
          <thead>
            <tr>
              <th class="project-col-main">项目</th>
              <th class="project-col-owner">负责人</th>
              <th class="project-col-members">成员</th>
              <th class="project-col-status">状态</th>
              <th class="project-col-tasks">任务</th>
              <th class="project-col-repos center">仓库</th>
              <th class="project-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in projectList" :key="row.id" class="management-list-row">
              <td class="project-col-main" data-label="项目">
                <button class="project-name-button management-list-title-trigger" type="button" @click="openIterationBoard(row)">
                  <span class="management-list-title-cell">
                    <el-icon class="management-list-title-icon project-name-icon"><FolderOpened /></el-icon>
                    <span class="management-list-title-copy">
                      <span class="management-list-title project-name-text">{{ row.name }}</span>
                      <span class="management-list-subtitle">{{ row.description || '暂无项目说明' }}</span>
                    </span>
                  </span>
                </button>
              </td>
              <td class="project-col-owner" data-label="负责人">
                <div class="project-owner-cell">
                  <ListUserDisplay :user="buildProjectOwnerDisplayItem(row)" empty-text="未分配" size="md" />
                </div>
              </td>
              <td class="project-col-members" data-label="成员">
                <ListUserGroupDisplay :users="buildProjectMemberDisplayItems(row)" empty-text="暂无成员" size="md" />
              </td>
              <td class="project-col-status" data-label="状态">
                <span class="project-status-pill" :class="statusTone(row.status)">{{ statusLabel(row.status) }}</span>
              </td>
              <td class="project-col-tasks" data-label="任务">
                <div class="project-progress-cell">
                  <div class="project-progress-track">
                    <div class="project-progress-fill" :style="{ width: `${taskProgress(row)}%` }"></div>
                  </div>
                  <span class="project-progress-text">任务数：{{ row.taskCount }}</span>
                </div>
              </td>
              <td class="center project-col-repos" data-label="仓库">
                <button v-if="row.repoCount > 0" class="repo-link-button" type="button" @click="openRepoDialog(row)">{{ row.repoCount }}</button>
                <span v-else class="repo-link-button muted">0</span>
              </td>
              <td class="right project-col-actions" data-label="操作">
                <div class="project-row-actions">
                  <el-tooltip content="迭代管理" placement="top">
                    <button class="project-action-button" type="button" aria-label="打开迭代管理" @click="openIterationBoard(row)">
                      <el-icon><Tickets /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip content="逻辑图谱" placement="top">
                    <button class="project-action-button graph" type="button" aria-label="打开逻辑图谱" @click="openKnowledgeGraph(row)">
                      <el-icon><Connection /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip v-if="canManageProjects && row.canEdit" content="编辑" placement="top">
                    <button
                      class="project-action-button"
                      type="button"
                      aria-label="编辑项目"
                      @click="openEditDialog(row)"
                    >
                      <el-icon><EditPen /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip v-if="canManageProjects && row.canDelete" content="删除" placement="top">
                    <button
                      class="project-action-button danger"
                      type="button"
                      aria-label="删除项目"
                      @click="handleDelete(row.id)"
                    >
                      <el-icon><Delete /></el-icon>
                    </button>
                  </el-tooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="project-mobile-list-shell" v-loading="loading">
        <div v-if="projectList.length" class="project-mobile-list">
          <article v-for="row in projectList" :key="row.id" class="project-mobile-card">
            <header class="project-mobile-card-header">
              <button class="project-mobile-header-trigger" type="button" @click="openIterationBoard(row)">
                <span class="project-mobile-icon">
                  <el-icon><FolderOpened /></el-icon>
                </span>
                <span class="project-mobile-copy">
                  <span class="project-mobile-title">{{ row.name }}</span>
                  <span class="project-mobile-description">{{ row.description || '暂无项目说明' }}</span>
                </span>
              </button>
              <span class="project-status-pill project-mobile-status" :class="statusTone(row.status)">{{ statusLabel(row.status) }}</span>
            </header>

            <div class="project-mobile-fields">
              <div class="project-mobile-field">
                <span class="project-mobile-field-label">负责人</span>
                <div class="project-mobile-field-content">
                  <ListUserDisplay :user="buildProjectOwnerDisplayItem(row)" empty-text="未分配" size="md" />
                </div>
              </div>

              <div class="project-mobile-field">
                <span class="project-mobile-field-label">成员</span>
                <div class="project-mobile-field-content">
                  <ListUserGroupDisplay :users="buildProjectMemberDisplayItems(row)" empty-text="暂无成员" size="md" />
                </div>
              </div>

              <div class="project-mobile-field project-mobile-field-full">
                <span class="project-mobile-field-label">任务</span>
                <div class="project-mobile-field-content project-mobile-task-content">
                  <div class="project-progress-cell">
                    <div class="project-progress-track">
                      <div class="project-progress-fill" :style="{ width: `${taskProgress(row)}%` }"></div>
                    </div>
                    <span class="project-progress-text">任务数：{{ row.taskCount }}</span>
                  </div>
                </div>
              </div>

              <div class="project-mobile-field">
                <span class="project-mobile-field-label">仓库</span>
                <div class="project-mobile-field-content">
                  <button v-if="row.repoCount > 0" class="project-mobile-repo-button" type="button" @click="openRepoDialog(row)">
                    已关联 {{ row.repoCount }} 个仓库
                  </button>
                  <span v-else class="project-mobile-repo-empty">未关联仓库</span>
                </div>
              </div>
            </div>

            <footer class="project-mobile-actions">
              <button class="project-mobile-action-button" type="button" @click="openIterationBoard(row)">
                <el-icon><Tickets /></el-icon>
                <span>迭代管理</span>
              </button>
              <button class="project-mobile-action-button graph" type="button" @click="openKnowledgeGraph(row)">
                <el-icon><Connection /></el-icon>
                <span>逻辑图谱</span>
              </button>
              <button
                v-if="canManageProjects && row.canEdit"
                class="project-mobile-action-button"
                type="button"
                @click="openEditDialog(row)"
              >
                <el-icon><EditPen /></el-icon>
                <span>编辑</span>
              </button>
              <button
                v-if="canManageProjects && row.canDelete"
                class="project-mobile-action-button danger"
                type="button"
                @click="handleDelete(row.id)"
              >
                <el-icon><Delete /></el-icon>
                <span>删除</span>
              </button>
            </footer>
          </article>
        </div>
        <div v-else class="project-mobile-empty-state">
          <el-empty description="暂无项目数据" />
        </div>
      </div>

      <div class="management-list-footer project-footer">
        <div class="management-list-footer-total">共 <span>{{ pagination.total }}</span> 条</div>
        <div class="management-list-footer-controls">
          <div class="management-list-page-size management-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="management-list-page-nav">
            <button class="management-list-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="management-list-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="management-list-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
      </section>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="680px"
      class="platform-form-dialog project-editor-dialog"
      align-center
      destroy-on-close
    >
      <template #header>
        <div class="project-dialog-header">
          <span class="project-dialog-header-icon">
            <el-icon><FolderOpened /></el-icon>
          </span>
          <div class="project-dialog-header-copy">
            <div class="project-dialog-header-title">{{ dialogTitle }}</div>
            <p class="project-dialog-header-subtitle">{{ dialogSubtitle }}</p>
          </div>
        </div>
      </template>

      <div class="project-dialog-shell">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout project-form-layout">
          <section class="platform-form-section">
            <div class="platform-form-section-head">
              <div class="platform-form-section-title">基础设置</div>
            </div>
            <div class="project-dialog-form-grid">
              <el-form-item label="项目名称" prop="name" class="project-dialog-span-2">
                <el-input v-model="form.name" placeholder="例如：智能代码评审平台" />
              </el-form-item>
              <el-form-item label="负责人" prop="ownerUserId">
                <el-select v-model="form.ownerUserId" filterable placeholder="请选择负责人" style="width: 100%" @change="handleOwnerChange">
                  <el-option
                    v-for="item in userOptions"
                    :key="item.id"
                    :label="buildUserLabel(item)"
                    :value="item.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="状态" prop="status">
                <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
                  <el-option label="进行中" value="进行中" />
                  <el-option label="规划中" value="规划中" />
                  <el-option label="已立项" value="已立项" />
                  <el-option label="已完成" value="已完成" />
                </el-select>
              </el-form-item>
              <el-form-item label="项目成员" class="project-dialog-span-2">
                <el-select v-model="form.memberUserIds" multiple filterable collapse-tags placeholder="请选择项目成员" style="width: 100%">
                  <el-option
                    v-for="item in memberSelectableUsers"
                    :key="item.id"
                    :label="buildUserLabel(item)"
                    :value="item.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="项目说明" prop="description" class="project-dialog-span-2">
                <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入项目目标、协作范围或当前阶段说明" />
              </el-form-item>
            </div>
          </section>
        </el-form>
      </div>

      <template #footer>
        <div class="project-dialog-footer">
          <div class="project-dialog-footer-actions">
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ dialogSubmitText }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="repoDialogVisible" title="关联仓库列表" width="760px" align-center destroy-on-close>
      <template v-if="currentRepoProject">
        <el-descriptions :column="2" border class="repo-meta">
          <el-descriptions-item label="项目">{{ currentRepoProject.name }}</el-descriptions-item>
          <el-descriptions-item label="仓库数量">{{ repoBindings.length }}</el-descriptions-item>
        </el-descriptions>
        <el-table v-loading="repoLoading" :data="repoBindings" style="width: 100%; margin-top: 16px">
          <el-table-column prop="projectName" label="所属项目" width="160" />
          <el-table-column label="仓库名称" min-width="200">
            <template #default="{ row }">
              {{ row.gitlabProjectName || row.gitlabProjectPath || row.gitlabProjectRef }}
            </template>
          </el-table-column>
          <el-table-column label="仓库路径" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.gitlabProjectPath || row.gitlabProjectRef }}
            </template>
          </el-table-column>
          <el-table-column label="默认分支" width="140">
            <template #default="{ row }">
              {{ row.defaultTargetBranch || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="链接" width="90">
            <template #default="{ row }">
              <el-link v-if="row.gitlabProjectWebUrl" :href="row.gitlabProjectWebUrl" target="_blank" type="primary">打开</el-link>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="repoDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Connection, Delete, EditPen, Filter, FolderOpened, Lightning, PieChart, Plus, RefreshRight, Search, Tickets, TrendCharts } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { listUserOptions } from '@/api/access'
import ListUserDisplay from '@/components/ListUserDisplay.vue'
import ListUserGroupDisplay from '@/components/ListUserGroupDisplay.vue'
import type { ListUserDisplayItem } from '@/components/listUserDisplay'
import { createProject, deleteProject, pageProjects, updateProject } from '@/api/platform'
import { pageGitlabBindings } from '@/api/gitlab'
import { useAuthStore } from '@/stores/auth'
import type { ProjectGitlabBindingItem, ProjectItem, ProjectMemberItem, UserOptionItem } from '@/types/platform'
import { resolveAssetUrl } from '@/utils/asset'

interface ProjectForm {
  /** 项目名称。 */
  name: string
  /** 负责人名称。 */
  owner: string
  /** 负责人用户ID。 */
  ownerUserId: number | null
  /** 项目成员ID列表。 */
  memberUserIds: number[]
  /** 项目状态。 */
  status: string
  /** 项目说明。 */
  description: string
}

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const currentId = ref<number | null>(null)
const projectList = ref<ProjectItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const repoBindings = ref<ProjectGitlabBindingItem[]>([])
const repoDialogVisible = ref(false)
const repoLoading = ref(false)
const currentRepoProject = ref<ProjectItem | null>(null)
const formRef = ref<FormInstance>()
const router = useRouter()
const authStore = useAuthStore()
const activePreset = ref<'all' | 'planning' | 'draft'>('all')
const isMobileViewport = ref(false)
const canManageProjects = computed(() => authStore.hasPermission('project:manage'))
const dialogTitle = computed(() => isEditing.value ? '编辑项目' : '新建项目')
const dialogSubtitle = computed(() =>
  isEditing.value
    ? '调整项目名称、负责人、成员和状态。'
    : '填写项目基础信息，保存后即可开始继续配置。'
)
const dialogSubmitText = computed(() => isEditing.value ? '保存项目' : '创建项目')

const pagination = reactive({
  page: 1,
  size: 10,
  total: 0
})
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))

const filters = reactive({
  keyword: '',
  status: ''
})
const projectFilterPopoverVisible = ref(false)

const form = reactive<ProjectForm>({
  name: '',
  owner: '',
  ownerUserId: null,
  memberUserIds: [],
  status: '进行中',
  description: ''
})

const rules: FormRules<ProjectForm> = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  ownerUserId: [{ required: true, message: '请选择负责人', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
}

const memberSelectableUsers = computed(() => userOptions.value.filter((item) => item.id !== form.ownerUserId))

const summaryCards = computed(() => [
  { label: '活跃项目', value: projectList.value.length || pagination.total, icon: Lightning, active: true },
  { label: '任务总量', value: projectList.value.reduce((sum, item) => sum + item.taskCount, 0), icon: TrendCharts, active: false },
  { label: '资源负载', value: `${resourceLoad.value}%`, icon: PieChart, active: false },
  { label: '平均速度', value: averageVelocity.value.toFixed(1), icon: FolderOpened, active: false }
])

const resourceLoad = computed(() => {
  if (!projectList.value.length) {
    return 0
  }
  const runningCount = projectList.value.filter((item) => item.status === '进行中').length
  return Math.round((runningCount / projectList.value.length) * 100)
})

const averageVelocity = computed(() => {
  if (!projectList.value.length) {
    return 0
  }
  const total = projectList.value.reduce((sum, item) => sum + item.taskCount, 0)
  return total / projectList.value.length
})

const resetForm = () => {
  currentId.value = null
  form.name = ''
  form.owner = ''
  form.ownerUserId = null
  form.memberUserIds = []
  form.status = '进行中'
  form.description = ''
  formRef.value?.clearValidate()
}

const buildUserLabel = (item: UserOptionItem) => item.nickname?.trim() ? `${item.nickname}（${item.username}）` : item.username

const syncFormOwner = () => {
  const selected = userOptions.value.find((item) => item.id === form.ownerUserId)
  form.owner = selected?.nickname?.trim() || selected?.username || ''
  form.memberUserIds = form.memberUserIds.filter((item) => item !== form.ownerUserId)
}

const handleOwnerChange = () => {
  syncFormOwner()
}

const loadUserList = async () => {
  userOptions.value = await listUserOptions()
}

const loadProjects = async () => {
  loading.value = true
  try {
    const pageData = await pageProjects({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      status: filters.status
    })
    projectList.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const applyPreset = async (preset: 'all' | 'planning' | 'draft') => {
  activePreset.value = preset
  if (preset === 'all') {
    filters.status = ''
  } else if (preset === 'planning') {
    filters.status = '规划中'
  } else {
    filters.status = '已立项'
  }
  pagination.page = 1
  await loadProjects()
}

const handleSearch = async () => {
  projectFilterPopoverVisible.value = false
  pagination.page = 1
  await loadProjects()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.status = ''
  activePreset.value = 'all'
  pagination.page = 1
  await loadProjects()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadProjects()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadProjects()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadProjects()
}

const openCreateDialog = () => {
  if (!canManageProjects.value) {
    return
  }
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const openEditDialog = (row: ProjectItem) => {
  if (!canManageProjects.value || !row.canEdit) {
    ElMessage.warning('当前账号不能编辑该项目')
    return
  }
  isEditing.value = true
  currentId.value = row.id
  form.name = row.name
  form.owner = row.owner
  form.ownerUserId = row.ownerUserId
  form.memberUserIds = [...row.memberUserIds]
  form.status = row.status
  form.description = row.description
  syncFormOwner()
  dialogVisible.value = true
}

const openIterationBoard = (row: ProjectItem) => {
  router.push({ name: 'project-iterations', params: { projectId: row.id } })
}

const openKnowledgeGraph = (row: ProjectItem) => {
  router.push({ name: 'project-knowledge-graph', params: { projectId: row.id } })
}

const openRepoDialog = async (row: ProjectItem) => {
  if (!authStore.hasPermission('gitlab:view')) {
    ElMessage.warning('当前账号没有查看仓库列表的权限')
    return
  }
  currentRepoProject.value = row
  repoBindings.value = []
  repoDialogVisible.value = true
  repoLoading.value = true
  try {
    const pageData = await pageGitlabBindings({
      page: 1,
      size: 20,
      projectId: row.id
    })
    repoBindings.value = pageData.records
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载仓库列表失败')
  } finally {
    repoLoading.value = false
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    syncFormOwner()
    if (isEditing.value && currentId.value !== null) {
      await updateProject(currentId.value, { ...form })
      ElMessage.success('项目更新成功')
    } else {
      await createProject({ ...form })
      ElMessage.success('项目创建成功')
    }
    dialogVisible.value = false
    await loadProjects()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (id: number) => {
  if (!canManageProjects.value) {
    return
  }
  try {
    await ElMessageBox.confirm('删除项目会同时删除关联 Agent 和任务，是否继续？', '提示', { type: 'warning' })
    await deleteProject(id)
    ElMessage.success('项目删除成功')
    await loadProjects()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

const statusTone = (status?: string | null) => {
  if (status === '进行中') return 'running'
  if (status === '规划中' || status === '已立项') return 'active'
  if (status === '已完成') return 'onhold'
  return 'delayed'
}

const statusLabel = (status?: string | null) => {
  if (status === '进行中') return '进行中'
  if (status === '规划中' || status === '已立项') return '活跃'
  if (status === '已完成') return '已完成'
  return '延期'
}

const taskProgress = (row: ProjectItem) => Math.min(100, Math.max(4, row.taskCount))

/**
 * 项目管理页在手机端切换为独立卡片模板，避免继续被通用表格压缩样式挤乱字段布局。
 */
const syncMobileViewport = () => {
  if (typeof window === 'undefined') {
    return
  }
  isMobileViewport.value = window.innerWidth <= 900
}

/**
 * 统一解析项目负责人展示名称，兼容历史数据里仅有 owner 文本、没有头像字段的情况。
 */
const projectOwnerName = (row: ProjectItem) => row.owner?.trim() || ''

/**
 * 将后端增量返回的成员摘要与旧 memberNames 字段做兼容归一，避免前后端上线窗口期列表闪断。
 */
const projectMembers = (row: ProjectItem): ProjectMemberItem[] => {
  if (Array.isArray(row.memberItems) && row.memberItems.length > 0) {
    return row.memberItems
  }
  return (row.memberNames || []).map((name, index) => ({
    id: row.memberUserIds?.[index] ?? -(index + 1),
    name,
    avatarUrl: null
  }))
}

const resolveProjectAvatarUrl = (avatarUrl?: string | null) => resolveAssetUrl(avatarUrl) || undefined

/**
 * 项目列表把负责人和成员映射成统一展示结构，让通用组件不依赖项目专属字段。
 */
const buildProjectOwnerDisplayItem = (row: ProjectItem): ListUserDisplayItem | null => {
  const ownerName = projectOwnerName(row)
  if (!ownerName) {
    return null
  }
  return {
    id: row.ownerUserId ?? `project-owner-${row.id}`,
    name: ownerName,
    avatarUrl: resolveProjectAvatarUrl(row.ownerAvatarUrl)
  }
}

const buildProjectMemberDisplayItems = (row: ProjectItem): ListUserDisplayItem[] =>
  projectMembers(row).map((member) => ({
    id: member.id || `project-member-${row.id}-${member.name}`,
    name: member.name,
    avatarUrl: resolveProjectAvatarUrl(member.avatarUrl)
  }))

onMounted(async () => {
  syncMobileViewport()
  window.addEventListener('resize', syncMobileViewport)
  await loadUserList()
  await loadProjects()
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') {
    return
  }
  window.removeEventListener('resize', syncMobileViewport)
})
</script>

<style scoped>
.project-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.project-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.project-kpi-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.project-kpi-card.active {
  border-bottom: 2px solid var(--app-primary-container);
}

.project-kpi-label {
  color: #8b97a7;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.project-kpi-value {
  margin-top: 4px;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
}

.project-kpi-icon {
  color: #8b97a7;
  font-size: 18px;
}

.project-list-page {
  flex: 1 1 auto;
  min-height: 0;
}

.project-dialog-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 28px;
}

.project-dialog-header-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.18) 0%, rgba(var(--app-primary-rgb), 0.14) 100%);
  color: var(--app-primary);
  font-size: 20px;
}

.project-dialog-header-copy {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
}

.project-dialog-header-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.12;
}

.project-dialog-header-subtitle {
  margin: 0;
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.65;
}

.project-form-layout {
  gap: 0;
}

.project-dialog-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.project-dialog-span-2 {
  grid-column: 1 / -1;
}

:deep(.project-editor-dialog .el-dialog__header) {
  padding-bottom: 10px;
}

:deep(.project-editor-dialog .el-dialog__body) {
  padding-top: 10px;
  padding-bottom: 18px;
}

:deep(.project-editor-dialog .el-dialog__footer) {
  padding-top: 10px;
  padding-bottom: 18px;
}

:deep(.project-dialog-form-grid > .el-form-item) {
  margin-bottom: 0;
}

:deep(.project-editor-dialog .el-input__inner),
:deep(.project-editor-dialog .el-textarea__inner),
:deep(.project-editor-dialog .el-select__selected-item),
:deep(.project-editor-dialog .el-select__input),
:deep(.project-editor-dialog .el-select__tags-text) {
  color: var(--app-text) !important;
}

:deep(.project-editor-dialog .el-select__placeholder),
:deep(.project-editor-dialog .el-input__placeholder),
:deep(.project-editor-dialog .el-textarea__inner::placeholder) {
  color: #9aa6b2 !important;
}

.project-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.project-dialog-footer-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.project-mobile-list-shell {
  flex: 1 1 auto;
  min-height: 360px;
  padding: 14px;
}

.project-mobile-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.project-mobile-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--app-shadow-soft);
}

.project-mobile-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.project-mobile-header-trigger {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
}

.project-mobile-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(216, 240, 212, 0.82);
  color: var(--app-success);
  font-size: 18px;
}

.project-mobile-copy {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
}

.project-mobile-title {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.35;
}

.project-mobile-description {
  color: #6d7f95;
  font-size: 13px;
  line-height: 1.6;
}

.project-mobile-status {
  flex: 0 0 auto;
}

.project-mobile-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.project-mobile-field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(243, 244, 245, 0.76);
}

.project-mobile-field.project-mobile-field-full {
  align-items: flex-start;
}

.project-mobile-field-label {
  width: 52px;
  flex: 0 0 52px;
  color: #7a8ca4;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.6;
}

.project-mobile-field-content {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
}

.project-mobile-task-content,
.project-mobile-task-content .project-progress-cell {
  width: 100%;
}

.project-mobile-task-content .project-progress-cell {
  flex-direction: column;
  align-items: flex-start;
}

.project-mobile-task-content .project-progress-track {
  width: 100%;
  max-width: none;
}

.project-mobile-repo-button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: rgba(211, 235, 248, 0.86);
  color: var(--app-tertiary);
  font-size: 12px;
  font-weight: 800;
}

.project-mobile-repo-empty {
  color: #758393;
  font-size: 13px;
  font-weight: 700;
}

.project-mobile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 2px;
}

.project-mobile-action-button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.92);
  color: #516174;
  font-size: 12px;
  font-weight: 800;
}

.project-mobile-action-button.graph {
  color: var(--app-tertiary);
}

.project-mobile-action-button.danger {
  color: var(--app-danger);
}

.project-mobile-empty-state {
  display: flex;
  min-height: 360px;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.project-owner-cell,
.project-member-stack,
.project-progress-cell {
  display: flex;
  align-items: center;
}

.project-tab,
.project-name-button,
.repo-link-button,
.project-action-button {
  border: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.project-table {
  min-width: 1100px;
}

.project-col-main {
  width: 28%;
}

.project-col-owner {
  width: 14%;
}

.project-col-members {
  width: 12%;
}

.project-col-status {
  width: 12%;
}

.project-col-tasks {
  width: 16%;
}

.project-col-repos {
  width: 8%;
}

.project-col-actions {
  width: 13%;
}

.project-name-button {
  padding: 0;
  text-align: left;
}

.project-owner-cell {
  justify-content: flex-start;
}

.project-name-icon {
  font-size: 18px;
}

.project-name-text {
  font-size: 14px;
}

.project-name-button .management-list-subtitle {
  display: block;
}

.project-owner-avatar,
.project-member-avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 800;
}

.project-owner-avatar {
  background: rgba(225, 227, 228, 0.9);
  color: #475569;
}

.project-member-stack {
  gap: 0;
}

.project-avatar-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.project-member-avatar {
  margin-left: -5px;
  border: 2px solid #fff;
  background: rgba(255, 220, 195, 0.96);
  color: #904d00;
}

.project-member-avatar:first-child {
  margin-left: 0;
}

.project-member-avatar.extra {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(225, 227, 228, 0.92);
  color: #64748b;
}

.project-member-empty {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

.project-popover-avatar {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  background: rgba(255, 220, 195, 0.96);
  color: #904d00;
  font-size: 12px;
  font-weight: 800;
}

.project-person-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.project-person-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.project-person-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
}

.project-person-item:hover {
  background: rgba(248, 250, 252, 0.96);
}

.project-person-name {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
}

.project-person-empty {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

:deep(.project-person-popper) {
  padding: 12px !important;
  border-radius: 14px !important;
}

.project-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.project-status-pill.running {
  background: rgba(199, 231, 255, 0.88);
  color: #00658f;
}

.project-status-pill.active {
  background: rgba(255, 220, 195, 0.9);
  color: #865224;
}

.project-status-pill.delayed {
  background: rgba(255, 218, 214, 0.88);
  color: #ba1a1a;
}

.project-status-pill.onhold {
  background: rgba(225, 227, 228, 0.9);
  color: #7c8794;
}

.project-progress-cell {
  gap: 8px;
}

.project-progress-track {
  width: 92px;
  height: 6px;
  border-radius: 999px;
  background: rgba(225, 227, 228, 0.9);
  overflow: hidden;
}

.project-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--app-primary-container);
}

.project-progress-text {
  color: #8b97a7;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.repo-link-button {
  color: var(--app-text);
  font-family: var(--app-font-mono);
  font-size: 12px;
  font-weight: 800;
  transition: color 0.18s ease;
}

.repo-link-button:hover,
.repo-link-button:focus-visible {
  color: var(--app-primary);
}

.repo-link-button.muted {
  color: var(--app-text-muted);
}

.project-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.project-action-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #94a3b8;
}

.project-action-button:hover {
  background: rgba(255, 255, 255, 0.96);
  color: #904d00;
}

.project-action-button.graph:hover {
  color: #00658f;
}

.project-action-button.danger:hover {
  color: #ba1a1a;
}

@media (max-width: 1200px) {
  .project-kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .project-kpi-row {
    grid-template-columns: 1fr;
  }

  .project-dialog-form-grid {
    grid-template-columns: 1fr;
  }

  .project-dialog-span-2 {
    grid-column: auto;
  }

  .project-dialog-footer {
    width: 100%;
  }

  .project-dialog-footer-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .project-mobile-list-shell {
    padding: 12px;
  }

  .project-mobile-card {
    padding: 14px;
    border-radius: 16px;
  }

  .project-mobile-card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .project-mobile-status {
    align-self: flex-start;
  }

  .project-mobile-title {
    font-size: 17px;
  }

  .project-mobile-description {
    font-size: 12px;
  }

  .project-mobile-field {
    gap: 10px;
    padding: 12px;
  }

  .project-mobile-field-label {
    width: 48px;
    flex-basis: 48px;
  }

  .project-progress-text {
    font-size: 11px;
  }
}

@media (max-width: 640px) {
  .project-dialog-header {
    gap: 10px;
    padding-right: 22px;
  }

  .project-dialog-header-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    font-size: 18px;
  }

  .project-dialog-header-title {
    font-size: 21px;
  }
}
</style>
