<template>
  <div class="management-list-page data-workbench-page">
    <!-- 工具栏：Tab 切换 + 关键词/项目筛选 + 刷新与新增操作，样式复用平台管理列表规范。 -->
    <section class="management-list-toolbar data-workbench-toolbar">
      <div class="management-list-toolbar-main">
        <div class="gitlab-tab-switcher" role="tablist" aria-label="DataWorkbench 页面切换">
          <button v-for="tab in tabs" :key="tab.key" class="gitlab-tab-button" :class="{ active: activeTab === tab.key }" type="button" @click="activeTab = tab.key">
            {{ tab.label }}
          </button>
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <div v-if="isListTab" class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="management-list-search-input"
            type="text"
            :placeholder="searchPlaceholder"
            @keyup.enter="handleSearch"
          />
        </div>
        <el-popover v-if="isListTab" v-model:visible="filterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
          <template #reference>
            <button class="management-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="management-list-filter-panel management-list-compact-input">
            <div class="management-list-filter-field">
              <label>风险等级</label>
              <el-select v-model="filters.riskLevel" clearable placeholder="全部风险" style="width: 100%" :teleported="false">
                <el-option label="低风险" value="LOW" />
                <el-option label="中风险" value="MEDIUM" />
                <el-option label="高风险" value="HIGH" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>审批状态</label>
              <el-select v-model="filters.approvalStatus" clearable placeholder="全部状态" style="width: 100%" :teleported="false">
                <el-option label="待审批" value="PENDING" />
                <el-option label="已审批" value="APPROVED" />
                <el-option label="已驳回" value="REJECTED" />
                <el-option label="免审批" value="NOT_REQUIRED" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>执行状态</label>
              <el-select v-model="filters.executionStatus" clearable placeholder="全部执行" style="width: 100%" :teleported="false">
                <el-option label="待执行" value="SUBMITTED" />
                <el-option label="执行中" value="EXECUTING" />
                <el-option label="已执行" value="EXECUTED" />
                <el-option label="已终止" value="REJECTED" />
              </el-select>
            </div>
            <div class="management-list-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleResetFilters">重置</el-button>
            </div>
          </div>
        </el-popover>
      </div>
      <div class="management-list-toolbar-side">
        <button class="management-list-toolbar-button" type="button" @click="reloadActiveTab">
          <el-icon><RefreshRight /></el-icon>
          <span>刷新</span>
        </button>
        <button v-if="activeTab === 'config' && canConfig" class="management-list-create-button" type="button" @click="openEntityDialog()">
          <el-icon><Plus /></el-icon>
          <span>新增实体</span>
        </button>
      </div>
    </section>

    <!-- 变更处理 / 审批队列：共用工单表格，通过 Tab 切换筛选审批状态。 -->
    <section v-if="isRequestTab" class="management-list-shell">
      <div class="management-list-table-scroll" v-loading="loading">
        <table class="management-list-table data-change-table">
          <thead>
            <tr>
              <th class="dw-col-main">工单</th>
              <th class="dw-col-project">项目 / 实体</th>
              <th class="dw-col-status center">审批 / 执行</th>
              <th class="dw-col-risk center">风险</th>
              <th class="dw-col-affected center">影响</th>
              <th class="dw-col-owner">申请人</th>
              <th class="dw-col-updated">更新时间</th>
              <th class="dw-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in requestList" :key="row.id" class="management-list-row" @click="openRequestDetail(row)">
              <td class="dw-col-main">
                <button class="management-list-title-trigger" type="button" @click.stop="openRequestDetail(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon data-workbench-title-icon"><el-icon><DataAnalysis /></el-icon></span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">#{{ row.id }} · {{ row.originalText || '未填写自然语言原文' }}</div>
                      <div class="management-list-subtitle">{{ row.previewSqlSummary || '暂无 SQL 摘要' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="dw-col-project">
                <div class="management-list-title">{{ row.projectName || '未知项目' }}</div>
                <div class="management-list-subtitle">{{ row.entityName || row.entityCode || '-' }}</div>
              </td>
              <td class="dw-col-status center">
                <div class="data-workbench-status-stack">
                  <span class="management-list-pill" :class="statusTone(row.approvalStatus)">{{ approvalLabel(row.approvalStatus) }}</span>
                  <span class="management-list-pill" :class="statusTone(row.executionStatus)">{{ executionLabel(row.executionStatus) }}</span>
                  <span v-if="row.rollbackStatus === 'ROLLED_BACK'" class="management-list-pill neutral">已回滚</span>
                  <span v-else-if="row.rollbackStatus === 'CONFLICT'" class="management-list-pill danger">回滚冲突</span>
                </div>
              </td>
              <td class="dw-col-risk center">
                <span class="management-list-pill" :class="riskTone(row.riskLevel)">{{ riskLabel(row.riskLevel) }}</span>
              </td>
              <td class="dw-col-affected center">
                <strong class="data-workbench-affected">{{ row.affectedRows ?? 0 }}</strong>
                <span class="data-workbench-affected-unit">行</span>
              </td>
              <td class="dw-col-owner">
                <div class="management-list-title-cell">
                  <span class="management-list-avatar">{{ userInitial(row.requesterName) }}</span>
                  <div class="management-list-title-copy">
                    <div class="management-list-title">{{ row.requesterName || '系统' }}</div>
                    <div v-if="row.approverName" class="management-list-subtitle">审批 {{ row.approverName }}</div>
                  </div>
                </div>
              </td>
              <td class="dw-col-updated">
                <span class="management-list-updated">{{ latestTimestamp(row) }}</span>
              </td>
              <td class="dw-col-actions right">
                <div class="management-list-row-actions">
                  <el-tooltip content="查看审计快照" placement="top">
                    <button class="management-list-row-button" type="button" @click.stop="openRequestDetail(row)">
                      <el-icon><View /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip v-if="canApprove && row.approvalStatus === 'PENDING'" content="审批通过" placement="top">
                    <button class="management-list-row-button success" type="button" @click.stop="handleApprove(row.id)">
                      <el-icon><Check /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip v-if="canApprove && row.approvalStatus === 'PENDING'" content="驳回" placement="top">
                    <button class="management-list-row-button danger" type="button" @click.stop="handleReject(row.id)">
                      <el-icon><CloseBold /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip v-if="canExecute && canExecuteRow(row)" content="执行变更" placement="top">
                    <button class="management-list-row-button primary" type="button" @click.stop="handleExecute(row.id)">
                      <el-icon><Promotion /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip v-if="canRollback && row.executionStatus === 'EXECUTED' && row.rollbackStatus !== 'ROLLED_BACK'" content="回滚" placement="top">
                    <button class="management-list-row-button warning" type="button" @click.stop="handleRollback(row.id)">
                      <el-icon><RefreshLeft /></el-icon>
                    </button>
                  </el-tooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <el-empty v-if="!requestList.length && !loading" description="暂无数据变更工单" />
      </div>

      <div v-if="pagination.total > 0" class="management-list-footer">
        <div class="management-list-footer-total">共 <span>{{ pagination.total }}</span> 条</div>
        <div class="management-list-footer-controls">
          <div class="management-list-page-size management-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="management-list-page-nav">
            <button class="management-list-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="management-list-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="management-list-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 执行审计 Tab：默认拉取已执行工单，用户选中后展开 before / after 快照。 -->
    <section v-if="activeTab === 'audit'" class="management-list-shell">
      <div class="management-list-table-scroll" v-loading="loading">
        <table class="management-list-table data-change-table">
          <thead>
            <tr>
              <th class="dw-col-main">工单</th>
              <th class="dw-col-project">项目 / 实体</th>
              <th class="dw-col-status center">执行状态</th>
              <th class="dw-col-affected center">影响</th>
              <th class="dw-col-owner">执行人</th>
              <th class="dw-col-updated">执行时间</th>
              <th class="dw-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in requestList" :key="row.id" class="management-list-row" @click="openRequestDetail(row)">
              <td class="dw-col-main">
                <button class="management-list-title-trigger" type="button" @click.stop="openRequestDetail(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon data-workbench-title-icon"><el-icon><Files /></el-icon></span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">#{{ row.id }} · {{ row.originalText }}</div>
                      <div class="management-list-subtitle">{{ row.previewSqlSummary || '暂无 SQL 摘要' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="dw-col-project">
                <div class="management-list-title">{{ row.projectName || '未知项目' }}</div>
                <div class="management-list-subtitle">{{ row.entityName || row.entityCode || '-' }}</div>
              </td>
              <td class="dw-col-status center">
                <span class="management-list-pill" :class="statusTone(row.executionStatus)">{{ executionLabel(row.executionStatus) }}</span>
                <span v-if="row.rollbackStatus === 'ROLLED_BACK'" class="management-list-pill neutral">已回滚</span>
                <span v-else-if="row.rollbackStatus === 'CONFLICT'" class="management-list-pill danger">回滚冲突</span>
              </td>
              <td class="dw-col-affected center">
                <strong class="data-workbench-affected">{{ row.affectedRows ?? 0 }}</strong>
                <span class="data-workbench-affected-unit">行</span>
              </td>
              <td class="dw-col-owner">
                <div class="management-list-title-cell">
                  <span class="management-list-avatar">{{ userInitial(row.executorName || row.requesterName) }}</span>
                  <div class="management-list-title-copy">
                    <div class="management-list-title">{{ row.executorName || row.requesterName || '系统' }}</div>
                  </div>
                </div>
              </td>
              <td class="dw-col-updated">
                <span class="management-list-updated">{{ row.executedAt || row.createdAt || '-' }}</span>
              </td>
              <td class="dw-col-actions right">
                <div class="management-list-row-actions">
                  <el-tooltip content="查看审计" placement="top">
                    <button class="management-list-row-button" type="button" @click.stop="openRequestDetail(row)">
                      <el-icon><View /></el-icon>
                    </button>
                  </el-tooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <el-empty v-if="!requestList.length && !loading" description="暂无执行审计记录" />
      </div>
    </section>

    <!-- 实体配置 Tab：展示实体白名单卡片，字段用小标签堆叠展示。 -->
    <section v-if="activeTab === 'config'" class="management-list-shell">
      <div class="management-list-table-scroll" v-loading="loading">
        <table class="management-list-table data-config-table">
          <thead>
            <tr>
              <th class="dw-col-main">实体</th>
              <th class="dw-col-table">物理表结构</th>
              <th class="dw-col-fields">字段概览</th>
              <th class="dw-col-scope">数据权限范围</th>
              <th class="dw-col-affected center">阈值</th>
              <th class="dw-col-status center">状态</th>
              <th class="dw-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entity in entityList" :key="entity.id" class="management-list-row">
              <td class="dw-col-main">
                <div class="management-list-title-cell">
                  <span class="management-list-title-icon data-workbench-title-icon"><el-icon><Grid /></el-icon></span>
                  <div class="management-list-title-copy">
                    <div class="management-list-title">{{ entity.entityName }}</div>
                    <div class="management-list-subtitle">{{ entity.entityCode }}</div>
                  </div>
                </div>
              </td>
              <td class="dw-col-table">
                <div class="management-list-title">{{ entity.tableName }}</div>
                <div class="management-list-subtitle">PK <code>{{ entity.primaryKeyColumn }}</code> · 归属项目 <strong>{{ entity.platformProjectName || '未绑定' }}</strong></div>
              </td>
              <td class="dw-col-fields">
                <div class="data-workbench-field-pill-group">
                  <span class="management-list-pill info">{{ entity.fields.length }} 字段</span>
                  <span class="management-list-pill success">{{ entity.fields.filter((field) => field.updatable).length }} 可改</span>
                  <span class="management-list-pill neutral">{{ entity.fields.filter((field) => field.locator).length }} 定位</span>
                  <span v-if="entity.fields.some((field) => field.sensitive)" class="management-list-pill warning">
                    {{ entity.fields.filter((field) => field.sensitive).length }} 敏感
                  </span>
                </div>
              </td>
              <td class="dw-col-scope">
                <div class="data-workbench-scope-row"><span>请求</span><strong>{{ scopeLabel(entity.requestScope) }}</strong></div>
                <div class="data-workbench-scope-row"><span>执行</span><strong>{{ scopeLabel(entity.executeScope) }}</strong></div>
                <div class="data-workbench-scope-row"><span>回滚</span><strong>{{ scopeLabel(entity.rollbackScope) }}</strong></div>
              </td>
              <td class="dw-col-affected center">
                <strong class="data-workbench-affected">{{ entity.maxAffectedRows }}</strong>
                <span class="data-workbench-affected-unit">行</span>
              </td>
              <td class="dw-col-status center">
                <span class="management-list-pill" :class="entity.enabled ? 'success' : 'neutral'">{{ entity.enabled ? '启用' : '停用' }}</span>
              </td>
              <td class="dw-col-actions right">
                <div class="management-list-row-actions">
                  <el-tooltip content="编辑实体" placement="top">
                    <button class="management-list-row-button" type="button" @click="openEntityDialog(entity)">
                      <el-icon><EditPen /></el-icon>
                    </button>
                  </el-tooltip>
                  <el-tooltip v-if="canConfig" content="删除实体" placement="top">
                    <button class="management-list-row-button danger" type="button" @click="handleDeleteEntity(entity.id)">
                      <el-icon><Delete /></el-icon>
                    </button>
                  </el-tooltip>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <el-empty v-if="!entityList.length && !loading" description="暂无实体配置" />
      </div>
    </section>

    <!-- 能力配置 Tab：展示 DataWorkbench 已启用与规划中的应用能力。 -->
    <section v-if="activeTab === 'capabilities'" class="management-list-shell data-workbench-capability-shell">
      <div class="data-workbench-capability-grid">
        <article v-for="item in capabilityItems" :key="item.code" class="data-workbench-capability" :class="{ enabled: item.enabled }">
          <div class="data-workbench-capability-icon" :class="item.tone">
            <el-icon><component :is="item.icon" /></el-icon>
          </div>
          <div class="data-workbench-capability-body">
            <div class="data-workbench-capability-head">
              <h3>{{ item.name }}</h3>
              <span class="management-list-pill" :class="item.enabled ? 'success' : 'neutral'">{{ item.enabled ? '已启用' : '规划中' }}</span>
            </div>
            <p>{{ item.description }}</p>
            <span class="data-workbench-capability-code">{{ item.code }}</span>
          </div>
        </article>
      </div>
    </section>

    <!-- 语义查询治理：项目管理员在此依次登记数据源、扫描元数据、保存语义定义并发布。 -->
    <section v-if="activeTab === 'semantic'" class="management-list-shell data-workbench-semantic-shell" v-loading="semanticLoading">
      <div class="data-workbench-semantic-head">
        <div>
          <h3>语义查询发布台</h3>
          <p>发布后的模型才会出现在项目研发页的“数据查询”中；凭据只写入一次，页面不会回显。</p>
        </div>
        <el-select v-model="semanticProjectId" placeholder="选择项目" style="width: 260px" @change="loadSemanticAssets">
          <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
        </el-select>
      </div>
      <div v-if="semanticProjectId" class="data-workbench-semantic-nav" role="tablist" aria-label="语义查询配置模块">
        <button v-for="item in semanticSections" :key="item.key" type="button" :class="{ active: semanticSection === item.key }" @click="semanticSection = item.key">{{ item.label }}</button>
      </div>
      <el-alert v-if="!semanticProjectId" title="请先选择要治理的数据项目" type="info" :closable="false" show-icon />
      <template v-else>
        <el-alert v-if="semanticError" :title="semanticError" type="error" :closable="false" show-icon class="data-workbench-semantic-error" />
        <div class="data-workbench-semantic-grid" :class="{ 'is-single-column': semanticSection === 'source' || semanticSection === 'schema' }">
          <article v-show="semanticSection === 'source' || semanticSection === 'schema'" class="data-workbench-semantic-card">
            <div class="data-workbench-semantic-card-head"><div><strong>1. PostgreSQL 数据源与 Schema</strong><span>扫描快照只读；逻辑别名和映射在右侧语义模型维护</span></div></div>
            <el-form v-show="semanticSection === 'source'" label-position="top" size="small">
              <el-form-item label="名称"><el-input v-model="sourceForm.name" placeholder="运营分析库" /></el-form-item>
              <el-form-item label="JDBC URL"><el-input v-model="sourceForm.jdbcUrl" placeholder="jdbc:postgresql://db.example:5432/analytics" /></el-form-item>
              <el-form-item label="只读账号"><el-input v-model="sourceForm.username" /></el-form-item>
              <el-form-item label="密码"><el-input v-model="sourceForm.password" type="password" show-password /></el-form-item>
              <el-form-item label="允许 Schema"><el-input v-model="sourceForm.allowedSchemas" placeholder="public" /></el-form-item>
              <el-button type="primary" :loading="semanticSaving" @click="saveSemanticSource">保存数据源</el-button>
            </el-form>
            <template v-if="semanticSection === 'schema'">
              <section class="management-list-toolbar data-workbench-schema-list-toolbar">
                <div class="management-list-toolbar-main">
                  <div class="management-list-search-shell"><el-icon class="management-list-search-icon"><Search /></el-icon><input v-model="schemaKeyword" class="management-list-search-input" type="text" placeholder="搜索 Schema 或表名..." @keyup.enter="handleSchemaSearch" /></div>
                  <span class="management-list-toolbar-divider" aria-hidden="true"></span>
                  <el-select v-model="schemaSourceId" placeholder="选择已扫描数据源" style="width: 240px" @change="handleSchemaSourceChange"><el-option v-for="source in semanticSources" :key="source.id" :label="source.name" :value="source.id" /></el-select>
                </div>
                <div class="management-list-toolbar-side"><button class="management-list-toolbar-button" type="button" @click="loadSchemaPage"><el-icon><RefreshRight /></el-icon><span>刷新</span></button></div>
              </section>
              <div class="management-list-table-scroll"><table class="management-list-table data-workbench-schema-table"><thead><tr><th class="schema-col-schema">Schema</th><th class="schema-col-name">表名</th><th class="schema-col-count center">字段数</th><th class="schema-col-columns">字段摘要</th></tr></thead><tbody><tr v-for="table in schemaPage.records" :key="table.schema + '.' + table.table" class="management-list-row"><td class="schema-col-schema"><code>{{ table.schema }}</code></td><td class="schema-col-name"><div class="management-list-title">{{ table.table }}</div><div class="management-list-subtitle">{{ table.schema }}.{{ table.table }}</div></td><td class="schema-col-count center"><strong class="data-workbench-affected">{{ table.columns.length }}</strong><span class="data-workbench-affected-unit">字段</span></td><td class="schema-col-columns"><span class="data-workbench-schema-summary">{{ table.columns.join('、') }}</span></td></tr><tr v-if="!schemaPage.records.length"><td colspan="4" class="management-list-empty">暂无扫描表，请先刷新扫描。</td></tr></tbody></table></div>
              <div class="management-list-footer"><div class="management-list-footer-total">共 <span>{{ schemaPage.total }}</span> 张表</div><div class="management-list-footer-controls"><div class="management-list-page-size management-list-compact-input"><span>每页</span><el-select v-model="schemaPage.size" size="small" style="width: 92px" @change="handleSchemaSizeChange"><el-option :value="10" label="10" /><el-option :value="20" label="20" /><el-option :value="50" label="50" /></el-select><span>条</span></div><div class="management-list-pagination"><button class="management-list-page-button" type="button" :disabled="schemaPage.page <= 1" @click="changeSchemaPage(-1)">上一页</button><span class="management-list-page-text">第 {{ schemaPage.page }} / {{ schemaPage.totalPages || 1 }} 页</span><button class="management-list-page-button" type="button" :disabled="schemaPage.page >= (schemaPage.totalPages || 1)" @click="changeSchemaPage(1)">下一页</button></div></div></div>
            </template>
            <div v-show="semanticSection === 'source'" class="data-workbench-semantic-list">
              <div v-for="source in semanticSources" :key="source.id" class="data-workbench-semantic-list-row">
                <div class="data-workbench-schema-source"><strong>{{ source.name }}</strong><span>{{ source.allowedSchemas }} · {{ source.scannedAt ? `已扫描 ${source.scannedAt}` : '尚未扫描' }}</span>
                  <div v-if="semanticSection === 'schema' && source.tables.length" class="data-workbench-schema-tree">
                    <details v-for="table in source.tables" :key="`${table.schema}.${table.table}`"><summary>{{ table.schema }}.{{ table.table }} <em>{{ table.columns.length }} 字段</em></summary><div class="data-workbench-schema-columns"><code v-for="column in table.columns" :key="column">{{ column }}</code></div></details>
                  </div>
                </div>
                <el-button size="small" :loading="semanticSaving" @click="scanSemanticSource(source.id)">刷新扫描</el-button>
              </div>
            </div>
          </article>
          <article v-show="semanticSection === 'model' || semanticSection === 'dictionary' || semanticSection === 'policy'" class="data-workbench-semantic-card">
            <div class="data-workbench-semantic-card-head"><div><strong>2. 逻辑语义映射</strong><span>通过表单配置业务展示，不会修改外部 PostgreSQL 表结构</span></div></div>
            <el-form label-position="top" size="small">
              <el-form-item v-show="semanticSection === 'model'" label="模型名称"><el-input v-model="semanticForm.name" placeholder="运营指标口径" /></el-form-item>
              <el-form-item v-show="semanticSection === 'model'" label="来源数据源"><el-select v-model="semanticForm.dataSourceId" placeholder="先扫描数据源" style="width: 100%"><el-option v-for="source in semanticSources" :key="source.id" :label="source.name" :value="source.id" /></el-select></el-form-item>
              <el-form-item v-show="semanticSection === 'model'" label="业务表"><el-select v-model="semanticForm.table" filterable placeholder="从扫描结果选择表" style="width: 100%"><el-option v-for="table in selectedSourceTables" :key="`${table.schema}.${table.table}`" :label="`${table.schema}.${table.table}（${table.columns.length} 字段）`" :value="`${table.schema}.${table.table}`" /></el-select></el-form-item>
              <div v-show="semanticSection === 'model'" class="data-workbench-mapping-section"><div class="data-workbench-mapping-title">业务概念 <el-button link type="primary" @click="addSemanticConcept">添加概念</el-button></div>
                <div v-for="(concept, index) in semanticForm.concepts" :key="concept.key" class="data-workbench-mapping-row"><el-input v-model="concept.name" placeholder="展示名，如订单数" /><el-input v-model="concept.code" placeholder="编码，如order_count" /><el-select v-model="concept.column" filterable placeholder="物理字段"><el-option v-for="column in selectedTableColumns" :key="column" :label="column" :value="column" /></el-select><el-select v-model="concept.kind"><el-option label="指标" value="MEASURE" /><el-option label="维度" value="DIMENSION" /></el-select><el-select v-if="concept.kind === 'MEASURE'" v-model="concept.aggregation"><el-option v-for="item in aggregationOptions" :key="item" :label="item" :value="item" /></el-select><el-checkbox v-model="concept.sensitive">敏感</el-checkbox><el-button link type="danger" @click="semanticForm.concepts.splice(index, 1)">移除</el-button></div>
              </div>
              <div v-show="semanticSection === 'dictionary'" class="data-workbench-mapping-section"><div class="data-workbench-mapping-title">同义词 <el-button link type="primary" @click="semanticForm.synonyms.push({ term: '', concept: '' })">添加</el-button></div><div v-for="(item, index) in semanticForm.synonyms" :key="index" class="data-workbench-mapping-row compact"><el-input v-model="item.term" placeholder="用户表达，如订单量" /><el-select v-model="item.concept" placeholder="归一到概念"><el-option v-for="concept in semanticForm.concepts" :key="concept.key" :label="concept.name || concept.code" :value="concept.code" /></el-select><el-button link type="danger" @click="semanticForm.synonyms.splice(index, 1)">移除</el-button></div></div>
              <div v-show="semanticSection === 'dictionary'" class="data-workbench-mapping-section"><div class="data-workbench-mapping-title">字典枚举 <el-button link type="primary" @click="semanticForm.enums.push({ concept: '', label: '', value: '' })">添加</el-button></div><div v-for="(item, index) in semanticForm.enums" :key="index" class="data-workbench-mapping-row compact"><el-select v-model="item.concept" placeholder="字段概念"><el-option v-for="concept in semanticForm.concepts" :key="concept.key" :label="concept.name || concept.code" :value="concept.code" /></el-select><el-input v-model="item.label" placeholder="显示值，如已完成" /><el-input v-model="item.value" placeholder="物理值，如DONE" /><el-button link type="danger" @click="semanticForm.enums.splice(index, 1)">移除</el-button></div></div>
              <div v-show="semanticSection === 'policy'" class="data-workbench-mapping-section"><div class="data-workbench-mapping-title">行级策略 <el-button link type="primary" @click="semanticForm.policies.push({ column: '', context: 'PROJECT_ID' })">添加</el-button></div><div v-for="(item, index) in semanticForm.policies" :key="index" class="data-workbench-mapping-row compact"><el-select v-model="item.column" filterable placeholder="隔离字段"><el-option v-for="column in selectedTableColumns" :key="column" :label="column" :value="column" /></el-select><el-tag>当前项目 ID</el-tag><el-button link type="danger" @click="semanticForm.policies.splice(index, 1)">移除</el-button></div></div>
              <details class="data-workbench-json-advanced"><summary>高级模式：查看 / 粘贴定义 JSON</summary><el-input v-model="semanticForm.advancedJson" type="textarea" :rows="9" @change="applyAdvancedDefinition" /></details>
              <el-button type="primary" :loading="semanticSaving" @click="saveSemanticModel">{{ editingSemanticModelId ? '更新草稿' : '保存草稿' }}</el-button>
              <el-button v-if="editingSemanticModelId" @click="resetSemanticForm">新建模型</el-button>
            </el-form>
            <div v-show="semanticSection === 'model'" class="data-workbench-semantic-list">
              <div v-for="model in semanticModels" :key="model.id" class="data-workbench-semantic-list-row">
                <div><strong>{{ model.name }} · v{{ model.versionNo }}</strong><span>{{ model.status === 'PUBLISHED' ? '已发布' : '草稿' }}</span></div>
                <div><el-button size="small" @click="editSemanticModel(model)">编辑</el-button><el-button v-if="model.status !== 'PUBLISHED'" size="small" type="success" :loading="semanticSaving" @click="publishSemanticModel(model.id)">发布</el-button></div>
              </div>
            </div>
          </article>
        </div>
      </template>
    </section>

    <!-- 审计详情：展示原始文本 / DSL / before-after 快照。 -->
    <el-dialog v-model="requestDetailVisible" width="920px" class="platform-form-dialog data-workbench-detail-dialog" align-center>
      <template #header>
        <PlatformDialogHeader
          :title="currentRequest ? `#${currentRequest.id} 数据变更审计` : '数据变更审计'"
          :subtitle="currentRequest ? `${currentRequest.projectName || '未知项目'} · ${currentRequest.entityName || currentRequest.entityCode || ''}` : '查看执行快照'"
          :icon="DataAnalysis"
        />
      </template>
      <div v-if="currentRequest" class="data-workbench-detail">
        <div class="data-workbench-detail-meta">
          <div class="data-workbench-detail-meta-item">
            <span>审批状态</span>
            <strong class="management-list-pill" :class="statusTone(currentRequest.approvalStatus)">{{ approvalLabel(currentRequest.approvalStatus) }}</strong>
          </div>
          <div class="data-workbench-detail-meta-item">
            <span>执行状态</span>
            <strong class="management-list-pill" :class="statusTone(currentRequest.executionStatus)">{{ executionLabel(currentRequest.executionStatus) }}</strong>
          </div>
          <div class="data-workbench-detail-meta-item">
            <span>风险等级</span>
            <strong class="management-list-pill" :class="riskTone(currentRequest.riskLevel)">{{ riskLabel(currentRequest.riskLevel) }}</strong>
          </div>
          <div class="data-workbench-detail-meta-item">
            <span>影响行数</span>
            <strong>{{ currentRequest.affectedRows ?? 0 }} 行</strong>
          </div>
          <div class="data-workbench-detail-meta-item">
            <span>申请人</span>
            <strong>{{ currentRequest.requesterName || '-' }}</strong>
          </div>
          <div class="data-workbench-detail-meta-item">
            <span>提交时间</span>
            <strong>{{ currentRequest.createdAt || '-' }}</strong>
          </div>
        </div>

        <div class="data-workbench-detail-block">
          <h4>自然语言原文</h4>
          <div class="data-workbench-detail-quote">{{ currentRequest.originalText || '未填写' }}</div>
        </div>

        <div class="data-workbench-detail-block">
          <h4>DSL 摘要</h4>
          <pre>{{ formatJson(currentRequest.dsl) }}</pre>
        </div>

        <div v-if="currentRequest.previewSqlSummary" class="data-workbench-detail-block">
          <h4>SQL 摘要</h4>
          <pre class="data-workbench-detail-sql">{{ currentRequest.previewSqlSummary }}</pre>
        </div>

        <div v-if="currentRequest.riskReasons && currentRequest.riskReasons.length" class="data-workbench-detail-block">
          <h4>风险说明</h4>
          <ul class="data-workbench-detail-risks">
            <li v-for="reason in currentRequest.riskReasons" :key="reason">{{ reason }}</li>
          </ul>
        </div>

        <div v-if="currentRequest.rejectReason" class="data-workbench-detail-block">
          <h4>驳回原因</h4>
          <div class="data-workbench-detail-quote danger">{{ currentRequest.rejectReason }}</div>
        </div>

        <div class="data-workbench-detail-block">
          <div class="data-workbench-detail-block-head">
            <h4>执行审计快照</h4>
            <span>{{ audits.length }} 条</span>
          </div>
          <div v-if="audits.length" class="data-workbench-audit-list">
            <article v-for="audit in audits" :key="audit.id" class="data-workbench-audit-card">
              <header class="data-workbench-audit-head">
                <span class="management-list-pill neutral">主键 {{ audit.primaryKeyValue }}</span>
                <span v-if="audit.rollbackStatus === 'ROLLED_BACK'" class="management-list-pill success">已回滚</span>
                <span v-else-if="audit.rollbackStatus === 'CONFLICT'" class="management-list-pill danger">回滚冲突</span>
                <span class="data-workbench-audit-time">{{ audit.createdAt || '-' }}</span>
              </header>
              <div class="data-workbench-audit-grid">
                <div class="data-workbench-audit-column">
                  <span class="data-workbench-audit-label before">变更前</span>
                  <pre>{{ formatJson(audit.beforeSnapshot) }}</pre>
                </div>
                <div class="data-workbench-audit-column">
                  <span class="data-workbench-audit-label after">变更后</span>
                  <pre>{{ formatJson(audit.afterSnapshot) }}</pre>
                </div>
              </div>
              <div v-if="audit.rollbackConflictReason" class="data-workbench-audit-conflict">
                冲突原因：{{ audit.rollbackConflictReason }}
              </div>
            </article>
          </div>
          <el-empty v-else description="暂无审计快照" />
        </div>
      </div>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="requestDetailVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 实体配置弹窗：分区展示基础信息、数据权限范围与字段列表。 -->
    <el-dialog v-model="entityDialogVisible" width="960px" class="platform-form-dialog data-workbench-entity-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="entityDialogTitle" subtitle="维护实体白名单、定位规则、字段策略与数据权限范围。" :icon="Grid" />
      </template>
      <el-form label-position="top" class="platform-form-layout">
        <!-- 快速生成：粘贴 CREATE TABLE 或 Java 实体类，一键解析回填。 -->
        <section class="platform-form-section data-workbench-parse-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">从 DDL / Java 实体类快速生成</div>
            <div class="platform-form-section-subtitle">粘贴建表语句或实体类源码，自动识别表名 / 主键 / 字段列表并合并到下方表单。</div>
          </div>
          <el-tabs v-model="parseSourceType" class="data-workbench-parse-tabs">
            <el-tab-pane label="CREATE TABLE DDL" name="DDL">
              <el-input
                v-model="parseInput.DDL"
                type="textarea"
                :rows="8"
                placeholder="例如：CREATE TABLE project (id BIGINT PRIMARY KEY, project_id BIGINT, project_code VARCHAR(64), ...);"
              />
            </el-tab-pane>
            <el-tab-pane label="Java 实体类" name="JAVA">
              <el-input
                v-model="parseInput.JAVA"
                type="textarea"
                :rows="8"
                placeholder="粘贴带 @Entity/@Table 或 @TableName 注解的 Java 类源码，也支持 @Data 等 Lombok 场景"
              />
            </el-tab-pane>
          </el-tabs>
          <div class="data-workbench-parse-actions">
            <el-button type="primary" plain :loading="parsing" @click="handleParseEntity">
              <el-icon><MagicStick /></el-icon>
              <span>解析并回填</span>
            </el-button>
            <span class="data-workbench-parse-tip">合并策略：已填字段不会被覆盖，字段列表按 fieldCode 合并。</span>
          </div>
          <div v-if="parseWarnings.length" class="data-workbench-parse-warnings">
            <el-alert
              v-for="(warning, index) in parseWarnings"
              :key="index"
              :title="warning"
              type="warning"
              show-icon
              :closable="false"
            />
          </div>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基础信息</div>
            <div class="platform-form-section-subtitle">用于生成 SQL 时的表名、主键与项目列。</div>
          </div>
          <div class="data-workbench-form-grid">
            <el-form-item label="实体编码" required>
              <el-input v-model="entityForm.entityCode" placeholder="例如：project" />
            </el-form-item>
            <el-form-item label="实体名称" required>
              <el-input v-model="entityForm.entityName" placeholder="例如：项目" />
            </el-form-item>
            <el-form-item label="物理表名" required>
              <el-input v-model="entityForm.tableName" placeholder="例如：project" />
            </el-form-item>
            <el-form-item label="主键列">
              <el-input v-model="entityForm.primaryKeyColumn" placeholder="id" />
            </el-form-item>
            <el-form-item label="绑定平台项目" required>
              <el-select
                v-model="entityForm.platformProjectId"
                filterable
                clearable
                placeholder="选择归属的平台项目"
                style="width: 100%"
              >
                <el-option
                  v-for="project in projectOptions"
                  :key="project.id"
                  :label="project.name"
                  :value="project.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="最大影响行数">
              <el-input-number v-model="entityForm.maxAffectedRows" :min="1" :max="10000" controls-position="right" style="width: 100%" />
            </el-form-item>
            <el-form-item label="启用">
              <el-switch v-model="entityForm.enabled" />
            </el-form-item>
          </div>
          <el-form-item label="描述">
            <el-input v-model="entityForm.description" type="textarea" :rows="2" placeholder="用一句话说明这个实体所属业务和用途" />
          </el-form-item>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">数据权限范围</div>
            <div class="platform-form-section-subtitle">分别控制请求、执行和回滚可覆盖的项目范围。</div>
          </div>
          <div class="data-workbench-form-grid">
            <el-form-item label="请求范围">
              <el-select v-model="entityForm.requestScope" style="width: 100%">
                <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="执行范围">
              <el-select v-model="entityForm.executeScope" style="width: 100%">
                <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="回滚范围">
              <el-select v-model="entityForm.rollbackScope" style="width: 100%">
                <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">字段白名单</div>
            <div class="platform-form-section-subtitle">配置允许 DataChange 修改或定位的字段，未开启的字段不进入变更链路。</div>
          </div>
          <div class="data-workbench-field-header">
            <span>{{ entityForm.fields.length }} 个字段</span>
            <el-button type="primary" plain size="small" @click="addField">
              <el-icon><Plus /></el-icon>
              <span>新增字段</span>
            </el-button>
          </div>
          <div v-if="entityForm.fields.length" class="data-workbench-field-list">
            <article v-for="(field, index) in entityForm.fields" :key="index" class="data-workbench-field-card">
              <header class="data-workbench-field-card-head">
                <span class="data-workbench-field-index">#{{ index + 1 }}</span>
                <el-input v-model="field.fieldName" placeholder="字段名称，例如：项目状态" class="data-workbench-field-name" />
                <button class="management-list-row-button danger" type="button" title="删除字段" @click="entityForm.fields.splice(index, 1)">
                  <el-icon><Delete /></el-icon>
                </button>
              </header>
              <div class="data-workbench-field-grid">
                <el-form-item label="字段编码">
                  <el-input v-model="field.fieldCode" placeholder="qualificationRequired" />
                </el-form-item>
                <el-form-item label="物理列名">
                  <el-input v-model="field.columnName" placeholder="qualification_required" />
                </el-form-item>
                <el-form-item label="数据类型">
                  <el-select v-model="field.dataType" style="width: 100%">
                    <el-option label="STRING" value="STRING" />
                    <el-option label="BOOLEAN" value="BOOLEAN" />
                    <el-option label="LONG" value="LONG" />
                    <el-option label="INTEGER" value="INTEGER" />
                  </el-select>
                </el-form-item>
                <el-form-item label="同义词">
                  <el-input v-model="field.synonyms" placeholder="逗号分隔，例如：资质,资质要求" />
                </el-form-item>
              </div>
              <div class="data-workbench-field-flags">
                <el-checkbox v-model="field.updatable">可修改</el-checkbox>
                <el-checkbox v-model="field.locator">可定位</el-checkbox>
                <el-checkbox v-model="field.sensitive">敏感字段</el-checkbox>
                <el-checkbox v-model="field.enabled">启用</el-checkbox>
              </div>
            </article>
          </div>
          <el-empty v-else description="暂未配置字段，点击右上角新增" :image-size="72" />
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="entityDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmitEntity">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloseBold,
  DataAnalysis,
  Delete,
  DocumentCopy,
  EditPen,
  Files,
  Filter,
  Grid,
  MagicStick,
  Plus,
  Promotion,
  RefreshLeft,
  RefreshRight,
  Search,
  Upload,
  View
} from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  approveDataChangeRequest,
  createDataWorkbenchEntity,
  createDataWorkbenchDataSource,
  createDataWorkbenchSemanticModel,
  deleteDataWorkbenchEntity,
  executeDataChangeRequest,
  listDataChangeAudits,
  listDataWorkbenchEntities,
  listDataWorkbenchDataSources,
  pageDataWorkbenchSourceSchema,
  listDataWorkbenchSemanticModels,
  pageDataChangeRequests,
  parseDataWorkbenchEntityDraft,
  rejectDataChangeRequest,
  rollbackDataChangeRequest,
  publishDataWorkbenchSemanticModel,
  scanDataWorkbenchDataSource,
  updateDataWorkbenchSemanticModel,
  updateDataWorkbenchEntity
} from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type {
  DataChangeAuditItem,
  DataChangeRequestItem,
  DataPermissionScopeValue,
  DataWorkbenchEntityDraft,
  DataWorkbenchEntityItem,
  DataWorkbenchFieldItem,
  DataWorkbenchDataSourceItem,
  DataWorkbenchSemanticModelItem,
  ProjectItem
} from '@/types/platform'
import { listProjectOptions } from '@/api/platform'

type TabKey = 'requests' | 'approvals' | 'audit' | 'config' | 'semantic' | 'capabilities'

const authStore = useAuthStore()
const canApprove = computed(() => authStore.hasPermission('data-workbench:approve'))
const canExecute = computed(() => authStore.hasPermission('data-workbench:execute'))
const canRollback = computed(() => authStore.hasPermission('data-workbench:rollback'))
const canConfig = computed(() => authStore.hasPermission('data-workbench:config'))
const canSemanticManage = computed(() => authStore.hasPermission('data-workbench:source-manage') || authStore.hasPermission('data-workbench:semantic-manage'))

// Tab 定义：所有列表 Tab 共用请求接口，仅通过筛选参数区分。
const tabs = [
  { key: 'requests', label: '变更处理' },
  { key: 'approvals', label: '审批队列' },
  { key: 'audit', label: '执行审计' },
  { key: 'config', label: '实体配置' },
  { key: 'semantic', label: '语义查询治理' },
  { key: 'capabilities', label: '能力配置' }
] as const

const activeTab = ref<TabKey>('requests')
const loading = ref(false)
const submitting = ref(false)
const requestList = ref<DataChangeRequestItem[]>([])
const entityList = ref<DataWorkbenchEntityItem[]>([])
const audits = ref<DataChangeAuditItem[]>([])
const currentRequest = ref<DataChangeRequestItem | null>(null)
const requestDetailVisible = ref(false)
const entityDialogVisible = ref(false)
const editingEntityId = ref<number | null>(null)
const filterPopoverVisible = ref(false)

const entityDialogTitle = computed(() => (editingEntityId.value ? '编辑数据实体' : '新增数据实体'))

const filters = reactive({
  keyword: '',
  riskLevel: '' as string,
  approvalStatus: '' as string,
  executionStatus: '' as string
})

const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))

