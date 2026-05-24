<template>
  <el-dialog :model-value="modelValue" width="760px" class="platform-form-dialog" align-center @close="handleClose">
    <template #header>
      <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="DataAnalysis" />
    </template>

    <section v-if="!isEditing" class="platform-form-section">
      <div class="platform-form-section-head">
        <div class="platform-form-section-title">流水线类型</div>
      </div>
      <el-radio-group v-model="providerType" class="pipeline-provider-group">
        <el-radio-button label="AI_CLUB">AI Club Pipeline</el-radio-button>
        <el-radio-button label="JENKINS">外部 Jenkins</el-radio-button>
      </el-radio-group>
    </section>

    <el-form
      v-if="providerType === 'AI_CLUB'"
      ref="aiFormRef"
      :model="aiForm"
      :rules="aiRules"
      label-position="top"
      class="platform-form-layout"
    >
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">AI Club Pipeline</div>
          <div class="platform-form-section-subtitle">Provider：Woodpecker</div>
        </div>
        <el-form-item label="流水线名称" prop="name">
          <el-input v-model="aiForm.name" placeholder="例如：后端发布" />
        </el-form-item>
        <el-form-item label="平台项目" prop="projectId">
          <el-select v-model="aiForm.projectId" filterable placeholder="请选择项目" style="width: 100%" @change="handleAiProjectChange">
            <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="GitLab 绑定" prop="gitlabBindingId">
          <el-select v-model="aiForm.gitlabBindingId" filterable placeholder="请选择 GitLab 仓库绑定" style="width: 100%" @change="handleAiBindingChange">
            <el-option
              v-for="item in aiFormGitlabBindingOptions"
              :key="item.id"
              :label="formatGitlabBindingLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="默认分支">
          <el-input v-model="aiForm.defaultBranch" placeholder="例如：main" />
        </el-form-item>
        <el-form-item label="配置文件路径">
          <el-input v-model="aiForm.configPath" placeholder=".woodpecker.yml" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="aiForm.enabled" />
        </el-form-item>
      </section>
    </el-form>

    <el-form
      v-else
      ref="jenkinsFormRef"
      :model="jenkinsForm"
      :rules="jenkinsRules"
      label-position="top"
      class="platform-form-layout"
    >
      <section class="platform-form-section">
        <div class="platform-form-section-head pipeline-form-head-with-action">
          <div>
            <div class="platform-form-section-title">外部 Jenkins 绑定</div>
            <div class="platform-form-section-subtitle">将平台项目映射到 Jenkins Job，并设置默认分支与构建参数。</div>
          </div>
          <el-button class="pipeline-manage-server-button" plain @click="openJenkinsServerManagement">
            <el-icon><Setting /></el-icon>
            <span>管理 Jenkins 服务</span>
          </el-button>
        </div>
        <el-form-item label="平台项目" prop="projectId">
          <el-select v-model="jenkinsForm.projectId" filterable placeholder="请选择项目" style="width: 100%">
            <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Jenkins 服务" prop="jenkinsServerId">
          <el-select v-model="jenkinsForm.jenkinsServerId" filterable placeholder="请选择 Jenkins 服务" style="width: 100%">
            <el-option v-for="item in jenkinsServerOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="任务名称" prop="jobName">
          <el-input v-model="jenkinsForm.jobName" placeholder="支持 folder/job 形式，例如：backend/build" />
          <div class="form-tip">保存时会实时校验该任务是否存在。</div>
        </el-form-item>
        <el-form-item label="默认分支">
          <el-input v-model="jenkinsForm.defaultBranch" placeholder="例如：main" />
          <div class="form-tip">触发构建时，如参数 JSON 中未配置 branch / BRANCH，且 Jenkins Job 已声明对应参数，系统会自动补充分支值。</div>
        </el-form-item>
        <el-form-item label="构建参数 JSON">
          <el-input v-model="jenkinsForm.buildParametersJson" type="textarea" :rows="6" placeholder='例如：{"env":"test","branch":"main"}' />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="jenkinsForm.enabled" />
        </el-form-item>
      </section>
    </el-form>

    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { DataAnalysis, Setting } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  createAiClubPipeline,
  createPipelineBinding,
  listJenkinsServerOptions,
  updateAiClubPipeline,
  updatePipelineBinding
} from '@/api/cicd'
import { listGitlabBindingOptions } from '@/api/gitlab'
import { listProjectOptions } from '@/api/platform'
import type { AiClubPipelineItem, JenkinsServerItem, ProjectGitlabBindingItem, ProjectItem, ProjectPipelineBindingItem } from '@/types/platform'

type ProviderType = 'AI_CLUB' | 'JENKINS'

interface AiPipelineForm {
  projectId: number | null
  gitlabBindingId: number | null
  name: string
  defaultBranch: string
  configPath: string
  enabled: boolean
}

interface JenkinsBindingForm {
  projectId: number | null
  jenkinsServerId: number | null
  jobName: string
  defaultBranch: string
  buildParametersJson: string
  enabled: boolean
}

