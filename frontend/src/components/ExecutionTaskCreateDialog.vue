<template>
  <el-dialog v-model="dialogVisible" title="发起智能执行" width="760px" destroy-on-close>
    <template v-if="workItem">
      <div class="execution-create-meta">
        <span>{{ workItem.workItemType }}</span>
        <span>{{ workItem.workItemCode || '-' }}</span>
        <span>{{ workItem.name }}</span>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="execution-create-form">
        <el-form-item label="执行场景" prop="scenarioCode">
          <el-select v-model="form.scenarioCode" placeholder="请选择执行场景" style="width: 100%">
            <el-option v-for="item in scenarioOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <section v-if="isDevelopmentScenario" class="execution-step-section">
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

        <el-form-item v-if="isDevelopmentScenario" label="规划确认">
          <div class="execution-plan-confirm-field">
            <el-switch v-model="form.planConfirmationRequired" />
            <div class="execution-plan-confirm-copy">
              <strong>规划完成后需我确认再继续</strong>
              <span>开启后只会先生成执行规划，并通过站内消息提醒你进入执行详情查看、编辑和确认。</span>
            </div>
          </div>
        </el-form-item>

        <section class="execution-step-section">
          <div class="execution-step-head">
            <div class="execution-step-title">步骤 Agent 绑定</div>
            <div class="execution-step-subtitle">可留空使用系统推荐，也可手动指定每一步的执行 Agent。</div>
          </div>

          <div v-loading="loadingAgents" class="execution-step-list">
            <div v-for="step in currentStepOptions" :key="step.stepCode" class="execution-step-item">
              <div class="execution-step-item-copy">
                <strong>{{ step.stepName }}</strong>
                <span>{{ step.description }}</span>
              </div>
              <el-select v-model="form.stepAgentMap[step.stepCode]" clearable filterable placeholder="使用系统推荐" style="width: 280px">
                <el-option
                  v-for="agent in agentOptions"
                  :key="agent.id"
                  :label="buildAgentLabel(agent)"
                  :value="agent.id"
                />
              </el-select>
            </div>
          </div>
        </section>
      </el-form>
    </template>

    <template #footer>
      <div class="execution-create-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">创建并执行</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { createExecutionTask, listAgentOptions } from '@/api/platform'
import { listGitlabBindingOptions } from '@/api/gitlab'
import type { AgentItem, ExecutionTaskItem, ProjectGitlabBindingItem, TaskItem } from '@/types/platform'

interface ExecutionTaskCreateDialogProps {
  workItem: TaskItem | null
}

interface StepOption {
  stepCode: string
  stepName: string
  description: string
}

