<template>
  <div class="iteration-workspace">
    <aside class="workspace-sidebar">
      <div class="workspace-sidebar-brand">
        <div class="workspace-sidebar-brand-main">
          <div class="workspace-brand-mark">
            <el-icon><FolderOpened /></el-icon>
          </div>
          <div class="workspace-brand-copy">
            <h2>{{ board.project.name || '项目迭代' }}</h2>
            <p>活跃迭代</p>
          </div>
        </div>
        <div v-if="isMobileViewport" class="workspace-sidebar-brand-profile">
          <el-dropdown @command="handleHeaderCommand">
            <div class="header-profile-group">
              <button class="header-notification-button" type="button" aria-label="打开消息中心" @click.stop="handleOpenNotificationsProxy">
                <el-icon><Bell /></el-icon>
                <span v-if="notificationStore.unreadCount > 0" class="header-notification-dot"></span>
              </button>
              <span class="header-divider" aria-hidden="true"></span>
              <button class="user-trigger" type="button">
                <span class="user-meta">
                  <strong>{{ authStore.user?.nickname || authStore.user?.username || '当前用户' }}</strong>
                  <small>{{ authStore.user?.roleNames?.[0] || '协作成员' }}</small>
                </span>
                <span class="user-avatar">
                  <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="当前用户头像" class="user-avatar-image" />
                  <span v-else>{{ userInitial }}</span>
                </span>
              </button>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="roles" disabled>
                  {{ authStore.user?.roleNames?.join(' / ') || '暂无角色' }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="workspace-sidebar-list">
        <button
          class="workspace-iteration-card"
          :class="{ active: selectedScope.type === 'unplanned' }"
          type="button"
          @click="selectUnplanned"
        >
          <div class="workspace-iteration-head">
            <span class="workspace-iteration-title">未规划工作项</span>
          </div>
          <div class="workspace-iteration-date">数量：{{ board.unplannedCount }}</div>
          <div class="workspace-iteration-progress">
            <div class="workspace-iteration-progress-fill" :style="{ width: `${unplannedProgressPercent}%` }"></div>
          </div>
        </button>

        <button
          v-for="item in board.iterations"
          :key="item.id"
          class="workspace-iteration-card"
          :class="{ active: selectedScope.type === 'iteration' && selectedScope.iterationId === item.id }"
          type="button"
          @click="selectIteration(item)"
        >
          <div class="workspace-iteration-head">
            <span class="workspace-iteration-title">{{ item.name }}</span>
            <div class="workspace-iteration-head-side">
              <button
                v-if="canManageIteration"
                class="workspace-iteration-action"
                type="button"
                aria-label="编辑迭代"
                @click.stop="openEditIterationDialog(item)"
              >
                <el-icon><EditPen /></el-icon>
              </button>
              <button
                v-if="canManageIteration && item.canDelete"
                class="workspace-iteration-action danger"
                type="button"
                aria-label="删除迭代"
                @click.stop="handleDeleteIteration(item)"
              >
                <el-icon><Delete /></el-icon>
              </button>
              <span class="workspace-iteration-icon">{{ iterationStatusIcon(item.status) }}</span>
            </div>
          </div>
          <div class="workspace-iteration-date">{{ formatCompactDateRange(item.startDate, item.endDate) }}</div>
          <div class="workspace-iteration-progress">
            <div class="workspace-iteration-progress-fill" :style="{ width: `${iterationSidebarPercent(item)}%` }"></div>
          </div>
        </button>
      </div>

      <div class="workspace-sidebar-footer">
        <button class="workspace-sidebar-action" type="button" @click="canManageIteration ? openCreateIterationDialog() : goBack()">
          <el-icon><Plus /></el-icon>
          <span>{{ canManageIteration ? '新建迭代' : '返回项目' }}</span>
        </button>
      </div>
    </aside>

    <section class="workspace-main">
      <header class="workspace-topbar">
        <div class="workspace-topbar-main">
          <button class="workspace-back-link" type="button" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            <span>返回项目列表</span>
          </button>
        </div>
        <div v-if="!isMobileViewport" class="workspace-topbar-actions">
          <el-dropdown @command="handleHeaderCommand">
            <div class="header-profile-group">
              <button class="header-notification-button" type="button" aria-label="打开消息中心" @click.stop="handleOpenNotificationsProxy">
                <el-icon><Bell /></el-icon>
                <span v-if="notificationStore.unreadCount > 0" class="header-notification-dot"></span>
              </button>
              <span class="header-divider" aria-hidden="true"></span>
              <button class="user-trigger" type="button">
                <span class="user-meta">
                  <strong>{{ authStore.user?.nickname || authStore.user?.username || '当前用户' }}</strong>
                  <small>{{ authStore.user?.roleNames?.[0] || '协作成员' }}</small>
                </span>
                <span class="user-avatar">
                  <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="当前用户头像" class="user-avatar-image" />
                  <span v-else>{{ userInitial }}</span>
                </span>
              </button>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="roles" disabled>
                  {{ authStore.user?.roleNames?.join(' / ') || '暂无角色' }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <section class="workspace-stats">
        <article v-for="item in workspaceStatCards" :key="item.label" class="workspace-stat-card">
          <span class="workspace-stat-label">{{ item.label }}</span>
          <div class="workspace-stat-value-row">
            <strong>{{ item.value }}</strong>
            <span v-if="item.highlight" class="workspace-stat-highlight">{{ item.highlight }}</span>
          </div>
          <div v-if="item.progress !== undefined" class="workspace-stat-track">
            <div class="workspace-stat-fill" :class="item.progressTone" :style="{ width: `${item.progress}%` }"></div>
          </div>
          <div v-if="item.subtext" class="workspace-stat-subtext">{{ item.subtext }}</div>
          <div v-if="item.dots" class="workspace-stat-dots">
            <span v-for="index in item.dots" :key="index" class="workspace-stat-dot" :class="{ active: index <= item.activeDots }"></span>
          </div>
        </article>
      </section>

      <section class="workspace-controls workspace-list-toolbar">
        <div class="management-list-toolbar">
          <div class="management-list-toolbar-main">
            <div class="workspace-list-switcher" role="tablist" aria-label="工作项类型切换">
              <button class="workspace-list-tab-button" :class="{ active: activeTypeTab === '全部' }" type="button" @click="setTypeTab('全部')">全部</button>
              <button class="workspace-list-tab-button" :class="{ active: activeTypeTab === '需求' }" type="button" @click="setTypeTab('需求')">需求</button>
              <button class="workspace-list-tab-button" :class="{ active: activeTypeTab === '任务' }" type="button" @click="setTypeTab('任务')">任务</button>
              <button class="workspace-list-tab-button" :class="{ active: activeTypeTab === '缺陷' }" type="button" @click="setTypeTab('缺陷')">缺陷</button>
            </div>
            <span class="management-list-toolbar-divider" aria-hidden="true"></span>
            <div class="management-list-search-shell">
              <el-icon class="management-list-search-icon"><Search /></el-icon>
              <input
                v-model="keyword"
                class="management-list-search-input"
                type="text"
                placeholder="搜索工作项标题、说明或负责人..."
                @keyup.enter="handleFilterSearch"
              />
            </div>
            <span class="management-list-toolbar-divider" aria-hidden="true"></span>
            <el-popover v-model:visible="workItemFilterPopoverVisible" trigger="click" placement="bottom-end" :width="360" popper-class="iteration-filter-popper">
              <template #reference>
                <button class="management-list-toolbar-button" type="button">
                  <el-icon><Filter /></el-icon>
                  <span>筛选</span>
                </button>
              </template>
              <div class="workspace-filter-panel management-list-compact-input">
                <div class="workspace-filter-field">
                  <label>状态</label>
                <el-select v-model="workItemFilters.status" clearable placeholder="状态" style="width: 100%" :teleported="false">
                    <el-option v-for="item in taskStatusOptions" :key="item" :label="item" :value="item" />
                  </el-select>
                </div>
                <div class="workspace-filter-field">
                  <label>优先级</label>
                <el-select v-model="workItemFilters.priority" clearable placeholder="优先级" style="width: 100%" :teleported="false">
                    <el-option label="高" value="高" />
                    <el-option label="中" value="中" />
                    <el-option label="低" value="低" />
                  </el-select>
                </div>
                <div class="workspace-filter-field">
                  <label>负责人</label>
                  <el-select v-model="workItemFilters.assigneeUserId" clearable filterable placeholder="负责人" style="width: 100%" :teleported="false">
                    <el-option v-for="item in projectParticipantUsers" :key="item.id" :label="buildUserLabel(item)" :value="item.id" />
                  </el-select>
                </div>
                <div class="workspace-filter-actions">
                  <el-button type="primary" @click="handleFilterSearch">查询</el-button>
                  <el-button @click="handleFilterReset">重置</el-button>
                </div>
              </div>
            </el-popover>
            <button class="management-list-toolbar-button" type="button" @click="handleFilterReset">
              <el-icon><RefreshRight /></el-icon>
              <span>重置</span>
            </button>
          </div>

          <div class="management-list-toolbar-side">
            <button v-if="canManageWorkItem" class="management-list-create-button" type="button" @click="openCreateWorkItemDialog">
              <el-icon><Plus /></el-icon>
              <span>新建工作项</span>
            </button>
          </div>
        </div>
      </section>

      <section class="workspace-table-shell">
        <div class="workspace-table-scroll mobile-card-scroll" v-loading="workItemLoading">
          <template v-if="!isMobileViewport">
          <table class="workspace-table mobile-card-table">
            <thead>
              <tr>
                <th class="workspace-col-code">工作项编号</th>
                <th class="workspace-col-main">标题</th>
                <th class="center workspace-col-status">状态</th>
                <th class="center workspace-col-hours">预估工时</th>
                <th class="center workspace-col-type">工作项类型</th>
                <th class="workspace-col-plan">计划时间</th>
                <th class="workspace-col-owner">负责人</th>
                <th class="center workspace-col-priority">优先级</th>
                <th class="workspace-col-creator">创建人</th>
                <th class="right workspace-col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!workItems.length">
                <td colspan="10" class="workspace-empty-row">当前筛选条件下暂无工作项</td>
              </tr>
              <tr v-for="row in workItems" :key="row.id" class="workspace-row">
                <td class="workspace-col-code" data-label="工作项编号">
                  <button
                    class="workspace-item-code standalone workspace-item-link-button"
                    type="button"
                    @click="openWorkItemDetailFromRow(row)"
                  >
                    {{ row.workItemCode }}
                  </button>
                </td>
                <td class="workspace-col-main" data-label="标题">
                  <div class="workspace-primary-cell">
                    <div class="workspace-primary-copy">
                      <button class="workspace-title-button" type="button" @click="openWorkItemDetailFromRow(row)">{{ row.name }}</button>
                    </div>
                  </div>
                </td>
                <td class="center workspace-col-status" data-label="状态">
                  <CompactSelectMenu
                    v-if="isInlineEditorActive(row.id, 'status')"
                    :model-value="row.status || null"
                    :options="taskStatusSelectOptions"
                    class="status-select"
                    variant="inline-pill"
                    :popover-width="132"
                    :open-on-mount="true"
                    :disabled="statusUpdatingId === row.id"
                    @change="handleQuickStatusChange(row, String($event))"
                    @visible-change="handleInlineSelectVisibleChange(row.id, 'status', $event)"
                  />
                  <button
                    v-else-if="canEditInlineSelectField(row)"
                    class="workspace-editable-display is-chip"
                    type="button"
                    :disabled="statusUpdatingId === row.id"
                    @click="openInlineEditor(row, 'status')"
                  >
                    <span class="workspace-status-pill" :class="workItemTone(row.status)">{{ formatTaskStatusLabel(row) }}</span>
                  </button>
                  <span v-else class="workspace-status-pill" :class="workItemTone(row.status)">{{ formatTaskStatusLabel(row) }}</span>
                </td>
                <td class="center workspace-col-hours" data-label="预估工时">
                  <div
                    v-if="isInlineEditorActive(row.id, 'hours')"
                    class="workspace-inline-number-shell"
                    @focusout="handleInlineHoursFocusOut(row, $event)"
                  >
                    <el-input-number
                      v-model="inlineHoursDraft"
                      :min="0"
                      :max="15"
                      :step="0.5"
                      :precision="1"
                      :controls="false"
                      class="work-hours-input workspace-inline-number"
                      :disabled="statusUpdatingId === row.id"
                      @keyup.enter="handleInlineHoursSubmit(row)"
                      @keydown.esc.prevent="handleInlineHoursCancel(row)"
                    />
                  </div>
                  <el-tooltip
                    v-else-if="canManageWorkItem && row.workItemType === '任务'"
                    :content="getRowWorkHoursLockedReason(row)"
                    :disabled="!getRowWorkHoursLockedReason(row)"
                  >
                    <button
                      class="workspace-editable-display is-chip"
                      type="button"
                      :disabled="statusUpdatingId === row.id"
                      @click="openInlineEditor(row, 'hours')"
                    >
                      <span class="workspace-hours-pill" :class="{ empty: row.workHours == null }">{{ formatInlineWorkHours(row.workHours) }}</span>
                    </button>
                  </el-tooltip>
                  <span v-else class="workspace-hours-pill" :class="{ empty: row.workHours == null }">{{ formatInlineWorkHours(row.workHours) }}</span>
                </td>
                <td class="center workspace-col-type" data-label="工作项类型">
                  <span class="workspace-type-pill" :class="workItemTypeTone(row.workItemType)">{{ row.workItemType }}</span>
                </td>
                <td class="workspace-col-plan" data-label="计划时间">
                  <span v-if="hasWorkItemPlanDateRange(row)" class="workspace-plan-text">
                    {{ formatWorkItemPlanDateRange(row.planStartDate, row.planEndDate) }}
                  </span>
                  <span v-else class="workspace-empty-text">-</span>
                </td>
                <td class="workspace-col-owner" data-label="负责人">
                  <CompactSelectMenu
                    v-if="isInlineEditorActive(row.id, 'assignee')"
                    :model-value="row.assigneeUserId ?? -1"
                    :options="assigneeSelectOptions"
                    class="assignee-select"
                    variant="inline-pill"
                    :open-on-mount="true"
                    :disabled="statusUpdatingId === row.id"
                    @change="handleQuickAssigneeChange(row, Number($event))"
                    @visible-change="handleInlineSelectVisibleChange(row.id, 'assignee', $event)"
                  />
                  <button
                    v-else-if="canEditInlineSelectField(row)"
                    class="workspace-editable-display is-owner"
                    type="button"
                    :disabled="statusUpdatingId === row.id"
                    @click="openInlineEditor(row, 'assignee')"
                  >
                    <ListUserDisplay :user="buildWorkItemAssigneeDisplayItem(row)" empty-text="未分配" size="md" />
                  </button>
                  <ListUserDisplay v-else :user="buildWorkItemAssigneeDisplayItem(row)" empty-text="未分配" size="md" />
                </td>
                <td class="center workspace-col-priority" data-label="优先级">
                  <CompactSelectMenu
                    v-if="isInlineEditorActive(row.id, 'priority')"
                    :model-value="row.priority || null"
                    :options="prioritySelectOptions"
                    class="priority-select"
                    variant="inline-pill"
                    :open-on-mount="true"
                    :disabled="statusUpdatingId === row.id"
                    @change="handleQuickPriorityChange(row, String($event))"
                    @visible-change="handleInlineSelectVisibleChange(row.id, 'priority', $event)"
                  />
                  <button
                    v-else-if="canEditInlineSelectField(row)"
                    class="workspace-editable-display is-chip"
                    type="button"
                    :disabled="statusUpdatingId === row.id"
                    @click="openInlineEditor(row, 'priority')"
                  >
                    <span class="workspace-priority-pill" :class="workspacePriorityTone(row.priority)">{{ row.priority || '-' }}</span>
                  </button>
                  <span v-else class="workspace-priority-pill" :class="workspacePriorityTone(row.priority)">{{ row.priority || '-' }}</span>
                </td>
                <td class="workspace-col-creator" data-label="创建人">
                  <ListUserDisplay :user="buildWorkItemCreatorDisplayItem(row)" empty-text="-" size="md" />
                </td>
                <td class="right workspace-col-actions" data-label="操作">
                  <div class="workspace-row-actions">
                    <el-tooltip content="评论" placement="top">
                      <button class="workspace-action-button" type="button" aria-label="评论工作项" @click="openCommentDialog(row)">
                        <el-icon><ChatDotRound /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip v-if="canManageWorkItem" content="编辑" placement="top">
                      <button class="workspace-action-button" type="button" aria-label="编辑工作项" @click="openWorkItemDetailFromRow(row)">
                        <el-icon><EditPen /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip v-if="row.workItemType === '需求'" content="需求 AI" placement="top">
                      <button class="workspace-action-button ai" type="button" aria-label="打开需求 AI" @click="openRequirementAiDialog(row)">
                        <el-icon><Cpu /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip v-if="row.workItemType === '需求' && canRequirementDevPass && !row.devPassed" content="开发通过" placement="top">
                      <button class="workspace-action-button pass" type="button" aria-label="标记开发通过" @click="handleRequirementDevPass(row)">
                        <el-icon><Management /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip v-if="row.workItemType === '需求' && canRequirementTestPass && !row.testPassed" content="测试通过" placement="top">
                      <button class="workspace-action-button success" type="button" aria-label="标记测试通过" @click="handleRequirementTestPass(row)">
                        <el-icon><Finished /></el-icon>
                      </button>
                    </el-tooltip>
                    <el-tooltip v-if="canManageWorkItem && row.canDelete" content="删除" placement="top">
                      <button class="workspace-action-button danger" type="button" aria-label="删除工作项" @click="handleDeleteWorkItem(row)">
                        <el-icon><Delete /></el-icon>
                      </button>
                    </el-tooltip>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          </template>
          <template v-else>
            <div v-if="workItems.length" class="mobile-entity-list-shell">
              <div class="mobile-entity-list">
                <article v-for="row in workItems" :key="row.id" class="mobile-entity-card">
                  <header class="mobile-entity-card-header">
                    <button class="mobile-entity-header-trigger" type="button" @click="openWorkItemDetailFromRow(row)">
                      <span class="mobile-entity-icon">
                        <el-icon><FolderOpened /></el-icon>
                      </span>
                      <span class="mobile-entity-copy">
                        <span class="mobile-entity-description">{{ row.workItemCode }}</span>
                        <span class="mobile-entity-title">{{ row.name }}</span>
                      </span>
                    </button>
                    <div class="mobile-entity-badge-group workspace-mobile-badge-group">
                      <CompactSelectMenu
                        v-if="isInlineEditorActive(row.id, 'status')"
                        :model-value="row.status || null"
                        :options="taskStatusSelectOptions"
                        class="status-select"
                        variant="inline-pill"
                        :popover-width="132"
                        :open-on-mount="true"
                        :disabled="statusUpdatingId === row.id"
                        @change="handleQuickStatusChange(row, String($event))"
                        @visible-change="handleInlineSelectVisibleChange(row.id, 'status', $event)"
                      />
                      <button
                        v-else-if="canEditInlineSelectField(row)"
                        class="workspace-editable-display is-chip"
                        type="button"
                        :disabled="statusUpdatingId === row.id"
                        @click="openInlineEditor(row, 'status')"
                      >
                        <span class="workspace-status-pill" :class="workItemTone(row.status)">{{ formatTaskStatusLabel(row) }}</span>
                      </button>
                      <span v-else class="workspace-status-pill" :class="workItemTone(row.status)">{{ formatTaskStatusLabel(row) }}</span>

                      <CompactSelectMenu
                        v-if="isInlineEditorActive(row.id, 'priority')"
                        :model-value="row.priority || null"
                        :options="prioritySelectOptions"
                        class="priority-select"
                        variant="inline-pill"
                        :open-on-mount="true"
                        :disabled="statusUpdatingId === row.id"
                        @change="handleQuickPriorityChange(row, String($event))"
                        @visible-change="handleInlineSelectVisibleChange(row.id, 'priority', $event)"
                      />
                      <button
                        v-else-if="canEditInlineSelectField(row)"
                        class="workspace-editable-display is-chip"
                        type="button"
                        :disabled="statusUpdatingId === row.id"
                        @click="openInlineEditor(row, 'priority')"
                      >
                        <span class="workspace-priority-pill" :class="workspacePriorityTone(row.priority)">{{ row.priority || '-' }}</span>
                      </button>
                      <span v-else class="workspace-priority-pill" :class="workspacePriorityTone(row.priority)">{{ row.priority || '-' }}</span>
                    </div>
                  </header>

                  <div class="mobile-entity-fields">
                    <div class="workspace-mobile-field-row">
                      <div class="mobile-entity-field workspace-mobile-field-half">
                        <span class="mobile-entity-field-label">类型</span>
                        <div class="mobile-entity-field-content">
                          <span class="workspace-type-pill" :class="workItemTypeTone(row.workItemType)">{{ row.workItemType }}</span>
                        </div>
                      </div>
                      <div class="mobile-entity-field workspace-mobile-field-half">
                        <span class="mobile-entity-field-label">工时</span>
                        <div class="mobile-entity-field-content">
                          <div
                            v-if="isInlineEditorActive(row.id, 'hours')"
                            class="workspace-inline-number-shell"
                            @focusout="handleInlineHoursFocusOut(row, $event)"
                          >
                            <el-input-number
                              v-model="inlineHoursDraft"
                              :min="0"
                              :max="15"
                              :step="0.5"
                              :precision="1"
                              :controls="false"
                              class="work-hours-input workspace-inline-number"
                              :disabled="statusUpdatingId === row.id"
                              @keyup.enter="handleInlineHoursSubmit(row)"
                              @keydown.esc.prevent="handleInlineHoursCancel(row)"
                            />
                          </div>
                          <el-tooltip
                            v-else-if="canManageWorkItem && row.workItemType === '任务'"
                            :content="getRowWorkHoursLockedReason(row)"
                            :disabled="!getRowWorkHoursLockedReason(row)"
                          >
                            <button
                              class="workspace-editable-display is-chip"
                              type="button"
                              :disabled="statusUpdatingId === row.id"
                              @click="openInlineEditor(row, 'hours')"
                            >
                              <span class="workspace-hours-pill" :class="{ empty: row.workHours == null }">{{ formatInlineWorkHours(row.workHours) }}</span>
                            </button>
                          </el-tooltip>
                          <span v-else class="workspace-hours-pill" :class="{ empty: row.workHours == null }">{{ formatInlineWorkHours(row.workHours) }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="mobile-entity-field">
                      <span class="mobile-entity-field-label">计划</span>
                      <div class="mobile-entity-field-content">
                        <span v-if="hasWorkItemPlanDateRange(row)" class="workspace-plan-text">
                          {{ formatWorkItemPlanDateRange(row.planStartDate, row.planEndDate) }}
                        </span>
                        <span v-else class="mobile-entity-empty-text">-</span>
                      </div>
                    </div>
                    <div class="workspace-mobile-field-row">
                      <div class="mobile-entity-field workspace-mobile-field-half workspace-mobile-user-field">
                        <span class="mobile-entity-field-label">负责人</span>
                        <div class="mobile-entity-field-content">
                          <CompactSelectMenu
                            v-if="isInlineEditorActive(row.id, 'assignee')"
                            :model-value="row.assigneeUserId ?? -1"
                            :options="assigneeSelectOptions"
                            class="assignee-select"
                            variant="inline-pill"
                            :open-on-mount="true"
                            :disabled="statusUpdatingId === row.id"
                            @change="handleQuickAssigneeChange(row, Number($event))"
                            @visible-change="handleInlineSelectVisibleChange(row.id, 'assignee', $event)"
                          />
                          <button
                            v-else-if="canEditInlineSelectField(row)"
                            class="workspace-editable-display is-owner"
                            type="button"
                            :disabled="statusUpdatingId === row.id"
                            @click="openInlineEditor(row, 'assignee')"
                          >
                            <ListUserDisplay :user="buildWorkItemAssigneeDisplayItem(row)" empty-text="未分配" size="md" />
                          </button>
                          <ListUserDisplay v-else :user="buildWorkItemAssigneeDisplayItem(row)" empty-text="未分配" size="md" />
                        </div>
                      </div>
                      <div class="mobile-entity-field workspace-mobile-field-half workspace-mobile-user-field">
                        <span class="mobile-entity-field-label">创建人</span>
                        <div class="mobile-entity-field-content">
                          <ListUserDisplay :user="buildWorkItemCreatorDisplayItem(row)" empty-text="-" size="md" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <footer class="mobile-entity-actions">
                    <button class="mobile-entity-action-button info" type="button" @click="openCommentDialog(row)">
                      <el-icon><ChatDotRound /></el-icon>
                      <span>评论</span>
                    </button>
                    <button v-if="canManageWorkItem" class="mobile-entity-action-button" type="button" @click="openWorkItemDetailFromRow(row)">
                      <el-icon><EditPen /></el-icon>
                      <span>编辑</span>
                    </button>
                    <button v-if="row.workItemType === '需求'" class="mobile-entity-action-button info" type="button" @click="openRequirementAiDialog(row)">
                      <el-icon><Cpu /></el-icon>
                      <span>需求 AI</span>
                    </button>
                    <button v-if="row.workItemType === '需求' && canRequirementDevPass && !row.devPassed" class="mobile-entity-action-button" type="button" @click="handleRequirementDevPass(row)">
                      <el-icon><Management /></el-icon>
                      <span>开发通过</span>
                    </button>
                    <button v-if="row.workItemType === '需求' && canRequirementTestPass && !row.testPassed" class="mobile-entity-action-button info" type="button" @click="handleRequirementTestPass(row)">
                      <el-icon><Finished /></el-icon>
                      <span>测试通过</span>
                    </button>
                    <button v-if="canManageWorkItem && row.canDelete" class="mobile-entity-action-button danger" type="button" @click="handleDeleteWorkItem(row)">
                      <el-icon><Delete /></el-icon>
                      <span>删除</span>
                    </button>
                  </footer>
                </article>
              </div>
            </div>
            <div v-else class="mobile-entity-empty-state">
              <el-empty description="当前筛选条件下暂无工作项" />
            </div>
          </template>
        </div>

        <div class="workspace-pagination">
          <div class="workspace-footer-total">共 <span>{{ workItemPagination.total }}</span> 条</div>
          <div class="workspace-pagination-controls">
            <div class="workspace-page-size">
              <span>每页</span>
              <el-select v-model="workItemPagination.size" size="small" style="width: 92px" @change="handlePageSizeChange">
                <el-option :value="10" label="10" />
                <el-option :value="20" label="20" />
                <el-option :value="50" label="50" />
              </el-select>
            </div>
            <div class="workspace-page-nav">
              <button class="workspace-page-button" type="button" :disabled="workItemPagination.page <= 1" @click="handleWorkItemPrevPage">
                <el-icon><ArrowLeft /></el-icon>
              </button>
              <span class="workspace-page-text">第 {{ workItemPagination.page }} / {{ workItemTotalPages }} 页</span>
              <button class="workspace-page-button" type="button" :disabled="workItemPagination.page >= workItemTotalPages" @click="handleWorkItemNextPage">
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  </div>

  <el-dialog v-model="iterationDialogVisible" :title="iterationDialogTitle" width="640px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="iterationDialogTitle" :subtitle="iterationDialogSubtitle" :icon="Finished" />
    </template>
    <el-form ref="iterationFormRef" :model="iterationForm" :rules="iterationRules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">迭代信息</div>
          <div class="platform-form-section-subtitle">设置迭代目标、状态和计划排期。</div>
        </div>
        <el-form-item label="迭代名称" prop="name">
          <el-input v-model="iterationForm.name" placeholder="请输入迭代名称" />
        </el-form-item>
        <el-form-item label="迭代目标">
          <el-input v-model="iterationForm.goal" placeholder="请输入迭代目标" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="iterationForm.status" style="width: 100%">
            <el-option label="未开始" value="未开始" />
            <el-option label="进行中" value="进行中" />
            <el-option label="已完成" value="已完成" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划时间">
          <el-date-picker
            v-model="iterationDateRange"
            type="daterange"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number v-model="iterationForm.sortOrder" :min="0" :step="1" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="iterationForm.description" type="textarea" :rows="4" placeholder="请输入迭代说明" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="iterationDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="iterationSubmitting" @click="handleSubmitIteration">保存</el-button>
      </div>
    </template>
  </el-dialog>

  <el-drawer
    v-model="workItemDialogVisible"
    :show-close="false"
    :before-close="handleWorkItemDrawerBeforeClose"
    direction="rtl"
    size="60%"
    class="work-item-drawer"
    append-to-body
    @closed="handleWorkItemDialogClosed"
  >
    <template #header>
      <div class="work-item-dialog-header">
        <div class="work-item-dialog-header-main">
          <button class="work-item-dialog-close" type="button" @click="closeWorkItemDetail">×</button>
          <span class="work-item-dialog-divider" aria-hidden="true"></span>
          <div class="work-item-dialog-heading">
            <span class="work-item-dialog-heading-icon">
              <el-icon><FolderOpened /></el-icon>
            </span>
            <div class="work-item-dialog-heading-copy">
              <div class="work-item-dialog-eyebrow">{{ workItemEditing ? '编辑工作项' : '新建工作项' }}</div>
              <div class="work-item-dialog-heading-line">
                <span class="work-item-dialog-heading-text">{{ workItemForm.name || (workItemEditing ? '编辑工作项' : '新建工作项') }}</span>
                <span class="work-item-dialog-status-pill" :class="workItemStatusTone">{{ workItemStatusDisplay }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="work-item-dialog-header-side">
          <span class="work-item-priority-badge" :class="workItemPriorityTone">{{ workItemPriorityBadge }}</span>
          <span class="work-item-dialog-updated">更新于 {{ workItemDialogUpdatedAt }}</span>
        </div>
      </div>
    </template>

    <el-form ref="workItemFormRef" :model="workItemForm" :rules="workItemRules" :disabled="!canManageWorkItem" label-position="top" class="work-item-form work-item-editor-form">
      <div class="work-item-editor-shell">
        <section class="work-item-editor-top">
          <div class="work-item-editor-title-row">
            <div class="work-item-editor-label">标题与编号</div>
            <el-form-item prop="name" class="work-item-title-form-item work-item-form-item-plain">
              <div class="work-item-title-input-row">
                <span class="work-item-id-badge">{{ workItemDisplayCode }}</span>
                <el-input v-model="workItemForm.name" placeholder="请填写工作项标题" size="large" />
              </div>
            </el-form-item>
          </div>

          <div class="work-item-editor-grid">
            <div class="work-item-field-block work-item-field-type">
              <div class="work-item-editor-label">工作项类型</div>
              <el-form-item prop="workItemType" class="work-item-form-item-plain">
                <el-select v-model="workItemForm.workItemType" style="width: 100%">
                  <el-option label="需求" value="需求" />
                  <el-option label="任务" value="任务" />
                  <el-option label="缺陷" value="缺陷" />
                </el-select>
              </el-form-item>
            </div>

            <div class="work-item-field-block work-item-field-iteration">
              <div class="work-item-editor-label">所属迭代</div>
              <el-form-item class="work-item-form-item-plain">
                <el-select v-model="workItemForm.iterationId" clearable placeholder="未选择则放入未规划工作项" style="width: 100%">
                  <el-option v-for="item in board.iterations" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </el-form-item>
            </div>

            <div class="work-item-field-block work-item-field-members">
              <div class="work-item-editor-label">负责人 / 协作者</div>
              <el-form-item class="work-item-form-item-plain">
                <WorkItemMemberField
                  v-model:assignee-user-id="workItemForm.assigneeUserId"
                  v-model:collaborator-user-ids="workItemForm.collaboratorUserIds"
                  :user-options="projectParticipantUsers"
                  :project-member-user-ids="projectParticipantUserIds"
                  placeholder="指派负责人/协作者"
                  class="work-item-members-field"
                />
              </el-form-item>
            </div>

            <div class="work-item-field-block work-item-field-status">
              <div class="work-item-editor-label">状态</div>
              <el-form-item prop="status" class="work-item-form-item-plain">
                <CompactSelectMenu
                  :model-value="workItemForm.status"
                  :options="taskStatusSelectOptions"
                  class="status-select work-item-status-select"
                  size="default"
                  :disabled="!canManageWorkItem"
                  @change="workItemForm.status = String($event)"
                />
              </el-form-item>
            </div>

            <div class="work-item-field-block work-item-field-project">
              <div class="work-item-editor-label">所属项目</div>
              <div class="work-item-static-field">{{ board.project.name || '当前项目' }}</div>
            </div>

            <div v-if="isRequirementWorkItem" class="work-item-field-block work-item-field-relation">
              <div class="work-item-editor-label">原型链接</div>
              <el-form-item class="work-item-form-item-plain">
                <el-input v-model="workItemForm.prototypeUrl" placeholder="请输入原型链接" />
              </el-form-item>
            </div>
            <div v-else class="work-item-field-block work-item-field-relation">
              <div class="work-item-editor-label">关联需求</div>
              <el-form-item class="work-item-form-item-plain">
                <el-select v-model="workItemForm.requirementTaskId" clearable filterable placeholder="可选，关联一个需求" style="width: 100%">
                  <el-option v-for="item in requirementSelectableOptions" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </el-form-item>
            </div>

            <div class="work-item-field-block work-item-field-schedule">
              <div class="work-item-editor-label">计划时间</div>
              <div class="work-item-inline-pair schedule">
                <el-form-item class="work-item-form-item-plain">
                  <el-date-picker
                    v-model="workItemForm.planStartDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="开始日期"
                    style="width: 100%"
                  />
                </el-form-item>
                <el-form-item class="work-item-form-item-plain">
                  <el-date-picker
                    v-model="workItemForm.planEndDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="结束日期"
                    style="width: 100%"
                  />
                </el-form-item>
              </div>
            </div>

            <div class="work-item-field-block work-item-field-priority">
              <div class="work-item-editor-label">{{ workItemForm.workItemType === '任务' ? '优先级 / 预估工时' : '优先级' }}</div>
              <div class="work-item-inline-pair" :class="{ single: workItemForm.workItemType !== '任务' }">
                <el-form-item prop="priority" class="work-item-form-item-plain">
                  <CompactSelectMenu
                    :model-value="workItemForm.priority"
                    :options="prioritySelectOptions"
                    class="priority-select work-item-priority-select"
                    size="default"
                    :disabled="!canManageWorkItem"
                    @change="workItemForm.priority = String($event)"
                  />
                </el-form-item>
                <el-form-item v-if="workItemForm.workItemType === '任务'" class="work-item-form-item-plain work-item-hours-item">
                  <el-tooltip :content="workItemWorkHoursLockedReason" :disabled="!workItemWorkHoursLockedReason">
                    <el-input
                      v-model="workItemWorkHoursInput"
                      class="work-item-hours-input"
                      inputmode="decimal"
                      placeholder="工时"
                      style="width: 100%"
                      :disabled="!canManageWorkItem || Boolean(workItemWorkHoursLockedReason)"
                      @input="handleWorkItemWorkHoursInput"
                      @blur="normalizeWorkItemWorkHoursInput"
                    />
                  </el-tooltip>
                </el-form-item>
              </div>
              <div v-if="workItemWorkHoursLockedReason && workItemForm.workItemType === '任务'" class="form-tip work-item-inline-tip">
                {{ workItemWorkHoursLockedReason }}
              </div>
            </div>
          </div>
        </section>

        <section class="work-item-editor-description">
          <div class="work-item-description-body">
            <el-alert
              v-if="isRequirementWorkItem && legacyRequirementNeedsUpgrade"
              type="warning"
              :closable="false"
              title="该需求为历史数据，本次保存后会升级为新模板结构。"
              class="legacy-requirement-alert"
            />
            <div v-if="isRequirementWorkItem && legacyRequirementPreview" class="legacy-requirement-preview">
              <div class="legacy-requirement-preview-title">历史说明预览</div>
              <div class="legacy-requirement-preview-body" v-html="renderMarkdownToHtml(legacyRequirementPreview)"></div>
            </div>

            <el-form-item v-if="isRequirementWorkItem" class="description-form-item work-item-description-form-item">
              <MarkdownEditor
                v-model="workItemForm.requirementMarkdown"
                :height="workItemEditorHeight"
                :preview="true"
                :upload-image="handleTaskMarkdownImageUpload"
                :placeholder="requirementDocumentPlaceholder"
              />
            </el-form-item>

            <el-form-item v-else prop="description" class="description-form-item work-item-description-form-item">
              <MarkdownEditor
                v-model="workItemForm.description"
                :height="workItemEditorHeight"
                :preview="true"
                :upload-image="handleTaskMarkdownImageUpload"
                placeholder="请填写工作项详细说明，支持 Markdown 格式"
              />
            </el-form-item>
          </div>
        </section>
      </div>
    </el-form>

    <template #footer>
      <div class="work-item-dialog-footer">
        <el-button @click="closeWorkItemDetail">取消</el-button>
        <el-button v-if="canManageWorkItem" type="primary" :loading="workItemSubmitting" @click="handleSubmitWorkItem">
          {{ workItemEditing ? '保存工作项' : '创建工作项' }}
        </el-button>
      </div>
    </template>
  </el-drawer>

  <el-dialog
    v-model="commentDialogVisible"
    :title="currentCommentTask ? `评论：${currentCommentTask.name}` : '工作项评论'"
    width="760px"
    class="comment-dialog"
  >
    <template v-if="currentCommentTask">
      <div class="comment-task-meta">
        <span>{{ currentCommentTask.workItemType }}</span>
        <span>{{ formatTaskStatusLabel(currentCommentTask) }}</span>
        <span>负责人：{{ currentCommentTask.assignee || '未分配' }}</span>
        <span>更新时间：{{ currentCommentTask.updatedAt }}</span>
      </div>

      <div class="comment-list" v-loading="commentLoading" @click="handleCommentImagePreview">
        <el-empty v-if="!taskComments.length && !commentLoading" description="暂无评论" />
        <div v-for="item in taskComments" :key="item.id" class="comment-item">
          <div class="comment-item-head">
            <strong>{{ item.authorName || '未知用户' }}</strong>
            <span>{{ item.createdAt }}</span>
          </div>
          <div class="comment-item-content" v-html="renderCommentContent(item.content)"></div>
        </div>
      </div>

      <div class="comment-editor">
        <MarkdownEditor
          v-model="commentForm.content"
          :height="220"
          :upload-image="handleTaskMarkdownImageUpload"
          placeholder="输入评论内容"
        />
        <div class="comment-editor-hint">支持 PNG、JPG、GIF 图片上传，单张最大 5MB。</div>
      </div>
    </template>
    <template #footer>
      <el-button @click="commentDialogVisible = false">关闭</el-button>
      <el-button type="primary" :loading="commentSubmitting" @click="handleSubmitComment">发表评论</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="burndownDialogVisible" title="项目燃尽图" width="980px" class="burndown-dialog">
    <div class="burndown-dialog-body">
      <ProjectBurndownChart :data="burndown" />
    </div>
  </el-dialog>

  <RequirementAiDialog
    v-model="requirementAiDialogVisible"
    :task="currentRequirementAiTask"
    :can-manage="canManageWorkItem"
    @changed="handleRequirementAiChanged"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Bell, ChatDotRound, Cpu, Delete, EditPen, Filter, FolderOpened, Finished, Management, Plus, RefreshRight, Search } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import { listUserOptions } from '@/api/access'
import CompactSelectMenu, { type CompactSelectOption } from '@/components/CompactSelectMenu.vue'
import ListUserDisplay from '@/components/ListUserDisplay.vue'
import type { ListUserDisplayItem } from '@/components/listUserDisplay'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import ProjectBurndownChart from '@/components/ProjectBurndownChart.vue'
import RequirementAiDialog from '@/components/RequirementAiDialog.vue'
import WorkItemMemberField from '@/components/WorkItemMemberField.vue'
import {
  createTaskComment,
  createIteration,
  createTask,
  deleteIteration,
  deleteTask,
  getTaskDetail,
  getProjectBurndown,
  getIterationBoard,
  listTaskComments,
  listProjectWorkItems,
  passRequirementDev,
  passRequirementTest,
  pageProjectWorkItems,
  updateIteration,
  updateTask
} from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import {
  formatRequirementStatusLabel,
  isRequirementFullyPassed,
  getTaskWorkHoursLockedReason,
  isTaskWorkHoursUnlocked
} from '@/utils/requirementReview'
import { uploadMarkdownImage } from '@/utils/taskImageUpload'
import {
  buildRequirementDraft,
  DEFAULT_REQUIREMENT_TEMPLATE,
  normalizeRequirementDocument,
  validateRequirementTemplate
} from '@/utils/requirementTemplate'
import { resolveAssetUrl } from '@/utils/asset'
import { renderMarkdownToHtml } from '@/utils/markdown'
import type {
  IterationBoardItem,
  IterationItem,
  ProjectBurndownItem,
  TaskCommentItem,
  TaskItem,
  UserOptionItem
} from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

interface IterationForm {
  name: string
  goal: string
  status: string
  description: string
  sortOrder: number
}

interface WorkItemForm {
  /** 工作项编号，仅用于详情展示。 */
  workItemCode: string
  name: string
  workItemType: '需求' | '任务' | '缺陷'
  status: string
  priority: string
  /** 预估工时，单位为小时。 */
  workHours: number | null
  /** 计划开始日期。 */
  planStartDate: string | null
  /** 计划结束日期。 */
  planEndDate: string | null
  assignee: string
  assigneeUserId: number | null
  collaboratorUserIds: number[]
  description: string
  requirementMarkdown: string
  prototypeUrl: string
  agentId: number | null
  iterationId: number | null
  requirementTaskId: number | null
}

interface IterationProgressSummary {
  total: number
  completed: number
  remaining: number
  percent: number
}

interface CommentForm {
  content: string
}

const taskStatusOptions = ['草稿', '待开始', '处理中', '已完成', '已阻塞']
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const { isMobileViewport } = useMobileViewport()
const projectId = Number(route.params.projectId)

const canManageIteration = computed(() => authStore.hasPermission('project:manage'))
const canManageWorkItem = computed(() => authStore.hasPermission('task:manage'))
const canRequirementDevPass = computed(() => authStore.hasPermission('task:requirement:dev'))
const canRequirementTestPass = computed(() => authStore.hasPermission('task:requirement:test'))
const userInitial = computed(() => (authStore.user?.nickname || authStore.user?.username || 'U').slice(0, 1).toUpperCase())
const userAvatarUrl = computed(() => resolveAssetUrl(authStore.user?.avatarUrl))

const board = reactive<IterationBoardItem>({
  project: {
    id: 0,
    name: '',
    owner: '',
    ownerUserId: null,
    creatorUserId: null,
    memberUserIds: [],
    memberNames: [],
    status: '',
    description: '',
    agentCount: 0,
    taskCount: 0,
    repoCount: 0,
    canEdit: false,
    canDelete: false
  },
  unplannedCount: 0,
  totalWorkItemCount: 0,
  iterations: []
})

/**
 * 当前项目可参与工作项指派的用户集合，包含负责人、创建人和项目成员。
 */
const projectParticipantUserIds = computed(() => {
  const result = new Set<number>()
  if (board.project.ownerUserId != null) {
    result.add(board.project.ownerUserId)
  }
  if (board.project.creatorUserId != null) {
    result.add(board.project.creatorUserId)
  }
  for (const userId of board.project.memberUserIds || []) {
    result.add(userId)
  }
  return Array.from(result)
})

const projectParticipantUsers = computed(() =>
  userOptions.value.filter((item) => projectParticipantUserIds.value.includes(item.id))
)

const userOptions = ref<UserOptionItem[]>([])
/**
 * 工作项列表展示按用户ID取头像频率较高，这里统一建索引供负责人/创建人复用。
 */
const userOptionMap = computed(() => new Map(userOptions.value.map((item) => [item.id, item])))
const requirementOptions = ref<TaskItem[]>([])
const workItems = ref<TaskItem[]>([])
const burndown = ref<ProjectBurndownItem | null>(null)
const currentIterationProgress = ref<IterationProgressSummary | null>(null)
const burndownDialogVisible = ref(false)
const statusUpdatingId = ref<number | null>(null)
const workItemLoading = ref(false)
const keyword = ref('')
const activeTypeTab = ref<'全部' | '需求' | '任务' | '缺陷'>('全部')
const workItemPagination = reactive({ page: 1, size: 10, total: 0 })
const workItemTotalPages = computed(() => Math.max(1, Math.ceil(workItemPagination.total / workItemPagination.size) || 1))
type InlineEditableField = 'status' | 'hours' | 'assignee' | 'priority'
const activeInlineEditor = ref<{ rowId: number; field: InlineEditableField } | null>(null)
const inlineHoursDraft = ref<number | null>(null)
const workItemFilters = reactive<{ status: string; priority: string; assigneeUserId?: number }>({
  status: '',
  priority: '',
  assigneeUserId: undefined
})
const workItemFilterPopoverVisible = ref(false)
const selectedScope = reactive<{ type: 'unplanned' | 'iteration'; iterationId: number | null }>({
  type: 'unplanned',
  iterationId: null
})

const iterationDialogVisible = ref(false)
const iterationEditing = ref(false)
const iterationSubmitting = ref(false)
const currentIterationId = ref<number | null>(null)
const iterationDialogTitle = computed(() => iterationEditing.value ? '编辑迭代' : '新建迭代')
const iterationDialogSubtitle = computed(() =>
  iterationEditing.value
    ? '调整迭代目标、状态和计划排期。'
    : '填写迭代基础信息，并设置计划排期。'
)
const iterationFormRef = ref<FormInstance>()
const iterationForm = reactive<IterationForm>({
  name: '',
  goal: '',
  status: '未开始',
  description: '',
  sortOrder: 0
})
const iterationDateRange = ref<string[]>([])

const workItemDialogVisible = ref(false)
const workItemEditing = ref(false)
const workItemSubmitting = ref(false)
const workItemDialogClosing = ref(false)
const currentWorkItemId = ref<number | null>(null)
const workItemAssigneeFallback = ref('')
const workItemWorkHoursInput = ref('')
const commentDialogVisible = ref(false)
const commentLoading = ref(false)
const commentSubmitting = ref(false)
const commentImagePreviewVisible = ref(false)
const commentImagePreviewSrc = ref('')
const requirementAiDialogVisible = ref(false)
const currentRequirementAiTask = ref<TaskItem | null>(null)
const currentDialogWorkItem = ref<TaskItem | null>(null)
const legacyRequirementNeedsUpgrade = ref(false)
const legacyRequirementPreview = ref('')
const currentCommentTask = ref<TaskItem | null>(null)
const taskComments = ref<TaskCommentItem[]>([])
const workItemFormRef = ref<FormInstance>()
const commentForm = reactive<CommentForm>({
  content: ''
})
const workItemForm = reactive<WorkItemForm>({
  workItemCode: '',
  name: '',
  workItemType: '任务',
  status: '草稿',
  priority: '中',
  workHours: null,
  planStartDate: null,
  planEndDate: null,
  assignee: '',
  assigneeUserId: null,
  collaboratorUserIds: [],
  description: '',
  requirementMarkdown: '',
  prototypeUrl: '',
  agentId: null,
  iterationId: null,
  requirementTaskId: null
})

const iterationRules: FormRules<IterationForm> = {
  name: [{ required: true, message: '请输入迭代名称', trigger: 'blur' }],
  status: [{ required: true, message: '请选择迭代状态', trigger: 'change' }]
}

const workItemRules: FormRules<WorkItemForm> = {
  name: [{ required: true, message: '请输入工作项标题', trigger: 'blur' }],
  workItemType: [{ required: true, message: '请选择工作项类型', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }]
}

const buildUserLabel = (item: UserOptionItem) => {
  return item.nickname?.trim() || item.username
}

const isRequirementWorkItem = computed(() => workItemForm.workItemType === '需求')
const requirementDocumentPlaceholder = computed(() => `${DEFAULT_REQUIREMENT_TEMPLATE}\n\n可在各章节中继续插入图片、链接、表格等 Markdown 内容。`)

const requirementSelectableOptions = computed(() =>
  requirementOptions.value.filter((item) => item.id !== currentWorkItemId.value)
)
const selectedRequirementForWorkHours = computed(() =>
  requirementOptions.value.find((item) => item.id === workItemForm.requirementTaskId) || null
)
const workItemWorkHoursLockedReason = computed(() => {
  if (workItemForm.workItemType !== '任务' || !selectedRequirementForWorkHours.value) {
    return ''
  }
  return isRequirementFullyPassed(selectedRequirementForWorkHours.value)
    ? ''
    : '需关联需求开发、测试均通过后才可编辑'
})

const workItemDisplayCode = computed(() => {
  return workItemForm.workItemCode || '保存后自动生成'
})

const workItemPriorityTone = computed(() => {
  if (workItemForm.priority === '高') return 'high'
  if (workItemForm.priority === '低') return 'low'
  return 'medium'
})

const workItemPriorityBadge = computed(() => {
  if (workItemForm.priority === '高') return 'P0 - 高优先级'
  if (workItemForm.priority === '低') return 'P2 - 低优先级'
  return 'P1 - 中优先级'
})

/**
 * 预估工时改成普通输入框后，统一在这里约束为数字和单个小数点。
 */
const handleWorkItemWorkHoursInput = (value: string | number) => {
  const rawText = String(value ?? '')
  const normalizedText = rawText
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')

  workItemWorkHoursInput.value = normalizedText
  workItemForm.workHours = normalizedText ? Number(normalizedText) : null
}

const normalizeWorkItemWorkHoursInput = () => {
  if (!workItemWorkHoursInput.value) {
    workItemForm.workHours = null
    return
  }
  const normalizedValue = Math.min(15, Math.max(0, Number(workItemWorkHoursInput.value)))
  workItemForm.workHours = Number.isFinite(normalizedValue) ? normalizedValue : null
  workItemWorkHoursInput.value = workItemForm.workHours == null ? '' : String(workItemForm.workHours)
}

const workItemStatusDisplay = computed(() => currentDialogWorkItem.value ? formatTaskStatusLabel(currentDialogWorkItem.value) : workItemForm.status || '草稿')
const workItemStatusTone = computed(() => workItemTone(workItemForm.status))
// 让编辑器直接撑满抽屉剩余空间，避免底部删除信息区后出现视觉留白。
// 工作项抽屉中的 Markdown 编辑器不再拉满剩余空间，避免顶部出现大片空白。
const workItemEditorHeight = computed(() => 'clamp(460px, 58vh, 720px)')
const workItemDialogUpdatedAt = computed(() => currentDialogWorkItem.value?.updatedAt || '保存后生成')

const hasWorkItemPlanDateRange = (task: Pick<TaskItem, 'planStartDate' | 'planEndDate'>) =>
  Boolean(task.planStartDate && task.planEndDate)

/**
 * 列表只在计划开始和结束都存在时展示完整范围，
 * 任一端缺失时统一回退为“未设置”态，避免给用户造成排期已完整配置的误解。
 */
const formatWorkItemPlanDateRange = (planStartDate?: string | null, planEndDate?: string | null) => {
  if (!planStartDate || !planEndDate) {
    return ''
  }
  return `${planStartDate} ~ ${planEndDate}`
}

const syncWorkItemAssignee = () => {
  const selected = userOptions.value.find((item) => item.id === workItemForm.assigneeUserId)
  workItemForm.assignee = selected?.nickname?.trim() || selected?.username || workItemAssigneeFallback.value
  workItemForm.collaboratorUserIds = workItemForm.collaboratorUserIds.filter((item) => item !== workItemForm.assigneeUserId)
}

const currentIteration = computed(() =>
  board.iterations.find((item) => item.id === selectedScope.iterationId) || null
)

const currentScopeTitle = computed(() => {
  if (selectedScope.type === 'unplanned') return '未规划工作项'
  return currentIteration.value?.name || '迭代工作项'
})

const currentScopeDescription = computed(() => {
  if (selectedScope.type === 'unplanned') {
    return '当前展示尚未分配到任何迭代的工作项'
  }
  const iteration = currentIteration.value
  if (!iteration) return ''
  return `目标：${iteration.goal || '未设置'}`
})

const workspaceStatCards = computed(() => {
  const totalItems = currentIterationProgress.value?.total ?? workItems.value.length
  const completed = currentIterationProgress.value?.completed ?? workItems.value.filter((item) => isCompletedStatus(item.status)).length
  const defects = workItems.value.filter((item) => item.workItemType === '缺陷').length
  const openTasks = workItems.value.filter((item) => !isCompletedStatus(item.status)).length
  const velocity = totalItems ? Number(((completed / Math.max(totalItems, 1)) * 50).toFixed(1)) : 0
  const burnRate = currentIterationProgress.value?.percent ?? 0

  return [
    { label: '迭代速度', value: velocity.toFixed(1), highlight: completed ? `+${completed}%` : '', progress: Math.min(100, Math.round(velocity * 2)), progressTone: 'primary', subtext: '' },
    { label: '未完成项', value: String(openTasks), highlight: '', progress: undefined, progressTone: '', subtext: `${totalItems ? Math.round((openTasks / totalItems) * 100) : 0}% 处理中`, dots: 0, activeDots: 0 },
    { label: '缺陷数', value: String(defects), highlight: defects > 0 ? '风险偏高' : '', progress: Math.min(100, defects * 8), progressTone: 'danger', subtext: '', dots: 0, activeDots: 0 },
    { label: '燃尽率', value: `${burnRate}%`, highlight: '', progress: undefined, progressTone: '', subtext: '', dots: 4, activeDots: Math.max(1, Math.round(burnRate / 25)) }
  ]
})

const unplannedProgressPercent = computed(() => {
  if (!board.unplannedCount) {
    return 0
  }
  const base = Math.min(100, Math.max(16, board.unplannedCount * 12))
  return base
})

const iterationStatusType = (status: string) => {
  if (status === '进行中') return 'success'
  if (status === '已完成') return 'info'
  return 'warning'
}

const handleOpenNotificationsProxy = async () => {
  await notificationStore.openDrawer()
}

const handleHeaderCommand = async (command: string) => {
  if (command === 'profile') {
    await router.push('/profile')
    return
  }
  if (command !== 'logout') {
    return
  }
  notificationStore.disconnect()
  await authStore.logout()
  ElMessage.success('已退出登录')
  await router.replace('/login')
}

const setTypeTab = async (tab: '全部' | '需求' | '任务' | '缺陷') => {
  if (activeTypeTab.value === tab) {
    return
  }
  activeTypeTab.value = tab
  await handleTypeTabChange()
}

const formatCompactDateRange = (startDate?: string | null, endDate?: string | null) => {
  if (!startDate && !endDate) {
    return '未设置周期'
  }
  const start = startDate ? startDate.slice(5) : '--'
  const end = endDate ? endDate.slice(5) : '--'
  return `${start} ~ ${end}`
}

const iterationSidebarPercent = (item: IterationItem) => {
  if (selectedScope.type === 'iteration' && selectedScope.iterationId === item.id && currentIterationProgress.value) {
    return currentIterationProgress.value.percent
  }
  if (item.status === '已完成') return 100
  if (item.status === '进行中') return 68
  return 22
}

const iterationStatusIcon = (status: string) => {
  if (status === '已完成') return '✔'
  if (status === '进行中') return '≡'
  return '◷'
}

// 复用任务管理列表的胶囊配色，让迭代列表和任务管理在视觉上保持同一套语义。
const workItemTypeTone = (type?: string | null) => {
  if (type === '需求') return 'requirement'
  if (type === '缺陷') return 'defect'
  return 'task'
}

const workItemTone = (status?: string | null) => {
  if (['进行中', '开发中', '处理中'].includes(status || '')) return 'running'
  if (['已完成', '完成'].includes(status || '')) return 'done'
  if (status === '已阻塞' || status === '阻塞') return 'blocked'
  if (status === '待开始') return 'pending'
  return 'draft'
}

const workspacePriorityTone = (priority?: string | null) => {
  if (priority === '高') return 'high'
  if (priority === '低') return 'low'
  return 'medium'
}

/**
 * 迭代工作项列表优先复用用户选项中的真实头像地址，再回退到字母头像。
 */
const buildWorkItemAssigneeDisplayItem = (item: TaskItem): ListUserDisplayItem | null => {
  if (!item.assignee?.trim()) {
    return null
  }
  const assigneeUser = item.assigneeUserId != null ? userOptionMap.value.get(item.assigneeUserId) || null : null
  return {
    id: item.assigneeUserId ?? `iteration-assignee-${item.id}`,
    name: item.assignee.trim(),
    avatarUrl: resolveAssetUrl(assigneeUser?.avatarUrl)
  }
}

const buildWorkItemCreatorDisplayItem = (item: TaskItem): ListUserDisplayItem | null => {
  if (!item.creatorName?.trim()) {
    return null
  }
  const creatorUser = item.creatorUserId != null ? userOptionMap.value.get(item.creatorUserId) || null : null
  return {
    id: item.creatorUserId ?? `iteration-creator-${item.id}`,
    name: item.creatorName.trim(),
    avatarUrl: resolveAssetUrl(creatorUser?.avatarUrl)
  }
}

/**
 * 列表内状态、工时、负责人、优先级四个快捷编辑字段共用一套激活状态，
 * 保证同一时间只会打开一个单元格编辑器。
 */
const isInlineEditorActive = (rowId: number, field: InlineEditableField) =>
  activeInlineEditor.value?.rowId === rowId && activeInlineEditor.value?.field === field

const canEditInlineSelectField = (row: TaskItem) => canManageWorkItem.value && row.workItemType !== '需求'
const canEditInlineHoursField = (row: TaskItem) => canManageWorkItem.value && row.workItemType === '任务'
const formatInlineWorkHours = (value?: number | null) => (value == null ? '-' : `${value}h`)

/**
 * 点击显示态字段后切换到编辑态；工时字段会初始化草稿值并自动聚焦输入框。
 */
const openInlineEditor = async (row: TaskItem, field: InlineEditableField) => {
  if (field === 'hours') {
    if (!canEditInlineHoursField(row)) {
      return
    }
    const lockedReason = getRowWorkHoursLockedReason(row)
    if (lockedReason) {
      ElMessage.warning(lockedReason)
      return
    }
    inlineHoursDraft.value = row.workHours
  } else if (!canEditInlineSelectField(row)) {
    return
  }

  activeInlineEditor.value = { rowId: row.id, field }

  if (field === 'hours') {
    await nextTick()
    const input = document.querySelector('.workspace-inline-number input') as HTMLInputElement | null
    input?.focus()
    input?.select()
  }
}

const closeInlineEditor = (rowId?: number, field?: InlineEditableField) => {
  if (!activeInlineEditor.value) {
    return
  }
  if (rowId != null && field != null) {
    if (activeInlineEditor.value.rowId !== rowId || activeInlineEditor.value.field !== field) {
      return
    }
  }
  activeInlineEditor.value = null
  inlineHoursDraft.value = null
}

const handleInlineSelectVisibleChange = (
  rowId: number,
  field: Extract<InlineEditableField, 'status' | 'assignee' | 'priority'>,
  visible: boolean
) => {
  if (!visible) {
    closeInlineEditor(rowId, field)
  }
}

const handleInlineHoursSubmit = async (row: TaskItem) => {
  if (!isInlineEditorActive(row.id, 'hours')) {
    return
  }
  const draftValue = inlineHoursDraft.value
  closeInlineEditor(row.id, 'hours')
  await handleQuickWorkHoursChange(row, draftValue)
}

const handleInlineHoursFocusOut = async (row: TaskItem, event: FocusEvent) => {
  const currentTarget = event.currentTarget as HTMLElement | null
  const nextTarget = event.relatedTarget as Node | null
  if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) {
    return
  }
  await handleInlineHoursSubmit(row)
}

const handleInlineHoursCancel = (row: TaskItem) => {
  closeInlineEditor(row.id, 'hours')
}

const isCompletedStatus = (status?: string | null) => status === '已完成' || status === '完成'

const taskStatusSelectOptions: CompactSelectOption[] = [
  { label: '草稿', value: '草稿', tone: 'info' },
  { label: '待开始', value: '待开始', tone: 'warning' },
  { label: '处理中', value: '处理中', tone: 'primary' },
  { label: '已完成', value: '已完成', tone: 'success' },
  { label: '已阻塞', value: '已阻塞', tone: 'danger' }
]

const prioritySelectOptions: CompactSelectOption[] = [
  { label: '高', value: '高', tone: 'danger' },
  { label: '中', value: '中', tone: 'warning' },
  { label: '低', value: '低', tone: 'info' }
]

const assigneeSelectOptions = computed<CompactSelectOption[]>(() => [
  { label: '未分配', value: -1, tone: 'info' },
  ...projectParticipantUsers.value.map((item) => ({
    label: buildUserLabel(item),
    value: item.id,
    tone: 'primary' as const
  }))
])

const formatDateRange = (startDate?: string | null, endDate?: string | null) => {
  if (startDate && endDate) return `${startDate} 至 ${endDate}`
  if (startDate) return `开始：${startDate}`
  if (endDate) return `结束：${endDate}`
  return '未设置计划时间'
}

const resetIterationForm = () => {
  currentIterationId.value = null
  iterationForm.name = ''
  iterationForm.goal = ''
  iterationForm.status = '未开始'
  iterationForm.description = ''
  iterationForm.sortOrder = board.iterations.length
  iterationDateRange.value = []
  iterationFormRef.value?.clearValidate()
}

/**
 * 新建工作项时默认跟随当前列表入口的类型筛选，
 * 只有“全部”页签回退为任务，避免用户每次都手动切换类型。
 */
const resolveDefaultWorkItemType = (): WorkItemForm['workItemType'] => {
  if (activeTypeTab.value === '需求') {
    return '需求'
  }
  if (activeTypeTab.value === '缺陷') {
    return '缺陷'
  }
  return '任务'
}

const resetWorkItemForm = () => {
  currentWorkItemId.value = null
  currentDialogWorkItem.value = null
  workItemForm.workItemCode = ''
  workItemForm.name = ''
  workItemForm.workItemType = resolveDefaultWorkItemType()
  workItemForm.status = '草稿'
  workItemForm.priority = '中'
  workItemForm.workHours = null
  workItemWorkHoursInput.value = ''
  workItemForm.planStartDate = null
  workItemForm.planEndDate = null
  workItemForm.assignee = ''
  workItemAssigneeFallback.value = ''
  workItemForm.assigneeUserId = null
  workItemForm.collaboratorUserIds = []
  workItemForm.description = ''
  workItemForm.requirementMarkdown = ''
  workItemForm.prototypeUrl = ''
  workItemForm.agentId = null
  workItemForm.iterationId = selectedScope.type === 'iteration' ? selectedScope.iterationId : null
  workItemForm.requirementTaskId = null
  legacyRequirementNeedsUpgrade.value = false
  legacyRequirementPreview.value = ''
  workItemFormRef.value?.clearValidate()
}

const resetCommentForm = () => {
  commentForm.content = ''
}

const normalizeCommentContent = (value: string) => value.trim()

const renderCommentContent = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return '<p>-</p>'
  }
  return /<\/?[a-z][\s\S]*>/i.test(trimmed) ? trimmed : renderMarkdownToHtml(trimmed)
}

