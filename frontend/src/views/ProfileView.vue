<template>
  <div class="profile-page">
    <el-card class="page-card profile-card" shadow="never">
      <div class="profile-grid">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基本资料</div>
            <div class="platform-form-section-subtitle">修改后会同步影响任务负责人展示和个人 GitLab 关联。</div>
          </div>

          <div class="profile-identity-panel">
            <div class="profile-avatar-shell" :class="{ uploading: avatarUploading }">
              <img v-if="profileAvatarUrl" :src="profileAvatarUrl" alt="当前用户头像" class="profile-avatar-image" />
              <span v-else>{{ profileAvatarInitial }}</span>
            </div>

            <div class="profile-identity-copy">
              <div class="profile-identity-title">{{ authStore.user?.nickname || authStore.user?.username || '当前用户' }}</div>
              <div class="profile-identity-subtitle">上传后会同步显示在右上角资料区和个人中心。</div>
            </div>

            <div class="profile-avatar-actions-block">
              <input
                ref="avatarInputRef"
                class="profile-avatar-input"
                type="file"
                accept="image/png,image/jpeg,image/gif"
                @change="handleAvatarSelected"
              />
              <el-button plain :loading="avatarUploading" :disabled="avatarUploading" @click="handleTriggerAvatarUpload">上传头像</el-button>
              <div class="profile-avatar-tip">支持 PNG、JPG、GIF，文件大小不超过 5MB。</div>
            </div>
          </div>

          <el-form ref="profileFormRef" :model="profileForm" :rules="profileRules" label-width="110px">
            <el-form-item label="用户名">
              <el-input :model-value="authStore.user?.username || ''" disabled />
            </el-form-item>
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="profileForm.nickname" placeholder="请输入昵称" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="profileForm.email" placeholder="请输入邮箱" />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input v-model="profileForm.phone" placeholder="请输入手机号" />
            </el-form-item>
            <el-form-item label="GitLab 用户名">
              <el-input v-model="profileForm.gitlabUsername" placeholder="用于关联个人 GitLab MR，例如：zhangsan" />
            </el-form-item>
            <el-form-item label="角色">
              <el-input :model-value="authStore.user?.roleNames?.join(' / ') || '暂无角色'" disabled />
            </el-form-item>
          </el-form>

          <div class="profile-actions">
            <el-button type="primary" :loading="profileSubmitting" @click="handleSaveProfile">保存资料</el-button>
          </div>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">修改密码</div>
            <div class="platform-form-section-subtitle">修改密码后，建议重新登录以确认新凭证可用。</div>
          </div>

          <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="110px">
            <el-form-item label="当前密码" prop="currentPassword">
              <el-input v-model="passwordForm.currentPassword" type="password" show-password placeholder="请输入当前密码" />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="至少 6 位" />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirmPassword">
              <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
            </el-form-item>
          </el-form>

          <div class="profile-actions">
            <el-button type="primary" :loading="passwordSubmitting" @click="handleChangePassword">更新密码</el-button>
          </div>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">GitLab 账户绑定</div>
            <div class="platform-form-section-subtitle">使用 GitLab OAuth 绑定当前平台账号，首页快速发起 MR 时会以你自己的 GitLab 身份提交。</div>
          </div>

          <div v-loading="gitlabOauthBindingLoading" class="profile-gitlab-binding-card">
            <div class="profile-gitlab-binding-head">
              <div>
                <div class="profile-gitlab-binding-title">默认 GitLab 实例</div>
                <div class="profile-gitlab-binding-url">{{ gitlabOauthBinding.apiBaseUrl || '-' }}</div>
              </div>
              <span class="profile-gitlab-binding-pill" :class="{ connected: gitlabOauthBinding.connected }">
                {{ gitlabOauthBinding.connected ? '已绑定' : '未绑定' }}
              </span>
            </div>

            <div class="profile-gitlab-binding-grid">
              <div class="profile-gitlab-binding-item">
                <span class="profile-gitlab-binding-label">账号名称</span>
                <span class="profile-gitlab-binding-value">{{ gitlabOauthBinding.gitlabName || '-' }}</span>
              </div>
              <div class="profile-gitlab-binding-item">
                <span class="profile-gitlab-binding-label">用户名</span>
                <span class="profile-gitlab-binding-value">{{ gitlabOauthBinding.gitlabUsername || '-' }}</span>
              </div>
              <div class="profile-gitlab-binding-item profile-gitlab-binding-item-full">
                <span class="profile-gitlab-binding-label">过期时间</span>
                <span class="profile-gitlab-binding-value">{{ gitlabOauthBinding.expiresAt || '未返回过期时间' }}</span>
              </div>
            </div>

            <div class="profile-gitlab-binding-note">
              未绑定时，首页“快速发起 MR”会直接阻断并提示前往个人中心完成授权。
            </div>

            <div class="profile-actions">
              <el-button type="primary" :loading="gitlabOauthAuthorizing" @click="handleGitlabOauthAuthorize">
                {{ gitlabOauthBinding.connected ? '重新授权' : '授权绑定' }}
              </el-button>
              <el-button v-if="gitlabOauthBinding.connected" :loading="gitlabOauthUnbinding" @click="handleGitlabOauthUnbind">解绑</el-button>
            </div>
          </div>
        </section>

        <section class="platform-form-section profile-theme-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">界面风格</div>
            <div class="platform-form-section-subtitle">切换当前浏览器中的界面主题，设置会保存在本地缓存中。</div>
          </div>

          <div class="profile-theme-summary">
            <div>
              <div class="profile-theme-current-label">当前风格</div>
              <div class="profile-theme-current-name">{{ activeTheme.name }}</div>
            </div>
            <div class="profile-theme-cache-note">主题选择仅保存在当前浏览器，本机刷新后仍会保留。</div>
          </div>

          <div class="profile-theme-grid">
            <button
              v-for="theme in appStore.themePresets"
              :key="theme.id"
              class="profile-theme-card"
              :class="{ active: theme.id === appStore.currentThemeId }"
              type="button"
              :aria-pressed="theme.id === appStore.currentThemeId"
              @click="handleThemeChange(theme.id)"
            >
              <div class="profile-theme-preview" :style="{ background: theme.previewBackground }">
                <span class="profile-theme-orb primary" :style="{ background: theme.primary }"></span>
                <span class="profile-theme-orb accent" :style="{ background: theme.accent }"></span>
                <div class="profile-theme-window">
                  <span class="profile-theme-window-bar" :style="{ background: theme.surface }"></span>
                  <span class="profile-theme-window-block" :style="{ background: theme.primary }"></span>
                  <span class="profile-theme-window-line" :style="{ background: theme.accent }"></span>
                  <span class="profile-theme-window-line muted" :style="{ background: theme.surface }"></span>
                </div>
              </div>

              <div class="profile-theme-card-head">
                <div>
                  <div class="profile-theme-name">{{ theme.name }}</div>
                  <div class="profile-theme-description">{{ theme.description }}</div>
                </div>
                <span class="profile-theme-badge">{{ theme.id === appStore.currentThemeId ? '当前使用' : '点击切换' }}</span>
              </div>

              <div class="profile-theme-swatches">
                <span class="profile-theme-swatch" :style="{ background: theme.primary }"></span>
                <span class="profile-theme-swatch" :style="{ background: theme.accent }"></span>
                <span class="profile-theme-swatch muted" :style="{ background: theme.surface }"></span>
              </div>
            </button>
          </div>
        </section>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { createCurrentUserGitlabOauthAuthorizeUrl, deleteCurrentUserGitlabOauthBinding, getCurrentUserGitlabOauthBinding } from '@/api/gitlab'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import type { GitlabUserOauthBindingItem } from '@/types/platform'
