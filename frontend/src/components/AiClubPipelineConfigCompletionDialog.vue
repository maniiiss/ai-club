<template>
  <el-dialog :model-value="modelValue" width="980px" class="platform-form-dialog pipeline-config-dialog" align-center @close="handleClose">
    <template #header>
      <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="DataAnalysis" />
    </template>

    <div class="pipeline-config-flow">
      <div class="pipeline-config-stepper">
        <button class="pipeline-config-step" :class="{ active: completionStep === 'template', done: completionStep === 'configure' }" type="button" @click="goBackToTemplateStep">
          <span class="pipeline-config-step-index">1</span>
          <span>选择模板</span>
        </button>
        <span class="pipeline-config-step-divider" />
        <button class="pipeline-config-step" :class="{ active: completionStep === 'configure' }" type="button" :disabled="!selectedTemplate" @click="goToConfigureStep">
          <span class="pipeline-config-step-index">2</span>
          <span>配置与预览</span>
        </button>
      </div>

      <section v-if="completionStep === 'template'" class="pipeline-template-stage">
        <div class="pipeline-template-stage-grid">
          <button
            v-for="template in templates"
            :key="template.code"
            class="pipeline-template-option"
            :class="{ active: selectedTemplateCode === template.code, disabled: template.available === false }"
            type="button"
            :disabled="template.available === false"
            @click="selectConfigTemplate(template.code)"
          >
            <span class="pipeline-template-option-head">
              <strong>{{ template.name }}</strong>
              <span>{{ template.category }}</span>
            </span>
            <span>{{ template.description }}</span>
            <span class="pipeline-template-option-meta">{{ template.defaultConfigPath }}</span>
            <span v-if="template.available === false" class="pipeline-template-unavailable">{{ template.unavailableReason || '当前模板不可用' }}</span>
          </button>
        </div>
      </section>

      <section v-else class="pipeline-config-editor">
        <div class="pipeline-config-selected-template">
          <div class="pipeline-config-selected-template-copy">
            <strong>{{ selectedTemplate?.name || '-' }}</strong>
            <span>{{ selectedTemplate?.description || '' }}</span>
          </div>
          <button class="pipeline-config-change-template" type="button" @click="goBackToTemplateStep">重新选择模板</button>
        </div>
        <div v-if="selectedTemplate" class="pipeline-template-requirements">
          <div class="pipeline-template-requirements-title">模板要求</div>
          <ul>
            <li v-for="item in selectedTemplate.requirements" :key="item">{{ item }}</li>
          </ul>
        </div>
        <el-alert
          v-if="prefillMessage"
          type="info"
          show-icon
          :closable="false"
          class="pipeline-config-prefill-alert"
        >
          <template #title>{{ prefillMessage }}</template>
        </el-alert>
        <div class="pipeline-config-editor-head">
          <div>
            <div class="pipeline-config-editor-title">{{ configPreview?.configPath || configStatus?.configPath || pipeline?.configPath || '.woodpecker.yml' }}</div>
            <div class="pipeline-config-editor-subtitle">目标分支：{{ configPreview?.branch || configStatus?.branch || pipeline?.defaultBranch || '-' }}</div>
          </div>
          <el-radio-group v-model="configEditMode" size="small" class="pipeline-config-mode-switch" @change="handleConfigModeChange">
            <el-radio-button label="form">表单配置</el-radio-button>
            <el-radio-button label="manual">手动 YAML</el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="configEditMode === 'form'" class="pipeline-config-form-mode">
          <el-form v-if="visibleTemplateParameters.length" label-position="top" class="pipeline-template-params">
            <el-form-item
              v-for="param in visibleTemplateParameters"
              :key="param.key"
              :required="param.required"
              :class="configParameterFieldClass(param)"
            >
              <template v-if="param.type !== 'switch'" #label>
                <span class="pipeline-template-param-label">
                  <span>{{ param.label }}</span>
                  <el-tooltip v-if="param.helpText" :content="param.helpText" placement="top" effect="light">
                    <button type="button" class="pipeline-template-param-help-trigger" tabindex="-1" aria-label="查看字段说明">
                      <el-icon><QuestionFilled /></el-icon>
                    </button>
                  </el-tooltip>
                </span>
              </template>
              <div v-if="param.type === 'switch'" class="pipeline-template-switch-inline">
                <span class="pipeline-template-param-label">
                  <span>{{ param.label }}</span>
                  <el-tooltip v-if="param.helpText" :content="param.helpText" placement="top" effect="light">
                    <button type="button" class="pipeline-template-param-help-trigger" tabindex="-1" aria-label="查看字段说明">
                      <el-icon><QuestionFilled /></el-icon>
                    </button>
                  </el-tooltip>
                </span>
                <el-switch
                  v-model="parameterValues[param.key]"
                  active-value="true"
                  inactive-value="false"
                  inline-prompt
                  active-text="开"
                  inactive-text="关"
                  @change="handleConfigParameterChange(param)"
                />
              </div>
              <el-radio-group
                v-else-if="param.type === 'select' && param.options.length"
                v-model="parameterValues[param.key]"
                class="pipeline-template-select-group"
                @change="handleConfigParameterChange(param)"
              >
                <el-radio-button
                  v-for="option in param.options"
                  :key="option"
                  :label="option"
                >
                  {{ configParameterOptionLabel(option) }}
                </el-radio-button>
              </el-radio-group>
              <el-input
                v-else-if="param.type === 'textarea' || configParameterUsesMultilineSecretInput(param)"
                v-model="parameterValues[param.key]"
                type="textarea"
                :rows="configParameterTextareaRows(param)"
                resize="vertical"
                :input-style="configParameterInputStyle(param)"
                :class="{ 'pipeline-config-secret-textarea': configParameterUsesMultilineSecretInput(param) }"
                :placeholder="param.placeholder"
                @change="handleConfigParameterChange(param)"
              />
              <el-input
                v-else
                v-model="parameterValues[param.key]"
                :type="param.type === 'password' ? 'password' : 'text'"
                :show-password="param.type === 'password' && !param.secret"
                :placeholder="param.placeholder"
                @change="handleConfigParameterChange(param)"
              />
            </el-form-item>
          </el-form>

          <div class="pipeline-config-preview-toolbar">
            <span>平台会按上方参数重新渲染 YAML；密码、私钥等敏感值只写入 Woodpecker secrets。</span>
            <el-button :loading="previewLoading" @click="refreshConfigPreview">生成预览</el-button>
          </div>
          <el-scrollbar max-height="360px" class="pipeline-config-preview-scroll">
            <pre class="pipeline-config-preview">{{ configPreview?.content || selectedTemplate?.contentPreview || '' }}</pre>
          </el-scrollbar>
        </div>

        <div v-else class="pipeline-config-manual-mode">
          <div class="pipeline-config-preview-toolbar">
            <span>高级模式会按下方内容创建 MR，适合需要完全手写或继续微调配置的场景。</span>
            <el-button :loading="previewLoading" @click="resetManualContentFromTemplate">从表单重新生成</el-button>
          </div>
          <el-input
            v-model="draftContent"
            type="textarea"
            :rows="18"
            resize="vertical"
            class="pipeline-config-textarea"
            placeholder="请选择模板生成 Woodpecker YAML，或在此手动编写配置"
          />
        </div>

        <el-alert
          v-if="completionResult"
          class="pipeline-config-result"
          type="success"
          show-icon
          :closable="false"
        >
          <template #title>{{ completionResult.message }}</template>
          <template #default>
            <el-link v-if="completionResult.mergeRequestUrl" :href="completionResult.mergeRequestUrl" target="_blank" type="primary">
              打开 Merge Request #{{ completionResult.mergeRequestIid || '-' }}
            </el-link>
          </template>
        </el-alert>
      </section>
    </div>

    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
        <el-button v-if="completionStep === 'template'" type="primary" :disabled="!canEnterConfigure" @click="goToConfigureStep">
          下一步
        </el-button>
        <el-button v-else @click="goBackToTemplateStep">
          上一步
        </el-button>
        <el-button v-if="completionStep === 'configure'" type="primary" :loading="completing" :disabled="!canComplete" @click="handleCompleteConfig">
          {{ isExistingConfig ? '创建更新配置 MR' : '创建配置 MR' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DataAnalysis, QuestionFilled } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  completeAiClubPipelineConfig,
  getAiClubPipelineConfigEditContext,
  getAiClubPipelineConfigStatus,
  listAiClubPipelineConfigTemplatesForPipeline,
  previewAiClubPipelineConfig
} from '@/api/cicd'
import type {
  AiClubPipelineConfigCompleteResult,
  AiClubPipelineConfigEditContextItem,
  AiClubPipelineConfigPreviewResult,
  AiClubPipelineConfigStatusItem,
  AiClubPipelineConfigTemplateItem,
  AiClubPipelineConfigTemplateParameterItem,
  AiClubPipelineItem
} from '@/types/platform'

