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
            placeholder="搜索入口名称、链接地址或图标..."
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
          <span>新增入口</span>
        </button>
      </div>

      <div v-if="canManage && !isMobileViewport" class="management-list-toolbar-side">
        <button class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增入口</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
          <table class="management-list-table shortcut-list-table mobile-card-table">
            <thead>
              <tr>
                <th class="shortcut-col-main">快捷入口</th>
                <th class="shortcut-col-url">链接地址</th>
                <th class="shortcut-col-icon">图标</th>
                <th class="shortcut-col-sort center">排序</th>
                <th class="shortcut-col-status center">状态</th>
                <th class="shortcut-col-actions right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredEntries" :key="row.id" class="management-list-row">
                <td class="shortcut-col-main" data-label="快捷入口">
                  <button class="management-list-title-trigger" type="button" @click="openEditDialog(row)">
                    <div class="management-list-title-cell">
                      <span class="management-list-title-icon shortcut-entry-icon">
                        <img v-if="isImageIcon(row.icon)" :src="resolveAssetUrl(row.icon)" :alt="`${row.name} 图标`" class="shortcut-entry-icon-image" />
                        <el-icon v-else><component :is="resolveShortcutIcon(row.icon)" /></el-icon>
                      </span>
                      <div class="management-list-title-copy">
                        <div class="management-list-title">{{ row.name }}</div>
                        <div class="management-list-subtitle">首页“常用系统访问入口”组件展示项</div>
                      </div>
                    </div>
                  </button>
                </td>
                <td class="shortcut-col-url" data-label="链接地址">
                  <span class="management-list-link">{{ row.url }}</span>
                </td>
                <td class="shortcut-col-icon" data-label="图标">
                  <div class="shortcut-entry-icon-chip">
                    <img v-if="isImageIcon(row.icon)" :src="resolveAssetUrl(row.icon)" :alt="`${row.name} 图标`" class="shortcut-entry-chip-image" />
                    <el-icon v-else><component :is="resolveShortcutIcon(row.icon)" /></el-icon>
                    <span>{{ isImageIcon(row.icon) ? '已上传图片图标' : DEFAULT_SHORTCUT_ICON }}</span>
                  </div>
                </td>
                <td class="shortcut-col-sort center" data-label="排序">
                  <span class="management-list-text">{{ row.sortOrder }}</span>
                </td>
                <td class="shortcut-col-status center" data-label="状态">
                  <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
                </td>
                <td class="shortcut-col-actions right" data-label="操作">
                  <div class="management-list-row-actions">
                    <button class="management-list-row-button" type="button" title="编辑入口" @click="openEditDialog(row)">
                      <el-icon><EditPen /></el-icon>
                    </button>
                    <button class="management-list-row-button" type="button" title="访问入口" @click="openShortcut(row.url)">
                      <el-icon><Link /></el-icon>
                    </button>
                    <button class="management-list-row-button danger" type="button" title="删除入口" @click="handleDelete(row.id)">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else>
          <div v-if="filteredEntries.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in filteredEntries" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openEditDialog(row)">
                    <span class="mobile-entity-icon">
                      <el-icon><component :is="resolveShortcutIcon(row.icon)" /></el-icon>
                    </span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.name }}</span>
                      <span class="mobile-entity-description">{{ row.url }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">图标</span>
                    <div class="mobile-entity-field-content">
                      <div class="shortcut-entry-icon-chip">
                        <img v-if="isImageIcon(row.icon)" :src="resolveAssetUrl(row.icon)" :alt="`${row.name} 图标`" class="shortcut-entry-chip-image" />
                        <el-icon v-else><component :is="resolveShortcutIcon(row.icon)" /></el-icon>
                        <span>{{ isImageIcon(row.icon) ? '已上传图片图标' : DEFAULT_SHORTCUT_ICON }}</span>
                      </div>
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
                </div>
                <footer class="mobile-entity-actions">
                  <button class="mobile-entity-action-button" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button class="mobile-entity-action-button info" type="button" @click="openShortcut(row.url)">
                    <el-icon><Link /></el-icon>
                    <span>访问</span>
                  </button>
                  <button class="mobile-entity-action-button danger" type="button" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
          <div v-if="!filteredEntries.length" class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无快捷入口" />
          </div>
        </template>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Link" />
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">入口信息</div>
            <div class="platform-form-section-subtitle">配置名称、链接地址、图标和展示顺序，首页会按启用状态与排序展示。</div>
          </div>
          <el-form-item label="名称" prop="name">
            <el-input v-model="form.name" maxlength="120" placeholder="例如：GitLab / Jenkins / 禅道" />
          </el-form-item>
          <el-form-item label="链接地址" prop="url">
            <el-input v-model="form.url" maxlength="500" placeholder="请输入完整链接，例如 https://gitlab.example.com" />
          </el-form-item>
          <el-form-item label="上传图片">
            <div class="shortcut-entry-upload-shell">
              <div class="shortcut-entry-upload-preview">
                <span class="management-list-title-icon shortcut-entry-icon preview">
                  <img v-if="isImageIcon(form.icon)" :src="resolveAssetUrl(form.icon)" alt="快捷入口图标预览" class="shortcut-entry-icon-image" />
                  <el-icon v-else><component :is="resolveShortcutIcon(form.icon)" /></el-icon>
                </span>
              </div>
              <div class="shortcut-entry-upload-actions">
                <input ref="iconInputRef" class="shortcut-entry-file-input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="handleIconFileChange" />
                <el-button :loading="iconUploading" @click="triggerIconUpload">上传图片</el-button>
                <el-button :disabled="!isImageIcon(form.icon) || iconUploading" @click="handleResetIcon">恢复默认</el-button>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="排序值" prop="sortOrder">
            <el-input-number v-model="form.sortOrder" :min="0" :max="9999" style="width: 100%" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, EditPen, Filter, Link, Plus, RefreshRight, Search } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  createDashboardShortcutEntry,
  deleteDashboardShortcutEntry,
  listDashboardShortcutEntries,
  updateDashboardShortcutEntry,
  type DashboardShortcutAdminPayload
} from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { DashboardShortcutEntryItem } from '@/types/platform'
import { uploadCommonImage } from '@/api/common'
import { resolveAssetUrl } from '@/utils/asset'
import { useMobileViewport } from '@/utils/mobileViewport'

