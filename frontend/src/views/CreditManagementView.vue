<template>
  <div class="credit-management-page management-list-page">
    <section class="credit-config-grid">
      <div class="credit-panel">
        <header class="credit-panel-header">
          <div>
            <h2>注册赠送</h2>
            <p>控制新用户开户后的初始积分。</p>
          </div>
          <el-tag :type="globalForm.registerGrantEnabled ? 'success' : 'info'" effect="plain">
            {{ globalForm.registerGrantEnabled ? '已启用' : '已停用' }}
          </el-tag>
        </header>
        <el-form class="credit-inline-form" label-position="top">
          <el-form-item label="赠送积分">
            <el-input-number v-model="globalForm.registerGrantAmount" :min="0" :max="999999" :disabled="!canManage" controls-position="right" />
          </el-form-item>
          <el-form-item label="自动赠送">
            <el-switch v-model="globalForm.registerGrantEnabled" :disabled="!canManage" />
          </el-form-item>
        </el-form>
        <div class="credit-panel-footer">
          <span>更新时间：{{ globalConfig?.updatedAt || '-' }}</span>
          <el-button v-if="canManage" type="primary" :loading="globalSaving" @click="handleSaveGlobalConfig">保存配置</el-button>
        </div>
      </div>

      <div class="credit-panel">
        <header class="credit-panel-header">
          <div>
            <h2>AI 功能扣费规则</h2>
            <p>后续公众端 AI 能力按功能编码扣减。</p>
          </div>
          <el-button v-if="canManage" type="primary" plain @click="openFeatureDialog()">
            <el-icon><Plus /></el-icon>
            新增规则
          </el-button>
        </header>
        <div class="credit-feature-list" v-loading="featureLoading">
          <article v-for="item in featureConfigs" :key="item.featureCode" class="credit-feature-item">
            <div>
              <strong>{{ item.featureName }}</strong>
              <span>{{ item.featureCode }}</span>
            </div>
            <div class="credit-feature-meta">
              <span>{{ item.costAmount }} 分/次</span>
              <el-tag :type="item.enabled ? 'success' : 'info'" effect="plain">{{ item.enabled ? '启用' : '停用' }}</el-tag>
              <button v-if="canManage" class="management-list-row-button" type="button" title="编辑规则" @click="openFeatureDialog(item)">
                <el-icon><EditPen /></el-icon>
              </button>
            </div>
          </article>
          <el-empty v-if="!featureConfigs.length && !featureLoading" description="暂无扣费规则" />
        </div>
      </div>
    </section>

    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索用户名或昵称..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <button class="management-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="accountLoading">
        <template v-if="!isMobileViewport">
          <table class="management-list-table credit-account-table mobile-card-table">
            <thead>
              <tr>
                <th class="credit-col-user">用户</th>
                <th class="center">余额</th>
                <th class="center">累计赠送</th>
                <th class="center">累计消费</th>
                <th class="center">累计退款</th>
                <th>更新时间</th>
                <th class="right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in accountList" :key="row.userId" class="management-list-row">
                <td class="credit-col-user" data-label="用户">
                  <div class="management-list-title-cell">
                    <span class="management-list-avatar">{{ userInitial(row.nickname || row.username) }}</span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">{{ row.nickname || row.username }}</div>
                      <div class="management-list-subtitle">{{ row.username }}</div>
                    </div>
                  </div>
                </td>
                <td class="center" data-label="余额"><strong>{{ row.balance }}</strong></td>
                <td class="center" data-label="累计赠送">{{ row.totalGranted }}</td>
                <td class="center" data-label="累计消费">{{ row.totalConsumed }}</td>
                <td class="center" data-label="累计退款">{{ row.totalRefunded }}</td>
                <td data-label="更新时间"><span class="management-list-updated">{{ row.updatedAt || '-' }}</span></td>
                <td class="right" data-label="操作">
                  <div class="management-list-row-actions">
                    <button class="management-list-row-button" type="button" title="查看流水" @click="openTransactions(row)">
                      <el-icon><Tickets /></el-icon>
                    </button>
                    <button v-if="canManage" class="management-list-row-button" type="button" title="调账" @click="openAdjustDialog(row)">
                      <el-icon><EditPen /></el-icon>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
        <template v-else>
          <div v-if="accountList.length" class="mobile-entity-list-shell">
            <div class="mobile-entity-list">
              <article v-for="row in accountList" :key="row.userId" class="mobile-entity-card">
                <header class="mobile-entity-card-header">
                  <span class="mobile-entity-icon">{{ userInitial(row.nickname || row.username) }}</span>
                  <span class="mobile-entity-copy">
                    <span class="mobile-entity-title">{{ row.nickname || row.username }}</span>
                    <span class="mobile-entity-description">{{ row.username }}</span>
                  </span>
                  <span class="credit-mobile-balance">{{ row.balance }}</span>
                </header>
                <div class="mobile-entity-fields">
                  <div class="mobile-entity-field"><span class="mobile-entity-field-label">赠送</span><span>{{ row.totalGranted }}</span></div>
                  <div class="mobile-entity-field"><span class="mobile-entity-field-label">消费</span><span>{{ row.totalConsumed }}</span></div>
                  <div class="mobile-entity-field"><span class="mobile-entity-field-label">退款</span><span>{{ row.totalRefunded }}</span></div>
                  <div class="mobile-entity-field"><span class="mobile-entity-field-label">更新</span><span>{{ row.updatedAt || '-' }}</span></div>
                </div>
                <footer class="mobile-entity-actions">
                  <button class="mobile-entity-action-button" type="button" @click="openTransactions(row)">
                    <el-icon><Tickets /></el-icon>
                    <span>流水</span>
                  </button>
                  <button v-if="canManage" class="mobile-entity-action-button info" type="button" @click="openAdjustDialog(row)">
                    <el-icon><EditPen /></el-icon>
                    <span>调账</span>
                  </button>
                </footer>
              </article>
            </div>
            <div v-if="hasMoreMobileItems" ref="sentinelRef" class="mobile-waterfall-sentinel"></div>
          </div>
          <div v-if="!accountList.length" class="mobile-entity-empty-state">
            <el-empty description="当前筛选条件下暂无账户" />
          </div>
        </template>
      </div>

      <div v-if="showDesktopPagination" class="management-list-footer">
        <div class="management-list-footer-total">共 <span>{{ pagination.total }}</span> 条</div>
        <div class="management-list-footer-controls">
          <div class="management-list-page-size management-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="5" label="5" />
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

    <el-dialog v-model="featureDialogVisible" :title="featureDialogTitle" width="520px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="featureDialogTitle" subtitle="维护公众端 AI 功能的固定扣费规则。" :icon="Coin" />
      </template>
      <el-form ref="featureFormRef" :model="featureForm" :rules="featureRules" label-position="top">
        <el-form-item label="功能编码" prop="featureCode">
          <el-input v-model="featureForm.featureCode" placeholder="例如 PUBLIC_AI_ASSISTANT" />
        </el-form-item>
        <el-form-item label="功能名称" prop="featureName">
          <el-input v-model="featureForm.featureName" placeholder="请输入功能名称" />
        </el-form-item>
        <el-form-item label="每次扣减积分" prop="costAmount">
          <el-input-number v-model="featureForm.costAmount" :min="1" :max="999999" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="featureForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="featureDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="featureSubmitting" @click="handleSaveFeature">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="adjustDialogVisible" title="积分调账" width="480px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader title="积分调账" :subtitle="adjustTarget ? `${adjustTarget.nickname || adjustTarget.username} 当前余额 ${adjustTarget.balance}` : ''" :icon="Coin" />
      </template>
      <el-form ref="adjustFormRef" :model="adjustForm" :rules="adjustRules" label-position="top">
        <el-form-item label="变动积分" prop="amount">
          <el-input-number v-model="adjustForm.amount" :min="-999999" :max="999999" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="调账原因" prop="reason">
          <el-input v-model="adjustForm.reason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请输入调账原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="adjustDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="adjustSubmitting" @click="handleAdjust">确认调账</el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="transactionDrawerVisible" :title="transactionDrawerTitle" size="640px" class="credit-transaction-drawer">
      <div class="credit-transaction-list" v-loading="transactionLoading">
        <article v-for="item in transactionList" :key="item.id" class="credit-transaction-item">
          <div class="credit-transaction-main">
            <span class="management-list-pill" :class="transactionPillClass(item.transactionType)">{{ transactionTypeLabel(item.transactionType) }}</span>
            <strong :class="item.amount >= 0 ? 'credit-positive' : 'credit-negative'">{{ formatAmount(item.amount) }}</strong>
          </div>
          <div class="credit-transaction-detail">
            <span>余额 {{ item.balanceAfter }}</span>
            <span>{{ item.createdAt || '-' }}</span>
            <span v-if="item.featureCode">{{ item.featureCode }}</span>
            <span v-if="item.businessKey">{{ item.businessKey }}</span>
          </div>
          <p v-if="item.reason">{{ item.reason }}</p>
        </article>
        <el-empty v-if="!transactionList.length && !transactionLoading" description="暂无积分流水" />
      </div>
      <template #footer>
        <div class="credit-drawer-footer">
          <span>共 {{ transactionPagination.total }} 条</span>
          <div class="management-list-page-nav">
            <button class="management-list-page-button" type="button" :disabled="transactionPagination.page <= 1" @click="handlePrevTransactionPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="management-list-page-text">第 {{ transactionPagination.page }} / {{ transactionTotalPages }} 页</span>
            <button class="management-list-page-button" type="button" :disabled="transactionPagination.page >= transactionTotalPages" @click="handleNextTransactionPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Coin, EditPen, Plus, RefreshRight, Search, Tickets } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  adjustCreditAccount,
  getCreditGlobalConfig,
  listCreditFeatureConfigs,
  pageCreditAccounts,
  pageCreditAccountTransactions,
  saveCreditFeatureConfig,
  updateCreditGlobalConfig
} from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { CreditAccountItem, CreditFeatureConfigItem, CreditGlobalConfigItem, CreditTransactionItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'

interface CreditFeatureForm {
  featureCode: string
  featureName: string
  costAmount: number
  enabled: boolean
}

interface CreditAdjustForm {
  amount: number
  reason: string
}

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:credit:manage'))
const { isMobileViewport } = useMobileViewport()

const globalConfig = ref<CreditGlobalConfigItem | null>(null)
const globalSaving = ref(false)
const globalForm = reactive({ registerGrantAmount: 0, registerGrantEnabled: true })
const featureConfigs = ref<CreditFeatureConfigItem[]>([])
const featureLoading = ref(false)
const featureDialogVisible = ref(false)
const featureSubmitting = ref(false)
const featureFormRef = ref<FormInstance>()
const featureForm = reactive<CreditFeatureForm>({ featureCode: '', featureName: '', costAmount: 1, enabled: true })

const accountLoading = ref(false)
const accountList = ref<CreditAccountItem[]>([])
const filters = reactive({ keyword: '' })
const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading: accountLoading,
  itemCount: computed(() => accountList.value.length),
  pagination,
  loadPage: async () => loadAccounts()
})

