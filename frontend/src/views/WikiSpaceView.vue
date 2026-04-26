<template>
  <div class="wiki-space-page">
    <section class="wiki-shell">
      <aside class="wiki-sidebar" v-loading="treeLoading || searchLoading">
        <div class="wiki-sidebar-head">
          <button class="wiki-back-link" type="button" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            <span>返回 Wiki 中心</span>
          </button>
          <button v-if="spaceDetail?.canManage" class="wiki-side-icon-button" type="button" @click="openSpaceDialog">编辑</button>
        </div>

        <div class="wiki-space-card">
          <div class="wiki-space-card-kicker">{{ readScopeLabel(spaceDetail?.readScope) }}</div>
          <h1>{{ spaceDetail?.name || 'Wiki 空间' }}</h1>
          <p>{{ spaceDetail?.description || '这个空间还没有写说明。' }}</p>
          <div class="wiki-space-card-meta">
            <span>绑定项目：{{ spaceDetail?.boundProjectName || '未绑定' }}</span>
            <span>成员默认：{{ memberDefaultSourceLabel(spaceDetail?.memberDefaultSource) }}</span>
          </div>
          <div class="wiki-space-card-actions-shell">
            <div class="wiki-space-card-actions">
              <el-button type="primary" @click="openMemoryFactGraph">
                <el-icon><DataAnalysis /></el-icon>
                <span>记忆事实图</span>
              </el-button>
            </div>
          </div>
        </div>

        <div class="wiki-search-shell">
          <div class="wiki-search-tabs" role="tablist" aria-label="Wiki 搜索模式切换">
            <button
              class="wiki-search-tab"
              :class="{ active: searchMode === 'semantic' }"
              type="button"
              @click="switchSearchMode('semantic')"
            >
              召回搜索
            </button>
            <button
              class="wiki-search-tab"
              :class="{ active: searchMode === 'keyword' }"
              type="button"
              @click="switchSearchMode('keyword')"
            >
              关键词搜索
            </button>
          </div>
          <div class="wiki-search-bar">
            <input
              v-model="activeSearchQuery"
              class="wiki-search-input"
              type="text"
              :placeholder="searchMode === 'semantic' ? '描述你想找的 Wiki 内容' : '输入标题、目录或正文关键词'"
              @keyup.enter="handleSearch"
            />
            <button class="wiki-search-action" type="button" @click="handleSearch">搜索</button>
            <button class="wiki-search-action ghost" type="button" @click="clearCurrentSearch">清空</button>
          </div>
          <div v-if="searchStatusMessage && !searchPanelVisible" class="wiki-search-status">{{ searchStatusMessage }}</div>
        </div>

        <div class="wiki-tree-shell">
          <div v-if="!searchPanelVisible && canEditSpace" class="wiki-tree-toolbar">
            <button class="wiki-side-text-button wiki-tree-create-button" type="button" @click="openDirectoryDialog(null)">添加目录</button>
          </div>
          <div v-if="searchPanelVisible" class="wiki-search-panel">
            <div class="wiki-search-panel-head">
              <button class="wiki-side-text-button" type="button" @click="backToTree">返回目录树</button>
              <span class="wiki-search-panel-meta">
                {{ searchMode === 'semantic' ? '召回搜索' : '关键词搜索' }}
                <template v-if="activeSearchState.searched && !activeSearchState.error"> · {{ activeSearchState.results.length }} 条结果</template>
              </span>
            </div>
            <div v-if="searchLoading" class="wiki-search-loading">正在搜索当前空间内容...</div>
            <div v-else-if="activeSearchState.error" class="wiki-search-status error">{{ activeSearchState.error }}</div>
            <div v-else-if="activeSearchState.searched && !activeSearchState.results.length" class="wiki-search-empty">
              <el-empty description="当前空间内没有找到匹配页面" />
            </div>
            <div v-else-if="activeSearchState.results.length" class="wiki-search-results">
              <button
                v-for="item in activeSearchState.results"
                :key="item.key"
                class="wiki-search-result-card"
                :class="{ active: currentPage?.id === item.pageId }"
                type="button"
                @click="openPage(item.pageId)"
              >
                <div class="wiki-search-result-head">
                  <strong>{{ item.title }}</strong>
                  <span v-if="item.score != null" class="wiki-search-result-score">{{ item.score.toFixed(2) }}</span>
                </div>
                <div class="wiki-search-result-meta">
                  <span>{{ item.directoryName || '未知目录' }}</span>
                  <span>{{ item.updatedAt || '-' }}</span>
                </div>
                <p class="wiki-search-result-snippet">{{ item.snippet }}</p>
              </button>
            </div>
            <div v-else class="wiki-search-placeholder">
              <p>输入搜索内容后，可在当前空间里查看关键词结果或召回结果。</p>
            </div>
          </div>
          <div v-else-if="directoryNodes.length" class="wiki-directory-tree">
            <div
              v-for="row in visibleRows"
              :key="row.key"
              class="wiki-tree-row"
              :class="[
                row.type,
                {
                  active: row.type === 'page' ? currentPage?.id === row.id : currentDirectory?.id === row.id && !currentPage,
                  'branch-active': isRowInSelectedBranch(row)
                }
              ]"
              :style="{ paddingLeft: `${12 + row.depth * 18}px` }"
            >
              <div class="wiki-tree-main">
                <button
                  class="wiki-tree-toggle"
                  :class="{ placeholder: !row.hasChildren }"
                  type="button"
                  :aria-label="isRowExpanded(row.key) ? '收起节点' : '展开节点'"
                  @click.stop="row.hasChildren && toggleRow(row.key)"
                >
                  <el-icon v-if="row.hasChildren" class="wiki-tree-toggle-icon">
                    <ArrowDown v-if="isRowExpanded(row.key)" />
                    <ArrowRight v-else />
                  </el-icon>
                </button>
                <button
                  class="wiki-tree-link"
                  type="button"
                  :title="row.label"
                  @click="row.type === 'page' ? openPage(row.id) : selectDirectory(row.id)"
                >
                  <span class="tree-row-title">{{ row.label }}</span>
                </button>
              </div>
            </div>
          </div>
          <el-empty v-else description="当前空间还没有页面" />
        </div>
      </aside>

      <main class="wiki-workbench" v-loading="pageLoading">
        <section v-if="currentPage || currentDirectory" :key="currentNodeKey" class="wiki-content-shell">
          <header class="wiki-article-head">
            <div class="wiki-article-topline">
              <div class="wiki-breadcrumb">{{ currentBreadcrumb }}</div>
              <div class="wiki-article-actions">
                <button v-if="showMemberAction" class="wiki-header-action" type="button" @click="openMemberDrawer">成员</button>
                <button v-if="currentPage" class="wiki-header-action" type="button" @click="openVersionDrawer">版本历史</button>
                <button v-if="currentPage?.importSource" class="wiki-header-action" type="button" @click="downloadCurrentSource">下载原文</button>
                <button v-if="canEditSpace" class="wiki-header-action" type="button" @click="openImportDialog">导入文档</button>
                <button
                  v-if="canEditSpace"
                  class="wiki-header-action"
                  type="button"
                  @click="openCreatePageDialog(currentPage ? { directoryId: currentPage.directoryId, parentPageId: currentPage.id } : { directoryId: currentDirectory?.id, parentPageId: null })"
                >
                  新建页面
                </button>
                <button v-if="canEditSpace && currentPage" class="wiki-header-action" type="button" @click="openPageDialog(currentPage)">编辑页面</button>
                <button v-if="canEditSpace && currentDirectory" class="wiki-header-action" type="button" @click="openDirectoryDialog(currentDirectory.id)">编辑页面</button>
                <button v-if="canEditSpace && currentPage" class="wiki-header-action danger" type="button" @click="handleDeletePage">删除页面</button>
              </div>
            </div>
            <h2>{{ currentNodeTitle }}</h2>
            <div class="wiki-page-meta">
              <template v-if="currentPage">
                <span>由 {{ currentPage.authorName || '-' }} 创建</span>
                <span>最近更新 {{ currentPage.updatedAt }}</span>
                <span>版本 v{{ currentPage.currentVersionNumber }}</span>
                <el-tag :type="syncTagType(currentPage.syncStatus)" size="small">{{ syncStatusLabel(currentPage.syncStatus) }}</el-tag>
                <span v-if="currentPage.importSource">来源 {{ currentPage.importSource.fileName }}</span>
              </template>
              <template v-else-if="currentDirectory">
                <span>页面节点</span>
                <span v-if="currentDirectory.boundProjectName">关联项目 {{ currentDirectory.boundProjectName }}</span>
                <span>Slug {{ currentDirectory.slug }}</span>
              </template>
              <span v-if="inlineContentSaving" class="wiki-page-meta-saving">正文保存中...</span>
            </div>
          </header>

          <section class="wiki-article-body" :class="{ 'is-inline-editable': inlineContentEditable }">
            <MarkdownEditor
              v-if="inlineContentEditable"
              v-model="inlineContentDraft"
              height="100%"
              :upload-image="handleUploadImage"
              :placeholder="inlineContentPlaceholder"
              @edit-state-change="handleInlineEditorStateChange"
            />
            <MdPreview
              v-else
              :key="currentNodeKey"
              :editor-id="`wiki-space-preview-${currentNodeKey}`"
              language="zh-CN"
              preview-theme="github"
              :model-value="currentNodeContent"
            />
          </section>
        </section>

        <section v-else class="wiki-empty-panel">
          <el-empty description="从左侧选择一个页面，或先创建页面" />
        </section>
      </main>
    </section>

    <el-dialog v-model="spaceDialogVisible" title="编辑空间" width="720px" destroy-on-close>
      <el-form ref="spaceFormRef" :model="spaceForm" :rules="spaceRules" label-position="top">
        <el-form-item label="空间名称" prop="name">
          <el-input v-model="spaceForm.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="空间说明">
          <el-input v-model="spaceForm.description" type="textarea" :rows="4" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="绑定项目">
          <el-select v-model="spaceForm.boundProjectId" clearable filterable placeholder="不绑定项目" style="width: 100%">
            <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="读取范围">
          <el-select v-model="spaceForm.readScope" style="width: 100%">
            <el-option label="仅成员可读" value="MEMBERS_ONLY" />
            <el-option label="所有登录用户可读" value="ALL_LOGGED_IN" />
          </el-select>
        </el-form-item>
        <el-form-item label="成员默认配置">
          <el-radio-group v-model="spaceForm.memberDefaultSource">
            <el-radio value="MANUAL">手动配置成员</el-radio>
            <el-radio value="PROJECT_MEMBERS" :disabled="!spaceForm.boundProjectId">使用项目成员作为默认成员</el-radio>
          </el-radio-group>
          <div class="wiki-space-form-hint">开启后会把绑定项目中的负责人、创建人和成员作为默认空间成员带入，当前操作者保留管理员权限。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="spaceDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitSpace">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="directoryDialogVisible" :title="editingDirectory ? '编辑页面' : '添加目录'" width="1120px" destroy-on-close>
      <el-form ref="directoryFormRef" :model="directoryForm" :rules="directoryRules" label-position="top">
        <div class="wiki-form-grid">
          <el-form-item label="页面标题" prop="name">
            <el-input v-model="directoryForm.name" maxlength="120" show-word-limit />
          </el-form-item>
        </div>
        <el-form-item label="正文">
          <MarkdownEditor v-model="directoryForm.content" height="640px" :upload-image="handleUploadImage" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="directoryDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitDirectory">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pageDialogVisible" :title="editingPage ? '编辑页面' : '新建页面'" width="1120px" destroy-on-close>
      <el-form ref="pageFormRef" :model="pageForm" :rules="pageRules" label-position="top">
        <div class="wiki-form-grid">
          <el-form-item label="页面标题" prop="title">
            <el-input v-model="pageForm.title" maxlength="200" show-word-limit />
          </el-form-item>
          <el-form-item label="上级页面">
            <el-select v-model="pageForm.parentPageId" clearable placeholder="作为目录下一级页面" style="width: 100%">
              <el-option v-for="row in pageSelectRows" :key="row.id" :label="`${'  '.repeat(row.depth)}${row.label}`" :value="row.id" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="editingPage" label="变更说明">
            <el-input v-model="pageForm.changeSummary" maxlength="500" show-word-limit />
          </el-form-item>
        </div>
        <el-form-item label="正文">
          <MarkdownEditor v-model="pageForm.content" height="640px" :upload-image="handleUploadImage" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pageDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitPage">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialogVisible" title="导入文档" width="720px" destroy-on-close>
      <div
        v-loading="importLoading"
        element-loading-text="正在上传并转换文档，请稍候..."
        class="wiki-import-shell"
      >
        <el-upload
          drag
          action=""
          :auto-upload="false"
          :show-file-list="false"
          :disabled="importLoading"
          :on-change="handleImportFileChange"
          accept=".pdf,.docx,.pptx,.xlsx"
        >
          <div class="wiki-import-dropzone">
            <p>拖拽或点击上传 PDF / DOCX / PPTX / XLSX 文档</p>
            <small>系统会先转为 Markdown 预览，再创建新的 Wiki 页面。</small>
          </div>
        </el-upload>
        <div v-if="importPreview" class="wiki-import-preview">
          <div class="wiki-import-meta">
            <span>建议标题：{{ importPreview.suggestedTitle || importPreview.fileName }}</span>
            <span>格式：{{ importPreview.sourceFormat }}</span>
            <span v-if="importPreview.truncated">内容已截断</span>
          </div>
          <div v-if="importPreview.warnings.length" class="wiki-import-warnings">
            {{ importPreview.warnings.join('；') }}
          </div>
        </div>
      </div>
      <template #footer>
        <el-button :disabled="importLoading" @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importLoading" :disabled="!importPreview" @click="applyImportPreview">导入为新页面</el-button>
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
import { ArrowDown, ArrowLeft, ArrowRight, DataAnalysis } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { MdPreview } from 'md-editor-v3'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { listUserOptions } from '@/api/access'
import {
  createWikiDirectory,
  importWikiSpacePage,
  createWikiSpacePage,
  deleteWikiSpacePage,
  getWikiDirectoryTree,
  getWikiSpaceDetail,
  getWikiSpacePage,
  listProjectOptions,
  listWikiRelatedPages,
  listWikiSpaceMembers,
  listWikiSpacePageVersions,
  previewWikiImport,
  replaceWikiSpaceMembers,
  restoreWikiSpacePageVersion,
  searchWikiPages,
  semanticSearchWikiPages,
  updateWikiDirectory,
  updateWikiSpace,
  updateWikiSpacePage,
  uploadDocumentAsset,
  uploadWikiImage,
  type WikiDirectoryPayload,
  type WikiSpaceMemberPayloadItem,
  type WikiSpacePagePayload,
  type WikiSpacePayload
} from '@/api/platform'
import type {
  DocumentMarkdownResultItem,
  ProjectItem,
  UserOptionItem,
  WikiDirectoryTreeNodeItem,
  WikiSpaceDetailItem,
  WikiSpaceMemberItem,
  WikiSpacePageDetailItem,
  WikiSpacePageSummaryItem,
  WikiSpacePageVersionItem,
  WikiSpaceSearchResultItem
} from '@/types/platform'

