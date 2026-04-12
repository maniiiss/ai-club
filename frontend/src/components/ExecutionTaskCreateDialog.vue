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

        <el-form-item label="执行说明">
          <el-input
            v-model="form.inputText"
            type="textarea"
            :rows="4"
            resize="none"
            placeholder="可补充当前要智能体重点关注的背景、目标、限制或交付要求"
          />
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
import type { AgentItem, ExecutionTaskItem, TaskItem } from '@/types/platform'

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
  stepAgentMap: Record<string, number | undefined>
}

const props = defineProps<ExecutionTaskCreateDialogProps>()
const emit = defineEmits<{
  created: [executionTask: ExecutionTaskItem]
}>()
const dialogVisible = defineModel<boolean>({ default: false })
const formRef = ref<FormInstance>()
const loadingAgents = ref(false)
const submitting = ref(false)
const agentOptions = ref<AgentItem[]>([])

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
    { stepCode: 'PLAN', stepName: '执行规划', description: '明确实施路径、依赖和风险。' },
    { stepCode: 'IMPLEMENT', stepName: '开发实现', description: '生成实现方案、代码改造建议或执行输出。' },
    { stepCode: 'REVIEW', stepName: '质量评审', description: '从风险、质量和交付视角做结果复核。' }
  ],
  TEST_DESIGN_OR_REVIEW: [
    { stepCode: 'TEST_DESIGN', stepName: '测试设计', description: '整理测试点、测试案例和验收建议。' },
    { stepCode: 'REVIEW', stepName: '测试评审', description: '对测试设计或前序结果进行评审。' }
  ]
}

const form = reactive<ExecutionCreateForm>({
  scenarioCode: 'REQUIREMENT_BREAKDOWN',
  inputText: '',
  stepAgentMap: {}
})

const rules: FormRules<ExecutionCreateForm> = {
  scenarioCode: [{ required: true, message: '请选择执行场景', trigger: 'change' }]
}

const currentStepOptions = computed(() => stepOptionsMap[form.scenarioCode] || [])

/**
 * 每次切换场景时，按当前项目 Agent 重新给出步骤默认绑定，避免沿用上一个场景的不匹配选择。
 */
const resetStepAgentMapByScenario = () => {
  const nextMap: Record<string, number | undefined> = {}
  for (const step of currentStepOptions.value) {
    nextMap[step.stepCode] = recommendAgentId(step.stepCode)
  }
  form.stepAgentMap = nextMap
}

const buildAgentLabel = (agent: AgentItem) => `${agent.name} / ${agent.category} / ${agent.accessType}`

/**
 * 第一版默认推荐规则尽量复用现有 Agent 命名和 builtinCode，减少手动选择成本。
 */
const recommendAgentId = (stepCode: string) => {
  const normalizedStepCode = stepCode.toUpperCase()
  const match = agentOptions.value.find((agent) => {
    const haystack = `${agent.name} ${agent.category} ${agent.type} ${agent.capability}`.toLowerCase()
    if (normalizedStepCode === 'PLAN') {
      return agent.builtinCode === 'REQUIREMENT_BREAKDOWN' || /planner|规划|需求/.test(haystack)
    }
    if (normalizedStepCode === 'IMPLEMENT') {
      return /coder|code|开发|实现/.test(haystack) && agent.builtinCode !== 'CODE_REVIEW'
    }
    if (normalizedStepCode === 'TEST_DESIGN') {
      return agent.builtinCode === 'TEST_SUGGESTION' || /test|测试|quality/.test(haystack)
    }
    if (normalizedStepCode === 'REVIEW') {
      return agent.builtinCode === 'CODE_REVIEW' || /review|评审|reviewer/.test(haystack)
    }
    return false
  })
  return match?.id
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

const resetForm = () => {
  form.scenarioCode = props.workItem?.workItemType === '需求' ? 'REQUIREMENT_BREAKDOWN' : 'DEVELOPMENT_IMPLEMENTATION'
  form.inputText = ''
  form.stepAgentMap = {}
  formRef.value?.clearValidate()
}

watch(
  () => dialogVisible.value,
  async (visible) => {
    if (!visible) {
      return
    }
    resetForm()
    await loadAgents()
  }
)

watch(
  () => form.scenarioCode,
  () => {
    resetStepAgentMapByScenario()
  }
)

const handleSubmit = async () => {
  if (!props.workItem) {
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }

  submitting.value = true
  try {
    const executionTask = await createExecutionTask({
      scenarioCode: form.scenarioCode,
      projectId: props.workItem.projectId,
      workItemId: props.workItem.id,
      triggerSource: 'PAGE',
      agentBindings: currentStepOptions.value
        .map((step) => ({
          stepCode: step.stepCode,
          agentId: form.stepAgentMap[step.stepCode]
        }))
        .filter((item): item is { stepCode: string; agentId: number } => typeof item.agentId === 'number'),
      inputPayload: form.inputText.trim()
        ? {
            inputText: form.inputText.trim()
          }
        : {}
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
  .execution-step-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
