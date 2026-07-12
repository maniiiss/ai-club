<template>
  <div class="dashboard-screen">
    <section class="dashboard-toolbar">
      <div class="dashboard-toolbar-actions">
        <button v-if="dashboardEditing" class="dashboard-toolbar-button ghost" type="button" @click="restoreDefaultLayout">恢复默认</button>
        <button class="dashboard-toolbar-button primary" type="button" @click="toggleDashboardEditing">
          {{ dashboardEditing ? '完成编辑' : '编辑看板' }}
        </button>
      </div>
      <p v-if="dashboardEditing && isMobileViewport" class="dashboard-toolbar-mobile-tip">
        手机端支持拖动排序和隐藏卡片，宽高布局请在桌面端调整。
      </p>
    </section>

    <VueDraggable
      v-model="visibleWidgetLayouts"
      class="dashboard-widget-grid"
      item-key="id"
      tag="section"
      handle=".dashboard-widget-drag-handle"
      ghost-class="dashboard-widget-ghost"
      chosen-class="dashboard-widget-chosen"
      :animation="200"
      :disabled="!dashboardEditing"
    >
      <article
        v-for="element in visibleWidgetLayouts"
        :key="element.id"
        class="dashboard-widget-card"
        :class="[
          widgetWidthClass(element.width),
          widgetHeightClass(element.height),
          {
            editing: dashboardEditing,
            'quick-action-widget': isActionWidget(element.id),
            'quick-merge-widget': element.id === 'gitlab-quick-merge',
            'quick-build-widget': element.id === 'quick-pipeline-build'
          }
        ]"
        :style="widgetCardStyle(element)"
      >
        <div :ref="setWidgetContentRef(element.id)" class="dashboard-widget-card-shell" :data-widget-id="element.id">
          <header v-if="shouldShowWidgetHeader(element.id)" class="dashboard-widget-head">
            <div v-if="shouldShowWidgetHeaderCopy(element.id)" class="dashboard-widget-head-copy">
              <div class="dashboard-widget-title">{{ getWidgetDefinition(element.id)?.title }}</div>
              <div class="dashboard-widget-description">{{ getWidgetDefinition(element.id)?.description }}</div>
            </div>
            <div v-if="!dashboardEditing && shouldShowHeaderAddAction(element.id)" class="dashboard-widget-head-quick-task-action">
              <button class="dashboard-widget-quick-task-trigger" type="button" :aria-label="headerAddActionLabel(element.id)" @mousedown.prevent="handleWidgetHeaderAdd(element.id)">
                <el-icon class="dashboard-widget-quick-task-trigger-icon"><Plus /></el-icon>
              </button>
            </div>
            <div v-if="dashboardEditing" class="dashboard-widget-head-actions">
              <div v-if="!isMobileViewport" class="dashboard-widget-size-group">
                <span class="dashboard-widget-size-label">宽度</span>
                <div class="dashboard-widget-size-buttons">
                  <button
                    v-for="option in DASHBOARD_WIDTH_OPTIONS"
                    :key="`width-${element.id}-${option.value}`"
                    class="dashboard-widget-size-button"
                    :class="{ active: element.width === option.value }"
                    type="button"
                    :aria-label="`将组件宽度调整为 ${option.label}`"
                    :aria-pressed="element.width === option.value"
                    @click="updateWidgetWidth(element.id, option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <div v-if="!isMobileViewport" class="dashboard-widget-size-group">
                <span class="dashboard-widget-size-label">高度</span>
                <div class="dashboard-widget-size-buttons">
                  <button
                    v-for="option in DASHBOARD_HEIGHT_OPTIONS"
                    :key="`height-${element.id}-${option.value}`"
                    class="dashboard-widget-size-button"
                    :class="{ active: element.height === option.value }"
                    type="button"
                    :aria-label="`将组件高度调整为 ${option.label}`"
                    :aria-pressed="element.height === option.value"
                    @click="updateWidgetHeight(element.id, option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <div v-if="isMobileViewport" class="dashboard-widget-mobile-edit-chip">长按手柄后拖动排序</div>
              <button class="dashboard-widget-icon dashboard-widget-drag-handle" type="button" :aria-label="isMobileViewport ? '长按后拖动排序' : '拖拽排序'">
                {{ isMobileViewport ? '拖动排序' : '⋮⋮' }}
              </button>
              <button class="dashboard-widget-icon" type="button" aria-label="隐藏组件" @click="hideWidget(element.id)">隐藏</button>
            </div>
          </header>

          <div class="dashboard-widget-body">
            <template v-if="element.id === 'stat-project-count'">
              <div v-if="isWidgetLoading(element.id)" class="dashboard-widget-skeleton-body body-stat">
                <div class="dashboard-skeleton-square"></div>
                <div class="dashboard-skeleton-line metric"></div>
                <div class="dashboard-skeleton-line caption"></div>
              </div>
              <div v-else class="stat-widget">
                <div class="stat-widget-icon orange">
                  <el-icon><FolderOpened /></el-icon>
                </div>
                <div class="stat-widget-value">{{ statCardMap.get('stat-project-count')?.value || 0 }}</div>
                <div class="stat-widget-caption">{{ statCardMap.get('stat-project-count')?.caption }}</div>
              </div>
            </template>

            <template v-else-if="element.id === 'stat-agent-count'">
              <div v-if="isWidgetLoading(element.id)" class="dashboard-widget-skeleton-body body-stat">
                <div class="dashboard-skeleton-square"></div>
                <div class="dashboard-skeleton-line metric"></div>
                <div class="dashboard-skeleton-line caption"></div>
              </div>
              <div v-else class="stat-widget">
                <div class="stat-widget-icon blue">
                  <el-icon><Cpu /></el-icon>
                </div>
                <div class="stat-widget-value">{{ statCardMap.get('stat-agent-count')?.value || 0 }}</div>
                <div class="stat-widget-caption">{{ statCardMap.get('stat-agent-count')?.caption }}</div>
              </div>
            </template>

            <template v-else-if="element.id === 'stat-task-count'">
              <div v-if="isWidgetLoading(element.id)" class="dashboard-widget-skeleton-body body-stat">
                <div class="dashboard-skeleton-square"></div>
                <div class="dashboard-skeleton-line metric"></div>
                <div class="dashboard-skeleton-line caption"></div>
              </div>
              <div v-else class="stat-widget">
                <div class="stat-widget-icon purple">
                  <el-icon><Tickets /></el-icon>
                </div>
                <div class="stat-widget-value">{{ statCardMap.get('stat-task-count')?.value || 0 }}</div>
                <div class="stat-widget-caption">{{ statCardMap.get('stat-task-count')?.caption }}</div>
              </div>
            </template>

            <template v-else-if="element.id === 'gitlab-quick-merge'">
              <div class="dashboard-widget-stack">
                <div class="quick-merge-widget-body">
                  <div class="quick-merge-kicker">GitLab 工作台</div>
                  <div class="quick-merge-hero-title">快速发起 MR</div>
                  <p class="quick-merge-hero-text">
                    {{ canManageGitlab ? (mergeAlertCount > 0 ? `当前有 ${mergeAlertCount} 条 GitLab 告警待关注，也可以直接发起新的 Merge Request。` : '选择项目、源分支和目标分支，直接从首页快速创建 Merge Request。') : '当前账号仅有 GitLab 查看权限，可从这里快速进入仓库管理页。' }}
                  </p>
                  <div class="quick-merge-meta-line">
                    <span>已绑定仓库：{{ gitlabBindingCount }}</span>
                    <span>待关注告警：{{ mergeAlertCount }}</span>
                  </div>
                  <div class="quick-merge-actions">
                    <button class="quick-merge-button ghost" type="button" @click="canViewGitlab ? router.push('/gitlab') : router.push('/dashboard')">查看 GitLab</button>
                    <button class="quick-merge-button solid" type="button" @click="canManageGitlab ? openQuickMergeDialog() : (canViewGitlab ? router.push('/gitlab') : router.push('/dashboard'))">
                      {{ canManageGitlab ? '快速发起 MR' : '进入仓库页' }}
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="element.id === 'quick-pipeline-build'">
              <div class="dashboard-widget-stack">
                <div class="quick-build-widget-body">
                  <div class="quick-build-kicker">CI/CD 工作台</div>
                  <div class="quick-build-hero-title">快速构建</div>
                  <p class="quick-build-hero-text">
                    {{ canBuildCicd ? '选择已启用的流水线，一键触发 GitPilot Pipeline 或 Jenkins 构建并快速跳转到流水线中心继续跟进。' : '查看首页推荐的流水线，快速进入流水线中心了解最新运行状态。' }}
                  </p>
                  <div class="quick-build-meta-line">
                    <span>可用流水线：{{ quickBuildBindingCount }}</span>
                      <span>当前权限：{{ canBuildCicd ? '可触发构建' : '仅查看' }}</span>
                  </div>
                </div>
                <div class="dashboard-widget-scroll-area">
                  <div v-if="quickBuildLoading" class="widget-empty">正在加载可快速触发的流水线...</div>
                  <div v-else-if="quickBuildBindings.length" class="quick-build-list">
                    <article v-for="binding in quickBuildBindings" :key="quickBuildEntryKey(binding)" class="quick-build-item">
                      <div class="quick-build-main">
                        <div class="quick-build-title-row">
                          <div class="quick-build-title">{{ binding.projectName }}</div>
                          <span class="quick-build-status-chip" :class="quickBuildTriggerStatusTone(binding.lastRunStatus)">
                            {{ formatQuickBuildTriggerStatus(binding.lastRunStatus) }}
                          </span>
                        </div>
                        <div class="quick-build-subtitle">{{ formatQuickBuildProvider(binding.providerCode) }} / {{ binding.displayName }}</div>
                        <div class="quick-build-meta-line">
                          <span>默认分支：{{ binding.defaultBranch || '-' }}</span>
                          <span>最近触发：{{ formatDateTime(binding.lastTriggeredAt) }}</span>
                        </div>
                        <div class="quick-build-message">{{ binding.lastRunMessage || '当前暂无最近运行结果，可直接发起新的流水线。' }}</div>
                      </div>
                      <div class="quick-build-actions">
                        <button class="quick-build-button ghost" type="button" @click="handleOpenPipelineCenter">查看流水线</button>
                        <button
                          v-if="canBuildCicd"
                          class="quick-build-button solid"
                          type="button"
                          :disabled="quickBuildTriggeringId === quickBuildEntryKey(binding)"
                          @click="handleQuickBuildTrigger(binding)"
                        >
                          {{ quickBuildTriggeringId === quickBuildEntryKey(binding) ? '触发中...' : '立即构建' }}
                        </button>
                      </div>
                    </article>
                  </div>
                  <div v-else class="widget-empty">
                    {{ canBuildCicd ? '当前没有可快速触发的启用流水线，请先在流水线中心创建或启用流水线。' : '当前没有可展示的启用流水线，可进入流水线中心查看详情。' }}
                  </div>
                </div>
                <button v-if="canViewCicd" class="widget-footer-button" type="button" @click="handleOpenPipelineCenter">进入流水线中心</button>
              </div>
            </template>

            <template v-else-if="element.id === 'active-project-list'">
              <div class="dashboard-widget-stack">
                <div class="dashboard-widget-scroll-area">
                  <div v-if="isWidgetLoading(element.id)" class="dashboard-widget-skeleton-body body-list">
                    <div v-for="index in 4" :key="`active-project-skeleton-${index}`" class="dashboard-skeleton-list-item">
                      <div class="dashboard-skeleton-line list-title"></div>
                      <div class="dashboard-skeleton-line list-subtitle"></div>
                    </div>
                  </div>
                  <div v-else-if="activeProjects.length" class="info-list">
                    <article v-for="project in activeProjects" :key="project.id" class="info-list-item">
                      <div class="info-list-main">
                        <div class="info-list-title">{{ project.name }}</div>
                        <div class="info-list-subtitle">负责人：{{ project.owner || '未指定' }}</div>
                      </div>
                      <span class="info-list-chip">{{ project.status || '进行中' }}</span>
                    </article>
                  </div>
                  <div v-else class="widget-empty">当前暂无活跃项目数据。</div>
                </div>
                <button v-if="canViewProjects" class="widget-footer-button" type="button" @click="router.push('/projects')">进入项目中心</button>
              </div>
            </template>

            <template v-else-if="element.id === 'online-agent-list'">
              <div class="dashboard-widget-stack">
                <div class="dashboard-widget-scroll-area">
                  <div v-if="isWidgetLoading(element.id)" class="dashboard-widget-skeleton-body body-list">
                    <div v-for="index in 4" :key="`online-agent-skeleton-${index}`" class="dashboard-skeleton-list-item">
                      <div class="dashboard-skeleton-line list-title"></div>
                      <div class="dashboard-skeleton-line list-subtitle"></div>
                    </div>
                  </div>
                  <div v-else-if="onlineAgents.length" class="info-list">
                    <article v-for="agent in onlineAgents" :key="agent.id" class="info-list-item">
                      <div class="info-list-main">
                        <div class="info-list-title">{{ agent.name }}</div>
                        <div class="info-list-subtitle">{{ agent.projectName || agent.type || '智能体' }}</div>
                      </div>
                      <span class="info-list-chip success">{{ agent.enabled ? '在线' : '停用' }}</span>
                    </article>
                  </div>
                  <div v-else class="widget-empty">当前暂无在线智能体数据。</div>
                </div>
                <button v-if="authStore.hasPermission('agent:view')" class="widget-footer-button" type="button" @click="router.push('/agents')">进入智能体中心</button>
              </div>
            </template>

            <template v-else-if="element.id === 'recent-task-list'">
              <div class="dashboard-widget-stack">
                <div class="dashboard-widget-scroll-area">
                  <div v-if="isWidgetLoading(element.id)" class="dashboard-widget-skeleton-body body-list">
                    <div v-for="index in 4" :key="`recent-task-skeleton-${index}`" class="dashboard-skeleton-list-item">
                      <div class="dashboard-skeleton-line list-title"></div>
                      <div class="dashboard-skeleton-line list-subtitle"></div>
                    </div>
                  </div>
                  <div v-else-if="recentTaskRows.length" class="task-list">
                    <article v-for="task in recentTaskRows" :key="task.id" class="task-list-item">
                      <div class="task-list-main">
                        <div class="task-list-title">{{ task.title }}</div>
                        <div class="task-list-subtitle">{{ task.subtitle }}</div>
                      </div>
                      <div class="task-list-side">
                        <span class="task-health-text">{{ task.health }}%</span>
                        <span class="task-time-text">{{ task.updatedAt }}</span>
                      </div>
                    </article>
                  </div>
                  <div v-else class="widget-empty">当前暂无最近任务数据。</div>
                </div>
                <button v-if="canViewTasks" class="widget-footer-button" type="button" @click="router.push('/tasks')">进入任务中心</button>
              </div>
            </template>

            <template v-else-if="element.id === 'system-shortcut-entries'">
              <div v-if="isWidgetLoading(element.id)" class="dashboard-widget-skeleton-body body-list">
                <div v-for="index in 2" :key="`shortcut-skeleton-${index}`" class="dashboard-skeleton-list-item">
                  <div class="dashboard-skeleton-line list-title"></div>
                  <div class="dashboard-skeleton-line list-subtitle"></div>
                </div>
              </div>
              <DashboardShortcutEntriesWidget
                v-else
                :ref="setShortcutWidgetRef(element.id)"
                :overview="overview.shortcutOverview"
              />
            </template>

            <template v-else-if="element.id === 'quick-task-checklist'">
              <DashboardQuickTaskWidget :ref="setQuickTaskWidgetRef(element.id)" />
            </template>
          </div>
        </div>
      </article>
    </VueDraggable>

    <section v-if="dashboardEditing" class="dashboard-widget-library">
      <div class="dashboard-widget-library-head">
        <div>
          <h3>可添加组件</h3>
          <p>隐藏后的组件会收纳到这里，点击即可重新加入首页。</p>
        </div>
      </div>
      <div v-if="hiddenWidgetDefinitions.length" class="dashboard-widget-library-list">
        <button
          v-for="definition in hiddenWidgetDefinitions"
          :key="definition.id"
          class="dashboard-widget-library-item"
          type="button"
          @click="showWidget(definition.id)"
        >
          <span class="dashboard-widget-library-item-title">{{ definition.title }}</span>
          <span class="dashboard-widget-library-item-desc">{{ definition.description }}</span>
          <span class="dashboard-widget-library-item-action">添加</span>
        </button>
      </div>
      <div v-else class="widget-empty">当前没有隐藏组件，已经全部展示。</div>
    </section>

    <el-dialog v-model="quickMergeDialogVisible" title="GitLab 快速发起 MR" width="720px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader title="GitLab 快速发起 MR" :subtitle="quickMergeDialogSubtitle" :icon="FolderOpened" />
      </template>
        <el-form ref="quickMergeFormRef" :model="quickMergeForm" :rules="quickMergeRules" label-position="top" class="platform-form-layout">
          <el-form-item label="项目" prop="bindingId">
            <el-select v-model="quickMergeForm.bindingId" placeholder="请选择已绑定 GitLab 的项目仓库" style="width: 100%">
            <el-option
              v-for="binding in quickMergeBindingOptions"
              :key="binding.id"
              :label="`${binding.projectName} / ${binding.gitlabProjectPath || binding.gitlabProjectRef}`"
              :value="binding.id"
            />
          </el-select>
          <div class="form-tip">如同一项目绑定多个仓库，请按“项目 / 仓库路径”选择。</div>
        </el-form-item>
        <div class="quick-merge-auth-card" :class="{ connected: !quickMergeSubmitDisabledReason }">
          <div class="quick-merge-auth-title">GitLab 发起身份</div>
          <div class="quick-merge-auth-text">{{ quickMergeActorDisplay }}</div>
          <div v-if="quickMergeSubmitDisabledReason" class="quick-merge-auth-warning">{{ quickMergeSubmitDisabledReason }}</div>
          <div class="quick-merge-auth-actions">
            <el-button v-if="quickMergeSubmitDisabledReason" link type="primary" @click="router.push('/profile')">前往个人中心绑定</el-button>
          </div>
        </div>
        <el-form-item label="源分支" prop="sourceBranch">
          <el-select
            v-model="quickMergeForm.sourceBranch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索源分支"
            style="width: 100%"
            :remote-method="handleQuickMergeSourceSearch"
            :loading="sourceBranchLoading"
            @change="handleQuickMergeSourceBranchChange"
          >
            <el-option
              v-for="branch in quickMergeSourceBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目标分支" prop="targetBranch">
          <el-select
            v-model="quickMergeForm.targetBranch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索目标分支"
            style="width: 100%"
            :remote-method="handleQuickMergeTargetSearch"
            :loading="targetBranchLoading"
          >
            <el-option
              v-for="branch in quickMergeTargetBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="MR 标题" prop="title">
          <el-input v-model="quickMergeForm.title" placeholder="请输入本次合并请求标题" />
        </el-form-item>
        <el-form-item label="MR 描述">
          <el-input v-model="quickMergeForm.description" type="textarea" :rows="4" placeholder="可选，补充本次 MR 的背景、变更点或注意事项" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="quickMergeDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="quickMergeSubmitting" :disabled="Boolean(quickMergeSubmitDisabledReason)" @click="handleQuickMergeSubmit">创建 MR</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="quickMergeResultVisible" title="MR 创建结果" width="720px">
      <el-descriptions v-if="quickMergeResult" :column="2" border>
        <el-descriptions-item label="平台项目">{{ quickMergeResult.projectName }}</el-descriptions-item>
        <el-descriptions-item label="GitLab 仓库">{{ quickMergeResult.projectRef }}</el-descriptions-item>
        <el-descriptions-item label="MR IID">!{{ quickMergeResult.iid }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ quickMergeResult.state || '-' }}</el-descriptions-item>
        <el-descriptions-item label="源分支">{{ quickMergeResult.sourceBranch }}</el-descriptions-item>
        <el-descriptions-item label="目标分支">{{ quickMergeResult.targetBranch }}</el-descriptions-item>
        <el-descriptions-item label="标题" :span="2">{{ quickMergeResult.title }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(quickMergeResult.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="发起账号">
          {{ quickMergeResult.actorName || '-' }}<template v-if="quickMergeResult.actorUsername">（{{ quickMergeResult.actorUsername }}）</template>
        </el-descriptions-item>
        <el-descriptions-item label="链接">
          <el-link v-if="quickMergeResult.webUrl" :href="quickMergeResult.webUrl" target="_blank" type="primary">打开 GitLab MR</el-link>
          <span v-else>-</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Cpu, FolderOpened, Plus, Tickets } from '@element-plus/icons-vue'
import DashboardQuickTaskWidget from '@/components/DashboardQuickTaskWidget.vue'
import DashboardShortcutEntriesWidget from '@/components/DashboardShortcutEntriesWidget.vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import { pagePipelineCenterEntries, triggerAiClubPipeline, triggerPipelineBuild } from '@/api/cicd'
import { VueDraggable } from 'vue-draggable-plus'
import {
  createGitlabMergeRequest,
  getCurrentUserGitlabOauthBinding,
  listGitlabBindingOptions,
  listGitlabBranches
} from '@/api/gitlab'
import {
  getDashboardActiveProjects,
  getDashboardOnlineAgents,
  getDashboardRecentTasks,
  getDashboardShortcutOverview,
  getDashboardStats
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import type {
  DashboardOverview,
  GitlabBranchItem,
  GitlabCreateMergeRequestResultItem,
  GitlabUserOauthBindingItem,
  ProjectGitlabBindingItem,
  PipelineCenterEntryItem,
  TaskItem
} from '@/types/platform'
import type {
  DashboardWidgetDefinition,
  DashboardWidgetHeight,
  DashboardWidgetId,
  DashboardWidgetLayoutItem,
  DashboardWidgetWidth
} from '@/types/dashboard'
import {
  buildDefaultDashboardLayout,
  DASHBOARD_WIDGET_DEFINITIONS,
  filterDashboardWidgetsByPermission,
  mergeDashboardLayout,
  readStoredDashboardLayout,
  writeStoredDashboardLayout
} from '@/utils/dashboardLayout'
import { useMobileViewport } from '@/utils/mobileViewport'

interface TaskRowItem {
  id: string
  title: string
  subtitle: string
  agent: string
  health: number
  updatedAt: string
}

interface QuickMergeForm {
  bindingId: number | null
  sourceBranch: string
  targetBranch: string
  title: string
  description: string
}

interface StatCardItem {
  id: DashboardWidgetId
  value: string | number
  caption: string
}

interface DashboardWidgetWidthOption {
  value: DashboardWidgetWidth
  label: string
}

interface DashboardWidgetHeightOption {
  value: DashboardWidgetHeight
  label: string
}

const DASHBOARD_BASE_ROW_HEIGHT_PX = 220
const DASHBOARD_GRID_GAP_PX = 20
const DASHBOARD_GRID_ROW_UNIT_PX = 8
const DASHBOARD_WIDTH_OPTIONS: DashboardWidgetWidthOption[] = [
  { value: 'quarter', label: '1/4' },
  { value: 'half', label: '1/2' },
  { value: 'threeQuarter', label: '3/4' },
  { value: 'full', label: '1' }
]
const DASHBOARD_HEIGHT_OPTIONS: DashboardWidgetHeightOption[] = [
  { value: 'single', label: '1 行' },
  { value: 'double', label: '2 行' },
  { value: 'triple', label: '3 行' },
  { value: 'quadruple', label: '4 行' }
]

const router = useRouter()
const authStore = useAuthStore()
const dashboardEditing = ref(false)
const overview = ref<DashboardOverview>(fallbackOverview())
const statsLoading = ref(true)
const activeProjectsLoading = ref(true)
const onlineAgentsLoading = ref(true)
const recentTasksLoading = ref(true)
const shortcutsLoading = ref(true)
const widgetLayout = ref<DashboardWidgetLayoutItem[]>([])
const quickMergeDialogVisible = ref(false)
const quickMergeResultVisible = ref(false)
const quickMergeSubmitting = ref(false)
const quickBuildLoading = ref(false)
const quickBuildBindings = ref<PipelineCenterEntryItem[]>([])
const quickBuildTriggeringId = ref<string | null>(null)
const quickMergeFormRef = ref<FormInstance>()
const quickMergeBindingOptions = ref<ProjectGitlabBindingItem[]>([])
const quickMergeOauthBinding = ref<GitlabUserOauthBindingItem>(fallbackQuickMergeOauthBinding())
const quickMergeSourceBranchOptions = ref<GitlabBranchItem[]>([])
const quickMergeTargetBranchOptions = ref<GitlabBranchItem[]>([])
const sourceBranchLoading = ref(false)
const targetBranchLoading = ref(false)
const quickMergeResult = ref<GitlabCreateMergeRequestResultItem | null>(null)
const quickMergeAutoFilledTitle = ref('')
const quickMergeForm = reactive<QuickMergeForm>({ bindingId: null, sourceBranch: '', targetBranch: '', title: '', description: '' })
const quickMergeDialogSubtitle = computed(() => {
  if (quickMergeSubmitDisabledReason.value) {
    return quickMergeSubmitDisabledReason.value
  }
  return quickMergeActorDisplay.value
})
const widgetMeasuredRowSpanMap = ref<Partial<Record<DashboardWidgetId, number>>>({})

const quickMergeRules: FormRules<QuickMergeForm> = {
  bindingId: [{ required: true, message: '请选择项目仓库', trigger: 'change' }],
  sourceBranch: [{ required: true, message: '请选择源分支', trigger: 'change' }],
  targetBranch: [{ required: true, message: '请选择目标分支', trigger: 'change' }],
  title: [{ required: true, message: '请输入 MR 标题', trigger: 'blur' }]
}

const canViewTasks = computed(() => authStore.hasPermission('task:view'))
const canViewProjects = computed(() => authStore.hasPermission('project:view'))
const canViewGitlab = computed(() => authStore.hasPermission('gitlab:view'))
const canManageGitlab = computed(() => authStore.hasPermission('gitlab:manage'))
const canViewCicd = computed(() => authStore.hasPermission('cicd:view'))
const canBuildCicd = computed(() => authStore.hasPermission('cicd:build'))
const meNames = computed(() => [authStore.user?.nickname, authStore.user?.username].filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))
const gitlabBindingCount = computed(() => quickMergeBindingOptions.value.length)
const currentQuickMergeBinding = computed(() => quickMergeBindingOptions.value.find((item) => item.id === quickMergeForm.bindingId) || null)
const quickMergeBindingSupportsOauth = computed(() => {
  if (!currentQuickMergeBinding.value) {
    return false
  }
  return currentQuickMergeBinding.value.apiBaseUrl === quickMergeOauthBinding.value.apiBaseUrl
})
// 用户管理绑定只证明本地用户和 GitLab 用户有关联；真正发起 MR 仍需要 OAuth token。
const quickMergeGitlabAccountBound = computed(() =>
  Boolean(quickMergeOauthBinding.value.gitlabUserId || quickMergeOauthBinding.value.gitlabUsername || quickMergeOauthBinding.value.gitlabName)
)
const quickMergeActorDisplay = computed(() => {
  const actorName = quickMergeOauthBinding.value.gitlabName || '-'
  const actorUsername = quickMergeOauthBinding.value.gitlabUsername || '-'
  if (!quickMergeOauthBinding.value.connected) {
    if (quickMergeGitlabAccountBound.value) {
      return `已绑定 ${actorName}（${actorUsername}），授权后可发起 MR`
    }
    return '当前尚未绑定 GitLab 用户身份'
  }
  return `将以 ${actorName}（${actorUsername}）身份发起`
})
const quickMergeSubmitDisabledReason = computed(() => {
  if (!currentQuickMergeBinding.value) {
    return '请先选择项目仓库'
  }
  if (!quickMergeBindingSupportsOauth.value) {
    return '当前仓库实例暂不支持使用个人 GitLab 授权发起 MR'
  }
  if (!quickMergeOauthBinding.value.connected) {
    if (quickMergeGitlabAccountBound.value) {
      return '当前 GitLab 用户尚未完成 OAuth 授权，请先前往个人中心授权后发起 MR'
    }
    return '当前用户尚未绑定 GitLab 用户或 OAuth 授权，请先前往个人中心完成授权'
  }
  return ''
})
const quickBuildBindingCount = computed(() => quickBuildBindings.value.length)
const dashboardLayoutUserId = computed(() => authStore.user?.id ?? null)
const { isMobileViewport } = useMobileViewport()

const availableWidgetDefinitions = computed(() =>
  filterDashboardWidgetsByPermission(DASHBOARD_WIDGET_DEFINITIONS, (permission) => authStore.hasPermission(permission))
)
const widgetDefinitionMap = computed(() => new Map(availableWidgetDefinitions.value.map((definition) => [definition.id, definition])))

const visibleWidgetLayouts = computed<DashboardWidgetLayoutItem[]>({
  get: () => widgetLayout.value.filter((item) => item.visible && widgetDefinitionMap.value.has(item.id)),
  set: (nextVisibleLayouts) => {
    const nextVisibleIds = new Set(nextVisibleLayouts.map((item) => item.id))
    const currentById = new Map(widgetLayout.value.map((item) => [item.id, item]))
    const hiddenLayouts = widgetLayout.value
      .filter((item) => widgetDefinitionMap.value.has(item.id) && !nextVisibleIds.has(item.id))
      .map((item) => ({ ...item, visible: false }))

    widgetLayout.value = [
      ...nextVisibleLayouts.map((item) => ({
        ...(currentById.get(item.id) || item),
        visible: true
      })),
      ...hiddenLayouts
    ]
  }
})

const hiddenWidgetDefinitions = computed(() =>
  widgetLayout.value
    .filter((item) => !item.visible)
    .map((item) => widgetDefinitionMap.value.get(item.id))
    .filter((definition): definition is DashboardWidgetDefinition => Boolean(definition))
)

const myTasks = computed(() => {
  const explicit = overview.value.myTasks ?? []
  if (explicit.length) {
    return sortTasks(explicit).slice(0, 8)
  }
  const recent = overview.value.recentTasks ?? []
  const mine = recent.filter((task) => meNames.value.includes(task.assignee))
  return sortTasks(mine.length ? mine : recent).slice(0, 8)
})

const activeProjects = computed(() => overview.value.activeProjects.slice(0, 5))
const onlineAgents = computed(() => overview.value.onlineAgents.slice(0, 5))
const mergeAlertCount = computed(() => overview.value.stats.mergeAlertCount ?? overview.value.currentUserGitlabMergeLogs.filter((item) => item.result !== 'MERGED').length)

const recentTaskRows = computed<TaskRowItem[]>(() =>
  myTasks.value.slice(0, 6).map((task) => ({
    id: String(task.id),
    title: task.name,
    subtitle: `项目：${task.projectName} · 负责人：${task.assignee || '未指派'}`,
    agent: task.agentName || task.assignee || '未指派',
    health: taskHealthPercent(task),
    updatedAt: formatDateTime(task.updatedAt)
  }))
)

const statCards = computed<StatCardItem[]>(() => [
  { id: 'stat-project-count', value: overview.value.stats.projectCount ?? 0, caption: `${activeProjects.value.length} 个活跃项目` },
  { id: 'stat-agent-count', value: overview.value.stats.agentCount || onlineAgents.value.length, caption: `${onlineAgents.value.length} 个在线智能体` },
  { id: 'stat-task-count', value: formatCompactNumber(overview.value.stats.taskCount || myTasks.value.length), caption: `${myTasks.value.length} 个待跟进任务` }
])
const statCardMap = computed(() => new Map(statCards.value.map((item) => [item.id, item])))
const quickTaskWidgetRef = ref<{ addTask: () => void } | null>(null)
const shortcutWidgetRef = ref<{ addEntry: () => void; refresh: () => Promise<void> | void } | null>(null)
const widgetContentElementMap = new Map<DashboardWidgetId, HTMLElement>()
let widgetContentResizeObserver: ResizeObserver | null = null

watch(
  [availableWidgetDefinitions, dashboardLayoutUserId],
  ([definitions, userId], previousValue) => {
    const previousUserId = previousValue?.[1] ?? null
    const shouldReloadStoredLayout = !widgetLayout.value.length || previousValue === undefined || userId !== previousUserId

    // 首次进入页面或切换账号时，优先读取当前用户自己的缓存布局，避免不同账号之间相互覆盖。
    const sourceLayout = shouldReloadStoredLayout
      ? readStoredDashboardLayout(userId, definitions)
      : widgetLayout.value

    widgetLayout.value = mergeDashboardLayout(sourceLayout, definitions)
    if (definitions.length > 0 && widgetLayout.value.every((item) => !item.visible)) {
      widgetLayout.value = buildDefaultDashboardLayout(definitions)
    }
  },
  { immediate: true }
)

watch(widgetLayout, (nextLayout) => writeStoredDashboardLayout(nextLayout, dashboardLayoutUserId.value), { deep: true })
watch(
  [visibleWidgetLayouts, activeProjects, onlineAgents, recentTaskRows, mergeAlertCount, gitlabBindingCount, quickBuildBindingCount, dashboardEditing],
  () => {
    void nextTick(syncVisibleWidgetRowSpans)
  },
  { deep: true }
)

watch(
  () => quickMergeForm.bindingId,
  async (bindingId) => {
    quickMergeForm.sourceBranch = ''
    quickMergeForm.targetBranch = ''
    quickMergeSourceBranchOptions.value = []
    quickMergeTargetBranchOptions.value = []
    if (!bindingId) {
      return
    }
    await Promise.all([loadQuickMergeBranches('source'), loadQuickMergeBranches('target')])
    const currentBinding = quickMergeBindingOptions.value.find((item) => item.id === bindingId)
    const preferredTarget = currentBinding?.defaultTargetBranch || quickMergeTargetBranchOptions.value.find((item) => item.defaultBranch)?.name || ''
    if (preferredTarget) {
      quickMergeForm.targetBranch = preferredTarget
    }
  }
)

function getWidgetDefinition(widgetId: DashboardWidgetId) {
  return widgetDefinitionMap.value.get(widgetId)
}

function isActionWidget(widgetId: DashboardWidgetId) {
  return widgetId === 'gitlab-quick-merge' || widgetId === 'quick-pipeline-build'
}

function shouldShowWidgetHeader(widgetId: DashboardWidgetId) {
  return !isActionWidget(widgetId) || dashboardEditing.value
}

function shouldShowWidgetHeaderCopy(widgetId: DashboardWidgetId) {
  return !isActionWidget(widgetId)
}

function shouldShowHeaderAddAction(widgetId: DashboardWidgetId) {
  return widgetId === 'quick-task-checklist' || widgetId === 'system-shortcut-entries'
}

/**
 * 由卡片头部的 + 号统一驱动快捷任务新增，保证按钮和标题处于同一行。
 */
function handleWidgetHeaderAdd(widgetId: DashboardWidgetId) {
  if (widgetId === 'quick-task-checklist') {
    quickTaskWidgetRef.value?.addTask()
    return
  }
  if (widgetId === 'system-shortcut-entries') {
    shortcutWidgetRef.value?.addEntry()
  }
}

function headerAddActionLabel(widgetId: DashboardWidgetId) {
  if (widgetId === 'system-shortcut-entries') {
    return '新增快捷入口'
  }
  return '新增快捷任务'
}

/**
 * 快捷任务组件位于首页卡片循环里，不能直接使用字符串 ref；
 * 这里按组件标识精确绑定实例，避免拿到 ref 数组后导致头部 + 号失效。
 */
function setQuickTaskWidgetRef(widgetId: DashboardWidgetId) {
  return (target: Element | ComponentPublicInstance | null) => {
    if (widgetId !== 'quick-task-checklist') {
      return
    }
    quickTaskWidgetRef.value = target as { addTask: () => void } | null
  }
}

/**
 * 快捷入口组件同样位于首页卡片循环里，这里按组件标识精确绑定实例，
 * 让卡片头部的 + 号可以直接驱动新增个人快捷入口。
 */
function setShortcutWidgetRef(widgetId: DashboardWidgetId) {
  return (target: Element | ComponentPublicInstance | null) => {
    if (widgetId !== 'system-shortcut-entries') {
      return
    }
    shortcutWidgetRef.value = target as { addEntry: () => void; refresh: () => Promise<void> | void } | null
  }
}

function widgetWidthClass(width: DashboardWidgetWidth) {
  if (width === 'quarter') return 'width-quarter'
  if (width === 'half') return 'width-half'
  if (width === 'threeQuarter') return 'width-three-quarter'
  return 'width-full'
}

function widgetHeightClass(height: DashboardWidgetHeight) {
  if (height === 'double') return 'height-double'
  if (height === 'triple') return 'height-triple'
  if (height === 'quadruple') return 'height-quadruple'
  return 'height-single'
}

function updateWidgetWidth(widgetId: DashboardWidgetId, width: DashboardWidgetWidth) {
  updateWidgetLayout(widgetId, { width })
}

function updateWidgetHeight(widgetId: DashboardWidgetId, height: DashboardWidgetHeight) {
  updateWidgetLayout(widgetId, { height })
}

function updateWidgetLayout(
  widgetId: DashboardWidgetId,
  patch: Partial<Pick<DashboardWidgetLayoutItem, 'width' | 'height' | 'visible'>>
) {
  // 宽高调整只更新目标卡片自身字段，避免拖拽顺序和其它组件状态被意外重置。
  widgetLayout.value = widgetLayout.value.map((item) => (item.id === widgetId ? { ...item, ...patch } : item))
  void nextTick(() => syncWidgetCardRowSpan(widgetId))
}

/**
 * 编辑态切换宽度后，卡片里的换行和按钮布局都会变化。
 * 这里用内容真实高度反推网格跨行数，让组件在 1/4 宽度下优先向下展开，而不是被硬压缩。
 */
function widgetCardStyle(layoutItem: DashboardWidgetLayoutItem) {
  const measuredRowSpan = widgetMeasuredRowSpanMap.value[layoutItem.id]
  return {
    gridRowEnd: `span ${measuredRowSpan ?? calculateMinimumGridRowSpan(layoutItem.height)}`
  }
}

function setWidgetContentRef(widgetId: DashboardWidgetId) {
  return (target: Element | ComponentPublicInstance | null) => {
    const element = resolveWidgetContentElement(target)
    const previousElement = widgetContentElementMap.get(widgetId)

    if (previousElement && previousElement !== element) {
      widgetContentResizeObserver?.unobserve(previousElement)
      widgetContentElementMap.delete(widgetId)
    }

    if (!(element instanceof HTMLElement)) {
      widgetMeasuredRowSpanMap.value = {
        ...widgetMeasuredRowSpanMap.value,
        [widgetId]: undefined
      }
      return
    }

    widgetContentElementMap.set(widgetId, element)
    widgetContentResizeObserver?.observe(element)
    void nextTick(() => syncWidgetCardRowSpan(widgetId))
  }
}

function resolveWidgetContentElement(target: Element | ComponentPublicInstance | null) {
  if (target instanceof HTMLElement) {
    return target
  }
  if (target && '$el' in target && target.$el instanceof HTMLElement) {
    return target.$el
  }
  return null
}

function syncVisibleWidgetRowSpans() {
  visibleWidgetLayouts.value.forEach((item) => {
    syncWidgetCardRowSpan(item.id)
  })
}

function syncWidgetCardRowSpan(widgetId: DashboardWidgetId) {
  const layoutItem = widgetLayout.value.find((item) => item.id === widgetId)
  const contentElement = widgetContentElementMap.get(widgetId)
  if (!layoutItem || !contentElement) {
    return
  }

  const contentHeight = Math.ceil(contentElement.scrollHeight)
  const minimumHeight = resolveMinimumWidgetHeight(layoutItem.height)
  const nextRowSpan = calculateGridRowSpan(Math.max(contentHeight, minimumHeight))

  if (widgetMeasuredRowSpanMap.value[widgetId] === nextRowSpan) {
    return
  }

  widgetMeasuredRowSpanMap.value = {
    ...widgetMeasuredRowSpanMap.value,
    [widgetId]: nextRowSpan
  }
}

function resolveMinimumWidgetHeight(height: DashboardWidgetHeight) {
  const rowCount = resolveWidgetHeightRowCount(height)
  return (DASHBOARD_BASE_ROW_HEIGHT_PX * rowCount) + (DASHBOARD_GRID_GAP_PX * Math.max(0, rowCount - 1))
}

function resolveWidgetHeightRowCount(height: DashboardWidgetHeight) {
  if (height === 'double') return 2
  if (height === 'triple') return 3
  if (height === 'quadruple') return 4
  return 1
}

function calculateMinimumGridRowSpan(height: DashboardWidgetHeight) {
  return calculateGridRowSpan(resolveMinimumWidgetHeight(height))
}

function calculateGridRowSpan(pixelHeight: number) {
  return Math.max(1, Math.ceil((pixelHeight + DASHBOARD_GRID_GAP_PX) / (DASHBOARD_GRID_ROW_UNIT_PX + DASHBOARD_GRID_GAP_PX)))
}

function toggleDashboardEditing() {
  dashboardEditing.value = !dashboardEditing.value
}

function restoreDefaultLayout() {
  widgetLayout.value = buildDefaultDashboardLayout(availableWidgetDefinitions.value)
  ElMessage.success('首页看板已恢复默认布局')
}

function hideWidget(widgetId: DashboardWidgetId) {
  const target = widgetLayout.value.find((item) => item.id === widgetId)
  if (!target) return
  const remaining = widgetLayout.value.filter((item) => item.id !== widgetId)
  widgetLayout.value = [
    ...remaining.filter((item) => item.visible),
    ...remaining.filter((item) => !item.visible),
    { ...target, visible: false }
  ]
}

function showWidget(widgetId: DashboardWidgetId) {
  const target = widgetLayout.value.find((item) => item.id === widgetId)
  if (!target) return
  const remaining = widgetLayout.value.filter((item) => item.id !== widgetId)
  widgetLayout.value = [
    ...remaining.filter((item) => item.visible),
    { ...target, visible: true },
    ...remaining.filter((item) => !item.visible)
  ]
}

async function loadDashboardCards() {
  const base = fallbackOverview()
  overview.value = {
    ...base,
    ...overview.value
  }

  statsLoading.value = true
  activeProjectsLoading.value = true
  onlineAgentsLoading.value = true
  recentTasksLoading.value = true
  shortcutsLoading.value = true

  const statsPromise = getDashboardStats()
    .then((stats) => {
      overview.value = {
        ...overview.value,
        stats: { ...base.stats, ...(stats || {}) }
      }
    })
    .catch(() => {
      overview.value = {
        ...overview.value,
        stats: { ...base.stats }
      }
    })
    .finally(() => {
      statsLoading.value = false
    })

  const projectsPromise = getDashboardActiveProjects()
    .then((projects) => {
      overview.value = {
        ...overview.value,
        activeProjects: projects || []
      }
    })
    .catch(() => {
      overview.value = {
        ...overview.value,
        activeProjects: []
      }
    })
    .finally(() => {
      activeProjectsLoading.value = false
    })

  const agentsPromise = getDashboardOnlineAgents()
    .then((agents) => {
      overview.value = {
        ...overview.value,
        onlineAgents: agents || []
      }
    })
    .catch(() => {
      overview.value = {
        ...overview.value,
        onlineAgents: []
      }
    })
    .finally(() => {
      onlineAgentsLoading.value = false
    })

  const tasksPromise = getDashboardRecentTasks()
    .then((tasks) => {
      overview.value = {
        ...overview.value,
        recentTasks: tasks || []
      }
    })
    .catch(() => {
      overview.value = {
        ...overview.value,
        recentTasks: []
      }
    })
    .finally(() => {
      recentTasksLoading.value = false
    })

  const shortcutsPromise = getDashboardShortcutOverview()
    .then((shortcutOverview) => {
      overview.value = {
        ...overview.value,
        shortcutOverview: shortcutOverview || fallbackOverview().shortcutOverview
      }
    })
    .catch(() => {
      overview.value = {
        ...overview.value,
        shortcutOverview: {
          ...fallbackOverview().shortcutOverview,
          userEntries: []
        }
      }
    })
    .finally(() => {
      shortcutsLoading.value = false
    })

  await Promise.allSettled([statsPromise, projectsPromise, agentsPromise, tasksPromise, shortcutsPromise])
}

/**
 * 首页快速构建卡片复用流水线中心条目，兼容内置 GitPilot Pipeline 与外部 Jenkins 绑定。
 */
async function loadQuickBuildBindings() {
  if (!canViewCicd.value) {
    quickBuildBindings.value = []
    return
  }

  quickBuildLoading.value = true
  try {
    const pageData = await pagePipelineCenterEntries({
      page: 1,
      size: 4,
      enabled: true
    })
    quickBuildBindings.value = pageData.records
  } catch (error: any) {
    quickBuildBindings.value = []
    ElMessage.error(error?.response?.data?.message || '加载快速构建列表失败')
  } finally {
    quickBuildLoading.value = false
  }
}

function resetQuickMergeForm() {
  quickMergeForm.bindingId = null
  quickMergeForm.sourceBranch = ''
  quickMergeForm.targetBranch = ''
  quickMergeForm.title = ''
  quickMergeForm.description = ''
  quickMergeAutoFilledTitle.value = ''
  quickMergeSourceBranchOptions.value = []
  quickMergeTargetBranchOptions.value = []
  quickMergeFormRef.value?.clearValidate()
}

async function loadQuickMergeBindings() {
  quickMergeBindingOptions.value = await listGitlabBindingOptions()
  if (!quickMergeBindingOptions.value.length) {
    throw new Error('暂无可用的 GitLab 绑定项目')
  }
  if (!quickMergeForm.bindingId) {
    quickMergeForm.bindingId = quickMergeBindingOptions.value[0].id
  }
}

/**
 * 首页快速发起 MR 依赖当前登录用户的 GitLab OAuth 绑定状态。
 */
async function loadQuickMergeOauthBinding() {
  try {
    quickMergeOauthBinding.value = await getCurrentUserGitlabOauthBinding()
  } catch (error: any) {
    quickMergeOauthBinding.value = fallbackQuickMergeOauthBinding()
    ElMessage.error(error?.response?.data?.message || '加载 GitLab 授权状态失败')
  }
}

async function loadQuickMergeBranches(kind: 'source' | 'target', keyword = '') {
  if (!quickMergeForm.bindingId) return
  if (kind === 'source') {
    sourceBranchLoading.value = true
  } else {
    targetBranchLoading.value = true
  }
  try {
    const branches = await listGitlabBranches(quickMergeForm.bindingId, keyword)
    if (kind === 'source') {
      quickMergeSourceBranchOptions.value = branches
    } else {
      quickMergeTargetBranchOptions.value = branches
    }
  } finally {
    if (kind === 'source') {
      sourceBranchLoading.value = false
    } else {
      targetBranchLoading.value = false
    }
  }
}

function resolveQuickMergeBranchAutoTitle(branchName: string) {
  const matchedBranch = quickMergeSourceBranchOptions.value.find((item) => item.name === branchName)
  return matchedBranch?.latestCommitTitle?.trim() || ''
}

/**
 * 首页快速发起 MR 会优先复用源分支最近一次提交标题；
 * 只有标题为空，或仍保持上一次自动带入结果时，才继续覆盖，避免误伤用户手工编辑。
 */
function tryAutofillQuickMergeTitleFromSourceBranch(branchName: string, force = false) {
  const currentTitle = quickMergeForm.title.trim()
  const canReplaceTitle = force || !currentTitle || currentTitle === quickMergeAutoFilledTitle.value
  if (!canReplaceTitle) {
    return
  }
  const autoTitle = resolveQuickMergeBranchAutoTitle(branchName)
  quickMergeForm.title = autoTitle
  quickMergeAutoFilledTitle.value = autoTitle
  quickMergeFormRef.value?.clearValidate('title')
}

function handleQuickMergeSourceSearch(keyword: string) {
  void loadQuickMergeBranches('source', keyword)
}

function handleQuickMergeTargetSearch(keyword: string) {
  void loadQuickMergeBranches('target', keyword)
}

function handleQuickMergeSourceBranchChange(branchName: string) {
  tryAutofillQuickMergeTitleFromSourceBranch(branchName)
}

async function openQuickMergeDialog() {
  try {
    resetQuickMergeForm()
    await Promise.all([loadQuickMergeBindings(), loadQuickMergeOauthBinding()])
    quickMergeDialogVisible.value = true
  } catch (error: any) {
    ElMessage.warning(error?.message || '暂无可用的 GitLab 绑定项目')
  }
}

async function handleQuickMergeSubmit() {
  const valid = await quickMergeFormRef.value?.validate().catch(() => false)
  if (!valid || quickMergeForm.bindingId === null) {
    return
  }
  if (quickMergeSubmitDisabledReason.value) {
    ElMessage.warning(quickMergeSubmitDisabledReason.value)
    return
  }
  if (quickMergeForm.sourceBranch.trim() === quickMergeForm.targetBranch.trim()) {
    ElMessage.warning('源分支与目标分支不能相同')
    return
  }
  quickMergeSubmitting.value = true
  try {
    const result = await createGitlabMergeRequest(quickMergeForm.bindingId, {
      sourceBranch: quickMergeForm.sourceBranch.trim(),
      targetBranch: quickMergeForm.targetBranch.trim(),
      title: quickMergeForm.title.trim(),
      description: quickMergeForm.description.trim() || undefined
    })
    quickMergeResult.value = result
    quickMergeDialogVisible.value = false
    quickMergeResultVisible.value = true
    ElMessage.success(`MR !${result.iid} 已创建`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建 MR 失败')
  } finally {
    quickMergeSubmitting.value = false
  }
}

function formatQuickBuildTriggerStatus(status?: string | null) {
  if (status === 'QUEUED') return '已排队'
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  return status || '未触发'
}

function quickBuildTriggerStatusTone(status?: string | null) {
  if (status === 'QUEUED' || status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'neutral'
}

function quickBuildEntryKey(binding: PipelineCenterEntryItem) {
  return `${binding.entryType}-${binding.entryId}`
}

function formatQuickBuildProvider(providerCode?: string | null) {
  if (providerCode === 'JENKINS') return 'Jenkins'
  if (providerCode === 'WOODPECKER') return 'GitPilot Pipeline'
  return providerCode || '流水线'
}

function handleOpenPipelineCenter() {
  router.push('/cicd/pipeline-bindings')
}

/**
 * 首页触发入口按统一条目类型分派，保证 Jenkins 兼容绑定和内置流水线都能直接构建。
 */
async function handleQuickBuildTrigger(binding: PipelineCenterEntryItem) {
  if (!canBuildCicd.value) {
    handleOpenPipelineCenter()
    return
  }

  quickBuildTriggeringId.value = quickBuildEntryKey(binding)
  try {
    const result = binding.entryType === 'AI_CLUB'
      ? await triggerAiClubPipeline(binding.entryId)
      : await triggerPipelineBuild(binding.entryId)
    ElMessage.success(result.message)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '触发流水线失败')
  } finally {
    quickBuildTriggeringId.value = null
  }
}

function formatCompactNumber(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`
}

function sortTasks(tasks: TaskItem[]) {
  const priorityScore: Record<string, number> = { 高: 0, 中: 1, 低: 2 }
  const statusScore: Record<string, number> = { 进行中: 0, 开发中: 0, 处理中: 0, 待开始: 1, 未开始: 1, 草稿: 1, 阻塞: 2, 已完成: 3, 完成: 3 }
  return [...tasks].sort((left, right) => {
    const statusDiff = (statusScore[left.status] ?? 9) - (statusScore[right.status] ?? 9)
    if (statusDiff) return statusDiff
    const priorityDiff = (priorityScore[left.priority] ?? 9) - (priorityScore[right.priority] ?? 9)
    if (priorityDiff) return priorityDiff
    return (right.updatedAt || '').localeCompare(left.updatedAt || '')
  })
}

function taskHealthPercent(task: TaskItem) {
  const statusScore: Record<string, number> = { 进行中: 85, 开发中: 82, 处理中: 78, 待开始: 60, 未开始: 58, 草稿: 46, 阻塞: 24, 已完成: 100, 完成: 100 }
  const priorityDelta: Record<string, number> = { 高: -4, 中: 0, 低: 4 }
  return Math.max(8, Math.min(100, (statusScore[task.status] ?? 60) + (priorityDelta[task.priority] ?? 0)))
}

function formatDateTime(value?: string | null) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}

function fallbackOverview(): DashboardOverview {
  return {
    stats: { projectCount: 0, agentCount: 0, taskCount: 0, repoCount: 0, myTaskCount: 0, myInProgressTaskCount: 0, myPendingTaskCount: 0, myMergeLogCount: 0, mergeAlertCount: 0 },
    activeProjects: [],
    onlineAgents: [],
    recentTasks: [],
    shortcutOverview: {
      systemEntries: [],
      userEntries: []
    },
    currentUserGitlabUsername: null,
    currentUserGitlabMergeLogs: [],
    myTasks: [],
    mergeAlerts: [],
    focusIterationBoard: null,
    focusProjectBurndown: null
  }
}

function fallbackQuickMergeOauthBinding(): GitlabUserOauthBindingItem {
  return {
    connected: false,
    apiBaseUrl: '',
    gitlabUserId: null,
    gitlabUsername: null,
    gitlabName: null,
    expiresAt: null
  }
}

function normalizeOverview(data: DashboardOverview): DashboardOverview {
  const base = fallbackOverview()
  return {
    ...base,
    ...data,
    stats: { ...base.stats, ...(data.stats || {}) },
    activeProjects: data.activeProjects || [],
    onlineAgents: data.onlineAgents || [],
    recentTasks: data.recentTasks || [],
    shortcutOverview: {
      systemEntries: data.shortcutOverview?.systemEntries || [],
      userEntries: data.shortcutOverview?.userEntries || []
    },
    currentUserGitlabMergeLogs: data.currentUserGitlabMergeLogs || [],
    myTasks: data.myTasks || [],
    mergeAlerts: data.mergeAlerts || [],
    focusIterationBoard: data.focusIterationBoard || null,
    focusProjectBurndown: data.focusProjectBurndown || null
  }
}

function skeletonWidgetKind(widgetId: DashboardWidgetId) {
  if (widgetId === 'stat-project-count' || widgetId === 'stat-agent-count' || widgetId === 'stat-task-count') {
    return 'stat'
  }
  if (widgetId === 'gitlab-quick-merge' || widgetId === 'quick-pipeline-build') {
    return 'action'
  }
  return 'list'
}

function isWidgetLoading(widgetId: DashboardWidgetId) {
  if (widgetId === 'stat-project-count' || widgetId === 'stat-agent-count' || widgetId === 'stat-task-count') {
    return statsLoading.value
  }
  if (widgetId === 'active-project-list') {
    return activeProjectsLoading.value
  }
  if (widgetId === 'online-agent-list') {
    return onlineAgentsLoading.value
  }
  if (widgetId === 'recent-task-list') {
    return recentTasksLoading.value
  }
  if (widgetId === 'system-shortcut-entries') {
    return shortcutsLoading.value
  }
  return false
}

onMounted(async () => {
  // 监听卡片内容尺寸变化，保证宽度切换和数据变化后都能重新计算最佳高度。
  if (typeof ResizeObserver !== 'undefined') {
    widgetContentResizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const widgetId = entry.target.getAttribute('data-widget-id') as DashboardWidgetId | null
        if (widgetId) {
          syncWidgetCardRowSpan(widgetId)
        }
      })
    })
  }

  await loadDashboardCards()
  if (canViewGitlab.value) {
    try {
      await Promise.all([loadQuickMergeBindings(), loadQuickMergeOauthBinding()])
    } catch {
      quickMergeBindingOptions.value = []
      quickMergeOauthBinding.value = fallbackQuickMergeOauthBinding()
    }
  }
  if (canViewCicd.value) {
    await loadQuickBuildBindings()
  }

  void nextTick(syncVisibleWidgetRowSpans)
})

onBeforeUnmount(() => {
  widgetContentResizeObserver?.disconnect()
  widgetContentResizeObserver = null
  widgetContentElementMap.clear()
})
</script>

<style scoped>
.dashboard-screen {
  --dashboard-grid-gap: 20px;
  --dashboard-row-height: 220px;
  --dashboard-grid-row-unit: 8px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 100%;
  height: auto;
  overflow: visible;
  padding-top: 12px;
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.dashboard-toolbar-skeleton {
  justify-content: flex-start;
}

.dashboard-skeleton-pill,
.dashboard-skeleton-line,
.dashboard-skeleton-square,
.dashboard-skeleton-chip,
.dashboard-skeleton-button {
  position: relative;
  overflow: hidden;
  background: rgba(var(--app-outline-rgb), 0.08);
}

.dashboard-skeleton-pill::after,
.dashboard-skeleton-line::after,
.dashboard-skeleton-square::after,
.dashboard-skeleton-chip::after,
.dashboard-skeleton-button::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.68) 50%, transparent 100%);
  animation: dashboard-skeleton-shimmer 1.35s ease-in-out infinite;
}

.dashboard-skeleton-pill {
  width: 132px;
  height: 40px;
  border-radius: 999px;
}

.dashboard-skeleton-pill.large {
  width: 188px;
}

.dashboard-toolbar-copy h2 {
  margin: 0;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 28px;
  font-weight: 900;
}

.dashboard-toolbar-copy p {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  font-size: 14px;
}

.dashboard-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dashboard-toolbar-mobile-tip {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.dashboard-toolbar-button,
.dashboard-widget-size-button,
.dashboard-widget-icon,
.dashboard-widget-library-item,
.widget-footer-button,
.quick-merge-button {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  cursor: pointer;
}

.dashboard-toolbar-button {
  min-height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 800;
}

.dashboard-toolbar-button.ghost {
  background: rgba(var(--app-outline-rgb), 0.08);
  color: var(--app-text-soft);
}

.dashboard-toolbar-button.primary {
  background: linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.92) 0%, var(--app-primary) 100%);
  color: #fff;
  box-shadow: 0 12px 26px rgba(var(--app-primary-rgb), 0.18);
}

.dashboard-widget-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-rows: var(--dashboard-grid-row-unit);
  gap: var(--dashboard-grid-gap);
  align-items: start;
}

.dashboard-widget-card {
  min-width: 0;
  height: 100%;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.dashboard-widget-grid-skeleton {
  pointer-events: none;
}

.dashboard-widget-skeleton-card {
  min-height: 220px;
}

.dashboard-widget-card.width-quarter {
  grid-column: span 3;
}

.dashboard-widget-card.width-half {
  grid-column: span 6;
}

.dashboard-widget-card.width-three-quarter {
  grid-column: span 9;
}

.dashboard-widget-card.width-full {
  grid-column: span 12;
}

.dashboard-widget-card.editing {
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
}

.dashboard-widget-card-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dashboard-widget-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 0;
}

.dashboard-widget-head-copy {
  flex: 1 1 auto;
  min-width: 0;
}

.dashboard-skeleton-line {
  border-radius: 999px;
}

.dashboard-skeleton-line.title {
  width: 118px;
  height: 18px;
}

.dashboard-skeleton-line.subtitle {
  width: 172px;
  height: 12px;
  margin-top: 10px;
}

.dashboard-widget-head-quick-task-action {
  display: inline-flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex-shrink: 0;
}

.dashboard-widget-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 900;
}

.dashboard-widget-description {
  margin-top: 6px;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.dashboard-widget-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

.dashboard-widget-mobile-edit-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.08);
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 700;
}

.dashboard-widget-size-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(var(--app-outline-rgb), 0.06);
}

.dashboard-widget-size-label {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.dashboard-widget-size-buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dashboard-widget-size-button {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 800;
}

.dashboard-widget-size-button.active {
  background: var(--app-primary);
  color: #fff;
  box-shadow: 0 8px 18px rgba(var(--app-primary-rgb), 0.18);
}

.dashboard-widget-icon {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(var(--app-outline-rgb), 0.08);
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 800;
}

.dashboard-widget-quick-task-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.1);
  color: var(--app-primary);
  cursor: pointer;
}

.dashboard-widget-quick-task-trigger-icon {
  font-size: 18px;
  line-height: 1;
}

.dashboard-widget-drag-handle {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.dashboard-widget-body {
  display: flex;
  width: 100%;
  padding: 20px 24px 24px;
}

.dashboard-widget-skeleton-body {
  display: flex;
  width: 100%;
}

.dashboard-widget-skeleton-body.body-stat {
  flex-direction: column;
  gap: 14px;
}

.dashboard-widget-skeleton-body.body-action,
.dashboard-widget-skeleton-body.body-list {
  flex-direction: column;
  gap: 12px;
}

.dashboard-skeleton-square {
  width: 46px;
  height: 46px;
  border-radius: 14px;
}

.dashboard-skeleton-line.metric {
  width: 92px;
  height: 38px;
}

.dashboard-skeleton-line.caption {
  width: 126px;
  height: 13px;
}

.dashboard-skeleton-line.hero-title {
  width: 168px;
  height: 30px;
}

.dashboard-skeleton-line.paragraph {
  width: 100%;
  height: 13px;
}

.dashboard-skeleton-line.paragraph.short {
  width: 74%;
}

.dashboard-skeleton-chip-row,
.dashboard-skeleton-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.dashboard-skeleton-chip {
  width: 88px;
  height: 24px;
  border-radius: 999px;
}

.dashboard-skeleton-button {
  width: 100px;
  height: 36px;
  border-radius: 999px;
}

.dashboard-skeleton-button.solid {
  width: 122px;
}

.dashboard-skeleton-list-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(var(--app-outline-rgb), 0.04);
}

.dashboard-skeleton-line.list-title {
  width: 62%;
  height: 14px;
}

.dashboard-skeleton-line.list-subtitle {
  width: 88%;
  height: 12px;
}

.dashboard-widget-ghost {
  opacity: 0.45;
}

.dashboard-widget-chosen {
  transform: scale(0.99);
}

.stat-widget {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 14px;
}

.dashboard-widget-stack {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 16px;
}

.dashboard-widget-scroll-area {
  width: 100%;
  overflow: visible;
}

.stat-widget-icon {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  font-size: 22px;
}

.stat-widget-icon.orange {
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
}

.stat-widget-icon.blue {
  background: rgba(14, 90, 126, 0.12);
  color: var(--app-info);
}

.stat-widget-icon.purple {
  background: rgba(139, 61, 255, 0.12);
  color: #8b3dff;
}

.stat-widget-value {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 42px;
  font-weight: 900;
  line-height: 1;
}

.stat-widget-caption {
  color: var(--app-text-soft);
  font-size: 13px;
}

.quick-action-widget {
  color: #fff;
  background:
    radial-gradient(circle at top right, rgba(var(--app-primary-container-rgb), 0.28), transparent 34%),
    linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.98) 0%, var(--app-primary) 58%, var(--app-tertiary) 100%);
  box-shadow: 0 18px 36px rgba(var(--app-primary-rgb), 0.2);
}

.quick-action-widget .dashboard-widget-title,
.quick-action-widget .dashboard-widget-description {
  color: inherit;
}

.quick-action-widget .dashboard-widget-description {
  color: rgba(255, 255, 255, 0.84);
}

.quick-action-widget .dashboard-widget-size-group {
  background: rgba(255, 255, 255, 0.14);
}

.quick-action-widget .dashboard-widget-size-label {
  color: rgba(255, 255, 255, 0.76);
}

.quick-action-widget .dashboard-widget-size-button {
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.92);
}

.quick-action-widget .dashboard-widget-size-button.active {
  background: rgba(255, 255, 255, 0.96);
  color: var(--app-primary-dark-2);
}

.quick-action-widget .dashboard-widget-icon {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.quick-action-widget .widget-empty {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.84);
}

.quick-action-widget .widget-footer-button {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
}

.quick-merge-widget-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.quick-build-widget-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-merge-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.76);
}

.quick-merge-hero-title {
  font-family: var(--app-font-heading);
  font-size: 34px;
  font-weight: 900;
  line-height: 1.05;
}

.quick-merge-hero-text {
  margin: 0;
  color: rgba(255, 255, 255, 0.88);
  font-size: 14px;
  line-height: 1.8;
}

.quick-merge-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 700;
}

.quick-merge-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.quick-merge-button {
  min-height: 38px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 800;
}

.quick-merge-button.ghost {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #fff;
}

.quick-merge-button.solid {
  background: rgba(255, 255, 255, 0.96);
  color: var(--app-primary-dark-2);
}

.quick-merge-auth-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
  padding: 14px 16px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.1);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.92);
}

.quick-merge-auth-card.connected {
  border-color: rgba(34, 197, 94, 0.18);
  background: rgba(240, 253, 244, 0.92);
}

.quick-merge-auth-title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 800;
}

.quick-merge-auth-text {
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.7;
}

.quick-merge-auth-warning {
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
}

.quick-merge-auth-actions {
  display: flex;
  justify-content: flex-end;
}

.quick-build-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.76);
}

.quick-build-hero-title {
  font-family: var(--app-font-heading);
  font-size: 32px;
  font-weight: 900;
  line-height: 1.05;
  color: #fff;
}

.quick-build-hero-text {
  margin: 0;
  color: rgba(255, 255, 255, 0.88);
  font-size: 14px;
  line-height: 1.8;
}

.quick-build-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.quick-build-item {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
}

.quick-build-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.quick-build-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quick-build-title {
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}

.quick-build-status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.quick-build-status-chip.success {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.quick-build-status-chip.danger {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.quick-build-status-chip.neutral {
  background: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.88);
}

.quick-build-subtitle {
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
  word-break: break-all;
}

.quick-build-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 12px;
}

.quick-build-message {
  color: rgba(255, 255, 255, 0.84);
  font-size: 12px;
  line-height: 1.7;
}

.quick-build-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.quick-build-button {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.quick-build-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.quick-build-button.ghost {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #fff;
}

.quick-build-button.solid {
  background: rgba(255, 255, 255, 0.96);
  color: var(--app-primary-dark-2);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
}

.info-list,
.task-list,
.quick-task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-list-item,
.task-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(var(--app-outline-rgb), 0.04);
}

.info-list-main,
.task-list-main {
  min-width: 0;
}

.info-list-title,
.task-list-title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 800;
}

.info-list-subtitle,
.task-list-subtitle {
  margin-top: 4px;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.info-list-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(var(--app-outline-rgb), 0.08);
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 800;
}

.info-list-chip.success {
  background: rgba(61, 111, 56, 0.12);
  color: var(--app-success);
}

.task-list-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.task-health-text {
  color: var(--app-primary);
  font-size: 13px;
  font-weight: 800;
}

.task-time-text {
  color: var(--app-text-muted);
  font-size: 12px;
}

.quick-task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 0;
  text-align: left;
}

.quick-task-item input {
  width: 16px;
  height: 16px;
}

.quick-task-item span {
  color: var(--app-text-soft);
  font-size: 14px;
  line-height: 1.7;
}

.quick-task-item span.completed {
  color: var(--app-text-muted);
  text-decoration: line-through;
}

.widget-footer-button {
  min-height: 34px;
  margin-top: 0;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(var(--app-primary-container-rgb), 0.12);
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
  align-self: flex-start;
}

.widget-empty {
  padding: 18px;
  border-radius: 16px;
  background: rgba(var(--app-outline-rgb), 0.04);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.dashboard-widget-library {
  padding: 24px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.74);
  border: 1px dashed rgba(var(--app-outline-rgb), 0.28);
}

.dashboard-widget-library-head h3 {
  margin: 0;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 900;
}

.dashboard-widget-library-head p {
  margin: 6px 0 0;
  color: var(--app-text-muted);
  font-size: 13px;
}

.dashboard-widget-library-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.dashboard-widget-library-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(var(--app-outline-rgb), 0.05);
  text-align: left;
}

.dashboard-widget-library-item-title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 800;
}

.dashboard-widget-library-item-desc {
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.dashboard-widget-library-item-action {
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
}

.dashboard-widget-card.width-quarter .dashboard-widget-head {
  flex-direction: column;
  /* 1/4 宽卡片在桌面端仍允许纵向堆叠，但标题文案需要占满可用宽度，避免中文被压成单字换行。 */
  align-items: stretch;
}

.dashboard-widget-card.width-quarter .dashboard-widget-head-actions {
  width: 100%;
  justify-content: flex-start;
}

.dashboard-widget-card.width-quarter .dashboard-widget-head-quick-task-action {
  width: 100%;
  justify-content: flex-start;
}

.dashboard-widget-card.width-quarter .dashboard-widget-size-group {
  flex-wrap: wrap;
}

.dashboard-widget-card.width-quarter .dashboard-widget-size-buttons {
  flex-wrap: wrap;
}

.dashboard-widget-card.width-quarter .stat-widget-value {
  font-size: 36px;
}

.dashboard-widget-card.width-quarter .quick-merge-hero-title {
  font-size: 26px;
}

.dashboard-widget-card.width-quarter .quick-build-hero-title {
  font-size: 24px;
}

.dashboard-widget-card.width-quarter .quick-merge-actions {
  width: 100%;
  flex-direction: column;
  align-items: stretch;
}

.dashboard-widget-card.width-quarter .quick-merge-button {
  width: 100%;
}

.dashboard-widget-card.width-quarter .quick-build-title-row,
.dashboard-widget-card.width-quarter .quick-build-actions {
  flex-direction: column;
  align-items: flex-start;
}

.dashboard-widget-card.width-quarter .quick-build-button {
  width: 100%;
}

.dashboard-widget-card.width-quarter .info-list-item,
.dashboard-widget-card.width-quarter .task-list-item {
  flex-direction: column;
  align-items: flex-start;
}

.dashboard-widget-card.width-quarter .task-list-side {
  align-items: flex-start;
}

@media (max-width: 1280px) {
  .dashboard-widget-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .dashboard-widget-card.width-quarter,
  .dashboard-widget-card.width-half {
    grid-column: span 3;
  }

  .dashboard-widget-card.width-three-quarter,
  .dashboard-widget-card.width-full {
    grid-column: span 6;
  }

  .dashboard-widget-library-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@keyframes dashboard-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (max-width: 900px) {
  /* 手机端改用纵向自然流布局，避免桌面网格跨行高度在单列场景下留下大块留白。 */
  .dashboard-screen {
    --dashboard-grid-gap: 16px;
    gap: 16px;
    padding-top: 8px;
  }

  .dashboard-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .dashboard-toolbar-actions {
    width: 100%;
  }

  .dashboard-toolbar-mobile-tip {
    width: 100%;
  }

  .dashboard-widget-grid {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--dashboard-grid-gap);
  }

  .dashboard-widget-library-list {
    grid-template-columns: 1fr;
  }

  .dashboard-widget-card {
    width: 100%;
    max-width: 100%;
    align-self: stretch;
    box-sizing: border-box;
    flex: 0 0 auto;
    height: auto;
    border-radius: 20px;
  }

  .dashboard-widget-card.editing {
    box-shadow: 0 0 0 2px rgba(var(--app-primary-rgb), 0.14), 0 16px 36px rgba(15, 23, 42, 0.08);
  }

  .dashboard-widget-card.width-quarter,
  .dashboard-widget-card.width-half,
  .dashboard-widget-card.width-three-quarter,
  .dashboard-widget-card.width-full {
    grid-column: span 1;
  }

  .dashboard-widget-head {
    gap: 12px;
    padding: 18px 18px 0;
  }

  .dashboard-widget-body {
    padding: 18px 18px 20px;
  }

  .dashboard-widget-card-shell {
    width: 100%;
  }

  .dashboard-widget-head-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .dashboard-widget-head-quick-task-action {
    margin-left: auto;
    justify-content: flex-end;
  }

  /* 手机端所有卡片都会拉满宽度，不再沿用桌面 1/4 宽卡片的纵向头部布局。 */
  .dashboard-widget-card.width-quarter .dashboard-widget-head {
    flex-direction: row;
    align-items: flex-start;
  }

  .dashboard-widget-mobile-edit-chip {
    width: 100%;
    justify-content: center;
  }

  .dashboard-widget-drag-handle,
  .dashboard-widget-icon {
    min-height: 36px;
  }

  .info-list-item,
  .task-list-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .task-list-side {
    align-items: flex-start;
  }
}
</style>
