<template>
  <div class="task-atelier-page">
    <section class="task-toolbar">
      <div class="task-toolbar-main">
        <div class="task-search-shell">
          <el-icon class="task-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="task-search-input"
            type="text"
            placeholder="筛选任务、说明、负责人或项目..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="task-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="taskFilterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="task-filter-popper">
          <template #reference>
            <button class="task-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="task-filter-panel">
            <div class="task-filter-field">
              <label>所属项目</label>
              <el-select v-model="filters.projectId" clearable placeholder="所属项目" style="width: 100%" :teleported="false" @change="handleFilterProjectChange">
                <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
              </el-select>
            </div>
            <div class="task-filter-field">
              <label>优先级</label>
              <el-select v-model="filters.priority" clearable placeholder="优先级" style="width: 100%" :teleported="false">
                <el-option label="高" value="高" />
                <el-option label="中" value="中" />
                <el-option label="低" value="低" />
              </el-select>
            </div>
            <div class="task-filter-field">
              <label>状态</label>
              <el-select v-model="filters.status" clearable placeholder="状态" style="width: 100%" :teleported="false">
                <el-option v-for="item in taskFilterStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="task-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="task-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>

      <div class="task-toolbar-side">
        <button v-if="canManageTasks" class="task-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建任务</span>
        </button>
      </div>
    </section>

    <section class="task-table-shell">
      <div class="task-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
        <table class="task-table mobile-card-table">
          <thead>
            <tr>
              <th class="task-col-main">任务</th>
              <th class="center task-col-type">类型</th>
              <th class="task-col-project">所属项目</th>
              <th class="task-col-requirement">关联需求</th>
              <th class="task-col-owner">负责人</th>
              <th class="task-col-collaborators">协作人</th>
              <th class="center task-col-priority">优先级</th>
              <th class="task-col-hours">工时</th>
              <th class="task-col-status">状态</th>
              <th class="task-col-updated">更新时间</th>
              <th class="right task-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in taskList" :key="row.id" class="task-row">
              <td class="task-col-main" data-label="任务">
                <button class="task-title-button" type="button" @click="openTaskDetail(row)">
                  <div class="task-primary-cell">
                    <div class="task-primary-icon">
                      <el-icon><Tickets /></el-icon>
                    </div>
                    <div class="task-primary-copy">
                      <div class="task-primary-title">{{ row.name }}</div>
                      <div class="task-primary-meta">{{ row.description || '暂无说明' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="center task-col-type" data-label="类型">
                <span class="task-type-pill" :class="taskTypeTone(row.workItemType)">{{ row.workItemType }}</span>
              </td>
              <td class="task-project-cell task-col-project" data-label="所属项目">
                <button v-if="row.projectName" class="task-link-button" type="button" @click="openTaskProject(row.projectId)">
                  {{ row.projectName }}
                </button>
                <span v-else class="task-empty-text">-</span>
              </td>
              <td class="task-col-requirement" data-label="关联需求">
                <button
                  v-if="row.requirementTaskId && row.requirementTaskName"
                  class="task-link-button"
                  type="button"
                  @click="openRequirementTask(row)"
                >
                  {{ row.requirementTaskName }}
                </button>
                <span v-else class="task-empty-text">-</span>
              </td>
              <td class="task-col-owner" data-label="负责人">
                <ListUserDisplay :user="buildTaskAssigneeDisplayItem(row)" empty-text="未分配" size="md" />
              </td>
              <td class="task-col-collaborators" data-label="协作人">
                <ListUserGroupDisplay :users="buildTaskCollaboratorDisplayItems(row)" empty-text="-" size="md" />
              </td>
              <td class="center task-col-priority" data-label="优先级">
                <span class="task-priority-pill" :class="taskPriorityTone(row.priority)">{{ row.priority || '-' }}</span>
              </td>
              <td class="task-col-hours" data-label="工时">
                <span class="task-hours-pill" :class="{ empty: row.workHours == null }">{{ formatTaskWorkHours(row.workHours) }}</span>
              </td>
              <td class="task-col-status" data-label="状态">
                <span class="task-status-pill" :class="taskStatusTone(row)">{{ formatTaskStatusLabel(row) }}</span>
              </td>
              <td class="task-updated-cell task-col-updated" data-label="更新时间">{{ row.updatedAt ? row.updatedAt.replace('T', ' ').slice(0, 16) : '-' }}</td>
              <td class="right task-col-actions" data-label="操作">
                <div class="task-row-actions">
                  <button v-if="canManageTasks" class="task-action-button" type="button" title="运行智能体" @click="openRunDialog(row)">
                    <el-icon><VideoPlay /></el-icon>
                  </button>
                  <button v-if="canManageTasks" class="task-action-button" type="button" title="编辑任务" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button
                    v-if="canManageTasks && row.canDelete"
                    class="task-action-button danger"
                    type="button"
                    title="删除任务"
                    @click="handleDelete(row.id)"
                  >
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </template>
        <template v-else>
          <div v-if="taskList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in taskList" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openTaskDetail(row)">
                    <span class="mobile-entity-icon">
                      <el-icon><Tickets /></el-icon>
                    </span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.name }}</span>
                      <span class="mobile-entity-description">{{ row.description || '暂无说明' }}</span>
                    </span>
                  </button>
                  <div class="mobile-entity-badge-group">
                    <span class="task-status-pill" :class="taskStatusTone(row)">{{ formatTaskStatusLabel(row) }}</span>
                    <span class="task-priority-pill" :class="taskPriorityTone(row.priority)">{{ row.priority || '-' }}</span>
                  </div>
                </header>

                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">类型</span>
                    <div class="mobile-entity-field-content">
                      <span class="task-type-pill" :class="taskTypeTone(row.workItemType)">{{ row.workItemType }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">项目</span>
                    <div class="mobile-entity-field-content">
                      <button v-if="row.projectName" class="task-link-button" type="button" @click="openTaskProject(row.projectId)">
                        {{ row.projectName }}
                      </button>
                      <span v-else class="mobile-entity-empty-text">-</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">需求</span>
                    <div class="mobile-entity-field-content">
                      <button
                        v-if="row.requirementTaskId && row.requirementTaskName"
                        class="task-link-button"
                        type="button"
                        @click="openRequirementTask(row)"
                      >
                        {{ row.requirementTaskName }}
                      </button>
                      <span v-else class="mobile-entity-empty-text">-</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">负责人</span>
                    <div class="mobile-entity-field-content">
                      <ListUserDisplay :user="buildTaskAssigneeDisplayItem(row)" empty-text="未分配" size="md" />
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">协作人</span>
                    <div class="mobile-entity-field-content">
                      <ListUserGroupDisplay :users="buildTaskCollaboratorDisplayItems(row)" empty-text="-" size="md" />
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">工时</span>
                    <div class="mobile-entity-field-content">
                      <span class="task-hours-pill" :class="{ empty: row.workHours == null }">{{ formatTaskWorkHours(row.workHours) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">更新</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.updatedAt ? row.updatedAt.replace('T', ' ').slice(0, 16) : '-' }}</span>
                    </div>
                  </div>
                </div>

                <footer class="mobile-entity-actions">
                  <button v-if="canManageTasks" class="mobile-entity-action-button info" type="button" @click="openRunDialog(row)">
                    <el-icon><VideoPlay /></el-icon>
                    <span>运行智能体</span>
                  </button>
                  <button v-if="canManageTasks" class="mobile-entity-action-button" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button
                    v-if="canManageTasks && row.canDelete"
                    class="mobile-entity-action-button danger"
                    type="button"
                    @click="handleDelete(row.id)"
                  >
                    <el-icon><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
          <div v-else class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无任务" />
          </div>
        </template>
      </div>

      <div class="task-table-footer">
        <div class="task-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="task-footer-controls">
          <div class="task-page-size">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="5" label="5" />
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="task-page-nav">
            <button class="task-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="task-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="task-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

  <el-drawer
    v-model="detailDrawerVisible"
    class="task-detail-drawer"
    :size="isMobileViewport ? '100%' : 'min(50vw, calc(100vw - 48px))'"
    destroy-on-close
  >
    <template #header>
      <div class="task-detail-header" v-if="detailTask">
        <button
          v-if="detailNavigationStack.length"
          class="task-detail-back-button"
          type="button"
          title="返回上一工作项"
          @click="backToPreviousDetail"
        >
          <el-icon><ArrowLeft /></el-icon>
          <span>返回</span>
        </button>
        <div class="task-detail-heading">
          <div class="task-detail-title">{{ detailTask.name }}</div>
          <div class="task-detail-subtitle">{{ detailTask.workItemCode || detailTask.projectName }}</div>
        </div>
        <span class="task-type-pill" :class="taskTypeTone(detailTask.workItemType)">{{ detailTask.workItemType }}</span>
      </div>
    </template>
    <div v-loading="detailLoading" class="task-detail-body" v-if="detailTask">
      <el-tabs v-model="detailActiveTab" class="task-detail-tabs">
        <el-tab-pane name="detail">
          <template #label>
            <span class="task-detail-tab-label">详情</span>
          </template>
          <div class="task-detail-grid">
            <div class="task-detail-field">
              <span>状态</span>
              <strong>{{ formatTaskStatusLabel(detailTask) }}</strong>
            </div>
            <div class="task-detail-field">
              <span>优先级</span>
              <strong>{{ detailTask.priority || '-' }}</strong>
            </div>
            <div class="task-detail-field">
              <span>负责人</span>
              <strong>{{ detailTask.assignee || '未分配' }}</strong>
            </div>
            <div class="task-detail-field">
              <span>迭代</span>
              <strong>{{ detailTask.iterationName || '未规划' }}</strong>
            </div>
            <div class="task-detail-field">
              <span>项目</span>
              <strong>{{ detailTask.projectName || '-' }}</strong>
            </div>
            <div class="task-detail-field">
              <span>更新时间</span>
              <strong>{{ formatDateTime(detailTask.updatedAt) }}</strong>
            </div>
          </div>
          <section class="task-detail-section">
            <div class="task-detail-section-title">说明</div>
            <div v-if="detailDescriptionHtml" class="task-detail-markdown" v-html="detailDescriptionHtml"></div>
            <el-empty v-else description="暂无说明" />
          </section>
        </el-tab-pane>
        <el-tab-pane name="children">
          <template #label>
            <span class="task-detail-tab-label">子工作项<span v-if="detailLinks?.children.length" class="task-tab-count">{{ detailLinks.children.length }}</span></span>
          </template>
          <TaskLinkSelector
            v-if="canManageTasks"
            v-model="workItemLinkTargetId"
            :options="filteredWorkItemOptions"
            :loading="workItemOptionLoading"
            placeholder="搜索并选择子工作项"
            @search="loadWorkItemOptions"
            @submit="handleAddChild"
          />
          <TaskLinkList :items="detailLinks?.children || []" empty-text="暂无子工作项" :can-remove="canManageTasks" @remove="handleRemoveChild" @open="openLinkedTaskDetail" />
          <section v-if="detailLinks?.parentWorkItems.length" class="task-detail-section compact">
            <div class="task-detail-section-title">父工作项</div>
            <TaskLinkList :items="detailLinks.parentWorkItems" empty-text="暂无父工作项" :can-remove="false" @open="openLinkedTaskDetail" />
          </section>
        </el-tab-pane>
        <el-tab-pane name="related">
          <template #label>
            <span class="task-detail-tab-label">关联项<span v-if="detailLinks?.relatedWorkItems.length" class="task-tab-count">{{ detailLinks.relatedWorkItems.length }}</span></span>
          </template>
          <TaskLinkSelector
            v-if="canManageTasks"
            v-model="workItemLinkTargetId"
            :options="filteredWorkItemOptions"
            :loading="workItemOptionLoading"
            placeholder="搜索并选择关联工作项"
            @search="loadWorkItemOptions"
            @submit="handleAddRelatedWorkItem"
          />
          <TaskLinkList :items="detailLinks?.relatedWorkItems || []" empty-text="暂无关联工作项" :can-remove="canManageTasks" @remove="handleRemoveRelatedWorkItem" @open="openLinkedTaskDetail" />
        </el-tab-pane>
        <el-tab-pane name="testCases">
          <template #label>
            <span class="task-detail-tab-label">测试用例<span v-if="detailLinks?.testCases.length" class="task-tab-count">{{ detailLinks.testCases.length }}</span></span>
          </template>
          <TaskTestCaseSelector
            v-if="canManageTasks"
            v-model="testCaseLinkTargetId"
            :options="testCaseOptions"
            :loading="testCaseOptionLoading"
            @search="loadTestCaseOptions"
            @submit="handleAddTestCase"
          />
          <div v-if="detailLinks?.testCases.length" class="task-link-list">
            <article v-for="item in detailLinks.testCases" :key="item.id" class="task-link-card">
              <div class="task-link-card-main">
                <strong>{{ item.title }}</strong>
                <span>{{ item.testPlanName }} · {{ item.moduleName || '未分组' }} · {{ item.priority || '-' }}</span>
              </div>
              <button v-if="canManageTasks" class="task-link-remove" type="button" @click="handleRemoveTestCase(item.id)">
                <el-icon><Delete /></el-icon>
              </button>
            </article>
          </div>
          <el-empty v-else description="暂无关联测试用例" />
        </el-tab-pane>
        <el-tab-pane name="attachments">
          <template #label>
            <span class="task-detail-tab-label">附件<span v-if="detailLinks?.attachments.length" class="task-tab-count">{{ detailLinks.attachments.length }}</span></span>
          </template>
          <div v-if="canManageTasks" class="task-attachment-upload">
            <el-upload :auto-upload="false" :show-file-list="false" :on-change="handleUploadAttachment">
              <el-button type="primary" :loading="attachmentUploading">上传附件</el-button>
            </el-upload>
          </div>
          <div v-if="detailLinks?.attachments.length" class="task-link-list">
            <article v-for="item in detailLinks.attachments" :key="item.id" class="task-link-card">
              <div class="task-link-card-main">
                <strong>{{ item.fileName }}</strong>
                <span>{{ formatFileSize(item.fileSize) }} · {{ item.uploaderName || '未知用户' }} · {{ item.createdAt || '-' }}</span>
              </div>
              <div class="task-link-actions">
                <button class="task-link-remove" type="button" @click="handleDownloadAttachment(item.id)">
                  下载
                </button>
                <button v-if="canManageTasks" class="task-link-remove danger" type="button" @click="handleDeleteAttachment(item.id)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </article>
          </div>
          <el-empty v-else description="暂无附件" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-drawer>

  <el-dialog v-model="dialogVisible" :title="taskDialogTitle" width="980px" class="work-item-dialog platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="taskDialogTitle" :subtitle="taskDialogSubtitle" :icon="Tickets" />
    </template>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="work-item-form platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">基础信息</div>
          <div class="platform-form-section-subtitle">填写任务标题、归属、负责人和执行属性。</div>
        </div>
        <el-form-item label="标题" prop="name" class="grid-span-2">
          <el-input v-model="form.name" placeholder="请输入任务标题" size="large" />
        </el-form-item>

        <div class="work-item-grid">
        <el-form-item label="负责人" class="compact-form-item">
          <el-select v-model="form.assigneeUserId" clearable filterable placeholder="请选择负责人" style="width: 100%">
            <el-option v-for="item in projectParticipantUsers" :key="item.id" :label="buildUserLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="协作人" class="compact-form-item">
          <el-select v-model="form.collaboratorUserIds" multiple filterable collapse-tags placeholder="请选择协作人" style="width: 100%">
            <el-option v-for="item in collaboratorSelectableUsers" :key="item.id" :label="buildUserLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属项目" prop="projectId" class="compact-form-item">
          <el-select v-model="form.projectId" placeholder="请选择项目" style="width: 100%" @change="handleFormProjectChange">
            <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.workItemType !== '需求'" label="关联需求" class="compact-form-item">
          <el-select v-model="form.requirementTaskId" clearable filterable placeholder="可选，关联一个需求" style="width: 100%">
            <el-option v-for="item in requirementOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="所属模块" class="compact-form-item">
          <el-input v-model="form.moduleName" placeholder="为空时自动归档到未分类" />
        </el-form-item>
        <el-form-item label="优先级" prop="priority" class="compact-form-item">
          <el-select v-model="form.priority" placeholder="请选择优先级" style="width: 100%">
            <el-option label="高" value="高" />
            <el-option label="中" value="中" />
            <el-option label="低" value="低" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.workItemType === '任务'" label="工时" class="compact-form-item">
          <el-tooltip :content="taskFormWorkHoursLockedReason" :disabled="!taskFormWorkHoursLockedReason">
            <el-input-number
              v-model="form.workHours"
              :min="0"
              :max="15"
              :step="0.5"
              :precision="1"
              controls-position="right"
              style="width: 100%"
              :disabled="Boolean(taskFormWorkHoursLockedReason)"
            />
          </el-tooltip>
          <div v-if="taskFormWorkHoursLockedReason" class="form-tip">{{ taskFormWorkHoursLockedReason }}</div>
        </el-form-item>
        <el-form-item v-if="form.workItemType === '任务'" label="任务类型" class="compact-form-item">
          <el-select v-model="form.taskType" style="width: 100%">
            <el-option v-for="item in TASK_TYPE_OPTIONS" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status" class="compact-form-item">
          <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
            <el-option v-for="item in taskFormStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.workItemType === '需求'" label="原型链接" class="compact-form-item">
          <el-input v-model="form.prototypeUrl" placeholder="请输入原型链接（选填）" />
        </el-form-item>
        </div>
      </section>

      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">详细说明</div>
          <div class="platform-form-section-subtitle">支持 Markdown，用于补充背景、目标和执行要求。</div>
        </div>
        <div v-if="isEditing && currentRequirementTask?.workItemType === '需求'" class="task-prd-actions">
          <span class="task-prd-status">
            {{ currentRequirementTask.prdStatus === 'READY' ? 'PRD 已就绪' : currentRequirementTask.prdStatusMessage || '尚未初始化 PRD' }}
          </span>
          <div class="task-prd-action-buttons">
            <el-button v-if="canManageTasks" plain @click="handleInitializeCurrentTaskPrd">
              {{ currentRequirementTask.prdWikiPageId ? '重试初始化 PRD' : '初始化 PRD' }}
            </el-button>
            <el-button v-if="currentRequirementTask.prdWikiSpaceId && currentRequirementTask.prdWikiPageId" plain @click="openTaskPrd(currentRequirementTask)">
              打开 PRD
            </el-button>
            <el-button v-if="currentRequirementTask.prdWikiSpaceId && currentRequirementTask.prdWikiPageId" type="primary" plain @click="openRequirementAiDialog(currentRequirementTask)">
              AI 完善 PRD
            </el-button>
          </div>
        </div>
        <div v-else-if="isEditing && currentRequirementTask && canOpenRequirementAiDialog(currentRequirementTask)" class="task-prd-actions">
          <span class="task-prd-status">测试任务可使用 AI 生成测试用例</span>
          <div class="task-prd-action-buttons">
            <el-button type="primary" plain @click="openRequirementAiDialog(currentRequirementTask)">
              AI 生成测试用例
            </el-button>
          </div>
        </div>
        <el-form-item v-if="form.workItemType === '需求'" class="grid-span-2 description-form-item">
          <MarkdownEditor
            v-model="form.requirementMarkdown"
            :height="380"
            :upload-image="handleTaskMarkdownImageUpload"
            placeholder="请填写需求文档，包含用户故事、需求描述和验收标准"
          />
        </el-form-item>
        <el-form-item v-else label="详细说明" prop="description" class="grid-span-2 description-form-item">
          <MarkdownEditor v-model="form.description" :height="380" :upload-image="handleTaskMarkdownImageUpload" placeholder="请填写任务详细说明，支持 Markdown 格式" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="runDialogVisible" title="运行任务智能体" width="880px" destroy-on-close>
    <template v-if="currentRunTask">
      <el-descriptions :column="2" border class="run-meta">
        <el-descriptions-item label="任务">{{ currentRunTask.name }}</el-descriptions-item>
        <el-descriptions-item label="项目">{{ currentRunTask.projectName }}</el-descriptions-item>
        <el-descriptions-item label="执行智能体">{{ currentRunTask.agentName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ currentRunTask.status }}</el-descriptions-item>
      </el-descriptions>

      <div class="run-section">
        <div class="run-section-title">运行输入</div>
        <el-input v-model="runInput" type="textarea" :rows="10" placeholder="请输入运行内容" />
      </div>

      <div class="run-section">
        <div class="run-section-header">
          <div class="run-section-title">最近运行记录</div>
          <el-button link type="primary" @click="loadRunHistory">刷新</el-button>
        </div>
        <el-empty v-if="!runHistory.length && !runHistoryLoading" description="暂无运行记录" />
        <el-timeline v-else v-loading="runHistoryLoading">
          <el-timeline-item
            v-for="item in runHistory"
            :key="item.id"
            :timestamp="item.createdAt"
            :type="item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'primary'"
            placement="top"
          >
            <div class="run-history-item">
              <div class="run-history-title">
                <span>{{ item.agentName || '-' }}</span>
                <el-tag size="small" :type="item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : 'info'">
                  {{ formatRunStatusLabel(item.status) }}
                </el-tag>
              </div>
              <div v-if="item.requesterName" class="run-history-subtitle">执行人：{{ item.requesterName }}</div>
              <div class="run-history-block">
                <div class="run-history-label">输入</div>
                <pre>{{ item.input }}</pre>
              </div>
              <div v-if="item.output" class="run-history-block">
                <div class="run-history-label">输出</div>
                <pre>{{ item.output }}</pre>
              </div>
              <div v-if="item.errorMessage" class="run-history-block error">
                <div class="run-history-label">错误</div>
                <pre>{{ item.errorMessage }}</pre>
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </template>
    <template #footer>
      <el-button @click="runDialogVisible = false">关闭</el-button>
      <el-button type="primary" :loading="runningAgent" @click="handleRunAgent">运行</el-button>
    </template>
  </el-dialog>
  <RequirementAiDialog
    v-model="requirementAiDialogVisible"
    :task="currentRequirementTask"
    :can-manage="canManageTasks"
    @changed="handleRequirementAiChanged"
  />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, resolveComponent, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules, UploadFile } from 'element-plus'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, Tickets, VideoPlay } from '@element-plus/icons-vue'
import { listUserOptions } from '@/api/access'
import ListUserDisplay from '@/components/ListUserDisplay.vue'
import ListUserGroupDisplay from '@/components/ListUserGroupDisplay.vue'
import type { ListUserDisplayItem } from '@/components/listUserDisplay'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import RequirementAiDialog from '@/components/RequirementAiDialog.vue'
import {
  addTaskChild,
  addTaskRelatedWorkItem,
  addTaskTestCase,
  createTask,
  deleteTaskAttachment,
  deleteTask,
  downloadTaskAttachment,
  getTaskLinks,
  getTaskDetail,
  initializeTaskPrd,
  listAgentOptions,
  listProjectWorkItems,
  listProjectOptions,
  listTaskAgentRuns,
  pageProjectTestCases,
  pageTasks,
  removeTaskChild,
  removeTaskRelatedWorkItem,
  removeTaskTestCase,
  runTaskAgent,
  uploadTaskAttachment,
  updateTask
} from '@/api/platform'
import {
  buildRequirementDraft,
  DEFAULT_REQUIREMENT_TEMPLATE,
  normalizeRequirementDocument,
  validateRequirementTemplate
} from '@/utils/requirementTemplate'
import { resolveAssetUrl } from '@/utils/asset'
import { renderMarkdownToHtml } from '@/utils/markdown'
import { uploadMarkdownImage } from '@/utils/taskImageUpload'
import {
  formatWorkItemStatusLabel,
  getAllWorkItemStatusOptions,
  getDefaultWorkItemStatus,
  getWorkItemStatusTone,
  getWorkItemStatusOptions,
  isWorkItemStatusAllowed
} from '@/utils/workItemStatus'
import { useAuthStore } from '@/stores/auth'
import type { AgentItem, LinkedTestCaseItem, ProjectItem, TaskAgentRunItem, TaskItem, TaskLinksItem, UserOptionItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'

interface TaskForm {
  name: string
  workItemType: string
  /** 任务细分类型，仅工作项类型为“任务”时提交。 */
  taskType: string
  status: string
  priority: string
  workHours: number | null
  /** 工作项计划开始日期，仅用于保留后端已有数据。 */
  planStartDate: string | null
  /** 工作项计划结束日期，仅用于保留后端已有数据。 */
  planEndDate: string | null
  assignee: string
  assigneeUserId: number | null
  collaboratorUserIds: number[]
  description: string
  requirementMarkdown: string
  prototypeUrl: string
  moduleName: string
  projectId: number | null
  agentId: number | null
  iterationId: number | null
  requirementTaskId: number | null
}

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const { isMobileViewport } = useMobileViewport()
const dialogVisible = ref(false)
const runDialogVisible = ref(false)
const runHistoryLoading = ref(false)
const runningAgent = ref(false)
const isEditing = ref(false)
const currentId = ref<number | null>(null)
const assigneeFallback = ref('')
const requirementAiDialogVisible = ref(false)
const taskList = ref<TaskItem[]>([])
const projectOptions = ref<ProjectItem[]>([])
const requirementOptions = ref<TaskItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const runHistory = ref<TaskAgentRunItem[]>([])
const currentRunTask = ref<TaskItem | null>(null)
const currentRequirementTask = ref<TaskItem | null>(null)
const detailDrawerVisible = ref(false)
const detailLoading = ref(false)
const detailTask = ref<TaskItem | null>(null)
const detailLinks = ref<TaskLinksItem | null>(null)
/**
 * 详情抽屉内的关联跳转历史，只记录用户从关联列表进入的工作项，便于返回上一条。
 */
const detailNavigationStack = ref<TaskItem[]>([])
const detailActiveTab = ref('detail')
const workItemOptions = ref<TaskItem[]>([])
const workItemOptionLoading = ref(false)
const workItemLinkTargetId = ref<number | undefined>(undefined)
const testCaseOptions = ref<LinkedTestCaseItem[]>([])
const testCaseOptionLoading = ref(false)
const testCaseLinkTargetId = ref<number | undefined>(undefined)
const attachmentUploading = ref(false)
const runInput = ref('')
const formRef = ref<FormInstance>()
const canManageTasks = computed(() => authStore.hasPermission('task:manage'))
const taskDialogTitle = computed(() => isEditing.value ? '编辑任务' : '新建任务')
const taskDialogSubtitle = computed(() =>
  isEditing.value
    ? '调整任务归属、负责人和执行要求。'
    : '填写任务基础信息，并补充执行说明。'
)

const pagination = reactive({
  page: 1,
  size: 10,
  total: 0
})

const filters = reactive({
  keyword: '',
  status: '',
  priority: '',
  projectId: undefined as number | undefined,
  agentId: undefined as number | undefined
})
const taskFilterPopoverVisible = ref(false)
const taskFilterStatusOptions = computed(() => getAllWorkItemStatusOptions())

const form = reactive<TaskForm>({
  name: '',
  workItemType: '任务',
  taskType: '开发任务',
  status: getDefaultWorkItemStatus('任务'),
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
  moduleName: '',
  projectId: null,
  agentId: null,
  iterationId: null,
  requirementTaskId: null
})
const taskFormStatusOptions = computed(() => getWorkItemStatusOptions(form.workItemType))
const TASK_TYPE_OPTIONS = ['需求设计', 'UI设计', '技术设计', '开发任务', '测试任务', '运维任务']

const normalizeTaskType = (taskType?: string | null) => {
  const value = String(taskType || '').trim()
  if (TASK_TYPE_OPTIONS.includes(value)) return value
  if (value === '开发') return '开发任务'
  if (value === '测试') return '测试任务'
  if (value === '部署' || value === '运维' || value === '部署任务') return '运维任务'
  return '开发任务'
}

const canOpenRequirementAiDialog = (task?: TaskItem | null) =>
  task?.workItemType === '需求' || (task?.workItemType === '任务' && normalizeTaskType(task.taskType) === '测试任务')

const rules: FormRules<TaskForm> = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }]
}

