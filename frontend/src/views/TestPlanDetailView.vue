<template>
  <div class="atelier-list-page test-plan-detail-page">
    <section class="detail-hero">
      <div class="detail-hero-head">
        <div class="detail-hero-copy">
          <button class="detail-back-link" type="button" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            <span>返回测试计划</span>
          </button>
        </div>
        <div class="detail-hero-actions">
          <button v-if="canManage" class="atelier-create-button" type="button" @click="handleCreateCase">
            <el-icon><Plus /></el-icon>
            <span>新增测试用例</span>
          </button>
        </div>
      </div>

      <div class="detail-summary-grid">
        <article class="detail-summary-card detail-summary-card-compact">
          <div class="detail-summary-label">所属项目</div>
          <div class="detail-summary-main">
            <button v-if="plan?.projectId" class="management-list-link detail-summary-link" type="button" @click="goToProject(plan.projectId)">
              {{ plan?.projectName || '-' }}
            </button>
            <div v-else class="detail-summary-value">{{ plan?.projectName || '-' }}</div>
          </div>
        </article>

        <article class="detail-summary-card detail-summary-card-compact">
          <div class="detail-summary-label">所属迭代</div>
          <div class="detail-summary-main">
            <button
              v-if="plan?.projectId && plan?.iterationId"
              class="management-list-link detail-summary-link"
              type="button"
              @click="goToIteration(plan.projectId, plan.iterationId)"
            >
              {{ plan?.iterationName || '-' }}
            </button>
            <div v-else class="detail-summary-value">{{ plan?.iterationName || '-' }}</div>
            <div class="detail-summary-note">{{ plan?.updatedAt || '暂无更新时间' }}</div>
          </div>
        </article>

        <article class="detail-summary-card detail-summary-card-compact">
          <div class="detail-summary-label">计划状态</div>
          <div class="detail-summary-main">
            <CompactSelectMenu
              v-if="canManage && plan"
              :model-value="plan.status"
              :options="statusSelectOptions"
              class="status-select"
              @change="handlePlanStatusChange(String($event))"
            />
            <span v-else class="management-list-pill" :class="planStatusTone(plan?.status)">{{ plan?.status || '-' }}</span>
          </div>
        </article>

        <article class="detail-summary-card detail-summary-card-compact detail-summary-card-emphasis">
          <div class="detail-summary-label">用例总数</div>
          <div class="detail-summary-main">
            <div class="detail-summary-value">{{ cases.length }}</div>
          </div>
        </article>

        <article class="detail-summary-card detail-summary-card-description">
          <div class="detail-summary-label">计划说明</div>
          <div class="detail-summary-description">{{ plan?.description || '暂无说明' }}</div>
        </article>
      </div>
    </section>

    <section class="atelier-toolbar detail-toolbar">
      <div class="atelier-toolbar-main detail-toolbar-main">
        <div class="atelier-search-shell">
          <el-icon class="atelier-search-icon"><Search /></el-icon>
          <input
            v-model="caseKeyword"
            class="atelier-search-input"
            type="text"
            placeholder="搜索用例标题、模块、步骤或备注..."
          />
        </div>
        <span class="atelier-toolbar-divider" aria-hidden="true"></span>
        <button class="atelier-toolbar-button" type="button" @click="resetCaseKeyword">
          <el-icon><RefreshRight /></el-icon>
          <span>重置筛选</span>
        </button>
      </div>

      <div class="atelier-toolbar-side">
        <div class="detail-toolbar-note">测试用例列表</div>
      </div>
    </section>

    <section class="atelier-table-shell">
      <div v-if="!filteredCases.length" class="atelier-empty-state">
        <el-empty :description="cases.length ? '当前筛选条件下暂无测试用例' : '暂无测试用例'">
          <el-button v-if="canManage && !cases.length" type="primary" @click="handleCreateCase">新增测试用例</el-button>
          <el-button v-else-if="caseKeyword" @click="resetCaseKeyword">清空筛选</el-button>
        </el-empty>
      </div>

      <template v-else>
        <div class="atelier-table-scroll">
          <div class="atelier-data-list detail-case-list">
            <div class="atelier-data-head detail-case-head">
              <div class="atelier-data-head-item detail-col-main">用例</div>
              <div class="atelier-data-head-item detail-col-module">功能模块</div>
              <div class="atelier-data-head-item detail-col-type">用例类型</div>
              <div class="atelier-data-head-item detail-col-priority center">优先级</div>
              <div class="atelier-data-head-item detail-col-steps center">步骤数</div>
              <div class="atelier-data-head-item detail-col-remarks">备注</div>
              <div class="atelier-data-head-item detail-col-actions right">操作</div>
            </div>

            <button
              v-for="row in pagedCases"
              :key="row.localId"
              class="atelier-data-row detail-case-row"
              type="button"
              @click="openCaseDetail(row.absoluteIndex)"
            >
              <div class="atelier-data-cell detail-col-main">
                <div class="management-list-title-cell">
                  <span class="management-list-title-icon"><el-icon><Finished /></el-icon></span>
                  <div class="management-list-title-copy">
                    <span class="detail-case-title">{{ formatCaseTitle(row) }}</span>
                    <div class="management-list-subtitle">{{ formatCasePreview(row) }}</div>
                  </div>
                </div>
              </div>

              <div class="atelier-data-cell detail-col-module">
                <span class="management-list-empty">{{ formatCaseModule(row) }}</span>
              </div>

              <div class="atelier-data-cell detail-col-type">
                <span class="management-list-pill info">{{ row.caseType || '功能测试' }}</span>
              </div>

              <div class="atelier-data-cell detail-col-priority center">
                <span class="management-list-pill" :class="casePriorityTone(row.priority)">{{ row.priority || '-' }}</span>
              </div>

              <div class="atelier-data-cell detail-col-steps center">
                <span class="management-list-pill neutral">{{ row.steps.length }}</span>
              </div>

              <div class="atelier-data-cell detail-col-remarks">
                <span class="detail-case-note">{{ formatCaseRemarks(row) }}</span>
              </div>

              <div class="atelier-data-cell detail-col-actions right">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="查看或编辑用例" @click.stop="openCaseDetail(row.absoluteIndex)">
                    <el-icon><Right /></el-icon>
                  </button>
                  <button v-if="canManage" class="management-list-row-button danger" type="button" title="删除用例" @click.stop="removeCase(row.absoluteIndex)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="atelier-table-footer">
          <div class="atelier-footer-total">共 <span>{{ filteredCases.length }}</span> 条</div>
          <div class="atelier-footer-controls">
            <div class="atelier-page-size atelier-compact-input">
              <span>每页</span>
              <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
                <el-option :value="5" label="5" />
                <el-option :value="10" label="10" />
                <el-option :value="20" label="20" />
                <el-option :value="50" label="50" />
              </el-select>
            </div>
            <div class="atelier-page-nav">
              <button class="atelier-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
                <el-icon><ArrowLeft /></el-icon>
              </button>
              <span class="atelier-page-text">第 {{ pagination.page }} / {{ caseTotalPages }} 页</span>
              <button class="atelier-page-button" type="button" :disabled="pagination.page >= caseTotalPages" @click="handleNextPage">
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </template>
    </section>

    <el-drawer
      v-model="drawerVisible"
      :title="drawerTitle"
      size="760px"
      destroy-on-close
      class="case-detail-drawer"
    >
      <template v-if="activeCase">
        <div class="drawer-form">
          <section class="form-section">
            <div class="form-section-head">
              <div class="form-section-title">基础信息</div>
              <div class="form-section-subtitle">编辑用例标题、模块、类型和前置条件。</div>
            </div>

            <div class="form-grid two-columns">
              <el-form-item label="用例标题" class="span-2">
                <el-input v-model="activeCase.title" :disabled="!canManage" placeholder="请输入测试用例标题" />
              </el-form-item>
              <el-form-item label="功能模块">
                <el-input v-model="activeCase.moduleName" :disabled="!canManage" placeholder="例如：登录、审批、报表" />
              </el-form-item>
              <el-form-item label="用例类型">
                <el-select v-model="activeCase.caseType" :disabled="!canManage" style="width: 100%">
                  <el-option v-for="option in caseTypeOptions" :key="option" :label="option" :value="option" />
                </el-select>
              </el-form-item>
              <el-form-item label="优先级">
                <el-select v-model="activeCase.priority" :disabled="!canManage" style="width: 100%">
                  <el-option v-for="option in priorityOptions" :key="option" :label="option" :value="option" />
                </el-select>
              </el-form-item>
              <div />
              <el-form-item label="前置条件" class="span-2">
                <el-input
                  v-model="activeCase.precondition"
                  :disabled="!canManage"
                  type="textarea"
                  :rows="3"
                  placeholder="请输入前置条件"
                />
              </el-form-item>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <div class="form-section-title">步骤与预期结果</div>
              <div class="form-section-subtitle">按顺序维护测试步骤和对应的预期结果。</div>
            </div>

            <div class="step-section-head">
              <div class="step-section-title">{{ activeCase.steps.length }} 个步骤</div>
              <el-button v-if="canManage" link type="primary" @click="addStep(activeCase)">添加步骤</el-button>
            </div>

            <div v-if="!activeCase.steps.length" class="step-empty">
              <el-empty description="暂无测试步骤" />
            </div>

            <div v-for="(step, stepIndex) in activeCase.steps" :key="step.localId" class="step-row">
              <div class="step-order">{{ stepIndex + 1 }}</div>
              <div class="step-fields">
                <el-input
                  v-model="step.action"
                  :disabled="!canManage"
                  type="textarea"
                  :rows="2"
                  placeholder="请输入步骤描述"
                />
                <el-input
                  v-model="step.expectedResult"
                  :disabled="!canManage"
                  type="textarea"
                  :rows="2"
                  placeholder="请输入预期结果"
                />
              </div>
              <el-button v-if="canManage" link type="danger" @click="removeStep(activeCase, stepIndex)">删除</el-button>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <div class="form-section-title">备注</div>
              <div class="form-section-subtitle">补充环境说明、风险提示或数据准备要求。</div>
            </div>
            <el-form-item label="备注">
              <el-input
                v-model="activeCase.remarks"
                :disabled="!canManage"
                type="textarea"
                :rows="4"
                placeholder="可填写备注、数据准备说明或风险提示"
              />
            </el-form-item>
          </section>
        </div>
      </template>

      <template #footer>
        <el-button @click="drawerVisible = false">关闭</el-button>
        <el-button v-if="canManage" type="primary" :loading="saving" @click="handleSaveActiveCase">保存当前用例</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Delete, Finished, Plus, RefreshRight, Right, Search } from '@element-plus/icons-vue'
