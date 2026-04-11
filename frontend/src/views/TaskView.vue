<template>
  <div class="task-atelier-page">
    <section class="task-toolbar">
      <div class="task-toolbar-main">
        <div class="task-search-shell">
          <el-icon class="task-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="task-search-input"
            type="text"
            placeholder="筛选任务、说明、负责人或项目..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="task-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="taskFilterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="task-filter-popper">
          <template #reference>
            <button class="task-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="task-filter-panel">
            <div class="task-filter-field">
              <label>所属项目</label>
              <el-select v-model="filters.projectId" clearable placeholder="所属项目" style="width: 100%" :teleported="false" @change="handleFilterProjectChange">
                <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
              </el-select>
            </div>
            <div class="task-filter-field">
              <label>优先级</label>
              <el-select v-model="filters.priority" clearable placeholder="优先级" style="width: 100%" :teleported="false">
                <el-option label="高" value="高" />
                <el-option label="中" value="中" />
                <el-option label="低" value="低" />
              </el-select>
            </div>
            <div class="task-filter-field">
              <label>状态</label>
              <el-select v-model="filters.status" clearable placeholder="状态" style="width: 100%" :teleported="false">
                <el-option label="草稿" value="草稿" />
                <el-option label="待开始" value="待开始" />
                <el-option label="处理中" value="处理中" />
                <el-option label="已完成" value="已完成" />
                <el-option label="已阻塞" value="已阻塞" />
              </el-select>
            </div>
            <div class="task-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="task-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>

      <div class="task-toolbar-side">
        <button v-if="canManageTasks" class="task-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建任务</span>
        </button>
      </div>
    </section>

    <section class="task-table-shell">
      <div class="task-table-scroll mobile-card-scroll" v-loading="loading">
        <table class="task-table mobile-card-table">
          <thead>
            <tr>
              <th class="task-col-main">任务</th>
              <th class="center task-col-type">类型</th>
              <th class="task-col-project">所属项目</th>
              <th class="task-col-requirement">关联需求</th>
              <th class="task-col-owner">负责人</th>
              <th class="task-col-collaborators">协作人</th>
              <th class="center task-col-priority">优先级</th>
              <th class="task-col-hours">工时</th>
              <th class="task-col-status">状态</th>
              <th class="task-col-updated">更新时间</th>
              <th class="right task-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in taskList" :key="row.id" class="task-row">
              <td class="task-col-main" data-label="任务">
                <button class="task-title-button" type="button" @click="openTaskDetail(row)">
                  <div class="task-primary-cell">
                    <div class="task-primary-icon">
                      <el-icon><Tickets /></el-icon>
                    </div>
                    <div class="task-primary-copy">
                      <div class="task-primary-title">{{ row.name }}</div>
                      <div class="task-primary-meta">{{ row.description || '暂无说明' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="center task-col-type" data-label="类型">
                <span class="task-type-pill" :class="taskTypeTone(row.workItemType)">{{ row.workItemType }}</span>
              </td>
              <td class="task-project-cell task-col-project" data-label="所属项目">
                <button v-if="row.projectName" class="task-link-button" type="button" @click="openTaskProject(row.projectId)">
                  {{ row.projectName }}
                </button>
                <span v-else class="task-empty-text">-</span>
              </td>
              <td class="task-col-requirement" data-label="关联需求">
                <button
                  v-if="row.requirementTaskId && row.requirementTaskName"
                  class="task-link-button"
                  type="button"
                  @click="openRequirementTask(row)"
                >
                  {{ row.requirementTaskName }}
                </button>
                <span v-else class="task-empty-text">-</span>
              </td>
              <td class="task-col-owner" data-label="负责人">
                <div class="task-owner-line">
                  <span class="task-owner-avatar">{{ ownerInitial(row.assignee) }}</span>
                  <span class="task-owner-name">{{ row.assignee || '未分配' }}</span>
                </div>
              </td>
              <td class="task-col-collaborators" data-label="协作人">
                <div v-if="row.collaboratorNames.length" class="task-collaborator-list">
                  <span v-for="name in row.collaboratorNames.slice(0, 3)" :key="`${row.id}-${name}`" class="task-collaborator-chip">
                    {{ name }}
                  </span>
                  <span v-if="row.collaboratorNames.length > 3" class="task-collaborator-chip muted">
                    +{{ row.collaboratorNames.length - 3 }}
                  </span>
                </div>
                <span v-else class="task-empty-text">-</span>
              </td>
              <td class="center task-col-priority" data-label="优先级">
                <span class="task-priority-pill" :class="taskPriorityTone(row.priority)">{{ row.priority || '-' }}</span>
              </td>
              <td class="task-col-hours" data-label="工时">
                <el-tooltip
                  v-if="canManageTasks && row.workItemType === '任务'"
                  :content="getRowWorkHoursLockedReason(row)"
                  :disabled="!getRowWorkHoursLockedReason(row)"
                >
                  <el-input-number
                    :model-value="row.workHours ?? undefined"
                    :min="0"
                    :max="15"
                    :step="0.5"
                    :precision="1"
                    controls-position="right"
                    class="list-work-hours-input"
                    :disabled="workHoursUpdatingId === row.id || Boolean(getRowWorkHoursLockedReason(row))"
                    @change="handleQuickWorkHoursChange(row, $event)"
                  />
                </el-tooltip>
                <span v-else class="task-empty-text">-</span>
              </td>
              <td class="task-col-status" data-label="状态">
                <span class="task-status-pill" :class="taskStatusTone(row)">{{ formatTaskStatusLabel(row) }}</span>
              </td>
              <td class="task-updated-cell task-col-updated" data-label="更新时间">{{ row.updatedAt ? row.updatedAt.replace('T', ' ').slice(0, 16) : '-' }}</td>
              <td class="right task-col-actions" data-label="操作">
                <div class="task-row-actions">
                  <button v-if="canManageTasks" class="task-action-button" type="button" title="运行智能体" @click="openRunDialog(row)">
                    <el-icon><VideoPlay /></el-icon>
                  </button>
                  <button v-if="canManageTasks" class="task-action-button" type="button" title="编辑任务" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button
                    v-if="canManageTasks && row.canDelete"
                    class="task-action-button danger"
                    type="button"
                    title="删除任务"
                    @click="handleDelete(row.id)"
                  >
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="task-table-footer">
        <div class="task-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="task-footer-controls">
          <div class="task-page-size">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="task-page-nav">
            <button class="task-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="task-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="task-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

  <el-dialog v-model="dialogVisible" :title="isEditing ? '编辑任务' : '新建任务'" width="980px" class="work-item-dialog platform-form-dialog">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="work-item-form platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">基础信息</div>
          <div class="platform-form-section-subtitle">填写任务标题、归属、负责人和执行属性。</div>
        </div>
        <el-form-item label="标题" prop="name" class="grid-span-2">
          <el-input v-model="form.name" placeholder="请输入任务标题" size="large" />
        </el-form-item>

        <div class="work-item-grid">
        <el-form-item label="负责人" class="compact-form-item">
          <el-select v-model="form.assigneeUserId" clearable filterable placeholder="请选择负责人" style="width: 100%">
            <el-option v-for="item in projectParticipantUsers" :key="item.id" :label="buildUserLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="协作人" class="compact-form-item">
          <el-select v-model="form.collaboratorUserIds" multiple filterable collapse-tags placeholder="请选择协作人" style="width: 100%">
            <el-option v-for="item in collaboratorSelectableUsers" :key="item.id" :label="buildUserLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属项目" prop="projectId" class="compact-form-item">
          <el-select v-model="form.projectId" placeholder="请选择项目" style="width: 100%" @change="handleFormProjectChange">
            <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联需求" class="compact-form-item">
          <el-select v-model="form.requirementTaskId" clearable filterable placeholder="可选，关联一个需求" style="width: 100%">
            <el-option v-for="item in requirementOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级" prop="priority" class="compact-form-item">
          <el-select v-model="form.priority" placeholder="请选择优先级" style="width: 100%">
            <el-option label="高" value="高" />
            <el-option label="中" value="中" />
            <el-option label="低" value="低" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.workItemType === '任务'" label="工时" class="compact-form-item">
          <el-tooltip :content="taskFormWorkHoursLockedReason" :disabled="!taskFormWorkHoursLockedReason">
            <el-input-number
              v-model="form.workHours"
              :min="0"
              :max="15"
              :step="0.5"
              :precision="1"
              controls-position="right"
              style="width: 100%"
              :disabled="Boolean(taskFormWorkHoursLockedReason)"
            />
          </el-tooltip>
          <div v-if="taskFormWorkHoursLockedReason" class="form-tip">{{ taskFormWorkHoursLockedReason }}</div>
        </el-form-item>
        <el-form-item label="状态" prop="status" class="compact-form-item">
          <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
            <el-option label="草稿" value="草稿" />
            <el-option label="待开始" value="待开始" />
            <el-option label="处理中" value="处理中" />
            <el-option label="已完成" value="已完成" />
            <el-option label="已阻塞" value="已阻塞" />
          </el-select>
        </el-form-item>
        </div>
      </section>

      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">详细说明</div>
          <div class="platform-form-section-subtitle">支持 Markdown，用于补充背景、目标和执行要求。</div>
        </div>
        <el-form-item label="详细说明" prop="description" class="grid-span-2 description-form-item">
          <MarkdownEditor v-model="form.description" :height="380" :upload-image="handleTaskMarkdownImageUpload" placeholder="请填写任务详细说明，支持 Markdown 格式" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="runDialogVisible" title="运行任务智能体" width="880px" destroy-on-close>
    <template v-if="currentRunTask">
      <el-descriptions :column="2" border class="run-meta">
        <el-descriptions-item label="任务">{{ currentRunTask.name }}</el-descriptions-item>
        <el-descriptions-item label="项目">{{ currentRunTask.projectName }}</el-descriptions-item>
        <el-descriptions-item label="执行智能体">{{ currentRunTask.agentName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ currentRunTask.status }}</el-descriptions-item>
      </el-descriptions>

      <div class="run-section">
        <div class="run-section-title">运行输入</div>
        <el-input v-model="runInput" type="textarea" :rows="10" placeholder="请输入运行内容" />
      </div>

      <div class="run-section">
        <div class="run-section-header">
          <div class="run-section-title">最近运行记录</div>
          <el-button link type="primary" @click="loadRunHistory">刷新</el-button>
        </div>
        <el-empty v-if="!runHistory.length && !runHistoryLoading" description="暂无运行记录" />
        <el-timeline v-else v-loading="runHistoryLoading">
          <el-timeline-item
            v-for="item in runHistory"
            :key="item.id"
            :timestamp="item.createdAt"
            :type="item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'primary'"
            placement="top"
          >
            <div class="run-history-item">
              <div class="run-history-title">
                <span>{{ item.agentName || '-' }}</span>
                <el-tag size="small" :type="item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'info'">
                  {{ formatRunStatusLabel(item.status) }}
                </el-tag>
              </div>
              <div v-if="item.requesterName" class="run-history-subtitle">执行人：{{ item.requesterName }}</div>
              <div class="run-history-block">
                <div class="run-history-label">输入</div>
                <pre>{{ item.input }}</pre>
              </div>
              <div v-if="item.output" class="run-history-block">
                <div class="run-history-label">输出</div>
                <pre>{{ item.output }}</pre>
              </div>
              <div v-if="item.errorMessage" class="run-history-block error">
                <div class="run-history-label">错误</div>
                <pre>{{ item.errorMessage }}</pre>
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </template>
    <template #footer>
      <el-button @click="runDialogVisible = false">关闭</el-button>
      <el-button type="primary" :loading="runningAgent" @click="handleRunAgent">运行</el-button>
    </template>
  </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, Tickets, VideoPlay } from '@element-plus/icons-vue'
import { listUserOptions } from '@/api/access'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import {
  createTask,
  deleteTask,
  listAgentOptions,
  listProjectWorkItems,
  listProjectOptions,
  listTaskAgentRuns,
  pageTasks,
  runTaskAgent,
  updateTask
} from '@/api/platform'
import {
  formatRequirementStatusLabel,
  isRequirementFullyPassed,
  getTaskWorkHoursLockedReason
} from '@/utils/requirementReview'
import { uploadMarkdownImage } from '@/utils/taskImageUpload'
import { useAuthStore } from '@/stores/auth'
import type { AgentItem, ProjectItem, TaskAgentRunItem, TaskItem, UserOptionItem } from '@/types/platform'

interface TaskForm {
  name: string
  workItemType: '需求' | '任务' | '缺陷'
  status: string
  priority: string
  workHours: number | null
  /** 工作项计划开始日期，仅用于保留后端已有数据。 */
  planStartDate: string | null
  /** 工作项计划结束日期，仅用于保留后端已有数据。 */
  planEndDate: string | null
  assignee: string
  assigneeUserId: number | null
  collaboratorUserIds: number[]
  description: string
  requirementMarkdown: string
  prototypeUrl: string
  projectId: number | null
  agentId: number | null
  iterationId: number | null
  requirementTaskId: number | null
}

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const runDialogVisible = ref(false)
const runHistoryLoading = ref(false)
const runningAgent = ref(false)
const workHoursUpdatingId = ref<number | null>(null)
const isEditing = ref(false)
const currentId = ref<number | null>(null)
const assigneeFallback = ref('')
const taskList = ref<TaskItem[]>([])
const projectOptions = ref<ProjectItem[]>([])
const requirementOptions = ref<TaskItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const runHistory = ref<TaskAgentRunItem[]>([])
const currentRunTask = ref<TaskItem | null>(null)
const runInput = ref('')
const formRef = ref<FormInstance>()
const canManageTasks = computed(() => authStore.hasPermission('task:manage'))

const pagination = reactive({
  page: 1,
  size: 10,
  total: 0
})

const filters = reactive({
  keyword: '',
  status: '',
  priority: '',
  projectId: undefined as number | undefined,
  agentId: undefined as number | undefined
})
const taskFilterPopoverVisible = ref(false)

const form = reactive<TaskForm>({
  name: '',
  workItemType: '任务',
  status: '草稿',
  priority: '中',
  workHours: null,
  planStartDate: null,
  planEndDate: null,
  assignee: '',
  assigneeUserId: null,
  collaboratorUserIds: [],
  description: '',
  requirementMarkdown: '',
  prototypeUrl: '',
  projectId: null,
  agentId: null,
  iterationId: null,
  requirementTaskId: null
})

const rules: FormRules<TaskForm> = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }]
}