const props = defineProps<{
  modelValue: boolean
  pipeline?: AiClubPipelineItem | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'completed'): void
}>()

const templates = ref<AiClubPipelineConfigTemplateItem[]>([])
const configStatus = ref<AiClubPipelineConfigStatusItem | null>(null)
const selectedTemplateCode = ref('')
const draftContent = ref('')
const configPreview = ref<AiClubPipelineConfigPreviewResult | null>(null)
const completionResult = ref<AiClubPipelineConfigCompleteResult | null>(null)
const previewLoading = ref(false)
const completing = ref(false)
const configEditMode = ref<'form' | 'manual'>('form')
const completionStep = ref<'template' | 'configure'>('template')
const configuredTemplateCode = ref('')
const parameterValues = reactive<Record<string, string>>({})
const prefillMessage = ref('')
const connectionTypeLabelMap: Record<string, string> = {
  DIRECT_SSH: '直连服务器',
  JUMPSERVER: '经 JumpServer',
  MANUAL_ONLY: '仅手动触发',
  PUSH_MANUAL: '推送 + 手动',
  PUSH_PULL_REQUEST_MANUAL: '推送 + 合并请求 + 手动',
  PUSH_MANUAL_TAG: '推送 + 标签 + 手动'
}

const selectedTemplate = computed(() => templates.value.find((item) => item.code === selectedTemplateCode.value) || null)
const selectedTemplateParameters = computed(() => selectedTemplate.value?.parameters || [])
const canEnterConfigure = computed(() => Boolean(selectedTemplate.value && selectedTemplate.value.available !== false))
const isExistingConfig = computed(() => configStatus.value?.status === 'PRESENT')
const dialogActionText = computed(() => (isExistingConfig.value ? '修改配置' : '补全配置'))
const dialogTitle = computed(() => (props.pipeline ? `${dialogActionText.value} - ${props.pipeline.name}` : `${dialogActionText.value}流水线配置`))
const dialogSubtitle = computed(() => (props.pipeline
  ? `${props.pipeline.projectName} / ${props.pipeline.gitlabProjectPath || props.pipeline.woodpeckerRepoFullName || '-'} · ${completionStep.value === 'template' ? '步骤 1：选择模板' : '步骤 2：配置与预览'}`
  : '选择模板生成 Woodpecker YAML，并通过 Merge Request 提交到目标分支。'))

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible || !props.pipeline) return
    resetDialogState()
    await loadDialogData(props.pipeline.id)
  }
)