import CompactSelectMenu, { type CompactSelectOption } from '@/components/CompactSelectMenu.vue'
import { getTestPlanDetail, updateTestPlan } from '@/api/platform'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { TestPlanItem } from '@/types/platform'

interface StepForm {
  /** 前端抽屉中用于稳定渲染步骤行的本地键。 */
  localId: string
  /** 当前步骤序号。 */
  stepNo: number
  /** 测试步骤描述。 */
  action: string
  /** 当前步骤的预期结果。 */
  expectedResult: string
}

interface CaseForm {
  /** 前端列表中用于稳定渲染用例行的本地键。 */
  localId: string
  /** 测试用例标题。 */
  title: string
  /** 归属功能模块。 */
  moduleName: string
  /** 用例分类。 */
  caseType: string
  /** 用例优先级。 */
  priority: string
  /** 执行前置条件。 */
  precondition: string
  /** 用例备注。 */
  remarks: string
  /** 用例排序序号。 */
  sortOrder: number
  /** 当前用例下的测试步骤。 */
  steps: StepForm[]
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('test:manage'))

const statusOptions = ['草稿', '待执行', '执行中', '已完成']
const statusSelectOptions: CompactSelectOption[] = [
  { label: '草稿', value: '草稿', tone: 'info' },
  { label: '待执行', value: '待执行', tone: 'warning' },
  { label: '执行中', value: '执行中', tone: 'primary' },
  { label: '已完成', value: '已完成', tone: 'success' }
]
const caseTypeOptions = ['功能测试', '接口测试', '回归测试', '冒烟测试', '兼容性测试']
const priorityOptions = ['P0', 'P1', 'P2', 'P3']

