<template>
  <div class="gitlab-oauth-callback-page">
    <el-card class="gitlab-oauth-callback-card" shadow="never">
      <el-result
        :icon="callbackSucceeded ? 'success' : (callbackFinished ? 'warning' : 'info')"
        :title="callbackTitle"
        :sub-title="callbackSubtitle"
      >
        <template #extra>
          <el-button type="primary" :loading="callbackLoading" @click="handleBackToProfile">
            返回个人中心
          </el-button>
        </template>
      </el-result>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { handleCurrentUserGitlabOauthCallback } from '@/api/gitlab'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const callbackLoading = ref(true)
const callbackFinished = ref(false)
const callbackSucceeded = ref(false)
const callbackMessage = ref('正在同步 GitLab 授权结果...')

const callbackTitle = computed(() => {
  if (!callbackFinished.value) {
    return '正在完成 GitLab 授权绑定'
  }
  return callbackSucceeded.value ? 'GitLab 账户绑定成功' : 'GitLab 账户绑定失败'
})

const callbackSubtitle = computed(() => callbackMessage.value)

const handleBackToProfile = async () => {
  await router.replace('/profile')
}

// 回调页只负责把 code 和 state 转发给后端，并在完成后刷新当前会话资料。
onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code.trim() : ''
  const state = typeof route.query.state === 'string' ? route.query.state.trim() : ''
  if (!code || !state) {
    callbackLoading.value = false
    callbackFinished.value = true
    callbackMessage.value = '缺少 GitLab 授权参数，请返回个人中心重新发起绑定。'
    ElMessage.error(callbackMessage.value)
    return
  }

  try {
    await handleCurrentUserGitlabOauthCallback({ code, state })
    await authStore.fetchProfile()
    callbackSucceeded.value = true
    callbackMessage.value = '当前账号已成功绑定 GitLab 用户身份，即将返回个人中心。'
    ElMessage.success('GitLab 账户已绑定')
    window.setTimeout(() => {
      void router.replace('/profile')
    }, 1200)
  } catch (error: any) {
    callbackMessage.value = error?.response?.data?.message || 'GitLab 授权绑定失败，请稍后重试'
    ElMessage.error(callbackMessage.value)
  } finally {
    callbackLoading.value = false
    callbackFinished.value = true
  }
})
</script>

<style scoped>
.gitlab-oauth-callback-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.gitlab-oauth-callback-card {
  width: min(760px, 100%);
}
</style>