/**
 * 模板参数存在两级联动：例如“部署到服务器”控制“连接方式”，
 * “连接方式”再控制直连或 JumpServer 字段，因此这里需要递归判断父字段是否也处于可见态。
 */
const isConfigParameterVisible = (param: AiClubPipelineConfigTemplateParameterItem) => {
  if (!param.dependsOnKey) return true
  const dependency = selectedTemplateParameters.value.find((item) => item.key === param.dependsOnKey)
  if (dependency && !isConfigParameterVisible(dependency)) return false
  return (parameterValues[param.dependsOnKey] || '') === (param.dependsOnValue || '')
}

const visibleTemplateParameters = computed(() => selectedTemplateParameters.value.filter((param) => isConfigParameterVisible(param)))

const canComplete = computed(() => {
  if (!props.pipeline || !selectedTemplateCode.value) return false
  if (selectedTemplate.value && selectedTemplate.value.available === false) return false
  if (configEditMode.value === 'manual') return Boolean(draftContent.value.trim())
  return visibleTemplateParameters.value.every((param) => !param.required || Boolean((parameterValues[param.key] || '').trim()) || (isExistingConfig.value && param.secret))
})

function handleClose() {
  emit('update:modelValue', false)
}

function resetDialogState() {
  templates.value = []
  configStatus.value = null
  selectedTemplateCode.value = ''
  draftContent.value = ''
  configPreview.value = null
  completionResult.value = null
  configEditMode.value = 'form'
  completionStep.value = 'template'
  configuredTemplateCode.value = ''
  prefillMessage.value = ''
  Object.keys(parameterValues).forEach((key) => delete parameterValues[key])
}