const plan = ref<TestPlanItem | null>(null)
const cases = ref<CaseForm[]>([])
const saving = ref(false)
const drawerVisible = ref(false)
const activeCaseIndex = ref<number | null>(null)

const pagination = reactive({
  page: 1,
  size: 10
})
const caseKeyword = ref('')

const createLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

/**
 * 统一把接口返回值收敛为字符串，避免历史空值导致详情页渲染时直接报错。
 */
const normalizeText = (value: unknown, fallback = '') => {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return fallback
  }
  return String(value)
}

/**
 * 路由参数可能在组件复用时发生变化，这里按当前路由实时解析，避免读到旧的计划ID。
 */
const getCurrentPlanId = () => Number(route.params.planId)

const syncPageTitle = (title?: string | null) => {
  const pageTitle = normalizeText(title).trim() || '测试计划详情'
  appStore.setDynamicPageTitle(pageTitle, 'test-plan-detail')
}

const filteredCases = computed(() => {
  const normalizedKeyword = caseKeyword.value.trim().toLowerCase()
  const items = cases.value.map((item, index) => ({
    ...item,
    absoluteIndex: index
  }))
  if (!normalizedKeyword) {
    return items
  }

  return items.filter((item) => {
    const searchableText = [
      item.title,
      item.moduleName,
      item.caseType,
      item.priority,
      item.precondition,
      item.remarks,
      item.steps.map((step) => `${step.action} ${step.expectedResult}`).join(' ')
    ]
      .join(' ')
      .toLowerCase()
    return searchableText.includes(normalizedKeyword)
  })
})

