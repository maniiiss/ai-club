<template>
  <div class="atelier-list-page">
    <section class="atelier-toolbar">
      <div class="atelier-toolbar-main">
        <div class="atelier-search-shell">
          <el-icon class="atelier-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="atelier-search-input"
            type="text"
            placeholder="搜索名称、模型或描述..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="atelier-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="modelFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="atelier-filter-popper">
          <template #reference>
            <button class="atelier-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="atelier-filter-panel atelier-compact-input">
            <div class="atelier-filter-field">
              <label>提供商</label>
              <el-select v-model="filters.provider" clearable placeholder="提供商" style="width: 100%" :teleported="false">
                <el-option label="OpenAI" value="OPENAI" />
                <el-option label="Anthropic" value="ANTHROPIC" />
              </el-select>
            </div>
            <div class="atelier-filter-field">
              <label>状态</label>
              <el-select v-model="filters.enabled" clearable placeholder="状态" style="width: 100%" :teleported="false">
                <el-option :value="true" label="启用" />
                <el-option :value="false" label="停用" />
              </el-select>
            </div>
            <div class="atelier-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="atelier-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>

      <div class="atelier-toolbar-side">
        <button class="atelier-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增模型</span>
        </button>
      </div>
    </section>

    <section class="atelier-table-shell">
      <div class="atelier-table-scroll mobile-card-scroll" v-loading="loading">
        <div class="atelier-data-list model-list-table mobile-card-list">
          <div class="atelier-data-head model-list-head">
            <div class="atelier-data-head-item model-col-main">模型配置</div>
            <div class="atelier-data-head-item model-col-provider center">提供商</div>
            <div class="atelier-data-head-item model-col-name">模型名</div>
            <div class="atelier-data-head-item model-col-api">接口地址</div>
            <div class="atelier-data-head-item model-col-key center">密钥</div>
            <div class="atelier-data-head-item model-col-status center">状态</div>
          <div class="atelier-data-head-item model-col-actions right">操作</div>
          </div>
          <div v-for="row in list" :key="row.id" class="atelier-data-row model-list-row">
            <div class="atelier-data-cell model-col-main" data-label="模型配置">
              <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                <div class="management-list-title-cell">
                  <span class="management-list-title-icon"><el-icon><Cpu /></el-icon></span>
                  <div class="management-list-title-copy">
                    <div class="management-list-title">{{ row.name }}</div>
                    <div class="management-list-subtitle">{{ row.description || '暂无描述' }}</div>
                  </div>
                </div>
              </button>
            </div>
            <div class="atelier-data-cell model-col-provider center" data-label="提供商">
              <span class="management-list-pill neutral">{{ row.provider }}</span>
            </div>
            <div class="atelier-data-cell model-col-name" data-label="模型名">
              <span class="management-list-text">{{ row.modelName }}</span>
            </div>
            <div class="atelier-data-cell model-col-api" data-label="接口地址">
              <a class="management-list-text model-api-link" :href="row.apiBaseUrl" target="_blank" rel="noreferrer">
                {{ row.apiBaseUrl }}
              </a>
            </div>
            <div class="atelier-data-cell model-col-key center" data-label="密钥">
              <span class="management-list-pill" :class="row.apiKeyConfigured ? 'success' : 'neutral'">
                {{ row.apiKeyConfigured ? '已配置' : '未配置' }}
              </span>
            </div>
            <div class="atelier-data-cell model-col-status center" data-label="状态">
              <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">
                {{ row.enabled ? '启用' : '停用' }}
              </span>
            </div>
            <div class="atelier-data-cell model-col-actions right" data-label="操作">
              <div class="management-list-row-actions">
                <button class="management-list-row-button" type="button" title="测试模型" @click="handleTest(row.id)">
                  <el-icon><Connection /></el-icon>
                </button>
                <button class="management-list-row-button" type="button" title="编辑模型" @click="openEditDialog(row)">
                  <el-icon><EditPen /></el-icon>
                </button>
                <button class="management-list-row-button danger" type="button" title="删除模型" @click="handleDelete(row.id)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

        <div class="atelier-table-footer">
          <div class="atelier-footer-total">
          共 <span>{{ pagination.total }}</span> 条
          </div>
          <div class="atelier-footer-controls">
            <div class="atelier-page-size atelier-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="atelier-page-nav">
            <button class="atelier-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="atelier-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="atelier-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px" class="platform-form-dialog" align-center>
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-width="100px" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">模型信息</div>
          <div class="platform-form-section-subtitle">配置模型提供商、访问地址与启用状态。</div>
        </div>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：代码审查模型" />
        </el-form-item>
        <el-form-item label="提供商" prop="provider">
          <el-select v-model="form.provider" style="width: 100%">
            <el-option label="OpenAI" value="OPENAI" />
            <el-option label="Anthropic" value="ANTHROPIC" />
          </el-select>
        </el-form-item>
        <el-form-item label="API 地址" prop="apiBaseUrl">
          <el-input v-model="form.apiBaseUrl" />
        </el-form-item>
        <el-form-item label="模型名" prop="modelName">
          <el-input v-model="form.modelName" placeholder="如：gpt-5.4 / claude-sonnet-4-20250514" />
        </el-form-item>
          <el-form-item label="API 密钥" prop="apiKey">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="isEditing ? '留空则保留原密钥' : '请输入 API 密钥'" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
      <el-button v-if="!readonlyMode" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Connection, Cpu, Delete, EditPen, Filter, Plus, RefreshRight, Search } from '@element-plus/icons-vue'
