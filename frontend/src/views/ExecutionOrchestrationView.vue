<template>
  <div class="orchestration-page">
    <section class="orchestration-hero">
      <div>
        <span class="orchestration-kicker">EXECUTION CONTROL PLANE</span>
        <h1>执行编排管理</h1>
        <p>为固定业务步骤发布稳定的 Agent 与超时配置。任务发起人只提交业务输入，不再临时覆盖运行时。</p>
      </div>
      <div class="orchestration-hero-badge">
        <span>{{ readyScenarioCount }}/{{ scenarios.length }}</span>
        <small>场景就绪</small>
      </div>
    </section>

    <section class="orchestration-toolbar">
      <el-segmented v-model="scopeType" :options="scopeOptions" @change="handleScopeChange" />
      <el-select
        v-if="scopeType === 'PROJECT'"
        v-model="projectId"
        filterable
        placeholder="选择项目覆盖范围"
        class="orchestration-project-select"
        @change="loadWorkspace"
      >
        <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
      </el-select>
      <el-button :loading="loading" @click="loadWorkspace">刷新</el-button>
    </section>

    <el-alert
      v-if="scopeType === 'PROJECT' && !projectId"
      title="请选择项目后维护项目覆盖编排"
      type="info"
      :closable="false"
      show-icon
    />

    <template v-else>
      <section class="scenario-rail">
        <button
          v-for="scenario in scenarios"
          :key="scenario.scenarioCode"
          type="button"
          :class="['scenario-chip', { active: scenario.scenarioCode === selectedScenarioCode }]"
          @click="selectedScenarioCode = scenario.scenarioCode"
        >
          <span :class="['scenario-dot', { ready: scenario.effectiveReady }]" />
          <strong>{{ scenario.scenarioName }}</strong>
          <small>{{ scenario.effectiveReady ? `已由${scopeLabel(scenario.effectiveScope)}发布` : '未就绪' }}</small>
        </button>
      </section>

      <div v-loading="loading" class="orchestration-grid">
        <section class="orchestration-editor-card">
          <header class="orchestration-card-head">
            <div>
              <span>ACTIVE SCENARIO</span>
              <h2>{{ activeScenario?.scenarioName || '选择场景' }}</h2>
            </div>
            <div class="orchestration-head-actions">
              <el-button v-if="canAbandonProjectOverride" text type="danger" :loading="actionLoading" @click="abandonProjectOverride">放弃项目覆盖</el-button>
              <el-tag :type="activeScenario?.effectiveReady ? 'success' : 'warning'" effect="dark">
                {{ activeScenario?.effectiveReady ? '场景就绪' : '编排尚未就绪' }}
              </el-tag>
            </div>
          </header>

          <div class="orchestration-status-strip">
            <div><span>维护范围</span><strong>{{ scopeType === 'PLATFORM' ? '平台默认' : '项目覆盖' }}</strong></div>
            <div><span>当前发布</span><strong>{{ publishedVersion ? `v${publishedVersion.versionNo}` : '暂无' }}</strong></div>
            <div><span>当前草稿</span><strong>{{ draftVersion ? `v${draftVersion.versionNo}` : '暂无' }}</strong></div>
            <div><span>生效来源</span><strong>{{ scopeLabel(activeScenario?.effectiveScope) }}</strong></div>
          </div>

          <el-alert
            v-if="!activeScenario?.effectiveReady"
            :title="activeScenario?.effectiveInvalidReason || '编排尚未就绪：发布完整草稿前，对应任务发起入口将保持禁用。'"
            type="warning"
            :closable="false"
            show-icon
          />

          <div v-if="!draftVersion" class="orchestration-empty-draft">
            <div>
              <strong>没有正在编辑的草稿</strong>
              <span>从当前有效版本创建草稿；首次配置时会生成空草稿。</span>
            </div>
            <el-button type="primary" :loading="actionLoading" :disabled="!activeProfile" @click="createDraft()">
              创建草稿
            </el-button>
          </div>

          <template v-else>
            <div class="draft-meta">
              <div>
                <span>DRAFT VERSION</span>
                <strong>v{{ draftVersion.versionNo }}</strong>
              </div>
              <div>
                <span>revision</span>
                <strong>{{ draftVersion.revision }}</strong>
              </div>
              <div v-if="draftVersion.sourceVersionId">
                <span>来源版本</span>
                <strong>#{{ draftVersion.sourceVersionId }}</strong>
              </div>
            </div>

            <div class="orchestration-step-list">
              <article v-for="(step, index) in activeScenario?.steps || []" :key="step.stepCode" class="orchestration-step-row">
                <div class="step-index">{{ String(index + 1).padStart(2, '0') }}</div>
                <div class="step-copy">
                  <strong>{{ step.stepName }}</strong>
                  <span>{{ step.stepCode }}</span>
                </div>
                <template v-if="step.agentRequired">
                  <el-select
                    v-model="bindingForm[step.stepCode].agentId"
                    filterable
                    placeholder="选择 Agent"
                    class="step-agent-select"
                  >
                    <el-option
                      v-for="agent in agents"
                      :key="agent.id"
                      :label="agentLabel(agent)"
                      :value="agent.id"
                    />
                  </el-select>
                  <el-input-number
                    v-model="bindingForm[step.stepCode].timeoutSeconds"
                    :min="10"
                    :max="7200"
                    :step="30"
                    controls-position="right"
                  />
                  <span class="timeout-unit">秒</span>
                  <div v-if="draftBinding(step.stepCode)?.valid === false" class="step-invalid-reason">
                    {{ draftBinding(step.stepCode)?.invalidReason || '当前 Agent 已失效，请重新选择后保存。' }}
                  </div>
                </template>
                <div v-else class="internal-step">平台内置步骤</div>
              </article>
            </div>

            <footer class="orchestration-editor-actions">
              <el-button type="danger" plain :loading="actionLoading" @click="deleteDraft">删除草稿</el-button>
              <div>
                <el-button :loading="actionLoading" @click="saveDraft">保存 revision</el-button>
                <el-button type="primary" :loading="actionLoading" @click="publishDraft">发布编排</el-button>
              </div>
            </footer>
          </template>
        </section>

        <aside class="orchestration-history-card">
          <header>
            <span>VERSION ARCHIVE</span>
            <h3>版本历史</h3>
          </header>
          <div v-if="historyVersions.length" class="history-list">
            <article v-for="version in historyVersions" :key="version.id" class="history-item">
              <div class="history-main">
                <strong>v{{ version.versionNo }}</strong>
                <el-tag size="small" :type="version.status === 'PUBLISHED' ? 'success' : 'info'">
                  {{ version.status === 'PUBLISHED' ? '当前发布' : '历史归档' }}
                </el-tag>
              </div>
              <p>{{ version.publishedAt || version.createdAt }}</p>
              <ul>
                <li v-for="binding in version.stepBindings" :key="binding.stepCode">
                  <span>{{ stepName(binding.stepCode) }}</span>
                  <strong>{{ binding.agentName || `Agent #${binding.agentId}` }}</strong>
                  <small>{{ binding.timeoutSeconds }}s</small>
                  <em v-if="!binding.valid">{{ binding.invalidReason || 'Agent 已失效' }}</em>
                </li>
              </ul>
              <el-button
                text
                type="primary"
                :disabled="Boolean(draftVersion)"
                :loading="actionLoading"
                @click="createDraft(version.id)"
              >
                从历史创建草稿
              </el-button>
            </article>
          </div>
          <el-empty v-else description="暂无发布历史" :image-size="72" />
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  abandonExecutionOrchestrationProfile,
  createExecutionOrchestrationDraft,
  deleteExecutionOrchestrationVersion,
  listAgentOptions,
  listExecutionOrchestrationProfiles,
  listExecutionOrchestrationScenarios,
  listProjectOptions,
  publishExecutionOrchestrationVersion,
  updateExecutionOrchestrationVersion
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type {
  AgentItem,
  ExecutionOrchestrationProfileItem,
  ExecutionOrchestrationScenarioItem,
  ExecutionOrchestrationVersionItem,
  ProjectItem
} from '@/types/platform'

