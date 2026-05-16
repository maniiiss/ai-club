<template>
  <div class="yaade-page-shell">
    <div class="yaade-page" v-loading="loading">
      <iframe
        v-if="iframeSrc"
        ref="yaadeFrame"
        :key="iframeKey"
        :src="iframeSrc"
        class="yaade-iframe"
        title="Yaade API Studio"
        allowfullscreen
        @load="handleIframeLoad"
      />

      <button
        v-if="iframeSrc && currentProjectId !== null"
        class="api-ai-trigger"
        type="button"
        title="生成单接口 AI 测试用例"
        @click="openApiAiDrawer"
      >
        <el-icon><MagicStick /></el-icon>
        <span>AI 用例</span>
      </button>

      <div v-else-if="errorMessage" class="yaade-empty-state">
        <el-result
          icon="warning"
          title="Yaade 暂时不可用"
          :sub-title="errorMessage"
        >
          <template #extra>
            <el-button type="primary" :icon="RefreshRight" @click="initializePage">重新载入</el-button>
          </template>
        </el-result>
      </div>

      <div v-else-if="emptyStateMessage" class="yaade-empty-state">
        <el-result
          icon="info"
          title="暂无可访问项目"
          :sub-title="emptyStateMessage"
        />
      </div>
    </div>

    <el-drawer
      v-model="apiAiDrawerVisible"
      title="AI 测试用例"
      size="520px"
      custom-class="api-ai-drawer"
      append-to-body
      destroy-on-close
      @open="loadApiAiOptions"
    >
      <div class="api-ai-panel">
        <section class="api-ai-intro">
          <div>
            <div class="api-ai-kicker">SINGLE API ANALYSIS</div>
            <h2>单接口 AI 测试设计</h2>
          </div>
          <p>选择当前项目 Yaade 工作台中的一个 REST 请求，生成可审核的接口测试用例建议。结果不会写回 Yaade。</p>
        </section>

        <section class="api-ai-form" v-loading="apiRequestsLoading || modelOptionsLoading">
          <label class="api-ai-label" for="api-ai-request-select">接口</label>
          <el-select
            id="api-ai-request-select"
            v-model="selectedApiRequestId"
            filterable
            clearable
            placeholder="选择一个 REST 请求"
            :disabled="generatingApiCases"
            class="api-ai-select"
          >
            <el-option
              v-for="item in apiRequestOptions"
              :key="item.requestId"
              :label="`${item.method} ${item.path} · ${item.name}`"
              :value="item.requestId"
            >
              <div class="api-ai-option">
                <span class="api-ai-method">{{ item.method }}</span>
                <span class="api-ai-option-main">{{ item.path }}</span>
                <span class="api-ai-option-sub">{{ item.collectionPath }}</span>
              </div>
            </el-option>
          </el-select>

          <label class="api-ai-label" for="api-ai-model-select">模型</label>
          <el-select
            id="api-ai-model-select"
            v-model="selectedModelConfigId"
            clearable
            placeholder="默认使用首个启用对话模型"
            :disabled="generatingApiCases"
            class="api-ai-select"
          >
            <el-option
              v-for="item in modelOptions"
              :key="item.id"
              :label="`${item.name} · ${item.modelName}`"
              :value="item.id"
            />
          </el-select>

          <div v-if="!apiRequestsLoading && !apiRequestOptions.length" class="api-ai-empty-line">
            当前项目还没有可分析的 REST 请求，请先在 Yaade 中创建或同步接口。
          </div>
          <div v-if="!modelOptionsLoading && !modelOptions.length" class="api-ai-empty-line warning">
            当前没有启用的对话模型；仍可点击生成，后端会返回明确配置提示。
          </div>

          <el-button
            type="primary"
            :icon="MagicStick"
            :loading="generatingApiCases"
            :disabled="!selectedApiRequestId"
            @click="handleGenerateApiCases"
          >
            生成测试用例
          </el-button>
        </section>

        <section v-if="apiAiResult" class="api-ai-result">
          <div class="api-ai-result-head">
            <div>
              <div class="api-ai-kicker">{{ apiAiResult.method }} {{ apiAiResult.path }}</div>
              <h3>{{ apiAiResult.requestName || '未命名接口' }}</h3>
              <p>{{ apiAiResult.modelConfigName }}</p>
            </div>
            <div class="api-ai-copy-actions">
              <el-button :icon="DocumentCopy" @click="copyApiAiMarkdown">复制 Markdown</el-button>
              <el-button :icon="CopyDocument" @click="copyApiAiJson">复制 JSON</el-button>
            </div>
          </div>

          <div class="api-ai-markdown" v-html="renderMarkdownToHtml(apiAiResult.markdown)"></div>

          <div class="api-ai-case-list">
            <article v-for="(item, index) in apiAiResult.testCases" :key="`${item.title}-${index}`" class="api-ai-case-card">
              <header class="api-ai-case-head">
                <span>用例 {{ index + 1 }}</span>
                <div>
                  <span>{{ item.caseType }}</span>
                  <span>{{ item.priority }}</span>
                </div>
              </header>
              <h4>{{ item.title }}</h4>
              <p v-if="item.precondition" class="api-ai-case-muted">前置：{{ item.precondition }}</p>
              <pre v-if="item.requestExample" class="api-ai-request-example"><code>{{ item.requestExample }}</code></pre>
              <div v-if="item.assertions?.length" class="api-ai-assertions">
                <div v-for="(assertion, assertionIndex) in item.assertions" :key="assertionIndex" class="api-ai-assertion">
                  <span>{{ assertion.type }}</span>
                  <strong>{{ assertion.target || '-' }} {{ assertion.operator }} {{ assertion.expected || '-' }}</strong>
                  <em>{{ assertion.description }}</em>
                </div>
              </div>
              <p v-if="item.riskNotes" class="api-ai-case-muted">风险：{{ item.riskNotes }}</p>
            </article>
          </div>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CopyDocument, DocumentCopy, MagicStick, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getResolvedApiBaseUrl } from '@/api/http'
