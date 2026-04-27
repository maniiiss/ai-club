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
            placeholder="搜索工具名称、编码、模块或权限..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="toolFilterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="management-list-popper">
          <template #reference>
            <button class="management-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="management-list-filter-panel management-list-compact-input">
            <div class="management-list-filter-field">
              <label>模块</label>
              <el-select v-model="filters.moduleCode" clearable placeholder="模块" style="width: 100%" :teleported="false">
                <el-option v-for="item in moduleOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>启用状态</label>
              <el-select v-model="filters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="禁用" :value="false" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>读写类型</label>
              <el-select v-model="filters.readOnly" clearable placeholder="读写类型" style="width: 100%" :teleported="false">
                <el-option label="只读工具" :value="true" />
                <el-option label="写入工具" :value="false" />
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
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
          <table class="management-list-table tool-list-table mobile-card-table">
            <thead>
              <tr>
                <th class="tool-col-main">工具</th>
                <th class="tool-col-module">模块</th>
                <th class="tool-col-permission">权限</th>
                <th class="tool-col-readonly center">类型</th>
                <th class="tool-col-risk center">风险</th>
                <th class="tool-col-confirm center">确认</th>
                <th class="tool-col-enabled center">启用</th>
                <th class="tool-col-auto center">自动执行</th>
                <th class="tool-col-actions right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in toolList" :key="row.code" class="management-list-row">
                <td class="tool-col-main" data-label="工具">
                  <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                    <div class="management-list-title-cell">
                      <span class="management-list-title-icon"><el-icon><Connection /></el-icon></span>
                      <div class="management-list-title-copy">
                        <div class="management-list-title">{{ row.name }}</div>
                        <div class="management-list-subtitle">{{ row.code }}</div>
                      </div>
                    </div>
                  </button>
                </td>
                <td class="tool-col-module" data-label="模块">
                  <span class="management-list-empty">{{ row.moduleCode }}</span>
                </td>
                <td class="tool-col-permission" data-label="权限">
                  <span class="management-list-empty">{{ row.permissionCode || '-' }}</span>
                </td>
                <td class="tool-col-readonly center" data-label="类型">
                  <span class="management-list-pill" :class="row.readOnly ? 'info' : 'warning'">{{ row.readOnly ? '只读' : '写入' }}</span>
                </td>
                <td class="tool-col-risk center" data-label="风险">
                  <span class="management-list-pill" :class="toolRiskTone(row.riskLevel)">{{ row.riskLevel }}</span>
                </td>
                <td class="tool-col-confirm center" data-label="确认">
                  <span class="management-list-pill neutral">{{ row.requiresConfirm ? '需要' : '无需' }}</span>
                </td>
                <td class="tool-col-enabled center" data-label="启用">
                  <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
                </td>
                <td class="tool-col-auto center" data-label="自动执行">
                  <span class="management-list-pill" :class="row.allowAutoExecute ? 'success' : 'neutral'">{{ row.allowAutoExecute ? '允许' : '禁止' }}</span>
                </td>
                <td class="tool-col-actions right" data-label="操作">
                  <div class="management-list-row-actions">
                    <button class="management-list-row-button" type="button" title="查看工具" @click="openDetailDialog(row)">
                      <el-icon><View /></el-icon>
                    </button>
                    <button v-if="canManage" class="management-list-row-button" type="button" title="编辑工具配置" @click="openEditDialog(row)">
                      <el-icon><EditPen /></el-icon>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else>
          <div v-if="toolList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in toolList" :key="row.code" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon"><el-icon><Connection /></el-icon></span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.name }}</span>
                      <span class="mobile-entity-description">{{ row.code }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">模块</span>
                    <div class="mobile-entity-field-content"><span class="mobile-entity-empty-text">{{ row.moduleCode }}</span></div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">权限</span>
                    <div class="mobile-entity-field-content"><span class="mobile-entity-empty-text">{{ row.permissionCode || '-' }}</span></div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">类型</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.readOnly ? 'info' : 'warning'">{{ row.readOnly ? '只读' : '写入' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">风险</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="toolRiskTone(row.riskLevel)">{{ row.riskLevel }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">启用</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">自动执行</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.allowAutoExecute ? 'success' : 'neutral'">{{ row.allowAutoExecute ? '允许' : '禁止' }}</span>
                    </div>
                  </div>
                </div>
                <footer v-if="canManage" class="mobile-entity-actions">
                  <button class="mobile-entity-action-button" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑配置</span>
                  </button>
                </footer>
              </article>
            </div>
            <div v-if="hasMoreMobileItems" ref="sentinelRef" class="mobile-waterfall-sentinel"></div>
          </div>
          <div v-if="!toolList.length" class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无工具" />
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Connection" />
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">工具信息</div>
            <div class="platform-form-section-subtitle">工具实现来源于代码注册，这里只维护覆盖配置。</div>
          </div>

          <el-form-item label="工具名称">
            <el-input :model-value="currentTool?.name || ''" disabled />
          </el-form-item>
          <el-form-item label="工具编码">
            <el-input :model-value="currentTool?.code || ''" disabled />
          </el-form-item>
          <el-form-item label="模块">
            <el-input :model-value="currentTool?.moduleCode || ''" disabled />
          </el-form-item>
          <el-form-item label="权限码">
            <el-input :model-value="currentTool?.permissionCode || ''" disabled />
          </el-form-item>
          <el-form-item label="读写类型">
            <el-input :model-value="currentTool ? (currentTool.readOnly ? '只读工具' : '写入工具') : ''" disabled />
          </el-form-item>
          <el-form-item label="风险等级">
            <el-input :model-value="currentTool?.riskLevel || ''" disabled />
          </el-form-item>
          <el-form-item label="默认确认策略">
            <el-input :model-value="currentTool ? (currentTool.requiresConfirm ? '需要确认' : '无需确认') : ''" disabled />
          </el-form-item>

          <el-form-item label="展示名称覆盖">
            <el-input v-model="form.displayName" placeholder="留空则使用代码注册名称" />
          </el-form-item>
          <el-form-item label="描述覆盖">
            <el-input v-model="form.descriptionOverride" type="textarea" :rows="4" placeholder="留空则使用代码注册描述" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
          <el-form-item label="允许自动执行">
            <el-switch v-model="form.allowAutoExecute" :disabled="!currentTool?.readOnly" />
            <div class="form-tip">仅只读工具允许开启自动执行，写入工具仍需动作确认。</div>
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
import { ArrowLeft, ArrowRight, Connection, EditPen, Filter, RefreshRight, Search, View } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import { getPlatformToolDetail, pagePlatformTools, updatePlatformTool } from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { PlatformToolItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'

interface PlatformToolForm {
  displayName: string
  descriptionOverride: string
  enabled: boolean
  allowAutoExecute: boolean
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:tool:manage'))
const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const readonlyMode = ref(false)
const currentToolCode = ref('')
const toolList = ref<PlatformToolItem[]>([])
const currentTool = ref<PlatformToolItem | null>(null)
const formRef = ref<FormInstance>()

const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading,
  itemCount: computed(() => toolList.value.length),
  pagination,
  loadPage: async () => loadTools()
})
const filters = reactive<{ keyword: string; moduleCode: string; enabled: boolean | ''; readOnly: boolean | '' }>({
  keyword: '',
  moduleCode: '',
  enabled: '',
  readOnly: ''
})
const toolFilterPopoverVisible = ref(false)

const allLoadedTools = ref<PlatformToolItem[]>([])
const moduleOptions = computed(() =>
  Array.from(new Set(allLoadedTools.value.map((item) => item.moduleCode).filter(Boolean))).sort()
)

const dialogTitle = computed(() => readonlyMode.value ? '查看工具' : '编辑工具配置')
const dialogSubtitle = computed(() =>
  readonlyMode.value
    ? '查看工具定义、权限和当前覆盖配置。'
    : '调整工具启停、自动执行开关以及展示信息覆盖。'
)

const form = reactive<PlatformToolForm>({
  displayName: '',
  descriptionOverride: '',
  enabled: true,
  allowAutoExecute: false
})

const rules: FormRules<PlatformToolForm> = {
  displayName: [{ max: 120, message: '展示名称长度不能超过120', trigger: 'blur' }],
  descriptionOverride: [{ max: 1000, message: '描述长度不能超过1000', trigger: 'blur' }]
}

const toolRiskTone = (riskLevel: string) => {
  if (riskLevel === 'MEDIUM') return 'warning'
  if (riskLevel === 'HIGH') return 'danger'
  return 'info'
}

const loadTools = async () => {
  loading.value = true
  try {
    const data = await pagePlatformTools({
      page: requestPage.value,
      size: requestSize.value,
      keyword: filters.keyword,
      moduleCode: filters.moduleCode,
      enabled: filters.enabled,
      readOnly: filters.readOnly
    })
    toolList.value = data.records
    pagination.total = data.total
  } finally {
    loading.value = false
  }
}

const loadModuleOptions = async () => {
  const data = await pagePlatformTools({
    page: 1,
    size: 200
  })
  allLoadedTools.value = data.records
}

const handleSearch = async () => {
  toolFilterPopoverVisible.value = false
  resetMobilePagination()
  await loadTools()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.moduleCode = ''
  filters.enabled = ''
  filters.readOnly = ''
  resetMobilePagination()
  await loadTools()
}

const handleSizeChange = async () => {
  resetMobilePagination()
  await loadTools()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadTools()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadTools()
}

const fillForm = (row: PlatformToolItem) => {
  currentTool.value = row
  currentToolCode.value = row.code
  form.displayName = row.displayNameOverride || ''
  form.descriptionOverride = row.descriptionOverride || ''
  form.enabled = row.enabled
  form.allowAutoExecute = row.allowAutoExecute
  formRef.value?.clearValidate()
}

const openDetailDialog = async (row: PlatformToolItem) => {
  readonlyMode.value = true
  fillForm(await getPlatformToolDetail(row.code))
  dialogVisible.value = true
}

const openEditDialog = async (row: PlatformToolItem) => {
  readonlyMode.value = false
  fillForm(await getPlatformToolDetail(row.code))
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!currentToolCode.value) {
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }

  submitting.value = true
  try {
    await updatePlatformTool(currentToolCode.value, {
      displayName: form.displayName || '',
      descriptionOverride: form.descriptionOverride || '',
      enabled: form.enabled,
      allowAutoExecute: form.allowAutoExecute
    })
    ElMessage.success('工具配置更新成功')
    dialogVisible.value = false
    await loadTools()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新失败')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadTools(), loadModuleOptions()])
})
</script>

<style scoped>
.tool-col-main {
  width: 28%;
}

.tool-col-module,
.tool-col-permission {
  width: 14%;
}

.tool-col-readonly,
.tool-col-risk,
.tool-col-confirm,
.tool-col-enabled,
.tool-col-auto {
  width: 8%;
}

.tool-col-actions {
  width: 8%;
}
</style>