const adjustDialogVisible = ref(false)
const adjustSubmitting = ref(false)
const adjustTarget = ref<CreditAccountItem | null>(null)
const adjustFormRef = ref<FormInstance>()
const adjustForm = reactive<CreditAdjustForm>({ amount: 0, reason: '' })

const transactionDrawerVisible = ref(false)
const transactionLoading = ref(false)
const transactionTarget = ref<CreditAccountItem | null>(null)
const transactionList = ref<CreditTransactionItem[]>([])
const transactionPagination = reactive({ page: 1, size: 10, total: 0 })
const transactionTotalPages = computed(() => Math.max(1, Math.ceil(transactionPagination.total / transactionPagination.size) || 1))

const featureDialogTitle = computed(() => (featureForm.featureCode ? '编辑扣费规则' : '新增扣费规则'))
const transactionDrawerTitle = computed(() => (transactionTarget.value ? `${transactionTarget.value.nickname || transactionTarget.value.username} 的积分流水` : '积分流水'))

const featureRules: FormRules<CreditFeatureForm> = {
  featureCode: [{ required: true, message: '请输入功能编码', trigger: 'blur' }],
  featureName: [{ required: true, message: '请输入功能名称', trigger: 'blur' }],
  costAmount: [{ required: true, message: '请输入扣减积分', trigger: 'change' }]
}

