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
        <button v-if="canManage && isMobileViewport" class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建角色</span>
        </button>
      </div>

      <div v-if="canManage && !isMobileViewport" class="management-list-toolbar-side">
        <button class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建角色</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
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
        </template>
        <template v-else>
          <div v-if="roleList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in roleList" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon"><el-icon><UserFilled /></el-icon></span>
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
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">权限</span>
                    <div class="mobile-entity-field-content">
                      <div v-if="row.permissionNames.length" class="management-list-stack">
                        <span v-for="item in row.permissionNames.slice(0, 3)" :key="item" class="management-list-chip">{{ item }}</span>
                        <span v-if="row.permissionNames.length > 3" class="management-list-chip muted">+{{ row.permissionNames.length - 3 }}</span>
                      </div>
                      <span v-else class="mobile-entity-empty-text">-</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">数据</span>
                    <div class="mobile-entity-field-content">
                      <div class="management-list-stack">
                        <span class="management-list-chip">{{ buildDataScopeLabel('项目可见', row.projectVisibilityScope) }}</span>
                        <span class="management-list-chip">{{ buildDataScopeLabel('项目维护', row.projectManageScope) }}</span>
                        <span class="management-list-chip">{{ buildDataScopeLabel('迭代删除', row.iterationDeleteScope) }}</span>
                        <span class="management-list-chip">{{ buildDataScopeLabel('工作项删除', row.taskDeleteScope) }}</span>
                      </div>
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
          <div v-if="!roleList.length" class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无角色" />
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

  <el-dialog v-if="!isMobileViewport" v-model="dialogVisible" :title="dialogTitle" width="760px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="UserFilled" />
    </template>
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
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
          <div class="permission-group-selector">
            <section
              v-for="group in permissionGroups"
              :key="group.key"
              class="permission-group"
            >
              <header class="permission-group-head">
                <el-checkbox
                  :model-value="isPermissionGroupChecked(group.items)"
                  :indeterminate="isPermissionGroupIndeterminate(group.items)"
                  @change="togglePermissionGroup(group.items, $event)"
                >
                  {{ group.label }}
                </el-checkbox>
                <div class="permission-group-meta">
                  <span class="permission-taxonomy-pill" :class="group.tone">{{ group.usageLabel }}</span>
                  <span class="permission-count">{{ group.items.length }} 项</span>
                </div>
              </header>
              <div class="permission-option-list">
                <label
                  v-for="item in group.items"
                  :key="item.id"
                  class="permission-option"
                >
                  <el-checkbox
                    :model-value="selectedPermissionIdSet.has(item.id)"
                    @change="togglePermission(item.id, $event)"
                  />
                  <span class="permission-option-copy">
                    <span class="permission-option-title">
                      <span>{{ item.name }}</span>
                      <span class="permission-type-pill" :class="item.type === 'MENU' ? 'info' : 'warning'">{{ item.type === 'MENU' ? '菜单' : '动作' }}</span>
                    </span>
                    <span class="permission-option-code">{{ item.code }}</span>
                    <span v-if="item.description" class="permission-option-description">{{ item.description }}</span>
                  </span>
                </label>
              </div>
            </section>
          </div>
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
          <div class="platform-form-section-subtitle">
            按角色固定枚举配置项目数据可见和删除范围；项目绑定的新功能统一跟随“项目可见”，其中“项目成员”包含负责人、创建人和项目成员。
          </div>
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
      <div class="platform-dialog-footer">
        <el-button @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!readonlyMode" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端角色编辑抽屉。 -->
  <MobileFormDrawer
    v-else
    v-model="dialogVisible"
    :title="dialogTitle"
    :subtitle="dialogSubtitle"
    :submit-text="'保存'"
    :submitting="submitting"
    :header-icon="UserFilled"
    :close-on-click-modal="true"
    size="88%"
    @submit="handleSubmit"
    @cancel="dialogVisible = false"
  >
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
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
          <div class="permission-group-selector">
            <section
              v-for="group in permissionGroups"
              :key="group.key"
              class="permission-group"
            >
              <header class="permission-group-head">
                <el-checkbox
                  :model-value="isPermissionGroupChecked(group.items)"
                  :indeterminate="isPermissionGroupIndeterminate(group.items)"
                  @change="togglePermissionGroup(group.items, $event)"
                >
                  {{ group.label }}
                </el-checkbox>
                <div class="permission-group-meta">
                  <span class="permission-taxonomy-pill" :class="group.tone">{{ group.usageLabel }}</span>
                  <span class="permission-count">{{ group.items.length }} 项</span>
                </div>
              </header>
              <div class="permission-option-list">
                <label
                  v-for="item in group.items"
                  :key="item.id"
                  class="permission-option"
                >
                  <el-checkbox
                    :model-value="selectedPermissionIdSet.has(item.id)"
                    @change="togglePermission(item.id, $event)"
                  />
                  <span class="permission-option-copy">
                    <span class="permission-option-title">
                      <span>{{ item.name }}</span>
                      <span class="permission-type-pill" :class="item.type === 'MENU' ? 'info' : 'warning'">{{ item.type === 'MENU' ? '菜单' : '动作' }}</span>
                    </span>
                    <span class="permission-option-code">{{ item.code }}</span>
                    <span v-if="item.description" class="permission-option-description">{{ item.description }}</span>
                  </span>
                </label>
              </div>
            </section>
          </div>
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
          <div class="platform-form-section-subtitle">
            按角色固定枚举配置项目数据可见和删除范围；项目绑定的新功能统一跟随“项目可见”，其中“项目成员”包含负责人、创建人和项目成员。
          </div>
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
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, UserFilled } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import MobileFormDrawer from '@/components/MobileFormDrawer.vue'
import { createRole, deleteRole, listPermissionOptions, pageRoles, updateRole } from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { DataPermissionScopeValue, PermissionItem, RoleItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'
import { groupPermissionsByTaxonomy } from '@/utils/permissionTaxonomy'

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
const { isMobileViewport } = useMobileViewport()
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
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading,
  itemCount: computed(() => roleList.value.length),
  pagination,
  loadPage: async () => loadRoles()
})
const filters = reactive<{ keyword: string; enabled: boolean | '' }>({ keyword: '', enabled: '' })
const roleFilterPopoverVisible = ref(false)
const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return '查看角色'
  }
  return isEditing.value ? '编辑角色' : '新建角色'
})
const dialogSubtitle = computed(() => {
  if (readonlyMode.value) {
    return '查看角色权限配置与数据权限范围。'
  }
  if (isEditing.value) {
    return '调整角色编码、权限集合和数据权限范围。'
  }
  return '填写角色基础信息，并配置功能权限和数据权限。'
})
const dataPermissionScopeOptions: DataPermissionScopeOption[] = [
  { value: 'NONE', label: '无权限' },
  { value: 'OWNER_ONLY', label: '仅负责人' },
  { value: 'CREATOR_ONLY', label: '仅创建人' },
  { value: 'OWNER_OR_CREATOR', label: '负责人或创建人' },
  { value: 'PROJECT_PARTICIPANT', label: '项目成员（含负责人/创建人）' },
  { value: 'ALL', label: '所有人' }
]

