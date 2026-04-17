<template>
  <div class="wiki-space-page">
    <section class="wiki-shell">
      <aside class="wiki-sidebar" v-loading="treeLoading">
        <div class="wiki-sidebar-head">
          <button class="wiki-back-link" type="button" @click="goBack">返回 Wiki 中心</button>
          <button v-if="spaceDetail?.canManage" class="wiki-side-icon-button" type="button" @click="openSpaceDialog">编辑</button>
        </div>

        <div class="wiki-space-card">
          <div class="wiki-space-card-kicker">{{ readScopeLabel(spaceDetail?.readScope) }}</div>
          <h1>{{ spaceDetail?.name || 'Wiki 空间' }}</h1>
          <p>{{ spaceDetail?.description || '这个空间还没有写说明。' }}</p>
          <div class="wiki-space-card-meta">
            <span>我的角色：{{ roleLabel(spaceDetail?.currentUserRole || '') || '访客' }}</span>
            <span>目录：{{ spaceDetail?.directoryCount ?? 0 }}</span>
            <span>页面：{{ spaceDetail?.pageCount ?? 0 }}</span>
          </div>
        </div>

        <div class="wiki-tree-shell">
          <div class="wiki-tree-head">
            <div class="wiki-tree-title">
              <span>页面树</span>
              <el-tag type="info">{{ directoryNodes.length }}</el-tag>
            </div>
            <div class="wiki-tree-actions">
              <button v-if="canEditSpace" class="wiki-side-text-button" type="button" @click="openDirectoryDialog(null)">新建目录</button>
              <button v-if="canEditSpace" class="wiki-side-text-button" type="button" @click="openPageDialog(null)">新建页面</button>
            </div>
          </div>

          <div v-if="directoryNodes.length" class="wiki-directory-tree">
            <template v-for="row in flatRows" :key="`${row.type}-${row.id}`">
              <button
                v-if="row.type === 'directory'"
                class="wiki-tree-row directory"
                :style="{ paddingLeft: `${14 + row.depth * 16}px` }"
                type="button"
                @click="openDirectoryDialog(row.id)"
              >
                <span class="tree-row-title">{{ row.label }}</span>
                <el-tag v-if="row.boundProjectName" size="small">{{ row.boundProjectName }}</el-tag>
              </button>
              <button
                v-else
                class="wiki-tree-row page"
                :class="{ active: currentPage?.id === row.id }"
                :style="{ paddingLeft: `${28 + row.depth * 16}px` }"
                type="button"
                @click="openPage(row.id)"
              >
                <span class="tree-row-title">{{ row.label }}</span>
              </button>
            </template>
          </div>
          <el-empty v-else description="当前空间还没有目录" />
        </div>
      </aside>

      <main class="wiki-workbench" v-loading="pageLoading">
        <template v-if="currentPage || currentDirectory">
          <header class="wiki-article-head">
            <div class="wiki-article-topline">
              <div class="wiki-breadcrumb">{{ currentBreadcrumb }}</div>
              <div class="wiki-article-actions">
                <button class="wiki-header-action" type="button" @click="openMemberDrawer">成员</button>
                <button v-if="currentPage" class="wiki-header-action" type="button" @click="openVersionDrawer">版本历史</button>
                <button v-if="canEditSpace && currentPage" class="wiki-header-action" type="button" @click="openPageDialog(currentPage)">编辑页面</button>
                <button v-if="canEditSpace && currentDirectory" class="wiki-header-action" type="button" @click="openDirectoryDialog(currentDirectory.id)">编辑目录</button>
                <button v-if="canEditSpace && currentPage" class="wiki-header-action danger" type="button" @click="handleDeletePage">删除页面</button>
              </div>
            </div>
            <h2>{{ currentPage?.title || currentDirectory?.name }}</h2>
            <div class="wiki-page-meta">
              <template v-if="currentPage">
                <span>由 {{ currentPage.authorName || '-' }} 创建</span>
                <span>最近更新 {{ currentPage.updatedAt }}</span>
                <span>版本 v{{ currentPage.currentVersionNumber }}</span>
                <el-tag :type="syncTagType(currentPage.syncStatus)" size="small">{{ syncStatusLabel(currentPage.syncStatus) }}</el-tag>
              </template>
              <template v-else-if="currentDirectory">
                <span>目录节点</span>
                <span v-if="currentDirectory.boundProjectName">关联项目 {{ currentDirectory.boundProjectName }}</span>
                <span>Slug {{ currentDirectory.slug }}</span>
              </template>
            </div>
          </header>

          <section class="wiki-article-body">
            <MdPreview
              editor-id="wiki-space-preview"
              language="zh-CN"
              preview-theme="github"
              :model-value="currentPage?.content || currentDirectory?.content || '暂无内容'"
            />
          </section>
        </template>

        <section v-else class="wiki-empty-panel">
          <el-empty description="从左侧选择一个页面，或先创建目录和页面" />
        </section>
      </main>
    </section>

    <el-dialog v-model="spaceDialogVisible" title="编辑空间" width="640px" destroy-on-close>
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

    <el-dialog v-model="directoryDialogVisible" :title="editingDirectory ? '编辑目录' : '新建目录'" width="640px" destroy-on-close>
      <el-form ref="directoryFormRef" :model="directoryForm" :rules="directoryRules" label-position="top">
        <el-form-item label="目录名称" prop="name">
          <el-input v-model="directoryForm.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="目录正文">
          <MarkdownEditor v-model="directoryForm.content" height="280px" :upload-image="handleUploadImage" />
        </el-form-item>
        <el-form-item label="父目录">
          <el-select v-model="directoryForm.parentDirectoryId" clearable placeholder="根目录" style="width: 100%">
            <el-option v-for="row in directorySelectRows" :key="row.id" :label="`${'  '.repeat(row.depth)}${row.label}`" :value="row.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定项目">
          <el-select v-model="directoryForm.boundProjectId" clearable filterable placeholder="不绑定项目" style="width: 100%">
            <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="editingDirectory" type="danger" plain @click="handleDeleteDirectory">删除</el-button>
        <el-button @click="directoryDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitDirectory">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pageDialogVisible" :title="editingPage ? '编辑页面' : '新建页面'" width="920px" destroy-on-close>
      <el-form ref="pageFormRef" :model="pageForm" :rules="pageRules" label-position="top">
        <div class="wiki-form-grid">
          <el-form-item label="页面标题" prop="title">
            <el-input v-model="pageForm.title" maxlength="200" show-word-limit />
          </el-form-item>
          <el-form-item label="所属目录" prop="directoryId">
            <el-select v-model="pageForm.directoryId" style="width: 100%">
              <el-option v-for="row in directorySelectRows" :key="row.id" :label="`${'  '.repeat(row.depth)}${row.label}`" :value="row.id" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="editingPage" label="变更说明">
            <el-input v-model="pageForm.changeSummary" maxlength="500" show-word-limit />
          </el-form-item>
        </div>
        <el-form-item label="正文">
          <MarkdownEditor v-model="pageForm.content" height="520px" :upload-image="handleUploadImage" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pageDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitPage">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="memberDrawerVisible" size="520px" title="空间成员管理">
      <div class="wiki-member-editor">
        <div v-for="(item, index) in memberForm" :key="`${item.userId}-${index}`" class="wiki-member-editor-row">
          <el-select v-model="item.userId" filterable placeholder="选择用户" style="flex: 1">
            <el-option v-for="user in userOptions" :key="user.id" :label="userLabel(user)" :value="user.id" />
          </el-select>
          <el-select v-model="item.memberRole" style="width: 140px">
            <el-option label="管理员" value="ADMIN" />
            <el-option label="编辑者" value="EDITOR" />
            <el-option label="查看者" value="VIEWER" />
          </el-select>
          <el-button type="danger" plain @click="removeMemberRow(index)">删除</el-button>
        </div>
        <div class="wiki-member-editor-actions">
          <el-button @click="addMemberRow">新增成员</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmitMembers">保存成员</el-button>
        </div>
      </div>
    </el-drawer>

    <el-drawer v-model="versionDrawerVisible" size="420px" title="版本历史">
      <div v-loading="versionLoading" class="wiki-version-list">
        <article v-for="item in versions" :key="item.id" class="wiki-version-item">
          <div>
            <strong>v{{ item.versionNumber }} · {{ item.title }}</strong>
            <span>{{ item.changeSummary || '无变更说明' }}</span>
            <small>{{ item.authorName || '-' }} · {{ item.createdAt }}</small>
          </div>
          <el-button size="small" :disabled="!canEditSpace || item.versionNumber === currentPage?.currentVersionNumber" @click="handleRestoreVersion(item.versionNumber)">恢复</el-button>
        </article>
        <el-empty v-if="!versions.length && !versionLoading" description="暂无版本记录" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { MdPreview } from 'md-editor-v3'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { listUserOptions } from '@/api/access'