import { resolveAssetUrl } from '@/utils/asset'

const authStore = useAuthStore()
const appStore = useAppStore()
const profileFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()
const avatarInputRef = ref<HTMLInputElement>()
const profileSubmitting = ref(false)
const passwordSubmitting = ref(false)
const avatarUploading = ref(false)
const gitlabOauthBindingLoading = ref(false)
const gitlabOauthAuthorizing = ref(false)
const gitlabOauthUnbinding = ref(false)
const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif'])
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

const gitlabOauthBinding = ref<GitlabUserOauthBindingItem>({
  connected: false,
  apiBaseUrl: '',
  gitlabUserId: null,
  gitlabUsername: null,
  gitlabName: null,
  expiresAt: null
})

const profileForm = reactive({
  nickname: '',
  email: '',
  phone: '',
  gitlabUsername: ''
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const profileRules: FormRules<typeof profileForm> = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }]
}

const passwordRules: FormRules<typeof passwordForm> = {
  currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的新密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur'
    }
  ]
}

const activeTheme = computed(() => appStore.currentTheme)
const profileAvatarUrl = computed(() => resolveAssetUrl(authStore.user?.avatarUrl))
const profileAvatarInitial = computed(() => (authStore.user?.nickname || authStore.user?.username || 'U').slice(0, 1).toUpperCase())