const adjustRules: FormRules<CreditAdjustForm> = {
  amount: [
    {
      validator: (_, value, callback) => {
        Number(value) === 0 ? callback(new Error('调账积分不能为 0')) : callback()
      },
      trigger: 'change'
    }
  ],
  reason: [{ required: true, message: '请输入调账原因', trigger: 'blur' }]
}

const loadGlobalConfig = async () => {
  const data = await getCreditGlobalConfig()
  globalConfig.value = data
  globalForm.registerGrantAmount = data.registerGrantAmount
  globalForm.registerGrantEnabled = data.registerGrantEnabled
}

const loadFeatureConfigs = async () => {
  featureLoading.value = true
  try {
    featureConfigs.value = await listCreditFeatureConfigs()
  } finally {
    featureLoading.value = false
  }
}

const loadAccounts = async () => {
  accountLoading.value = true
  try {
    const data = await pageCreditAccounts({
      page: requestPage.value,
      size: requestSize.value,
      keyword: filters.keyword
    })
    accountList.value = data.records
    pagination.total = data.total
  } finally {
    accountLoading.value = false
  }
}

const handleSaveGlobalConfig = async () => {
  globalSaving.value = true
  try {
    globalConfig.value = await updateCreditGlobalConfig({
      registerGrantAmount: globalForm.registerGrantAmount,
      registerGrantEnabled: globalForm.registerGrantEnabled
    })
    ElMessage.success('积分配置已保存')
  } finally {
    globalSaving.value = false
  }
}