import {
  createWikiDirectory,
  createWikiSpacePage,
  deleteWikiDirectory,
  deleteWikiSpacePage,
  getWikiDirectoryTree,
  getWikiSpaceDetail,
  getWikiSpacePage,
  listProjectOptions,
  listWikiRelatedPages,
  listWikiSpaceMembers,
  listWikiSpacePageVersions,
  replaceWikiSpaceMembers,
  restoreWikiSpacePageVersion,
  updateWikiDirectory,
  updateWikiSpace,
  updateWikiSpacePage,
  uploadWikiImage,
  type WikiDirectoryPayload,
  type WikiSpaceMemberPayloadItem,
  type WikiSpacePagePayload,
  type WikiSpacePayload
} from '@/api/platform'
import type {
  ProjectItem,
  UserOptionItem,
  WikiDirectoryTreeNodeItem,
  WikiSpaceDetailItem,
  WikiSpaceMemberItem,
  WikiSpacePageDetailItem,
  WikiSpacePageVersionItem
} from '@/types/platform'

interface FlatRow {
  id: number
  type: 'directory' | 'page'
  depth: number
  label: string
  content?: string
  slug?: string
  boundProjectName?: string
  version?: number
}

interface DirectoryForm {
  name: string
  content: string
  parentDirectoryId: number | null
  boundProjectId: number | null
}

