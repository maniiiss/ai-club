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
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'productBranches' }" type="button" @click="activeTab = 'productBranches'">产品分支</button>
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
              <template v-if="!isMobileViewport">
              <table class="management-list-table gitlab-binding-table mobile-card-table">
                <thead>
                  <tr>
                    <th class="gitlab-binding-col-main">仓库绑定</th>
                    <th class="gitlab-binding-col-branch">默认目标分支</th>
                    <th class="gitlab-binding-col-api">API 地址</th>
                    <th class="center gitlab-binding-col-status">状态</th>
                    <th class="gitlab-binding-col-structure">代码结构</th>
                    <th class="center gitlab-binding-col-test">连通性</th>
                    <th class="gitlab-binding-col-updated">最近测试</th>
                    <th class="right gitlab-binding-col-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!bindingList.length">
                    <td colspan="8" class="gitlab-empty-row">暂无仓库绑定</td>
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
                    <td class="gitlab-binding-col-structure" data-label="代码结构">
                      <div class="gitlab-meta-stack">
                        <span class="management-list-updated">{{ row.codeStructureGeneratedAt ? formatDateTimeText(row.codeStructureGeneratedAt) : '-' }}</span>
                        <span class="gitlab-meta-note">{{ formatCodeStructureStatusLabel(row.codeStructureStatus) }}</span>
                      </div>
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
                        <el-tooltip content="发起扫描" placement="top">
                          <button class="management-list-row-button gitlab-action-button scan" type="button" aria-label="发起仓库规范扫描" @click="openBindingScanDialog(row)">
                            <el-icon><Search /></el-icon>
                          </button>
                        </el-tooltip>
                        <el-tooltip v-if="canSyncBindingApi(row)" content="同步 API" placement="top">
                          <button class="management-list-row-button gitlab-action-button api-sync" type="button" aria-label="同步 API" @click="openApiSyncDialog(row)">
                            <el-icon><Connection /></el-icon>
                          </button>
                        </el-tooltip>
                        <el-tooltip content="代码结构" placement="top">
                          <button class="management-list-row-button gitlab-action-button preview" type="button" aria-label="查看仓库代码结构" @click="openBindingCodeStructure(row)">
                            <el-icon><Share /></el-icon>
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
              </template>
              <template v-else>
                <div v-if="bindingList.length" class="mobile-entity-list-shell">
                  <div class="mobile-entity-list">
                    <article v-for="row in bindingList" :key="row.id" class="mobile-entity-card">
                      <header class="mobile-entity-card-header">
                        <div class="mobile-entity-header-static">
                          <span class="mobile-entity-icon"><el-icon><FolderOpened /></el-icon></span>
                          <span class="mobile-entity-copy">
                            <span class="mobile-entity-title">{{ row.gitlabProjectPath || row.gitlabProjectRef }}</span>
                            <span class="mobile-entity-description">{{ buildBindingSubtitle(row) }}</span>
                          </span>
                        </div>
                      </header>
                      <div class="mobile-entity-fields">
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">分支</span>
                          <div class="mobile-entity-field-content">
                            <span class="mobile-entity-empty-text">{{ row.defaultTargetBranch || '-' }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field mobile-entity-field-full">
                          <span class="mobile-entity-field-label">API</span>
                          <div class="mobile-entity-field-content">
                            <a v-if="row.apiBaseUrl" class="management-list-link gitlab-mono-text" :href="row.apiBaseUrl" target="_blank" rel="noreferrer">
                              {{ row.apiBaseUrl }}
                            </a>
                            <span v-else class="mobile-entity-empty-text">-</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">状态</span>
                          <div class="mobile-entity-field-content">
                            <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">{{ row.enabled ? '启用' : '停用' }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">连通</span>
                          <div class="mobile-entity-field-content">
                            <span class="management-list-pill" :class="bindingStatusType(row.lastTestStatus)">{{ formatBindingStatusLabel(row.lastTestStatus) }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field mobile-entity-field-full">
                          <span class="mobile-entity-field-label">测试</span>
                          <div class="mobile-entity-field-content">
                            <div class="mobile-entity-meta-stack">
                              <span class="mobile-entity-empty-text">{{ formatDateTimeText(row.lastTestedAt) }}</span>
                              <span class="mobile-entity-empty-text">{{ row.lastTestMessage || '尚未执行连接测试' }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <footer class="mobile-entity-actions">
                        <button class="mobile-entity-action-button info" type="button" @click="handleBindingTest(row.id)">
                          <el-icon><Connection /></el-icon>
                          <span>测试连接</span>
                        </button>
                        <button class="mobile-entity-action-button info" type="button" @click="openBindingMergeRequests(row)">
                          <el-icon><Tickets /></el-icon>
                          <span>查看合并请求</span>
                        </button>
                        <button class="mobile-entity-action-button" type="button" @click="openTagCreateDialog(row)">
                          <el-icon><Plus /></el-icon>
                          <span>创建 Tag</span>
                        </button>
                        <button class="mobile-entity-action-button info" type="button" @click="openBindingScanDialog(row)">
                          <el-icon><Search /></el-icon>
                          <span>发起扫描</span>
                        </button>
                        <button v-if="canSyncBindingApi(row)" class="mobile-entity-action-button info" type="button" @click="openApiSyncDialog(row)">
                          <el-icon><Connection /></el-icon>
                          <span>同步 API</span>
                        </button>
                        <button class="mobile-entity-action-button info" type="button" @click="openBindingCodeStructure(row)">
                          <el-icon><Share /></el-icon>
                          <span>代码结构</span>
                        </button>
                        <button class="mobile-entity-action-button" type="button" @click="openBindingEditDialog(row)">
                          <el-icon><EditPen /></el-icon>
                          <span>编辑</span>
                        </button>
                        <button class="mobile-entity-action-button danger" type="button" @click="handleBindingDelete(row.id)">
                          <el-icon><Delete /></el-icon>
                          <span>删除</span>
                        </button>
                      </footer>
                    </article>
                  </div>
                  <div v-if="hasMoreBindingItems" ref="bindingSentinelRef" class="mobile-waterfall-sentinel"></div>
                </div>
                <div v-if="!bindingList.length" class="mobile-entity-empty-state">
                  <el-empty description="暂无仓库绑定" />
                </div>
              </template>
            </div>

            <div v-if="showDesktopGitlabPagination" class="management-list-footer">
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

      <el-tab-pane label="产品分支" name="productBranches">
        <div class="management-list-page gitlab-list-page">
          <section class="management-list-toolbar">
            <div class="management-list-toolbar-main">
              <div class="gitlab-tab-switcher" role="tablist" aria-label="GitLab 页面切换">
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'bindings' }" type="button" @click="activeTab = 'bindings'">项目绑定</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'productBranches' }" type="button" @click="activeTab = 'productBranches'">产品分支</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'autoMerge' }" type="button" @click="activeTab = 'autoMerge'">自动合并中心</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'logs' }" type="button" @click="activeTab = 'logs'">自动合并日志</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'ownerRepos' }" type="button" @click="activeTab = 'ownerRepos'">业主仓库</button>
              </div>
              <span class="management-list-toolbar-divider" aria-hidden="true"></span>
              <el-select v-model="currentProductBindingId" placeholder="请选择 GitLab 绑定" style="width: 360px" @change="handleProductBindingChange">
                <el-option
                  v-for="binding in bindingOptions"
                  :key="binding.id"
                  :label="`${binding.projectName} / ${binding.gitlabProjectPath || binding.gitlabProjectRef}`"
                  :value="binding.id"
                />
              </el-select>
              <span class="management-list-toolbar-divider" aria-hidden="true"></span>
              <div class="gitlab-meta-stack" v-if="currentProductBinding">
                <span>产品主线：{{ currentProductBinding.productMainBranch || '未配置' }}</span>
                <span>默认目标分支：{{ currentProductBinding.defaultTargetBranch || '-' }}</span>
              </div>
            </div>
            <div class="management-list-toolbar-side gitlab-product-toolbar-side">
              <button class="management-list-toolbar-button" type="button" @click="openProductBranchSyncLogs" :disabled="!currentProductBindingId">
                <el-icon><DocumentCopy /></el-icon>
                <span>同步日志</span>
              </button>
              <button class="management-list-toolbar-button" type="button" @click="openProductBranchSyncDialog()" :disabled="!canManageProductBranches || !selectedProductBranchIds.length">
                <el-icon><Connection /></el-icon>
                <span>批量同步</span>
              </button>
              <button class="management-list-create-button" type="button" @click="openProductBranchCreateDialog" :disabled="!currentProductBindingId">
                <el-icon><Plus /></el-icon>
                <span>新增分支</span>
              </button>
            </div>
          </section>

          <section class="management-list-shell">
            <div v-if="currentProductBinding && !currentProductBinding.productMainBranch" class="mobile-entity-empty-state gitlab-product-empty">
              <el-empty description="当前绑定尚未配置产品主线分支">
                <el-button type="primary" @click="openBindingEditDialog(currentProductBinding)">去配置主线</el-button>
              </el-empty>
            </div>

            <div v-else class="management-list-table-scroll mobile-card-scroll" v-loading="productBranchLoading">
              <template v-if="!isMobileViewport">
                <table class="management-list-table gitlab-product-branch-table mobile-card-table">
                  <colgroup>
                    <col class="gitlab-product-col-select" />
                    <col class="gitlab-product-col-main" />
                    <col class="gitlab-product-col-branch" />
                    <col class="gitlab-product-col-status" />
                    <col class="gitlab-product-col-mr" />
                    <col class="gitlab-product-col-enabled" />
                    <col class="gitlab-product-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="center">
                        <el-checkbox
                          :model-value="selectedProductBranchIds.length > 0 && selectedProductBranchIds.length === enabledProductBranches.length"
                          :indeterminate="selectedProductBranchIds.length > 0 && selectedProductBranchIds.length < enabledProductBranches.length"
                          @change="selectedProductBranchIds = $event ? enabledProductBranches.map((item) => item.id) : []"
                        />
                      </th>
                      <th>产品线</th>
                      <th>Git 分支</th>
                      <th>同步状态</th>
                      <th>开放 MR</th>
                      <th class="center">启用</th>
                      <th class="right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="!productBranchList.length">
                      <td colspan="7" class="gitlab-empty-row">暂无产品分支</td>
                    </tr>
                    <tr v-for="row in productBranchList" :key="row.id" class="management-list-row">
                      <td class="center gitlab-product-col-select">
                        <el-checkbox
                          :model-value="selectedProductBranchIds.includes(row.id)"
                          :disabled="!row.enabled"
                          @change="(checked: boolean) => selectedProductBranchIds = checked ? [...new Set([...selectedProductBranchIds, row.id])] : selectedProductBranchIds.filter((id) => id !== row.id)"
                        />
                      </td>
                      <td class="gitlab-product-col-main">
                        <div class="management-list-title-cell">
                          <span class="management-list-title-icon"><el-icon><FolderOpened /></el-icon></span>
                          <div class="management-list-title-copy">
                            <div class="management-list-title">{{ row.lineName }}</div>
                            <div class="management-list-subtitle">{{ row.lineCode }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="gitlab-product-col-branch">
                        <div class="gitlab-meta-stack">
                          <span>分线：{{ row.branchName }}</span>
                          <span>落后提交：{{ row.behindCount }}</span>
                          <span>{{ row.hasDiffWithMainline ? '主线有待同步变更' : '已与主线对齐' }}</span>
                        </div>
                      </td>
                      <td class="gitlab-product-col-status">
                        <div class="gitlab-meta-stack">
                          <span class="management-list-pill" :class="runStatusType(row.lastSyncStatus)">{{ productBranchSyncResultText(row.lastSyncStatus) }}</span>
                          <span class="gitlab-meta-note">上次：{{ formatDateTimeText(row.lastSyncAt) }}</span>
                          <span class="gitlab-meta-note">{{ row.lastSyncMessage || '暂无同步记录' }}</span>
                        </div>
                      </td>
                      <td class="gitlab-product-col-mr">
                        <div class="gitlab-meta-stack">
                          <span>{{ row.hasOpenSyncMr ? `开放 MR：!${row.openSyncMergeRequestIid}` : '无开放同步 MR' }}</span>
                          <a v-if="row.openSyncMergeRequestWebUrl" class="management-list-link" :href="row.openSyncMergeRequestWebUrl" target="_blank" rel="noreferrer">打开 MR</a>
                          <a v-else-if="row.lastSyncMrUrl" class="management-list-link" :href="row.lastSyncMrUrl" target="_blank" rel="noreferrer">最近同步 MR</a>
                          <span v-else class="management-list-empty">-</span>
                        </div>
                      </td>
                      <td class="center gitlab-product-col-enabled">
                        <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">{{ row.enabled ? '启用' : '停用' }}</span>
                      </td>
                      <td class="right gitlab-product-col-actions">
                        <div class="management-list-row-actions">
                          <el-tooltip content="同步主线" placement="top">
                            <button class="management-list-row-button gitlab-action-button run" type="button" :disabled="!currentProductBinding?.productMainBranch || !row.enabled" @click="openProductBranchSyncDialog([row.id])">
                              <el-icon><Connection /></el-icon>
                            </button>
                          </el-tooltip>
                          <el-tooltip content="编辑分线" placement="top">
                            <button class="management-list-row-button gitlab-action-button" type="button" @click="openProductBranchEditDialog(row)">
                              <el-icon><EditPen /></el-icon>
                            </button>
                          </el-tooltip>
                          <el-tooltip content="删除分线" placement="top">
                            <button class="management-list-row-button gitlab-action-button danger" type="button" @click="handleProductBranchDelete(row)">
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
                <div v-if="productBranchList.length" class="mobile-entity-list-shell">
                  <div class="mobile-entity-list">
                    <article v-for="row in productBranchList" :key="row.id" class="mobile-entity-card">
                      <header class="mobile-entity-card-header">
                        <div class="mobile-entity-header-static">
                          <span class="mobile-entity-icon"><el-icon><FolderOpened /></el-icon></span>
                          <span class="mobile-entity-copy">
                            <span class="mobile-entity-title">{{ row.lineName }}</span>
                            <span class="mobile-entity-description">{{ row.lineCode }}</span>
                          </span>
                        </div>
                      </header>
                      <div class="mobile-entity-fields">
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">分支</span>
                          <div class="mobile-entity-field-content">
                            <span class="mobile-entity-empty-text">{{ row.branchName }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">落后</span>
                          <div class="mobile-entity-field-content">
                            <span class="mobile-entity-empty-text">{{ row.behindCount }} 个提交</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">启用</span>
                          <div class="mobile-entity-field-content">
                            <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">{{ row.enabled ? '启用' : '停用' }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field mobile-entity-field-full">
                          <span class="mobile-entity-field-label">同步</span>
                          <div class="mobile-entity-field-content">
                            <div class="mobile-entity-meta-stack">
                              <span class="mobile-entity-empty-text">{{ productBranchSyncResultText(row.lastSyncStatus) }}</span>
                              <span class="mobile-entity-empty-text">{{ row.lastSyncMessage || '暂无同步记录' }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <footer class="mobile-entity-actions">
                        <button class="mobile-entity-action-button info" type="button" @click="openProductBranchSyncDialog([row.id])" :disabled="!currentProductBinding?.productMainBranch || !row.enabled">
                          <el-icon><Connection /></el-icon>
                          <span>同步主线</span>
                        </button>
                        <button class="mobile-entity-action-button" type="button" @click="openProductBranchEditDialog(row)">
                          <el-icon><EditPen /></el-icon>
                          <span>编辑</span>
                        </button>
                        <button class="mobile-entity-action-button danger" type="button" @click="handleProductBranchDelete(row)">
                          <el-icon><Delete /></el-icon>
                          <span>删除</span>
                        </button>
                      </footer>
                    </article>
                  </div>
                </div>
                <div v-else class="mobile-entity-empty-state">
                  <el-empty description="暂无产品分支" />
                </div>
              </template>
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
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'productBranches' }" type="button" @click="activeTab = 'productBranches'">产品分支</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'autoMerge' }" type="button" @click="activeTab = 'autoMerge'">自动合并中心</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'logs' }" type="button" @click="activeTab = 'logs'">自动合并日志</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'ownerRepos' }" type="button" @click="activeTab = 'ownerRepos'">业主仓库</button>
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
            <template v-if="!isMobileViewport">
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
                      <span>严格度：{{ formatReviewStrictnessLabel(row.reviewStrictness) }}</span>
                      <span>合并后流水线：{{ buildAutoMergePipelineSelectionText(row) }}</span>
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
                      <el-tooltip content="Webhook 通知" placement="top">
                        <button class="management-list-row-button gitlab-action-button" type="button" aria-label="管理自动合并 Webhook" @click="openAutoMergeWebhookDialog(row.id)">
                          <el-icon><Bell /></el-icon>
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
            </template>
            <template v-else>
              <div v-if="autoMergeList.length" class="mobile-entity-list-shell">
                <div class="mobile-entity-list">
                  <article v-for="row in autoMergeList" :key="row.id" class="mobile-entity-card">
                    <header class="mobile-entity-card-header">
                      <button class="mobile-entity-header-trigger" type="button" @click="openAutoMergeDetailDialog(row)">
                        <span class="mobile-entity-icon"><el-icon><Tickets /></el-icon></span>
                        <span class="mobile-entity-copy">
                          <span class="mobile-entity-title">{{ row.name }}</span>
                          <span class="mobile-entity-description">{{ buildAutoMergeSubtitle(row) }}</span>
                        </span>
                      </button>
                    </header>
                    <div class="mobile-entity-fields">
                      <div class="mobile-entity-field">
                        <span class="mobile-entity-field-label">模式</span>
                        <div class="mobile-entity-field-content">
                          <span class="management-list-pill" :class="row.executionMode === 'STANDALONE' ? 'warning' : 'info'">
                            {{ formatExecutionModeLabel(row.executionMode) }}
                          </span>
                        </div>
                      </div>
                      <div class="mobile-entity-field mobile-entity-field-full">
                        <span class="mobile-entity-field-label">规则</span>
                        <div class="mobile-entity-field-content">
                          <div class="mobile-entity-meta-stack">
                            <span class="mobile-entity-empty-text">源分支：{{ row.sourceBranch || '不限' }}</span>
                            <span class="mobile-entity-empty-text">目标分支：{{ row.targetBranch || '不限' }}</span>
                            <span class="mobile-entity-empty-text">标题关键字：{{ row.titleKeyword || '不限' }}</span>
                          </div>
                        </div>
                      </div>
                      <div class="mobile-entity-field mobile-entity-field-full">
                        <span class="mobile-entity-field-label">调度</span>
                        <div class="mobile-entity-field-content">
                          <div class="mobile-entity-meta-stack">
                            <span class="mobile-entity-empty-text">{{ row.schedulerEnabled ? `Cron：${row.schedulerCron || '-'}` : '未启用调度' }}</span>
                            <span class="mobile-entity-empty-text">AI 审核：{{ row.aiReviewEnabled ? (row.reviewAgentName || '已启用') : '关闭' }}</span>
                            <span class="mobile-entity-empty-text">严格度：{{ formatReviewStrictnessLabel(row.reviewStrictness) }}</span>
                            <span class="mobile-entity-empty-text">合并后流水线：{{ buildAutoMergePipelineSelectionText(row) }}</span>
                          </div>
                        </div>
                      </div>
                      <div class="mobile-entity-field">
                        <span class="mobile-entity-field-label">启用</span>
                        <div class="mobile-entity-field-content">
                          <span class="management-list-pill" :class="row.enabled ? 'success' : 'neutral'">{{ row.enabled ? '启用' : '停用' }}</span>
                        </div>
                      </div>
                      <div class="mobile-entity-field mobile-entity-field-full">
                        <span class="mobile-entity-field-label">执行</span>
                        <div class="mobile-entity-field-content">
                          <div class="mobile-entity-meta-stack">
                            <span class="management-list-pill" :class="runStatusType(row.lastRunStatus)">{{ formatRunStatusLabel(row.lastRunStatus) }}</span>
                            <span class="mobile-entity-empty-text">上次：{{ formatDateTimeText(row.lastRunAt) }}</span>
                            <span class="mobile-entity-empty-text">下次：{{ formatDateTimeText(row.nextExecutionTime) }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <footer class="mobile-entity-actions">
                      <button class="mobile-entity-action-button info" type="button" @click="handleAutoMergeTest(row.id)">
                        <el-icon><Connection /></el-icon>
                        <span>测试策略</span>
                      </button>
                      <button class="mobile-entity-action-button info" type="button" @click="openAutoMergeMergeRequests(row)">
                        <el-icon><DocumentCopy /></el-icon>
                        <span>预览 MR</span>
                      </button>
                      <button class="mobile-entity-action-button info" type="button" @click="handleAutoMergeRun(row.id)">
                        <el-icon><VideoPlay /></el-icon>
                        <span>立即执行</span>
                      </button>
                      <button class="mobile-entity-action-button" type="button" @click="openAutoMergeEditDialog(row)">
                        <el-icon><EditPen /></el-icon>
                        <span>编辑</span>
                      </button>
                      <button class="mobile-entity-action-button" type="button" @click="openAutoMergeWebhookDialog(row.id)">
                        <el-icon><Bell /></el-icon>
                        <span>Webhook</span>
                      </button>
                      <button class="mobile-entity-action-button danger" type="button" @click="handleAutoMergeDelete(row.id)">
                        <el-icon><Delete /></el-icon>
                        <span>删除</span>
                      </button>
                    </footer>
                  </article>
                </div>
                <div v-if="hasMoreAutoMergeItems" ref="autoMergeSentinelRef" class="mobile-waterfall-sentinel"></div>
              </div>
              <div v-if="!autoMergeList.length" class="mobile-entity-empty-state">
                <el-empty description="暂无自动合并策略" />
              </div>
            </template>
          </div>

          <div v-if="showDesktopGitlabPagination" class="management-list-footer">
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
                  <button class="gitlab-tab-button" :class="{ active: activeTab === 'productBranches' }" type="button" @click="activeTab = 'productBranches'">产品分支</button>
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
              <template v-if="!isMobileViewport">
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
              </template>
              <template v-else>
                <div v-if="logList.length" class="mobile-entity-list-shell">
                  <div class="mobile-entity-list">
                    <article v-for="row in logList" :key="row.id" class="mobile-entity-card">
                      <header class="mobile-entity-card-header">
                        <button class="mobile-entity-header-trigger" type="button" @click="openLogDetail(row)">
                          <span class="mobile-entity-icon"><el-icon><DocumentCopy /></el-icon></span>
                          <span class="mobile-entity-copy">
                            <span class="mobile-entity-title">{{ row.configName || '自动合并执行' }}</span>
                            <span class="mobile-entity-description">{{ buildLogSubtitle(row) }}</span>
                          </span>
                        </button>
                      </header>
                      <div class="mobile-entity-fields">
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">触发</span>
                          <div class="mobile-entity-field-content">
                            <span class="management-list-pill" :class="row.triggerType === 'SCHEDULED' ? 'warning' : 'info'">{{ formatTriggerTypeLabel(row.triggerType) }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">发起人</span>
                          <div class="mobile-entity-field-content">
                            <span class="mobile-entity-empty-text">{{ getLogInitiatorDisplay(row) }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">结果</span>
                          <div class="mobile-entity-field-content">
                            <span class="management-list-pill" :class="logResultType(row.result)">{{ logResultText(row.result) }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field mobile-entity-field-full">
                          <span class="mobile-entity-field-label">原因</span>
                          <div class="mobile-entity-field-content">
                            <span class="mobile-entity-empty-text">{{ row.reason || '-' }}</span>
                          </div>
                        </div>
                        <div class="mobile-entity-field">
                          <span class="mobile-entity-field-label">链接</span>
                          <div class="mobile-entity-field-content">
                            <a v-if="row.webUrl" class="management-list-link" :href="row.webUrl" target="_blank" rel="noreferrer">打开</a>
                            <span v-else class="mobile-entity-empty-text">-</span>
                          </div>
                        </div>
                      </div>
                      <footer class="mobile-entity-actions">
                        <button class="mobile-entity-action-button info" type="button" @click="openLogDetail(row)">
                          <el-icon><DocumentCopy /></el-icon>
                          <span>查看详情</span>
                        </button>
                      </footer>
                    </article>
                  </div>
                  <div v-if="hasMoreLogItems" ref="logSentinelRef" class="mobile-waterfall-sentinel"></div>
                </div>
                <div v-if="!logList.length" class="mobile-entity-empty-state">
                  <el-empty description="暂无自动合并日志" />
                </div>
              </template>
            </div>

            <div v-if="showDesktopGitlabPagination" class="management-list-footer">
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

      <el-tab-pane label="业主仓库" name="ownerRepos">
        <div class="management-list-page">
          <div class="management-list-toolbar">
            <div class="management-list-toolbar-main">
              <div class="gitlab-tab-group">
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'bindings' }" type="button" @click="activeTab = 'bindings'">项目绑定</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'productBranches' }" type="button" @click="activeTab = 'productBranches'">产品分支</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'autoMerge' }" type="button" @click="activeTab = 'autoMerge'">自动合并中心</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'logs' }" type="button" @click="activeTab = 'logs'">自动合并日志</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'ownerRepos' }" type="button" @click="activeTab = 'ownerRepos'">业主仓库</button>
                <button class="gitlab-tab-button" :class="{ active: activeTab === 'ownerRepos' }" type="button" @click="activeTab = 'ownerRepos'">业主仓库</button>
              </div>
              <input v-model="ownerRepoFilters.keyword" class="management-list-search-input" placeholder="搜索业主仓库" @keyup.enter="handleOwnerRepoSearch" />
              <el-popover :visible="ownerRepoFilterPopoverVisible" placement="bottom" :width="240" trigger="manual">
                <template #reference>
                  <button class="management-list-filter-button" type="button" @click="ownerRepoFilterPopoverVisible = !ownerRepoFilterPopoverVisible">
                    <el-icon><Filter /></el-icon><span>筛选</span>
                  </button>
                </template>
                <div class="management-list-filter-popover">
                  <el-select v-model="ownerRepoFilters.projectId" placeholder="选择项目" clearable filterable teleported=false>
                    <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
                  </el-select>
                  <div class="management-list-filter-actions">
                    <el-button size="small" @click="ownerRepoFilterPopoverVisible = false">取消</el-button>
                    <el-button size="small" type="primary" @click="handleOwnerRepoSearch">查询</el-button>
                  </div>
                </div>
              </el-popover>
            </div>
            <div class="management-list-toolbar-side">
              <button v-if="canManageOwnerRepo" class="management-list-create-button" type="button" @click="handleOwnerRepoCreate">
                <el-icon><Plus /></el-icon><span>新增业主仓库</span>
              </button>
            </div>
          </div>
          <div class="management-list-shell">
            <div class="management-list-table-scroll" v-loading="ownerRepoLoading">
              <table v-if="!isMobileViewport" class="management-list-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>项目</th>
                    <th>业主仓库</th>
                    <th>默认分支</th>
                    <th>推送方式</th>
                    <th>最近推送</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in ownerRepoList" :key="item.id">
                    <td>{{ item.name }}</td>
                    <td>{{ item.projectName }}</td>
                    <td>
                      <el-link v-if="item.gitlabProjectWebUrl" :href="item.gitlabProjectWebUrl" target="_blank" type="primary">{{ item.gitlabProjectPath || item.gitlabProjectRef }}</el-link>
                      <span v-else>{{ item.gitlabProjectRef }}</span>
                    </td>
                    <td>{{ item.defaultTargetBranch || '—' }}</td>
                    <td><el-tag size="small" :type="ownerRepoPushModeTagType(item.defaultPushMode)">{{ ownerRepoPushModeLabel(item.defaultPushMode) }}</el-tag></td>
                    <td>
                      <el-tag v-if="item.lastPushStatus" size="small" :type="ownerRepoStatusTagType(item.lastPushStatus)">{{ ownerRepoStatusTagType(item.lastPushStatus) === 'success' ? '成功' : '失败' }}</el-tag>
                      <span v-else>—</span>
                    </td>
                    <td>
                      <div class="management-list-row-actions">
                        <el-tooltip content="推送" placement="top"><button class="management-list-row-button gitlab-action-button" type="button" @click="handleOwnerRepoPush(item)"><el-icon><Upload /></el-icon></button></el-tooltip>
                        <el-tooltip content="测试连接" placement="top"><button v-if="canManageOwnerRepo" class="management-list-row-button gitlab-action-button" type="button" :loading="ownerRepoTestingId === item.id" @click="handleOwnerRepoTest(item.id)"><el-icon><Connection /></el-icon></button></el-tooltip>
                        <el-tooltip content="推送历史" placement="top"><button class="management-list-row-button gitlab-action-button" type="button" @click="handleOwnerRepoViewLogs(item)"><el-icon><Tickets /></el-icon></button></el-tooltip>
                        <el-tooltip content="编辑" placement="top"><button v-if="canManageOwnerRepo" class="management-list-row-button gitlab-action-button" type="button" @click="handleOwnerRepoEdit(item)"><el-icon><EditPen /></el-icon></button></el-tooltip>
                        <el-tooltip content="删除" placement="top"><button v-if="canManageOwnerRepo" class="management-list-row-button gitlab-action-button danger" type="button" @click="handleOwnerRepoDelete(item.id)"><el-icon><Delete /></el-icon></button></el-tooltip>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="ownerRepoList.length === 0"><td colspan="7" class="management-list-empty">暂无业主仓库绑定</td></tr>
                </tbody>
              </table>
              <div v-else class="mobile-entity-list-shell">
                <div v-for="item in ownerRepoList" :key="item.id" class="mobile-entity-card">
                  <div class="mobile-entity-card-header">
                    <span class="mobile-entity-card-title">{{ item.name }}</span>
                    <el-tag size="small" :type="ownerRepoPushModeTagType(item.defaultPushMode)">{{ ownerRepoPushModeLabel(item.defaultPushMode) }}</el-tag>
                  </div>
                  <div class="mobile-entity-card-body">
                    <div>{{ item.projectName }} · {{ item.gitlabProjectPath || item.gitlabProjectRef }}</div>
                    <div>默认分支：{{ item.defaultTargetBranch || '—' }}</div>
                  </div>
                  <div class="mobile-entity-card-actions">
                    <el-button size="small" type="primary" @click="handleOwnerRepoPush(item)">推送</el-button>
                    <el-button size="small" @click="handleOwnerRepoViewLogs(item)">历史</el-button>
                  </div>
                </div>
                <div v-if="ownerRepoList.length === 0" class="management-list-empty">暂无业主仓库绑定</div>
              </div>
              <div class="management-list-pagination">
                <button class="management-list-page-button" type="button" :disabled="ownerRepoPagination.page <= 1" @click="ownerRepoPagination.page--; loadOwnerRepoBindings()"><el-icon><ArrowLeft /></el-icon></button>
                <span>{{ ownerRepoPagination.page }} / {{ ownerRepoTotalPages }}</span>
                <button class="management-list-page-button" type="button" :disabled="ownerRepoPagination.page >= ownerRepoTotalPages" @click="ownerRepoPagination.page++; loadOwnerRepoBindings()"><el-icon><ArrowRight /></el-icon></button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
</div>
</div>

  <el-dialog v-if="!isMobileViewport" v-model="bindingDialogVisible" :title="bindingDialogTitle" width="760px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="bindingDialogTitle" :subtitle="bindingDialogSubtitle" :icon="FolderOpened" />
    </template>
    <el-form ref="bindingFormRef" :model="bindingForm" :rules="bindingRules" label-position="top" class="platform-form-layout">
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
        <el-form-item label="产品主线分支"><el-input v-model="bindingForm.productMainBranch" placeholder="例如：main" /></el-form-item>
        <el-form-item label="APIToken"><el-input v-model="bindingForm.apiToken" type="password" show-password :placeholder="bindingIsEditing ? '留空则保留原 Token' : '请输入 APIToken'" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="bindingForm.enabled" /></el-form-item>
      </section>
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">测试模板</div>
          <div class="platform-form-section-subtitle">为开发执行的 TEST 步骤声明浏览器烟测或服务烟测规则；留空则仅执行命令型 Harness。</div>
        </div>
        <el-form-item label="仓库类型">
          <el-select v-model="bindingForm.repoKind" clearable placeholder="不配置则仅执行 COMMAND suite" style="width: 100%">
            <el-option label="前端仓库" value="FRONTEND" />
            <el-option label="后端仓库" value="BACKEND" />
            <el-option label="混合仓库" value="MIXED" />
          </el-select>
          <div class="form-tip">只在需要 sidecar 烟测时填写，系统会按仓库类型补充 Playwright 或服务健康检查。</div>
        </el-form-item>
        <el-form-item label="测试工作目录">
          <el-input v-model="bindingForm.workingDir" placeholder="例如 frontend 或 backend；留空表示仓库根目录" />
        </el-form-item>
        <el-form-item label="启动命令">
          <el-input
            v-model="bindingForm.startCommand"
            placeholder="例如 npm run dev、pnpm preview、mvn spring-boot:run"
          />
          <div class="form-tip">前端与后端 sidecar 共用这条启动命令；命令型 Harness 仍沿用现有平台推荐逻辑。</div>
        </el-form-item>
        <el-row v-if="showFrontendTestProfile || showBackendTestProfile" :gutter="12">
          <el-col :span="12">
            <el-form-item label="基础访问地址">
              <el-input v-model="bindingForm.baseUrl" placeholder="留空时由运行时自动分配本地端口并拼装地址" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="包管理器">
              <el-select v-model="bindingForm.packageManager" clearable placeholder="可选，默认按锁文件推断" style="width: 100%">
                <el-option label="npm" value="npm" />
                <el-option label="pnpm" value="pnpm" />
                <el-option label="yarn" value="yarn" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="showFrontendTestProfile">
          <el-form-item label="烟测页面路径">
            <el-input
              v-model="bindingForm.smokePathsText"
              type="textarea"
              :rows="4"
              placeholder="每行一个路径，例如：&#10;/&#10;/login&#10;/dashboard"
            />
            <div class="form-tip">留空时默认访问 `/`。建议只放少量关键页面，避免 TEST 步骤耗时过长。</div>
          </el-form-item>
          <el-form-item label="页面就绪选择器">
            <el-input v-model="bindingForm.readySelector" placeholder="例如 #app、[data-testid=&quot;dashboard-ready&quot;]" />
          </el-form-item>
        </template>

        <template v-if="showBackendTestProfile">
          <el-form-item label="健康检查路径">
            <el-input v-model="bindingForm.healthPath" placeholder="例如 /actuator/health 或 /health" />
          </el-form-item>
          <div class="platform-form-inline-head">
            <div>
              <div class="platform-form-inline-title">HTTP Smoke 列表</div>
              <div class="platform-form-inline-subtitle">逐条声明需要校验的方法、路径与期望状态码。</div>
            </div>
            <el-button type="primary" link @click="addBindingHttpCheck">新增检查</el-button>
          </div>
          <div v-if="bindingForm.httpChecks.length" class="binding-http-check-list">
            <div v-for="(item, index) in bindingForm.httpChecks" :key="`http-check-${index}`" class="binding-http-check-row">
              <el-input v-model="item.name" placeholder="检查名称" />
              <el-select v-model="item.method" placeholder="方法">
                <el-option label="GET" value="GET" />
                <el-option label="POST" value="POST" />
                <el-option label="PUT" value="PUT" />
                <el-option label="DELETE" value="DELETE" />
              </el-select>
              <el-input v-model="item.path" placeholder="路径，例如 /api/ping" />
              <div class="binding-http-check-actions">
                <el-input-number
                  v-model="item.expectedStatus"
                  class="binding-http-check-status"
                  :min="100"
                  :max="599"
                  :step="1"
                  controls-position="right"
                />
                <el-button class="binding-http-check-remove" text type="danger" @click="removeBindingHttpCheck(index)">删除</el-button>
              </div>
            </div>
          </div>
          <div v-else class="form-tip">还没有配置 HTTP 检查。仅填写健康检查路径也可以跑最小服务烟测。</div>
        </template>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="bindingDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="bindingSubmitting" @click="handleBindingSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端 GitLab 绑定抽屉，表单较长使用全屏高度。 -->
  <MobileFormDrawer
    v-else-if="isMobileViewport && bindingDialogVisible"
    v-model="bindingDialogVisible"
    :title="bindingDialogTitle"
    :subtitle="bindingDialogSubtitle"
    :submit-text="'保存'"
    :submitting="bindingSubmitting"
    :header-icon="FolderOpened"
    :close-on-click-modal="true"
    size="100%"
    @submit="handleBindingSubmit"
    @cancel="bindingDialogVisible = false"
  >
    <el-form ref="bindingFormRef" :model="bindingForm" :rules="bindingRules" label-position="top" class="platform-form-layout">
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
        <el-form-item label="产品主线分支"><el-input v-model="bindingForm.productMainBranch" placeholder="例如：main" /></el-form-item>
        <el-form-item label="APIToken"><el-input v-model="bindingForm.apiToken" type="password" show-password :placeholder="bindingIsEditing ? '留空则保留原 Token' : '请输入 APIToken'" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="bindingForm.enabled" /></el-form-item>
      </section>
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">测试模板</div>
          <div class="platform-form-section-subtitle">为开发执行的 TEST 步骤声明浏览器烟测或服务烟测规则；留空则仅执行命令型 Harness。</div>
        </div>
        <el-form-item label="仓库类型">
          <el-select v-model="bindingForm.repoKind" clearable placeholder="不配置则仅执行 COMMAND suite" style="width: 100%">
            <el-option label="前端仓库" value="FRONTEND" />
            <el-option label="后端仓库" value="BACKEND" />
            <el-option label="混合仓库" value="MIXED" />
          </el-select>
          <div class="form-tip">只在需要 sidecar 烟测时填写，系统会按仓库类型补充 Playwright 或服务健康检查。</div>
        </el-form-item>
        <el-form-item label="测试工作目录">
          <el-input v-model="bindingForm.workingDir" placeholder="例如 frontend 或 backend；留空表示仓库根目录" />
        </el-form-item>
        <el-form-item label="启动命令">
          <el-input
            v-model="bindingForm.startCommand"
            placeholder="例如 npm run dev、pnpm preview、mvn spring-boot:run"
          />
          <div class="form-tip">前端与后端 sidecar 共用这条启动命令；命令型 Harness 仍沿用现有平台推荐逻辑。</div>
        </el-form-item>
        <el-row v-if="showFrontendTestProfile || showBackendTestProfile" :gutter="12">
          <el-col :span="12">
            <el-form-item label="基础访问地址">
              <el-input v-model="bindingForm.baseUrl" placeholder="留空时由运行时自动分配本地端口并拼装地址" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="包管理器">
              <el-select v-model="bindingForm.packageManager" clearable placeholder="可选，默认按锁文件推断" style="width: 100%">
                <el-option label="npm" value="npm" />
                <el-option label="pnpm" value="pnpm" />
                <el-option label="yarn" value="yarn" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="showFrontendTestProfile">
          <el-form-item label="烟测页面路径">
            <el-input
              v-model="bindingForm.smokePathsText"
              type="textarea"
              :rows="4"
              placeholder="每行一个路径，例如：&#10;/&#10;/login&#10;/dashboard"
            />
            <div class="form-tip">留空时默认访问 `/`。建议只放少量关键页面，避免 TEST 步骤耗时过长。</div>
          </el-form-item>
          <el-form-item label="页面就绪选择器">
            <el-input v-model="bindingForm.readySelector" placeholder="例如 #app、[data-testid=&quot;dashboard-ready&quot;]" />
          </el-form-item>
        </template>

        <template v-if="showBackendTestProfile">
          <el-form-item label="健康检查路径">
            <el-input v-model="bindingForm.healthPath" placeholder="例如 /actuator/health 或 /health" />
          </el-form-item>
          <div class="platform-form-inline-head">
            <div>
              <div class="platform-form-inline-title">HTTP Smoke 列表</div>
              <div class="platform-form-inline-subtitle">逐条声明需要校验的方法、路径与期望状态码。</div>
            </div>
            <el-button type="primary" link @click="addBindingHttpCheck">新增检查</el-button>
          </div>
          <div v-if="bindingForm.httpChecks.length" class="binding-http-check-list">
            <div v-for="(item, index) in bindingForm.httpChecks" :key="`http-check-${index}`" class="binding-http-check-row">
              <el-input v-model="item.name" placeholder="检查名称" />
              <el-select v-model="item.method" placeholder="方法">
                <el-option label="GET" value="GET" />
                <el-option label="POST" value="POST" />
                <el-option label="PUT" value="PUT" />
                <el-option label="DELETE" value="DELETE" />
              </el-select>
              <el-input v-model="item.path" placeholder="路径，例如 /api/ping" />
              <div class="binding-http-check-actions">
                <el-input-number
                  v-model="item.expectedStatus"
                  class="binding-http-check-status"
                  :min="100"
                  :max="599"
                  :step="1"
                  controls-position="right"
                />
                <el-button class="binding-http-check-remove" text type="danger" @click="removeBindingHttpCheck(index)">删除</el-button>
              </div>
            </div>
          </div>
          <div v-else class="form-tip">还没有配置 HTTP 检查。仅填写健康检查路径也可以跑最小服务烟测。</div>
        </template>
      </section>
    </el-form>
  </MobileFormDrawer>

  <el-dialog v-if="!isMobileViewport" v-model="tagDialogVisible" title="创建 GitLab Tag" width="680px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader title="创建 GitLab Tag" :subtitle="tagDialogSubtitle" :icon="DocumentCopy" />
    </template>
    <el-form ref="tagFormRef" :model="tagForm" :rules="tagRules" label-position="top" class="platform-form-layout">
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
      <div class="platform-dialog-footer">
        <el-button @click="tagDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="tagSubmitting" @click="handleTagSubmit">创建</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端创建 Tag 抽屉。 -->
  <MobileFormDrawer
    v-else-if="isMobileViewport && tagDialogVisible"
    v-model="tagDialogVisible"
    title="创建 GitLab Tag"
    :subtitle="tagDialogSubtitle"
    :submit-text="'创建'"
    :submitting="tagSubmitting"
    :header-icon="DocumentCopy"
    :close-on-click-modal="true"
    size="88%"
    @submit="handleTagSubmit"
    @cancel="tagDialogVisible = false"
  >
    <el-form ref="tagFormRef" :model="tagForm" :rules="tagRules" label-position="top" class="platform-form-layout">
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
  </MobileFormDrawer>

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

  <el-dialog v-if="!isMobileViewport" v-model="scanDialogVisible" title="发起仓库规范扫描" width="680px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader title="发起仓库规范扫描" :subtitle="scanDialogSubtitle" :icon="Search" />
    </template>
    <el-form ref="scanFormRef" :model="scanForm" :rules="scanRules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">扫描配置</div>
          <div class="platform-form-section-subtitle">任务创建后会进入执行中心异步运行，并生成 Markdown、HTML、JSON、SARIF 报告。</div>
        </div>
        <el-form-item label="当前仓库">
          <el-input :model-value="currentScanBinding ? `${currentScanBinding.projectName} / ${currentScanBinding.gitlabProjectPath || currentScanBinding.gitlabProjectRef}` : ''" disabled />
        </el-form-item>
        <el-form-item label="扫描分支" prop="branch">
          <el-select
            v-model="scanForm.branch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索分支"
            style="width: 100%"
            :remote-method="handleScanBranchSearch"
            :loading="scanBranchLoading"
          >
            <el-option
              v-for="branch in scanBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="规则集" prop="rulesetCode">
          <el-select v-model="scanForm.rulesetCode" placeholder="请选择规则集" style="width: 100%">
            <el-option
              v-for="ruleset in scanRulesetOptions"
              :key="ruleset.code"
              :label="ruleset.defaultSelected ? `${ruleset.name}（默认）` : ruleset.name"
              :value="ruleset.code"
            />
          </el-select>
          <div class="form-tip">
            {{
              (() => {
                const selected = scanRulesetOptions.find((item) => item.code === scanForm.rulesetCode)
                if (!selected) return '请选择一个规则集用于扫描。'
                return `${selected.description || '暂无描述'}${selected.engineType ? ` · 引擎 ${selected.engineType}` : ''}${selected.defaultSelected ? ' · 当前系统默认' : ''}`
              })()
            }}
          </div>
        </el-form-item>
        <el-form-item label="计划智能体">
          <el-select v-model="scanForm.planAgentId" clearable placeholder="留空仅生成规则版计划与占位 executable plan" style="width: 100%">
            <el-option
              v-for="agent in scanPlanAgentOptions"
              :key="agent.id"
              :label="agent.name"
              :value="agent.id"
            />
          </el-select>
          <div class="form-tip">
            {{
              (() => {
                if (!scanPlanAgentOptions.length) return '当前没有可用的仓库扫描计划智能体，扫描完成后只会生成规则版计划。'
                const selected = scanPlanAgentOptions.find((item) => item.id === scanForm.planAgentId)
                if (!selected) return '留空表示仅生成规则版计划与占位 executable plan。'
                return `${selected.description || '使用该智能体对规则计划和扫描报告做进一步分析'} · 仅支持内置仓库扫描计划智能体`
              })()
            }}
          </div>
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="scanDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="scanSubmitting" @click="handleScanSubmit">创建扫描任务</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端规范扫描抽屉。 -->
  <MobileFormDrawer
    v-else-if="isMobileViewport && scanDialogVisible"
    v-model="scanDialogVisible"
    title="发起仓库规范扫描"
    :subtitle="scanDialogSubtitle"
    :submit-text="'创建扫描任务'"
    :submitting="scanSubmitting"
    :header-icon="Search"
    :close-on-click-modal="true"
    size="88%"
    @submit="handleScanSubmit"
    @cancel="scanDialogVisible = false"
  >
    <el-form ref="scanFormRef" :model="scanForm" :rules="scanRules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">扫描配置</div>
          <div class="platform-form-section-subtitle">任务创建后会进入执行中心异步运行，并生成 Markdown、HTML、JSON、SARIF 报告。</div>
        </div>
        <el-form-item label="当前仓库">
          <el-input :model-value="currentScanBinding ? `${currentScanBinding.projectName} / ${currentScanBinding.gitlabProjectPath || currentScanBinding.gitlabProjectRef}` : ''" disabled />
        </el-form-item>
        <el-form-item label="扫描分支" prop="branch">
          <el-select
            v-model="scanForm.branch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索分支"
            style="width: 100%"
            :remote-method="handleScanBranchSearch"
            :loading="scanBranchLoading"
          >
            <el-option
              v-for="branch in scanBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="规则集" prop="rulesetCode">
          <el-select v-model="scanForm.rulesetCode" placeholder="请选择规则集" style="width: 100%">
            <el-option
              v-for="ruleset in scanRulesetOptions"
              :key="ruleset.code"
              :label="ruleset.defaultSelected ? `${ruleset.name}（默认）` : ruleset.name"
              :value="ruleset.code"
            />
          </el-select>
          <div class="form-tip">
            {{
              (() => {
                const selected = scanRulesetOptions.find((item) => item.code === scanForm.rulesetCode)
                if (!selected) return '请选择一个规则集用于扫描。'
                return `${selected.description || '暂无描述'}${selected.engineType ? ` · 引擎 ${selected.engineType}` : ''}${selected.defaultSelected ? ' · 当前系统默认' : ''}`
              })()
            }}
          </div>
        </el-form-item>
        <el-form-item label="计划智能体">
          <el-select v-model="scanForm.planAgentId" clearable placeholder="留空仅生成规则版计划与占位 executable plan" style="width: 100%">
            <el-option
              v-for="agent in scanPlanAgentOptions"
              :key="agent.id"
              :label="agent.name"
              :value="agent.id"
            />
          </el-select>
          <div class="form-tip">
            {{
              (() => {
                if (!scanPlanAgentOptions.length) return '当前没有可用的仓库扫描计划智能体，扫描完成后只会生成规则版计划。'
                const selected = scanPlanAgentOptions.find((item) => item.id === scanForm.planAgentId)
                if (!selected) return '留空表示仅生成规则版计划与占位 executable plan。'
                return `${selected.description || '使用该智能体对规则计划和扫描报告做进一步分析'} · 仅支持内置仓库扫描计划智能体`
              })()
            }}
          </div>
        </el-form-item>
      </section>
    </el-form>
  </MobileFormDrawer>

  <el-dialog v-if="!isMobileViewport" v-model="apiSyncDialogVisible" title="同步 API" width="680px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader title="同步 API" :subtitle="apiSyncDialogSubtitle" :icon="Connection" />
    </template>
    <el-form label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">同步配置</div>
          <div class="platform-form-section-subtitle">系统会读取后端或混合仓库中的 Spring 接口，并写入当前项目的 API 工作台。</div>
        </div>
        <el-form-item label="当前仓库">
          <el-input :model-value="currentApiSyncBinding ? `${currentApiSyncBinding.projectName} / ${currentApiSyncBinding.gitlabProjectPath || currentApiSyncBinding.gitlabProjectRef}` : ''" disabled />
        </el-form-item>
        <el-form-item label="同步分支">
          <el-select
            v-model="apiSyncForm.branch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索分支"
            style="width: 100%"
            :remote-method="handleApiSyncBranchSearch"
            :loading="apiSyncBranchLoading"
          >
            <el-option
              v-for="branch in apiSyncBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
          <div class="form-tip">同步会覆盖平台生成的 API 项，并保留人工在 API 工作台维护的内容。</div>
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="apiSyncDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="apiSyncSubmitting" @click="handleApiSyncSubmit">同步 API</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端 API 同步抽屉。 -->
  <MobileFormDrawer
    v-else-if="isMobileViewport && apiSyncDialogVisible"
    v-model="apiSyncDialogVisible"
    title="同步 API"
    :subtitle="apiSyncDialogSubtitle"
    :submit-text="'同步 API'"
    :submitting="apiSyncSubmitting"
    :header-icon="Connection"
    :close-on-click-modal="true"
    size="88%"
    @submit="handleApiSyncSubmit"
    @cancel="apiSyncDialogVisible = false"
  >
    <el-form label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">同步配置</div>
          <div class="platform-form-section-subtitle">系统会读取后端或混合仓库中的 Spring 接口，并写入当前项目的 API 工作台。</div>
        </div>
        <el-form-item label="当前仓库">
          <el-input :model-value="currentApiSyncBinding ? `${currentApiSyncBinding.projectName} / ${currentApiSyncBinding.gitlabProjectPath || currentApiSyncBinding.gitlabProjectRef}` : ''" disabled />
        </el-form-item>
        <el-form-item label="同步分支">
          <el-select
            v-model="apiSyncForm.branch"
            filterable
            remote
            reserve-keyword
            placeholder="请输入关键字搜索分支"
            style="width: 100%"
            :remote-method="handleApiSyncBranchSearch"
            :loading="apiSyncBranchLoading"
          >
            <el-option
              v-for="branch in apiSyncBranchOptions"
              :key="branch.name"
              :label="branch.defaultBranch ? `${branch.name}（默认）` : branch.name"
              :value="branch.name"
            />
          </el-select>
          <div class="form-tip">同步会覆盖平台生成的 API 项，并保留人工在 API 工作台维护的内容。</div>
        </el-form-item>
      </section>
    </el-form>
  </MobileFormDrawer>

  <el-dialog v-model="apiSyncResultVisible" title="同步 API 结果" width="760px">
    <el-descriptions v-if="apiSyncResult" :column="3" border>
      <el-descriptions-item label="分支">{{ apiSyncResult.branch }}</el-descriptions-item>
      <el-descriptions-item label="提交">{{ apiSyncResult.commitSha || '-' }}</el-descriptions-item>
      <el-descriptions-item label="扫描文件">{{ apiSyncResult.scannedCount }}</el-descriptions-item>
      <el-descriptions-item label="新增">{{ apiSyncResult.createdCount }}</el-descriptions-item>
      <el-descriptions-item label="更新">{{ apiSyncResult.updatedCount }}</el-descriptions-item>
      <el-descriptions-item label="删除">{{ apiSyncResult.deletedCount }}</el-descriptions-item>
      <el-descriptions-item label="跳过">{{ apiSyncResult.skippedCount }}</el-descriptions-item>
      <el-descriptions-item label="完成时间">{{ formatDateTimeText(apiSyncResult.syncedAt) }}</el-descriptions-item>
      <el-descriptions-item label="API 工作台">
        <el-button link type="primary" @click="openApiWorkspace(apiSyncResult.projectId)">打开</el-button>
      </el-descriptions-item>
    </el-descriptions>
    <el-alert
      v-if="apiSyncResult?.warnings?.length"
      class="gitlab-alert"
      type="warning"
      show-icon
      :closable="false"
      style="margin-top: 16px"
    >
      <template #title>同步完成但存在 {{ apiSyncResult.warnings.length }} 条提示</template>
      <ul class="gitlab-api-sync-warning-list">
        <li v-for="(warning, index) in apiSyncResult.warnings" :key="`api-sync-warning-${index}`">{{ warning }}</li>
      </ul>
    </el-alert>
  </el-dialog>

  <el-dialog v-if="!isMobileViewport" v-model="autoMergeDialogVisible" :title="autoMergeDialogTitle" width="760px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="autoMergeDialogTitle" :subtitle="autoMergeDialogSubtitle" :icon="Connection" />
    </template>
    <el-form ref="autoMergeFormRef" class="auto-merge-form platform-form-layout" :model="autoMergeForm" :rules="autoMergeRules" :disabled="autoMergeReadonlyMode" label-position="top">
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
        <el-form-item class="span-2 auto-merge-strictness-item">
          <template #label>
            <span class="auto-merge-label-with-help">
              审查严格度
              <el-tooltip content="高：不规范也拒绝；中：拒绝严重和中等风险；低：仅拒绝严重风险。" placement="top">
                <el-icon class="auto-merge-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-radio-group v-model="autoMergeForm.reviewStrictness" class="auto-merge-strictness-group" :disabled="!autoMergeForm.aiReviewEnabled">
            <el-radio-button label="HIGH">高</el-radio-button>
            <el-radio-button label="MEDIUM">中</el-radio-button>
            <el-radio-button label="LOW">低</el-radio-button>
          </el-radio-group>
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
        <el-form-item class="span-2">
          <template #label>
            <span class="auto-merge-label-with-help">
              合并后触发流水线
              <el-tooltip content="仅关联业务项目模式可用；开启后必须显式选择要触发的 AI Club / Jenkins 流水线。" placement="top">
                <el-icon class="auto-merge-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-switch v-model="autoMergeForm.triggerPipelineAfterMerge" :disabled="autoMergeForm.executionMode !== 'PROJECT_BOUND'" />
        </el-form-item>
        <el-form-item v-if="autoMergeForm.executionMode === 'PROJECT_BOUND' && autoMergeForm.triggerPipelineAfterMerge" class="span-2" label="目标流水线">
          <el-select
            v-model="autoMergeSelectedPipelineKeys"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择至少一条流水线"
            :loading="autoMergePipelineTargetLoading"
            :disabled="autoMergeReadonlyMode"
          >
            <el-option-group v-if="autoMergeAiClubTargetOptions.length" label="AI Club Pipeline">
              <el-option
                v-for="item in autoMergeAiClubTargetOptions"
                :key="buildPipelineTargetKey(item.entryType, item.entryId)"
                :label="`${item.displayName} (${item.providerCode})`"
                :value="buildPipelineTargetKey(item.entryType, item.entryId)"
              />
            </el-option-group>
            <el-option-group v-if="autoMergeJenkinsTargetOptions.length" label="Jenkins">
              <el-option
                v-for="item in autoMergeJenkinsTargetOptions"
                :key="buildPipelineTargetKey(item.entryType, item.entryId)"
                :label="`${item.displayName} (${item.providerCode})`"
                :value="buildPipelineTargetKey(item.entryType, item.entryId)"
              />
            </el-option-group>
          </el-select>
        </el-form-item>
        </div>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button v-if="autoMergeIsEditing && currentAutoMergeId !== null" @click="openAutoMergeWebhookDialog(currentAutoMergeId)">管理 Webhook</el-button>
        <el-button @click="autoMergeDialogVisible = false">{{ autoMergeReadonlyMode ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!autoMergeReadonlyMode" type="primary" :loading="autoMergeSubmitting" @click="handleAutoMergeSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端自动合并策略抽屉，表单较长使用全屏高度。 -->
  <MobileFormDrawer
    v-else-if="isMobileViewport && autoMergeDialogVisible"
    v-model="autoMergeDialogVisible"
    :title="autoMergeDialogTitle"
    :subtitle="autoMergeDialogSubtitle"
    :submit-text="'保存'"
    :submitting="autoMergeSubmitting"
    :header-icon="Connection"
    :close-on-click-modal="true"
    size="100%"
    @submit="handleAutoMergeSubmit"
    @cancel="autoMergeDialogVisible = false"
  >
    <el-form ref="autoMergeFormRef" class="auto-merge-form platform-form-layout" :model="autoMergeForm" :rules="autoMergeRules" :disabled="autoMergeReadonlyMode" label-position="top">
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
        <el-form-item class="span-2 auto-merge-strictness-item">
          <template #label>
            <span class="auto-merge-label-with-help">
              审查严格度
              <el-tooltip content="高：不规范也拒绝；中：拒绝严重和中等风险；低：仅拒绝严重风险。" placement="top">
                <el-icon class="auto-merge-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-radio-group v-model="autoMergeForm.reviewStrictness" class="auto-merge-strictness-group" :disabled="!autoMergeForm.aiReviewEnabled">
            <el-radio-button label="HIGH">高</el-radio-button>
            <el-radio-button label="MEDIUM">中</el-radio-button>
            <el-radio-button label="LOW">低</el-radio-button>
          </el-radio-group>
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
        <el-form-item class="span-2">
          <template #label>
            <span class="auto-merge-label-with-help">
              合并后触发流水线
              <el-tooltip content="仅关联业务项目模式可用；开启后必须显式选择要触发的 AI Club / Jenkins 流水线。" placement="top">
                <el-icon class="auto-merge-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-switch v-model="autoMergeForm.triggerPipelineAfterMerge" :disabled="autoMergeForm.executionMode !== 'PROJECT_BOUND'" />
        </el-form-item>
        <el-form-item v-if="autoMergeForm.executionMode === 'PROJECT_BOUND' && autoMergeForm.triggerPipelineAfterMerge" class="span-2" label="目标流水线">
          <el-select
            v-model="autoMergeSelectedPipelineKeys"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择至少一条流水线"
            :loading="autoMergePipelineTargetLoading"
            :disabled="autoMergeReadonlyMode"
          >
            <el-option-group v-if="autoMergeAiClubTargetOptions.length" label="AI Club Pipeline">
              <el-option
                v-for="item in autoMergeAiClubTargetOptions"
                :key="buildPipelineTargetKey(item.entryType, item.entryId)"
                :label="`${item.displayName} (${item.providerCode})`"
                :value="buildPipelineTargetKey(item.entryType, item.entryId)"
              />
            </el-option-group>
            <el-option-group v-if="autoMergeJenkinsTargetOptions.length" label="Jenkins">
              <el-option
                v-for="item in autoMergeJenkinsTargetOptions"
                :key="buildPipelineTargetKey(item.entryType, item.entryId)"
                :label="`${item.displayName} (${item.providerCode})`"
                :value="buildPipelineTargetKey(item.entryType, item.entryId)"
              />
            </el-option-group>
          </el-select>
        </el-form-item>
        </div>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer mobile-form-drawer-footer">
        <el-button v-if="autoMergeIsEditing && currentAutoMergeId !== null" class="mobile-form-drawer-footer-btn" @click="openAutoMergeWebhookDialog(currentAutoMergeId)">管理 Webhook</el-button>
        <el-button class="mobile-form-drawer-footer-btn" @click="autoMergeDialogVisible = false">{{ autoMergeReadonlyMode ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!autoMergeReadonlyMode" class="mobile-form-drawer-footer-btn is-primary" type="primary" :loading="autoMergeSubmitting" @click="handleAutoMergeSubmit">保存</el-button>
      </div>
    </template>
  </MobileFormDrawer>

  <!-- 自动合并外发 Webhook 管理 dialog：按配置维度展示已挂的全部 Webhook，并提供新增/编辑/删除/测试入口。 -->
  <el-dialog v-model="autoMergeWebhookDialogVisible" title="Webhook 通知" :width="isMobileViewport ? '92%' : '760px'" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader title="Webhook 通知" subtitle="自动合并产生事件后异步投递到这里配置的地址。" :icon="Bell" />
    </template>
    <div class="auto-merge-webhook-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span class="form-tip">合并成功 / AI 拒绝 / 失败 / 跳过 等事件可分别订阅；模板留空则发通用 JSON。</span>
      <el-button type="primary" :icon="Plus" @click="openAutoMergeWebhookCreate">新增 Webhook</el-button>
    </div>
    <el-table v-loading="autoMergeWebhookListLoading" :data="autoMergeWebhookList" empty-text="尚未配置 Webhook" size="small" stripe>
      <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
      <el-table-column prop="targetUrlMasked" label="地址（脱敏）" min-width="180" show-overflow-tooltip />
      <el-table-column label="订阅事件" min-width="180">
        <template #default="{ row }">
          <el-tag v-for="ev in row.subscribedEvents" :key="ev" type="info" size="small" style="margin-right:4px;margin-bottom:2px;">
            {{ autoMergeWebhookEventLabel(ev) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="70">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近投递" min-width="160">
        <template #default="{ row }">
          <div v-if="row.lastDeliveryAt" style="font-size:12px;line-height:1.4;">
            <div>{{ row.lastDeliveryAt }}</div>
            <el-tag :type="autoMergeWebhookStatusKind(row.lastDeliveryStatus)" size="small">{{ row.lastDeliveryStatus || '-' }}</el-tag>
          </div>
          <span v-else style="color:#909399;font-size:12px;">尚未投递</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleAutoMergeWebhookTest(row)">测试</el-button>
          <el-button link type="primary" @click="openAutoMergeWebhookEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleAutoMergeWebhookDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="autoMergeWebhookDialogVisible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 自动合并 Webhook 新增/编辑子 dialog；URL 出于安全只在新增/更新时携带明文，编辑时不会回填。 -->
  <el-dialog v-model="autoMergeWebhookEditDialogVisible" :title="autoMergeWebhookEditingId !== null ? '编辑 Webhook' : '新增 Webhook'" :width="isMobileViewport ? '92%' : '600px'" class="platform-form-dialog" append-to-body align-center>
    <el-form ref="autoMergeWebhookFormRef" :model="autoMergeWebhookForm" :rules="autoMergeWebhookRules" label-position="top">
      <el-form-item label="名称" prop="name">
        <el-input v-model="autoMergeWebhookForm.name" maxlength="120" show-word-limit placeholder="例如：发布群通知" />
      </el-form-item>
      <el-form-item label="Webhook 地址" prop="targetUrl">
        <el-input v-model="autoMergeWebhookForm.targetUrl" maxlength="1000" :placeholder="autoMergeWebhookEditingId !== null ? '编辑模式下需重新输入完整地址' : 'https://…'" />
        <div class="form-tip">支持钉钉/飞书/企业微信群机器人或自建接收端；签名 token 直接拼到 URL 中，落库时整体加密。</div>
      </el-form-item>
      <el-form-item label="订阅事件" prop="subscribedEvents">
        <el-checkbox-group v-model="autoMergeWebhookForm.subscribedEvents">
          <el-checkbox v-for="opt in GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="自定义消息模板">
        <el-input
          v-model="autoMergeWebhookForm.messageTemplate"
          type="textarea"
          :rows="4"
          maxlength="4000"
          show-word-limit
          :placeholder="autoMergeWebhookTemplatePlaceholder"
        />
        <div class="form-tip">填写后自动包装为钉钉/飞书/企微 text 机器人结构 <code>{&quot;msgtype&quot;:&quot;text&quot;,&quot;text&quot;:{&quot;content&quot;:&quot;渲染结果&quot;}}</code>。</div>
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="autoMergeWebhookForm.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="autoMergeWebhookEditDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="autoMergeWebhookSubmitting" @click="handleAutoMergeWebhookSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-if="!isMobileViewport" v-model="productBranchDialogVisible" :title="productBranchDialogTitle" width="680px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="productBranchDialogTitle" :subtitle="productBranchDialogSubtitle" :icon="FolderOpened" />
    </template>
    <el-form ref="productBranchFormRef" :model="productBranchForm" :rules="productBranchRules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">分线信息</div>
          <div class="platform-form-section-subtitle">维护产品线编码、名称和对应的 Git 分支。</div>
        </div>
        <el-form-item label="当前绑定">
          <el-input :model-value="currentProductBinding ? `${currentProductBinding.projectName} / ${currentProductBinding.gitlabProjectPath || currentProductBinding.gitlabProjectRef}` : ''" disabled />
          <div class="form-tip">产品主线：{{ currentProductBinding?.productMainBranch || '未配置' }}</div>
        </el-form-item>
        <el-form-item label="产品线编码" prop="lineCode">
          <el-input v-model="productBranchForm.lineCode" placeholder="例如：line-a" />
        </el-form-item>
        <el-form-item label="产品线名称" prop="lineName">
          <el-input v-model="productBranchForm.lineName" placeholder="例如：A 产品线" />
        </el-form-item>
        <el-form-item label="分线分支" prop="branchName">
          <el-input v-model="productBranchForm.branchName" placeholder="例如：release/a" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="productBranchForm.enabled" />
        </el-form-item>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="productBranchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="productBranchSubmitting" @click="handleProductBranchSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端主线/分线绑定抽屉。 -->
  <MobileFormDrawer
    v-else-if="isMobileViewport && productBranchDialogVisible"
    v-model="productBranchDialogVisible"
    :title="productBranchDialogTitle"
    :subtitle="productBranchDialogSubtitle"
    :submit-text="'保存'"
    :submitting="productBranchSubmitting"
    :header-icon="FolderOpened"
    :close-on-click-modal="true"
    size="88%"
    @submit="handleProductBranchSubmit"
    @cancel="productBranchDialogVisible = false"
  >
    <el-form ref="productBranchFormRef" :model="productBranchForm" :rules="productBranchRules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">分线信息</div>
          <div class="platform-form-section-subtitle">维护产品线编码、名称和对应的 Git 分支。</div>
        </div>
        <el-form-item label="当前绑定">
          <el-input :model-value="currentProductBinding ? `${currentProductBinding.projectName} / ${currentProductBinding.gitlabProjectPath || currentProductBinding.gitlabProjectRef}` : ''" disabled />
          <div class="form-tip">产品主线：{{ currentProductBinding?.productMainBranch || '未配置' }}</div>
        </el-form-item>
        <el-form-item label="产品线编码" prop="lineCode">
          <el-input v-model="productBranchForm.lineCode" placeholder="例如：line-a" />
        </el-form-item>
        <el-form-item label="产品线名称" prop="lineName">
          <el-input v-model="productBranchForm.lineName" placeholder="例如：A 产品线" />
        </el-form-item>
        <el-form-item label="分线分支" prop="branchName">
          <el-input v-model="productBranchForm.branchName" placeholder="例如：release/a" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="productBranchForm.enabled" />
        </el-form-item>
      </section>
    </el-form>
  </MobileFormDrawer>

  <el-dialog v-if="!isMobileViewport" v-model="productBranchSyncDialogVisible" title="批量同步主线到分线" width="720px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader title="批量同步主线到分线" subtitle="系统会按所选产品分线创建主线同步 MR，并返回逐条结果。" :icon="Connection" />
    </template>
    <section class="platform-form-section">
      <div class="platform-form-section-head">
        <div class="platform-form-section-title">同步范围</div>
        <div class="platform-form-section-subtitle">本次同步会以当前绑定的产品主线为源分支。</div>
      </div>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="当前绑定">{{ currentProductBinding ? `${currentProductBinding.projectName} / ${currentProductBinding.gitlabProjectPath || currentProductBinding.gitlabProjectRef}` : '-' }}</el-descriptions-item>
        <el-descriptions-item label="产品主线">{{ currentProductBinding?.productMainBranch || '-' }}</el-descriptions-item>
        <el-descriptions-item label="目标分线数">{{ selectedProductBranchIds.length }}</el-descriptions-item>
        <el-descriptions-item label="目标列表">
          {{ productBranchList.filter((item) => selectedProductBranchIds.includes(item.id)).map((item) => item.lineName).join('、') || '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </section>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="productBranchSyncDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="productBranchSyncSubmitting" @click="handleProductBranchSyncSubmit">创建同步 MR</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 移动端批量同步主线到分线抽屉。 -->
  <MobileFormDrawer
    v-else-if="isMobileViewport && productBranchSyncDialogVisible"
    v-model="productBranchSyncDialogVisible"
    title="批量同步主线到分线"
    subtitle="系统会按所选产品分线创建主线同步 MR，并返回逐条结果。"
    :submit-text="'创建同步 MR'"
    :submitting="productBranchSyncSubmitting"
    :header-icon="Connection"
    :close-on-click-modal="true"
    size="88%"
    @submit="handleProductBranchSyncSubmit"
    @cancel="productBranchSyncDialogVisible = false"
  >
    <section class="platform-form-section">
      <div class="platform-form-section-head">
        <div class="platform-form-section-title">同步范围</div>
        <div class="platform-form-section-subtitle">本次同步会以当前绑定的产品主线为源分支。</div>
      </div>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="当前绑定">{{ currentProductBinding ? `${currentProductBinding.projectName} / ${currentProductBinding.gitlabProjectPath || currentProductBinding.gitlabProjectRef}` : '-' }}</el-descriptions-item>
        <el-descriptions-item label="产品主线">{{ currentProductBinding?.productMainBranch || '-' }}</el-descriptions-item>
        <el-descriptions-item label="目标分线数">{{ selectedProductBranchIds.length }}</el-descriptions-item>
        <el-descriptions-item label="目标列表">
          {{ productBranchList.filter((item) => selectedProductBranchIds.includes(item.id)).map((item) => item.lineName).join('、') || '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </section>
  </MobileFormDrawer>

  <el-drawer v-model="productBranchSyncLogsVisible" title="产品分支同步日志" size="56%" append-to-body>
    <el-table :data="productBranchSyncLogs" v-loading="productBranchSyncLogsLoading" style="width: 100%">
      <el-table-column prop="executedAt" label="执行时间" width="160" />
      <el-table-column prop="lineName" label="产品线" width="140" />
      <el-table-column prop="sourceBranchName" label="主线" width="120" />
      <el-table-column prop="targetBranchName" label="分线" width="140" />
      <el-table-column prop="result" label="结果" width="150" />
      <el-table-column prop="reason" label="摘要" min-width="220" show-overflow-tooltip />
      <el-table-column label="MR" width="90">
        <template #default="{ row }">
          <el-link v-if="row.mergeRequestWebUrl" :href="row.mergeRequestWebUrl" target="_blank" type="primary">打开</el-link>
          <span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>
  </el-drawer>

  <el-dialog v-model="productBranchSyncRunResultVisible" title="主线同步结果" width="760px">
    <el-descriptions v-if="productBranchSyncRunResult" :column="4" border>
      <el-descriptions-item label="平台项目">{{ productBranchSyncRunResult.projectName }}</el-descriptions-item>
      <el-descriptions-item label="产品主线">{{ productBranchSyncRunResult.sourceBranchName }}</el-descriptions-item>
      <el-descriptions-item label="目标数">{{ productBranchSyncRunResult.targetCount }}</el-descriptions-item>
      <el-descriptions-item label="创建 / 无变更">{{ productBranchSyncRunResult.createdCount }} / {{ productBranchSyncRunResult.noChangeCount }}</el-descriptions-item>
      <el-descriptions-item label="已存在 MR / 失败" :span="2">{{ productBranchSyncRunResult.existingOpenMrCount }} / {{ productBranchSyncRunResult.failedCount }}</el-descriptions-item>
    </el-descriptions>
    <el-table v-if="productBranchSyncRunResult" :data="productBranchSyncRunResult.items" style="width: 100%; margin-top: 16px">
      <el-table-column prop="lineName" label="产品线" width="140" />
      <el-table-column prop="targetBranchName" label="目标分线" width="140" />
      <el-table-column label="结果" width="150">
        <template #default="{ row }">
          {{ productBranchSyncResultText(row.result) }}
        </template>
      </el-table-column>
      <el-table-column prop="behindCount" label="落后提交" width="100" />
      <el-table-column prop="message" label="结果说明" min-width="240" show-overflow-tooltip />
      <el-table-column label="MR" width="90">
        <template #default="{ row }">
          <el-link v-if="row.mergeRequestWebUrl" :href="row.mergeRequestWebUrl" target="_blank" type="primary">打开</el-link>
          <span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>
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

  <el-dialog v-model="logDetailVisible" title="合并日志详情" width="860px" class="platform-form-dialog gitlab-log-detail-dialog" align-center>
    <template #header>
      <PlatformDialogHeader
        title="合并日志详情"
        subtitle="查看自动合并执行结果、触发信息和完整日志内容。"
        :icon="DocumentCopy"
      />
    </template>
    <div v-if="currentLogDetail" class="gitlab-log-detail-shell">
      <section class="platform-form-section gitlab-log-detail-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">执行概览</div>
          <div class="platform-form-section-subtitle">快速查看本次自动合并执行的时间、结果和触发上下文。</div>
        </div>
        <el-descriptions :column="2" border class="gitlab-log-detail-summary">
          <el-descriptions-item label="执行时间">{{ currentLogDetail.executedAt || '-' }}</el-descriptions-item>
          <el-descriptions-item label="策略">{{ currentLogDetail.configName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="结果">
            <el-tag :type="logResultType(currentLogDetail.result)">{{ currentLogDetail.result }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="发起人">{{ getLogInitiatorDisplay(currentLogDetail) }}</el-descriptions-item>
          <el-descriptions-item label="原因">{{ currentLogDetail.reason || '-' }}</el-descriptions-item>
        </el-descriptions>
      </section>
      <section class="platform-form-section gitlab-log-detail-section gitlab-log-detail-content">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">日志内容</div>
          <div class="platform-form-section-subtitle">完整展示 AI 审核、自动合并决策和执行细节。</div>
        </div>
        <div class="log-detail-markdown" v-html="logDetailHtml"></div>
      </section>
    </div>
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

  <!-- 业主仓库绑定表单 -->
  <el-dialog v-if="!isMobileViewport" v-model="ownerRepoDialogVisible" :title="ownerRepoDialogTitle" width="680px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader :title="ownerRepoDialogTitle" subtitle="配置业主方 GitLab 仓库的访问信息" :icon="Connection" />
    </template>
    <el-form ref="ownerRepoFormRef" :model="ownerRepoForm" :rules="ownerRepoRules" label-position="top" class="platform-form-layout">
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">基本信息</div>
        </div>
        <el-form-item label="绑定名称" prop="name"><el-input v-model="ownerRepoForm.name" placeholder="如：XX业主交付仓" /></el-form-item>
        <el-form-item label="项目" prop="projectId">
          <el-select v-model="ownerRepoForm.projectId" placeholder="选择项目" filterable teleported=false>
            <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
      </section>
      <section class="platform-form-section">
        <div class="platform-form-section-head">
          <div class="platform-form-section-title">业主仓库</div>
        </div>
        <el-form-item label="GitLab API 地址" prop="apiBaseUrl"><el-input v-model="ownerRepoForm.apiBaseUrl" placeholder="https://gitlab.example.com/api/v4" /></el-form-item>
        <el-form-item label="项目标识" prop="gitlabProjectRef"><el-input v-model="ownerRepoForm.gitlabProjectRef" placeholder="namespace/name 或数字 ID" /></el-form-item>
        <el-form-item label="默认目标分支" prop="defaultTargetBranch"><el-input v-model="ownerRepoForm.defaultTargetBranch" placeholder="如 main" /></el-form-item>
        <el-form-item label="默认推送方式" prop="defaultPushMode">
          <el-radio-group v-model="ownerRepoForm.defaultPushMode">
            <el-radio value="NEW_BRANCH">推到新分支</el-radio>
            <el-radio value="MERGE_REQUEST">创建 MR</el-radio>
            <el-radio value="DIRECT">直接推送(覆盖)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="ownerRepoIsEditing ? '访问 Token(留空保留原值)' : '访问 Token'" prop="apiToken">
          <el-input v-model="ownerRepoForm.apiToken" type="password" show-password placeholder="业主仓库访问 Token" />
        </el-form-item>
        <el-form-item label="启用" prop="enabled"><el-switch v-model="ownerRepoForm.enabled" /></el-form-item>
      </section>
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="ownerRepoDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="ownerRepoSubmitting" @click="handleOwnerRepoSubmit">保存</el-button>
      </div>
    </template>
  </el-dialog>
  <MobileFormDrawer v-else-if="isMobileViewport && ownerRepoDialogVisible" v-model="ownerRepoDialogVisible" :title="ownerRepoDialogTitle" submit-text="保存" :submitting="ownerRepoSubmitting" :header-icon="Connection" @submit="handleOwnerRepoSubmit" @cancel="ownerRepoDialogVisible = false">
    <el-form ref="ownerRepoFormRef" :model="ownerRepoForm" :rules="ownerRepoRules" label-position="top">
      <el-form-item label="绑定名称" prop="name"><el-input v-model="ownerRepoForm.name" /></el-form-item>
      <el-form-item label="项目" prop="projectId">
        <el-select v-model="ownerRepoForm.projectId" placeholder="选择项目" filterable teleported=false>
          <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="GitLab API 地址" prop="apiBaseUrl"><el-input v-model="ownerRepoForm.apiBaseUrl" /></el-form-item>
      <el-form-item label="项目标识" prop="gitlabProjectRef"><el-input v-model="ownerRepoForm.gitlabProjectRef" /></el-form-item>
      <el-form-item label="默认目标分支" prop="defaultTargetBranch"><el-input v-model="ownerRepoForm.defaultTargetBranch" /></el-form-item>
      <el-form-item label="默认推送方式" prop="defaultPushMode">
        <el-radio-group v-model="ownerRepoForm.defaultPushMode">
          <el-radio value="NEW_BRANCH">推到新分支</el-radio>
          <el-radio value="MERGE_REQUEST">创建 MR</el-radio>
          <el-radio value="DIRECT">直接推送(覆盖)</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="ownerRepoIsEditing ? '访问 Token(留空保留原值)' : '访问 Token'" prop="apiToken">
        <el-input v-model="ownerRepoForm.apiToken" type="password" show-password />
      </el-form-item>
      <el-form-item label="启用" prop="enabled"><el-switch v-model="ownerRepoForm.enabled" /></el-form-item>
    </el-form>
  </MobileFormDrawer>

  <!-- 业主仓库推送表单 -->
  <el-dialog v-if="!isMobileViewport" v-model="ownerRepoPushDialogVisible" title="推送到业主仓库" width="640px" class="platform-form-dialog" align-center>
    <template #header>
      <PlatformDialogHeader title="推送到业主仓库" :subtitle="currentOwnerRepoBinding?.name || ''" :icon="Upload" />
    </template>
    <el-form ref="ownerRepoPushFormRef" :model="ownerRepoPushForm" :rules="ownerRepoPushRules" label-position="top" class="platform-form-layout">
      <el-form-item label="源 GitLab 绑定" prop="sourceBindingId">
        <el-select v-model="ownerRepoPushForm.sourceBindingId" placeholder="选择源仓库" filterable teleported=false @change="handleOwnerRepoSourceBindingChange">
          <el-option v-for="item in bindingOptions" :key="item.id" :label="`${item.projectName} / ${item.gitlabProjectPath || item.gitlabProjectRef}`" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="源分支" prop="sourceBranch">
        <el-select v-model="ownerRepoPushForm.sourceBranch" placeholder="选择源分支" filterable teleported=false :loading="ownerRepoBranchLoading">
          <el-option v-for="item in ownerRepoBranchOptions" :key="item.name" :label="item.name" :value="item.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="目标分支" prop="targetBranch"><el-input v-model="ownerRepoPushForm.targetBranch" placeholder="业主仓库目标分支" /></el-form-item>
      <el-form-item label="推送方式" prop="pushMode">
        <el-radio-group v-model="ownerRepoPushForm.pushMode">
          <el-radio value="NEW_BRANCH">推到新分支</el-radio>
          <el-radio value="MERGE_REQUEST">创建 MR</el-radio>
          <el-radio value="DIRECT">直接推送(覆盖)</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-alert v-if="ownerRepoPushForm.pushMode === 'DIRECT'" title="直接推送将强制覆盖业主仓库目标分支的历史，不可恢复，请谨慎操作！" type="error" :closable="false" show-icon />
    </el-form>
    <template #footer>
      <div class="platform-dialog-footer">
        <el-button @click="ownerRepoPushDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="ownerRepoPushing" @click="handleOwnerRepoPushSubmit">推送</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 业主仓库推送结果 -->
  <el-dialog v-model="ownerRepoPushResultVisible" title="推送结果" width="640px">
    <el-descriptions v-if="ownerRepoPushResult" :column="1" border>
      <el-descriptions-item label="执行状态">
        <el-tag size="small" :type="ownerRepoStatusTagType(ownerRepoPushResult.executionStatus)">{{ ownerRepoPushResult.executionStatus === 'SUCCESS' ? '成功' : '失败' }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="说明">{{ ownerRepoPushResult.summaryMessage }}</el-descriptions-item>
      <el-descriptions-item label="源 commit">{{ ownerRepoPushResult.sourceCommitSha || '-' }}</el-descriptions-item>
      <el-descriptions-item label="目标 commit">{{ ownerRepoPushResult.targetCommitSha || '-' }}</el-descriptions-item>
      <el-descriptions-item label="推送分支">{{ ownerRepoPushResult.pushedBranch || '-' }}</el-descriptions-item>
      <el-descriptions-item v-if="ownerRepoPushResult.mergeRequestWebUrl" label="Merge Request">
        <el-link :href="ownerRepoPushResult.mergeRequestWebUrl" target="_blank" type="primary">!{{ ownerRepoPushResult.mergeRequestIid }}</el-link>
      </el-descriptions-item>
    </el-descriptions>
  </el-dialog>

  <!-- 业主仓库推送历史 -->
  <el-drawer v-model="ownerRepoLogsVisible" :title="`推送历史 - ${currentOwnerRepoBinding?.name || ''}`" size="60%">
    <el-table :data="ownerRepoLogList" v-loading="ownerRepoLogLoading" style="width: 100%">
      <el-table-column prop="executedAt" label="时间" width="160" />
      <el-table-column prop="sourceBranch" label="源分支" width="120" />
      <el-table-column prop="targetBranch" label="目标分支" width="120" />
      <el-table-column label="方式" width="100">
        <template #default="{ row }">{{ ownerRepoPushModeLabel(row.pushMode) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }"><el-tag size="small" :type="ownerRepoStatusTagType(row.executionStatus)">{{ row.executionStatus === 'SUCCESS' ? '成功' : '失败' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="MR" width="80">
        <template #default="{ row }">
          <el-link v-if="row.mergeRequestWebUrl" :href="row.mergeRequestWebUrl" target="_blank" type="primary">!{{ row.mergeRequestIid }}</el-link>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="summaryMessage" label="说明" min-width="200" show-overflow-tooltip />
    </el-table>
    <div class="management-list-pagination" style="margin-top: 16px">
      <button class="management-list-page-button" type="button" :disabled="ownerRepoLogPagination.page <= 1" @click="ownerRepoLogPagination.page--; loadOwnerRepoLogs()"><el-icon><ArrowLeft /></el-icon></button>
      <span>{{ ownerRepoLogPagination.page }} / {{ ownerRepoLogTotalPages }}</span>
      <button class="management-list-page-button" type="button" :disabled="ownerRepoLogPagination.page >= ownerRepoLogTotalPages" @click="ownerRepoLogPagination.page++; loadOwnerRepoLogs()"><el-icon><ArrowRight /></el-icon></button>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Bell, Connection, Delete, DocumentCopy, EditPen, Filter, FolderOpened, Plus, QuestionFilled, RefreshRight, Search, Share, Tickets, Upload, VideoPlay } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import MobileFormDrawer from '@/components/MobileFormDrawer.vue'
import { pagePipelineCenterEntries } from '@/api/cicd'
import { listAgentOptions, listProjectOptions } from '@/api/platform'
import {
  createGitlabAutoMergeConfig,
  createGitlabBindingScanTask,
  createGitlabBinding,
  createGitlabProductBranch,
  createGitlabProductBranchSyncMergeRequests,
  createGitlabTag,
  deleteGitlabAutoMergeConfig,
  deleteGitlabBinding,
  deleteGitlabProductBranch,
  listGitlabBindingOptions,
  listGitlabBranches,
  listGitlabProductBranches,
  listGitlabProductBranchSyncLogs,
  listRepositoryScanRulesets,
  pageGitlabAutoMergeConfigs,
  pageGitlabAutoMergeLogs,
  pageGitlabBindings,
  previewAutoMergeConfigMergeRequests,
  previewBindingMergeRequests,
  runAutoMergeConfig,
  syncGitlabBindingApi,
  testGitlabAutoMergeConfig,
  testGitlabBinding,
  updateGitlabAutoMergeConfig,
  updateGitlabBinding,
  updateGitlabProductBranch,
  listAutoMergeWebhooks,
  createAutoMergeWebhook,
  updateAutoMergeWebhook,
  deleteAutoMergeWebhook,
  testAutoMergeWebhook,
  pageOwnerRepoBindings,
  listOwnerRepoBindingsByProject,
  createOwnerRepoBinding,
  updateOwnerRepoBinding,
  deleteOwnerRepoBinding,
  testOwnerRepoBinding,
  getOwnerRepoPushContext,
  pushToOwnerRepo,
  pageOwnerRepoPushLogs
} from '@/api/gitlab'
import type { GitlabAutoMergePipelineTargetPayload } from '@/api/gitlab'
import type {
  AgentItem,
  GitlabAutoMergeConfigItem,
  GitlabAutoMergeLogItem,
  GitlabAutoMergePipelineTargetItem,
  GitlabAutoMergeRunResult,
  GitlabApiSyncResultItem,
  GitlabBranchItem,
  GitlabMergeRequestItem,
  PipelineCenterEntryItem,
  GitlabProductBranchItem,
  GitlabProductBranchSyncLogItem,
  GitlabProductBranchSyncRunResult,
  GitlabTagCreateResultItem,
  GitlabAutoMergeWebhookItem,
  OwnerRepoBindingItem,
  OwnerRepoPushResultItem,
  OwnerRepoPushLogItem,
  ProjectGitlabBindingItem,
  ProjectItem,
  RepositoryScanRulesetItem
} from '@/types/platform'
import { GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS } from '@/types/platform'
import { renderMarkdownToHtml } from '@/utils/markdown'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'

const DEFAULT_GITLAB_API_URL = 'http://192.168.110.138:30080/api/v4'

type BindingRepoKind = '' | 'FRONTEND' | 'BACKEND' | 'MIXED'
type ReviewStrictness = 'HIGH' | 'MEDIUM' | 'LOW'
type AutoMergePipelineTargetType = 'AI_CLUB' | 'JENKINS'

interface BindingHttpCheckForm { name: string; method: string; path: string; expectedStatus: number }
interface BindingForm {
  projectId: number | null
  apiBaseUrl: string
  gitlabProjectRef: string
  defaultTargetBranch: string
  productMainBranch: string
  apiToken: string
  enabled: boolean
  repoKind: BindingRepoKind
  workingDir: string
  packageManager: string
  startCommand: string
  baseUrl: string
  smokePathsText: string
  readySelector: string
  healthPath: string
  httpChecks: BindingHttpCheckForm[]
}
/** Tag 表单仅负责收集名称、来源分支和备注。 */
interface TagForm { tagName: string; branchName: string; message: string }
/** 仓库规范扫描表单。 */
interface ScanTaskForm { branch: string; rulesetCode: string; planAgentId: number | null }
/** 同步 API 表单只需要确认目标分支。 */
interface ApiSyncForm { branch: string }
interface AutoMergeForm { name: string; executionMode: 'PROJECT_BOUND' | 'STANDALONE'; description: string; bindingId: number | null; apiBaseUrl: string; gitlabProjectRef: string; apiToken: string; sourceBranch: string; targetBranch: string; titleKeyword: string; schedulerEnabled: boolean; schedulerCron: string; enabled: boolean; autoMerge: boolean; squashOnMerge: boolean; removeSourceBranch: boolean; triggerPipelineAfterMerge: boolean; requirePipelineSuccess: boolean; reviewAgentId: number | null; aiReviewEnabled: boolean; aiReviewPrompt: string; reviewStrictness: ReviewStrictness; pipelineTargets: GitlabAutoMergePipelineTargetPayload[] }
interface ProductBranchForm { lineCode: string; lineName: string; branchName: string; enabled: boolean }

const router = useRouter()
const activeTab = ref('bindings')
const { isMobileViewport } = useMobileViewport()
const projectOptions = ref<ProjectItem[]>([])
const bindingOptions = ref<ProjectGitlabBindingItem[]>([])
const reviewAgentOptions = ref<AgentItem[]>([])
const scanPlanAgentOptions = ref<AgentItem[]>([])
const bindingLoading = ref(false)
const bindingSubmitting = ref(false)
const bindingDialogVisible = ref(false)
const bindingIsEditing = ref(false)
const currentBindingId = ref<number | null>(null)
const bindingList = ref<ProjectGitlabBindingItem[]>([])
const bindingFormRef = ref<FormInstance>()
const bindingPagination = reactive({ page: 1, size: 10, total: 0 })
const bindingTotalPages = computed(() => Math.max(1, Math.ceil(bindingPagination.total / bindingPagination.size) || 1))
const {
  sentinelRef: bindingSentinelRef,
  requestPage: bindingRequestPage,
  requestSize: bindingRequestSize,
  showDesktopPagination: showDesktopGitlabPagination,
  hasMoreMobileItems: hasMoreBindingItems,
  resetMobilePagination: resetBindingMobilePagination
} = useMobileWaterfallPagination({
  isMobileViewport,
  loading: bindingLoading,
  itemCount: computed(() => bindingList.value.length),
  pagination: bindingPagination,
  loadPage: async () => loadBindings()
})
const bindingFilters = reactive({ keyword: '', projectId: undefined as number | undefined })
const bindingFilterPopoverVisible = ref(false)
const bindingForm = reactive<BindingForm>({
  projectId: null,
  apiBaseUrl: DEFAULT_GITLAB_API_URL,
  gitlabProjectRef: '',
  defaultTargetBranch: '',
  productMainBranch: '',
  apiToken: '',
  enabled: true,
  repoKind: '',
  workingDir: '',
  packageManager: '',
  startCommand: '',
  baseUrl: '',
  smokePathsText: '/',
  readySelector: '',
  healthPath: '',
  httpChecks: []
})
const tagDialogVisible = ref(false)
const tagSubmitting = ref(false)
const tagResultVisible = ref(false)
const currentTagBinding = ref<ProjectGitlabBindingItem | null>(null)
const tagFormRef = ref<FormInstance>()
const tagForm = reactive<TagForm>({ tagName: '', branchName: '', message: '' })
const tagBranchOptions = ref<GitlabBranchItem[]>([])
const tagBranchLoading = ref(false)
const tagResult = ref<GitlabTagCreateResultItem | null>(null)
const scanDialogVisible = ref(false)
const scanSubmitting = ref(false)
const currentScanBinding = ref<ProjectGitlabBindingItem | null>(null)
const scanFormRef = ref<FormInstance>()
const scanForm = reactive<ScanTaskForm>({ branch: '', rulesetCode: '', planAgentId: null })
const scanBranchOptions = ref<GitlabBranchItem[]>([])
const scanBranchLoading = ref(false)
const scanRulesetOptions = ref<RepositoryScanRulesetItem[]>([])
const apiSyncDialogVisible = ref(false)
const apiSyncSubmitting = ref(false)
const apiSyncResultVisible = ref(false)
const currentApiSyncBinding = ref<ProjectGitlabBindingItem | null>(null)
const apiSyncForm = reactive<ApiSyncForm>({ branch: '' })
const apiSyncBranchOptions = ref<GitlabBranchItem[]>([])
const apiSyncBranchLoading = ref(false)
const apiSyncResult = ref<GitlabApiSyncResultItem | null>(null)
const productBranchLoading = ref(false)
const currentProductBindingId = ref<number | null>(null)
const productBranchList = ref<GitlabProductBranchItem[]>([])
const productBranchDialogVisible = ref(false)
const productBranchSubmitting = ref(false)
const productBranchIsEditing = ref(false)
const currentProductBranchId = ref<number | null>(null)
const productBranchFormRef = ref<FormInstance>()
const productBranchForm = reactive<ProductBranchForm>({ lineCode: '', lineName: '', branchName: '', enabled: true })
const productBranchSyncDialogVisible = ref(false)
const productBranchSyncSubmitting = ref(false)
const selectedProductBranchIds = ref<number[]>([])
const productBranchSyncLogsVisible = ref(false)
const productBranchSyncLogsLoading = ref(false)
const productBranchSyncLogs = ref<GitlabProductBranchSyncLogItem[]>([])
const productBranchSyncRunResultVisible = ref(false)
const productBranchSyncRunResult = ref<GitlabProductBranchSyncRunResult | null>(null)
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
const {
  sentinelRef: autoMergeSentinelRef,
  requestPage: autoMergeRequestPage,
  requestSize: autoMergeRequestSize,
  hasMoreMobileItems: hasMoreAutoMergeItems,
  resetMobilePagination: resetAutoMergeMobilePagination
} = useMobileWaterfallPagination({
  isMobileViewport,
  loading: autoMergeLoading,
  itemCount: computed(() => autoMergeList.value.length),
  pagination: autoMergePagination,
  loadPage: async () => loadAutoMergeConfigs()
})
const autoMergeFilters = reactive({ keyword: '', executionMode: undefined as 'PROJECT_BOUND' | 'STANDALONE' | undefined, enabled: undefined as boolean | undefined })
const autoMergeFilterPopoverVisible = ref(false)
const autoMergeForm = reactive<AutoMergeForm>({ name: '', executionMode: 'PROJECT_BOUND', description: '', bindingId: null, apiBaseUrl: DEFAULT_GITLAB_API_URL, gitlabProjectRef: '', apiToken: '', sourceBranch: '', targetBranch: '', titleKeyword: '', schedulerEnabled: false, schedulerCron: '0 */5 * * * *', enabled: true, autoMerge: true, squashOnMerge: false, removeSourceBranch: true, triggerPipelineAfterMerge: false, requirePipelineSuccess: true, reviewAgentId: null, aiReviewEnabled: false, aiReviewPrompt: '', reviewStrictness: 'MEDIUM', pipelineTargets: [] })
const autoMergePipelineTargetOptions = ref<PipelineCenterEntryItem[]>([])
const autoMergePipelineTargetLoading = ref(false)
const autoMergePipelineTargetProjectId = ref<number | null>(null)
const cronTemplate = ref('')
// ===== 自动合并外发 Webhook 管理 dialog 状态 =====
interface AutoMergeWebhookForm {
  name: string
  targetUrl: string
  subscribedEvents: string[]
  messageTemplate: string
  enabled: boolean
}
const autoMergeWebhookDialogVisible = ref(false)
const autoMergeWebhookConfigId = ref<number | null>(null)
const autoMergeWebhookList = ref<GitlabAutoMergeWebhookItem[]>([])
const autoMergeWebhookListLoading = ref(false)
const autoMergeWebhookEditDialogVisible = ref(false)
const autoMergeWebhookEditingId = ref<number | null>(null)
const autoMergeWebhookSubmitting = ref(false)
const autoMergeWebhookForm = reactive<AutoMergeWebhookForm>({
  name: '',
  targetUrl: '',
  subscribedEvents: ['MERGED', 'AI_REJECTED', 'FAILED'],
  messageTemplate: '',
  enabled: true
})
const autoMergeWebhookFormRef = ref<any>(null)
const autoMergeWebhookRules = {
  name: [{ required: true, message: '请输入 Webhook 名称', trigger: 'blur' }],
  targetUrl: [
    { required: true, message: '请输入 Webhook 地址', trigger: 'blur' },
    { pattern: /^https?:\/\/.+/i, message: '地址必须以 http:// 或 https:// 开头', trigger: 'blur' }
  ],
  subscribedEvents: [{ required: true, type: 'array', min: 1, message: '请至少选择一个订阅事件', trigger: 'change' }]
}
const buildPipelineTargetKey = (targetType: string, targetId: number | null | undefined) =>
  targetId ? `${targetType}:${targetId}` : ''
const parsePipelineTargetKey = (value: string): GitlabAutoMergePipelineTargetPayload | null => {
  const [targetType, rawTargetId] = value.split(':')
  const targetId = Number(rawTargetId)
  if ((targetType !== 'AI_CLUB' && targetType !== 'JENKINS') || !Number.isFinite(targetId) || targetId <= 0) {
    return null
  }
  return { targetType: targetType as AutoMergePipelineTargetType, targetId }
}
const autoMergeSelectedPipelineKeys = computed<string[]>({
  get: () => autoMergeForm.pipelineTargets.map((item) => buildPipelineTargetKey(item.targetType, item.targetId)).filter(Boolean),
  set: (values) => {
    autoMergeForm.pipelineTargets = values
      .map((value) => parsePipelineTargetKey(value))
      .filter((item): item is GitlabAutoMergePipelineTargetPayload => item !== null)
  }
})
const autoMergeAiClubTargetOptions = computed(() =>
  autoMergePipelineTargetOptions.value.filter((item) => item.entryType === 'AI_CLUB')
)
const autoMergeJenkinsTargetOptions = computed(() =>
  autoMergePipelineTargetOptions.value.filter((item) => item.entryType === 'JENKINS')
)
const autoMergeWebhookEventLabel = (value: string) => {
  const matched = GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS.find(item => item.value === value)
  return matched ? matched.label : value
}
const autoMergeWebhookStatusKind = (status: string | null | undefined) => {
  if (!status) return 'info'
  if (status === 'SUCCESS') return 'success'
  return status.startsWith('FAILED') ? 'danger' : 'warning'
}
// 在常量里拼模板占位符提示，避免 Vue 模板把 {{ ... }} 当成插值表达式
const autoMergeWebhookTemplatePlaceholder = '留空则发送通用 JSON。支持占位符：'
  + '{' + '{event}} '
  + '{' + '{configName}} '
  + '{' + '{projectRef}} '
  + '{' + '{mergeRequestIid}} '
  + '{' + '{mergeRequestTitle}} '
  + '{' + '{mergeRequestAuthor}} '
  + '{' + '{result}} '
  + '{' + '{reason}} '
  + '{' + '{webUrl}} '
  + '{' + '{executedAt}} '
  + '{' + '{triggerType}}'
const logLoading = ref(false)
const logList = ref<GitlabAutoMergeLogItem[]>([])
const logPagination = reactive({ page: 1, size: 10, total: 0 })
const logTotalPages = computed(() => Math.max(1, Math.ceil(logPagination.total / logPagination.size) || 1))
const {
  sentinelRef: logSentinelRef,
  requestPage: logRequestPage,
  requestSize: logRequestSize,
  hasMoreMobileItems: hasMoreLogItems,
  resetMobilePagination: resetLogMobilePagination
} = useMobileWaterfallPagination({
  isMobileViewport,
  loading: logLoading,
  itemCount: computed(() => logList.value.length),
  pagination: logPagination,
  loadPage: async () => loadAutoMergeLogs()
})
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
const scanRules: FormRules<ScanTaskForm> = { branch: [{ required: true, message: '请选择扫描分支', trigger: 'change' }], rulesetCode: [{ required: true, message: '请选择规则集', trigger: 'change' }] }
const autoMergeRules: FormRules<AutoMergeForm> = { name: [{ required: true, message: '请输入策略名称', trigger: 'blur' }], executionMode: [{ required: true, message: '请选择执行模式', trigger: 'change' }] }
const productBranchRules: FormRules<ProductBranchForm> = {
  lineCode: [{ required: true, message: '请输入产品线编码', trigger: 'blur' }],
  lineName: [{ required: true, message: '请输入产品线名称', trigger: 'blur' }],
  branchName: [{ required: true, message: '请输入 Git 分支名', trigger: 'blur' }]
}
const bindingDialogTitle = computed(() => bindingIsEditing.value ? '编辑 GitLab 绑定' : '新增 GitLab 绑定')
const bindingDialogSubtitle = computed(() =>
  bindingIsEditing.value
    ? '调整平台项目与 GitLab 仓库的映射关系，并维护测试模板。'
    : '配置平台项目与 GitLab 仓库的基础映射信息，并可补充测试模板。'
)
const currentProductBinding = computed(() =>
  bindingOptions.value.find((item) => item.id === currentProductBindingId.value) || null
)
const productBranchDialogTitle = computed(() => productBranchIsEditing.value ? '编辑产品分支' : '新增产品分支')
const productBranchDialogSubtitle = computed(() =>
  productBranchIsEditing.value
    ? '调整该产品线对应的分线分支和启用状态。'
    : '为当前仓库绑定新增一条产品分线定义。'
)
const tagDialogSubtitle = computed(() => '基于当前仓库分支创建新的 GitLab Tag。')
const scanDialogSubtitle = computed(() => '选择扫描分支和规则集后，系统会在执行中心创建一条仓库规范扫描任务。')
const apiSyncDialogSubtitle = computed(() => '选择分支后，系统会覆盖平台生成的 API 项并保留人工维护内容。')
const showFrontendTestProfile = computed(() => ['FRONTEND', 'MIXED'].includes(bindingForm.repoKind))
const showBackendTestProfile = computed(() => ['BACKEND', 'MIXED'].includes(bindingForm.repoKind))
const canManageProductBranches = computed(() => !!currentProductBinding.value && !!currentProductBinding.value.productMainBranch)
const enabledProductBranches = computed(() => productBranchList.value.filter((item) => item.enabled))

// ===== 业主代码仓库推送 =====
import { useAuthStore } from '@/stores/auth'
const authStore = useAuthStore()
const canManageOwnerRepo = computed(() => authStore.hasPermission('gitlab:owner-repo:manage'))

interface OwnerRepoForm {
  projectId: number | null
  name: string
  apiBaseUrl: string
  gitlabProjectRef: string
  defaultTargetBranch: string
  defaultPushMode: string
  apiToken: string
  enabled: boolean
}
const ownerRepoLoading = ref(false)
const ownerRepoList = ref<OwnerRepoBindingItem[]>([])
const ownerRepoFilters = reactive<{ keyword: string; projectId: number | null }>({ keyword: '', projectId: null })
const ownerRepoFilterPopoverVisible = ref(false)
const ownerRepoPagination = reactive({ page: 1, total: 0, size: 10 })
const ownerRepoTotalPages = computed(() => Math.max(1, Math.ceil(ownerRepoPagination.total / ownerRepoPagination.size)))
const ownerRepoDialogVisible = ref(false)
const ownerRepoDialogTitle = ref('新增业主仓库')
const ownerRepoIsEditing = ref(false)
const ownerRepoSubmitting = ref(false)
const ownerRepoFormRef = ref<FormInstance>()
const currentOwnerRepoBindingId = ref<number | null>(null)
const ownerRepoForm = reactive<OwnerRepoForm>({ projectId: null, name: '', apiBaseUrl: '', gitlabProjectRef: '', defaultTargetBranch: '', defaultPushMode: 'NEW_BRANCH', apiToken: '', enabled: true })
const ownerRepoRules: FormRules = {
  name: [{ required: true, message: '请输入绑定名称', trigger: 'blur' }],
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
  apiBaseUrl: [{ required: true, message: '请输入 GitLab API 地址', trigger: 'blur' }],
  gitlabProjectRef: [{ required: true, message: '请输入项目标识', trigger: 'blur' }],
  defaultPushMode: [{ required: true, message: '请选择推送方式', trigger: 'change' }]
}
const ownerRepoTestingId = ref<number | null>(null)
// 推送表单
const currentOwnerRepoBinding = ref<OwnerRepoBindingItem | null>(null)
const ownerRepoPushDialogVisible = ref(false)
const ownerRepoPushing = ref(false)
const ownerRepoPushFormRef = ref<FormInstance>()
const ownerRepoPushForm = reactive<{ sourceBindingId: number | null; sourceBranch: string; targetBranch: string; pushMode: string }>({ sourceBindingId: null, sourceBranch: '', targetBranch: '', pushMode: 'NEW_BRANCH' })
const ownerRepoPushRules: FormRules = {
  sourceBindingId: [{ required: true, message: '请选择源 GitLab 绑定', trigger: 'change' }],
  sourceBranch: [{ required: true, message: '请选择源分支', trigger: 'change' }],
  targetBranch: [{ required: true, message: '请输入目标分支', trigger: 'blur' }],
  pushMode: [{ required: true, message: '请选择推送方式', trigger: 'change' }]
}
const ownerRepoBranchLoading = ref(false)
const ownerRepoBranchOptions = ref<GitlabBranchItem[]>([])
const ownerRepoPushResultVisible = ref(false)
const ownerRepoPushResult = ref<OwnerRepoPushResultItem | null>(null)
// 推送历史
const ownerRepoLogsVisible = ref(false)
const ownerRepoLogLoading = ref(false)
const ownerRepoLogList = ref<OwnerRepoPushLogItem[]>([])
const ownerRepoLogPagination = reactive({ page: 1, total: 0, size: 10 })
const ownerRepoLogTotalPages = computed(() => Math.max(1, Math.ceil(ownerRepoLogPagination.total / ownerRepoLogPagination.size)))

const ownerRepoPushModeLabel = (mode: string): string => {
  if (mode === 'DIRECT') return '直接推送'
  if (mode === 'MERGE_REQUEST') return '创建 MR'
  return '推到新分支'
}
const ownerRepoPushModeTagType = (mode: string): '' | 'warning' | 'success' => {
  if (mode === 'DIRECT') return 'warning'
  if (mode === 'MERGE_REQUEST') return 'success'
  return ''
}
const ownerRepoStatusTagType = (status: string): 'success' | 'danger' => {
  return status === 'SUCCESS' ? 'success' : 'danger'
}

const loadOwnerRepoBindings = async () => {
  ownerRepoLoading.value = true
  try {
    const pageData = await pageOwnerRepoBindings({ page: ownerRepoPagination.page, size: ownerRepoPagination.size, keyword: ownerRepoFilters.keyword, projectId: ownerRepoFilters.projectId ?? undefined })
    ownerRepoList.value = pageData.records
    ownerRepoPagination.total = pageData.total
  } finally {
    ownerRepoLoading.value = false
  }
}
const handleOwnerRepoSearch = async () => {
  ownerRepoFilterPopoverVisible.value = false
  ownerRepoPagination.page = 1
  await loadOwnerRepoBindings()
}
const resetOwnerRepoForm = () => {
  ownerRepoForm.projectId = projectOptions.value[0]?.id ?? null
  ownerRepoForm.name = ''
  ownerRepoForm.apiBaseUrl = ''
  ownerRepoForm.gitlabProjectRef = ''
  ownerRepoForm.defaultTargetBranch = ''
  ownerRepoForm.defaultPushMode = 'NEW_BRANCH'
  ownerRepoForm.apiToken = ''
  ownerRepoForm.enabled = true
}
const handleOwnerRepoCreate = () => {
  ownerRepoIsEditing.value = false
  ownerRepoDialogTitle.value = '新增业主仓库'
  currentOwnerRepoBindingId.value = null
  resetOwnerRepoForm()
  ownerRepoDialogVisible.value = true
}
const handleOwnerRepoEdit = (item: OwnerRepoBindingItem) => {
  ownerRepoIsEditing.value = true
  ownerRepoDialogTitle.value = '编辑业主仓库'
  currentOwnerRepoBindingId.value = item.id
  ownerRepoForm.projectId = item.projectId
  ownerRepoForm.name = item.name
  ownerRepoForm.apiBaseUrl = item.apiBaseUrl
  ownerRepoForm.gitlabProjectRef = item.gitlabProjectRef
  ownerRepoForm.defaultTargetBranch = item.defaultTargetBranch || ''
  ownerRepoForm.defaultPushMode = item.defaultPushMode
  ownerRepoForm.apiToken = ''
  ownerRepoForm.enabled = item.enabled
  ownerRepoDialogVisible.value = true
}
const handleOwnerRepoSubmit = async () => {
  const valid = await ownerRepoFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!ownerRepoIsEditing.value && !ownerRepoForm.apiToken) {
    ElMessage.warning('请输入访问 Token')
    return
  }
  ownerRepoSubmitting.value = true
  try {
    const payload = {
      projectId: ownerRepoForm.projectId!,
      name: ownerRepoForm.name,
      apiBaseUrl: ownerRepoForm.apiBaseUrl,
      gitlabProjectRef: ownerRepoForm.gitlabProjectRef,
      defaultTargetBranch: ownerRepoForm.defaultTargetBranch,
      defaultPushMode: ownerRepoForm.defaultPushMode,
      apiToken: ownerRepoForm.apiToken,
      enabled: ownerRepoForm.enabled
    }
    if (ownerRepoIsEditing.value && currentOwnerRepoBindingId.value) {
      await updateOwnerRepoBinding(currentOwnerRepoBindingId.value, payload)
      ElMessage.success('业主仓库绑定已更新')
    } else {
      await createOwnerRepoBinding(payload)
      ElMessage.success('业主仓库绑定已创建')
    }
    ownerRepoDialogVisible.value = false
    await loadOwnerRepoBindings()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    ownerRepoSubmitting.value = false
  }
}
const handleOwnerRepoDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('删除业主仓库绑定后，推送历史也会被清除，是否继续？', '提示', { type: 'warning' })
    await deleteOwnerRepoBinding(id)
    ElMessage.success('业主仓库绑定已删除')
    await loadOwnerRepoBindings()
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '删除失败')
  }
}
const handleOwnerRepoTest = async (id: number) => {
  ownerRepoTestingId.value = id
  try {
    const result = await testOwnerRepoBinding(id)
    ElMessage.success(`连接成功：${result.gitlabProjectPath || result.gitlabProjectRef}`)
    await loadOwnerRepoBindings()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '连接测试失败')
    await loadOwnerRepoBindings()
  } finally {
    ownerRepoTestingId.value = null
  }
}
const handleOwnerRepoSourceBindingChange = async () => {
  ownerRepoPushForm.sourceBranch = ''
  ownerRepoBranchOptions.value = []
  if (!ownerRepoPushForm.sourceBindingId) return
  ownerRepoBranchLoading.value = true
  try {
    ownerRepoBranchOptions.value = await listGitlabBranches(ownerRepoPushForm.sourceBindingId)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载分支失败')
  } finally {
    ownerRepoBranchLoading.value = false
  }
}
const handleOwnerRepoPush = (item: OwnerRepoBindingItem) => {
  currentOwnerRepoBinding.value = item
  ownerRepoPushForm.sourceBindingId = null
  ownerRepoPushForm.sourceBranch = ''
  ownerRepoPushForm.targetBranch = item.defaultTargetBranch || ''
  ownerRepoPushForm.pushMode = item.defaultPushMode
  ownerRepoBranchOptions.value = []
  ownerRepoPushDialogVisible.value = true
}
const handleOwnerRepoPushSubmit = async () => {
  const valid = await ownerRepoPushFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (ownerRepoPushForm.pushMode === 'DIRECT') {
    try {
      await ElMessageBox.confirm(`直接推送将强制覆盖业主仓库 ${ownerRepoPushForm.targetBranch} 分支的历史，不可恢复，是否继续？`, '危险操作确认', { type: 'error' })
    } catch (error) {
      return
    }
  }
  if (!currentOwnerRepoBinding.value) return
  ownerRepoPushing.value = true
  try {
    const result = await pushToOwnerRepo(currentOwnerRepoBinding.value.id, {
      sourceBindingId: ownerRepoPushForm.sourceBindingId!,
      sourceBranch: ownerRepoPushForm.sourceBranch,
      targetBranch: ownerRepoPushForm.targetBranch,
      pushMode: ownerRepoPushForm.pushMode
    })
    ownerRepoPushResult.value = result
    ownerRepoPushDialogVisible.value = false
    ownerRepoPushResultVisible.value = true
    if (result.executionStatus === 'FAILED') ElMessage.error('推送失败')
    else ElMessage.success('推送完成')
    await loadOwnerRepoBindings()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '推送失败')
  } finally {
    ownerRepoPushing.value = false
  }
}
const handleOwnerRepoViewLogs = async (item: OwnerRepoBindingItem) => {
  currentOwnerRepoBinding.value = item
  ownerRepoLogsVisible.value = true
  ownerRepoLogPagination.page = 1
  await loadOwnerRepoLogs()
}
const loadOwnerRepoLogs = async () => {
  if (!currentOwnerRepoBinding.value) return
  ownerRepoLogLoading.value = true
  try {
    const pageData = await pageOwnerRepoPushLogs(currentOwnerRepoBinding.value.id, ownerRepoLogPagination.page, ownerRepoLogPagination.size)
    ownerRepoLogList.value = pageData.records
    ownerRepoLogPagination.total = pageData.total
  } finally {
    ownerRepoLogLoading.value = false
  }
}

const resolveBindingRepoKind = (row: ProjectGitlabBindingItem): BindingRepoKind => {
  if (!row.testProfileJson) return ''
  try {
    const parsed = JSON.parse(row.testProfileJson) as Record<string, any>
    const repoKind = String(parsed.repoKind || '').trim().toUpperCase()
    return ['FRONTEND', 'BACKEND', 'MIXED'].includes(repoKind) ? (repoKind as BindingRepoKind) : ''
  } catch (error) {
    return ''
  }
}

const canSyncBindingApi = (row: ProjectGitlabBindingItem) => ['BACKEND', 'MIXED'].includes(resolveBindingRepoKind(row))

const createBindingHttpCheck = (): BindingHttpCheckForm => ({
  name: '',
  method: 'GET',
  path: '',
  expectedStatus: 200
})

const resetBindingTestProfile = () => {
  bindingForm.repoKind = ''
  bindingForm.workingDir = ''
  bindingForm.packageManager = ''
  bindingForm.startCommand = ''
  bindingForm.baseUrl = ''
  bindingForm.smokePathsText = '/'
  bindingForm.readySelector = ''
  bindingForm.healthPath = ''
  bindingForm.httpChecks = []
}

const applyBindingTestProfile = (rawJson?: string | null) => {
  resetBindingTestProfile()
  if (!rawJson) {
    return
  }
  try {
    const parsed = JSON.parse(rawJson) as Record<string, any>
    bindingForm.repoKind = ['FRONTEND', 'BACKEND', 'MIXED'].includes(String(parsed.repoKind || '').toUpperCase())
      ? (String(parsed.repoKind || '').toUpperCase() as BindingRepoKind)
      : ''
    bindingForm.workingDir = String(parsed.workingDir || '').trim()
    bindingForm.packageManager = String(parsed.packageManager || '').trim()
    bindingForm.startCommand = String(parsed.startCommand || '').trim()
    bindingForm.baseUrl = String(parsed.baseUrl || '').trim()
    const smokePaths = Array.isArray(parsed.smokePaths)
      ? parsed.smokePaths.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    bindingForm.smokePathsText = smokePaths.length ? smokePaths.join('\n') : '/'
    bindingForm.readySelector = String(parsed.readySelector || '').trim()
    bindingForm.healthPath = String(parsed.healthPath || '').trim()
    bindingForm.httpChecks = Array.isArray(parsed.httpChecks)
      ? parsed.httpChecks.map((item) => ({
          name: String(item?.name || '').trim(),
          method: String(item?.method || 'GET').trim().toUpperCase() || 'GET',
          path: String(item?.path || '').trim(),
          expectedStatus: Number(item?.expectedStatus || 200) || 200
        }))
      : []
  } catch (error) {
    ElMessage.warning('当前绑定的测试模板无法解析，已回退为空白表单')
  }
}

const buildBindingTestProfileJson = () => {
  if (!bindingForm.repoKind) {
    return undefined
  }
  const smokePaths = bindingForm.smokePathsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  const httpChecks = bindingForm.httpChecks
    .map((item) => ({
      name: item.name.trim(),
      method: item.method.trim().toUpperCase() || 'GET',
      path: item.path.trim(),
      expectedStatus: Number(item.expectedStatus) || 200
    }))
    .filter((item) => item.name || item.path)
  return JSON.stringify(
    {
      repoKind: bindingForm.repoKind,
      workingDir: bindingForm.workingDir.trim(),
      packageManager: bindingForm.packageManager.trim(),
      startCommand: bindingForm.startCommand.trim(),
      baseUrl: bindingForm.baseUrl.trim(),
      smokePaths,
      readySelector: bindingForm.readySelector.trim(),
      healthPath: bindingForm.healthPath.trim(),
      httpChecks
    },
    null,
    2
  )
}

const addBindingHttpCheck = () => {
  bindingForm.httpChecks = [...bindingForm.httpChecks, createBindingHttpCheck()]
}

const removeBindingHttpCheck = (index: number) => {
  bindingForm.httpChecks = bindingForm.httpChecks.filter((_, itemIndex) => itemIndex !== index)
}

watch(() => autoMergeForm.executionMode, (mode) => {
  if (mode === 'PROJECT_BOUND') {
    autoMergeForm.apiToken = ''
    autoMergeForm.apiBaseUrl = DEFAULT_GITLAB_API_URL
    autoMergeForm.gitlabProjectRef = ''
  } else {
    autoMergeForm.bindingId = null
    autoMergeForm.triggerPipelineAfterMerge = false
    autoMergeForm.pipelineTargets = []
    autoMergePipelineTargetOptions.value = []
    autoMergePipelineTargetProjectId.value = null
  }
})

watch(() => autoMergeForm.bindingId, async (bindingId, previousBindingId) => {
  if (bindingId === previousBindingId) return
  autoMergeForm.pipelineTargets = []
  await loadAutoMergePipelineTargetOptions(bindingId)
})

watch(() => autoMergeForm.triggerPipelineAfterMerge, (enabled) => {
  if (!enabled) {
    autoMergeForm.pipelineTargets = []
  }
})

watch(() => autoMergeForm.schedulerEnabled, (enabled) => {
  if (!enabled) {
    cronTemplate.value = ''
  }
})

const bindingStatusType = (status?: string | null) => status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : 'info'
const codeStructureStatusType = (status?: string | null) =>
  status === 'READY' ? 'success'
    : status === 'DEGRADED' ? 'warning'
      : status === 'BUILDING' ? 'info'
        : status === 'FAILED' ? 'danger'
          : 'neutral'
const runStatusType = (status?: string | null) => status === 'SUCCESS' ? 'success' : status === 'PARTIAL' || status === 'SKIPPED' ? 'warning' : status === 'FAILED' ? 'danger' : 'info'
const logResultType = (result?: string | null) => result === 'MERGED' ? 'success' : result === 'FAILED' ? 'danger' : result === 'EMPTY' ? 'info' : 'warning'
const logResultText = (result?: string | null) => result === 'MERGED' ? '已合并' : result === 'FAILED' ? '失败' : result === 'AI_REJECTED' ? 'AI 拒绝' : result === 'SKIPPED' ? '已跳过' : result === 'EMPTY' ? '空执行' : (result || '未知')
const productBranchSyncResultText = (result?: string | null) =>
  result === 'CREATED' ? '已创建同步 MR'
    : result === 'NO_CHANGE' ? '无变更'
      : result === 'EXISTING_OPEN_MR' ? '已有开放 MR'
        : result === 'FAILED' ? '同步失败'
          : (result || '未同步')
const getMergeRequestBehindCount = (item: GitlabMergeRequestItem) => item.divergedCommitsCount ?? item.diverged_commits_count ?? 0
const isMergeRequestBehind = (item: GitlabMergeRequestItem) => getMergeRequestBehindCount(item) > 0 || item.detailedMergeStatus === 'need_rebase'
const mergeRequestBehindTagType = (item: GitlabMergeRequestItem) => isMergeRequestBehind(item) ? 'danger' : 'success'
const logDetailHtml = computed(() => renderMarkdownToHtml(currentLogDetail.value?.detailMarkdown || buildFallbackLogMarkdown(currentLogDetail.value)))

// 统一整理列表中用到的中文展示文案，避免模板层重复判断状态和时间格式。
const formatDateTimeText = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '-'
const formatBindingStatusLabel = (status?: string | null) => status === 'SUCCESS' ? '连通正常' : status === 'FAILED' ? '连接失败' : '未测试'
const formatCodeStructureStatusLabel = (status?: string | null) =>
  status === 'READY' ? '结构已生成'
    : status === 'DEGRADED' ? '结构已降级'
      : status === 'BUILDING' ? '结构生成中'
        : status === 'FAILED' ? '结构生成失败'
          : '结构未生成'
const formatExecutionModeLabel = (mode?: 'PROJECT_BOUND' | 'STANDALONE' | null) => mode === 'STANDALONE' ? '独立运行' : '关联业务'
const formatTriggerTypeLabel = (triggerType?: 'MANUAL' | 'SCHEDULED' | null) => triggerType === 'SCHEDULED' ? '定时调度' : '手动执行'
const formatRunStatusLabel = (status?: string | null) => status === 'SUCCESS' ? '执行成功' : status === 'PARTIAL' ? '部分成功' : status === 'SKIPPED' ? '已跳过' : status === 'FAILED' ? '执行失败' : '未执行'

// 主信息列会把多字段折叠成标题和副标题，保持桌面与移动端的阅读节奏一致。
const getBindingProjectUrl = (row: ProjectGitlabBindingItem) => resolveGitlabProjectUrl(row.gitlabProjectWebUrl, row.apiBaseUrl, row.gitlabProjectPath || row.gitlabProjectRef)
const buildBindingSubtitle = (row: ProjectGitlabBindingItem) => `${row.projectName}${row.gitlabProjectName ? ` · ${row.gitlabProjectName}` : ''}${row.tokenConfigured ? '' : ' · Token 未配置'}`
const buildAutoMergeSubtitle = (row: GitlabAutoMergeConfigItem) => row.description || `${row.projectName || '独立运行'} · ${row.gitlabProjectRef}`
const formatReviewStrictnessLabel = (value?: ReviewStrictness | string | null) => value === 'HIGH' ? '高' : value === 'LOW' ? '低' : '中'
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
const autoMergeDialogSubtitle = computed(() => {
  if (autoMergeReadonlyMode.value) {
    return '查看自动合并策略范围、调度和 Agent 配置。'
  }
  if (autoMergeIsEditing.value) {
    return '调整策略范围、调度规则和 AI 审核行为。'
  }
  return '配置自动合并策略、调度规则和 Agent 能力。'
})

const resetBindingForm = () => {
  currentBindingId.value = null
  bindingForm.projectId = projectOptions.value[0]?.id ?? null
  bindingForm.apiBaseUrl = DEFAULT_GITLAB_API_URL
  bindingForm.gitlabProjectRef = ''
  bindingForm.defaultTargetBranch = ''
  bindingForm.productMainBranch = ''
  bindingForm.apiToken = ''
  bindingForm.enabled = true
  resetBindingTestProfile()
  bindingFormRef.value?.clearValidate()
}
const resetTagForm = () => { currentTagBinding.value = null; tagForm.tagName = ''; tagForm.branchName = ''; tagForm.message = ''; tagBranchOptions.value = []; tagFormRef.value?.clearValidate() }
const resetProductBranchForm = () => {
  currentProductBranchId.value = null
  productBranchForm.lineCode = ''
  productBranchForm.lineName = ''
  productBranchForm.branchName = ''
  productBranchForm.enabled = true
  productBranchFormRef.value?.clearValidate()
}
const resolveAutoMergeProjectId = (bindingId: number | null | undefined) =>
  bindingOptions.value.find((item) => item.id === bindingId)?.projectId ?? null

const loadAutoMergePipelineTargetOptions = async (bindingId: number | null | undefined) => {
  const projectId = resolveAutoMergeProjectId(bindingId)
  autoMergePipelineTargetProjectId.value = projectId
  if (!projectId || autoMergeForm.executionMode !== 'PROJECT_BOUND') {
    autoMergePipelineTargetOptions.value = []
    return
  }
  autoMergePipelineTargetLoading.value = true
  try {
    const pageData = await pagePipelineCenterEntries({
      page: 1,
      size: 200,
      projectId,
      enabled: true
    })
    autoMergePipelineTargetOptions.value = pageData.records.filter((item) => item.entryType === 'AI_CLUB' || item.entryType === 'JENKINS')
  } finally {
    autoMergePipelineTargetLoading.value = false
  }
}

const buildAutoMergePipelineSelectionText = (row: Pick<GitlabAutoMergeConfigItem, 'triggerPipelineAfterMerge' | 'pipelineTargets'>) => {
  if (!row.triggerPipelineAfterMerge) return '关闭'
  if (!row.pipelineTargets?.length) return '已开启，未配置目标'
  if (row.pipelineTargets.length === 1) {
    return `1 条：${row.pipelineTargets[0].targetName}`
  }
  return `已开启（${row.pipelineTargets.length} 条）`
}

const resetAutoMergeForm = () => {
  currentAutoMergeId.value = null
  autoMergeForm.name = ''
  autoMergeForm.executionMode = 'PROJECT_BOUND'
  autoMergeForm.description = ''
  autoMergeForm.bindingId = bindingOptions.value[0]?.id ?? null
  autoMergeForm.apiBaseUrl = DEFAULT_GITLAB_API_URL
  autoMergeForm.gitlabProjectRef = ''
  autoMergeForm.apiToken = ''
  autoMergeForm.sourceBranch = ''
  autoMergeForm.targetBranch = ''
  autoMergeForm.titleKeyword = ''
  autoMergeForm.schedulerEnabled = false
  autoMergeForm.schedulerCron = '0 */5 * * * *'
  autoMergeForm.enabled = true
  autoMergeForm.autoMerge = true
  autoMergeForm.squashOnMerge = false
  autoMergeForm.removeSourceBranch = true
  autoMergeForm.triggerPipelineAfterMerge = false
  autoMergeForm.requirePipelineSuccess = true
  autoMergeForm.reviewAgentId = reviewAgentOptions.value[0]?.id ?? null
  autoMergeForm.aiReviewEnabled = false
  autoMergeForm.aiReviewPrompt = ''
  autoMergeForm.reviewStrictness = 'MEDIUM'
  autoMergeForm.pipelineTargets = []
  autoMergePipelineTargetOptions.value = []
  autoMergePipelineTargetProjectId.value = resolveAutoMergeProjectId(autoMergeForm.bindingId)
  cronTemplate.value = ''
  autoMergeFormRef.value?.clearValidate()
}

const loadBaseOptions = async () => {
  const [projects, bindings, agents] = await Promise.all([listProjectOptions(), listGitlabBindingOptions(), listAgentOptions()])
  projectOptions.value = projects
  bindingOptions.value = bindings
  reviewAgentOptions.value = agents.filter(item => item.accessType === 'BUILT_IN' && item.builtinCode === 'CODE_REVIEW')
  scanPlanAgentOptions.value = agents.filter(item => item.accessType === 'BUILT_IN' && item.builtinCode === 'REPOSITORY_SCAN_PLAN')
  if (!bindingForm.projectId && projectOptions.value.length > 0) bindingForm.projectId = projectOptions.value[0].id
  if (!autoMergeForm.bindingId && bindingOptions.value.length > 0) autoMergeForm.bindingId = bindingOptions.value[0].id
  if (!autoMergeForm.reviewAgentId && reviewAgentOptions.value.length > 0) autoMergeForm.reviewAgentId = reviewAgentOptions.value[0].id
  if (!currentProductBindingId.value && bindingOptions.value.length > 0) currentProductBindingId.value = bindingOptions.value[0].id
  if (currentProductBindingId.value && !bindingOptions.value.some((item) => item.id === currentProductBindingId.value)) {
    currentProductBindingId.value = bindingOptions.value[0]?.id ?? null
  }
  await loadAutoMergePipelineTargetOptions(autoMergeForm.bindingId)
}
const loadBindings = async () => { bindingLoading.value = true; try { const pageData = await pageGitlabBindings({ page: bindingRequestPage.value, size: bindingRequestSize.value, keyword: bindingFilters.keyword, projectId: bindingFilters.projectId }); bindingList.value = pageData.records; bindingPagination.total = pageData.total } finally { bindingLoading.value = false } }
const loadProductBranches = async () => {
  if (!currentProductBindingId.value) {
    productBranchList.value = []
    return
  }
  productBranchLoading.value = true
  try {
    productBranchList.value = await listGitlabProductBranches(currentProductBindingId.value)
  } finally {
    productBranchLoading.value = false
  }
}
const loadProductBranchSyncLogs = async () => {
  if (!currentProductBindingId.value) {
    productBranchSyncLogs.value = []
    return
  }
  productBranchSyncLogsLoading.value = true
  try {
    productBranchSyncLogs.value = await listGitlabProductBranchSyncLogs(currentProductBindingId.value)
  } finally {
    productBranchSyncLogsLoading.value = false
  }
}
const loadAutoMergeConfigs = async () => { autoMergeLoading.value = true; try { const pageData = await pageGitlabAutoMergeConfigs({ page: autoMergeRequestPage.value, size: autoMergeRequestSize.value, keyword: autoMergeFilters.keyword, executionMode: autoMergeFilters.executionMode, enabled: autoMergeFilters.enabled }); autoMergeList.value = pageData.records; autoMergePagination.total = pageData.total } finally { autoMergeLoading.value = false } }
const loadAutoMergeLogs = async () => { logLoading.value = true; try { const pageData = await pageGitlabAutoMergeLogs({ page: logRequestPage.value, size: logRequestSize.value, result: logFilters.result, triggerType: logFilters.triggerType }); logList.value = pageData.records; logPagination.total = pageData.total } finally { logLoading.value = false } }
const refreshAll = async () => { await loadBaseOptions(); await Promise.all([loadBindings(), loadProductBranches(), loadAutoMergeConfigs(), loadAutoMergeLogs(), loadOwnerRepoBindings()]) }

const handleBindingSearch = async () => { bindingFilterPopoverVisible.value = false; resetBindingMobilePagination(); await loadBindings() }
const handleBindingReset = async () => { bindingFilters.keyword = ''; bindingFilters.projectId = undefined; resetBindingMobilePagination(); await loadBindings() }
const handleBindingSizeChange = async () => { resetBindingMobilePagination(); await loadBindings() }
const handleBindingPrevPage = async () => { if (bindingPagination.page <= 1) return; bindingPagination.page -= 1; await loadBindings() }
const handleBindingNextPage = async () => { if (bindingPagination.page >= bindingTotalPages.value) return; bindingPagination.page += 1; await loadBindings() }
const handleAutoMergeSearch = async () => { autoMergeFilterPopoverVisible.value = false; resetAutoMergeMobilePagination(); await loadAutoMergeConfigs() }
const handleAutoMergeReset = async () => { autoMergeFilters.keyword = ''; autoMergeFilters.executionMode = undefined; autoMergeFilters.enabled = undefined; resetAutoMergeMobilePagination(); await loadAutoMergeConfigs() }
const handleAutoMergeSizeChange = async () => { resetAutoMergeMobilePagination(); await loadAutoMergeConfigs() }
const handleAutoMergePrevPage = async () => { if (autoMergePagination.page <= 1) return; autoMergePagination.page -= 1; await loadAutoMergeConfigs() }
const handleAutoMergeNextPage = async () => { if (autoMergePagination.page >= autoMergeTotalPages.value) return; autoMergePagination.page += 1; await loadAutoMergeConfigs() }
const handleLogSearch = async () => { logFilterPopoverVisible.value = false; resetLogMobilePagination(); await loadAutoMergeLogs() }
const handleLogReset = async () => { logFilters.result = undefined; logFilters.triggerType = undefined; resetLogMobilePagination(); await loadAutoMergeLogs() }
const handleLogSizeChange = async () => { resetLogMobilePagination(); await loadAutoMergeLogs() }
const handleLogPrevPage = async () => { if (logPagination.page <= 1) return; logPagination.page -= 1; await loadAutoMergeLogs() }
const handleLogNextPage = async () => { if (logPagination.page >= logTotalPages.value) return; logPagination.page += 1; await loadAutoMergeLogs() }
const handleProductBindingChange = async () => {
  selectedProductBranchIds.value = []
  await loadProductBranches()
}
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

const openBindingCreateDialog = () => {
  bindingIsEditing.value = false
  resetBindingForm()
  bindingDialogVisible.value = true
}
const openBindingEditDialog = (row: ProjectGitlabBindingItem) => {
  bindingIsEditing.value = true
  currentBindingId.value = row.id
  bindingForm.projectId = row.projectId
  bindingForm.apiBaseUrl = row.apiBaseUrl
  bindingForm.gitlabProjectRef = row.gitlabProjectPath || row.gitlabProjectRef
  bindingForm.defaultTargetBranch = row.defaultTargetBranch || ''
  bindingForm.productMainBranch = row.productMainBranch || ''
  bindingForm.apiToken = ''
  bindingForm.enabled = row.enabled
  applyBindingTestProfile(row.testProfileJson)
  bindingDialogVisible.value = true
}
const handleBindingSubmit = async () => {
  const valid = await bindingFormRef.value?.validate().catch(() => false)
  if (!valid || bindingForm.projectId === null) return
  if (!bindingIsEditing.value && !bindingForm.apiToken.trim()) {
    ElMessage.warning('新增绑定时必须填写 APIToken')
    return
  }
  bindingSubmitting.value = true
  try {
    const payload = {
      projectId: bindingForm.projectId,
      apiBaseUrl: bindingForm.apiBaseUrl.trim(),
      gitlabProjectRef: bindingForm.gitlabProjectRef.trim(),
      defaultTargetBranch: bindingForm.defaultTargetBranch.trim(),
      productMainBranch: bindingForm.productMainBranch.trim(),
      apiToken: bindingForm.apiToken,
      enabled: bindingForm.enabled,
      testProfileJson: buildBindingTestProfileJson()
    }
    if (bindingIsEditing.value && currentBindingId.value !== null) {
      await updateGitlabBinding(currentBindingId.value, payload)
      ElMessage.success('GitLab 绑定已更新')
    } else {
      await createGitlabBinding(payload)
      ElMessage.success('GitLab 绑定已创建')
    }
    bindingDialogVisible.value = false
    await refreshAll()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    bindingSubmitting.value = false
  }
}
const handleBindingDelete = async (id: number) => { try { await ElMessageBox.confirm('删除绑定后，关联的自动合并策略也会受影响，是否继续？', '提示', { type: 'warning' }); await deleteGitlabBinding(id); ElMessage.success('绑定已删除'); await refreshAll() } catch (error: any) { if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '删除失败') } }
const handleBindingTest = async (id: number) => { try { const result = await testGitlabBinding(id); ElMessage.success(`连接成功：${result.gitlabProjectPath || result.gitlabProjectRef}`); await refreshAll() } catch (error: any) { ElMessage.error(error?.response?.data?.message || '连接测试失败') } }
const openTagCreateDialog = async (row: ProjectGitlabBindingItem) => { resetTagForm(); currentTagBinding.value = row; tagDialogVisible.value = true; await loadTagBranches() }
const handleTagSubmit = async () => { const valid = await tagFormRef.value?.validate().catch(() => false); if (!valid || !currentTagBinding.value) return; tagSubmitting.value = true; try { const result = await createGitlabTag(currentTagBinding.value.id, { tagName: tagForm.tagName.trim(), branchName: tagForm.branchName.trim(), message: tagForm.message.trim() || undefined }); tagResult.value = result; tagDialogVisible.value = false; tagResultVisible.value = true; ElMessage.success(`Tag ${result.tagName} 已创建`) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '创建 Tag 失败') } finally { tagSubmitting.value = false } }
const resetScanForm = () => { scanForm.branch = ''; scanForm.rulesetCode = ''; scanForm.planAgentId = null; scanBranchOptions.value = []; scanFormRef.value?.clearValidate() }
const loadScanRulesets = async () => {
  scanRulesetOptions.value = await listRepositoryScanRulesets()
  const defaultRuleset = scanRulesetOptions.value.find((item) => item.defaultSelected) || scanRulesetOptions.value[0]
  if (!scanForm.rulesetCode && defaultRuleset) {
    scanForm.rulesetCode = defaultRuleset.code
  }
}
const loadScanBranches = async (keyword = '') => {
  if (!currentScanBinding.value) return
  scanBranchLoading.value = true
  try {
    scanBranchOptions.value = await listGitlabBranches(currentScanBinding.value.id, keyword || undefined)
    if (!scanForm.branch) {
      const defaultBranch = scanBranchOptions.value.find((item) => item.defaultBranch)?.name || currentScanBinding.value.defaultTargetBranch || scanBranchOptions.value[0]?.name || ''
      scanForm.branch = defaultBranch
    }
  } finally {
    scanBranchLoading.value = false
  }
}
const handleScanBranchSearch = async (keyword: string) => { await loadScanBranches(keyword) }
const openBindingScanDialog = async (row: ProjectGitlabBindingItem) => {
  currentScanBinding.value = row
  resetScanForm()
  scanDialogVisible.value = true
  scanForm.branch = row.defaultTargetBranch || ''
  try {
    await Promise.all([loadScanBranches(row.defaultTargetBranch || ''), loadScanRulesets()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载扫描配置失败')
  }
}
const handleScanSubmit = async () => {
  const valid = await scanFormRef.value?.validate().catch(() => false)
  if (!valid || !currentScanBinding.value) return
  scanSubmitting.value = true
  try {
    const executionTask = await createGitlabBindingScanTask(currentScanBinding.value.id, {
      branch: scanForm.branch.trim(),
      rulesetCode: scanForm.rulesetCode.trim(),
      planAgentId: scanForm.planAgentId
    })
    scanDialogVisible.value = false
    ElMessage.success('仓库规范扫描任务已创建')
    await router.push({ name: 'execution-task-detail', params: { executionTaskId: executionTask.id } })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建扫描任务失败')
  } finally {
    scanSubmitting.value = false
  }
}
const resetApiSyncForm = () => {
  apiSyncForm.branch = ''
  apiSyncBranchOptions.value = []
  apiSyncResult.value = null
}
const loadApiSyncBranches = async (keyword = '') => {
  if (!currentApiSyncBinding.value) return
  apiSyncBranchLoading.value = true
  try {
    apiSyncBranchOptions.value = await listGitlabBranches(currentApiSyncBinding.value.id, keyword || undefined)
    if (!apiSyncForm.branch) {
      const defaultBranch = apiSyncBranchOptions.value.find((item) => item.defaultBranch)?.name || currentApiSyncBinding.value.defaultTargetBranch || apiSyncBranchOptions.value[0]?.name || ''
      apiSyncForm.branch = defaultBranch
    }
  } finally {
    apiSyncBranchLoading.value = false
  }
}
const handleApiSyncBranchSearch = async (keyword: string) => { await loadApiSyncBranches(keyword) }
const openApiSyncDialog = async (row: ProjectGitlabBindingItem) => {
  if (!canSyncBindingApi(row)) {
    ElMessage.warning('仅后端仓库和混合仓库支持同步 API')
    return
  }
  currentApiSyncBinding.value = row
  resetApiSyncForm()
  apiSyncDialogVisible.value = true
  apiSyncForm.branch = row.defaultTargetBranch || ''
  try {
    await loadApiSyncBranches(row.defaultTargetBranch || '')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载同步分支失败')
  }
}
const handleApiSyncSubmit = async () => {
  if (!currentApiSyncBinding.value) return
  apiSyncSubmitting.value = true
  try {
    const result = await syncGitlabBindingApi(currentApiSyncBinding.value.id, {
      branch: apiSyncForm.branch.trim() || undefined
    })
    apiSyncResult.value = result
    apiSyncDialogVisible.value = false
    apiSyncResultVisible.value = true
    ElMessage.success(`同步 API 完成：新增 ${result.createdCount}，更新 ${result.updatedCount}，删除 ${result.deletedCount}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '同步 API 失败')
  } finally {
    apiSyncSubmitting.value = false
  }
}
const openApiWorkspace = async (projectId: number) => {
  await router.push({ name: 'api-studio-workbench', params: { projectId } })
}
const openBindingMergeRequests = async (row: ProjectGitlabBindingItem) => { mergeRequestDrawerTitle.value = `绑定仓库 MR 预览 - ${row.projectName} / ${row.gitlabProjectPath || row.gitlabProjectRef}`; mergeRequestDrawerVisible.value = true; mergeRequestLoading.value = true; try { mergeRequestList.value = await previewBindingMergeRequests(row.id, row.defaultTargetBranch || undefined) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载 MR 失败') } finally { mergeRequestLoading.value = false } }
const openBindingCodeStructure = (row: ProjectGitlabBindingItem) => {
  const targetRoute = router.resolve({
    name: 'gitlab-binding-code-structure',
    params: { id: row.id },
    query: row.defaultTargetBranch ? { branch: row.defaultTargetBranch } : undefined
  })
  const opened = window.open(targetRoute.href, '_blank', 'noopener,noreferrer')
  if (!opened) {
    ElMessage.warning('浏览器拦截了新标签页，请允许弹出窗口后重试')
  }
}

const openProductBranchCreateDialog = () => {
  if (!currentProductBinding.value) {
    ElMessage.warning('请先选择一个 GitLab 绑定')
    return
  }
  productBranchIsEditing.value = false
  resetProductBranchForm()
  productBranchDialogVisible.value = true
}

const openProductBranchEditDialog = (row: GitlabProductBranchItem) => {
  productBranchIsEditing.value = true
  currentProductBranchId.value = row.id
  productBranchForm.lineCode = row.lineCode
  productBranchForm.lineName = row.lineName
  productBranchForm.branchName = row.branchName
  productBranchForm.enabled = row.enabled
  productBranchDialogVisible.value = true
}

const handleProductBranchSubmit = async () => {
  const valid = await productBranchFormRef.value?.validate().catch(() => false)
  if (!valid || !currentProductBindingId.value) return
  productBranchSubmitting.value = true
  try {
    const payload = {
      lineCode: productBranchForm.lineCode.trim(),
      lineName: productBranchForm.lineName.trim(),
      branchName: productBranchForm.branchName.trim(),
      enabled: productBranchForm.enabled
    }
    if (productBranchIsEditing.value && currentProductBranchId.value !== null) {
      await updateGitlabProductBranch(currentProductBindingId.value, currentProductBranchId.value, payload)
      ElMessage.success('产品分支已更新')
    } else {
      await createGitlabProductBranch(currentProductBindingId.value, payload)
      ElMessage.success('产品分支已创建')
    }
    productBranchDialogVisible.value = false
    await loadProductBranches()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存产品分支失败')
  } finally {
    productBranchSubmitting.value = false
  }
}

const handleProductBranchDelete = async (row: GitlabProductBranchItem) => {
  if (!currentProductBindingId.value) return
  try {
    await ElMessageBox.confirm(`确认删除产品分支「${row.lineName}」吗？`, '提示', { type: 'warning' })
    await deleteGitlabProductBranch(currentProductBindingId.value, row.id)
    ElMessage.success('产品分支已删除')
    selectedProductBranchIds.value = selectedProductBranchIds.value.filter((id) => id !== row.id)
    await loadProductBranches()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除产品分支失败')
    }
  }
}

const openProductBranchSyncDialog = (branchIds?: number[]) => {
  if (!currentProductBinding.value) {
    ElMessage.warning('请先选择一个 GitLab 绑定')
    return
  }
  if (!currentProductBinding.value.productMainBranch) {
    ElMessage.warning('请先在 GitLab 绑定中配置产品主线分支')
    return
  }
  if (branchIds?.length) {
    selectedProductBranchIds.value = [...branchIds]
  }
  if (!selectedProductBranchIds.value.length) {
    ElMessage.warning('请至少选择一个产品分支')
    return
  }
  productBranchSyncDialogVisible.value = true
}

const handleProductBranchSyncSubmit = async () => {
  if (!currentProductBindingId.value || !selectedProductBranchIds.value.length) return
  productBranchSyncSubmitting.value = true
  try {
    const result = await createGitlabProductBranchSyncMergeRequests(currentProductBindingId.value, {
      productBranchIds: selectedProductBranchIds.value
    })
    productBranchSyncRunResult.value = result
    productBranchSyncDialogVisible.value = false
    productBranchSyncRunResultVisible.value = true
    await Promise.all([loadProductBranches(), loadProductBranchSyncLogs()])
    ElMessage.success(`同步完成：创建 ${result.createdCount}，无变更 ${result.noChangeCount}，已存在 ${result.existingOpenMrCount}，失败 ${result.failedCount}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建同步 MR 失败')
  } finally {
    productBranchSyncSubmitting.value = false
  }
}

const openProductBranchSyncLogs = async () => {
  productBranchSyncLogsVisible.value = true
  try {
    await loadProductBranchSyncLogs()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载同步日志失败')
  }
}

const openAutoMergeCreateDialog = async () => {
  autoMergeReadonlyMode.value = false
  autoMergeIsEditing.value = false
  resetAutoMergeForm()
  await loadAutoMergePipelineTargetOptions(autoMergeForm.bindingId)
  autoMergeDialogVisible.value = true
}
const fillAutoMergeForm = async (row: GitlabAutoMergeConfigItem) => {
  autoMergeIsEditing.value = true
  currentAutoMergeId.value = row.id
  autoMergeForm.name = row.name
  autoMergeForm.executionMode = row.executionMode
  autoMergeForm.description = row.description
  autoMergeForm.bindingId = row.bindingId
  autoMergeForm.apiBaseUrl = row.apiBaseUrl
  autoMergeForm.gitlabProjectRef = row.executionMode === 'STANDALONE' ? row.gitlabProjectRef : ''
  autoMergeForm.apiToken = ''
  autoMergeForm.sourceBranch = row.sourceBranch || ''
  autoMergeForm.targetBranch = row.targetBranch || ''
  autoMergeForm.titleKeyword = row.titleKeyword || ''
  autoMergeForm.schedulerEnabled = row.schedulerEnabled
  autoMergeForm.schedulerCron = row.schedulerCron || '0 */5 * * * *'
  autoMergeForm.enabled = row.enabled
  autoMergeForm.autoMerge = row.autoMerge
  autoMergeForm.squashOnMerge = row.squashOnMerge
  autoMergeForm.removeSourceBranch = row.removeSourceBranch
  autoMergeForm.triggerPipelineAfterMerge = row.triggerPipelineAfterMerge
  autoMergeForm.requirePipelineSuccess = row.requirePipelineSuccess
  autoMergeForm.reviewAgentId = row.reviewAgentId
  autoMergeForm.aiReviewEnabled = row.aiReviewEnabled
  autoMergeForm.aiReviewPrompt = row.aiReviewPrompt || ''
  autoMergeForm.reviewStrictness = row.reviewStrictness || 'MEDIUM'
  autoMergeForm.pipelineTargets = (row.pipelineTargets || []).map((item) => ({
    targetType: item.targetType as AutoMergePipelineTargetType,
    targetId: item.targetId
  }))
  cronTemplate.value = ''
  await loadAutoMergePipelineTargetOptions(row.bindingId)
}
const openAutoMergeDetailDialog = async (row: GitlabAutoMergeConfigItem) => {
  autoMergeReadonlyMode.value = true
  await fillAutoMergeForm(row)
  autoMergeDialogVisible.value = true
}
const openAutoMergeEditDialog = async (row: GitlabAutoMergeConfigItem) => {
  autoMergeReadonlyMode.value = false
  await fillAutoMergeForm(row)
  autoMergeDialogVisible.value = true
}
const handleAutoMergeSubmit = async () => {
  const valid = await autoMergeFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (autoMergeForm.executionMode === 'PROJECT_BOUND' && !autoMergeForm.bindingId) {
    ElMessage.warning('关联业务项目模式必须选择 GitLab 绑定')
    return
  }
  if (autoMergeForm.executionMode === 'PROJECT_BOUND' && autoMergeForm.triggerPipelineAfterMerge && autoMergeForm.pipelineTargets.length === 0) {
    ElMessage.warning('开启合并后触发流水线时，必须至少选择 1 条目标流水线')
    return
  }
  if (autoMergeForm.executionMode === 'STANDALONE') {
    if (!autoMergeForm.apiBaseUrl.trim() || !autoMergeForm.gitlabProjectRef.trim()) {
      ElMessage.warning('独立运行模式必须填写 GitLab API 和项目标识')
      return
    }
    if (!autoMergeIsEditing.value && !autoMergeForm.apiToken.trim()) {
      ElMessage.warning('独立运行模式新增时必须填写 APIToken')
      return
    }
    if (autoMergeForm.triggerPipelineAfterMerge) {
      ElMessage.warning('独立运行模式不支持合并后自动触发流水线')
      return
    }
  }
  if (autoMergeForm.schedulerEnabled && !autoMergeForm.schedulerCron.trim()) {
    ElMessage.warning('启用调度时必须填写 Cron 表达式')
    return
  }
  if (autoMergeForm.aiReviewEnabled && !autoMergeForm.reviewAgentId) {
    ElMessage.warning('启用 AI Review 时必须选择模型')
    return
  }
  if (!autoMergeForm.aiReviewEnabled) {
    autoMergeForm.reviewStrictness = 'MEDIUM'
  }
  autoMergeSubmitting.value = true
  try {
    const payload = {
      ...autoMergeForm,
      schedulerCron: autoMergeForm.schedulerCron.trim(),
      pipelineTargets: autoMergeForm.triggerPipelineAfterMerge ? autoMergeForm.pipelineTargets : []
    }
    if (autoMergeIsEditing.value && currentAutoMergeId.value !== null) {
      await updateGitlabAutoMergeConfig(currentAutoMergeId.value, payload)
      ElMessage.success('自动合并策略已更新')
    } else {
      await createGitlabAutoMergeConfig(payload)
      ElMessage.success('自动合并策略已创建')
    }
    autoMergeDialogVisible.value = false
    await refreshAll()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    autoMergeSubmitting.value = false
  }
}
const handleAutoMergeDelete = async (id: number) => { try { await ElMessageBox.confirm('确认删除该自动合并策略吗？', '提示', { type: 'warning' }); await deleteGitlabAutoMergeConfig(id); ElMessage.success('自动合并策略已删除'); await refreshAll() } catch (error: any) { if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '删除失败') } }
const handleAutoMergeTest = async (id: number) => { try { await testGitlabAutoMergeConfig(id); ElMessage.success('策略测试成功') } catch (error: any) { ElMessage.error(error?.response?.data?.message || '策略测试失败') } }
const openAutoMergeMergeRequests = async (row: GitlabAutoMergeConfigItem) => { mergeRequestDrawerTitle.value = `自动合并 MR 预览 - ${row.name}`; mergeRequestDrawerVisible.value = true; mergeRequestLoading.value = true; try { mergeRequestList.value = await previewAutoMergeConfigMergeRequests(row.id) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载 MR 失败') } finally { mergeRequestLoading.value = false } }
const handleAutoMergeRun = async (id: number) => { try { const result = await runAutoMergeConfig(id); runResult.value = result; runResultVisible.value = true; ElMessage.success(`执行完成：成功 ${result.mergedCount}，未合并 ${result.skippedCount}`); await Promise.all([loadAutoMergeConfigs(), loadAutoMergeLogs()]) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '执行失败'); await loadAutoMergeLogs() } }

// ===== 自动合并外发 Webhook 管理 =====
/** 重置编辑表单到默认值。 */
const resetAutoMergeWebhookForm = () => {
  autoMergeWebhookEditingId.value = null
  autoMergeWebhookForm.name = ''
  autoMergeWebhookForm.targetUrl = ''
  autoMergeWebhookForm.subscribedEvents = ['MERGED', 'AI_REJECTED', 'FAILED']
  autoMergeWebhookForm.messageTemplate = ''
  autoMergeWebhookForm.enabled = true
}

/** 加载指定配置下的全部 Webhook。 */
const loadAutoMergeWebhookList = async () => {
  if (autoMergeWebhookConfigId.value === null) return
  autoMergeWebhookListLoading.value = true
  try {
    autoMergeWebhookList.value = await listAutoMergeWebhooks(autoMergeWebhookConfigId.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Webhook 失败')
  } finally {
    autoMergeWebhookListLoading.value = false
  }
}

/** 行操作：打开 Webhook 管理 dialog。 */
const openAutoMergeWebhookDialog = async (configId: number) => {
  autoMergeWebhookConfigId.value = configId
  autoMergeWebhookList.value = []
  autoMergeWebhookDialogVisible.value = true
  await loadAutoMergeWebhookList()
}

/** 打开新建 Webhook 子 dialog。 */
const openAutoMergeWebhookCreate = () => {
  resetAutoMergeWebhookForm()
  autoMergeWebhookEditDialogVisible.value = true
}

/** 打开编辑 Webhook 子 dialog；URL 出于安全考虑不会回填，需要重新填写。 */
const openAutoMergeWebhookEdit = (row: GitlabAutoMergeWebhookItem) => {
  autoMergeWebhookEditingId.value = row.id
  autoMergeWebhookForm.name = row.name
  autoMergeWebhookForm.targetUrl = ''
  autoMergeWebhookForm.subscribedEvents = (row.subscribedEvents || []).slice()
  autoMergeWebhookForm.messageTemplate = row.messageTemplate || ''
  autoMergeWebhookForm.enabled = row.enabled
  autoMergeWebhookEditDialogVisible.value = true
}

/** 保存（新建/更新）。 */
const handleAutoMergeWebhookSubmit = async () => {
  const valid = await autoMergeWebhookFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (autoMergeWebhookConfigId.value === null) return
  autoMergeWebhookSubmitting.value = true
  try {
    const payload = {
      name: autoMergeWebhookForm.name.trim(),
      targetUrl: autoMergeWebhookForm.targetUrl.trim(),
      subscribedEvents: autoMergeWebhookForm.subscribedEvents.slice(),
      messageTemplate: autoMergeWebhookForm.messageTemplate.trim() || null,
      enabled: autoMergeWebhookForm.enabled
    }
    if (autoMergeWebhookEditingId.value !== null) {
      await updateAutoMergeWebhook(autoMergeWebhookEditingId.value, payload)
      ElMessage.success('Webhook 已更新')
    } else {
      await createAutoMergeWebhook(autoMergeWebhookConfigId.value, payload)
      ElMessage.success('Webhook 已创建')
    }
    autoMergeWebhookEditDialogVisible.value = false
    await loadAutoMergeWebhookList()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败')
  } finally {
    autoMergeWebhookSubmitting.value = false
  }
}

/** 删除一条 Webhook。 */
const handleAutoMergeWebhookDelete = async (row: GitlabAutoMergeWebhookItem) => {
  try {
    await ElMessageBox.confirm(`确认删除 Webhook「${row.name}」吗？`, '提示', { type: 'warning' })
    await deleteAutoMergeWebhook(row.id)
    ElMessage.success('Webhook 已删除')
    await loadAutoMergeWebhookList()
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error?.response?.data?.message || '删除失败')
  }
}

/** 触发一次测试投递并刷新列表。 */
const handleAutoMergeWebhookTest = async (row: GitlabAutoMergeWebhookItem) => {
  try {
    const result = await testAutoMergeWebhook(row.id)
    if (result.lastDeliveryStatus === 'SUCCESS') {
      ElMessage.success('测试投递成功')
    } else {
      ElMessage.warning(`测试投递结果：${result.lastDeliveryStatus || '未知'}`)
    }
    await loadAutoMergeWebhookList()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '测试投递失败')
  }
}

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

.gitlab-binding-table {
  min-width: 1360px;
}

.gitlab-product-branch-table,
.gitlab-auto-merge-table,
.gitlab-log-table {
  min-width: 1160px;
}

.gitlab-product-branch-table {
  min-width: 1080px;
}

.gitlab-binding-col-main { width: 22%; }
.gitlab-binding-col-branch { width: 9%; }
.gitlab-binding-col-api { width: 14%; }
.gitlab-binding-col-status { width: 6%; }
.gitlab-binding-col-structure { width: 13%; }
.gitlab-binding-col-test { width: 8%; }
.gitlab-binding-col-updated { width: 13%; }
.gitlab-binding-col-actions { width: 15%; }

.gitlab-product-branch-table col.gitlab-product-col-select { width: 3.5%; }
.gitlab-product-branch-table col.gitlab-product-col-main { width: 16.5%; }
.gitlab-product-branch-table col.gitlab-product-col-branch { width: 28%; }
.gitlab-product-branch-table col.gitlab-product-col-status { width: 22%; }
.gitlab-product-branch-table col.gitlab-product-col-mr { width: 14%; }
.gitlab-product-branch-table col.gitlab-product-col-enabled { width: 8%; }
.gitlab-product-branch-table col.gitlab-product-col-actions { width: 8%; }

.gitlab-product-col-select {
  padding-left: 4px !important;
  padding-right: 4px !important;
  text-align: center;
}

.gitlab-product-col-main {
  padding-left: 8px !important;
}

.gitlab-product-col-main :deep(.management-list-title-copy) {
  min-width: 0;
}

.gitlab-product-col-main :deep(.management-list-title-cell) {
  gap: 8px;
}

.gitlab-product-col-main :deep(.management-list-title-icon) {
  width: 22px;
  height: 22px;
}

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

.gitlab-binding-structure-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.gitlab-meta-note {
  color: #758393;
  font-size: 11px;
}

.gitlab-action-button.connection:hover,
.gitlab-action-button.preview:hover {
  color: #00658f;
}

.gitlab-action-button.scan:hover {
  color: #0f766e;
}

.gitlab-action-button.api-sync:hover {
  color: #7c3aed;
}

.gitlab-action-button.run:hover {
  color: #8b5e34;
}

.gitlab-api-sync-warning-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #92400e;
  font-size: 12px;
  line-height: 1.7;
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

.gitlab-product-toolbar-side {
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 1280px) and (min-width: 901px) {
  /* GitLab 工具栏同时承载 tab、搜索和筛选，压缩阶段允许主工具区换行，
     避免 tab 条被硬拉成长条并把其它控件推出可视区。 */
  .gitlab-list-page .management-list-toolbar {
    align-items: start;
  }

  .gitlab-list-page .management-list-toolbar-main {
    flex-wrap: wrap;
    gap: 10px 12px;
  }

  .gitlab-list-page .gitlab-tab-switcher {
    width: auto;
    max-width: 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
  }
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
.auto-merge-label-with-help {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1.2;
}
.auto-merge-help-icon {
  color: #7a8ca4;
  font-size: 15px;
  transition: color 0.18s ease, transform 0.18s ease;
}
.auto-merge-help-icon:hover {
  color: var(--app-tertiary);
  transform: translateY(-1px);
}
.auto-merge-strictness-item :deep(.el-form-item__label),
.auto-merge-strictness-item :deep(.el-form-item__content) {
  align-items: center;
}
.auto-merge-strictness-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.auto-merge-strictness-group :deep(.el-radio-button) {
  margin: 0;
}
.auto-merge-strictness-group :deep(.el-radio-button__inner) {
  min-width: 44px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  border-radius: 999px !important;
  background: #f3f5f7;
  color: #5f6f82;
  font-weight: 800;
  line-height: 1;
  box-shadow: inset 0 0 0 1px rgba(25, 28, 29, 0.06) !important;
}
.auto-merge-strictness-group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: var(--app-primary-container);
  color: #fff;
  box-shadow: 0 8px 18px rgba(var(--app-primary-container-rgb), 0.25) !important;
}
.auto-merge-strictness-group :deep(.el-radio-button.is-disabled .el-radio-button__inner) {
  background: #f3f5f7;
  color: #a6b0bd;
  box-shadow: inset 0 0 0 1px rgba(25, 28, 29, 0.04) !important;
}
.card-header { justify-content: space-between; }
.filter-form { margin-bottom: 18px; flex-wrap: wrap; }
.pagination-wrap { justify-content: flex-end; margin-top: 20px; }
.form-tip { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; margin-top: 6px; }
.gitlab-log-detail-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gitlab-log-detail-section {
  padding: 16px;
}

.gitlab-log-detail-summary {
  margin-top: 8px;
}

.gitlab-log-detail-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.log-detail-markdown {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  margin-top: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  background: var(--el-fill-color-blank);
  line-height: 1.8;
}
.log-detail-markdown :deep(h1),
.log-detail-markdown :deep(h2),
.log-detail-markdown :deep(h3) { margin: 0 0 12px; }
.log-detail-markdown :deep(p) { margin: 0 0 12px; }
.log-detail-markdown :deep(ul),
.log-detail-markdown :deep(ol) { padding-left: 20px; margin: 0 0 12px; }
.log-detail-markdown :deep(pre) { overflow: auto; padding: 12px; border-radius: 6px; background: var(--el-fill-color-light); }
.log-detail-markdown :deep(code) { font-family: var(--app-font-mono); }

.gitlab-share-dialog {
  padding: 6px 4px 2px;
}

.gitlab-share-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;
}

.gitlab-share-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 18px 16px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96) 0%, rgba(239, 244, 248, 0.92) 100%);
  border: 1px solid rgba(125, 145, 170, 0.14);
}

.gitlab-share-field > span {
  font-size: 13px;
  font-weight: 600;
  color: #62738a;
}

.gitlab-share-field strong {
  font-size: 18px;
  color: #1d344d;
}

.gitlab-share-field-full {
  grid-column: 1 / -1;
}

.gitlab-share-switch {
  justify-content: space-between;
}

:deep(.el-dialog.gitlab-log-detail-dialog) {
  --platform-dialog-max-height: min(75vh, calc(100vh - 48px));
  max-height: var(--platform-dialog-max-height);
}

:deep(.gitlab-log-detail-dialog .el-dialog__body) {
  overflow: hidden;
  padding-top: 10px;
  padding-bottom: 18px;
}

.platform-form-inline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.platform-form-inline-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.platform-form-inline-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.binding-http-check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.binding-http-check-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.1fr) 110px minmax(180px, 1.6fr) max-content;
  gap: 12px;
  align-items: center;
}

.binding-http-check-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.binding-http-check-status {
  width: 132px;
  flex: 0 0 132px;
}

.binding-http-check-remove {
  flex: 0 0 auto;
  padding-inline: 0;
}

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

  .gitlab-product-toolbar-side {
    justify-content: flex-start;
  }
}

@media (max-width: 680px) {
  .gitlab-overview {
    grid-template-columns: 1fr;
  }

  .binding-http-check-row {
    grid-template-columns: 1fr;
  }

  .binding-http-check-actions {
    justify-content: space-between;
  }

  .gitlab-share-grid {
    grid-template-columns: 1fr;
  }

  .gitlab-share-field-full {
    grid-column: auto;
  }
}
</style>
