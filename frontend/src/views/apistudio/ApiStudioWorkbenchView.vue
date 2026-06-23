<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useApiStudioStore } from '@/stores/apiStudio'
import type {
  ApiStudioDirectoryItem,
  ApiStudioEndpointPayload,
  ApiStudioEndpointSummary,
  ApiStudioMethod,
  ApiStudioTreeNode,
  ApiStudioDebugExecutionPayload
} from '@/types/api-studio'

// 原生 API 工作台 - 项目级三栏工作区。
// 左：目录树 + API 列表；中：编辑器；右/下：调试与响应。
// 设计文档：docs/api-studio-native-technical-design-v1.md 第 9 节。

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
    <div class="toolbar">
      <el-button text @click="backToHome">
        <el-icon><i-ep-back /></el-icon> 返回项目列表
      </el-button>
      <div class="title">
        <strong>API 工作台</strong>
        <span v-if="store.overview" class="meta">
          目录 {{ store.overview.directoryCount }} · API {{ store.overview.endpointCount }} ·
          环境 {{ store.overview.environmentCount }}
          <span v-if="store.overview.defaultEnvironmentName">
            · 默认 {{ store.overview.defaultEnvironmentName }}
          </span>
        </span>
      </div>
      <div class="right">
        <el-select
          v-model="store.selectedEnvironmentId"
          placeholder="选择环境"
          style="width: 180px"
          clearable
        >
          <el-option
            v-for="env in store.environments"
            :key="env.id"
            :label="env.name + (env.isDefault ? ' (默认)' : '')"
            :value="env.id"
          />
        </el-select>
        <el-button @click="openEnvironments">环境管理</el-button>
      </div>
    </div>

    <div class="layout">
      <!-- 左侧目录树 -->
      <aside class="left" v-loading="store.treeLoading">
        <div class="left-header">
          <span>目录与 API</span>
          <div>
            <el-button size="small" @click="openNewDir(null)">+ 目录</el-button>
            <el-button size="small" type="primary" @click="openNewEndpoint(null)">+ API</el-button>
          </div>
        </div>

        <div class="tree-area">
          <!-- 根级 API -->
          <div
            v-for="ep in store.tree?.rootEndpoints ?? []"
            :key="'root-ep-' + ep.id"
            class="endpoint-row"
            :class="{ active: store.currentEndpoint?.id === ep.id }"
            @click="selectEndpoint(ep.id)"
          >
            <span class="method-badge" :style="{ background: methodColor(ep.method) }">{{ ep.method }}</span>
            <span class="ep-name">{{ ep.name }}</span>
            <span class="ep-path">{{ ep.path }}</span>
          </div>

          <!-- 目录递归 -->
          <div v-for="entry in flatNodes" :key="'dir-' + entry.node.directory.id" class="dir-block">
            <div class="dir-row" :style="{ paddingLeft: 8 + entry.depth * 12 + 'px' }">
              <el-icon><i-ep-folder /></el-icon>
              <span class="dir-name">{{ entry.node.directory.name }}</span>
              <span class="dir-actions">
                <el-button text size="small" @click="openNewEndpoint(entry.node.directory.id)">+ API</el-button>
                <el-button text size="small" @click="openNewDir(entry.node.directory.id)">+ 子目录</el-button>
                <el-button text size="small" @click="deleteDir(entry.node.directory)">删除</el-button>
              </span>
            </div>
            <div
              v-for="ep in entry.node.endpoints"
              :key="'ep-' + ep.id"
              class="endpoint-row"
              :class="{ active: store.currentEndpoint?.id === ep.id }"
              :style="{ paddingLeft: 24 + entry.depth * 12 + 'px' }"
              @click="selectEndpoint(ep.id)"
            >
              <span class="method-badge" :style="{ background: methodColor(ep.method) }">{{ ep.method }}</span>
              <span class="ep-name">{{ ep.name }}</span>
              <span class="ep-path">{{ ep.path }}</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中间编辑器 -->
      <main class="center" v-loading="store.endpointLoading">
        <div v-if="!store.currentEndpoint" class="empty">
          <el-empty description="请选择左侧 API 或点击 + API 创建新接口" />
        </div>

        <template v-else>
          <div class="editor-header">
            <el-tag :style="{ background: methodColor(store.currentEndpoint.method), color: '#fff', border: 'none' }">
              {{ store.currentEndpoint.method }}
            </el-tag>
            <strong>{{ store.currentEndpoint.name }}</strong>
            <span class="path">{{ store.currentEndpoint.path }}</span>
            <el-tag size="small" :type="store.currentEndpoint.status === 'PUBLISHED' ? 'success' : store.currentEndpoint.status === 'DEPRECATED' ? 'info' : 'warning'">
              {{ store.currentEndpoint.status }}
            </el-tag>
            <div class="header-actions">
              <el-button size="small" type="primary" @click="saveCurrent">保存</el-button>
              <el-button size="small" @click="publishCurrent" :disabled="store.currentEndpoint.status === 'PUBLISHED'">发布</el-button>
              <el-button size="small" @click="deprecateCurrent" :disabled="store.currentEndpoint.status === 'DEPRECATED'">废弃</el-button>
              <el-button size="small" type="danger" @click="removeCurrent">删除</el-button>
            </div>
          </div>

          <el-tabs v-model="activeEditorTab" class="editor-tabs">
            <el-tab-pane label="基础信息" name="basic">
              <el-form label-width="120px" class="editor-form">
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
                  <el-select v-model="store.currentEndpoint.status" style="width: 160px">
                    <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
                  </el-select>
                </el-form-item>
                <el-form-item label="摘要">
                  <el-input v-model="store.currentEndpoint.summary" />
                </el-form-item>
                <el-form-item label="详细说明">
                  <el-input v-model="store.currentEndpoint.descriptionMarkdown" type="textarea" :rows="6" />
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="参数" name="params">
              <div class="param-toolbar">
                <el-button size="small" @click="addParameter('PATH')">+ Path</el-button>
                <el-button size="small" @click="addParameter('QUERY')">+ Query</el-button>
                <el-button size="small" @click="addParameter('HEADER')">+ Header</el-button>
              </div>
              <el-table :data="store.currentEndpoint.parameters" size="small" border>
                <el-table-column label="位置" width="130">
                  <template #default="{ row }">
                    <el-select v-model="row.location" size="small">
                      <el-option v-for="l in paramLocationOptions" :key="l" :label="l" :value="l" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="名称">
                  <template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
                </el-table-column>
                <el-table-column label="类型" width="130">
                  <template #default="{ row }">
                    <el-select v-model="row.dataType" size="small">
                      <el-option v-for="t in dataTypeOptions" :key="t" :label="t" :value="t" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="必填" width="80">
                  <template #default="{ row }"><el-checkbox v-model="row.required" /></template>
                </el-table-column>
                <el-table-column label="示例">
                  <template #default="{ row }"><el-input v-model="row.exampleValue" size="small" /></template>
                </el-table-column>
                <el-table-column label="说明">
                  <template #default="{ row }"><el-input v-model="row.description" size="small" /></template>
                </el-table-column>
                <el-table-column width="80">
                  <template #default="{ $index }">
                    <el-button link type="danger" size="small" @click="removeParameter($index)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="Body" name="body">
              <el-form label-width="120px">
                <el-form-item label="Body 类型">
                  <el-select v-model="store.currentEndpoint.requestBodyType" style="width: 200px">
                    <el-option v-for="t in bodyTypeOptions" :key="t" :label="t" :value="t" />
                  </el-select>
                </el-form-item>
                <el-form-item label="Body 示例">
                  <el-input v-model="store.currentEndpoint.requestBodyExample" type="textarea" :rows="10" />
                </el-form-item>
                <el-form-item label="结构 (JSON)">
                  <el-input v-model="store.currentEndpoint.requestBodySchemaJson" type="textarea" :rows="6" placeholder="可选：保存 JSON Schema 结构" />
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="响应" name="responses">
              <el-button size="small" @click="addResponse" style="margin-bottom: 12px">+ 响应</el-button>
              <div v-for="(resp, idx) in store.currentEndpoint.responses" :key="idx" class="response-block">
                <div class="response-header">
                  <span>状态码</span>
                  <el-input-number v-model="resp.statusCode" :min="100" :max="599" size="small" />
                  <span>Content-Type</span>
                  <el-input v-model="resp.contentType" size="small" style="width: 220px" />
                  <el-button link type="danger" size="small" @click="removeResponse(idx)">删除</el-button>
                </div>
                <el-input v-model="resp.description" placeholder="响应说明" size="small" style="margin-bottom: 8px" />
                <el-input v-model="resp.exampleBody" type="textarea" :rows="6" placeholder="响应示例 JSON" />
              </div>
            </el-tab-pane>

            <el-tab-pane label="调试" name="debug">
              <div class="debug-section">
                <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
                  调试请求由平台后端代理发出，仅允许访问所选环境 baseUrl 同源目标。
                </el-alert>
                <el-form label-width="120px">
                  <el-form-item label="环境">
                    <el-select v-model="store.selectedEnvironmentId" style="width: 240px" placeholder="选择环境">
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
                <el-button type="primary" :loading="store.debugRunning" @click="runDebug">发送请求</el-button>

                <div v-if="store.debugResult" class="debug-result">
                  <h4>结果</h4>
                  <div class="result-meta">
                    <el-tag :type="store.debugResult.success ? 'success' : 'danger'">
                      {{ store.debugResult.statusCode ?? 'ERR' }}
                    </el-tag>
                    <span>{{ store.debugResult.durationMillis }} ms</span>
                    <span>{{ store.debugResult.responseBytes }} bytes</span>
                    <span v-if="store.debugResult.responseTruncated">[已截断]</span>
                  </div>
                  <div v-if="store.debugResult.errorMessage" class="error-msg">
                    {{ store.debugResult.errorMessage }}
                  </div>
                  <div class="final-url">{{ store.debugResult.finalUrl }}</div>
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
              <el-table :data="store.versions" size="small" border v-loading="store.versionsLoading">
                <el-table-column prop="versionNo" label="版本" width="80" />
                <el-table-column prop="changeType" label="类型" width="120" />
                <el-table-column prop="changeSummary" label="说明" />
                <el-table-column prop="createdAt" label="时间" width="180" />
                <el-table-column width="100">
                  <template #default="{ row }">
                    <el-button link type="primary" size="small" @click="rollbackTo(row.id)">回滚</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </template>
      </main>
    </div>

    <!-- 新建目录对话框 -->
    <el-dialog v-model="newDirDialog" title="新建目录" width="480px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="newDirForm.name" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="newDirForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newDirDialog = false">取消</el-button>
        <el-button type="primary" @click="submitNewDir">创建</el-button>
      </template>
    </el-dialog>

    <!-- 新建 API 对话框 -->
    <el-dialog v-model="newEndpointDialog" title="新建 API" width="560px">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="newEndpointForm.name" /></el-form-item>
        <el-form-item label="方法">
          <el-select v-model="newEndpointForm.method" style="width: 160px">
            <el-option v-for="m in methodOptions" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="路径"><el-input v-model="newEndpointForm.path" placeholder="/users/{id}" /></el-form-item>
        <el-form-item label="摘要"><el-input v-model="newEndpointForm.summary" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newEndpointDialog = false">取消</el-button>
        <el-button type="primary" @click="submitNewEndpoint">创建</el-button>
      </template>
    </el-dialog>

    <!-- 环境管理抽屉 -->
    <el-drawer v-model="envManagerVisible" title="环境管理" size="640px">
      <div class="env-layout">
        <div class="env-list">
          <h4>已配置环境</h4>
          <div v-for="env in store.environments" :key="env.id" class="env-item">
            <div>
              <strong>{{ env.name }}</strong>
              <el-tag v-if="env.isDefault" size="small" type="success" style="margin-left: 6px">默认</el-tag>
              <div class="env-meta">{{ env.baseUrl }} · auth {{ env.authType }}</div>
            </div>
            <div>
              <el-button link size="small" @click="editEnvironment(env)">编辑</el-button>
              <el-button link size="small" @click="setEnvDefault(env.id)" :disabled="env.isDefault">设为默认</el-button>
              <el-button link type="danger" size="small" @click="removeEnvironment(env.id)">删除</el-button>
            </div>
          </div>
          <el-empty v-if="store.environments.length === 0" description="尚未配置环境" />
        </div>

        <div class="env-editor">
          <h4>{{ editingEnvironment ? '编辑环境' : '新建环境' }}</h4>
          <el-form label-width="120px">
            <el-form-item label="名称"><el-input v-model="environmentForm.name" /></el-form-item>
            <el-form-item label="baseUrl"><el-input v-model="environmentForm.baseUrl" placeholder="https://api.example.com" /></el-form-item>
            <el-form-item label="认证类型">
              <el-select v-model="environmentForm.authType" style="width: 160px">
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
          <el-button type="primary" @click="submitEnvironment">{{ editingEnvironment ? '更新环境' : '新建环境' }}</el-button>
          <el-button v-if="editingEnvironment" @click="editingEnvironment = null; resetEnvForm()">取消编辑</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.api-studio-workbench {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  background: var(--el-bg-color-page);
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  gap: 16px;
}