const caseTotalPages = computed(() => Math.max(1, Math.ceil(filteredCases.value.length / pagination.size) || 1))

const pagedCases = computed(() =>
  filteredCases.value
    .slice((pagination.page - 1) * pagination.size, pagination.page * pagination.size)
)

const activeCase = computed(() => {
  if (activeCaseIndex.value === null) {
    return null
  }
  return cases.value[activeCaseIndex.value] || null
})

const drawerTitle = computed(() => {
  if (!activeCase.value) {
    return '测试用例详情'
  }
  return normalizeText(activeCase.value.title).trim() || '测试用例详情'
})

const planStatusTone = (status?: string | null) => {
  if (status === '已完成') return 'success'
  if (status === '执行中') return 'warning'
  if (status === '待执行') return 'info'
  return 'neutral'
}

const casePriorityTone = (priority?: string | null) => {
  if (priority === 'P0') return 'danger'
  if (priority === 'P1') return 'warning'
  if (priority === 'P2') return 'info'
  return 'neutral'
}

const formatCasePreview = (item: CaseForm) => {
  const segments = [normalizeText(item.precondition).trim(), normalizeText(item.steps[0]?.action).trim()]
    .filter(Boolean)
  if (!segments.length) {
    return '点击进入后补充前置条件、步骤与预期结果'
  }
  return segments.join(' · ')
}

const formatCaseRemarks = (item: CaseForm) => {
  const remarks = normalizeText(item.remarks).trim()
  if (remarks) {
    return remarks
  }
  return normalizeText(item.precondition).trim() || '-'
}

const formatCaseTitle = (item: CaseForm) => normalizeText(item.title).trim() || '未命名测试用例'

const formatCaseModule = (item: CaseForm) => normalizeText(item.moduleName).trim() || '-'

const resetCaseKeyword = () => {
  caseKeyword.value = ''
}

watch(caseKeyword, () => {
  pagination.page = 1
})

