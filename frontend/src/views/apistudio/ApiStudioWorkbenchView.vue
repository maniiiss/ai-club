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
import MarkdownEditor from '@/components/MarkdownEditor.vue'

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

type KvEntry = { name: string; value: string }

const envManagerVisible = ref(false)
const editingEnvironment = ref<number | null>(null)
const environmentForm = ref<{
  name: string
  baseUrl: string
  authType: 'NONE' | 'BEARER' | 'API_KEY'
  authBearerToken: string
  authApiKeyHeader: string
  authApiKeyValue: string
  isDefault: boolean
  commonHeaders: KvEntry[]
  variables: Array<{ name: string; value: string; secret: boolean; description?: string | null }>
}>({
  name: '',
  baseUrl: '',
  authType: 'NONE',
  authBearerToken: '',
  authApiKeyHeader: 'X-Api-Key',
  authApiKeyValue: '',
  isDefault: false,
  commonHeaders: [],
  variables: []
})

const debugForm = ref<{
  pathOverrides: KvEntry[]
  queryOverrides: KvEntry[]
  headerOverrides: KvEntry[]
  requestBody: string
}>({
  pathOverrides: [],
  queryOverrides: [],
  headerOverrides: [],
  requestBody: ''
})

// 把 KV 数组转成 Record<string,string>，丢掉空 name。
const kvToRecord = (entries: KvEntry[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const item of entries) {
    if (item.name && item.name.trim()) {
      out[item.name.trim()] = item.value ?? ''
    }
  }
  return out
}

// JSON 美化；解析失败时原样返回。
const tryFormatJson = (raw: string | null | undefined): { ok: boolean; text: string } => {
  if (raw == null || raw === '') return { ok: true, text: '' }
  try {
    const obj = JSON.parse(raw)
    return { ok: true, text: JSON.stringify(obj, null, 2) }
  } catch (e: any) {
    return { ok: false, text: e?.message ?? '无效 JSON' }
  }
}

// 通用：把字符串字段格式化为美化 JSON；解析失败时弹出错误。
const formatJsonField = (current: string | null | undefined, apply: (formatted: string) => void) => {
  const result = tryFormatJson(current ?? '')
  if (!result.ok) {
    ElMessage.error('JSON 解析失败：' + result.text)
    return
  }
  apply(result.text)
  ElMessage.success('已格式化 JSON')
}

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
  const buildPayload = (revision: number | null): ApiStudioEndpointPayload => ({
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
    revision,
    parameters: ep.parameters,
    responses: ep.responses,
    changeSummary: 'Manual save'
  })
  try {
    await store.saveEndpoint(ep.id, buildPayload(ep.revision))
    ElMessage.success('已保存')
  } catch (e: any) {
    const message = e?.response?.data?.message ?? e?.message ?? ''
    // 乐观锁版本不一致时，自动重新拉取最新 revision 重试一次，避免用户被中间态卡住。
    if (typeof message === 'string' && message.includes('接口已被其他会话修改')) {
      try {
        const fresh = await store.loadEndpoint(ep.id)
        if (fresh) {
          await store.saveEndpoint(ep.id, buildPayload(fresh.revision))
          ElMessage.success('已保存（已自动同步最新版本）')
          return
        }
      } catch (retryError: any) {
        ElMessage.error('保存失败: ' + (retryError?.response?.data?.message ?? retryError?.message ?? message))
        return
      }
    }
    ElMessage.error('保存失败: ' + message)
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

// 通过下拉选择切换 API 生命周期。
// DRAFT → PUBLISHED 走 publish 接口（含同 method+path 冲突校验）
// PUBLISHED/DRAFT → DEPRECATED 走 deprecate 接口
// DEPRECATED/PUBLISHED → DRAFT 走整体保存
// 每个分支都会让 store 用服务端最新返回覆盖 currentEndpoint，保证 revision 同步。
const changeStatus = async (next: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED') => {
  if (!store.currentEndpoint) return
  const endpointId = store.currentEndpoint.id
  const current = store.currentEndpoint.status
  if (current === next) return
  try {
    if (next === 'PUBLISHED') {
      await store.publishEndpoint(endpointId)
      // 显式重新拉取一遍，保险地把 revision 同步成 DB 最新值。
      await store.loadEndpoint(endpointId)
      ElMessage.success('已发布')
      return
    }
    if (next === 'DEPRECATED') {
      await store.deprecateEndpoint(endpointId)
      await store.loadEndpoint(endpointId)
      ElMessage.success('已标记废弃')
      return
    }
    // 切回 DRAFT 通过整体保存（status 已经在本地修改）
    store.currentEndpoint.status = 'DRAFT'
    await saveCurrent()
    await store.loadEndpoint(endpointId)
  } catch (e: any) {
    // 回滚下拉选中，并尝试同步最新 revision，避免连环失败
    if (store.currentEndpoint) {
      store.currentEndpoint.status = current
    }
    try {
      await store.loadEndpoint(endpointId)
    } catch (_ignored) {
      /* 忽略二次错误 */
    }
    ElMessage.error('状态切换失败: ' + (e?.response?.data?.message ?? e?.message))
  }
}

const statusOptionList = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'DEPRECATED', label: '已废弃' }
] as const

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
    authBearerToken: '',
    authApiKeyHeader: 'X-Api-Key',
    authApiKeyValue: '',
    isDefault: false,
    commonHeaders: [],
    variables: []
  }
}

