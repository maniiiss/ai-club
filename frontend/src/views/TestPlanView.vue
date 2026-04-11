<template>
  <div class="atelier-list-page">
    <section class="atelier-toolbar">
      <div class="atelier-toolbar-main">
        <div class="atelier-search-shell">
          <el-icon class="atelier-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="atelier-search-input"
            type="text"
            placeholder="搜索测试计划名称或说明..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="atelier-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="testPlanFilterPopoverVisible" trigger="click" placement="bottom-start" :width="340" popper-class="atelier-filter-popper">
          <template #reference>
            <button class="atelier-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="atelier-filter-panel atelier-compact-input">
            <div class="atelier-filter-field">
              <label>所属项目</label>
              <el-select v-model="filters.projectId" clearable placeholder="所属项目" style="width: 100%" :teleported="false" @change="handleFilterProjectChange">
                <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
            <div class="atelier-filter-field">
              <label>所属迭代</label>
              <el-select v-model="filters.iterationId" clearable :disabled="!filters.projectId" placeholder="所属迭代" style="width: 100%" :teleported="false">
                <el-option v-for="item in filterIterationOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
            <div class="atelier-filter-field">
              <label>状态</label>
              <el-select v-model="filters.status" clearable placeholder="状态" style="width: 100%" :teleported="false">
                <el-option v-for="item in statusOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </div>
            <div class="atelier-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="atelier-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>

      <div class="atelier-toolbar-side">
        <button v-if="canManage" class="atelier-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建测试计划</span>
        </button>
      </div>
    </section>

    <section class="atelier-table-shell">
      <div class="atelier-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
        <div class="atelier-data-list test-plan-list-table mobile-card-list">
          <div class="atelier-data-head test-plan-list-head">
            <div class="atelier-data-head-item test-col-main">计划</div>
            <div class="atelier-data-head-item test-col-project">所属项目</div>
            <div class="atelier-data-head-item test-col-iteration">所属迭代</div>
            <div class="atelier-data-head-item test-col-status center">状态</div>
            <div class="atelier-data-head-item test-col-cases center">用例数</div>
            <div class="atelier-data-head-item test-col-updated">更新时间</div>
            <div class="atelier-data-head-item test-col-actions right">操作</div>
          </div>
            <div v-for="row in list" :key="row.id" class="atelier-data-row test-plan-list-row">
              <div class="atelier-data-cell test-col-main" data-label="计划">
                <button class="management-list-title-trigger test-plan-trigger" type="button" @click="openDetail(row.id)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon"><el-icon><Finished /></el-icon></span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title test-plan-link">{{ row.name }}</div>
                      <div class="management-list-subtitle">{{ row.description || '暂无说明' }}</div>
                    </div>
                  </div>
                </button>
              </div>
            <div class="atelier-data-cell test-col-project" data-label="所属项目">
              <button class="management-list-link" type="button" @click="goToProject(row.projectId)">{{ row.projectName }}</button>
            </div>
            <div class="atelier-data-cell test-col-iteration" data-label="所属迭代">
              <button v-if="row.iterationId" class="management-list-link" type="button" @click="goToIteration(row.projectId, row.iterationId)">
                {{ row.iterationName || '-' }}
              </button>
              <span v-else class="management-list-empty">-</span>
            </div>
            <div class="atelier-data-cell test-col-status center" data-label="状态">
              <CompactSelectMenu
                v-if="canManage"
                :model-value="row.status || null"
                :options="statusSelectOptions"
                :disabled="statusUpdatingId === row.id"
                class="status-select"
                @change="handleStatusChange(row.id, String($event))"
              />
              <span v-else class="management-list-pill" :class="testPlanStatusTone(row.status)">{{ row.status }}</span>
            </div>
            <div class="atelier-data-cell test-col-cases center" data-label="用例数">
              <span class="management-list-pill neutral">{{ row.caseCount }}</span>
            </div>
            <div class="atelier-data-cell test-col-updated" data-label="更新时间">
              <span class="management-list-updated">{{ row.updatedAt }}</span>
            </div>
            <div class="atelier-data-cell test-col-actions right" data-label="操作">
              <div class="management-list-row-actions">
                <button class="management-list-row-button" type="button" :title="canManage ? '进入计划' : '查看计划'" @click="openDetail(row.id)">
                  <el-icon><Right /></el-icon>
                </button>
                <button v-if="canManage" class="management-list-row-button" type="button" title="编辑计划" @click="openEditDialog(row.id)">
                  <el-icon><EditPen /></el-icon>
                </button>
                <button v-if="canManage" class="management-list-row-button danger" type="button" title="删除计划" @click="handleDelete(row.id)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
        </template>
        <template v-else>
          <div v-if="list.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in list" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetail(row.id)">
                    <span class="mobile-entity-icon">
                      <el-icon><Finished /></el-icon>
                    </span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.name }}</span>
                      <span class="mobile-entity-description">{{ row.description || '暂无说明' }}</span>
                    </span>
                  </button>
                </header>

                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">项目</span>
                    <div class="mobile-entity-field-content">
                      <button class="management-list-link" type="button" @click="goToProject(row.projectId)">{{ row.projectName }}</button>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">迭代</span>
                    <div class="mobile-entity-field-content">
                      <button v-if="row.iterationId" class="management-list-link" type="button" @click="goToIteration(row.projectId, row.iterationId)">
                        {{ row.iterationName || '-' }}
                      </button>
                      <span v-else class="mobile-entity-empty-text">-</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <CompactSelectMenu
                        v-if="canManage"
                        :model-value="row.status || null"
                        :options="statusSelectOptions"
                        class="status-select"
                        @change="handleStatusChange(row.id, String($event))"
                      />
                      <span v-else class="management-list-pill" :class="testPlanStatusTone(row.status)">{{ row.status }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">用例数</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill neutral">{{ row.caseCount }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">更新</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.updatedAt }}</span>
                    </div>
                  </div>
                </div>

                <footer class="mobile-entity-actions">
                  <button class="mobile-entity-action-button info" type="button" @click="openDetail(row.id)">
                    <el-icon><Right /></el-icon>
                    <span>{{ canManage ? '进入计划' : '查看计划' }}</span>
                  </button>
                  <button v-if="canManage" class="mobile-entity-action-button" type="button" @click="openEditDialog(row.id)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button v-if="canManage" class="mobile-entity-action-button danger" type="button" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
          <div v-else class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无测试计划" />
          </div>
        </template>
      </div>

      <div class="atelier-table-footer">
        <div class="atelier-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="atelier-footer-controls">
          <div class="atelier-page-size atelier-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="atelier-page-nav">
            <button class="atelier-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="atelier-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="atelier-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="760px"
    class="platform-form-dialog"
    align-center
    destroy-on-close
  >
    <template #header>
      <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Finished" />
    </template>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">计划信息</div>
          <div class="platform-form-section-subtitle">先创建测试计划，保存后再进入计划详情维护测试用例。</div>
        </div>
        <div class="plan-grid">
          <el-form-item label="计划名称" prop="name" class="span-2">
            <el-input v-model="form.name" :disabled="!canManageCurrent" placeholder="请输入测试计划名称" />
          </el-form-item>
          <el-form-item label="所属项目" prop="projectId">
            <el-select
              v-model="form.projectId"
              :disabled="!canManageCurrent"
              placeholder="请选择项目"
              style="width: 100%"
              @change="handleFormProjectChange"
            >
              <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属迭代" prop="iterationId">
            <el-select
              v-model="form.iterationId"
              :disabled="!canManageCurrent || !form.projectId"
              placeholder="请选择迭代"
              style="width: 100%"
            >
              <el-option v-for="item in formIterationOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="form.status" :disabled="!canManageCurrent" style="width: 100%">
              <el-option v-for="item in statusOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <div />
          <el-form-item label="说明" class="span-2">
            <el-input
              v-model="form.description"
              :disabled="!canManageCurrent"
              type="textarea"
              :rows="4"
              placeholder="用于描述测试范围、版本范围和执行目标"
            />
          </el-form-item>
        </div>
      </section>
    </el-form>

    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="dialogVisible = false">{{ canManageCurrent ? '取消' : '关闭' }}</el-button>
        <el-button v-if="canManageCurrent" type="primary" :loading="submitting" @click="handleSubmit">
          {{ isEditing ? '保存计划' : '保存并进入' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Finished, Plus, RefreshRight, Right, Search } from '@element-plus/icons-vue'
import CompactSelectMenu, { type CompactSelectOption } from '@/components/CompactSelectMenu.vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  createTestPlan,
  deleteTestPlan,
  getTestPlanDetail,
  listProjectOptions,
  listTestPlanIterations,
  pageTestPlans,
  updateTestPlan
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type { IterationItem, ProjectItem, TestCaseItem, TestPlanItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

interface PlanForm {
  name: string
  projectId: number | null
  iterationId: number | null
  status: string
  description: string
}

const statusOptions = ['草稿', '待执行', '执行中', '已完成']
const statusSelectOptions: CompactSelectOption[] = [
  { label: '草稿', value: '草稿', tone: 'info' },
  { label: '待执行', value: '待执行', tone: 'warning' },
  { label: '执行中', value: '执行中', tone: 'primary' },
  { label: '已完成', value: '已完成', tone: 'success' }
]

const router = useRouter()
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('test:manage'))

const loading = ref(false)
const submitting = ref(false)
const { isMobileViewport } = useMobileViewport()
const statusUpdatingId = ref<number | null>(null)
const dialogVisible = ref(false)
const isEditing = ref(false)
const readonlyMode = ref(false)
const currentId = ref<number | null>(null)
const list = ref<TestPlanItem[]>([])
const projectOptions = ref<ProjectItem[]>([])
const filterIterationOptions = ref<IterationItem[]>([])
const formIterationOptions = ref<IterationItem[]>([])
const currentCases = ref<TestCaseItem[]>([])
const formRef = ref<FormInstance>()

const pagination = reactive({
  page: 1,
  size: 10,
  total: 0
})
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))

const filters = reactive({
  keyword: '',
  projectId: undefined as number | undefined,
  iterationId: undefined as number | undefined,
  status: ''
})
const testPlanFilterPopoverVisible = ref(false)

const form = reactive<PlanForm>({
  name: '',
  projectId: null,
  iterationId: null,
  status: '草稿',
  description: ''
})

const rules: FormRules<PlanForm> = {
  name: [{ required: true, message: '请输入测试计划名称', trigger: 'blur' }],
  projectId: [{ required: true, message: '请选择所属项目', trigger: 'change' }],
  iterationId: [{ required: true, message: '请选择所属迭代', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
}

const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return '查看测试计划'
  }
  return isEditing.value ? '编辑测试计划' : '新建测试计划'
})
const dialogSubtitle = computed(() => {
  if (readonlyMode.value) {
    return '查看测试计划基础信息与归属关系。'
  }
  if (isEditing.value) {
    return '调整测试计划范围、状态和版本说明。'
  }
  return '填写测试计划基础信息，保存后继续维护测试用例。'
})

