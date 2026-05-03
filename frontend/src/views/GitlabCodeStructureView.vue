<template>
  <div class="gitnexus-launch-page">
    <section class="gitnexus-launch-card" v-loading="loading">
      <div class="gitnexus-launch-header">
        <div class="gitnexus-launch-eyebrow">GitNexus 全仓图</div>
        <h1>{{ launchTitle }}</h1>
        <p>{{ launchSubtitle }}</p>
      </div>

      <div class="gitnexus-launch-status">
        <div class="gitnexus-status-pill" :class="launchStatusClass">
          <span class="gitnexus-status-dot"></span>
          <span>{{ launchStatusText }}</span>
        </div>
      </div>

      <div v-if="launchContext" class="gitnexus-launch-meta">
        <span>仓库别名：{{ launchContext.repoAlias }}</span>
        <span>分支：{{ launchContext.branchName || '-' }}</span>
        <span>提交：{{ shortSha(launchContext.commitSha) }}</span>
      </div>

      <div v-if="errorMessage" class="gitnexus-launch-error">
        {{ errorMessage }}
      </div>

      <div class="gitnexus-launch-actions">
        <el-button v-if="canRetry" type="primary" :loading="loading" @click="triggerLaunch">重试打开</el-button>
        <el-button v-if="launchContext?.launchUrl" @click="openCurrentLaunchUrl">再次打开</el-button>
      </div>

      <div v-if="launchContext?.launchUrl" class="gitnexus-launch-link">
        <span>如果浏览器没有自动跳转，可以手动打开：</span>
        <a :href="launchContext.launchUrl" target="_blank" rel="noopener noreferrer">{{ launchContext.launchUrl }}</a>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import { launchGitlabBindingGitnexus } from '@/api/gitlab'
import type { GitlabGitnexusLaunchResultItem } from '@/types/platform'

const route = useRoute()

const bindingId = computed(() => Number(route.params.id))
const requestedBranch = computed(() => {
  const rawBranch = route.query.branch
  if (typeof rawBranch === 'string') {
    const normalized = rawBranch.trim()
    return normalized || undefined
  }
  return undefined
})
const loading = ref(false)
const launchContext = ref<GitlabGitnexusLaunchResultItem | null>(null)
const errorMessage = ref('')
const hasAttempted = ref(false)

const launchStatus = computed<'launching' | 'success' | 'failed'>(() => {
  if (loading.value) return 'launching'
  if (errorMessage.value) return 'failed'
  if (launchContext.value) return 'success'
  return 'launching'
})

const launchStatusText = computed(() => {
  if (launchStatus.value === 'success') return 'GitNexus 已就绪，正在跳转'
  if (launchStatus.value === 'failed') return '跳转失败'
  return '正在准备 GitNexus 全仓图'
})

const launchStatusClass = computed(() => ({
  launching: launchStatus.value === 'launching',
  success: launchStatus.value === 'success',
  failed: launchStatus.value === 'failed'
}))

const launchTitle = computed(() => {
  if (launchContext.value?.repoAlias) {
    return `正在打开 ${launchContext.value.repoAlias}`
  }
  return '正在进入 GitNexus'
})

const launchSubtitle = computed(() => {
  if (errorMessage.value) {
    return '平台已经停留在过渡页，你可以重试，或者使用下方地址手动打开。'
  }
  return '平台会先确认目标分支已完成 analyze，并确保 GitNexus serve 可用，然后自动跳转到全仓图。'
})

const canRetry = computed(() => hasAttempted.value && !loading.value)

const shortSha = (value?: string | null) => value ? value.slice(0, 12) : '-'

const openCurrentLaunchUrl = () => {
  if (!launchContext.value?.launchUrl) return
  window.location.replace(launchContext.value.launchUrl)
}

const triggerLaunch = async () => {
  loading.value = true
  errorMessage.value = ''
  hasAttempted.value = true
  try {
    const result = await launchGitlabBindingGitnexus(bindingId.value, { branch: requestedBranch.value })
    launchContext.value = result
    window.location.replace(result.launchUrl)
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.message || '打开 GitNexus 全仓图失败'
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await triggerLaunch()
})
</script>

<style scoped>
.gitnexus-launch-page {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  background:
    radial-gradient(circle at top right, rgba(15, 118, 110, 0.12), transparent 34%),
    linear-gradient(180deg, #f8fafc 0%, #eef3f1 100%);
}

.gitnexus-launch-card {
  width: min(760px, 100%);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
  padding: 28px 30px 32px;
}

.gitnexus-launch-header {
  margin-top: 0;
}

.gitnexus-launch-eyebrow {
  color: #0f766e;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.gitnexus-launch-header h1 {
  margin: 10px 0 8px;
  color: #0f172a;
  font-size: 30px;
  font-weight: 900;
  line-height: 1.12;
}

.gitnexus-launch-header p {
  margin: 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.7;
}

.gitnexus-launch-status {
  margin-top: 20px;
}

.gitnexus-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
}

.gitnexus-status-pill.launching {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.gitnexus-status-pill.success {
  background: rgba(15, 118, 110, 0.12);
  color: #0f766e;
}

.gitnexus-status-pill.failed {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
}

.gitnexus-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

.gitnexus-launch-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.gitnexus-launch-meta span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
}

.gitnexus-launch-error {
  margin-top: 18px;
  border-radius: 16px;
  background: rgba(239, 68, 68, 0.1);
  color: #991b1b;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
}

.gitnexus-launch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.gitnexus-launch-link {
  margin-top: 18px;
  color: #334155;
  font-size: 12px;
  line-height: 1.7;
  word-break: break-all;
}

.gitnexus-launch-link a {
  color: #0f766e;
  text-decoration: underline;
}

@media (max-width: 768px) {
  .gitnexus-launch-page {
    padding: 18px 14px;
  }

  .gitnexus-launch-card {
    padding: 22px 18px 24px;
  }

  .gitnexus-launch-header h1 {
    font-size: 24px;
  }
}
</style>
