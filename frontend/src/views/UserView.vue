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
            placeholder="搜索用户名、昵称、邮箱、手机号或 GitLab 用户名..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="userFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
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
            <div class="management-list-filter-field">
              <label>角色</label>
              <el-select v-model="filters.roleId" clearable placeholder="角色" style="width: 100%" :teleported="false">
                <el-option v-for="item in roleOptions" :key="item.id" :label="item.name" :value="item.id" />
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
          <span>新建用户</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
        <table class="management-list-table user-list-table mobile-card-table">
          <thead>
            <tr>
              <th class="user-col-main">用户</th>
              <th class="user-col-gitlab">GitLab</th>
              <th class="user-col-role">角色</th>
              <th class="user-col-email">邮箱</th>
              <th class="user-col-phone">手机号</th>
              <th class="user-col-status center">状态</th>
              <th class="user-col-login">最近登录</th>
              <th class="user-col-built center">内置</th>
              <th v-if="canManage" class="user-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in userList" :key="row.id" class="management-list-row">
              <td class="user-col-main" data-label="用户">
                <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-avatar">{{ userInitial(row.nickname || row.username) }}</span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">{{ row.nickname || row.username }}</div>
                      <div class="management-list-subtitle">{{ row.username }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="user-col-gitlab" data-label="GitLab">
                <span class="management-list-empty">{{ row.gitlabUsername || '-' }}</span>
              </td>
              <td class="user-col-role" data-label="角色">
                <div v-if="row.roleNames.length" class="management-list-stack">
                  <span v-for="role in row.roleNames.slice(0, 3)" :key="role" class="management-list-chip">{{ role }}</span>
                  <span v-if="row.roleNames.length > 3" class="management-list-chip muted">+{{ row.roleNames.length - 3 }}</span>
                </div>
                <span v-else class="management-list-empty">-</span>
              </td>
              <td class="user-col-email" data-label="邮箱">
                <span class="management-list-empty">{{ row.email || '-' }}</span>
              </td>
              <td class="user-col-phone" data-label="手机号">
                <span class="management-list-empty">{{ row.phone || '-' }}</span>
              </td>
              <td class="user-col-status center" data-label="状态">
                <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
              </td>
              <td class="user-col-login" data-label="最近登录">
                <span class="management-list-updated">{{ row.lastLoginAt || '-' }}</span>
              </td>
              <td class="user-col-built center" data-label="内置">
                <span class="management-list-pill neutral">{{ row.builtIn ? '是' : '否' }}</span>
              </td>
              <td v-if="canManage" class="user-col-actions right" data-label="操作">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="编辑用户" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button class="management-list-row-button" type="button" title="重置密码" @click="handleResetPassword(row)">
                    <el-icon><Key /></el-icon>
                  </button>
                  <button class="management-list-row-button danger" type="button" :disabled="row.builtIn" title="删除用户" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </template>
        <template v-else>
          <div v-if="userList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in userList" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon">
                      {{ userInitial(row.nickname || row.username) }}
                    </span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.nickname || row.username }}</span>
                      <span class="mobile-entity-description">{{ row.username }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">GitLab</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.gitlabUsername || '-' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">角色</span>
                    <div class="mobile-entity-field-content">
                      <div v-if="row.roleNames.length" class="management-list-stack">
                        <span v-for="role in row.roleNames.slice(0, 2)" :key="role" class="management-list-chip">{{ role }}</span>
                        <span v-if="row.roleNames.length > 2" class="management-list-chip muted">+{{ row.roleNames.length - 2 }}</span>
                      </div>
                      <span v-else class="mobile-entity-empty-text">-</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">邮箱</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.email || '-' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">手机</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.phone || '-' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">登录</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.lastLoginAt || '-' }}</span>
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
                  <button class="mobile-entity-action-button info" type="button" @click="handleResetPassword(row)">
                    <el-icon><Key /></el-icon>
                    <span>重置密码</span>
                  </button>
                  <button class="mobile-entity-action-button danger" type="button" :disabled="row.builtIn" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
          <div v-else class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无用户" />
          </div>
        </template>
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

  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="UserFilled" />
    </template>
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">用户信息</div>
          <div class="platform-form-section-subtitle">配置账号资料、角色和启用状态。</div>
        </div>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="isEditing && currentBuiltIn" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="请输入昵称" />
        </el-form-item>
        <el-form-item label="GitLab 用户名">
          <el-input v-model="form.gitlabUsername" placeholder="用于关联个人 GitLab MR，例如：zhangsan" />
        </el-form-item>
        <el-form-item v-if="!isEditing" label="初始密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple filterable collapse-tags placeholder="请选择角色" style="width: 100%">
            <el-option v-for="item in roleOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" :disabled="currentBuiltIn" />
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
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Key, Plus, RefreshRight, Search, UserFilled } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import { createUser, deleteUser, listRoleOptions, pageUsers, resetUserPassword, updateUser } from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { RoleItem, UserItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

interface UserForm {
  username: string
  nickname: string
  email: string
  phone: string
  gitlabUsername: string
  enabled: boolean
  roleIds: number[]
  password: string
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:user:manage'))
const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const readonlyMode = ref(false)
const currentId = ref<number | null>(null)
const currentBuiltIn = ref(false)
const userList = ref<UserItem[]>([])
const roleOptions = ref<RoleItem[]>([])
const formRef = ref<FormInstance>()

const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const filters = reactive<{ keyword: string; enabled: boolean | ''; roleId?: number }>({ keyword: '', enabled: '', roleId: undefined })
const userFilterPopoverVisible = ref(false)
const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return '查看用户'
  }
  return isEditing.value ? '编辑用户' : '新建用户'
})
const dialogSubtitle = computed(() => {
  if (readonlyMode.value) {
    return '查看账号资料、角色和启用状态。'
  }
  if (isEditing.value) {
    return '调整账号资料、角色范围与启用状态。'
  }
  return '填写账号基础信息，并分配角色与启用状态。'
})
const form = reactive<UserForm>({
  username: '',
  nickname: '',
  email: '',
  phone: '',
  gitlabUsername: '',
  enabled: true,
  roleIds: [],
  password: ''
})

