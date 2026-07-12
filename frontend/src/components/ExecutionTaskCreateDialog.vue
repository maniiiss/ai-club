<template>
  <el-dialog v-if="!embedded" v-model="dialogVisible" title="发起智能执行" width="760px" destroy-on-close>
    <template v-if="workItem">
      <div class="execution-create-meta">
        <span>{{ workItem.workItemType }}</span>
        <span>{{ workItem.workItemCode || '-' }}</span>
        <span>{{ workItem.name }}</span>
      </div>

      <el-alert
        v-if="!orchestrationReady"
        title="编排尚未就绪"
        description="当前项目没有可用的开发执行编排，请联系管理员在编排管理中发布平台默认或项目覆盖版本。"
        type="warning"
        :closable="false"
        show-icon
      />

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="execution-create-form">
        <section class="execution-step-section">
          <div class="execution-step-head">
            <div class="execution-step-title">涉及仓库</div>
            <div class="execution-step-subtitle">至少选择 1 个 GitLab 仓库，列表顺序就是执行顺序。</div>
          </div>

          <el-form-item label="GitLab 仓库">
            <el-select
              v-model="selectedRepositoryIds"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              placeholder="请选择要参与执行的 GitLab 仓库"
              style="width: 100%"
            >
              <el-option
                v-for="binding in availableGitlabBindings"
                :key="binding.id"
                :label="buildBindingLabel(binding)"
                :value="binding.id"
              >
                <div class="execution-binding-option">
                  <strong>{{ buildBindingLabel(binding) }}</strong>
                  <span>{{ buildBindingHint(binding) }}</span>
                </div>
              </el-option>
            </el-select>
            <div class="execution-repo-tip">不做自动推断或去重，完全按你当前选择和排序执行。</div>
            <div v-if="!loadingBindings && !availableGitlabBindings.length" class="execution-repo-tip">
              当前项目暂无可用的 GitLab 绑定，请先到仓库管理中配置。
            </div>
          </el-form-item>

          <div v-if="form.repositories.length" class="execution-repo-list">
            <div v-for="(repository, index) in form.repositories" :key="repository.bindingId" class="execution-repo-item">
              <div class="execution-repo-item-head">
                <div class="execution-repo-item-copy">
                  <strong>{{ index + 1 }}. {{ buildBindingLabel(resolveBinding(repository.bindingId)) }}</strong>
                  <span>{{ buildBindingHint(resolveBinding(repository.bindingId)) }}</span>
                </div>
                <div class="execution-repo-item-actions">
                  <el-button text size="small" :disabled="index === 0" @click="moveRepository(index, -1)">上移</el-button>
                  <el-button
                    text
                    size="small"
                    :disabled="index === form.repositories.length - 1"
                    @click="moveRepository(index, 1)"
                  >
                    下移
                  </el-button>
                  <el-button text size="small" type="danger" @click="removeRepository(repository.bindingId)">移除</el-button>
                </div>
              </div>
              <el-input
                v-model="repository.targetBranch"
                placeholder="请输入目标分支；若仓库配置了默认分支会自动带出"
              >
                <template #prepend>目标分支</template>
              </el-input>
              <div class="execution-repo-default">
                默认分支：{{ resolveBinding(repository.bindingId)?.defaultTargetBranch || '未配置' }}
              </div>
            </div>
          </div>
        </section>

        <el-form-item label="执行说明">
          <el-input
            v-model="form.inputText"
            type="textarea"
            :rows="4"
            resize="none"
            placeholder="可补充当前要智能体重点关注的背景、目标、限制或交付要求"
          />
        </el-form-item>

        <el-form-item label="上下文输入">
          <div class="execution-plan-confirm-field">
            <el-switch v-model="form.includeRequirementContext" :disabled="!contextOptions?.requirementLinked" />
            <div class="execution-plan-confirm-copy">
              <strong>带入关联需求</strong>
              <span>{{ contextOptions?.requirementNotice || '将关联需求正文作为执行上下文。' }}</span>
            </div>
          </div>
          <div class="execution-plan-confirm-field">
            <el-switch v-model="form.includeTechnicalDesignContext" :disabled="!contextOptions?.technicalDesignAvailable" />
            <div class="execution-plan-confirm-copy">
              <strong>带入技术设计</strong>
              <span>{{ contextOptions?.technicalDesignNotice || '将最新成功技术设计作为执行上下文。' }}</span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="规划确认">
          <div class="execution-plan-confirm-field">
            <el-switch v-model="form.planConfirmationRequired" />
            <div class="execution-plan-confirm-copy">
              <strong>规划完成后需我确认再继续</strong>
              <span>开启后只会先生成执行规划，并通过站内消息提醒你进入执行详情查看、编辑和确认。</span>
            </div>
          </div>
        </el-form-item>

      </el-form>
    </template>

    <template #footer>
      <div class="execution-create-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!orchestrationReady" @click="handleSubmit">创建并执行</el-button>
      </div>
    </template>
  </el-dialog>

  <template v-else-if="workItem">
    <div class="execution-create-meta">
      <span>{{ workItem.workItemType }}</span>
      <span>{{ workItem.workItemCode || '-' }}</span>
      <span>{{ workItem.name }}</span>
    </div>

    <el-alert
      v-if="!orchestrationReady"
      title="编排尚未就绪"
      description="当前项目没有可用的开发执行编排，请联系管理员在编排管理中发布平台默认或项目覆盖版本。"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="execution-create-form">
      <section class="execution-step-section">
        <div class="execution-step-head">
          <div class="execution-step-title">涉及仓库</div>
          <div class="execution-step-subtitle">至少选择 1 个 GitLab 仓库，列表顺序就是执行顺序。</div>
        </div>

        <el-form-item label="GitLab 仓库">
          <el-select
            v-model="selectedRepositoryIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择要参与执行的 GitLab 仓库"
            style="width: 100%"
          >
            <el-option
              v-for="binding in availableGitlabBindings"
              :key="binding.id"
              :label="buildBindingLabel(binding)"
              :value="binding.id"
            >
              <div class="execution-binding-option">
                <strong>{{ buildBindingLabel(binding) }}</strong>
                <span>{{ buildBindingHint(binding) }}</span>
              </div>
            </el-option>
          </el-select>
          <div class="execution-repo-tip">不做自动推断或去重，完全按你当前选择和排序执行。</div>
          <div v-if="!loadingBindings && !availableGitlabBindings.length" class="execution-repo-tip">
            当前项目暂无可用的 GitLab 绑定，请先到仓库管理中配置。
          </div>
        </el-form-item>

        <div v-if="form.repositories.length" class="execution-repo-list">
          <div v-for="(repository, index) in form.repositories" :key="repository.bindingId" class="execution-repo-item">
            <div class="execution-repo-item-head">
              <div class="execution-repo-item-copy">
                <strong>{{ index + 1 }}. {{ buildBindingLabel(resolveBinding(repository.bindingId)) }}</strong>
                <span>{{ buildBindingHint(resolveBinding(repository.bindingId)) }}</span>
              </div>
              <div class="execution-repo-item-actions">
                <el-button text size="small" :disabled="index === 0" @click="moveRepository(index, -1)">上移</el-button>
                <el-button
                  text
                  size="small"
                  :disabled="index === form.repositories.length - 1"
                  @click="moveRepository(index, 1)"
                >
                  下移
                </el-button>
                <el-button text size="small" type="danger" @click="removeRepository(repository.bindingId)">移除</el-button>
              </div>
            </div>
            <el-input
              v-model="repository.targetBranch"
              placeholder="请输入目标分支；若仓库配置了默认分支会自动带出"
            >
              <template #prepend>目标分支</template>
            </el-input>
            <div class="execution-repo-default">
              默认分支：{{ resolveBinding(repository.bindingId)?.defaultTargetBranch || '未配置' }}
            </div>
          </div>
        </div>
      </section>

          <el-form-item label="执行说明">
        <el-input
          v-model="form.inputText"
          type="textarea"
          :rows="4"
          resize="none"
          placeholder="可补充当前要智能体重点关注的背景、目标、限制或交付要求"
        />
          </el-form-item>

          <el-form-item label="上下文输入">
            <div class="execution-plan-confirm-field">
              <el-switch v-model="form.includeRequirementContext" :disabled="!contextOptions?.requirementLinked" />
              <div class="execution-plan-confirm-copy"><strong>带入关联需求</strong><span>{{ contextOptions?.requirementNotice || '将关联需求正文作为执行上下文。' }}</span></div>
            </div>
            <div class="execution-plan-confirm-field">
              <el-switch v-model="form.includeTechnicalDesignContext" :disabled="!contextOptions?.technicalDesignAvailable" />
              <div class="execution-plan-confirm-copy"><strong>带入技术设计</strong><span>{{ contextOptions?.technicalDesignNotice || '将最新成功技术设计作为执行上下文。' }}</span></div>
            </div>
          </el-form-item>

      <el-form-item label="规划确认">
        <div class="execution-plan-confirm-field">
          <el-switch v-model="form.planConfirmationRequired" />
          <div class="execution-plan-confirm-copy">
            <strong>规划完成后需我确认再继续</strong>
            <span>开启后只会先生成执行规划，并通过站内消息提醒你进入执行详情查看、编辑和确认。</span>
          </div>
        </div>
      </el-form-item>

      <div class="execution-create-footer embedded">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!orchestrationReady" @click="handleSubmit">创建并执行</el-button>
      </div>
    </el-form>
  </template>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { createExecutionTask, listExecutionOrchestrationScenarios } from '@/api/platform'
