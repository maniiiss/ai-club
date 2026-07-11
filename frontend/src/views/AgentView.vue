<template>
  <div class="atelier-list-page agent-page">
    <section class="atelier-toolbar">
      <div class="atelier-toolbar-main">
        <div class="atelier-search-shell">
          <el-icon class="atelier-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="atelier-search-input"
            type="text"
            placeholder="搜索智能体名称或能力..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="atelier-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="agentFilterPopoverVisible" trigger="click" placement="bottom-start" :width="360" popper-class="atelier-filter-popper">
          <template #reference>
            <button class="atelier-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="atelier-filter-panel atelier-compact-input">
            <div class="atelier-filter-field">
              <label>所属项目</label>
              <el-select v-model="filters.projectId" clearable placeholder="所属项目" style="width: 100%" :teleported="false">
                <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
            <div class="atelier-filter-field">
              <label>接入方式</label>
              <el-select v-model="filters.accessType" clearable placeholder="接入方式" style="width: 100%" :teleported="false">
                <el-option v-for="item in accessTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="atelier-filter-field">
              <label>状态</label>
              <el-select v-model="filters.status" clearable placeholder="状态" style="width: 100%" :teleported="false">
                <el-option v-for="item in statusOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </div>
            <div class="atelier-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="atelier-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
        <button v-if="isMobileViewport" class="atelier-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建智能体</span>
        </button>
      </div>
      <div v-if="!isMobileViewport" class="atelier-toolbar-side">
        <button class="atelier-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新建智能体</span>
        </button>
      </div>
    </section>

    <section class="atelier-table-shell agent-list-shell">
      <div class="atelier-table-scroll mobile-card-scroll" v-loading="loading">
        <template v-if="!isMobileViewport">
        <div v-if="agentList.length" class="atelier-data-list agent-list-table mobile-card-list">
          <div class="atelier-data-head agent-list-head">
            <div class="atelier-data-head-item agent-col-main">智能体</div>
            <div class="atelier-data-head-item agent-col-project">所属项目</div>
            <div class="atelier-data-head-item agent-col-access center">接入方式</div>
            <div class="atelier-data-head-item agent-col-runtime">运行时</div>
            <div class="atelier-data-head-item agent-col-category">类型</div>
            <div class="atelier-data-head-item agent-col-status center">状态</div>
            <div class="atelier-data-head-item agent-col-enabled center">启用</div>
            <div class="atelier-data-head-item agent-col-actions right">操作</div>
          </div>
          <div v-for="row in agentList" :key="row.id" class="atelier-data-row agent-list-row">
            <div class="atelier-data-cell agent-col-main" data-label="智能体">
              <button class="management-list-title-trigger" type="button" @click="openDetailDialog(row)">
                <div class="management-list-title-cell">
                  <span class="management-list-title-icon">
                    <el-icon><component :is="agentAccessIcon(row.accessType)" /></el-icon>
                  </span>
                  <div class="management-list-title-copy">
                    <div class="management-list-title">{{ row.name }}</div>
                    <div class="management-list-subtitle">{{ row.capability || '暂无能力描述' }}</div>
                  </div>
                </div>
              </button>
            </div>
            <div class="atelier-data-cell agent-col-project" data-label="所属项目">
              <button v-if="row.projectId && row.projectName" class="management-list-link" type="button" @click="goToProject(row.projectId)">
                {{ row.projectName }}
              </button>
              <span v-else class="management-list-empty">全局能力</span>
            </div>
            <div class="atelier-data-cell agent-col-access center" data-label="接入方式">
              <span class="management-list-pill info">{{ accessTypeLabel(row.accessType) }}</span>
            </div>
            <div class="atelier-data-cell agent-col-runtime" data-label="运行时">
              <span class="management-list-empty">{{ agentRuntimeLabel(row) }}</span>
            </div>
            <div class="atelier-data-cell agent-col-category" data-label="类型">
              <span class="management-list-empty">{{ row.type || '-' }}</span>
            </div>
            <div class="atelier-data-cell agent-col-status center" data-label="状态">
              <span class="management-list-pill" :class="agentStatusTone(row.status)">{{ row.status || '未知' }}</span>
            </div>
            <div class="atelier-data-cell agent-col-enabled center" data-label="启用">
              <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '停用' }}</span>
            </div>
            <div class="atelier-data-cell agent-col-actions right" data-label="操作">
              <div class="management-list-row-actions">
                <button class="management-list-row-button" type="button" title="测试智能体" @click="openTestDialog(row)">
                  <el-icon><Promotion /></el-icon>
                </button>
                <button class="management-list-row-button" type="button" title="编辑智能体" @click="openEditDialog(row)">
                  <el-icon><EditPen /></el-icon>
                </button>
                <button class="management-list-row-button danger" type="button" title="删除智能体" @click="handleDelete(row.id)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="atelier-empty-state">
          <el-empty description="当前筛选条件下暂无智能体" />
        </div>
        </template>
        <template v-else>
          <div v-if="agentList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in agentList" :key="row.id" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <button class="mobile-entity-header-trigger" type="button" @click="openDetailDialog(row)">
                    <span class="mobile-entity-icon">
                      <el-icon><component :is="agentAccessIcon(row.accessType)" /></el-icon>
                    </span>
                    <span class="mobile-entity-copy">
                      <span class="mobile-entity-title">{{ row.name }}</span>
                      <span class="mobile-entity-description">{{ row.capability || '暂无能力描述' }}</span>
                    </span>
                  </button>
                </header>

                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">项目</span>
                    <div class="mobile-entity-field-content">
                      <button v-if="row.projectId && row.projectName" class="management-list-link" type="button" @click="goToProject(row.projectId)">
                        {{ row.projectName }}
                      </button>
                      <span v-else class="mobile-entity-empty-text">全局能力</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">接入</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill info">{{ accessTypeLabel(row.accessType) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">运行时</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ agentRuntimeLabel(row) }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">类型</span>
                    <div class="mobile-entity-field-content">
                      <span class="mobile-entity-empty-text">{{ row.type || '-' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">状态</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="agentStatusTone(row.status)">{{ row.status || '未知' }}</span>
                    </div>
                  </div>
                  <div class="mobile-entity-field">
                    <span class="mobile-entity-field-label">启用</span>
                    <div class="mobile-entity-field-content">
                      <span class="management-list-pill" :class="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '停用' }}</span>
                    </div>
                  </div>
                </div>

                <footer class="mobile-entity-actions">
                  <button class="mobile-entity-action-button info" type="button" @click="openTestDialog(row)">
                    <el-icon><Promotion /></el-icon>
                    <span>测试</span>
                  </button>
                  <button class="mobile-entity-action-button" type="button" @click="openEditDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button class="mobile-entity-action-button danger" type="button" @click="handleDelete(row.id)">
                    <el-icon><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </footer>
              </article>
            </div>
          </div>
            <div v-if="hasMoreMobileItems" ref="sentinelRef" class="mobile-waterfall-sentinel"></div>
          <div v-if="!agentList.length" class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无智能体" />
          </div>
        </template>
      </div>

      <div v-if="showDesktopPagination" class="atelier-table-footer">
        <div class="atelier-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="atelier-footer-controls">
          <div class="atelier-page-size atelier-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
            </el-select>
          </div>
          <div class="atelier-page-nav">
            <button class="atelier-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="atelier-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="atelier-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <el-dialog
      v-if="!isMobileViewport"
      v-model="dialogVisible"
      :title="dialogTitle"
      width="960px"
      destroy-on-close
      class="platform-form-dialog agent-editor-dialog"
      align-center
    >
      <template #header>
        <div class="agent-dialog-header">
          <span class="agent-dialog-header-icon">
            <el-icon><component :is="agentAccessIcon(form.accessType)" /></el-icon>
          </span>
          <div class="agent-dialog-header-copy">
            <div class="agent-dialog-header-title">{{ dialogTitle }}</div>
            <p class="agent-dialog-header-subtitle">{{ dialogSubtitle }}</p>
          </div>
        </div>
      </template>

      <div class="agent-dialog-shell">
      <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout agent-dialog-form">
        <section class="platform-form-section agent-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基础信息</div>
            <div class="platform-form-section-subtitle">定义智能体的定位、归属和基础能力描述。</div>
          </div>
          <div class="form-grid two-columns">
            <el-form-item label="智能体名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入智能体名称" />
          </el-form-item>
          <el-form-item label="所属项目">
            <el-select v-model="form.projectId" clearable placeholder="为空表示全局智能体" style="width: 100%">
              <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="类型" prop="type">
            <el-select v-model="form.type" placeholder="请选择类型" style="width: 100%">
              <el-option v-for="item in typeOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
              <el-option v-for="item in statusOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="是否启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
          <el-form-item label="接入方式" prop="accessType" class="span-2">
            <el-radio-group v-model="form.accessType" class="access-type-group"
              :style="{ '--el-radio-button-text-color': 'var(--app-text-soft, #606266)', '--el-radio-button-checked-text-color': '#fff', '--el-radio-button-checked-bg-color': 'var(--el-color-primary)', '--el-radio-button-checked-border-color': 'var(--el-color-primary)' }">
              <el-radio-button v-for="item in accessTypeOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="能力描述" class="span-2">
            <el-input v-model="form.capability" placeholder="例如：任务拆解、代码建议、测试建议、项目协作" />
          </el-form-item>
          <el-form-item label="详细说明" class="span-2">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="补充说明智能体的职责范围、输入输出要求等" />
          </el-form-item>
          </div>
        </section>

        <section class="platform-form-section agent-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">接入配置</div>
            <div class="platform-form-section-subtitle">根据接入方式配置模型、运行时或 HTTP 接口参数。</div>
          </div>

          <template v-if="form.accessType === 'BUILT_IN'">
            <div class="form-grid two-columns">
            <el-form-item label="内置能力" prop="builtinCode">
              <el-select v-model="form.builtinCode" placeholder="请选择内置能力" style="width: 100%">
                <el-option v-for="item in builtinOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="模型配置" prop="aiModelConfigId">
              <el-select v-model="form.aiModelConfigId" placeholder="请选择模型配置" clearable style="width: 100%">
                <el-option
                  v-for="model in modelOptions"
                  :key="model.id"
                  :label="`${model.name} / ${model.provider} / ${model.modelName}`"
                  :value="model.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="系统提示词" class="span-2">
              <el-input v-model="form.systemPrompt" type="textarea" :rows="8" placeholder="可覆盖默认系统提示词" />
            </el-form-item>
            </div>
          </template>

          <template v-else-if="form.accessType === 'LLM_PROMPT'">
            <div class="form-grid two-columns">
            <el-form-item label="模型配置" prop="aiModelConfigId">
              <el-select v-model="form.aiModelConfigId" placeholder="请选择模型配置" clearable style="width: 100%">
                <el-option
                  v-for="model in modelOptions"
                  :key="model.id"
                  :label="`${model.name} / ${model.provider} / ${model.modelName}`"
                  :value="model.id"
                />
              </el-select>
            </el-form-item>
            <div />
            <el-form-item label="系统提示词" class="span-2">
              <el-input v-model="form.systemPrompt" type="textarea" :rows="5" placeholder="请输入系统提示词" />
            </el-form-item>
            <el-form-item label="用户提示词模板" class="span-2" prop="userPromptTemplate">
              <el-input
                v-model="form.userPromptTemplate"
                type="textarea"
                :rows="8"
                placeholder="支持 {{input}}、{{input_json}}、{{system_prompt}}、{{system_prompt_json}}"
              />
            </el-form-item>
            </div>
          </template>

          <template v-else-if="form.accessType === 'AGENT_RUNTIME'">
            <div class="form-grid two-columns">
            <el-form-item label="运行时类型" prop="runtimeType">
              <el-select v-model="form.runtimeType" placeholder="请选择运行时类型" style="width: 100%">
                <el-option v-for="item in runtimeTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="Gateway 地址" prop="endpointUrl">
              <el-input v-model="form.endpointUrl" placeholder="例如：http://127.0.0.1:8000（code-processing 服务地址）" />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="智能体标识" prop="runtimeAgentRef">
              <el-input
                v-model="form.runtimeAgentRef"
                :disabled="form.runtimeType !== 'OPENCLAW'"
                :placeholder="form.runtimeType === 'OPENCLAW' ? '例如：planner-agent' : 'CLI Runner 模式下无需填写'"
              />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="会话 Key 模板">
              <el-input v-model="form.runtimeSessionKeyTemplate" placeholder="例如：task:{{task_id}}:user:{{user_id}}" />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="认证方式">
              <el-select v-model="form.httpAuthType" style="width: 100%">
                <el-option label="无" value="NONE" />
                <el-option label="Bearer Token" value="BEARER" />
              </el-select>
            </el-form-item>
            <el-form-item label="超时时间(秒)">
              <el-input-number v-model="form.timeoutSeconds" :min="5" :max="300" style="width: 100%" />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="Bearer Token" class="span-2">
              <el-input v-model="form.httpAuthToken" type="password" show-password placeholder="编辑时留空则沿用已有 Token" />
            </el-form-item>
            <el-form-item label="系统提示词" class="span-2">
              <el-input v-model="form.systemPrompt" type="textarea" :rows="5" placeholder="运行时级系统提示词，可为空；CLI Runner 与 OpenClaw 都会复用" />
            </el-form-item>
            <el-form-item label="运行输入模板" class="span-2">
              <el-input
                v-model="form.userPromptTemplate"
                type="textarea"
                :rows="8"
                placeholder="支持 {{input}}、{{task_id}}、{{task_name}}、{{project_name}}、{{user_id}} 等变量；CLI Runner 会先渲染后再提交到 code-processing"
              />
            </el-form-item>
            </div>
          </template>

          <template v-else>
            <div class="form-grid two-columns">
            <el-form-item label="接口地址" prop="endpointUrl">
              <el-input v-model="form.endpointUrl" placeholder="例如：http://127.0.0.1:8000/agent/run" />
            </el-form-item>
            <el-form-item label="HTTP 方法">
              <el-select v-model="form.httpMethod" style="width: 100%">
                <el-option label="POST" value="POST" />
                <el-option label="PUT" value="PUT" />
                <el-option label="GET" value="GET" />
              </el-select>
            </el-form-item>
            <el-form-item label="认证方式">
              <el-select v-model="form.httpAuthType" style="width: 100%">
                <el-option label="无" value="NONE" />
                <el-option label="Bearer Token" value="BEARER" />
              </el-select>
            </el-form-item>
            <el-form-item label="超时时间(秒)">
              <el-input-number v-model="form.timeoutSeconds" :min="5" :max="300" style="width: 100%" />
            </el-form-item>
            <el-form-item label="Bearer Token" class="span-2">
              <el-input v-model="form.httpAuthToken" type="password" show-password placeholder="编辑时留空则沿用已有 Token" />
            </el-form-item>
            <el-form-item label="Headers(JSON)" class="span-2">
              <el-input v-model="form.httpHeaders" type="textarea" :rows="4" placeholder='例如：{"X-App":"agent-platform"}' />
            </el-form-item>
            <el-form-item label="请求模板" class="span-2">
              <el-input
                v-model="form.httpRequestTemplate"
                type="textarea"
                :rows="7"
                placeholder='默认发送 {"input":"..."}；也可自定义模板，支持 {{input}}、{{input_json}}'
              />
            </el-form-item>
            <el-form-item label="响应路径" class="span-2">
              <el-input v-model="form.httpResponsePath" placeholder="可选，例如 data.content 或 result.output" />
            </el-form-item>
            </div>
          </template>
        </section>
      </el-form>
      </div>
      <template #footer>
        <div class="agent-dialog-footer">
          <el-button @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!readonlyMode" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 移动端智能体编辑抽屉，表单较长使用全屏高度。 -->
    <MobileFormDrawer
      v-else
      v-model="dialogVisible"
      :title="dialogTitle"
      :subtitle="dialogSubtitle"
      :submit-text="'保存'"
      :submitting="submitting"
      :header-icon="agentAccessIcon(form.accessType)"
      :close-on-click-modal="true"
      size="100%"
      drawer-class="agent-editor-mobile-drawer"
      @submit="handleSubmit"
      @cancel="dialogVisible = false"
    >
      <div class="agent-dialog-shell">
      <el-form ref="formRef" :model="form" :rules="rules" :disabled="readonlyMode" label-position="top" class="platform-form-layout agent-dialog-form">
        <section class="platform-form-section agent-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基础信息</div>
            <div class="platform-form-section-subtitle">定义智能体的定位、归属和基础能力描述。</div>
          </div>
          <div class="form-grid two-columns">
            <el-form-item label="智能体名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入智能体名称" />
          </el-form-item>
          <el-form-item label="所属项目">
            <el-select v-model="form.projectId" clearable placeholder="为空表示全局智能体" style="width: 100%">
              <el-option v-for="item in projectOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="类型" prop="type">
            <el-select v-model="form.type" placeholder="请选择类型" style="width: 100%">
              <el-option v-for="item in typeOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
              <el-option v-for="item in statusOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="是否启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
          <el-form-item label="接入方式" prop="accessType" class="span-2">
            <el-radio-group v-model="form.accessType" class="access-type-group"
              :style="{ '--el-radio-button-text-color': 'var(--app-text-soft, #606266)', '--el-radio-button-checked-text-color': '#fff', '--el-radio-button-checked-bg-color': 'var(--el-color-primary)', '--el-radio-button-checked-border-color': 'var(--el-color-primary)' }">
              <el-radio-button v-for="item in accessTypeOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="能力描述" class="span-2">
            <el-input v-model="form.capability" placeholder="例如：任务拆解、代码建议、测试建议、项目协作" />
          </el-form-item>
          <el-form-item label="详细说明" class="span-2">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="补充说明智能体的职责范围、输入输出要求等" />
          </el-form-item>
          </div>
        </section>

        <section class="platform-form-section agent-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">接入配置</div>
            <div class="platform-form-section-subtitle">根据接入方式配置模型、运行时或 HTTP 接口参数。</div>
          </div>

          <template v-if="form.accessType === 'BUILT_IN'">
            <div class="form-grid two-columns">
            <el-form-item label="内置能力" prop="builtinCode">
              <el-select v-model="form.builtinCode" placeholder="请选择内置能力" style="width: 100%">
                <el-option v-for="item in builtinOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="模型配置" prop="aiModelConfigId">
              <el-select v-model="form.aiModelConfigId" placeholder="请选择模型配置" clearable style="width: 100%">
                <el-option
                  v-for="model in modelOptions"
                  :key="model.id"
                  :label="`${model.name} / ${model.provider} / ${model.modelName}`"
                  :value="model.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="系统提示词" class="span-2">
              <el-input v-model="form.systemPrompt" type="textarea" :rows="8" placeholder="可覆盖默认系统提示词" />
            </el-form-item>
            </div>
          </template>

          <template v-else-if="form.accessType === 'LLM_PROMPT'">
            <div class="form-grid two-columns">
            <el-form-item label="模型配置" prop="aiModelConfigId">
              <el-select v-model="form.aiModelConfigId" placeholder="请选择模型配置" clearable style="width: 100%">
                <el-option
                  v-for="model in modelOptions"
                  :key="model.id"
                  :label="`${model.name} / ${model.provider} / ${model.modelName}`"
                  :value="model.id"
                />
              </el-select>
            </el-form-item>
            <div />
            <el-form-item label="系统提示词" class="span-2">
              <el-input v-model="form.systemPrompt" type="textarea" :rows="5" placeholder="请输入系统提示词" />
            </el-form-item>
            <el-form-item label="用户提示词模板" class="span-2" prop="userPromptTemplate">
              <el-input
                v-model="form.userPromptTemplate"
                type="textarea"
                :rows="8"
                placeholder="支持 {{input}}、{{input_json}}、{{system_prompt}}、{{system_prompt_json}}"
              />
            </el-form-item>
            </div>
          </template>

          <template v-else-if="form.accessType === 'AGENT_RUNTIME'">
            <div class="form-grid two-columns">
            <el-form-item label="运行时类型" prop="runtimeType">
              <el-select v-model="form.runtimeType" placeholder="请选择运行时类型" style="width: 100%">
                <el-option v-for="item in runtimeTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="Gateway 地址" prop="endpointUrl">
              <el-input v-model="form.endpointUrl" placeholder="例如：http://127.0.0.1:8000（code-processing 服务地址）" />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="智能体标识" prop="runtimeAgentRef">
              <el-input
                v-model="form.runtimeAgentRef"
                :disabled="form.runtimeType !== 'OPENCLAW'"
                :placeholder="form.runtimeType === 'OPENCLAW' ? '例如：planner-agent' : 'CLI Runner 模式下无需填写'"
              />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="会话 Key 模板">
              <el-input v-model="form.runtimeSessionKeyTemplate" placeholder="例如：task:{{task_id}}:user:{{user_id}}" />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="认证方式">
              <el-select v-model="form.httpAuthType" style="width: 100%">
                <el-option label="无" value="NONE" />
                <el-option label="Bearer Token" value="BEARER" />
              </el-select>
            </el-form-item>
            <el-form-item label="超时时间(秒)">
              <el-input-number v-model="form.timeoutSeconds" :min="5" :max="300" style="width: 100%" />
            </el-form-item>
            <el-form-item v-if="isOpenclawRuntime" label="Bearer Token" class="span-2">
              <el-input v-model="form.httpAuthToken" type="password" show-password placeholder="编辑时留空则沿用已有 Token" />
            </el-form-item>
            <el-form-item label="系统提示词" class="span-2">
              <el-input v-model="form.systemPrompt" type="textarea" :rows="5" placeholder="运行时级系统提示词，可为空；CLI Runner 与 OpenClaw 都会复用" />
            </el-form-item>
            <el-form-item label="运行输入模板" class="span-2">
              <el-input
                v-model="form.userPromptTemplate"
                type="textarea"
                :rows="8"
                placeholder="支持 {{input}}、{{task_id}}、{{task_name}}、{{project_name}}、{{user_id}} 等变量；CLI Runner 会先渲染后再提交到 code-processing"
              />
            </el-form-item>
            </div>
          </template>

          <template v-else>
            <div class="form-grid two-columns">
            <el-form-item label="接口地址" prop="endpointUrl">
              <el-input v-model="form.endpointUrl" placeholder="例如：http://127.0.0.1:8000/agent/run" />
            </el-form-item>
            <el-form-item label="HTTP 方法">
              <el-select v-model="form.httpMethod" style="width: 100%">
                <el-option label="POST" value="POST" />
                <el-option label="PUT" value="PUT" />
                <el-option label="GET" value="GET" />
              </el-select>
            </el-form-item>
            <el-form-item label="认证方式">
              <el-select v-model="form.httpAuthType" style="width: 100%">
                <el-option label="无" value="NONE" />
                <el-option label="Bearer Token" value="BEARER" />
              </el-select>
            </el-form-item>
            <el-form-item label="超时时间(秒)">
              <el-input-number v-model="form.timeoutSeconds" :min="5" :max="300" style="width: 100%" />
            </el-form-item>
            <el-form-item label="Bearer Token" class="span-2">
              <el-input v-model="form.httpAuthToken" type="password" show-password placeholder="编辑时留空则沿用已有 Token" />
            </el-form-item>
            <el-form-item label="Headers(JSON)" class="span-2">
              <el-input v-model="form.httpHeaders" type="textarea" :rows="4" placeholder='例如：{"X-App":"agent-platform"}' />
            </el-form-item>
            <el-form-item label="请求模板" class="span-2">
              <el-input
                v-model="form.httpRequestTemplate"
                type="textarea"
                :rows="7"
                placeholder='默认发送 {"input":"..."}；也可自定义模板，支持 {{input}}、{{input_json}}'
              />
            </el-form-item>
            <el-form-item label="响应路径" class="span-2">
              <el-input v-model="form.httpResponsePath" placeholder="可选，例如 data.content 或 result.output" />
            </el-form-item>
            </div>
          </template>
        </section>
      </el-form>
      </div>
      <template #footer>
        <div class="agent-dialog-footer mobile-form-drawer-footer">
          <el-button class="mobile-form-drawer-footer-btn" @click="dialogVisible = false">{{ readonlyMode ? '关闭' : '取消' }}</el-button>
          <el-button v-if="!readonlyMode" class="mobile-form-drawer-footer-btn is-primary" type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </MobileFormDrawer>

      <el-dialog v-if="!isMobileViewport" v-model="testDialogVisible" title="测试智能体" width="760px" destroy-on-close>
      <div class="test-title">{{ currentTestAgent?.name || '-' }}</div>
      <el-input v-model="testInput" type="textarea" :rows="10" placeholder="请输入测试内容" />
      <template #footer>
        <el-button @click="testDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="testing" @click="handleTest">开始测试</el-button>
      </template>
      <el-alert
        v-if="testResult"
        :title="testResult.message"
        :type="testResult.success ? 'success' : 'error'"
        show-icon
        :closable="false"
        class="test-result-alert"
      />
      <el-descriptions v-if="testResult" :column="2" border class="test-meta">
        <el-descriptions-item label="智能体">{{ testResult.agentName }}</el-descriptions-item>
        <el-descriptions-item label="测试时间">{{ testResult.testedAt }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="testResult?.output" class="test-output">
        <div class="test-output-title">输出结果</div>
        <pre>{{ testResult.output }}</pre>
      </div>
    </el-dialog>

    <!-- 移动端测试智能体抽屉。 -->
    <MobileFormDrawer
      v-else
      v-model="testDialogVisible"
      title="测试智能体"
      :submit-text="'开始测试'"
      :submitting="testing"
      :header-icon="Promotion"
      :close-on-click-modal="true"
      size="88%"
      @submit="handleTest"
      @cancel="testDialogVisible = false"
    >
      <div class="test-title">{{ currentTestAgent?.name || '-' }}</div>
      <el-input v-model="testInput" type="textarea" :rows="10" placeholder="请输入测试内容" />
      <el-alert
        v-if="testResult"
        :title="testResult.message"
        :type="testResult.success ? 'success' : 'error'"
        show-icon
        :closable="false"
        class="test-result-alert"
      />
      <el-descriptions v-if="testResult" :column="2" border class="test-meta">
        <el-descriptions-item label="智能体">{{ testResult.agentName }}</el-descriptions-item>
        <el-descriptions-item label="测试时间">{{ testResult.testedAt }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="testResult?.output" class="test-output">
        <div class="test-output-title">输出结果</div>
        <pre>{{ testResult.output }}</pre>
      </div>
    </MobileFormDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Connection, Cpu, Delete, EditPen, Filter, Link, Plus, Promotion, RefreshRight, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { listModelConfigOptions } from '@/api/models'
import { createAgent, deleteAgent, listProjectOptions, pageAgents, testAgent, updateAgent } from '@/api/platform'
import type { AgentItem, AgentTestResult, AiModelConfigItem, ProjectItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'
import MobileFormDrawer from '@/components/MobileFormDrawer.vue'

interface AgentForm {
  name: string
  type: string
  status: string
  enabled: boolean
  accessType: 'BUILT_IN' | 'LLM_PROMPT' | 'HTTP_API' | 'AGENT_RUNTIME'
  builtinCode: 'CODE_REVIEW' | 'TEST_SUGGESTION' | 'REQUIREMENT_BREAKDOWN' | 'REPOSITORY_SCAN_PLAN' | 'REQUIREMENT_AI_STANDARDIZE' | 'REQUIREMENT_AI_BREAKDOWN' | 'REQUIREMENT_AI_TEST_CASES' | null
  capability: string
  description: string
  aiModelConfigId: number | null
  projectId: number | null
  systemPrompt: string
  userPromptTemplate: string
  endpointUrl: string
  runtimeType: 'OPENCLAW' | 'CODEX_CLI' | 'CLAUDE_CODE_CLI' | 'OPENCODE_CLI' | null
  runtimeAgentRef: string
  runtimeSessionKeyTemplate: string
  httpMethod: 'POST' | 'PUT' | 'GET'
  httpHeaders: string
  httpAuthType: 'NONE' | 'BEARER'
  httpAuthToken: string
  httpRequestTemplate: string
  httpResponsePath: string
  timeoutSeconds: number
}

const typeOptions = ['规划', '开发', '评审', '测试', '运维']
const statusOptions = ['在线', '空闲', '离线']
const accessTypeOptions = [
  { label: '内置智能体', value: 'BUILT_IN' },
  { label: '提示词智能体', value: 'LLM_PROMPT' },
  { label: 'HTTP API 接入', value: 'HTTP_API' },
  { label: '运行时接入', value: 'AGENT_RUNTIME' }
] as const
const builtinOptions = [
  { label: '代码审查智能体', value: 'CODE_REVIEW' },
  { label: '仓库扫描计划智能体', value: 'REPOSITORY_SCAN_PLAN' },
  { label: '标准化需求智能体', value: 'REQUIREMENT_AI_STANDARDIZE' },
  { label: '拆解子任务智能体', value: 'REQUIREMENT_AI_BREAKDOWN' },
  { label: '测试用例生成智能体', value: 'REQUIREMENT_AI_TEST_CASES' }
] as const
const runtimeTypeOptions = [
  { label: 'OpenClaw', value: 'OPENCLAW' },
  { label: 'Codex CLI Runner', value: 'CODEX_CLI' },
  { label: 'Claude Code CLI Runner', value: 'CLAUDE_CODE_CLI' },
  { label: 'OpenCode CLI Runner', value: 'OPENCODE_CLI' }
] as const

const loading = ref(false)
const submitting = ref(false)
const { isMobileViewport } = useMobileViewport()
const testing = ref(false)
const dialogVisible = ref(false)
const testDialogVisible = ref(false)
const isEditing = ref(false)
const readonlyMode = ref(false)
const currentId = ref<number | null>(null)
const agentList = ref<AgentItem[]>([])
const modelOptions = ref<AiModelConfigItem[]>([])
const projectOptions = ref<ProjectItem[]>([])
const currentTestAgent = ref<AgentItem | null>(null)
const testResult = ref<AgentTestResult | null>(null)
const testInput = ref('')
const formRef = ref<FormInstance>()

const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading,
  itemCount: computed(() => agentList.value.length),
  pagination,
  loadPage: async () => loadAgents()
})
const filters = reactive({
  keyword: '',
  status: '',
  type: '',
  accessType: undefined as AgentForm['accessType'] | undefined,
  projectId: undefined as number | undefined
})
const agentFilterPopoverVisible = ref(false)
const router = useRouter()

const defaultForm = (): AgentForm => ({
  name: '',
  type: '开发',
  status: '在线',
  enabled: true,
  accessType: 'BUILT_IN',
  builtinCode: 'CODE_REVIEW',
  capability: '',
  description: '',
  aiModelConfigId: null,
  projectId: null,
  systemPrompt: '',
  userPromptTemplate: '',
  endpointUrl: '',
  runtimeType: 'OPENCLAW',
  runtimeAgentRef: '',
  runtimeSessionKeyTemplate: '',
  httpMethod: 'POST',
  httpHeaders: '',
  httpAuthType: 'NONE',
  httpAuthToken: '',
  httpRequestTemplate: '',
  httpResponsePath: '',
  timeoutSeconds: 60
})

const form = reactive<AgentForm>(defaultForm())

const rules: FormRules<AgentForm> = {
  name: [{ required: true, message: '请输入智能体名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  accessType: [{ required: true, message: '请选择接入方式', trigger: 'change' }]
}

const accessTypeLabel = (value?: string | null) => accessTypeOptions.find(item => item.value === value)?.label || value || '-'
const runtimeTypeLabel = (value?: string | null) => runtimeTypeOptions.find(item => item.value === value)?.label || value || '-'
const agentAccessIcon = (accessType?: string | null) =>
  accessType === 'AGENT_RUNTIME' ? Connection : accessType === 'HTTP_API' ? Link : accessType === 'LLM_PROMPT' ? Cpu : Promotion
const isOpenclawRuntime = computed(() =>
  form.accessType === 'AGENT_RUNTIME' && form.runtimeType === 'OPENCLAW'
)

const agentStatusClass = (status?: string | null) =>
  status === '在线' ? 'is-online' : status === '空闲' ? 'is-idle' : 'is-offline'

const agentStatusTone = (status?: string | null) =>
  status === '在线' ? 'success' : status === '空闲' ? 'info' : 'danger'

const agentRuntimeLabel = (row: AgentItem) => {
  if (row.accessType === 'AGENT_RUNTIME') {
    if (row.runtimeType === 'OPENCLAW') {
      return `${runtimeTypeLabel(row.runtimeType)} / ${row.runtimeAgentRef || '-'}`
    }
    return runtimeTypeLabel(row.runtimeType)
  }
  if (row.accessType === 'HTTP_API') {
    return row.endpointUrl || '-'
  }
  return row.aiModelConfigName || '-'
}

const dialogTitle = computed(() => {
  if (readonlyMode.value) {
    return '查看智能体'
  }
  return isEditing.value ? '编辑智能体' : '新建智能体'
})

const dialogSubtitle = computed(() => {
  if (readonlyMode.value) {
    return `查看智能体基础信息与 ${accessTypeLabel(form.accessType)} 接入配置。`
  }
  if (isEditing.value) {
    return `调整智能体定位，并维护 ${accessTypeLabel(form.accessType)} 接入参数。`
  }
  return '填写智能体基础信息并完成接入配置。'
})

const resetForm = () => {
  Object.assign(form, defaultForm())
  currentId.value = null
  formRef.value?.clearValidate()
}

const loadOptions = async () => {
  const [models, projects] = await Promise.all([listModelConfigOptions(), listProjectOptions()])
  modelOptions.value = models
  projectOptions.value = projects
}

const loadAgents = async () => {
  loading.value = true
  try {
    const pageData = await pageAgents({
      page: requestPage.value,
      size: requestSize.value,
      keyword: filters.keyword,
      status: filters.status,
      type: filters.type,
      accessType: filters.accessType,
      projectId: filters.projectId
    })
    agentList.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  agentFilterPopoverVisible.value = false
  resetMobilePagination()
  await loadAgents()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.status = ''
  filters.type = ''
  filters.accessType = undefined
  filters.projectId = undefined
  resetMobilePagination()
  await loadAgents()
}

const handleSizeChange = async () => {
  resetMobilePagination()
  await loadAgents()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadAgents()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadAgents()
}

const openCreateDialog = () => {
  readonlyMode.value = false
  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const fillForm = (row: AgentItem) => {
  isEditing.value = true
  currentId.value = row.id
  Object.assign(form, {
    name: row.name,
    type: row.type,
    status: row.status,
    enabled: row.enabled,
    accessType: row.accessType,
    builtinCode: row.builtinCode,
    capability: row.capability,
    description: row.description,
    aiModelConfigId: row.aiModelConfigId,
    projectId: row.projectId,
    systemPrompt: row.systemPrompt || '',
    userPromptTemplate: row.userPromptTemplate || '',
    endpointUrl: row.endpointUrl || '',
    runtimeType: (row.runtimeType as AgentForm['runtimeType']) || 'OPENCLAW',
    runtimeAgentRef: row.runtimeAgentRef || '',
    runtimeSessionKeyTemplate: row.runtimeSessionKeyTemplate || '',
    httpMethod: (row.httpMethod as AgentForm['httpMethod'] | null) || 'POST',
    httpHeaders: row.httpHeaders || '',
    httpAuthType: (row.httpAuthType as AgentForm['httpAuthType'] | null) || 'NONE',
    httpAuthToken: '',
    httpRequestTemplate: row.httpRequestTemplate || '',
    httpResponsePath: row.httpResponsePath || '',
    timeoutSeconds: row.timeoutSeconds || 60
  })
}

const openDetailDialog = (row: AgentItem) => {
  readonlyMode.value = true
  fillForm(row)
  dialogVisible.value = true
}

const openEditDialog = (row: AgentItem) => {
  readonlyMode.value = false
  fillForm(row)
  dialogVisible.value = true
}

const goToProject = async (projectId: number) => {
  await router.push({ name: 'project-iterations', params: { projectId } })
}

const buildPayload = () => ({
  name: form.name,
  type: form.type,
  status: form.status,
  enabled: form.enabled,
  accessType: form.accessType,
  builtinCode: form.accessType === 'BUILT_IN' ? form.builtinCode : null,
  capability: form.capability,
  description: form.description,
  aiModelConfigId: form.accessType === 'BUILT_IN' || form.accessType === 'LLM_PROMPT' ? form.aiModelConfigId : null,
  projectId: form.projectId,
  systemPrompt: form.systemPrompt,
  userPromptTemplate: form.accessType === 'LLM_PROMPT' || form.accessType === 'AGENT_RUNTIME' ? form.userPromptTemplate : '',
  endpointUrl: form.accessType === 'HTTP_API' ? form.endpointUrl : isOpenclawRuntime.value ? form.endpointUrl : '',
  runtimeType: form.accessType === 'AGENT_RUNTIME' ? form.runtimeType : null,
  runtimeAgentRef: isOpenclawRuntime.value ? form.runtimeAgentRef : '',
  runtimeSessionKeyTemplate: isOpenclawRuntime.value ? form.runtimeSessionKeyTemplate : '',
  httpMethod: form.accessType === 'HTTP_API' ? form.httpMethod : '',
  httpHeaders: form.accessType === 'HTTP_API' ? form.httpHeaders : '',
  httpAuthType: form.accessType === 'HTTP_API' ? form.httpAuthType : isOpenclawRuntime.value ? form.httpAuthType : null,
  httpAuthToken: form.accessType === 'HTTP_API' ? form.httpAuthToken : isOpenclawRuntime.value ? form.httpAuthToken : '',
  httpRequestTemplate: form.accessType === 'HTTP_API' ? form.httpRequestTemplate : '',
  httpResponsePath: form.accessType === 'HTTP_API' ? form.httpResponsePath : '',
  timeoutSeconds: form.accessType === 'HTTP_API' || form.accessType === 'AGENT_RUNTIME' ? form.timeoutSeconds : 60
})

const validateBusinessRules = () => {
  if (form.accessType === 'BUILT_IN') {
    if (!form.builtinCode) {
      ElMessage.warning('请选择内置能力')
      return false
    }
    if (!form.aiModelConfigId) {
      ElMessage.warning('内置智能体需要绑定模型配置')
      return false
    }
  }
  if (form.accessType === 'LLM_PROMPT') {
    if (!form.aiModelConfigId) {
      ElMessage.warning('提示词智能体需要绑定模型配置')
      return false
    }
    if (!form.userPromptTemplate.trim()) {
      ElMessage.warning('请输入用户提示词模板')
      return false
    }
  }
  if (form.accessType === 'HTTP_API' && !form.endpointUrl.trim()) {
    ElMessage.warning('请输入 HTTP API 地址')
    return false
  }
  if (form.accessType === 'AGENT_RUNTIME') {
    if (!form.runtimeType) {
      ElMessage.warning('请选择 Runtime 类型')
      return false
    }
    if (isOpenclawRuntime.value && !form.endpointUrl.trim()) {
      ElMessage.warning('请输入 Gateway 地址')
      return false
    }
    if (isOpenclawRuntime.value && !form.runtimeAgentRef.trim()) {
      ElMessage.warning('请输入运行时智能体标识')
      return false
    }
  }
  return true
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !validateBusinessRules()) return

  submitting.value = true
  try {
    const payload = buildPayload()
    if (isEditing.value && currentId.value !== null) {
      await updateAgent(currentId.value, payload)
      ElMessage.success('智能体更新成功')
    } else {
      await createAgent(payload)
      ElMessage.success('智能体创建成功')
    }
    dialogVisible.value = false
    await loadAgents()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

const openTestDialog = (row: AgentItem) => {
  currentTestAgent.value = row
  testInput.value = ''
  testResult.value = null
  testDialogVisible.value = true
}

const handleTest = async () => {
  if (!currentTestAgent.value) return
  if (!testInput.value.trim()) {
    ElMessage.warning('请输入测试内容')
    return
  }
  testResult.value = null
  testing.value = true
  try {
    testResult.value = await testAgent(currentTestAgent.value.id, testInput.value)
  } catch (error: any) {
    testResult.value = null
    ElMessage.error(error?.response?.data?.message || '测试失败')
  } finally {
    testing.value = false
  }
}

const handleDelete = async (id: number) => {
  try {
    await ElMessageBox.confirm('删除智能体后，关联任务会变成未分配，是否继续？', '提示', { type: 'warning' })
    await deleteAgent(id)
    ElMessage.success('智能体删除成功')
    await loadAgents()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除失败')
    }
  }
}

onMounted(async () => {
  await loadOptions()
  await loadAgents()
})
</script>

<style scoped>
.agent-page {
  min-height: 100%;
  min-width: 0;
}

.atelier-list-page,
.atelier-table-shell,
.atelier-table-scroll,
.agent-list-shell {
  min-width: 0;
}

.agent-dialog-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-dialog-shell {
  width: 100%;
}

.agent-dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 28px;
}

.agent-dialog-header-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.18) 0%, rgba(var(--app-primary-rgb), 0.14) 100%);
  color: var(--app-primary);
  font-size: 20px;
}

.agent-dialog-header-copy {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
}

.agent-dialog-header-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.12;
}

.agent-dialog-header-subtitle {
  margin: 0;
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.65;
}

.agent-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.agent-form-section {
  padding: 16px 16px 2px;
}

.agent-filter-shell {
  padding: 16px 18px;
  border-radius: 24px;
  background: rgba(243, 244, 245, 0.72);
}

.agent-list-shell {
  width: 100%;
  min-height: 0;
}

.agent-list-table {
  width: 100%;
  min-width: 0;
}

.agent-list-head,
.agent-list-row {
  grid-template-columns:
    minmax(0, 2.5fr)
    minmax(0, 1fr)
    minmax(0, 1fr)
    minmax(0, 1.15fr)
    minmax(0, 1fr)
    minmax(0, 0.85fr)
    minmax(0, 0.85fr)
    minmax(0, 0.95fr);
}

.agent-col-main {
  min-width: 0;
}

.agent-col-project {
  min-width: 0;
}

.agent-col-access {
  min-width: 0;
}

.agent-col-runtime {
  min-width: 0;
}

.agent-col-category {
  min-width: 0;
}

.agent-col-status {
  min-width: 0;
}

.agent-col-enabled {
  min-width: 0;
}

.agent-col-actions {
  min-width: 0;
}

.agent-col-project .management-list-empty,
.agent-col-runtime .management-list-empty,
.agent-col-category .management-list-empty {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-col-project .management-list-link {
  color: var(--app-text);
}

.agent-col-project .management-list-link:hover {
  color: var(--app-primary);
}

@media (max-width: 1200px) and (min-width: 901px) {
  /* 该区间继续保持桌面列表语义，只做列宽和节奏压缩，避免出现“半表格半卡片”的中间态。 */
  .agent-list-head {
    display: grid !important;
  }

  .agent-list-head,
  .agent-list-row {
    grid-template-columns:
      minmax(0, 2.2fr)
      minmax(0, 0.95fr)
      minmax(0, 0.86fr)
      minmax(0, 1fr)
      minmax(0, 0.82fr)
      minmax(0, 0.72fr)
      minmax(0, 0.72fr)
      minmax(0, 0.82fr);
    gap: 10px;
    padding: 10px 12px;
  }

  .agent-list-row .management-list-title-cell {
    gap: 10px;
  }

  .agent-list-row .management-list-title-icon {
    width: 24px;
    height: 24px;
  }

  .agent-list-row .management-list-title {
    font-size: 13px;
  }

  .agent-list-row .management-list-subtitle,
  .agent-list-row .management-list-empty,
  .agent-list-row .management-list-text,
  .agent-list-row .management-list-link,
  .agent-list-row .management-list-updated {
    font-size: 11px;
  }

  .agent-list-row .management-list-pill {
    min-height: 20px;
    padding: 0 8px;
  }

  .agent-list-row .management-list-row-actions {
    gap: 4px;
  }

  .agent-list-row .management-list-row-button {
    width: 26px;
    height: 26px;
  }
}

.filter-form {
  margin-bottom: 18px;
}

.agent-grid-wrap {
  flex: 1 1 auto;
  min-height: 320px;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.agent-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.96);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.agent-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 32px rgba(25, 28, 29, 0.08);
}

.agent-card-top,
.agent-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.agent-card-icon {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  font-size: 22px;
}

.agent-card-icon.primary {
  color: var(--app-primary);
  background: rgba(255, 220, 195, 0.88);
}

.agent-card-icon.success {
  color: var(--app-info);
  background: rgba(211, 235, 248, 0.88);
}

.agent-card-icon.warning {
  color: var(--app-warning);
  background: rgba(255, 225, 194, 0.88);
}

.agent-card-icon.danger {
  color: var(--app-danger);
  background: rgba(255, 218, 214, 0.88);
}

.agent-card-status {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.agent-card-status.is-online {
  background: rgba(216, 240, 212, 0.88);
  color: var(--app-success);
}

.agent-card-status.is-idle {
  background: rgba(211, 235, 248, 0.88);
  color: var(--app-info);
}

.agent-card-status.is-offline {
  background: rgba(255, 218, 214, 0.88);
  color: var(--app-danger);
}

.agent-card-copy h3 {
  margin: 0;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 28px;
  line-height: 1.08;
  font-weight: 800;
}

.agent-card-copy p {
  margin: 6px 0 0;
  color: var(--app-text-soft);
  font-size: 13px;
}

.agent-card-bars {
  height: 56px;
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.agent-card-bar {
  flex: 1 1 0;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, rgba(255, 183, 125, 0.5) 0%, var(--app-primary-container) 100%);
}

.agent-card-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.agent-card-meta-item span {
  display: block;
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.agent-card-meta-item strong {
  display: block;
  margin-top: 6px;
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.65;
}

.agent-card-capability {
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.75;
}

.agent-card-sync {
  color: var(--app-text-muted);
  font-size: 12px;
}

.agent-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.form-grid {
  display: grid;
  gap: 12px 16px;
}

.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.span-2 {
  grid-column: 1 / -1;
}

:deep(.access-type-group) {
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
}

:deep(.access-type-group .el-radio-button) {
  flex: 1 1 0;
}

:deep(.access-type-group .el-radio-button__inner) {
  width: 100%;
  white-space: nowrap;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none !important;
}

:deep(.access-type-group .el-radio-button.is-active .el-radio-button__inner) {
  color: var(--app-text) !important;
  background-color: rgba(var(--app-primary-container-rgb), 0.3) !important;
  border-color: #e4e7ed !important;
  box-shadow: none !important;
}

:deep(.el-dialog.agent-editor-dialog) {
  --platform-dialog-max-height: min(75vh, calc(100vh - 48px));
  max-height: var(--platform-dialog-max-height);
}

:deep(.agent-editor-dialog .el-dialog__header) {
  padding-bottom: 10px;
}

:deep(.agent-editor-dialog .el-dialog__body) {
  padding-top: 10px;
  padding-bottom: 18px;
}

:deep(.agent-editor-dialog .el-dialog__footer) {
  padding-top: 10px;
  padding-bottom: 18px;
}

:deep(.agent-editor-dialog .form-grid > .el-form-item) {
  margin-bottom: 0;
}

:deep(.agent-editor-dialog .el-input__inner),
:deep(.agent-editor-dialog .el-textarea__inner),
:deep(.agent-editor-dialog .el-select__selected-item),
:deep(.agent-editor-dialog .el-select__input),
:deep(.agent-editor-dialog .el-select__tags-text),
:deep(.agent-editor-dialog .el-radio-button__inner) {
  color: var(--app-text) !important;
}

:deep(.agent-editor-dialog .el-input.is-disabled .el-input__inner),
:deep(.agent-editor-dialog .el-textarea.is-disabled .el-textarea__inner),
:deep(.agent-editor-dialog .el-select.is-disabled .el-select__selected-item),
:deep(.agent-editor-dialog .el-radio-button.is-disabled .el-radio-button__inner) {
  color: var(--app-text) !important;
  -webkit-text-fill-color: var(--app-text) !important;
}

:deep(.agent-editor-dialog .el-select__placeholder),
:deep(.agent-editor-dialog .el-input__placeholder),
:deep(.agent-editor-dialog .el-textarea__inner::placeholder) {
  color: #9aa6b2 !important;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.test-title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
}

.test-result-alert,
.test-meta,
.test-output {
  margin-top: 16px;
}

.test-output-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.test-output pre {
  max-height: 360px;
  overflow: auto;
  padding: 14px;
  margin: 0;
  color: #f2f5f7;
  background: #1f2528;
  border-radius: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 900px) {
  .agent-grid {
    grid-template-columns: 1fr;
  }

  .agent-dialog-footer {
    width: 100%;
  }

  .agent-form-section {
    padding: 16px 14px 2px;
  }

  .two-columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .agent-dialog-header {
    gap: 10px;
    padding-right: 22px;
  }

  .agent-dialog-header-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    font-size: 18px;
  }

  .agent-dialog-header-title {
    font-size: 21px;
  }

  .agent-card-meta {
    grid-template-columns: 1fr;
  }
}
</style>
