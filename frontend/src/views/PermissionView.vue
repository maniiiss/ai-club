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
            placeholder="搜索功能名称、编码或描述..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="permissionFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
          <template #reference>
            <button class="management-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="management-list-filter-panel management-list-compact-input">
            <div class="management-list-filter-field">
              <label>类型</label>
              <el-select v-model="filters.type" clearable placeholder="类型" style="width: 100%" :teleported="false">
                <el-option label="菜单" value="MENU" />
                <el-option label="动作" value="ACTION" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>状态</label>
              <el-select v-model="filters.enabled" clearable placeholder="状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="禁用" :value="false" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>目录/用途</label>
              <el-select v-model="filters.taxonomy" clearable placeholder="目录或用途" style="width: 100%" :teleported="false">
                <el-option
                  v-for="group in taxonomyGroups"
                  :key="group.key"
                  :label="`${group.label} · ${group.usageLabel}`"
                  :value="group.key"
                />
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
        <button v-if="canManage && isMobileViewport" class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建功能</span>
        </button>
      </div>

      <div v-if="canManage && !isMobileViewport" class="management-list-toolbar-side">
        <button class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建功能</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
        <table class="management-list-table permission-list-table mobile-card-table">
          <thead>
            <tr>
              <th class="permission-col-main">功能</th>
              <th class="permission-col-code">编码</th>
              <th class="permission-col-type center">类型</th>
              <th class="permission-col-taxonomy">归属/用途</th>
              <th class="permission-col-parent">上级</th>
              <th class="permission-col-path">路径</th>
              <th class="permission-col-sort center">排序</th>
              <th class="permission-col-status center">状态</th>
              <th class="permission-col-built center">内置</th>
              <th v-if="canManage" class="permission-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in permissionList" :key="row.id" class="management-list-row">
              <td class="permission-col-main" data-label="功能">
                <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon"><el-icon><Setting /></el-icon></span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">{{ row.name }}</div>
                      <div class="management-list-subtitle">{{ row.description || '暂无描述' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="permission-col-code" data-label="编码">
                <span class="management-list-text">{{ row.code }}</span>
              </td>
              <td class="permission-col-type center" data-label="类型">
                <span class="management-list-pill" :class="row.type === 'MENU' ? 'info' : 'warning'">{{ row.type === 'MENU' ? '菜单' : '动作' }}</span>
              </td>
              <td class="permission-col-taxonomy" data-label="归属/用途">
                <div class="permission-taxonomy-stack">
                  <span class="permission-taxonomy-pill" :class="taxonomyOf(row).tone">{{ taxonomyOf(row).label }}</span>
                  <span class="permission-taxonomy-pill neutral">{{ taxonomyOf(row).usageLabel }}</span>
                </div>
              </td>
              <td class="permission-col-parent" data-label="上级">
                <span class="management-list-empty">{{ parentName(row.parentId) }}</span>
              </td>
              <td class="permission-col-path" data-label="路径">
                <span class="management-list-empty">{{ row.path || '-' }}</span>
              </td>
              <td class="permission-col-sort center" data-label="排序">
                <span class="management-list-text">{{ row.sortOrder }}</span>
              </td>
              <td class="permission-col-status center" data-label="状态">
                <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
              </td>
              <td class="permission-col-built center" data-label="内置">
                <span class="management-list-pill neutral">{{ row.builtIn ? '是' : '否' }}</span>
              </td>
              <td v-if="canManage" class="permission-col-actions right" data-label="操作">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="编辑功能" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button class="management-list-row-button danger" type="button" :disabled="row.builtIn" title="删除功能" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </template>
        <template v-else>
          <div v-if="permissionList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in permissionList" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon"><el-icon><Setting /></el-icon></span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.name }}</span>
                      <span class="mobile-entity-description">{{ row.description || '暂无描述' }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">编码</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.code }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">类型</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.type === 'MENU' ? 'info' : 'warning'">{{ row.type === 'MENU' ? '菜单' : '动作' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">归属/用途</span>
                    <div class="mobile-entity-field-content permission-taxonomy-stack">
                      <span class="permission-taxonomy-pill" :class="taxonomyOf(row).tone">{{ taxonomyOf(row).label }}</span>
                      <span class="permission-taxonomy-pill neutral">{{ taxonomyOf(row).usageLabel }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">上级</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ parentName(row.parentId) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">路径</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.path || '-' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">排序</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.sortOrder }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">内置</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill neutral">{{ row.builtIn ? '是' : '否' }}</span>
                    </div>
                  </div>
                </div>
                <footer v-if="canManage" class="mobile-entity-actions">
                  <button class="mobile-entity-action-button" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button class="mobile-entity-action-button danger" type="button" :disabled="row.builtIn" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </footer>
              </article>
            </div>
            <div v-if="hasMoreMobileItems" ref="sentinelRef" class="mobile-waterfall-sentinel"></div>
          </div>
          <div v-if="!permissionList.length" class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无功能" />
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

  <el-dialog v-if="!isMobileViewport" v-model="dialogVisible" :title="dialogTitle" width="620px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Setting" />
    </template>
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">功能信息</div>
          <div class="platform-form-section-subtitle">配置功能类型、路由信息和启用状态。</div>
        </div>
        <el-form-item label="功能名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入功能名称" />
        </el-form-item>
        <el-form-item label="功能编码" prop="code">
          <el-input v-model="form.code" :disabled="currentBuiltIn" placeholder="例如：project:view" />
        </el-form-item>
        <el-form-item label="目录/用途">
          <div class="permission-taxonomy-preview">
            <span class="permission-taxonomy-pill" :class="formTaxonomy.tone">{{ formTaxonomy.label }}</span>
            <span class="permission-taxonomy-pill neutral">{{ formTaxonomy.usageLabel }}</span>
          </div>
        </el-form-item>
        <el-form-item label="功能类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio label="MENU">菜单</el-radio>
            <el-radio label="ACTION">动作</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="上级功能">
          <el-select v-model="form.parentId" clearable placeholder="请选择上级功能" style="width: 100%">
            <el-option v-for="item in parentOptions" :key="item.id" :label="`${item.name} (${item.code})`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="路由路径">
          <el-input v-model="form.path" placeholder="菜单可配置，例如 /projects" />
        </el-form-item>
        <el-form-item label="组件名称">
          <el-input v-model="form.component" placeholder="例如：ProjectView" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="例如：User / Lock" />
        </el-form-item>
        <el-form-item label="排序值" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" :disabled="currentBuiltIn" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入描述" />
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

  <!-- 移动端权限/功能编辑抽屉。 -->
  <MobileFormDrawer
    v-else
    v-model="dialogVisible"
    :title="dialogTitle"
    :subtitle="dialogSubtitle"
    :submit-text="'保存'"
    :submitting="submitting"
    :header-icon="Setting"
    :close-on-click-modal="true"
    size="88%"
    @submit="handleSubmit"
    @cancel="dialogVisible = false"
  >
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">功能信息</div>
          <div class="platform-form-section-subtitle">配置功能类型、路由信息和启用状态。</div>
        </div>
        <el-form-item label="功能名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入功能名称" />
        </el-form-item>
        <el-form-item label="功能编码" prop="code">
          <el-input v-model="form.code" :disabled="currentBuiltIn" placeholder="例如：project:view" />
        </el-form-item>
        <el-form-item label="目录/用途">
          <div class="permission-taxonomy-preview">
            <span class="permission-taxonomy-pill" :class="formTaxonomy.tone">{{ formTaxonomy.label }}</span>
            <span class="permission-taxonomy-pill neutral">{{ formTaxonomy.usageLabel }}</span>
          </div>
        </el-form-item>
        <el-form-item label="功能类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio label="MENU">菜单</el-radio>
            <el-radio label="ACTION">动作</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="上级功能">
          <el-select v-model="form.parentId" clearable placeholder="请选择上级功能" style="width: 100%">
            <el-option v-for="item in parentOptions" :key="item.id" :label="`${item.name} (${item.code})`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="路由路径">
          <el-input v-model="form.path" placeholder="菜单可配置，例如 /projects" />
        </el-form-item>
        <el-form-item label="组件名称">
          <el-input v-model="form.component" placeholder="例如：ProjectView" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="例如：User / Lock" />
        </el-form-item>
        <el-form-item label="排序值" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" :disabled="currentBuiltIn" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入描述" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer mobile-form-drawer-footer">
        <el-button class="mobile-form-drawer-footer-btn" @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!readonlyMode" class="mobile-form-drawer-footer-btn is-primary" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </div>
    </template>
  </MobileFormDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, Setting } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import MobileFormDrawer from '@/components/MobileFormDrawer.vue'
import { createPermission, deletePermission, listPermissionOptions, pagePermissions, updatePermission } from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { PermissionItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'
import {
  PERMISSION_TAXONOMY_GROUPS,
  resolvePermissionTaxonomy,
  type PermissionTaxonomyGroupKey
} from '@/utils/permissionTaxonomy'

interface PermissionForm {
  name: string
  code: string
  type: 'MENU' | 'ACTION'
  path: string
  component: string
  icon: string
  parentId: number | null
  sortOrder: number
  enabled: boolean
  description: string
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:permission:manage'))
const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const readonlyMode = ref(false)
const currentId = ref<number | null>(null)
const currentBuiltIn = ref(false)
const rawPermissionList = ref<PermissionItem[]>([])
const allPermissions = ref<PermissionItem[]>([])
const formRef = ref<FormInstance>()
const filters = reactive<{ keyword: string; type: '' | 'MENU' | 'ACTION'; enabled: boolean | ''; taxonomy: PermissionTaxonomyGroupKey | '' }>({
  keyword: '',
  type: '',
  enabled: '',
  taxonomy: ''
})
const taxonomyGroups = PERMISSION_TAXONOMY_GROUPS
const taxonomyOf = (permission: Pick<PermissionItem, 'code'>) => resolvePermissionTaxonomy(permission)
const permissionList = computed(() =>
  filters.taxonomy
    ? rawPermissionList.value.filter((item) => taxonomyOf(item).key === filters.taxonomy)
    : rawPermissionList.value
)
const permissionFilterPopoverVisible = ref(false)

const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading,
  itemCount: computed(() => permissionList.value.length),
  pagination,
  loadPage: async () => loadPermissions()
})
const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return '查看功能'
  }
  return isEditing.value ? '编辑功能' : '新建功能'
})
const dialogSubtitle = computed(() => {
  if (readonlyMode.value) {
    return '查看功能类型、路由信息和启用状态。'
  }
  if (isEditing.value) {
    return '调整功能编码、路由信息和权限状态。'
  }
  return '填写功能基础信息，并补充路由、图标和排序配置。'
})
const form = reactive<PermissionForm>({
  name: '',
  code: '',
  type: 'MENU',
  path: '',
  component: '',
  icon: '',
  parentId: null,
  sortOrder: 100,
  enabled: true,
  description: ''
})

