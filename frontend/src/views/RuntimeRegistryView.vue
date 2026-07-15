<template>
  <div class="management-list-page runtime-registry-page">
    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索 Runtime 编码、适配器或能力..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <button class="management-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>
      <div class="management-list-toolbar-side">
        <button class="management-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>注册 Runtime</span>
        </button>
      </div>
    </section>

    <section class="management-list-card runtime-defaults-panel">
      <div class="runtime-defaults-head">
        <div>
          <div class="runtime-defaults-title">业务场景默认 Runtime</div>
          <div class="runtime-defaults-copy">修改后只影响新建会话和新建任务，已运行或已入队任务继续使用自身快照。</div>
        </div>
        <span class="management-list-pill info">按能力过滤</span>
      </div>
      <div class="runtime-defaults-grid" v-loading="defaultsLoading">
        <article v-for="item in scenarioDefaults" :key="item.scenarioCode" class="runtime-default-card">
          <div class="runtime-default-card-title">{{ item.scenarioName }}</div>
          <div class="runtime-default-card-code">{{ item.scenarioCode }}</div>
          <select
            class="runtime-default-select"
            :value="item.runtimeRegistryCode"
            :disabled="defaultSavingCode === item.scenarioCode"
            @change="handleScenarioDefaultChange(item.scenarioCode, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="runtime in compatibleRuntimes(item)" :key="runtime.runtimeCode" :value="runtime.runtimeCode">
              {{ runtime.runtimeCode }}{{ runtime.enabled ? '' : '（已禁用）' }}
            </option>
          </select>
          <div class="runtime-default-capabilities">要求：{{ item.requiredCapabilities.map(capabilityLabel).join('、') }}</div>
        </article>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
          <table class="management-list-table runtime-registry-table mobile-card-table">
            <thead>
              <tr>
                <th class="runtime-col-main">Runtime</th>
                <th class="runtime-col-adapter">适配器</th>
                <th class="runtime-col-endpoint">部署引用</th>
                <th class="runtime-col-capabilities">能力</th>
                <th class="runtime-col-health center">健康状态</th>
                <th class="runtime-col-enabled center">启用</th>
                <th class="runtime-col-actions right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredItems" :key="row.runtimeCode" class="management-list-row">
                <td class="runtime-col-main" data-label="Runtime">
                  <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                    <div class="management-list-title-cell">
                      <span class="management-list-title-icon"><el-icon><Connection /></el-icon></span>
                      <div class="management-list-title-copy">
                        <div class="management-list-title">{{ row.runtimeCode }}</div>
                        <div class="management-list-subtitle">版本 {{ row.version || 'unknown' }} · 上下文 {{ Number(row.contextWindowTokens || 128000).toLocaleString() }} · 输出 {{ Number(row.maxOutputTokens || 8192).toLocaleString() }}</div>
                      </div>
                    </div>
                  </button>
                </td>
                <td class="runtime-col-adapter" data-label="适配器">
                  <span class="management-list-pill neutral">{{ adapterTypeLabel(row.adapterType) }}</span>
                </td>
                <td class="runtime-col-endpoint" data-label="部署引用">
                  <span class="management-list-empty">{{ row.endpointRef || '由平台配置解析' }}</span>
                </td>
                <td class="runtime-col-capabilities" data-label="能力">
                  <div class="runtime-capability-list">
                    <span v-for="capability in row.capabilities" :key="`${row.runtimeCode}-${capability}`" class="management-list-pill info">
                      {{ capabilityLabel(capability) }}
                    </span>
                    <span v-if="!row.capabilities.length" class="management-list-empty">未声明</span>
                  </div>
                </td>
                <td class="runtime-col-health center" data-label="健康状态">
                  <span class="management-list-pill" :class="healthTone(row.healthStatus)">{{ healthLabel(row.healthStatus) }}</span>
                </td>
                <td class="runtime-col-enabled center" data-label="启用">
                  <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span>
                </td>
                <td class="runtime-col-actions right" data-label="操作">
                  <div class="management-list-row-actions">
                    <button class="management-list-row-button" type="button" title="健康检查" :disabled="healthCheckingCode === row.runtimeCode" @click="handleHealthCheck(row)">
                      <el-icon><Refresh /></el-icon>
                    </button>
                    <button class="management-list-row-button" type="button" title="查看详情" @click="openDetailDialog(row)">
                      <el-icon><View /></el-icon>
                    </button>
                    <button class="management-list-row-button" type="button" title="编辑 Runtime" @click="openEditDialog(row)">
                      <el-icon><EditPen /></el-icon>
                    </button>
                    <button class="management-list-row-button" type="button" :title="row.enabled ? '禁用 Runtime' : '启用 Runtime'" @click="handleToggle(row)">
                      <el-icon><VideoPause v-if="row.enabled" /><VideoPlay v-else /></el-icon>
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
              <article v-for="row in filteredItems" :key="row.runtimeCode" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon"><el-icon><Connection /></el-icon></span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.runtimeCode }}</span>
                       <span class="mobile-entity-description">{{ adapterTypeLabel(row.adapterType) }} · 上下文 {{ Number(row.contextWindowTokens || 128000).toLocaleString() }}</span>
                    </span>
                  </button>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">健康状态</span>
                    <div class="mobile-entity-field-content"><span class="management-list-pill" :class="healthTone(row.healthStatus)">{{ healthLabel(row.healthStatus) }}</span></div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">启用</span>
                    <div class="mobile-entity-field-content"><span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</span></div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">能力</span>
                    <div class="mobile-entity-field-content runtime-capability-list">
                      <span v-for="capability in row.capabilities" :key="`${row.runtimeCode}-mobile-${capability}`" class="management-list-pill info">{{ capabilityLabel(capability) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field mobile-entity-field-full">
                    <span class="mobile-entity-field-label">状态说明</span>
                    <div class="mobile-entity-field-content"><span class="mobile-entity-empty-text">{{ row.healthMessage || '暂无状态说明' }}</span></div>
                  </div>
                </div>
                <footer class="mobile-entity-actions">
                  <button class="mobile-entity-action-button" type="button" :disabled="healthCheckingCode === row.runtimeCode" @click="handleHealthCheck(row)">
                    <el-icon><Refresh /></el-icon>
                    <span>健康检查</span>
                  </button>
                  <button class="mobile-entity-action-button info" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button class="mobile-entity-action-button" type="button" @click="handleToggle(row)">
                    <el-icon><VideoPause v-if="row.enabled" /><VideoPlay v-else /></el-icon>
                    <span>{{ row.enabled ? '禁用' : '启用' }}</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
          <div v-else class="mobile-entity-empty-state"><el-empty description="当前筛选条件下暂无 Runtime" /></div>
        </template>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Connection" />
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">Runtime 基本信息</div>
            <div class="platform-form-section-subtitle">endpointRef 是受控部署引用，不是给 Agent 自由填写的任意 URL。</div>
          </div>
          <div class="runtime-form-grid">
            <el-form-item label="Runtime 编码" prop="runtimeCode">
              <el-input v-model="form.runtimeCode" :disabled="isEditing" placeholder="例如 PI_RUNTIME" @blur="normalizeRuntimeCode" />
            </el-form-item>
            <el-form-item label="适配器类型" prop="adapterType">
              <el-select v-model="form.adapterType" style="width: 100%">
                <el-option v-for="item in adapterTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="部署引用" prop="endpointRef">
              <el-input v-model="form.endpointRef" placeholder="例如 pi-runtime.internal" />
            </el-form-item>
            <el-form-item label="版本" prop="version">
              <el-input v-model="form.version" placeholder="例如 0.73.1" />
            </el-form-item>
          </div>
          <el-form-item label="能力集合" prop="capabilities">
            <el-checkbox-group v-model="form.capabilities" class="runtime-capability-checkboxes">
              <el-checkbox v-for="item in capabilityOptions" :key="item.value" :label="item.value">{{ item.label }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item label="降级 Runtime" prop="fallbackRuntimeCodes">
            <el-select v-model="form.fallbackRuntimeCodes" multiple filterable allow-create default-first-option style="width: 100%" placeholder="选择或输入 Runtime 编码">
              <el-option v-for="item in runtimeCodeOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <div class="platform-form-section-head runtime-context-section-head">
            <div class="platform-form-section-title">上下文预算</div>
            <div class="platform-form-section-subtitle">上下文长度由 Runtime 管理端配置控制，修改后只影响新建会话和新建执行。</div>
          </div>
          <div class="runtime-form-grid">
            <el-form-item label="上下文窗口（tokens）" prop="contextWindowTokens">
              <el-input-number v-model="form.contextWindowTokens" :min="1" :step="1024" style="width: 100%" />
            </el-form-item>
            <el-form-item label="最大输出（tokens）" prop="maxOutputTokens">
              <el-input-number v-model="form.maxOutputTokens" :min="1" :step="256" style="width: 100%" />
            </el-form-item>
            <el-form-item label="压缩触发比例（%）" prop="compactionThresholdPercent">
              <el-input-number v-model="form.compactionThresholdPercent" :min="50" :max="95" :step="5" style="width: 100%" />
            </el-form-item>
            <el-form-item label="压缩策略" prop="compactionStrategy">
              <el-select v-model="form.compactionStrategy" style="width: 100%">
                <el-option label="Runtime 原生优先" value="NATIVE_FIRST" />
                <el-option label="Backend 兜底" value="BACKEND_FALLBACK" />
                <el-option label="禁用压缩" value="DISABLED" />
              </el-select>
            </el-form-item>
          </div>
          <div v-if="form.compactionStrategy === 'NATIVE_FIRST' && !form.capabilities.includes('NATIVE_COMPACTION')" class="form-tip">
            当前 Runtime 未声明原生压缩能力，达到阈值后将自动降级到 backend 压缩。
          </div>
          <el-form-item label="沙箱策略 JSON" prop="sandboxPolicyJson">
            <el-input v-model="form.sandboxPolicyJson" type="textarea" :rows="5" placeholder='例如：{"network":"deny-by-default","writeConfirmation":true}' />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
            <div class="form-tip">禁用后不能被新 Agent 或新任务选用，历史执行快照不受影响。</div>
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Connection, EditPen, Plus, Refresh, RefreshRight, Search, VideoPause, VideoPlay, View } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  checkRuntimeHealth,
  createRuntimeRegistry,
  listRuntimeRegistries,
  listRuntimeScenarioDefaults,
  setRuntimeRegistryEnabled,
  updateRuntimeRegistry,
  updateRuntimeScenarioDefault,
  type RuntimeRegistryItem,
  type RuntimeRegistryPayload
} from '@/api/platform'
import type { RuntimeScenarioDefaultItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

interface RuntimeRegistryForm {
  runtimeCode: string
  adapterType: RuntimeRegistryItem['adapterType']
  endpointRef: string
  version: string
  capabilities: string[]
  sandboxPolicyJson: string
  fallbackRuntimeCodes: string[]
  contextWindowTokens: number
  maxOutputTokens: number
  compactionThresholdPercent: number
  compactionStrategy: RuntimeRegistryItem['compactionStrategy']
  enabled: boolean
}

const adapterTypeOptions: Array<{ label: string; value: RuntimeRegistryItem['adapterType'] }> = [
  { label: '聊天网关', value: 'CHAT_GATEWAY' },
  { label: 'CLI 执行器', value: 'CLI_RUNNER' },
  { label: '状态化 Agent', value: 'STATEFUL_AGENT' }
]

const capabilityOptions = [
  { label: '对话', value: 'CHAT' },
  { label: '流式事件', value: 'STREAM_EVENTS' },
  { label: '会话恢复', value: 'SESSION_RESUME' },
  { label: '上下文窗口', value: 'CONTEXT_WINDOW' },
  { label: 'Token 估算', value: 'TOKEN_ESTIMATION' },
  { label: '原生压缩', value: 'NATIVE_COMPACTION' },
  { label: '平台工具', value: 'PLATFORM_TOOLS' },
  { label: '仓库读取', value: 'REPOSITORY_READ' },
  { label: '仓库写入', value: 'REPOSITORY_WRITE' },
  { label: '规划', value: 'PLAN' },
  { label: '技术设计', value: 'TECHNICAL_DESIGN' },
  { label: '开发实现', value: 'IMPLEMENT' },
  { label: '测试', value: 'TEST' }
]

const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const healthCheckingCode = ref('')
const defaultsLoading = ref(false)
const defaultSavingCode = ref('')
const keyword = ref('')
const items = ref<RuntimeRegistryItem[]>([])
const scenarioDefaults = ref<RuntimeScenarioDefaultItem[]>([])
const formRef = ref<FormInstance>()

const form = reactive<RuntimeRegistryForm>({
  runtimeCode: '',
  adapterType: 'STATEFUL_AGENT',
  endpointRef: '',
  version: 'unknown',
  capabilities: ['CHAT', 'STREAM_EVENTS'],
  sandboxPolicyJson: '{}',
  fallbackRuntimeCodes: [],
  contextWindowTokens: 128000,
  maxOutputTokens: 8192,
  compactionThresholdPercent: 80,
  compactionStrategy: 'NATIVE_FIRST',
  enabled: true
})

const dialogTitle = computed(() => isEditing.value ? `编辑 ${form.runtimeCode}` : '注册 Runtime')
const dialogSubtitle = computed(() => isEditing.value ? '更新 Runtime 的能力、沙箱策略和健康探测配置。' : '新增一个受平台治理的 Runtime 注册项。')
const runtimeCodeOptions = computed(() => items.value.map((item) => item.runtimeCode).filter((code) => code !== form.runtimeCode))
const filteredItems = computed(() => {
  const pattern = keyword.value.trim().toLowerCase()
  if (!pattern) return items.value
  return items.value.filter((item) => [item.runtimeCode, item.adapterType, item.endpointRef, item.version, ...item.capabilities]
    .some((value) => String(value || '').toLowerCase().includes(pattern)))
})

const rules: FormRules<RuntimeRegistryForm> = {
  runtimeCode: [
    { required: true, message: '请输入 Runtime 编码', trigger: 'blur' },
    { pattern: /^[A-Z][A-Z0-9_]{1,39}$/, message: '编码需使用大写字母、数字和下划线，长度 2-40', trigger: 'blur' }
  ],
  adapterType: [{ required: true, message: '请选择适配器类型', trigger: 'change' }],
  endpointRef: [{ max: 200, message: '部署引用不能超过 200 个字符', trigger: 'blur' }],
  version: [{ max: 100, message: '版本不能超过 100 个字符', trigger: 'blur' }],
  capabilities: [{ type: 'array', min: 1, message: '至少声明一项 Runtime 能力', trigger: 'change' }],
  contextWindowTokens: [{ validator: validatePositiveTokenValue('上下文窗口'), trigger: 'change' }],
  maxOutputTokens: [{ validator: validatePositiveTokenValue('最大输出 token'), trigger: 'change' }],
  compactionThresholdPercent: [{ validator: validateCompactionThreshold, trigger: 'change' }],
  sandboxPolicyJson: [{ validator: validateSandboxPolicy, trigger: 'blur' }]
}

function validatePositiveTokenValue(label: string) {
  return (_rule: unknown, value: number, callback: (error?: Error) => void) => {
    if (!Number.isInteger(value) || value <= 0) {
      callback(new Error(`${label}必须是大于 0 的整数`))
      return
    }
    callback()
  }
}

function validateCompactionThreshold(_rule: unknown, value: number, callback: (error?: Error) => void) {
  if (!Number.isInteger(value) || value < 50 || value > 95) {
    callback(new Error('压缩阈值必须是 50～95 的整数'))
    return
  }
  callback()
}

function validateSandboxPolicy(_rule: unknown, value: string, callback: (error?: Error) => void) {
  const normalized = (value || '').trim() || '{}'
  try {
    const parsed = JSON.parse(normalized)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      callback(new Error('沙箱策略必须是 JSON 对象'))
      return
    }
    callback()
  } catch {
    callback(new Error('沙箱策略 JSON 格式不正确'))
  }
}

const adapterTypeLabel = (value: RuntimeRegistryItem['adapterType']) =>
  adapterTypeOptions.find((item) => item.value === value)?.label || value

const capabilityLabel = (value: string) => capabilityOptions.find((item) => item.value === value)?.label || value

const healthLabel = (value: RuntimeRegistryItem['healthStatus']) => ({
  UNKNOWN: '待检查',
  HEALTHY: '健康',
  DEGRADED: '降级',
  UNHEALTHY: '异常',
  DISABLED: '已禁用'
}[value] || value)

const healthTone = (value: RuntimeRegistryItem['healthStatus']) => {
  if (value === 'HEALTHY') return 'success'
  if (value === 'DEGRADED') return 'warning'
  if (value === 'UNHEALTHY' || value === 'DISABLED') return 'danger'
  return 'neutral'
}

const normalizeRuntimeCode = () => {
  form.runtimeCode = form.runtimeCode.trim().toUpperCase()
}

const resetForm = () => {
  Object.assign(form, {
    runtimeCode: '',
    adapterType: 'STATEFUL_AGENT',
    endpointRef: '',
    version: 'unknown',
    capabilities: ['CHAT', 'STREAM_EVENTS'],
    sandboxPolicyJson: '{}',
    fallbackRuntimeCodes: [],
    contextWindowTokens: 128000,
    maxOutputTokens: 8192,
    compactionThresholdPercent: 80,
    compactionStrategy: 'NATIVE_FIRST',
    enabled: true
  })
  formRef.value?.clearValidate()
}

const fillForm = (row: RuntimeRegistryItem) => {
  Object.assign(form, {
    runtimeCode: row.runtimeCode,
    adapterType: row.adapterType,
    endpointRef: row.endpointRef || '',
    version: row.version || 'unknown',
    capabilities: [...row.capabilities],
    sandboxPolicyJson: row.sandboxPolicyJson || '{}',
    fallbackRuntimeCodes: [...row.fallbackRuntimeCodes],
    contextWindowTokens: row.contextWindowTokens || 128000,
    maxOutputTokens: row.maxOutputTokens || 8192,
    compactionThresholdPercent: row.compactionThresholdPercent || 80,
    compactionStrategy: row.compactionStrategy || 'NATIVE_FIRST',
    enabled: row.enabled
  })
  formRef.value?.clearValidate()
}

const openCreateDialog = () => {
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const openDetailDialog = (row: RuntimeRegistryItem) => {
  isEditing.value = true
  fillForm(row)
  dialogVisible.value = true
}

const openEditDialog = (row: RuntimeRegistryItem) => openDetailDialog(row)

const loadRegistries = async () => {
  loading.value = true
  defaultsLoading.value = true
  try {
    const [registries, defaults] = await Promise.all([listRuntimeRegistries(), listRuntimeScenarioDefaults()])
    items.value = registries
    scenarioDefaults.value = defaults
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || 'Runtime 注册项或场景默认配置加载失败')
  } finally {
    loading.value = false
    defaultsLoading.value = false
  }
}

const compatibleRuntimes = (scenario: RuntimeScenarioDefaultItem) => {
  const required = new Set(scenario.requiredCapabilities)
  const compatible = items.value.filter((item) => item.enabled && item.capabilities.every((capability) => capability) && [...required].every((capability) => item.capabilities.includes(capability)))
  const current = items.value.find((item) => item.runtimeCode === scenario.runtimeRegistryCode)
  return current && !compatible.some((item) => item.runtimeCode === current.runtimeCode) ? [current, ...compatible] : compatible
}

const handleScenarioDefaultChange = async (scenarioCode: string, runtimeRegistryCode: string) => {
  defaultSavingCode.value = scenarioCode
  try {
    const updated = await updateRuntimeScenarioDefault(scenarioCode, runtimeRegistryCode)
    const index = scenarioDefaults.value.findIndex((item) => item.scenarioCode === scenarioCode)
    if (index >= 0) scenarioDefaults.value[index] = updated
    ElMessage.success(`${updated.scenarioName} 默认 Runtime 已更新，新任务将使用 ${updated.runtimeRegistryCode}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '场景默认 Runtime 更新失败')
  } finally {
    defaultSavingCode.value = ''
  }
}

const handleSearch = () => {
  keyword.value = keyword.value.trim()
}

const handleReset = () => {
  keyword.value = ''
}

const buildPayload = (): RuntimeRegistryPayload => ({
  runtimeCode: form.runtimeCode.trim().toUpperCase(),
  adapterType: form.adapterType,
  endpointRef: form.endpointRef.trim() || null,
  version: form.version.trim() || 'unknown',
  capabilities: Array.from(new Set(form.capabilities.map((item) => item.trim().toUpperCase()).filter(Boolean))),
  sandboxPolicyJson: (form.sandboxPolicyJson.trim() || '{}'),
  fallbackRuntimeCodes: Array.from(new Set(form.fallbackRuntimeCodes.map((item) => item.trim().toUpperCase()).filter(Boolean))),
  contextWindowTokens: form.contextWindowTokens,
  maxOutputTokens: form.maxOutputTokens,
  compactionThresholdPercent: form.compactionThresholdPercent,
  compactionStrategy: form.compactionStrategy,
  enabled: form.enabled
})

const handleSubmit = async () => {
  normalizeRuntimeCode()
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const payload = buildPayload()
    if (isEditing.value) {
      await updateRuntimeRegistry(form.runtimeCode, payload)
      ElMessage.success('Runtime 注册项更新成功，请重新执行健康检查确认配置')
    } else {
      await createRuntimeRegistry(payload)
      ElMessage.success('Runtime 注册成功，请执行健康检查后再绑定 Agent')
    }
    dialogVisible.value = false
    await loadRegistries()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || 'Runtime 注册项保存失败')
  } finally {
    submitting.value = false
  }
}

const handleHealthCheck = async (row: RuntimeRegistryItem) => {
  healthCheckingCode.value = row.runtimeCode
  try {
    const updated = await checkRuntimeHealth(row.runtimeCode)
    const index = items.value.findIndex((item) => item.runtimeCode === row.runtimeCode)
    if (index >= 0) items.value[index] = updated
    ElMessage[updated.healthStatus === 'HEALTHY' ? 'success' : 'warning'](`${row.runtimeCode}：${healthLabel(updated.healthStatus)}${updated.healthMessage ? `，${updated.healthMessage}` : ''}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || `${row.runtimeCode} 健康检查失败`)
  } finally {
    healthCheckingCode.value = ''
  }
}

const handleToggle = async (row: RuntimeRegistryItem) => {
  try {
    const updated = await setRuntimeRegistryEnabled(row.runtimeCode, !row.enabled)
    const index = items.value.findIndex((item) => item.runtimeCode === row.runtimeCode)
    if (index >= 0) items.value[index] = updated
    ElMessage.success(`${row.runtimeCode} 已${updated.enabled ? '启用' : '禁用'}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || 'Runtime 启停操作失败')
  }
}

onMounted(loadRegistries)
</script>

<style scoped>
.runtime-registry-table th,
.runtime-registry-table td {
  vertical-align: middle;
}

/* 场景默认 Runtime 作为独立内容卡片，内边距、背景与圆角由 management-list-card 统一提供。 */

.runtime-defaults-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.runtime-defaults-title,
.runtime-default-card-title {
  color: var(--app-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.runtime-defaults-copy,
.runtime-default-card-code,
.runtime-default-capabilities {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.runtime-defaults-copy { margin-top: 4px; }
.runtime-default-card-code { margin-top: 3px; font-family: monospace; }

.runtime-defaults-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.runtime-default-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  padding: 13px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-bg-card);
}

.runtime-default-select {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  color: var(--app-text-primary);
  background: var(--app-bg-card);
}

.runtime-default-capabilities { line-height: 1.5; }

.runtime-col-main { width: 18%; }
.runtime-col-adapter { width: 13%; }
.runtime-col-endpoint { width: 18%; }
.runtime-col-capabilities { width: 25%; }
.runtime-col-health,
.runtime-col-enabled { width: 10%; }
.runtime-col-actions { width: 16%; }

.runtime-capability-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.runtime-capability-list .management-list-pill {
  margin: 0;
}

.runtime-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.runtime-capability-checkboxes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 14px;
}

@media (max-width: 760px) {
  .runtime-form-grid,
  .runtime-capability-checkboxes,
  .runtime-defaults-grid {
    grid-template-columns: 1fr;
  }
}
</style>
