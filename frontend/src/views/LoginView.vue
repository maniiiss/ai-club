<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="login-showcase">
        <div class="showcase-noise"></div>
        <div class="showcase-grid"></div>
        <div class="showcase-orbit showcase-orbit-a"></div>
        <div class="showcase-orbit showcase-orbit-b"></div>

        <div class="showcase-content">
          <div class="showcase-brand">
            <span class="showcase-brand-mark">✦</span>
            <span>智枢工坊</span>
          </div>

          <div class="showcase-panel">
            <div class="showcase-icon">⌘</div>
            <h1>AI 代理工程管理平台</h1>
            <p>面向项目、智能体、任务、代码仓库与持续集成的一体化智能工作坊，帮助团队在高密度协作中保持稳定节奏。</p>
          </div>

          <div class="showcase-metrics">
            <article class="metric-card">
              <strong>99.9%</strong>
              <span>系统可用性</span>
            </article>
            <article class="metric-card">
              <strong>2.4k+</strong>
              <span>活跃代理任务</span>
            </article>
          </div>
        </div>
      </section>

      <section class="login-form-panel">
        <div class="form-brand">
          <span class="form-brand-mark">✦</span>
          <span>智枢工坊</span>
        </div>

        <div class="form-header">
          <div class="form-title">欢迎回来</div>
          <div class="form-subtitle">登录您的智能工作坊</div>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="login-form">
          <el-form-item label="用户名 / 电子邮箱" prop="username">
            <el-input v-model="form.username" size="large" placeholder="请输入用户名" @keyup.enter="handleLogin" />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              size="large"
              type="password"
              show-password
              placeholder="请输入密码"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <div class="form-extra">
            <span>安全登录 · 请妥善保管账号信息</span>
          </div>

          <el-button type="primary" size="large" class="login-btn" :loading="submitting" @click="handleLogin">
            登录
          </el-button>

          <div class="register-entry">
            <span>还没有账号？</span>
            <el-button link type="primary" @click="openRegisterDialog">立即注册</el-button>
          </div>
        </el-form>

        <div class="login-footer">
          <span>© 2026 智枢工坊，保留所有权利。</span>
        </div>
      </section>
    </div>

    <el-dialog v-model="registerDialogVisible" title="注册账号" width="560px" class="platform-form-dialog" align-center destroy-on-close>
      <el-form ref="registerFormRef" :model="registerForm" :rules="registerRules" label-width="110px" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">注册信息</div>
            <div class="platform-form-section-subtitle">提交后需要管理员在用户管理中激活账号，激活前无法登录。</div>
          </div>
          <el-form-item label="用户名" prop="username">
            <el-input v-model="registerForm.username" placeholder="请输入用户名" />
          </el-form-item>
          <el-form-item label="昵称" prop="nickname">
            <el-input v-model="registerForm.nickname" placeholder="请输入昵称" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="registerForm.email" placeholder="请输入邮箱" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="registerForm.phone" placeholder="请输入手机号" />
          </el-form-item>
          <el-form-item label="GitLab 用户名">
            <el-input v-model="registerForm.gitlabUsername" placeholder="例如：zhangsan" />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="registerForm.password" type="password" show-password placeholder="至少 6 位" />
          </el-form-item>
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input v-model="registerForm.confirmPassword" type="password" show-password placeholder="再次输入密码" />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="registerDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="registerSubmitting" @click="handleRegister">提交注册</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()
const submitting = ref(false)
const registerSubmitting = ref(false)
const registerDialogVisible = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const registerForm = reactive({
  username: '',
  nickname: '',
  email: '',
  phone: '',
  gitlabUsername: '',
  password: '',
  confirmPassword: ''
})

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const registerRules: FormRules<typeof registerForm> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入的密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur'
    }
  ]
}

const openRegisterDialog = () => {
  registerForm.username = ''
  registerForm.nickname = ''
  registerForm.email = ''
  registerForm.phone = ''
  registerForm.gitlabUsername = ''
  registerForm.password = ''
  registerForm.confirmPassword = ''
  registerFormRef.value?.clearValidate()
  registerDialogVisible.value = true
}

const handleLogin = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await authStore.login(form.username, form.password)
    ElMessage.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '登录失败')
  } finally {
    submitting.value = false
  }
}

const handleRegister = async () => {
  const valid = await registerFormRef.value?.validate().catch(() => false)
  if (!valid) return
  registerSubmitting.value = true
  try {
    await authStore.register({
      username: registerForm.username,
      nickname: registerForm.nickname,
      email: registerForm.email,
      phone: registerForm.phone,
      gitlabUsername: registerForm.gitlabUsername,
      password: registerForm.password
    })
    registerDialogVisible.value = false
    ElMessage.success('注册成功，请等待管理员激活账号')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '注册失败')
  } finally {
    registerSubmitting.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, #f8f9fa 0%, #eceeef 100%);
}