type ScopeType = 'PLATFORM' | 'PROJECT'
interface BindingDraft { agentId: number | null; timeoutSeconds: number }

const authStore = useAuthStore()
const canManagePlatform = computed(() => authStore.hasPermission('execution:orchestration:manage'))
const scopeOptions = computed(() => canManagePlatform.value
  ? [{ label: '平台默认', value: 'PLATFORM' }, { label: '项目覆盖', value: 'PROJECT' }]
  : [{ label: '项目覆盖', value: 'PROJECT' }]
)
const scopeType = ref<ScopeType>('PLATFORM')
const projectId = ref<number | null>(null)
const projects = ref<ProjectItem[]>([])
const scenarios = ref<ExecutionOrchestrationScenarioItem[]>([])
const profiles = ref<ExecutionOrchestrationProfileItem[]>([])
const agents = ref<AgentItem[]>([])
const selectedScenarioCode = ref('')
const bindingForm = reactive<Record<string, BindingDraft>>({})
const loading = ref(false)
const actionLoading = ref(false)

const activeScenario = computed(() => scenarios.value.find((item) => item.scenarioCode === selectedScenarioCode.value) || null)
const activeProfile = computed(() => profiles.value.find((item) => item.scenarioCode === selectedScenarioCode.value) || null)
const draftVersion = computed(() => versionById(activeProfile.value?.draftVersionId))
const publishedVersion = computed(() => versionById(activeProfile.value?.publishedVersionId))
const historyVersions = computed(() => (activeProfile.value?.versions || []).filter((item) => item.status !== 'DRAFT'))
const readyScenarioCount = computed(() => scenarios.value.filter((item) => item.effectiveReady).length)
const canAbandonProjectOverride = computed(() => scopeType.value === 'PROJECT' && Boolean(activeProfile.value?.publishedVersionId))

