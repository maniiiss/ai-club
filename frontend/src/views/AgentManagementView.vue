<template>
  <div class="agent-management-page">
    <!-- 标签切换条：复用 GitLab 管理的胶囊式按钮组样式，放在 el-tabs 外部只渲染一次。 -->
    <div class="agent-management-switcher-bar">
      <div class="agent-tab-switcher" role="tablist" aria-label="智能体管理页面切换">
        <button class="agent-tab-button" :class="{ active: activeTab === 'agents' }" type="button" @click="activeTab = 'agents'">智能体管理</button>
        <button v-if="canViewOrchestration" class="agent-tab-button" :class="{ active: activeTab === 'orchestration' }" type="button" @click="activeTab = 'orchestration'">执行编排</button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="agent-management-tabs">
      <el-tab-pane name="agents" label="智能体管理">
        <AgentView />
      </el-tab-pane>
      <el-tab-pane v-if="canViewOrchestration" name="orchestration" label="执行编排">
        <ExecutionOrchestrationView />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AgentView from './AgentView.vue'
import ExecutionOrchestrationView from './ExecutionOrchestrationView.vue'

const route = useRoute()
const authStore = useAuthStore()

// 编排管理标签页仅对拥有编排或项目管理权限的用户可见，保持原有安全边界。
const canViewOrchestration = computed(() =>
  authStore.hasPermission('execution:orchestration:manage') || authStore.hasPermission('project:manage')
)

type AgentTab = 'agents' | 'orchestration'

// 从路由 query 读取初始标签：旧链接 /execution-orchestrations 会重定向到 /agents?tab=orchestration。
const resolveInitialTab = (): AgentTab => {
  const queryTab = typeof route.query.tab === 'string' ? route.query.tab : ''
  return queryTab === 'orchestration' && canViewOrchestration.value ? 'orchestration' : 'agents'
}

const activeTab = ref<AgentTab>(resolveInitialTab())

// 权限变化时校正当前标签，避免停留在无权限的编排标签。
watch(canViewOrchestration, (can) => {
  if (activeTab.value === 'orchestration' && !can) {
    activeTab.value = 'agents'
  }
})
</script>

<style scoped>
.agent-management-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

.agent-management-switcher-bar {
  display: flex;
  align-items: center;
}

/* 胶囊式标签按钮组，复用 GitLab 管理的切换器视觉风格。 */
.agent-tab-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(225, 227, 228, 0.56);
}

.agent-tab-button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7c8794;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color .18s ease, color .18s ease;
}

.agent-tab-button.active {
  background: #fff;
  color: var(--app-primary);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

/* 隐藏 Element Plus 默认 tab 头，完全由上方自定义按钮组驱动切换。 */
.agent-management-tabs {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.agent-management-tabs :deep(.el-tabs__header) {
  display: none;
}

.agent-management-tabs :deep(.el-tabs__content) {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.agent-management-tabs :deep(.el-tab-pane) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 760px) {
  .agent-tab-button {
    padding: 0 10px;
  }
}
</style>