const isRequestTab = computed(() => activeTab.value === 'requests' || activeTab.value === 'approvals')
const isListTab = computed(() => isRequestTab.value || activeTab.value === 'audit')

const searchPlaceholder = computed(() => {
  if (activeTab.value === 'approvals') return '搜索待审批工单原文 / SQL 摘要...'
  if (activeTab.value === 'audit') return '搜索已执行工单原文 / SQL 摘要...'
  return '搜索工单原文 / SQL 摘要...'
})

// 顶部 KPI 卡片已按需求移除，Tab 直接使用 gitlab 风格切换。

const capabilityItems = [
  { code: 'data-change', name: 'DataChange', description: '自然语言提交受控数据变更，支持审批、执行审计和冲突回滚。', enabled: true, icon: EditPen, tone: 'primary' },
  { code: 'data-query', name: 'DataQuery', description: '后续接入受控数据查询与导出，支持模板化 SQL 与结果脱敏。', enabled: false, icon: Search, tone: 'info' },
  { code: 'data-import', name: 'DataImport', description: '后续接入模板化导入和批量校验，支持预演与失败回滚。', enabled: false, icon: Upload, tone: 'warning' },
  { code: 'reconcile', name: '数据对账', description: '后续接入跨系统对账和差异修复，支持定时任务和人工确认。', enabled: false, icon: DocumentCopy, tone: 'success' }
]

