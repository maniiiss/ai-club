<template>
  <div class="dashboard-shortcut-widget">
    <section v-if="systemEntries.length" class="dashboard-shortcut-section">
      <div class="dashboard-shortcut-section-head">
        <h3>系统推荐</h3>
        <span>{{ systemEntries.length }} 个入口</span>
      </div>
      <div class="dashboard-shortcut-grid">
        <button
          v-for="entry in systemEntries"
          :key="`system-${entry.id}`"
          class="dashboard-shortcut-launcher"
          type="button"
          @click="openShortcut(entry.url)"
        >
          <span class="dashboard-shortcut-icon-shell" :class="tileToneClass(entry.id)">
            <span class="dashboard-shortcut-icon">
              <img v-if="isImageIcon(entry.icon)" :src="resolveAssetUrl(entry.icon)" :alt="`${entry.name} 图标`" class="dashboard-shortcut-icon-image" />
              <el-icon v-else><component :is="resolveShortcutIcon(entry.icon)" /></el-icon>
            </span>
          </span>
          <span class="dashboard-shortcut-title">{{ entry.name }}</span>
        </button>
      </div>
    </section>

    <section class="dashboard-shortcut-section mine">
      <div class="dashboard-shortcut-section-head">
        <h3>我的常用</h3>
        <span>{{ loading ? '加载中...' : `${userEntries.length} 个入口` }}</span>
      </div>

      <div v-if="loading" class="dashboard-shortcut-empty">正在加载个人快捷入口...</div>
      <div v-else-if="userEntries.length" class="dashboard-shortcut-grid">
        <article v-for="entry in userEntries" :key="`user-${entry.id}`" class="dashboard-shortcut-launcher-wrapper">
          <button class="dashboard-shortcut-launcher mine" type="button" @click="openShortcut(entry.url)">
            <span class="dashboard-shortcut-icon-shell" :class="tileToneClass(entry.id)">
              <span class="dashboard-shortcut-icon">
                <img v-if="isImageIcon(entry.icon)" :src="resolveAssetUrl(entry.icon)" :alt="`${entry.name} 图标`" class="dashboard-shortcut-icon-image" />
                <el-icon v-else><component :is="resolveShortcutIcon(entry.icon)" /></el-icon>
              </span>
            </span>
            <span class="dashboard-shortcut-title">{{ entry.name }}</span>
          </button>
          <div class="dashboard-shortcut-launcher-actions">
            <button class="dashboard-shortcut-action-dot" type="button" aria-label="编辑快捷入口" @click="openEditDialog(entry)">✎</button>
          </div>
        </article>
      </div>
      <div v-else class="dashboard-shortcut-empty">
        <p>你还没有个人快捷入口。</p>
        <span>点击右上角 + 可以新增自己的常用跳转。</span>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Link" />
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">入口信息</div>
            <div class="platform-form-section-subtitle">填写名称和链接地址后即可保存。</div>
          </div>
          <el-form-item label="名称" prop="name">
            <el-input v-model="form.name" maxlength="120" placeholder="例如：GitLab" />
          </el-form-item>
          <el-form-item label="链接地址" prop="url">
            <el-input v-model="form.url" maxlength="500" placeholder="请输入完整链接，例如 https://gitlab.example.com" />
          </el-form-item>
          <el-form-item label="上传图片">
            <div class="dashboard-shortcut-upload-shell">
              <div class="dashboard-shortcut-upload-preview">
                <span class="dashboard-shortcut-icon preview">
                  <img v-if="isImageIcon(form.icon)" :src="resolveAssetUrl(form.icon)" alt="快捷入口图标预览" class="dashboard-shortcut-icon-image" />
                  <el-icon v-else><component :is="resolveShortcutIcon(form.icon)" /></el-icon>
                </span>
              </div>
              <div class="dashboard-shortcut-upload-actions">
                <input ref="iconInputRef" class="dashboard-shortcut-file-input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="handleIconFileChange" />
                <el-button :loading="iconUploading" @click="triggerIconUpload">上传图片</el-button>
                <el-button :disabled="!isImageIcon(form.icon) || iconUploading" @click="handleResetIcon">恢复默认</el-button>
              </div>
            </div>
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer dashboard-shortcut-dialog-footer">
          <el-button v-if="isEditing && form.id !== null" type="danger" plain :disabled="submitting" @click="handleDeleteInDialog">删除</el-button>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Link } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import type { DashboardShortcutEntryItem, DashboardShortcutOverviewItem } from '@/types/platform'