const selectedFormProject = computed(() =>
  projectOptions.value.find((item) => item.id === form.projectId) || null
)

/**
 * 负责人与协作人只能从当前项目负责人、创建人和成员中选择，避免产生越权可见性。
 */
const projectParticipantUserIds = computed(() => {
  const result = new Set<number>()
  if (selectedFormProject.value?.ownerUserId != null) {
    result.add(selectedFormProject.value.ownerUserId)
  }
  if (selectedFormProject.value?.creatorUserId != null) {
    result.add(selectedFormProject.value.creatorUserId)
  }
  for (const userId of selectedFormProject.value?.memberUserIds || []) {
    result.add(userId)
  }
  return result
})

const projectParticipantUsers = computed(() =>
  userOptions.value.filter((item) => projectParticipantUserIds.value.has(item.id))
)

/**
 * 列表展示需要按用户ID快速补齐真实头像，这里先构造成索引避免每列重复遍历。
 */
const userOptionMap = computed(() => new Map(userOptions.value.map((item) => [item.id, item])))

const collaboratorSelectableUsers = computed(() =>
  projectParticipantUsers.value.filter((item) => item.id !== form.assigneeUserId)
)
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const isRequirementForm = computed(() => form.workItemType === '需求')
const taskFormWorkHoursLockedReason = computed(() => '')
const detailDescriptionHtml = computed(() => {
  const source = detailTask.value?.description || detailTask.value?.requirementMarkdown || ''
  return source.trim() ? renderMarkdownToHtml(source) : ''
})
const filteredWorkItemOptions = computed(() =>
  workItemOptions.value.filter((item) => item.id !== detailTask.value?.id)
)