const selectedFormProject = computed(() =>
  projectOptions.value.find((item) => item.id === form.projectId) || null
)

/**
 * 负责人与协作人只能从当前项目负责人、创建人和成员中选择，避免产生越权可见性。
 */
const projectParticipantUserIds = computed(() => {
  const result = new Set<number>()
  if (selectedFormProject.value?.ownerUserId != null) {
    result.add(selectedFormProject.value.ownerUserId)
  }
  if (selectedFormProject.value?.creatorUserId != null) {
    result.add(selectedFormProject.value.creatorUserId)
  }
  for (const userId of selectedFormProject.value?.memberUserIds || []) {
    result.add(userId)
  }
  return result
})

const projectParticipantUsers = computed(() =>
  userOptions.value.filter((item) => projectParticipantUserIds.value.has(item.id))
)

const collaboratorSelectableUsers = computed(() =>
  projectParticipantUsers.value.filter((item) => item.id !== form.assigneeUserId)
)
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const selectedRequirementForWorkHours = computed(() =>
  requirementOptions.value.find((item) => item.id === form.requirementTaskId) || null
)
const taskFormWorkHoursLockedReason = computed(() => {
  if (form.workItemType !== '任务' || !selectedRequirementForWorkHours.value) {
    return ''
  }
  return isRequirementFullyPassed(selectedRequirementForWorkHours.value)
    ? ''
    : '需关联需求开发、测试均通过后才可编辑'
})