import { listDashboardShortcutEntries, saveDashboardShortcutEntries, type DashboardShortcutPayloadItem } from '@/api/platform'
import { uploadCommonImage } from '@/api/common'
import { resolveAssetUrl } from '@/utils/asset'

interface ShortcutForm {
  id: number | null
  name: string
  url: string
  icon: string
}

const props = defineProps<{
  overview: DashboardShortcutOverviewItem
}>()

const DEFAULT_SHORTCUT_ICON = 'Link'
const ALLOWED_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif'])
const MAX_ICON_SIZE = 5 * 1024 * 1024
const MAX_SHORTCUT_COUNT = 20

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const userEntries = ref<DashboardShortcutEntryItem[]>([])
const formRef = ref<FormInstance>()
const iconInputRef = ref<HTMLInputElement | null>(null)
const iconUploading = ref(false)

const form = ref<ShortcutForm>({
  id: null,
  name: '',
  url: '',
  icon: DEFAULT_SHORTCUT_ICON
})

const systemEntries = computed(() => props.overview.systemEntries || [])
const dialogTitle = computed(() => (isEditing.value ? '编辑快捷入口' : '新增快捷入口'))
const dialogSubtitle = computed(() => (isEditing.value ? '修改你自己的常用系统跳转。' : '新增一个首页常用跳转入口。'))

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
  ]
}

function resolveShortcutIcon(iconName?: string) {
  const normalizedName = (iconName || '').trim()
  return (ElementPlusIconsVue as Record<string, unknown>)[normalizedName] || ElementPlusIconsVue.Link
}

function isImageIcon(icon?: string) {
  const normalizedIcon = (icon || '').trim().toLowerCase()
  return normalizedIcon.startsWith('http://') || normalizedIcon.startsWith('https://') || normalizedIcon.startsWith('/dashboard-shortcut-icons')
}

function simplifyUrl(url: string) {
  try {
    const target = new URL(url)
    return `${target.host}${target.pathname === '/' ? '' : target.pathname}`
  } catch {
    return url
  }
}

function tileToneClass(entryId: number) {
  const toneIndex = Math.abs(entryId || 0) % 6
  return `tone-${toneIndex}`
}

function openShortcut(url: string) {
  const normalizedUrl = url.trim()
  if (!normalizedUrl) {
    return
  }
  window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
}

async function loadUserEntries() {
  loading.value = true
  try {
    userEntries.value = await listDashboardShortcutEntries()
  } catch (error: any) {
    userEntries.value = []
    ElMessage.error(error?.response?.data?.message || '加载快捷入口失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = {
    id: null,
    name: '',
    url: '',
    icon: DEFAULT_SHORTCUT_ICON
  }
  formRef.value?.clearValidate()
  resetIconInput()
}

function fillForm(entry: DashboardShortcutEntryItem) {
  form.value = {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    icon: entry.icon || DEFAULT_SHORTCUT_ICON
  }
  formRef.value?.clearValidate()
  resetIconInput()
}

function addEntry() {
  if (userEntries.value.length >= MAX_SHORTCUT_COUNT) {
    ElMessage.warning(`快捷入口最多保留 ${MAX_SHORTCUT_COUNT} 条`)
    return
  }
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

function openEditDialog(entry: DashboardShortcutEntryItem) {
  isEditing.value = true
  fillForm(entry)
  dialogVisible.value = true
}

async function persistEntries(nextEntries: DashboardShortcutPayloadItem[]) {
  const savedItems = await saveDashboardShortcutEntries(nextEntries)
  userEntries.value = savedItems
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }

  const normalizedPayload: DashboardShortcutPayloadItem = {
    id: form.value.id,
    name: form.value.name.trim(),
    url: form.value.url.trim(),
    icon: (form.value.icon || '').trim(),
    enabled: true
  }

  const nextEntries = isEditing.value
    ? userEntries.value.map((entry) => (entry.id === normalizedPayload.id ? normalizedPayload : {
        id: entry.id,
        name: entry.name,
        url: entry.url,
        icon: entry.icon,
        enabled: entry.enabled
      }))
    : [
        ...userEntries.value.map((entry) => ({
          id: entry.id,
          name: entry.name,
          url: entry.url,
          icon: entry.icon,
          enabled: entry.enabled
        })),
        normalizedPayload
      ]

  submitting.value = true
  try {
    await persistEntries(nextEntries)
    dialogVisible.value = false
    ElMessage.success(isEditing.value ? '快捷入口已更新' : '快捷入口已新增')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存快捷入口失败')
  } finally {
    submitting.value = false
  }
}

async function handleDeleteEntry(id: number) {
  try {
    await ElMessageBox.confirm('删除后首页将不再展示该入口，确认继续吗？', '提示', { type: 'warning' })
    await persistEntries(
      userEntries.value
        .filter((entry) => entry.id !== id)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          url: entry.url,
          icon: entry.icon,
          enabled: entry.enabled
        }))
    )
    ElMessage.success('快捷入口已删除')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除快捷入口失败')
    }
  }
}

