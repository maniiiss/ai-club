<template>
  <div class="wiki-home-page">
    <section class="management-list-toolbar wiki-home-toolbar">
      <div class="management-list-toolbar-main">
        <div class="gitlab-tab-switcher" role="tablist" aria-label="Wiki 空间切换">
          <button class="gitlab-tab-button" :class="{ active: spaceFilterMode === 'all' }" type="button" @click="applyFilterMode('all')">全部空间</button>
          <button class="gitlab-tab-button" :class="{ active: spaceFilterMode === 'mine' }" type="button" @click="applyFilterMode('mine')">我的空间</button>
        </div>

        <span class="management-list-toolbar-divider" aria-hidden="true"></span>

        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索空间名称或说明..."
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
              <label>关联项目</label>
              <el-select v-model="filters.projectId" clearable filterable placeholder="全部项目" style="width: 100%" :teleported="false">
                <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
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
        <button v-if="canManageWiki" class="management-list-create-button" type="button" @click="openCreateSpaceDialog">
          <el-icon><Plus /></el-icon>
          <span>创建空间</span>
        </button>
      </div>
    </section>

    <section class="wiki-space-grid" v-loading="loading">
      <article v-for="space in spaces" :key="space.id" class="wiki-space-card">
        <div class="wiki-space-card-head">
          <div>
            <h2>{{ space.name }}</h2>
            <p>{{ space.description || '暂无空间说明' }}</p>
          </div>
          <el-tag :type="space.readScope === 'ALL_LOGGED_IN' ? 'success' : 'info'">{{ readScopeLabel(space.readScope) }}</el-tag>
        </div>

        <div class="wiki-space-meta">
          <span>我的角色：{{ roleLabel(space.currentUserRole) || '访客' }}</span>
          <span>目录：{{ space.directoryCount }}</span>
          <span>页面：{{ space.pageCount }}</span>
          <span>项目关联：{{ space.boundProjectCount }}</span>
        </div>

        <div class="wiki-space-actions">
          <el-button type="primary" @click="openSpace(space.id)">进入空间</el-button>
          <el-button v-if="space.canManage" @click="openEditSpaceDialog(space)">编辑空间</el-button>
          <el-button v-if="space.canManage" type="danger" plain @click="handleDeleteSpace(space)">删除</el-button>
        </div>
      </article>

      <el-empty v-if="!loading && !spaces.length" description="当前没有可访问的 Wiki 空间" />
    </section>

    <el-dialog v-model="spaceDialogVisible" :title="editingSpace ? '编辑 Wiki 空间' : '创建 Wiki 空间'" width="640px" destroy-on-close>
      <el-form ref="spaceFormRef" :model="spaceForm" :rules="spaceRules" label-position="top">
        <el-form-item label="空间名称" prop="name">
          <el-input v-model="spaceForm.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="空间说明">
          <el-input v-model="spaceForm.description" type="textarea" :rows="4" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="读取范围">
          <el-select v-model="spaceForm.readScope" style="width: 100%">
            <el-option label="仅成员可读" value="MEMBERS_ONLY" />
            <el-option label="所有登录用户可读" value="ALL_LOGGED_IN" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="spaceDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitSpace">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Filter, Plus, RefreshRight, Search } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createWikiSpace,
  deleteWikiSpace,
  listProjectOptions,
  listWikiSpaces,
  updateWikiSpace,
  type WikiSpacePayload
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type { ProjectItem, WikiSpaceItem } from '@/types/platform'

