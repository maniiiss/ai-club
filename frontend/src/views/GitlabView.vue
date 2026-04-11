<template>
  <div class="gitlab-page">
  <div class="gitlab-page-stack">
    <el-tabs v-model="activeTab" class="gitlab-tabs">
      <el-tab-pane label="项目绑定" name="bindings">
          <div class="management-list-page gitlab-main-card gitlab-list-page">
            <section class="management-list-toolbar">
              <div class="management-list-toolbar-main">
                <div class="gitlab-tab-switcher" role="tablist" aria-label="GitLab 页面切换">
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'bindings' }" type="button" @click="activeTab = 'bindings'">项目绑定</button>
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'autoMerge' }" type="button" @click="activeTab = 'autoMerge'">自动合并中心</button>
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'logs' }" type="button" @click="activeTab = 'logs'">自动合并日志</button>
                </div>
                <span class="management-list-toolbar-divider" aria-hidden="true"></span>
                <div class="management-list-search-shell">
                  <el-icon class="management-list-search-icon"><Search /></el-icon>
                  <input
                    v-model="bindingFilters.keyword"
                    class="management-list-search-input"
                    type="text"
                    placeholder="搜索平台项目或 GitLab 项目标识..."
                    @keyup.enter="handleBindingSearch"
                  />
                </div>
                <span class="management-list-toolbar-divider" aria-hidden="true"></span>
                <el-popover v-model:visible="bindingFilterPopoverVisible" trigger="click" placement="bottom-start" :width="300" popper-class="management-list-popper">
                  <template #reference>
                    <button class="management-list-toolbar-button" type="button">
                      <el-icon><Filter /></el-icon>
                      <span>筛选</span>
                    </button>
                  </template>
                  <div class="management-list-filter-panel management-list-compact-input">
                    <div class="management-list-filter-field">
                      <label>平台项目</label>
                      <el-select v-model="bindingFilters.projectId" clearable placeholder="平台项目" style="width: 100%" :teleported="false">
                        <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
                      </el-select>
                    </div>
                    <div class="management-list-filter-actions">
                      <el-button type="primary" @click="handleBindingSearch">查询</el-button>
                      <el-button @click="handleBindingReset">重置</el-button>
                    </div>
                  </div>
                </el-popover>
                <button class="management-list-toolbar-button" type="button" @click="handleBindingReset">
                  <el-icon><RefreshRight /></el-icon>
                  <span>重置</span>
                </button>
              </div>
              <div class="management-list-toolbar-side">
                <button class="management-list-create-button" type="button" @click="openBindingCreateDialog">
                  <el-icon><Plus /></el-icon>
                  <span>新增绑定</span>
                </button>
              </div>
            </section>

            <section class="management-list-shell">
            <div class="management-list-table-scroll mobile-card-scroll" v-loading="bindingLoading">
              <table class="management-list-table gitlab-binding-table mobile-card-table">
                <thead>
                  <tr>
                    <th class="gitlab-binding-col-main">仓库绑定</th>
                    <th class="gitlab-binding-col-branch">默认目标分支</th>
                    <th class="gitlab-binding-col-api">API 地址</th>
                    <th class="center gitlab-binding-col-status">状态</th>
                    <th class="center gitlab-binding-col-test">连通性</th>
                    <th class="gitlab-binding-col-updated">最近测试</th>
                    <th class="right gitlab-binding-col-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!bindingList.length">
                    <td colspan="7" class="gitlab-empty-row">暂无仓库绑定</td>
                  </tr>
                  <tr v-for="row in bindingList" :key="row.id" class="management-list-row">
                    <td class="gitlab-binding-col-main" data-label="仓库绑定">
                      <div class="management-list-title-cell">
                        <span class="management-list-title-icon"><el-icon><FolderOpened /></el-icon></span>
                        <div class="management-list-title-copy">
                          <a
                            v-if="getBindingProjectUrl(row)"
                            class="gitlab-title-link"
                            :href="getBindingProjectUrl(row) || undefined"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {{ row.gitlabProjectPath || row.gitlabProjectRef }}
                          </a>
                          <div v-else class="management-list-title">{{ row.gitlabProjectPath || row.gitlabProjectRef }}</div>
                          <div class="management-list-subtitle">{{ buildBindingSubtitle(row) }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="gitlab-binding-col-branch" data-label="默认目标分支">
                      <span class="management-list-text">{{ row.defaultTargetBranch || '-' }}</span>
                    </td>
                    <td class="gitlab-binding-col-api" data-label="API 地址">
                      <a v-if="row.apiBaseUrl" class="management-list-link gitlab-mono-text" :href="row.apiBaseUrl" target="_blank" rel="noreferrer">
                        {{ row.apiBaseUrl }}
                      </a>
                      <span v-else class="management-list-empty gitlab-mono-text">-</span>
                    </td>
                    <td class="center gitlab-binding-col-status" data-label="状态">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">{{ row.enabled ? '启用' : '停用' }}</span>
                    </td>
                    <td class="center gitlab-binding-col-test" data-label="连通性">
                      <span class="management-list-pill" :class="bindingStatusType(row.lastTestStatus)">{{ formatBindingStatusLabel(row.lastTestStatus) }}</span>
                    </td>
                    <td class="gitlab-binding-col-updated" data-label="最近测试">
                      <div class="gitlab-meta-stack">
                        <span class="management-list-updated">{{ formatDateTimeText(row.lastTestedAt) }}</span>
                        <span class="gitlab-meta-note">{{ row.lastTestMessage || '尚未执行连接测试' }}</span>
                      </div>
                    </td>
                    <td class="right gitlab-binding-col-actions" data-label="操作">
                      <div class="management-list-row-actions">
                        <el-tooltip content="测试连接" placement="top">
                          <button class="management-list-row-button gitlab-action-button connection" type="button" aria-label="测试 GitLab 连接" @click="handleBindingTest(row.id)">
                            <el-icon><Connection /></el-icon>
                          </button>
                        </el-tooltip>
                        <el-tooltip content="查看合并请求" placement="top">
                          <button class="management-list-row-button gitlab-action-button preview" type="button" aria-label="查看合并请求" @click="openBindingMergeRequests(row)">
                            <el-icon><Tickets /></el-icon>
                          </button>
                        </el-tooltip>
                        <el-tooltip content="创建 Tag" placement="top">
                          <button class="management-list-row-button gitlab-action-button run" type="button" aria-label="创建 GitLab Tag" @click="openTagCreateDialog(row)">
                            <el-icon><Plus /></el-icon>
                          </button>
                        </el-tooltip>
                        <el-tooltip content="编辑绑定" placement="top">
                          <button class="management-list-row-button gitlab-action-button" type="button" aria-label="编辑 GitLab 绑定" @click="openBindingEditDialog(row)">
                            <el-icon><EditPen /></el-icon>
                          </button>
                        </el-tooltip>
                        <el-tooltip content="删除绑定" placement="top">
                          <button class="management-list-row-button gitlab-action-button danger" type="button" aria-label="删除 GitLab 绑定" @click="handleBindingDelete(row.id)">
                            <el-icon><Delete /></el-icon>
                          </button>
                        </el-tooltip>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="management-list-footer">
              <div class="management-list-footer-total">共 <span>{{ bindingPagination.total }}</span> 条</div>
              <div class="management-list-footer-controls">
                <div class="management-list-page-size management-list-compact-input">
                  <span>每页</span>
                  <el-select v-model="bindingPagination.size" size="small" style="width: 92px" @change="handleBindingSizeChange">
                    <el-option :value="5" label="5" />
                    <el-option :value="10" label="10" />
                    <el-option :value="20" label="20" />
                    <el-option :value="50" label="50" />
                  </el-select>
                </div>
                <div class="management-list-page-nav">
                  <button class="management-list-page-button" type="button" :disabled="bindingPagination.page <= 1" @click="handleBindingPrevPage">
                    <el-icon><ArrowLeft /></el-icon>
                  </button>
                  <span class="management-list-page-text">第 {{ bindingPagination.page }} / {{ bindingTotalPages }} 页</span>
                  <button class="management-list-page-button" type="button" :disabled="bindingPagination.page >= bindingTotalPages" @click="handleBindingNextPage">
                    <el-icon><ArrowRight /></el-icon>
                  </button>
                </div>
              </div>
            </div>
            </section>
          </div>
      </el-tab-pane>

      <el-tab-pane label="自动合并中心" name="autoMerge">
        <div class="management-list-page gitlab-list-page">
          <section class="management-list-toolbar">
            <div class="management-list-toolbar-main">
              <div class="gitlab-tab-switcher" role="tablist" aria-label="GitLab 页面切换">
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'bindings' }" type="button" @click="activeTab = 'bindings'">项目绑定</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'autoMerge' }" type="button" @click="activeTab = 'autoMerge'">自动合并中心</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'logs' }" type="button" @click="activeTab = 'logs'">自动合并日志</button>
              </div>
              <span class="management-list-toolbar-divider" aria-hidden="true"></span>
              <div class="management-list-search-shell">
                <el-icon class="management-list-search-icon"><Search /></el-icon>
                <input
                  v-model="autoMergeFilters.keyword"
                  class="management-list-search-input"
                  type="text"
                  placeholder="搜索策略名、描述或项目..."
                  @keyup.enter="handleAutoMergeSearch"
                />
              </div>
              <span class="management-list-toolbar-divider" aria-hidden="true"></span>
              <el-popover v-model:visible="autoMergeFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
                <template #reference>
                  <button class="management-list-toolbar-button" type="button">
                    <el-icon><Filter /></el-icon>
                    <span>筛选</span>
                  </button>
                </template>
                <div class="management-list-filter-panel management-list-compact-input">
                  <div class="management-list-filter-field">
                    <label>执行模式</label>
                    <el-select v-model="autoMergeFilters.executionMode" clearable placeholder="执行模式" style="width: 100%" :teleported="false">
                      <el-option label="关联业务项目" value="PROJECT_BOUND" />
                      <el-option label="独立运行" value="STANDALONE" />
                    </el-select>
                  </div>
                  <div class="management-list-filter-field">
                    <label>启用状态</label>
                    <el-select v-model="autoMergeFilters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                      <el-option :value="true" label="启用" />
                      <el-option :value="false" label="停用" />
                    </el-select>
                  </div>
                  <div class="management-list-filter-actions">
                    <el-button type="primary" @click="handleAutoMergeSearch">查询</el-button>
                    <el-button @click="handleAutoMergeReset">重置</el-button>
                  </div>
                </div>
              </el-popover>
              <button class="management-list-toolbar-button" type="button" @click="handleAutoMergeReset">
                <el-icon><RefreshRight /></el-icon>
                <span>重置</span>
              </button>
            </div>
            <div class="management-list-toolbar-side">
              <button class="management-list-create-button" type="button" @click="openAutoMergeCreateDialog">
                <el-icon><Plus /></el-icon>
                <span>新增策略</span>
              </button>
            </div>
          </section>

          <section class="management-list-shell">
          <div class="management-list-table-scroll mobile-card-scroll" v-loading="autoMergeLoading">
            <table class="management-list-table gitlab-auto-merge-table mobile-card-table">
              <thead>
                <tr>
                  <th class="gitlab-auto-col-main">策略</th>
                  <th class="center gitlab-auto-col-mode">模式</th>
                  <th class="gitlab-auto-col-rule">分支规则</th>
                  <th class="gitlab-auto-col-scheduler">调度</th>
                  <th class="center gitlab-auto-col-enabled">启用</th>
                  <th class="gitlab-auto-col-run">最近执行</th>
                  <th class="right gitlab-auto-col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!autoMergeList.length">
                  <td colspan="7" class="gitlab-empty-row">暂无自动合并策略</td>
                </tr>
                <tr v-for="row in autoMergeList" :key="row.id" class="management-list-row">
                  <td class="gitlab-auto-col-main" data-label="策略">
                    <button class="management-list-title-trigger" type="button" @click="openAutoMergeDetailDialog(row)">
                      <div class="management-list-title-cell">
                        <span class="management-list-title-icon"><el-icon><Tickets /></el-icon></span>
                        <div class="management-list-title-copy">
                          <div class="management-list-title">{{ row.name }}</div>
                          <div class="management-list-subtitle">{{ buildAutoMergeSubtitle(row) }}</div>
                        </div>
                      </div>
                    </button>
                  </td>
                  <td class="center gitlab-auto-col-mode" data-label="模式">
                    <span class="management-list-pill" :class="row.executionMode === 'STANDALONE' ? 'warning' : 'info'">
                      {{ formatExecutionModeLabel(row.executionMode) }}
                    </span>
                  </td>
                  <td class="gitlab-auto-col-rule" data-label="分支规则">
                    <div class="gitlab-meta-stack">
                      <span>源分支：{{ row.sourceBranch || '不限' }}</span>
                      <span>目标分支：{{ row.targetBranch || '不限' }}</span>
                      <span>标题关键字：{{ row.titleKeyword || '不限' }}</span>
                    </div>
                  </td>
                  <td class="gitlab-auto-col-scheduler" data-label="调度">
                    <div class="gitlab-meta-stack">
                      <span>{{ row.schedulerEnabled ? `Cron：${row.schedulerCron || '-'}` : '未启用调度' }}</span>
                      <span>AI 审核：{{ row.aiReviewEnabled ? (row.reviewAgentName || '已启用') : '关闭' }}</span>
                      <span>合并后 Jenkins：{{ row.triggerPipelineAfterMerge ? '开启' : '关闭' }}</span>
                    </div>
                  </td>
                  <td class="center gitlab-auto-col-enabled" data-label="启用">
                    <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">{{ row.enabled ? '启用' : '停用' }}</span>
                  </td>
                  <td class="gitlab-auto-col-run" data-label="最近执行">
                    <div class="gitlab-meta-stack">
                      <span class="management-list-pill" :class="runStatusType(row.lastRunStatus)">{{ formatRunStatusLabel(row.lastRunStatus) }}</span>
                      <span class="gitlab-meta-note">上次：{{ formatDateTimeText(row.lastRunAt) }}</span>
                      <span class="gitlab-meta-note">下次：{{ formatDateTimeText(row.nextExecutionTime) }}</span>
                    </div>
                  </td>
                  <td class="right gitlab-auto-col-actions" data-label="操作">
                    <div class="management-list-row-actions">
                      <el-tooltip content="测试策略" placement="top">
                        <button class="management-list-row-button gitlab-action-button connection" type="button" aria-label="测试自动合并策略" @click="handleAutoMergeTest(row.id)">
                          <el-icon><Connection /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip content="预览 MR" placement="top">
                        <button class="management-list-row-button gitlab-action-button preview" type="button" aria-label="预览自动合并 MR" @click="openAutoMergeMergeRequests(row)">
                          <el-icon><DocumentCopy /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip content="立即执行" placement="top">
                        <button class="management-list-row-button gitlab-action-button run" type="button" aria-label="立即执行自动合并" @click="handleAutoMergeRun(row.id)">
                          <el-icon><VideoPlay /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip content="编辑策略" placement="top">
                        <button class="management-list-row-button gitlab-action-button" type="button" aria-label="编辑自动合并策略" @click="openAutoMergeEditDialog(row)">
                          <el-icon><EditPen /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip content="删除策略" placement="top">
                        <button class="management-list-row-button gitlab-action-button danger" type="button" aria-label="删除自动合并策略" @click="handleAutoMergeDelete(row.id)">
                          <el-icon><Delete /></el-icon>
                        </button>
                      </el-tooltip>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="management-list-footer">
            <div class="management-list-footer-total">共 <span>{{ autoMergePagination.total }}</span> 条</div>
            <div class="management-list-footer-controls">
              <div class="management-list-page-size management-list-compact-input">
                <span>每页</span>
                <el-select v-model="autoMergePagination.size" size="small" style="width: 92px" @change="handleAutoMergeSizeChange">
                  <el-option :value="5" label="5" />
                  <el-option :value="10" label="10" />
                  <el-option :value="20" label="20" />
                  <el-option :value="50" label="50" />
                </el-select>
              </div>
              <div class="management-list-page-nav">
                <button class="management-list-page-button" type="button" :disabled="autoMergePagination.page <= 1" @click="handleAutoMergePrevPage">
                  <el-icon><ArrowLeft /></el-icon>
                </button>
                <span class="management-list-page-text">第 {{ autoMergePagination.page }} / {{ autoMergeTotalPages }} 页</span>
                <button class="management-list-page-button" type="button" :disabled="autoMergePagination.page >= autoMergeTotalPages" @click="handleAutoMergeNextPage">
                  <el-icon><ArrowRight /></el-icon>
                </button>
              </div>
            </div>
          </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="自动合并日志" name="logs">
        <div class="management-list-page gitlab-list-page">
            <section class="management-list-toolbar">
              <div class="management-list-toolbar-main">
                <div class="gitlab-tab-switcher" role="tablist" aria-label="GitLab 页面切换">
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'bindings' }" type="button" @click="activeTab = 'bindings'">项目绑定</button>
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'autoMerge' }" type="button" @click="activeTab = 'autoMerge'">自动合并中心</button>
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'logs' }" type="button" @click="activeTab = 'logs'">自动合并日志</button>
                </div>
                <span class="management-list-toolbar-divider" aria-hidden="true"></span>
                <div class="management-list-search-shell">
                  <el-icon class="management-list-search-icon"><Search /></el-icon>
                  <input
                    class="management-list-search-input"
                    type="text"
                    value=""
                    placeholder="通过筛选查看自动合并日志..."
                    readonly
                  />
                </div>
                <span class="management-list-toolbar-divider" aria-hidden="true"></span>
                <el-popover v-model:visible="logFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
                  <template #reference>
                    <button class="management-list-toolbar-button" type="button">
                      <el-icon><Filter /></el-icon>
                      <span>筛选</span>
                    </button>
                  </template>
                  <div class="management-list-filter-panel management-list-compact-input">
                    <div class="management-list-filter-field">
                      <label>结果</label>
                      <el-select v-model="logFilters.result" clearable placeholder="结果" style="width: 100%" :teleported="false">
                        <el-option label="已合并" value="MERGED" />
                        <el-option label="已跳过" value="SKIPPED" />
                        <el-option label="AI 拒绝" value="AI_REJECTED" />
                        <el-option label="失败" value="FAILED" />
                        <el-option label="空执行" value="EMPTY" />
                      </el-select>
                    </div>
                    <div class="management-list-filter-field">
                      <label>触发方式</label>
                      <el-select v-model="logFilters.triggerType" clearable placeholder="触发方式" style="width: 100%" :teleported="false">
                        <el-option label="手动执行" value="MANUAL" />
                        <el-option label="定时调度" value="SCHEDULED" />
                      </el-select>
                    </div>
                    <div class="management-list-filter-actions">
                      <el-button type="primary" @click="handleLogSearch">查询</el-button>
                      <el-button @click="handleLogReset">重置</el-button>
                    </div>
                  </div>
                </el-popover>
                <button class="management-list-toolbar-button" type="button" @click="handleLogReset">
                  <el-icon><RefreshRight /></el-icon>
                  <span>重置</span>
                </button>
              </div>
              <div class="management-list-toolbar-side">
                <button class="management-list-toolbar-button" type="button" @click="loadAutoMergeLogs">
                  <el-icon><RefreshRight /></el-icon>
                  <span>刷新</span>
                </button>
              </div>
            </section>

            <section class="management-list-shell">
            <div class="management-list-table-scroll mobile-card-scroll" v-loading="logLoading">
              <table class="management-list-table gitlab-log-table mobile-card-table">
                <thead>
                  <tr>
                    <th class="gitlab-log-col-main">执行记录</th>
                    <th class="center gitlab-log-col-trigger">触发方式</th>
                    <th class="gitlab-log-col-user">发起人</th>
                    <th class="center gitlab-log-col-result">结果</th>
                    <th class="gitlab-log-col-reason">原因</th>
                    <th class="gitlab-log-col-link">链接</th>
                    <th class="right gitlab-log-col-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!logList.length">
                    <td colspan="7" class="gitlab-empty-row">暂无自动合并日志</td>
                  </tr>
                <tr v-for="row in logList" :key="row.id" class="management-list-row">
                  <td class="gitlab-log-col-main" data-label="执行记录">
                    <button class="management-list-title-trigger" type="button" @click="openLogDetail(row)">
                      <div class="management-list-title-cell">
                        <span class="management-list-title-icon"><el-icon><DocumentCopy /></el-icon></span>
                        <div class="management-list-title-copy">
                          <div class="management-list-title">{{ row.configName || '自动合并执行' }}</div>
                          <div class="management-list-subtitle">{{ buildLogSubtitle(row) }}</div>
                        </div>
                      </div>
                    </button>
                  </td>
                    <td class="center gitlab-log-col-trigger" data-label="触发方式">
                      <span class="management-list-pill" :class="row.triggerType === 'SCHEDULED' ? 'warning' : 'info'">{{ formatTriggerTypeLabel(row.triggerType) }}</span>
                    </td>
                    <td class="gitlab-log-col-user" data-label="发起人">
                      <span class="management-list-empty">{{ getLogInitiatorDisplay(row) }}</span>
                    </td>
                    <td class="center gitlab-log-col-result" data-label="结果">
                      <span class="management-list-pill" :class="logResultType(row.result)">{{ logResultText(row.result) }}</span>
                    </td>
                    <td class="gitlab-log-col-reason" data-label="原因">
                      <span class="management-list-empty">{{ row.reason || '-' }}</span>
                    </td>
                    <td class="gitlab-log-col-link" data-label="链接">
                      <a v-if="row.webUrl" class="management-list-link" :href="row.webUrl" target="_blank" rel="noreferrer">打开</a>
                      <span v-else class="management-list-empty">-</span>
                    </td>
                    <td class="right gitlab-log-col-actions" data-label="操作">
                      <div class="management-list-row-actions">
                        <el-tooltip content="查看详情" placement="top">
                          <button class="management-list-row-button gitlab-action-button preview" type="button" aria-label="查看日志详情" @click="openLogDetail(row)">
                            <el-icon><DocumentCopy /></el-icon>
                          </button>
                        </el-tooltip>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="management-list-footer">
              <div class="management-list-footer-total">共 <span>{{ logPagination.total }}</span> 条</div>
              <div class="management-list-footer-controls">
                <div class="management-list-page-size management-list-compact-input">
                  <span>每页</span>
                  <el-select v-model="logPagination.size" size="small" style="width: 92px" @change="handleLogSizeChange">
                    <el-option :value="5" label="5" />
                    <el-option :value="10" label="10" />
                    <el-option :value="20" label="20" />
                    <el-option :value="50" label="50" />
                  </el-select>
                </div>
                <div class="management-list-page-nav">
                  <button class="management-list-page-button" type="button" :disabled="logPagination.page <= 1" @click="handleLogPrevPage">
                    <el-icon><ArrowLeft /></el-icon>
                  </button>
                  <span class="management-list-page-text">第 {{ logPagination.page }} / {{ logTotalPages }} 页</span>
                  <button class="management-list-page-button" type="button" :disabled="logPagination.page >= logTotalPages" @click="handleLogNextPage">
                    <el-icon><ArrowRight /></el-icon>
                  </button>
                </div>
              </div>
            </div>
            </section>
          </div>
      </el-tab-pane>
    </el-tabs>