const formatTaskStatusLabel = (task: TaskItem | null | undefined) => {
  if (!task) {
    return '-'
  }
  return formatWorkItemStatusLabel(task.workItemType, task.status)
}

const formatDateTime = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '-'

const formatFileSize = (value?: number | null) => {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const TaskLinkSelector = defineComponent({
  name: 'TaskLinkSelector',
  props: {
    modelValue: { type: Number, default: null },
    options: { type: Array as () => TaskItem[], default: () => [] },
    loading: { type: Boolean, default: false },
    placeholder: { type: String, default: '搜索并选择工作项' }
  },
  emits: ['update:modelValue', 'search', 'submit'],
  setup(props, { emit }) {
    return () => h('div', { class: 'task-link-selector' }, [
      h(resolveComponent('el-select'), {
        modelValue: props.modelValue,
        'onUpdate:modelValue': (value: number | null) => emit('update:modelValue', value),
        filterable: true,
        remote: true,
        clearable: true,
        loading: props.loading,
        placeholder: props.placeholder,
        remoteMethod: (keyword: string) => emit('search', keyword),
        teleported: false,
        popperClass: 'task-detail-select-popper',
        style: 'width: 100%'
      }, () => props.options.map((item) => h(resolveComponent('el-option'), {
        key: item.id,
        label: `${item.workItemCode || item.id} ${item.name}`,
        value: item.id
      }, () => h('div', { class: 'task-detail-select-option' }, [
        h('strong', item.name),
        h('span', `${item.workItemCode || item.id} · ${item.workItemType} · ${formatWorkItemStatusLabel(item.workItemType, item.status)}`)
      ])))),
      h(resolveComponent('el-button'), {
        type: 'primary',
        disabled: !props.modelValue,
        onClick: () => emit('submit')
      }, () => '关联')
    ])
  }
})

const TaskTestCaseSelector = defineComponent({
  name: 'TaskTestCaseSelector',
  props: {
    modelValue: { type: Number, default: null },
    options: { type: Array as () => LinkedTestCaseItem[], default: () => [] },
    loading: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'search', 'submit'],
  setup(props, { emit }) {
    return () => h('div', { class: 'task-link-selector' }, [
      h(resolveComponent('el-select'), {
        modelValue: props.modelValue,
        'onUpdate:modelValue': (value: number | null) => emit('update:modelValue', value),
        filterable: true,
        remote: true,
        clearable: true,
        loading: props.loading,
        placeholder: '搜索并选择测试用例',
        remoteMethod: (keyword: string) => emit('search', keyword),
        teleported: false,
        popperClass: 'task-detail-select-popper',
        style: 'width: 100%'
      }, () => props.options.map((item) => h(resolveComponent('el-option'), {
        key: item.id,
        label: `${item.title} · ${item.testPlanName}`,
        value: item.id
      }, () => h('div', { class: 'task-detail-select-option' }, [
        h('strong', item.title),
        h('span', `${item.testPlanName} · ${item.moduleName || '未分组'} · ${item.priority || '-'}`)
      ])))),
      h(resolveComponent('el-button'), {
        type: 'primary',
        disabled: !props.modelValue,
        onClick: () => emit('submit')
      }, () => '关联')
    ])
  }
})

const TaskLinkList = defineComponent({
  name: 'TaskLinkList',
  props: {
    items: { type: Array as () => TaskItem[], default: () => [] },
    emptyText: { type: String, default: '暂无数据' },
    canRemove: { type: Boolean, default: false }
  },
  emits: ['remove', 'open'],
  setup(props, { emit }) {
    return () => props.items.length
      ? h('div', { class: 'task-link-list' }, props.items.map((item) => h('article', { class: 'task-link-card', key: item.id }, [
        h('button', { class: 'task-link-card-main as-button task-link-open-button', type: 'button', title: '打开工作项详情', onClick: () => emit('open', item) }, [
          h('span', { class: 'task-link-title-row' }, [
            h('strong', item.name),
            h('span', { class: 'task-link-open-hint' }, '查看详情')
          ]),
          h('span', `${item.workItemCode || item.id} · ${item.workItemType} · ${formatWorkItemStatusLabel(item.workItemType, item.status)}`)
        ]),
        props.canRemove ? h('button', { class: 'task-link-remove danger', type: 'button', onClick: () => emit('remove', item.id) }, [
          h(resolveComponent('el-icon'), null, () => h(Delete))
        ]) : null
      ])))
      : h(resolveComponent('el-empty'), { description: props.emptyText })
  }
})

const buildUserLabel = (item: UserOptionItem) => {
  return item.nickname?.trim() ? `${item.nickname} (${item.username})` : item.username
}

/**
 * 任务列表展示仅依赖当前行里已有的负责人和协作人名字，避免组件反向耦合表单选项数据。
 */
const buildTaskAssigneeDisplayItem = (row: TaskItem): ListUserDisplayItem | null => {
  if (!row.assignee?.trim()) {
    return null
  }
  const assigneeUser = row.assigneeUserId != null ? userOptionMap.value.get(row.assigneeUserId) || null : null
  return {
    id: row.assigneeUserId ?? `task-assignee-${row.id}`,
    name: row.assignee.trim(),
    avatarUrl: resolveAssetUrl(assigneeUser?.avatarUrl)
  }
}

const buildTaskCollaboratorDisplayItems = (row: TaskItem): ListUserDisplayItem[] => {
  const result: ListUserDisplayItem[] = []

  for (const [index, userId] of (row.collaboratorUserIds || []).entries()) {
    const collaboratorUser = userOptionMap.value.get(userId) || null
    const fallbackName = row.collaboratorNames?.[index] || `协作人${index + 1}`
    result.push({
      id: userId,
      name: collaboratorUser?.nickname?.trim() || collaboratorUser?.username || fallbackName,
      avatarUrl: resolveAssetUrl(collaboratorUser?.avatarUrl)
    })
  }

  if (result.length) {
    return result
  }

  return (row.collaboratorNames || []).map((name, index) => ({
    id: `${row.id}-collaborator-${index}`,
    name,
    avatarUrl: null
  }))
}

const taskTypeTone = (workItemType?: string | null) => {
  if (workItemType === '需求') return 'requirement'
  if (workItemType === '缺陷') return 'defect'
  return 'task'
}

const taskPriorityTone = (priority?: string | null) => {
  if (!priority?.trim()) return 'none'
  if (priority === '高') return 'high'
  if (priority === '低') return 'low'
  return 'medium'
}

const taskStatusTone = (task: TaskItem) => getWorkItemStatusTone(task.workItemType, task.status)

const formatTaskWorkHours = (value?: number | null) => (value == null ? '-' : `${value}h`)

const syncFormAssignee = () => {
  const selected = userOptions.value.find((item) => item.id === form.assigneeUserId)
  form.assignee = selected?.nickname?.trim() || selected?.username || assigneeFallback.value
  form.collaboratorUserIds = form.collaboratorUserIds.filter((item) => item !== form.assigneeUserId)
}

/**
 * 当项目发生切换时，及时剔除不属于当前项目参与人的负责人和协作人，避免提交无效数据。
 */
const normalizeFormParticipants = () => {
  if (form.assigneeUserId != null && !projectParticipantUserIds.value.has(form.assigneeUserId)) {
    form.assigneeUserId = null
    form.assignee = ''
    assigneeFallback.value = ''
  }
  form.collaboratorUserIds = form.collaboratorUserIds.filter((item) => projectParticipantUserIds.value.has(item))
}

const handleTaskMarkdownImageUpload = (file: File) => uploadMarkdownImage(file)

/**
 * 需求原型链接改为选填后，提交时只校验模板固定章节是否完整。
 */
const validateRequirementForm = () => {
  if (!isRequirementForm.value) {
    return ''
  }
  return validateRequirementTemplate(form.requirementMarkdown)
}

const openRequirementTask = (row: TaskItem) => {
  if (!row.requirementTaskId) {
    return
  }
  router.push({
    name: 'project-iterations',
    params: { projectId: row.projectId },
    query: { openTaskId: String(row.requirementTaskId) }
  })
}

const loadTaskDetailLinks = async (taskId: number) => {
  detailLinks.value = await getTaskLinks(taskId)
}

const loadWorkItemOptions = async (keyword = '') => {
  if (!detailTask.value?.projectId) {
    workItemOptions.value = []
    return
  }
  workItemOptionLoading.value = true
  try {
    workItemOptions.value = await listProjectWorkItems(detailTask.value.projectId, {
      keyword,
      workItemType: '全部'
    })
  } finally {
    workItemOptionLoading.value = false
  }
}

const loadTestCaseOptions = async (keyword = '') => {
  if (!detailTask.value?.projectId) {
    testCaseOptions.value = []
    return
  }
  testCaseOptionLoading.value = true
  try {
    const pageData = await pageProjectTestCases(detailTask.value.projectId, { page: 1, size: 20, keyword })
    testCaseOptions.value = pageData.records
  } finally {
    testCaseOptionLoading.value = false
  }
}

const openTaskDetailById = async (row: TaskItem, options: { pushHistory?: boolean } = {}) => {
  if (options.pushHistory && detailTask.value && detailTask.value.id !== row.id) {
    detailNavigationStack.value.push(detailTask.value)
  }
  detailDrawerVisible.value = true
  detailActiveTab.value = 'detail'
  detailTask.value = row
  detailLinks.value = null
  workItemLinkTargetId.value = undefined
  testCaseLinkTargetId.value = undefined
  detailLoading.value = true
  try {
    const [latest] = await Promise.all([
      getTaskDetail(row.id),
      loadWorkItemOptions(''),
      loadTestCaseOptions('')
    ])
    detailTask.value = latest
    await loadTaskDetailLinks(row.id)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载工作项详情失败')
  } finally {
    detailLoading.value = false
  }
}

const openTaskDetail = async (row: TaskItem) => {
  detailNavigationStack.value = []
  await openTaskDetailById(row)
}

const openLinkedTaskDetail = async (row: TaskItem) => {
  await openTaskDetailById(row, { pushHistory: true })
}

const backToPreviousDetail = async () => {
  const previous = detailNavigationStack.value.pop()
  if (previous) {
    await openTaskDetailById(previous)
  }
}

const openTaskProject = (projectId: number) => {
  router.push({
    name: 'project-iterations',
    params: { projectId }
  })
}

const updateDetailLinks = async (operation: () => Promise<TaskLinksItem>) => {
  if (!detailTask.value) {
    return
  }
  try {
    detailLinks.value = await operation()
    workItemLinkTargetId.value = undefined
    testCaseLinkTargetId.value = undefined
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新关联失败')
  }
}

const handleAddChild = () => {
  if (!detailTask.value || !workItemLinkTargetId.value) return
  updateDetailLinks(() => addTaskChild(detailTask.value!.id, workItemLinkTargetId.value!))
}

const handleRemoveChild = (targetId: number) => {
  if (!detailTask.value) return
  updateDetailLinks(() => removeTaskChild(detailTask.value!.id, targetId))
}

const handleAddRelatedWorkItem = () => {
  if (!detailTask.value || !workItemLinkTargetId.value) return
  updateDetailLinks(() => addTaskRelatedWorkItem(detailTask.value!.id, workItemLinkTargetId.value!))
}

const handleRemoveRelatedWorkItem = (targetId: number) => {
  if (!detailTask.value) return
  updateDetailLinks(() => removeTaskRelatedWorkItem(detailTask.value!.id, targetId))
}

const handleAddTestCase = () => {
  if (!detailTask.value || !testCaseLinkTargetId.value) return
  updateDetailLinks(() => addTaskTestCase(detailTask.value!.id, testCaseLinkTargetId.value!))
}

const handleRemoveTestCase = (targetId: number) => {
  if (!detailTask.value) return
  updateDetailLinks(() => removeTaskTestCase(detailTask.value!.id, targetId))
}

const handleUploadAttachment = async (uploadFile: UploadFile) => {
  if (!detailTask.value || !(uploadFile.raw instanceof File)) return
  attachmentUploading.value = true
  try {
    await uploadTaskAttachment(detailTask.value.id, uploadFile.raw)
    await loadTaskDetailLinks(detailTask.value.id)
    ElMessage.success('附件已上传')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '上传附件失败')
  } finally {
    attachmentUploading.value = false
  }
}