interface PageForm {
  directoryId: number | null
  title: string
  content: string
  changeSummary: string
}

interface SpaceForm {
  name: string
  description: string
  readScope: 'MEMBERS_ONLY' | 'ALL_LOGGED_IN'
}

const route = useRoute()
const router = useRouter()
const spaceId = computed(() => Number(route.params.spaceId))
const pageId = computed(() => {
  const value = Number(route.params.pageId)
  return Number.isNaN(value) || value <= 0 ? null : value
})
const loading = ref(false)
const treeLoading = ref(false)
const pageLoading = ref(false)
const versionLoading = ref(false)
const submitting = ref(false)
const spaceDetail = ref<WikiSpaceDetailItem | null>(null)
const directoryNodes = ref<WikiDirectoryTreeNodeItem[]>([])
const currentDirectory = ref<WikiDirectoryTreeNodeItem | null>(null)
const currentPage = ref<WikiSpacePageDetailItem | null>(null)
const members = ref<WikiSpaceMemberItem[]>([])
const versions = ref<WikiSpacePageVersionItem[]>([])
const projectOptions = ref<ProjectItem[]>([])
const userOptions = ref<UserOptionItem[]>([])

const spaceDialogVisible = ref(false)
const directoryDialogVisible = ref(false)
const pageDialogVisible = ref(false)
const memberDrawerVisible = ref(false)
const versionDrawerVisible = ref(false)

const editingDirectory = ref<FlatRow | null>(null)
const editingPage = ref<WikiSpacePageDetailItem | null>(null)
const spaceFormRef = ref<FormInstance>()
const directoryFormRef = ref<FormInstance>()
const pageFormRef = ref<FormInstance>()

