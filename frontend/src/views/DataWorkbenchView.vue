<template>
  <div class="management-list-page data-workbench-page">
    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <div class="gitlab-tab-switcher" role="tablist" aria-label="DataWorkbench 页面切换">
          <button v-for="tab in tabs" :key="tab.key" class="gitlab-tab-button" :class="{ active: activeTab === tab.key }" type="button" @click="activeTab = tab.key">
            {{ tab.label }}
          </button>
        </div>
        <span class="management-list-toolbar-divider" aria-hidden="true"></span>
        <button class="management-list-toolbar-button" type="button" @click="reloadActiveTab">
          <el-icon><RefreshRight /></el-icon>
          <span>刷新</span>
        </button>
        <button v-if="activeTab === 'config' && canConfig" class="management-list-toolbar-button primary" type="button" @click="openEntityDialog()">
          <el-icon><Plus /></el-icon>
          <span>新增实体</span>
        </button>
      </div>
    </section>

    <section v-if="activeTab === 'requests' || activeTab === 'approvals'" class="management-list-shell">
      <div class="management-list-table-scroll" v-loading="loading">
        <table class="management-list-table data-change-table">
          <thead>
            <tr>
              <th>工单</th>
              <th>项目/实体</th>
              <th>状态</th>
              <th>风险</th>
              <th>影响</th>
              <th>申请人</th>
              <th class="right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in requestList" :key="row.id" class="management-list-row">
              <td>
                <button class="management-list-title-trigger" type="button" @click="openRequestDetail(row)">
                  <div class="management-list-title-cell">
                    <span class="management-list-title-icon"><el-icon><DataAnalysis /></el-icon></span>
                    <div class="management-list-title-copy">
                      <div class="management-list-title">#{{ row.id }} {{ row.originalText }}</div>
                      <div class="management-list-subtitle">{{ row.previewSqlSummary }}</div>
                    </div>
                  </div>
                </button>
              </td>
              <td>
                <div class="management-list-title">{{ row.projectName }}</div>
                <div class="management-list-subtitle">{{ row.entityName }}</div>
              </td>
              <td>
                <span class="management-list-pill" :class="statusTone(row.approvalStatus)">{{ approvalLabel(row.approvalStatus) }}</span>
                <span class="management-list-pill" :class="statusTone(row.executionStatus)">{{ executionLabel(row.executionStatus) }}</span>
              </td>
              <td><span class="management-list-pill" :class="riskTone(row.riskLevel)">{{ row.riskLevel }}</span></td>
              <td>{{ row.affectedRows }} 行</td>
              <td>{{ row.requesterName || '-' }}</td>
              <td class="right">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="查看审计" @click="openRequestDetail(row)">
                    <el-icon><View /></el-icon>
                  </button>
                  <button v-if="canApprove && row.approvalStatus === 'PENDING'" class="management-list-row-button" type="button" title="审批通过" @click="handleApprove(row.id)">
                    <el-icon><Check /></el-icon>
                  </button>
                  <button v-if="canExecute && canExecuteRow(row)" class="management-list-row-button" type="button" title="执行" @click="handleExecute(row.id)">
                    <el-icon><Promotion /></el-icon>
                  </button>
                  <button v-if="canRollback && row.executionStatus === 'EXECUTED' && row.rollbackStatus !== 'ROLLED_BACK'" class="management-list-row-button danger" type="button" title="回滚" @click="handleRollback(row.id)">
                    <el-icon><RefreshLeft /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <el-empty v-if="!requestList.length && !loading" description="暂无数据变更工单" />
      </div>
    </section>

    <section v-if="activeTab === 'audit'" class="management-list-shell">
      <div class="data-workbench-empty">
        <el-empty description="请选择变更工单查看 before / after 审计快照" />
      </div>
    </section>

    <section v-if="activeTab === 'config'" class="management-list-shell">
      <div class="management-list-table-scroll" v-loading="loading">
        <table class="management-list-table">
          <thead>
            <tr>
              <th>实体</th>
              <th>表结构</th>
              <th>字段</th>
              <th>权限</th>
              <th>阈值</th>
              <th class="right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entity in entityList" :key="entity.id" class="management-list-row">
              <td>
                <div class="management-list-title">{{ entity.entityName }}</div>
                <div class="management-list-subtitle">{{ entity.entityCode }}</div>
              </td>
              <td>
                <div class="management-list-title">{{ entity.tableName }}</div>
                <div class="management-list-subtitle">PK {{ entity.primaryKeyColumn }} / 项目 {{ entity.projectIdColumn }}</div>
              </td>
              <td>
                <span class="management-list-pill info">{{ entity.fields.length }} 字段</span>
                <span class="management-list-pill success">{{ entity.fields.filter((field) => field.updatable).length }} 可改</span>
                <span class="management-list-pill neutral">{{ entity.fields.filter((field) => field.locator).length }} 定位</span>
              </td>
              <td>
                <div class="management-list-subtitle">请求 {{ scopeLabel(entity.requestScope) }}</div>
                <div class="management-list-subtitle">执行 {{ scopeLabel(entity.executeScope) }}</div>
              </td>
              <td>{{ entity.maxAffectedRows }} 行</td>
              <td class="right">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="编辑实体" @click="openEntityDialog(entity)">
                    <el-icon><EditPen /></el-icon>
                  </button>
                  <button v-if="canConfig" class="management-list-row-button danger" type="button" title="删除实体" @click="handleDeleteEntity(entity.id)">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <el-empty v-if="!entityList.length && !loading" description="暂无实体配置" />
      </div>
    </section>

    <section v-if="activeTab === 'capabilities'" class="management-list-shell">
      <div class="data-workbench-capability-grid">
        <article v-for="item in capabilityItems" :key="item.code" class="data-workbench-capability">
          <div class="data-workbench-capability-icon"><el-icon><DataAnalysis /></el-icon></div>
          <div>
            <h3>{{ item.name }}</h3>
            <p>{{ item.description }}</p>
            <span class="management-list-pill" :class="item.enabled ? 'success' : 'neutral'">{{ item.enabled ? '已启用' : '规划中' }}</span>
          </div>
        </article>
      </div>
    </section>

    <el-dialog v-model="requestDetailVisible" title="数据变更审计" width="860px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader title="数据变更审计" :subtitle="currentRequest ? `#${currentRequest.id} ${currentRequest.entityName}` : '查看执行快照'" :icon="DataAnalysis" />
      </template>
      <div v-if="currentRequest" class="data-workbench-detail">
        <p>{{ currentRequest.originalText }}</p>
        <pre>{{ JSON.stringify(currentRequest.dsl, null, 2) }}</pre>
        <div v-for="audit in audits" :key="audit.id" class="data-workbench-audit-card">
          <strong>主键 {{ audit.primaryKeyValue }}</strong>
          <div class="data-workbench-audit-grid">
            <pre>{{ JSON.stringify(audit.beforeSnapshot, null, 2) }}</pre>
            <pre>{{ JSON.stringify(audit.afterSnapshot, null, 2) }}</pre>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="requestDetailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="entityDialogVisible" :title="entityDialogTitle" width="860px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="entityDialogTitle" subtitle="维护实体、字段白名单、定位规则和数据权限范围" :icon="DataAnalysis" />
      </template>
      <el-form label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="data-workbench-form-grid">
            <el-form-item label="实体编码"><el-input v-model="entityForm.entityCode" /></el-form-item>
            <el-form-item label="实体名称"><el-input v-model="entityForm.entityName" /></el-form-item>
            <el-form-item label="表名"><el-input v-model="entityForm.tableName" /></el-form-item>
            <el-form-item label="主键列"><el-input v-model="entityForm.primaryKeyColumn" /></el-form-item>
            <el-form-item label="项目列"><el-input v-model="entityForm.projectIdColumn" /></el-form-item>
            <el-form-item label="最大影响行数"><el-input-number v-model="entityForm.maxAffectedRows" :min="1" /></el-form-item>
            <el-form-item label="请求范围"><el-select v-model="entityForm.requestScope"><el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="执行范围"><el-select v-model="entityForm.executeScope"><el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="回滚范围"><el-select v-model="entityForm.rollbackScope"><el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="启用"><el-switch v-model="entityForm.enabled" /></el-form-item>
          </div>
          <el-form-item label="描述"><el-input v-model="entityForm.description" type="textarea" :rows="2" /></el-form-item>
          <div class="data-workbench-field-head">
            <strong>字段配置</strong>
            <el-button size="small" @click="addField">新增字段</el-button>
          </div>
          <div v-for="(field, index) in entityForm.fields" :key="index" class="data-workbench-field-row">
            <el-input v-model="field.fieldCode" placeholder="字段编码" />
            <el-input v-model="field.fieldName" placeholder="字段名称" />
            <el-input v-model="field.columnName" placeholder="列名" />
            <el-select v-model="field.dataType" placeholder="类型">
              <el-option label="STRING" value="STRING" />
              <el-option label="BOOLEAN" value="BOOLEAN" />
              <el-option label="LONG" value="LONG" />
              <el-option label="INTEGER" value="INTEGER" />
            </el-select>
            <el-input v-model="field.synonyms" placeholder="同义词" />
            <el-checkbox v-model="field.updatable">可改</el-checkbox>
            <el-checkbox v-model="field.locator">定位</el-checkbox>
            <el-checkbox v-model="field.sensitive">敏感</el-checkbox>
            <button class="management-list-row-button danger" type="button" @click="entityForm.fields.splice(index, 1)">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="entityDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitEntity">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, DataAnalysis, Delete, EditPen, Plus, Promotion, RefreshLeft, RefreshRight, View } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import {
  approveDataChangeRequest,
  createDataWorkbenchEntity,
  deleteDataWorkbenchEntity,
  executeDataChangeRequest,
  listDataChangeAudits,
  listDataWorkbenchEntities,
  pageDataChangeRequests,
  rollbackDataChangeRequest,
  updateDataWorkbenchEntity
} from '@/api/access'
import { useAuthStore } from '@/stores/auth'
import type { DataChangeAuditItem, DataChangeRequestItem, DataPermissionScopeValue, DataWorkbenchEntityItem, DataWorkbenchFieldItem } from '@/types/platform'