import {
  createYaadeEmbedSession,
  generateYaadeApiTestCases,
  getYaadeProjectBinding,
  listYaadeProjectRequests,
  type ApiTestCaseAiResultItem,
  type YaadeApiRequestItem,
  type YaadeProjectContextItem
} from '@/api/yaade'
import { listModelConfigOptions } from '@/api/models'
import { listProjectOptions } from '@/api/platform'
import { useAppStore } from '@/stores/app'
import { renderMarkdownToHtml } from '@/utils/markdown'
import type { AiModelConfigItem } from '@/types/platform'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const loading = ref(true)
const iframeSrc = ref('')
const iframeKey = ref(`yaade-${Date.now()}`)
const errorMessage = ref('')
const emptyStateMessage = ref('')
const yaadeFrame = ref<HTMLIFrameElement | null>(null)
const projectContexts = ref<YaadeProjectContextItem[]>([])
const currentProjectId = ref<number | null>(null)
const apiAiDrawerVisible = ref(false)
const apiRequestsLoading = ref(false)
const modelOptionsLoading = ref(false)
const generatingApiCases = ref(false)
const apiRequestOptions = ref<YaadeApiRequestItem[]>([])
const modelOptions = ref<AiModelConfigItem[]>([])
const selectedApiRequestId = ref<number | null>(null)
const selectedModelConfigId = ref<number | null>(null)
const apiAiResult = ref<ApiTestCaseAiResultItem | null>(null)
let bootstrapBroadcastTimer: number | null = null

onMounted(async () => {
  document.body.classList.add('api-yaade-embed')
  window.addEventListener('message', handleYaadeMessage)
  await initializePage()
})