const dataPermissionScopeLabelMap: Record<DataPermissionScopeValue, string> = {
  NONE: '无权限',
  OWNER_ONLY: '仅负责人',
  CREATOR_ONLY: '仅创建人',
  OWNER_OR_CREATOR: '负责人或创建人',
  PROJECT_PARTICIPANT: '项目成员（含负责人/创建人）',
  ALL: '所有人'
}

const permissionGroups = computed(() => groupPermissionsByTaxonomy(permissionOptions.value))

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

const selectedPermissionIdSet = computed(() => new Set(form.permissionIds))

const sortSelectedPermissionIds = (selectedIds: Set<number>) =>
  permissionOptions.value
    .filter((item) => selectedIds.has(item.id))
    .map((item) => item.id)

const isPermissionGroupChecked = (items: PermissionItem[]) =>
  items.length > 0 && items.every((item) => selectedPermissionIdSet.value.has(item.id))

const isPermissionGroupIndeterminate = (items: PermissionItem[]) =>
  items.some((item) => selectedPermissionIdSet.value.has(item.id)) && !isPermissionGroupChecked(items)

/**
 * 权限勾选器只改写角色表单的 permissionIds，目录和用途提示来自前端 taxonomy，不影响后端权限码。
 */
const isChecked = (value: unknown) => value === true

const togglePermissionGroup = (items: PermissionItem[], checked: unknown) => {
  const nextSelectedIds = new Set(form.permissionIds)
  items.forEach((item) => {
    if (isChecked(checked)) {
      nextSelectedIds.add(item.id)
    } else {
      nextSelectedIds.delete(item.id)
    }
  })
  form.permissionIds = sortSelectedPermissionIds(nextSelectedIds)
}

const togglePermission = (permissionId: number, checked: unknown) => {
  const nextSelectedIds = new Set(form.permissionIds)
  if (isChecked(checked)) {
    nextSelectedIds.add(permissionId)
  } else {
    nextSelectedIds.delete(permissionId)
  }
  form.permissionIds = sortSelectedPermissionIds(nextSelectedIds)
}

const loadPermissionOptions = async () => {
  permissionOptions.value = await listPermissionOptions()
}

const loadRoles = async () => {
  loading.value = true
  try {
    const data = await pageRoles({
      page: requestPage.value,
      size: requestSize.value,
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
  resetMobilePagination()
  await loadRoles()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.enabled = ''
  resetMobilePagination()
  await loadRoles()
}

const handleSizeChange = async () => {
  resetMobilePagination()
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

.permission-group-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-height: min(52vh, 520px);
  overflow-y: auto;
  padding-right: 4px;
}

.permission-group {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.permission-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.permission-group-meta,
.permission-option-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.permission-taxonomy-pill,
.permission-type-pill,
.permission-count {
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

.permission-taxonomy-pill.neutral,
.permission-count {
  color: #475569;
  background: #e2e8f0;
}

.permission-type-pill.info {
  color: #0369a1;
  background: #e0f2fe;
}

.permission-type-pill.warning {
  color: #b45309;
  background: #fef3c7;
}

.permission-option-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: rgba(15, 23, 42, 0.06);
}

.permission-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  background: #ffffff;
}

.permission-option-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.permission-option-code,
.permission-option-description {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .permission-group-selector {
    max-height: none;
    padding-right: 0;
  }

  .permission-group-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .permission-option-list {
    grid-template-columns: 1fr;
  }
}
</style>