const spaceForm = reactive<SpaceForm>({
  name: '',
  description: '',
  readScope: 'MEMBERS_ONLY'
})
const directoryForm = reactive<DirectoryForm>({
  name: '',
  content: '',
  parentDirectoryId: null,
  boundProjectId: null
})
const pageForm = reactive<PageForm>({
  directoryId: null,
  title: '',
  content: '',
  changeSummary: ''
})
const memberForm = ref<WikiSpaceMemberPayloadItem[]>([])

const spaceRules: FormRules<SpaceForm> = {
  name: [{ required: true, message: '请输入空间名称', trigger: 'blur' }]
}
const directoryRules: FormRules<DirectoryForm> = {
  name: [{ required: true, message: '请输入目录名称', trigger: 'blur' }]
}
const pageRules: FormRules<PageForm> = {
  directoryId: [{ required: true, message: '请选择目录', trigger: 'change' }],
  title: [{ required: true, message: '请输入页面标题', trigger: 'blur' }]
}

const canEditSpace = computed(() => {
  const role = spaceDetail.value?.currentUserRole
  return role === 'ADMIN' || role === 'EDITOR'
})

const flatRows = computed(() => flattenTree(directoryNodes.value))
const directorySelectRows = computed(() => flatRows.value.filter((item) => item.type === 'directory' && item.id !== editingDirectory.value?.id))
const currentBreadcrumb = computed(() => {
  if (!currentPage.value) {
    if (currentDirectory.value) {
      const directoryPath = resolveDirectoryPath(directoryNodes.value, currentDirectory.value.id)
      return [spaceDetail.value?.name || 'Wiki 空间', ...directoryPath].filter(Boolean).join(' / ')
    }
    return spaceDetail.value?.name || 'Wiki 空间'
  }
  const directoryPath = resolveDirectoryPath(directoryNodes.value, currentPage.value.directoryId)
  return [spaceDetail.value?.name || 'Wiki 空间', ...directoryPath, currentPage.value.title].filter(Boolean).join(' / ')
})

watch(
  () => route.params.pageId,
  () => {
    void loadCurrentPage()
  }
)

onMounted(async () => {
  await reloadAll()
})

async function reloadAll() {
  loading.value = true
  try {
    await Promise.all([loadSpaceDetail(), loadDirectoryTree(), loadProjects(), loadMembers()])
    await loadCurrentPage()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Wiki 空间失败')
  } finally {
    loading.value = false
  }
}

async function loadSpaceDetail() {
  spaceDetail.value = await getWikiSpaceDetail(spaceId.value)
}

async function loadDirectoryTree() {
  treeLoading.value = true
  try {
    directoryNodes.value = await getWikiDirectoryTree(spaceId.value)
  } finally {
    treeLoading.value = false
  }
}

async function loadProjects() {
  try {
    projectOptions.value = await listProjectOptions()
  } catch {
    projectOptions.value = []
  }
}

async function loadMembers() {
  try {
    members.value = await listWikiSpaceMembers(spaceId.value)
  } catch {
    members.value = []
  }
}

async function loadCurrentPage() {
  if (!pageId.value) {
    currentPage.value = null
    const firstPage = flatRows.value.find((item) => item.type === 'page')
    if (firstPage) {
      openPage(firstPage.id)
    }
    return
  }
  pageLoading.value = true
  try {
    currentPage.value = await getWikiSpacePage(spaceId.value, pageId.value)
    currentPage.value.relatedPages = await listWikiRelatedPages(spaceId.value, pageId.value)
  } catch (error: any) {
    currentPage.value = null
    ElMessage.error(error?.response?.data?.message || '读取 Wiki 页面失败')
  } finally {
    pageLoading.value = false
  }
}