interface FlatRow {
  id: number
  type: 'directory' | 'page'
  depth: number
  label: string
  key: string
  directoryId: number
  content?: string
  slug?: string
  boundProjectName?: string
  version?: number
  hasChildren?: boolean
}

interface DirectoryForm {
  name: string
  content: string
  parentDirectoryId: number | null
  boundProjectId: number | null
}

interface PageForm {
  directoryId: number | null
  parentPageId: number | null
  title: string
  content: string
  changeSummary: string
}

interface SpaceForm {
  name: string
  description: string
  readScope: 'MEMBERS_ONLY' | 'ALL_LOGGED_IN'
  boundProjectId: number | null
  memberDefaultSource: 'MANUAL' | 'PROJECT_MEMBERS'
}

type WikiSearchMode = 'keyword' | 'semantic'

interface WikiSearchPanelItem {
  key: string
  pageId: number
  title: string
  directoryName: string
  updatedAt: string
  snippet: string
  score: number | null
  mode: WikiSearchMode
}

interface WikiSearchState {
  query: string
  results: WikiSearchPanelItem[]
  searched: boolean
  error: string
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
const importLoading = ref(false)
const submitting = ref(false)
const inlineContentSaving = ref(false)
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
const importDialogVisible = ref(false)
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
  readScope: 'MEMBERS_ONLY',
  boundProjectId: null,
  memberDefaultSource: 'MANUAL'
})
const directoryForm = reactive<DirectoryForm>({
  name: '',
  content: '',
  parentDirectoryId: null,
  boundProjectId: null
})
const pageForm = reactive<PageForm>({
  directoryId: null,
  parentPageId: null,
  title: '',
  content: '',
  changeSummary: ''
})
const memberForm = ref<WikiSpaceMemberPayloadItem[]>([])
const importPreview = ref<DocumentMarkdownResultItem | null>(null)
const expandedRowKeys = ref<string[]>([])
const knownExpandableRowKeys = ref<string[]>([])
const pageLoadSequence = ref(0)
const searchMode = ref<WikiSearchMode>('semantic')
const searchPanelVisible = ref(false)
const searchLoading = ref(false)
const keywordSearchState = reactive<WikiSearchState>({
  query: '',
  results: [],
  searched: false,
  error: ''
})
const semanticSearchState = reactive<WikiSearchState>({
  query: '',
  results: [],
  searched: false,
  error: ''
})

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
const inlineContentEditable = computed(() => canEditSpace.value && Boolean(currentPage.value || currentDirectory.value))
const showMemberAction = computed(() => currentDirectory.value?.parentDirectoryId == null)