</div>
</div>

  <el-dialog v-model="bindingDialogVisible" :title="bindingIsEditing ? '编辑 GitLab 绑定' : '新增 GitLab 绑定'" width="640px" class="platform-form-dialog" align-center>
    <el-form ref="bindingFormRef" :model="bindingForm" :rules="bindingRules" label-width="120px" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">GitLab 绑定</div>
          <div class="platform-form-section-subtitle">配置平台项目与 GitLab 项目的映射关系。</div>
        </div>
        <el-form-item label="平台项目" prop="projectId">
          <el-select v-model="bindingForm.projectId" placeholder="请选择平台项目" style="width: 100%">
            <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="GitLab API" prop="apiBaseUrl"><el-input v-model="bindingForm.apiBaseUrl" /></el-form-item>
        <el-form-item label="项目 ID / 路径" prop="gitlabProjectRef"><el-input v-model="bindingForm.gitlabProjectRef" /></el-form-item>
        <el-form-item label="默认目标分支"><el-input v-model="bindingForm.defaultTargetBranch" /></el-form-item>
        <el-form-item label="APIToken"><el-input v-model="bindingForm.apiToken" type="password" show-password :placeholder="bindingIsEditing ? '留空则保留原 Token' : '请输入 APIToken'" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="bindingForm.enabled" /></el-form-item>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="bindingDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="bindingSubmitting" @click="handleBindingSubmit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="tagDialogVisible" title="创建 GitLab Tag" width="680px" class="platform-form-dialog" align-center>
    <el-form ref="tagFormRef" :model="tagForm" :rules="tagRules" label-width="120px" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">Tag 信息</div>
          <div class="platform-form-section-subtitle">基于当前绑定仓库选择分支并创建新的 GitLab Tag。</div>
        </div>
        <el-form-item label="当前仓库">
          <el-input :model-value="currentTagBinding ? `${currentTagBinding.projectName} / ${currentTagBinding.gitlabProjectPath || currentTagBinding.gitlabProjectRef}` : ''" disabled />
          <div class="form-tip">默认目标分支：{{ currentTagBinding?.defaultTargetBranch || '未配置' }}</div>
        </el-form-item>
        <el-form-item label="Tag 名称" prop="tagName">
          <el-input v-model="tagForm.tagName" placeholder="例如：v1.2.0" />
        </el-form-item>
        <el-form-item label="来源分支" prop="branchName">
          <el-select
            v-model="tagForm.branchName"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索分支"
            style="width: 100%"
            :remote-method="handleTagBranchSearch"
            :loading="tagBranchLoading"
          >
            <el-option
              v-for="branch in tagBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注说明">
          <el-input v-model="tagForm.message" type="textarea" :rows="3" placeholder="留空将创建轻量 Tag" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="tagDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="tagSubmitting" @click="handleTagSubmit">创建</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="tagResultVisible" title="Tag 创建结果" width="720px">
    <el-descriptions v-if="tagResult" :column="2" border>
      <el-descriptions-item label="平台项目">{{ tagResult.projectName }}</el-descriptions-item>
      <el-descriptions-item label="GitLab 仓库">{{ tagResult.projectRef }}</el-descriptions-item>
      <el-descriptions-item label="Tag 名称">{{ tagResult.tagName }}</el-descriptions-item>
      <el-descriptions-item label="来源分支">{{ tagResult.branchName }}</el-descriptions-item>
      <el-descriptions-item label="Tag 类型">{{ tagResult.message ? '注释 Tag' : '轻量 Tag' }}</el-descriptions-item>
      <el-descriptions-item label="目标 SHA">{{ tagResult.targetSha || '-' }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ formatDateTimeText(tagResult.createdAt) }}</el-descriptions-item>
      <el-descriptions-item label="受保护">{{ tagResult.protectedTag ? '是' : '否' }}</el-descriptions-item>
      <el-descriptions-item label="备注说明" :span="2">{{ tagResult.message || '-' }}</el-descriptions-item>
      <el-descriptions-item label="链接" :span="2">
        <el-link v-if="tagResult.webUrl" :href="tagResult.webUrl" target="_blank" type="primary">打开 GitLab Tag</el-link>
        <span v-else>-</span>
      </el-descriptions-item>
    </el-descriptions>
  </el-dialog>

  <el-dialog v-model="autoMergeDialogVisible" :title="autoMergeDialogTitle" width="760px" class="platform-form-dialog" align-center>
    <el-form ref="autoMergeFormRef" class="auto-merge-form platform-form-layout" :model="autoMergeForm" :rules="autoMergeRules" :disabled="autoMergeReadonlyMode" label-width="140px">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">基础配置</div>
          <div class="platform-form-section-subtitle">定义策略范围、执行模式和目标仓库规则。</div>
        </div>
        <div class="auto-merge-grid">
        <el-form-item label="策略名称" prop="name">
          <el-input v-model="autoMergeForm.name" />
        </el-form-item>
        <el-form-item label="执行模式" prop="executionMode">
          <el-radio-group v-model="autoMergeForm.executionMode">
            <el-radio value="PROJECT_BOUND">关联业务项目</el-radio>
            <el-radio value="STANDALONE">独立运行</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="autoMergeForm.executionMode === 'PROJECT_BOUND'">
          <el-form-item label="GitLab 绑定" prop="bindingId" class="span-2">
            <el-select v-model="autoMergeForm.bindingId" style="width: 100%">
              <el-option v-for="binding in bindingOptions" :key="binding.id" :label="`${binding.projectName} / ${binding.gitlabProjectPath || binding.gitlabProjectRef}`" :value="binding.id" />
            </el-select>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="GitLab API">
            <el-input v-model="autoMergeForm.apiBaseUrl" />
          </el-form-item>
          <el-form-item label="项目 ID / 路径">
            <el-input v-model="autoMergeForm.gitlabProjectRef" />
          </el-form-item>
          <el-form-item label="APIToken" class="span-2">
            <el-input v-model="autoMergeForm.apiToken" type="password" show-password :placeholder="autoMergeIsEditing ? '留空则保留原 Token' : '请输入 APIToken'" />
          </el-form-item>
        </template>
        <el-form-item label="源分支">
          <el-input v-model="autoMergeForm.sourceBranch" placeholder="留空表示不限" />
        </el-form-item>
        <el-form-item label="目标分支">
          <el-input v-model="autoMergeForm.targetBranch" placeholder="留空表示不限" />
        </el-form-item>
        <el-form-item label="标题关键字">
          <el-input v-model="autoMergeForm.titleKeyword" placeholder="留空表示不限" />
        </el-form-item>
        <el-form-item label="策略启用">
          <el-switch v-model="autoMergeForm.enabled" />
        </el-form-item>
        <el-form-item label="策略描述" class="span-2">
          <el-input v-model="autoMergeForm.description" type="textarea" :rows="3" />
        </el-form-item>
        </div>
      </section>

      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">调度配置</div>
          <div class="platform-form-section-subtitle">配置定时执行方式和 Cron 规则。</div>
        </div>
        <div class="auto-merge-grid">
        <el-form-item label="启用调度">
          <el-switch v-model="autoMergeForm.schedulerEnabled" />
        </el-form-item>
        <el-form-item label="Cron 示例">
          <el-select v-model="cronTemplate" clearable placeholder="选择一个常用示例" style="width: 100%" @change="handleCronTemplateChange">
            <el-option label="每5分钟：0 */5 * * * *" value="0 */5 * * * *" />
            <el-option label="每10分钟：0 */10 * * * *" value="0 */10 * * * *" />
            <el-option label="每30分钟：0 */30 * * * *" value="0 */30 * * * *" />
            <el-option label="每小时整点：0 0 * * * *" value="0 0 * * * *" />
            <el-option label="每天凌晨2点：0 0 2 * * *" value="0 0 2 * * *" />
          </el-select>
        </el-form-item>
        <el-form-item label="调度 Cron" class="span-2">
          <el-input v-model="autoMergeForm.schedulerCron" :disabled="!autoMergeForm.schedulerEnabled" placeholder="例如：0 */5 * * * *" />
          <div class="form-tip">使用 Spring 6 位 Cron，例如：0 */5 * * * * 表示每 5 分钟执行一次。</div>
        </el-form-item>
        </div>
      </section>

      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">Agent 配置</div>
          <div class="platform-form-section-subtitle">配置 AI 审核和自动合并行为。</div>
        </div>
        <div class="auto-merge-grid">
        <el-form-item label="启用 AI 审核">
          <el-switch v-model="autoMergeForm.aiReviewEnabled" />
        </el-form-item>
        <el-form-item label="Code Review Agent" class="span-2">
          <el-select v-model="autoMergeForm.reviewAgentId" clearable placeholder="请选择内置 Code Review Agent" style="width: 100%" :disabled="!autoMergeForm.aiReviewEnabled">
            <el-option v-for="agent in reviewAgentOptions" :key="agent.id" :label="agent.name" :value="agent.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="自动合并">
          <el-switch v-model="autoMergeForm.autoMerge" />
        </el-form-item>
        <el-form-item label="需 Pipeline 成功">
          <el-switch v-model="autoMergeForm.requirePipelineSuccess" />
        </el-form-item>
        <el-form-item label="Squash 合并">
          <el-switch v-model="autoMergeForm.squashOnMerge" />
        </el-form-item>
        <el-form-item label="删除源分支">
          <el-switch v-model="autoMergeForm.removeSourceBranch" />
        </el-form-item>
        <el-form-item label="合并后触发 Jenkins" class="span-2">
          <el-switch v-model="autoMergeForm.triggerPipelineAfterMerge" :disabled="autoMergeForm.executionMode !== 'PROJECT_BOUND'" />
          <div class="form-tip">仅关联业务项目模式可用，合并成功后会按项目流水线绑定自动触发 Jenkins。</div>
        </el-form-item>
        </div>
      </section>
    </el-form>
    <template #footer>
      <el-button @click="autoMergeDialogVisible = false">{{ autoMergeReadonlyMode ? '关闭' : '取消' }}</el-button>
      <el-button v-if="!autoMergeReadonlyMode" type="primary" :loading="autoMergeSubmitting" @click="handleAutoMergeSubmit">保存</el-button>
    </template>
  </el-dialog>

  <el-drawer v-model="mergeRequestDrawerVisible" :title="mergeRequestDrawerTitle" size="60%" append-to-body>
    <el-table :data="mergeRequestList" v-loading="mergeRequestLoading" style="width: 100%">
      <el-table-column prop="iid" label="IID" width="80" />
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="sourceBranch" label="源分支" width="140" />
      <el-table-column prop="targetBranch" label="目标分支" width="140" />
      <el-table-column label="落后状态" width="120">
        <template #default="{ row }">
          <el-tag :type="mergeRequestBehindTagType(row)">
            {{ isMergeRequestBehind(row) ? '落后' : '正常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="落后提交数" width="120">
        <template #default="{ row }">
          {{ getMergeRequestBehindCount(row) }}
        </template>
      </el-table-column>
      <el-table-column prop="detailedMergeStatus" label="合并状态" min-width="160" show-overflow-tooltip />
      <el-table-column prop="pipelineStatus" label="Pipeline" width="120" />
      <el-table-column prop="authorName" label="作者" width="120" />
      <el-table-column label="链接" width="90"><template #default="{ row }"><el-link :href="row.webUrl" target="_blank" type="primary">打开</el-link></template></el-table-column>
    </el-table>
  </el-drawer>

  <el-dialog v-model="logDetailVisible" title="合并日志详情" width="860px">
    <el-descriptions v-if="currentLogDetail" :column="2" border>
      <el-descriptions-item label="执行时间">{{ currentLogDetail.executedAt || '-' }}</el-descriptions-item>
      <el-descriptions-item label="策略">{{ currentLogDetail.configName || '-' }}</el-descriptions-item>
      <el-descriptions-item label="结果">
        <el-tag :type="logResultType(currentLogDetail.result)">{{ currentLogDetail.result }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="发起人">{{ getLogInitiatorDisplay(currentLogDetail) }}</el-descriptions-item>
      <el-descriptions-item label="原因">{{ currentLogDetail.reason || '-' }}</el-descriptions-item>
    </el-descriptions>
    <div v-if="currentLogDetail" class="log-detail-markdown" v-html="logDetailHtml"></div>
  </el-dialog>

  <el-dialog v-model="runResultVisible" title="自动合并执行结果" width="760px">
    <el-descriptions v-if="runResult" :column="3" border>
      <el-descriptions-item label="策略">{{ runResult.configName }}</el-descriptions-item>
      <el-descriptions-item label="匹配 MR">{{ runResult.matchedCount }}</el-descriptions-item>
      <el-descriptions-item label="成功 / 未合并">{{ runResult.mergedCount }} / {{ runResult.skippedCount }}</el-descriptions-item>
    </el-descriptions>
    <el-table v-if="runResult" :data="runResult.items" style="width: 100%; margin-top: 16px">
      <el-table-column prop="iid" label="IID" width="80" />
      <el-table-column prop="title" label="标题" min-width="220" />
      <el-table-column prop="action" label="动作" width="120" />
      <el-table-column prop="message" label="结果说明" min-width="220" show-overflow-tooltip />
    </el-table>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Connection, Delete, DocumentCopy, EditPen, Filter, FolderOpened, Plus, RefreshRight, Search, Tickets, VideoPlay } from '@element-plus/icons-vue'
import { listAgentOptions, listProjectOptions } from '@/api/platform'
import {
  createGitlabAutoMergeConfig,
  createGitlabBinding,
  createGitlabTag,
  deleteGitlabAutoMergeConfig,
  deleteGitlabBinding,
  listGitlabBindingOptions,
  listGitlabBranches,
  pageGitlabAutoMergeConfigs,
  pageGitlabAutoMergeLogs,
  pageGitlabBindings,
  previewAutoMergeConfigMergeRequests,
  previewBindingMergeRequests,
  runAutoMergeConfig,
  testGitlabAutoMergeConfig,
  testGitlabBinding,
  updateGitlabAutoMergeConfig,
  updateGitlabBinding
} from '@/api/gitlab'
import type {
  AgentItem,
  GitlabAutoMergeConfigItem,
  GitlabAutoMergeLogItem,
  GitlabAutoMergeRunResult,
  GitlabBranchItem,
  GitlabMergeRequestItem,
  GitlabTagCreateResultItem,
  ProjectGitlabBindingItem,
  ProjectItem
} from '@/types/platform'
import { renderMarkdownToHtml } from '@/utils/markdown'

const DEFAULT_GITLAB_API_URL = 'http://192.168.110.138:30080/api/v4'

interface BindingForm { projectId: number | null; apiBaseUrl: string; gitlabProjectRef: string; defaultTargetBranch: string; apiToken: string; enabled: boolean }
/** Tag 表单仅负责收集名称、来源分支和备注。 */
interface TagForm { tagName: string; branchName: string; message: string }
interface AutoMergeForm { name: string; executionMode: 'PROJECT_BOUND' | 'STANDALONE'; description: string; bindingId: number | null; apiBaseUrl: string; gitlabProjectRef: string; apiToken: string; sourceBranch: string; targetBranch: string; titleKeyword: string; schedulerEnabled: boolean; schedulerCron: string; enabled: boolean; autoMerge: boolean; squashOnMerge: boolean; removeSourceBranch: boolean; triggerPipelineAfterMerge: boolean; requirePipelineSuccess: boolean; reviewAgentId: number | null; aiReviewEnabled: boolean; aiReviewPrompt: string }

const activeTab = ref('bindings')
const projectOptions = ref<ProjectItem[]>([])
const bindingOptions = ref<ProjectGitlabBindingItem[]>([])
const reviewAgentOptions = ref<AgentItem[]>([])
const bindingLoading = ref(false)
const bindingSubmitting = ref(false)
const bindingDialogVisible = ref(false)
const bindingIsEditing = ref(false)
const currentBindingId = ref<number | null>(null)
const bindingList = ref<ProjectGitlabBindingItem[]>([])
const bindingFormRef = ref<FormInstance>()
const bindingPagination = reactive({ page: 1, size: 10, total: 0 })
const bindingTotalPages = computed(() => Math.max(1, Math.ceil(bindingPagination.total / bindingPagination.size) || 1))
const bindingFilters = reactive({ keyword: '', projectId: undefined as number | undefined })
const bindingFilterPopoverVisible = ref(false)
const bindingForm = reactive<BindingForm>({ projectId: null, apiBaseUrl: DEFAULT_GITLAB_API_URL, gitlabProjectRef: '', defaultTargetBranch: '', apiToken: '', enabled: true })
const tagDialogVisible = ref(false)
const tagSubmitting = ref(false)
const tagResultVisible = ref(false)
const currentTagBinding = ref<ProjectGitlabBindingItem | null>(null)
const tagFormRef = ref<FormInstance>()
const tagForm = reactive<TagForm>({ tagName: '', branchName: '', message: '' })
const tagBranchOptions = ref<GitlabBranchItem[]>([])
const tagBranchLoading = ref(false)
const tagResult = ref<GitlabTagCreateResultItem | null>(null)
const autoMergeLoading = ref(false)
const autoMergeSubmitting = ref(false)
const autoMergeDialogVisible = ref(false)
const autoMergeIsEditing = ref(false)
const autoMergeReadonlyMode = ref(false)
const currentAutoMergeId = ref<number | null>(null)
const autoMergeList = ref<GitlabAutoMergeConfigItem[]>([])
const autoMergeFormRef = ref<FormInstance>()
const autoMergePagination = reactive({ page: 1, size: 10, total: 0 })
const autoMergeTotalPages = computed(() => Math.max(1, Math.ceil(autoMergePagination.total / autoMergePagination.size) || 1))
const autoMergeFilters = reactive({ keyword: '', executionMode: undefined as 'PROJECT_BOUND' | 'STANDALONE' | undefined, enabled: undefined as boolean | undefined })
const autoMergeFilterPopoverVisible = ref(false)
const autoMergeForm = reactive<AutoMergeForm>({ name: '', executionMode: 'PROJECT_BOUND', description: '', bindingId: null, apiBaseUrl: DEFAULT_GITLAB_API_URL, gitlabProjectRef: '', apiToken: '', sourceBranch: '', targetBranch: '', titleKeyword: '', schedulerEnabled: false, schedulerCron: '0 */5 * * * *', enabled: true, autoMerge: true, squashOnMerge: false, removeSourceBranch: true, triggerPipelineAfterMerge: false, requirePipelineSuccess: true, reviewAgentId: null, aiReviewEnabled: false, aiReviewPrompt: '' })
const cronTemplate = ref('')
const logLoading = ref(false)
const logList = ref<GitlabAutoMergeLogItem[]>([])
const logPagination = reactive({ page: 1, size: 10, total: 0 })
const logTotalPages = computed(() => Math.max(1, Math.ceil(logPagination.total / logPagination.size) || 1))
const logFilters = reactive({ result: undefined as string | undefined, triggerType: undefined as 'MANUAL' | 'SCHEDULED' | undefined })
const logFilterPopoverVisible = ref(false)
const logDetailVisible = ref(false)
const currentLogDetail = ref<GitlabAutoMergeLogItem | null>(null)
const mergeRequestDrawerVisible = ref(false)
const mergeRequestDrawerTitle = ref('')
const mergeRequestLoading = ref(false)
const mergeRequestList = ref<GitlabMergeRequestItem[]>([])
const runResultVisible = ref(false)
const runResult = ref<GitlabAutoMergeRunResult | null>(null)
const bindingRules: FormRules<BindingForm> = { projectId: [{ required: true, message: '请选择平台项目', trigger: 'change' }], apiBaseUrl: [{ required: true, message: '请输入 GitLab API 地址', trigger: 'blur' }], gitlabProjectRef: [{ required: true, message: '请输入 GitLab 项目标识', trigger: 'blur' }] }
const tagRules: FormRules<TagForm> = { tagName: [{ required: true, message: '请输入 Tag 名称', trigger: 'blur' }], branchName: [{ required: true, message: '请选择来源分支', trigger: 'change' }] }
const autoMergeRules: FormRules<AutoMergeForm> = { name: [{ required: true, message: '请输入策略名称', trigger: 'blur' }], executionMode: [{ required: true, message: '请选择执行模式', trigger: 'change' }] }

watch(() => autoMergeForm.executionMode, (mode) => {
  if (mode === 'PROJECT_BOUND') {
    autoMergeForm.apiToken = ''
    autoMergeForm.apiBaseUrl = DEFAULT_GITLAB_API_URL
    autoMergeForm.gitlabProjectRef = ''
  } else {
    autoMergeForm.bindingId = null
    autoMergeForm.triggerPipelineAfterMerge = false
  }
})

watch(() => autoMergeForm.schedulerEnabled, (enabled) => {
  if (!enabled) {
    cronTemplate.value = ''
  }
})

const bindingStatusType = (status?: string | null) => status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : 'info'
const runStatusType = (status?: string | null) => status === 'SUCCESS' ? 'success' : status === 'PARTIAL' || status === 'SKIPPED' ? 'warning' : status === 'FAILED' ? 'danger' : 'info'
const logResultType = (result?: string | null) => result === 'MERGED' ? 'success' : result === 'FAILED' ? 'danger' : result === 'EMPTY' ? 'info' : 'warning'
const logResultText = (result?: string | null) => result === 'MERGED' ? '已合并' : result === 'FAILED' ? '失败' : result === 'AI_REJECTED' ? 'AI 拒绝' : result === 'SKIPPED' ? '已跳过' : result === 'EMPTY' ? '空执行' : (result || '未知')
const getMergeRequestBehindCount = (item: GitlabMergeRequestItem) => item.divergedCommitsCount ?? item.diverged_commits_count ?? 0
const isMergeRequestBehind = (item: GitlabMergeRequestItem) => getMergeRequestBehindCount(item) > 0 || item.detailedMergeStatus === 'need_rebase'
const mergeRequestBehindTagType = (item: GitlabMergeRequestItem) => isMergeRequestBehind(item) ? 'danger' : 'success'
const logDetailHtml = computed(() => renderMarkdownToHtml(currentLogDetail.value?.detailMarkdown || buildFallbackLogMarkdown(currentLogDetail.value)))

// 统一整理列表中用到的中文展示文案，避免模板层重复判断状态和时间格式。
const formatDateTimeText = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '-'
const formatBindingStatusLabel = (status?: string | null) => status === 'SUCCESS' ? '连通正常' : status === 'FAILED' ? '连接失败' : '未测试'
const formatExecutionModeLabel = (mode?: 'PROJECT_BOUND' | 'STANDALONE' | null) => mode === 'STANDALONE' ? '独立运行' : '关联业务'
const formatTriggerTypeLabel = (triggerType?: 'MANUAL' | 'SCHEDULED' | null) => triggerType === 'SCHEDULED' ? '定时调度' : '手动执行'
const formatRunStatusLabel = (status?: string | null) => status === 'SUCCESS' ? '执行成功' : status === 'PARTIAL' ? '部分成功' : status === 'SKIPPED' ? '已跳过' : status === 'FAILED' ? '执行失败' : '未执行'

// 主信息列会把多字段折叠成标题和副标题，保持桌面与移动端的阅读节奏一致。
const getBindingProjectUrl = (row: ProjectGitlabBindingItem) => resolveGitlabProjectUrl(row.gitlabProjectWebUrl, row.apiBaseUrl, row.gitlabProjectPath || row.gitlabProjectRef)
const buildBindingSubtitle = (row: ProjectGitlabBindingItem) => `${row.projectName}${row.gitlabProjectName ? ` · ${row.gitlabProjectName}` : ''}${row.tokenConfigured ? '' : ' · Token 未配置'}`
const buildAutoMergeSubtitle = (row: GitlabAutoMergeConfigItem) => row.description || `${row.projectName || '独立运行'} · ${row.gitlabProjectRef}`
const buildLogSubtitle = (row: GitlabAutoMergeLogItem) => {
  const segments = [formatDateTimeText(row.executedAt)]
  if (row.mergeRequestIid) {
    segments.push(`!${row.mergeRequestIid}`)
  }
  if (row.mergeRequestTitle) {
    segments.push(row.mergeRequestTitle)
  }
  return segments.join(' · ')
}

const autoMergeDialogTitle = computed(() => {
  if (autoMergeReadonlyMode.value) {
    return '查看自动合并策略'
  }
  return autoMergeIsEditing.value ? '编辑自动合并策略' : '新增自动合并策略'
})

const resetBindingForm = () => { currentBindingId.value = null; bindingForm.projectId = projectOptions.value[0]?.id ?? null; bindingForm.apiBaseUrl = DEFAULT_GITLAB_API_URL; bindingForm.gitlabProjectRef = ''; bindingForm.defaultTargetBranch = ''; bindingForm.apiToken = ''; bindingForm.enabled = true; bindingFormRef.value?.clearValidate() }
const resetTagForm = () => { currentTagBinding.value = null; tagForm.tagName = ''; tagForm.branchName = ''; tagForm.message = ''; tagBranchOptions.value = []; tagFormRef.value?.clearValidate() }
const resetAutoMergeForm = () => { currentAutoMergeId.value = null; autoMergeForm.name = ''; autoMergeForm.executionMode = 'PROJECT_BOUND'; autoMergeForm.description = ''; autoMergeForm.bindingId = bindingOptions.value[0]?.id ?? null; autoMergeForm.apiBaseUrl = DEFAULT_GITLAB_API_URL; autoMergeForm.gitlabProjectRef = ''; autoMergeForm.apiToken = ''; autoMergeForm.sourceBranch = ''; autoMergeForm.targetBranch = ''; autoMergeForm.titleKeyword = ''; autoMergeForm.schedulerEnabled = false; autoMergeForm.schedulerCron = '0 */5 * * * *'; autoMergeForm.enabled = true; autoMergeForm.autoMerge = true; autoMergeForm.squashOnMerge = false; autoMergeForm.removeSourceBranch = true; autoMergeForm.triggerPipelineAfterMerge = false; autoMergeForm.requirePipelineSuccess = true; autoMergeForm.reviewAgentId = reviewAgentOptions.value[0]?.id ?? null; autoMergeForm.aiReviewEnabled = false; autoMergeForm.aiReviewPrompt = ''; cronTemplate.value = ''; autoMergeFormRef.value?.clearValidate() }

const loadBaseOptions = async () => {
  const [projects, bindings, agents] = await Promise.all([listProjectOptions(), listGitlabBindingOptions(), listAgentOptions()])
  projectOptions.value = projects
  bindingOptions.value = bindings
  reviewAgentOptions.value = agents.filter(item => item.accessType === 'BUILT_IN' && item.builtinCode === 'CODE_REVIEW')
  if (!bindingForm.projectId && projectOptions.value.length > 0) bindingForm.projectId = projectOptions.value[0].id
  if (!autoMergeForm.bindingId && bindingOptions.value.length > 0) autoMergeForm.bindingId = bindingOptions.value[0].id
  if (!autoMergeForm.reviewAgentId && reviewAgentOptions.value.length > 0) autoMergeForm.reviewAgentId = reviewAgentOptions.value[0].id
}
const loadBindings = async () => { bindingLoading.value = true; try { const pageData = await pageGitlabBindings({ page: bindingPagination.page, size: bindingPagination.size, keyword: bindingFilters.keyword, projectId: bindingFilters.projectId }); bindingList.value = pageData.records; bindingPagination.total = pageData.total } finally { bindingLoading.value = false } }
const loadAutoMergeConfigs = async () => { autoMergeLoading.value = true; try { const pageData = await pageGitlabAutoMergeConfigs({ page: autoMergePagination.page, size: autoMergePagination.size, keyword: autoMergeFilters.keyword, executionMode: autoMergeFilters.executionMode, enabled: autoMergeFilters.enabled }); autoMergeList.value = pageData.records; autoMergePagination.total = pageData.total } finally { autoMergeLoading.value = false } }
const loadAutoMergeLogs = async () => { logLoading.value = true; try { const pageData = await pageGitlabAutoMergeLogs({ page: logPagination.page, size: logPagination.size, result: logFilters.result, triggerType: logFilters.triggerType }); logList.value = pageData.records; logPagination.total = pageData.total } finally { logLoading.value = false } }
const refreshAll = async () => { await loadBaseOptions(); await Promise.all([loadBindings(), loadAutoMergeConfigs(), loadAutoMergeLogs()]) }

const handleBindingSearch = async () => { bindingFilterPopoverVisible.value = false; bindingPagination.page = 1; await loadBindings() }
const handleBindingReset = async () => { bindingFilters.keyword = ''; bindingFilters.projectId = undefined; bindingPagination.page = 1; await loadBindings() }
const handleBindingSizeChange = async () => { bindingPagination.page = 1; await loadBindings() }
const handleBindingPrevPage = async () => { if (bindingPagination.page <= 1) return; bindingPagination.page -= 1; await loadBindings() }
const handleBindingNextPage = async () => { if (bindingPagination.page >= bindingTotalPages.value) return; bindingPagination.page += 1; await loadBindings() }
const handleAutoMergeSearch = async () => { autoMergeFilterPopoverVisible.value = false; autoMergePagination.page = 1; await loadAutoMergeConfigs() }
const handleAutoMergeReset = async () => { autoMergeFilters.keyword = ''; autoMergeFilters.executionMode = undefined; autoMergeFilters.enabled = undefined; autoMergePagination.page = 1; await loadAutoMergeConfigs() }
const handleAutoMergeSizeChange = async () => { autoMergePagination.page = 1; await loadAutoMergeConfigs() }
const handleAutoMergePrevPage = async () => { if (autoMergePagination.page <= 1) return; autoMergePagination.page -= 1; await loadAutoMergeConfigs() }
const handleAutoMergeNextPage = async () => { if (autoMergePagination.page >= autoMergeTotalPages.value) return; autoMergePagination.page += 1; await loadAutoMergeConfigs() }
const handleLogSearch = async () => { logFilterPopoverVisible.value = false; logPagination.page = 1; await loadAutoMergeLogs() }
const handleLogReset = async () => { logFilters.result = undefined; logFilters.triggerType = undefined; logPagination.page = 1; await loadAutoMergeLogs() }
const handleLogSizeChange = async () => { logPagination.page = 1; await loadAutoMergeLogs() }
const handleLogPrevPage = async () => { if (logPagination.page <= 1) return; logPagination.page -= 1; await loadAutoMergeLogs() }
const handleLogNextPage = async () => { if (logPagination.page >= logTotalPages.value) return; logPagination.page += 1; await loadAutoMergeLogs() }
const handleCronTemplateChange = (value: string) => { if (value) { autoMergeForm.schedulerEnabled = true; autoMergeForm.schedulerCron = value } }

const resolveGitlabProjectUrl = (explicitUrl?: string | null, apiBaseUrl?: string | null, projectRef?: string | null) => {
  if (explicitUrl && explicitUrl.trim()) return explicitUrl.trim()
  if (!apiBaseUrl || !projectRef) return null
  const ref = projectRef.trim()
  if (!ref || /^\d+$/.test(ref)) return null
  const base = apiBaseUrl.replace(/\/api\/v4\/?$/, '').replace(/\/+$/, '')
  return `${base}/${ref}`
}

const getLogInitiatorDisplay = (log: GitlabAutoMergeLogItem | null | undefined) => {
  if (!log) return '-'
  if (log.mergeRequestAuthorUsername && log.mergeRequestAuthorName) {
    return `${log.mergeRequestAuthorName} (${log.mergeRequestAuthorUsername})`
  }
  return log.mergeRequestAuthorUsername || log.mergeRequestAuthorName || '-'
}

const buildFallbackLogMarkdown = (log: GitlabAutoMergeLogItem | null) => {
  if (!log) return ''
  const lines = [
    '# 合并日志详情',
    '',
    `- 策略：${log.configName || '-'}`,
    `- 触发方式：${log.triggerType === 'SCHEDULED' ? '定时调度' : '手动执行'}`,
    `- 执行结果：${log.result || '-'}`,
    `- 执行时间：${log.executedAt || '-'}`,
    `- 发起人：${getLogInitiatorDisplay(log)}`,
    '',
    '## 原因摘要',
    '',
    log.reason || '-'
  ]
  if (log.mergeRequestIid) {
    lines.splice(5, 0, `- Merge Request：!${log.mergeRequestIid} ${log.mergeRequestTitle || ''}`.trim())
  }
  if (log.webUrl) {
    lines.push('', '## Link', '', `[Open](${log.webUrl})`)
  }
  return lines.join('\n')
}

const openLogDetail = (row: GitlabAutoMergeLogItem) => {
  currentLogDetail.value = row
  logDetailVisible.value = true
}

// Tag 创建需要先基于当前仓库远程拉取分支列表，避免用户手输分支导致误打标。
const loadTagBranches = async (keyword = '') => {
  if (!currentTagBinding.value) return
  tagBranchLoading.value = true
  try {
    tagBranchOptions.value = await listGitlabBranches(currentTagBinding.value.id, keyword)
    if (!tagForm.branchName) {
      const preferredBranch = currentTagBinding.value.defaultTargetBranch || tagBranchOptions.value.find((item) => item.defaultBranch)?.name || ''
      if (preferredBranch) {
        tagForm.branchName = preferredBranch
      }
    }
  } finally {
    tagBranchLoading.value = false
  }
}

const handleTagBranchSearch = (keyword: string) => {
  void loadTagBranches(keyword)
}

const openBindingCreateDialog = () => { bindingIsEditing.value = false; resetBindingForm(); bindingDialogVisible.value = true }
const openBindingEditDialog = (row: ProjectGitlabBindingItem) => { bindingIsEditing.value = true; currentBindingId.value = row.id; bindingForm.projectId = row.projectId; bindingForm.apiBaseUrl = row.apiBaseUrl; bindingForm.gitlabProjectRef = row.gitlabProjectPath || row.gitlabProjectRef; bindingForm.defaultTargetBranch = row.defaultTargetBranch || ''; bindingForm.apiToken = ''; bindingForm.enabled = row.enabled; bindingDialogVisible.value = true }
const handleBindingSubmit = async () => { const valid = await bindingFormRef.value?.validate().catch(() => false); if (!valid || bindingForm.projectId === null) return; if (!bindingIsEditing.value && !bindingForm.apiToken.trim()) { ElMessage.warning('新增绑定时必须填写 APIToken'); return } bindingSubmitting.value = true; try { const payload = { ...bindingForm, projectId: bindingForm.projectId }; if (bindingIsEditing.value && currentBindingId.value !== null) { await updateGitlabBinding(currentBindingId.value, payload); ElMessage.success('GitLab 绑定已更新') } else { await createGitlabBinding(payload); ElMessage.success('GitLab 绑定已创建') } bindingDialogVisible.value = false; await refreshAll() } catch (error: any) { ElMessage.error(error?.response?.data?.message || '保存失败') } finally { bindingSubmitting.value = false } }
const handleBindingDelete = async (id: number) => { try { await ElMessageBox.confirm('删除绑定后，关联的自动合并策略也会受影响，是否继续？', '提示', { type: 'warning' }); await deleteGitlabBinding(id); ElMessage.success('绑定已删除'); await refreshAll() } catch (error: any) { if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '删除失败') } }
const handleBindingTest = async (id: number) => { try { const result = await testGitlabBinding(id); ElMessage.success(`连接成功：${result.gitlabProjectPath || result.gitlabProjectRef}`); await refreshAll() } catch (error: any) { ElMessage.error(error?.response?.data?.message || '连接测试失败') } }
const openTagCreateDialog = async (row: ProjectGitlabBindingItem) => { resetTagForm(); currentTagBinding.value = row; tagDialogVisible.value = true; await loadTagBranches() }
const handleTagSubmit = async () => { const valid = await tagFormRef.value?.validate().catch(() => false); if (!valid || !currentTagBinding.value) return; tagSubmitting.value = true; try { const result = await createGitlabTag(currentTagBinding.value.id, { tagName: tagForm.tagName.trim(), branchName: tagForm.branchName.trim(), message: tagForm.message.trim() || undefined }); tagResult.value = result; tagDialogVisible.value = false; tagResultVisible.value = true; ElMessage.success(`Tag ${result.tagName} 已创建`) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '创建 Tag 失败') } finally { tagSubmitting.value = false } }
const openBindingMergeRequests = async (row: ProjectGitlabBindingItem) => { mergeRequestDrawerTitle.value = `绑定仓库 MR 预览 - ${row.projectName} / ${row.gitlabProjectPath || row.gitlabProjectRef}`; mergeRequestDrawerVisible.value = true; mergeRequestLoading.value = true; try { mergeRequestList.value = await previewBindingMergeRequests(row.id, row.defaultTargetBranch || undefined) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载 MR 失败') } finally { mergeRequestLoading.value = false } }

const openAutoMergeCreateDialog = () => { autoMergeReadonlyMode.value = false; autoMergeIsEditing.value = false; resetAutoMergeForm(); autoMergeDialogVisible.value = true }
const fillAutoMergeForm = (row: GitlabAutoMergeConfigItem) => { autoMergeIsEditing.value = true; currentAutoMergeId.value = row.id; autoMergeForm.name = row.name; autoMergeForm.executionMode = row.executionMode; autoMergeForm.description = row.description; autoMergeForm.bindingId = row.bindingId; autoMergeForm.apiBaseUrl = row.apiBaseUrl; autoMergeForm.gitlabProjectRef = row.executionMode === 'STANDALONE' ? row.gitlabProjectRef : ''; autoMergeForm.apiToken = ''; autoMergeForm.sourceBranch = row.sourceBranch || ''; autoMergeForm.targetBranch = row.targetBranch || ''; autoMergeForm.titleKeyword = row.titleKeyword || ''; autoMergeForm.schedulerEnabled = row.schedulerEnabled; autoMergeForm.schedulerCron = row.schedulerCron || '0 */5 * * * *'; autoMergeForm.enabled = row.enabled; autoMergeForm.autoMerge = row.autoMerge; autoMergeForm.squashOnMerge = row.squashOnMerge; autoMergeForm.removeSourceBranch = row.removeSourceBranch; autoMergeForm.triggerPipelineAfterMerge = row.triggerPipelineAfterMerge; autoMergeForm.requirePipelineSuccess = row.requirePipelineSuccess; autoMergeForm.reviewAgentId = row.reviewAgentId; autoMergeForm.aiReviewEnabled = row.aiReviewEnabled; autoMergeForm.aiReviewPrompt = row.aiReviewPrompt || ''; cronTemplate.value = '' }
const openAutoMergeDetailDialog = (row: GitlabAutoMergeConfigItem) => { autoMergeReadonlyMode.value = true; fillAutoMergeForm(row); autoMergeDialogVisible.value = true }
const openAutoMergeEditDialog = (row: GitlabAutoMergeConfigItem) => { autoMergeReadonlyMode.value = false; fillAutoMergeForm(row); autoMergeDialogVisible.value = true }
const handleAutoMergeSubmit = async () => { const valid = await autoMergeFormRef.value?.validate().catch(() => false); if (!valid) return; if (autoMergeForm.executionMode === 'PROJECT_BOUND' && !autoMergeForm.bindingId) { ElMessage.warning('关联业务项目模式必须选择 GitLab 绑定'); return } if (autoMergeForm.executionMode === 'STANDALONE') { if (!autoMergeForm.apiBaseUrl.trim() || !autoMergeForm.gitlabProjectRef.trim()) { ElMessage.warning('独立运行模式必须填写 GitLab API 和项目标识'); return } if (!autoMergeIsEditing.value && !autoMergeForm.apiToken.trim()) { ElMessage.warning('独立运行模式新增时必须填写 APIToken'); return } if (autoMergeForm.triggerPipelineAfterMerge) { ElMessage.warning('独立运行模式不支持合并后自动触发 Jenkins'); return } } if (autoMergeForm.schedulerEnabled && !autoMergeForm.schedulerCron.trim()) { ElMessage.warning('启用调度时必须填写 Cron 表达式'); return } if (autoMergeForm.aiReviewEnabled && !autoMergeForm.reviewAgentId) { ElMessage.warning('启用 AI Review 时必须选择模型'); return } autoMergeSubmitting.value = true; try { const payload = { ...autoMergeForm, schedulerCron: autoMergeForm.schedulerCron.trim() }; if (autoMergeIsEditing.value && currentAutoMergeId.value !== null) { await updateGitlabAutoMergeConfig(currentAutoMergeId.value, payload); ElMessage.success('自动合并策略已更新') } else { await createGitlabAutoMergeConfig(payload); ElMessage.success('自动合并策略已创建') } autoMergeDialogVisible.value = false; await refreshAll() } catch (error: any) { ElMessage.error(error?.response?.data?.message || '保存失败') } finally { autoMergeSubmitting.value = false } }
const handleAutoMergeDelete = async (id: number) => { try { await ElMessageBox.confirm('确认删除该自动合并策略吗？', '提示', { type: 'warning' }); await deleteGitlabAutoMergeConfig(id); ElMessage.success('自动合并策略已删除'); await refreshAll() } catch (error: any) { if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '删除失败') } }
const handleAutoMergeTest = async (id: number) => { try { await testGitlabAutoMergeConfig(id); ElMessage.success('策略测试成功') } catch (error: any) { ElMessage.error(error?.response?.data?.message || '策略测试失败') } }
const openAutoMergeMergeRequests = async (row: GitlabAutoMergeConfigItem) => { mergeRequestDrawerTitle.value = `自动合并 MR 预览 - ${row.name}`; mergeRequestDrawerVisible.value = true; mergeRequestLoading.value = true; try { mergeRequestList.value = await previewAutoMergeConfigMergeRequests(row.id) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载 MR 失败') } finally { mergeRequestLoading.value = false } }
const handleAutoMergeRun = async (id: number) => { try { const result = await runAutoMergeConfig(id); runResult.value = result; runResultVisible.value = true; ElMessage.success(`执行完成：成功 ${result.mergedCount}，未合并 ${result.skippedCount}`); await Promise.all([loadAutoMergeConfigs(), loadAutoMergeLogs()]) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '执行失败'); await loadAutoMergeLogs() } }

const bindingSummary = computed(() => bindingOptions.value.length)
const recentExecutionLogs = computed(() => logList.value.slice(0, 6))
const gitlabOverviewCards = computed(() => [
  { label: '项目绑定', value: bindingPagination.total, caption: '已接入平台项目与 GitLab 仓库的映射数量' },
  { label: '自动策略', value: autoMergePagination.total, caption: '当前可执行的自动合并策略总数' },
  { label: '启用策略', value: autoMergeList.value.filter((item) => item.enabled).length, caption: '当前页中处于启用状态的自动策略数量' },
  { label: '异常日志', value: logList.value.filter((item) => item.result === 'FAILED' || item.result === 'AI_REJECTED').length, caption: '当前页日志里需要优先关注的失败或拒绝记录' }
])
onMounted(async () => { await refreshAll(); if (bindingSummary.value === 0) activeTab.value = 'bindings' })
</script>

<style scoped>
.gitlab-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.gitlab-page-stack,
.gitlab-section-stack {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.card-header,
.filter-form,
.pagination-wrap {
  display: flex;
  align-items: center;
}

.gitlab-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.gitlab-page-breadcrumb {
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.gitlab-page-title {
  margin: 8px 0 0;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 42px;
  line-height: 1.05;
  font-weight: 800;
}

.gitlab-page-subtitle {
  margin: 8px 0 0;
  color: var(--app-text-soft);
  font-size: 14px;
}

.gitlab-page-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.gitlab-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.gitlab-overview-card {
  padding: 18px 18px 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
}

.gitlab-overview-label {
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.gitlab-overview-value {
  margin-top: 10px;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
}

.gitlab-overview-caption {
  margin-top: 8px;
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.7;
}

.gitlab-page :deep(.el-space),
.gitlab-page :deep(.el-space__wrapper),
.gitlab-page :deep(.el-tabs),
.gitlab-page :deep(.el-tabs__content),
.gitlab-page :deep(.el-tab-pane),
.gitlab-page :deep(.el-card) {
  width: 100%;
}
.gitlab-page :deep(.el-card__body) {
  width: 100%;
  overflow-x: auto;
}

.gitlab-binding-table,
.gitlab-auto-merge-table,
.gitlab-log-table {
  min-width: 1160px;
}

.gitlab-binding-col-main { width: 28%; }
.gitlab-binding-col-branch { width: 12%; }
.gitlab-binding-col-api { width: 18%; }
.gitlab-binding-col-status { width: 8%; }
.gitlab-binding-col-test { width: 10%; }
.gitlab-binding-col-updated { width: 12%; }
.gitlab-binding-col-actions { width: 12%; }

.gitlab-auto-col-main { width: 24%; }
.gitlab-auto-col-mode { width: 10%; }
.gitlab-auto-col-rule { width: 18%; }
.gitlab-auto-col-scheduler { width: 18%; }
.gitlab-auto-col-enabled { width: 8%; }
.gitlab-auto-col-run { width: 10%; }
.gitlab-auto-col-actions { width: 12%; }

.gitlab-log-col-main { width: 26%; }
.gitlab-log-col-trigger { width: 10%; }
.gitlab-log-col-user { width: 12%; }
.gitlab-log-col-result { width: 10%; }
.gitlab-log-col-reason { width: 22%; }
.gitlab-log-col-link { width: 8%; }
.gitlab-log-col-actions { width: 12%; }

.gitlab-binding-col-api .management-list-link {
  color: var(--app-text);
}

.gitlab-binding-col-api .management-list-link:hover {
  color: var(--app-primary);
}

.gitlab-title-link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 800;
}

.gitlab-title-link:hover {
  color: var(--app-primary);
}

.gitlab-mono-text {
  font-family: var(--app-font-mono);
}

.gitlab-meta-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
}

.gitlab-meta-note {
  color: #758393;
}

.gitlab-action-button.connection:hover,
.gitlab-action-button.preview:hover {
  color: #00658f;
}

.gitlab-action-button.run:hover {
  color: #8b5e34;
}

.gitlab-empty-row {
  padding: 56px 16px !important;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.gitlab-alert {
  box-shadow: none;
}

.gitlab-tabs {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.gitlab-tabs :deep(.el-tabs__header) {
  display: none;
}

.gitlab-tabs :deep(.el-tabs__content) {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: visible;
}

.gitlab-tabs :deep(.el-tab-pane) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.gitlab-tab-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: 8px;
  background: rgba(225, 227, 228, 0.56);
}

.gitlab-tab-button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7c8794;
  font-size: 12px;
  font-weight: 800;
}

.gitlab-tab-button.active {
  background: #fff;
  color: var(--app-primary);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.gitlab-bindings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
}

.gitlab-main-card {
  min-width: 0;
}

.gitlab-list-page {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.gitlab-list-page .management-list-toolbar {
  flex: 0 0 auto;
}

.gitlab-list-page .management-list-toolbar-main {
  width: fit-content;
  max-width: 100%;
  justify-self: start;
  flex: 0 1 auto;
}

.gitlab-list-page .management-list-search-shell {
  flex: 0 1 280px;
  width: 280px;
  max-width: min(280px, 100%);
}

.gitlab-list-page .management-list-toolbar-side {
  min-width: max-content;
}

.gitlab-list-page .management-list-shell {
  flex: 1 1 auto;
  min-height: 0;
}

.gitlab-list-page .management-list-table-scroll {
  min-height: 0;
}

.gitlab-list-page .management-list-footer {
  flex: 0 0 auto;
}

.gitlab-side-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.gitlab-side-log {
  padding: 18px;
  border-radius: 24px;
  background: #24292d;
  color: #f4f7f8;
}

.gitlab-side-log-title,
.gitlab-side-summary-title {
  font-family: var(--app-font-heading);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
}

.gitlab-side-log-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gitlab-side-log-item {
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.gitlab-side-log-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.gitlab-side-log-time {
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-family: var(--app-font-mono);
}

.gitlab-side-log-text {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 1.7;
}

.gitlab-side-summary {
  padding: 18px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
}

.gitlab-side-summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(137, 115, 98, 0.12);
  color: var(--app-text-soft);
  font-size: 13px;
}

.gitlab-side-summary-item strong {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 24px;
  line-height: 1;
}

.auto-merge-form :deep(.el-form-item__label) {
  white-space: nowrap;
}
.auto-merge-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 16px;
}
.auto-merge-grid .span-2 {
  grid-column: 1 / -1;
}
.auto-merge-grid :deep(.el-form-item) {
  margin-bottom: 16px;
}
.auto-merge-form :deep(.el-divider__text) {
  font-weight: 600;
}
.card-header { justify-content: space-between; }
.filter-form { margin-bottom: 18px; flex-wrap: wrap; }
.pagination-wrap { justify-content: flex-end; margin-top: 20px; }
.form-tip { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; margin-top: 6px; }
.log-detail-markdown { margin-top: 16px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 16px; background: var(--el-fill-color-blank); line-height: 1.8; }
.log-detail-markdown :deep(h1),
.log-detail-markdown :deep(h2),
.log-detail-markdown :deep(h3) { margin: 0 0 12px; }
.log-detail-markdown :deep(p) { margin: 0 0 12px; }
.log-detail-markdown :deep(ul),
.log-detail-markdown :deep(ol) { padding-left: 20px; margin: 0 0 12px; }
.log-detail-markdown :deep(pre) { overflow: auto; padding: 12px; border-radius: 6px; background: var(--el-fill-color-light); }
.log-detail-markdown :deep(code) { font-family: var(--app-font-mono); }

@media (max-width: 1100px) {
  .gitlab-page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .gitlab-page-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .gitlab-tab-switcher {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .gitlab-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gitlab-bindings-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .gitlab-overview {
    grid-template-columns: 1fr;
  }
}
</style>