const versionById = (id?: number | null): ExecutionOrchestrationVersionItem | null =>
  id ? activeProfile.value?.versions.find((item) => item.id === id) || null : null

const scopeLabel = (scope?: string | null) => scope === 'PROJECT' ? '项目覆盖' : scope === 'PLATFORM' ? '平台默认' : '未发布'
const stepName = (stepCode: string) => activeScenario.value?.steps.find((item) => item.stepCode === stepCode)?.stepName || stepCode
const draftBinding = (stepCode: string) => draftVersion.value?.stepBindings.find((item) => item.stepCode === stepCode) || null
const agentLabel = (agent: AgentItem) => [agent.name, agent.accessType, agent.runtimeType].filter(Boolean).join(' · ')

const syncDraftForm = () => {
  for (const key of Object.keys(bindingForm)) delete bindingForm[key]
  if (!activeScenario.value || !draftVersion.value) return
  const existing = new Map(draftVersion.value.stepBindings.map((item) => [item.stepCode, item]))
  for (const step of activeScenario.value.steps.filter((item) => item.agentRequired)) {
    const binding = existing.get(step.stepCode)
    bindingForm[step.stepCode] = {
      agentId: binding?.agentId || null,
      timeoutSeconds: binding?.timeoutSeconds || 600
    }
  }
}

const loadWorkspace = async () => {
  if (scopeType.value === 'PROJECT' && !projectId.value) {
    scenarios.value = []
    profiles.value = []
    return
  }
  loading.value = true
  try {
    const selectedProjectId = scopeType.value === 'PROJECT' ? projectId.value || undefined : undefined
    const [scenarioData, profileData, agentData] = await Promise.all([
      listExecutionOrchestrationScenarios(selectedProjectId),
      listExecutionOrchestrationProfiles(scopeType.value, selectedProjectId),
      listAgentOptions(selectedProjectId)
    ])
    scenarios.value = scenarioData
    profiles.value = profileData
    agents.value = agentData.filter((item) => item.enabled && String(item.status || '').toUpperCase() !== 'DISABLED')
    if (!scenarios.value.some((item) => item.scenarioCode === selectedScenarioCode.value)) {
      selectedScenarioCode.value = scenarios.value[0]?.scenarioCode || ''
    }
    syncDraftForm()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载执行编排失败')
  } finally {
    loading.value = false
  }
}

const handleScopeChange = async () => {
  if (scopeType.value === 'PROJECT' && !projectId.value) projectId.value = projects.value[0]?.id || null
  await loadWorkspace()
}

/** sourceVersionId 只来自当前 profile 的版本历史，后端继续校验场景关联。 */
const createDraft = async (sourceVersionId?: number) => {
  if (!activeProfile.value) return
  actionLoading.value = true
  try {
    await createExecutionOrchestrationDraft(activeProfile.value.id, sourceVersionId)
    await loadWorkspace()
    ElMessage.success(sourceVersionId ? '已从历史版本创建草稿' : '编排草稿已创建')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建草稿失败')
  } finally {
    actionLoading.value = false
  }
}

