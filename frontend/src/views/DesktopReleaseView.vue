<template>
  <div class="management-list-page desktop-release-view">
    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <button class="management-list-toolbar-button" type="button" :disabled="loading" @click="loadReleases">
          <el-icon><RefreshRight /></el-icon><span>刷新</span>
        </button>
        <span class="desktop-release-channel">Windows x64 · stable</span>
      </div>
      <div v-if="canManage" class="management-list-toolbar-side">
        <button class="management-list-create-button" type="button" @click="openCreate">
          <el-icon><Plus /></el-icon><span>创建桌面草稿</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <table class="management-list-table desktop-release-table mobile-card-table">
          <thead><tr><th>版本号</th><th>标题</th><th>状态</th><th>产物</th><th>发布时间</th><th class="right">操作</th></tr></thead>
          <tbody>
            <tr v-for="row in items" :key="row.id" class="management-list-row" @click="openDetail(row)">
              <td data-label="版本号"><span class="management-list-pill success">v{{ row.version }}</span></td>
              <td data-label="标题"><span class="management-list-title">{{ row.title }}</span></td>
              <td data-label="状态"><el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></td>
              <td data-label="产物"><span class="desktop-release-artifact-count">{{ row.artifactCount }} / 6</span></td>
              <td data-label="发布时间"><span class="management-list-updated">{{ formatDate(row.publishedAt || row.createdAt) }}</span></td>
              <td class="right" data-label="操作"><button class="management-list-row-button" type="button" title="查看发布详情" @click.stop="openDetail(row)"><el-icon><View /></el-icon></button><button v-if="row.status === 'REVOKED' && canManage" class="management-list-row-button danger" type="button" title="删除已撤回记录" @click.stop="handleDeleteRow(row)"><el-icon><Delete /></el-icon></button></td>
            </tr>
            <tr v-if="!loading && !items.length"><td colspan="6"><el-empty description="暂无桌面版本草稿或发布记录" /></td></tr>
          </tbody>
        </table>
      </div>
      <div class="management-list-footer">
        <div class="management-list-footer-total">共 <span>{{ pagination.total }}</span> 条</div>
        <div class="management-list-footer-controls"><div class="management-list-page-size management-list-compact-input"><span>每页</span><el-select v-model="pagination.size" size="small" style="width: 92px" @change="handleSizeChange"><el-option :value="10" label="10" /><el-option :value="20" label="20" /><el-option :value="50" label="50" /></el-select></div><div class="management-list-page-nav"><button class="management-list-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage"><el-icon><ArrowLeft /></el-icon></button><span class="management-list-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span><button class="management-list-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage"><el-icon><ArrowRight /></el-icon></button></div></div>
      </div>
    </section>

    <el-drawer v-model="drawerVisible" title="桌面版本发布" size="min(900px, 100vw)" destroy-on-close>
      <template v-if="detail">
        <div class="desktop-release-detail-head"><div><div class="desktop-release-detail-eyebrow">Windows x64 · stable</div><h2>GitPilot Desktop {{ detail.version }}</h2><p>{{ detail.title }} · {{ statusLabel(detail.status) }} · {{ formatDate(detail.publishedAt || detail.createdAt) }}</p></div><el-tag :type="statusType(detail.status)">{{ statusLabel(detail.status) }}</el-tag></div>
        <el-alert v-if="detail.status === 'DRAFT'" type="warning" :closable="false" show-icon title="草稿可继续替换产物；发布后版本和产物均不可编辑。" />
        <div class="desktop-release-detail-grid"><section><h3>发布说明</h3><pre class="desktop-release-notes">{{ detail.releaseNotes || '未填写发布说明' }}</pre></section><section><h3>产物矩阵 <small>{{ detail.artifacts.length }} / 6</small></h3><div class="desktop-release-artifacts"><div v-for="cell in artifactCells" :key="`${cell.kind}-${cell.bundle}`" class="desktop-release-artifact-cell" :class="{ uploaded: cell.artifact }"><div><strong>{{ artifactLabel(cell.kind) }}</strong><span>{{ cell.bundle.toUpperCase() }}</span></div><template v-if="cell.artifact"><p>{{ cell.artifact.fileName }}</p><small>{{ formatBytes(cell.artifact.fileSize) }} · SHA {{ cell.artifact.sha256.slice(0, 12) }}…</small></template><template v-else><p class="desktop-release-missing">待上传</p></template><button v-if="detail.status === 'DRAFT'" type="button" class="desktop-release-upload-button" :disabled="uploading" @click="pickArtifact(cell.kind, cell.bundle)"><el-icon><Upload /></el-icon>{{ cell.artifact ? '替换' : '上传' }}</button></div></div></section></div>
        <div class="desktop-release-actions"><el-button v-if="detail.status === 'DRAFT'" type="primary" :disabled="!canPublish" :loading="working" @click="handlePublish">发布版本</el-button><el-button v-if="detail.status === 'PUBLISHED'" type="danger" plain :loading="working" @click="handleRevoke">撤回版本</el-button><el-button v-if="detail.status === 'REVOKED'" type="danger" plain :loading="working" @click="handleDelete">删除记录</el-button><span v-if="detail.status === 'DRAFT' && !canPublish" class="desktop-release-action-hint">上传 MSI、NSIS 的安装器、updater ZIP 和 .sig 后才能发布。</span></div>
      </template>
    </el-drawer>

    <el-drawer v-model="createVisible" title="创建桌面版本草稿" size="min(660px, 100vw)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="desktop-release-form">
        <el-alert type="info" :closable="false" show-icon title="首期发布范围为 Windows x64 stable；Tauri updater 签名文件必须与构建产物匹配。" />
        <div class="desktop-release-form-grid"><el-form-item label="版本号" prop="version"><el-input v-model="form.version" maxlength="50" placeholder="例如 0.2.0" /></el-form-item><el-form-item label="发布标题" prop="title"><el-input v-model="form.title" maxlength="200" placeholder="例如 GitPilot Desktop 0.2.0" /></el-form-item></div>
        <el-form-item label="更新说明（Markdown）" prop="releaseNotes"><el-input v-model="form.releaseNotes" type="textarea" :rows="14" maxlength="50000" show-word-limit placeholder="填写功能、修复和升级注意事项" /></el-form-item>
      </el-form>
      <template #footer><div class="desktop-release-drawer-footer"><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="working" @click="handleCreate">创建草稿</el-button></div></template>
    </el-drawer>
    <input ref="fileInput" class="desktop-release-file-input" type="file" @change="handleFileChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Delete, Plus, RefreshRight, Upload, View } from '@element-plus/icons-vue'