const formatTaskStatusLabel = (task: TaskItem | null | undefined) => {
  if (!task) {
    return '-'
  }
  return formatRequirementStatusLabel(task)
}

const buildUserLabel = (item: UserOptionItem) => {
  return item.nickname?.trim() ? `${item.nickname} (${item.username})` : item.username
}

const ownerInitial = (value?: string | null) => (value || 'UN').slice(0, 2).toUpperCase()

const taskTypeTone = (workItemType?: string | null) => {
  if (workItemType === '需求') return 'requirement'
  if (workItemType === '缺陷') return 'defect'
  return 'task'
}

const taskPriorityTone = (priority?: string | null) => {
  if (priority === '高') return 'high'
  if (priority === '低') return 'low'
  return 'medium'
}

const taskStatusTone = (task: TaskItem) => {
  const status = formatTaskStatusLabel(task)
  if (['处理中', '进行中', '开发中'].includes(status)) return 'running'
  if (['已完成', '完成', '测试通过', '开发通过'].includes(status)) return 'done'
  if (['已阻塞', '阻塞'].includes(status)) return 'blocked'
  return 'draft'
}

const getRowWorkHoursLockedReason = (task: TaskItem) => {
  if (task.workItemType !== '任务') {
    return ''
  }
  return getTaskWorkHoursLockedReason(task)
}

