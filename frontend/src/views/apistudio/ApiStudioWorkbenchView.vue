<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Connection,
  Delete,
  Document,
  Edit,
  FolderOpened,
  Plus,
  Promotion,
  RefreshRight,
  Search,
  Setting
} from '@element-plus/icons-vue'
import { useApiStudioStore } from '@/stores/apiStudio'
import type {
  ApiStudioDirectoryItem,
  ApiStudioEndpointPayload,
  ApiStudioMethod,
  ApiStudioTreeNode,
  ApiStudioDebugExecutionPayload
} from '@/types/api-studio'

// 原生 API 工作台 - 项目级三栏工作区。
// 左：目录树 + API 列表；中：编辑器；右/下：调试与响应。
// 设计文档：docs/api-studio-native-technical-design-v1.md 第 9 节。
// UI 风格参考 ProjectView / TestPlanView，复用 management-list-* 全局设计系统。

const route = useRoute()
const router = useRouter()
const store = useApiStudioStore()

const projectId = computed(() => Number(route.params.projectId))
const endpointIdFromRoute = computed(() => {
  const id = route.params.endpointId
  return id ? Number(id) : null
})

const newDirDialog = ref(false)
const newDirForm = ref<{ name: string; description: string; parentId: number | null }>({
  name: '',
  description: '',
  parentId: null
})

const newEndpointDialog = ref(false)
const newEndpointForm = ref<ApiStudioEndpointPayload>({
  name: '',
  method: 'GET',
  path: '/',
  directoryId: null,
  status: 'DRAFT',
  requestBodyType: 'NONE',
  parameters: [],
  responses: [{ statusCode: 200, contentType: 'application/json' }]
})

const envManagerVisible = ref(false)
const editingEnvironment = ref<number | null>(null)
const environmentForm = ref({
  name: '',
  baseUrl: '',
  authType: 'NONE' as 'NONE' | 'BEARER' | 'API_KEY',
  authConfigJson: '',
  isDefault: false,
  variablesText: ''
})

const debugForm = ref<{
  pathOverrides: Record<string, string>
  queryOverrides: Record<string, string>
  headerOverrides: Record<string, string>
  requestBody: string
}>({
  pathOverrides: {},
  queryOverrides: {},
  headerOverrides: {},
  requestBody: ''
})

const activeEditorTab = ref<'basic' | 'params' | 'body' | 'responses' | 'debug' | 'versions'>('basic')

const methodOptions: ApiStudioMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const statusOptions = ['DRAFT', 'PUBLISHED', 'DEPRECATED'] as const
const bodyTypeOptions = ['NONE', 'JSON', 'FORM_DATA', 'FORM_URLENCODED', 'RAW_TEXT'] as const
const paramLocationOptions = ['PATH', 'QUERY', 'HEADER', 'FORM_DATA', 'FORM_URLENCODED'] as const
const dataTypeOptions = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'FILE'] as const

const methodColor = (m: string) => {
  const map: Record<string, string> = {
    GET: '#67c23a',
    POST: '#409eff',
    PUT: '#e6a23c',
    PATCH: '#909399',
    DELETE: '#f56c6c'
  }
  return map[m] || '#909399'
}

const flatNodes = computed(() => {
  if (!store.tree) return []
  const flat: Array<{ depth: number; node: ApiStudioTreeNode }> = []
  const walk = (nodes: ApiStudioTreeNode[], depth: number) => {
    for (const node of nodes) {
      flat.push({ depth, node })
      walk(node.children, depth + 1)
    }
  }
  walk(store.tree.nodes, 0)
  return flat
})

const treeKeyword = ref('')

const matchKeyword = (text?: string | null) => {
  if (!treeKeyword.value.trim()) return true
  return (text ?? '').toLowerCase().includes(treeKeyword.value.trim().toLowerCase())
}

const filteredRootEndpoints = computed(() => {
  const list = store.tree?.rootEndpoints ?? []
  if (!treeKeyword.value.trim()) return list
  return list.filter((ep) => matchKeyword(ep.name) || matchKeyword(ep.path))
})

const filterEndpointsOf = (node: ApiStudioTreeNode) => {
  if (!treeKeyword.value.trim()) return node.endpoints
  return node.endpoints.filter((ep) => matchKeyword(ep.name) || matchKeyword(ep.path))
}

const statusTone = (status?: string) => {
  switch (status) {
    case 'PUBLISHED':
      return 'success'
    case 'DEPRECATED':
      return 'neutral'
    case 'DRAFT':
    default:
      return 'warning'
  }
}

const statusLabel = (status?: string) => {
  if (status === 'PUBLISHED') return '已发布'
  if (status === 'DEPRECATED') return '已废弃'
  return '草稿'
}

// ========== 初始化 ==========

const init = async () => {
  store.setProject(projectId.value)
  await Promise.all([store.refreshOverview(), store.refreshTree(), store.refreshEnvironments()])
  if (endpointIdFromRoute.value) {
    await selectEndpoint(endpointIdFromRoute.value)
  }
}