onBeforeUnmount(() => {
  document.body.classList.remove('api-yaade-embed')
  window.removeEventListener('message', handleYaadeMessage)
  stopBootstrapBroadcast()
})

watch(
  () => appStore.currentThemeId,
  () => {
    notifyYaadeTheme()
    notifyYaadeProjectContext()
    startBootstrapBroadcast()
  }
)

watch(
  () => route.params.projectId,
  async () => {
    const nextProjectId = resolveRequestedProjectId()
    if (nextProjectId === currentProjectId.value) return
    await initializePage()
  }
)

async function initializePage() {
  loading.value = true
  errorMessage.value = ''
  emptyStateMessage.value = ''
  iframeSrc.value = ''
  projectContexts.value = []
  currentProjectId.value = null
  apiAiResult.value = null
  selectedApiRequestId.value = null
  apiRequestOptions.value = []

  try {
    const projectOptions = await listProjectOptions()
    if (!projectOptions.length) {
      emptyStateMessage.value = '当前账号还没有可访问的项目，暂时无法进入项目 API 工作台。'
      return
    }
    const projectId = resolveInitialProjectId(projectOptions.map((item) => item.id))
    const session = await createYaadeEmbedSession(projectId)
    const resolvedContexts = await resolveProjectContexts(session.projectContexts ?? [], projectOptions)
    projectContexts.value = resolveDetailProjectContexts(resolvedContexts, projectId)
    currentProjectId.value = projectContexts.value[0]?.projectId ?? null
    if (currentProjectId.value !== resolveRequestedProjectId()) {
      await syncRouteProjectId(currentProjectId.value)
    }
    if (!projectContexts.value.length) {
      emptyStateMessage.value = '当前账号还没有可访问的项目 API 空间，请先为项目建立 Yaade 绑定。'
      return
    }
    const iframeUrl = new URL(session.iframePath, `${getResolvedApiBaseUrl()}/`)
    iframeUrl.searchParams.set('aiclubEmbedded', '1')
    iframeUrl.searchParams.set('aiclubTheme', appStore.currentThemeId)
    iframeUrl.searchParams.set(
      'aiclubProjectContext',
      JSON.stringify({
        currentProjectId: currentProjectId.value,
        projects: projectContexts.value
      })
    )
    iframeUrl.searchParams.set('_ts', String(Date.now()))
    iframeSrc.value = iframeUrl.toString()
    iframeKey.value = `yaade-${Date.now()}`
    startBootstrapBroadcast()
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, '建立 Yaade 嵌入会话失败')
  } finally {
    loading.value = false
  }
}

async function resolveProjectContexts(sessionContexts: YaadeProjectContextItem[], projectOptions: { id: number; name: string }[]) {
  if (sessionContexts.length) {
    return sessionContexts
  }
  const bindings = await Promise.all(
    projectOptions.map(async (project) => {
      try {
        const binding = await getYaadeProjectBinding(project.id)
        if (!binding.exists || binding.publicSpace || !binding.yaadeCollectionId || !binding.yaadeGroupName) {
          return null
        }
        return {
          projectId: project.id,
          projectName: project.name,
          yaadeCollectionId: binding.yaadeCollectionId,
          yaadeGroupName: binding.yaadeGroupName
        } satisfies YaadeProjectContextItem
      } catch {
        return null
      }
    })
  )
  return bindings.filter((item): item is YaadeProjectContextItem => item !== null)
}

function resolveDetailProjectContexts(contexts: YaadeProjectContextItem[], requestedProjectId: number | null) {
  // 详情页只把当前项目上下文交给 Yaade，避免嵌入态左侧目录继续暴露其它可见项目。
  if (requestedProjectId === null) {
    return contexts.slice(0, 1)
  }
  return contexts.filter((item) => item.projectId === requestedProjectId)
}

function resolveRequestedProjectId() {
  const routeProjectId = Number(route.params.projectId ?? '')
  if (Number.isNaN(routeProjectId) || routeProjectId <= 0) {
    return null
  }
  return routeProjectId
}