async function loadDialogData(pipelineId: number) {
  try {
    const [nextTemplates, nextStatus, editContext] = await Promise.all([
      listAiClubPipelineConfigTemplatesForPipeline(pipelineId),
      getAiClubPipelineConfigStatus(pipelineId),
      getAiClubPipelineConfigEditContext(pipelineId)
    ])
    templates.value = nextTemplates
    configStatus.value = nextStatus
    selectedTemplateCode.value = editContext.templateCode || nextTemplates.find((item) => item.available !== false)?.code || nextTemplates[0]?.code || ''
    applyEditContext(editContext)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载配置模板失败')
  }
}

function applyEditContext(editContext: AiClubPipelineConfigEditContextItem) {
  prefillMessage.value = editContext.message || ''
  if (editContext.prefillMode === 'FORM' && selectedTemplateCode.value) {
    configEditMode.value = 'form'
    configuredTemplateCode.value = selectedTemplateCode.value
    resetConfigParameterValues()
    Object.entries(editContext.parameters || {}).forEach(([key, value]) => {
      parameterValues[key] = value ?? ''
    })
  } else {
    configEditMode.value = 'manual'
    configuredTemplateCode.value = selectedTemplateCode.value
  }
  if (editContext.rawContent) {
    configPreview.value = {
      templateCode: editContext.templateCode || selectedTemplateCode.value,
      content: editContext.rawContent,
      branch: editContext.branch,
      configPath: editContext.configPath
    }
    draftContent.value = editContext.rawContent
  }
}

function selectConfigTemplate(templateCode: string) {
  const template = templates.value.find((item) => item.code === templateCode)
  if (template?.available === false) return
  selectedTemplateCode.value = templateCode
  completionResult.value = null
  if (configuredTemplateCode.value && configuredTemplateCode.value !== templateCode) {
    configPreview.value = null
    draftContent.value = ''
    configuredTemplateCode.value = ''
  }
}

function resetConfigParameterValues() {
  Object.keys(parameterValues).forEach((key) => delete parameterValues[key])
  selectedTemplateParameters.value.forEach((param) => {
    parameterValues[param.key] = param.defaultValue || ''
  })
}

function buildConfigParametersPayload() {
  const payload: Record<string, string> = {}
  selectedTemplateParameters.value.forEach((param) => {
    if (!isConfigParameterVisible(param)) {
      return
    }
    payload[param.key] = parameterValues[param.key] ?? ''
  })
  return payload
}

function goBackToTemplateStep() {
  completionStep.value = 'template'
}