const flatRows = computed(() => flattenTree(directoryNodes.value))
const visibleRows = computed(() => flattenTree(directoryNodes.value, 0, true))
const pageSelectRows = computed(() => {
  if (pageForm.directoryId == null) {
    return []
  }
  const excludedIds = new Set<number>()
  if (editingPage.value) {
    excludedIds.add(editingPage.value.id)
    for (const descendantId of collectDescendantPageIds(directoryNodes.value, editingPage.value.id)) {
      excludedIds.add(descendantId)
    }
  }
  return flatRows.value.filter(
    (item) => item.type === 'page' && item.directoryId === pageForm.directoryId && !excludedIds.has(item.id)
  )
})
const treeNodeCount = computed(() => flatRows.value.length)
const selectedBranchRowKeys = computed(() => {
  if (currentPage.value) {
    return new Set(collectPageDescendantRowKeys(directoryNodes.value, currentPage.value.id))
  }
  if (currentDirectory.value) {
    return new Set(collectDirectoryDescendantRowKeys(directoryNodes.value, currentDirectory.value.id))
  }
  return new Set<string>()
})
const currentNodeKey = computed(() => {
  if (currentPage.value) {
    return `page-${currentPage.value.id}`
  }
  if (currentDirectory.value) {
    return `directory-${currentDirectory.value.id}`
  }
  return 'empty'
})
const currentNodeTitle = computed(() => currentPage.value?.title || currentDirectory.value?.name || 'Wiki 页面')
const currentNodeRawContent = computed(() => currentPage.value?.content || currentDirectory.value?.content || '')
const currentNodeContent = computed(() => currentNodeRawContent.value || '暂无内容')
const inlineContentDraft = ref('')
const inlineContentPlaceholder = computed(() => currentPage.value ? '开始编写页面正文' : '开始编写目录正文')
const inlineContentDirty = computed(() => inlineContentDraft.value !== currentNodeRawContent.value)
const currentBreadcrumb = computed(() => {
  if (!currentPage.value) {
    if (currentDirectory.value) {
      const directoryPath = resolveDirectoryPath(directoryNodes.value, currentDirectory.value.id)
      return [spaceDetail.value?.name || 'Wiki 空间', ...directoryPath].filter(Boolean).join(' / ')
    }
    return spaceDetail.value?.name || 'Wiki 空间'
  }
  const pagePath = resolvePagePath(directoryNodes.value, currentPage.value.id)
  return [spaceDetail.value?.name || 'Wiki 空间', ...pagePath].filter(Boolean).join(' / ')
})
const activeSearchState = computed(() => searchMode.value === 'semantic' ? semanticSearchState : keywordSearchState)
const activeSearchQuery = computed({
  get: () => activeSearchState.value.query,
  set: (value: string) => {
    activeSearchState.value.query = value
    if (activeSearchState.value.error === '请输入搜索内容') {
      activeSearchState.value.error = ''
    }
  }
})