interface ShortcutForm {
  name: string
  url: string
  icon: string
  enabled: boolean
  sortOrder: number
}

const DEFAULT_SHORTCUT_ICON = 'Link'
const ALLOWED_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif'])
const MAX_ICON_SIZE = 5 * 1024 * 1024

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:shortcut:manage'))
const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const currentId = ref<number | null>(null)
const entries = ref<DashboardShortcutEntryItem[]>([])
const formRef = ref<FormInstance>()
const iconInputRef = ref<HTMLInputElement | null>(null)
const iconUploading = ref(false)
const filterPopoverVisible = ref(false)

const filters = reactive<{ keyword: string; enabled: boolean | '' }>({
  keyword: '',
  enabled: ''
})

const form = reactive<ShortcutForm>({
  name: '',
  url: '',
  icon: DEFAULT_SHORTCUT_ICON,
  enabled: true,
  sortOrder: 0
})

const dialogTitle = computed(() => (isEditing.value ? '编辑快捷入口' : '新增快捷入口'))
const dialogSubtitle = computed(() => (isEditing.value ? '调整系统级快捷入口的名称、地址、图标与排序。' : '新增一个会展示在首页“常用系统访问入口”组件里的系统级入口。'))

const filteredEntries = computed(() =>
  entries.value.filter((item) => {
    if (filters.enabled !== '' && item.enabled !== filters.enabled) {
      return false
    }
    const keyword = filters.keyword.trim().toLowerCase()
    if (!keyword) {
      return true
    }
    return [item.name, item.url, item.icon]
      .map((value) => (value || '').toLowerCase())
      .some((value) => value.includes(keyword))
  })
)

const rules: FormRules<ShortcutForm> = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  url: [
    { required: true, message: '请输入链接地址', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        const normalized = (value || '').trim()
        if (!normalized) {
          callback(new Error('请输入链接地址'))
          return
        }
        try {
          const target = new URL(normalized)
          if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            callback(new Error('链接地址仅支持 http 或 https'))
            return
          }
          callback()
        } catch {
          callback(new Error('请输入完整且合法的链接地址'))
        }
      },
      trigger: 'blur'
    }
  ],
  sortOrder: [{ required: true, message: '请输入排序值', trigger: 'change' }]
}

function resolveShortcutIcon(iconName?: string) {
  const normalizedName = (iconName || '').trim()
  return (ElementPlusIconsVue as Record<string, unknown>)[normalizedName] || ElementPlusIconsVue.Link
}

