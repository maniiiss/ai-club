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
            placeholder="搜索角色名称、编码或描述..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="roleFilterPopoverVisible" trigger="click" placement="bottom-start" :width="280" popper-class="management-list-popper">
          <template #reference>
            <button class="management-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="management-list-filter-panel management-list-compact-input">
            <div class="management-list-filter-field">
              <label>状态</label>
              <el-select v-model="filters.enabled" clearable placeholder="状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="禁用" :value="false" />
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
        <button v-if="canManage" class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建角色</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <table class="management-list-table role-list-table mobile-card-table">
          <thead>
            <tr>
              <th class="role-col-main">角色</th>
              <th class="role-col-code">编码</th>
              <th class="role-col-status center">状态</th>
              <th class="role-col-permissions">权限</th>
              <th class="role-col-data">数据权限</th>
              <th class="role-col-built center">内置</th>
              <th v-if="canManage" class="role-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in roleList" :key="row.id" class="management-list-row">
              <td class="role-col-main" data-label="角色">
                <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon"><el-icon><UserFilled /></el-icon></span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">{{ row.name }}</div>
                      <div class="management-list-subtitle">{{ row.description || '暂无描述' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="role-col-code" data-label="编码">
                <span class="management-list-text">{{ row.code }}</span>
              </td>
              <td class="role-col-status center" data-label="状态">
                <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
              </td>
              <td class="role-col-permissions" data-label="权限">
                <div v-if="row.permissionNames.length" class="management-list-stack">
                  <span v-for="item in row.permissionNames.slice(0, 3)" :key="item" class="management-list-chip">{{ item }}</span>
                  <span v-if="row.permissionNames.length > 3" class="management-list-chip muted">+{{ row.permissionNames.length - 3 }}</span>
                </div>
                <span v-else class="management-list-empty">-</span>
              </td>
              <td class="role-col-data" data-label="数据权限">
                <div class="management-list-stack">
                  <span class="management-list-chip">{{ buildDataScopeLabel('项目可见', row.projectVisibilityScope) }}</span>
                  <span class="management-list-chip">{{ buildDataScopeLabel('项目维护', row.projectManageScope) }}</span>
                  <span class="management-list-chip">{{ buildDataScopeLabel('迭代删除', row.iterationDeleteScope) }}</span>
                  <span class="management-list-chip">{{ buildDataScopeLabel('工作项删除', row.taskDeleteScope) }}</span>
                </div>
              </td>
              <td class="role-col-built center" data-label="内置">
                <span class="management-list-pill neutral">{{ row.builtIn ? '是' : '否' }}</span>
              </td>
              <td v-if="canManage" class="role-col-actions right" data-label="操作">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="编辑角色" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button class="management-list-row-button danger" type="button" :disabled="row.builtIn" title="删除角色" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

        <div class="management-list-footer">
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
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-width="100px" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">角色信息</div>
          <div class="platform-form-section-subtitle">配置角色编码、功能权限和启用状态。</div>
        </div>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="form.code" :disabled="currentBuiltIn" placeholder="例如：DEV_MANAGER" />
        </el-form-item>
        <el-form-item label="权限配置">
          <el-select v-model="form.permissionIds" multiple filterable collapse-tags placeholder="请选择权限" style="width: 100%">
            <el-option
              v-for="item in permissionOptions"
              :key="item.id"
              :label="`${item.name} (${item.code})`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" :disabled="currentBuiltIn" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入角色描述" />
        </el-form-item>
      </section>

      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">数据权限</div>
          <div class="platform-form-section-subtitle">按角色固定枚举配置项目数据可见和删除范围。</div>
        </div>
        <el-form-item label="项目可见" prop="projectVisibilityScope">
          <el-select v-model="form.projectVisibilityScope" placeholder="请选择项目可见范围" style="width: 100%">
            <el-option v-for="item in dataPermissionScopeOptions" :key="`project-visibility-${item.value}`" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目维护" prop="projectManageScope">
          <el-select v-model="form.projectManageScope" placeholder="请选择项目维护范围" style="width: 100%">
            <el-option v-for="item in dataPermissionScopeOptions" :key="`project-manage-${item.value}`" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="迭代删除" prop="iterationDeleteScope">
          <el-select v-model="form.iterationDeleteScope" placeholder="请选择迭代删除范围" style="width: 100%">
            <el-option v-for="item in dataPermissionScopeOptions" :key="`iteration-delete-${item.value}`" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="工作项删除" prop="taskDeleteScope">
          <el-select v-model="form.taskDeleteScope" placeholder="请选择工作项删除范围" style="width: 100%">
            <el-option v-for="item in dataPermissionScopeOptions" :key="`task-delete-${item.value}`" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
      <el-button v-if="!readonlyMode" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, UserFilled } from '@element-plus/icons-vue'
import { createRole, deleteRole, listPermissionOptions, pageRoles, updateRole } from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { DataPermissionScopeValue, PermissionItem, RoleItem } from '@/types/platform'

interface RoleForm {
  name: string
  code: string
  enabled: boolean
  description: string
  projectVisibilityScope: DataPermissionScopeValue
  projectManageScope: DataPermissionScopeValue
  iterationDeleteScope: DataPermissionScopeValue
  taskDeleteScope: DataPermissionScopeValue
  permissionIds: number[]
}

interface DataPermissionScopeOption {
  value: DataPermissionScopeValue
  label: string
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:role:manage'))
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const readonlyMode = ref(false)
const currentId = ref<number | null>(null)
const currentBuiltIn = ref(false)
const roleList = ref<RoleItem[]>([])
const permissionOptions = ref<PermissionItem[]>([])
const formRef = ref<FormInstance>()

const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const filters = reactive<{ keyword: string; enabled: boolean | '' }>({ keyword: '', enabled: '' })
const roleFilterPopoverVisible = ref(false)
const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return '查看角色'
  }
  return isEditing.value ? '编辑角色' : '新建角色'
})
const dataPermissionScopeOptions: DataPermissionScopeOption[] = [
  { value: 'NONE', label: '无权限' },
  { value: 'OWNER_ONLY', label: '仅负责人' },
  { value: 'CREATOR_ONLY', label: '仅创建人' },
  { value: 'OWNER_OR_CREATOR', label: '负责人或创建人' },
  { value: 'PROJECT_PARTICIPANT', label: '项目参与人' },
  { value: 'ALL', label: '所有人' }
]

