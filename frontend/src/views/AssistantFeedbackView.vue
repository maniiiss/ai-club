<template>
  <div class="management-list-page assistant-feedback-view">
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

    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索问题、回答或补充说明"
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="feedbackFilterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="management-list-popper">
          <template #reference>
            <button class="management-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="management-list-filter-panel management-list-compact-input">
            <div class="management-list-filter-field">
              <label>评价方向</label>
              <el-select v-model="filters.vote" clearable placeholder="全部" style="width: 100%" :teleported="false">
                <el-option label="点踩" value="DOWN" />
                <el-option label="点赞" value="UP" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>处理状态</label>
              <el-select v-model="filters.status" clearable placeholder="全部" style="width: 100%" :teleported="false">
                <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="management-list-filter-field">
              <label>数据集状态</label>
              <el-select v-model="filters.datasetStatus" clearable placeholder="全部" style="width: 100%" :teleported="false">
                <el-option label="待标记" value="PENDING" />
                <el-option label="已纳入" value="INCLUDED" />
                <el-option label="已排除" value="EXCLUDED" />
              </el-select>
            </div>
            <div class="management-list-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="management-list-toolbar-button" type="button" :disabled="loading" @click="loadAll">
          <el-icon><RefreshRight /></el-icon>
          <span>刷新</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <table class="management-list-table assistant-feedback-table mobile-card-table">
          <thead>
            <tr>
              <th class="feedback-col-main">反馈</th>
              <th class="feedback-col-reason">原因</th>
              <th class="feedback-col-status">状态</th>
              <th class="feedback-col-dataset">数据集</th>
              <th class="feedback-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id" class="management-list-row">
              <td class="feedback-col-main" data-label="反馈">
                <button class="management-list-title-trigger" type="button" @click="openDetail(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-pill" :class="row.vote === 'DOWN' ? 'danger' : 'success'">{{ row.vote === 'DOWN' ? '点踩' : '点赞' }}</span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">{{ row.questionSnapshot || '暂无问题快照' }}</div>
                      <div class="management-list-subtitle">{{ row.submitterNickname || row.submitterUsername }} · {{ row.createdAt || '-' }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td class="feedback-col-reason" data-label="原因">
                <span class="management-list-empty">{{ resolveReasons(row.reasonCodes) }}</span>
              </td>
              <td class="feedback-col-status" data-label="状态">
                <span class="management-list-pill" :class="statusPillClass(row.status)">{{ statusLabel(row.status) }}</span>
              </td>
              <td class="feedback-col-dataset" data-label="数据集">
                <span class="management-list-empty">{{ datasetLabel(row.datasetStatus) }}</span>
              </td>
              <td class="feedback-col-actions right" data-label="操作">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="处理反馈" @click.stop="openDetail(row)">
                    <el-icon><View /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && !items.length">
              <td colspan="5"><el-empty description="暂无符合条件的反馈" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="management-list-footer">
        <div class="management-list-footer-total">共 <span>{{ pagination.total }}</span> 条</div>
        <div class="management-list-footer-controls">
          <div class="management-list-page-size management-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange">
              <el-option :value="10" label="10" />
              <el-option :value="20" label="20" />
              <el-option :value="50" label="50" />
              <el-option :value="100" label="100" />
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
import { ArrowLeft, ArrowRight, Filter, RefreshRight, Search, View } from '@element-plus/icons-vue'
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
const feedbackFilterPopoverVisible = ref(false)
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:assistant-feedback:manage'))
const stats = reactive<AssistantFeedbackStats>({ newCount: 0, inProgressCount: 0, resolvedCount: 0, negativeCount: 0, totalCount: 0 })
const filters = reactive({ keyword: '', vote: '', status: '', datasetStatus: '' })
const pagination = reactive({ page: 1, size: 20, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const triageForm = reactive({ status: 'NEW', assigneeUserId: null as number | null, note: '' })
const resolutionForm = reactive({ status: 'RESOLVED', resolutionCode: 'PROMPT_FIX', resolutionNote: '', improvementTagsText: '', datasetStatus: 'PENDING' })

const statusLabel = (value: string) => statusOptions.find((item) => item.value === value)?.label || value
/** 反馈状态映射为列表药片色调，与其它管理列表的状态标签保持一致。 */
const statusPillClass = (value: string) => {
  if (value === 'RESOLVED' || value === 'AUTO_CLOSED') return 'success'
  if (value === 'REJECTED' || value === 'DUPLICATE') return 'neutral'
  if (value === 'IN_PROGRESS') return 'warning'
  return 'danger'
}
const datasetLabel = (value: string) => ({ PENDING: '待标记', INCLUDED: '已纳入', EXCLUDED: '已排除' }[value] || value)
const resolveReasons = (values: string[]) => values?.map((value) => reasonLabels[value] || value).join('、') || '-'
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
const handleSearch = async () => { feedbackFilterPopoverVisible.value = false; pagination.page = 1; await loadItems() }
/** 清空全部筛选条件并回到第一页，便于运营快速切换查看范围。 */
const handleReset = async () => {
  filters.keyword = ''
  filters.vote = ''
  filters.status = ''
  filters.datasetStatus = ''
  feedbackFilterPopoverVisible.value = false
  pagination.page = 1
  await loadItems()
}
const handleSizeChange = async () => { pagination.page = 1; await loadItems() }
const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadItems()
}
const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadItems()
}
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
.assistant-feedback-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.assistant-feedback-permission-alert { margin-bottom: 0; }
.assistant-feedback-stat { padding: 18px 20px; border: 1px solid var(--app-border, #e5e7eb); border-radius: 16px; background: #fff; display: flex; justify-content: space-between; align-items: center; color: #64748b; }
.assistant-feedback-stat strong { font-size: 25px; color: #172033; }
.assistant-feedback-stat-danger strong { color: #dc2626; }
.assistant-feedback-table { min-width: 880px; }
.feedback-col-main { width: 40%; }
.feedback-col-reason { width: 22%; }
.feedback-col-status { width: 120px; }
.feedback-col-dataset { width: 100px; }
.feedback-col-actions { width: 72px; }
.assistant-feedback-detail-section h3 { margin: 16px 0 8px; color: #172033; font-size: 14px; }.assistant-feedback-detail-section pre { max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0; padding: 12px; border-radius: 10px; background: #f8fafc; color: #334155; font: 13px/1.7 inherit; }
.assistant-feedback-detail-meta { display: flex; gap: 10px; align-items: center; color: #64748b; font-size: 12px; }.assistant-feedback-reason-list { margin-top: 10px; color: #dc2626; font-size: 12px; }
@media (max-width: 900px) { .assistant-feedback-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