const handleTaskMarkdownImageUpload = (file: File) => uploadMarkdownImage(file)

const validateRequirementForm = () => {
  if (!isRequirementWorkItem.value) {
    return ''
  }
  // 需求改为模板化文档后，原型链接与固定章节都需要在提交前完成校验。
  if (!workItemForm.prototypeUrl.trim()) {
    return '请输入原型链接'
  }
  return validateRequirementTemplate(workItemForm.requirementMarkdown)
}

const formatTaskStatusLabel = (task: TaskItem | null | undefined) => {
  if (!task) {
    return '-'
  }
  return formatRequirementStatusLabel(task)
}

// 将 Markdown 描述压平成单行摘要，避免需求文档把列表行高撑得过大。
const formatWorkItemPreview = (task: TaskItem) => {
  const source = (task.description || task.requirementMarkdown || '').trim()
  if (!source) {
    return '暂无说明'
  }
  return source
    .replace(/!\[[^\]]*]\([^)]+\)/g, '图片')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`>#*_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '暂无说明'
}

// 统一格式化列表里的更新时间，兼容后端返回 ISO 字符串和空值场景。
const formatWorkItemUpdatedAt = (value?: string | null) => {
  if (!value) {
    return '-'
  }
  return value.replace('T', ' ').slice(0, 16)
}

const getRowWorkHoursLockedReason = (task: TaskItem) => {
  if (task.workItemType !== '任务') {
    return ''
  }
  return getTaskWorkHoursLockedReason(task)
}

const openRequirementAiDialog = (item: TaskItem) => {
  currentRequirementAiTask.value = item
  requirementAiDialogVisible.value = true
}

const handleRequirementAiChanged = async () => {
  await Promise.all([loadBoard(), loadWorkItems(), loadCurrentIterationProgress()])
  if (currentCommentTask.value && currentRequirementAiTask.value && currentCommentTask.value.id === currentRequirementAiTask.value.id) {
    await loadTaskCommentList()
  }
}

const handleRequirementDevPass = async (task: TaskItem) => {
  try {
    await passRequirementDev(task.id)
    ElMessage.success('需求已开发通过')
    await refreshBoardAndItems()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '开发通过失败')
  }
}

const handleRequirementTestPass = async (task: TaskItem) => {
  try {
    await passRequirementTest(task.id)
    ElMessage.success('需求已测试通过')
    await refreshBoardAndItems()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '测试通过失败')
  }
}

const handleCommentImagePreview = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }
  const image = target.closest('.comment-item-content img')
  if (!(image instanceof HTMLImageElement) || !image.src) {
    return
  }
  commentImagePreviewSrc.value = image.src
  commentImagePreviewVisible.value = true
}

const openRequirementTask = async (taskId: number) => {
  if (!taskId) {
    return
  }
  await openWorkItemDetailById(taskId)
}

/**
 * 统一解析可分享链接中的工作项详情参数，保证 URL、左侧选中迭代和详情抽屉始终指向同一个工作项。
 */
const openTaskFromQuery = async (taskId?: number) => {
  const targetTaskId = taskId ?? Number(route.query.openTaskId)
  if (Number.isNaN(targetTaskId) || targetTaskId <= 0) {
    return
  }

  try {
    const task = await getTaskDetail(targetTaskId)
    if (task.projectId !== projectId) {
      await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' })
      return
    }

    selectedScope.type = task.iterationId ? 'iteration' : 'unplanned'
    selectedScope.iterationId = task.iterationId
    workItemPagination.page = 1
    await Promise.all([loadWorkItems(), loadCurrentIterationProgress()])
    openEditWorkItemDialog(task)
    await syncWorkItemRouteQuery({
      iterationId: task.iterationId,
      openTaskId: task.id,
      mode: 'replace'
    })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '打开工作项详情失败')
    await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' })
  }
}

const goBack = () => {
  router.push({ name: 'projects' })
}

/**
 * 统一维护迭代管理页面的深链参数，只改动迭代与工作项详情相关字段，其余查询参数保持不变。
 */
const syncWorkItemRouteQuery = async ({
  iterationId = selectedScope.type === 'iteration' ? selectedScope.iterationId : null,
  openTaskId = route.query.openTaskId ? Number(route.query.openTaskId) : null,
  mode = 'replace'
}: {
  iterationId?: number | null
  openTaskId?: number | null
  mode?: 'push' | 'replace'
}) => {
  const nextQuery = { ...route.query }
  if (iterationId) {
    nextQuery.iterationId = String(iterationId)
  } else {
    delete nextQuery.iterationId
  }
  if (openTaskId) {
    nextQuery.openTaskId = String(openTaskId)
  } else {
    delete nextQuery.openTaskId
  }

  const currentIterationId = route.query.iterationId ? String(route.query.iterationId) : ''
  const currentOpenTaskId = route.query.openTaskId ? String(route.query.openTaskId) : ''
  const nextIterationId = iterationId ? String(iterationId) : ''
  const nextOpenTaskId = openTaskId ? String(openTaskId) : ''
  if (currentIterationId === nextIterationId && currentOpenTaskId === nextOpenTaskId) {
    return
  }

  await router[mode]({ name: 'project-iterations', params: { projectId }, query: nextQuery })
}

const syncIterationQuery = async (iterationId: number | null) => {
  await syncWorkItemRouteQuery({ iterationId, mode: 'replace' })
}

/**
 * 用户从列表点击工作项时，优先把当前工作项写入 URL，再交给路由监听统一打开详情，确保链接可复制分享。
 */
const openWorkItemDetailFromRow = async (item: TaskItem) => {
  const currentTaskId = Number(route.query.openTaskId)
  const currentIterationId = route.query.iterationId ? Number(route.query.iterationId) : null
  const targetIterationId = item.iterationId ?? null
  if (currentTaskId === item.id && currentIterationId === targetIterationId) {
    await openTaskFromQuery(item.id)
    return
  }
  await syncWorkItemRouteQuery({
    iterationId: targetIterationId,
    openTaskId: item.id,
    mode: 'push'
  })
}

/**
 * 某些入口只有工作项 ID，需要先补齐工作项详情后再生成标准分享链接。
 */
const openWorkItemDetailById = async (taskId: number) => {
  const currentTaskId = Number(route.query.openTaskId)
  if (currentTaskId === taskId) {
    await openTaskFromQuery(taskId)
    return
  }
  try {
    const task = await getTaskDetail(taskId)
    if (task.projectId !== projectId) {
      return
    }
    await syncWorkItemRouteQuery({
      iterationId: task.iterationId,
      openTaskId: task.id,
      mode: 'push'
    })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '打开工作项详情失败')
  }
}

/**
 * 统一关闭详情抽屉，并在关闭时清理分享链接中的工作项参数，保留当前迭代上下文。
 */
const closeWorkItemDetail = async () => {
  if (workItemDialogClosing.value) {
    return
  }
  workItemDialogClosing.value = true
  try {
    await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' })
    workItemDialogVisible.value = false
  } finally {
    workItemDialogClosing.value = false
  }
}

/**
 * 兼容抽屉遮罩点击、按 Esc 等系统关闭动作，避免这类关闭路径遗漏 URL 清理。
 */
const handleWorkItemDrawerBeforeClose = async (done: () => void) => {
  if (workItemDialogClosing.value) {
    done()
    return
  }
  workItemDialogClosing.value = true
  try {
    await syncWorkItemRouteQuery({ openTaskId: null, mode: 'replace' })
    done()
  } finally {
    workItemDialogClosing.value = false
  }
}

const handleWorkItemDialogClosed = () => {
  resetWorkItemForm()
}

const selectUnplanned = async () => {
  selectedScope.type = 'unplanned'
  selectedScope.iterationId = null
  workItemPagination.page = 1
  await Promise.all([loadWorkItems(), loadCurrentIterationProgress(), syncIterationQuery(null)])
}

const selectIteration = async (item: IterationItem) => {
  selectedScope.type = 'iteration'
  selectedScope.iterationId = item.id
  workItemPagination.page = 1
  await Promise.all([loadWorkItems(), loadCurrentIterationProgress(), syncIterationQuery(item.id)])
}

const loadBoard = async () => {
  const [boardData, users, burndownData, requirements] = await Promise.all([
    getIterationBoard(projectId),
    listUserOptions(),
    getProjectBurndown(projectId),
    listProjectWorkItems(projectId, { workItemType: '需求' })
  ])
  board.project = boardData.project
  board.unplannedCount = boardData.unplannedCount
  board.totalWorkItemCount = boardData.totalWorkItemCount
  board.iterations = boardData.iterations
  userOptions.value = users
  burndown.value = burndownData
  requirementOptions.value = requirements

  const routeIterationId = Number(route.query.iterationId)
  if (!Number.isNaN(routeIterationId) && routeIterationId > 0 && board.iterations.some((item) => item.id === routeIterationId)) {
    selectedScope.type = 'iteration'
    selectedScope.iterationId = routeIterationId
  }

  if (selectedScope.type === 'iteration') {
    const exists = board.iterations.some((item) => item.id === selectedScope.iterationId)
    if (!exists) {
      selectedScope.type = board.iterations.length > 0 ? 'iteration' : 'unplanned'
      selectedScope.iterationId = board.iterations.length > 0 ? board.iterations[0].id : null
    }
  } else if (selectedScope.iterationId === null && board.iterations.length > 0 && board.unplannedCount === 0) {
    selectedScope.type = 'iteration'
    selectedScope.iterationId = board.iterations[0].id
  }
}

const loadWorkItems = async () => {
  workItemLoading.value = true
  try {
    const pageData = await pageProjectWorkItems(projectId, {
      page: workItemPagination.page,
      size: workItemPagination.size,
      iterationId: selectedScope.type === 'iteration' ? selectedScope.iterationId || undefined : undefined,
      unplanned: selectedScope.type === 'unplanned' ? true : undefined,
      workItemType: activeTypeTab.value,
      keyword: keyword.value,
      status: workItemFilters.status || undefined,
      priority: workItemFilters.priority || undefined,
      assigneeUserId: workItemFilters.assigneeUserId
    })
    workItems.value = pageData.records
    workItemPagination.total = pageData.total
    if (currentCommentTask.value) {
      currentCommentTask.value = pageData.records.find((item) => item.id === currentCommentTask.value?.id) || currentCommentTask.value
    }
  } finally {
    workItemLoading.value = false
  }
}

const loadCurrentIterationProgress = async () => {
  if (selectedScope.type !== 'iteration' || !selectedScope.iterationId) {
    currentIterationProgress.value = null
    return
  }

  const allItems = await listProjectWorkItems(projectId, {
    iterationId: selectedScope.iterationId,
    workItemType: '全部'
  })

  const total = allItems.length
  const completed = allItems.filter((item) => isCompletedStatus(item.status)).length
  const remaining = Math.max(total - completed, 0)
  currentIterationProgress.value = {
    total,
    completed,
    remaining,
    percent: total ? Math.round((completed / total) * 100) : 0
  }
}

const refreshBoardAndItems = async () => {
  await loadBoard()
  await Promise.all([loadWorkItems(), loadCurrentIterationProgress()])
}

const handleTypeTabChange = async () => {
  workItemPagination.page = 1
  await loadWorkItems()
}

const handleFilterSearch = async () => {
  workItemFilterPopoverVisible.value = false
  workItemPagination.page = 1
  await loadWorkItems()
}

const handleFilterReset = async () => {
  workItemFilterPopoverVisible.value = false
  workItemFilters.status = ''
  workItemFilters.priority = ''
  workItemFilters.assigneeUserId = undefined
  keyword.value = ''
  activeTypeTab.value = '全部'
  workItemPagination.page = 1
  await loadWorkItems()
}

const handlePageSizeChange = async () => {
  workItemPagination.page = 1
  await loadWorkItems()
}

const handleWorkItemPrevPage = async () => {
  if (workItemPagination.page <= 1) return
  workItemPagination.page -= 1
  await loadWorkItems()
}

const handleWorkItemNextPage = async () => {
  if (workItemPagination.page >= workItemTotalPages.value) return
  workItemPagination.page += 1
  await loadWorkItems()
}

const openCreateIterationDialog = () => {
  if (!canManageIteration.value) {
    return
  }
  iterationEditing.value = false
  resetIterationForm()
  iterationDialogVisible.value = true
}

const openEditIterationDialog = (item: IterationItem) => {
  if (!canManageIteration.value) {
    return
  }
  iterationEditing.value = true
  currentIterationId.value = item.id
  iterationForm.name = item.name
  iterationForm.goal = item.goal
  iterationForm.status = item.status
  iterationForm.description = item.description
  iterationForm.sortOrder = item.sortOrder
  iterationDateRange.value = [item.startDate || '', item.endDate || ''].filter(Boolean)
  iterationDialogVisible.value = true
}

const handleSubmitIteration = async () => {
  if (!canManageIteration.value) {
    return
  }
  const valid = await iterationFormRef.value?.validate().catch(() => false)
  if (!valid) return
  iterationSubmitting.value = true
  try {
    const payload = {
      name: iterationForm.name,
      goal: iterationForm.goal,
      status: iterationForm.status,
      startDate: iterationDateRange.value[0] || '',
      endDate: iterationDateRange.value[1] || '',
      description: iterationForm.description,
      sortOrder: iterationForm.sortOrder
    }
    if (iterationEditing.value && currentIterationId.value !== null) {
      await updateIteration(projectId, currentIterationId.value, payload)
      ElMessage.success('迭代已更新')
    } else {
      await createIteration(projectId, payload)
      ElMessage.success('迭代已创建')
    }
    iterationDialogVisible.value = false
    await refreshBoardAndItems()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    iterationSubmitting.value = false
  }
}

const handleDeleteIteration = async (item: IterationItem) => {
  if (!canManageIteration.value || !item.canDelete) {
    return
  }
  try {
    await ElMessageBox.confirm('删除迭代后，迭代下的工作项会转为未规划工作项，是否继续？', '提示', { type: 'warning' })
    await deleteIteration(projectId, item.id)
    ElMessage.success('迭代已删除')
    await refreshBoardAndItems()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

const openCreateWorkItemDialog = () => {
  workItemEditing.value = false
  resetWorkItemForm()
  workItemDialogVisible.value = true
}

const openEditWorkItemDialog = (item: TaskItem) => {
  workItemEditing.value = true
  currentDialogWorkItem.value = item
  currentWorkItemId.value = item.id
  workItemForm.workItemCode = item.workItemCode
  workItemForm.name = item.name
  workItemForm.workItemType = item.workItemType
  workItemForm.status = item.status
  workItemForm.priority = item.priority
  workItemForm.workHours = item.workHours
  workItemWorkHoursInput.value = item.workHours == null ? '' : String(item.workHours)
  workItemForm.planStartDate = item.planStartDate
  workItemForm.planEndDate = item.planEndDate
  workItemForm.assignee = item.assignee
  workItemAssigneeFallback.value = item.assigneeUserId ? '' : item.assignee
  workItemForm.assigneeUserId = item.assigneeUserId
  workItemForm.collaboratorUserIds = [...item.collaboratorUserIds]
  workItemForm.description = item.description
  if (item.workItemType === '需求') {
    // 历史需求只有 description 时，这里自动包装成新模板草稿，方便用户补齐后直接保存升级。
    const requirementDraft = buildRequirementDraft(item.requirementMarkdown, item.description)
    workItemForm.requirementMarkdown = requirementDraft.markdown
    workItemForm.prototypeUrl = item.prototypeUrl || ''
    legacyRequirementNeedsUpgrade.value = requirementDraft.upgradedFromLegacy
    legacyRequirementPreview.value = !item.requirementMarkdown && item.description ? item.description : ''
  } else {
    workItemForm.requirementMarkdown = ''
    workItemForm.prototypeUrl = ''
    legacyRequirementNeedsUpgrade.value = false
    legacyRequirementPreview.value = ''
  }
  workItemForm.agentId = item.agentId
  workItemForm.iterationId = item.iterationId
  workItemForm.requirementTaskId = item.requirementTaskId
  workItemDialogVisible.value = true
}

const loadTaskCommentList = async () => {
  if (!currentCommentTask.value) {
    taskComments.value = []
    return
  }
  commentLoading.value = true
  try {
    taskComments.value = await listTaskComments(currentCommentTask.value.id)
  } finally {
    commentLoading.value = false
  }
}

const openCommentDialog = async (item: TaskItem) => {
  currentCommentTask.value = item
  resetCommentForm()
  commentDialogVisible.value = true
  await loadTaskCommentList()
}

const handleSubmitComment = async () => {
  if (!currentCommentTask.value) {
    return
  }
  const content = normalizeCommentContent(commentForm.content)
  if (!content) {
    ElMessage.warning('请输入评论内容')
    return
  }
  commentSubmitting.value = true
  try {
    await createTaskComment(currentCommentTask.value.id, content)
    resetCommentForm()
    await Promise.all([loadTaskCommentList(), loadWorkItems()])
    ElMessage.success('评论已发布')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '评论发布失败')
  } finally {
    commentSubmitting.value = false
  }
}

const handleSubmitWorkItem = async () => {
  if (!canManageWorkItem.value) {
    return
  }
  const valid = await workItemFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (workItemForm.planStartDate && workItemForm.planEndDate && workItemForm.planEndDate < workItemForm.planStartDate) {
    ElMessage.warning('计划结束日期不能早于计划开始日期')
    return
  }
  const requirementValidationMessage = validateRequirementForm()
  if (requirementValidationMessage) {
    ElMessage.warning(requirementValidationMessage)
    return
  }
  if (workItemForm.workItemType === '任务' && workItemWorkHoursLockedReason.value && workItemForm.workHours !== null) {
    ElMessage.warning(workItemWorkHoursLockedReason.value)
    return
  }
  workItemSubmitting.value = true
  try {
    syncWorkItemAssignee()
    const normalizedRequirementMarkdown = isRequirementWorkItem.value
      ? normalizeRequirementDocument(workItemForm.requirementMarkdown)
      : ''
    const payload = {
      name: workItemForm.name,
      workItemType: workItemForm.workItemType,
      status: workItemForm.status,
      priority: workItemForm.priority,
      workHours: workItemForm.workItemType === '任务' ? workItemForm.workHours : null,
      planStartDate: workItemForm.planStartDate,
      planEndDate: workItemForm.planEndDate,
      assignee: workItemForm.assignee,
      assigneeUserId: workItemForm.assigneeUserId,
      collaboratorUserIds: workItemForm.collaboratorUserIds,
      description: isRequirementWorkItem.value ? normalizedRequirementMarkdown : workItemForm.description,
      requirementMarkdown: normalizedRequirementMarkdown,
      prototypeUrl: isRequirementWorkItem.value ? workItemForm.prototypeUrl.trim() : '',
      projectId,
      agentId: workItemForm.agentId,
      iterationId: workItemForm.iterationId,
      requirementTaskId: workItemForm.workItemType === '需求' ? null : workItemForm.requirementTaskId
    }
    if (workItemEditing.value && currentWorkItemId.value !== null) {
      await updateTask(currentWorkItemId.value, payload)
      ElMessage.success('工作项已更新')
    } else {
      await createTask(payload)
      ElMessage.success('工作项已创建')
    }
    await closeWorkItemDetail()
    await refreshBoardAndItems()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    workItemSubmitting.value = false
  }
}

const handleDeleteWorkItem = async (item: TaskItem) => {
  if (!canManageWorkItem.value || !item.canDelete) {
    return
  }
  try {
    await ElMessageBox.confirm(`确认删除工作项“${item.name}”吗？`, '提示', { type: 'warning' })
    await deleteTask(item.id)
    ElMessage.success('工作项已删除')
    await refreshBoardAndItems()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

const updateInlineWorkItem = async (
  row: TaskItem,
  overrides: Partial<Pick<TaskItem, 'status' | 'priority' | 'workHours' | 'assigneeUserId' | 'collaboratorUserIds' | 'assignee'>>
) => {
  statusUpdatingId.value = row.id
  try {
    const nextAssigneeUserId = overrides.assigneeUserId === undefined ? row.assigneeUserId : overrides.assigneeUserId
    const nextAssignee =
      overrides.assignee !== undefined
        ? overrides.assignee
        : nextAssigneeUserId === null
          ? '未分配'
          : buildUserLabel(userOptions.value.find((item) => item.id === nextAssigneeUserId) || { id: 0, username: '未分配', nickname: '', enabled: true })
    const nextCollaboratorUserIds = (overrides.collaboratorUserIds ?? row.collaboratorUserIds).filter(
      (item) => item !== nextAssigneeUserId
    )

    const updated = await updateTask(row.id, {
      name: row.name,
      workItemType: row.workItemType,
      status: overrides.status ?? row.status,
      priority: overrides.priority ?? row.priority,
      workHours: overrides.workHours === undefined ? row.workHours : overrides.workHours,
      planStartDate: row.planStartDate,
      planEndDate: row.planEndDate,
      assignee: nextAssignee,
      assigneeUserId: nextAssigneeUserId,
      collaboratorUserIds: nextCollaboratorUserIds,
      description: row.description,
      requirementMarkdown: row.requirementMarkdown,
      prototypeUrl: row.prototypeUrl,
      projectId: row.projectId,
      agentId: row.agentId,
      iterationId: row.iterationId,
      requirementTaskId: row.requirementTaskId
    })
    Object.assign(row, updated)
    await Promise.all([loadBoard(), loadCurrentIterationProgress(), loadWorkItems()])
    ElMessage.success('工作项已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新失败')
  } finally {
    statusUpdatingId.value = null
  }
}

const handleQuickStatusChange = async (row: TaskItem, status: string) => {
  if (row.status === status) {
    return
  }
  await updateInlineWorkItem(row, { status })
}

const handleQuickPriorityChange = async (row: TaskItem, priority: string) => {
  if (row.priority === priority) {
    return
  }
  await updateInlineWorkItem(row, { priority })
}

const handleQuickWorkHoursChange = async (row: TaskItem, value: number | string | null | undefined) => {
  const lockedReason = getRowWorkHoursLockedReason(row)
  if (lockedReason) {
    ElMessage.warning(lockedReason)
    return
  }
  const normalizedValue = value == null || value === '' ? null : Number(value)
  if (normalizedValue !== null && (!Number.isFinite(normalizedValue) || normalizedValue > 15 || normalizedValue < 0)) {
    ElMessage.warning('工时必须在 0 到 15 小时之间')
    return
  }
  const formattedValue = normalizedValue == null ? null : Number(normalizedValue.toFixed(1))
  if (row.workHours === formattedValue) {
    return
  }
  await updateInlineWorkItem(row, { workHours: formattedValue })
}

const handleQuickAssigneeChange = async (row: TaskItem, assigneeUserId: number) => {
  const normalizedAssigneeUserId = assigneeUserId <= 0 ? null : assigneeUserId
  if (row.assigneeUserId === normalizedAssigneeUserId) {
    return
  }
  await updateInlineWorkItem(row, { assigneeUserId: normalizedAssigneeUserId })
}

watch(
  () => route.query.iterationId,
  async (value) => {
    const nextIterationId = Number(value)
    if (!value || Number.isNaN(nextIterationId) || nextIterationId <= 0) {
      return
    }
    if (selectedScope.type === 'iteration' && selectedScope.iterationId === nextIterationId) {
      return
    }
    if (!board.iterations.some((item) => item.id === nextIterationId)) {
      return
    }
    selectedScope.type = 'iteration'
    selectedScope.iterationId = nextIterationId
    workItemPagination.page = 1
    await Promise.all([loadWorkItems(), loadCurrentIterationProgress()])
  }
)

watch(
  () => route.query.openTaskId,
  async (value, previousValue) => {
    if (!value) {
      if (previousValue && workItemDialogVisible.value && !workItemDialogClosing.value) {
        workItemDialogVisible.value = false
      }
      return
    }
    const nextTaskId = Number(value)
    if (Number.isNaN(nextTaskId) || nextTaskId <= 0) {
      return
    }
    if (value === previousValue && workItemDialogVisible.value && currentWorkItemId.value === nextTaskId) {
      return
    }
    await openTaskFromQuery(nextTaskId)
  }
)

watch(
  () => workItemForm.assigneeUserId,
  () => {
    // 组合字段支持同面板切换角色，这里实时兜底一次，避免表单状态里残留重复成员。
    syncWorkItemAssignee()
  }
)

watch(
  () => workItemForm.workItemType,
  (workItemType, previousType) => {
    if (workItemType === '需求') {
      // 用户切换到需求类型时，自动带出固定模板，并清空关联需求关系。
      workItemForm.requirementTaskId = null
      workItemForm.workHours = null
      workItemWorkHoursInput.value = ''
      if (!workItemForm.requirementMarkdown.trim()) {
        workItemForm.requirementMarkdown = DEFAULT_REQUIREMENT_TEMPLATE
      }
      return
    }

    if (workItemType !== '任务') {
      workItemForm.workHours = null
    }

    if (previousType === '需求') {
      // 从需求切回普通工作项时，清理模板字段，避免无关数据残留。
      workItemForm.requirementMarkdown = ''
      workItemForm.prototypeUrl = ''
      legacyRequirementNeedsUpgrade.value = false
      legacyRequirementPreview.value = ''
    }

    if (workItemType !== '任务') {
      workItemForm.workHours = null
      workItemWorkHoursInput.value = ''
    }
  }
)

onMounted(async () => {
  if (Number.isNaN(projectId) || projectId <= 0) {
    ElMessage.error('项目参数不正确')
    goBack()
    return
  }
  try {
    await refreshBoardAndItems()
    await openTaskFromQuery()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载迭代管理数据失败')
  }
})
</script>

<style scoped>
.iteration-workspace {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background: var(--app-surface-base);
}

.workspace-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--app-surface-low);
  border-right: 1px solid var(--app-border);
}

.workspace-sidebar-brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 14px 18px;
}

.workspace-sidebar-brand-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.workspace-sidebar-brand-profile {
  flex: 0 0 auto;
}

.workspace-brand-mark {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: var(--app-primary-container);
  color: #fff;
}

.workspace-brand-copy h2 {
  margin: 0;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.1;
}

.workspace-brand-copy p {
  margin: 4px 0 0;
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-sidebar-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  padding: 0 12px;
  overflow: auto;
}

.workspace-iteration-card,
.workspace-sidebar-action,
.workspace-back-link,
.workspace-icon-button,
.workspace-filter-button,
.workspace-new-button,
.workspace-action-button,
.workspace-title-button {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.workspace-iteration-card {
  padding: 12px;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  transition: background-color 0.18s ease, transform 0.18s ease;
}

.workspace-iteration-card.active {
  background: var(--app-surface-card);
  box-shadow: inset 4px 0 0 var(--app-primary);
}

.workspace-iteration-card:hover {
  background: rgba(255, 255, 255, 0.62);
}

.workspace-iteration-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workspace-iteration-head-side {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.workspace-iteration-title {
  color: var(--app-text);
  font-size: 11px;
  font-weight: 800;
}

.workspace-iteration-action {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-muted);
}

.workspace-iteration-action:hover {
  background: rgba(255, 255, 255, 0.9);
  color: var(--app-primary);
}

.workspace-iteration-action.danger:hover {
  color: var(--app-danger);
}

.workspace-iteration-icon {
  color: var(--app-text-muted);
  font-size: 14px;
}

.workspace-iteration-date {
  margin-top: 6px;
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 700;
}

.workspace-iteration-progress {
  width: 100%;
  height: 4px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--app-surface-high);
  overflow: hidden;
}

.workspace-iteration-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--app-primary);
}

.workspace-sidebar-footer {
  padding: 14px;
}

.workspace-sidebar-action {
  width: 100%;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 4px;
  background: var(--app-surface-high);
  color: var(--app-text-soft);
  font-size: 10px;
  font-weight: 800;
}

.workspace-sidebar-action:hover {
  background: var(--app-surface-muted);
}

.workspace-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--app-surface-base);
}

.workspace-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 64px;
  padding: 0 24px;
  background: var(--app-surface-base);
  flex: 0 0 auto;
}

.workspace-topbar-main {
  display: flex;
  align-items: center;
  gap: 22px;
  min-width: 0;
}

.workspace-back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.workspace-back-link .el-icon {
  font-size: 15px;
}

.workspace-back-link:hover {
  color: var(--app-primary);
}

.workspace-search {
  position: relative;
  width: 260px;
  max-width: 100%;
  display: flex;
  align-items: center;
}

.workspace-search .el-icon {
  position: absolute;
  left: 12px;
  color: var(--app-text-muted);
  font-size: 14px;
}

.workspace-search input {
  width: 100%;
  border: 0;
  border-radius: 999px;
  background: var(--app-surface-muted);
  padding: 8px 14px 8px 34px;
  color: var(--app-text-soft);
  font-size: 12px;
  outline: none;
}

.workspace-topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
}

.header-profile-group {
  display: inline-flex;
  align-items: center;
  gap: 16px;
}

.header-notification-button {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-soft);
  position: relative;
}

.header-notification-button:hover {
  background: rgba(var(--app-outline-rgb), 0.12);
  color: var(--app-primary);
}

.header-notification-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--app-primary-container);
  box-shadow: 0 0 0 2px var(--app-surface-card);
}

.header-divider {
  width: 1px;
  height: 28px;
  background: var(--app-border);
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text);
}

.user-avatar {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--app-primary-container) 0%, var(--app-primary) 100%);
  color: #fff;
  font-weight: 800;
  overflow: hidden;
}

.user-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
}

.user-meta strong {
  max-width: 160px;
  overflow: hidden;
  color: var(--app-text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
}

.user-meta small {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 10px;
}

.workspace-icon-button {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-soft);
}

.workspace-icon-button:hover {
  background: rgba(var(--app-outline-rgb), 0.12);
  color: var(--app-primary);
}

.workspace-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 24px 0;
  flex: 0 0 auto;
}

.workspace-stat-card {
  min-height: 82px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--app-surface-card);
  box-shadow: var(--app-shadow-soft);
}

.workspace-stat-label {
  display: block;
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 8px;
}

.workspace-stat-value-row strong {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 30px;
  line-height: 1;
}

.workspace-stat-highlight {
  color: var(--app-primary);
  font-size: 9px;
  font-weight: 800;
}

.workspace-stat-track {
  width: 100%;
  height: 3px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--app-surface-muted);
  overflow: hidden;
}

.workspace-stat-fill {
  height: 100%;
  border-radius: inherit;
}

.workspace-stat-fill.primary {
  background: var(--app-primary);
}

.workspace-stat-fill.danger {
  background: var(--app-danger);
}

.workspace-stat-subtext {
  margin-top: 6px;
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 700;
}

.workspace-stat-dots {
  display: flex;
  gap: 3px;
  margin-top: 8px;
}

.workspace-stat-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.2);
}

.workspace-stat-dot.active {
  background: var(--app-primary);
}

.workspace-controls {
  padding: 10px 24px 16px;
  flex: 0 0 auto;
}

.workspace-list-toolbar .management-list-toolbar-main {
  width: fit-content;
  max-width: 100%;
  justify-self: start;
  flex: 0 1 auto;
}

.workspace-list-toolbar .management-list-search-shell {
  flex: 0 1 280px;
  width: 280px;
  max-width: min(280px, 100%);
}

.workspace-list-toolbar .management-list-toolbar-side {
  min-width: max-content;
}

.workspace-list-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: 8px;
  background: rgba(var(--app-outline-rgb), 0.1);
}

.workspace-list-tab-button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.workspace-list-tab-button.active {
  background: var(--app-surface-card);
  color: var(--app-primary);
  box-shadow: var(--app-shadow-soft);
}

.workspace-filter-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-filter-field label {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.workspace-table-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  margin: 0 24px 24px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
}

.workspace-table-scroll {
  flex: 1 1 auto;
  min-height: 360px;
  overflow: auto;
}

.workspace-table {
  width: 100%;
  min-width: 1280px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.workspace-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.workspace-table th {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(221, 193, 174, 0.18);
  background: rgba(243, 244, 245, 0.52);
  color: #94a3b8;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-align: left;
  text-transform: uppercase;
}

.workspace-table td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(221, 193, 174, 0.08);
  vertical-align: middle;
  font-size: 12px;
}

.workspace-col-code {
  width: 7%;
}

.workspace-col-main {
  width: 28%;
  min-width: 0;
}

.workspace-col-type {
  width: 8%;
}

.workspace-col-owner {
  width: 10%;
}

.workspace-col-priority {
  width: 7%;
}

.workspace-col-hours {
  width: 5%;
}

.workspace-col-status {
  width: 8%;
}

.workspace-col-plan {
  width: 11%;
}

.workspace-col-creator {
  width: 8%;
}

.workspace-col-actions {
  width: 8%;
}

.workspace-row:hover {
  background: #f3f4f5;
}

.workspace-table th.center,
.workspace-table td.center,
.workspace-col-priority,
.workspace-col-type {
  text-align: center;
}

.workspace-table th.right,
.workspace-table td.right {
  text-align: right;
}

.workspace-primary-cell,
.workspace-owner-line,
.workspace-row-actions,
.workspace-pagination-controls,
.workspace-page-size,
.workspace-page-nav {
  display: flex;
  align-items: center;
}

.workspace-primary-cell {
  width: 100%;
  min-width: 0;
}

.workspace-primary-copy {
  width: 100%;
  min-width: 0;
}

.workspace-primary-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.workspace-item-code {
  flex: 0 0 auto;
  color: #94a3b8;
  font-family: var(--app-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.workspace-item-code.standalone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(231, 232, 233, 0.88);
  color: #475569;
}

.workspace-item-link-button {
  border: none;
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.workspace-item-link-button:hover {
  background: rgba(15, 23, 42, 0.08);
  color: var(--app-primary);
}

.workspace-item-link-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(12, 108, 242, 0.2);
}

.workspace-title-button {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: none;
  background: transparent;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition: color 0.2s ease;
}

.workspace-title-button:hover {
  color: var(--app-primary);
}

.workspace-primary-meta {
  margin-top: 4px;
  overflow: hidden;
  color: #758393;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
}

.workspace-editable-display {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.workspace-editable-display.is-owner {
  justify-content: flex-start;
}

.workspace-editable-display:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.workspace-type-pill,
.workspace-status-pill,
.workspace-priority-pill,
.workspace-hours-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.workspace-type-pill.requirement {
  background: rgba(255, 220, 195, 0.82);
  color: #78471a;
}

.workspace-type-pill.task {
  background: rgba(199, 231, 255, 0.72);
  color: #004c6c;
}

.workspace-type-pill.defect {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.workspace-status-pill {
  text-transform: uppercase;
}

.workspace-status-pill.running {
  background: rgba(199, 231, 255, 0.72);
  color: #004c6c;
}

.workspace-status-pill.done {
  background: rgba(216, 240, 212, 0.82);
  color: #2f6f3e;
}

.workspace-status-pill.blocked {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.workspace-status-pill.pending {
  background: rgba(255, 220, 195, 0.86);
  color: #a35100;
}

.workspace-status-pill.draft {
  background: rgba(231, 232, 233, 0.88);
  color: #64748b;
}

.workspace-priority-pill.high {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.workspace-priority-pill.medium {
  background: rgba(255, 220, 195, 0.86);
  color: #a35100;
}

.workspace-priority-pill.low {
  background: rgba(231, 232, 233, 0.92);
  color: #64748b;
}

.workspace-hours-pill {
  background: rgba(231, 232, 233, 0.92);
  color: #475569;
}

.workspace-hours-pill.empty {
  color: #64748b;
}

.workspace-owner-line {
  gap: 8px;
  min-width: 0;
}

.workspace-owner-avatar {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #e7e8e9;
  color: #475569;
  font-size: 9px;
  font-weight: 800;
  flex: 0 0 auto;
}

.workspace-owner-name {
  overflow: hidden;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
}

.workspace-mobile-badge-group {
  align-self: flex-start;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.workspace-mobile-badge-group > * {
  flex: 0 0 auto;
  width: auto !important;
  max-width: 100%;
}

.workspace-mobile-badge-group :deep(.compact-select-trigger) {
  width: auto;
  justify-content: center;
}

.workspace-mobile-badge-group .workspace-editable-display,
.workspace-mobile-badge-group .workspace-status-pill,
.workspace-mobile-badge-group .workspace-priority-pill {
  width: auto;
}

.workspace-mobile-field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workspace-mobile-field-half {
  min-width: 0;
  height: 100%;
}

.workspace-mobile-field-half .mobile-entity-field-label {
  width: 40px;
  flex-basis: 40px;
}

.workspace-mobile-field-half .mobile-entity-field-content {
  justify-content: flex-start;
}

.workspace-mobile-user-field {
  align-items: center;
}

.workspace-mobile-user-field .mobile-entity-field-content {
  align-items: center;
}

.workspace-mobile-user-field :deep(.list-user-display) {
  width: auto;
  align-items: center;
}

.workspace-mobile-user-field :deep(.list-user-display-name),
.workspace-mobile-user-field :deep(.list-user-display-empty) {
  white-space: nowrap;
}

.workspace-collaborator-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.workspace-collaborator-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(231, 232, 233, 0.92);
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
}

.workspace-collaborator-chip.muted {
  background: rgba(255, 220, 195, 0.76);
  color: #8b5e34;
}

.workspace-link-button {
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  background: transparent;
  color: #00658f;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
}

.workspace-link-button:hover {
  color: #904d00;
}

.workspace-empty-text,
.workspace-updated-cell {
  color: #758393;
  font-size: 11px;
  font-weight: 600;
}

.workspace-plan-text,
.workspace-creator-name {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.workspace-row-actions {
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-action-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
}

.workspace-action-button:hover {
  background: rgba(255, 255, 255, 0.96);
  color: #904d00;
}

.workspace-action-button.ai:hover {
  color: #00658f;
}

.workspace-action-button.pass:hover,
.workspace-action-button.success:hover {
  color: #2f6f3e;
}

.workspace-action-button.danger:hover {
  color: #ba1a1a;
}

.workspace-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-top: 1px solid var(--app-border);
  background: rgba(var(--app-outline-rgb), 0.08);
  flex: 0 0 auto;
}

.workspace-footer-total {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.workspace-footer-total span {
  color: #64748b;
}

.workspace-pagination-controls {
  gap: 18px;
}

.workspace-page-size {
  gap: 8px;
}

.workspace-page-size span,
.workspace-page-text {
  color: var(--app-text-soft);
  font-size: 11px;
  font-weight: 700;
}

.workspace-page-nav {
  gap: 10px;
}

.workspace-page-button {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-soft);
}

.workspace-page-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.92);
}

.workspace-page-button:disabled {
  color: rgba(var(--app-outline-rgb), 0.36);
}

.workspace-empty-row {
  padding: 56px 16px !important;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.status-select,
.priority-select,
.assignee-select,
.work-hours-input {
  width: 100%;
}

.workspace-inline-number-shell {
  width: 100%;
  display: flex;
  align-items: center;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill) {
  width: auto;
  min-height: 22px;
  min-width: 0;
  padding: 0 8px 0 10px;
  border-radius: 999px;
  box-shadow: none !important;
  justify-content: center;
  gap: 4px;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill .compact-select-dot) {
  display: none;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill .compact-select-value) {
  justify-content: center;
  gap: 4px;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill .compact-select-arrow) {
  color: currentColor;
  opacity: 0.64;
  font-size: 10px;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill.selected-tone-primary) {
  background: rgba(199, 231, 255, 0.72);
  color: #004c6c;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill.selected-tone-success) {
  background: rgba(216, 240, 212, 0.82);
  color: #2f6f3e;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill.selected-tone-warning) {
  background: rgba(255, 220, 195, 0.86);
  color: #a35100;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill.selected-tone-danger) {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill.selected-tone-info) {
  background: rgba(231, 232, 233, 0.88);
  color: #64748b;
}

.status-select :deep(.compact-select-trigger.variant-inline-pill:hover),
.status-select :deep(.compact-select-trigger.variant-inline-pill.is-open) {
  transform: none;
  filter: saturate(1.02);
}

.status-select :deep(.compact-select-menu) {
  gap: 4px;
}

.status-select :deep(.compact-select-item) {
  padding: 10px 12px;
  border-radius: 12px;
}

.status-select :deep(.compact-select-item-main) {
  gap: 6px;
}

.status-select :deep(.compact-select-item-main span) {
  font-size: 11px;
  font-weight: 700;
}

.status-select :deep(.compact-select-item .compact-select-dot) {
  width: 6px;
  height: 6px;
}

.status-select :deep(.compact-select-check) {
  font-size: 11px;
}

:deep(.workspace-inline-number) {
  min-height: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(243, 244, 245, 0.92);
  box-shadow: inset 0 0 0 1px var(--app-border) !important;
}

:deep(.workspace-inline-number .el-input),
:deep(.workspace-inline-number .el-input__wrapper) {
  min-height: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  box-shadow: none !important;
  background: transparent;
  padding-left: 8px;
  padding-right: 8px;
}

:deep(.workspace-inline-number .el-input__inner) {
  height: 22px;
  padding: 0;
  align-self: center;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

:deep(.iteration-filter-popper.el-popper) {
  border: 0 !important;
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: var(--app-shadow-floating) !important;
}

:deep(.iteration-filter-popper .el-popper__arrow) {
  display: none;
}

:deep(.workspace-page-size .el-select__wrapper),
:deep(.workspace-filter-panel .el-select__wrapper),
:deep(.workspace-filter-panel .el-input__wrapper),
:deep(.work-hours-input) {
  min-height: 30px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 1px var(--app-border-strong) !important;
  padding-left: 8px;
  padding-right: 8px;
}

.burndown-dialog-body {
  min-height: 280px;
}

:deep(.work-item-drawer) {
  width: min(1160px, 60vw) !important;
  max-width: min(1160px, 100vw);
  border-left: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: -24px 0 60px rgba(25, 28, 29, 0.12);
}

:deep(.work-item-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 0;
  border-bottom: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.9);
}

:deep(.work-item-drawer .el-drawer__body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  background: rgba(248, 249, 250, 0.96);
}

:deep(.work-item-drawer .el-drawer__footer) {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.92);
}

.work-item-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 22px 10px;
}

.work-item-dialog-header-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.work-item-dialog-close {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-muted);
  font-size: 24px;
  line-height: 1;
}

.work-item-dialog-close:hover {
  background: rgba(var(--app-outline-rgb), 0.1);
  color: var(--app-text-soft);
}

.work-item-dialog-divider {
  width: 1px;
  height: 24px;
  background: var(--app-border);
}

.work-item-dialog-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.work-item-dialog-heading-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(var(--app-primary-container-rgb), 0.12);
  color: var(--app-primary);
  flex: 0 0 auto;
}

.work-item-dialog-heading-copy {
  min-width: 0;
}

.work-item-dialog-eyebrow {
  color: var(--app-text-soft);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.work-item-dialog-heading-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  min-width: 0;
}

.work-item-dialog-heading-text {
  overflow: hidden;
  color: var(--app-text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 800;
}

.work-item-dialog-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.work-item-dialog-status-pill.running {
  background: var(--app-info-soft);
  color: var(--app-info);
}

.work-item-dialog-status-pill.done {
  background: var(--app-success-soft);
  color: var(--app-success);
}

.work-item-dialog-status-pill.blocked {
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.work-item-dialog-status-pill.backlog {
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
}

.work-item-dialog-header-side {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.work-item-priority-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.work-item-priority-badge.high {
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
}

.work-item-priority-badge.medium {
  background: var(--app-warning-soft);
  color: var(--app-warning);
}

.work-item-priority-badge.low {
  background: var(--app-surface-muted);
  color: var(--app-text-soft);
}

.work-item-dialog-updated {
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.work-item-editor-form {
  height: 100%;
}

.work-item-editor-shell {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 206px);
}

.work-item-editor-top {
  padding: 10px 18px 14px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-card);
}

.work-item-editor-title-row {
  margin-bottom: 14px;
}

.work-item-editor-label {
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.work-item-title-form-item {
  margin: 8px 0 0;
}

.work-item-title-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.work-item-id-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface-base);
  color: var(--app-text-muted);
  font-family: var(--app-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.work-item-editor-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 14px;
}

.work-item-field-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.work-item-field-members :deep(.work-item-member-reference) {
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--app-surface-base);
  box-shadow: inset 0 0 0 1px var(--app-border) !important;
}

.work-item-field-members :deep(.work-item-member-reference:hover),
.work-item-field-members :deep(.work-item-member-reference.is-open) {
  background: var(--app-surface-base);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-container-rgb), 0.42) !important;
}

.work-item-field-members :deep(.work-item-member-inline-name),
.work-item-field-members :deep(.work-item-member-inline-placeholder),
.work-item-field-members :deep(.work-item-member-inline-separator),
.work-item-field-members :deep(.work-item-member-inline-more),
.work-item-field-members :deep(.work-item-member-arrow) {
  font-size: 12px;
}

.work-item-field-members :deep(.work-item-member-inline-name) {
  font-weight: 600;
}

.work-item-hours-input :deep(.el-input__inner) {
  color: var(--app-text);
  text-align: center;
}

.work-item-hours-input :deep(.el-input__wrapper) {
  justify-content: center;
}

.work-item-status-select :deep(.compact-select-trigger) {
  min-height: 34px;
  border-radius: 8px;
  background: var(--app-surface-base);
  box-shadow: inset 0 0 0 1px var(--app-border);
}

.work-item-status-select :deep(.compact-select-trigger:hover),
.work-item-status-select :deep(.compact-select-trigger.is-open) {
  background: rgba(var(--app-primary-container-rgb), 0.1);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.18);
  transform: none;
}

.work-item-priority-select {
  width: 96px;
}

.work-item-priority-select :deep(.compact-select-trigger) {
  min-height: 34px;
  border-radius: 8px;
  padding: 0 10px;
  background: var(--app-surface-base);
  box-shadow: inset 0 0 0 1px var(--app-border);
}

.work-item-priority-select :deep(.compact-select-trigger:hover),
.work-item-priority-select :deep(.compact-select-trigger.is-open) {
  transform: none;
}

.work-item-priority-select :deep(.selected-tone-danger) {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.work-item-priority-select :deep(.selected-tone-warning) {
  background: rgba(255, 220, 195, 0.86);
  color: #a35100;
}

.work-item-priority-select :deep(.selected-tone-info) {
  background: rgba(231, 232, 233, 0.92);
  color: #64748b;
}

.work-item-form-item-plain {
  margin: 0;
}

.work-item-form-item-plain :deep(.el-form-item__label) {
  display: none !important;
}

.work-item-form-item-plain :deep(.el-form-item__content) {
  display: block;
  min-width: 0;
}

.work-item-static-field {
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-base);
  color: var(--app-text);
  font-size: 12px;
  font-weight: 700;
}

.work-item-editor-shell :deep(.el-input__inner),
.work-item-editor-shell :deep(.el-select__selected-item),
.work-item-editor-shell :deep(.el-date-editor .el-range-input),
.work-item-editor-shell :deep(.el-date-editor .el-input__inner),
.work-item-editor-shell :deep(.el-input-number .el-input__inner) {
  color: var(--app-text) !important;
}

.work-item-editor-shell :deep(.el-select__wrapper:not(.is-placeholder) .el-select__selected-item),
.work-item-editor-shell :deep(.el-select__wrapper:not(.is-placeholder) .el-select__placeholder) {
  color: var(--app-text) !important;
}

.work-item-editor-shell :deep(.el-input__inner::placeholder),
.work-item-editor-shell :deep(.el-select__wrapper.is-placeholder .el-select__placeholder),
.work-item-editor-shell :deep(.el-date-editor .el-range-input::placeholder),
.work-item-editor-shell :deep(.el-date-editor .el-input__inner::placeholder),
.work-item-editor-shell :deep(.el-input-number .el-input__inner::placeholder) {
  color: var(--app-text-muted) !important;
}

.work-item-inline-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 8px;
}

.work-item-inline-pair.single {
  grid-template-columns: minmax(0, 1fr);
}

.work-item-inline-pair.schedule {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.work-item-inline-tip {
  margin-top: 6px;
  color: var(--app-danger);
  font-size: 11px;
}

.work-item-editor-shell :deep(.el-input__wrapper),
.work-item-editor-shell :deep(.el-select__wrapper),
.work-item-editor-shell :deep(.el-input-number),
.work-item-editor-shell :deep(.el-textarea__inner) {
  min-height: 34px;
  padding-left: 10px;
  padding-right: 10px;
  border-radius: 8px;
  background: var(--app-surface-base);
  box-shadow: inset 0 0 0 1px var(--app-border) !important;
}

.work-item-editor-shell :deep(.el-date-editor.el-input__wrapper),
.work-item-editor-shell :deep(.el-date-editor.el-range-editor.el-input__wrapper) {
  width: 100%;
}

.work-item-editor-shell :deep(.el-input__wrapper:hover),
.work-item-editor-shell :deep(.el-select__wrapper:hover),
.work-item-editor-shell :deep(.el-input-number:hover),
.work-item-editor-shell :deep(.el-textarea__inner:hover) {
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-container-rgb), 0.34) !important;
}

.work-item-editor-shell :deep(.el-input__wrapper.is-focus),
.work-item-editor-shell :deep(.el-select__wrapper.is-focused),
.work-item-editor-shell :deep(.el-input-number:focus-within),
.work-item-editor-shell :deep(.el-textarea__inner:focus) {
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-container-rgb), 0.58) !important;
}

.work-item-title-form-item :deep(.el-input__wrapper) {
  min-height: auto;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none !important;
}

.work-item-title-form-item :deep(.el-input__inner) {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 28px;
  font-weight: 800;
}

.work-item-title-form-item :deep(.el-input__inner::placeholder) {
  color: var(--app-text-muted);
  font-weight: 800;
  opacity: 1;
}

.work-item-title-form-item :deep(.el-form-item__error) {
  margin-top: 6px;
  padding-left: 66px;
}

.work-item-editor-description {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  background: var(--app-surface-card);
  border-bottom: 1px solid var(--app-border);
}

.work-item-description-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 10px 18px 18px;
}

.work-item-description-form-item {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  margin: 0;
}

.work-item-description-form-item :deep(.el-form-item__content) {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.work-item-description-form-item :deep(.markdown-editor-wrapper) {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.work-item-description-form-item :deep(.md-editor) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px var(--app-border);
}

.work-item-description-form-item :deep(.md-editor-input-wrapper),
.work-item-description-form-item :deep(.md-editor-preview-wrapper) {
  flex: 1 1 50%;
  width: auto;
  min-height: 0;
  min-width: 0;
}

.work-item-description-form-item :deep(.md-editor-content-wrapper) {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.work-item-description-form-item :deep(.md-editor-preview-wrapper) {
  background: rgba(255, 255, 255, 0.82);
}

.work-item-description-form-item :deep(.cm-editor),
.work-item-description-form-item :deep(.cm-scroller) {
  height: 100%;
  min-height: 0;
}

.work-item-description-form-item :deep(.md-editor-toolbar-wrapper) {
  order: 0;
  flex: 0 0 auto;
}

.work-item-description-form-item :deep(.md-editor-content) {
  order: 1;
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}

.work-item-description-form-item :deep(.md-editor-toolbar) {
  padding: 10px 12px;
  background: rgba(var(--app-outline-rgb), 0.06);
}

.description-form-item {
  margin-top: 0;
  margin-bottom: 0;
}

.legacy-requirement-alert {
  margin-bottom: 12px;
}

.legacy-requirement-preview {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(var(--app-outline-rgb), 0.08);
}

.legacy-requirement-preview-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.legacy-requirement-preview-body {
  line-height: 1.7;
  color: var(--el-text-color-regular);
}

.legacy-requirement-preview-body :deep(p),
.legacy-requirement-preview-body :deep(ul),
.legacy-requirement-preview-body :deep(ol) {
  margin: 0;
}

.legacy-requirement-preview-body :deep(p + p),
.legacy-requirement-preview-body :deep(p + ul),
.legacy-requirement-preview-body :deep(ul + p),
.legacy-requirement-preview-body :deep(ol + p) {
  margin-top: 8px;
}

.work-item-dialog-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
}

.work-item-dialog-footer .el-button {
  min-height: 46px;
  border-radius: 14px;
}

.work-item-dialog-footer .el-button:first-child {
  flex: 1 1 0;
}

.work-item-dialog-footer .el-button:last-child {
  flex: 1.4 1 0;
}

.comment-task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.comment-list {
  min-height: 180px;
  max-height: 420px;
  overflow: auto;
  padding-right: 4px;
}

.comment-item {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(243, 244, 245, 0.9);
}

.comment-item + .comment-item {
  margin-top: 12px;
}

.comment-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.comment-item-content {
  line-height: 1.7;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-editor {
  margin-top: 16px;
}

@media (max-width: 1280px) {
  .iteration-workspace {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .workspace-sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(137, 115, 98, 0.08);
  }

  .workspace-sidebar-list {
    max-height: none;
  }

  :deep(.work-item-drawer) {
    width: min(960px, 72vw) !important;
  }

  .work-item-editor-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .workspace-main {
    overflow: visible;
  }

  .workspace-topbar,
  .workspace-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-sidebar-brand {
    padding: 16px 16px 12px;
  }

  .workspace-sidebar-brand-profile .header-profile-group {
    gap: 8px;
  }

  .workspace-sidebar-brand-profile .user-meta {
    display: none;
  }

  .workspace-sidebar-brand-profile .header-divider {
    display: none;
  }

  .workspace-sidebar-list {
    flex-direction: row;
    gap: 12px;
    padding: 0 16px 10px;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
  }

  .workspace-iteration-card {
    min-width: 180px;
    flex: 0 0 180px;
    scroll-snap-align: start;
  }

  .workspace-sidebar-footer {
    padding: 0 16px 14px;
  }

  .workspace-topbar {
    padding: 14px 16px 0;
  }

  .workspace-topbar-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
  }

  .workspace-search {
    width: 100%;
  }

  .workspace-topbar-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .workspace-stats {
    grid-template-columns: 1fr;
    padding: 12px 16px 0;
  }

  .workspace-controls {
    padding: 12px 16px 10px;
  }

  .workspace-list-switcher {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    flex-wrap: nowrap;
    justify-content: flex-start;
    -webkit-overflow-scrolling: touch;
  }

  .workspace-list-tab-button {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .workspace-actions {
    justify-content: flex-start;
  }

  .workspace-table-shell {
    margin: 0 16px 16px;
  }

  .workspace-pagination,
  .workspace-pagination-controls,
  .workspace-tabs {
    flex-wrap: wrap;
  }

  .workspace-pagination-controls {
    width: 100%;
    justify-content: space-between;
  }

  .header-profile-group {
    gap: 10px;
  }

  :deep(.work-item-drawer) {
    width: 100vw !important;
    max-width: 100vw;
  }

  .work-item-dialog-header,
  .work-item-dialog-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .work-item-dialog-header-side {
    justify-content: space-between;
  }

  .work-item-editor-shell {
    min-height: calc(100vh - 188px);
  }

  .work-item-editor-top,
  .work-item-description-body {
    padding-left: 16px;
    padding-right: 16px;
  }

  .work-item-title-input-row,
  .work-item-editor-grid {
    grid-template-columns: 1fr;
    display: grid;
  }

  .work-item-title-input-row {
    gap: 8px;
  }

  .work-item-inline-pair {
    grid-template-columns: 1fr;
  }
}
</style>