const buildStepBindings = () => (activeScenario.value?.steps || [])
  .filter((step) => step.agentRequired)
  .map((step) => ({
    stepCode: step.stepCode,
    agentId: bindingForm[step.stepCode]?.agentId,
    timeoutSeconds: bindingForm[step.stepCode]?.timeoutSeconds
  }))

const validateDraft = () => {
  const missing = buildStepBindings().find((item) => typeof item.agentId !== 'number')
  if (missing) {
    ElMessage.warning(`请为“${stepName(missing.stepCode)}”选择 Agent`)
    return false
  }
  return true
}

const saveDraft = async () => {
  if (!draftVersion.value || !validateDraft()) return false
  actionLoading.value = true
  try {
    await updateExecutionOrchestrationVersion(draftVersion.value.id, {
      revision: draftVersion.value.revision,
      stepBindings: buildStepBindings().map((item) => ({
        stepCode: item.stepCode,
        agentId: item.agentId as number,
        timeoutSeconds: item.timeoutSeconds
      }))
    })
    await loadWorkspace()
    ElMessage.success('草稿 revision 已保存')
    return true
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存草稿失败')
    return false
  } finally {
    actionLoading.value = false
  }
}

const publishDraft = async () => {
  if (!draftVersion.value || !validateDraft()) return
  const saved = await saveDraft()
  if (!saved || !draftVersion.value) return
  actionLoading.value = true
  try {
    await publishExecutionOrchestrationVersion(draftVersion.value.id)
    await loadWorkspace()
    ElMessage.success('编排已发布，新建任务将使用该版本')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '发布编排失败')
  } finally {
    actionLoading.value = false
  }
}

const deleteDraft = async () => {
  if (!draftVersion.value) return
  try {
    await ElMessageBox.confirm(`确认删除草稿 v${draftVersion.value.versionNo} 吗？`, '删除编排草稿', { type: 'warning' })
    actionLoading.value = true
    await deleteExecutionOrchestrationVersion(draftVersion.value.id)
    await loadWorkspace()
    ElMessage.success('草稿已删除')
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '删除草稿失败')
  } finally {
    actionLoading.value = false
  }
}

const abandonProjectOverride = async () => {
  if (!activeProfile.value || scopeType.value !== 'PROJECT') return
  try {
    await ElMessageBox.confirm('确认放弃当前项目覆盖吗？后续新任务将回退到平台已发布编排。', '放弃项目覆盖', { type: 'warning' })
    actionLoading.value = true
    await abandonExecutionOrchestrationProfile(activeProfile.value.id)
    await loadWorkspace()
    ElMessage.success('项目覆盖已放弃，当前场景已回退平台默认')
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '放弃项目覆盖失败')
  } finally {
    actionLoading.value = false
  }
}

watch([selectedScenarioCode, draftVersion], syncDraftForm)

onMounted(async () => {
  projects.value = await listProjectOptions()
  if (!canManagePlatform.value) {
    scopeType.value = 'PROJECT'
    projectId.value = projects.value[0]?.id || null
  }
  await loadWorkspace()
})
</script>