function resolveInitialProjectId(candidates: number[]) {
  const requestedProjectId = resolveRequestedProjectId()
  if (requestedProjectId !== null && candidates.includes(requestedProjectId)) {
    return requestedProjectId
  }
  return candidates[0] ?? null
}

function notifyYaadeTheme() {
  // Yaade 运行在独立代理 iframe 中，通过轻量消息同步平台当前主题，避免耦合两套前端源码。
  const targetOrigin = resolveIframeOrigin()
  yaadeFrame.value?.contentWindow?.postMessage(
    {
      type: 'AI_CLUB_THEME_CHANGED',
      themeId: appStore.currentThemeId
    },
    targetOrigin
  )
}

function handleIframeLoad() {
  startBootstrapBroadcast()
}

function notifyYaadeProjectContext() {
  if (!iframeSrc.value || !projectContexts.value.length || currentProjectId.value === null) return
  yaadeFrame.value?.contentWindow?.postMessage(
    {
      type: 'AI_CLUB_PROJECT_CONTEXT',
      currentProjectId: currentProjectId.value,
      projects: projectContexts.value
    },
    resolveIframeOrigin()
  )
}

function handleYaadeMessage(event: MessageEvent) {
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'AI_CLUB_PROJECT_CONTEXT_REQUEST') {
    notifyYaadeTheme()
    notifyYaadeProjectContext()
    return
  }
  if (data.type === 'AI_CLUB_BACK_TO_API_GROUPS') {
    void router.push({ name: 'api-groups' })
    return
  }
  if (data.type === 'AI_CLUB_PROJECT_CHANGED') {
    const nextProjectId = Number((data as { projectId?: number }).projectId ?? 0)
    if (!Number.isFinite(nextProjectId) || nextProjectId <= 0) return
    if (!projectContexts.value.some((item) => item.projectId === nextProjectId)) return
    if (nextProjectId === currentProjectId.value) return
    currentProjectId.value = nextProjectId
    void syncRouteProjectId(nextProjectId)
  }
}

function startBootstrapBroadcast() {
  stopBootstrapBroadcast()
  let remaining = 12
  const tick = () => {
    notifyYaadeTheme()
    notifyYaadeProjectContext()
    remaining -= 1
    if (remaining <= 0) {
      stopBootstrapBroadcast()
    }
  }
  tick()
  bootstrapBroadcastTimer = window.setInterval(tick, 500)
}

function stopBootstrapBroadcast() {
  if (bootstrapBroadcastTimer !== null) {
    window.clearInterval(bootstrapBroadcastTimer)
    bootstrapBroadcastTimer = null
  }
}

async function syncRouteProjectId(projectId: number | null) {
  if (projectId === null) {
    await router.replace({ name: 'api-groups' })
  } else {
    await router.replace({ name: 'api-project-detail', params: { projectId: String(projectId) } })
  }
}

function openApiAiDrawer() {
  apiAiDrawerVisible.value = true
}

async function loadApiAiOptions() {
  await Promise.all([loadApiRequestOptions(), loadModelOptions()])
}

async function loadApiRequestOptions() {
  if (currentProjectId.value === null) return
  apiRequestsLoading.value = true
  try {
    apiRequestOptions.value = await listYaadeProjectRequests(currentProjectId.value)
    if (selectedApiRequestId.value && !apiRequestOptions.value.some((item) => item.requestId === selectedApiRequestId.value)) {
      selectedApiRequestId.value = null
    }
  } catch (error) {
    apiRequestOptions.value = []
    ElMessage.error(extractErrorMessage(error, '加载 Yaade 接口列表失败'))
  } finally {
    apiRequestsLoading.value = false
  }
}

async function loadModelOptions() {
  modelOptionsLoading.value = true
  try {
    modelOptions.value = await listModelConfigOptions('CHAT')
  } catch (error) {
    modelOptions.value = []
    ElMessage.error(extractErrorMessage(error, '加载模型配置失败'))
  } finally {
    modelOptionsLoading.value = false
  }
}