.toolbar .title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar .meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.toolbar .right {
  display: flex;
  gap: 8px;
}

.layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  flex: 1;
  min-height: 0;
}

.left {
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  overflow-y: auto;
}

.left-header {
  position: sticky;
  top: 0;
  background: var(--el-bg-color);
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  z-index: 1;
}

.tree-area {
  padding: 6px 0;
}

.dir-block {
  margin-bottom: 4px;
}

.dir-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.dir-actions {
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s;
}

.dir-row:hover .dir-actions {
  opacity: 1;
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 24px;
  cursor: pointer;
  font-size: 12px;
  border-left: 2px solid transparent;
}

.endpoint-row:hover {
  background: var(--el-fill-color-light);
}

.endpoint-row.active {
  background: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}

.method-badge {
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  color: #fff;
  border-radius: 3px;
  font-weight: 600;
  min-width: 48px;
  text-align: center;
}

.ep-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ep-path {
  color: var(--el-text-color-secondary);
  font-family: monospace;
  font-size: 11px;
}

.center {
  background: var(--el-bg-color);
  overflow-y: auto;
  padding: 16px 24px;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.editor-header .path {
  font-family: monospace;
  color: var(--el-text-color-secondary);
}

.header-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.editor-tabs {
  background: var(--el-bg-color);
}

.editor-form {
  max-width: 720px;
}

.param-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}

.response-block {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.response-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.debug-section {
  max-width: 920px;
}

.debug-result {
  margin-top: 16px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.debug-result h4 {
  margin: 0 0 8px;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.error-msg {
  color: var(--el-color-danger);
  margin-bottom: 8px;
}

.final-url {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  word-break: break-all;
}

.env-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  padding: 0 16px;
}

.env-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.env-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.env-editor h4 {
  margin: 0 0 12px;
}
</style>