watch([() => filteredCases.value.length, () => pagination.size], () => {
  if (pagination.page > caseTotalPages.value) {
    pagination.page = caseTotalPages.value
  }
})

const handleSizeChange = () => {
  pagination.page = 1
}

const handlePrevPage = () => {
  if (pagination.page <= 1) {
    return
  }
  pagination.page -= 1
}

const handleNextPage = () => {
  if (pagination.page >= caseTotalPages.value) {
    return
  }
  pagination.page += 1
}

const createStep = (): StepForm => ({
  localId: createLocalId(),
  stepNo: 1,
  action: '',
  expectedResult: ''
})

const createCase = (): CaseForm => ({
  localId: createLocalId(),
  title: '',
  moduleName: '',
  caseType: '功能测试',
  priority: 'P2',
  precondition: '',
  remarks: '',
  sortOrder: cases.value.length,
  steps: [createStep()]
})

const syncOrder = () => {
  cases.value.forEach((item, index) => {
    item.sortOrder = index
    item.steps.forEach((step, stepIndex) => {
      step.stepNo = stepIndex + 1
    })
  })
}

/**
 * 详情页会直接消费后端响应，这里集中完成字段兜底，避免模板和保存逻辑到处判断空值。
 */
const fillCases = (detail: TestPlanItem) => {
  const sourceCases = Array.isArray(detail.cases) ? detail.cases : []
  cases.value = sourceCases.map((item, index) => ({
    localId: createLocalId(),
    title: normalizeText(item.title),
    moduleName: normalizeText(item.moduleName),
    caseType: normalizeText(item.caseType, '功能测试') || '功能测试',
    priority: normalizeText(item.priority, 'P2') || 'P2',
    precondition: normalizeText(item.precondition),
    remarks: normalizeText(item.remarks),
    sortOrder: item.sortOrder ?? index,
    steps: Array.isArray(item.steps) && item.steps.length
      ? item.steps.map((step, stepIndex) => ({
          localId: createLocalId(),
          stepNo: step.stepNo ?? stepIndex + 1,
          action: normalizeText(step.action),
          expectedResult: normalizeText(step.expectedResult)
        }))
      : [createStep()]
  }))
  syncOrder()
}