<style scoped>
.orchestration-page { display: flex; flex-direction: column; gap: 16px; min-height: 100%; color: #172033; }
.orchestration-hero { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px 28px; border: 1px solid rgba(15, 118, 110, .18); border-radius: 18px; background: radial-gradient(circle at 88% 16%, rgba(20, 184, 166, .18), transparent 30%), linear-gradient(135deg, #f0fdfa 0%, #f8fafc 64%); box-shadow: 0 16px 40px rgba(15, 23, 42, .05); }
.orchestration-kicker, .orchestration-card-head span, .orchestration-history-card header span, .draft-meta span { color: #0f766e; font-size: 10px; font-weight: 900; letter-spacing: .16em; }
.orchestration-head-actions { display: flex; align-items: center; gap: 8px; }
.orchestration-hero h1 { margin: 6px 0; font-size: 28px; letter-spacing: -.03em; }
.orchestration-hero p { max-width: 760px; margin: 0; color: #64748b; line-height: 1.7; }
.orchestration-hero-badge { display: grid; min-width: 116px; padding: 16px; border-radius: 16px; background: #0f766e; color: white; text-align: center; box-shadow: 0 12px 24px rgba(15, 118, 110, .22); }
.orchestration-hero-badge span { font-size: 28px; font-weight: 900; }.orchestration-hero-badge small { opacity: .78; }
.orchestration-toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 14px; background: white; }.orchestration-project-select { width: 280px; }
.scenario-rail { display: flex; gap: 10px; overflow-x: auto; }.scenario-chip { display: grid; grid-template-columns: auto auto; align-items: center; gap: 2px 8px; min-width: 220px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 13px; background: white; color: #334155; text-align: left; cursor: pointer; transition: .18s ease; }.scenario-chip:hover,.scenario-chip.active { border-color: rgba(15,118,110,.42); transform: translateY(-1px); box-shadow: 0 8px 18px rgba(15,23,42,.06); }.scenario-chip small { grid-column: 2; color: #94a3b8; }.scenario-dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }.scenario-dot.ready { background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.1); }
.orchestration-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; min-height: 520px; }.orchestration-editor-card,.orchestration-history-card { border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.04); }.orchestration-editor-card { padding: 20px; }.orchestration-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }.orchestration-card-head h2,.orchestration-history-card h3 { margin: 5px 0 0; }.orchestration-status-strip { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin: 18px 0; }.orchestration-status-strip div { display: flex; flex-direction: column; gap: 5px; padding: 11px 12px; border-radius: 10px; background: #f8fafc; }.orchestration-status-strip span { color: #94a3b8; font-size: 11px; }.orchestration-status-strip strong { font-size: 13px; }
.orchestration-empty-draft { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 18px; padding: 24px; border: 1px dashed #94a3b8; border-radius: 14px; background: #f8fafc; }.orchestration-empty-draft div { display: flex; flex-direction: column; gap: 5px; }.orchestration-empty-draft span { color: #64748b; font-size: 12px; }.draft-meta { display: flex; gap: 24px; margin: 18px 0 10px; }.draft-meta div { display: flex; flex-direction: column; gap: 3px; }.draft-meta strong { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.orchestration-step-list { display: flex; flex-direction: column; gap: 8px; }.orchestration-step-row { display: grid; grid-template-columns: 44px minmax(150px,1fr) minmax(220px,1.5fr) 150px 24px; align-items: center; gap: 12px; padding: 12px; border: 1px solid #edf2f7; border-radius: 12px; background: #fbfdff; }.step-index { color: #0f766e; font-family: ui-monospace,monospace; font-size: 16px; font-weight: 900; }.step-copy { display: flex; flex-direction: column; gap: 3px; }.step-copy span { color: #94a3b8; font-size: 10px; letter-spacing: .08em; }.step-agent-select { width: 100%; }.timeout-unit { color: #94a3b8; font-size: 12px; }.internal-step { grid-column: 3 / -1; color: #64748b; font-size: 12px; }.orchestration-editor-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #edf2f7; }
.step-invalid-reason { grid-column: 3 / -1; color: #dc2626; font-size: 11px; }
.orchestration-history-card { padding: 18px; overflow: hidden; }.history-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; max-height: 660px; overflow-y: auto; }.history-item { padding: 13px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; }.history-main { display: flex; align-items: center; justify-content: space-between; }.history-item p { margin: 6px 0 10px; color: #94a3b8; font-size: 11px; }.history-item ul { display: flex; flex-direction: column; gap: 6px; margin: 0 0 8px; padding: 0; list-style: none; }.history-item li { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.4fr) auto; gap: 7px; font-size: 11px; }.history-item li span { color: #64748b; }.history-item li strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.history-item li small { color: #0f766e; }
.history-item li em { grid-column: 1 / -1; color: #dc2626; font-style: normal; }
@media (max-width: 1100px) { .orchestration-grid { grid-template-columns: 1fr; }.orchestration-history-card { order: 2; }.orchestration-status-strip { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 760px) { .orchestration-hero { align-items: flex-start; padding: 18px; }.orchestration-hero-badge { display: none; }.orchestration-toolbar { align-items: stretch; flex-direction: column; }.orchestration-project-select { width: 100%; }.orchestration-step-row { grid-template-columns: 36px minmax(0,1fr); }.step-agent-select,.orchestration-step-row :deep(.el-input-number),.timeout-unit,.internal-step { grid-column: 1 / -1; width: 100%; }.orchestration-editor-actions { align-items: stretch; flex-direction: column-reverse; }.orchestration-editor-actions > div { display: flex; }.orchestration-editor-actions .el-button { flex: 1; } }
</style>