type TabKey = 'requests' | 'approvals' | 'audit' | 'config' | 'capabilities'

const authStore = useAuthStore()
const canApprove = computed(() => authStore.hasPermission('data-workbench:approve'))
const canExecute = computed(() => authStore.hasPermission('data-workbench:execute'))
const canRollback = computed(() => authStore.hasPermission('data-workbench:rollback'))
const canConfig = computed(() => authStore.hasPermission('data-workbench:config'))
const tabs = [
  { key: 'requests', label: '变更处理' },
  { key: 'approvals', label: '审批队列' },
  { key: 'audit', label: '执行审计' },
  { key: 'config', label: '实体配置' },
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
const entityDialogTitle = computed(() => editingEntityId.value ? '编辑数据实体' : '新增数据实体')
const capabilityItems = [
  { code: 'data-change', name: 'DataChange', description: '自然语言提交受控数据变更，支持审批、执行审计和冲突回滚。', enabled: true },
  { code: 'data-query', name: 'DataQuery', description: '后续接入受控数据查询与导出。', enabled: false },
  { code: 'data-import', name: 'DataImport', description: '后续接入模板化导入和批量校验。', enabled: false },
  { code: 'reconcile', name: '数据对账', description: '后续接入跨系统对账和差异修复。', enabled: false }
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
  projectIdColumn: 'project_id',
  maxAffectedRows: 1,
  requestScope: 'PROJECT_PARTICIPANT' as DataPermissionScopeValue,
  executeScope: 'OWNER_OR_CREATOR' as DataPermissionScopeValue,
  rollbackScope: 'OWNER_OR_CREATOR' as DataPermissionScopeValue,
  enabled: true,
  fields: [] as Array<Omit<DataWorkbenchFieldItem, 'id'> & { id?: number | null }>
})