const canManageCurrent = computed(() => canManage.value && !readonlyMode.value)

const resetForm = () => {
  currentId.value = null
  currentCases.value = []
  form.name = ''
  form.projectId = projectOptions.value[0]?.id ?? null
  form.iterationId = null
  form.status = '草稿'
  form.description = ''
  formIterationOptions.value = []
  formRef.value?.clearValidate()
}

const fillForm = (plan: TestPlanItem) => {
  form.name = plan.name
  form.projectId = plan.projectId
  form.iterationId = plan.iterationId
  form.status = plan.status
  form.description = plan.description
  currentCases.value = plan.cases
}

const buildCasePayload = (cases: TestCaseItem[]) =>
  cases.map((item, caseIndex) => ({
    title: item.title,
    moduleName: item.moduleName,
    caseType: item.caseType,
    priority: item.priority,
    precondition: item.precondition,
    remarks: item.remarks,
    sortOrder: item.sortOrder ?? caseIndex,
    steps: item.steps.map((step, stepIndex) => ({
      stepNo: step.stepNo ?? stepIndex + 1,
      action: step.action,
      expectedResult: step.expectedResult
    }))
  }))

const loadProjectOptions = async () => {
  projectOptions.value = await listProjectOptions()
}

const loadIterationsByProject = async (projectId?: number | null) => {
  if (!projectId) {
    return []
  }
  return await listTestPlanIterations(projectId)
}