import { listGitlabBindingOptions } from '@/api/gitlab'
import { getExecutionContextOptions } from '@/api/platform'
import type { ExecutionContextOptionsSummary, ExecutionTaskItem, ProjectGitlabBindingItem, TaskItem } from '@/types/platform'

interface ExecutionTaskCreateDialogProps {
  workItem: TaskItem | null
  embedded?: boolean
}

interface ExecutionCreateForm {
  scenarioCode: string
  inputText: string
  planConfirmationRequired: boolean
  includeRequirementContext: boolean
  includeTechnicalDesignContext: boolean
  repositories: DevelopmentRepositoryFormItem[]
}

interface DevelopmentRepositoryFormItem {
  bindingId: number
  targetBranch: string
}

const props = defineProps<ExecutionTaskCreateDialogProps>()
const emit = defineEmits<{
  created: [executionTask: ExecutionTaskItem]
}>()
const dialogVisible = defineModel<boolean>({ default: false })
const formRef = ref<FormInstance>()
const loadingBindings = ref(false)
const submitting = ref(false)
const orchestrationReady = ref(false)
const gitlabBindingOptions = ref<ProjectGitlabBindingItem[]>([])
const contextOptions = ref<ExecutionContextOptionsSummary | null>(null)

const form = reactive<ExecutionCreateForm>({
  scenarioCode: 'DEVELOPMENT_IMPLEMENTATION',
  inputText: '',
  planConfirmationRequired: false,
  includeRequirementContext: true,
  includeTechnicalDesignContext: true,
  repositories: []
})

