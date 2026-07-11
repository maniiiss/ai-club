<template>
  <div v-if="workItem" class="technical-design-shell">
    <section class="technical-design-intro">
      <div>
        <span class="technical-design-kicker">READ-ONLY DESIGN PIPELINE</span>
        <h3>从代码证据生成可执行技术设计</h3>
        <p>三步 Runtime 只读分析仓库，不修改代码；输出代码上下文、技术设计和设计自检三份 Markdown 产物。</p>
      </div>
      <div class="technical-design-runtime-badge">Codex 优先</div>
    </section>

    <el-alert
      title="GitNexus 会优先用于代码理解；索引缺失或刷新失败时会明确降级到源码搜索，技术设计任务不会因此中断。"
      type="info"
      :closable="false"
      show-icon
    />

    <el-alert
      v-if="!orchestrationReady"
      title="编排尚未就绪"
      description="当前项目没有可用的技术设计编排，请联系管理员发布平台默认或项目覆盖版本。"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-form label-position="top" class="technical-design-form">
      <section class="technical-design-section">
        <div class="technical-design-section-head">
          <div>
            <strong>01 / 仓库与分支</strong>
            <span>至少选择一个当前项目已启用的 GitLab 绑定，顺序会原样传入设计链路。</span>
          </div>
        </div>
        <el-form-item label="参与设计的仓库">
          <el-select
            v-model="selectedRepositoryIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择需要理解的仓库"
            style="width: 100%"
          >
            <el-option
              v-for="binding in availableBindings"
              :key="binding.id"
              :label="bindingLabel(binding)"
              :value="binding.id"
            >
              <div class="technical-design-binding-option">
                <strong>{{ bindingLabel(binding) }}</strong>
                <span>默认分支：{{ binding.defaultTargetBranch || '未配置' }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="!loadingBindings && !availableBindings.length" class="technical-design-empty-hint">
            当前项目暂无启用的 GitLab 绑定，请先在仓库管理中完成配置。
          </div>
        </el-form-item>

        <div v-if="form.repositories.length" class="technical-design-repositories">
          <article v-for="(repository, index) in form.repositories" :key="repository.bindingId">
            <div class="technical-design-repository-head">
              <div>
                <span>仓库 {{ String(index + 1).padStart(2, '0') }}</span>
                <strong>{{ bindingLabel(resolveBinding(repository.bindingId)) }}</strong>
              </div>
              <el-button text type="danger" @click="removeRepository(repository.bindingId)">移除</el-button>
            </div>
            <el-input v-model="repository.targetBranch" placeholder="请输入目标分支">
              <template #prepend>目标分支</template>
            </el-input>
          </article>
        </div>
      </section>

      <section class="technical-design-section technical-design-notes">
        <el-form-item label="补充约束（可选）">
          <el-input
            v-model="form.inputText"
            type="textarea"
            :rows="4"
            resize="none"
            placeholder="例如：必须兼容现有 API；优先复用当前数据模型；需要给出灰度和回滚方案。"
          />
        </el-form-item>
        <div class="technical-design-switch-row">
          <div>
            <strong>优先使用 GitNexus</strong>
            <span>推荐开启。失败时会降级并在代码上下文产物中记录原因。</span>
          </div>
          <el-switch v-model="form.preferGitNexus" />
        </div>
      </section>
    </el-form>

    <div class="technical-design-footer">
      <span>管理端发起不扣积分</span>
      <div>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!orchestrationReady" @click="handleSubmit">生成技术设计</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createTechnicalDesignExecution, listExecutionOrchestrationScenarios } from '@/api/platform'
import { listGitlabBindingOptions } from '@/api/gitlab'
import type { ExecutionTaskItem, ProjectGitlabBindingItem, TaskItem } from '@/types/platform'
import {
  buildTechnicalDesignExecutionPayload
} from '@/utils/technicalDesignAi'

const props = defineProps<{ workItem: TaskItem | null }>()
const emit = defineEmits<{ created: [executionTask: ExecutionTaskItem] }>()
const dialogVisible = defineModel<boolean>({ default: false })

interface RepositoryFormItem {
  bindingId: number
  targetBranch: string
}

const form = reactive({
  repositories: [] as RepositoryFormItem[],
  inputText: '',
  preferGitNexus: true
})
const bindingOptions = ref<ProjectGitlabBindingItem[]>([])
const loadingBindings = ref(false)
const submitting = ref(false)
const orchestrationReady = ref(false)

const availableBindings = computed(() =>
  bindingOptions.value.filter((binding) => binding.enabled && binding.projectId === props.workItem?.projectId)
)
const selectedRepositoryIds = computed<number[]>({
  get: () => form.repositories.map((repository) => repository.bindingId),
  set: (bindingIds) => syncRepositories(bindingIds)
})

const resolveBinding = (bindingId: number) => availableBindings.value.find((binding) => binding.id === bindingId)
const bindingLabel = (binding?: ProjectGitlabBindingItem | null) =>
  binding?.gitlabProjectPath || binding?.gitlabProjectRef || `GitLab 绑定 #${binding?.id ?? '-'}`

/** 新选中的仓库继承绑定默认分支，已有仓库保留用户已经修改过的分支。 */
const syncRepositories = (bindingIds: number[]) => {
  const current = new Map(form.repositories.map((repository) => [repository.bindingId, repository]))
  form.repositories = bindingIds.map((bindingId) => current.get(bindingId) || ({
    bindingId,
    targetBranch: resolveBinding(bindingId)?.defaultTargetBranch || ''
  }))
}

const removeRepository = (bindingId: number) => {
  form.repositories = form.repositories.filter((repository) => repository.bindingId !== bindingId)
}

const resetForm = () => {
  form.repositories = []
  form.inputText = ''
  form.preferGitNexus = true
  orchestrationReady.value = false
}

const loadOptions = async () => {
  if (!props.workItem?.projectId) return
  loadingBindings.value = true
  try {
    const [scenarios, bindings] = await Promise.all([
      listExecutionOrchestrationScenarios(props.workItem.projectId),
      listGitlabBindingOptions()
    ])
    orchestrationReady.value = Boolean(
      scenarios.find((item) => item.scenarioCode === 'TECHNICAL_DESIGN_AUTHORING')?.effectiveReady
    )
    bindingOptions.value = bindings
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载技术设计配置失败')
  } finally {
    loadingBindings.value = false
  }
}

const validate = () => {
  if (!form.repositories.length) {
    ElMessage.warning('请至少选择一个参与技术设计的仓库')
    return false
  }
  const missingBranch = form.repositories.find((repository) => !repository.targetBranch.trim())
  if (missingBranch) {
    ElMessage.warning(`${bindingLabel(resolveBinding(missingBranch.bindingId))} 还没有填写目标分支`)
    return false
  }
  if (!orchestrationReady.value) {
    ElMessage.warning('编排尚未就绪，请联系管理员发布技术设计编排')
    return false
  }
  return true
}

const handleSubmit = async () => {
  if (!props.workItem || !validate()) return
  submitting.value = true
  try {
    const payload = buildTechnicalDesignExecutionPayload({
      projectId: props.workItem.projectId,
      workItemId: props.workItem.id,
      repositories: form.repositories,
      inputText: form.inputText,
      preferGitNexus: form.preferGitNexus
    })
    const executionTask = await createTechnicalDesignExecution(props.workItem.id, payload)
    emit('created', executionTask)
    dialogVisible.value = false
    ElMessage.success('技术设计任务已创建')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建技术设计任务失败')
  } finally {
    submitting.value = false
  }
}

watch(
  [() => dialogVisible.value, () => props.workItem?.id],
  async ([visible]) => {
    if (!visible) return
    resetForm()
    await loadOptions()
  }
)
</script>

<style scoped>
.technical-design-shell { display: flex; flex-direction: column; gap: 16px; color: #172033; }
.technical-design-intro { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 18px 20px; border: 1px solid rgba(14, 116, 144, .18); border-radius: 14px; background: linear-gradient(135deg, rgba(236, 254, 255, .96), rgba(248, 250, 252, .98)); }
.technical-design-intro h3 { margin: 6px 0; font-size: 20px; }
.technical-design-intro p { max-width: 720px; margin: 0; color: #64748b; line-height: 1.65; }
.technical-design-kicker { color: #0e7490; font-size: 11px; font-weight: 900; letter-spacing: .14em; }
.technical-design-runtime-badge { flex: 0 0 auto; padding: 7px 11px; border-radius: 999px; background: #0f766e; color: white; font-size: 12px; font-weight: 800; }
.technical-design-form { display: flex; flex-direction: column; gap: 14px; }
.technical-design-section { padding: 16px; border: 1px solid #e7edf3; border-radius: 12px; background: #fff; }
.technical-design-section-head { display: flex; justify-content: space-between; margin-bottom: 14px; }
.technical-design-section-head div { display: flex; flex-direction: column; gap: 4px; }
.technical-design-section-head strong { font-size: 14px; }
.technical-design-section-head span, .technical-design-empty-hint { color: #718096; font-size: 12px; }
.technical-design-binding-option { display: flex; flex-direction: column; line-height: 1.4; }
.technical-design-binding-option span { color: #94a3b8; font-size: 11px; }
.technical-design-repositories { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.technical-design-repositories article { padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
.technical-design-repository-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.technical-design-repository-head div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.technical-design-repository-head span { color: #0e7490; font-size: 10px; font-weight: 900; letter-spacing: .12em; }
.technical-design-repository-head strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.technical-design-steps { display: flex; flex-direction: column; gap: 8px; }
.technical-design-steps article { display: grid; grid-template-columns: 42px minmax(0, 1fr) 280px; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; background: #f8fafc; }
.technical-design-step-number { color: #0e7490; font-family: monospace; font-size: 16px; font-weight: 900; }
.technical-design-step-copy { display: flex; flex-direction: column; gap: 3px; }
.technical-design-step-copy span { color: #718096; font-size: 12px; }
.technical-design-notes { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; }
.technical-design-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px; border-radius: 10px; background: #f0fdfa; }
.technical-design-switch-row div { display: flex; flex-direction: column; gap: 4px; }
.technical-design-switch-row span { color: #64748b; font-size: 12px; line-height: 1.5; }
.technical-design-footer { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0 2px; background: #fff; }
.technical-design-footer > span { color: #64748b; font-size: 12px; }
@media (max-width: 900px) { .technical-design-repositories, .technical-design-notes { grid-template-columns: 1fr; } .technical-design-steps article { grid-template-columns: 34px minmax(0, 1fr); } .technical-design-steps :deep(.el-select) { grid-column: 1 / -1; width: 100% !important; } }
</style>
