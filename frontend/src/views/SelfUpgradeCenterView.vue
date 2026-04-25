<template>
  <div class="self-upgrade-page">
    <section class="management-list-toolbar self-upgrade-toolbar">
      <div class="management-list-toolbar-main self-upgrade-toolbar-main">
        <div class="gitlab-tab-switcher self-upgrade-tab-switcher" role="tablist" aria-label="自升级中心标签切换">
          <button class="gitlab-tab-button" :class="{ active: activeTab === 'plans' }" type="button" @click="activeTab = 'plans'">
            巡检计划
          </button>
          <button class="gitlab-tab-button" :class="{ active: activeTab === 'runs' }" type="button" @click="activeTab = 'runs'">
            巡检运行
          </button>
          <button class="gitlab-tab-button" :class="{ active: activeTab === 'suggestions' }" type="button" @click="activeTab = 'suggestions'">
            优化建议
          </button>
        </div>

        <span class="management-list-toolbar-divider" aria-hidden="true"></span>

        <template v-if="showActiveKeywordSearch">
          <div class="management-list-search-shell">
            <el-icon class="management-list-search-icon"><Search /></el-icon>
            <input
              v-model="activeKeyword"
              class="management-list-search-input"
              type="text"
              :placeholder="activeSearchPlaceholder"
              @keyup.enter="handleActiveSearch"
            />
          </div>

          <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        </template>
        <template v-else>
          <div class="self-upgrade-toolbar-hint">{{ activeToolbarHint }}</div>
          <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        </template>

        <el-popover
          v-model:visible="filterPopoverVisible"
          trigger="click"
          placement="bottom-start"
          :width="320"
          popper-class="management-list-popper"
        >
          <template #reference>
            <button
              class="management-list-toolbar-button"
              :class="{ 'self-upgrade-toolbar-filter-active': activeFilterCount > 0 }"
              type="button"
            >
              <el-icon><Filter /></el-icon>
              <span>{{ activeFilterCount > 0 ? `筛选（${activeFilterCount}）` : '筛选' }}</span>
            </button>
          </template>

          <div class="management-list-filter-panel management-list-compact-input">
            <template v-if="activeTab === 'plans'">
              <div class="management-list-filter-field">
                <label>计划状态</label>
                <el-select
                  v-model="planFilters.enabledText"
                  clearable
                  placeholder="全部计划"
                  style="width: 100%"
                  :teleported="false"
                >
                  <el-option label="全部计划" value="" />
                  <el-option label="已启用" value="true" />
                  <el-option label="已停用" value="false" />
                </el-select>
              </div>
            </template>

            <template v-else-if="activeTab === 'runs'">
              <div class="management-list-filter-field">
                <label>巡检计划</label>
                <el-select
                  v-model="runFilters.planId"
                  clearable
                  filterable
                  placeholder="全部计划"
                  style="width: 100%"
                  :teleported="false"
                >
                  <el-option v-for="plan in plans" :key="plan.id" :label="plan.name" :value="plan.id" />
                </el-select>
              </div>
              <div class="management-list-filter-field">
                <label>运行状态</label>
                <el-select
                  v-model="runFilters.status"
                  clearable
                  placeholder="全部状态"
                  style="width: 100%"
                  :teleported="false"
                >
                  <el-option label="全部状态" value="" />
                  <el-option label="进行中" value="RUNNING" />
                  <el-option label="成功" value="SUCCESS" />
                  <el-option label="部分成功" value="PARTIAL_SUCCESS" />
                  <el-option label="失败" value="FAILED" />
                  <el-option label="已取消" value="CANCELED" />
                </el-select>
              </div>
            </template>

            <template v-else>
              <div class="management-list-filter-field">
                <label>建议状态</label>
                <el-select
                  v-model="suggestionFilters.status"
                  clearable
                  placeholder="全部状态"
                  style="width: 100%"
                  :teleported="false"
                >
                  <el-option label="全部状态" value="" />
                  <el-option label="待处理" value="OPEN" />
                  <el-option label="已接受" value="ACCEPTED" />
                  <el-option label="整改中" value="IN_PROGRESS" />
                  <el-option label="已解决" value="RESOLVED" />
                  <el-option label="已拒绝" value="REJECTED" />
                </el-select>
              </div>
              <div class="management-list-filter-field">
                <label>建议分类</label>
                <el-input
                  v-model="suggestionFilters.category"
                  clearable
                  placeholder="例如：可用性 / 流程体验"
                  @keyup.enter="handleActiveSearch"
                />
              </div>
              <div class="management-list-filter-field">
                <label>严重级别</label>
                <el-select
                  v-model="suggestionFilters.severity"
                  clearable
                  placeholder="全部级别"
                  style="width: 100%"
                  :teleported="false"
                >
                  <el-option label="全部级别" value="" />
                  <el-option label="CRITICAL" value="CRITICAL" />
                  <el-option label="HIGH" value="HIGH" />
                  <el-option label="MEDIUM" value="MEDIUM" />
                  <el-option label="LOW" value="LOW" />
                </el-select>
              </div>
            </template>

            <div class="management-list-filter-actions">
              <el-button type="primary" @click="handleActiveSearch">查询</el-button>
              <el-button @click="handleActiveReset">重置</el-button>
            </div>
          </div>
        </el-popover>

        <button class="management-list-toolbar-button" type="button" @click="handleActiveReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>

        <button class="management-list-toolbar-button" type="button" @click="handleActiveRefresh">
          <el-icon><RefreshRight /></el-icon>
          <span>{{ activeTabLoading ? '刷新中' : '刷新' }}</span>
        </button>
      </div>

      <div class="management-list-toolbar-side self-upgrade-toolbar-side">
        <button v-if="canManageConfig" class="management-list-toolbar-button" type="button" @click="handleOpenConfigDrawer">
          <el-icon><Setting /></el-icon>
          <span>中心配置</span>
        </button>
        <button
          v-if="activeTab === 'plans' && canManagePlans"
          class="management-list-create-button"
          type="button"
          @click="handleOpenCreatePlanDialog"
        >
          <el-icon><Plus /></el-icon>
          <span>新建计划</span>
        </button>
      </div>
    </section>

    <template v-if="activeTab === 'plans'">
      <section class="self-upgrade-grid" :class="{ 'self-upgrade-grid-empty': !plansLoading && !plans.length }" v-loading="plansLoading">
        <article v-for="plan in plans" :key="plan.id" class="self-upgrade-card">
          <header class="self-upgrade-card-head">
            <div>
              <h2>{{ plan.name }}</h2>
              <p>{{ plan.description || '暂无计划说明' }}</p>
            </div>
            <div class="self-upgrade-tag-group">
              <span class="management-list-pill" :class="plan.enabled ? 'success' : 'neutral'">
                {{ plan.enabled ? '已启用' : '已停用' }}
              </span>
              <span class="management-list-pill" :class="plan.schedulerEnabled ? 'warning' : 'neutral'">
                {{ plan.schedulerEnabled ? '夜间调度开启' : '仅手动执行' }}
              </span>
            </div>
          </header>

          <div class="self-upgrade-meta-line">
            <span>环境：{{ plan.environmentProfileName || '未绑定环境' }}</span>
            <span>模型：{{ plan.aiModelConfigName || plan.aiModelName || '-' }}</span>
            <span>Cron：{{ plan.schedulerCron || '-' }}</span>
            <span>目标入口：{{ plan.targets.length }}</span>
            <span>最大探索步数：{{ displayNumber(plan.maxExplorationSteps) }}</span>
            <span>运行超时：{{ displayDuration(plan.runTimeoutSeconds) }}</span>
            <span>最近执行：{{ formatDateTime(plan.lastRunAt) }}</span>
            <span>最近结果：{{ planStatusLabel(plan.lastRunStatus) }}</span>
          </div>

          <div class="self-upgrade-chip-list">
            <span
              v-for="target in plan.targets.slice(0, 4)"
              :key="`${plan.id}-${target.id ?? target.name}`"
              class="management-list-chip"
            >
              {{ target.name }}
            </span>
            <span v-if="plan.targets.length > 4" class="management-list-chip muted">+{{ plan.targets.length - 4 }}</span>
          </div>

          <div class="self-upgrade-card-actions">
            <el-button v-if="canStartExecution" type="primary" @click="handleRunPlanNow(plan)">
              <el-icon><VideoPlay /></el-icon>
              <span>立即执行</span>
            </el-button>
            <el-button v-if="canManagePlans" @click="handleOpenEditPlanDialog(plan.id)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button v-if="canManagePlans" type="danger" plain @click="handleDeletePlan(plan)">
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </el-button>
          </div>
        </article>

        <el-empty v-if="!plansLoading && !plans.length" description="暂无巡检计划" />
      </section>

    </template>

    <template v-else-if="activeTab === 'runs'">
      <section class="self-upgrade-grid" :class="{ 'self-upgrade-grid-empty': !runsLoading && !runs.length }" v-loading="runsLoading">
        <article v-for="run in runs" :key="run.id" class="self-upgrade-card">
          <header class="self-upgrade-card-head">
            <div>
              <h2>{{ run.planName || `巡检运行 #${run.id}` }}</h2>
              <p>{{ run.summary || '本次巡检完成后暂无摘要。' }}</p>
            </div>
            <div class="self-upgrade-tag-group">
              <span class="management-list-pill" :class="runStatusType(run.status)">
                {{ runStatusLabel(run.status) }}
              </span>
            </div>
          </header>

          <div class="self-upgrade-meta-line">
            <span>触发方式：{{ run.triggerMode || 'MANUAL' }}</span>
            <span>环境：{{ run.environmentProfileName || '未命名环境' }}</span>
            <span>目标：{{ displayNumber(run.totalTargetCount) }}</span>
            <span>建议：{{ displayNumber(run.suggestionCount) }}</span>
            <span>发起人：{{ run.createdByName || '系统任务' }}</span>
            <span>开始：{{ formatDateTime(run.startedAt) }}</span>
            <span>结束：{{ formatDateTime(run.finishedAt) }}</span>
          </div>

          <div class="self-upgrade-chip-list">
            <span class="management-list-chip">成功 {{ displayNumber(run.successTargetCount) }}</span>
            <span class="management-list-chip">部分成功 {{ displayNumber(run.partialSuccessTargetCount) }}</span>
            <span class="management-list-chip">失败 {{ displayNumber(run.failedTargetCount) }}</span>
            <span class="management-list-chip">重开建议 {{ displayNumber(run.reopenedSuggestionCount) }}</span>
          </div>

          <div class="self-upgrade-card-actions">
            <el-button type="primary" @click="handleOpenRunDetail(run.id)">
              <el-icon><View /></el-icon>
              <span>查看详情</span>
            </el-button>
            <el-button v-if="run.linkedExecutionTaskId" @click="openExecutionTask(run.linkedExecutionTaskId)">
              <span>执行中心任务 #{{ run.linkedExecutionTaskId }}</span>
            </el-button>
          </div>
        </article>

        <el-empty v-if="!runsLoading && !runs.length" description="暂无巡检运行记录" />
      </section>

    </template>

    <template v-else>
      <section class="self-upgrade-grid self-upgrade-suggestion-grid" :class="{ 'self-upgrade-grid-empty': !suggestionsLoading && !suggestions.length }" v-loading="suggestionsLoading">
        <article v-for="suggestion in suggestions" :key="suggestion.id" class="self-upgrade-card self-upgrade-suggestion-card">
          <header class="self-upgrade-card-head">
            <div>
              <h2>{{ suggestion.title }}</h2>
              <p>{{ suggestion.latestSummary || '暂无建议摘要' }}</p>
            </div>
            <div class="self-upgrade-tag-group">
              <span class="management-list-pill" :class="severityTagType(suggestion.severity)">
                {{ suggestion.severity || 'MEDIUM' }}
              </span>
              <span class="management-list-pill" :class="suggestionStatusType(suggestion.status)">
                {{ suggestionStatusLabel(suggestion.status) }}
              </span>
            </div>
          </header>

          <div class="self-upgrade-meta-line">
            <span>分类：{{ suggestion.category || '未分类' }}</span>
            <span>命中：{{ displayNumber(suggestion.hitCount) }}</span>
            <span>重开：{{ displayNumber(suggestion.reopenCount) }}</span>
            <span>首次发现：{{ formatDateTime(suggestion.firstFoundAt) }}</span>
            <span>最近发现：{{ formatDateTime(suggestion.lastFoundAt) }}</span>
          </div>

          <div class="self-upgrade-evidence-preview" v-html="renderPreviewHtml(suggestion.latestEvidenceMarkdown)"></div>

          <div class="self-upgrade-card-actions">
            <el-button type="primary" @click="handleOpenSuggestionDetail(suggestion.id)">
              <el-icon><View /></el-icon>
              <span>详情</span>
            </el-button>
            <el-button
              v-if="canManageSuggestions && suggestion.status === 'OPEN'"
              type="success"
              plain
              @click="handleAcceptSuggestionCard(suggestion)"
            >
              <el-icon><Finished /></el-icon>
              <span>接受</span>
            </el-button>
            <el-button
              v-if="canManageSuggestions && ['OPEN', 'ACCEPTED'].includes(suggestion.status)"
              type="danger"
              plain
              @click="handleRejectSuggestionCard(suggestion)"
            >
              <el-icon><Delete /></el-icon>
              <span>拒绝</span>
            </el-button>
            <el-button v-if="suggestion.linkedWorkItemId" @click="handleOpenSuggestionDetail(suggestion.id)">
              <span>工作项 #{{ suggestion.linkedWorkItemId }}</span>
            </el-button>
          </div>
        </article>

        <el-empty v-if="!suggestionsLoading && !suggestions.length" description="暂无优化建议" />
      </section>

    </template>

    <el-dialog
      v-model="planDialogVisible"
      :title="planDialogMode === 'create' ? '新建巡检计划' : '编辑巡检计划'"
      width="1120px"
      top="4vh"
      destroy-on-close
    >
      <div class="self-upgrade-plan-editor">
        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <h3>计划配置</h3>
            <span>定义调度策略、运行预算，以及环境和巡检模型绑定。</span>
          </div>

          <el-form label-position="top">
            <el-form-item label="计划名称">
              <el-input v-model="planForm.name" maxlength="120" placeholder="例如：STAGING 夜间体验巡检" />
            </el-form-item>
            <el-form-item label="环境档案">
              <el-select v-model="planForm.environmentProfileId" placeholder="请选择环境档案" style="width: 100%">
                <el-option
                  v-for="environment in planEnvironmentOptions"
                  :key="environment.id"
                  :label="`${environment.name} (${environment.code})`"
                  :value="environment.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="巡检模型">
              <el-select v-model="planForm.aiModelConfigId" filterable placeholder="请选择巡检模型" style="width: 100%">
                <el-option
                  v-for="model in patrolModelOptions"
                  :key="model.id"
                  :label="`${model.name} / ${model.provider} / ${model.modelName}`"
                  :value="model.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="计划说明">
              <el-input v-model="planForm.description" type="textarea" :rows="4" maxlength="1000" show-word-limit />
            </el-form-item>

            <div class="self-upgrade-inline-form-grid">
              <el-form-item label="调度 Cron">
                <el-input v-model="planForm.schedulerCron" placeholder="例如：0 0 2 * * *" />
              </el-form-item>
              <el-form-item label="最大探索步数">
                <el-input-number v-model="planForm.maxExplorationSteps" :min="1" :max="500" style="width: 100%" />
              </el-form-item>
              <el-form-item label="目标超时（秒）">
                <el-input-number v-model="planForm.targetTimeoutSeconds" :min="30" :max="7200" style="width: 100%" />
              </el-form-item>
              <el-form-item label="运行超时（秒）">
                <el-input-number v-model="planForm.runTimeoutSeconds" :min="60" :max="14400" style="width: 100%" />
              </el-form-item>
            </div>

            <div class="self-upgrade-switch-row">
              <el-switch v-model="planForm.schedulerEnabled" active-text="启用夜间调度" />
              <el-switch v-model="planForm.enabled" active-text="启用计划" />
            </div>
          </el-form>
        </section>

        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <div>
              <h3>探索入口</h3>
              <span>每个入口都会在同一浏览器会话内顺序执行。</span>
            </div>
            <el-button class="self-upgrade-head-action" type="primary" plain @click="handleAddPlanTarget">
              <el-icon><Plus /></el-icon>
              <span>新增入口</span>
            </el-button>
          </div>

          <div class="self-upgrade-target-editor-list">
            <article
              v-for="(target, index) in planForm.targets"
              :key="target.id ?? `draft-${index}`"
              class="self-upgrade-target-editor"
            >
              <div class="self-upgrade-target-editor-head">
                <div>
                  <strong>入口 {{ index + 1 }}</strong>
                  <span>{{ target.name || '未命名入口' }}</span>
                </div>
                <el-button text type="danger" @click="handleRemovePlanTarget(index)">
                  <el-icon><Delete /></el-icon>
                  <span>移除</span>
                </el-button>
              </div>

              <div class="self-upgrade-inline-form-grid">
                <el-form-item label="入口名称">
                  <el-input v-model="target.name" maxlength="120" placeholder="例如：登录后首页巡检" />
                </el-form-item>
                <el-form-item label="入口地址">
                  <el-input v-model="target.seedUrl" maxlength="500" placeholder="/dashboard 或完整 URL" />
                </el-form-item>
                <el-form-item label="页面就绪选择器">
                  <el-input v-model="target.readySelector" maxlength="300" placeholder="例如：#app .dashboard-shell" />
                </el-form-item>
                <el-form-item label="最大步数覆盖">
                  <el-input-number v-model="target.maxStepsOverride" :min="1" :max="500" style="width: 100%" />
                </el-form-item>
              </div>

              <div class="self-upgrade-switch-row">
                <el-switch v-model="target.allowWrite" active-text="允许命中白名单写操作" />
                <el-switch v-model="target.enabled" active-text="入口启用" />
              </div>

              <el-form-item label="巡检目标提示">
                <el-input v-model="target.goalPrompt" type="textarea" :rows="5" placeholder="描述希望模型重点检查的场景、证据和退出条件" />
              </el-form-item>

              <el-form-item label="写操作白名单覆盖（JSON 数组）">
                <el-input
                  v-model="target.writeAllowlistOverrideJson"
                  type="textarea"
                  :rows="4"
                  placeholder='例如：[{"pathPattern":"/settings","selector":"button.save","actionType":"CLICK","maxCount":1}]'
                />
              </el-form-item>
            </article>

            <div v-if="!planForm.targets.length" class="self-upgrade-empty-mini">
              至少需要一个探索入口，夜间巡检才知道从哪里开始。
            </div>
          </div>
        </section>
      </div>

      <template #footer>
        <div class="self-upgrade-dialog-footer">
          <el-button @click="planDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="planSaving" @click="handleSavePlan">
            {{ planDialogMode === 'create' ? '创建计划' : '保存计划' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="configDrawerVisible" title="中心配置" size="720px" destroy-on-close>
      <div v-loading="configOptionsLoading || configSaving" class="self-upgrade-drawer-body">
        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <h3>执行桥接配置</h3>
            <span>决定巡检和整改任务在后台如何桥接到执行中心。</span>
          </div>

          <el-form label-position="top">
            <el-form-item label="默认环境档案">
              <el-select v-model="configForm.defaultEnvironmentProfileId" placeholder="请选择默认环境" style="width: 100%">
                <el-option
                  v-for="environment in configForm.environmentProfiles"
                  :key="environment.id ?? environment.code"
                  :label="`${environment.name} (${environment.code})`"
                  :value="environment.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="内部载体项目">
              <el-select v-model="configForm.carrierProjectId" filterable clearable placeholder="请选择项目" style="width: 100%">
                <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="默认仓库绑定">
              <el-select
                v-model="configForm.defaultRepositoryBindingIds"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="选择整改任务默认使用的仓库绑定"
                style="width: 100%"
              >
                <el-option
                  v-for="binding in gitlabBindingOptions"
                  :key="binding.id"
                  :label="binding.gitlabProjectName || binding.gitlabProjectRef"
                  :value="binding.id"
                />
              </el-select>
            </el-form-item>

            <div class="self-upgrade-inline-form-grid">
              <el-form-item label="开发规划 Agent">
                <el-select v-model="configForm.developmentPlanAgentId" clearable filterable placeholder="选择 Agent" style="width: 100%">
                  <el-option v-for="agent in developmentAgentOptions" :key="agent.id" :label="agent.name" :value="agent.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="开发实现 Agent">
                <el-select v-model="configForm.developmentImplementAgentId" clearable filterable placeholder="选择 Agent" style="width: 100%">
                  <el-option v-for="agent in developmentAgentOptions" :key="agent.id" :label="agent.name" :value="agent.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="开发测试 Agent">
                <el-select v-model="configForm.developmentTestAgentId" clearable filterable placeholder="选择 Agent" style="width: 100%">
                  <el-option v-for="agent in developmentAgentOptions" :key="agent.id" :label="agent.name" :value="agent.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="开发报告 Agent">
                <el-select v-model="configForm.developmentReportAgentId" clearable filterable placeholder="选择 Agent" style="width: 100%">
                  <el-option v-for="agent in developmentAgentOptions" :key="agent.id" :label="agent.name" :value="agent.id" />
                </el-select>
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <div>
              <h3>环境档案</h3>
            </div>
            <el-button class="self-upgrade-head-action" plain @click="handleAddEnvironmentProfile">
              <el-icon><Plus /></el-icon>
              <span>新增环境</span>
            </el-button>
          </div>

          <div class="self-upgrade-target-editor-list">
            <article
              v-for="(environment, index) in configForm.environmentProfiles"
              :key="environment.id ?? `${environment.code}-${index}`"
              class="self-upgrade-target-editor"
            >
              <div class="self-upgrade-target-editor-head">
                <div>
                  <strong>{{ environment.name || `环境 ${index + 1}` }}</strong>
                  <span>{{ environment.code || 'ENV' }}</span>
                </div>
                <div class="self-upgrade-tag-group">
                  <el-tag size="small" effect="plain" :type="environment.sandboxPasswordConfigured ? 'success' : 'info'">
                    {{ environment.sandboxPasswordConfigured ? '已配置沙箱密码' : '未配置沙箱密码' }}
                  </el-tag>
                  <el-tag size="small" effect="plain" :type="environment.sessionStateConfigured ? 'success' : 'info'">
                    {{ environment.sessionStateConfigured ? '已配置会话态' : '未配置会话态' }}
                  </el-tag>
                </div>
              </div>

              <div class="self-upgrade-inline-form-grid">
                <el-form-item label="环境编码">
                  <el-input v-model="environment.code" maxlength="40" placeholder="例如：STAGING" />
                </el-form-item>
                <el-form-item label="环境名称">
                  <el-input v-model="environment.name" maxlength="120" placeholder="例如：预发环境" />
                </el-form-item>
                <el-form-item label="基础地址">
                  <el-input v-model="environment.baseUrl" maxlength="255" placeholder="例如：https://staging.example.com" />
                </el-form-item>
                <el-form-item label="沙箱用户名">
                  <el-input v-model="environment.sandboxUsername" maxlength="120" placeholder="可选" />
                </el-form-item>
              </div>

              <div class="self-upgrade-switch-row">
                <el-switch v-model="environment.enabled" active-text="环境启用" />
              </div>

              <el-form-item label="允许访问 Host（JSON 数组）">
                <el-input
                  v-model="environment.allowedHostPatternsJson"
                  type="textarea"
                  :rows="3"
                  placeholder='例如：["https://staging.example.com/**"]'
                />
              </el-form-item>
              <el-form-item label="登录脚本（JSON 数组）">
                <el-input
                  v-model="environment.loginScriptJson"
                  type="textarea"
                  :rows="4"
                  placeholder='例如：[{"action":"TYPE","selector":"#username","value":"admin"}]'
                />
              </el-form-item>
              <el-form-item label="沙箱密码">
                <el-input
                  v-model="environment.sandboxPassword"
                  type="password"
                  show-password
                  placeholder="留空表示保持当前已保存密码"
                />
              </el-form-item>
              <el-form-item label="会话状态（JSON，可选）">
                <el-input
                  :model-value="environment.sessionStateJson"
                  type="textarea"
                  :rows="4"
                  placeholder="留空表示保持当前已保存会话状态；如需清空，先点右侧按钮"
                  @update:model-value="handleSessionStateInput(environment, $event)"
                />
                <div class="self-upgrade-inline-action-row">
                  <el-button text @click="handleClearSessionState(environment)">清空会话状态</el-button>
                </div>
              </el-form-item>
              <el-form-item label="默认写白名单（JSON 数组）">
                <el-input
                  v-model="environment.writeAllowlistJson"
                  type="textarea"
                  :rows="4"
                  placeholder='例如：[{"pathPattern":"/settings/**","selector":"button.save","actionType":"CLICK","maxCount":1}]'
                />
              </el-form-item>
            </article>
          </div>
        </section>

        <div class="self-upgrade-dialog-footer">
          <el-button @click="configDrawerVisible = false">取消</el-button>
          <el-button type="primary" :loading="configSaving" @click="handleSaveConfig">保存配置</el-button>
        </div>
      </div>
    </el-drawer>

    <el-drawer v-model="runDetailVisible" title="巡检运行详情" size="820px" destroy-on-close>
      <div v-if="selectedRunDetail" class="self-upgrade-drawer-body">
        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <div>
              <h3>{{ selectedRunDetail.planName || `巡检运行 #${selectedRunDetail.id}` }}</h3>
              <span>{{ selectedRunDetail.summary || '暂无运行摘要' }}</span>
            </div>
            <div class="self-upgrade-tag-group">
              <el-tag size="small" effect="plain" :type="runStatusType(selectedRunDetail.status)">
                {{ runStatusLabel(selectedRunDetail.status) }}
              </el-tag>
              <el-tag size="small" effect="plain">{{ selectedRunDetail.triggerMode || 'MANUAL' }}</el-tag>
            </div>
          </div>

          <div class="self-upgrade-card-meta-grid">
            <div class="self-upgrade-meta-item">
              <span>环境</span>
              <strong>{{ selectedRunDetail.environmentProfileName || '-' }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>发起人</span>
              <strong>{{ selectedRunDetail.createdByName || '系统任务' }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>开始时间</span>
              <strong>{{ formatDateTime(selectedRunDetail.startedAt) }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>结束时间</span>
              <strong>{{ formatDateTime(selectedRunDetail.finishedAt) }}</strong>
            </div>
          </div>

          <div class="self-upgrade-chip-list">
            <span class="self-upgrade-chip">目标 {{ displayNumber(selectedRunDetail.totalTargetCount) }}</span>
            <span class="self-upgrade-chip">成功 {{ displayNumber(selectedRunDetail.successTargetCount) }}</span>
            <span class="self-upgrade-chip">部分成功 {{ displayNumber(selectedRunDetail.partialSuccessTargetCount) }}</span>
            <span class="self-upgrade-chip">失败 {{ displayNumber(selectedRunDetail.failedTargetCount) }}</span>
            <span class="self-upgrade-chip">建议 {{ displayNumber(selectedRunDetail.suggestionCount) }}</span>
          </div>

          <div v-if="selectedRunDetail.linkedExecutionTaskId" class="self-upgrade-inline-action-row">
            <el-button type="primary" plain @click="openExecutionTask(selectedRunDetail.linkedExecutionTaskId)">
              打开执行中心任务 #{{ selectedRunDetail.linkedExecutionTaskId }}
            </el-button>
          </div>
        </section>

        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <h3>目标结果</h3>
            <span>查看每个探索入口的状态、摘要和产物。</span>
          </div>

          <el-collapse v-model="expandedRunTargetIds">
            <el-collapse-item
              v-for="target in selectedRunDetail.targets"
              :key="target.id"
              :name="target.id"
              class="self-upgrade-collapse-item"
            >
              <template #title>
                <div class="self-upgrade-collapse-title">
                  <strong>{{ target.targetName }}</strong>
                  <div class="self-upgrade-tag-group">
                    <el-tag size="small" effect="plain" :type="runStatusType(target.status)">
                      {{ runStatusLabel(target.status) }}
                    </el-tag>
                    <span>{{ target.pagePath || target.seedUrl }}</span>
                  </div>
                </div>
              </template>

              <div class="self-upgrade-collapse-body">
                <div class="self-upgrade-card-meta-grid">
                  <div class="self-upgrade-meta-item">
                    <span>页面路径</span>
                    <strong>{{ target.pagePath || '-' }}</strong>
                  </div>
                  <div class="self-upgrade-meta-item">
                    <span>执行步数</span>
                    <strong>{{ displayNumber(target.stepCount) }}</strong>
                  </div>
                  <div class="self-upgrade-meta-item">
                    <span>发现数</span>
                    <strong>{{ displayNumber(target.findingCount) }}</strong>
                  </div>
                  <div class="self-upgrade-meta-item">
                    <span>Guardrail 拦截</span>
                    <strong>{{ displayNumber(target.skippedGuardrailCount) }}</strong>
                  </div>
                </div>

                <div class="self-upgrade-markdown-shell" v-html="renderMarkdownToHtml(target.summary || '暂无目标摘要')"></div>

                <div v-if="target.artifacts.length" class="self-upgrade-artifact-list">
                  <article v-for="artifact in target.artifacts" :key="`${target.id}-${artifact.executionArtifactId}-${artifact.contentRef}`" class="self-upgrade-artifact-card">
                    <div class="self-upgrade-artifact-head">
                      <div>
                        <strong>{{ artifact.title || artifact.artifactType }}</strong>
                        <span>{{ artifact.artifactType }}</span>
                      </div>
                      <el-button v-if="artifact.downloadUrl" text type="primary" @click="handleOpenArtifact(artifact.downloadUrl)">
                        下载产物
                      </el-button>
                    </div>
                    <pre v-if="artifact.previewText" class="self-upgrade-code-preview">{{ artifact.previewText }}</pre>
                    <div v-else class="self-upgrade-empty-mini">暂无预览内容，可直接下载产物。</div>
                  </article>
                </div>
                <div v-else class="self-upgrade-empty-mini">该目标暂无可展示产物。</div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </section>
      </div>
    </el-drawer>

    <el-drawer v-model="suggestionDetailVisible" title="优化建议详情" size="860px" destroy-on-close>
      <div v-if="selectedSuggestionDetail" class="self-upgrade-drawer-body">
        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <div>
              <h3>{{ selectedSuggestionDetail.title }}</h3>
              <span>{{ selectedSuggestionDetail.latestSummary || '暂无建议摘要' }}</span>
            </div>
            <div class="self-upgrade-tag-group">
              <el-tag size="small" effect="plain" :type="severityTagType(selectedSuggestionDetail.severity)">
                {{ selectedSuggestionDetail.severity || 'MEDIUM' }}
              </el-tag>
              <el-tag size="small" effect="plain" :type="suggestionStatusType(selectedSuggestionDetail.status)">
                {{ suggestionStatusLabel(selectedSuggestionDetail.status) }}
              </el-tag>
              <el-tag size="small" effect="plain">{{ selectedSuggestionDetail.category || '未分类' }}</el-tag>
            </div>
          </div>

          <div class="self-upgrade-card-meta-grid">
            <div class="self-upgrade-meta-item">
              <span>命中次数</span>
              <strong>{{ displayNumber(selectedSuggestionDetail.hitCount) }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>重开次数</span>
              <strong>{{ displayNumber(selectedSuggestionDetail.reopenCount) }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>首次发现</span>
              <strong>{{ formatDateTime(selectedSuggestionDetail.firstFoundAt) }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>最近发现</span>
              <strong>{{ formatDateTime(selectedSuggestionDetail.lastFoundAt) }}</strong>
            </div>
          </div>

          <div class="self-upgrade-inline-action-row">
            <el-button
              v-if="selectedSuggestionDetail.latestRunId"
              plain
              type="primary"
              @click="handleOpenRunFromSuggestion(selectedSuggestionDetail.latestRunId)"
            >
              查看关联运行 #{{ selectedSuggestionDetail.latestRunId }}
            </el-button>
            <el-button
              v-if="canManageSuggestions && selectedSuggestionDetail.status === 'OPEN'"
              type="success"
              plain
              :loading="suggestionActionLoading"
              @click="handleAcceptSuggestionDetail"
            >
              接受建议
            </el-button>
            <el-button
              v-if="canManageSuggestions && ['OPEN', 'ACCEPTED'].includes(selectedSuggestionDetail.status)"
              type="danger"
              plain
              :loading="suggestionActionLoading"
              @click="handleRejectSuggestionDetail"
            >
              拒绝建议
            </el-button>
          </div>
        </section>

        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <h3>最新证据</h3>
            <span>巡检生成的证据和摘要仅沉淀在自升级中心域内。</span>
          </div>
          <div class="self-upgrade-markdown-shell" v-html="renderMarkdownToHtml(selectedSuggestionDetail.latestEvidenceMarkdown || '暂无证据')"></div>
        </section>

        <section class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <h3>命中时间线</h3>
            <span>同一稳定指纹的所有 occurrence 都会保留在这里。</span>
          </div>

          <el-timeline v-if="selectedSuggestionDetail.occurrences.length">
            <el-timeline-item
              v-for="occurrence in selectedSuggestionDetail.occurrences"
              :key="occurrence.id"
              :timestamp="formatDateTime(occurrence.foundAt)"
              placement="top"
            >
              <div class="self-upgrade-occurrence-card">
                <div class="self-upgrade-inline-action-row">
                  <span>页面：{{ occurrence.pagePath || '-' }}</span>
                  <el-button
                    v-if="occurrence.runId"
                    text
                    type="primary"
                    @click="handleOpenRunFromSuggestion(occurrence.runId)"
                  >
                    运行 #{{ occurrence.runId }}
                  </el-button>
                </div>
                <div class="self-upgrade-markdown-shell compact" v-html="renderMarkdownToHtml(occurrence.evidenceMarkdown || '暂无证据')"></div>
                <div v-if="occurrence.artifacts.length" class="self-upgrade-inline-action-row">
                  <el-button
                    v-for="artifact in occurrence.artifacts"
                    :key="`${occurrence.id}-${artifact.executionArtifactId}-${artifact.contentRef}`"
                    text
                    type="primary"
                    @click="handleOpenArtifact(artifact.downloadUrl)"
                  >
                    {{ artifact.title || artifact.artifactType }}
                  </el-button>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
          <div v-else class="self-upgrade-empty-mini">暂无 occurrence 历史。</div>
        </section>

        <section v-if="selectedSuggestionDetail.workItem" class="self-upgrade-editor-card">
          <div class="self-upgrade-editor-card-head">
            <div>
              <h3>整改工作项</h3>
              <span>接受建议后只在中心内生成/复用工作项，整改执行需要人工手动发起。</span>
            </div>
            <div class="self-upgrade-tag-group">
              <el-tag size="small" effect="plain">{{ workItemForm.priority }}</el-tag>
              <el-tag size="small" effect="plain" :type="workItemStatusType(workItemForm.status)">
                {{ workItemStatusLabel(workItemForm.status) }}
              </el-tag>
            </div>
          </div>

          <el-form label-position="top">
            <div class="self-upgrade-inline-form-grid">
              <el-form-item label="工作项标题">
                <el-input v-model="workItemForm.title" maxlength="255" />
              </el-form-item>
              <el-form-item label="优先级">
                <el-select v-model="workItemForm.priority" style="width: 100%">
                  <el-option label="P0" value="P0" />
                  <el-option label="P1" value="P1" />
                  <el-option label="P2" value="P2" />
                  <el-option label="P3" value="P3" />
                </el-select>
              </el-form-item>
              <el-form-item label="状态">
                <el-select v-model="workItemForm.status" style="width: 100%">
                  <el-option label="TODO" value="TODO" />
                  <el-option label="RUNNING" value="RUNNING" />
                  <el-option label="VERIFYING" value="VERIFYING" />
                  <el-option label="DONE" value="DONE" />
                  <el-option label="CANCELED" value="CANCELED" />
                </el-select>
              </el-form-item>
              <el-form-item label="负责人">
                <el-select v-model="workItemForm.assigneeUserId" clearable filterable style="width: 100%">
                  <el-option
                    v-for="user in userOptions"
                    :key="user.id"
                    :label="user.nickname || user.username"
                    :value="user.id"
                  />
                </el-select>
              </el-form-item>
            </div>

            <el-form-item label="工作项说明">
              <el-input v-model="workItemForm.description" type="textarea" :rows="6" />
            </el-form-item>
            <el-form-item label="仓库绑定 JSON">
              <el-input v-model="workItemForm.repositoryBindingsJson" type="textarea" :rows="4" />
            </el-form-item>
            <el-form-item label="整改执行 Prompt">
              <el-input v-model="workItemForm.executionPrompt" type="textarea" :rows="6" />
            </el-form-item>
          </el-form>

          <div class="self-upgrade-card-meta-grid">
            <div class="self-upgrade-meta-item">
              <span>接受人</span>
              <strong>{{ selectedSuggestionDetail.workItem.acceptedByName || '-' }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>接受时间</span>
              <strong>{{ formatDateTime(selectedSuggestionDetail.workItem.acceptedAt) }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>解决时间</span>
              <strong>{{ formatDateTime(selectedSuggestionDetail.workItem.resolvedAt) }}</strong>
            </div>
            <div class="self-upgrade-meta-item">
              <span>最近更新时间</span>
              <strong>{{ formatDateTime(selectedSuggestionDetail.workItem.updatedAt) }}</strong>
            </div>
          </div>

          <div class="self-upgrade-inline-action-row">
            <el-button v-if="canManageWorkItems" :loading="workItemSaving" type="primary" @click="handleSaveWorkItem">
              保存工作项
            </el-button>
            <el-button
              v-if="canStartExecution"
              :loading="workItemExecutionLoading"
              type="success"
              plain
              @click="handleStartWorkItemExecution"
            >
              发起整改执行
            </el-button>
            <el-button
              v-if="canManageWorkItems"
              :loading="workItemCompleting"
              plain
              @click="handleCompleteWorkItem('DONE')"
            >
              标记完成
            </el-button>
            <el-button
              v-if="canManageWorkItems"
              :loading="workItemCompleting"
              type="danger"
              plain
              @click="handleCompleteWorkItem('CANCELED')"
            >
              取消工作项
            </el-button>
            <el-button
              v-if="selectedSuggestionDetail.workItem.latestExecutionTaskId"
              text
              type="primary"
              @click="openExecutionTask(selectedSuggestionDetail.workItem.latestExecutionTaskId)"
            >
              执行中心任务 #{{ selectedSuggestionDetail.workItem.latestExecutionTaskId }}
            </el-button>
          </div>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import {
  Delete,
  Edit,
  Filter,
  Finished,
  Plus,
  RefreshRight,
  Search,
  Setting,
  VideoPlay,
  View
} from '@element-plus/icons-vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { listModelConfigOptions } from '@/api/models'
import { getResolvedApiBaseUrl } from '@/api/http'
import {
  acceptSelfUpgradeSuggestion,
  completeSelfUpgradeWorkItem,
  createSelfUpgradePatrolPlan,
  deleteSelfUpgradePatrolPlan,
  getSelfUpgradeConfig,
  getSelfUpgradePatrolPlan,
  getSelfUpgradePatrolRun,
  getSelfUpgradeSuggestion,
  listSelfUpgradeAgentOptions,
  listSelfUpgradeGitlabBindingOptions,
  listSelfUpgradeProjectOptions,
  listSelfUpgradeUserOptions,
  pageSelfUpgradePatrolPlans,
  pageSelfUpgradePatrolRuns,
  pageSelfUpgradeSuggestions,
  rejectSelfUpgradeSuggestion,
  runSelfUpgradePatrolPlanNow,
  startSelfUpgradeWorkItemExecution,
  updateSelfUpgradeConfig,
  updateSelfUpgradePatrolPlan,
  updateSelfUpgradeWorkItem
} from '@/api/self-upgrade'
import { useAuthStore } from '@/stores/auth'
import type { AgentItem, AiModelConfigItem, ProjectGitlabBindingItem, ProjectItem, UserOptionItem } from '@/types/platform'
import type {
  SelfUpgradeCenterConfig,
  SelfUpgradeCenterConfigPayload,
  SelfUpgradeEnvironmentProfile,
  SelfUpgradePatrolPlan,
  SelfUpgradePatrolPlanPayload,
  SelfUpgradePatrolRun,
  SelfUpgradeSuggestionCard,
  SelfUpgradeSuggestionDetail,
  SelfUpgradeWorkItem,
  SelfUpgradeWorkItemUpdatePayload
} from '@/types/self-upgrade'
import { renderMarkdownToHtml } from '@/utils/markdown'

type SelfUpgradeTab = 'plans' | 'runs' | 'suggestions'
type PlanDialogMode = 'create' | 'edit'

interface EnvironmentProfileFormItem extends Omit<SelfUpgradeEnvironmentProfile, 'id'> {
  id: number | null
  sandboxPassword: string
  sessionStateJson: string
  sessionStateTouched: boolean
}

interface SelfUpgradeConfigFormState {
  defaultEnvironmentProfileId: number | null
  carrierProjectId: number | null
  defaultRepositoryBindingIds: number[]
  developmentPlanAgentId: number | null
  developmentImplementAgentId: number | null
  developmentTestAgentId: number | null
  developmentReportAgentId: number | null
  environmentProfiles: EnvironmentProfileFormItem[]
}

interface PlanTargetFormItem {
  id: number | null
  name: string
  seedUrl: string
  goalPrompt: string
  readySelector: string
  allowWrite: boolean
  writeAllowlistOverrideJson: string
  maxStepsOverride: number | null
  enabled: boolean
}

interface SelfUpgradePlanFormState {
  id: number | null
  name: string
  description: string
  environmentProfileId: number | null
  aiModelConfigId: number | null
  schedulerCron: string
  schedulerEnabled: boolean
  maxExplorationSteps: number | null
  targetTimeoutSeconds: number | null
  runTimeoutSeconds: number | null
  enabled: boolean
  targets: PlanTargetFormItem[]
}

interface SelfUpgradeWorkItemFormState {
  title: string
  description: string
  priority: string
  status: string
  assigneeUserId: number | null
  repositoryBindingsJson: string
  executionPrompt: string
}

const DEFAULT_CRON = '0 0 2 * * *'
const LIST_PAGE_SIZE = 1000

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const activeTab = ref<SelfUpgradeTab>(resolveTab(route.query.tab))

const configSummary = ref<SelfUpgradeCenterConfig | null>(null)
const plans = ref<SelfUpgradePatrolPlan[]>([])
const runs = ref<SelfUpgradePatrolRun[]>([])
const suggestions = ref<SelfUpgradeSuggestionCard[]>([])
const selectedRunDetail = ref<SelfUpgradePatrolRun | null>(null)
const selectedSuggestionDetail = ref<SelfUpgradeSuggestionDetail | null>(null)
const expandedRunTargetIds = ref<number[]>([])

const projectOptions = ref<ProjectItem[]>([])
const agentOptions = ref<AgentItem[]>([])
const modelOptions = ref<AiModelConfigItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const gitlabBindingOptions = ref<ProjectGitlabBindingItem[]>([])

const plansLoading = ref(false)
const runsLoading = ref(false)
const suggestionsLoading = ref(false)
const configOptionsLoading = ref(false)
const configSaving = ref(false)
const planSaving = ref(false)
const suggestionActionLoading = ref(false)
const workItemSaving = ref(false)
const workItemExecutionLoading = ref(false)
const workItemCompleting = ref(false)

const configDrawerVisible = ref(false)
const planDialogVisible = ref(false)
const runDetailVisible = ref(false)
const suggestionDetailVisible = ref(false)
const filterPopoverVisible = ref(false)
const planDialogMode = ref<PlanDialogMode>('create')

const planPagination = reactive({
  page: 1,
  size: LIST_PAGE_SIZE,
  total: 0
})

const runPagination = reactive({
  page: 1,
  size: LIST_PAGE_SIZE,
  total: 0
})

const suggestionPagination = reactive({
  page: 1,
  size: LIST_PAGE_SIZE,
  total: 0
})

const planFilters = reactive({
  keyword: '',
  enabledText: ''
})

const runFilters = reactive<{
  planId?: number
  status: string
}>({
  planId: undefined,
  status: ''
})

const suggestionFilters = reactive({
  keyword: '',
  status: '',
  category: '',
  severity: ''
})

const configForm = reactive<SelfUpgradeConfigFormState>(createDefaultConfigForm())
const planForm = reactive<SelfUpgradePlanFormState>(createDefaultPlanForm())
const workItemForm = reactive<SelfUpgradeWorkItemFormState>(createDefaultWorkItemForm())

const canManageConfig = computed(() => authStore.hasPermission('self-upgrade:config:manage'))
const canManagePlans = computed(() => authStore.hasPermission('self-upgrade:plan:manage'))
const canManageSuggestions = computed(() => authStore.hasPermission('self-upgrade:suggestion:manage'))
const canManageWorkItems = computed(() => authStore.hasPermission('self-upgrade:work-item:manage'))
const canStartExecution = computed(() => authStore.hasPermission('self-upgrade:execution:start'))
const showActiveKeywordSearch = computed(() => activeTab.value === 'plans' || activeTab.value === 'suggestions')
const activeKeyword = computed({
  get: () => (activeTab.value === 'plans' ? planFilters.keyword : suggestionFilters.keyword),
  set: (value: string) => {
    if (activeTab.value === 'plans') {
      planFilters.keyword = value
      return
    }
    suggestionFilters.keyword = value
  }
})
const activeSearchPlaceholder = computed(() =>
  activeTab.value === 'plans' ? '搜索计划名称或说明...' : '搜索建议标题或摘要...'
)
const activeToolbarHint = computed(() => {
  if (activeTab.value === 'runs') {
    return '按计划与状态查看巡检记录、目标结果和执行中心回链。'
  }
  return '通过筛选快速聚焦当前标签页中的关键对象。'
})
const activeFilterCount = computed(() => {
  if (activeTab.value === 'plans') {
    return planFilters.enabledText ? 1 : 0
  }
  if (activeTab.value === 'runs') {
    return Number(runFilters.planId != null) + Number(Boolean(runFilters.status))
  }
  return (
    Number(Boolean(suggestionFilters.status)) +
    Number(Boolean(suggestionFilters.category.trim())) +
    Number(Boolean(suggestionFilters.severity))
  )
})
const activeTabLoading = computed(() => {
  if (activeTab.value === 'plans') {
    return plansLoading.value
  }
  if (activeTab.value === 'runs') {
    return runsLoading.value
  }
  return suggestionsLoading.value
})

const developmentAgentOptions = computed(() => agentOptions.value)
const patrolModelOptions = computed(() => modelOptions.value)

const planEnvironmentOptions = computed(() =>
  (configSummary.value?.environmentProfiles || []).filter((item) => item.enabled || item.id === planForm.environmentProfileId)
)

watch(
  () => route.query.tab,
  (value) => {
    const next = resolveTab(value)
    if (next !== activeTab.value) {
      activeTab.value = next
    }
  }
)

watch(activeTab, (value) => {
  filterPopoverVisible.value = false
  void syncTabQuery(value)
})

function createDefaultConfigForm(): SelfUpgradeConfigFormState {
  return {
    defaultEnvironmentProfileId: null,
    carrierProjectId: null,
    defaultRepositoryBindingIds: [],
    developmentPlanAgentId: null,
    developmentImplementAgentId: null,
    developmentTestAgentId: null,
    developmentReportAgentId: null,
    environmentProfiles: []
  }
}

function createDefaultPlanTarget(index = 0): PlanTargetFormItem {
  return {
    id: null,
    name: '',
    seedUrl: '',
    goalPrompt: '',
    readySelector: '',
    allowWrite: false,
    writeAllowlistOverrideJson: '[]',
    maxStepsOverride: null,
    enabled: true
  }
}

function createDefaultPlanForm(): SelfUpgradePlanFormState {
  return {
    id: null,
    name: '',
    description: '',
    environmentProfileId: null,
    aiModelConfigId: null,
    schedulerCron: DEFAULT_CRON,
    schedulerEnabled: false,
    maxExplorationSteps: 25,
    targetTimeoutSeconds: 600,
    runTimeoutSeconds: 1800,
    enabled: false,
    targets: [createDefaultPlanTarget(0)]
  }
}

function createDefaultWorkItemForm(): SelfUpgradeWorkItemFormState {
  return {
    title: '',
    description: '',
    priority: 'P2',
    status: 'TODO',
    assigneeUserId: null,
    repositoryBindingsJson: '[]',
    executionPrompt: ''
  }
}

function resolveTab(rawValue: unknown): SelfUpgradeTab {
  if (rawValue === 'runs' || rawValue === 'suggestions') {
    return rawValue
  }
  return 'plans'
}

async function syncTabQuery(tab: SelfUpgradeTab) {
  const currentTab = typeof route.query.tab === 'string' ? route.query.tab : undefined
  const nextTab = tab === 'plans' ? undefined : tab
  if (currentTab === nextTab) {
    return
  }
  const nextQuery = { ...route.query }
  if (nextTab) {
    nextQuery.tab = nextTab
  } else {
    delete nextQuery.tab
  }
  await router.replace({ query: nextQuery })
}

function parseNumberArray(value?: string | null) {
  if (!value || !value.trim()) {
    return [] as number[]
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
  } catch {
    return []
  }
}

function applyConfigForm(summary: SelfUpgradeCenterConfig) {
  configForm.defaultEnvironmentProfileId = summary.defaultEnvironmentProfileId
  configForm.carrierProjectId = summary.carrierProjectId
  configForm.defaultRepositoryBindingIds = parseNumberArray(summary.defaultRepositoryBindingIdsJson)
  configForm.developmentPlanAgentId = summary.developmentPlanAgentId
  configForm.developmentImplementAgentId = summary.developmentImplementAgentId
  configForm.developmentTestAgentId = summary.developmentTestAgentId
  configForm.developmentReportAgentId = summary.developmentReportAgentId
  configForm.environmentProfiles = summary.environmentProfiles.map((item) => ({
    ...item,
    sandboxPassword: '',
    sessionStateJson: '',
    sessionStateTouched: false
  }))
}

function applyPlanForm(plan?: SelfUpgradePatrolPlan | null) {
  const next = plan
    ? {
      id: plan.id,
      name: plan.name,
      description: plan.description || '',
      environmentProfileId: plan.environmentProfileId,
      aiModelConfigId: plan.aiModelConfigId,
      schedulerCron: plan.schedulerCron || DEFAULT_CRON,
      schedulerEnabled: plan.schedulerEnabled,
      maxExplorationSteps: plan.maxExplorationSteps ?? 25,
      targetTimeoutSeconds: plan.targetTimeoutSeconds ?? 600,
      runTimeoutSeconds: plan.runTimeoutSeconds ?? 1800,
      enabled: plan.enabled,
      targets: plan.targets.length
        ? plan.targets.map((target) => ({
          id: target.id,
          name: target.name,
          seedUrl: target.seedUrl,
          goalPrompt: target.goalPrompt || '',
          readySelector: target.readySelector || '',
          allowWrite: target.allowWrite,
          writeAllowlistOverrideJson: target.writeAllowlistOverrideJson || '[]',
          maxStepsOverride: target.maxStepsOverride,
          enabled: target.enabled
        }))
        : [createDefaultPlanTarget(0)]
    }
    : createDefaultPlanForm()

  planForm.id = next.id
  planForm.name = next.name
  planForm.description = next.description
  planForm.environmentProfileId = next.environmentProfileId
  planForm.aiModelConfigId = next.aiModelConfigId
  planForm.schedulerCron = next.schedulerCron
  planForm.schedulerEnabled = next.schedulerEnabled
  planForm.maxExplorationSteps = next.maxExplorationSteps
  planForm.targetTimeoutSeconds = next.targetTimeoutSeconds
  planForm.runTimeoutSeconds = next.runTimeoutSeconds
  planForm.enabled = next.enabled
  planForm.targets = next.targets
}

function applyWorkItemForm(workItem?: SelfUpgradeWorkItem | null) {
  const next = workItem
    ? {
      title: workItem.title || '',
      description: workItem.description || '',
      priority: workItem.priority || 'P2',
      status: workItem.status || 'TODO',
      assigneeUserId: workItem.assigneeUserId,
      repositoryBindingsJson: workItem.repositoryBindingsJson || '[]',
      executionPrompt: workItem.executionPrompt || ''
    }
    : createDefaultWorkItemForm()

  workItemForm.title = next.title
  workItemForm.description = next.description
  workItemForm.priority = next.priority
  workItemForm.status = next.status
  workItemForm.assigneeUserId = next.assigneeUserId
  workItemForm.repositoryBindingsJson = next.repositoryBindingsJson
  workItemForm.executionPrompt = next.executionPrompt
}

/**
 * 配置抽屉要把 options 一次性补齐，否则管理员在抽屉里切换项目、绑定和 Agent 时容易遇到空列表。
 */
async function ensureConfigOptionsLoaded() {
  if (projectOptions.value.length && agentOptions.value.length && gitlabBindingOptions.value.length) {
    return
  }
  configOptionsLoading.value = true
  try {
    const [projects, agents, bindings] = await Promise.all([
      listSelfUpgradeProjectOptions(),
      listSelfUpgradeAgentOptions(),
      listSelfUpgradeGitlabBindingOptions()
    ])
    projectOptions.value = projects
    agentOptions.value = agents
    gitlabBindingOptions.value = bindings
  } finally {
    configOptionsLoading.value = false
  }
}

async function ensurePatrolModelOptionsLoaded() {
  if (modelOptions.value.length) {
    return
  }
  modelOptions.value = await listModelConfigOptions('CHAT')
}

async function ensureUserOptionsLoaded() {
  if (userOptions.value.length) {
    return
  }
  userOptions.value = await listSelfUpgradeUserOptions()
}

async function loadConfig() {
  configSummary.value = await getSelfUpgradeConfig()
  applyConfigForm(configSummary.value)
}

async function loadPlans() {
  plansLoading.value = true
  try {
    const pageData = await pageSelfUpgradePatrolPlans({
      page: planPagination.page,
      size: planPagination.size,
      keyword: planFilters.keyword || undefined,
      enabled: parseBooleanFilter(planFilters.enabledText)
    })
    plans.value = pageData.records
    planPagination.total = pageData.total
  } finally {
    plansLoading.value = false
  }
}

async function loadRuns() {
  runsLoading.value = true
  try {
    const pageData = await pageSelfUpgradePatrolRuns({
      page: runPagination.page,
      size: runPagination.size,
      planId: runFilters.planId,
      status: runFilters.status || undefined
    })
    runs.value = pageData.records
    runPagination.total = pageData.total
  } finally {
    runsLoading.value = false
  }
}

async function loadSuggestions() {
  suggestionsLoading.value = true
  try {
    const pageData = await pageSelfUpgradeSuggestions({
      page: suggestionPagination.page,
      size: suggestionPagination.size,
      keyword: suggestionFilters.keyword || undefined,
      status: suggestionFilters.status || undefined,
      category: suggestionFilters.category || undefined,
      severity: suggestionFilters.severity || undefined
    })
    suggestions.value = pageData.records
    suggestionPagination.total = pageData.total
  } finally {
    suggestionsLoading.value = false
  }
}

async function reloadPageData() {
  await Promise.all([loadConfig(), loadPlans(), loadRuns(), loadSuggestions()])
}

async function handleOpenConfigDrawer() {
  try {
    await ensureConfigOptionsLoaded()
    if (!configSummary.value) {
      await loadConfig()
    } else {
      applyConfigForm(configSummary.value)
    }
    configDrawerVisible.value = true
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '加载中心配置失败'))
  }
}

function handleAddEnvironmentProfile() {
  configForm.environmentProfiles.push({
    id: null,
    code: '',
    name: '',
    baseUrl: '',
    allowedHostPatternsJson: '[]',
    loginScriptJson: '[]',
    sandboxUsername: '',
    sandboxPasswordConfigured: false,
    sessionStateConfigured: false,
    writeAllowlistJson: '[]',
    enabled: true,
    sandboxPassword: '',
    sessionStateJson: '',
    sessionStateTouched: false
  })
}

function handleSessionStateInput(environment: EnvironmentProfileFormItem, value: string) {
  environment.sessionStateTouched = true
  environment.sessionStateJson = value
}

function handleClearSessionState(environment: EnvironmentProfileFormItem) {
  environment.sessionStateTouched = true
  environment.sessionStateJson = ''
  environment.sessionStateConfigured = false
}

async function handleSaveConfig() {
  if (!configForm.environmentProfiles.length) {
    ElMessage.warning('至少需要保留一个环境档案')
    return
  }
  configSaving.value = true
  try {
    const payload: SelfUpgradeCenterConfigPayload = {
      defaultEnvironmentProfileId: configForm.defaultEnvironmentProfileId,
      carrierProjectId: configForm.carrierProjectId,
      defaultRepositoryBindingIdsJson: JSON.stringify(configForm.defaultRepositoryBindingIds),
      developmentPlanAgentId: configForm.developmentPlanAgentId,
      developmentImplementAgentId: configForm.developmentImplementAgentId,
      developmentTestAgentId: configForm.developmentTestAgentId,
      developmentReportAgentId: configForm.developmentReportAgentId,
      environmentProfiles: configForm.environmentProfiles.map((item) => ({
        id: item.id,
        code: item.code.trim(),
        name: item.name.trim(),
        baseUrl: item.baseUrl.trim(),
        allowedHostPatternsJson: item.allowedHostPatternsJson?.trim() || '[]',
        loginScriptJson: item.loginScriptJson?.trim() || '[]',
        sandboxUsername: item.sandboxUsername?.trim() || '',
        sandboxPassword: item.sandboxPassword?.trim() || '',
        sessionStateJson: item.sessionStateTouched ? item.sessionStateJson : undefined,
        writeAllowlistJson: item.writeAllowlistJson?.trim() || '[]',
        enabled: item.enabled
      }))
    }
    const saved = await updateSelfUpgradeConfig(payload)
    configSummary.value = saved
    applyConfigForm(saved)
    configDrawerVisible.value = false
    ElMessage.success('中心配置已保存')
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '保存中心配置失败'))
  } finally {
    configSaving.value = false
  }
}

async function handleOpenCreatePlanDialog() {
  if (!configSummary.value) {
    await loadConfig()
  }
  await ensurePatrolModelOptionsLoaded()
  planDialogMode.value = 'create'
  applyPlanForm(null)
  planForm.environmentProfileId = configSummary.value?.defaultEnvironmentProfileId || planEnvironmentOptions.value[0]?.id || null
  planForm.aiModelConfigId = patrolModelOptions.value[0]?.id || null
  planDialogVisible.value = true
}

async function handleOpenEditPlanDialog(planId: number) {
  try {
    await ensurePatrolModelOptionsLoaded()
    const detail = await getSelfUpgradePatrolPlan(planId)
    planDialogMode.value = 'edit'
    applyPlanForm(detail)
    planDialogVisible.value = true
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '加载巡检计划失败'))
  }
}

function handleAddPlanTarget() {
  planForm.targets.push(createDefaultPlanTarget(planForm.targets.length))
}

function handleRemovePlanTarget(index: number) {
  planForm.targets.splice(index, 1)
}

function buildPlanPayload(): SelfUpgradePatrolPlanPayload | null {
  if (!planForm.name.trim()) {
    ElMessage.warning('计划名称不能为空')
    return null
  }
  if (!planForm.environmentProfileId) {
    ElMessage.warning('请选择环境档案')
    return null
  }
  if (!planForm.aiModelConfigId) {
    ElMessage.warning('请选择巡检模型')
    return null
  }
  if (!planForm.targets.length) {
    ElMessage.warning('至少需要配置一个探索入口')
    return null
  }
  const invalidTarget = planForm.targets.find((item) => !item.name.trim() || !item.seedUrl.trim())
  if (invalidTarget) {
    ElMessage.warning('所有探索入口都需要填写名称和入口地址')
    return null
  }
  return {
    name: planForm.name.trim(),
    description: planForm.description.trim(),
    environmentProfileId: planForm.environmentProfileId,
    aiModelConfigId: planForm.aiModelConfigId,
    schedulerCron: planForm.schedulerCron.trim() || undefined,
    schedulerEnabled: planForm.schedulerEnabled,
    maxExplorationSteps: normalizeNullableNumber(planForm.maxExplorationSteps),
    targetTimeoutSeconds: normalizeNullableNumber(planForm.targetTimeoutSeconds),
    runTimeoutSeconds: normalizeNullableNumber(planForm.runTimeoutSeconds),
    enabled: planForm.enabled,
    targets: planForm.targets.map((target, index) => ({
      id: target.id,
      name: target.name.trim(),
      seedUrl: target.seedUrl.trim(),
      goalPrompt: target.goalPrompt.trim(),
      readySelector: target.readySelector.trim(),
      allowWrite: target.allowWrite,
      writeAllowlistOverrideJson: target.writeAllowlistOverrideJson.trim() || '[]',
      maxStepsOverride: normalizeNullableNumber(target.maxStepsOverride),
      sortOrder: (index + 1) * 10,
      enabled: target.enabled
    }))
  }
}

async function handleSavePlan() {
  const payload = buildPlanPayload()
  if (!payload) {
    return
  }
  planSaving.value = true
  try {
    if (planDialogMode.value === 'create') {
      await createSelfUpgradePatrolPlan(payload)
      ElMessage.success('巡检计划已创建')
    } else if (planForm.id) {
      await updateSelfUpgradePatrolPlan(planForm.id, payload)
      ElMessage.success('巡检计划已更新')
    }
    planDialogVisible.value = false
    await loadPlans()
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '保存巡检计划失败'))
  } finally {
    planSaving.value = false
  }
}

async function handleDeletePlan(plan: SelfUpgradePatrolPlan) {
  try {
    await ElMessageBox.confirm(`确认删除巡检计划“${plan.name}”吗？删除后历史运行仍会保留。`, '删除计划', { type: 'warning' })
    await deleteSelfUpgradePatrolPlan(plan.id)
    ElMessage.success('巡检计划已删除')
    if (plans.value.length === 1 && planPagination.page > 1) {
      planPagination.page -= 1
    }
    await loadPlans()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(resolveErrorMessage(error, '删除巡检计划失败'))
    }
  }
}

async function handleRunPlanNow(plan: SelfUpgradePatrolPlan) {
  try {
    await ElMessageBox.confirm(`立即执行“${plan.name}”并创建新的巡检运行？`, '发起巡检', { type: 'warning' })
    const run = await runSelfUpgradePatrolPlanNow(plan.id)
    ElMessage.success('巡检已提交到执行中心')
    await Promise.all([loadPlans(), loadRuns()])
    selectedRunDetail.value = run
    expandedRunTargetIds.value = run.targets.map((item) => item.id)
    runDetailVisible.value = true
    activeTab.value = 'runs'
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(resolveErrorMessage(error, '发起巡检失败'))
    }
  }
}

