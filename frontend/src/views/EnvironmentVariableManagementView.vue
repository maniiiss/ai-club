<template>
  <div class="management-list-page">
    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索名称、Key 或说明..."
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <button class="management-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
          <table class="management-list-table env-var-table mobile-card-table">
            <thead>
              <tr>
                <th class="env-col-main">环境变量</th>
                <th class="env-col-source center">覆盖来源</th>
                <th class="env-col-effective center">生效来源</th>
                <th class="env-col-status center">生效状态</th>
                <th class="env-col-updated">更新时间</th>
                <th class="env-col-actions right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredItems" :key="row.envKey" class="management-list-row">
                <td class="env-col-main" data-label="环境变量">
                  <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                    <div class="management-list-title-cell">
                      <span class="management-list-title-icon"><el-icon><Key /></el-icon></span>
                      <div class="management-list-title-copy">
                        <div class="management-list-title">{{ row.displayName }}</div>
                        <div class="management-list-subtitle">{{ row.envKey }}</div>
                        <div class="management-list-subtitle env-var-description">{{ row.description }}</div>
                      </div>
                    </div>
                  </button>
                </td>
                <td class="env-col-source center" data-label="覆盖来源">
                  <span class="management-list-pill neutral">{{ sourceTypeLabel(row.sourceType) }}</span>
                </td>
                <td class="env-col-effective center" data-label="生效来源">
                  <span class="management-list-pill info">{{ effectiveSourceTypeLabel(row.effectiveSourceType) }}</span>
                </td>
                <td class="env-col-status center" data-label="生效状态">
                  <span class="management-list-pill" :class="statusTone(row.effectiveStatus)">{{ statusLabel(row.effectiveStatus) }}</span>
                </td>
                <td class="env-col-updated" data-label="更新时间">
                  <span class="management-list-empty">{{ row.updatedAt || '尚未创建覆盖配置' }}</span>
                </td>
                <td class="env-col-actions right" data-label="操作">
                  <div class="management-list-row-actions">
                    <button class="management-list-row-button" type="button" title="查看详情" @click="openDetailDialog(row)">
                      <el-icon><View /></el-icon>
                    </button>
                    <button v-if="canManage" class="management-list-row-button" type="button" title="编辑配置" @click="openEditDialog(row)">
                      <el-icon><EditPen /></el-icon>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-else>
          <div v-if="filteredItems.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in filteredItems" :key="row.envKey" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon"><el-icon><Key /></el-icon></span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.displayName }}</span>
                      <span class="mobile-entity-description">{{ row.envKey }}</span>
                    </span>
                  </button>
                </header>

                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">说明</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.description }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">覆盖</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill neutral">{{ sourceTypeLabel(row.sourceType) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">生效</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill info">{{ effectiveSourceTypeLabel(row.effectiveSourceType) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="statusTone(row.effectiveStatus)">{{ statusLabel(row.effectiveStatus) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">更新时间</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.updatedAt || '尚未创建覆盖配置' }}</span>
                    </div>
                  </div>
                </div>

                <footer class="mobile-entity-actions">
                  <button class="mobile-entity-action-button" type="button" @click="openDetailDialog(row)">
                    <el-icon><View /></el-icon>
                    <span>查看</span>
                  </button>
                  <button v-if="canManage" class="mobile-entity-action-button info" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
          <div v-else class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无环境变量项" />
          </div>
        </template>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Key" />
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">变量信息</div>
            <div class="platform-form-section-subtitle">{{ currentDetail?.description || '固定注册表定义的系统级环境变量。' }}</div>
          </div>
          <el-form-item label="名称">
            <el-input :model-value="currentDetail?.displayName || ''" disabled />
          </el-form-item>
          <el-form-item label="Key">
            <el-input :model-value="currentDetail?.envKey || ''" disabled />
          </el-form-item>
          <el-form-item label="覆盖来源" prop="sourceType">
            <el-radio-group v-model="form.sourceType">
              <el-radio-button label="STATIC">固定字符串</el-radio-button>
              <el-radio-button label="HTTP">HTTP 获取</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.sourceType === 'STATIC'" :label="currentDetail?.sensitive ? '固定值' : '固定字符串'" prop="staticValue">
            <el-input
              v-model="form.staticValue"
              :type="currentDetail?.sensitive ? 'password' : 'text'"
              :show-password="!!currentDetail?.sensitive"
              :placeholder="staticValuePlaceholder"
            />
            <div class="form-tip">
              <template v-if="currentDetail?.sensitive && currentDetail?.staticValueConfigured">
                当前已配置固定值，留空保存会保留旧值。
              </template>
              <template v-else-if="currentDetail?.sensitive">
                当前是敏感项，明文不会回显。
              </template>
              <template v-else>
                保存后会立即作为当前运行时值生效。
              </template>
            </div>
          </el-form-item>
          <template v-if="form.sourceType === 'HTTP'">
            <el-form-item label="HTTP 地址" prop="httpUrl">
              <el-input v-model="form.httpUrl" placeholder="请输入返回 JSON 的 GET 地址" />
            </el-form-item>
            <el-form-item label="请求头 JSON" prop="httpHeadersJson">
              <el-input
                v-model="form.httpHeadersJson"
                type="textarea"
                :rows="4"
                placeholder='例如：{"Authorization":"Bearer xxx"}'
              />
              <div class="form-tip">
                接口必须返回 JSON 顶层 <code>value</code> 字段。{{ currentDetail?.httpHeadersConfigured ? '当前已配置请求头，留空保存会保留旧值。' : '如无需请求头，可留空。' }}
              </div>
            </el-form-item>
            <el-form-item label="当前取值">
              <el-input :model-value="currentDetail?.resolvedValuePreview || ''" disabled placeholder="保存成功后显示当前 value 预览" />
            </el-form-item>
          </template>
          <el-form-item v-else label="当前取值">
            <el-input :model-value="currentDetail?.resolvedValuePreview || ''" disabled placeholder="当前未解析到有效值" />
          </el-form-item>
          <el-form-item label="生效状态">
            <div class="env-var-status-line">
              <span class="management-list-pill" :class="statusTone(currentDetail?.effectiveStatus || 'MISSING')">{{ statusLabel(currentDetail?.effectiveStatus || 'MISSING') }}</span>
              <span class="env-var-status-copy">{{ currentDetail?.effectiveStatusMessage || '尚未配置' }}</span>
            </div>
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!readonlyMode" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { EditPen, Key, RefreshRight, Search, View } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import { getPlatformEnvVarDetail, listPlatformEnvVars, updatePlatformEnvVar, type PlatformEnvVarPayload } from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { PlatformEnvVarDetailItem, PlatformEnvVarItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