const syncFormAssignee = () => {
  const selected = userOptions.value.find((item) => item.id === form.assigneeUserId)
  form.assignee = selected?.nickname?.trim() || selected?.username || assigneeFallback.value
  form.collaboratorUserIds = form.collaboratorUserIds.filter((item) => item !== form.assigneeUserId)
}

/**
 * 当项目发生切换时，及时剔除不属于当前项目参与人的负责人和协作人，避免提交无效数据。
 */
const normalizeFormParticipants = () => {
  if (form.assigneeUserId != null && !projectParticipantUserIds.value.has(form.assigneeUserId)) {
    form.assigneeUserId = null
    form.assignee = ''
    assigneeFallback.value = ''
  }
  form.collaboratorUserIds = form.collaboratorUserIds.filter((item) => projectParticipantUserIds.value.has(item))
}

const handleTaskMarkdownImageUpload = (file: File) => uploadMarkdownImage(file)

const openRequirementTask = (row: TaskItem) => {
  if (!row.requirementTaskId) {
    return
  }
  router.push({
    name: 'project-iterations',
    params: { projectId: row.projectId },
    query: { openTaskId: String(row.requirementTaskId) }
  })
}

const openTaskDetail = (row: TaskItem) => {
  router.push({
    name: 'project-iterations',
    params: { projectId: row.projectId },
    query: { openTaskId: String(row.id) }
  })
}