async function handleOpenRunDetail(runId: number) {
  try {
    const detail = await getSelfUpgradePatrolRun(runId)
    selectedRunDetail.value = detail
    expandedRunTargetIds.value = detail.targets.map((item) => item.id)
    runDetailVisible.value = true
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '加载巡检运行详情失败'))
  }
}

async function handleOpenSuggestionDetail(suggestionId: number) {
  try {
    const detail = await getSelfUpgradeSuggestion(suggestionId)
    selectedSuggestionDetail.value = detail
    applyWorkItemForm(detail.workItem)
    if (detail.workItem && canManageWorkItems.value) {
      await ensureUserOptionsLoaded()
    }
    suggestionDetailVisible.value = true
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '加载建议详情失败'))
  }
}

async function refreshSuggestionDetail() {
  if (!selectedSuggestionDetail.value) {
    return
  }
  const detail = await getSelfUpgradeSuggestion(selectedSuggestionDetail.value.id)
  selectedSuggestionDetail.value = detail
  applyWorkItemForm(detail.workItem)
}

async function handleAcceptSuggestionCard(suggestion: SelfUpgradeSuggestionCard) {
  try {
    suggestionActionLoading.value = true
    await acceptSelfUpgradeSuggestion(suggestion.id)
    ElMessage.success('建议已接受，并已生成/复用整改工作项')
    await Promise.all([loadSuggestions(), handleOpenSuggestionDetail(suggestion.id)])
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '接受建议失败'))
  } finally {
    suggestionActionLoading.value = false
  }
}