watch(
  [currentNodeKey, currentNodeRawContent],
  () => {
    inlineContentDraft.value = currentNodeRawContent.value
  },
  { immediate: true }
)
const searchStatusMessage = computed(() => {
  if (searchLoading.value) {
    return '正在搜索当前空间内容...'
  }
  if (activeSearchState.value.error) {
    return activeSearchState.value.error
  }
  if (searchPanelVisible.value || !activeSearchState.value.searched) {
    return ''
  }
  if (!activeSearchState.value.results.length) {
    return '当前空间内没有找到匹配页面'
  }
  return ''
})

watch(
  () => route.params.pageId,
  () => {
    void loadCurrentPage()
  }
)

watch(
  () => route.params.spaceId,
  async (value, previousValue) => {
    if (value === previousValue) {
      return
    }
    resetSearchState()
    currentDirectory.value = null
    currentPage.value = null
    await reloadAll()
  }
)

watch(
  () => pageForm.directoryId,
  () => {
    if (pageForm.parentPageId == null) {
      return
    }
    const exists = pageSelectRows.value.some((item) => item.id === pageForm.parentPageId)
    if (!exists) {
      pageForm.parentPageId = null
    }
  }
)

watch(
  () => spaceForm.boundProjectId,
  (value) => {
    if (!value && spaceForm.memberDefaultSource === 'PROJECT_MEMBERS') {
      spaceForm.memberDefaultSource = 'MANUAL'
    }
  }
)

onMounted(async () => {
  await reloadAll()
})

async function reloadAll() {
  loading.value = true
  try {
    await Promise.all([loadSpaceDetail(), loadDirectoryTree(), loadMembers(), loadProjects()])
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
    syncExpandedRows(directoryNodes.value)
    if (currentDirectory.value) {
      currentDirectory.value = findDirectoryNode(directoryNodes.value, currentDirectory.value.id)
    }
  } finally {
    treeLoading.value = false
  }
}

async function loadMembers() {
  try {
    members.value = await listWikiSpaceMembers(spaceId.value)
  } catch {
    members.value = []
  }
}

async function loadProjects() {
  try {
    projectOptions.value = await listProjectOptions()
  } catch {
    projectOptions.value = []
  }
}

async function loadCurrentPage() {
  const requestSequence = ++pageLoadSequence.value
  if (!pageId.value) {
    if (requestSequence !== pageLoadSequence.value) {
      return
    }
    currentPage.value = null
    if (currentDirectory.value) {
      return
    }
    const firstPage = flatRows.value.find((item) => item.type === 'page')
    if (firstPage) {
      openPage(firstPage.id)
    }
    return
  }
  pageLoading.value = true
  try {
    currentDirectory.value = null
    const detail = await getWikiSpacePage(spaceId.value, pageId.value)
    const relatedPages = await listWikiRelatedPages(spaceId.value, pageId.value)
    if (requestSequence !== pageLoadSequence.value) {
      return
    }
    detail.relatedPages = relatedPages
    currentPage.value = detail
    expandPageAncestors(directoryNodes.value, pageId.value)
  } catch (error: any) {
    if (requestSequence !== pageLoadSequence.value) {
      return
    }
    currentPage.value = null
    ElMessage.error(error?.response?.data?.message || '读取 Wiki 页面失败')
  } finally {
    if (requestSequence === pageLoadSequence.value) {
      pageLoading.value = false
    }
  }
}

function switchSearchMode(mode: WikiSearchMode) {
  searchMode.value = mode
}