const scopeOptions: Array<{ value: DataPermissionScopeValue; label: string }> = [
  { value: 'PROJECT_PARTICIPANT', label: '项目成员' },
  { value: 'OWNER_OR_CREATOR', label: '负责人或创建人' },
  { value: 'OWNER_ONLY', label: '仅负责人' },
  { value: 'CREATOR_ONLY', label: '仅创建人' },
  { value: 'ALL', label: '全部项目' },
  { value: 'NONE', label: '无权限' }
]

const entityForm = reactive({
  entityCode: '',
  entityName: '',
  description: '',
  tableName: '',
  primaryKeyColumn: 'id',
  /** 绑定的平台项目 ID，替代 v1 动态 project_id_column。 */
  platformProjectId: null as number | null,
  maxAffectedRows: 1,
  requestScope: 'PROJECT_PARTICIPANT' as DataPermissionScopeValue,
  executeScope: 'OWNER_OR_CREATOR' as DataPermissionScopeValue,
  rollbackScope: 'OWNER_OR_CREATOR' as DataPermissionScopeValue,
  enabled: true,
  fields: [] as Array<Omit<DataWorkbenchFieldItem, 'id'> & { id?: number | null }>
})

// 平台项目选项，用于弹窗“绑定平台项目”下拉。
const projectOptions = ref<ProjectItem[]>([])

