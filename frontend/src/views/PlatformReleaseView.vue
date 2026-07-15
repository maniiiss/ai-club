<template>
  <div class="platform-release-view management-page-shell">
    <div class="management-page-header">
      <div>
        <h1 class="management-page-title">版本发布</h1>
        <p class="management-page-description">发布后，公众端用户首次进入时会看到本次版本更新说明。</p>
      </div>
      <el-button :icon="RefreshRight" :loading="loading" @click="loadReleases">刷新</el-button>
    </div>

    <section class="platform-release-compose management-list-card">
      <div class="platform-release-section-head">
        <div>
          <h2>发布新版本</h2>
          <p>版本发布立即生效且不可编辑；如需修正文案，请发布新的版本号。</p>
        </div>
        <el-tag type="warning" effect="plain">全部启用用户</el-tag>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-release-form">
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
        <div class="platform-release-form-actions">
          <span class="platform-release-form-hint">关闭公众端弹窗也会记录为已展示。</span>
          <el-button type="primary" :loading="publishing" :disabled="!canManage" @click="handlePublish">发布版本</el-button>
        </div>
      </el-form>
    </section>

    <section class="management-list-card platform-release-history">
      <div class="platform-release-section-head">
        <div>
          <h2>发布历史</h2>
          <p>按发布时间倒序查看已正式发布的版本。</p>
        </div>
      </div>
      <el-table v-loading="loading" :data="items" row-key="id" @row-click="openDetail">
        <el-table-column prop="version" label="版本号" width="160" />
        <el-table-column prop="title" label="标题" min-width="280" show-overflow-tooltip />
        <el-table-column prop="publisherUserId" label="发布人 ID" width="120" />
        <el-table-column prop="publishedAt" label="发布时间" width="190" />
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="platform-release-pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.size"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadReleases"
          @size-change="handleSizeChange"
        />
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { MdPreview } from 'md-editor-v3'
import { RefreshRight } from '@element-plus/icons-vue'
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
const pagination = reactive({ page: 1, size: 10, total: 0 })
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
    form.version = ''
    form.title = ''
    form.content = ''
    formRef.value?.clearValidate()
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
.platform-release-view { min-height: 100%; }
.platform-release-compose { margin-bottom: 16px; }
.platform-release-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.platform-release-section-head h2 { margin: 0; color: var(--app-text-primary, #1f2937); font-size: 16px; }
.platform-release-section-head p { margin: 6px 0 0; color: var(--app-text-secondary, #6b7280); font-size: 13px; }
.platform-release-form-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 16px; }
.platform-release-form-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 18px; }
.platform-release-form-hint { color: var(--app-text-secondary, #6b7280); font-size: 12px; }
.platform-release-pagination { display: flex; justify-content: flex-end; padding-top: 18px; }
.platform-release-detail-meta { display: flex; align-items: center; gap: 12px; color: var(--app-text-secondary, #6b7280); font-size: 12px; }
.platform-release-detail-title { margin: 18px 0; color: var(--app-text-primary, #1f2937); font-size: 22px; }
@media (max-width: 768px) {
  .platform-release-form-grid { grid-template-columns: 1fr; gap: 0; }
  .platform-release-form-actions { align-items: flex-start; flex-direction: column; }
}
</style>