const rules: FormRules<PermissionForm> = {
  name: [{ required: true, message: '请输入功能名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入功能编码', trigger: 'blur' }],
  type: [{ required: true, message: '请选择功能类型', trigger: 'change' }],
  sortOrder: [{ required: true, message: '请输入排序值', trigger: 'change' }]
}

const permissionMap = computed(() => new Map(allPermissions.value.map((item) => [item.id, item.name])))
const parentOptions = computed(() => allPermissions.value.filter((item) => item.id !== currentId.value))
const formTaxonomy = computed(() => resolvePermissionTaxonomy({ code: form.code }))

const parentName = (parentId: number | null) => {
  if (!parentId) return '-'
  return permissionMap.value.get(parentId) || '-'
}

const resetForm = () => {
  currentId.value = null
  currentBuiltIn.value = false
  form.name = ''
  form.code = ''
  form.type = 'MENU'
  form.path = ''
  form.component = ''
  form.icon = ''
  form.parentId = null
  form.sortOrder = 100
  form.enabled = true
  form.description = ''
  formRef.value?.clearValidate()
}

const loadAllPermissions = async () => {
  allPermissions.value = await listPermissionOptions()
}

const loadPermissions = async () => {
  loading.value = true
  try {
    const data = await pagePermissions({
      page: requestPage.value,
      size: requestSize.value,
      keyword: filters.keyword,
      type: filters.type,
      enabled: filters.enabled
    })
    rawPermissionList.value = data.records
    pagination.total = data.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  permissionFilterPopoverVisible.value = false
  resetMobilePagination()
  await loadPermissions()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.type = ''
  filters.enabled = ''
  filters.taxonomy = ''
  resetMobilePagination()
  await loadPermissions()
}

const handleSizeChange = async () => {
  resetMobilePagination()
  await loadPermissions()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadPermissions()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadPermissions()
}

const openCreateDialog = () => {
  readonlyMode.value = false
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const fillForm = (row: PermissionItem) => {
  isEditing.value = true
  currentId.value = row.id
  currentBuiltIn.value = row.builtIn
  form.name = row.name
  form.code = row.code
  form.type = row.type
  form.path = row.path || ''
  form.component = row.component || ''
  form.icon = row.icon || ''
  form.parentId = row.parentId
  form.sortOrder = row.sortOrder
  form.enabled = row.enabled
  form.description = row.description
}

const openDetailDialog = (row: PermissionItem) => {
  readonlyMode.value = true
  fillForm(row)
  dialogVisible.value = true
}

const openEditDialog = (row: PermissionItem) => {
  readonlyMode.value = false
  fillForm(row)
  dialogVisible.value = true
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const payload = {
      name: form.name,
      code: form.code,
      type: form.type,
      path: form.path || null,
      component: form.component || null,
      icon: form.icon,
      parentId: form.parentId,
      sortOrder: form.sortOrder,
      enabled: form.enabled,
      description: form.description
    }
    if (isEditing.value && currentId.value !== null) {
      await updatePermission(currentId.value, payload)
      ElMessage.success('功能更新成功')
    } else {
      await createPermission(payload)
      ElMessage.success('功能创建成功')
    }
    dialogVisible.value = false
    await loadAllPermissions()
    await loadPermissions()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('删除功能后，关联角色将失去该权限，确认继续吗？', '提示', { type: 'warning' })
    await deletePermission(id)
    ElMessage.success('功能删除成功')
    await loadAllPermissions()
    await loadPermissions()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

onMounted(async () => {
  await loadAllPermissions()
  await loadPermissions()
})
</script>

<style scoped>
.permission-list-table {
  min-width: 1280px;
}

.permission-col-main {
  width: 21%;
}

.permission-col-code {
  width: 15%;
}

.permission-col-type {
  width: 8%;
}

.permission-col-taxonomy {
  width: 12%;
}

.permission-col-parent {
  width: 10%;
}

.permission-col-path {
  width: 13%;
}

.permission-col-sort {
  width: 6%;
}

.permission-col-status {
  width: 8%;
}

.permission-col-built {
  width: 6%;
}

.permission-col-actions {
  width: 7%;
}

.permission-taxonomy-stack,
.permission-taxonomy-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.permission-taxonomy-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.permission-taxonomy-pill.primary {
  color: #1d4ed8;
  background: #dbeafe;
}

.permission-taxonomy-pill.success {
  color: #047857;
  background: #d1fae5;
}

.permission-taxonomy-pill.warning {
  color: #b45309;
  background: #fef3c7;
}

.permission-taxonomy-pill.info {
  color: #0369a1;
  background: #e0f2fe;
}

.permission-taxonomy-pill.neutral {
  color: #475569;
  background: #e2e8f0;
}
</style>
