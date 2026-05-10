<template>
  <div class="yaade-page" v-loading="loading">
    <iframe
      v-if="iframeSrc"
      ref="yaadeFrame"
      :key="iframeKey"
      :src="iframeSrc"
      class="yaade-iframe"
      title="Yaade API Studio"
      allowfullscreen
      @load="notifyYaadeTheme"
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
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshRight } from '@element-plus/icons-vue'
import { getResolvedApiBaseUrl } from '@/api/http'
import { createYaadeEmbedSession } from '@/api/yaade'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

const loading = ref(true)
const iframeSrc = ref('')
const iframeKey = ref(`yaade-${Date.now()}`)
const errorMessage = ref('')
const yaadeFrame = ref<HTMLIFrameElement | null>(null)

onMounted(async () => {
  document.body.classList.add('api-yaade-embed')
  await initializePage()
})

onBeforeUnmount(() => {
  document.body.classList.remove('api-yaade-embed')
})

watch(
  () => appStore.currentThemeId,
  () => notifyYaadeTheme()
)

async function initializePage() {
  loading.value = true
  errorMessage.value = ''
  iframeSrc.value = ''

  try {
    const projectId = resolveProjectId()
    const session = await createYaadeEmbedSession(projectId)
    const iframeUrl = new URL(session.iframePath, `${getResolvedApiBaseUrl()}/`)
    iframeUrl.searchParams.set('aiclubEmbedded', '1')
    iframeUrl.searchParams.set('aiclubTheme', appStore.currentThemeId)
    iframeUrl.searchParams.set('_ts', String(Date.now()))
    iframeSrc.value = iframeUrl.toString()
    iframeKey.value = `yaade-${Date.now()}`
  } catch (error) {
    errorMessage.value = extractErrorMessage(error, '建立 Yaade 嵌入会话失败')
  } finally {
    loading.value = false
  }
}

function resolveProjectId() {
  const queryProjectId = Number(route.query.projectId ?? '')
  if (Number.isNaN(queryProjectId) || queryProjectId <= 0) {
    return null
  }
  return queryProjectId
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
.yaade-page {
  width: 100%;
  height: 100%;
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

body.api-yaade-embed .layout-main.mobile-main {
  padding-bottom: 0 !important;
}

body.api-yaade-embed .mobile-bottom-nav {
  display: none;
}
</style>