async function handleDeleteInDialog() {
  if (form.value.id == null) {
    return
  }
  const currentId = form.value.id
  await handleDeleteEntry(currentId)
  dialogVisible.value = false
}

function triggerIconUpload() {
  iconInputRef.value?.click()
}

function resetIconInput() {
  if (iconInputRef.value) {
    iconInputRef.value.value = ''
  }
}

function handleResetIcon() {
  form.value.icon = DEFAULT_SHORTCUT_ICON
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
    form.value.icon = uploaded.url
    ElMessage.success('图标上传成功')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '图标上传失败')
  } finally {
    iconUploading.value = false
    resetIconInput()
  }
}

defineExpose({
  addEntry,
  refresh: loadUserEntries
})

onBeforeUnmount(() => {
  resetIconInput()
})

void loadUserEntries()
</script>

<style scoped>
.dashboard-shortcut-widget {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 16px;
}

.dashboard-shortcut-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-shortcut-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dashboard-shortcut-section-head h3 {
  margin: 0;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 800;
}

.dashboard-shortcut-section-head span {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.dashboard-shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 16px 12px;
}

.dashboard-shortcut-launcher,
.dashboard-shortcut-action-dot {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
}

.dashboard-shortcut-launcher-wrapper {
  position: relative;
  min-width: 0;
}

.dashboard-shortcut-launcher {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: transparent;
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.dashboard-shortcut-launcher:hover {
  transform: translateY(-2px);
}

.dashboard-shortcut-launcher-actions {
  position: absolute;
  top: -6px;
  right: 0;
  display: flex;
  gap: 6px;
}

.dashboard-shortcut-action-dot {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(var(--app-outline-rgb), 0.12);
  color: var(--app-text-soft);
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
}

.dashboard-shortcut-dialog-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dashboard-shortcut-icon-shell {
  width: 54px;
  height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}

.dashboard-shortcut-icon-shell.tone-0 {
  background: linear-gradient(135deg, #6e83d9 0%, #8794e6 100%);
}

.dashboard-shortcut-icon-shell.tone-1 {
  background: linear-gradient(135deg, #ffb04d 0%, #ffc56d 100%);
}

.dashboard-shortcut-icon-shell.tone-2 {
  background: linear-gradient(135deg, #5aa8f2 0%, #74bcff 100%);
}

.dashboard-shortcut-icon-shell.tone-3 {
  background: linear-gradient(135deg, #8a70cf 0%, #a087e3 100%);
}

.dashboard-shortcut-icon-shell.tone-4 {
  background: linear-gradient(135deg, #ff7f86 0%, #ff9aa0 100%);
}

.dashboard-shortcut-icon-shell.tone-5 {
  background: linear-gradient(135deg, #5fb99d 0%, #78ccb0 100%);
}

.dashboard-shortcut-icon {
  width: 54px;
  height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: #fff;
  font-size: 22px;
  flex-shrink: 0;
  overflow: hidden;
}

.dashboard-shortcut-icon.preview {
  width: 54px;
  height: 54px;
}

.dashboard-shortcut-icon-image {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  object-fit: cover;
}

.dashboard-shortcut-title {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  color: var(--app-text);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
  word-break: break-word;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.dashboard-shortcut-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 16px;
  background: rgba(var(--app-outline-rgb), 0.04);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.dashboard-shortcut-empty p {
  margin: 0;
  color: var(--app-text-soft);
  font-weight: 700;
}

.dashboard-shortcut-upload-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dashboard-shortcut-upload-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-shortcut-upload-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.dashboard-shortcut-file-input {
  display: none;
}

@media (max-width: 900px) {
  .dashboard-shortcut-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dashboard-shortcut-launcher-actions,
  .dashboard-shortcut-upload-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

@media (max-width: 1280px) and (min-width: 901px) {
  .dashboard-shortcut-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