.login-shell {
  position: relative;
  display: flex;
  width: min(1240px, 100%);
  max-width: 100%;
  min-height: 720px;
  border-radius: 32px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 64px rgba(25, 28, 29, 0.1);
}

.login-showcase {
  position: relative;
  flex: 0 0 58%;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 56px 64px;
  color: var(--app-text);
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.42), transparent 32%),
    linear-gradient(180deg, rgba(231, 232, 233, 0.96), rgba(217, 218, 219, 0.88));
}

.showcase-noise,
.showcase-grid,
.showcase-orbit {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.showcase-noise {
  background:
    radial-gradient(circle at 35% 34%, rgba(255, 255, 255, 0.72), transparent 18%),
    radial-gradient(circle at 62% 48%, rgba(255, 255, 255, 0.52), transparent 28%);
  opacity: 0.9;
}

.showcase-grid {
  opacity: 0.24;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.3) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.3) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.9), transparent 78%);
}

.showcase-orbit {
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.showcase-orbit-a {
  inset: 14% auto auto 18%;
  width: 380px;
  height: 380px;
  opacity: 0.5;
}

.showcase-orbit-b {
  inset: auto 10% 10% auto;
  width: 300px;
  height: 300px;
  opacity: 0.4;
}

.showcase-content {
  position: relative;
  z-index: 1;
  width: min(560px, 100%);
}

.showcase-brand,
.form-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
}

.showcase-brand-mark,
.form-brand-mark {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--app-primary-container) 0%, var(--app-primary) 100%);
  color: #fff;
  font-size: 14px;
}

.showcase-panel {
  margin-top: 164px;
  padding: 32px 30px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.08);
}

.showcase-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  border-radius: 12px;
  color: var(--app-primary);
  background: rgba(255, 220, 195, 0.9);
  font-weight: 800;
}

.showcase-panel h1 {
  margin: 0;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 48px;
  line-height: 1.08;
  font-weight: 800;
}

.showcase-panel p {
  margin: 16px 0 0;
  color: var(--app-text-soft);
  font-size: 17px;
  line-height: 1.85;
}

.showcase-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.metric-card {
  padding: 22px 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 24px rgba(25, 28, 29, 0.06);
}

.metric-card strong {
  display: block;
  color: var(--app-primary);
  font-family: var(--app-font-heading);
  font-size: 36px;
  line-height: 1;
  font-weight: 800;
}

.metric-card span {
  display: block;
  margin-top: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.login-form-panel {
  flex: 0 0 42%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 52px 56px 36px;
  background: rgba(255, 255, 255, 0.98);
}

.form-brand {
  margin-bottom: 74px;
}

.form-header {
  margin-bottom: 34px;
}

.form-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 52px;
  font-weight: 800;
  line-height: 1.06;
}

.form-subtitle {
  margin-top: 12px;
  color: var(--app-text-soft);
  font-size: 16px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 26px;
}

.login-form :deep(.el-form-item__label) {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding-bottom: 10px;
}

.login-form :deep(.el-input__wrapper),
.login-form :deep(.el-select__wrapper) {
  min-height: 54px;
}

.form-extra {
  display: flex;
  align-items: center;
  margin: -4px 0 22px;
  color: var(--app-text-soft);
  font-size: 13px;
}

.login-btn {
  width: 100%;
  height: 54px;
  border-radius: 14px;
}

.login-btn:hover {
  opacity: 0.98;
}

.register-entry {
  margin-top: 18px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  color: var(--app-text-soft);
  font-size: 13px;
}

.login-footer {
  margin-top: auto;
  padding-top: 34px;
  color: #95a1ad;
  font-size: 12px;
}

@media (max-width: 760px) {
  .login-page {
    padding: 16px;
  }

  .login-shell {
    width: min(520px, 100%);
    min-height: unset;
    border-radius: 24px;
  }

  .login-showcase {
    display: none;
  }

  .login-form-panel {
    flex: 1 1 auto;
    padding: 32px 24px 28px;
  }

  .form-brand {
    margin-bottom: 28px;
  }

  .form-title {
    font-size: 38px;
  }

  .form-subtitle {
    font-size: 14px;
  }

  .login-footer {
    padding-top: 24px;
    text-align: center;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding: 12px;
  }

  .login-shell {
    width: 100%;
    border-radius: 20px;
  }

  .login-form-panel {
    padding: 28px 18px 24px;
  }

  .form-title {
    font-size: 32px;
  }
}
</style>
