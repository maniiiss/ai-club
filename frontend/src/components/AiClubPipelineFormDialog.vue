<template>
  <el-dialog :model-value="modelValue" width="720px" class="platform-form-dialog" align-center @close="handleClose">
    <template #header>
      <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="DataAnalysis" />
    </template>
    <el-form ref="pipelineFormRef" :model="pipelineForm" :rules="pipelineRules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">AI Club Pipeline</div>
          <div class="platform-form-section-subtitle">Provider：Woodpecker</div>
        </div>
        <el-form-item label="流水线名称" prop="name">
          <el-input v-model="pipelineForm.name" placeholder="例如：后端发布" />
        </el-form-item>
        <el-form-item label="平台项目" prop="projectId">
          <el-select v-model="pipelineForm.projectId" filterable placeholder="请选择项目" style="width: 100%" @change="handleFormProjectChange">
            <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="GitLab 绑定" prop="gitlabBindingId">
          <el-select v-model="pipelineForm.gitlabBindingId" filterable placeholder="请选择 GitLab 仓库绑定" style="width: 100%" @change="handleFormBindingChange">
            <el-option
              v-for="item in formGitlabBindingOptions"
              :key="item.id"
              :label="formatGitlabBindingLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="默认分支">
          <el-input v-model="pipelineForm.defaultBranch" placeholder="例如：main" />
        </el-form-item>
        <el-form-item label="配置文件路径">
          <el-input v-model="pipelineForm.configPath" placeholder=".woodpecker.yml" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="pipelineForm.enabled" />
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
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { DataAnalysis } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import { createAiClubPipeline, updateAiClubPipeline } from '@/api/cicd'
import { listGitlabBindingOptions } from '@/api/gitlab'
import { listProjectOptions } from '@/api/platform'
import type { AiClubPipelineItem, ProjectGitlabBindingItem, ProjectItem } from '@/types/platform'

interface PipelineForm {
  projectId: number | null
  gitlabBindingId: number | null
  name: string
  defaultBranch: string
  configPath: string
  enabled: boolean
}

const props = defineProps<{
  modelValue: boolean
  pipeline?: AiClubPipelineItem | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'saved', value: AiClubPipelineItem): void
}>()

const pipelineFormRef = ref<FormInstance>()
const submitting = ref(false)
const loadingOptions = ref(false)
const projectOptions = ref<ProjectItem[]>([])
const gitlabBindingOptions = ref<ProjectGitlabBindingItem[]>([])
const pipelineForm = reactive<PipelineForm>({
  projectId: null,
  gitlabBindingId: null,
  name: '',
  defaultBranch: '',
  configPath: '.woodpecker.yml',
  enabled: true
})

const isEditing = computed(() => Boolean(props.pipeline?.id))
const dialogTitle = computed(() => (isEditing.value ? '编辑流水线' : '新建流水线'))
const dialogSubtitle = computed(() => (isEditing.value ? '调整流水线名称、仓库绑定、分支和配置路径。' : '创建由 Woodpecker 承载的 AI Club Pipeline。'))

const pipelineRules: FormRules<PipelineForm> = {
  name: [{ required: true, message: '请输入流水线名称', trigger: 'blur' }],
  projectId: [{ required: true, message: '请选择平台项目', trigger: 'change' }],
  gitlabBindingId: [{ required: true, message: '请选择 GitLab 绑定', trigger: 'change' }]
}

const formGitlabBindingOptions = computed(() => {
  if (!pipelineForm.projectId) return gitlabBindingOptions.value
  return gitlabBindingOptions.value.filter((item) => item.projectId === pipelineForm.projectId)
})

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    await loadOptions()
    fillForm(props.pipeline || null)
  }
)

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
    const [projects, bindings] = await Promise.all([listProjectOptions(), listGitlabBindingOptions()])
    projectOptions.value = projects
    gitlabBindingOptions.value = bindings
  } finally {
    loadingOptions.value = false
  }
}

function fillForm(pipeline: AiClubPipelineItem | null) {
  if (pipeline) {
    pipelineForm.projectId = pipeline.projectId
    pipelineForm.gitlabBindingId = pipeline.gitlabBindingId
    pipelineForm.name = pipeline.name
    pipelineForm.defaultBranch = pipeline.defaultBranch || ''
    pipelineForm.configPath = pipeline.configPath || '.woodpecker.yml'
    pipelineForm.enabled = pipeline.enabled
  } else {
    const firstBinding = gitlabBindingOptions.value[0]
    pipelineForm.projectId = firstBinding?.projectId ?? projectOptions.value[0]?.id ?? null
    pipelineForm.gitlabBindingId = firstBinding?.id ?? null
    pipelineForm.name = firstBinding ? `${firstBinding.projectName} 流水线` : ''
    pipelineForm.defaultBranch = resolveDefaultBranchFromBinding(firstBinding)
    pipelineForm.configPath = '.woodpecker.yml'
    pipelineForm.enabled = true
  }
  pipelineFormRef.value?.clearValidate()
}

function handleFormProjectChange() {
  const matchedBinding = gitlabBindingOptions.value.find((item) => item.projectId === pipelineForm.projectId)
  pipelineForm.gitlabBindingId = matchedBinding?.id ?? null
  if (matchedBinding && !pipelineForm.defaultBranch.trim()) {
    pipelineForm.defaultBranch = resolveDefaultBranchFromBinding(matchedBinding)
  }
}

function handleFormBindingChange() {
  const binding = gitlabBindingOptions.value.find((item) => item.id === pipelineForm.gitlabBindingId)
  if (!binding) return
  pipelineForm.projectId = binding.projectId
  if (!pipelineForm.defaultBranch.trim()) {
    pipelineForm.defaultBranch = resolveDefaultBranchFromBinding(binding)
  }
}

function formatGitlabBindingLabel(item: ProjectGitlabBindingItem) {
  const repo = item.gitlabProjectPath || item.gitlabProjectRef
  return `${item.projectName} / ${repo}`
}

async function handleSubmit() {
  const valid = await pipelineFormRef.value?.validate().catch(() => false)
  if (!valid || pipelineForm.projectId === null || pipelineForm.gitlabBindingId === null) return
  submitting.value = true
  try {
    const payload = {
      projectId: pipelineForm.projectId,
      gitlabBindingId: pipelineForm.gitlabBindingId,
      name: pipelineForm.name,
      defaultBranch: pipelineForm.defaultBranch,
      configPath: pipelineForm.configPath || '.woodpecker.yml',
      enabled: pipelineForm.enabled
    }
    const saved = isEditing.value && props.pipeline
      ? await updateAiClubPipeline(props.pipeline.id, payload)
      : await createAiClubPipeline(payload)
    ElMessage.success(isEditing.value ? '流水线已更新' : '流水线已创建')
    emit('saved', saved)
    emit('update:modelValue', false)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}
</script>