import { createModelConfig, deleteModelConfig, pageModelConfigs, testModelConfig, updateModelConfig } from '@/api/models'
import type { AiModelConfigItem } from '@/types/platform'

interface ModelForm {
  name: string
  provider: 'OPENAI' | 'ANTHROPIC'
  apiBaseUrl: string
  modelName: string
  apiKey: string
  description: string
  enabled: boolean
}

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const readonlyMode = ref(false)
const testingId = ref<number | null>(null)
const currentId = ref<number | null>(null)
const list = ref<AiModelConfigItem[]>([])
const formRef = ref<FormInstance>()

const pagination = reactive({ page: 1, size: 10, total: 0 })
const filters = reactive({
  keyword: '',
  provider: undefined as 'OPENAI' | 'ANTHROPIC' | undefined,
  enabled: undefined as boolean | undefined
})
const modelFilterPopoverVisible = ref(false)
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const form = reactive<ModelForm>({
  name: '',
  provider: 'OPENAI',
  apiBaseUrl: 'https://api.openai.com/v1',
  modelName: '',
  apiKey: '',
  description: '',
  enabled: true
})

watch(
  () => form.provider,
  (provider) => {
    form.apiBaseUrl = provider === 'ANTHROPIC' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'
  }
)

const rules: FormRules<ModelForm> = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  provider: [{ required: true, message: '请选择提供商', trigger: 'change' }],
  apiBaseUrl: [{ required: true, message: '请输入 API 地址', trigger: 'blur' }],
  modelName: [{ required: true, message: '请输入模型名', trigger: 'blur' }]
}

const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return '查看模型'
  }
  return isEditing.value ? '编辑模型' : '新增模型'
})

const resetForm = () => {
  currentId.value = null
  form.name = ''
  form.provider = 'OPENAI'
  form.apiBaseUrl = 'https://api.openai.com/v1'
  form.modelName = ''
  form.apiKey = ''
  form.description = ''
  form.enabled = true
  formRef.value?.clearValidate()
}

const loadData = async () => {
  loading.value = true
  try {
    const pageData = await pageModelConfigs({ ...filters, page: pagination.page, size: pagination.size })
    list.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  modelFilterPopoverVisible.value = false
  pagination.page = 1
  await loadData()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.provider = undefined
  filters.enabled = undefined
  pagination.page = 1
  await loadData()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadData()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadData()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadData()
}

const openCreateDialog = () => {
  readonlyMode.value = false
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const fillForm = (row: AiModelConfigItem) => {
  isEditing.value = true
  currentId.value = row.id
  form.name = row.name
  form.provider = row.provider
  form.apiBaseUrl = row.apiBaseUrl
  form.modelName = row.modelName
  form.apiKey = ''
  form.description = row.description
  form.enabled = row.enabled
}

const openDetailDialog = (row: AiModelConfigItem) => {
  readonlyMode.value = true
  fillForm(row)
  dialogVisible.value = true
}

const openEditDialog = (row: AiModelConfigItem) => {
  readonlyMode.value = false
  fillForm(row)
  dialogVisible.value = true
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!isEditing.value && !form.apiKey.trim()) {
    ElMessage.warning('新增模型时必须填写 API Key')
    return
  }
  submitting.value = true
  try {
    if (isEditing.value && currentId.value !== null) {
      await updateModelConfig(currentId.value, { ...form })
      ElMessage.success('模型已更新')
    } else {
      await createModelConfig({ ...form })
      ElMessage.success('模型已创建')
    }
    dialogVisible.value = false
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

const handleTest = async (id: number) => {
  testingId.value = id
  try {
    const result = await testModelConfig(id)
    await ElMessageBox.alert(result.message || '测试完成', result.success ? '测试成功' : '测试失败', {
      type: result.success ? 'success' : 'error'
    })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '模型测试失败')
  } finally {
    testingId.value = null
  }
}

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('确认删除该模型配置吗？', '提示', { type: 'warning' })
    await deleteModelConfig(id)
    ElMessage.success('模型已删除')
    await loadData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.atelier-list-page,
.atelier-table-shell,
.atelier-table-scroll {
  min-width: 0;
}

.model-list-table {
  width: 100%;
  min-width: 0;
}

.model-list-head,
.model-list-row {
  grid-template-columns:
    minmax(0, 2.3fr)
    minmax(0, 0.9fr)
    minmax(0, 1.2fr)
    minmax(0, 1.8fr)
    minmax(0, 0.9fr)
    minmax(0, 0.9fr)
    minmax(0, 1fr);
}

.model-col-main {
  min-width: 0;
}

.model-col-provider {
  min-width: 0;
}

.model-col-name {
  min-width: 0;
}

.model-col-api {
  min-width: 0;
}

.model-col-key {
  min-width: 0;
}

.model-col-status {
  min-width: 0;
}

.model-col-actions {
  min-width: 0;
}

.model-col-name .management-list-text,
.model-col-api .model-api-link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-api-link {
  color: #475569;
}

@media (max-width: 1200px) {
  .model-list-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 16px;
    padding: 14px;
  }

  .model-col-main,
  .model-col-api,
  .model-col-actions {
    grid-column: 1 / -1;
  }
}
</style>