const handleDownloadAttachment = async (attachmentId: number) => {
  if (!detailTask.value) return
  try {
    const result = await downloadTaskAttachment(detailTask.value.id, attachmentId)
    downloadBlob(result.blob, result.fileName)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '下载附件失败')
  }
}

const handleDeleteAttachment = (attachmentId: number) => {
  if (!detailTask.value) return
  updateDetailLinks(() => deleteTaskAttachment(detailTask.value!.id, attachmentId))
}

const openTaskPrd = async (task: TaskItem) => {
  if (!task.prdWikiSpaceId || !task.prdWikiPageId) {
    ElMessage.warning(task.prdStatusMessage || '当前工作项尚未初始化 PRD')
    return
  }
  await router.push({ name: 'wiki-space-page', params: { spaceId: task.prdWikiSpaceId, pageId: task.prdWikiPageId } })
}

const openRequirementAiDialog = (task: TaskItem) => {
  if (!canOpenRequirementAiDialog(task)) {
    return
  }
  currentRequirementTask.value = task
  requirementAiDialogVisible.value = true
}

const loadRequirementOptions = async (projectId?: number | null) => {
  if (!projectId) {
    requirementOptions.value = []
    return
  }
  requirementOptions.value = await listProjectWorkItems(projectId, {
    workItemType: '需求'
  })
}

