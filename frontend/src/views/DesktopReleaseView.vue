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
        <div v-if="batchUploading" class="desktop-release-batch-progress"><div class="desktop-release-batch-progress-head"><span>批量上传中 {{ batchProgress.done }} / {{ batchProgress.total }}</span><span class="desktop-release-batch-progress-file">{{ batchProgress.currentFile }}</span></div><el-progress :percentage="batchProgress.percent" :show-text="false" :stroke-width="6" /></div>
        <div class="desktop-release-detail-grid"><section><h3>发布说明</h3><pre class="desktop-release-notes">{{ detail.releaseNotes || '未填写发布说明' }}</pre></section><section><div class="desktop-release-matrix-head"><h3>产物矩阵 <small>{{ detail.artifacts.length }} / 6</small></h3><button v-if="detail.status === 'DRAFT'" type="button" class="desktop-release-batch-button" :disabled="uploading || batchUploading" @click="pickDirectory"><el-icon><FolderOpened /></el-icon>上传产物目录</button></div><div class="desktop-release-artifacts"><div v-for="cell in artifactCells" :key="`${cell.kind}-${cell.bundle}`" class="desktop-release-artifact-cell" :class="{ uploaded: cell.artifact }"><div><strong>{{ artifactLabel(cell.kind) }}</strong><span>{{ cell.bundle.toUpperCase() }}</span></div><template v-if="cell.artifact"><p>{{ cell.artifact.fileName }}</p><small>{{ formatBytes(cell.artifact.fileSize) }} · SHA {{ cell.artifact.sha256.slice(0, 12) }}…</small></template><template v-else><p class="desktop-release-missing">待上传</p></template><button v-if="detail.status === 'DRAFT'" type="button" class="desktop-release-upload-button" :disabled="uploading || batchUploading" @click="pickArtifact(cell.kind, cell.bundle)"><el-icon><Upload /></el-icon>{{ cell.artifact ? '替换' : '上传' }}</button></div></div></section></div>
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
    <input ref="dirInput" class="desktop-release-file-input" type="file" webkitdirectory @change="handleDirChange" />
    <el-dialog v-model="batchVisible" title="确认批量上传产物" width="min(720px, 96vw)" destroy-on-close>
      <template v-if="batchPlan">
        <el-alert v-if="batchPlan.versionBlocked" type="error" :closable="false" show-icon class="desktop-release-batch-alert" :title="batchPlan.versionBlocked" />
        <el-alert v-else-if="batchPlan.versionWarning" type="warning" :closable="false" show-icon class="desktop-release-batch-alert" :title="batchPlan.versionWarning" />
        <table class="desktop-release-batch-table">
          <thead><tr><th>产物槽位</th><th>匹配文件</th><th class="right">大小</th></tr></thead>
          <tbody>
            <tr v-for="row in batchPlan.rows" :key="`${row.kind}-${row.bundle}`" :class="{ missing: !row.file }">
              <td>{{ row.label }}</td>
              <td>{{ row.file ? row.file.name : '未匹配，可稍后手动上传' }}</td>
              <td class="right">{{ row.file ? formatBytes(row.file.size) : '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="batchPlan.ignoredCount" class="desktop-release-batch-ignored">已忽略 {{ batchPlan.ignoredCount }} 个不在产物矩阵内的文件：{{ batchPlan.ignoredPreview.join('、') }}{{ batchPlan.ignoredCount > batchPlan.ignoredPreview.length ? ' 等' : '' }}</p>
      </template>
      <template #footer><div class="desktop-release-drawer-footer"><el-button @click="batchVisible = false">取消</el-button><el-button type="primary" :disabled="!batchPlan || !batchPlan.fileCount || !!batchPlan.versionBlocked" @click="handleBatchUpload">开始上传（{{ batchPlan?.fileCount ?? 0 }} 个文件）</el-button></div></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Delete, FolderOpened, Plus, RefreshRight, Upload, View } from '@element-plus/icons-vue'
import { createDesktopRelease, deleteDesktopRelease, getDesktopRelease, pageDesktopReleases, publishDesktopRelease, revokeDesktopRelease, uploadDesktopReleaseArtifact } from '@/api/desktop-release'
import { useAuthStore } from '@/stores/auth'
import type { DesktopArtifactKind, DesktopBundleType, DesktopReleaseArtifact, DesktopReleaseDetail, DesktopReleaseStatus, DesktopReleaseSummary } from '@/types/desktop-release'

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
const dirInput = ref<HTMLInputElement>()
const pendingArtifact = ref<{ kind: DesktopArtifactKind; bundle: DesktopBundleType } | null>(null)
/** 批量目录上传：文件名后缀 → 产物矩阵槽位的有序匹配规则，先命中先占用；.msi.sig / .exe.sig / release-artifacts.json 天然落不进任何规则，自动忽略。 */
const BATCH_MATCH_RULES: Array<{ suffix: string; kind: DesktopArtifactKind; bundle: DesktopBundleType }> = [
  { suffix: '.msi.zip.sig', kind: 'SIGNATURE', bundle: 'msi' },
  { suffix: '.nsis.zip.sig', kind: 'SIGNATURE', bundle: 'nsis' },
  { suffix: '.msi.zip', kind: 'UPDATER', bundle: 'msi' },
  { suffix: '.nsis.zip', kind: 'UPDATER', bundle: 'nsis' },
  { suffix: '.msi', kind: 'INSTALLER', bundle: 'msi' },
  { suffix: '.exe', kind: 'INSTALLER', bundle: 'nsis' }
]
/** 从产物文件名里提取内嵌 semver，例如 GitPilot_0.1.4_x64_en-US.msi → 0.1.4。 */
const FILE_VERSION_RE = /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/
/** 确认弹窗里的一行：槽位 + 匹配到的文件（可能缺失）。 */
interface BatchPlanRow { kind: DesktopArtifactKind; bundle: DesktopBundleType; label: string; file: File | null }
interface BatchPlan { rows: BatchPlanRow[]; fileCount: number; ignoredCount: number; ignoredPreview: string[]; versionWarning: string | null; versionBlocked: string | null }
const batchVisible = ref(false)
const batchUploading = ref(false)
const batchPlan = ref<BatchPlan | null>(null)
const batchProgress = reactive({ done: 0, total: 0, percent: 0, currentFile: '' })
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

/** 把上传成功的产物即时写回详情，让产物矩阵在批量上传过程中逐格点亮。 */
const applyArtifactLocally = (artifact: DesktopReleaseArtifact) => {
  if (!detail.value) return
  const rest = detail.value.artifacts.filter((item) => !(item.artifactKind === artifact.artifactKind && item.bundleType === artifact.bundleType && item.platform === artifact.platform && item.arch === artifact.arch))
  detail.value.artifacts = [...rest, artifact]
}

const pickDirectory = () => { if (dirInput.value) { dirInput.value.value = ''; dirInput.value.click() } }

/** 选择 release-artifacts 版本目录后：解析清单、按后缀匹配 6 个槽位、做版本一致性校验，然后弹出确认弹窗。 */
const handleDirChange = async (event: Event) => {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  if (!files.length || !detail.value) return
  if (files.length > 100) { ElMessage.error(`选中了 ${files.length} 个文件，目录可能选得过大；请直接选择版本目录（例如 release-artifacts/0.1.4）`); return }
  const draftVersion = detail.value.version.replace(/^v/i, '')
  // release-artifacts.json 是构建侧生成的权威清单，存在时用它的 version 做强校验。
  let manifestVersion: string | null = null
  const manifestFile = files.find((file) => file.name === 'release-artifacts.json')
  if (manifestFile) {
    try { const parsed = JSON.parse(await manifestFile.text()); if (typeof parsed?.version === 'string') manifestVersion = parsed.version } catch { /* 清单解析失败时退回文件名版本校验 */ }
  }
  const candidates = new Map<string, File[]>()
  const ignored: string[] = []
  for (const file of files) {
    const name = file.name.toLowerCase()
    const rule = BATCH_MATCH_RULES.find((item) => name.endsWith(item.suffix))
    if (!rule) { ignored.push(file.name); continue }
    const key = `${rule.kind}:${rule.bundle}`
    candidates.set(key, [...(candidates.get(key) ?? []), file])
  }
  const rows: BatchPlanRow[] = []
  const mismatchedVersions = new Set<string>()
  for (const cell of cells.value) {
    let list = candidates.get(`${cell.kind}:${cell.bundle}`) ?? []
    if (list.length > 1) {
      // 误选了包含多个版本的父目录时，优先保留文件名内嵌版本与草稿一致的产物。
      const preferred = list.filter((file) => FILE_VERSION_RE.exec(file.name)?.[1]?.replace(/^v/i, '') === draftVersion)
      if (preferred.length) list = preferred
    }
    if (list.length > 1) { ElMessage.error(`多个文件匹配「${artifactLabel(cell.kind)} · ${cell.bundle.toUpperCase()}」槽位：${list.map((file) => file.name).join('、')}；请选择具体版本目录`); return }
    const file = list[0] ?? null
    const fileVersion = file ? FILE_VERSION_RE.exec(file.name)?.[1]?.replace(/^v/i, '') : undefined
    if (fileVersion && fileVersion !== draftVersion) mismatchedVersions.add(fileVersion)
    rows.push({ kind: cell.kind, bundle: cell.bundle, label: `${artifactLabel(cell.kind)} · ${cell.bundle.toUpperCase()}`, file })
  }
  const fileCount = rows.filter((row) => row.file).length
  if (!fileCount) { ElMessage.error('所选目录中没有匹配到任何桌面发布产物，请确认选择的是 release-artifacts 版本目录'); return }
  // Tauri updater 签名与构建产物强绑定，清单版本不一致时直接阻断，防止把别的版本产物传进当前草稿。
  let versionBlocked: string | null = null
  let versionWarning: string | null = null
  if (manifestVersion && manifestVersion.replace(/^v/i, '') !== draftVersion) versionBlocked = `产物清单 release-artifacts.json 的版本 ${manifestVersion} 与草稿版本 ${detail.value.version} 不一致，请确认选择了正确目录`
  else if (mismatchedVersions.size) versionWarning = `部分文件名中的版本号（${Array.from(mismatchedVersions).join('、')}）与草稿版本 ${detail.value.version} 不一致，请确认产物来源`
  batchPlan.value = { rows, fileCount, ignoredCount: ignored.length, ignoredPreview: ignored.slice(0, 8), versionWarning, versionBlocked }
  batchVisible.value = true
}

/** 确认后顺序上传：签名 → updater ZIP → 安装器，小文件先行可秒级暴露签名不匹配问题。 */
const handleBatchUpload = async () => {
  if (!batchPlan.value || !detail.value || batchUploading.value) return
  batchUploading.value = true
  batchVisible.value = false
  const orderWeight = { SIGNATURE: 0, UPDATER: 1, INSTALLER: 2 }
  const queue = batchPlan.value.rows.filter((row) => row.file).sort((a, b) => orderWeight[a.kind] - orderWeight[b.kind])
  batchProgress.done = 0
  batchProgress.total = queue.length
  batchProgress.percent = 0
  batchProgress.currentFile = ''
  try {
    for (const row of queue) {
      if (!row.file || !detail.value) break
      batchProgress.currentFile = row.file.name
      const artifact = await uploadDesktopReleaseArtifact(detail.value.id, row.kind, row.bundle, row.file, (percent) => { batchProgress.percent = Math.min(99, Math.round(((batchProgress.done + percent / 100) / batchProgress.total) * 100)) })
      applyArtifactLocally(artifact)
      batchProgress.done += 1
      batchProgress.percent = Math.round((batchProgress.done / batchProgress.total) * 100)
    }
    ElMessage.success(`批量上传完成：${batchProgress.done} / ${batchProgress.total} 个产物`)
  } catch (error: any) {
    // 上传接口是“替换”语义且幂等，失败后重选目录续传即可，已成功的格子保留。
    ElMessage.error(`上传 ${batchProgress.currentFile} 失败：${error?.response?.data?.message || error?.message || '网络异常'}；已上传的产物会保留，可重新选择目录续传`)
  } finally {
    batchUploading.value = false
    batchPlan.value = null
    if (detail.value) { try { detail.value = await getDesktopRelease(detail.value.id) } catch { /* 刷新失败时保留本地已应用的产物状态 */ } }
    await loadReleases()
  }
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
.desktop-release-matrix-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.desktop-release-matrix-head h3 { margin: 0; }
.desktop-release-batch-button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid rgba(196, 106, 58, .45); border-radius: 8px; background: rgba(196, 106, 58, .08); padding: 5px 10px; color: var(--app-primary, #c46a3a); font-size: 11px; font-weight: 800; white-space: nowrap; }
.desktop-release-batch-button:disabled { opacity: .5; }
.desktop-release-batch-progress { margin-top: 16px; border: 1px solid rgba(196, 106, 58, .35); border-radius: 12px; background: rgba(196, 106, 58, .05); padding: 12px 14px; }
.desktop-release-batch-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; color: #475569; font-size: 12px; font-weight: 700; }
.desktop-release-batch-progress-file { overflow: hidden; color: #94a3b8; font-family: var(--app-font-mono, monospace); font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.desktop-release-batch-alert { margin-bottom: 14px; }
.desktop-release-batch-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.desktop-release-batch-table th { padding: 8px 10px; border-bottom: 1px solid var(--app-outline, #e2e8f0); color: var(--app-text-muted, #64748b); font-weight: 700; text-align: left; }
.desktop-release-batch-table th.right { text-align: right; }
.desktop-release-batch-table td { padding: 8px 10px; border-bottom: 1px solid var(--app-outline, #e2e8f0); color: #475569; }
.desktop-release-batch-table td.right { text-align: right; font-family: var(--app-font-mono, monospace); }
.desktop-release-batch-table tr.missing td { color: #b91c1c; }
.desktop-release-batch-ignored { margin: 10px 0 0; color: #94a3b8; font-size: 11px; }
@media (max-width: 760px) { .desktop-release-detail-grid, .desktop-release-form-grid { grid-template-columns: 1fr; } .desktop-release-artifacts { grid-template-columns: 1fr; } }
</style>