async function handleRejectSuggestionCard(suggestion: SelfUpgradeSuggestionCard) {
  try {
    suggestionActionLoading.value = true
    await rejectSelfUpgradeSuggestion(suggestion.id)
    ElMessage.success('建议已拒绝')
    await Promise.all([loadSuggestions(), handleOpenSuggestionDetail(suggestion.id)])
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '拒绝建议失败'))
  } finally {
    suggestionActionLoading.value = false
  }
}

async function handleAcceptSuggestionDetail() {
  if (!selectedSuggestionDetail.value) {
    return
  }
  try {
    suggestionActionLoading.value = true
    await acceptSelfUpgradeSuggestion(selectedSuggestionDetail.value.id)
    ElMessage.success('建议已接受，并已生成/复用整改工作项')
    await Promise.all([loadSuggestions(), refreshSuggestionDetail(), ensureUserOptionsLoaded()])
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '接受建议失败'))
  } finally {
    suggestionActionLoading.value = false
  }
}

async function handleRejectSuggestionDetail() {
  if (!selectedSuggestionDetail.value) {
    return
  }
  try {
    suggestionActionLoading.value = true
    await rejectSelfUpgradeSuggestion(selectedSuggestionDetail.value.id)
    ElMessage.success('建议已拒绝')
    await Promise.all([loadSuggestions(), refreshSuggestionDetail()])
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '拒绝建议失败'))
  } finally {
    suggestionActionLoading.value = false
  }
}