// 解析区状态：粘贴 DDL / Java 后一键回填。
type ParseSourceType = 'DDL' | 'JAVA'
const parseSourceType = ref<ParseSourceType>('DDL')
const parseInput = reactive<Record<ParseSourceType, string>>({ DDL: '', JAVA: '' })
const parseWarnings = ref<string[]>([])
const parsing = ref(false)
const semanticLoading = ref(false)
const semanticSaving = ref(false)
const semanticError = ref('')
const semanticProjectId = ref<number | null>(null)
const semanticSection = ref<'source' | 'schema' | 'model' | 'dictionary' | 'policy'>('source')
const semanticSections = [
  { key: 'source', label: '数据源' }, { key: 'schema', label: 'Schema 浏览' }, { key: 'model', label: '语义模型' }, { key: 'dictionary', label: '词典与同义词' }, { key: 'policy', label: '访问策略' }
] as const
const semanticSources = ref<DataWorkbenchDataSourceItem[]>([])
const semanticModels = ref<DataWorkbenchSemanticModelItem[]>([])
const schemaSourceId = ref<number | null>(null)
const schemaKeyword = ref('')
const schemaPage = reactive({ records: [] as Array<{ schema: string; table: string; columns: string[] }>, total: 0, page: 1, size: 20, totalPages: 1 })
const sourceForm = reactive({ name: '', jdbcUrl: '', username: '', password: '', allowedSchemas: 'public', enabled: true })
const editingSemanticModelId = ref<number | null>(null)
const semanticForm = reactive({
  name: '', dataSourceId: null as number | null, table: '', concepts: [] as Array<{ key: string; code: string; name: string; column: string; kind: string; aggregation: string; sensitive: boolean }>,
  synonyms: [] as Array<{ term: string; concept: string }>, enums: [] as Array<{ concept: string; label: string; value: string }>, policies: [] as Array<{ column: string; context: string }>, advancedJson: ''
})
const aggregationOptions = ['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX']
const selectedSourceTables = computed(() => semanticSources.value.find((item) => item.id === semanticForm.dataSourceId)?.tables || [])
const selectedTableColumns = computed(() => selectedSourceTables.value.find((item) => `${item.schema}.${item.table}` === semanticForm.table)?.columns || [])