const parseHeadersJson = (raw: string | null | undefined): KvEntry[] => {
  if (!raw) return []
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return []
    return Object.entries(obj).map(([name, value]) => ({ name, value: String(value ?? '') }))
  } catch {
    return []
  }
}

const parseAuthConfig = (authType: string, raw: string | null | undefined) => {
  const out = { bearer: '', apiKeyHeader: 'X-Api-Key', apiKeyValue: '' }
  if (!raw) return out
  try {
    const obj = JSON.parse(raw) ?? {}
    if (authType === 'BEARER') {
      out.bearer = obj.token ?? ''
    } else if (authType === 'API_KEY') {
      out.apiKeyHeader = obj.headerName ?? 'X-Api-Key'
      out.apiKeyValue = obj.value ?? ''
    }
  } catch {
    /* ignore */
  }
  return out
}

const editEnvironment = (env: {
  id: number
  name: string
  baseUrl: string
  authType: string
  authConfigJson: string | null
  commonHeadersJson?: string | null
  isDefault: boolean
  variables: Array<{ id?: number | null; name: string; value: string | null; secret?: boolean; description?: string | null }>
}) => {
  editingEnvironment.value = env.id
  const authType = (env.authType as 'NONE' | 'BEARER' | 'API_KEY') ?? 'NONE'
  const authParsed = parseAuthConfig(authType, env.authConfigJson)
  environmentForm.value = {
    name: env.name,
    baseUrl: env.baseUrl,
    authType,
    authBearerToken: authParsed.bearer,
    authApiKeyHeader: authParsed.apiKeyHeader,
    authApiKeyValue: authParsed.apiKeyValue,
    isDefault: env.isDefault,
    commonHeaders: parseHeadersJson(env.commonHeadersJson),
    variables: (env.variables ?? []).map((v) => ({
      name: v.name,
      value: v.value ?? '',
      secret: Boolean(v.secret),
      description: v.description ?? ''
    }))
  }
}

const addCommonHeader = () => {
  environmentForm.value.commonHeaders.push({ name: '', value: '' })
}

const removeCommonHeader = (idx: number) => {
  environmentForm.value.commonHeaders.splice(idx, 1)
}

const addEnvVariable = () => {
  environmentForm.value.variables.push({ name: '', value: '', secret: false })
}

const removeEnvVariable = (idx: number) => {
  environmentForm.value.variables.splice(idx, 1)
}