async function handleGenerateApiCases() {
  if (currentProjectId.value === null || selectedApiRequestId.value === null) return
  generatingApiCases.value = true
  try {
    apiAiResult.value = await generateYaadeApiTestCases(currentProjectId.value, selectedApiRequestId.value, selectedModelConfigId.value)
    ElMessage.success('AI 测试用例已生成')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '生成 AI 测试用例失败'))
  } finally {
    generatingApiCases.value = false
  }
}

async function copyApiAiMarkdown() {
  if (!apiAiResult.value) return
  await copyText(buildApiAiMarkdown(apiAiResult.value), '已复制 Markdown')
}

async function copyApiAiJson() {
  if (!apiAiResult.value) return
  await copyText(JSON.stringify(apiAiResult.value, null, 2), '已复制 JSON')
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successMessage)
  } catch {
    ElMessage.error('复制失败，请手动选择内容复制')
  }
}

function buildApiAiMarkdown(result: ApiTestCaseAiResultItem) {
  const lines = [result.markdown || `## ${result.requestName}`, '']
  result.testCases.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title}`)
    lines.push(`- 类型：${item.caseType}`)
    lines.push(`- 优先级：${item.priority}`)
    if (item.precondition) lines.push(`- 前置条件：${item.precondition}`)
    if (item.requestExample) lines.push(`- 请求样例：\n\n\`\`\`\n${item.requestExample}\n\`\`\``)
    if (item.assertions?.length) {
      lines.push('- 断言：')
      item.assertions.forEach((assertion) => {
        lines.push(`  - ${assertion.type} ${assertion.target || '-'} ${assertion.operator} ${assertion.expected || '-'}：${assertion.description || '-'}`)
      })
    }
    if (item.riskNotes) lines.push(`- 风险备注：${item.riskNotes}`)
    lines.push('')
  })
  return lines.join('\n').trim()
}

function resolveIframeOrigin() {
  try {
    return iframeSrc.value ? new URL(iframeSrc.value).origin : window.location.origin
  } catch {
    return window.location.origin
  }
}

function extractErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
  const instanceMessage = error instanceof Error ? error.message : ''
  return responseMessage || instanceMessage || fallback
}
</script>

<style scoped>
.yaade-page-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--app-page-gradient-start, #f8f9fa);
}