function buildWorkItemPayload(): SelfUpgradeWorkItemUpdatePayload | null {
  if (!workItemForm.title.trim()) {
    ElMessage.warning('工作项标题不能为空')
    return null
  }
  return {
    title: workItemForm.title.trim(),
    description: workItemForm.description.trim(),
    priority: workItemForm.priority,
    status: workItemForm.status,
    assigneeUserId: workItemForm.assigneeUserId,
    repositoryBindingsJson: workItemForm.repositoryBindingsJson.trim() || '[]',
    executionPrompt: workItemForm.executionPrompt.trim()
  }
}

async function handleSaveWorkItem() {
  if (!selectedSuggestionDetail.value?.workItem) {
    return
  }
  const payload = buildWorkItemPayload()
  if (!payload) {
    return
  }
  workItemSaving.value = true
  try {
    await updateSelfUpgradeWorkItem(selectedSuggestionDetail.value.workItem.id, payload)
    ElMessage.success('整改工作项已保存')
    await Promise.all([loadSuggestions(), refreshSuggestionDetail()])
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '保存整改工作项失败'))
  } finally {
    workItemSaving.value = false
  }
}

async function handleStartWorkItemExecution() {
  if (!selectedSuggestionDetail.value?.workItem) {
    return
  }
  try {
    await ElMessageBox.confirm('发起整改执行后会在执行中心创建 DEVELOPMENT_IMPLEMENTATION 任务，是否继续？', '发起整改执行', {
      type: 'warning'
    })
    workItemExecutionLoading.value = true
    await startSelfUpgradeWorkItemExecution(selectedSuggestionDetail.value.workItem.id)
    ElMessage.success('整改执行已发起')
    await Promise.all([loadSuggestions(), refreshSuggestionDetail(), loadRuns()])
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(resolveErrorMessage(error, '发起整改执行失败'))
    }
  } finally {
    workItemExecutionLoading.value = false
  }
}