async function goToConfigureStep() {
  if (!canEnterConfigure.value) return
  completionStep.value = 'configure'
  if (configuredTemplateCode.value !== selectedTemplateCode.value) {
    configEditMode.value = 'form'
    completionResult.value = null
    configPreview.value = null
    draftContent.value = ''
    resetConfigParameterValues()
    configuredTemplateCode.value = selectedTemplateCode.value
  }
  if (!configPreview.value) {
    await refreshConfigPreview()
  }
}

function findMissingPreviewParameter() {
  return visibleTemplateParameters.value.find((param) => param.required && !param.secret && !(parameterValues[param.key] || '').trim())
}

async function handleConfigParameterChange(param: AiClubPipelineConfigTemplateParameterItem) {
  completionResult.value = null
  if (configEditMode.value === 'form' && !param.secret) {
    await refreshConfigPreview()
  }
}

async function handleConfigModeChange() {
  completionResult.value = null
  if (configEditMode.value === 'manual') {
    if (!draftContent.value.trim()) {
      draftContent.value = configPreview.value?.content || selectedTemplate.value?.contentPreview || ''
    }
    return
  }
  await refreshConfigPreview()
}

async function refreshConfigPreview() {
  if (!props.pipeline || !selectedTemplateCode.value) return
  if (configEditMode.value === 'form' && findMissingPreviewParameter()) {
    const fallbackContent = selectedTemplate.value?.contentPreview || ''
    configPreview.value = {
      templateCode: selectedTemplateCode.value,
      content: fallbackContent,
      branch: configStatus.value?.branch || props.pipeline.defaultBranch || '-',
      configPath: configStatus.value?.configPath || props.pipeline.configPath || '.woodpecker.yml'
    }
    draftContent.value = fallbackContent
    return
  }
  previewLoading.value = true
  try {
    const preview = await previewAiClubPipelineConfig(props.pipeline.id, {
      templateCode: selectedTemplateCode.value,
      parameters: buildConfigParametersPayload(),
      manualEdit: configEditMode.value === 'manual',
      content: configEditMode.value === 'manual' ? draftContent.value : undefined
    })
    configPreview.value = preview
    if (configEditMode.value === 'form') {
      draftContent.value = preview.content
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '生成配置模板失败')
  } finally {
    previewLoading.value = false
  }
}

async function resetManualContentFromTemplate() {
  const previousMode = configEditMode.value
  configEditMode.value = 'form'
  await refreshConfigPreview()
  draftContent.value = configPreview.value?.content || ''
  configEditMode.value = previousMode
}

async function handleCompleteConfig() {
  if (!props.pipeline || !selectedTemplateCode.value || !canComplete.value) return
  completing.value = true
  try {
    completionResult.value = await completeAiClubPipelineConfig(props.pipeline.id, {
      templateCode: selectedTemplateCode.value,
      parameters: buildConfigParametersPayload(),
      manualEdit: configEditMode.value === 'manual',
      content: configEditMode.value === 'manual' ? draftContent.value : undefined
    })
    ElMessage.success(isExistingConfig.value ? '流水线配置更新 MR 已创建' : '流水线配置 MR 已创建')
    configStatus.value = await getAiClubPipelineConfigStatus(props.pipeline.id)
    emit('completed')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建配置 MR 失败')
  } finally {
    completing.value = false
  }
}

function configParameterTextareaRows(param: AiClubPipelineConfigTemplateParameterItem) {
  if (configParameterUsesMultilineSecretInput(param)) return 5
  if (param.secret) return 2
  if (/serverDeployCommands|sshCommands/i.test(param.key)) return 5
  if (/tags/i.test(param.key)) return 4
  return 3
}

function configParameterUsesMultilineSecretInput(param: AiClubPipelineConfigTemplateParameterItem) {
  return param.type === 'password' && /privatekey|secretkey|pem|certificate/i.test(param.key)
}

function configParameterInputStyle(param: AiClubPipelineConfigTemplateParameterItem) {
  if (!configParameterUsesMultilineSecretInput(param)) {
    return undefined
  }
  return {
    WebkitTextSecurity: 'disc'
  }
}

function configParameterOptionLabel(option: string) {
  return connectionTypeLabelMap[option] || option
}