watch(activeTab, () => reloadActiveTab())
onMounted(reloadActiveTab)

async function reloadActiveTab() {
  if (activeTab.value === 'config') {
    await loadEntities()
  } else if (activeTab.value === 'requests' || activeTab.value === 'approvals') {
    await loadRequests()
  }
}

async function loadRequests() {
  loading.value = true
  try {
    const data = await pageDataChangeRequests({
      page: 1,
      size: 50,
      approvalStatus: activeTab.value === 'approvals' ? 'PENDING' : undefined
    })
    requestList.value = data.records
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
  audits.value = await listDataChangeAudits(row.id)
  requestDetailVisible.value = true
}

async function handleApprove(id: number) {
  await approveDataChangeRequest(id)
  ElMessage.success('审批已通过')
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
  entityForm.projectIdColumn = entity?.projectIdColumn ?? 'project_id'
  entityForm.maxAffectedRows = entity?.maxAffectedRows ?? 1
  entityForm.requestScope = entity?.requestScope ?? 'PROJECT_PARTICIPANT'
  entityForm.executeScope = entity?.executeScope ?? 'OWNER_OR_CREATOR'
  entityForm.rollbackScope = entity?.rollbackScope ?? 'OWNER_OR_CREATOR'
  entityForm.enabled = entity?.enabled ?? true
  entityForm.fields = entity?.fields.map((field) => ({ ...field })) ?? []
  entityDialogVisible.value = true
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

function approvalLabel(value: string) {
  return ({ PENDING: '待审批', APPROVED: '已审批', REJECTED: '已驳回', NOT_REQUIRED: '免审批' } as Record<string, string>)[value] || value
}

function executionLabel(value: string) {
  return ({ SUBMITTED: '待执行', EXECUTING: '执行中', EXECUTED: '已执行', REJECTED: '已终止' } as Record<string, string>)[value] || value
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
</script>

<style scoped>
.data-workbench-page {
  gap: 14px;
}

.data-change-table th:first-child,
.data-change-table td:first-child {
  width: 36%;
}

.data-workbench-empty {
  padding: 48px;
}

.data-workbench-capability-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  padding: 18px;
}

.data-workbench-capability {
  display: flex;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--management-border);
  border-radius: 8px;
  background: var(--management-card-bg);
}

.data-workbench-capability h3 {
  margin: 0 0 6px;
  font-size: 15px;
}

.data-workbench-capability p {
  margin: 0 0 10px;
  color: var(--management-text-secondary);
  font-size: 13px;
}

.data-workbench-capability-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #eef2ff;
  color: #4f46e5;
}

.data-workbench-detail pre,
.data-workbench-audit-card pre {
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}

.data-workbench-audit-card {
  margin-top: 14px;
}

.data-workbench-audit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.data-workbench-form-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.data-workbench-field-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0;
}

.data-workbench-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 120px 1fr auto auto auto auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
</style>