.yaade-page {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 0%, var(--app-page-accent-a, rgba(255, 140, 0, 0.08)), transparent 28%),
    radial-gradient(circle at 92% 6%, var(--app-page-accent-b, rgba(0, 101, 143, 0.06)), transparent 30%),
    linear-gradient(180deg, var(--app-page-gradient-start, #f8f9fa) 0%, var(--app-page-gradient-end, #eef0f1) 100%);
}

.yaade-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: var(--app-page-gradient-start, #f8f9fa);
}

.api-ai-trigger {
  position: absolute;
  top: 18px;
  right: 22px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(15, 118, 110, 0.22);
  border-radius: 8px;
  color: #0f766e;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.api-ai-trigger:hover,
.api-ai-trigger:focus-visible {
  color: #ffffff;
  border-color: #0f766e;
  background: #0f766e;
  outline: none;
}

.api-ai-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.api-ai-intro,
.api-ai-form,
.api-ai-result,
.api-ai-case-card {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: #ffffff;
}

.api-ai-intro {
  padding: 18px;
  background:
    linear-gradient(135deg, rgba(240, 253, 250, 0.96), rgba(255, 255, 255, 0.98)),
    radial-gradient(circle at 92% 0%, rgba(20, 184, 166, 0.16), transparent 34%);
}

.api-ai-intro h2,
.api-ai-result h3,
.api-ai-case-card h4 {
  margin: 0;
  color: #172033;
  letter-spacing: 0;
}

.api-ai-intro h2 {
  margin-top: 4px;
  font-size: 22px;
}

.api-ai-intro p,
.api-ai-result-head p,
.api-ai-case-muted {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.6;
  font-size: 13px;
}

.api-ai-kicker {
  color: #0f766e;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
}

.api-ai-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.api-ai-label {
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}

.api-ai-select {
  width: 100%;
}

.api-ai-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  min-width: 0;
}

.api-ai-method {
  grid-row: span 2;
  min-width: 48px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 900;
}

.api-ai-option-main,
.api-ai-option-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-ai-option-main {
  color: #172033;
  font-weight: 800;
}

.api-ai-option-sub {
  color: #64748b;
  font-size: 12px;
}

.api-ai-empty-line {
  padding: 10px 12px;
  border-radius: 8px;
  color: #475569;
  background: #f8fafc;
  font-size: 12px;
  line-height: 1.5;
}

.api-ai-empty-line.warning {
  color: #92400e;
  background: #fffbeb;
}

.api-ai-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.api-ai-result-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.api-ai-copy-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.api-ai-copy-actions :deep(.el-button) {
  margin-left: 0;
}

.api-ai-markdown {
  padding: 12px 14px;
  border-radius: 8px;
  color: #334155;
  background: #f8fafc;
  font-size: 13px;
  line-height: 1.65;
}

.api-ai-markdown :deep(h1),
.api-ai-markdown :deep(h2),
.api-ai-markdown :deep(h3),
.api-ai-markdown :deep(p),
.api-ai-markdown :deep(ul),
.api-ai-markdown :deep(ol) {
  margin: 0 0 8px;
}

.api-ai-markdown :deep(ul),
.api-ai-markdown :deep(ol) {
  padding-left: 18px;
}

.api-ai-case-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.api-ai-case-card {
  padding: 14px;
}

.api-ai-case-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.api-ai-case-head div {
  display: flex;
  gap: 6px;
}

.api-ai-case-head div span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  color: #0f766e;
  background: #ecfdf5;
}

.api-ai-request-example {
  max-height: 180px;
  margin: 12px 0;
  padding: 12px;
  overflow: auto;
  border-radius: 8px;
  color: #dbeafe;
  background: #172033;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.api-ai-assertions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-ai-assertion {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 8px;
  padding: 10px;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 12px;
}

.api-ai-assertion span {
  grid-row: span 2;
  color: #0f766e;
  font-weight: 900;
}

.api-ai-assertion strong,
.api-ai-assertion em {
  min-width: 0;
  overflow-wrap: anywhere;
}

.api-ai-assertion strong {
  color: #1e293b;
}

.api-ai-assertion em {
  color: #64748b;
  font-style: normal;
}

.yaade-empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at top right, rgba(66, 184, 131, 0.14), transparent 28%),
    linear-gradient(180deg, #f7faf8 0%, #eff4f1 100%);
}

@media (max-width: 768px) {
  .yaade-page {
    height: 100%;
    min-height: 0;
  }

  .api-ai-trigger {
    top: 12px;
    right: 12px;
  }
}
</style>

<style>
.api-ai-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.api-ai-drawer .el-drawer__body {
  padding: 18px;
  background: #f8fafc;
}

body.api-yaade-embed .layout-shell {
  background: var(--app-page-gradient-start, #f8f9fa);
}

body.api-yaade-embed .layout-main-shell {
  height: 100vh;
  min-height: 0;
}

body.api-yaade-embed .layout-main {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  padding: 0 !important;
  overflow: hidden;
  background: var(--app-page-gradient-start, #f8f9fa);
}

body.api-yaade-embed .layout-main > * {
  margin: 0 !important;
}

body.api-yaade-embed .layout-main.mobile-main {
  padding-bottom: 0 !important;
}

body.api-yaade-embed .mobile-bottom-nav {
  display: none;
}
</style>