const openTaskProject = (projectId: number) => {
  router.push({
    name: 'project-iterations',
    params: { projectId }
  })
}

const loadRequirementOptions = async (projectId?: number | null) => {
  if (!projectId) {
    requirementOptions.value = []
    return
  }
  requirementOptions.value = await listProjectWorkItems(projectId, {
    workItemType: '需求'
  })
}

const buildTaskRunInput = (task: TaskItem) => {
  return [
    `任务：${task.name}`,
    `项目：${task.projectName}`,
    `状态：${task.status}`,
    `优先级：${task.priority}`,
    `工时：${task.workHours == null ? '-' : task.workHours}`,
    `负责人：${task.assignee}`,
    '',
    '说明：',
    task.description || ''
  ].join('\n')
}

const formatRunStatusLabel = (status?: string | null) => {
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  if (status === 'RUNNING') return '运行中'
  return status || '-'
}

const resetForm = () => {
  currentId.value = null
  form.name = ''
  form.workItemType = '任务'
  form.status = '草稿'
  form.priority = '中'
  form.workHours = null
  form.planStartDate = null
  form.planEndDate = null
  form.assignee = ''
  assigneeFallback.value = ''
  form.assigneeUserId = null
  form.collaboratorUserIds = []
  form.description = ''
  form.requirementMarkdown = ''
  form.prototypeUrl = ''
  form.projectId = projectOptions.value[0]?.id ?? null
  form.agentId = null
  form.iterationId = null
  form.requirementTaskId = null
  formRef.value?.clearValidate()
}

const refreshAgentOptionsForProject = async (projectId?: number | null) => {
  const options = await listAgentOptions(projectId ?? undefined)
  return options
}

const loadOptions = async () => {
  const [projects, users] = await Promise.all([listProjectOptions(), listUserOptions()])
  projectOptions.value = projects
  userOptions.value = users
  if (!form.projectId && projectOptions.value.length > 0) {
    form.projectId = projectOptions.value[0].id
  }
  await loadRequirementOptions(form.projectId)
}

const loadTasks = async () => {
  loading.value = true
  try {
    const pageData = await pageTasks({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      status: filters.status,
      priority: filters.priority,
      projectId: filters.projectId
    })
    taskList.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const loadRunHistory = async () => {
  if (!currentRunTask.value) return
  runHistoryLoading.value = true
  try {
    runHistory.value = await listTaskAgentRuns(currentRunTask.value.id)
  } finally {
    runHistoryLoading.value = false
  }
}

const handleSearch = async () => {
  taskFilterPopoverVisible.value = false
  pagination.page = 1
  await loadTasks()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.status = ''
  filters.priority = ''
  filters.projectId = undefined
  pagination.page = 1
  await loadTasks()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadTasks()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) {
    return
  }
  pagination.page -= 1
  await loadTasks()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) {
    return
  }
  pagination.page += 1
  await loadTasks()
}

const handleFilterProjectChange = async () => {
  pagination.page = 1
  await loadTasks()
}

const handleFormProjectChange = async () => {
  await loadRequirementOptions(form.projectId)
  normalizeFormParticipants()
  if (form.requirementTaskId && !requirementOptions.value.some((item) => item.id === form.requirementTaskId)) {
    form.requirementTaskId = null
  }
}