const openFeatureDialog = (item?: CreditFeatureConfigItem) => {
  featureForm.featureCode = item?.featureCode || ''
  featureForm.featureName = item?.featureName || ''
  featureForm.costAmount = item?.costAmount || 1
  featureForm.enabled = item?.enabled ?? true
  featureDialogVisible.value = true
  featureFormRef.value?.clearValidate()
}

const handleSaveFeature = async () => {
  await featureFormRef.value?.validate()
  featureSubmitting.value = true
  try {
    await saveCreditFeatureConfig({
      featureCode: featureForm.featureCode,
      featureName: featureForm.featureName,
      costAmount: featureForm.costAmount,
      enabled: featureForm.enabled
    })
    featureDialogVisible.value = false
    ElMessage.success('扣费规则已保存')
    await loadFeatureConfigs()
  } finally {
    featureSubmitting.value = false
  }
}

const handleSearch = async () => {
  resetMobilePagination()
  await loadAccounts()
}

const handleReset = async () => {
  filters.keyword = ''
  resetMobilePagination()
  await loadAccounts()
}

const handleSizeChange = async () => {
  resetMobilePagination()
  await loadAccounts()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadAccounts()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadAccounts()
}

const openAdjustDialog = (row: CreditAccountItem) => {
  adjustTarget.value = row
  adjustForm.amount = 0
  adjustForm.reason = ''
  adjustDialogVisible.value = true
  adjustFormRef.value?.clearValidate()
}