function flattenTree(nodes: WikiDirectoryTreeNodeItem[], depth = 0): FlatRow[] {
  const rows: FlatRow[] = []
  for (const node of nodes) {
    rows.push({
      id: node.id,
      type: 'directory',
      depth,
      label: node.name,
      content: node.content,
      slug: node.slug,
      boundProjectName: node.boundProjectName || ''
    })
    for (const page of node.pages || []) {
      rows.push({
        id: page.id,
        type: 'page',
        depth: depth + 1,
        label: page.title,
        version: page.currentVersionNumber
      })
    }
    rows.push(...flattenTree(node.children || [], depth + 1))
  }
  return rows
}

function resolveDirectoryPath(nodes: WikiDirectoryTreeNodeItem[], directoryId: number, path: string[] = []): string[] {
  for (const node of nodes) {
    const currentPath = [...path, node.name]
    if (node.id === directoryId) {
      return currentPath
    }
    const childPath = resolveDirectoryPath(node.children || [], directoryId, currentPath)
    if (childPath.length) {
      return childPath
    }
  }
  return []
}

function openPage(targetPageId: number) {
  currentDirectory.value = null
  router.push({ name: 'wiki-space-page', params: { spaceId: spaceId.value, pageId: targetPageId } })
}

function selectDirectory(directoryId: number) {
  currentDirectory.value = findDirectoryNode(directoryNodes.value, directoryId)
  currentPage.value = null
  router.push({ name: 'wiki-space', params: { spaceId: spaceId.value } })
}

function openSpaceDialog() {
  if (!spaceDetail.value) return
  spaceForm.name = spaceDetail.value.name
  spaceForm.description = spaceDetail.value.description
  spaceForm.readScope = spaceDetail.value.readScope as SpaceForm['readScope']
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
    spaceDetail.value = await updateWikiSpace(spaceId.value, payload)
    ElMessage.success('空间信息已更新')
    spaceDialogVisible.value = false
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新空间失败')
  } finally {
    submitting.value = false
  }
}

function openDirectoryDialog(directoryId: number | null) {
  if (directoryId == null) {
    editingDirectory.value = null
    directoryForm.name = ''
    directoryForm.content = ''
    directoryForm.parentDirectoryId = null
    directoryForm.boundProjectId = null
  } else {
    const row = flatRows.value.find((item) => item.type === 'directory' && item.id === directoryId) || null
    editingDirectory.value = row
    const detail = findDirectoryNode(directoryNodes.value, directoryId)
    directoryForm.name = detail?.name || ''
    directoryForm.content = detail?.content || ''
    directoryForm.parentDirectoryId = detail?.parentDirectoryId ?? null
    directoryForm.boundProjectId = detail?.boundProjectId ?? null
  }
  directoryDialogVisible.value = true
}

function findDirectoryNode(nodes: WikiDirectoryTreeNodeItem[], directoryId: number): WikiDirectoryTreeNodeItem | null {
  for (const node of nodes) {
    if (node.id === directoryId) {
      return node
    }
    const child = findDirectoryNode(node.children || [], directoryId)
    if (child) return child
  }
  return null
}

async function handleSubmitDirectory() {
  const valid = await directoryFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload: WikiDirectoryPayload = {
      name: directoryForm.name,
      content: directoryForm.content,
      parentDirectoryId: directoryForm.parentDirectoryId,
      boundProjectId: directoryForm.boundProjectId
    }
    if (editingDirectory.value) {
      await updateWikiDirectory(spaceId.value, editingDirectory.value.id, payload)
      ElMessage.success('目录已更新')
    } else {
      await createWikiDirectory(spaceId.value, payload)
      ElMessage.success('目录已创建')
    }
    directoryDialogVisible.value = false
    await loadDirectoryTree()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存目录失败')
  } finally {
    submitting.value = false
  }
}

async function handleDeleteDirectory() {
  if (!editingDirectory.value) return
  try {
    await ElMessageBox.confirm(`删除目录「${editingDirectory.value.label}」前，请确认里面没有子目录和页面。`, '提示', { type: 'warning' })
    await deleteWikiDirectory(spaceId.value, editingDirectory.value.id)
    ElMessage.success('目录已删除')
    directoryDialogVisible.value = false
    await loadDirectoryTree()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除目录失败')
    }
  }
}

