<template>
  <el-dialog
    v-model="dialogVisible"
    width="1240px"
    align-center
    destroy-on-close
    class="work-item-smart-action-dialog"
  >
    <template #header>
      <div class="work-item-smart-action-header">
        <div class="work-item-smart-action-title">智能操作</div>
        <div class="work-item-smart-action-subtitle">
          {{ workItem?.workItemCode || '-' }} · {{ workItem?.workItemType || '-' }} · {{ workItem?.name || '-' }}
        </div>
      </div>
    </template>

    <template v-if="workItem">
      <div class="work-item-smart-action-shell">
        <el-tabs v-model="activeTab" class="work-item-smart-action-tabs">
          <el-tab-pane
            v-if="showRequirementAiTab"
            label="需求AI"
            name="requirement-ai"
          >
            <div class="work-item-smart-action-pane">
              <RequirementAiDialog
                v-model="dialogVisible"
                embedded
                :task="workItem"
                :can-manage="canManage"
                @changed="emit('changed')"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane
            v-if="showTechnicalDesignTab"
            label="技术设计 AI"
            name="technical-design"
          >
            <div class="work-item-smart-action-pane">
              <TechnicalDesignAiDialog
                v-model="dialogVisible"
                :work-item="workItem"
                @created="handleCreated"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane
            v-if="showExecutionTab"
            label="智能执行"
            name="execution"
          >
            <div class="work-item-smart-action-pane">
              <ExecutionTaskCreateDialog
                v-model="dialogVisible"
                embedded
                :work-item="workItem"
                @created="handleCreated"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import RequirementAiDialog from '@/components/RequirementAiDialog.vue'
import ExecutionTaskCreateDialog from '@/components/ExecutionTaskCreateDialog.vue'
import TechnicalDesignAiDialog from '@/components/TechnicalDesignAiDialog.vue'
import type { ExecutionTaskItem, TaskItem } from '@/types/platform'
import { isTechnicalDesignWorkItem } from '@/utils/technicalDesignAi'

const props = defineProps<{
  workItem: TaskItem | null
  canManage: boolean
  canExecute: boolean
}>()

const emit = defineEmits<{
  changed: []
  created: [executionTask: ExecutionTaskItem]
}>()

const dialogVisible = defineModel<boolean>({ default: false })
const activeTab = ref<'requirement-ai' | 'technical-design' | 'execution'>('execution')

const normalizeTaskType = (taskType?: string | null) => {
  const value = String(taskType || '').trim()
  if (value === '测试' || value === '测试任务') {
    return '测试任务'
  }
  return value
}

const showRequirementAiTab = computed(() =>
  props.workItem?.workItemType === '需求'
  || (props.workItem?.workItemType === '任务' && normalizeTaskType(props.workItem?.taskType) === '测试任务')
)
const showExecutionTab = computed(() => props.canExecute)
const showTechnicalDesignTab = computed(() => props.canExecute && isTechnicalDesignWorkItem(props.workItem))

const resetActiveTab = () => {
  activeTab.value = showRequirementAiTab.value
    ? 'requirement-ai'
    : showTechnicalDesignTab.value
      ? 'technical-design'
      : 'execution'
}

const handleCreated = (executionTask: ExecutionTaskItem) => {
  emit('created', executionTask)
}

watch(
  [() => dialogVisible.value, () => props.workItem?.id, showRequirementAiTab, showTechnicalDesignTab, showExecutionTab],
  ([visible]) => {
    if (!visible) {
      return
    }
    resetActiveTab()
  }
)
</script>

<style scoped>
.work-item-smart-action-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.work-item-smart-action-title {
  font-size: 18px;
  font-weight: 700;
}

.work-item-smart-action-subtitle {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.work-item-smart-action-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
  flex: 0 0 auto;
}

.work-item-smart-action-tabs :deep(.el-tabs__content) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.work-item-smart-action-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.work-item-smart-action-shell {
  display: flex;
  flex-direction: column;
  height: 84vh;
  min-height: 780px;
  max-height: 84vh;
  min-width: 0;
  overflow: hidden;
}

.work-item-smart-action-pane {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
}

.work-item-smart-action-dialog :deep(.el-dialog) {
  max-width: calc(100vw - 32px);
}

.work-item-smart-action-dialog :deep(.el-dialog__body) {
  padding-top: 12px;
}

.work-item-smart-action-tabs {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

@media (max-width: 1280px) {
  .work-item-smart-action-shell {
    min-height: 700px;
    height: 82vh;
    max-height: 82vh;
  }
}

@media (max-width: 900px) {
  .work-item-smart-action-dialog :deep(.el-dialog) {
    width: calc(100vw - 16px) !important;
    margin: 8px auto;
  }

  .work-item-smart-action-dialog :deep(.el-dialog__body) {
    min-height: 0;
    padding-left: 12px;
    padding-right: 12px;
  }

  .work-item-smart-action-shell {
    min-height: 0;
    height: 80vh;
    max-height: 80vh;
  }
}
</style>