const handleAdjust = async () => {
  if (!adjustTarget.value) return
  await adjustFormRef.value?.validate()
  adjustSubmitting.value = true
  try {
    await adjustCreditAccount(adjustTarget.value.userId, { amount: adjustForm.amount, reason: adjustForm.reason })
    adjustDialogVisible.value = false
    ElMessage.success('积分调账已完成')
    await loadAccounts()
  } finally {
    adjustSubmitting.value = false
  }
}

const openTransactions = async (row: CreditAccountItem) => {
  transactionTarget.value = row
  transactionPagination.page = 1
  transactionDrawerVisible.value = true
  await loadTransactions()
}

const loadTransactions = async () => {
  if (!transactionTarget.value) return
  transactionLoading.value = true
  try {
    const data = await pageCreditAccountTransactions(transactionTarget.value.userId, transactionPagination.page, transactionPagination.size)
    transactionList.value = data.records
    transactionPagination.total = data.total
  } finally {
    transactionLoading.value = false
  }
}

const handlePrevTransactionPage = async () => {
  if (transactionPagination.page <= 1) return
  transactionPagination.page -= 1
  await loadTransactions()
}

const handleNextTransactionPage = async () => {
  if (transactionPagination.page >= transactionTotalPages.value) return
  transactionPagination.page += 1
  await loadTransactions()
}

const userInitial = (value?: string | null) => (value || 'UN').slice(0, 2).toUpperCase()
const formatAmount = (value: number) => (value > 0 ? `+${value}` : String(value))
const transactionTypeLabel = (type: string) => ({
  REGISTER_GRANT: '注册赠送',
  ADJUST_INCREASE: '调账增加',
  ADJUST_DECREASE: '调账扣减',
  CONSUME: 'AI 消费',
  REFUND: '消费退款'
}[type] || type)
const transactionPillClass = (type: string) => {
  if (type === 'CONSUME' || type === 'ADJUST_DECREASE') return 'danger'
  if (type === 'REFUND' || type === 'REGISTER_GRANT' || type === 'ADJUST_INCREASE') return 'success'
  return 'neutral'
}

onMounted(async () => {
  await Promise.all([loadGlobalConfig(), loadFeatureConfigs(), loadAccounts()])
})
</script>

<style scoped>
.credit-config-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(360px, 1.2fr);
  gap: 16px;
}

.credit-panel {
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-card);
  padding: 18px;
  box-shadow: var(--app-shadow-soft);
}

.credit-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.credit-panel-header h2 {
  margin: 0;
  font-size: 16px;
  color: var(--app-text);
}

.credit-panel-header p {
  margin: 4px 0 0;
  color: var(--app-text-muted);
  font-size: 13px;
}

.credit-inline-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: end;
}

.credit-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.credit-feature-list {
  display: grid;
  gap: 10px;
  min-height: 96px;
}

.credit-feature-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 12px;
}

.credit-feature-item strong,
.credit-feature-item span {
  display: block;
}

.credit-feature-item strong {
  color: var(--app-text);
  font-size: 14px;
}

.credit-feature-item span {
  color: var(--app-text-muted);
  font-size: 12px;
}

.credit-feature-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.credit-account-table {
  min-width: 840px;
}

.credit-col-user {
  min-width: 220px;
}

.credit-mobile-balance {
  margin-left: auto;
  color: var(--app-primary);
  font-size: 18px;
  font-weight: 700;
}

.credit-transaction-list {
  display: grid;
  gap: 12px;
}

.credit-transaction-item {
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 12px;
}

.credit-transaction-main,
.credit-transaction-detail,
.credit-drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.credit-transaction-detail {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.credit-transaction-item p {
  margin: 8px 0 0;
  color: var(--app-text-soft);
  font-size: 13px;
}

.credit-positive {
  color: var(--app-success);
}

.credit-negative {
  color: var(--app-danger);
}

@media (max-width: 900px) {
  .credit-config-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .credit-inline-form,
  .credit-panel-footer,
  .credit-feature-item {
    grid-template-columns: 1fr;
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
