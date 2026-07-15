<template>
  <div class="assistant-feedback-view management-page-shell">
    <div class="management-page-header">
      <div>
        <h1 class="management-page-title">GitPilot 反馈运营</h1>
        <p class="management-page-description">集中处理单条助手回答反馈，并沉淀可复盘的数据样本。</p>
      </div>
      <el-button :icon="RefreshRight" :loading="loading" @click="loadAll">刷新</el-button>
    </div>

    <el-alert
      v-if="!canManage"
      class="assistant-feedback-permission-alert"
      title="当前账号只有反馈查看权限，不能保存分诊或处理结论。"
      type="warning"
      :closable="false"
    />

    <div class="assistant-feedback-stats">
      <div class="assistant-feedback-stat"><span>待处理</span><strong>{{ stats.newCount }}</strong></div>
      <div class="assistant-feedback-stat"><span>处理中</span><strong>{{ stats.inProgressCount }}</strong></div>
      <div class="assistant-feedback-stat"><span>已解决</span><strong>{{ stats.resolvedCount }}</strong></div>
      <div class="assistant-feedback-stat assistant-feedback-stat-danger"><span>负面反馈</span><strong>{{ stats.negativeCount }}</strong></div>
    </div>

    <section class="management-list-card">
      <div class="assistant-feedback-filter-bar">
        <el-input v-model="filters.keyword" clearable placeholder="搜索问题、回答或补充说明" @keyup.enter="handleSearch" />
        <el-select v-model="filters.vote" clearable placeholder="评价方向" @change="handleSearch">
          <el-option label="点踩" value="DOWN" />
          <el-option label="点赞" value="UP" />
        </el-select>
        <el-select v-model="filters.status" clearable placeholder="处理状态" @change="handleSearch">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.datasetStatus" clearable placeholder="数据集状态" @change="handleSearch">
          <el-option label="待标记" value="PENDING" />
          <el-option label="已纳入" value="INCLUDED" />
          <el-option label="已排除" value="EXCLUDED" />
        </el-select>
        <el-button type="primary" @click="handleSearch">查询</el-button>
      </div>

      <el-table v-loading="loading" :data="items" row-key="id" @row-click="openDetail">
        <el-table-column label="反馈" min-width="280">
          <template #default="{ row }">
            <div class="assistant-feedback-row-main">
              <span class="assistant-feedback-vote" :class="row.vote === 'DOWN' ? 'is-down' : 'is-up'">{{ row.vote === 'DOWN' ? '点踩' : '点赞' }}</span>
              <span class="assistant-feedback-row-question">{{ row.questionSnapshot || '暂无问题快照' }}</span>
            </div>
            <div class="assistant-feedback-row-sub">{{ row.submitterNickname || row.submitterUsername }} · {{ row.createdAt || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="原因" min-width="180">
          <template #default="{ row }">{{ resolveReasons(row.reasonCodes) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><el-tag :type="statusTone(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="数据集" width="110">
          <template #default="{ row }">{{ datasetLabel(row.datasetStatus) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click.stop="openDetail(row)">处理</el-button></template>
        </el-table-column>
      </el-table>
      <div class="assistant-feedback-pagination">
        <el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.size" :total="pagination.total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next" @current-change="loadItems" @size-change="handleSizeChange" />
      </div>
    </section>

    <el-drawer v-model="detailVisible" title="GitPilot 反馈详情" size="min(760px, 100vw)" destroy-on-close>
      <template v-if="detail">
        <div class="assistant-feedback-detail-section">
          <div class="assistant-feedback-detail-meta">
            <el-tag :type="detail.feedback.vote === 'DOWN' ? 'danger' : 'success'">{{ detail.feedback.vote === 'DOWN' ? '点踩' : '点赞' }}</el-tag>
            <span>{{ detail.feedback.submitterNickname || detail.feedback.submitterUsername }}</span>
            <span>会话 #{{ detail.feedback.sessionId }} · 消息 #{{ detail.feedback.assistantMessageId }}</span>
          </div>
          <h3>用户问题</h3><pre>{{ detail.feedback.questionSnapshot || '暂无' }}</pre>
          <h3>助手回答</h3><pre>{{ detail.feedback.answerSnapshot || '暂无' }}</pre>
          <h3>用户反馈</h3><pre>{{ detail.feedback.comment || '未补充文字' }}</pre>
          <div class="assistant-feedback-reason-list">{{ resolveReasons(detail.feedback.reasonCodes) }}</div>
        </div>
        <el-divider />
        <div class="assistant-feedback-detail-section">
          <h3>运营处理</h3>
          <el-form label-position="top">
            <el-form-item label="分诊状态"><el-select v-model="triageForm.status" :disabled="!canManage" style="width: 100%"><el-option v-for="item in triageOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="负责人"><el-select v-model="triageForm.assigneeUserId" :disabled="!canManage || usersLoading" :loading="usersLoading" clearable filterable placeholder="请选择负责人（可不分配）" style="width: 100%"><el-option v-for="user in userOptions" :key="user.id" :label="buildUserLabel(user)" :value="user.id" /></el-select></el-form-item>
            <el-form-item label="分诊备注"><el-input v-model="triageForm.note" :disabled="!canManage" type="textarea" maxlength="2000" /></el-form-item>
            <el-button type="primary" :loading="saving" :disabled="!canManage" @click="saveTriage">保存分诊</el-button>
          </el-form>
        </div>
        <el-divider />
        <div class="assistant-feedback-detail-section">
          <h3>处理结论与数据集</h3>
          <el-form label-position="top">
            <el-form-item label="处理结论"><el-select v-model="resolutionForm.status" :disabled="!canManage" style="width: 100%"><el-option label="已解决" value="RESOLVED" /><el-option label="暂不处理" value="REJECTED" /><el-option label="重复问题" value="DUPLICATE" /></el-select></el-form-item>
            <el-form-item label="结论类型"><el-select v-model="resolutionForm.resolutionCode" :disabled="!canManage" style="width: 100%"><el-option v-for="item in resolutionOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="处理说明"><el-input v-model="resolutionForm.resolutionNote" :disabled="!canManage" type="textarea" maxlength="4000" /></el-form-item>
            <el-form-item label="改进标签"><el-input v-model="resolutionForm.improvementTagsText" :disabled="!canManage" placeholder="多个标签用逗号分隔" /></el-form-item>
            <el-form-item label="复盘数据集"><el-select v-model="resolutionForm.datasetStatus" :disabled="!canManage" style="width: 100%"><el-option label="待标记" value="PENDING" /><el-option label="纳入数据集" value="INCLUDED" /><el-option label="排除数据集" value="EXCLUDED" /></el-select></el-form-item>
            <el-button type="primary" :loading="saving" :disabled="!canManage" @click="saveResolution">保存结论</el-button>
          </el-form>
        </div>
        <el-divider />
        <div class="assistant-feedback-detail-section"><h3>处理轨迹</h3><el-timeline><el-timeline-item v-for="activity in detail.activities" :key="activity.id" :timestamp="activity.createdAt || '-'">{{ activity.actionType }}：{{ activity.note || activity.toStatus || '-' }}</el-timeline-item></el-timeline></div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import { listUserOptions } from '@/api/access'
import { getAssistantFeedbackDetail, getAssistantFeedbackStats, pageAssistantFeedback, resolveAssistantFeedback, triageAssistantFeedback } from '@/api/assistant-feedback'
import type { AssistantFeedbackDetail, AssistantFeedbackItem, AssistantFeedbackStats } from '@/types/assistant-feedback'
import type { UserOptionItem } from '@/types/platform'
import { useAuthStore } from '@/stores/auth'

const statusOptions = [{ label: '待处理', value: 'NEW' }, { label: '已分诊', value: 'TRIAGED' }, { label: '处理中', value: 'IN_PROGRESS' }, { label: '已解决', value: 'RESOLVED' }, { label: '暂不处理', value: 'REJECTED' }, { label: '重复问题', value: 'DUPLICATE' }]
const triageOptions = statusOptions.slice(0, 3)
const resolutionOptions = [{ label: '提示词优化', value: 'PROMPT_FIX' }, { label: '模型问题', value: 'MODEL_ISSUE' }, { label: '知识缺口', value: 'KNOWLEDGE_GAP' }, { label: '工具缺陷', value: 'TOOL_BUG' }, { label: '用户理解偏差', value: 'USER_MISUNDERSTANDING' }, { label: '无需处理', value: 'NO_ACTION' }, { label: '重复问题', value: 'DUPLICATE' }]
const reasonLabels: Record<string, string> = { WRONG_ANSWER: '事实错误', IRRELEVANT: '答非所问', MISSING_CONTEXT: '上下文缺失', TOOL_FAILED: '工具失败', INTERRUPTED: '响应中断', UNCLEAR: '表达不清', OTHER: '其他' }
const loading = ref(false)
const saving = ref(false)
const usersLoading = ref(false)
const items = ref<AssistantFeedbackItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const detail = ref<AssistantFeedbackDetail | null>(null)
const detailVisible = ref(false)
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:assistant-feedback:manage'))
const stats = reactive<AssistantFeedbackStats>({ newCount: 0, inProgressCount: 0, resolvedCount: 0, negativeCount: 0, totalCount: 0 })
const filters = reactive({ keyword: '', vote: '', status: '', datasetStatus: '' })
const pagination = reactive({ page: 1, size: 20, total: 0 })
const triageForm = reactive({ status: 'NEW', assigneeUserId: null as number | null, note: '' })
const resolutionForm = reactive({ status: 'RESOLVED', resolutionCode: 'PROMPT_FIX', resolutionNote: '', improvementTagsText: '', datasetStatus: 'PENDING' })

const statusLabel = (value: string) => statusOptions.find((item) => item.value === value)?.label || value
const statusTone = (value: string) => value === 'RESOLVED' || value === 'AUTO_CLOSED' ? 'success' : value === 'REJECTED' || value === 'DUPLICATE' ? 'info' : value === 'IN_PROGRESS' ? 'warning' : 'danger'
const datasetLabel = (value: string) => ({ PENDING: '待标记', INCLUDED: '已纳入', EXCLUDED: '已排除' }[value] || value)
const resolveReasons = (values: string[]) => values?.map((value) => reasonLabels[value] || value).join('、') || '—'
/** 将负责人用户显示为“昵称（用户名）”，避免运营人员只看到无法识别的数字 ID。 */
const buildUserLabel = (user: UserOptionItem) => user.nickname?.trim() ? `${user.nickname}（${user.username}）` : user.username

const loadItems = async () => {
  loading.value = true
  try {
    const data = await pageAssistantFeedback({ page: pagination.page, size: pagination.size, ...filters })
    items.value = data.records
    pagination.total = data.total
  } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载反馈队列失败') } finally { loading.value = false }
}
const loadAll = async () => {
  await Promise.all([loadItems(), getAssistantFeedbackStats().then((data) => Object.assign(stats, data)), loadUserOptions()])
}
/** 加载启用用户选项，供分诊负责人下拉框使用。 */
const loadUserOptions = async () => {
  usersLoading.value = true
  try {
    userOptions.value = await listUserOptions()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载负责人用户失败')
  } finally {
    usersLoading.value = false
  }
}
const handleSearch = async () => { pagination.page = 1; await loadItems() }
const handleSizeChange = async () => { pagination.page = 1; await loadItems() }
const openDetail = async (row: AssistantFeedbackItem) => {
  try {
    detail.value = await getAssistantFeedbackDetail(row.id)
    const feedback = detail.value.feedback
    triageForm.status = ['NEW', 'TRIAGED', 'IN_PROGRESS'].includes(feedback.status) ? feedback.status : 'NEW'
    triageForm.assigneeUserId = feedback.assigneeUserId
    triageForm.note = ''
    resolutionForm.status = ['RESOLVED', 'REJECTED', 'DUPLICATE'].includes(feedback.status) ? feedback.status : 'RESOLVED'
    resolutionForm.resolutionCode = feedback.resolutionCode || 'PROMPT_FIX'
    resolutionForm.resolutionNote = feedback.resolutionNote || ''
    resolutionForm.improvementTagsText = feedback.improvementTags?.join(',') || ''
    resolutionForm.datasetStatus = feedback.datasetStatus || 'PENDING'
    detailVisible.value = true
  } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载反馈详情失败') }
}
const saveTriage = async () => {
  if (!detail.value || !canManage.value) return
  saving.value = true
  try { detail.value = await triageAssistantFeedback(detail.value.feedback.id, { status: triageForm.status, assigneeUserId: triageForm.assigneeUserId, note: triageForm.note }); ElMessage.success('分诊已保存'); await loadAll() }
  catch (error: any) { ElMessage.error(error?.response?.data?.message || '保存分诊失败') }
  finally { saving.value = false }
}
const saveResolution = async () => {
  if (!detail.value || !canManage.value) return
  saving.value = true
  try {
    detail.value = await resolveAssistantFeedback(detail.value.feedback.id, { status: resolutionForm.status, resolutionCode: resolutionForm.resolutionCode, resolutionNote: resolutionForm.resolutionNote, improvementTags: resolutionForm.improvementTagsText.split(',').map((item) => item.trim()).filter(Boolean), datasetStatus: resolutionForm.datasetStatus })
    ElMessage.success('处理结论已保存'); await loadAll()
  } catch (error: any) { ElMessage.error(error?.response?.data?.message || '保存处理结论失败') }
  finally { saving.value = false }
}
onMounted(loadAll)
</script>

<style scoped>
.assistant-feedback-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
.assistant-feedback-permission-alert { margin-bottom: 18px; }
.assistant-feedback-stat { padding: 18px 20px; border: 1px solid var(--app-border, #e5e7eb); border-radius: 16px; background: #fff; display: flex; justify-content: space-between; align-items: center; color: #64748b; }
.assistant-feedback-stat strong { font-size: 25px; color: #172033; }
.assistant-feedback-stat-danger strong { color: #dc2626; }
.assistant-feedback-filter-bar { display: flex; gap: 10px; margin-bottom: 16px; }
.assistant-feedback-filter-bar .el-input { max-width: 320px; }
.assistant-feedback-filter-bar .el-select { width: 150px; }
.assistant-feedback-row-main { display: flex; align-items: center; gap: 8px; min-width: 0; }
.assistant-feedback-vote { flex: none; font-size: 11px; }
.assistant-feedback-vote.is-down { color: #dc2626; }.assistant-feedback-vote.is-up { color: #059669; }
.assistant-feedback-row-question { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #172033; }
.assistant-feedback-row-sub { margin-top: 5px; color: #94a3b8; font-size: 12px; }
.assistant-feedback-pagination { display: flex; justify-content: flex-end; padding-top: 18px; }
.assistant-feedback-detail-section h3 { margin: 16px 0 8px; color: #172033; font-size: 14px; }.assistant-feedback-detail-section pre { max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0; padding: 12px; border-radius: 10px; background: #f8fafc; color: #334155; font: 13px/1.7 inherit; }
.assistant-feedback-detail-meta { display: flex; gap: 10px; align-items: center; color: #64748b; font-size: 12px; }.assistant-feedback-reason-list { margin-top: 10px; color: #dc2626; font-size: 12px; }
@media (max-width: 900px) { .assistant-feedback-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }.assistant-feedback-filter-bar { flex-wrap: wrap; }.assistant-feedback-filter-bar .el-input { max-width: none; width: 100%; } }
</style>