const dataPermissionScopeLabelMap: Record<DataPermissionScopeValue, string> = {
  NONE: '无权限',
  OWNER_ONLY: '仅负责人',
  CREATOR_ONLY: '仅创建人',
  OWNER_OR_CREATOR: '负责人或创建人',
  PROJECT_PARTICIPANT: '项目参与人',
  ALL: '所有人'
}

const form = reactive<RoleForm>({
  name: '',
  code: '',
  enabled: true,
  description: '',
  projectVisibilityScope: 'PROJECT_PARTICIPANT',
  projectManageScope: 'OWNER_OR_CREATOR',
  iterationDeleteScope: 'CREATOR_ONLY',
  taskDeleteScope: 'CREATOR_ONLY',
  permissionIds: []
})

const rules: FormRules<RoleForm> = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  projectVisibilityScope: [{ required: true, message: '请选择项目可见范围', trigger: 'change' }],
  projectManageScope: [{ required: true, message: '请选择项目维护范围', trigger: 'change' }],
  iterationDeleteScope: [{ required: true, message: '请选择迭代删除范围', trigger: 'change' }],
  taskDeleteScope: [{ required: true, message: '请选择工作项删除范围', trigger: 'change' }]
}

const resetForm = () => {
  currentId.value = null
  currentBuiltIn.value = false
  form.name = ''
  form.code = ''
  form.enabled = true
  form.description = ''
  form.projectVisibilityScope = 'PROJECT_PARTICIPANT'
  form.projectManageScope = 'OWNER_OR_CREATOR'
  form.iterationDeleteScope = 'CREATOR_ONLY'
  form.taskDeleteScope = 'CREATOR_ONLY'
  form.permissionIds = []
  formRef.value?.clearValidate()
}

/**
 * 统一构建角色列表中的数据权限摘要，减少表格横向空间占用。
 */
const buildDataScopeLabel = (label: string, scope: DataPermissionScopeValue) =>
  `${label}：${dataPermissionScopeLabelMap[scope]}`

const loadPermissionOptions = async () => {
  permissionOptions.value = await listPermissionOptions()
}

const loadRoles = async () => {
  loading.value = true
  try {
    const data = await pageRoles({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      enabled: filters.enabled
    })
    roleList.value = data.records
    pagination.total = data.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  roleFilterPopoverVisible.value = false
  pagination.page = 1
  await loadRoles()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.enabled = ''
  pagination.page = 1
  await loadRoles()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadRoles()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadRoles()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadRoles()
}

const openCreateDialog = () => {
  readonlyMode.value = false
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const fillForm = (row: RoleItem) => {
  isEditing.value = true
  currentId.value = row.id
  currentBuiltIn.value = row.builtIn
  form.name = row.name
  form.code = row.code
  form.enabled = row.enabled
  form.description = row.description
  form.projectVisibilityScope = row.projectVisibilityScope
  form.projectManageScope = row.projectManageScope
  form.iterationDeleteScope = row.iterationDeleteScope
  form.taskDeleteScope = row.taskDeleteScope
  form.permissionIds = [...row.permissionIds]
}

const openDetailDialog = (row: RoleItem) => {
  readonlyMode.value = true
  fillForm(row)
  dialogVisible.value = true
}

const openEditDialog = (row: RoleItem) => {
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
      enabled: form.enabled,
      description: form.description,
      projectVisibilityScope: form.projectVisibilityScope,
      projectManageScope: form.projectManageScope,
      iterationDeleteScope: form.iterationDeleteScope,
      taskDeleteScope: form.taskDeleteScope,
      permissionIds: form.permissionIds
    }
    if (isEditing.value && currentId.value !== null) {
      await updateRole(currentId.value, payload)
      ElMessage.success('角色更新成功')
    } else {
      await createRole(payload)
      ElMessage.success('角色创建成功')
    }
    dialogVisible.value = false
    await loadRoles()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('删除角色后，关联用户将失去该角色权限，确认继续吗？', '提示', { type: 'warning' })
    await deleteRole(id)
    ElMessage.success('角色删除成功')
    await loadRoles()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

onMounted(async () => {
  await loadPermissionOptions()
  await loadRoles()
})
</script>

<style scoped>
.role-list-table {
  min-width: 1080px;
}

.role-col-main {
  width: 24%;
}

.role-col-code {
  width: 15%;
}

.role-col-status {
  width: 8%;
}

.role-col-permissions {
  width: 18%;
}

.role-col-data {
  width: 22%;
}

.role-col-built {
  width: 6%;
}

.role-col-actions {
  width: 7%;
}
</style>