const loadData = async () => {
  loading.value = true
  try {
    const pageData = await pageTestPlans({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      projectId: filters.projectId,
      iterationId: filters.iterationId,
      status: filters.status
    })
    list.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  testPlanFilterPopoverVisible.value = false
  pagination.page = 1
  await loadData()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.projectId = undefined
  filters.iterationId = undefined
  filters.status = ''
  filterIterationOptions.value = []
  pagination.page = 1
  await loadData()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadData()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadData()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadData()
}

const handleFilterProjectChange = async () => {
  if (!filters.projectId) {
    filters.iterationId = undefined
    filterIterationOptions.value = []
    return
  }
  filterIterationOptions.value = await loadIterationsByProject(filters.projectId)
  if (filters.iterationId && !filterIterationOptions.value.some((item) => item.id === filters.iterationId)) {
    filters.iterationId = undefined
  }
}

const handleFormProjectChange = async () => {
  formIterationOptions.value = await loadIterationsByProject(form.projectId)
  if (form.iterationId && !formIterationOptions.value.some((item) => item.id === form.iterationId)) {
    form.iterationId = null
  }
}

const openCreateDialog = async () => {
  readonlyMode.value = false
  isEditing.value = false
  resetForm()
  if (form.projectId) {
    formIterationOptions.value = await loadIterationsByProject(form.projectId)
    form.iterationId = formIterationOptions.value[0]?.id ?? null
  }
  dialogVisible.value = true
}

const openEditDialog = async (id: number) => {
  loading.value = true
  try {
    const detail = await getTestPlanDetail(id)
    readonlyMode.value = !canManage.value
    isEditing.value = true
    currentId.value = detail.id
    formIterationOptions.value = await loadIterationsByProject(detail.projectId)
    fillForm(detail)
    dialogVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载测试计划失败')
  } finally {
    loading.value = false
  }
}

const openDetail = async (id: number) => {
  await router.push({ name: 'test-plan-detail', params: { planId: id } })
}

const goToProject = async (projectId: number) => {
  await router.push({ name: 'project-iterations', params: { projectId } })
}

const goToIteration = async (projectId: number, iterationId: number) => {
  await router.push({ name: 'project-iterations', params: { projectId }, query: { iterationId: String(iterationId) } })
}

const handleStatusChange = async (id: number, status: string) => {
  if (!status) {
    return
  }
  statusUpdatingId.value = id
  try {
    const detail = await getTestPlanDetail(id)
    if (detail.status === status) {
      return
    }
    await updateTestPlan(id, {
      name: detail.name,
      projectId: detail.projectId,
      iterationId: detail.iterationId as number,
      status,
      description: detail.description,
      cases: buildCasePayload(detail.cases)
    })
    const target = list.value.find((item) => item.id === id)
    if (target) {
      target.status = status
    }
    ElMessage.success('测试计划状态已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '状态更新失败')
  } finally {
    statusUpdatingId.value = null
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || form.projectId === null || form.iterationId === null) {
    return
  }

  submitting.value = true
  try {
    const payload = {
      name: form.name.trim(),
      projectId: form.projectId,
      iterationId: form.iterationId,
      status: form.status,
      description: form.description.trim(),
      cases: buildCasePayload(currentCases.value)
    }

    if (isEditing.value && currentId.value !== null) {
      await updateTestPlan(currentId.value, payload)
      ElMessage.success('测试计划已更新')
      dialogVisible.value = false
      await loadData()
    } else {
      const created = await createTestPlan(payload)
      ElMessage.success('测试计划已创建，继续补充测试用例')
      dialogVisible.value = false
      await openDetail(created.id)
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('确认删除该测试计划吗？计划下的测试用例会一并删除。', '提示', { type: 'warning' })
    await deleteTestPlan(id)
    ElMessage.success('测试计划已删除')
    await loadData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

const testPlanStatusTone = (status?: string | null) => {
  if (status === '已完成') return 'success'
  if (status === '执行中') return 'warning'
  if (status === '待执行') return 'info'
  return 'neutral'
}

onMounted(async () => {
  try {
    await loadProjectOptions()
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载测试计划失败')
  }
})
</script>

<style scoped>
.atelier-list-page,
.atelier-table-shell,
.atelier-table-scroll {
  min-width: 0;
}

.status-select {
  width: 100%;
}

.test-plan-list-table {
  width: 100%;
  min-width: 0;
}

.test-plan-list-head,
.test-plan-list-row {
  grid-template-columns:
    minmax(0, 2.3fr)
    minmax(0, 1.3fr)
    minmax(0, 1.3fr)
    minmax(0, 1.1fr)
    minmax(0, 0.7fr)
    minmax(0, 1.1fr)
    minmax(0, 0.95fr);
}

.test-col-main {
  min-width: 0;
}

.test-col-project {
  min-width: 0;
}

.test-col-iteration {
  min-width: 0;
}

.test-col-status {
  min-width: 0;
}

.test-col-cases {
  min-width: 0;
}

.test-col-updated {
  min-width: 0;
}

.test-col-actions {
  min-width: 0;
}

.test-plan-link {
  margin-top: 0;
}

.test-plan-trigger {
  width: 100%;
}

.test-col-project .management-list-link,
.test-col-iteration .management-list-link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text);
}

.test-col-project .management-list-link:hover,
.test-col-iteration .management-list-link:hover {
  color: var(--app-primary);
}

@media (max-width: 1200px) {
  .test-plan-list-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 16px;
    padding: 14px;
  }

  .test-col-main,
  .test-col-actions {
    grid-column: 1 / -1;
  }
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.span-2 {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .plan-grid {
    grid-template-columns: 1fr;
  }
}
</style>