watch(activeTab, () => {
  pagination.page = 1
  reloadActiveTab()
})

watch(semanticSection, async (section) => {
  if (section === 'schema' && schemaSourceId.value) await loadSchemaPage()
})

onMounted(reloadActiveTab)

async function reloadActiveTab() {
  if (activeTab.value === 'config') {
    await loadEntities()
  } else if (activeTab.value === 'semantic') {
    await ensureProjectOptions()
    if (semanticProjectId.value) await loadSemanticAssets()
  } else if (isListTab.value) {
    await loadRequests()
  }
}

async function loadSemanticAssets() {
  if (!semanticProjectId.value) return
  semanticLoading.value = true
  semanticError.value = ''
  try {
    const [sources, models] = await Promise.all([listDataWorkbenchDataSources(semanticProjectId.value), listDataWorkbenchSemanticModels(semanticProjectId.value)])
    semanticSources.value = sources
    semanticModels.value = models
    if (!semanticForm.dataSourceId) semanticForm.dataSourceId = sources[0]?.id ?? null
    if (!schemaSourceId.value) schemaSourceId.value = sources[0]?.id ?? null
    if (semanticSection.value === 'schema' && schemaSourceId.value) await loadSchemaPage()
  } catch (error: any) {
    semanticError.value = error?.response?.data?.message || error?.message || '加载语义查询治理数据失败'
  } finally {
    semanticLoading.value = false
  }
}

async function loadSchemaPage() {
  if (!semanticProjectId.value || !schemaSourceId.value) return
  try {
    const data = await pageDataWorkbenchSourceSchema(semanticProjectId.value, schemaSourceId.value, { page: schemaPage.page, size: schemaPage.size, keyword: schemaKeyword.value || undefined })
    schemaPage.records = data.records; schemaPage.total = data.total; schemaPage.page = data.page; schemaPage.totalPages = data.totalPages
  } catch (error: any) { semanticError.value = error?.response?.data?.message || error?.message || '加载 Schema 列表失败' }
}