function isImageIcon(icon?: string) {
  const normalizedIcon = (icon || '').trim().toLowerCase()
  return normalizedIcon.startsWith('http://') || normalizedIcon.startsWith('https://') || normalizedIcon.startsWith('/dashboard-shortcut-icons')
}

function triggerIconUpload() {
  iconInputRef.value?.click()
}

function resetIconInput() {
  if (iconInputRef.value) {
    iconInputRef.value.value = ''
  }
}

async function handleIconFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  if (!ALLOWED_ICON_TYPES.has(file.type)) {
    ElMessage.warning('请上传 PNG、JPG 或 GIF 图片')
    resetIconInput()
    return
  }
  if (file.size > MAX_ICON_SIZE) {
    ElMessage.warning('图标大小不能超过 5MB')
    resetIconInput()
    return
  }

  iconUploading.value = true
  try {
    const uploaded = await uploadCommonImage(file, 'dashboard-shortcuts')
    form.icon = uploaded.url
    ElMessage.success('图标上传成功')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '图标上传失败')
  } finally {
    iconUploading.value = false
    resetIconInput()
  }
}

function handleResetIcon() {
  form.icon = DEFAULT_SHORTCUT_ICON
}

function openShortcut(url: string) {
  const normalizedUrl = url.trim()
  if (!normalizedUrl) {
    return
  }
  window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
}

function resetForm() {
  currentId.value = null
  form.name = ''
  form.url = ''
  form.icon = DEFAULT_SHORTCUT_ICON
  form.enabled = true
  form.sortOrder = entries.value.length
  formRef.value?.clearValidate()
}

function fillForm(row: DashboardShortcutEntryItem) {
  currentId.value = row.id
  form.name = row.name
  form.url = row.url
  form.icon = row.icon || DEFAULT_SHORTCUT_ICON
  form.enabled = row.enabled
  form.sortOrder = row.sortOrder
  formRef.value?.clearValidate()
}

async function loadEntries() {
  loading.value = true
  try {
    entries.value = await listDashboardShortcutEntries()
  } catch (error: any) {
    entries.value = []
    ElMessage.error(error?.response?.data?.message || '加载快捷入口失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filterPopoverVisible.value = false
}

function handleReset() {
  filters.keyword = ''
  filters.enabled = ''
  filterPopoverVisible.value = false
}

function openCreateDialog() {
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

function openEditDialog(row: DashboardShortcutEntryItem) {
  isEditing.value = true
  fillForm(row)
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }

  const payload: DashboardShortcutAdminPayload = {
    name: form.name.trim(),
    url: form.url.trim(),
    icon: (form.icon || '').trim(),
    enabled: form.enabled,
    sortOrder: form.sortOrder
  }

  submitting.value = true
  try {
    if (isEditing.value && currentId.value !== null) {
      await updateDashboardShortcutEntry(currentId.value, payload)
      ElMessage.success('快捷入口更新成功')
    } else {
      await createDashboardShortcutEntry(payload)
      ElMessage.success('快捷入口创建成功')
    }
    dialogVisible.value = false
    await loadEntries()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: number) {
  try {
    await ElMessageBox.confirm('删除后首页将不再展示该系统入口，确认继续吗？', '提示', { type: 'warning' })
    await deleteDashboardShortcutEntry(id)
    ElMessage.success('快捷入口删除成功')
    await loadEntries()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

onMounted(async () => {
  await loadEntries()
})
</script>

<style scoped>
.shortcut-list-table {
  min-width: 1120px;
}

.shortcut-col-main {
  width: 26%;
}

.shortcut-col-url {
  width: 34%;
}

.shortcut-col-icon {
  width: 16%;
}

.shortcut-col-sort,
.shortcut-col-status,
.shortcut-col-actions {
  width: 8%;
}

.shortcut-entry-icon {
  color: var(--app-primary);
}

.shortcut-entry-icon.preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.shortcut-entry-icon-image,
.shortcut-entry-chip-image {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  object-fit: cover;
}

.shortcut-entry-chip-image {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}

.shortcut-entry-icon-chip,
.shortcut-entry-icon-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.shortcut-entry-icon-chip {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.08);
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 700;
}

.shortcut-entry-upload-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-entry-upload-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}

.shortcut-entry-upload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.shortcut-entry-file-input {
  display: none;
}
</style>