const submitEnvironment = async () => {
  if (!environmentForm.value.name.trim() || !environmentForm.value.baseUrl.trim()) {
    ElMessage.warning('请填写名称和 baseUrl')
    return
  }
  // 公共 Header 序列化成 JSON 字符串
  const headerRecord = kvToRecord(environmentForm.value.commonHeaders)
  const commonHeadersJson = Object.keys(headerRecord).length ? JSON.stringify(headerRecord) : null

  // 认证配置序列化
  let authConfigJson: string | null = null
  if (environmentForm.value.authType === 'BEARER' && environmentForm.value.authBearerToken.trim()) {
    authConfigJson = JSON.stringify({ token: environmentForm.value.authBearerToken.trim() })
  } else if (environmentForm.value.authType === 'API_KEY') {
    const header = environmentForm.value.authApiKeyHeader.trim() || 'X-Api-Key'
    const value = environmentForm.value.authApiKeyValue.trim()
    if (value) {
      authConfigJson = JSON.stringify({ headerName: header, value })
    }
  }

  // 过滤空变量名
  const variables = environmentForm.value.variables
    .filter((v) => v.name && v.name.trim())
    .map((v) => ({
      name: v.name.trim(),
      value: v.value,
      secret: Boolean(v.secret),
      description: v.description ?? null
    }))

  const payload = {
    name: environmentForm.value.name.trim(),
    baseUrl: environmentForm.value.baseUrl.trim(),
    authType: environmentForm.value.authType,
    authConfigJson,
    commonHeadersJson,
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

const addDebugHeader = () => {
  debugForm.value.headerOverrides.push({ name: '', value: '' })
}
const removeDebugHeader = (idx: number) => {
  debugForm.value.headerOverrides.splice(idx, 1)
}
const addDebugQuery = () => {
  debugForm.value.queryOverrides.push({ name: '', value: '' })
}
const removeDebugQuery = (idx: number) => {
  debugForm.value.queryOverrides.splice(idx, 1)
}
const addDebugPath = () => {
  debugForm.value.pathOverrides.push({ name: '', value: '' })
}
const removeDebugPath = (idx: number) => {
  debugForm.value.pathOverrides.splice(idx, 1)
}

const runDebug = async () => {
  if (!store.currentEndpoint) return
  if (!store.selectedEnvironmentId) {
    ElMessage.warning('请选择调试环境')
    return
  }
  const payload: ApiStudioDebugExecutionPayload = {
    environmentId: store.selectedEnvironmentId,
    pathOverrides: kvToRecord(debugForm.value.pathOverrides),
    queryOverrides: kvToRecord(debugForm.value.queryOverrides),
    headerOverrides: kvToRecord(debugForm.value.headerOverrides),
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

// 美化调试响应体（仅本地显示用，不影响存档快照）。
const prettyResponseBody = computed(() => {
  const raw = store.debugResult?.responseBody ?? ''
  const result = tryFormatJson(raw)
  return result.ok ? result.text : raw
})
const responseBodyMode = ref<'pretty' | 'raw'>('pretty')

// Vue 模板里直接写 {{baseUrl}} 会被当成插值，这里用常量绕开。
const varRefSyntax = '{{baseUrl}}'

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
    <div class="api-studio-workbench-body">
      <!-- 左侧目录树 -->
      <aside class="api-studio-tree-shell" v-loading="store.treeLoading">
        <header class="api-studio-tree-header">
          <button
            class="api-studio-back-button"
            type="button"
            :title="store.overview?.projectName || '返回项目列表'"
            @click="backToHome"
          >
            <el-icon><ArrowLeft /></el-icon>
            <span>项目列表</span>
          </button>
          <div class="api-studio-tree-header-actions">
            <button class="management-list-toolbar-button" type="button" @click="openNewDir(null)" title="新建目录">
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
            :class="[
              'is-status-' + (ep.status || 'DRAFT').toLowerCase(),
              { active: store.currentEndpoint?.id === ep.id }
            ]"
            @click="selectEndpoint(ep.id)"
          >
            <span class="api-studio-method-badge" :style="{ background: methodColor(ep.method) }">{{ ep.method }}</span>
            <el-tooltip
              :content="ep.name + ' · ' + ep.path"
              placement="right"
              :show-after="400"
              :hide-after="0"
            >
              <span class="api-studio-endpoint-text">
                <span class="api-studio-endpoint-name">{{ ep.name }}</span>
                <span class="api-studio-endpoint-path">{{ ep.path }}</span>
              </span>
            </el-tooltip>
            <span class="api-studio-status-dot" :class="'is-' + (ep.status || 'DRAFT').toLowerCase()" :title="statusLabel(ep.status)"></span>
          </div>

          <!-- 目录递归 -->
          <div v-for="entry in flatNodes" :key="'dir-' + entry.node.directory.id" class="api-studio-dir-block">
            <div class="api-studio-dir-row" :style="{ paddingLeft: 12 + entry.depth * 16 + 'px' }">
              <el-icon class="api-studio-dir-icon"><FolderOpened /></el-icon>
              <el-tooltip
                :content="entry.node.directory.name"
                placement="right"
                :show-after="400"
                :hide-after="0"
              >
                <span class="api-studio-dir-name">{{ entry.node.directory.name }}</span>
              </el-tooltip>
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
              :class="[
                'is-status-' + (ep.status || 'DRAFT').toLowerCase(),
                { active: store.currentEndpoint?.id === ep.id }
              ]"
              :style="{ paddingLeft: 30 + entry.depth * 16 + 'px' }"
              @click="selectEndpoint(ep.id)"
            >
              <span class="api-studio-method-badge" :style="{ background: methodColor(ep.method) }">{{ ep.method }}</span>
              <el-tooltip
                :content="ep.name + ' · ' + ep.path"
                placement="right"
                :show-after="400"
                :hide-after="0"
              >
                <span class="api-studio-endpoint-text">
                  <span class="api-studio-endpoint-name">{{ ep.name }}</span>
                  <span class="api-studio-endpoint-path">{{ ep.path }}</span>
                </span>
              </el-tooltip>
              <span class="api-studio-status-dot" :class="'is-' + (ep.status || 'DRAFT').toLowerCase()" :title="statusLabel(ep.status)"></span>
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
                <el-tooltip
                  :content="store.currentEndpoint.name || '未命名 API'"
                  placement="bottom-start"
                  :show-after="400"
                  :hide-after="0"
                >
                  <h2>{{ store.currentEndpoint.name || '未命名 API' }}</h2>
                </el-tooltip>
                <el-tooltip
                  :content="store.currentEndpoint.path"
                  placement="bottom-start"
                  :show-after="400"
                  :hide-after="0"
                >
                  <span class="api-studio-editor-path">{{ store.currentEndpoint.path }}</span>
                </el-tooltip>
              </div>
              <el-select
                :model-value="store.currentEndpoint.status"
                size="default"
                class="api-studio-status-select"
                :class="'api-studio-status-select-' + (store.currentEndpoint.status || 'DRAFT').toLowerCase()"
                @change="(val: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED') => changeStatus(val)"
              >
                <template #prefix>
                  <span class="api-studio-status-dot" :class="'is-' + (store.currentEndpoint.status || 'DRAFT').toLowerCase()" />
                </template>
                <el-option
                  v-for="opt in statusOptionList"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                >
                  <span class="api-studio-status-option">
                    <span class="api-studio-status-dot" :class="'is-' + opt.value.toLowerCase()" />
                    <span>{{ opt.label }}</span>
                  </span>
                </el-option>
              </el-select>
            </div>
            <div class="api-studio-editor-actions">
              <button class="management-list-toolbar-button danger" type="button" @click="removeCurrent">
                <el-icon><Delete /></el-icon>
                <span>删除</span>
              </button>
              <button class="management-list-create-button" type="button" @click="saveCurrent">
                <el-icon><Edit /></el-icon>
                <span>保存</span>
              </button>
              <span class="api-studio-editor-actions-divider" aria-hidden="true"></span>
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
                  <el-form-item label="摘要">
                    <el-input v-model="store.currentEndpoint.summary" placeholder="一句话描述这个接口的用途" />
                  </el-form-item>
                  <el-form-item label="详细说明">
                    <MarkdownEditor
                      :model-value="store.currentEndpoint.descriptionMarkdown ?? ''"
                      @update:modelValue="(val: string) => { if (store.currentEndpoint) store.currentEndpoint.descriptionMarkdown = val }"
                      :height="320"
                      :start-in-edit-mode="true"
                      placeholder="支持 Markdown，双击预览/进入编辑"
                    />
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
                    <div class="api-studio-textarea-block">
                      <div class="api-studio-textarea-toolbar">
                        <button
                          type="button"
                          class="management-list-toolbar-button"
                          @click="formatJsonField(store.currentEndpoint.requestBodyExample, (v) => (store.currentEndpoint!.requestBodyExample = v))"
                        >
                          <span>格式化 JSON</span>
                        </button>
                      </div>
                      <el-input v-model="store.currentEndpoint.requestBodyExample" type="textarea" :rows="10" placeholder="例如 JSON 请求体示例" class="api-studio-mono-textarea" />
                    </div>
                  </el-form-item>
                  <el-form-item label="结构 (JSON)">
                    <div class="api-studio-textarea-block">
                      <div class="api-studio-textarea-toolbar">
                        <button
                          type="button"
                          class="management-list-toolbar-button"
                          @click="formatJsonField(store.currentEndpoint.requestBodySchemaJson, (v) => (store.currentEndpoint!.requestBodySchemaJson = v))"
                        >
                          <span>格式化 JSON</span>
                        </button>
                      </div>
                      <el-input v-model="store.currentEndpoint.requestBodySchemaJson" type="textarea" :rows="6" placeholder="可选：保存 JSON Schema 或结构化字段树" class="api-studio-mono-textarea" />
                    </div>
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
                  <div class="api-studio-textarea-block">
                    <div class="api-studio-textarea-toolbar">
                      <button
                        type="button"
                        class="management-list-toolbar-button"
                        @click="formatJsonField(resp.exampleBody, (v) => (resp.exampleBody = v))"
                      >
                        <span>格式化 JSON</span>
                      </button>
                    </div>
                    <el-input v-model="resp.exampleBody" type="textarea" :rows="6" placeholder="响应示例 JSON" class="api-studio-mono-textarea" />
                  </div>
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
                  调试请求由平台后端代理发出，仅允许访问所选环境 baseUrl 同源目标。Header / Query / Path 临时覆盖优先级高于 API 定义与环境公共值。
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
                </el-form>

                <!-- 临时 Header 覆盖 -->
                <div class="api-studio-section-toolbar">
                  <span class="api-studio-section-title">临时 Header</span>
                  <div class="api-studio-section-actions">
                    <button class="management-list-toolbar-button" type="button" @click="addDebugHeader">
                      <el-icon><Plus /></el-icon><span>添加 Header</span>
                    </button>
                  </div>
                </div>
                <div class="api-studio-kv-table">
                  <div v-if="!debugForm.headerOverrides.length" class="api-studio-kv-empty">未配置临时 Header（将使用 API 与环境公共 Header）</div>
                  <div v-for="(row, idx) in debugForm.headerOverrides" :key="'dbgh-' + idx" class="api-studio-kv-row">
                    <el-input v-model="row.name" placeholder="Header 名" size="small" class="api-studio-kv-name" />
                    <el-input v-model="row.value" placeholder="Header 值（支持 {{var}}）" size="small" class="api-studio-kv-value" />
                    <button class="api-studio-icon-button danger" type="button" title="删除" @click="removeDebugHeader(idx)">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
                </div>

                <!-- 临时 Query 覆盖 -->
                <div class="api-studio-section-toolbar">
                  <span class="api-studio-section-title">临时 Query</span>
                  <div class="api-studio-section-actions">
                    <button class="management-list-toolbar-button" type="button" @click="addDebugQuery">
                      <el-icon><Plus /></el-icon><span>添加 Query</span>
                    </button>
                  </div>
                </div>
                <div class="api-studio-kv-table">
                  <div v-if="!debugForm.queryOverrides.length" class="api-studio-kv-empty">未配置临时 Query</div>
                  <div v-for="(row, idx) in debugForm.queryOverrides" :key="'dbgq-' + idx" class="api-studio-kv-row">
                    <el-input v-model="row.name" placeholder="Query 名" size="small" class="api-studio-kv-name" />
                    <el-input v-model="row.value" placeholder="Query 值（支持 {{var}}）" size="small" class="api-studio-kv-value" />
                    <button class="api-studio-icon-button danger" type="button" title="删除" @click="removeDebugQuery(idx)">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
                </div>

                <!-- 临时 Path 变量 -->
                <div class="api-studio-section-toolbar">
                  <span class="api-studio-section-title">Path 参数</span>
                  <div class="api-studio-section-actions">
                    <button class="management-list-toolbar-button" type="button" @click="addDebugPath">
                      <el-icon><Plus /></el-icon><span>添加 Path</span>
                    </button>
                  </div>
                </div>
                <div class="api-studio-kv-table">
                  <div v-if="!debugForm.pathOverrides.length" class="api-studio-kv-empty">未配置 Path 覆盖（将使用参数定义中的默认/示例值）</div>
                  <div v-for="(row, idx) in debugForm.pathOverrides" :key="'dbgp-' + idx" class="api-studio-kv-row">
                    <el-input v-model="row.name" placeholder="参数名（例：id）" size="small" class="api-studio-kv-name" />
                    <el-input v-model="row.value" placeholder="值" size="small" class="api-studio-kv-value" />
                    <button class="api-studio-icon-button danger" type="button" title="删除" @click="removeDebugPath(idx)">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
                </div>

                <!-- 临时 Body -->
                <div class="api-studio-section-toolbar">
                  <span class="api-studio-section-title">临时 Body</span>
                  <div class="api-studio-section-actions">
                    <button
                      type="button"
                      class="management-list-toolbar-button"
                      @click="formatJsonField(debugForm.requestBody, (v) => (debugForm.requestBody = v))"
                    >
                      <span>格式化 JSON</span>
                    </button>
                  </div>
                </div>
                <el-input
                  v-model="debugForm.requestBody"
                  type="textarea"
                  :rows="8"
                  placeholder="临时覆盖请求体（留空则使用 API 定义中的示例）"
                  class="api-studio-mono-textarea"
                />

                <div class="api-studio-debug-runbar">
                  <button
                    class="management-list-create-button api-studio-debug-run"
                    type="button"
                    :disabled="store.debugRunning"
                    @click="runDebug"
                  >
                    <el-icon><Connection /></el-icon>
                    <span>{{ store.debugRunning ? '发送中...' : '发送请求' }}</span>
                  </button>
                </div>

                <div v-if="store.debugResult" class="api-studio-debug-result">
                  <div class="api-studio-debug-result-head">
                    <span class="management-list-pill" :class="store.debugResult.success ? 'success' : 'danger'">
                      {{ store.debugResult.statusCode ?? 'ERR' }}
                    </span>
                    <span class="api-studio-debug-meta">{{ store.debugResult.durationMillis }} ms</span>
                    <span class="api-studio-debug-meta">{{ store.debugResult.responseBytes }} bytes</span>
                    <span v-if="store.debugResult.responseTruncated" class="management-list-pill warning">已截断</span>
                    <div class="api-studio-debug-result-tools">
                      <el-radio-group v-model="responseBodyMode" size="small">
                        <el-radio-button label="pretty">美化</el-radio-button>
                        <el-radio-button label="raw">原始</el-radio-button>
                      </el-radio-group>
                    </div>
                  </div>
                  <div v-if="store.debugResult.errorMessage" class="api-studio-debug-error">
                    {{ store.debugResult.errorMessage }}
                  </div>
                  <div class="api-studio-debug-url">{{ store.debugResult.finalUrl }}</div>
                  <el-input
                    :model-value="responseBodyMode === 'pretty' ? prettyResponseBody : store.debugResult.responseBody"
                    type="textarea"
                    :rows="14"
                    readonly
                    class="api-studio-mono-textarea"
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
            <el-form-item v-if="environmentForm.authType === 'BEARER'" label="Bearer Token">
              <el-input
                v-model="environmentForm.authBearerToken"
                placeholder="将作为 Authorization: Bearer <token> 注入"
                show-password
              />
            </el-form-item>
            <template v-if="environmentForm.authType === 'API_KEY'">
              <el-form-item label="API Key Header">
                <el-input v-model="environmentForm.authApiKeyHeader" placeholder="X-Api-Key" />
              </el-form-item>
              <el-form-item label="API Key 值">
                <el-input v-model="environmentForm.authApiKeyValue" placeholder="密钥值" show-password />
              </el-form-item>
            </template>
            <el-form-item label="默认环境">
              <el-switch v-model="environmentForm.isDefault" />
            </el-form-item>
          </el-form>

          <!-- 公共请求头 -->
          <div class="api-studio-section-toolbar">
            <span class="api-studio-section-title">公共请求头</span>
            <div class="api-studio-section-actions">
              <button class="management-list-toolbar-button" type="button" @click="addCommonHeader">
                <el-icon><Plus /></el-icon><span>添加 Header</span>
              </button>
            </div>
          </div>
          <div class="api-studio-kv-table">
            <div v-if="!environmentForm.commonHeaders.length" class="api-studio-kv-empty">尚未配置公共请求头，调试时不会自动注入。</div>
            <div v-for="(row, idx) in environmentForm.commonHeaders" :key="'envh-' + idx" class="api-studio-kv-row">
              <el-input v-model="row.name" placeholder="Header 名（例：Accept）" size="small" class="api-studio-kv-name" />
              <el-input v-model="row.value" placeholder="Header 值（支持 {{var}}）" size="small" class="api-studio-kv-value" />
              <button class="api-studio-icon-button danger" type="button" title="删除" @click="removeCommonHeader(idx)">
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </div>

          <!-- 环境变量 -->
          <div class="api-studio-section-toolbar">
            <span class="api-studio-section-title">环境变量</span>
            <div class="api-studio-section-actions">
              <button class="management-list-toolbar-button" type="button" @click="addEnvVariable">
                <el-icon><Plus /></el-icon><span>添加变量</span>
              </button>
            </div>
          </div>
          <div class="api-studio-kv-table">
            <div v-if="!environmentForm.variables.length" class="api-studio-kv-empty">尚未配置环境变量。内置 baseUrl 变量始终可用，可在 URL/Header/Body 中通过 {{ varRefSyntax }} 形式引用。</div>
            <div v-for="(row, idx) in environmentForm.variables" :key="'envv-' + idx" class="api-studio-kv-row">
              <el-input v-model="row.name" placeholder="变量名" size="small" class="api-studio-kv-name" />
              <el-input
                v-model="row.value"
                :placeholder="row.secret ? '修改可重新设置；留空保持原值' : '值'"
                :show-password="row.secret"
                size="small"
                class="api-studio-kv-value"
              />
              <el-checkbox v-model="row.secret" class="api-studio-kv-secret">敏感</el-checkbox>
              <button class="api-studio-icon-button danger" type="button" title="删除" @click="removeEnvVariable(idx)">
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </div>

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
  gap: 0;
  min-height: 100%;
}

.api-studio-env-select {
  width: 200px;
}

.api-studio-editor-actions-divider {
  width: 1px;
  height: 22px;
  background: var(--app-border);
  margin: 0 4px;
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

.api-studio-back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: var(--app-font-heading);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--app-text);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.api-studio-back-button:hover {
  background: rgba(148, 163, 184, 0.18);
  border-color: var(--app-border);
  color: var(--app-primary);
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
  min-width: 0;
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
  min-width: 0;
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
  flex: 0 0 auto;
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

.api-studio-endpoint-text {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.api-studio-endpoint-name {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  min-width: 0;
}

.api-studio-endpoint-path {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  color: var(--app-text-soft);
  font-size: 11px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 状态指示 ===== */
.api-studio-status-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.6);
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.15);
}

.api-studio-status-dot.is-draft {
  background: #d4a300;
  box-shadow: 0 0 0 2px rgba(212, 163, 0, 0.18);
}

.api-studio-status-dot.is-published {
  background: var(--app-success, #3d6f38);
  box-shadow: 0 0 0 2px rgba(61, 111, 56, 0.2);
}

.api-studio-status-dot.is-deprecated {
  background: var(--app-text-muted, #758393);
  box-shadow: 0 0 0 2px rgba(117, 131, 147, 0.2);
}

/* 草稿：黄色描边 + 黄色名字 */
.api-studio-endpoint-row.is-status-draft .api-studio-endpoint-name {
  color: #9d5b00;
}

.api-studio-endpoint-row.is-status-draft.active {
  background: rgba(212, 163, 0, 0.08);
  border-left-color: #d4a300;
}

/* 已发布：绿色名字 + 加粗 */
.api-studio-endpoint-row.is-status-published .api-studio-endpoint-name {
  color: var(--app-success, #3d6f38);
  font-weight: 700;
}

.api-studio-endpoint-row.is-status-published.active {
  background: rgba(61, 111, 56, 0.08);
  border-left-color: var(--app-success, #3d6f38);
}

/* 已废弃：删除线 + 灰色 + 整体降透明 */
.api-studio-endpoint-row.is-status-deprecated {
  opacity: 0.6;
}

.api-studio-endpoint-row.is-status-deprecated .api-studio-method-badge {
  filter: grayscale(0.7);
}

.api-studio-endpoint-row.is-status-deprecated .api-studio-endpoint-name {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  color: var(--app-text-muted, #758393);
}

.api-studio-endpoint-row.is-status-deprecated .api-studio-endpoint-path {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  color: var(--app-text-muted, #758393);
}

.api-studio-endpoint-row.is-status-deprecated.active {
  background: rgba(117, 131, 147, 0.1);
  border-left-color: var(--app-text-muted, #758393);
  opacity: 0.85;
}

/* ===== 编辑器头部的状态下拉 ===== */
.api-studio-status-select {
  width: 140px;
}

.api-studio-status-select :deep(.el-input__wrapper) {
  border-radius: 999px;
  padding-inline: 12px;
  box-shadow: none;
  border: 1px solid var(--app-border);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.api-studio-status-select :deep(.el-input__inner) {
  font-family: var(--app-font-heading);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.api-studio-status-select-draft :deep(.el-input__wrapper) {
  background: rgba(212, 163, 0, 0.12);
  border-color: rgba(212, 163, 0, 0.4);
}

.api-studio-status-select-draft :deep(.el-input__inner) {
  color: #9d5b00;
}

.api-studio-status-select-published :deep(.el-input__wrapper) {
  background: rgba(61, 111, 56, 0.12);
  border-color: rgba(61, 111, 56, 0.4);
}

.api-studio-status-select-published :deep(.el-input__inner) {
  color: var(--app-success, #3d6f38);
}

.api-studio-status-select-deprecated :deep(.el-input__wrapper) {
  background: rgba(117, 131, 147, 0.16);
  border-color: rgba(117, 131, 147, 0.4);
}

.api-studio-status-select-deprecated :deep(.el-input__inner) {
  color: var(--app-text-muted, #758393);
}

.api-studio-status-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  flex: 1 1 auto;
  overflow: hidden;
}

.api-studio-editor-title-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.api-studio-editor-title-copy h2 {
  margin: 0;
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
  color: var(--app-text);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-studio-editor-path {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  color: var(--app-text-soft);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  margin-top: 12px;
}

/* ===================== 通用 KV 编辑器（Header / Query / Path / 变量） ===================== */

.api-studio-kv-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.api-studio-kv-empty {
  padding: 12px 14px;
  border: 1px dashed var(--app-border);
  border-radius: 8px;
  color: var(--app-text-muted, #94a3b8);
  font-size: 12px;
  background: rgba(248, 249, 250, 0.6);
}

.api-studio-kv-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(220px, 2fr) auto auto;
  gap: 8px;
  align-items: center;
}

.api-studio-kv-row .api-studio-kv-name {
  width: 100%;
}

.api-studio-kv-row .api-studio-kv-value {
  width: 100%;
}

.api-studio-kv-secret {
  margin-right: 0;
  white-space: nowrap;
}

/* ===================== Textarea 工具条 + 等宽风格 ===================== */

.api-studio-textarea-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.api-studio-textarea-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.api-studio-mono-textarea :deep(.el-textarea__inner) {
  font-family: "JetBrains Mono", "Fira Code", "Menlo", monospace;
  font-size: 12.5px;
  line-height: 1.55;
  tab-size: 2;
}

/* 调试发送按钮 */

.api-studio-debug-runbar {
  display: flex;
  margin: 12px 0 4px;
}

.api-studio-debug-result-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
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