async function handleCompleteWorkItem(status: 'DONE' | 'CANCELED') {
  if (!selectedSuggestionDetail.value?.workItem) {
    return
  }
  try {
    await ElMessageBox.confirm(
      status === 'DONE' ? '确认将该整改工作项标记为完成？' : '确认取消该整改工作项？',
      status === 'DONE' ? '标记完成' : '取消工作项',
      { type: status === 'DONE' ? 'success' : 'warning' }
    )
    workItemCompleting.value = true
    await completeSelfUpgradeWorkItem(selectedSuggestionDetail.value.workItem.id, { status })
    ElMessage.success(status === 'DONE' ? '整改工作项已完成' : '整改工作项已取消')
    await Promise.all([loadSuggestions(), refreshSuggestionDetail()])
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(resolveErrorMessage(error, '更新整改工作项失败'))
    }
  } finally {
    workItemCompleting.value = false
  }
}

async function handleOpenRunFromSuggestion(runId: number) {
  await handleOpenRunDetail(runId)
  activeTab.value = 'runs'
}

async function openExecutionTask(executionTaskId: number) {
  await router.push({ name: 'execution-task-detail', params: { executionTaskId } })
}

function handleOpenArtifact(downloadUrl?: string | null) {
  if (!downloadUrl) {
    return
  }
  const resolved = /^https?:\/\//i.test(downloadUrl)
    ? downloadUrl
    : `${getResolvedApiBaseUrl()}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`
  if (typeof window !== 'undefined') {
    window.open(resolved, '_blank', 'noopener,noreferrer')
  }
}

