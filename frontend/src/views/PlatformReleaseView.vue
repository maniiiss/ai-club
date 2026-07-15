<template>
  <div class="management-list-page platform-release-view">
    <section class="management-list-toolbar">
      <div class="management-list-toolbar-main">
        <button class="management-list-toolbar-button" type="button" :disabled="loading" @click="loadReleases">
          <el-icon><RefreshRight /></el-icon>
          <span>刷新</span>
        </button>
      </div>
      <div v-if="canManage" class="management-list-toolbar-side">
        <button class="management-list-create-button" type="button" @click="openPublish">
          <el-icon><Plus /></el-icon>
          <span>发布新版本</span>
        </button>
      </div>
    </section>

    <section class="management-list-shell">
      <div class="management-list-table-scroll mobile-card-scroll" v-loading="loading">
        <table class="management-list-table platform-release-table mobile-card-table">
          <thead>
            <tr>
              <th class="platform-col-version">版本号</th>
              <th class="platform-col-title">标题</th>
              <th class="platform-col-publisher">发布人</th>
              <th class="platform-col-time">发布时间</th>
              <th class="platform-col-actions right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id" class="management-list-row" @click="openDetail(row)">
              <td class="platform-col-version" data-label="版本号">
                <span class="management-list-pill success">{{ row.version }}</span>
              </td>
              <td class="platform-col-title" data-label="标题">
                <span class="management-list-title">{{ row.title }}</span>
              </td>
              <td class="platform-col-publisher" data-label="发布人">
                <span class="management-list-empty">{{ row.publisherUserId ?? '-' }}</span>
              </td>
              <td class="platform-col-time" data-label="发布时间">
                <span class="management-list-updated">{{ row.publishedAt || '-' }}</span>
              </td>
              <td class="platform-col-actions right" data-label="操作">
                <div class="management-list-row-actions">
                  <button class="management-list-row-button" type="button" title="查看详情" @click.stop="openDetail(row)">
                    <el-icon><View /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && !items.length">
              <td colspan="5"><el-empty description="暂无已发布的版本" /></td>
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

    <el-drawer v-model="detailVisible" title="版本发布详情" size="min(760px, 100vw)" destroy-on-close>
      <template v-if="detail">
        <div class="platform-release-detail-meta">
          <el-tag type="success">{{ detail.version }}</el-tag>
          <span>{{ detail.publishedAt }}</span>
        </div>
        <h2 class="platform-release-detail-title">{{ detail.title }}</h2>
        <MdPreview :model-value="detail.content || ''" language="zh-CN" preview-theme="github" code-theme="atom" no-mermaid />
      </template>
    </el-drawer>

    <el-drawer v-model="publishVisible" title="发布新版本" size="min(760px, 100vw)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-release-form">
        <el-alert
          class="platform-release-publish-alert"
          type="warning"
          :closable="false"
          show-icon
          title="版本发布后立即对全部启用用户生效且不可编辑，如需修正请发布新的版本号。"
        />
        <div class="platform-release-form-grid">
          <el-form-item label="版本号" prop="version">
            <el-input v-model="form.version" maxlength="50" show-word-limit placeholder="例如：1.4.0" />
          </el-form-item>
          <el-form-item label="发布标题" prop="title">
            <el-input v-model="form.title" maxlength="200" show-word-limit placeholder="例如：AI Club 1.4.0 正式发布" />
          </el-form-item>
        </div>
        <el-form-item label="发布内容（Markdown）" prop="content">
          <MarkdownEditor
            v-model="form.content"
            :height="360"
            :preview="true"
            :start-in-edit-mode="true"
            placeholder="填写本次版本的功能、修复和注意事项"
          />
        </el-form-item>
        <p class="platform-release-form-hint">关闭公众端弹窗也会记录为已展示。</p>
      </el-form>
      <template #footer>
        <div class="platform-release-drawer-footer">
          <el-button @click="publishVisible = false">取消</el-button>
          <el-button type="primary" :loading="publishing" :disabled="!canManage" @click="handlePublish">发布版本</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { MdPreview } from 'md-editor-v3'
import { ArrowLeft, ArrowRight, Plus, RefreshRight, View } from '@element-plus/icons-vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { getPlatformRelease, pagePlatformReleases, publishPlatformRelease } from '@/api/platform-release'
import { useAuthStore } from '@/stores/auth'
import type { PlatformRelease } from '@/types/platform-release'

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('system:release:manage'))
const formRef = ref<FormInstance>()
const loading = ref(false)
const publishing = ref(false)
const items = ref<PlatformRelease[]>([])
const detail = ref<PlatformRelease | null>(null)
const detailVisible = ref(false)
const publishVisible = ref(false)
const pagination = reactive({ page: 1, size: 10, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const form = reactive({ version: '', title: '', content: '' })

const rules: FormRules = {
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  title: [{ required: true, message: '请输入发布标题', trigger: 'blur' }],
  content: [{ required: true, message: '请输入发布内容', trigger: 'blur' }]
}

const loadReleases = async () => {
  loading.value = true
  try {
    const data = await pagePlatformReleases(pagination.page, pagination.size)
    items.value = data.records
    pagination.total = data.total
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载版本发布历史失败')
  } finally {
    loading.value = false
  }
}

const handleSizeChange = async () => {
  pagination.page = 1
  await loadReleases()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadReleases()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadReleases()
}

/** 打开发布抽屉并清空表单，保证每次录入都从空白开始。 */
const openPublish = () => {
  form.version = ''
  form.title = ''
  form.content = ''
  publishVisible.value = true
}

const handlePublish = async () => {
  if (!canManage.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  await ElMessageBox.confirm('版本发布后会立即对全部启用用户生效，且不能编辑。确认发布吗？', '确认发布', {
    type: 'warning',
    confirmButtonText: '确认发布',
    cancelButtonText: '取消'
  })
  publishing.value = true
  try {
    await publishPlatformRelease({ ...form })
    ElMessage.success('版本发布成功')
    publishVisible.value = false
    pagination.page = 1
    await loadReleases()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '版本发布失败')
  } finally {
    publishing.value = false
  }
}

const openDetail = async (row: PlatformRelease) => {
  try {
    detail.value = await getPlatformRelease(row.id)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载版本详情失败')
    return
  }
  detailVisible.value = true
}

onMounted(loadReleases)
</script>

<style scoped>
.platform-release-form-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 16px; }
.platform-release-publish-alert { margin-bottom: 18px; }
.platform-release-form-hint { margin: 4px 0 0; color: var(--app-text-secondary, #6b7280); font-size: 12px; }
.platform-release-drawer-footer { display: flex; justify-content: flex-end; gap: 12px; }
.platform-release-table { min-width: 720px; }
.platform-col-version { width: 120px; }
.platform-col-publisher { width: 120px; }
.platform-col-time { width: 170px; }
.platform-col-actions { width: 72px; }
.platform-release-detail-meta { display: flex; align-items: center; gap: 12px; color: var(--app-text-secondary, #6b7280); font-size: 12px; }
.platform-release-detail-title { margin: 18px 0; color: var(--app-text-primary, #1f2937); font-size: 22px; }
@media (max-width: 768px) {
  .platform-release-form-grid { grid-template-columns: 1fr; gap: 0; }
}
</style>