const syncFromUser = () => {
  profileForm.nickname = authStore.user?.nickname || ''
  profileForm.email = authStore.user?.email || ''
  profileForm.phone = authStore.user?.phone || ''
  profileForm.gitlabUsername = authStore.user?.gitlabUsername || ''
}

const loadGitlabOauthBinding = async () => {
  gitlabOauthBindingLoading.value = true
  try {
    gitlabOauthBinding.value = await getCurrentUserGitlabOauthBinding()
  } catch (error: any) {
    gitlabOauthBinding.value = {
      connected: false,
      apiBaseUrl: '',
      gitlabUserId: null,
      gitlabUsername: null,
      gitlabName: null,
      expiresAt: null
    }
    ElMessage.error(error?.response?.data?.message || '加载 GitLab 绑定状态失败')
  } finally {
    gitlabOauthBindingLoading.value = false
  }
}

const handleTriggerAvatarUpload = () => {
  avatarInputRef.value?.click()
}

const resetAvatarInput = () => {
  if (avatarInputRef.value) {
    avatarInputRef.value.value = ''
  }
}

// 先在前端完成基础图片校验，减少无效请求并给出更直观的提示。
const handleAvatarSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    ElMessage.warning('请上传 PNG、JPG 或 GIF 图片')
    resetAvatarInput()
    return
  }
  if (file.size > MAX_AVATAR_SIZE) {
    ElMessage.warning('头像大小不能超过 5MB')
    resetAvatarInput()
    return
  }

  avatarUploading.value = true
  try {
    await authStore.uploadAvatar(file)
    ElMessage.success('头像已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '头像上传失败')
  } finally {
    avatarUploading.value = false
    resetAvatarInput()
  }
}

const handleThemeChange = (themeId: string) => {
  // 主题切换只在前端本地完成，用户选择后立即生效并写入浏览器缓存。
  appStore.setTheme(themeId)
  const nextTheme = appStore.themePresets.find((item) => item.id === themeId)
  ElMessage.success(`已切换为${nextTheme?.name || '新风格'}`)
}

const handleSaveProfile = async () => {
  const valid = await profileFormRef.value?.validate().catch(() => false)
  if (!valid) return
  profileSubmitting.value = true
  try {
    await authStore.updateProfile({
      nickname: profileForm.nickname,
      email: profileForm.email,
      phone: profileForm.phone,
      gitlabUsername: profileForm.gitlabUsername
    })
    ElMessage.success('个人资料已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    profileSubmitting.value = false
  }
}

// 个人中心发起 GitLab OAuth 时直接跳转到 GitLab 授权页，避免在浏览器里丢失当前登录态。
const handleGitlabOauthAuthorize = async () => {
  gitlabOauthAuthorizing.value = true
  try {
    const result = await createCurrentUserGitlabOauthAuthorizeUrl({
      apiBaseUrl: gitlabOauthBinding.value.apiBaseUrl || undefined
    })
    window.location.href = result.authorizeUrl
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '生成 GitLab 授权地址失败')
    gitlabOauthAuthorizing.value = false
  }
}

const handleGitlabOauthUnbind = async () => {
  gitlabOauthUnbinding.value = true
  try {
    await deleteCurrentUserGitlabOauthBinding()
    await loadGitlabOauthBinding()
    ElMessage.success('GitLab 账户绑定已解绑')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '解绑 GitLab 账户失败')
  } finally {
    gitlabOauthUnbinding.value = false
  }
}