interface PlatformEnvVarForm {
  sourceType: 'STATIC' | 'HTTP'
  staticValue: string
  httpUrl: string
  httpHeadersJson: string
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:env:manage'))
const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const readonlyMode = ref(false)
const currentEnvKey = ref('')
const items = ref<PlatformEnvVarItem[]>([])
const currentDetail = ref<PlatformEnvVarDetailItem | null>(null)
const formRef = ref<FormInstance>()
const keyword = ref('')

const form = reactive<PlatformEnvVarForm>({
  sourceType: 'STATIC',
  staticValue: '',
  httpUrl: '',
  httpHeadersJson: ''
})

const filteredItems = computed(() => {
  const pattern = keyword.value.trim().toLowerCase()
  if (!pattern) {
    return items.value
  }
  return items.value.filter((item) =>
    [item.displayName, item.envKey, item.description]
      .map((value) => (value || '').toLowerCase())
      .some((value) => value.includes(pattern))
  )
})

const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return currentDetail.value?.displayName ? `查看 ${currentDetail.value.displayName}` : '查看环境变量'
  }
  return currentDetail.value?.displayName ? `编辑 ${currentDetail.value.displayName}` : '编辑环境变量'
})

const dialogSubtitle = computed(() =>
  readonlyMode.value
    ? '查看固定注册表项的当前覆盖来源、生效来源与运行时状态。'
    : '维护固定注册表项的运行时覆盖配置，保存后立即生效。'
)

const staticValuePlaceholder = computed(() => {
  if (currentDetail.value?.sensitive) {
    return currentDetail.value.staticValueConfigured ? '留空则保留原值' : '请输入固定字符串'
  }
  return '请输入固定字符串'
})

