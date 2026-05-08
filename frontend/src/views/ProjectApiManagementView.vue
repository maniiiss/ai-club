<template>
  <div class="yaade-page" v-loading="loading">
    <iframe
      v-if="iframeSrc"
      :key="iframeKey"
      :src="iframeSrc"
      class="yaade-iframe"
      title="Yaade API Studio"
      allowfullscreen
    />

    <div v-else class="yaade-empty-state">
      <el-result
        icon="warning"
        title="Yaade 暂时不可用"
        :sub-title="errorMessage || '嵌入会话尚未建立，请稍后重试。'"
      >
        <template #extra>
          <el-button type="primary" :icon="RefreshRight" @click="initializePage">重新载入</el-button>
        </template>
      </el-result>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshRight } from '@element-plus/icons-vue'
import { getResolvedApiBaseUrl } from '@/api/http'
import { createYaadeEmbedSession } from '@/api/yaade'

const route = useRoute()

const loading = ref(false)
const iframeSrc = ref('')
const iframeKey = ref(`yaade-${Date.now()}`)
const errorMessage = ref('')

onMounted(async () => {
  document.body.classList.add('api-yaade-embed')
  await initializePage()
})

onBeforeUnmount(() => {
  document.body.classList.remove('api-yaade-embed')
})

async function initializePage() {
  loading.value = true
  errorMessage.value = ''
  iframeSrc.value = ''

  try {
    const projectId = resolveProjectId()
    const session = await createYaadeEmbedSession(projectId)
    const iframeUrl = new URL(session.iframePath, `${getResolvedApiBaseUrl()}/`)
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
  min-height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #fff;
}

.yaade-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: #fff;
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
    min-height: 100vh;
  }
}
</style>

<style>
body.api-yaade-embed .layout-shell {
  background: #fff;
}

body.api-yaade-embed .layout-header {
  display: none;
}

body.api-yaade-embed .layout-main-shell {
  height: 100vh;
  min-height: 100vh;
}

body.api-yaade-embed .layout-main {
  height: 100vh;
  min-height: 100vh;
  padding: 0 !important;
  overflow: hidden;
  background: #fff;
}

body.api-yaade-embed .layout-main.mobile-main {
  padding-bottom: 0 !important;
}

body.api-yaade-embed .mobile-bottom-nav {
  display: none;
}
</style>
