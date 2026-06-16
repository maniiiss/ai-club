<template>
  <div class="atelier-list-page benchmark-page">
    <!-- 顶部工具栏：tab 切换 + 搜索 + 新建 -->
    <section class="atelier-toolbar">
      <div class="atelier-toolbar-main">
        <div v-if="props.modelValue !== undefined" class="model-tab-switcher" role="tablist" aria-label="模型管理页面切换">
          <button class="model-tab-button" :class="{ active: props.modelValue === 'configs' }" type="button" @click="emit('update:modelValue', 'configs')">模型配置</button>
          <button class="model-tab-button" :class="{ active: props.modelValue === 'benchmark' }" type="button" @click="emit('update:modelValue', 'benchmark')">对比测试</button>
        </div>
        <span v-if="props.modelValue !== undefined" class="atelier-toolbar-divider" aria-hidden="true"></span>
        <div class="atelier-search-shell">
          <el-icon class="atelier-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="atelier-search-input"
            type="text"
            placeholder="搜索对比测试配置..."
            @keyup.enter="handleSearch"
          />
        </div>
        <button class="atelier-toolbar-button" type="button" @click="handleSearch">
          <el-icon><Search /></el-icon>
          查询
        </button>
        <button class="atelier-toolbar-button" type="button" @click="resetFilters">
          <el-icon><RefreshRight /></el-icon>
          重置
        </button>
        <button v-if="isMobileViewport" class="atelier-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新建配置
        </button>
      </div>
      <div v-if="!isMobileViewport" class="atelier-toolbar-side">
        <button class="atelier-create-button" type="button" @click="openCreateDialog" :disabled="!canBenchmark">
          <el-icon><Plus /></el-icon>
          新建对比测试配置
        </button>
      </div>
    </section>

    <!-- 桌面端：配置列表 -->
    <section v-if="!isMobileViewport" class="atelier-table-shell">
      <div class="atelier-table-scroll" v-loading="loading">
        <div class="atelier-data-list benchmark-list-table">
          <div class="atelier-data-head benchmark-list-head">
            <div class="atelier-data-head-item benchmark-col-name">名称</div>
            <div class="atelier-data-head-item benchmark-col-status center">最近状态</div>
            <div class="atelier-data-head-item benchmark-col-progress">最近进度</div>
            <div class="atelier-data-head-item benchmark-col-concurrency center">并发</div>
            <div class="atelier-data-head-item benchmark-col-total center">总请求</div>
            <div class="atelier-data-head-item benchmark-col-model center">模型数</div>
            <div class="atelier-data-head-item benchmark-col-runs center">运行次数</div>
            <div class="atelier-data-head-item benchmark-col-creator">创建人</div>
            <div class="atelier-data-head-item benchmark-col-time">更新时间</div>
            <div class="atelier-data-head-item benchmark-col-actions right">操作</div>
          </div>
          <div v-for="row in list" :key="row.id" class="atelier-data-row benchmark-list-row">
            <div class="atelier-data-cell benchmark-col-name" data-label="名称">
              <button class="management-list-title-trigger" type="button" @click="openDetail(row.id)">
                <div class="management-list-title-cell">
                  <span class="management-list-title-icon"><el-icon><DataAnalysis /></el-icon></span>
                  <div class="management-list-title-copy">
                    <div class="management-list-title">{{ row.name }}</div>
                    <div class="management-list-subtitle">{{ row.streamEnabled ? '流式' : '非流式' }} · max_tokens {{ row.maxTokens }}</div>
                  </div>
                </div>
              </button>
            </div>
            <div class="atelier-data-cell benchmark-col-status center" data-label="最近状态">
              <span v-if="row.latestRun" class="management-list-pill" :class="statusPillClass(row.latestRun.status)">{{ statusLabel(row.latestRun.status) }}</span>
              <span v-else class="management-list-text muted">未运行</span>
            </div>
            <div class="atelier-data-cell benchmark-col-progress" data-label="最近进度">
              <el-progress
                v-if="row.latestRun"
                :percentage="progressPercent(row.latestRun)"
                :status="progressStatus(row.latestRun.status)"
                :stroke-width="8"
                :show-text="true"
              />
              <span v-else class="management-list-text muted">—</span>
            </div>
            <div class="atelier-data-cell benchmark-col-concurrency center" data-label="并发">
              <span class="management-list-text">{{ row.concurrency }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-total center" data-label="总请求">
              <span class="management-list-text">{{ row.totalRequests }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-model center" data-label="模型数">
              <span class="management-list-text">{{ row.modelCount }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-runs center" data-label="运行次数">
              <span class="management-list-text">{{ row.runCount }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-creator" data-label="创建人">
              <span class="management-list-text">{{ row.createdByName || '-' }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-time" data-label="更新时间">
              <span class="management-list-text">{{ formatTime(row.updatedAt) }}</span>
            </div>
            <div class="atelier-data-cell benchmark-col-actions right" data-label="操作">
              <div class="management-list-row-actions">
                <button
                  v-if="isActive(row.latestRun?.status)"
                  class="management-list-row-button warning"
                  type="button"
                  title="取消最近一次运行"
                  :disabled="!canBenchmark"
                  @click="handleCancel(row)"
                >
                  <el-icon><CircleClose /></el-icon>
                </button>
                <button
                  v-else
                  class="management-list-row-button"
                  type="button"
                  title="立即运行"
                  :disabled="!canBenchmark"
                  @click="handleRun(row)"
                >
                  <el-icon><VideoPlay /></el-icon>
                </button>
                <button
                  class="management-list-row-button"
                  type="button"
                  title="编辑配置"
                  :disabled="!canBenchmark"
                  @click="openEditDialog(row)"
                >
                  <el-icon><EditPen /></el-icon>
                </button>
                <button class="management-list-row-button" type="button" title="详情" @click="openDetail(row.id)">
                  <el-icon><View /></el-icon>
                </button>
                <button
                  class="management-list-row-button danger"
                  type="button"
                  title="删除配置（含全部历史运行）"
                  :disabled="!canBenchmark || isActive(row.latestRun?.status)"
                  @click="handleDelete(row)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>
          <div v-if="!list.length && !loading" class="benchmark-empty-row">暂无对比测试配置</div>
        </div>
      </div>

      <div class="atelier-table-footer">
        <div class="atelier-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="atelier-footer-controls">
          <div class="atelier-page-size atelier-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="5" label="5" />
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

    <!-- 移动端：卡片列表 -->
    <section v-else class="atelier-mobile-list" v-loading="loading">
      <div v-for="row in list" :key="row.id" class="benchmark-card">
        <div class="benchmark-card-head">
          <span class="benchmark-card-title">{{ row.name }}</span>
          <el-tag v-if="row.latestRun" :type="statusTagType(row.latestRun.status)" size="small">{{ statusLabel(row.latestRun.status) }}</el-tag>
          <el-tag v-else type="info" size="small">未运行</el-tag>
        </div>
        <div v-if="row.latestRun" class="benchmark-card-progress">
          <el-progress
            :percentage="progressPercent(row.latestRun)"
            :status="progressStatus(row.latestRun.status)"
            :stroke-width="8"
          />
        </div>
        <div class="benchmark-card-meta">
          <span>并发 {{ row.concurrency }}</span>
          <span>·</span>
          <span>请求 {{ row.totalRequests }}</span>
          <span>·</span>
          <span>模型 {{ row.modelCount }}</span>
          <span>·</span>
          <span>运行 {{ row.runCount }}</span>
        </div>
        <div class="benchmark-card-footer">
          <span class="benchmark-card-time">{{ formatTime(row.updatedAt) }}</span>
          <div class="benchmark-card-actions">
            <el-button text type="primary" size="small" @click="openDetail(row.id)">详情</el-button>
            <el-button
              v-if="isActive(row.latestRun?.status)"
              text
              type="warning"
              size="small"
              :disabled="!canBenchmark"
              @click="handleCancel(row)"
            >取消</el-button>
            <el-button
              v-else
              text
              type="primary"
              size="small"
              :disabled="!canBenchmark"
              @click="handleRun(row)"
            >运行</el-button>
            <el-button text size="small" :disabled="!canBenchmark" @click="openEditDialog(row)">编辑</el-button>
            <el-button
              text
              type="danger"
              size="small"
              :disabled="!canBenchmark || isActive(row.latestRun?.status)"
              @click="handleDelete(row)"
            >删除</el-button>
          </div>
        </div>
      </div>
      <div v-if="list.length === 0 && !loading" class="benchmark-empty">暂无对比测试配置</div>
    </section>

    <!-- 创建 / 编辑配置对话框（共用） -->
    <el-dialog
      v-model="editorVisible"
      :width="isMobileViewport ? '92%' : '720px'"
      :title="editorMode === 'edit' ? '编辑对比测试配置' : '新建对比测试配置'"
      align-center
      class="platform-form-dialog"
      @closed="resetEditorForm"
    >
      <el-form ref="editorFormRef" :model="editorForm" :rules="editorRules" label-width="110px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="editorForm.name" placeholder="可留空，自动生成" maxlength="160" show-word-limit />
        </el-form-item>
        <el-form-item label="参与模型" prop="modelIds">
          <el-select
            v-model="editorForm.modelIds"
            multiple
            filterable
            placeholder="选择 1~8 个 CHAT 模型"
            style="width: 100%"
          >
            <el-option
              v-for="item in chatModelOptions"
              :key="item.id"
              :label="`${item.name} (${item.modelName})`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="并发数" prop="concurrency">
          <el-input-number v-model="editorForm.concurrency" :min="1" :max="64" />
          <span class="form-help">建议 ≤ 16，避免触发模型限流。</span>
        </el-form-item>
        <el-form-item label="总请求数" prop="totalRequests">
          <el-input-number v-model="editorForm.totalRequests" :min="1" :max="500" />
          <span class="form-help">每个模型都会执行这么多次。</span>
        </el-form-item>
        <el-form-item label="流式调用">
          <el-switch v-model="editorForm.streamEnabled" />
          <span class="form-help">开启后才能准确测量"首 token 耗时"（TTFT）。</span>
        </el-form-item>
        <el-form-item label="max_tokens">
          <el-input-number v-model="editorForm.maxTokens" :min="16" :max="8192" :step="64" />
        </el-form-item>
        <el-form-item label="System Prompt">
          <el-input
            v-model="editorForm.systemPrompt"
            type="textarea"
            :rows="2"
            :placeholder="defaultSystemPrompt"
          />
        </el-form-item>
        <el-form-item label="User Prompt">
          <el-input
            v-model="editorForm.userPrompt"
            type="textarea"
            :rows="4"
            :placeholder="defaultUserPrompt"
          />
          <div class="form-default-template">
            <button type="button" class="form-default-template-btn" @click="useDefaultPrompts">
              使用默认模板
            </button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleEditorSubmit">
          {{ editorMode === 'edit' ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉：配置摘要 + Tabs（运行记录 / 指标对比） -->
    <el-drawer
      v-model="drawerVisible"
      :size="isMobileViewport ? '100%' : '880px'"
      :title="drawerConfig?.name || '对比测试配置详情'"
      destroy-on-close
      @closed="onDrawerClosed"
    >
      <template v-if="drawerConfig">
        <div class="benchmark-detail">
          <!-- 顶部：配置摘要 + 操作 -->
          <div class="benchmark-detail-summary-bar">
            <div class="benchmark-detail-summary-text">
              <span class="benchmark-detail-summary-label">{{ drawerConfig.runCount }} 次运行历史</span>
              <span v-if="drawerConfig.hasActiveRun" class="benchmark-detail-summary-active">· 当前有运行进行中</span>
            </div>
            <div class="benchmark-detail-summary-actions">
              <el-button
                v-if="drawerConfig.hasActiveRun"
                type="warning"
                size="small"
                :disabled="!canBenchmark"
                @click="handleDrawerCancel"
              >取消运行</el-button>
              <el-button
                v-else
                type="primary"
                size="small"
                :disabled="!canBenchmark"
                @click="handleDrawerRun"
              >立即运行</el-button>
              <el-button size="small" :disabled="!canBenchmark || drawerConfig.hasActiveRun" @click="openEditDialogFromDrawer">
                编辑配置
              </el-button>
            </div>
          </div>

          <div class="benchmark-detail-config">
            <div><span>并发</span><b>{{ drawerConfig.concurrency }}</b></div>
            <div><span>总请求</span><b>{{ drawerConfig.totalRequests }}</b></div>
            <div><span>流式</span><b>{{ drawerConfig.streamEnabled ? '开启' : '关闭' }}</b></div>
            <div><span>max_tokens</span><b>{{ drawerConfig.maxTokens }}</b></div>
            <div><span>模型数</span><b>{{ drawerConfig.modelIds.length }}</b></div>
            <div><span>创建人</span><b>{{ drawerConfig.createdByName || '-' }}</b></div>
            <div><span>更新时间</span><b>{{ formatTime(drawerConfig.updatedAt) }}</b></div>
          </div>

          <details class="benchmark-detail-prompt">
            <summary>Prompt 配置</summary>
            <p><strong>System：</strong>{{ drawerConfig.systemPrompt || '（空）' }}</p>
            <p><strong>User：</strong>{{ drawerConfig.userPrompt || '（空）' }}</p>
          </details>

          <!-- 用自定义 Tab 头：避开 el-tabs 在某些场景下的 v-model 同步抖动，
               同时让"查看指标"切 Tab、用户点 Tab 头切回都用同一条同步路径。 -->
          <div class="benchmark-detail-tabs">
            <div class="benchmark-tabs-nav" role="tablist">
              <button
                type="button"
                class="benchmark-tab-button"
                :class="{ active: drawerTab === 'runs' }"
                role="tab"
                :aria-selected="drawerTab === 'runs'"
                @click="drawerTab = 'runs'"
              >
                运行记录
                <span v-if="runsPagination.total" class="benchmark-tab-badge">{{ runsPagination.total }}</span>
              </button>
              <button
                type="button"
                class="benchmark-tab-button"
                :class="{ active: drawerTab === 'metrics' }"
                role="tab"
                :aria-selected="drawerTab === 'metrics'"
                @click="drawerTab = 'metrics'"
              >
                指标对比
              </button>
            </div>

            <!-- Tab 1: 运行记录 -->
            <div v-show="drawerTab === 'runs'" class="benchmark-tab-panel">
              <div class="benchmark-runs-toolbar">
                <span class="benchmark-runs-toolbar-text">共 {{ runsPagination.total }} 次</span>
                <button class="atelier-toolbar-button" type="button" @click="loadDrawerRuns">
                  <el-icon><RefreshRight /></el-icon>
                  刷新
                </button>
              </div>
              <div v-if="!runs.length && !runsLoading" class="benchmark-empty">该配置暂未运行，点击右上角"立即运行"开始</div>
              <div v-else class="atelier-data-list benchmark-runs-list" v-loading="runsLoading">
                <div class="atelier-data-head benchmark-runs-head">
                  <div class="atelier-data-head-item runs-col-time">创建时间</div>
                  <div class="atelier-data-head-item runs-col-status center">状态</div>
                  <div class="atelier-data-head-item runs-col-progress">进度</div>
                  <div class="atelier-data-head-item runs-col-duration right">耗时</div>
                  <div class="atelier-data-head-item runs-col-actions right">操作</div>
                </div>
                <div
                  v-for="row in runs"
                  :key="row.id"
                  class="atelier-data-row benchmark-runs-row"
                  :class="{ 'benchmark-runs-row-active': selectedRunDetail?.id === row.id }"
                >
                  <div class="atelier-data-cell runs-col-time" data-label="创建时间">
                    <span class="management-list-text">{{ formatTime(row.createdAt) }}</span>
                  </div>
                  <div class="atelier-data-cell runs-col-status center" data-label="状态">
                    <span class="management-list-pill" :class="statusPillClass(row.status)">{{ statusLabel(row.status) }}</span>
                  </div>
                  <div class="atelier-data-cell runs-col-progress" data-label="进度">
                    <el-progress
                      :percentage="progressPercent(row)"
                      :status="progressStatus(row.status)"
                      :stroke-width="6"
                    />
                  </div>
                  <div class="atelier-data-cell runs-col-duration right" data-label="耗时">
                    <span class="metric-num">{{ formatDuration(row) }}</span>
                  </div>
                  <div class="atelier-data-cell runs-col-actions right" data-label="操作">
                    <div class="management-list-row-actions">
                      <button
                        class="management-list-row-button"
                        type="button"
                        title="查看指标"
                        @click.stop="selectRunForMetrics(row)"
                      >
                        <el-icon><DataLine /></el-icon>
                      </button>
                      <button
                        class="management-list-row-button danger"
                        type="button"
                        title="删除该次运行"
                        :disabled="!canBenchmark || row.status === 'RUNNING'"
                        @click.stop="handleDeleteRun(row)"
                      >
                        <el-icon><Delete /></el-icon>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="runsPagination.total > runsPagination.size" class="atelier-page-nav benchmark-runs-pager">
                <button class="atelier-page-button" type="button" :disabled="runsPagination.page <= 1" @click="changeRunsPage(runsPagination.page - 1)">
                  <el-icon><ArrowLeft /></el-icon>
                </button>
                <span class="atelier-page-text">第 {{ runsPagination.page }} / {{ runsTotalPages }} 页</span>
                <button class="atelier-page-button" type="button" :disabled="runsPagination.page >= runsTotalPages" @click="changeRunsPage(runsPagination.page + 1)">
                  <el-icon><ArrowRight /></el-icon>
                </button>
              </div>
            </div>

            <!-- Tab 2: 指标对比 -->
            <div v-show="drawerTab === 'metrics'" class="benchmark-tab-panel">
              <div v-if="!selectedRunDetail" class="benchmark-empty">
                <span v-if="drawerConfig.runCount === 0">该配置暂未运行</span>
                <span v-else>请在"运行记录"中选择一次运行查看指标</span>
              </div>
              <template v-else>
                <div class="benchmark-metric-current">
                  <span>当前查看：</span>
                  <b>{{ selectedRunDetail.name }}</b>
                  <span>·</span>
                  <span>{{ formatTime(selectedRunDetail.createdAt) }}</span>
                  <span>·</span>
                  <el-tag :type="statusTagType(selectedRunDetail.status)" size="small">{{ statusLabel(selectedRunDetail.status) }}</el-tag>
                </div>
                <div v-if="selectedRunDetail.errorMessage" class="benchmark-detail-error">
                  <el-icon><Warning /></el-icon>
                  {{ selectedRunDetail.errorMessage }}
                </div>
                <div v-if="!isMobileViewport" class="benchmark-metric-table">
                  <el-table
                    :data="selectedRunDetail.metrics"
                    stripe
                    size="small"
                    border
                    style="width: 100%"
                    :row-class-name="metricRowClass"
                  >
                    <el-table-column label="模型" width="220" fixed="left" show-overflow-tooltip>
                      <template #default="{ row }">
                        <div class="metric-model-cell">
                          <span class="metric-model-icon"><el-icon><DataAnalysis /></el-icon></span>
                          <div class="metric-model-copy">
                            <span class="metric-model-name">{{ row.modelName }}</span>
                            <span class="metric-model-sub">{{ row.provider || '-' }} · {{ row.modelRealName || '-' }}</span>
                          </div>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column label="状态" width="92" align="center">
                      <template #default="{ row }">
                        <span class="management-list-pill" :class="metricStatusPill(row.status)">{{ metricStatusLabel(row.status) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="失败率" width="100" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="failureRateClass(row.failureRate)">{{ formatPercent(row.failureRate) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="平均输出" width="108" align="right">
                      <template #default="{ row }">
                        <span class="metric-num">
                          {{ formatNumber(row.avgOutputTokens, 1) }}
                          <span v-if="row.tokenEstimated" class="metric-estimated-badge" title="按文本长度估算">估</span>
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column label="首 token" width="100" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="bestClass('avgTtftMs', row, 'min')">{{ formatMs(row.avgTtftMs) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="平均耗时" width="100" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="bestClass('avgLatencyMs', row, 'min')">{{ formatMs(row.avgLatencyMs) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="P50" width="90" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="bestClass('p50LatencyMs', row, 'min')">{{ formatMs(row.p50LatencyMs) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="P95" width="90" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="bestClass('p95LatencyMs', row, 'min')">{{ formatMs(row.p95LatencyMs) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="总 Token/s" width="108" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="bestClass('totalTokenPerSec', row, 'max')">{{ formatNumber(row.totalTokenPerSec, 2) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="生成 Token/s" width="120" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="bestClass('genTokenPerSec', row, 'max')">{{ formatNumber(row.genTokenPerSec, 2) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="吞吐(QPS)" width="108" align="right">
                      <template #default="{ row }">
                        <span class="metric-num" :class="bestClass('throughput', row, 'max')">{{ formatNumber(row.throughput, 2) }}</span>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
                <div v-else class="benchmark-metric-mobile">
                  <div v-for="metric in selectedRunDetail.metrics" :key="metric.id" class="benchmark-metric-card">
                    <div class="benchmark-metric-card-head">
                      <span class="benchmark-metric-card-title">{{ metric.modelName }}</span>
                      <el-tag :type="metricStatusTagType(metric.status)" size="small">{{ metricStatusLabel(metric.status) }}</el-tag>
                    </div>
                    <div class="benchmark-metric-card-grid">
                      <div><span>失败率</span><b>{{ formatPercent(metric.failureRate) }}</b></div>
                      <div><span>平均输出</span><b>{{ formatNumber(metric.avgOutputTokens, 1) }}</b></div>
                      <div><span>首 token</span><b>{{ formatMs(metric.avgTtftMs) }}</b></div>
                      <div><span>平均耗时</span><b>{{ formatMs(metric.avgLatencyMs) }}</b></div>
                      <div><span>P50</span><b>{{ formatMs(metric.p50LatencyMs) }}</b></div>
                      <div><span>P95</span><b>{{ formatMs(metric.p95LatencyMs) }}</b></div>
                      <div><span>总 Token/s</span><b>{{ formatNumber(metric.totalTokenPerSec, 2) }}</b></div>
                      <div><span>生成 Token/s</span><b>{{ formatNumber(metric.genTokenPerSec, 2) }}</b></div>
                      <div><span>吞吐</span><b>{{ formatNumber(metric.throughput, 2) }}</b></div>
                    </div>
                    <div v-if="metric.sampleError" class="benchmark-metric-card-error">{{ metric.sampleError }}</div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, CircleClose, DataAnalysis, DataLine, Delete, EditPen, Plus, RefreshRight, Search, VideoPlay, View, Warning } from '@element-plus/icons-vue'
import {
  cancelBenchmark,
  deleteBenchmark,
  getBenchmarkDetail
} from '@/api/modelBenchmark'
import {
  createBenchmarkConfig,
  deleteBenchmarkConfig,
  getBenchmarkConfigDetail,
  pageBenchmarkConfigRuns,
  pageBenchmarkConfigs,
  triggerBenchmarkConfigRun,
  updateBenchmarkConfig
} from '@/api/modelBenchmarkConfig'
import type { ModelBenchmarkConfigPayload } from '@/api/modelBenchmarkConfig'
import { listModelConfigOptions } from '@/api/models'
import type {
  AiModelConfigItem,
  ModelBenchmarkConfigDetail,
  ModelBenchmarkConfigSummary,
  ModelBenchmarkMetricStatus,
  ModelBenchmarkRunDetail,
  ModelBenchmarkRunStatus,
  ModelBenchmarkRunSummary
} from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  modelValue?: 'configs' | 'benchmark'
}>()
const emit = defineEmits<{
  'update:modelValue': [value: 'configs' | 'benchmark']
}>()

const defaultSystemPrompt = 'You are a concise technical writer.'
const defaultUserPrompt =
  '请用中文写一段约 200 字的产品介绍，介绍一款叫做"AI 工程平台"的协作工具，需包含核心能力、目标人群与使用场景。请直接给出正文，不要列项目编号。'

const authStore = useAuthStore()
const canBenchmark = computed(() => authStore.hasPermission('model:benchmark'))

const { isMobileViewport } = useMobileViewport()

// ============ 列表 ============
const loading = ref(false)
const list = ref<ModelBenchmarkConfigSummary[]>([])
const pagination = reactive({ page: 1, size: 10, total: 0 })
const filters = reactive({ keyword: '' })

const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))

// ============ 编辑器 Dialog ============
const editorVisible = ref(false)
const submitting = ref(false)
const editorMode = ref<'create' | 'edit'>('create')
const editorTargetId = ref<number | null>(null)
const editorFormRef = ref<FormInstance>()
const editorForm = reactive<ModelBenchmarkConfigPayload>({
  name: '',
  modelIds: [],
  concurrency: 4,
  totalRequests: 20,
  streamEnabled: true,
  maxTokens: 512,
  systemPrompt: '',
  userPrompt: ''
})
const editorRules: FormRules = {
  modelIds: [{ required: true, message: '请选择至少一个模型', trigger: 'change' }],
  concurrency: [{ required: true, message: '请输入并发数', trigger: 'blur' }],
  totalRequests: [{ required: true, message: '请输入总请求数', trigger: 'blur' }]
}
const chatModelOptions = ref<AiModelConfigItem[]>([])

// ============ 抽屉 ============
const drawerVisible = ref(false)
const drawerConfig = ref<ModelBenchmarkConfigDetail | null>(null)
const drawerTab = ref<'runs' | 'metrics'>('runs')
const runs = ref<ModelBenchmarkRunSummary[]>([])
const runsLoading = ref(false)
const runsPagination = reactive({ page: 1, size: 10, total: 0 })
const runsTotalPages = computed(() => Math.max(1, Math.ceil(runsPagination.total / runsPagination.size) || 1))
const selectedRunDetail = ref<ModelBenchmarkRunDetail | null>(null)

let listPollingTimer: ReturnType<typeof setInterval> | null = null
let drawerPollingTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await Promise.all([loadData(), loadChatModelOptions()])
})

onBeforeUnmount(() => {
  stopListPolling()
  stopDrawerPolling()
})

// ============ 列表逻辑 ============

async function loadData() {
  loading.value = true
  try {
    const result = await pageBenchmarkConfigs({
      page: pagination.page,
      size: pagination.size,
      keyword: filters.keyword || undefined
    })
    list.value = result.records
    pagination.total = result.total
    maybeStartListPolling()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '加载对比测试配置失败')
  } finally {
    loading.value = false
  }
}

async function loadChatModelOptions() {
  try {
    chatModelOptions.value = await listModelConfigOptions('CHAT')
  } catch {
    chatModelOptions.value = []
  }
}

function handleSearch() {
  pagination.page = 1
  void loadData()
}

function resetFilters() {
  filters.keyword = ''
  pagination.page = 1
  void loadData()
}

function handlePrevPage() {
  if (pagination.page > 1) {
    pagination.page -= 1
    void loadData()
  }
}

function handleNextPage() {
  if (pagination.page < totalPages.value) {
    pagination.page += 1
    void loadData()
  }
}

function handleSizeChange(size: number) {
  pagination.size = size
  pagination.page = 1
  void loadData()
}

function maybeStartListPolling() {
  // 当前页内任意 latestRun 仍在 PENDING/RUNNING 时定时刷新
  const hasActive = list.value.some(item => isActive(item.latestRun?.status))
  if (hasActive) {
    if (!listPollingTimer) {
      listPollingTimer = setInterval(() => {
        void loadData()
      }, 1500)
    }
  } else {
    stopListPolling()
  }
}

function stopListPolling() {
  if (listPollingTimer) {
    clearInterval(listPollingTimer)
    listPollingTimer = null
  }
}

// ============ 编辑器 Dialog ============

function openCreateDialog() {
  editorMode.value = 'create'
  editorTargetId.value = null
  resetEditorForm()
  editorVisible.value = true
}

function openEditDialog(row: ModelBenchmarkConfigSummary) {
  editorMode.value = 'edit'
  editorTargetId.value = row.id
  editorForm.name = row.name
  editorForm.modelIds = [...row.modelIds]
  editorForm.concurrency = row.concurrency
  editorForm.totalRequests = row.totalRequests
  editorForm.streamEnabled = row.streamEnabled
  editorForm.maxTokens = row.maxTokens
  // 静态列表里没有 prompt；按需求拉一次详情，避免编辑时把 prompt 抹空
  void getBenchmarkConfigDetail(row.id).then(detail => {
    editorForm.systemPrompt = detail.systemPrompt
    editorForm.userPrompt = detail.userPrompt
  }).catch(() => {
    // 失败时退回空，让用户重新输入
    editorForm.systemPrompt = ''
    editorForm.userPrompt = ''
  })
  editorVisible.value = true
}

function openEditDialogFromDrawer() {
  if (!drawerConfig.value) return
  editorMode.value = 'edit'
  editorTargetId.value = drawerConfig.value.id
  editorForm.name = drawerConfig.value.name
  editorForm.modelIds = [...drawerConfig.value.modelIds]
  editorForm.concurrency = drawerConfig.value.concurrency
  editorForm.totalRequests = drawerConfig.value.totalRequests
  editorForm.streamEnabled = drawerConfig.value.streamEnabled
  editorForm.maxTokens = drawerConfig.value.maxTokens
  editorForm.systemPrompt = drawerConfig.value.systemPrompt
  editorForm.userPrompt = drawerConfig.value.userPrompt
  editorVisible.value = true
}

function resetEditorForm() {
  editorForm.name = ''
  editorForm.modelIds = []
  editorForm.concurrency = 4
  editorForm.totalRequests = 20
  editorForm.streamEnabled = true
  editorForm.maxTokens = 512
  editorForm.systemPrompt = ''
  editorForm.userPrompt = ''
  editorFormRef.value?.clearValidate()
}

function useDefaultPrompts() {
  editorForm.systemPrompt = defaultSystemPrompt
  editorForm.userPrompt = defaultUserPrompt
}

async function handleEditorSubmit() {
  if (!editorFormRef.value) return
  const valid = await editorFormRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload: ModelBenchmarkConfigPayload = {
      ...editorForm,
      name: editorForm.name?.trim() || undefined,
      systemPrompt: editorForm.systemPrompt?.trim() || undefined,
      userPrompt: editorForm.userPrompt?.trim() || undefined
    }
    if (editorMode.value === 'edit' && editorTargetId.value) {
      await updateBenchmarkConfig(editorTargetId.value, payload)
      ElMessage.success('配置已更新')
    } else {
      await createBenchmarkConfig(payload)
      ElMessage.success('配置已创建')
    }
    editorVisible.value = false
    await loadData()
    if (drawerVisible.value && drawerConfig.value && editorTargetId.value === drawerConfig.value.id) {
      await refreshDrawerConfig()
    }
  } catch (error: unknown) {
    // 后端 409 表示存在 active run；http 拦截器会包成错误抛出，message 已带提示
    ElMessage.error((error as Error)?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

// ============ 行内操作 ============

function isActive(status: ModelBenchmarkRunStatus | null | undefined) {
  return status === 'PENDING' || status === 'RUNNING'
}

async function handleRun(row: ModelBenchmarkConfigSummary) {
  try {
    await triggerBenchmarkConfigRun(row.id)
    ElMessage.success('已开始运行')
    await loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '运行失败')
  }
}

async function handleCancel(row: ModelBenchmarkConfigSummary) {
  if (!row.latestRun) return
  await ElMessageBox.confirm(`确认取消"${row.name}"当前的运行？已发出的请求仍会计入指标。`, '取消运行', {
    type: 'warning'
  }).catch(() => 'cancel')
  try {
    await cancelBenchmark(row.latestRun.id)
    ElMessage.success('已请求取消')
    void loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '取消失败')
  }
}

async function handleDelete(row: ModelBenchmarkConfigSummary) {
  await ElMessageBox.confirm(
    `删除该配置将同时删除其全部 ${row.runCount} 次运行记录与指标数据，操作不可恢复。是否继续？`,
    '删除对比测试配置',
    { type: 'warning' }
  ).catch(() => 'cancel')
  try {
    await deleteBenchmarkConfig(row.id)
    ElMessage.success('已删除')
    void loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '删除失败')
  }
}

// ============ 抽屉逻辑 ============

async function openDetail(id: number) {
  try {
    const detail = await getBenchmarkConfigDetail(id)
    drawerConfig.value = detail
    drawerTab.value = 'runs'
    drawerVisible.value = true
    await loadDrawerRuns()
    // 默认选中"最近一次成功 run"，否则最近任意 run
    await pickDefaultRunForMetrics()
    maybeStartDrawerPolling()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '加载详情失败')
  }
}

async function refreshDrawerConfig() {
  if (!drawerConfig.value) return
  try {
    drawerConfig.value = await getBenchmarkConfigDetail(drawerConfig.value.id)
    maybeStartDrawerPolling()
  } catch {
    // 静默忽略瞬时错误
  }
}

async function loadDrawerRuns() {
  if (!drawerConfig.value) return
  runsLoading.value = true
  try {
    const result = await pageBenchmarkConfigRuns(drawerConfig.value.id, runsPagination.page, runsPagination.size)
    runs.value = result.records
    runsPagination.total = result.total
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '加载运行记录失败')
  } finally {
    runsLoading.value = false
  }
}

async function changeRunsPage(page: number) {
  if (page < 1 || page > runsTotalPages.value) return
  runsPagination.page = page
  await loadDrawerRuns()
}

async function selectRunForMetrics(run: ModelBenchmarkRunSummary) {
  // 先立刻切到指标 Tab，避免 await 期间用户再点别的 Tab 被强制拉回
  drawerTab.value = 'metrics'
  try {
    selectedRunDetail.value = await getBenchmarkDetail(run.id)
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '加载指标失败')
  }
}

async function pickDefaultRunForMetrics() {
  if (!runs.value.length) {
    selectedRunDetail.value = null
    return
  }
  const successRun = runs.value.find(r => r.status === 'SUCCESS')
  const target = successRun ?? runs.value[0]
  if (target) {
    try {
      selectedRunDetail.value = await getBenchmarkDetail(target.id)
    } catch {
      selectedRunDetail.value = null
    }
  }
}

async function handleDrawerRun() {
  if (!drawerConfig.value) return
  try {
    await triggerBenchmarkConfigRun(drawerConfig.value.id)
    ElMessage.success('已开始运行')
    await refreshDrawerConfig()
    runsPagination.page = 1
    await loadDrawerRuns()
    void loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '运行失败')
  }
}

async function handleDrawerCancel() {
  if (!drawerConfig.value || !drawerConfig.value.activeRunId) return
  try {
    await cancelBenchmark(drawerConfig.value.activeRunId)
    ElMessage.success('已请求取消')
    await refreshDrawerConfig()
    await loadDrawerRuns()
    void loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '取消失败')
  }
}

async function handleDeleteRun(run: ModelBenchmarkRunSummary) {
  await ElMessageBox.confirm(`删除该次运行记录及其指标？`, '删除运行记录', {
    type: 'warning'
  }).catch(() => 'cancel')
  try {
    await deleteBenchmark(run.id)
    ElMessage.success('已删除')
    if (selectedRunDetail.value?.id === run.id) {
      selectedRunDetail.value = null
    }
    await refreshDrawerConfig()
    await loadDrawerRuns()
    void loadData()
  } catch (error: unknown) {
    ElMessage.error((error as Error)?.message || '删除失败')
  }
}

function maybeStartDrawerPolling() {
  if (drawerConfig.value?.hasActiveRun) {
    if (!drawerPollingTimer) {
      drawerPollingTimer = setInterval(async () => {
        if (!drawerVisible.value) {
          stopDrawerPolling()
          return
        }
        await refreshDrawerConfig()
        await loadDrawerRuns()
        // 若当前查看的是 active run，同步其指标
        if (selectedRunDetail.value && selectedRunDetail.value.id === drawerConfig.value?.activeRunId) {
          try {
            selectedRunDetail.value = await getBenchmarkDetail(selectedRunDetail.value.id)
          } catch {
            // 忽略瞬时错误
          }
        }
        if (!drawerConfig.value?.hasActiveRun) {
          stopDrawerPolling()
          void loadData()
        }
      }, 1500)
    }
  } else {
    stopDrawerPolling()
  }
}

function stopDrawerPolling() {
  if (drawerPollingTimer) {
    clearInterval(drawerPollingTimer)
    drawerPollingTimer = null
  }
}

function onDrawerClosed() {
  stopDrawerPolling()
  selectedRunDetail.value = null
  runs.value = []
  runsPagination.page = 1
  runsPagination.total = 0
}

// ============ 显示工具 ============

const statusOptions: Array<{ label: string; value: ModelBenchmarkRunStatus }> = [
  { label: '待开始', value: 'PENDING' },
  { label: '运行中', value: 'RUNNING' },
  { label: '已完成', value: 'SUCCESS' },
  { label: '失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELED' }
]

function statusLabel(status: ModelBenchmarkRunStatus) {
  return statusOptions.find(item => item.value === status)?.label || status
}

function statusPillClass(status: ModelBenchmarkRunStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'CANCELED':
      return 'neutral'
    case 'RUNNING':
      return 'warning'
    default:
      return 'info'
  }
}

function statusTagType(status: ModelBenchmarkRunStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'CANCELED':
      return 'info'
    case 'RUNNING':
      return 'warning'
    default:
      return ''
  }
}

function progressStatus(status: ModelBenchmarkRunStatus) {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'exception'
  return undefined
}

function progressPercent(row: { progressDone: number; progressTotal: number }) {
  if (!row.progressTotal) return 0
  return Math.min(100, Math.round((row.progressDone / row.progressTotal) * 100))
}

function metricStatusLabel(status: ModelBenchmarkMetricStatus) {
  switch (status) {
    case 'PENDING':
      return '待开始'
    case 'RUNNING':
      return '运行中'
    case 'SUCCESS':
      return '已完成'
    case 'FAILED':
      return '失败'
    case 'SKIPPED':
      return '已跳过'
    default:
      return status
  }
}

function metricStatusTagType(status: ModelBenchmarkMetricStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'SKIPPED':
      return 'info'
    case 'RUNNING':
      return 'warning'
    default:
      return ''
  }
}

function metricRowClass({ row }: { row: { failureRate: number } }) {
  return row.failureRate > 0.5 ? 'benchmark-row-warn' : ''
}

function metricStatusPill(status: ModelBenchmarkMetricStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'SKIPPED':
      return 'neutral'
    case 'RUNNING':
      return 'warning'
    default:
      return 'info'
  }
}

function failureRateClass(rate: number | null | undefined) {
  if (rate == null) return ''
  if (rate <= 0.05) return 'metric-num-good'
  if (rate <= 0.2) return 'metric-num-warn'
  return 'metric-num-bad'
}

function bestClass(field: keyof import('@/types/platform').ModelBenchmarkMetricView, row: any, dir: 'min' | 'max') {
  const metrics = selectedRunDetail.value?.metrics
  if (!metrics || metrics.length < 2) return ''
  const candidates = metrics.filter(m => (m.successCount ?? 0) > 0 && typeof (m as any)[field] === 'number')
  if (candidates.length === 0) return ''
  const values = candidates.map(m => (m as any)[field] as number)
  const target = dir === 'min' ? Math.min(...values) : Math.max(...values)
  if ((row as any)[field] === target && (row.successCount ?? 0) > 0) {
    return 'metric-num-best'
  }
  return ''
}

function formatTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value == null) return '-'
  return value.toFixed(fractionDigits)
}

function formatMs(value: number | null | undefined) {
  if (value == null) return '-'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${value.toFixed(0)} ms`
}

/** 计算 run 的总耗时：finishedAt - createdAt；运行中 / 无结束时间显示 - */
function formatDuration(run: ModelBenchmarkRunSummary) {
  if (!run.finishedAt) return '-'
  const start = new Date(run.createdAt).getTime()
  const end = new Date(run.finishedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '-'
  return formatMs(end - start)
}
</script>

<style scoped>
/* ── 列表列宽（与模型配置同款 atelier 风格） ── */
.benchmark-list-table {
  width: 100%;
  min-width: 0;
}

.benchmark-list-head,
.benchmark-list-row {
  display: grid;
  grid-template-columns:
    minmax(0, 2.4fr)
    minmax(96px, 0.7fr)
    minmax(160px, 1.6fr)
    minmax(64px, 0.4fr)
    minmax(72px, 0.45fr)
    minmax(72px, 0.45fr)
    minmax(80px, 0.5fr)
    minmax(96px, 0.7fr)
    minmax(140px, 1fr)
    minmax(160px, 1fr);
}

.benchmark-col-name,
.benchmark-col-status,
.benchmark-col-progress,
.benchmark-col-concurrency,
.benchmark-col-total,
.benchmark-col-model,
.benchmark-col-runs,
.benchmark-col-creator,
.benchmark-col-time,
.benchmark-col-actions {
  min-width: 0;
}

.benchmark-empty-row {
  text-align: center;
  color: #9ca3af;
  padding: 36px 0;
}

@media (max-width: 1280px) and (min-width: 901px) {
  .benchmark-list-head,
  .benchmark-list-row {
    grid-template-columns:
      minmax(0, 2fr)
      minmax(80px, 0.6fr)
      minmax(140px, 1.2fr)
      minmax(56px, 0.4fr)
      minmax(64px, 0.4fr)
      minmax(64px, 0.4fr)
      minmax(72px, 0.45fr)
      minmax(80px, 0.6fr)
      minmax(120px, 0.9fr)
      minmax(140px, 0.9fr);
  }
}

/* Tab 切换按钮样式（嵌入到 ModelView 时使用） */
.model-tab-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: 8px;
  background: rgba(225, 227, 228, 0.56);
}

.model-tab-button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7c8794;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.model-tab-button:hover {
  color: var(--app-primary, #409eff);
}

.model-tab-button.active {
  background: #fff;
  color: var(--app-primary, #409eff);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.benchmark-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.atelier-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
}

.atelier-mobile-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.benchmark-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.benchmark-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.benchmark-card-title {
  font-weight: 600;
  font-size: 15px;
  color: #1f2937;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.benchmark-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: #6b7280;
  font-size: 13px;
}

.benchmark-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
}

.benchmark-card-time {
  color: #9ca3af;
  font-size: 12px;
}

.benchmark-empty {
  text-align: center;
  color: #9ca3af;
  padding: 32px 0;
}

.management-list-text.muted {
  color: #cbd5e1;
}

.form-help {
  margin-left: 12px;
  color: #9ca3af;
  font-size: 12px;
}

/* "使用默认模板"按钮：与 textarea 拉开间距，主题色文本，hover 加底色 */
.form-default-template {
  margin-top: 8px;
  display: flex;
  justify-content: flex-start;
}

.form-default-template-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--app-primary, #409eff);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1.4;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.form-default-template-btn:hover {
  background: rgba(64, 158, 255, 0.08);
  border-color: rgba(64, 158, 255, 0.24);
}

.form-default-template-btn:active {
  background: rgba(64, 158, 255, 0.16);
}

/* ============ 抽屉 ============ */

.benchmark-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
}

.benchmark-detail-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.benchmark-detail-summary-text {
  font-size: 13px;
  color: #4b5563;
}

.benchmark-detail-summary-label {
  font-weight: 600;
  color: #1f2937;
}

.benchmark-detail-summary-active {
  margin-left: 4px;
  color: #d97706;
}

.benchmark-detail-summary-actions {
  display: flex;
  gap: 8px;
}

.benchmark-detail-config {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  background: #f9fafb;
  padding: 12px 16px;
  border-radius: 10px;
}

.benchmark-detail-config div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.benchmark-detail-config span {
  color: #9ca3af;
}

.benchmark-detail-config b {
  color: #111827;
  font-weight: 600;
}

.benchmark-detail-error {
  background: #fef2f2;
  color: #b91c1c;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.benchmark-detail-tabs {
  margin-top: 4px;
}

/* 自定义 Tab 头：替代 el-tabs，避免 v-model 同步抖动导致的"切不回" */
.benchmark-tabs-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 12px;
}

.benchmark-tab-button {
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s, border-color 0.15s;
}

.benchmark-tab-button:hover {
  color: var(--app-primary, #409eff);
}

.benchmark-tab-button.active {
  color: var(--app-primary, #409eff);
  border-bottom-color: var(--app-primary, #409eff);
}

.benchmark-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.benchmark-tab-button.active .benchmark-tab-badge {
  background: rgba(64, 158, 255, 0.16);
  color: var(--app-primary, #409eff);
}

.benchmark-tab-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.benchmark-runs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.benchmark-runs-toolbar-text {
  color: #6b7280;
  font-size: 13px;
}

.benchmark-runs-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* ============ 运行记录列表（atelier 风格） ============ */
.benchmark-runs-list {
  width: 100%;
  min-width: 0;
}

.benchmark-runs-head,
.benchmark-runs-row {
  display: grid;
  grid-template-columns:
    minmax(160px, 1.4fr)
    minmax(88px, 0.6fr)
    minmax(160px, 1.6fr)
    minmax(80px, 0.6fr)
    minmax(96px, 0.6fr);
  align-items: center;
}

.benchmark-runs-row {
  transition: background 0.15s;
}

.benchmark-runs-row + .benchmark-runs-row {
  border-top: 1px solid #f1f5f9;
}

.benchmark-runs-row:hover {
  background-color: #f8fafc;
}

/* 选中查看指标的那一行整体高亮，便于在 Tabs 切回时一眼看到当前正在查看哪条 run */
.benchmark-runs-row-active {
  background-color: rgba(64, 158, 255, 0.08);
}

.benchmark-runs-row-active:hover {
  background-color: rgba(64, 158, 255, 0.12);
}

.runs-col-time,
.runs-col-status,
.runs-col-progress,
.runs-col-duration,
.runs-col-actions {
  min-width: 0;
}

.atelier-data-cell.runs-col-status.center,
.atelier-data-head-item.runs-col-status.center {
  justify-content: center;
  text-align: center;
}

.atelier-data-cell.runs-col-duration.right,
.atelier-data-head-item.runs-col-duration.right,
.atelier-data-cell.runs-col-actions.right,
.atelier-data-head-item.runs-col-actions.right {
  justify-content: flex-end;
  text-align: right;
}

.benchmark-metric-current {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4b5563;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.benchmark-metric-current b {
  color: #111827;
}

/* 指标对比表格容器：抽屉宽度有限时自动出现横向滚动条；
   显式抬高 fixed 列层级，并给 fixed 列单元格强制白底/条纹底色，
   彻底避免滚动时下层数据列透过来造成的"重叠"观感。 */
.benchmark-metric-table {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.benchmark-metric-table :deep(.el-table) {
  --el-table-border-color: #e5e7eb;
  background: #fff;
}

.benchmark-metric-table :deep(.el-table__fixed),
.benchmark-metric-table :deep(.el-table__fixed-right),
.benchmark-metric-table :deep(.el-table__cell.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__cell.is-first-column) {
  z-index: 3;
  background-color: #ffffff !important;
}

.benchmark-metric-table :deep(.el-table__row--striped .el-table__cell.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__row--striped .el-table__cell.is-first-column),
.benchmark-metric-table :deep(.el-table__row--striped td.el-table-fixed-column--left) {
  background-color: #fafbfc !important;
}

.benchmark-metric-table :deep(.el-table__body tr:hover > td.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__body tr:hover > td.is-first-column) {
  background-color: #f5f7fa !important;
}

.benchmark-metric-table :deep(.el-table__header-wrapper th.el-table-fixed-column--left),
.benchmark-metric-table :deep(.el-table__header-wrapper th.is-first-column) {
  background-color: #f5f7fa !important;
  z-index: 4;
}

.benchmark-metric-table :deep(.el-table__fixed::before),
.benchmark-metric-table :deep(.el-table__fixed-right::before) {
  display: none;
}

.benchmark-metric-table :deep(.el-table__fixed) {
  box-shadow: 4px 0 6px -4px rgba(15, 23, 42, 0.16);
}

.benchmark-metric-table :deep(.el-table-fixed-column--left.is-last-column::before) {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 6px;
  pointer-events: none;
  box-shadow: inset 4px 0 6px -4px rgba(15, 23, 42, 0.16);
}

.benchmark-metric-table :deep(.el-table .el-table__cell) {
  padding: 10px 8px;
  vertical-align: middle;
}

.benchmark-metric-table :deep(.el-table__header-wrapper th) {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background-color: #f8fafc !important;
  letter-spacing: 0.02em;
}

.metric-model-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.metric-model-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #eef2ff, #dbeafe);
  color: #4f46e5;
  font-size: 14px;
}

.metric-model-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.metric-model-name {
  font-weight: 600;
  color: #0f172a;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-model-sub {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric-num {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  font-size: 13px;
  color: #1f2937;
}

.metric-num-best {
  color: #059669;
  font-weight: 700;
  position: relative;
}

.metric-num-best::before {
  content: '▲';
  font-size: 9px;
  margin-right: 2px;
  color: #10b981;
}

.metric-num-good {
  color: #059669;
  font-weight: 600;
}

.metric-num-warn {
  color: #d97706;
  font-weight: 600;
}

.metric-num-bad {
  color: #dc2626;
  font-weight: 600;
}

.metric-estimated-badge {
  font-size: 10px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 1px 5px;
  line-height: 1.4;
}

.benchmark-metric-table :deep(.el-table__body tr:hover > td) {
  background-color: #f8fafc !important;
}

.benchmark-metric-table :deep(.benchmark-row-warn > td) {
  background-color: #fef2f2 !important;
}

.benchmark-metric-mobile {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.benchmark-metric-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
}

.benchmark-metric-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.benchmark-metric-card-title {
  font-weight: 600;
  color: #1f2937;
}

.benchmark-metric-card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 16px;
  font-size: 13px;
}

.benchmark-metric-card-grid div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.benchmark-metric-card-grid span {
  color: #9ca3af;
}

.benchmark-metric-card-grid b {
  color: #111827;
  font-weight: 600;
}

.benchmark-metric-card-error {
  margin-top: 8px;
  font-size: 12px;
  color: #b91c1c;
  background: #fef2f2;
  padding: 6px 8px;
  border-radius: 6px;
}

.benchmark-detail-prompt {
  background: #f9fafb;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: #4b5563;
}

.benchmark-detail-prompt summary {
  cursor: pointer;
  font-weight: 600;
  color: #374151;
}

.benchmark-detail-prompt p {
  margin: 8px 0 0;
  white-space: pre-wrap;
}
</style>