const props = defineProps<{
  modelValue: boolean
  entryType?: ProviderType | null
  aiPipeline?: AiClubPipelineItem | null
  jenkinsBinding?: ProjectPipelineBindingItem | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved', value: { entryType: ProviderType; entry: AiClubPipelineItem | ProjectPipelineBindingItem }): void
}>()

const router = useRouter()
const aiFormRef = ref<FormInstance>()
const jenkinsFormRef = ref<FormInstance>()
const submitting = ref(false)
const loadingOptions = ref(false)
const providerType = ref<ProviderType>('AI_CLUB')
const projectOptions = ref<ProjectItem[]>([])
const gitlabBindingOptions = ref<ProjectGitlabBindingItem[]>([])
const jenkinsServerOptions = ref<JenkinsServerItem[]>([])

const aiForm = reactive<AiPipelineForm>({
  projectId: null,
  gitlabBindingId: null,
  name: '',
  defaultBranch: '',
  configPath: '.woodpecker.yml',
  enabled: true
})

const jenkinsForm = reactive<JenkinsBindingForm>({
  projectId: null,
  jenkinsServerId: null,
  jobName: '',
  defaultBranch: '',
  buildParametersJson: '',
  enabled: true
})

const isEditing = computed(() => Boolean(props.aiPipeline?.id || props.jenkinsBinding?.id))
const dialogTitle = computed(() => {
  if (isEditing.value) {
    return providerType.value === 'AI_CLUB' ? '编辑流水线' : '编辑 Jenkins 绑定'
  }
  return '新建流水线'
})
const dialogSubtitle = computed(() => {
  if (isEditing.value) {
    return providerType.value === 'AI_CLUB'
      ? '调整流水线名称、仓库绑定、分支和配置路径。'
      : '调整 Jenkins Job、默认分支和构建参数。'
  }
  return providerType.value === 'AI_CLUB'
    ? '创建由 Woodpecker 承载的 AI Club Pipeline。'
    : '创建一个项目级外部 Jenkins 兼容绑定。'
})

const aiRules: FormRules<AiPipelineForm> = {
  name: [{ required: true, message: '请输入流水线名称', trigger: 'blur' }],
  projectId: [{ required: true, message: '请选择平台项目', trigger: 'change' }],
  gitlabBindingId: [{ required: true, message: '请选择 GitLab 绑定', trigger: 'change' }]
}

const jenkinsRules: FormRules<JenkinsBindingForm> = {
  projectId: [{ required: true, message: '请选择平台项目', trigger: 'change' }],
  jenkinsServerId: [{ required: true, message: '请选择 Jenkins 服务', trigger: 'change' }],
  jobName: [{ required: true, message: '请输入 Job 名称', trigger: 'blur' }]
}

const aiFormGitlabBindingOptions = computed(() => {
  if (!aiForm.projectId) return gitlabBindingOptions.value
  return gitlabBindingOptions.value.filter((item) => item.projectId === aiForm.projectId)
})

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    await loadOptions()
    initializeProviderType()
    fillForms()
  }
)

function initializeProviderType() {
  if (props.entryType) {
    providerType.value = props.entryType
    return
  }
  if (props.jenkinsBinding) {
    providerType.value = 'JENKINS'
    return
  }
  providerType.value = 'AI_CLUB'
}

function handleClose() {
  emit('update:modelValue', false)
}

function resolveDefaultBranchFromBinding(binding?: ProjectGitlabBindingItem | null) {
  return binding?.defaultTargetBranch || binding?.productMainBranch || 'main'
}

async function loadOptions() {
  if (loadingOptions.value) return
  loadingOptions.value = true
  try {
    const [projects, bindings, servers] = await Promise.all([
      listProjectOptions(),
      listGitlabBindingOptions(),
      listJenkinsServerOptions()
    ])
    projectOptions.value = projects
    gitlabBindingOptions.value = bindings
    jenkinsServerOptions.value = servers
  } finally {
    loadingOptions.value = false
  }
}