async function handleSearch() {
  const state = activeSearchState.value
  const query = state.query.trim()
  state.error = ''
  if (!query) {
    state.results = []
    state.searched = false
    state.error = '请输入搜索内容'
    searchPanelVisible.value = false
    return
  }

  searchLoading.value = true
  searchPanelVisible.value = true
  try {
    if (searchMode.value === 'semantic') {
      const results = await semanticSearchWikiPages({ query, spaceId: spaceId.value })
      state.results = mapSemanticSearchResults(results)
    } else {
      const results = await searchWikiPages({ keyword: query, spaceId: spaceId.value })
      state.results = mapKeywordSearchResults(results)
    }
    state.searched = true
  } catch (error: any) {
    state.results = []
    state.searched = true
    state.error = error?.response?.data?.message || '搜索失败，请稍后重试'
  } finally {
    searchLoading.value = false
  }
}

function clearCurrentSearch() {
  const state = activeSearchState.value
  state.query = ''
  state.results = []
  state.searched = false
  state.error = ''
  if (!keywordSearchState.searched && !semanticSearchState.searched) {
    searchPanelVisible.value = false
  }
}

function backToTree() {
  searchPanelVisible.value = false
}

function resetSearchState() {
  searchPanelVisible.value = false
  searchLoading.value = false
  keywordSearchState.query = ''
  keywordSearchState.results = []
  keywordSearchState.searched = false
  keywordSearchState.error = ''
  semanticSearchState.query = ''
  semanticSearchState.results = []
  semanticSearchState.searched = false
  semanticSearchState.error = ''
}

function mapKeywordSearchResults(results: WikiSpacePageSummaryItem[]): WikiSearchPanelItem[] {
  return results.map((item) => ({
    key: `keyword-${item.id}`,
    pageId: item.id,
    title: item.title,
    directoryName: item.directoryName,
    updatedAt: item.updatedAt,
    snippet: `关键词匹配结果 · ${item.directoryName || '当前目录'}`,
    score: null,
    mode: 'keyword' as WikiSearchMode
  }))
}

function mapSemanticSearchResults(results: WikiSpaceSearchResultItem[]): WikiSearchPanelItem[] {
  return results
    .filter((item) => !isKeywordFallbackSemanticResult(item))
    .map((item) => ({
      key: `semantic-${item.page.id}`,
      pageId: item.page.id,
      title: item.page.title,
      directoryName: item.page.directoryName,
      updatedAt: item.page.updatedAt,
      snippet: item.snippet || '召回结果',
      score: item.score,
      mode: 'semantic' as WikiSearchMode
    }))
}

function isKeywordFallbackSemanticResult(item: WikiSpaceSearchResultItem) {
  return item.score == null && (item.snippet || '').trim() === '关键词匹配结果'
}

function flattenTree(nodes: WikiDirectoryTreeNodeItem[], depth = 0, onlyVisible = false): FlatRow[] {
  const rows: FlatRow[] = []
  for (const node of nodes) {
    const directoryKey = `directory-${node.id}`
    const expanded = isRowExpanded(directoryKey)
    const hasChildren = (node.pages?.length || 0) > 0 || (node.children?.length || 0) > 0
    rows.push({
      id: node.id,
      type: 'directory',
      depth,
      key: directoryKey,
      directoryId: node.id,
      label: node.name,
      content: node.content,
      slug: node.slug,
      boundProjectName: node.boundProjectName || '',
      hasChildren
    })
    if (onlyVisible && hasChildren && !expanded) {
      continue
    }
    rows.push(...flattenPageRows(node.pages || [], depth + 1, onlyVisible, node.id))
    rows.push(...flattenTree(node.children || [], depth + 1, onlyVisible))
  }
  return rows
}