const handleChangePassword = async () => {
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return
  passwordSubmitting.value = true
  try {
    await authStore.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordFormRef.value?.clearValidate()
    ElMessage.success('密码已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '密码更新失败')
  } finally {
    passwordSubmitting.value = false
  }
}

onMounted(() => {
  syncFromUser()
  void loadGitlabOauthBinding()
})
</script>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.profile-card {
  flex: 1 1 auto;
}

.profile-header {
  margin-bottom: 18px;
}

.profile-title {
  font-size: 22px;
  font-weight: 700;
  color: #17324c;
}

.profile-subtitle {
  margin-top: 6px;
  color: #72859a;
  font-size: 13px;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.profile-identity-panel {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.profile-avatar-shell {
  width: 88px;
  height: 88px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 24px;
  background: linear-gradient(135deg, var(--app-primary-container) 0%, var(--app-primary) 100%);
  color: #fff;
  font-size: 28px;
  font-weight: 800;
  box-shadow: 0 14px 30px rgba(var(--app-primary-rgb), 0.18);
  overflow: hidden;
}

.profile-avatar-shell.uploading {
  opacity: 0.72;
}

.profile-avatar-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.profile-identity-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 22px;
  font-weight: 800;
}

.profile-identity-subtitle {
  margin-top: 8px;
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.7;
}

.profile-avatar-actions-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.profile-avatar-input {
  display: none;
}

.profile-avatar-tip {
  color: var(--app-text-muted);
  font-size: 12px;
  text-align: right;
}

.profile-theme-section {
  grid-column: 1 / -1;
}

.profile-theme-summary {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.78);
}

.profile-theme-current-label {
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.profile-theme-current-name {
  margin-top: 6px;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 22px;
  font-weight: 800;
}

.profile-theme-cache-note {
  max-width: 360px;
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.7;
  text-align: right;
}

.profile-theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.profile-theme-card {
  padding: 14px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.profile-theme-card:hover {
  transform: translateY(-2px);
  border-color: rgba(var(--app-primary-rgb), 0.18);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.06);
}

.profile-theme-card.active {
  border-color: rgba(var(--app-primary-rgb), 0.3);
  box-shadow: 0 16px 30px rgba(var(--app-primary-rgb), 0.1);
}

.profile-theme-preview {
  position: relative;
  height: 132px;
  padding: 14px;
  border-radius: 14px;
  overflow: hidden;
}

.profile-theme-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(2px);
  opacity: 0.92;
}

.profile-theme-orb.primary {
  top: 14px;
  left: 16px;
  width: 52px;
  height: 52px;
}

.profile-theme-orb.accent {
  right: 20px;
  top: 18px;
  width: 28px;
  height: 28px;
}

.profile-theme-window {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  grid-template-rows: 12px 28px 8px 8px;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
}

.profile-theme-window-bar,
.profile-theme-window-block,
.profile-theme-window-line {
  display: block;
  border-radius: 999px;
}

.profile-theme-window-bar {
  grid-column: 1 / -1;
  opacity: 0.55;
}

.profile-theme-window-block {
  grid-row: 2 / 4;
  opacity: 0.9;
}

.profile-theme-window-line {
  opacity: 0.8;
}

.profile-theme-window-line.muted {
  opacity: 0.55;
}

.profile-theme-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-top: 14px;
}

.profile-theme-name {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 800;
}

.profile-theme-description {
  margin-top: 6px;
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.7;
}

.profile-theme-badge {
  flex: 0 0 auto;
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 800;
}

.profile-theme-swatches {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.profile-theme-swatch {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
}

.profile-theme-swatch.muted {
  border: 1px solid rgba(var(--app-outline-rgb), 0.08);
  box-shadow: none;
}

.profile-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.profile-gitlab-binding-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
}

.profile-gitlab-binding-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.profile-gitlab-binding-title {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 800;
}

.profile-gitlab-binding-url {
  margin-top: 6px;
  color: var(--app-text-soft);
  font-size: 13px;
  word-break: break-all;
}

.profile-gitlab-binding-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.profile-gitlab-binding-pill.connected {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.profile-gitlab-binding-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.profile-gitlab-binding-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
}

.profile-gitlab-binding-item-full {
  grid-column: 1 / -1;
}

.profile-gitlab-binding-label {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.profile-gitlab-binding-value {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
  word-break: break-all;
}

.profile-gitlab-binding-note {
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .profile-identity-panel {
    grid-template-columns: 1fr;
    justify-items: flex-start;
  }

  .profile-avatar-actions-block {
    align-items: flex-start;
  }

  .profile-avatar-tip {
    text-align: left;
  }

  .profile-theme-grid {
    grid-template-columns: 1fr;
  }

  .profile-theme-summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .profile-gitlab-binding-grid {
    grid-template-columns: 1fr;
  }

  .profile-gitlab-binding-item-full {
    grid-column: auto;
  }

  .profile-theme-cache-note {
    max-width: none;
    text-align: left;
  }
}
</style>