async function handleSchemaSearch() { schemaPage.page = 1; await loadSchemaPage() }
async function changeSchemaPage(delta: number) { schemaPage.page = Math.max(1, schemaPage.page + delta); await loadSchemaPage() }
async function handleSchemaSourceChange() { schemaPage.page = 1; schemaKeyword.value = ''; await loadSchemaPage() }
async function handleSchemaSizeChange() { schemaPage.page = 1; await loadSchemaPage() }

async function saveSemanticSource() {
  if (!semanticProjectId.value) return
  semanticSaving.value = true
  semanticError.value = ''
  try {
    await createDataWorkbenchDataSource(semanticProjectId.value, sourceForm)
    sourceForm.name = ''; sourceForm.jdbcUrl = ''; sourceForm.username = ''; sourceForm.password = ''
    await loadSemanticAssets(); ElMessage.success('数据源已加密保存，请继续执行 Schema 扫描')
  } catch (error: any) {
    semanticError.value = error?.response?.data?.message || error?.message || '保存数据源失败'
  } finally { semanticSaving.value = false }
}
async function scanSemanticSource(id: number) {
  if (!semanticProjectId.value) return
  semanticSaving.value = true
  semanticError.value = ''
  try { await scanDataWorkbenchDataSource(semanticProjectId.value, id); await loadSemanticAssets(); ElMessage.success('Schema 扫描完成') } catch (error: any) { semanticError.value = error?.response?.data?.message || error?.message || 'Schema 扫描失败' } finally { semanticSaving.value = false }
}
async function saveSemanticModel() {
  if (!semanticProjectId.value || !semanticForm.dataSourceId) return
  semanticSaving.value = true
  semanticError.value = ''
  try {
    const payload = { dataSourceId: semanticForm.dataSourceId, name: semanticForm.name, definitionJson: buildSemanticDefinition() }
    if (editingSemanticModelId.value) await updateDataWorkbenchSemanticModel(semanticProjectId.value, editingSemanticModelId.value, payload)
    else await createDataWorkbenchSemanticModel(semanticProjectId.value, payload)
    await loadSemanticAssets(); ElMessage.success('语义模型草稿已保存')
  } catch (error: any) { semanticError.value = error?.response?.data?.message || error?.message || '保存语义模型失败' } finally { semanticSaving.value = false }
}
async function publishSemanticModel(id: number) {
  if (!semanticProjectId.value) return
  semanticSaving.value = true
  semanticError.value = ''
  try { await publishDataWorkbenchSemanticModel(semanticProjectId.value, id); await loadSemanticAssets(); ElMessage.success('语义模型已发布，项目成员现在可以查询') } catch (error: any) { semanticError.value = error?.response?.data?.message || error?.message || '发布语义模型失败' } finally { semanticSaving.value = false }
}

function addSemanticConcept() {
  semanticForm.concepts.push({ key: crypto.randomUUID(), code: '', name: '', column: '', kind: 'MEASURE', aggregation: 'COUNT', sensitive: false })
}

function buildSemanticDefinition() {
  const synonyms = Object.fromEntries(semanticForm.synonyms.filter((item) => item.term && item.concept).map((item) => [item.term, item.concept]))
  const enums: Record<string, Record<string, string>> = {}
  semanticForm.enums.filter((item) => item.concept && item.label && item.value).forEach((item) => { enums[item.concept] ||= {}; enums[item.concept][item.label] = item.value })
  const definition = { table: semanticForm.table, concepts: semanticForm.concepts.filter((item) => item.code && item.name && item.column).map(({ key, ...item }) => item), synonyms, enums, policies: semanticForm.policies.filter((item) => item.column).map((item) => ({ ...item, context: 'PROJECT_ID' })) }
  semanticForm.advancedJson = JSON.stringify(definition, null, 2)
  return semanticForm.advancedJson
}

function applyAdvancedDefinition() {
  try { populateSemanticForm(JSON.parse(semanticForm.advancedJson)) } catch (error) { semanticError.value = '高级 JSON 格式不正确，未覆盖当前表单' }
}

function populateSemanticForm(definition: any) {
  semanticForm.table = definition?.table || ''
  semanticForm.concepts = (definition?.concepts || []).map((item: any) => ({ key: crypto.randomUUID(), code: item.code || '', name: item.name || '', column: item.column || '', kind: item.kind || 'MEASURE', aggregation: item.aggregation || 'COUNT', sensitive: Boolean(item.sensitive) }))
  semanticForm.synonyms = Object.entries(definition?.synonyms || {}).map(([term, concept]) => ({ term, concept: String(concept) }))
  semanticForm.enums = Object.entries(definition?.enums || {}).flatMap(([concept, values]) => Object.entries(values as Record<string, string>).map(([label, value]) => ({ concept, label, value })))
  semanticForm.policies = (definition?.policies || []).map((item: any) => ({ column: item.column || '', context: 'PROJECT_ID' }))
  semanticForm.advancedJson = JSON.stringify(definition || {}, null, 2)
}

function editSemanticModel(model: DataWorkbenchSemanticModelItem) {
  editingSemanticModelId.value = model.id; semanticForm.name = model.name; semanticForm.dataSourceId = model.dataSourceId
  try { populateSemanticForm(JSON.parse(model.draftDefinitionJson || '{}')) } catch (error) { semanticError.value = '当前草稿 JSON 无法解析' }
}

function resetSemanticForm() {
  editingSemanticModelId.value = null; semanticForm.name = ''; semanticForm.table = ''; semanticForm.concepts = []; semanticForm.synonyms = []; semanticForm.enums = []; semanticForm.policies = []; semanticForm.advancedJson = ''
}

/**
 * 依据当前 Tab 拼装列表参数，Tab 各自需要固定的默认筛选值。
 */
function currentQuery() {
  const query: Record<string, unknown> = {
    page: pagination.page,
    size: pagination.size
  }
  if (filters.keyword) query.keyword = filters.keyword
  if (filters.riskLevel) query.riskLevel = filters.riskLevel
  if (activeTab.value === 'approvals') {
    query.approvalStatus = 'PENDING'
  } else if (filters.approvalStatus) {
    query.approvalStatus = filters.approvalStatus
  }
  if (activeTab.value === 'audit') {
    query.executionStatus = 'EXECUTED'
  } else if (filters.executionStatus) {
    query.executionStatus = filters.executionStatus
  }
  return query
}

async function loadRequests() {
  loading.value = true
  try {
    const data = await pageDataChangeRequests(currentQuery() as any)
    requestList.value = data.records
    pagination.total = data.total
  } finally {
    loading.value = false
  }
}

async function loadEntities() {
  loading.value = true
  try {
    entityList.value = await listDataWorkbenchEntities(true)
  } finally {
    loading.value = false
  }
}

async function openRequestDetail(row: DataChangeRequestItem) {
  currentRequest.value = row
  audits.value = []
  requestDetailVisible.value = true
  try {
    audits.value = await listDataChangeAudits(row.id)
  } catch (error) {
    audits.value = []
  }
}

async function handleApprove(id: number) {
  await approveDataChangeRequest(id)
  ElMessage.success('审批已通过')
  await loadRequests()
}

async function handleReject(id: number) {
  const { value: reason } = await ElMessageBox.prompt('请输入驳回原因（30 字以内）', '驳回数据变更', {
    inputPattern: /.+/,
    inputErrorMessage: '驳回原因不能为空',
    type: 'warning'
  })
  await rejectDataChangeRequest(id, reason as string)
  ElMessage.success('工单已驳回')
  await loadRequests()
}

async function handleExecute(id: number) {
  await ElMessageBox.confirm('执行后将修改业务数据，确认继续吗？', '执行数据变更', { type: 'warning' })
  await executeDataChangeRequest(id)
  ElMessage.success('数据变更已执行')
  await loadRequests()
}

async function handleRollback(id: number) {
  await ElMessageBox.confirm('回滚前会校验当前值仍等于执行后快照，确认继续吗？', '回滚数据变更', { type: 'warning' })
  await rollbackDataChangeRequest(id)
  ElMessage.success('回滚操作已提交')
  await loadRequests()
}

function canExecuteRow(row: DataChangeRequestItem) {
  return row.executionStatus === 'SUBMITTED' && row.approvalStatus !== 'PENDING' && row.approvalStatus !== 'REJECTED'
}

function openEntityDialog(entity?: DataWorkbenchEntityItem) {
  editingEntityId.value = entity?.id ?? null
  entityForm.entityCode = entity?.entityCode ?? ''
  entityForm.entityName = entity?.entityName ?? ''
  entityForm.description = entity?.description ?? ''
  entityForm.tableName = entity?.tableName ?? ''
  entityForm.primaryKeyColumn = entity?.primaryKeyColumn ?? 'id'
  entityForm.platformProjectId = entity?.platformProjectId ?? null
  entityForm.maxAffectedRows = entity?.maxAffectedRows ?? 1
  entityForm.requestScope = entity?.requestScope ?? 'PROJECT_PARTICIPANT'
  entityForm.executeScope = entity?.executeScope ?? 'OWNER_OR_CREATOR'
  entityForm.rollbackScope = entity?.rollbackScope ?? 'OWNER_OR_CREATOR'
  entityForm.enabled = entity?.enabled ?? true
  entityForm.fields = entity?.fields.map((field) => ({ ...field })) ?? []
  parseSourceType.value = 'DDL'
  parseInput.DDL = ''
  parseInput.JAVA = ''
  parseWarnings.value = []
  entityDialogVisible.value = true
  ensureProjectOptions()
}

async function ensureProjectOptions() {
  if (projectOptions.value.length) return
  try {
    projectOptions.value = await listProjectOptions()
  } catch (error) {
    projectOptions.value = []
  }
}