const openCreateDialog = async () => {
  if (!canManageTasks.value) {
    return
  }
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const openEditDialog = async (row: TaskItem) => {
  if (!canManageTasks.value) {
    ElMessage.warning('当前账号没有编辑任务的权限')
    return
  }
  isEditing.value = true
  currentId.value = row.id
  form.name = row.name
  form.workItemType = row.workItemType
  form.status = row.status
  form.priority = row.priority
  form.workHours = row.workHours
  form.planStartDate = row.planStartDate
  form.planEndDate = row.planEndDate
  form.assignee = row.assignee
  assigneeFallback.value = row.assigneeUserId ? '' : row.assignee
  form.assigneeUserId = row.assigneeUserId
  form.collaboratorUserIds = [...row.collaboratorUserIds]
  form.description = row.description
  form.requirementMarkdown = row.requirementMarkdown
  form.prototypeUrl = row.prototypeUrl
  form.projectId = row.projectId
  await loadRequirementOptions(form.projectId)
  normalizeFormParticipants()
  form.agentId = row.agentId
  form.iterationId = row.iterationId
  form.requirementTaskId = row.requirementTaskId
  dialogVisible.value = true
}

const openRunDialog = async (row: TaskItem) => {
  if (!canManageTasks.value) {
    return
  }
  if (!row.agentId) {
    ElMessage.warning('当前任务还没有绑定执行智能体')
    return
  }
  currentRunTask.value = row
  runInput.value = buildTaskRunInput(row)
  runHistory.value = []
  runDialogVisible.value = true
  await loadRunHistory()
}

const handleSubmit = async () => {
  if (!canManageTasks.value) {
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || form.projectId === null) return
  if (form.workItemType === '任务' && taskFormWorkHoursLockedReason.value && form.workHours !== null) {
    ElMessage.warning(taskFormWorkHoursLockedReason.value)
    return
  }

  submitting.value = true
  try {
    syncFormAssignee()
    const payload = {
      name: form.name,
      workItemType: form.workItemType,
      status: form.status,
      priority: form.priority,
      workHours: form.workItemType === '任务' ? form.workHours : null,
      planStartDate: form.planStartDate,
      planEndDate: form.planEndDate,
      assignee: form.assignee,
      assigneeUserId: form.assigneeUserId,
      collaboratorUserIds: form.collaboratorUserIds,
      description: form.description,
      requirementMarkdown: form.requirementMarkdown,
      prototypeUrl: form.prototypeUrl,
      projectId: form.projectId,
      agentId: form.agentId,
      iterationId: form.iterationId,
      requirementTaskId: form.requirementTaskId
    }
    if (isEditing.value && currentId.value !== null) {
      await updateTask(currentId.value, payload)
      ElMessage.success('任务更新成功')
    } else {
      await createTask(payload)
      ElMessage.success('任务创建成功')
    }
    dialogVisible.value = false
    await loadTasks()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const handleRunAgent = async () => {
  if (!canManageTasks.value) {
    return
  }
  if (!currentRunTask.value) return
  if (!runInput.value.trim()) {
    ElMessage.warning('请输入运行内容')
    return
  }
  runningAgent.value = true
  try {
    const result = await runTaskAgent(currentRunTask.value.id, runInput.value)
    runHistory.value = [result, ...runHistory.value.filter(item => item.id !== result.id)]
    ElMessage.success(result.status === 'SUCCESS' ? '任务智能体运行成功' : '任务智能体运行失败')
    await loadTasks()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '运行失败')
  } finally {
    runningAgent.value = false
  }
}

const handleQuickWorkHoursChange = async (row: TaskItem, value: number | string | null | undefined) => {
  if (!canManageTasks.value) {
    return
  }
  if (row.workItemType !== '任务') {
    return
  }
  const lockedReason = getRowWorkHoursLockedReason(row)
  if (lockedReason) {
    ElMessage.warning(lockedReason)
    return
  }
  const normalizedValue = value == null || value === '' ? null : Number(value)
  if (normalizedValue !== null && (!Number.isFinite(normalizedValue) || normalizedValue > 15 || normalizedValue < 0)) {
    ElMessage.warning('工时必须在 0 到 15 小时之间')
    return
  }
  const formattedValue = normalizedValue == null ? null : Number(normalizedValue.toFixed(1))
  if (row.workHours === formattedValue) {
    return
  }

  workHoursUpdatingId.value = row.id
  try {
    await updateTask(row.id, {
      name: row.name,
      workItemType: row.workItemType,
      status: row.status,
      priority: row.priority,
      workHours: formattedValue,
      planStartDate: row.planStartDate,
      planEndDate: row.planEndDate,
      assignee: row.assignee,
      assigneeUserId: row.assigneeUserId,
      collaboratorUserIds: row.collaboratorUserIds,
      description: row.description,
      requirementMarkdown: row.requirementMarkdown,
      prototypeUrl: row.prototypeUrl,
      projectId: row.projectId,
      agentId: row.agentId,
      iterationId: row.iterationId,
      requirementTaskId: row.requirementTaskId
    })
    row.workHours = formattedValue
    ElMessage.success('工时已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '工时更新失败')
  } finally {
    workHoursUpdatingId.value = null
  }
}

const handleDelete = async (id: number) => {
  if (!canManageTasks.value) {
    return
  }
  try {
    await ElMessageBox.confirm('确认删除该任务吗？', '提示', { type: 'warning' })
    await deleteTask(id)
    ElMessage.success('任务删除成功')
    await loadTasks()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

onMounted(async () => {
  await loadOptions()
  await loadTasks()
})
</script>

<style scoped>
.task-atelier-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.task-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.task-toolbar-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
}

.task-search-shell {
  position: relative;
  display: flex;
  flex: 0 1 340px;
  width: 340px;
  max-width: min(340px, 100%);
  align-items: center;
  min-width: 0;
}

.task-search-icon {
  position: absolute;
  left: 0;
  color: #9aa4af;
  font-size: 16px;
}

.task-search-input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 6px 0 6px 26px;
  color: #191c1d;
  font-size: 14px;
  font-weight: 500;
  outline: none;
}

.task-search-input::placeholder {
  color: #9aa4af;
}

.task-toolbar-divider {
  width: 1px;
  height: 18px;
  background: rgba(137, 115, 98, 0.18);
  flex: 0 0 auto;
}

.task-toolbar-button,
.task-create-button,
.task-title-button,
.task-link-button,
.task-action-button,
.task-page-button {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.task-toolbar-button {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 6px;
  background: rgba(243, 244, 245, 0.92);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.task-toolbar-button:hover {
  background: rgba(231, 232, 233, 0.96);
}

.task-toolbar-side {
  display: flex;
  justify-content: flex-end;
}

.task-create-button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-radius: 8px;
  background: #191c1d;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.task-table-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
}

.task-table-scroll {
  flex: 1 1 auto;
  min-height: 360px;
  overflow: auto;
}

.task-table {
  width: 100%;
  min-width: 1320px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.task-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.task-table th {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(221, 193, 174, 0.18);
  background: rgba(243, 244, 245, 0.52);
  color: #94a3b8;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-align: left;
  text-transform: uppercase;
}

.task-table td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(221, 193, 174, 0.08);
  vertical-align: middle;
}

.task-col-main {
  width: 27%;
}

.task-col-type {
  width: 8%;
}

.task-col-project {
  width: 10%;
}

.task-col-requirement {
  width: 12%;
}

.task-col-owner {
  width: 10%;
}

.task-col-collaborators {
  width: 13%;
}

.task-col-priority {
  width: 8%;
}

.task-col-hours {
  width: 8%;
}

.task-col-status {
  width: 10%;
}

.task-col-updated {
  width: 10%;
}

.task-col-actions {
  width: 8%;
}

.task-table th.center,
.task-table td.center {
  text-align: center;
}

.task-table th.right,
.task-table td.right {
  text-align: right;
}

.task-row:hover {
  background: #f3f4f5;
}

.task-primary-cell,
.task-owner-line,
.task-row-actions,
.task-footer-controls,
.task-page-size,
.task-page-nav {
  display: flex;
  align-items: center;
}

.task-primary-cell {
  gap: 12px;
  min-width: 0;
}

.task-title-button {
  width: 100%;
  padding: 0;
  background: transparent;
  text-align: left;
}

.task-primary-icon {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
  flex: 0 0 auto;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.task-primary-copy {
  min-width: 0;
}

.task-primary-title {
  overflow: hidden;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 800;
  transition: color 0.18s ease;
}

.task-primary-meta {
  margin-top: 4px;
  overflow: hidden;
  color: #758393;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
}

.task-title-button:hover .task-primary-title,
.task-title-button:focus-visible .task-primary-title {
  color: var(--app-primary);
}

.task-title-button:hover .task-primary-icon,
.task-title-button:focus-visible .task-primary-icon {
  background: rgba(var(--app-primary-container-rgb), 0.2);
  color: var(--app-primary);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.14);
}

.task-type-pill,
.task-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.task-type-pill.requirement {
  background: rgba(255, 220, 195, 0.82);
  color: #78471a;
}

.task-type-pill.task {
  background: rgba(199, 231, 255, 0.72);
  color: #004c6c;
}

.task-type-pill.defect {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.task-owner-block {
  min-width: 0;
}

.task-owner-line {
  gap: 8px;
}

.task-project-cell {
  overflow: hidden;
  color: #475569;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
}

.task-owner-avatar {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #e7e8e9;
  color: #475569;
  font-size: 9px;
  font-weight: 800;
  flex: 0 0 auto;
}

.task-owner-name {
  color: #191c1d;
  font-size: 12px;
  font-weight: 700;
}

.task-owner-meta {
  margin-top: 4px;
  color: #758393;
  font-size: 10px;
  font-weight: 600;
}

.task-collaborator-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.task-collaborator-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(231, 232, 233, 0.92);
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
}

.task-collaborator-chip.muted {
  background: rgba(255, 220, 195, 0.76);
  color: #8b5e34;
}

.task-link-button {
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  background: transparent;
  color: var(--app-text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  transition: color 0.18s ease;
}

.task-link-button:hover {
  color: var(--app-primary);
}

.task-empty-text,
.task-updated-cell {
  color: #758393;
  font-size: 11px;
  font-weight: 600;
}

.task-priority-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.task-priority-pill.high {
  background: rgba(255, 220, 195, 0.86);
  color: #a35100;
}

.task-priority-pill.medium {
  background: rgba(199, 231, 255, 0.76);
  color: #004c6c;
}

.task-priority-pill.low {
  background: rgba(231, 232, 233, 0.92);
  color: #64748b;
}

.task-status-pill.running {
  background: rgba(199, 231, 255, 0.72);
  color: #004c6c;
}

.task-status-pill.done {
  background: rgba(216, 240, 212, 0.82);
  color: #2f6f3e;
}

.task-status-pill.blocked {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.task-status-pill.draft {
  background: rgba(231, 232, 233, 0.88);
  color: #64748b;
}

.task-row-actions {
  justify-content: flex-end;
  gap: 8px;
  opacity: 1;
}

.task-action-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
}

.task-action-button:hover {
  background: rgba(255, 255, 255, 0.96);
  color: #904d00;
}

.task-action-button.danger:hover {
  color: #ba1a1a;
}

.task-table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-top: 1px solid rgba(221, 193, 174, 0.12);
  background: rgba(243, 244, 245, 0.56);
}

.task-footer-total {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.task-footer-total span {
  color: #64748b;
}

.task-footer-controls {
  gap: 18px;
}

.task-page-size {
  gap: 8px;
}

.task-page-size span,
.task-page-text {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.task-page-nav {
  gap: 10px;
}

.task-page-button {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
}

.task-page-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.92);
}

.task-page-button:disabled {
  color: #cbd5e1;
}

.task-filter-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-filter-field label {
  display: block;
  margin-bottom: 6px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.task-filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

:deep(.task-filter-popper.el-popper) {
  border: 0 !important;
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: 0 16px 28px rgba(25, 28, 29, 0.12) !important;
}

:deep(.task-filter-popper .el-popper__arrow) {
  display: none;
}

:deep(.task-page-size .el-select__wrapper),
:deep(.task-filter-panel .el-select__wrapper),
:deep(.task-filter-panel .el-input__wrapper),
:deep(.list-work-hours-input) {
  min-height: 30px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 1px rgba(221, 193, 174, 0.18) !important;
  padding-left: 8px;
  padding-right: 8px;
}

.work-item-form :deep(.el-form-item__label) {
  font-weight: 700;
  color: var(--app-text);
}

.work-item-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.grid-span-2 {
  grid-column: 1 / -1;
}

.compact-form-item {
  margin-bottom: 16px;
}

.description-form-item {
  margin-top: 8px;
  margin-bottom: 0;
}

.run-meta {
  margin-bottom: 16px;
}

.run-section {
  margin-top: 16px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(243, 244, 245, 0.9);
}

.run-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.run-section-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
}

.run-history-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.run-history-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.run-history-subtitle {
  color: var(--app-text-soft);
  font-size: 12px;
}

.run-history-block {
  border-radius: 18px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.9);
}

.run-history-block.error {
  background: rgba(255, 218, 214, 0.76);
}

.run-history-label {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--app-text-muted);
}

.run-history-block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.list-work-hours-input {
  width: 100%;
}

@media (max-width: 1280px) {
  .task-toolbar {
    grid-template-columns: 1fr;
  }

  .task-toolbar-main {
    width: 100%;
  }
}

@media (max-width: 900px) {
  .task-toolbar-main,
  .task-table-footer {
    flex-wrap: wrap;
  }

  .task-toolbar-divider {
    display: none;
  }

  .task-search-shell {
    width: 100%;
    max-width: 100%;
    flex-basis: 100%;
  }

  .task-footer-controls {
    width: 100%;
    justify-content: space-between;
  }

  .task-primary-title {
    font-size: 16px;
  }

  .task-primary-meta {
    font-size: 12px;
    line-height: 1.55;
  }

  .task-primary-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }

  .task-owner-line {
    min-height: 24px;
  }

  .task-collaborator-list {
    gap: 8px;
  }

  .task-row-actions {
    gap: 10px;
  }

  .work-item-grid {
    grid-template-columns: 1fr;
  }
}
</style>