const buildTaskRunInput = (task: TaskItem) => {
  return [
    `任务：${task.name}`,
    `项目：${task.projectName}`,
    `状态：${task.status}`,
    `优先级：${task.priority}`,
    `工时：${formatTaskWorkHours(task.workHours)}`,
    `负责人：${task.assignee}`,
    '',
    '说明：',
    task.description || ''
  ].join('\n')
}

const formatRunStatusLabel = (status?: string | null) => {
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  if (status === 'RUNNING') return '运行中'
  return status || '-'
}

const resetForm = () => {
  const defaultWorkItemType = '任务'
  currentId.value = null
  currentRequirementTask.value = null
  form.name = ''
  form.workItemType = defaultWorkItemType
  form.taskType = '开发任务'
  form.status = getDefaultWorkItemStatus(defaultWorkItemType)
  form.priority = '中'
  form.workHours = null
  form.planStartDate = null
  form.planEndDate = null
  form.assignee = ''
  assigneeFallback.value = ''
  form.assigneeUserId = null
  form.collaboratorUserIds = []
  form.description = ''
  form.requirementMarkdown = ''
  form.prototypeUrl = ''
  form.moduleName = ''
  form.projectId = projectOptions.value[0]?.id ?? null
  form.agentId = null
  form.iterationId = null
  form.requirementTaskId = null
  formRef.value?.clearValidate()
}