function addField() {
  entityForm.fields.push({
    fieldCode: '',
    fieldName: '',
    columnName: '',
    dataType: 'STRING',
    synonyms: '',
    updatable: false,
    locator: false,
    sensitive: false,
    enabled: true,
    sortOrder: entityForm.fields.length + 1
  })
}

/**
 * 从粘贴的 DDL / Java 实体类源码解析出草稿，并按“合并”策略回填当前实体表单：
 * - 顶层字段（entityCode / entityName / tableName / primaryKeyColumn / description）仅在当前为空时填入，避免覆盖用户已录入内容。
 * - maxAffectedRows 只在当前是默认值 1 时被替换。
 * - 数据权限范围三项不覆盖。
 * - 字段列表按 fieldCode 做合并：已存在的字段刷新其 fieldName / columnName / dataType / synonyms，
 *   保留原本的 updatable / locator / sensitive / enabled / sortOrder；不存在的字段追加到末尾。
 */
async function handleParseEntity() {
  const content = parseInput[parseSourceType.value]?.trim()
  if (!content) {
    ElMessage.warning('请先粘贴要解析的内容')
    return
  }
  parsing.value = true
  try {
    const result = await parseDataWorkbenchEntityDraft({ sourceType: parseSourceType.value, content })
    applyDraftToForm(result.draft)
    parseWarnings.value = result.warnings || []
    ElMessage.success(`已解析 ${result.draft.fields.length} 个字段`)
  } catch (error: any) {
    // 后端解析失败常见于 PG dump 特殊语法或未匹配 CREATE TABLE，直接把错误信息展示出来。
    const message = error?.response?.data?.message || error?.message || '解析失败，请检查输入内容格式'
    parseWarnings.value = [message]
    ElMessage.error(message)
  } finally {
    parsing.value = false
  }
}

function applyDraftToForm(draft: DataWorkbenchEntityDraft) {
  if (!entityForm.entityCode) entityForm.entityCode = draft.entityCode
  if (!entityForm.entityName) entityForm.entityName = draft.entityName
  if (!entityForm.tableName) entityForm.tableName = draft.tableName
  if (!entityForm.description) entityForm.description = draft.description
  if (draft.primaryKeyColumn && (!entityForm.primaryKeyColumn || entityForm.primaryKeyColumn === 'id')) {
    entityForm.primaryKeyColumn = draft.primaryKeyColumn
  }
  // platformProjectId 由管理员在弹窗里手动选择，解析器返回 null，此处不做回填。
  if (entityForm.maxAffectedRows === 1 && draft.maxAffectedRows) {
    entityForm.maxAffectedRows = draft.maxAffectedRows
  }
  const existingByCode = new Map(entityForm.fields.map((field) => [field.fieldCode, field]))
  const maxSort = entityForm.fields.reduce((acc, field) => Math.max(acc, field.sortOrder || 0), 0)
  let appendSort = maxSort
  for (const draftField of draft.fields) {
    const existing = existingByCode.get(draftField.fieldCode)
    if (existing) {
      existing.fieldName = draftField.fieldName || existing.fieldName
      existing.columnName = draftField.columnName || existing.columnName
      existing.dataType = draftField.dataType || existing.dataType
      existing.synonyms = draftField.synonyms || existing.synonyms
    } else {
      appendSort += 1
      entityForm.fields.push({
        fieldCode: draftField.fieldCode,
        fieldName: draftField.fieldName,
        columnName: draftField.columnName,
        dataType: draftField.dataType,
        synonyms: draftField.synonyms || '',
        updatable: draftField.updatable ?? false,
        locator: draftField.locator ?? false,
        sensitive: draftField.sensitive ?? false,
        enabled: draftField.enabled ?? true,
        sortOrder: appendSort
      })
    }
  }
}

async function handleSubmitEntity() {
  submitting.value = true
  try {
    if (editingEntityId.value) {
      await updateDataWorkbenchEntity(editingEntityId.value, entityForm)
    } else {
      await createDataWorkbenchEntity(entityForm)
    }
    ElMessage.success('实体配置已保存')
    entityDialogVisible.value = false
    await loadEntities()
  } finally {
    submitting.value = false
  }
}

async function handleDeleteEntity(id: number) {
  await ElMessageBox.confirm('删除实体配置后，对应 DataChange 将无法继续使用该实体，确认继续吗？', '删除实体', { type: 'warning' })
  await deleteDataWorkbenchEntity(id)
  ElMessage.success('实体配置已删除')
  await loadEntities()
}

async function handleSearch() {
  filterPopoverVisible.value = false
  pagination.page = 1
  await loadRequests()
}

async function handleResetFilters() {
  filters.keyword = ''
  filters.riskLevel = ''
  filters.approvalStatus = ''
  filters.executionStatus = ''
  pagination.page = 1
  await loadRequests()
}

async function handleSizeChange() {
  pagination.page = 1
  await loadRequests()
}

async function handlePrevPage() {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadRequests()
}

async function handleNextPage() {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadRequests()
}

function approvalLabel(value: string) {
  return ({ PENDING: '待审批', APPROVED: '已审批', REJECTED: '已驳回', NOT_REQUIRED: '免审批' } as Record<string, string>)[value] || value || '-'
}

function executionLabel(value: string) {
  return ({ SUBMITTED: '待执行', EXECUTING: '执行中', EXECUTED: '已执行', REJECTED: '已终止', FAILED: '执行失败' } as Record<string, string>)[value] || value || '-'
}

function riskLabel(value: string) {
  return ({ LOW: '低风险', MEDIUM: '中风险', HIGH: '高风险' } as Record<string, string>)[value] || value || '-'
}

function riskTone(value: string) {
  if (value === 'HIGH') return 'danger'
  if (value === 'MEDIUM') return 'warning'
  return 'success'
}

function statusTone(value: string) {
  if (['REJECTED', 'FAILED', 'CONFLICT'].includes(value)) return 'danger'
  if (['PENDING', 'SUBMITTED', 'EXECUTING'].includes(value)) return 'warning'
  if (['APPROVED', 'EXECUTED', 'NOT_REQUIRED'].includes(value)) return 'success'
  return 'neutral'
}

function scopeLabel(value: DataPermissionScopeValue) {
  return scopeOptions.find((item) => item.value === value)?.label || value
}

function latestTimestamp(row: DataChangeRequestItem) {
  return row.rolledBackAt || row.executedAt || row.approvedAt || row.createdAt || '-'
}

function userInitial(value?: string | null) {
  return (value || 'AI').trim().slice(0, 2).toUpperCase()
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return '{}'
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return String(value)
  }
}
</script>

<style scoped>
.data-workbench-page {
  gap: 16px;
}

/* Tab 切换：复用 Wiki 中心的 gitlab-tab 视觉规范。 */
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
  cursor: pointer;
}

