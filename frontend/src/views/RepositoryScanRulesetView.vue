<template>
  <div class="management-list-page">
    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索规则集编码、名称或描述..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="filterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
          <template #reference>
            <button class="management-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="management-list-filter-panel management-list-compact-input">
            <div class="management-list-filter-field">
              <label>引擎</label>
              <el-select v-model="filters.engineType" clearable placeholder="扫描引擎" style="width: 100%" :teleported="false">
                <el-option label="SEMGREP" value="SEMGREP" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>状态</label>
              <el-select v-model="filters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="停用" :value="false" />
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
      <div v-if="canManage" class="management-list-toolbar-side">
        <button class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增规则集</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
          <table class="management-list-table mobile-card-table ruleset-table">
            <thead>
              <tr>
                <th class="ruleset-col-main">规则集</th>
                <th class="ruleset-col-engine center">引擎</th>
                <th class="ruleset-col-default center">默认</th>
                <th class="ruleset-col-status center">状态</th>
                <th class="ruleset-col-actions right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!list.length">
                <td colspan="5" class="gitlab-empty-row">暂无扫描规则集</td>
              </tr>
              <tr v-for="row in list" :key="row.id || row.code" class="management-list-row">
                <td class="ruleset-col-main" data-label="规则集">
                  <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                    <div class="management-list-title-cell">
                      <span class="management-list-title-icon"><el-icon><Search /></el-icon></span>
                      <div class="management-list-title-copy">
                        <div class="management-list-title">{{ row.name }}</div>
                        <div class="management-list-subtitle">{{ row.code }} · {{ row.description || '暂无描述' }}</div>
                      </div>
                    </div>
                  </button>
                </td>
                <td class="ruleset-col-engine center" data-label="引擎">
                  <span class="management-list-pill neutral">{{ row.engineType }}</span>
                </td>
                <td class="ruleset-col-default center" data-label="默认">
                  <span class="management-list-pill" :class="row.defaultSelected ? 'success' : 'neutral'">{{ row.defaultSelected ? '默认' : '普通' }}</span>
                </td>
                <td class="ruleset-col-status center" data-label="状态">
                  <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '停用' }}</span>
                </td>
                <td class="ruleset-col-actions right" data-label="操作">
                  <div class="management-list-row-actions">
                    <button class="management-list-row-button" type="button" title="查看规则集" @click="openDetailDialog(row)">
                      <el-icon><View /></el-icon>
                    </button>
                    <button v-if="canManage" class="management-list-row-button" type="button" title="编辑规则集" @click="openEditDialog(row)">
                      <el-icon><EditPen /></el-icon>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else>
          <div v-if="list.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in list" :key="row.id || row.code" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon"><el-icon><Search /></el-icon></span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.name }}</span>
                      <span class="mobile-entity-description">{{ row.code }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">引擎</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill neutral">{{ row.engineType }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">默认</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.defaultSelected ? 'success' : 'neutral'">{{ row.defaultSelected ? '默认' : '普通' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '停用' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">描述</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.description || '暂无描述' }}</span>
                    </div>
                  </div>
                </div>
                <footer v-if="canManage" class="mobile-entity-actions">
                  <button class="mobile-entity-action-button" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑规则集</span>
                  </button>
                </footer>
              </article>
            </div>
            <div v-if="hasMoreMobileItems" ref="sentinelRef" class="mobile-waterfall-sentinel"></div>
          </div>
          <div v-if="!list.length" class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无扫描规则集" />
          </div>
        </template>
      </div>

      <div v-if="showDesktopPagination" class="management-list-footer">
        <div class="management-list-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Search" />
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基础信息</div>
            <div class="platform-form-section-subtitle">维护规则集编码、默认状态与规则正文。</div>
          </div>
          <el-form-item label="规则集编码" prop="code">
            <el-input v-model="form.code" placeholder="例如：team-default" :disabled="readonlyMode || editingMode" />
          </el-form-item>
          <el-form-item label="规则集名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入规则集名称" />
          </el-form-item>
          <el-form-item label="描述" prop="description">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入规则集说明" />
          </el-form-item>
          <el-form-item label="扫描引擎" prop="engineType">
            <el-select v-model="form.engineType" style="width: 100%" :disabled="readonlyMode || editingMode">
              <el-option label="SEMGREP" value="SEMGREP" />
            </el-select>
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
          <el-form-item label="设为默认">
            <el-switch v-model="form.defaultSelected" />
            <div class="form-tip">系统同一时刻只允许一份默认规则集，保存后会自动替换其他默认项。</div>
          </el-form-item>
        </section>
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">规则内容</div>
          </div>
          <div v-if="!readonlyMode" class="ruleset-validate-bar">
            <el-button :loading="validating" @click="handleValidateRuleset">校验规则</el-button>
            <span v-if="validationMessage" class="ruleset-validate-message" :class="validationSuccess ? 'success' : 'error'">
              {{ validationMessage }}
            </span>
          </div>
          <el-form-item label="YAML 规则正文" prop="definitionContent">
            <el-input v-model="form.definitionContent" type="textarea" :rows="16" placeholder="请输入 Semgrep YAML 规则内容" />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!readonlyMode" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, EditPen, Filter, Plus, RefreshRight, Search, View } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  createRepositoryScanRuleset,
  getRepositoryScanRulesetDetail,
  pageRepositoryScanRulesets,
  updateRepositoryScanRuleset,
  validateRepositoryScanRuleset,
  type RepositoryScanRulesetPayload
} from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { RepositoryScanRulesetItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'

interface RepositoryScanRulesetForm {
  code: string
  name: string
  description: string
  engineType: string
  enabled: boolean
  defaultSelected: boolean
  definitionContent: string
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('scan:ruleset:manage'))
const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const validating = ref(false)
const dialogVisible = ref(false)
const readonlyMode = ref(false)
const editingMode = ref(false)
const currentRulesetId = ref<number | null>(null)
const formRef = ref<FormInstance>()
const list = ref<RepositoryScanRulesetItem[]>([])
const filterPopoverVisible = ref(false)
const validationMessage = ref('')
const validationSuccess = ref(false)

const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading,
  itemCount: computed(() => list.value.length),
  pagination,
  loadPage: async () => loadRulesets()
})
const filters = reactive<{ keyword: string; engineType: string; enabled: boolean | '' }>({
  keyword: '',
  engineType: '',
  enabled: ''
})

const form = reactive<RepositoryScanRulesetForm>({
  code: '',
  name: '',
  description: '',
  engineType: 'SEMGREP',
  enabled: true,
  defaultSelected: false,
  definitionContent: ''
})

const rules: FormRules<RepositoryScanRulesetForm> = {
  code: [
    { required: true, message: '请输入规则集编码', trigger: 'blur' },
    { max: 100, message: '规则集编码长度不能超过100', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入规则集名称', trigger: 'blur' },
    { max: 120, message: '规则集名称长度不能超过120', trigger: 'blur' }
  ],
  description: [{ max: 500, message: '规则集描述长度不能超过500', trigger: 'blur' }],
  engineType: [{ required: true, message: '请选择扫描引擎', trigger: 'change' }],
  definitionContent: [{ required: true, message: '请输入规则内容', trigger: 'blur' }]
}

const dialogTitle = computed(() => {
  if (readonlyMode.value) return '查看扫描规则集'
  return editingMode.value ? '编辑扫描规则集' : '新增扫描规则集'
})
const dialogSubtitle = computed(() =>
  readonlyMode.value
    ? '查看规则集基础信息、默认状态和 YAML 规则正文。'
    : '维护规则集基础信息、默认状态和 YAML 规则正文。'
)

const resetForm = () => {
  currentRulesetId.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  form.engineType = 'SEMGREP'
  form.enabled = true
  form.defaultSelected = false
  form.definitionContent = ''
  validationMessage.value = ''
  validationSuccess.value = false
  formRef.value?.clearValidate()
}

const fillForm = (row: RepositoryScanRulesetItem) => {
  currentRulesetId.value = row.id || null
  form.code = row.code
  form.name = row.name
  form.description = row.description || ''
  form.engineType = row.engineType
  form.enabled = row.enabled ?? true
  form.defaultSelected = row.defaultSelected
  form.definitionContent = row.definitionContent || ''
  validationMessage.value = ''
  validationSuccess.value = false
  formRef.value?.clearValidate()
}

const loadRulesets = async () => {
  loading.value = true
  try {
    const data = await pageRepositoryScanRulesets({
      page: requestPage.value,
      size: requestSize.value,
      keyword: filters.keyword,
      engineType: filters.engineType || undefined,
      enabled: filters.enabled
    })
    list.value = data.records
    pagination.total = data.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  filterPopoverVisible.value = false
  resetMobilePagination()
  await loadRulesets()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.engineType = ''
  filters.enabled = ''
  resetMobilePagination()
  await loadRulesets()
}

const handleSizeChange = async () => {
  resetMobilePagination()
  await loadRulesets()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadRulesets()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadRulesets()
}

const openCreateDialog = () => {
  readonlyMode.value = false
  editingMode.value = false
  resetForm()
  dialogVisible.value = true
}

const openDetailDialog = async (row: RepositoryScanRulesetItem) => {
  if (!row.id) return
  readonlyMode.value = true
  editingMode.value = true
  fillForm(await getRepositoryScanRulesetDetail(row.id))
  dialogVisible.value = true
}

const openEditDialog = async (row: RepositoryScanRulesetItem) => {
  if (!row.id) return
  readonlyMode.value = false
  editingMode.value = true
  fillForm(await getRepositoryScanRulesetDetail(row.id))
  dialogVisible.value = true
}

const buildPayload = (): RepositoryScanRulesetPayload => ({
  code: form.code.trim(),
  name: form.name.trim(),
  description: form.description.trim(),
  engineType: form.engineType.trim(),
  enabled: form.enabled,
  defaultSelected: form.defaultSelected,
  definitionContent: form.definitionContent.replace(/\r\n/g, '\n').trim()
})

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload = buildPayload()
    if (editingMode.value && currentRulesetId.value !== null) {
      await updateRepositoryScanRuleset(currentRulesetId.value, payload)
      ElMessage.success('扫描规则集更新成功')
    } else {
      await createRepositoryScanRuleset(payload)
      ElMessage.success('扫描规则集创建成功')
    }
    dialogVisible.value = false
    await loadRulesets()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

const handleValidateRuleset = async () => {
  validating.value = true
  validationMessage.value = ''
  validationSuccess.value = false
  try {
    const result = await validateRepositoryScanRuleset({
      engineType: form.engineType.trim(),
      definitionContent: form.definitionContent.replace(/\r\n/g, '\n').trim()
    })
    validationMessage.value = result?.message || '规则校验通过，可以保存。'
    validationSuccess.value = true
    ElMessage.success(validationMessage.value)
  } catch (error: any) {
    validationMessage.value = error?.response?.data?.message || '规则校验失败'
    validationSuccess.value = false
    ElMessage.error(validationMessage.value)
  } finally {
    validating.value = false
  }
}

onMounted(async () => {
  await loadRulesets()
})
</script>

<style scoped>
.ruleset-col-main {
  width: 52%;
}

.ruleset-col-engine,
.ruleset-col-default,
.ruleset-col-status {
  width: 12%;
}

.ruleset-col-actions {
  width: 12%;
}

.ruleset-validate-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.ruleset-validate-message {
  font-size: 13px;
  line-height: 1.5;
}

.ruleset-validate-message.success {
  color: #16a34a;
}

.ruleset-validate-message.error {
  color: #dc2626;
}
</style>
