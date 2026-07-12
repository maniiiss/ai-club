<template>
  <section class="task-update-timeline">
    <div class="task-update-timeline-header">
      <div>
        <div class="task-update-timeline-title">更新记录</div>
        <div class="task-update-timeline-subtitle">字段、关联和评论的历史变化</div>
      </div>
      <el-icon v-if="loading" class="is-loading"><Loading /></el-icon>
    </div>

    <div v-if="error && !records.length" class="task-update-timeline-empty">更新记录加载失败</div>
    <div v-else-if="!loading && !records.length" class="task-update-timeline-empty">暂无更新记录</div>
    <div v-else class="task-update-timeline-list">
      <article v-for="record in records" :key="record.id" class="task-update-record-card">
        <div class="task-update-record-meta">
          <span class="task-update-record-operator">{{ record.operatorName || '系统' }}</span>
          <span class="task-update-record-source" :class="`source-${record.source.toLowerCase()}`">{{ sourceLabel(record.source) }}</span>
          <span class="task-update-record-time">{{ formatDateTime(record.createdAt) }}</span>
        </div>
        <div class="task-update-record-summary">{{ record.summary }}</div>
        <div class="task-update-record-details">
          <div v-for="detail in record.details" :key="detail.id" class="task-update-record-detail">
            <span class="task-update-record-field">{{ detail.fieldName }}</span>
            <span class="task-update-record-value" :class="{ expanded: isExpanded(detail.id) }">{{ displayValue(detail.oldValue) }}</span>
            <span class="task-update-record-arrow">→</span>
            <span class="task-update-record-value" :class="{ expanded: isExpanded(detail.id) }">{{ displayValue(detail.newValue) }}</span>
            <button v-if="isLong(detail)" type="button" class="task-update-record-expand" @click="toggleExpanded(detail.id)">
              {{ isExpanded(detail.id) ? '收起' : '展开' }}
            </button>
          </div>
        </div>
      </article>
      <el-button v-if="page < totalPages" text type="primary" :loading="loadingMore" class="task-update-load-more" @click="loadMore">
        加载更多
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { pageTaskUpdateRecords } from '@/api/platform'
import type { TaskUpdateRecordDetailItem, TaskUpdateRecordItem } from '@/types/platform'

const props = withDefaults(defineProps<{ taskId: number; refreshKey?: number }>(), { refreshKey: 0 })
const emit = defineEmits<{ (event: 'count-change', count: number): void }>()
const records = ref<TaskUpdateRecordItem[]>([])
const page = ref(1)
const totalPages = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(false)
const expandedDetails = ref(new Set<number>())

const sourceLabels: Record<string, string> = { MANUAL: '人工', SYSTEM: '系统', AI: 'AI' }

const sourceLabel = (source: string) => sourceLabels[source] || source
const displayValue = (value?: string | null) => value?.trim() || '空'
const isLong = (detail: TaskUpdateRecordDetailItem) => Math.max(detail.oldValue?.length || 0, detail.newValue?.length || 0) > 180
const isExpanded = (id: number) => expandedDetails.value.has(id)
const toggleExpanded = (id: number) => {
  const next = new Set(expandedDetails.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedDetails.value = next
}
const formatDateTime = (value?: string | null) => value || '未知时间'

const load = async () => {
  loading.value = true
  error.value = false
  page.value = 1
  expandedDetails.value = new Set()
  try {
    const result = await pageTaskUpdateRecords(props.taskId, 1, 10)
    records.value = result?.records || []
    totalPages.value = result?.totalPages || 1
    emit('count-change', result?.total || records.value.length)
  } catch {
    error.value = true
    records.value = []
    emit('count-change', 0)
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  if (loadingMore.value || page.value >= totalPages.value) return
  loadingMore.value = true
  try {
    const nextPage = page.value + 1
    const result = await pageTaskUpdateRecords(props.taskId, nextPage, 10)
    records.value = [...records.value, ...(result?.records || [])]
    page.value = nextPage
    totalPages.value = result?.totalPages || totalPages.value
    emit('count-change', result?.total || records.value.length)
  } finally {
    loadingMore.value = false
  }
}

watch(() => [props.taskId, props.refreshKey], load, { immediate: true })
</script>

<style scoped>
.task-update-timeline {
  border-top: 1px solid var(--app-border);
  padding-top: 18px;
}
.task-update-timeline-header,
.task-update-record-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.task-update-timeline-header {
  justify-content: space-between;
  margin-bottom: 12px;
}
.task-update-timeline-title { color: var(--app-text); font-size: 14px; font-weight: 700; }
.task-update-timeline-subtitle { color: var(--app-text-muted); font-size: 12px; margin-top: 3px; }
.task-update-timeline-list { display: flex; flex-direction: column; gap: 10px; }
.task-update-record-card { border: 1px solid var(--app-border); border-radius: 10px; padding: 12px; background: var(--app-surface-card); }
.task-update-record-operator { color: var(--app-text); font-size: 12px; font-weight: 700; }
.task-update-record-source { border-radius: 999px; padding: 2px 7px; font-size: 10px; font-weight: 600; }
.source-manual { color: var(--app-primary); background: rgba(var(--app-primary-rgb), 0.1); }
.source-system { color: #64748b; background: #f1f5f9; }
.source-ai { color: #b45309; background: #fffbeb; }
.task-update-record-time { color: var(--app-text-muted); font-size: 11px; }
.task-update-record-summary { color: var(--app-text-soft); font-size: 12px; font-weight: 600; margin-top: 6px; }
.task-update-record-details { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.task-update-record-detail { display: grid; grid-template-columns: 72px minmax(0, 1fr) 18px minmax(0, 1fr) auto; gap: 6px; align-items: start; border-radius: 7px; padding: 7px 8px; background: var(--app-surface-low); }
.task-update-record-field { color: var(--app-text); font-size: 12px; font-weight: 600; }
.task-update-record-value { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical; color: var(--app-text-soft); font-size: 12px; white-space: pre-wrap; word-break: break-word; }
.task-update-record-value.expanded { display: block; }
.task-update-record-arrow { color: var(--app-text-muted); font-size: 12px; }
.task-update-record-expand { border: 0; padding: 0; color: var(--app-primary); background: transparent; cursor: pointer; font-size: 11px; white-space: nowrap; }
.task-update-timeline-empty { border: 1px dashed var(--app-border-strong); border-radius: 10px; color: var(--app-text-muted); font-size: 12px; padding: 18px; text-align: center; }
.task-update-load-more { align-self: center; }
@media (max-width: 640px) {
  .task-update-record-detail { grid-template-columns: 64px minmax(0, 1fr); }
  .task-update-record-arrow { display: none; }
  .task-update-record-value:nth-of-type(4) { grid-column: 2; }
  .task-update-record-expand { grid-column: 2; justify-self: start; }
}
</style>