import { createDesktopRelease, deleteDesktopRelease, getDesktopRelease, pageDesktopReleases, publishDesktopRelease, revokeDesktopRelease, uploadDesktopReleaseArtifact } from '@/api/desktop-release'
import { useAuthStore } from '@/stores/auth'
import type { DesktopArtifactKind, DesktopBundleType, DesktopReleaseDetail, DesktopReleaseStatus, DesktopReleaseSummary } from '@/types/desktop-release'

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:desktop-release:manage'))
const loading = ref(false)
const working = ref(false)
const uploading = ref(false)
const items = ref<DesktopReleaseSummary[]>([])
const detail = ref<DesktopReleaseDetail | null>(null)
const drawerVisible = ref(false)
const createVisible = ref(false)
const formRef = ref<FormInstance>()
const fileInput = ref<HTMLInputElement>()
const pendingArtifact = ref<{ kind: DesktopArtifactKind; bundle: DesktopBundleType } | null>(null)
const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const form = reactive({ version: '', title: '', releaseNotes: '' })
const rules: FormRules = { version: [{ required: true, message: '请输入版本号', trigger: 'blur' }], title: [{ required: true, message: '请输入发布标题', trigger: 'blur' }] }
const cells = computed(() => (['msi', 'nsis'] as DesktopBundleType[]).flatMap((bundle) => (['INSTALLER', 'UPDATER', 'SIGNATURE'] as DesktopArtifactKind[]).map((kind) => ({ kind, bundle }))))
const artifactCells = computed(() => cells.value.map((cell) => ({ ...cell, artifact: detail.value?.artifacts.find((item) => item.artifactKind === cell.kind && item.bundleType === cell.bundle && item.platform === 'windows' && item.arch === 'x86_64') })))
const canPublish = computed(() => detail.value?.status === 'DRAFT' && artifactCells.value.every((cell) => Boolean(cell.artifact)))