watch(projectId, () => init(), { immediate: false })
watch(endpointIdFromRoute, (id) => {
  if (id && store.currentEndpoint?.id !== id) {
    selectEndpoint(id)
  }
})

onMounted(init)

// ========== 选择 API ==========

const selectEndpoint = async (endpointId: number) => {
  await store.loadEndpoint(endpointId)
  await store.refreshVersions(endpointId)
  if (route.params.endpointId !== String(endpointId)) {
    router.replace({ name: 'api-studio-endpoint', params: { projectId: projectId.value, endpointId } })
  }
}

// ========== 目录 CRUD ==========

const openNewDir = (parentId: number | null) => {
  newDirForm.value = { name: '', description: '', parentId }
  newDirDialog.value = true
}

const submitNewDir = async () => {
  if (!newDirForm.value.name.trim()) {
    ElMessage.warning('请输入目录名称')
    return
  }
  try {
    await store.createDirectory({
      parentId: newDirForm.value.parentId,
      name: newDirForm.value.name.trim(),
      description: newDirForm.value.description.trim() || null
    })
    ElMessage.success('目录已创建')
    newDirDialog.value = false
  } catch (e: any) {
    ElMessage.error('创建目录失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

const deleteDir = async (dir: ApiStudioDirectoryItem) => {
  await ElMessageBox.confirm(`确认删除目录 "${dir.name}"？目录必须为空`, '删除目录', { type: 'warning' })
  try {
    await store.removeDirectory(dir.id)
    ElMessage.success('目录已删除')
  } catch (e: any) {
    ElMessage.error('删除目录失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

// ========== API CRUD ==========

const openNewEndpoint = (directoryId: number | null) => {
  newEndpointForm.value = {
    name: '',
    method: 'GET',
    path: '/',
    directoryId,
    status: 'DRAFT',
    requestBodyType: 'NONE',
    parameters: [],
    responses: [{ statusCode: 200, contentType: 'application/json' }]
  }
  newEndpointDialog.value = true
}

const submitNewEndpoint = async () => {
  if (!newEndpointForm.value.name.trim()) {
    ElMessage.warning('请输入 API 名称')
    return
  }
  try {
    const created = await store.createEndpoint(newEndpointForm.value)
    newEndpointDialog.value = false
    await selectEndpoint(created.id)
    ElMessage.success('API 已创建')
  } catch (e: any) {
    ElMessage.error('创建 API 失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

const saveCurrent = async () => {
  if (!store.currentEndpoint) return
  const ep = store.currentEndpoint
  const payload: ApiStudioEndpointPayload = {
    directoryId: ep.directoryId,
    name: ep.name,
    method: ep.method,
    path: ep.path,
    summary: ep.summary,
    descriptionMarkdown: ep.descriptionMarkdown,
    status: ep.status,
    requestBodyType: ep.requestBodyType,
    requestBodySchemaJson: ep.requestBodySchemaJson,
    requestBodyExample: ep.requestBodyExample,
    revision: ep.revision,
    parameters: ep.parameters,
    responses: ep.responses,
    changeSummary: 'Manual save'
  }
  try {
    await store.saveEndpoint(ep.id, payload)
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

const removeCurrent = async () => {
  if (!store.currentEndpoint) return
  await ElMessageBox.confirm(`确认删除 API "${store.currentEndpoint.name}"？此操作不可恢复`, '删除 API', { type: 'warning' })
  await store.removeEndpoint(store.currentEndpoint.id)
  ElMessage.success('API 已删除')
}

const publishCurrent = async () => {
  if (!store.currentEndpoint) return
  try {
    await store.publishEndpoint(store.currentEndpoint.id)
    ElMessage.success('已发布')
  } catch (e: any) {
    ElMessage.error('发布失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

const deprecateCurrent = async () => {
  if (!store.currentEndpoint) return
  await store.deprecateEndpoint(store.currentEndpoint.id)
  ElMessage.success('已标记废弃')
}

// ========== 参数操作 ==========

const addParameter = (location: 'PATH' | 'QUERY' | 'HEADER' | 'FORM_DATA' | 'FORM_URLENCODED' = 'QUERY') => {
  if (!store.currentEndpoint) return
  store.currentEndpoint.parameters.push({
    location,
    name: '',
    dataType: 'STRING',
    required: false
  })
}

const removeParameter = (index: number) => {
  if (!store.currentEndpoint) return
  store.currentEndpoint.parameters.splice(index, 1)
}

// ========== 响应操作 ==========

const addResponse = () => {
  if (!store.currentEndpoint) return
  store.currentEndpoint.responses.push({
    statusCode: 200,
    contentType: 'application/json'
  })
}

const removeResponse = (index: number) => {
  if (!store.currentEndpoint) return
  store.currentEndpoint.responses.splice(index, 1)
}

// ========== 环境管理 ==========

const openEnvironments = () => {
  envManagerVisible.value = true
  editingEnvironment.value = null
  resetEnvForm()
}

const resetEnvForm = () => {
  environmentForm.value = {
    name: '',
    baseUrl: '',
    authType: 'NONE',
    authConfigJson: '',
    isDefault: false,
    variablesText: ''
  }
}

const editEnvironment = (env: { id: number; name: string; baseUrl: string; authType: string; authConfigJson: string | null; isDefault: boolean; variables: Array<{ name: string; value: string | null }> }) => {
  editingEnvironment.value = env.id
  environmentForm.value = {
    name: env.name,
    baseUrl: env.baseUrl,
    authType: env.authType as 'NONE' | 'BEARER' | 'API_KEY',
    authConfigJson: env.authConfigJson ?? '',
    isDefault: env.isDefault,
    variablesText: env.variables.map((v) => `${v.name}=${v.value ?? ''}`).join('\n')
  }
}

const submitEnvironment = async () => {
  if (!environmentForm.value.name.trim() || !environmentForm.value.baseUrl.trim()) {
    ElMessage.warning('请填写名称和 baseUrl')
    return
  }
  const variables = environmentForm.value.variablesText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=')
      return {
        name: line.slice(0, idx).trim(),
        value: line.slice(idx + 1),
        secret: false
      }
    })
  const payload = {
    name: environmentForm.value.name.trim(),
    baseUrl: environmentForm.value.baseUrl.trim(),
    authType: environmentForm.value.authType,
    authConfigJson: environmentForm.value.authConfigJson.trim() || null,
    isDefault: environmentForm.value.isDefault,
    variables
  }
  try {
    if (editingEnvironment.value) {
      await store.updateEnvironment(editingEnvironment.value, payload)
    } else {
      await store.createEnvironment(payload)
    }
    ElMessage.success('环境已保存')
    editingEnvironment.value = null
    resetEnvForm()
  } catch (e: any) {
    ElMessage.error('保存环境失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

const removeEnvironment = async (envId: number) => {
  await ElMessageBox.confirm('确认删除该环境？', '删除环境', { type: 'warning' })
  await store.removeEnvironment(envId)
  ElMessage.success('已删除')
}

const setEnvDefault = async (envId: number) => {
  await store.setDefaultEnvironment(envId)
  ElMessage.success('已设为默认环境')
}

// ========== 调试 ==========

const runDebug = async () => {
  if (!store.currentEndpoint) return
  if (!store.selectedEnvironmentId) {
    ElMessage.warning('请选择调试环境')
    return
  }
  const payload: ApiStudioDebugExecutionPayload = {
    environmentId: store.selectedEnvironmentId,
    pathOverrides: debugForm.value.pathOverrides,
    queryOverrides: debugForm.value.queryOverrides,
    headerOverrides: debugForm.value.headerOverrides,
    requestBody: debugForm.value.requestBody || undefined
  }
  try {
    await store.debug(store.currentEndpoint.id, payload)
    await store.refreshDebugRecords(store.currentEndpoint.id)
    ElMessage.success(store.debugResult?.success ? '调试成功' : '调试已完成（响应非 2xx/3xx）')
  } catch (e: any) {
    ElMessage.error('调试失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

// ========== 版本 ==========

const rollbackTo = async (versionId: number) => {
  if (!store.currentEndpoint) return
  await ElMessageBox.confirm('确认回滚到此版本？将以该快照创建一个新版本作为当前版本', '回滚', { type: 'warning' })
  try {
    await store.rollbackVersion(store.currentEndpoint.id, versionId)
    ElMessage.success('已回滚')
  } catch (e: any) {
    ElMessage.error('回滚失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

const backToHome = () => router.push({ name: 'api-studio-home' })
</script>

<template>
  <div class="api-studio-workbench">
    <!-- 顶部工具栏 -->
    <section class="management-list-toolbar api-studio-workbench-toolbar">
      <div class="management-list-toolbar-main">
        <button class="management-list-toolbar-button" type="button" @click="backToHome">
          <el-icon><ArrowLeft /></el-icon>
          <span>项目列表</span>
        </button>

        <span class="management-list-toolbar-divider" aria-hidden="true"></span>

        <div class="api-studio-workbench-title">
          <span class="api-studio-workbench-kicker">API 工作台</span>
          <div v-if="store.overview" class="api-studio-workbench-meta">
            <span class="management-list-chip">目录 {{ store.overview.directoryCount }}</span>
            <span class="management-list-chip">API {{ store.overview.endpointCount }}</span>
            <span class="management-list-chip">环境 {{ store.overview.environmentCount }}</span>
            <span v-if="store.overview.defaultEnvironmentName" class="management-list-pill success">
              默认 {{ store.overview.defaultEnvironmentName }}
            </span>
          </div>
        </div>
      </div>

      <div class="management-list-toolbar-side">
        <el-select
          v-model="store.selectedEnvironmentId"
          placeholder="选择调试环境"
          clearable
          size="default"
          class="api-studio-env-select"
        >
          <el-option
            v-for="env in store.environments"
            :key="env.id"
            :label="env.name + (env.isDefault ? ' (默认)' : '')"
            :value="env.id"
          />
        </el-select>
        <button class="management-list-toolbar-button" type="button" @click="openEnvironments">
          <el-icon><Setting /></el-icon>
          <span>环境管理</span>
        </button>
      </div>
    </section>

    <div class="api-studio-workbench-body">
      <!-- 左侧目录树 -->
      <aside class="api-studio-tree-shell" v-loading="store.treeLoading">
        <header class="api-studio-tree-header">
          <div class="api-studio-tree-header-title">
            <el-icon><FolderOpened /></el-icon>
            <span>目录与 API</span>
          </div>
          <div class="api-studio-tree-header-actions">
            <button class="management-list-toolbar-button" type="button" @click="openNewDir(null)">
              <el-icon><Plus /></el-icon>
              <span>目录</span>
            </button>
            <button class="management-list-create-button api-studio-tree-create" type="button" @click="openNewEndpoint(null)">
              <el-icon><Plus /></el-icon>
              <span>新建 API</span>
            </button>
          </div>
        </header>

        <div class="api-studio-tree-search">
          <div class="management-list-search-shell">
            <el-icon class="management-list-search-icon"><Search /></el-icon>
            <input
              v-model="treeKeyword"
              class="management-list-search-input"
              type="text"
              placeholder="搜索 API 名称或路径"
            />
          </div>
        </div>

        <div class="api-studio-tree-area">
          <!-- 根级 API -->
          <div
            v-for="ep in filteredRootEndpoints"
            :key="'root-ep-' + ep.id"
            class="api-studio-endpoint-row"
            :class="{ active: store.currentEndpoint?.id === ep.id }"
            @click="selectEndpoint(ep.id)"
          >
            <span class="api-studio-method-badge" :style="{ background: methodColor(ep.method) }">{{ ep.method }}</span>
            <span class="api-studio-endpoint-name">{{ ep.name }}</span>
            <span class="api-studio-endpoint-path">{{ ep.path }}</span>
          </div>

          <!-- 目录递归 -->
          <div v-for="entry in flatNodes" :key="'dir-' + entry.node.directory.id" class="api-studio-dir-block">
            <div class="api-studio-dir-row" :style="{ paddingLeft: 12 + entry.depth * 16 + 'px' }">
              <el-icon class="api-studio-dir-icon"><FolderOpened /></el-icon>
              <span class="api-studio-dir-name">{{ entry.node.directory.name }}</span>
              <span class="api-studio-dir-count">{{ entry.node.endpoints.length }}</span>
              <span class="api-studio-dir-actions">
                <button
                  class="api-studio-icon-button"
                  type="button"
                  title="新建 API"
                  @click.stop="openNewEndpoint(entry.node.directory.id)"
                >
                  <el-icon><Plus /></el-icon>
                </button>
                <button
                  class="api-studio-icon-button"
                  type="button"
                  title="新建子目录"
                  @click.stop="openNewDir(entry.node.directory.id)"
                >
                  <el-icon><FolderOpened /></el-icon>
                </button>
                <button
                  class="api-studio-icon-button danger"
                  type="button"
                  title="删除目录"
                  @click.stop="deleteDir(entry.node.directory)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </span>
            </div>
            <div
              v-for="ep in filterEndpointsOf(entry.node)"
              :key="'ep-' + ep.id"
              class="api-studio-endpoint-row"
              :class="{ active: store.currentEndpoint?.id === ep.id }"
              :style="{ paddingLeft: 30 + entry.depth * 16 + 'px' }"
              @click="selectEndpoint(ep.id)"
            >
              <span class="api-studio-method-badge" :style="{ background: methodColor(ep.method) }">{{ ep.method }}</span>
              <span class="api-studio-endpoint-name">{{ ep.name }}</span>
              <span class="api-studio-endpoint-path">{{ ep.path }}</span>
            </div>
          </div>

          <div
            v-if="!store.treeLoading && filteredRootEndpoints.length === 0 && flatNodes.length === 0"
            class="api-studio-tree-empty"
          >
            <el-empty
              :image-size="64"
              description="尚无目录或 API"
            />
          </div>
        </div>
      </aside>

      <!-- 中间编辑器 -->
      <main class="api-studio-editor-shell" v-loading="store.endpointLoading">
        <div v-if="!store.currentEndpoint" class="api-studio-editor-empty">
          <el-empty description="请选择左侧 API 或点击右上角按钮创建新接口" />
        </div>

        <template v-else>
          <header class="api-studio-editor-header">
            <div class="api-studio-editor-title">
              <span class="api-studio-method-badge large" :style="{ background: methodColor(store.currentEndpoint.method) }">
                {{ store.currentEndpoint.method }}
              </span>
              <div class="api-studio-editor-title-copy">
                <h2>{{ store.currentEndpoint.name || '未命名 API' }}</h2>
                <span class="api-studio-editor-path">{{ store.currentEndpoint.path }}</span>
              </div>
              <span class="management-list-pill" :class="statusTone(store.currentEndpoint.status)">
                {{ statusLabel(store.currentEndpoint.status) }}
              </span>
            </div>
            <div class="api-studio-editor-actions">
              <button class="management-list-toolbar-button" type="button" @click="publishCurrent" :disabled="store.currentEndpoint.status === 'PUBLISHED'">
                <el-icon><Promotion /></el-icon>
                <span>发布</span>
              </button>
              <button class="management-list-toolbar-button" type="button" @click="deprecateCurrent" :disabled="store.currentEndpoint.status === 'DEPRECATED'">
                <el-icon><RefreshRight /></el-icon>
                <span>废弃</span>
              </button>
              <button class="management-list-toolbar-button danger" type="button" @click="removeCurrent">
                <el-icon><Delete /></el-icon>
                <span>删除</span>
              </button>
              <button class="management-list-create-button" type="button" @click="saveCurrent">
                <el-icon><Edit /></el-icon>
                <span>保存</span>
              </button>
            </div>
          </header>

          <el-tabs v-model="activeEditorTab" class="api-studio-editor-tabs">
            <el-tab-pane label="基础信息" name="basic">
              <div class="api-studio-form-card">
                <el-form label-width="120px" class="api-studio-editor-form">
                  <el-form-item label="名称">
                    <el-input v-model="store.currentEndpoint.name" />
                  </el-form-item>
                  <el-form-item label="方法">
                    <el-select v-model="store.currentEndpoint.method" style="width: 160px">
                      <el-option v-for="m in methodOptions" :key="m" :label="m" :value="m" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="路径">
                    <el-input v-model="store.currentEndpoint.path" placeholder="/users/{id}" />
                  </el-form-item>
                  <el-form-item label="状态">
                    <el-select v-model="store.currentEndpoint.status" style="width: 200px">
                      <el-option v-for="s in statusOptions" :key="s" :label="statusLabel(s)" :value="s" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="摘要">
                    <el-input v-model="store.currentEndpoint.summary" placeholder="一句话描述这个接口的用途" />
                  </el-form-item>
                  <el-form-item label="详细说明">
                    <el-input v-model="store.currentEndpoint.descriptionMarkdown" type="textarea" :rows="6" placeholder="Markdown 描述" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane label="参数" name="params">
              <div class="api-studio-form-card">
                <div class="api-studio-section-toolbar">
                  <span class="api-studio-section-title">请求参数</span>
                  <div class="api-studio-section-actions">
                    <button class="management-list-toolbar-button" type="button" @click="addParameter('PATH')">
                      <el-icon><Plus /></el-icon><span>Path</span>
                    </button>
                    <button class="management-list-toolbar-button" type="button" @click="addParameter('QUERY')">
                      <el-icon><Plus /></el-icon><span>Query</span>
                    </button>
                    <button class="management-list-toolbar-button" type="button" @click="addParameter('HEADER')">
                      <el-icon><Plus /></el-icon><span>Header</span>
                    </button>
                  </div>
                </div>
                <el-table :data="store.currentEndpoint.parameters" size="small" class="api-studio-inline-table">
                  <el-table-column label="位置" width="130">
                    <template #default="{ row }">
                      <el-select v-model="row.location" size="small">
                        <el-option v-for="l in paramLocationOptions" :key="l" :label="l" :value="l" />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column label="名称" min-width="160">
                    <template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
                  </el-table-column>
                  <el-table-column label="类型" width="130">
                    <template #default="{ row }">
                      <el-select v-model="row.dataType" size="small">
                        <el-option v-for="t in dataTypeOptions" :key="t" :label="t" :value="t" />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column label="必填" width="80" align="center">
                    <template #default="{ row }"><el-checkbox v-model="row.required" /></template>
                  </el-table-column>
                  <el-table-column label="示例值" min-width="160">
                    <template #default="{ row }"><el-input v-model="row.exampleValue" size="small" /></template>
                  </el-table-column>
                  <el-table-column label="说明" min-width="180">
                    <template #default="{ row }"><el-input v-model="row.description" size="small" /></template>
                  </el-table-column>
                  <el-table-column width="80" align="center">
                    <template #default="{ $index }">
                      <button class="api-studio-icon-button danger" type="button" title="删除" @click="removeParameter($index)">
                        <el-icon><Delete /></el-icon>
                      </button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </el-tab-pane>

            <el-tab-pane label="Body" name="body">
              <div class="api-studio-form-card">
                <el-form label-width="120px">
                  <el-form-item label="Body 类型">
                    <el-select v-model="store.currentEndpoint.requestBodyType" style="width: 220px">
                      <el-option v-for="t in bodyTypeOptions" :key="t" :label="t" :value="t" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Body 示例">
                    <el-input v-model="store.currentEndpoint.requestBodyExample" type="textarea" :rows="10" placeholder="例如 JSON 请求体示例" />
                  </el-form-item>
                  <el-form-item label="结构 (JSON)">
                    <el-input v-model="store.currentEndpoint.requestBodySchemaJson" type="textarea" :rows="6" placeholder="可选：保存 JSON Schema 或结构化字段树" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane label="响应" name="responses">
              <div class="api-studio-form-card">
                <div class="api-studio-section-toolbar">
                  <span class="api-studio-section-title">响应定义</span>
                  <div class="api-studio-section-actions">
                    <button class="management-list-toolbar-button" type="button" @click="addResponse">
                      <el-icon><Plus /></el-icon><span>新增响应</span>
                    </button>
                  </div>
                </div>
                <div
                  v-for="(resp, idx) in store.currentEndpoint.responses"
                  :key="idx"
                  class="api-studio-response-block"
                >
                  <div class="api-studio-response-head">
                    <span class="api-studio-section-subtitle">状态码</span>
                    <el-input-number v-model="resp.statusCode" :min="100" :max="599" size="small" />
                    <span class="api-studio-section-subtitle">Content-Type</span>
                    <el-input v-model="resp.contentType" size="small" style="width: 220px" />
                    <button class="api-studio-icon-button danger" type="button" title="删除响应" @click="removeResponse(idx)">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
                  <el-input v-model="resp.description" placeholder="响应说明" size="small" style="margin-bottom: 8px" />
                  <el-input v-model="resp.exampleBody" type="textarea" :rows="6" placeholder="响应示例 JSON" />
                </div>
                <el-empty v-if="!store.currentEndpoint.responses.length" :image-size="64" description="尚未定义响应" />
              </div>
            </el-tab-pane>

            <el-tab-pane label="调试" name="debug">
              <div class="api-studio-form-card">
                <el-alert
                  type="info"
                  :closable="false"
                  show-icon
                  class="api-studio-debug-hint"
                >
                  调试请求由平台后端代理发出，仅允许访问所选环境 baseUrl 同源目标。
                </el-alert>
                <el-form label-width="120px">
                  <el-form-item label="环境">
                    <el-select v-model="store.selectedEnvironmentId" style="width: 320px" placeholder="选择环境">
                      <el-option
                        v-for="env in store.environments"
                        :key="env.id"
                        :label="env.name + ' · ' + env.baseUrl"
                        :value="env.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="临时 Body">
                    <el-input
                      v-model="debugForm.requestBody"
                      type="textarea"
                      :rows="6"
                      placeholder="临时覆盖请求体（留空则使用 API 定义中的示例）"
                    />
                  </el-form-item>
                </el-form>
                <button
                  class="management-list-create-button api-studio-debug-run"
                  type="button"
                  :disabled="store.debugRunning"
                  @click="runDebug"
                >
                  <el-icon><Connection /></el-icon>
                  <span>{{ store.debugRunning ? '发送中...' : '发送请求' }}</span>
                </button>

                <div v-if="store.debugResult" class="api-studio-debug-result">
                  <div class="api-studio-debug-result-head">
                    <span class="management-list-pill" :class="store.debugResult.success ? 'success' : 'danger'">
                      {{ store.debugResult.statusCode ?? 'ERR' }}
                    </span>
                    <span class="api-studio-debug-meta">{{ store.debugResult.durationMillis }} ms</span>
                    <span class="api-studio-debug-meta">{{ store.debugResult.responseBytes }} bytes</span>
                    <span v-if="store.debugResult.responseTruncated" class="management-list-pill warning">已截断</span>
                  </div>
                  <div v-if="store.debugResult.errorMessage" class="api-studio-debug-error">
                    {{ store.debugResult.errorMessage }}
                  </div>
                  <div class="api-studio-debug-url">{{ store.debugResult.finalUrl }}</div>
                  <el-input
                    :model-value="store.debugResult.responseBody"
                    type="textarea"
                    :rows="14"
                    readonly
                  />
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="版本" name="versions">
              <div class="api-studio-form-card">
                <el-table :data="store.versions" size="small" class="api-studio-inline-table" v-loading="store.versionsLoading">
                  <el-table-column prop="versionNo" label="版本" width="80" />
                  <el-table-column prop="changeType" label="类型" width="140" />
                  <el-table-column prop="changeSummary" label="说明" min-width="240" />
                  <el-table-column prop="createdAt" label="时间" width="200" />
                  <el-table-column label="操作" width="100" align="center">
                    <template #default="{ row }">
                      <button class="api-studio-icon-button primary" type="button" title="回滚到该版本" @click="rollbackTo(row.id)">
                        <el-icon><RefreshRight /></el-icon>
                      </button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!store.versions.length" :image-size="64" description="尚无版本快照" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </main>
    </div>

    <!-- 新建目录对话框 -->
    <el-dialog v-model="newDirDialog" title="新建目录" width="480px" class="platform-form-dialog">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="newDirForm.name" placeholder="目录名" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="newDirForm.description" type="textarea" :rows="3" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newDirDialog = false">取消</el-button>
        <el-button type="primary" @click="submitNewDir">创建</el-button>
      </template>
    </el-dialog>

    <!-- 新建 API 对话框 -->
    <el-dialog v-model="newEndpointDialog" title="新建 API" width="560px" class="platform-form-dialog">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="newEndpointForm.name" placeholder="例如：查询用户详情" /></el-form-item>
        <el-form-item label="方法">
          <el-select v-model="newEndpointForm.method" style="width: 160px">
            <el-option v-for="m in methodOptions" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="路径"><el-input v-model="newEndpointForm.path" placeholder="/users/{id}" /></el-form-item>
        <el-form-item label="摘要"><el-input v-model="newEndpointForm.summary" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newEndpointDialog = false">取消</el-button>
        <el-button type="primary" @click="submitNewEndpoint">创建</el-button>
      </template>
    </el-dialog>

    <!-- 环境管理抽屉 -->
    <el-drawer v-model="envManagerVisible" title="环境管理" size="680px">
      <div class="api-studio-env-layout">
        <section class="api-studio-env-list-section">
          <header class="api-studio-section-toolbar">
            <span class="api-studio-section-title">已配置环境</span>
            <span class="api-studio-section-subtitle">{{ store.environments.length }} 个</span>
          </header>
          <div v-for="env in store.environments" :key="env.id" class="api-studio-env-item">
            <div class="api-studio-env-item-main">
              <div class="api-studio-env-name-line">
                <strong>{{ env.name }}</strong>
                <span v-if="env.isDefault" class="management-list-pill success">默认</span>
              </div>
              <div class="api-studio-env-meta">{{ env.baseUrl }} · auth {{ env.authType }}</div>
            </div>
            <div class="api-studio-env-item-actions">
              <button class="management-list-toolbar-button" type="button" @click="editEnvironment(env)">
                <el-icon><Edit /></el-icon><span>编辑</span>
              </button>
              <button class="management-list-toolbar-button" type="button" :disabled="env.isDefault" @click="setEnvDefault(env.id)">
                <span>{{ env.isDefault ? '已是默认' : '设为默认' }}</span>
              </button>
              <button class="management-list-toolbar-button danger" type="button" @click="removeEnvironment(env.id)">
                <el-icon><Delete /></el-icon><span>删除</span>
              </button>
            </div>
          </div>
          <el-empty v-if="store.environments.length === 0" :image-size="80" description="尚未配置环境" />
        </section>

        <section class="api-studio-env-editor-section">
          <header class="api-studio-section-toolbar">
            <span class="api-studio-section-title">{{ editingEnvironment ? '编辑环境' : '新建环境' }}</span>
            <button v-if="editingEnvironment" class="management-list-toolbar-button" type="button" @click="editingEnvironment = null; resetEnvForm()">
              <span>取消编辑</span>
            </button>
          </header>
          <el-form label-width="120px">
            <el-form-item label="名称"><el-input v-model="environmentForm.name" placeholder="例如：dev / test / prod" /></el-form-item>
            <el-form-item label="baseUrl"><el-input v-model="environmentForm.baseUrl" placeholder="https://api.example.com" /></el-form-item>
            <el-form-item label="认证类型">
              <el-select v-model="environmentForm.authType" style="width: 200px">
                <el-option label="NONE" value="NONE" />
                <el-option label="BEARER" value="BEARER" />
                <el-option label="API_KEY" value="API_KEY" />
              </el-select>
            </el-form-item>
            <el-form-item label="认证配置 JSON">
              <el-input
                v-model="environmentForm.authConfigJson"
                type="textarea"
                :rows="3"
                placeholder='Bearer: {"token":"xxx"} · API_KEY: {"headerName":"X-Api-Key","value":"xxx"}'
              />
            </el-form-item>
            <el-form-item label="变量 (k=v)">
              <el-input
                v-model="environmentForm.variablesText"
                type="textarea"
                :rows="6"
                placeholder="每行 name=value"
              />
            </el-form-item>
            <el-form-item label="默认环境">
              <el-switch v-model="environmentForm.isDefault" />
            </el-form-item>
          </el-form>
          <div class="api-studio-env-editor-footer">
            <button class="management-list-create-button" type="button" @click="submitEnvironment">
              <el-icon><Document /></el-icon>
              <span>{{ editingEnvironment ? '更新环境' : '新建环境' }}</span>
            </button>
          </div>
        </section>
      </div>
    </el-drawer>
  </div>
</template>


<style scoped>
.api-studio-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.api-studio-workbench-toolbar {
  margin-bottom: 0;
}

.api-studio-workbench-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.api-studio-workbench-kicker {
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(144, 77, 0, 0.08);
  color: var(--app-primary);
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.api-studio-workbench-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.api-studio-env-select {
  width: 220px;
}

.api-studio-workbench-body {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  min-height: 0;
  flex: 1 1 auto;
}

/* ===================== 左侧树 ===================== */

.api-studio-tree-shell {
  display: flex;
  flex-direction: column;
  min-height: 540px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.16);
  overflow: hidden;
}

.api-studio-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border);
  background: rgba(243, 244, 245, 0.52);
}

.api-studio-tree-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--app-font-heading);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #94a3b8;
}

.api-studio-tree-header-actions {
  display: flex;
  gap: 6px;
}

.api-studio-tree-create {
  padding-inline: 12px;
}

.api-studio-tree-search {
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border);
}

.api-studio-tree-area {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 0 12px;
}

.api-studio-tree-empty {
  padding: 24px 0;
}

.api-studio-dir-block {
  margin-bottom: 2px;
}

.api-studio-dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.api-studio-dir-icon {
  color: var(--app-primary);
}

.api-studio-dir-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-studio-dir-count {
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  color: var(--app-text-soft);
  font-size: 11px;
  font-weight: 700;
}

.api-studio-dir-actions {
  display: inline-flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.api-studio-dir-row:hover .api-studio-dir-actions {
  opacity: 1;
}

.api-studio-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-soft);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.api-studio-icon-button:hover {
  background: rgba(148, 163, 184, 0.18);
  color: var(--app-text);
}

.api-studio-icon-button.danger:hover {
  background: rgba(186, 26, 26, 0.12);
  color: var(--app-danger);
}

.api-studio-icon-button.primary:hover {
  background: rgba(144, 77, 0, 0.12);
  color: var(--app-primary);
}

.api-studio-endpoint-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 30px;
  cursor: pointer;
  font-size: 12px;
  color: var(--app-text);
  border-left: 2px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.api-studio-endpoint-row:hover {
  background: rgba(243, 244, 245, 0.65);
}

.api-studio-endpoint-row.active {
  background: rgba(144, 77, 0, 0.08);
  border-left-color: var(--app-primary-container);
}

.api-studio-method-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  min-width: 52px;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
  border-radius: 4px;
  text-align: center;
}

.api-studio-method-badge.large {
  padding: 6px 10px;
  font-size: 12px;
  min-width: 64px;
}

.api-studio-endpoint-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.api-studio-endpoint-path {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  color: var(--app-text-soft);
  font-size: 11px;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===================== 中间编辑器 ===================== */

.api-studio-editor-shell {
  display: flex;
  flex-direction: column;
  min-height: 540px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.16);
  overflow: hidden;
}

.api-studio-editor-empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
}

.api-studio-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--app-border);
  background: rgba(243, 244, 245, 0.36);
  flex-wrap: wrap;
}

.api-studio-editor-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.api-studio-editor-title-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.api-studio-editor-title-copy h2 {
  margin: 0;
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
  color: var(--app-text);
  line-height: 1.3;
}

.api-studio-editor-path {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  color: var(--app-text-soft);
  font-size: 12px;
}

.api-studio-editor-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.management-list-toolbar-button.danger {
  color: var(--app-danger);
}

.management-list-toolbar-button.danger:hover {
  background: rgba(186, 26, 26, 0.08);
  border-color: rgba(186, 26, 26, 0.4);
}

.api-studio-editor-tabs {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.api-studio-editor-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 20px;
  background: transparent;
  border-bottom: 1px solid var(--app-border);
}

.api-studio-editor-tabs :deep(.el-tabs__nav-wrap)::after {
  display: none;
}

.api-studio-editor-tabs :deep(.el-tabs__item) {
  font-family: var(--app-font-heading);
  font-weight: 700;
  font-size: 13px;
  padding: 0 16px;
  color: var(--app-text-soft);
}

.api-studio-editor-tabs :deep(.el-tabs__item.is-active) {
  color: var(--app-text);
}

.api-studio-editor-tabs :deep(.el-tabs__content) {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 16px 20px 24px;
}

.api-studio-form-card {
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  padding: 18px 20px;
  box-shadow: 0 1px 2px rgba(25, 28, 29, 0.03);
}

.api-studio-editor-form {
  max-width: 760px;
}

.api-studio-section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.api-studio-section-title {
  font-family: var(--app-font-heading);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--app-text-soft);
}

.api-studio-section-subtitle {
  font-size: 12px;
  color: var(--app-text-muted);
}

.api-studio-section-actions {
  display: flex;
  gap: 6px;
}

.api-studio-inline-table {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

.api-studio-inline-table :deep(.el-table__header) {
  background: rgba(243, 244, 245, 0.52);
}

.api-studio-response-block {
  border: 1px solid var(--app-border);
  background: rgba(248, 249, 250, 0.6);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.api-studio-response-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.api-studio-debug-hint {
  margin-bottom: 14px;
  border-radius: 6px;
}

.api-studio-debug-run {
  margin-top: 4px;
}

.api-studio-debug-result {
  margin-top: 18px;
  padding: 14px 16px;
  background: rgba(248, 249, 250, 0.86);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.api-studio-debug-result-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.api-studio-debug-meta {
  font-size: 12px;
  color: var(--app-text-soft);
}

.api-studio-debug-error {
  margin-bottom: 8px;
  padding: 8px 12px;
  background: rgba(186, 26, 26, 0.08);
  border-radius: 6px;
  color: var(--app-danger);
  font-size: 13px;
}

.api-studio-debug-url {
  margin-bottom: 10px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.04);
  border-radius: 6px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 12px;
  color: var(--app-text);
  word-break: break-all;
}

/* ===================== 环境管理抽屉 ===================== */

.api-studio-env-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 4px 24px;
}

.api-studio-env-list-section,
.api-studio-env-editor-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.api-studio-env-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 1px 2px rgba(25, 28, 29, 0.03);
}

.api-studio-env-item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}

.api-studio-env-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--app-font-heading);
  font-size: 14px;
  font-weight: 800;
  color: var(--app-text);
}

.api-studio-env-meta {
  color: var(--app-text-soft);
  font-size: 12px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  word-break: break-all;
}

.api-studio-env-item-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.api-studio-env-editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1024px) {
  .api-studio-workbench-body {
    grid-template-columns: 1fr;
  }

  .api-studio-tree-shell {
    min-height: 360px;
  }
}
</style>