const rules: FormRules<ExecutionCreateForm> = {
  scenarioCode: [{ required: true, message: '执行场景不能为空', trigger: 'change' }]
}

const availableGitlabBindings = computed(() =>
  gitlabBindingOptions.value.filter((binding) => binding.projectId === props.workItem?.projectId && binding.enabled)
)
const selectedRepositoryIds = computed<number[]>({
  get: () => form.repositories.map((item) => item.bindingId),
  set: (bindingIds) => syncSelectedRepositories(bindingIds)
})

const resolveBinding = (bindingId: number) => availableGitlabBindings.value.find((binding) => binding.id === bindingId)
const buildBindingLabel = (binding?: ProjectGitlabBindingItem | null) =>
  binding?.gitlabProjectPath || binding?.gitlabProjectRef || `GitLab 绑定 #${binding?.id ?? '-'}`
const buildBindingHint = (binding?: ProjectGitlabBindingItem | null) => {
  if (!binding) {
    return '绑定信息不可用'
  }
  const defaultBranch = binding.defaultTargetBranch || '未配置默认分支'
  return `${binding.projectName} · 默认分支：${defaultBranch}`
}

const loadOrchestrationReadiness = async () => {
  orchestrationReady.value = false
  if (!props.workItem?.projectId) return
  try {
    const scenarios = await listExecutionOrchestrationScenarios(props.workItem.projectId)
    orchestrationReady.value = Boolean(
      scenarios.find((item) => item.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION')?.effectiveReady
    )
  } catch {
    orchestrationReady.value = false
  }
}

const loadContextOptions = async () => {
  contextOptions.value = null
  if (!props.workItem?.projectId || !props.workItem?.id) return
  try {
    contextOptions.value = await getExecutionContextOptions(props.workItem.projectId, props.workItem.id)
    form.includeRequirementContext = contextOptions.value.requirementLinked
    form.includeTechnicalDesignContext = contextOptions.value.technicalDesignAvailable
  } catch {
    contextOptions.value = null
    form.includeRequirementContext = false
    form.includeTechnicalDesignContext = false
  }
}

const loadGitlabBindings = async () => {
  loadingBindings.value = true
  try {
    gitlabBindingOptions.value = await listGitlabBindingOptions()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 GitLab 绑定失败')
  } finally {
    loadingBindings.value = false
  }
}

/**
 * 多仓列表以用户当前选择顺序为准，新增仓库默认继承绑定配置中的目标分支。
 */
const syncSelectedRepositories = (bindingIds: number[]) => {
  const existingMap = new Map(form.repositories.map((item) => [item.bindingId, item]))
  form.repositories = bindingIds.map((bindingId) => {
    const existing = existingMap.get(bindingId)
    if (existing) {
      return existing
    }
    return {
      bindingId,
      targetBranch: resolveBinding(bindingId)?.defaultTargetBranch || ''
    }
  })
}

const moveRepository = (index: number, offset: number) => {
  const targetIndex = index + offset
  if (targetIndex < 0 || targetIndex >= form.repositories.length) {
    return
  }
  const nextRepositories = [...form.repositories]
  const current = nextRepositories[index]
  nextRepositories[index] = nextRepositories[targetIndex]
  nextRepositories[targetIndex] = current
  form.repositories = nextRepositories
}

const removeRepository = (bindingId: number) => {
  form.repositories = form.repositories.filter((item) => item.bindingId !== bindingId)
}

const resetForm = () => {
  form.scenarioCode = 'DEVELOPMENT_IMPLEMENTATION'
  form.inputText = ''
  form.planConfirmationRequired = false
  form.includeRequirementContext = true
  form.includeTechnicalDesignContext = true
  contextOptions.value = null
  orchestrationReady.value = false
  form.repositories = []
  formRef.value?.clearValidate()
}

watch(
  () => dialogVisible.value,
  async (visible) => {
    if (!visible) {
      return
    }
    resetForm()
    await Promise.all([loadOrchestrationReadiness(), loadGitlabBindings(), loadContextOptions()])
  }
)

const validateDevelopmentRepositories = () => {
  if (!form.repositories.length) {
    ElMessage.warning('开发执行至少需要选择一个 GitLab 仓库')
    return false
  }
  for (const repository of form.repositories) {
    if (!repository.targetBranch.trim()) {
      ElMessage.warning(`${buildBindingLabel(resolveBinding(repository.bindingId))} 还没有填写目标分支`)
      return false
    }
  }
  return true
}

const handleSubmit = async () => {
  if (!props.workItem) {
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }
  if (!orchestrationReady.value) {
    ElMessage.warning('编排尚未就绪，请联系管理员发布开发执行编排')
    return
  }
  if (!validateDevelopmentRepositories()) {
    return
  }

  submitting.value = true
  try {
    const inputPayload: Record<string, unknown> = {}
    if (form.inputText.trim()) {
      inputPayload.inputText = form.inputText.trim()
    }
    inputPayload.includeRequirementContext = form.includeRequirementContext
    inputPayload.includeTechnicalDesignContext = form.includeTechnicalDesignContext
    inputPayload.repositories = form.repositories.map((repository) => ({
      bindingId: repository.bindingId,
      targetBranch: repository.targetBranch.trim()
    }))
    const executionTask = await createExecutionTask({
      scenarioCode: form.scenarioCode,
      projectId: props.workItem.projectId,
      workItemId: props.workItem.id,
      triggerSource: 'PAGE',
      planConfirmationRequired: form.planConfirmationRequired,
      inputPayload
    })
    emit('created', executionTask)
    dialogVisible.value = false
    ElMessage.success('执行任务已创建')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建执行任务失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.execution-create-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  color: #64748b;
  font-size: 13px;
}

.execution-plan-confirm-field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.execution-plan-confirm-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.execution-plan-confirm-copy strong {
  color: #0f172a;
  font-size: 13px;
}

.execution-create-meta span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #f1f5f9;
}

.execution-step-section {
  margin-top: 8px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 16px;
}

.execution-step-head {
  margin-bottom: 12px;
}

.execution-step-title {
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}

.execution-step-subtitle {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.execution-step-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.execution-binding-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.execution-binding-option strong {
  color: #0f172a;
  font-size: 13px;
}

.execution-binding-option span,
.execution-repo-tip,
.execution-repo-default {
  color: #64748b;
  font-size: 12px;
}

.execution-repo-tip {
  margin-top: 8px;
}

.execution-repo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.execution-repo-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: #fff;
}

.execution-repo-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.execution-repo-item-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.execution-repo-item-copy strong {
  color: #0f172a;
  font-size: 14px;
}

.execution-repo-item-copy span {
  color: #64748b;
  font-size: 12px;
}

.execution-repo-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.execution-step-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff;
}

.execution-step-item-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.execution-step-item-copy strong {
  color: #0f172a;
  font-size: 14px;
}

.execution-step-item-copy span {
  color: #64748b;
  font-size: 12px;
}

.execution-create-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 900px) {
  .execution-repo-item-head,
  .execution-step-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