function handleActiveSearch() {
  filterPopoverVisible.value = false
  if (activeTab.value === 'plans') {
    handlePlanSearch()
    return
  }
  if (activeTab.value === 'runs') {
    handleRunSearch()
    return
  }
  handleSuggestionSearch()
}

function handleActiveReset() {
  filterPopoverVisible.value = false
  if (activeTab.value === 'plans') {
    handlePlanReset()
    return
  }
  if (activeTab.value === 'runs') {
    handleRunReset()
    return
  }
  handleSuggestionReset()
}

function handleActiveRefresh() {
  if (activeTab.value === 'plans') {
    void loadPlans()
    return
  }
  if (activeTab.value === 'runs') {
    void loadRuns()
    return
  }
  void loadSuggestions()
}

function handlePlanSearch() {
  planPagination.page = 1
  void loadPlans()
}

function handlePlanReset() {
  planFilters.keyword = ''
  planFilters.enabledText = ''
  planPagination.page = 1
  void loadPlans()
}

function handleRunSearch() {
  runPagination.page = 1
  void loadRuns()
}

function handleRunReset() {
  runFilters.planId = undefined
  runFilters.status = ''
  runPagination.page = 1
  void loadRuns()
}

function handleSuggestionSearch() {
  suggestionPagination.page = 1
  void loadSuggestions()
}