function flattenPageRows(pages: WikiSpacePageSummaryItem[], depth: number, onlyVisible: boolean, directoryId: number): FlatRow[] {
  const rows: FlatRow[] = []
  for (const page of pages) {
    const pageKey = `page-${page.id}`
    const hasChildren = (page.children?.length || 0) > 0
    rows.push({
      id: page.id,
      type: 'page',
      depth,
      key: pageKey,
      directoryId,
      label: page.title,
      version: page.currentVersionNumber,
      hasChildren
    })
    if (onlyVisible && hasChildren && !isRowExpanded(pageKey)) {
      continue
    }
    rows.push(...flattenPageRows(page.children || [], depth + 1, onlyVisible, directoryId))
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

function resolvePagePath(nodes: WikiDirectoryTreeNodeItem[], targetPageId: number, directoryPath: string[] = []): string[] {
  for (const node of nodes) {
    const currentDirectoryPath = [...directoryPath, node.name]
    const pagePath = resolvePagePathFromPages(node.pages || [], targetPageId, currentDirectoryPath)
    if (pagePath.length) {
      return pagePath
    }
    const childPath = resolvePagePath(node.children || [], targetPageId, currentDirectoryPath)
    if (childPath.length) {
      return childPath
    }
  }
  return []
}

function resolvePagePathFromPages(pages: WikiSpacePageSummaryItem[], targetPageId: number, path: string[]): string[] {
  for (const page of pages) {
    const currentPath = [...path, page.title]
    if (page.id === targetPageId) {
      return currentPath
    }
    const childPath = resolvePagePathFromPages(page.children || [], targetPageId, currentPath)
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
  expandRow(`directory-${directoryId}`)
  router.push({ name: 'wiki-space', params: { spaceId: spaceId.value } })
}

function openSpaceDialog() {
  if (!spaceDetail.value) return
  spaceForm.name = spaceDetail.value.name
  spaceForm.description = spaceDetail.value.description
  spaceForm.readScope = spaceDetail.value.readScope as SpaceForm['readScope']
  spaceForm.boundProjectId = spaceDetail.value.boundProjectId ?? null
  spaceForm.memberDefaultSource = (spaceDetail.value.memberDefaultSource as SpaceForm['memberDefaultSource']) || 'MANUAL'
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
      readScope: spaceForm.readScope,
      boundProjectId: spaceForm.boundProjectId,
      memberDefaultSource: spaceForm.memberDefaultSource
    }
    spaceDetail.value = await updateWikiSpace(spaceId.value, payload)
    ElMessage.success('空间信息已更新')
    await loadDirectoryTree()
    await loadCurrentPage()
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
      ElMessage.success('页面已更新')
    } else {
      const createdDirectory = await createWikiDirectory(spaceId.value, payload)
      ElMessage.success('目录已添加')
      await loadDirectoryTree()
      selectDirectory(createdDirectory.id)
    }
    directoryDialogVisible.value = false
    if (editingDirectory.value) {
      await loadDirectoryTree()
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存目录失败')
  } finally {
    submitting.value = false
  }
}

function openPageDialog(page: WikiSpacePageDetailItem | null) {
  if (page) {
    editingPage.value = page
    pageForm.directoryId = page.directoryId
    pageForm.parentPageId = page.parentPageId
    pageForm.title = page.title
    pageForm.content = page.content
    pageForm.changeSummary = ''
  } else {
    editingPage.value = null
    pageForm.directoryId = resolveDefaultDirectoryId()
    pageForm.parentPageId = null
    pageForm.title = ''
    pageForm.content = ''
    pageForm.changeSummary = ''
  }
  pageDialogVisible.value = true
}

function openCreatePageDialog(preset?: { directoryId?: number | null; parentPageId?: number | null }) {
  editingPage.value = null
  pageForm.directoryId = preset?.directoryId ?? resolveDefaultDirectoryId()
  pageForm.parentPageId = preset?.parentPageId ?? null
  pageForm.title = ''
  pageForm.content = ''
  pageForm.changeSummary = ''
  pageDialogVisible.value = true
}

function openImportDialog() {
  importPreview.value = null
  importLoading.value = false
  importDialogVisible.value = true
}

async function handleImportFileChange(fileEvent: any) {
  const rawFile = fileEvent?.raw as File | undefined
  if (!rawFile) {
    return
  }
  importLoading.value = true
  try {
    const asset = await uploadDocumentAsset(rawFile, `wiki-spaces/space-${spaceId.value}`)
    importPreview.value = await previewWikiImport(spaceId.value, asset.id)
    ElMessage.success('导入预览已生成')
  } catch (error: any) {
    importPreview.value = null
    ElMessage.error(error?.response?.data?.message || '生成导入预览失败')
  } finally {
    importLoading.value = false
  }
}

function applyImportPreview() {
  if (!importPreview.value) {
    return
  }
  editingPage.value = null
  pageForm.directoryId = resolveDefaultDirectoryId()
  pageForm.parentPageId = null
  pageForm.title = importPreview.value.suggestedTitle || importPreview.value.fileName
  pageForm.content = importPreview.value.markdown
  pageForm.changeSummary = ''
  importDialogVisible.value = false
  pageDialogVisible.value = true
}

async function handleSubmitPage() {
  const valid = await pageFormRef.value?.validate().catch(() => false)
  if (!valid || pageForm.directoryId == null) return
  submitting.value = true
  try {
    const payload: WikiSpacePagePayload = {
      directoryId: pageForm.directoryId,
      parentPageId: pageForm.parentPageId,
      title: pageForm.title,
      content: pageForm.content,
      changeSummary: pageForm.changeSummary
    }
    const saved = editingPage.value
      ? await updateWikiSpacePage(spaceId.value, editingPage.value.id, payload)
      : importPreview.value
        ? await importWikiSpacePage(spaceId.value, {
            assetId: importPreview.value.assetId,
            directoryId: pageForm.directoryId,
            parentPageId: pageForm.parentPageId,
            title: pageForm.title,
            content: pageForm.content
          })
        : await createWikiSpacePage(spaceId.value, payload)
    ElMessage.success('页面已保存')
    pageDialogVisible.value = false
    importPreview.value = null
    await loadDirectoryTree()
    openPage(saved.id)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存页面失败')
  } finally {
    submitting.value = false
  }
}

async function handleInlineEditorStateChange(editing: boolean) {
  if (editing) {
    return
  }
  await persistInlineContent()
}

// Wiki 正文支持就地编辑，退出编辑态时自动保存当前节点内容。
async function persistInlineContent() {
  if (!inlineContentEditable.value || inlineContentSaving.value || !inlineContentDirty.value) {
    return
  }
  const nodeKey = currentNodeKey.value
  const nextContent = inlineContentDraft.value
  inlineContentSaving.value = true
  try {
    if (currentPage.value) {
      const page = currentPage.value
      const saved = await updateWikiSpacePage(spaceId.value, page.id, {
        directoryId: page.directoryId,
        parentPageId: page.parentPageId,
        title: page.title,
        content: nextContent,
        changeSummary: ''
      })
      saved.relatedPages = page.relatedPages || []
      if (currentNodeKey.value === nodeKey) {
        currentPage.value = saved
      }
    } else if (currentDirectory.value) {
      const directory = currentDirectory.value
      await updateWikiDirectory(spaceId.value, directory.id, {
        name: directory.name,
        content: nextContent,
        parentDirectoryId: directory.parentDirectoryId ?? null,
        boundProjectId: directory.boundProjectId ?? null
      })
      if (currentNodeKey.value === nodeKey) {
        currentDirectory.value = {
          ...directory,
          content: nextContent
        }
      }
    } else {
      return
    }
    await loadDirectoryTree()
    if (currentNodeKey.value === nodeKey) {
      ElMessage.success('正文已保存')
    }
  } catch (error: any) {
    if (currentNodeKey.value === nodeKey) {
      inlineContentDraft.value = currentNodeRawContent.value
    }
    ElMessage.error(error?.response?.data?.message || '保存正文失败')
  } finally {
    inlineContentSaving.value = false
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

function downloadCurrentSource() {
  if (!currentPage.value?.importSource) {
    return
  }
  window.open(`/api/wiki/spaces/${spaceId.value}/pages/${currentPage.value.id}/source/download`, '_blank')
}

function goBack() {
  router.push({ name: 'wiki-home' })
}

function openMemoryFactGraph() {
  router.push({ name: 'wiki-space-memory-fact-graph', params: { spaceId: spaceId.value } })
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

function memberDefaultSourceLabel(source?: string | null) {
  return source === 'PROJECT_MEMBERS' ? '项目成员' : '手动配置'
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

function isRowInSelectedBranch(row: FlatRow) {
  return selectedBranchRowKeys.value.has(row.key)
}

function resolveDefaultDirectoryId() {
  if (currentDirectory.value) {
    return currentDirectory.value.id
  }
  if (currentPage.value) {
    return currentPage.value.directoryId
  }
  return flatRows.value.find((item) => item.type === 'directory')?.id ?? null
}

function isRowExpanded(rowKey: string) {
  return expandedRowKeys.value.includes(rowKey)
}

function toggleRow(rowKey: string) {
  const next = new Set(expandedRowKeys.value)
  if (next.has(rowKey)) {
    next.delete(rowKey)
  } else {
    next.add(rowKey)
  }
  expandedRowKeys.value = [...next]
}

function expandRow(rowKey: string) {
  if (isRowExpanded(rowKey)) {
    return
  }
  expandedRowKeys.value = [...expandedRowKeys.value, rowKey]
}

function syncExpandedRows(nodes: WikiDirectoryTreeNodeItem[]) {
  const nextExpandableRows = collectExpandableRowKeys(nodes)
  if (!knownExpandableRowKeys.value.length) {
    expandedRowKeys.value = nextExpandableRows
    knownExpandableRowKeys.value = nextExpandableRows
    return
  }
  const currentKeys = new Set(expandedRowKeys.value.filter((key) => nextExpandableRows.includes(key)))
  const knownKeys = new Set(knownExpandableRowKeys.value)
  for (const key of nextExpandableRows) {
    if (!knownKeys.has(key)) {
      currentKeys.add(key)
    }
  }
  expandedRowKeys.value = [...currentKeys]
  knownExpandableRowKeys.value = nextExpandableRows
}

function collectExpandableRowKeys(nodes: WikiDirectoryTreeNodeItem[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if ((node.pages?.length || 0) > 0 || (node.children?.length || 0) > 0) {
      keys.push(`directory-${node.id}`)
    }
    keys.push(...collectExpandablePageKeys(node.pages || []))
    keys.push(...collectExpandableRowKeys(node.children || []))
  }
  return keys
}

function collectExpandablePageKeys(pages: WikiSpacePageSummaryItem[]): string[] {
  const keys: string[] = []
  for (const page of pages) {
    if ((page.children?.length || 0) > 0) {
      keys.push(`page-${page.id}`)
      keys.push(...collectExpandablePageKeys(page.children))
    }
  }
  return keys
}

function expandPageAncestors(nodes: WikiDirectoryTreeNodeItem[], targetPageId: number) {
  const ancestors = resolvePageAncestorKeys(nodes, targetPageId)
  if (!ancestors.length) {
    return
  }
  const next = new Set(expandedRowKeys.value)
  for (const key of ancestors) {
    next.add(key)
  }
  expandedRowKeys.value = [...next]
}

function resolvePageAncestorKeys(nodes: WikiDirectoryTreeNodeItem[], targetPageId: number): string[] {
  for (const node of nodes) {
    const pageAncestors = resolvePageAncestorKeysFromPages(node.pages || [], targetPageId, [`directory-${node.id}`])
    if (pageAncestors.length) {
      return pageAncestors
    }
    const childAncestors = resolvePageAncestorKeys(node.children || [], targetPageId)
    if (childAncestors.length) {
      return [`directory-${node.id}`, ...childAncestors]
    }
  }
  return []
}

function resolvePageAncestorKeysFromPages(pages: WikiSpacePageSummaryItem[], targetPageId: number, ancestors: string[]): string[] {
  for (const page of pages) {
    if (page.id === targetPageId) {
      return ancestors
    }
    const childAncestors = resolvePageAncestorKeysFromPages(page.children || [], targetPageId, [...ancestors, `page-${page.id}`])
    if (childAncestors.length) {
      return childAncestors
    }
  }
  return []
}

function collectDescendantPageIds(nodes: WikiDirectoryTreeNodeItem[], pageId: number): number[] {
  for (const node of nodes) {
    const descendants = collectDescendantPageIdsFromPages(node.pages || [], pageId)
    if (descendants.length) {
      return descendants
    }
    const childDescendants = collectDescendantPageIds(node.children || [], pageId)
    if (childDescendants.length) {
      return childDescendants
    }
  }
  return []
}

function collectDescendantPageIdsFromPages(pages: WikiSpacePageSummaryItem[], pageId: number): number[] {
  for (const page of pages) {
    if (page.id === pageId) {
      return flattenChildPageIds(page.children || [])
    }
    const childDescendants = collectDescendantPageIdsFromPages(page.children || [], pageId)
    if (childDescendants.length) {
      return childDescendants
    }
  }
  return []
}

function flattenChildPageIds(pages: WikiSpacePageSummaryItem[]): number[] {
  const ids: number[] = []
  for (const page of pages) {
    ids.push(page.id)
    ids.push(...flattenChildPageIds(page.children || []))
  }
  return ids
}

function collectDirectoryDescendantRowKeys(nodes: WikiDirectoryTreeNodeItem[], directoryId: number): string[] {
  for (const node of nodes) {
    if (node.id === directoryId) {
      return collectDirectoryChildRowKeys(node)
    }
    const childKeys = collectDirectoryDescendantRowKeys(node.children || [], directoryId)
    if (childKeys.length) {
      return childKeys
    }
  }
  return []
}

function collectDirectoryChildRowKeys(node: WikiDirectoryTreeNodeItem): string[] {
  const keys: string[] = []
  for (const childDirectory of node.children || []) {
    keys.push(`directory-${childDirectory.id}`)
    keys.push(...collectDirectoryChildRowKeys(childDirectory))
  }
  keys.push(...collectPageRowKeys(node.pages || []))
  return keys
}

function collectPageDescendantRowKeys(nodes: WikiDirectoryTreeNodeItem[], pageId: number): string[] {
  for (const node of nodes) {
    const pageKeys = collectPageDescendantRowKeysFromPages(node.pages || [], pageId)
    if (pageKeys.length) {
      return pageKeys
    }
    const childKeys = collectPageDescendantRowKeys(node.children || [], pageId)
    if (childKeys.length) {
      return childKeys
    }
  }
  return []
}

function collectPageDescendantRowKeysFromPages(pages: WikiSpacePageSummaryItem[], pageId: number): string[] {
  for (const page of pages) {
    if (page.id === pageId) {
      return collectPageRowKeys(page.children || [])
    }
    const childKeys = collectPageDescendantRowKeysFromPages(page.children || [], pageId)
    if (childKeys.length) {
      return childKeys
    }
  }
  return []
}

function collectPageRowKeys(pages: WikiSpacePageSummaryItem[]): string[] {
  const keys: string[] = []
  for (const page of pages) {
    keys.push(`page-${page.id}`)
    keys.push(...collectPageRowKeys(page.children || []))
  }
  return keys
}
</script>

<style scoped>
.wiki-space-page {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.wiki-shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
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
  min-height: 0;
  padding: 12px;
  overflow: hidden;
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.wiki-back-link .el-icon {
  font-size: 15px;
}

.wiki-back-link:hover {
  color: var(--app-primary);
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

.wiki-space-card-actions-shell {
  margin-top: 12px;
}

.wiki-space-card-actions {
  display: flex;
  flex-wrap: nowrap;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 3px 0 8px;
  overflow-x: auto;
  overflow-y: visible;
  justify-content: flex-start;
  margin: 1px 0 -6px;
  scrollbar-width: none;
}

.wiki-space-card-actions::-webkit-scrollbar {
  display: none;
}

.wiki-space-card-actions :deep(.el-button) {
  flex: 0 0 auto;
  margin-left: 0;
  box-shadow: none;
  transform: none;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  white-space: nowrap;
}

.wiki-space-card-actions :deep(.el-button:hover),
.wiki-space-card-actions :deep(.el-button:focus-visible) {
  box-shadow: none;
  transform: none;
}

.wiki-space-form-hint {
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.wiki-search-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.wiki-search-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.wiki-search-tab {
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.9);
  color: #475569;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  min-height: 34px;
  padding: 0 10px;
}

.wiki-search-tab.active {
  background: linear-gradient(135deg, rgba(var(--app-primary-rgb), 0.95) 0%, rgba(var(--app-primary-container-rgb), 0.78) 100%);
  border-color: rgba(var(--app-primary-rgb), 0.4);
  color: #fffdf9;
}

.wiki-search-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
}

.wiki-search-input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  color: #172033;
  font: inherit;
  font-size: 13px;
  padding: 0 12px;
}

.wiki-search-input:focus {
  outline: 2px solid rgba(var(--app-primary-rgb), 0.16);
  border-color: rgba(var(--app-primary-rgb), 0.4);
}

.wiki-search-action {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: rgba(var(--app-primary-rgb), 0.9);
  color: #fffdf9;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.wiki-search-action.ghost {
  background: rgba(243, 244, 245, 0.92);
  color: #516072;
}

.wiki-search-status {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.wiki-search-status.error {
  color: #b42318;
}

.wiki-tree-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.wiki-tree-toolbar {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 10px;
}

.wiki-tree-create-button {
  min-width: 84px;
}

.wiki-search-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.wiki-search-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.wiki-search-panel-meta {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.wiki-search-loading,
.wiki-search-placeholder {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.wiki-search-placeholder {
  padding: 6px 2px 0;
}

.wiki-search-placeholder p {
  margin: 0;
}

.wiki-search-results {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
}

.wiki-search-result-card {
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.92);
  color: #172033;
  cursor: pointer;
  font: inherit;
  padding: 10px 12px;
  text-align: left;
}

.wiki-search-result-card.active {
  border-color: rgba(var(--app-primary-rgb), 0.36);
  background: rgba(var(--app-primary-container-rgb), 0.14);
}

.wiki-search-result-head,
.wiki-search-result-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wiki-search-result-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.wiki-search-result-score {
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.wiki-search-result-meta {
  margin-top: 6px;
  color: #64748b;
  font-size: 11px;
}

.wiki-search-result-snippet {
  margin: 8px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.wiki-search-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
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
  background: rgba(248, 250, 252, 0.9);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  color: #334155;
  padding: 8px 10px;
}

.wiki-tree-row.active {
  background: linear-gradient(135deg, rgba(var(--app-primary-rgb), 0.92) 0%, rgba(var(--app-primary-container-rgb), 0.82) 100%);
  color: #fffdf9;
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.08);
}

.wiki-tree-row.branch-active {
  background: rgba(var(--app-primary-container-rgb), 0.12);
  color: var(--app-text);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.08);
}

.wiki-tree-row.branch-active::before {
  content: '';
  width: 3px;
  align-self: stretch;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.45);
}

.wiki-tree-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.wiki-tree-toggle,
.wiki-tree-link {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.wiki-tree-toggle {
  width: 22px;
  height: 22px;
  min-width: 22px;
  padding: 0;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.82);
  color: #475569;
  cursor: pointer;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.wiki-tree-toggle.placeholder {
  background: transparent;
  color: transparent;
  cursor: default;
}

.wiki-tree-toggle:not(.placeholder):hover {
  background: rgba(var(--app-primary-container-rgb), 0.18);
  color: var(--app-primary);
  transform: scale(1.05);
}

.wiki-tree-row.active .wiki-tree-toggle:not(.placeholder) {
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.96);
}

.wiki-tree-row.branch-active .wiki-tree-toggle:not(.placeholder) {
  background: rgba(var(--app-primary-container-rgb), 0.16);
  color: var(--app-primary);
}

.wiki-tree-toggle-icon {
  font-size: 12px;
}

.wiki-tree-link {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.tree-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wiki-workbench {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 18px 18px;
  overflow: hidden;
}

.wiki-content-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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

.wiki-page-meta-saving {
  color: var(--app-primary);
  font-weight: 700;
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
  overflow: auto;
}

.wiki-article-body.is-inline-editable {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wiki-article-body.is-inline-editable :deep(.markdown-editor-wrapper) {
  flex: 1 1 auto;
  min-height: 0;
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

  .wiki-search-bar {
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