function fillForms() {
  if (props.aiPipeline) {
    aiForm.projectId = props.aiPipeline.projectId
    aiForm.gitlabBindingId = props.aiPipeline.gitlabBindingId
    aiForm.name = props.aiPipeline.name
    aiForm.defaultBranch = props.aiPipeline.defaultBranch || ''
    aiForm.configPath = props.aiPipeline.configPath || '.woodpecker.yml'
    aiForm.enabled = props.aiPipeline.enabled
  } else {
    const firstBinding = gitlabBindingOptions.value[0]
    aiForm.projectId = firstBinding?.projectId ?? projectOptions.value[0]?.id ?? null
    aiForm.gitlabBindingId = firstBinding?.id ?? null
    aiForm.name = firstBinding ? `${firstBinding.projectName} 流水线` : ''
    aiForm.defaultBranch = resolveDefaultBranchFromBinding(firstBinding)
    aiForm.configPath = '.woodpecker.yml'
    aiForm.enabled = true
  }

  if (props.jenkinsBinding) {
    jenkinsForm.projectId = props.jenkinsBinding.projectId
    jenkinsForm.jenkinsServerId = props.jenkinsBinding.jenkinsServerId
    jenkinsForm.jobName = props.jenkinsBinding.jobName
    jenkinsForm.defaultBranch = props.jenkinsBinding.defaultBranch || ''
    jenkinsForm.buildParametersJson = props.jenkinsBinding.buildParametersJson || ''
    jenkinsForm.enabled = props.jenkinsBinding.enabled
  } else {
    jenkinsForm.projectId = projectOptions.value[0]?.id ?? null
    jenkinsForm.jenkinsServerId = jenkinsServerOptions.value[0]?.id ?? null
    jenkinsForm.jobName = ''
    jenkinsForm.defaultBranch = ''
    jenkinsForm.buildParametersJson = ''
    jenkinsForm.enabled = true
  }

  aiFormRef.value?.clearValidate()
  jenkinsFormRef.value?.clearValidate()
}

function handleAiProjectChange() {
  const matchedBinding = gitlabBindingOptions.value.find((item) => item.projectId === aiForm.projectId)
  aiForm.gitlabBindingId = matchedBinding?.id ?? null
  if (matchedBinding && !aiForm.defaultBranch.trim()) {
    aiForm.defaultBranch = resolveDefaultBranchFromBinding(matchedBinding)
  }
}

function handleAiBindingChange() {
  const binding = gitlabBindingOptions.value.find((item) => item.id === aiForm.gitlabBindingId)
  if (!binding) return
  aiForm.projectId = binding.projectId
  if (!aiForm.defaultBranch.trim()) {
    aiForm.defaultBranch = resolveDefaultBranchFromBinding(binding)
  }
}

function formatGitlabBindingLabel(item: ProjectGitlabBindingItem) {
  const repo = item.gitlabProjectPath || item.gitlabProjectRef
  return `${item.projectName} / ${repo}`
}

function openJenkinsServerManagement() {
  router.push({ name: 'cicd-servers' })
}

async function handleSubmit() {
  submitting.value = true
  try {
    if (providerType.value === 'AI_CLUB') {
      const valid = await aiFormRef.value?.validate().catch(() => false)
      if (!valid || aiForm.projectId === null || aiForm.gitlabBindingId === null) return
      const payload = {
        projectId: aiForm.projectId,
        gitlabBindingId: aiForm.gitlabBindingId,
        name: aiForm.name,
        defaultBranch: aiForm.defaultBranch,
        configPath: aiForm.configPath || '.woodpecker.yml',
        enabled: aiForm.enabled
      }
      const saved = props.aiPipeline
        ? await updateAiClubPipeline(props.aiPipeline.id, payload)
        : await createAiClubPipeline(payload)
      ElMessage.success(props.aiPipeline ? '流水线已更新' : '流水线已创建')
      emit('saved', { entryType: 'AI_CLUB', entry: saved })
      emit('update:modelValue', false)
      return
    }

    const valid = await jenkinsFormRef.value?.validate().catch(() => false)
    if (!valid || jenkinsForm.projectId === null || jenkinsForm.jenkinsServerId === null) return
    const payload = {
      projectId: jenkinsForm.projectId,
      jenkinsServerId: jenkinsForm.jenkinsServerId,
      jobName: jenkinsForm.jobName,
      defaultBranch: jenkinsForm.defaultBranch,
      buildParametersJson: jenkinsForm.buildParametersJson,
      enabled: jenkinsForm.enabled
    }
    const saved = props.jenkinsBinding
      ? await updatePipelineBinding(props.jenkinsBinding.id, payload)
      : await createPipelineBinding(payload)
    ElMessage.success(props.jenkinsBinding ? 'Jenkins 绑定已更新' : 'Jenkins 绑定已创建')
    emit('saved', { entryType: 'JENKINS', entry: saved })
    emit('update:modelValue', false)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.pipeline-provider-group {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 4px;
  border-radius: 18px;
  background: rgba(243, 244, 245, 0.94);
}

.pipeline-provider-group :deep(.el-radio-button) {
  flex: 0 0 auto;
}

.pipeline-provider-group :deep(.el-radio-button__inner) {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  line-height: 1;
  white-space: nowrap;
}

.pipeline-form-head-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pipeline-form-head-with-action > div:first-child {
  min-width: 0;
}

.pipeline-manage-server-button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  color: var(--app-text);
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(var(--app-outline-rgb), 0.18);
  box-shadow: none;
}

.pipeline-manage-server-button:hover,
.pipeline-manage-server-button:focus-visible {
  color: var(--app-primary);
  background: rgba(var(--app-primary-rgb), 0.08);
  border-color: rgba(var(--app-primary-rgb), 0.18);
}

.pipeline-manage-server-button :deep(.el-icon) {
  margin-right: 6px;
}

@media (max-width: 760px) {
  .pipeline-form-head-with-action {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
