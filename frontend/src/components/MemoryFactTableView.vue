<template>
  <div class="table-view">
    <el-table
      :data="rows"
      v-loading="factsLoading"
      height="100%"
      row-key="id"
      class="memory-table"
      :row-class-name="resolveRowClassName"
      empty-text="当前范围内暂无可展示的事实"
      @row-click="handleRowClick"
    >
      <el-table-column label="Memory" min-width="420">
        <template #default="{ row }">
          <div class="cell-title">{{ row.summary }}</div>
          <div v-if="row.context" class="cell-subtitle">{{ row.context }}</div>
        </template>
      </el-table-column>
      <el-table-column label="Entities" min-width="210">
        <template #default="{ row }">
          <div v-if="row.entities.length" class="chip-line">
            <span v-for="item in row.entities.slice(0, 2)" :key="item" class="chip entity">{{ item }}</span>
            <span v-if="row.entities.length > 2" class="chip-more">+{{ row.entities.length - 2 }}</span>
          </div>
          <span v-else class="cell-empty">-</span>
        </template>
      </el-table-column>
      <el-table-column label="Tags" min-width="190">
        <template #default="{ row }">
          <div v-if="row.tags.length" class="chip-line">
            <span v-for="item in row.tags.slice(0, 2)" :key="item" class="chip tag">#{{ item }}</span>
            <span v-if="row.tags.length > 2" class="chip-more">+{{ row.tags.length - 2 }}</span>
          </div>
          <span v-else class="cell-empty">-</span>
        </template>
      </el-table-column>
      <el-table-column label="Occurred" width="156">
        <template #default="{ row }">
          <span v-if="row.occurredText" class="cell-date">{{ row.occurredText }}</span>
          <span v-else class="cell-empty">-</span>
        </template>
      </el-table-column>
      <el-table-column label="Mentioned" width="156">
        <template #default="{ row }">
          <span v-if="row.mentionedText" class="cell-date">{{ row.mentionedText }}</span>
          <span v-else class="cell-empty">-</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MemoryFactItem } from '@/types/platform'

const props = defineProps<{
  facts: MemoryFactItem[]
  factsLoading: boolean
  selectedFactId: string | null
}>()

const emit = defineEmits<{
  (e: 'select-fact', fact: MemoryFactItem): void
}>()

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const asStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const objectValue = item as Record<string, unknown>
          return String(objectValue.name || objectValue.label || objectValue.text || objectValue.value || '').trim()
        }
        return String(item || '').trim()
      })
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

const formatDate = (value?: string) => {
  const text = String(value || '').trim()
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const rows = computed(() =>
  props.facts.map((item) => {
    const metadata = parseMetadata(item.metadataJson)
    const sourceFact = metadata.sourceFact && typeof metadata.sourceFact === 'object'
      ? metadata.sourceFact as Record<string, unknown>
      : null
    const rawMetadata = metadata.raw && typeof metadata.raw === 'object'
      ? metadata.raw as Record<string, unknown>
      : null
    const entities = Array.from(new Set([
      ...asStringList(sourceFact?.entities),
      ...asStringList(metadata.entities),
      ...asStringList(rawMetadata?.entities),
      String(item.subject || '').trim(),
      String(item.object || '').trim()
    ].filter(Boolean)))
    const occurredText = formatDate(
      String(
        sourceFact?.occurred_start
        || sourceFact?.occurred_at
        || sourceFact?.event_date
        || metadata.occurred_start
        || metadata.occurred_at
        || rawMetadata?.occurred_start
        || rawMetadata?.occurred_at
        || rawMetadata?.event_date
        || ''
      )
    )
    const mentionedText = formatDate(
      String(
        sourceFact?.mentioned_at
        || metadata.mentioned_at
        || rawMetadata?.mentioned_at
        || item.createdAt
        || ''
      )
    )
    return {
      id: item.id,
      summary: item.summary || `${item.subject || ''} ${item.predicate || ''} ${item.object || ''}`.trim(),
      context: String(metadata.context || sourceFact?.context || item.predicate || '').trim(),
      entities,
      tags: item.tags || [],
      occurredText,
      mentionedText,
      raw: item
    }
  })
)

const handleRowClick = (row: { raw: MemoryFactItem }) => {
  emit('select-fact', row.raw)
}

const resolveRowClassName = ({ row }: { row: { id: string } }) => {
  return row.id === props.selectedFactId ? 'is-selected-row' : ''
}
</script>

<style scoped>
.table-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.memory-table {
  flex: 1;
  min-height: 0;
}

.memory-table :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.memory-table :deep(th.el-table__cell) {
  background: #fff;
  border-bottom: 1px solid rgba(214, 226, 234, 0.92);
}

.memory-table :deep(.el-table__header-wrapper th .cell) {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.memory-table :deep(td.el-table__cell) {
  border-bottom: 1px solid rgba(226, 232, 240, 0.88);
  vertical-align: top;
}

.memory-table :deep(.el-table__body .cell) {
  padding-top: 2px;
  padding-bottom: 2px;
}

.memory-table :deep(.el-table__row) {
  cursor: pointer;
}

.memory-table :deep(.el-table__row:hover td) {
  background: rgba(248, 250, 252, 0.88);
}

.memory-table :deep(.el-table__row.is-selected-row td) {
  background: rgba(239, 246, 255, 0.96);
}

.cell-title {
  display: -webkit-box;
  overflow: hidden;
  color: #0f172a;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

.cell-subtitle {
  margin-top: 6px;
  overflow: hidden;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.chip-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

.chip.entity {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.chip.tag {
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.12);
  color: #c2410c;
  font-family: Consolas, 'SFMono-Regular', 'Roboto Mono', monospace;
}

.chip-more,
.cell-empty,
.cell-date {
  color: #475569;
  font-size: 12px;
}

.cell-empty {
  color: #94a3b8;
}
</style>