const rules = computed<FormRules<UserForm>>(() => ({
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  password: isEditing.value
    ? []
    : [
        { required: true, message: '请输入初始密码', trigger: 'blur' },
        { min: 6, message: '密码长度至少 6 位', trigger: 'blur' }
      ]
}))

const resetForm = () => {
  currentId.value = null
  currentBuiltIn.value = false
  form.username = ''
  form.nickname = ''
  form.email = ''
  form.phone = ''
  form.gitlabUsername = ''
  form.enabled = true
  form.roleIds = []
  form.password = ''
  formRef.value?.clearValidate()
}

const loadRoleOptions = async () => {
  roleOptions.value = await listRoleOptions()
}

const loadUsers = async () => {
  loading.value = true
  try {
    const data = await pageUsers({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      enabled: filters.enabled,
      roleId: filters.roleId
    })
    userList.value = data.records
    pagination.total = data.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  userFilterPopoverVisible.value = false
  pagination.page = 1
  await loadUsers()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.enabled = ''
  filters.roleId = undefined
  pagination.page = 1
  await loadUsers()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadUsers()
}

const userInitial = (value?: string | null) => (value || 'UN').slice(0, 2).toUpperCase()

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadUsers()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadUsers()
}

const openCreateDialog = () => {
  readonlyMode.value = false
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const fillForm = (row: UserItem) => {
  isEditing.value = true
  currentId.value = row.id
  currentBuiltIn.value = row.builtIn
  form.username = row.username
  form.nickname = row.nickname
  form.email = row.email
  form.phone = row.phone
  form.gitlabUsername = row.gitlabUsername || ''
  form.enabled = row.enabled
  form.roleIds = [...row.roleIds]
  form.password = ''
}

const openDetailDialog = (row: UserItem) => {
  readonlyMode.value = true
  fillForm(row)
  dialogVisible.value = true
}

const openEditDialog = (row: UserItem) => {
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
      username: form.username,
      nickname: form.nickname,
      email: form.email,
      phone: form.phone,
      gitlabUsername: form.gitlabUsername,
      enabled: form.enabled,
      roleIds: form.roleIds,
      password: isEditing.value ? undefined : form.password
    }
    if (isEditing.value && currentId.value !== null) {
      await updateUser(currentId.value, payload)
      ElMessage.success('用户更新成功')
    } else {
      await createUser(payload)
      ElMessage.success('用户创建成功')
    }
    dialogVisible.value = false
    await loadUsers()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const handleResetPassword = async (row: UserItem) => {
  try {
    const { value } = await ElMessageBox.prompt(`请输入用户 ${row.username} 的新密码`, '重置密码', {
      inputType: 'password',
      inputPlaceholder: '至少 6 位',
      inputValidator: (value) => (value.length >= 6 ? true : '密码长度至少 6 位')
    })
    await resetUserPassword(row.id, value)
    ElMessage.success('密码重置成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '密码重置失败')
    }
  }
}

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认继续吗？', '提示', { type: 'warning' })
    await deleteUser(id)
    ElMessage.success('用户删除成功')
    await loadUsers()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

onMounted(async () => {
  await loadRoleOptions()
  await loadUsers()
})
</script>

<style scoped>
.user-list-table {
  min-width: 1240px;
}

.user-col-main {
  width: 18%;
}

.user-col-gitlab {
  width: 12%;
}

.user-col-role {
  width: 18%;
}

.user-col-email {
  width: 16%;
}

.user-col-phone {
  width: 10%;
}

.user-col-status {
  width: 9%;
}

.user-col-login {
  width: 11%;
}

.user-col-built {
  width: 8%;
}

.user-col-actions {
  width: 10%;
}
</style>