interface ExecutionCreateForm {
  scenarioCode: string
  inputText: string
  planConfirmationRequired: boolean
  stepAgentMap: Record<string, number | undefined>
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
const loadingAgents = ref(false)
const loadingBindings = ref(false)
const submitting = ref(false)
const agentOptions = ref<AgentItem[]>([])
const gitlabBindingOptions = ref<ProjectGitlabBindingItem[]>([])

const scenarioOptions = [
  { label: '需求拆解', value: 'REQUIREMENT_BREAKDOWN' },
  { label: '开发执行', value: 'DEVELOPMENT_IMPLEMENTATION' },
  { label: '测试设计 / 评审', value: 'TEST_DESIGN_OR_REVIEW' }
]

const stepOptionsMap: Record<string, StepOption[]> = {
  REQUIREMENT_BREAKDOWN: [
    { stepCode: 'PLAN', stepName: '需求拆解', description: '拆分需求、梳理目标与执行项。' }
  ],
  DEVELOPMENT_IMPLEMENTATION: [
    { stepCode: 'PLAN', stepName: '执行规划', description: '由所选 CLI Runner 或规划智能体扫描所选仓库并生成执行规划。' },
    { stepCode: 'IMPLEMENT', stepName: '开发实现', description: '由可真实执行的 Runtime / API Agent 完成代码开发。' },
    { stepCode: 'TEST', stepName: '执行测试', description: '由可真实执行的 Runtime / API Agent 完成仓库级验证。' },
    { stepCode: 'REPORT', stepName: '交付报告', description: '汇总多仓执行结果、失败位置与遗留风险。' }
  ],
  TEST_DESIGN_OR_REVIEW: [
    { stepCode: 'TEST_DESIGN', stepName: '测试设计', description: '整理测试点、测试案例和验收建议。' },
    { stepCode: 'REVIEW', stepName: '测试评审', description: '对测试设计或前序结果进行评审。' }
  ]
}

const form = reactive<ExecutionCreateForm>({
  scenarioCode: 'REQUIREMENT_BREAKDOWN',
  inputText: '',
  planConfirmationRequired: false,
  stepAgentMap: {},
  repositories: []
})

const rules: FormRules<ExecutionCreateForm> = {
  scenarioCode: [{ required: true, message: '请选择执行场景', trigger: 'change' }]
}

const currentStepOptions = computed(() => stepOptionsMap[form.scenarioCode] || [])
const isDevelopmentScenario = computed(() => form.scenarioCode === 'DEVELOPMENT_IMPLEMENTATION')
const availableGitlabBindings = computed(() =>
  gitlabBindingOptions.value.filter((binding) => binding.projectId === props.workItem?.projectId && binding.enabled)
)
const selectedRepositoryIds = computed<number[]>({
  get: () => form.repositories.map((item) => item.bindingId),
  set: (bindingIds) => syncSelectedRepositories(bindingIds)
})

/**
 * 每次切换场景时，按当前项目 Agent 重新给出步骤默认绑定，避免沿用上一个场景的不匹配选择。
 */
const resetStepAgentMapByScenario = () => {
  const nextMap: Record<string, number | undefined> = {}
  for (const step of currentStepOptions.value) {
    nextMap[step.stepCode] = recommendAgentId(form.scenarioCode, step.stepCode)
  }
  form.stepAgentMap = nextMap
}

const buildAgentLabel = (agent: AgentItem) => `${agent.name} / ${agent.category} / ${agent.accessType}`
const isExecutableAgent = (agent?: AgentItem | null) => agent ? ['HTTP_API', 'AGENT_RUNTIME'].includes(agent.accessType) : false
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

/**
 * 第一版默认推荐规则尽量复用现有 Agent 命名和 builtinCode，减少手动选择成本。
 */
const findRecommendedAgent = (...predicates: Array<(agent: AgentItem, haystack: string) => boolean>) => {
  for (const predicate of predicates) {
    const matched = agentOptions.value.find((agent) => predicate(agent, `${agent.name} ${agent.category} ${agent.type} ${agent.capability}`.toLowerCase()))
    if (matched?.id) {
      return matched.id
    }
  }
  return undefined
}

const isRuntimeType = (agent: AgentItem, runtimeType: string) =>
  agent.accessType === 'AGENT_RUNTIME' && agent.runtimeType === runtimeType

const recommendAgentId = (scenarioCode: string, stepCode: string) => {
  const normalizedStepCode = stepCode.toUpperCase()
  if (normalizedStepCode === 'PLAN' && scenarioCode === 'DEVELOPMENT_IMPLEMENTATION') {
    const planAgentId = findRecommendedAgent(
      (agent, _haystack) => isRuntimeType(agent, 'CLAUDE_CODE_CLI'),
      (agent, haystack) => agent.accessType === 'HTTP_API' && /claude/.test(haystack) && /plan|planning|规划/.test(haystack),
      (agent, haystack) => agent.accessType === 'HTTP_API' && /执行规划|开发执行规划/.test(haystack),
      (agent, haystack) => /claude/.test(haystack) && /plan|planning|规划/.test(haystack),
      (_agent, haystack) => /plan|planning|规划/.test(haystack)
    )
    if (planAgentId) {
      return planAgentId
    }
  }
  if (normalizedStepCode === 'PLAN' && scenarioCode === 'REQUIREMENT_BREAKDOWN') {
    const planAgentId = findRecommendedAgent(
      (agent, _haystack) => agent.builtinCode === 'REQUIREMENT_BREAKDOWN',
      (_agent, haystack) => /planner|规划|需求/.test(haystack)
    )
    if (planAgentId) {
      return planAgentId
    }
  }
  const match = findRecommendedAgent(
    (agent, haystack) => normalizedStepCode === 'IMPLEMENT'
      ? (isRuntimeType(agent, 'CODEX_CLI') || isRuntimeType(agent, 'CLAUDE_CODE_CLI')
        || (isExecutableAgent(agent) && /coder|code|开发|实现/.test(haystack) && agent.builtinCode !== 'CODE_REVIEW'))
      : false,
    (agent, haystack) => normalizedStepCode === 'TEST'
      ? (isRuntimeType(agent, 'CODEX_CLI') || isRuntimeType(agent, 'CLAUDE_CODE_CLI')
        || (isExecutableAgent(agent) && /test|qa|测试|quality/.test(haystack)))
      : false,
    (agent, haystack) => normalizedStepCode === 'TEST_DESIGN'
      ? agent.builtinCode === 'TEST_SUGGESTION' || /test|测试|quality/.test(haystack)
      : false,
    (_agent, haystack) => normalizedStepCode === 'REPORT'
      ? /report|review|评审|总结/.test(haystack)
      : false,
    (agent, haystack) => normalizedStepCode === 'REVIEW'
      ? agent.builtinCode === 'CODE_REVIEW' || /review|评审|reviewer/.test(haystack)
      : false
  )
  if (match) {
    return match
  }
  if (normalizedStepCode === 'TEST') {
    return recommendAgentId(scenarioCode, 'IMPLEMENT')
  }
  if (normalizedStepCode === 'REPORT') {
    return recommendAgentId(scenarioCode, 'PLAN')
  }
  return undefined
}

const loadAgents = async () => {
  if (!props.workItem?.projectId) {
    agentOptions.value = []
    return
  }
  loadingAgents.value = true
  try {
    agentOptions.value = await listAgentOptions(props.workItem.projectId)
    resetStepAgentMapByScenario()
  } finally {
    loadingAgents.value = false
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
  form.scenarioCode = props.workItem?.workItemType === '需求' ? 'REQUIREMENT_BREAKDOWN' : 'DEVELOPMENT_IMPLEMENTATION'
  form.inputText = ''
  form.planConfirmationRequired = false
  form.stepAgentMap = {}
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
    await Promise.all([loadAgents(), loadGitlabBindings()])
  }
)

watch(
  () => form.scenarioCode,
  () => {
    resetStepAgentMapByScenario()
    if (!isDevelopmentScenario.value) {
      form.planConfirmationRequired = false
      form.repositories = []
    }
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

const validateDevelopmentAgents = () => {
  for (const stepCode of ['IMPLEMENT', 'TEST']) {
    const agentId = form.stepAgentMap[stepCode]
    if (typeof agentId !== 'number') {
      continue
    }
    const agent = agentOptions.value.find((item) => item.id === agentId)
    if (!isExecutableAgent(agent)) {
      ElMessage.warning(`${stepCode === 'IMPLEMENT' ? '开发实现' : '执行测试'} 必须绑定 HTTP_API 或 AGENT_RUNTIME 智能体`)
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
  if (isDevelopmentScenario.value && (!validateDevelopmentRepositories() || !validateDevelopmentAgents())) {
    return
  }

  submitting.value = true
  try {
    const inputPayload: Record<string, unknown> = {}
    if (form.inputText.trim()) {
      inputPayload.inputText = form.inputText.trim()
    }
    if (isDevelopmentScenario.value) {
      inputPayload.repositories = form.repositories.map((repository) => ({
        bindingId: repository.bindingId,
        targetBranch: repository.targetBranch.trim()
      }))
    }
    const executionTask = await createExecutionTask({
      scenarioCode: form.scenarioCode,
      projectId: props.workItem.projectId,
      workItemId: props.workItem.id,
      triggerSource: 'PAGE',
      planConfirmationRequired: isDevelopmentScenario.value ? form.planConfirmationRequired : false,
      agentBindings: currentStepOptions.value
        .map((step) => ({
          stepCode: step.stepCode,
          agentId: form.stepAgentMap[step.stepCode]
        }))
        .filter((item): item is { stepCode: string; agentId: number } => typeof item.agentId === 'number'),
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