const refreshAgentOptionsForProject = async (projectId?: number | null) => {
  const options = await listAgentOptions(projectId ?? undefined)
  return options
}

const loadOptions = async () => {
  const [projects, users] = await Promise.all([listProjectOptions(), listUserOptions()])
  projectOptions.value = projects
  userOptions.value = users
  if (!form.projectId && projectOptions.value.length > 0) {
    form.projectId = projectOptions.value[0].id
  }
  await loadRequirementOptions(form.projectId)
}

const loadTasks = async () => {
  loading.value = true
  try {
    const pageData = await pageTasks({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword,
      status: filters.status,
      priority: filters.priority,
      projectId: filters.projectId
    })
    taskList.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const loadRunHistory = async () => {
  if (!currentRunTask.value) return
  runHistoryLoading.value = true
  try {
    runHistory.value = await listTaskAgentRuns(currentRunTask.value.id)
  } finally {
    runHistoryLoading.value = false
  }
}

const handleSearch = async () => {
  taskFilterPopoverVisible.value = false
  pagination.page = 1
  await loadTasks()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.status = ''
  filters.priority = ''
  filters.projectId = undefined
  pagination.page = 1
  await loadTasks()
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadTasks()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) {
    return
  }
  pagination.page -= 1
  await loadTasks()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) {
    return
  }
  pagination.page += 1
  await loadTasks()
}

const handleFilterProjectChange = async () => {
  pagination.page = 1
  await loadTasks()
}

const handleFormProjectChange = async () => {
  await loadRequirementOptions(form.projectId)
  normalizeFormParticipants()
  if (form.requirementTaskId && !requirementOptions.value.some((item) => item.id === form.requirementTaskId)) {
    form.requirementTaskId = null
  }
}