function handleSuggestionReset() {
  suggestionFilters.keyword = ''
  suggestionFilters.status = ''
  suggestionFilters.category = ''
  suggestionFilters.severity = ''
  suggestionPagination.page = 1
  void loadSuggestions()
}

function displayNumber(value?: number | null) {
  return value == null ? '-' : value
}

function displayDuration(seconds?: number | null) {
  if (seconds == null) {
    return '-'
  }
  if (seconds >= 3600) {
    return `${Math.round((seconds / 3600) * 10) / 10} 小时`
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} 分钟`
  }
  return `${seconds} 秒`
}

function formatDateTime(value?: string | null) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-'
}

function normalizeNullableNumber(value?: number | null) {
  return value == null || Number.isNaN(Number(value)) ? null : Number(value)
}

function parseBooleanFilter(value: string) {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function resolveErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || error?.message || fallback
}

function runStatusLabel(status?: string | null) {
  const labelMap: Record<string, string> = {
    PENDING: '待执行',
    RUNNING: '运行中',
    SUCCESS: '成功',
    PARTIAL_SUCCESS: '部分成功',
    FAILED: '失败',
    CANCELED: '已取消'
  }
  return status ? labelMap[status] || status : '-'
}

function runStatusType(status?: string | null) {
  const typeMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    PENDING: 'info',
    RUNNING: 'warning',
    SUCCESS: 'success',
    PARTIAL_SUCCESS: 'warning',
    FAILED: 'danger',
    CANCELED: 'info'
  }
  return status ? typeMap[status] || 'info' : 'info'
}

function suggestionStatusLabel(status?: string | null) {
  const labelMap: Record<string, string> = {
    OPEN: '待处理',
    ACCEPTED: '已接受',
    IN_PROGRESS: '整改中',
    RESOLVED: '已解决',
    REJECTED: '已拒绝'
  }
  return status ? labelMap[status] || status : '-'
}

function suggestionStatusType(status?: string | null) {
  const typeMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    OPEN: 'warning',
    ACCEPTED: 'info',
    IN_PROGRESS: 'warning',
    RESOLVED: 'success',
    REJECTED: 'danger'
  }
  return status ? typeMap[status] || 'info' : 'info'
}

function severityTagType(severity?: string | null) {
  const typeMap: Record<string, 'warning' | 'danger' | 'info'> = {
    CRITICAL: 'danger',
    HIGH: 'warning',
    MEDIUM: 'info',
    LOW: 'info'
  }
  return severity ? typeMap[severity] || 'info' : 'info'
}

function planStatusLabel(status?: string | null) {
  if (!status) {
    return '未执行'
  }
  return runStatusLabel(status)
}

function workItemStatusLabel(status?: string | null) {
  const labelMap: Record<string, string> = {
    TODO: '待执行',
    RUNNING: '执行中',
    VERIFYING: '验证中',
    DONE: '已完成',
    CANCELED: '已取消'
  }
  return status ? labelMap[status] || status : '-'
}

function workItemStatusType(status?: string | null) {
  const typeMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    TODO: 'info',
    RUNNING: 'warning',
    VERIFYING: 'warning',
    DONE: 'success',
    CANCELED: 'danger'
  }
  return status ? typeMap[status] || 'info' : 'info'
}

function renderPreviewHtml(markdown?: string | null) {
  if (!markdown || !markdown.trim()) {
    return '<p>暂无证据摘要</p>'
  }
  const trimmed = markdown.trim()
  const lines = trimmed.split(/\r?\n/).slice(0, 6).join('\n')
  return renderMarkdownToHtml(lines)
}

onMounted(async () => {
  try {
    await reloadPageData()
  } catch (error: any) {
    ElMessage.error(resolveErrorMessage(error, '加载自升级中心失败'))
  }
})
</script>

<style scoped>
.self-upgrade-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.self-upgrade-toolbar {
  margin-bottom: 0;
}

.self-upgrade-toolbar-main {
  width: fit-content;
  max-width: 100%;
  justify-self: start;
  flex: 0 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}

.gitlab-tab-switcher.self-upgrade-tab-switcher {
  flex: 0 0 auto;
}

.self-upgrade-toolbar-hint {
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
  max-width: 360px;
}

.gitlab-tab-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.self-upgrade-toolbar-filter-active {
  color: var(--app-primary);
  background: rgba(var(--app-primary-rgb), 0.08);
}

.self-upgrade-toolbar-side {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.self-upgrade-grid {
  --self-upgrade-card-width: 360px;
  --self-upgrade-card-height: 300px;

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--self-upgrade-card-width)), var(--self-upgrade-card-width)));
  grid-auto-rows: var(--self-upgrade-card-height);
  gap: 14px;
  align-items: stretch;
}

.self-upgrade-suggestion-grid {
  --self-upgrade-card-width: 392px;
  --self-upgrade-card-height: 352px;
}

.self-upgrade-grid-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 300px);
}

.self-upgrade-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  height: 100%;
  padding: 18px;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.self-upgrade-card-head,
.self-upgrade-meta-line,
.self-upgrade-card-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.self-upgrade-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
}

.self-upgrade-card-head > div:first-child {
  display: contents;
  min-width: 0;
}

.self-upgrade-card-head h2,
.self-upgrade-editor-card-head h3 {
  margin: 0;
  color: #172033;
}

.self-upgrade-card-head h2 {
  grid-column: 1;
  grid-row: 1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
}

.self-upgrade-card-head p,
.self-upgrade-editor-card-head > span,
.self-upgrade-editor-card-head > div > span {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.6;
}

.self-upgrade-card-head p {
  grid-column: 1 / -1;
  grid-row: 2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.self-upgrade-tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.self-upgrade-card > .self-upgrade-card-head .self-upgrade-tag-group {
  grid-column: 2;
  grid-row: 1;
  flex: 0 0 auto;
  max-width: 100%;
  max-height: 62px;
  overflow: hidden;
}

.self-upgrade-meta-line {
  color: #475569;
  font-size: 13px;
  line-height: 1.45;
  max-height: 58px;
  margin: 0;
  overflow: hidden;
}

.self-upgrade-meta-line span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-upgrade-card-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.self-upgrade-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(243, 244, 245, 0.72);
}

.self-upgrade-meta-item span {
  color: #758393;
  font-size: 12px;
}

.self-upgrade-meta-item strong {
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.self-upgrade-markdown-shell,
.self-upgrade-artifact-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.self-upgrade-section-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.self-upgrade-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.self-upgrade-card > .self-upgrade-chip-list {
  flex: 0 0 auto;
  max-height: 66px;
  overflow: hidden;
}

.self-upgrade-evidence-preview {
  flex: 0 1 auto;
  min-height: 0;
  max-height: 132px;
  overflow: hidden;
  padding: 14px 16px;
  border-radius: 8px;
  background: rgba(243, 244, 245, 0.72);
  color: var(--app-text);
  font-size: 12px;
  line-height: 1.7;
}

.self-upgrade-pagination-bar {
  margin-top: 0;
}

.self-upgrade-card-actions {
  display: flex;
  flex-wrap: nowrap;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 3px 0 8px;
  overflow-x: auto;
  overflow-y: visible;
  justify-content: flex-start;
  margin: 1px 0 -6px;
  scrollbar-width: none;
}

.self-upgrade-card-actions::-webkit-scrollbar {
  display: none;
}

.self-upgrade-card-actions :deep(.el-button) {
  flex: 0 0 auto;
  margin-left: 0;
  box-shadow: none;
  transform: none;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  white-space: nowrap;
}

.self-upgrade-card-actions :deep(.el-button:hover),
.self-upgrade-card-actions :deep(.el-button:focus-visible) {
  box-shadow: none;
  transform: none;
}

.self-upgrade-pagination {
  display: flex;
  justify-content: flex-end;
}

.self-upgrade-inline-action-row,
.self-upgrade-target-editor-head,
.self-upgrade-artifact-head,
.self-upgrade-collapse-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.self-upgrade-empty-mini {
  padding: 18px;
  border: 1px dashed rgba(221, 193, 174, 0.28);
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.48);
  color: #758393;
  text-align: center;
}

.self-upgrade-plan-editor,
.self-upgrade-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.self-upgrade-plan-editor {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 18px;
}

.self-upgrade-editor-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid rgba(221, 193, 174, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 32px rgba(25, 28, 29, 0.04);
}

.self-upgrade-editor-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.self-upgrade-head-action {
  flex: 0 0 auto;
  align-self: flex-start;
}

.self-upgrade-inline-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.self-upgrade-switch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

.self-upgrade-target-editor-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.self-upgrade-target-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(221, 193, 174, 0.12);
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.48);
}

.self-upgrade-target-editor-head strong {
  display: block;
  color: #0f172a;
}

.self-upgrade-target-editor-head > div > span {
  color: #64748b;
  font-size: 12px;
}

.self-upgrade-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.self-upgrade-markdown-shell {
  padding: 16px;
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.72);
  color: var(--app-text);
}

.self-upgrade-markdown-shell.compact {
  padding: 12px 14px;
}

.self-upgrade-markdown-shell :deep(h1),
.self-upgrade-markdown-shell :deep(h2),
.self-upgrade-markdown-shell :deep(h3),
.self-upgrade-markdown-shell :deep(h4) {
  margin: 0 0 10px;
  color: #0f172a;
  font-size: 16px;
}

.self-upgrade-markdown-shell :deep(p),
.self-upgrade-markdown-shell :deep(li),
.self-upgrade-markdown-shell :deep(blockquote) {
  margin: 0 0 8px;
  line-height: 1.7;
}

.self-upgrade-markdown-shell :deep(ul),
.self-upgrade-markdown-shell :deep(ol) {
  margin: 0;
  padding-left: 20px;
}

.self-upgrade-markdown-shell :deep(pre) {
  margin: 0;
  overflow: auto;
  padding: 12px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
}

.self-upgrade-markdown-shell :deep(code) {
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.08);
  padding: 2px 6px;
}

.self-upgrade-collapse-item {
  border-radius: 12px;
  background: rgba(243, 244, 245, 0.72);
  margin-bottom: 12px;
  overflow: hidden;
}

.self-upgrade-collapse-title {
  width: calc(100% - 24px);
  padding-right: 12px;
}

.self-upgrade-collapse-body,
.self-upgrade-occurrence-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.self-upgrade-artifact-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(221, 193, 174, 0.12);
}

.self-upgrade-artifact-head strong {
  display: block;
  color: #0f172a;
}

.self-upgrade-artifact-head span {
  color: #64748b;
  font-size: 12px;
}

.self-upgrade-code-preview {
  margin: 0;
  overflow: auto;
  max-height: 240px;
  padding: 12px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1280px) {
  .self-upgrade-plan-editor {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .self-upgrade-toolbar .management-list-toolbar-main {
    width: fit-content;
    max-width: 100%;
    justify-self: start;
    flex: 0 1 auto;
  }
}

@media (max-width: 900px) {
  .self-upgrade-toolbar,
  .self-upgrade-card-head,
  .self-upgrade-editor-card-head,
  .self-upgrade-target-editor-head,
  .self-upgrade-artifact-head,
  .self-upgrade-collapse-title,
  .self-upgrade-inline-action-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .self-upgrade-inline-form-grid,
  .self-upgrade-card-meta-grid {
    grid-template-columns: 1fr;
  }

  .self-upgrade-card-head {
    grid-template-columns: 1fr;
  }

  .self-upgrade-card-head h2,
  .self-upgrade-card-head p,
  .self-upgrade-card > .self-upgrade-card-head .self-upgrade-tag-group {
    grid-column: 1;
    grid-row: auto;
  }

  .self-upgrade-card > .self-upgrade-card-head .self-upgrade-tag-group {
    justify-content: flex-start;
  }

  .self-upgrade-toolbar-main,
  .self-upgrade-toolbar-hint {
    width: 100%;
  }

  .self-upgrade-toolbar :deep(.management-list-search-shell),
  .self-upgrade-toolbar-side {
    width: 100%;
  }

  .self-upgrade-toolbar-side {
    justify-content: flex-start;
  }

  .gitlab-tab-switcher.self-upgrade-tab-switcher {
    max-width: 100%;
    overflow: auto;
  }

  .self-upgrade-pagination {
    justify-content: flex-start;
    width: 100%;
    overflow: auto;
  }
}
</style>