interface WikiSpaceForm {
  name: string
  description: string
  readScope: 'MEMBERS_ONLY' | 'ALL_LOGGED_IN'
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const spaces = ref<WikiSpaceItem[]>([])
const projectOptions = ref<ProjectItem[]>([])
const filterPopoverVisible = ref(false)
const projectFilterId = ref<number | null>(null)
const spaceFilterMode = ref<'all' | 'mine'>('all')
const editingSpace = ref<WikiSpaceItem | null>(null)
const spaceDialogVisible = ref(false)
const spaceFormRef = ref<FormInstance>()
const canManageWiki = computed(() => authStore.hasPermission('wiki:manage'))

const filters = reactive({
  keyword: '',
  projectId: null as number | null
})

const spaceForm = reactive<WikiSpaceForm>({
  name: '',
  description: '',
  readScope: 'MEMBERS_ONLY'
})

const spaceRules: FormRules<WikiSpaceForm> = {
  name: [{ required: true, message: '请输入空间名称', trigger: 'blur' }]
}

watch(
  () => route.query.projectId,
  (value) => {
    const projectId = Number(value)
    projectFilterId.value = Number.isNaN(projectId) || projectId <= 0 ? null : projectId
    void loadSpaces()
  },
  { immediate: true }
)

onMounted(async () => {
  await loadProjects()
  await loadSpaces()
})

async function loadProjects() {
  try {
    projectOptions.value = await listProjectOptions()
  } catch {
    projectOptions.value = []
  }
}

async function loadSpaces() {
  loading.value = true
  try {
    spaces.value = await listWikiSpaces({
      keyword: filters.keyword,
      mineOnly: spaceFilterMode.value === 'mine' ? true : undefined,
      projectId: filters.projectId ?? projectFilterId.value
    })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Wiki 空间失败')
  } finally {
    loading.value = false
  }
}

async function handleSearch() {
  filterPopoverVisible.value = false
  await loadSpaces()
}

async function handleReset() {
  filters.keyword = ''
  filters.projectId = null
  projectFilterId.value = null
  filterPopoverVisible.value = false
  await loadSpaces()
}

async function applyFilterMode(mode: 'all' | 'mine') {
  if (spaceFilterMode.value === mode) {
    return
  }
  spaceFilterMode.value = mode
  await loadSpaces()
}

function openSpace(spaceId: number) {
  router.push({ name: 'wiki-space', params: { spaceId } })
}

function openCreateSpaceDialog() {
  editingSpace.value = null
  spaceForm.name = ''
  spaceForm.description = ''
  spaceForm.readScope = 'MEMBERS_ONLY'
  spaceDialogVisible.value = true
}

function openEditSpaceDialog(space: WikiSpaceItem) {
  editingSpace.value = space
  spaceForm.name = space.name
  spaceForm.description = space.description
  spaceForm.readScope = space.readScope as WikiSpaceForm['readScope']
  spaceDialogVisible.value = true
}

async function handleSubmitSpace() {
  const valid = await spaceFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload: WikiSpacePayload = {
      name: spaceForm.name,
      description: spaceForm.description,
      readScope: spaceForm.readScope
    }
    if (editingSpace.value) {
      await updateWikiSpace(editingSpace.value.id, payload)
      ElMessage.success('Wiki 空间已更新')
    } else {
      await createWikiSpace(payload)
      ElMessage.success('Wiki 空间已创建')
    }
    spaceDialogVisible.value = false
    await loadSpaces()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存 Wiki 空间失败')
  } finally {
    submitting.value = false
  }
}

async function handleDeleteSpace(space: WikiSpaceItem) {
  try {
    await ElMessageBox.confirm(`删除空间「${space.name}」后目录和页面都会一起移除，是否继续？`, '提示', { type: 'warning' })
    await deleteWikiSpace(space.id)
    ElMessage.success('Wiki 空间已删除')
    await loadSpaces()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除 Wiki 空间失败')
    }
  }
}

function roleLabel(role: string) {
  if (role === 'ADMIN') return '管理员'
  if (role === 'EDITOR') return '编辑者'
  if (role === 'VIEWER') return '查看者'
  return ''
}

function readScopeLabel(scope: string) {
  return scope === 'ALL_LOGGED_IN' ? '全员可读' : '仅成员可读'
}
</script>

<style scoped>
.wiki-home-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.wiki-space-card {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.wiki-home-toolbar {
  margin-bottom: 0;
}

.gitlab-tab-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: 8px;
  background: rgba(225, 227, 228, 0.56);
}

.gitlab-tab-button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7c8794;
  font-size: 12px;
  font-weight: 800;
}

.gitlab-tab-button.active {
  background: #fff;
  color: var(--app-primary);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.wiki-space-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}

.wiki-space-card {
  padding: 18px;
}

.wiki-space-card-head,
.wiki-space-meta,
.wiki-space-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.wiki-space-card-head {
  justify-content: space-between;
}

.wiki-space-card h2 {
  margin: 0;
  color: #172033;
}

.wiki-space-card p {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.6;
}

.wiki-space-meta {
  color: #475569;
  font-size: 13px;
  margin: 14px 0 18px;
}

.wiki-space-actions {
  justify-content: flex-start;
}

@media (max-width: 980px) {
  .wiki-home-toolbar .management-list-toolbar-main {
    width: fit-content;
    max-width: 100%;
    justify-self: start;
    flex: 0 1 auto;
  }
}
</style>