const rules: FormRules<PlatformEnvVarForm> = {
  sourceType: [{ required: true, message: '请选择覆盖来源', trigger: 'change' }],
  httpUrl: [
    {
      validator: (_rule, value: string, callback) => {
        if (form.sourceType !== 'HTTP') {
          callback()
          return
        }
        const normalized = (value || '').trim()
        if (!normalized) {
          callback(new Error('请输入 HTTP 地址'))
          return
        }
        try {
          const target = new URL(normalized)
          if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            callback(new Error('HTTP 地址仅支持 http 或 https'))
            return
          }
          callback()
        } catch {
          callback(new Error('请输入完整且合法的 HTTP 地址'))
        }
      },
      trigger: 'blur'
    }
  ],
  httpHeadersJson: [
    {
      validator: (_rule, value: string, callback) => {
        if (form.sourceType !== 'HTTP') {
          callback()
          return
        }
        const normalized = (value || '').trim()
        if (!normalized) {
          callback()
          return
        }
        try {
          const parsed = JSON.parse(normalized)
          if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
            callback(new Error('请求头必须是 JSON 对象'))
            return
          }
          callback()
        } catch {
          callback(new Error('请求头 JSON 格式不正确'))
        }
      },
      trigger: 'blur'
    }
  ]
}

const sourceTypeLabel = (sourceType?: string | null) => {
  if (sourceType === 'STATIC') return '固定字符串'
  if (sourceType === 'HTTP') return 'HTTP 获取'
  return '未覆盖'
}

const effectiveSourceTypeLabel = (sourceType?: string | null) => {
  if (sourceType === 'STATIC') return '后台固定值'
  if (sourceType === 'HTTP') return '后台 HTTP'
  if (sourceType === 'SPRING') return '配置文件回退'
  if (sourceType === 'LEGACY') return '历史绑定回退'
  return '未生效'
}

const statusLabel = (status: string) => {
  if (status === 'ACTIVE') return '已生效'
  if (status === 'ERROR') return '配置异常'
  return '未配置'
}

const statusTone = (status: string) => {
  if (status === 'ACTIVE') return 'success'
  if (status === 'ERROR') return 'danger'
  return 'neutral'
}

const fillForm = (detail: PlatformEnvVarDetailItem) => {
  form.sourceType = detail.sourceType === 'HTTP' ? 'HTTP' : 'STATIC'
  form.staticValue = detail.sensitive ? '' : detail.staticValue || ''
  form.httpUrl = detail.httpUrl || ''
  form.httpHeadersJson = ''
  formRef.value?.clearValidate()
}

const loadItems = async () => {
  loading.value = true
  try {
    items.value = await listPlatformEnvVars()
  } catch (error: any) {
    items.value = []
    ElMessage.error(error?.response?.data?.message || '加载环境变量列表失败')
  } finally {
    loading.value = false
  }
}

const loadDetail = async (envKey: string) => {
  currentEnvKey.value = envKey
  currentDetail.value = await getPlatformEnvVarDetail(envKey)
  fillForm(currentDetail.value)
}

const openDetailDialog = async (row: PlatformEnvVarItem) => {
  readonlyMode.value = true
  try {
    await loadDetail(row.envKey)
    dialogVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载环境变量详情失败')
  }
}

const openEditDialog = async (row: PlatformEnvVarItem) => {
  readonlyMode.value = false
  try {
    await loadDetail(row.envKey)
    dialogVisible.value = true
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载环境变量详情失败')
  }
}

const handleReset = () => {
  keyword.value = ''
}

const handleSubmit = async () => {
  if (!currentDetail.value) {
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }
  if (form.sourceType === 'STATIC') {
    const normalized = form.staticValue.trim()
    if (!normalized && (!currentDetail.value.sensitive || !currentDetail.value.staticValueConfigured)) {
      ElMessage.warning('请输入固定字符串后再保存')
      return
    }
  }

  const payload: PlatformEnvVarPayload = {
    sourceType: form.sourceType,
    staticValue: form.sourceType === 'STATIC' ? form.staticValue : '',
    httpUrl: form.sourceType === 'HTTP' ? form.httpUrl.trim() : null,
    httpHeadersJson: form.sourceType === 'HTTP' ? form.httpHeadersJson : null
  }

  submitting.value = true
  try {
    const detail = await updatePlatformEnvVar(currentDetail.value.envKey, payload)
    currentDetail.value = detail
    fillForm(detail)
    dialogVisible.value = false
    ElMessage.success('环境变量配置已更新')
    await loadItems()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存环境变量配置失败')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await loadItems()
})
</script>

<style scoped>
.env-var-table {
  min-width: 1180px;
}

.env-col-main {
  width: 36%;
}

.env-col-source,
.env-col-effective,
.env-col-status {
  width: 12%;
}

.env-col-updated {
  width: 18%;
}

.env-col-actions {
  width: 10%;
}

.env-var-description {
  margin-top: 4px;
  white-space: normal;
}

.env-var-status-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  flex-wrap: wrap;
}

.env-var-status-copy {
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.6;
}
</style>