function configParameterFieldClass(param: AiClubPipelineConfigTemplateParameterItem) {
  return {
    'param-span-full': configParameterShouldSpanFull(param),
    'param-span-medium': configParameterShouldSpanMedium(param),
    'param-span-compact': configParameterShouldSpanCompact(param),
    'param-switch-item': param.type === 'switch'
  }
}

function configParameterShouldSpanFull(param: AiClubPipelineConfigTemplateParameterItem) {
  return param.type === 'textarea'
    || configParameterUsesMultilineSecretInput(param)
    || param.type === 'switch'
    || param.type === 'select'
    || ['projectRoot', 'registryUrl', 'imageRepo', 'dockerfile', 'serverDeploySourcePath', 'serverDeployRemotePath'].includes(param.key)
}

function configParameterShouldSpanCompact(param: AiClubPipelineConfigTemplateParameterItem) {
  return !configParameterShouldSpanFull(param)
    && [
      'branch',
      'javaImage',
      'nodeImage',
      'pythonImage',
      'shellImage',
      'directSshPort',
      'directSshUser',
      'jumpServerPort',
      'jumpServerUser',
      'jumpTargetUser',
      'serverDeployDirectPort',
      'serverDeployDirectUser',
      'serverDeployJumpPort',
      'serverDeployJumpUser',
      'serverDeployJumpTargetUser'
    ].includes(param.key)
}

function configParameterShouldSpanMedium(param: AiClubPipelineConfigTemplateParameterItem) {
  return !configParameterShouldSpanFull(param) && !configParameterShouldSpanCompact(param)
}
</script>

<style scoped>
.pipeline-config-flow {
  display: grid;
  gap: 16px;
}

.pipeline-config-stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pipeline-config-step {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  color: var(--app-muted);
  font-size: 13px;
  font-weight: 600;
  background: transparent;
  border: none;
  cursor: pointer;
}

.pipeline-config-step:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.pipeline-config-step.active,
.pipeline-config-step.done {
  color: var(--app-text);
}

.pipeline-config-step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--app-muted);
  background: rgba(148, 163, 184, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  flex: 0 0 auto;
}

.pipeline-config-step.active .pipeline-config-step-index,
.pipeline-config-step.done .pipeline-config-step-index {
  color: var(--app-primary);
  background: rgba(37, 99, 235, 0.1);
  border-color: rgba(37, 99, 235, 0.24);
}

.pipeline-config-step-divider {
  flex: 1 1 auto;
  height: 1px;
  background: var(--app-border);
}

.pipeline-template-stage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.pipeline-template-option {
  display: grid;
  gap: 8px;
  width: 100%;
  padding: 12px;
  color: var(--app-text);
  text-align: left;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  cursor: pointer;
}

.pipeline-template-option:hover,
.pipeline-template-option.active {
  border-color: var(--app-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08);
}

.pipeline-template-option.disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.pipeline-template-option-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pipeline-template-option-head strong {
  font-size: 14px;
}

.pipeline-template-option-head span,
.pipeline-template-option > span:nth-child(2),
.pipeline-template-option > span:nth-child(3) {
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.5;
}

.pipeline-template-option-meta {
  font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
}

.pipeline-template-unavailable {
  color: var(--el-color-danger);
}

.pipeline-config-selected-template {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(37, 99, 235, 0.05);
  border: 1px solid rgba(37, 99, 235, 0.14);
  border-radius: 8px;
}

.pipeline-config-selected-template-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.pipeline-config-selected-template-copy strong {
  color: var(--app-text);
  font-size: 14px;
}

.pipeline-config-selected-template-copy span {
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.5;
}

.pipeline-config-change-template {
  padding: 0;
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  border: none;
  cursor: pointer;
  flex: 0 0 auto;
}

.pipeline-config-editor {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.pipeline-template-requirements {
  padding: 12px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 8px;
}

.pipeline-template-requirements-title {
  color: var(--app-text);
  font-weight: 700;
}

.pipeline-template-requirements ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.6;
}