.gitlab-tab-button.active {
  background: #fff;
  color: var(--app-primary);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

/* 工单列表列宽 */
.data-change-table .dw-col-main {
  min-width: 320px;
  width: 32%;
}

.data-change-table .dw-col-project {
  min-width: 160px;
}

.data-change-table .dw-col-status {
  min-width: 160px;
}

.data-change-table .dw-col-risk {
  width: 96px;
}

.data-change-table .dw-col-affected {
  width: 96px;
}

.data-change-table .dw-col-owner {
  min-width: 160px;
}

.data-change-table .dw-col-updated {
  min-width: 140px;
}

.data-change-table .dw-col-actions {
  width: 200px;
}

.data-workbench-title-icon {
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
}

.data-workbench-status-stack {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  justify-content: center;
}

.data-workbench-affected {
  font-size: 16px;
  font-weight: 800;
  font-family: var(--app-font-heading);
  color: var(--app-primary, #4f46e5);
}

.data-workbench-affected-unit {
  margin-left: 2px;
  font-size: 12px;
  color: var(--app-text-soft, #94a3b8);
}

.management-list-row-button.primary {
  color: #4f46e5;
}

.management-list-row-button.primary:hover {
  background: rgba(79, 70, 229, 0.12);
}

.management-list-row-button.success {
  color: #059669;
}

.management-list-row-button.success:hover {
  background: rgba(16, 185, 129, 0.12);
}

.management-list-row-button.warning {
  color: #d97706;
}

.management-list-row-button.warning:hover {
  background: rgba(245, 158, 11, 0.12);
}

/* 实体配置表格 */
.data-config-table .dw-col-main {
  min-width: 220px;
}

.data-config-table .dw-col-table {
  min-width: 220px;
}

.data-config-table .dw-col-fields {
  min-width: 220px;
}

.data-config-table .dw-col-scope {
  min-width: 200px;
}

.data-config-table code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.16);
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  color: var(--app-text, #0f172a);
}

.data-workbench-field-pill-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.data-workbench-scope-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
  color: var(--app-text-muted, #64748b);
}

.data-workbench-scope-row + .data-workbench-scope-row {
  border-top: 1px dashed var(--app-border, #e2e8f0);
}

.data-workbench-scope-row strong {
  color: var(--app-text, #0f172a);
  font-weight: 700;
  font-size: 13px;
}

/* 能力配置 */
.data-workbench-capability-shell {
  padding: 6px;
}

.data-workbench-capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  padding: 20px;
}

.data-workbench-capability {
  display: flex;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: var(--app-radius-xl, 16px);
  background: var(--app-surface-card, #ffffff);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.data-workbench-capability:hover {
  transform: translateY(-2px);
  box-shadow: var(--app-shadow-hover, 0 8px 22px rgba(15, 23, 42, 0.08));
  border-color: rgba(79, 70, 229, 0.35);
}

.data-workbench-capability.enabled {
  border-color: rgba(79, 70, 229, 0.35);
  background: linear-gradient(180deg, rgba(79, 70, 229, 0.04), transparent 60%);
}

.data-workbench-capability-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 20px;
  flex-shrink: 0;
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
}

.data-workbench-capability-icon.info {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
}

.data-workbench-capability-icon.warning {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.data-workbench-capability-icon.success {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.data-workbench-capability-body {
  flex: 1;
  min-width: 0;
}

.data-workbench-capability-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.data-workbench-capability-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--app-text, #0f172a);
  font-family: var(--app-font-heading);
}

.data-workbench-capability p {
  margin: 0 0 12px;
  color: var(--app-text-muted, #64748b);
  font-size: 13px;
  line-height: 1.6;
}

.data-workbench-capability-code {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  color: var(--app-text-soft, #94a3b8);
  font-size: 11px;
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  letter-spacing: 0.02em;
}

/* 语义查询治理采用并排工作流，突出“扫描完成后才能发布”的安全顺序。 */
.data-workbench-semantic-shell {
  padding: 22px;
}

.data-workbench-semantic-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.data-workbench-semantic-head h3 {
  margin: 0;
  font-size: 17px;
  color: var(--app-text, #0f172a);
}

.data-workbench-semantic-head p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--app-text-muted, #64748b);
}

.data-workbench-semantic-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 18px;
  padding: 5px;
  width: fit-content;
  border-radius: 10px;
  background: var(--app-surface-low, #f8fafc);
}

.data-workbench-semantic-nav button {
  border: 0;
  border-radius: 7px;
  padding: 7px 11px;
  background: transparent;
  color: var(--app-text-muted, #64748b);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.data-workbench-semantic-nav button.active {
  background: #fff;
  color: var(--app-primary, #4f46e5);
  box-shadow: 0 1px 4px rgba(15, 23, 42, .1);
}

.data-workbench-semantic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.data-workbench-semantic-grid.is-single-column {
  grid-template-columns: minmax(0, 1fr);
}

.data-workbench-semantic-error {
  margin-bottom: 16px;
}

.data-workbench-semantic-card {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: 14px;
  background: linear-gradient(160deg, rgba(79, 70, 229, 0.045), transparent 46%), var(--app-surface-card, #fff);
}

.data-workbench-semantic-card-head {
  margin-bottom: 14px;
}

.data-workbench-semantic-card-head strong,
.data-workbench-semantic-list-row strong {
  display: block;
  color: var(--app-text, #0f172a);
  font-size: 14px;
}

.data-workbench-semantic-card-head span,
.data-workbench-semantic-list-row span {
  display: block;
  margin-top: 4px;
  color: var(--app-text-soft, #94a3b8);
  font-size: 12px;
}

.data-workbench-semantic-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.data-workbench-semantic-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--app-surface-low, #f8fafc);
}

.data-workbench-schema-source { min-width: 0; flex: 1; }
.data-workbench-schema-list-toolbar { margin: 0 0 14px; padding: 0 0 14px; border-bottom: 1px solid var(--app-border, #e2e8f0); }
.data-workbench-schema-table { min-width: 860px; }
.data-workbench-schema-table .schema-col-schema { width: 150px; }
.data-workbench-schema-table .schema-col-name { min-width: 210px; width: 28%; }
.data-workbench-schema-table .schema-col-count { width: 110px; }
.data-workbench-schema-table .schema-col-columns { min-width: 380px; }
.data-workbench-schema-summary { display: -webkit-box; overflow: hidden; color: var(--app-text-muted, #64748b); font-family: var(--app-font-mono, monospace); font-size: 12px; line-height: 1.7; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.data-workbench-schema-tree { margin-top: 8px; }
.data-workbench-schema-tree details { margin-top: 5px; border-left: 2px solid rgba(79, 70, 229, .22); padding-left: 8px; }
.data-workbench-schema-tree summary { cursor: pointer; color: var(--app-text-muted, #64748b); font-family: var(--app-font-mono, monospace); font-size: 12px; }
.data-workbench-schema-tree em { margin-left: 5px; color: var(--app-text-soft, #94a3b8); font-family: inherit; font-style: normal; }
.data-workbench-schema-columns { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0 2px; }
.data-workbench-schema-columns code { font-size: 11px; }
.data-workbench-mapping-section { margin: 16px 0; padding-top: 12px; border-top: 1px dashed var(--app-border, #e2e8f0); }
.data-workbench-mapping-title { display: flex; align-items: center; justify-content: space-between; color: var(--app-text-muted, #64748b); font-size: 13px; font-weight: 700; }
.data-workbench-mapping-row { display: grid; grid-template-columns: 1.05fr 1fr 1fr .86fr .9fr auto auto; gap: 7px; align-items: center; margin-top: 8px; }
.data-workbench-mapping-row.compact { grid-template-columns: 1fr 1fr 1fr auto; }
.data-workbench-json-advanced { margin: 14px 0; color: var(--app-text-muted, #64748b); font-size: 12px; }
.data-workbench-json-advanced summary { cursor: pointer; margin-bottom: 8px; }

/* 审计详情弹窗 */
.data-workbench-detail-dialog :deep(.el-dialog__body) {
  padding-top: 12px;
}

.data-workbench-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.data-workbench-detail-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  padding: 16px;
  border-radius: var(--app-radius-lg, 12px);
  background: var(--app-surface-low, #f8fafc);
  border: 1px solid var(--app-border, #e2e8f0);
}

.data-workbench-detail-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.data-workbench-detail-meta-item span {
  color: var(--app-text-soft, #94a3b8);
}

.data-workbench-detail-meta-item strong {
  color: var(--app-text, #0f172a);
  font-size: 14px;
  font-weight: 700;
}

.data-workbench-detail-block h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--app-text, #0f172a);
}

.data-workbench-detail-block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.data-workbench-detail-block-head h4 {
  margin: 0;
}

.data-workbench-detail-block-head span {
  color: var(--app-text-soft, #94a3b8);
  font-size: 12px;
}

.data-workbench-detail-quote {
  padding: 12px 14px;
  border-radius: var(--app-radius-lg, 12px);
  background: var(--app-surface-low, #f8fafc);
  border: 1px solid var(--app-border, #e2e8f0);
  color: var(--app-text, #0f172a);
  font-size: 13px;
  line-height: 1.6;
}

.data-workbench-detail-quote.danger {
  border-color: rgba(220, 38, 38, 0.4);
  background: rgba(220, 38, 38, 0.06);
  color: #b91c1c;
}

.data-workbench-detail pre {
  margin: 0;
  padding: 14px;
  border-radius: var(--app-radius-lg, 12px);
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12.5px;
  line-height: 1.6;
  overflow: auto;
  max-height: 320px;
}

.data-workbench-detail-sql {
  background: #111827 !important;
  color: #a5b4fc !important;
}

.data-workbench-detail-risks {
  margin: 0;
  padding: 0 0 0 20px;
  color: var(--app-text-muted, #64748b);
  font-size: 13px;
  line-height: 1.7;
}

.data-workbench-audit-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.data-workbench-audit-card {
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: var(--app-radius-lg, 12px);
  padding: 14px 16px;
  background: var(--app-surface-card, #ffffff);
}

.data-workbench-audit-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.data-workbench-audit-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--app-text-soft, #94a3b8);
}

.data-workbench-audit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.data-workbench-audit-column {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.data-workbench-audit-label {
  align-self: flex-start;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.data-workbench-audit-label.before {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.data-workbench-audit-label.after {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.data-workbench-audit-conflict {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
  font-size: 12px;
}

/* 实体配置表单 */
.data-workbench-entity-dialog :deep(.el-dialog__body) {
  padding-top: 12px;
}

/* 解析区：突出粘贴入口，与下方表单区分。 */
.data-workbench-parse-section {
  border: 1px dashed rgba(79, 70, 229, 0.35);
  border-radius: var(--app-radius-lg, 12px);
  background: linear-gradient(180deg, rgba(79, 70, 229, 0.05), transparent 70%);
  padding: 16px 18px;
}

.data-workbench-parse-tabs :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.data-workbench-parse-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.data-workbench-parse-tabs :deep(.el-textarea__inner) {
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12.5px;
  line-height: 1.6;
}

.data-workbench-parse-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.data-workbench-parse-tip {
  color: var(--app-text-soft, #94a3b8);
  font-size: 12px;
}

.data-workbench-parse-warnings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.data-workbench-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
}

.data-workbench-form-grid .el-form-item {
  margin-bottom: 8px;
}

.data-workbench-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  color: var(--app-text-muted, #64748b);
  font-size: 13px;
  font-weight: 600;
}

.data-workbench-field-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.data-workbench-field-card {
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: var(--app-radius-lg, 12px);
  padding: 14px 16px;
  background: var(--app-surface-low, #f8fafc);
}

.data-workbench-field-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.data-workbench-field-index {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--app-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.data-workbench-field-name {
  flex: 1;
}

.data-workbench-field-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 16px;
}

.data-workbench-field-grid .el-form-item {
  margin-bottom: 0;
}

.data-workbench-field-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--app-border, #e2e8f0);
}

/* 响应式：中等屏幕以下卡片自适应；移动端表格转为横向滚动。 */
@media (max-width: 960px) {
  .data-workbench-form-grid,
  .data-workbench-field-grid {
    grid-template-columns: 1fr 1fr;
  }

  .data-workbench-audit-grid {
    grid-template-columns: 1fr;
  }

  .data-workbench-semantic-grid {
    grid-template-columns: 1fr;
  }
  .data-workbench-mapping-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .data-workbench-mapping-row.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .data-workbench-form-grid,
  .data-workbench-field-grid {
    grid-template-columns: 1fr;
  }

  .data-workbench-capability-grid {
    grid-template-columns: 1fr;
    padding: 12px;
  }

  .data-workbench-semantic-head {
    flex-direction: column;
  }
}
</style>