function openPageDialog(page: WikiSpacePageDetailItem | null) {
  if (page) {
    editingPage.value = page
    pageForm.directoryId = page.directoryId
    pageForm.title = page.title
    pageForm.content = page.content
    pageForm.changeSummary = ''
  } else {
    editingPage.value = null
    const firstDirectory = directorySelectRows.value[0]
    pageForm.directoryId = firstDirectory?.id ?? null
    pageForm.title = ''
    pageForm.content = ''
    pageForm.changeSummary = ''
  }
  pageDialogVisible.value = true
}

async function handleSubmitPage() {
  const valid = await pageFormRef.value?.validate().catch(() => false)
  if (!valid || pageForm.directoryId == null) return
  submitting.value = true
  try {
    const payload: WikiSpacePagePayload = {
      directoryId: pageForm.directoryId,
      title: pageForm.title,
      content: pageForm.content,
      changeSummary: pageForm.changeSummary
    }
    const saved = editingPage.value
      ? await updateWikiSpacePage(spaceId.value, editingPage.value.id, payload)
      : await createWikiSpacePage(spaceId.value, payload)
    ElMessage.success('页面已保存')
    pageDialogVisible.value = false
    await loadDirectoryTree()
    openPage(saved.id)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存页面失败')
  } finally {
    submitting.value = false
  }
}

async function handleDeletePage() {
  if (!currentPage.value) return
  try {
    await ElMessageBox.confirm(`删除页面「${currentPage.value.title}」后不可恢复，是否继续？`, '提示', { type: 'warning' })
    await deleteWikiSpacePage(spaceId.value, currentPage.value.id)
    ElMessage.success('页面已删除')
    currentPage.value = null
    await loadDirectoryTree()
    router.push({ name: 'wiki-space', params: { spaceId: spaceId.value } })
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除页面失败')
    }
  }
}

async function openVersionDrawer() {
  if (!currentPage.value) return
  versionDrawerVisible.value = true
  versionLoading.value = true
  try {
    versions.value = await listWikiSpacePageVersions(spaceId.value, currentPage.value.id)
  } finally {
    versionLoading.value = false
  }
}

async function handleRestoreVersion(versionNumber: number) {
  if (!currentPage.value) return
  try {
    const restored = await restoreWikiSpacePageVersion(spaceId.value, currentPage.value.id, versionNumber)
    currentPage.value = restored
    ElMessage.success('版本已恢复')
    await openVersionDrawer()
    await loadDirectoryTree()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '恢复版本失败')
  }
}

async function openMemberDrawer() {
  memberDrawerVisible.value = true
  await loadMemberOptions()
  memberForm.value = members.value.map((item) => ({
    userId: item.userId,
    memberRole: item.memberRole as WikiSpaceMemberPayloadItem['memberRole']
  }))
}

async function loadMemberOptions() {
  try {
    userOptions.value = await listUserOptions()
  } catch {
    userOptions.value = []
  }
}

function addMemberRow() {
  memberForm.value.push({
    userId: userOptions.value[0]?.id ?? 0,
    memberRole: 'VIEWER'
  })
}

function removeMemberRow(index: number) {
  memberForm.value.splice(index, 1)
}

async function handleSubmitMembers() {
  submitting.value = true
  try {
    const normalized = memberForm.value.filter((item) => item.userId > 0)
    members.value = await replaceWikiSpaceMembers(spaceId.value, normalized)
    ElMessage.success('空间成员已更新')
    memberDrawerVisible.value = false
    await loadSpaceDetail()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存成员失败')
  } finally {
    submitting.value = false
  }
}

async function handleUploadImage(file: File) {
  const uploaded = await uploadWikiImage(spaceId.value, file)
  return uploaded.url
}

function goBack() {
  router.push({ name: 'wiki-home' })
}