.pipeline-config-prefill-alert {
  margin-top: -2px;
}

.pipeline-config-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pipeline-config-mode-switch {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
}

.pipeline-config-mode-switch :deep(.el-radio-button__inner) {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.pipeline-config-editor-title {
  color: var(--app-text);
  font-weight: 700;
}

.pipeline-config-editor-subtitle {
  margin-top: 3px;
  color: var(--app-muted);
  font-size: 12px;
}

.pipeline-config-form-mode,
.pipeline-config-manual-mode {
  display: grid;
  gap: 12px;
}

.pipeline-template-params {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 10px 14px;
  align-items: start;
}

.pipeline-template-params :deep(.el-form-item) {
  grid-column: span 6;
  margin-bottom: 0;
}

.pipeline-template-params :deep(.el-form-item__label) {
  padding-bottom: 6px;
  line-height: 1.35;
}

.pipeline-template-params :deep(.el-form-item__content) {
  min-width: 0;
}

.pipeline-template-params :deep(.el-input__wrapper),
.pipeline-template-params :deep(.el-textarea__inner) {
  border-radius: 8px;
}

.pipeline-template-params :deep(.pipeline-config-secret-textarea .el-textarea__inner) {
  -webkit-text-security: disc;
}

.pipeline-template-params :deep(.param-span-full) {
  grid-column: 1 / -1;
}

.pipeline-template-params :deep(.param-span-medium) {
  grid-column: span 6;
}

.pipeline-template-params :deep(.param-span-compact) {
  grid-column: span 4;
}

.pipeline-template-params :deep(.param-switch-item) {
  grid-column: 1 / -1;
  padding: 2px 0 0;
}

.pipeline-template-params :deep(.param-switch-item .el-form-item__label-wrap) {
  margin: 0;
}

.pipeline-template-params :deep(.param-switch-item .el-form-item__label) {
  padding-bottom: 0;
}

.pipeline-template-params :deep(.param-switch-item .el-form-item__content) {
  min-height: 32px;
  align-items: center;
  justify-content: flex-start;
}

.pipeline-template-param-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}

.pipeline-template-switch-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.pipeline-template-param-help-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: var(--app-muted);
  background: transparent;
  border: none;
  border-radius: 999px;
  cursor: help;
}

.pipeline-template-param-help-trigger:hover {
  color: var(--app-primary);
}

.pipeline-template-select-group {
  width: 100%;
}

.pipeline-template-select-group :deep(.el-radio-button) {
  flex: 1 1 0;
}

.pipeline-template-select-group :deep(.el-radio-button__inner) {
  width: 100%;
  min-height: 30px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
  font-size: 12px;
}

.pipeline-config-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--app-muted);
  font-size: 12px;
}

.pipeline-config-preview-scroll {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: #0f172a;
}

.pipeline-config-preview {
  min-height: 220px;
  margin: 0;
  padding: 14px;
  color: #dbeafe;
  font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.pipeline-config-textarea :deep(.el-textarea__inner) {
  font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.pipeline-config-result {
  margin-top: 2px;
}

@media (max-width: 768px) {
  .pipeline-config-stepper {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .pipeline-config-step {
    justify-content: flex-start;
  }

  .pipeline-config-step-divider {
    width: 1px;
    height: 12px;
    margin-left: 12px;
  }

  .pipeline-template-stage-grid {
    grid-template-columns: 1fr;
  }

  .pipeline-config-selected-template {
    align-items: stretch;
    flex-direction: column;
  }

  .pipeline-config-editor-head {
    align-items: stretch;
    flex-direction: column;
  }

  .pipeline-template-params {
    grid-template-columns: 1fr;
  }

  .pipeline-template-params :deep(.el-form-item),
  .pipeline-template-params :deep(.param-span-full),
  .pipeline-template-params :deep(.param-span-medium),
  .pipeline-template-params :deep(.param-span-compact) {
    grid-column: 1 / -1;
  }

  .pipeline-config-preview-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
