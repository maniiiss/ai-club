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
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshRight } from '@element-plus/icons-vue'
import { getResolvedApiBaseUrl } from '@/api/http'
import { createYaadeEmbedSession, getYaadeProjectBinding, type YaadeProjectContextItem } from '@/api/yaade'
import { listProjectOptions } from '@/api/platform'
import { useAppStore } from '@/stores/app'

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
}
</style>

<style>
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