function roleLabel(role?: string | null) {
  if (role === 'ADMIN') return '管理员'
  if (role === 'EDITOR') return '编辑者'
  if (role === 'VIEWER') return '查看者'
  return ''
}

function readScopeLabel(scope?: string | null) {
  return scope === 'ALL_LOGGED_IN' ? '所有登录用户可读' : '仅空间成员可读'
}

function syncStatusLabel(status: string) {
  if (status === 'SYNCED') return '已同步'
  if (status === 'FAILED') return '同步失败'
  return '待同步'
}

function syncTagType(status: string) {
  if (status === 'SYNCED') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'warning'
}

function userLabel(user: UserOptionItem) {
  return user.nickname?.trim() ? `${user.nickname}（${user.username}）` : user.username
}
</script>

<style scoped>
.wiki-space-page {
  height: 100%;
  min-height: calc(100vh - 168px);
}

.wiki-shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  min-height: inherit;
}

.wiki-sidebar,
.wiki-workbench {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.wiki-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: inherit;
  padding: 12px;
}

.wiki-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin-bottom: 10px;
}

.wiki-back-link,
.wiki-side-icon-button,
.wiki-side-text-button,
.wiki-header-action {
  border: 0;
  background: transparent;
  color: #516072;
  cursor: pointer;
  font: inherit;
}

.wiki-back-link {
  padding: 0;
  font-size: 13px;
  font-weight: 700;
}

.wiki-side-icon-button,
.wiki-side-text-button,
.wiki-header-action {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  background: rgba(243, 244, 245, 0.92);
  font-size: 12px;
  font-weight: 700;
}

.wiki-header-action.danger {
  color: #b42318;
}

.wiki-space-card {
  width: 100%;
  padding: 10px 10px 12px;
  border-radius: 8px;
  background: rgba(247, 248, 250, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.9);
  margin-bottom: 12px;
}

.wiki-space-card-kicker {
  color: #d97706;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.wiki-space-card h1 {
  margin: 6px 0 4px;
  color: #172033;
  font-size: 18px;
}

.wiki-space-card p,
.wiki-muted {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.wiki-space-card-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  color: #475569;
  font-size: 12px;
}

.wiki-tree-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.wiki-tree-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.wiki-tree-title,
.wiki-article-topline,
.wiki-article-actions,
.wiki-directory-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wiki-tree-title {
  color: #172033;
  font-weight: 800;
}

.wiki-directory-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.wiki-directory-tree,
.wiki-version-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}

.wiki-tree-row {
  width: 100%;
  border: 0;
  background: rgba(248, 250, 252, 0.9);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  color: #334155;
}

.wiki-tree-row.page.active {
  background: #172033;
  color: #fff;
}

.tree-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wiki-workbench {
  display: flex;
  flex-direction: column;
  min-height: inherit;
  padding: 16px 18px 18px;
}

.wiki-article-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  padding-bottom: 14px;
}

.wiki-breadcrumb {
  color: #d97706;
  font-size: 13px;
  font-weight: 700;
}

.wiki-article-head h2 {
  margin: 0;
  color: #172033;
  font-size: 30px;
}

.wiki-page-meta,
.wiki-member-editor-row,
.wiki-member-editor-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.wiki-page-meta {
  flex-wrap: wrap;
  color: #64748b;
  font-size: 13px;
}

.wiki-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.wiki-article-body,
.wiki-empty-panel {
  flex: 1 1 auto;
  min-height: 0;
  padding-top: 18px;
}

.wiki-member-editor,
.wiki-version-item div {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wiki-version-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.92);
}

.wiki-version-item span,
.wiki-version-item small {
  color: #64748b;
}

@media (max-width: 1200px) {
  .wiki-shell {
    grid-template-columns: 228px minmax(0, 1fr);
  }
}

@media (max-width: 860px) {
  .wiki-shell,
  .wiki-form-grid {
    grid-template-columns: 1fr;
  }

  .wiki-article-topline,
  .wiki-article-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .wiki-article-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