const loadPlan = async () => {
  const planId = getCurrentPlanId()
  if (Number.isNaN(planId) || planId <= 0) {
    ElMessage.error('测试计划参数不正确')
    await router.replace({ name: 'tests' })
    return
  }

  try {
    const detail = await getTestPlanDetail(planId)
    plan.value = detail
    syncPageTitle(detail.name)
    fillCases(detail)
    if (activeCaseIndex.value !== null && activeCaseIndex.value >= cases.value.length) {
      activeCaseIndex.value = cases.value.length ? cases.value.length - 1 : null
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载测试计划详情失败')
    await router.replace({ name: 'tests' })
  }
}

const buildPayloadCases = () => {
  const payloadCases: Array<{
    title: string
    moduleName: string
    caseType: string
    priority: string
    precondition: string
    remarks: string
    sortOrder: number
    steps: Array<{ stepNo: number; action: string; expectedResult: string }>
  }> = []

  for (let caseIndex = 0; caseIndex < cases.value.length; caseIndex += 1) {
    const item = cases.value[caseIndex]
    const title = normalizeText(item.title).trim()
    const moduleName = normalizeText(item.moduleName).trim()
    const precondition = normalizeText(item.precondition).trim()
    const remarks = normalizeText(item.remarks).trim()
    const hasStepContent = item.steps.some((step) => normalizeText(step.action).trim() || normalizeText(step.expectedResult).trim())
    const hasCaseContent = title || moduleName || precondition || remarks || hasStepContent

    if (!hasCaseContent) {
      continue
    }
    if (!title) {
      throw new Error(`第 ${caseIndex + 1} 个测试用例缺少标题`)
    }

    const steps = item.steps.reduce<Array<{ stepNo: number; action: string; expectedResult: string }>>((result, step, stepIndex) => {
      const action = normalizeText(step.action).trim()
      const expectedResult = normalizeText(step.expectedResult).trim()
      if (!action && !expectedResult) {
        return result
      }
      if (!action || !expectedResult) {
        throw new Error(`第 ${caseIndex + 1} 个测试用例的第 ${stepIndex + 1} 步请填写完整`)
      }
      result.push({
        stepNo: result.length + 1,
        action,
        expectedResult
      })
      return result
    }, [])

    if (!steps.length) {
      throw new Error(`第 ${caseIndex + 1} 个测试用例至少需要一条测试步骤`)
    }

    payloadCases.push({
      title,
      moduleName,
      caseType: item.caseType || '功能测试',
      priority: item.priority || 'P2',
      precondition,
      remarks,
      sortOrder: payloadCases.length,
      steps
    })
  }

  return payloadCases
}

const addCase = () => {
  cases.value.push(createCase())
  syncOrder()
}

const handleCreateCase = () => {
  addCase()
  pagination.page = Math.max(1, Math.ceil(cases.value.length / pagination.size))
  openCaseDetail(cases.value.length - 1)
}

const openCaseDetail = (index: number) => {
  activeCaseIndex.value = index
  drawerVisible.value = true
}

const removeCase = (index: number) => {
  cases.value.splice(index, 1)
  if (!cases.value.length) {
    activeCaseIndex.value = null
    drawerVisible.value = false
  } else if (activeCaseIndex.value !== null) {
    if (index === activeCaseIndex.value) {
      activeCaseIndex.value = Math.min(index, cases.value.length - 1)
    } else if (index < activeCaseIndex.value) {
      activeCaseIndex.value -= 1
    }
  }
  syncOrder()
  const totalPages = Math.max(1, Math.ceil(cases.value.length / pagination.size))
  if (pagination.page > totalPages) {
    pagination.page = totalPages
  }
}

const addStep = (item: CaseForm) => {
  item.steps.push(createStep())
  syncOrder()
}

const removeStep = (item: CaseForm, index: number) => {
  item.steps.splice(index, 1)
  syncOrder()
}

const handleSave = async () => {
  if (!plan.value) {
    return
  }

  saving.value = true
  try {
    await updateTestPlan(plan.value.id, {
      name: plan.value.name,
      projectId: plan.value.projectId,
      iterationId: plan.value.iterationId as number,
      status: plan.value.status,
      description: plan.value.description,
      cases: buildPayloadCases()
    })
    ElMessage.success('测试用例已保存')
    await loadPlan()
  } catch (error: any) {
    ElMessage.error(error?.message || error?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const goToProject = async (projectId: number) => {
  await router.push({ name: 'project-iterations', params: { projectId } })
}

const goToIteration = async (projectId: number, iterationId: number) => {
  await router.push({ name: 'project-iterations', params: { projectId }, query: { iterationId: String(iterationId) } })
}

const handlePlanStatusChange = async (status: string) => {
  if (!plan.value || !plan.value.iterationId || plan.value.status === status) {
    return
  }
  try {
    await updateTestPlan(plan.value.id, {
      name: plan.value.name,
      projectId: plan.value.projectId,
      iterationId: plan.value.iterationId,
      status,
      description: plan.value.description,
      cases: buildPayloadCases()
    })
    plan.value.status = status
    ElMessage.success('测试计划状态已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '状态更新失败')
  }
}

const handleSaveActiveCase = async () => {
  if (!activeCase.value) {
    return
  }
  const title = normalizeText(activeCase.value.title).trim()
  if (!title) {
    ElMessage.warning('请填写测试用例标题')
    return
  }
  const steps = activeCase.value.steps.filter((step) => normalizeText(step.action).trim() || normalizeText(step.expectedResult).trim())
  if (!steps.length) {
    ElMessage.warning('当前测试用例至少需要一条测试步骤')
    return
  }
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    if (!normalizeText(step.action).trim() || !normalizeText(step.expectedResult).trim()) {
      ElMessage.warning(`当前测试用例的第 ${index + 1} 步请填写完整`)
      return
    }
  }
  await handleSave()
  drawerVisible.value = false
}

const goBack = async () => {
  await router.push({ name: 'tests' })
}

watch(
  () => route.params.planId,
  async () => {
    await loadPlan()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  appStore.clearDynamicPageTitle('test-plan-detail')
})
</script>

<style scoped>
.test-plan-detail-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
}

.detail-hero {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
}

.detail-hero-head,
.detail-hero-actions,
.step-section-head {
  display: flex;
  align-items: center;
}

.detail-hero-head,
.step-section-head {
  justify-content: space-between;
}

.detail-hero-head {
  gap: 18px;
  flex-wrap: wrap;
}

.detail-hero-copy {
  min-width: 0;
}

.detail-hero-actions {
  gap: 10px;
  flex-wrap: wrap;
}

.detail-back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #374151;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.detail-back-link .el-icon {
  font-size: 15px;
}

.detail-back-link:hover {
  color: var(--app-primary);
}

.detail-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.detail-summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.detail-summary-card-compact {
  min-height: 92px;
}

.detail-summary-card-emphasis {
  background: linear-gradient(135deg, rgba(243, 244, 245, 0.84) 0%, rgba(233, 237, 242, 0.96) 100%);
}

.detail-summary-card-description {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}

.detail-summary-main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
}

.detail-summary-label {
  color: #94a3b8;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.detail-summary-link,
.detail-summary-value {
  min-width: 0;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 17px;
  font-weight: 800;
  line-height: 1.35;
}

.detail-summary-description {
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.75;
  padding-top: 1px;
}

.status-select {
  width: 100%;
}

.detail-toolbar-main {
  width: fit-content;
}

.detail-toolbar-note {
  color: #94a3b8;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.detail-case-head,
.detail-case-row {
  grid-template-columns: minmax(280px, 2.3fr) minmax(120px, 1fr) 110px 96px 96px minmax(180px, 1.2fr) 92px;
}

.detail-case-row {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.detail-case-title {
  display: block;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 800;
}

.detail-case-note {
  display: -webkit-box;
  overflow: hidden;
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.7;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.detail-col-type,
.detail-col-priority,
.detail-col-steps {
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-section {
  padding: 20px 20px 6px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
}

.form-section-head {
  margin-bottom: 16px;
}

.form-section-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
}

.form-section-subtitle {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.75;
  color: var(--app-text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.form-grid {
  display: grid;
  gap: 8px 16px;
}

.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.span-2 {
  grid-column: 1 / -1;
}

.step-section {
  margin-top: 6px;
}

.step-section-title {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 800;
}

.step-empty {
  padding: 12px 0;
}

.step-row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 14px 0;
  border-bottom: 1px dashed rgba(137, 115, 98, 0.16);
}

.step-row:last-child {
  border-bottom: 0;
}

.step-order {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--app-primary-container) 0%, var(--app-primary) 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.step-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.case-detail-drawer :deep(.el-drawer__body) {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

@media (max-width: 1180px) {
  .detail-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-summary-card-description {
    grid-column: 1 / -1;
  }

  .detail-case-head,
  .detail-case-row {
    grid-template-columns: minmax(220px, 2fr) minmax(110px, 0.9fr) 100px 90px 90px minmax(140px, 1fr) 86px;
  }
}

@media (max-width: 1024px) {
  .two-columns,
  .step-fields {
    grid-template-columns: 1fr;
  }

  .detail-hero-head,
  .detail-hero-actions {
    align-items: flex-start;
  }

  .detail-hero-actions {
    width: 100%;
  }

  .detail-summary-grid {
    grid-template-columns: 1fr;
  }

  .detail-summary-card-description {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .step-row {
    grid-template-columns: 32px 1fr;
  }
}

@media (max-width: 900px) {
  .detail-case-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .detail-col-type,
  .detail-col-priority,
  .detail-col-steps,
  .detail-col-actions.right {
    justify-content: flex-start;
  }
}
</style>