const openCreateDialog = async () => {
  if (!canManageTasks.value) {
    return
  }
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const openEditDialog = async (row: TaskItem) => {
  if (!canManageTasks.value) {
    ElMessage.warning('当前账号没有编辑任务的权限')
    return
  }
  isEditing.value = true
  currentId.value = row.id
  currentRequirementTask.value = canOpenRequirementAiDialog(row) ? row : null
  form.name = row.name
  form.workItemType = row.workItemType
  form.taskType = row.workItemType === '任务' ? normalizeTaskType(row.taskType) : ''
  form.status = row.status
  form.priority = row.priority
  form.workHours = row.workHours
  form.planStartDate = row.planStartDate
  form.planEndDate = row.planEndDate
  form.assignee = row.assignee
  assigneeFallback.value = row.assigneeUserId ? '' : row.assignee
  form.assigneeUserId = row.assigneeUserId
  form.collaboratorUserIds = [...row.collaboratorUserIds]
  form.description = row.description
  if (row.workItemType === '需求') {
    const requirementDraft = buildRequirementDraft(row.requirementMarkdown, row.description)
    form.requirementMarkdown = requirementDraft.markdown
    form.prototypeUrl = row.prototypeUrl
    form.moduleName = row.moduleName || '未分类'
  } else {
    form.requirementMarkdown = ''
    form.prototypeUrl = ''
    form.moduleName = ''
  }
  form.projectId = row.projectId
  await loadRequirementOptions(form.projectId)
  normalizeFormParticipants()
  form.agentId = row.agentId
  form.iterationId = row.iterationId
  form.requirementTaskId = row.requirementTaskId
  dialogVisible.value = true
}

const refreshCurrentRequirementTask = async () => {
  if (currentId.value == null) {
    return
  }
  try {
    const latest = await getTaskDetail(currentId.value)
    currentRequirementTask.value = canOpenRequirementAiDialog(latest) ? latest : null
  } catch (error) {
    // 当前编辑弹窗允许继续工作，刷新失败由列表重载兜底。
  }
}

const handleInitializeCurrentTaskPrd = async () => {
  if (!currentRequirementTask.value) {
    return
  }
  try {
    await initializeTaskPrd(currentRequirementTask.value.id)
    ElMessage.success('PRD 初始化请求已完成')
    await Promise.all([loadTasks(), refreshCurrentRequirementTask()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '初始化 PRD 失败')
  }
}

const handleRequirementAiChanged = async () => {
  await Promise.all([loadTasks(), refreshCurrentRequirementTask()])
}

const openRunDialog = async (row: TaskItem) => {
  if (!canManageTasks.value) {
    return
  }
  if (!row.agentId) {
    ElMessage.warning('当前任务还没有绑定执行智能体')
    return
  }
  currentRunTask.value = row
  runInput.value = buildTaskRunInput(row)
  runHistory.value = []
  runDialogVisible.value = true
  await loadRunHistory()
}

const handleSubmit = async () => {
  if (!canManageTasks.value) {
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || form.projectId === null) return
  const requirementValidationMessage = validateRequirementForm()
  if (requirementValidationMessage) {
    ElMessage.warning(requirementValidationMessage)
    return
  }
  if (form.workItemType === '任务' && taskFormWorkHoursLockedReason.value && form.workHours !== null) {
    ElMessage.warning(taskFormWorkHoursLockedReason.value)
    return
  }

  submitting.value = true
  try {
    syncFormAssignee()
    const normalizedRequirementMarkdown = isRequirementForm.value
      ? normalizeRequirementDocument(form.requirementMarkdown)
      : ''
    const payload = {
      name: form.name,
      workItemType: form.workItemType,
      taskType: form.workItemType === '任务' ? normalizeTaskType(form.taskType) : null,
      status: form.status,
      priority: form.priority,
      workHours: form.workItemType === '任务' ? form.workHours : null,
      planStartDate: form.planStartDate,
      planEndDate: form.planEndDate,
      assignee: form.assignee,
      assigneeUserId: form.assigneeUserId,
      collaboratorUserIds: form.collaboratorUserIds,
      description: isRequirementForm.value ? normalizedRequirementMarkdown : form.description,
      requirementMarkdown: normalizedRequirementMarkdown,
      prototypeUrl: isRequirementForm.value ? form.prototypeUrl.trim() : '',
      moduleName: isRequirementForm.value ? form.moduleName.trim() : '',
      projectId: form.projectId,
      agentId: form.agentId,
      iterationId: form.iterationId,
      requirementTaskId: form.requirementTaskId
    }
    if (isEditing.value && currentId.value !== null) {
      await updateTask(currentId.value, payload)
      ElMessage.success('任务更新成功')
    } else {
      await createTask(payload)
      ElMessage.success('任务创建成功')
    }
    dialogVisible.value = false
    await loadTasks()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const handleRunAgent = async () => {
  if (!canManageTasks.value) {
    return
  }
  if (!currentRunTask.value) return
  if (!runInput.value.trim()) {
    ElMessage.warning('请输入运行内容')
    return
  }
  runningAgent.value = true
  try {
    const executionTask = await runTaskAgent(currentRunTask.value.id, runInput.value)
    ElMessage.success(`已提交到执行中心：${executionTask.title}`)
    await loadTasks()
    await loadRunHistory()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '运行失败')
  } finally {
    runningAgent.value = false
  }
}

const handleDelete = async (id: number) => {
  if (!canManageTasks.value) {
    return
  }
  try {
    await ElMessageBox.confirm('确认删除该任务吗？', '提示', { type: 'warning' })
    await deleteTask(id)
    ElMessage.success('任务删除成功')
    await loadTasks()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

watch(
  () => form.workItemType,
  (workItemType, previousType) => {
    if (!isWorkItemStatusAllowed(workItemType, form.status)) {
      form.status = getDefaultWorkItemStatus(workItemType)
    }

    if (workItemType === '需求') {
      form.requirementTaskId = null
      form.workHours = null
      form.taskType = ''
      if (!form.requirementMarkdown.trim()) {
        form.requirementMarkdown = DEFAULT_REQUIREMENT_TEMPLATE
      }
      if (!form.moduleName.trim()) {
        form.moduleName = '未分类'
      }
      return
    }

    if (previousType === '需求') {
      form.requirementMarkdown = ''
      form.prototypeUrl = ''
      form.moduleName = ''
    }

    if (workItemType !== '任务') {
      form.workHours = null
      form.taskType = ''
    } else {
      form.taskType = normalizeTaskType(form.taskType)
    }
  }
)

onMounted(async () => {
  await loadOptions()
  await loadTasks()
})
</script>

<style scoped>
.task-atelier-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.task-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.task-toolbar-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
}

.task-search-shell {
  position: relative;
  display: flex;
  flex: 0 1 340px;
  width: 340px;
  max-width: min(340px, 100%);
  align-items: center;
  min-width: 0;
}

.task-search-icon {
  position: absolute;
  left: 0;
  color: #9aa4af;
  font-size: 16px;
}

.task-search-input {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 6px 0 6px 26px;
  color: #191c1d;
  font-size: 14px;
  font-weight: 500;
  outline: none;
}

.task-search-input::placeholder {
  color: #9aa4af;
}

.task-toolbar-divider {
  width: 1px;
  height: 18px;
  background: rgba(137, 115, 98, 0.18);
  flex: 0 0 auto;
}

.task-toolbar-button,
.task-create-button,
.task-title-button,
.task-link-button,
.task-action-button,
.task-page-button {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.task-toolbar-button {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 6px;
  background: rgba(243, 244, 245, 0.92);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.task-toolbar-button:hover {
  background: rgba(231, 232, 233, 0.96);
}

.task-toolbar-side {
  display: flex;
  justify-content: flex-end;
}

.task-create-button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-radius: 8px;
  background: #191c1d;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.task-table-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
}

.task-table-scroll {
  flex: 1 1 auto;
  min-height: 360px;
  overflow: auto;
}

.task-table {
  width: 100%;
  min-width: 1320px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.task-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.task-table th {
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

.task-table td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(221, 193, 174, 0.08);
  vertical-align: middle;
}

.task-col-main {
  width: 27%;
}

.task-col-type {
  width: 8%;
}

.task-col-project {
  width: 10%;
}

.task-col-requirement {
  width: 12%;
}

.task-col-owner {
  width: 10%;
}

.task-col-collaborators {
  width: 13%;
}

.task-col-priority {
  width: 8%;
}

.task-col-hours {
  width: 8%;
}

.task-col-status {
  width: 10%;
}

.task-col-updated {
  width: 10%;
}

.task-col-actions {
  width: 8%;
}

.task-table th.center,
.task-table td.center {
  text-align: center;
}

.task-table th.right,
.task-table td.right {
  text-align: right;
}

.task-row:hover {
  background: #f3f4f5;
}

.task-primary-cell,
.task-owner-line,
.task-row-actions,
.task-footer-controls,
.task-page-size,
.task-page-nav {
  display: flex;
  align-items: center;
}

.task-primary-cell {
  gap: 12px;
  min-width: 0;
}

.task-title-button {
  width: 100%;
  padding: 0;
  background: transparent;
  text-align: left;
}

.task-primary-icon {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
  flex: 0 0 auto;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.task-primary-copy {
  min-width: 0;
}

.task-primary-title {
  overflow: hidden;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 800;
  transition: color 0.18s ease;
}

.task-primary-meta {
  margin-top: 4px;
  overflow: hidden;
  color: #758393;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
}

.task-title-button:hover .task-primary-title,
.task-title-button:focus-visible .task-primary-title {
  color: var(--app-primary);
}

.task-title-button:hover .task-primary-icon,
.task-title-button:focus-visible .task-primary-icon {
  background: rgba(var(--app-primary-container-rgb), 0.2);
  color: var(--app-primary);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.14);
}

.task-type-pill,
.task-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.task-type-pill.requirement {
  background: rgba(255, 220, 195, 0.82);
  color: #78471a;
}

.task-type-pill.task {
  background: rgba(199, 231, 255, 0.72);
  color: #004c6c;
}

.task-type-pill.defect {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.task-owner-block {
  min-width: 0;
}

.task-owner-line {
  gap: 8px;
}

.task-project-cell {
  overflow: hidden;
  color: #475569;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
}

.task-owner-avatar {
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

.task-owner-name {
  color: #191c1d;
  font-size: 12px;
  font-weight: 700;
}

.task-owner-meta {
  margin-top: 4px;
  color: #758393;
  font-size: 10px;
  font-weight: 600;
}

.task-collaborator-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.task-collaborator-chip {
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

.task-collaborator-chip.muted {
  background: rgba(255, 220, 195, 0.76);
  color: #8b5e34;
}

.task-link-button {
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  background: transparent;
  color: var(--app-text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  transition: color 0.18s ease;
}

.task-link-button:hover {
  color: var(--app-primary);
}

.task-empty-text,
.task-updated-cell {
  color: #758393;
  font-size: 11px;
  font-weight: 600;
}

.task-priority-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.task-hours-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(231, 232, 233, 0.92);
  color: #475569;
  font-size: 10px;
  font-weight: 800;
}

.task-hours-pill.empty {
  color: #64748b;
}

.task-priority-pill.high {
  background: rgba(255, 220, 195, 0.86);
  color: #a35100;
}

.task-priority-pill.medium {
  background: rgba(199, 231, 255, 0.76);
  color: #004c6c;
}

.task-priority-pill.low {
  background: rgba(231, 232, 233, 0.92);
  color: #64748b;
}

.task-priority-pill.none {
  background: rgba(246, 248, 250, 0.96);
  color: #94a3b8;
}

.task-status-pill.primary {
  background: rgba(199, 231, 255, 0.72);
  color: #004c6c;
}

.task-status-pill.danger {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.task-status-pill.info {
  background: rgba(231, 232, 233, 0.88);
  color: #64748b;
}

.task-status-pill.warning {
  background: rgba(255, 220, 195, 0.86);
  color: #a35100;
}

.task-status-pill.success {
  background: rgba(216, 240, 212, 0.82);
  color: #2f6f3e;
}

.task-status-pill.accent {
  background: rgba(237, 233, 254, 0.92);
  color: #6d28d9;
}

.task-row-actions {
  justify-content: flex-end;
  gap: 8px;
  opacity: 1;
}

.task-action-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
}

.task-action-button:hover {
  background: rgba(255, 255, 255, 0.96);
  color: #904d00;
}

.task-action-button.danger:hover {
  color: #ba1a1a;
}

.task-table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-top: 1px solid rgba(221, 193, 174, 0.12);
  background: rgba(243, 244, 245, 0.56);
}

.task-footer-total {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.task-footer-total span {
  color: #64748b;
}

.task-footer-controls {
  gap: 18px;
}

.task-page-size {
  gap: 8px;
}

.task-page-size span,
.task-page-text {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.task-page-nav {
  gap: 10px;
}

.task-page-button {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
}

.task-page-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.92);
}

.task-page-button:disabled {
  color: #cbd5e1;
}

.task-filter-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-filter-field label {
  display: block;
  margin-bottom: 6px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.task-filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

:deep(.task-filter-popper.el-popper) {
  border: 0 !important;
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: 0 16px 28px rgba(25, 28, 29, 0.12) !important;
}

:deep(.task-filter-popper .el-popper__arrow) {
  display: none;
}

:deep(.task-page-size .el-select__wrapper),
:deep(.task-filter-panel .el-select__wrapper),
:deep(.task-filter-panel .el-input__wrapper) {
  min-height: 30px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 1px rgba(221, 193, 174, 0.18) !important;
  padding-left: 8px;
  padding-right: 8px;
}

.work-item-form :deep(.el-form-item__label) {
  font-weight: 700;
  color: var(--app-text);
}

.work-item-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.grid-span-2 {
  grid-column: 1 / -1;
}

.compact-form-item {
  margin-bottom: 16px;
}

.description-form-item {
  margin-top: 8px;
  margin-bottom: 0;
}

.run-meta {
  margin-bottom: 16px;
}

.run-section {
  margin-top: 16px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(243, 244, 245, 0.9);
}

.run-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.run-section-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
}

.run-history-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.run-history-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.run-history-subtitle {
  color: var(--app-text-soft);
  font-size: 12px;
}

.run-history-block {
  border-radius: 18px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.9);
}

.run-history-block.error {
  background: rgba(255, 218, 214, 0.76);
}

.run-history-label {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--app-text-muted);
}

.run-history-block pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.task-detail-drawer :deep(.el-drawer__body) {
  padding: 0;
}

.task-detail-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.task-detail-heading {
  min-width: 0;
  flex: 1 1 auto;
}

.task-detail-back-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  min-height: 30px;
  white-space: nowrap;
  border: 1px solid rgba(var(--app-primary-rgb), 0.24);
  border-radius: 8px;
  background: rgba(var(--app-primary-container-rgb), 0.18);
  color: var(--app-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  padding: 0 10px;
  transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.task-detail-back-button:hover {
  border-color: rgba(var(--app-primary-rgb), 0.38);
  background: rgba(var(--app-primary-container-rgb), 0.28);
  transform: translateX(-1px);
}

.task-detail-title {
  overflow: hidden;
  color: var(--app-text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
  font-weight: 800;
}

.task-detail-subtitle {
  margin-top: 4px;
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.task-detail-body {
  min-height: 360px;
  padding: 0 20px 20px;
}

.task-detail-tabs :deep(.el-tabs__header) {
  position: sticky;
  top: 0;
  z-index: 3;
  margin: 0;
  background: #fff;
}

.task-detail-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.task-tab-count {
  min-width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--app-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.task-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding-top: 16px;
}

.task-detail-field {
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(243, 244, 245, 0.72);
}

.task-detail-field span,
.task-detail-section-title {
  display: block;
  color: #758393;
  font-size: 11px;
  font-weight: 800;
}

.task-detail-field strong {
  display: block;
  margin-top: 6px;
  overflow: hidden;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.task-detail-section {
  margin-top: 16px;
}

.task-detail-section.compact {
  padding-top: 12px;
  border-top: 1px solid rgba(221, 193, 174, 0.14);
}

.task-detail-markdown {
  margin-top: 8px;
  padding: 14px;
  border-radius: 8px;
  background: rgba(243, 244, 245, 0.72);
  color: #191c1d;
  font-size: 13px;
  line-height: 1.7;
}

.task-link-selector {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px 0;
}

.task-link-selector :deep(.el-select__wrapper) {
  min-height: 38px;
  border-radius: 8px;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(221, 193, 174, 0.18) !important;
}

.task-link-selector :deep(.task-detail-select-popper.el-popper) {
  max-width: 100%;
  border: 0 !important;
  border-radius: 8px !important;
  overflow: hidden;
  box-shadow: 0 14px 30px rgba(25, 28, 29, 0.14) !important;
}

.task-link-selector :deep(.task-detail-select-popper .el-select-dropdown) {
  max-width: 100%;
}

.task-link-selector :deep(.task-detail-select-popper .el-select-dropdown__item) {
  height: auto;
  min-height: 48px;
  padding: 8px 12px;
  line-height: 1.3;
}

.task-detail-select-option {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-detail-select-option strong,
.task-detail-select-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-detail-select-option strong {
  color: #191c1d;
  font-size: 13px;
  font-weight: 800;
}

.task-detail-select-option span {
  color: #758393;
  font-size: 11px;
  font-weight: 700;
}

.task-link-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-link-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(243, 244, 245, 0.72);
}

.task-link-card-main {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.task-link-card-main.as-button {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.task-link-open-button:hover strong,
.task-link-open-button:focus-visible strong {
  color: var(--app-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.task-link-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-link-open-hint {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(var(--app-primary-container-rgb), 0.2);
  color: var(--app-primary) !important;
  font-size: 11px !important;
  font-weight: 800;
  padding: 2px 7px;
  opacity: 0;
  transform: translateX(-2px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.task-link-open-button:hover .task-link-open-hint,
.task-link-open-button:focus-visible .task-link-open-hint {
  opacity: 1;
  transform: translateX(0);
}

.task-link-card-main strong {
  min-width: 0;
  overflow: hidden;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.task-link-card-main span {
  overflow: hidden;
  color: #758393;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.task-link-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-link-remove {
  border: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
  min-height: 28px;
  padding: 0 10px;
}

.task-link-remove.danger {
  color: #ba1a1a;
}

.task-attachment-upload {
  padding: 16px 0;
}

@media (max-width: 1280px) {
  .task-toolbar {
    grid-template-columns: 1fr;
  }

  .task-toolbar-main {
    width: 100%;
  }
}

@media (max-width: 900px) {
  .task-toolbar-main,
  .task-table-footer {
    flex-wrap: wrap;
  }

  .task-toolbar-divider {
    display: none;
  }

  .task-search-shell {
    width: 100%;
    max-width: 100%;
    flex-basis: 100%;
  }

  .task-footer-controls {
    width: 100%;
    justify-content: space-between;
  }

  .task-primary-title {
    font-size: 16px;
  }

  .task-primary-meta {
    font-size: 12px;
    line-height: 1.55;
  }

  .task-primary-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }

  .task-owner-line {
    min-height: 24px;
  }

  .task-collaborator-list {
    gap: 8px;
  }

  .task-row-actions {
    gap: 10px;
  }

  .work-item-grid {
    grid-template-columns: 1fr;
  }

  .task-detail-body {
    padding: 0 14px 16px;
  }

  .task-detail-grid {
    grid-template-columns: 1fr;
  }

  .task-link-selector,
  .task-link-card {
    align-items: stretch;
    flex-direction: column;
  }

  .task-link-actions {
    justify-content: flex-end;
  }
}
</style>