const statusLabel = (status: DesktopReleaseStatus) => ({ DRAFT: '草稿', PUBLISHED: '已发布', REVOKED: '已撤回' })[status]
const statusType = (status: DesktopReleaseStatus) => ({ DRAFT: 'warning', PUBLISHED: 'success', REVOKED: 'info' } as const)[status]
const artifactLabel = (kind: DesktopArtifactKind) => ({ INSTALLER: '安装器', UPDATER: 'Updater ZIP', SIGNATURE: '签名 .sig' })[kind]
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const loadReleases = async () => {
  loading.value = true
  try { const data = await pageDesktopReleases(pagination.page, pagination.size); items.value = data.records; pagination.total = data.total } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载桌面版本失败') } finally { loading.value = false }
}
const handleSizeChange = async () => { pagination.page = 1; await loadReleases() }
const handlePrevPage = async () => { if (pagination.page > 1) { pagination.page -= 1; await loadReleases() } }
const handleNextPage = async () => { if (pagination.page < totalPages.value) { pagination.page += 1; await loadReleases() } }
const openCreate = () => { form.version = ''; form.title = ''; form.releaseNotes = ''; createVisible.value = true }
const handleCreate = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  working.value = true
  try { detail.value = await createDesktopRelease({ ...form, channel: 'stable' }); drawerVisible.value = true; createVisible.value = false; await loadReleases(); ElMessage.success('桌面版本草稿已创建') } catch (error: any) { ElMessage.error(error?.response?.data?.message || '创建桌面版本失败') } finally { working.value = false }
}
const openDetail = async (row: DesktopReleaseSummary) => {
  try { detail.value = await getDesktopRelease(row.id); drawerVisible.value = true } catch (error: any) { ElMessage.error(error?.response?.data?.message || '加载桌面版本详情失败') }
}
const pickArtifact = (kind: DesktopArtifactKind, bundle: DesktopBundleType) => { pendingArtifact.value = { kind, bundle }; if (fileInput.value) { fileInput.value.value = ''; fileInput.value.click() } }
const handleFileChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  const pending = pendingArtifact.value
  if (!file || !pending || !detail.value) return
  uploading.value = true
  try { await uploadDesktopReleaseArtifact(detail.value.id, pending.kind, pending.bundle, file); detail.value = await getDesktopRelease(detail.value.id); ElMessage.success(`${artifactLabel(pending.kind)}上传成功`) } catch (error: any) { ElMessage.error(error?.response?.data?.message || '上传桌面产物失败') } finally { uploading.value = false; pendingArtifact.value = null }
}
const handlePublish = async () => {
  if (!detail.value || !canPublish.value) return
  await ElMessageBox.confirm('发布后版本和产物不可编辑，并会立即对 Desktop 客户端公开。确认发布吗？', '确认发布', { type: 'warning', confirmButtonText: '确认发布', cancelButtonText: '取消' })
  working.value = true
  try { detail.value = await publishDesktopRelease(detail.value.id); await loadReleases(); ElMessage.success('桌面版本已发布') } catch (error: any) { ElMessage.error(error?.response?.data?.message || '发布桌面版本失败') } finally { working.value = false }
}
const handleRevoke = async () => {
  if (!detail.value) return
  await ElMessageBox.confirm('撤回后新客户端将无法继续下载该版本，已安装客户端不会自动降级。确认撤回吗？', '确认撤回', { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' })
  working.value = true
  try { detail.value = await revokeDesktopRelease(detail.value.id); await loadReleases(); ElMessage.success('桌面版本已撤回') } catch (error: any) { ElMessage.error(error?.response?.data?.message || '撤回桌面版本失败') } finally { working.value = false }
}
const handleDelete = async () => {
  if (!detail.value) return
  await ElMessageBox.confirm('删除后将释放该版本号，可重新创建同版本草稿，已删除的记录和产物无法恢复。确认删除吗？', '确认删除', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  working.value = true
  try { await deleteDesktopRelease(detail.value.id); drawerVisible.value = false; detail.value = null; await loadReleases(); ElMessage.success('已撤回的桌面版本已删除') } catch (error: any) { ElMessage.error(error?.response?.data?.message || '删除桌面版本失败') } finally { working.value = false }
}
const handleDeleteRow = async (row: DesktopReleaseSummary) => {
  await ElMessageBox.confirm(`删除后将释放版本号 v${row.version}，可重新创建同版本草稿，已删除的记录和产物无法恢复。确认删除吗？`, '确认删除', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  working.value = true
  try { await deleteDesktopRelease(row.id); if (detail.value?.id === row.id) { drawerVisible.value = false; detail.value = null } await loadReleases(); ElMessage.success('已撤回的桌面版本已删除') } catch (error: any) { ElMessage.error(error?.response?.data?.message || '删除桌面版本失败') } finally { working.value = false }
}
onMounted(loadReleases)
</script>

<style scoped>
.desktop-release-channel { color: var(--app-text-muted, #64748b); font-size: 12px; }
.desktop-release-table { min-width: 800px; }
.desktop-release-artifact-count { color: var(--app-text-secondary, #475569); font-family: var(--app-font-mono, monospace); font-size: 12px; }
.desktop-release-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.desktop-release-detail-eyebrow { color: var(--app-primary, #c46a3a); font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.desktop-release-detail-head h2 { margin: 8px 0 5px; color: var(--app-text, #172033); font-size: 24px; }
.desktop-release-detail-head p { margin: 0; color: var(--app-text-muted, #64748b); font-size: 12px; }
.desktop-release-detail-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 24px; margin-top: 22px; }
.desktop-release-detail-grid h3 { margin: 0 0 12px; color: var(--app-text, #172033); font-size: 15px; }
.desktop-release-detail-grid h3 small { color: var(--app-text-muted, #64748b); font-size: 11px; font-weight: 500; }
.desktop-release-notes { min-height: 260px; margin: 0; border: 1px solid var(--app-outline, #e2e8f0); border-radius: 12px; background: #f8fafc; padding: 14px; color: #475569; font: 12px/1.75 var(--app-font-mono, monospace); white-space: pre-wrap; }
.desktop-release-artifacts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.desktop-release-artifact-cell { position: relative; display: grid; gap: 7px; min-width: 0; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 12px; background: #f8fafc; }
.desktop-release-artifact-cell.uploaded { border-style: solid; border-color: rgba(47, 111, 62, .35); background: rgba(47, 111, 62, .045); }
.desktop-release-artifact-cell > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.desktop-release-artifact-cell strong { color: var(--app-text, #172033); font-size: 12px; }
.desktop-release-artifact-cell > div span { color: var(--app-text-muted, #64748b); font-size: 10px; font-weight: 800; }
.desktop-release-artifact-cell p { overflow: hidden; margin: 0; color: #475569; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.desktop-release-artifact-cell small { overflow: hidden; color: #94a3b8; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.desktop-release-missing { color: #94a3b8 !important; }
.desktop-release-upload-button { justify-self: start; display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; padding: 0; color: var(--app-primary, #c46a3a); font-size: 11px; font-weight: 800; }
.desktop-release-upload-button:disabled { opacity: .5; }
.desktop-release-actions { display: flex; align-items: center; gap: 12px; margin-top: 26px; }
.desktop-release-action-hint { color: #b7791f; font-size: 12px; }
.desktop-release-form { padding: 0 4px; }
.desktop-release-form-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 16px; margin-top: 18px; }
.desktop-release-drawer-footer { display: flex; justify-content: flex-end; gap: 10px; }
.desktop-release-file-input { display: none; }
@media (max-width: 760px) { .desktop-release-detail-grid, .desktop-release-form-grid { grid-template-columns: 1fr; } .desktop-release-artifacts { grid-template-columns: 1fr; } }
</style>
