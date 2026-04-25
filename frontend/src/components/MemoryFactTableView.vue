<template>
  <div class="table-view">
    <div class="table-tip">
      <span>这里展示当前筛选后的内容清单，点击一行即可在右侧查看详情。</span>
    </div>

    <el-table
      :data="rows"
      height="100%"
      row-key="id"
      class="memory-table"
      :row-class-name="resolveRowClassName"
      empty-text="当前筛选条件下暂无内容"
      @row-click="handleRowClick"
    >
      <el-table-column label="内容" min-width="240">
        <template #default="{ row }">
          <div class="cell-title">{{ row.label }}</div>
          <div v-if="row.aliasesText" class="cell-subtitle">别名：{{ row.aliasesText }}</div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ entityTypeLabel(row.entityType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="事实数" width="96" prop="factCount" />
      <el-table-column label="关联数" width="96" prop="degree" />
      <el-table-column label="来源" width="130">
        <template #default="{ row }">
          <span>{{ sourceTypeLabel(row.sourceType) }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MemoryFactNodeItem } from '@/types/platform'

const props = defineProps<{
  nodes: MemoryFactNodeItem[]
  selectedNodeId: string | null
}>()

const emit = defineEmits<{
  (e: 'select-node', id: string): void
}>()

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const rows = computed(() =>
  props.nodes.map((item) => {
    const metadata = parseMetadata(item.metadataJson)
    return {
      ...item,
      sourceType: String(metadata.sourceType || ''),
      aliasesText: (item.aliases || []).slice(0, 3).join(' / ')
    }
  })
)

const entityTypeLabel = (entityType: string) => {
  const map: Record<string, string> = {
    FACT: '事实',
    ENTITY: '实体',
    LOCATION: '地点',
    PERSON: '人物',
    ORGANIZATION: '组织',
    DOCUMENT: '文档',
    EVENT: '事件'
  }
  return map[entityType] || entityType
}

const sourceTypeLabel = (sourceType: string) => {
  const map: Record<string, string> = {
    WIKI: '知识库',
    WIKI_SPACE: '空间知识库',
    MEMORY: '记忆'
  }
  return map[sourceType] || sourceType || '-'
}

const handleRowClick = (row: MemoryFactNodeItem) => {
  emit('select-node', row.id)
}

const resolveRowClassName = ({ row }: { row: MemoryFactNodeItem }) => {
  return row.id === props.selectedNodeId ? 'is-selected-row' : ''
}
</script>

<style scoped>
.table-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.table-tip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.96);
  color: #64748b;
  font-size: 12px;
}

.memory-table {
  flex: 1;
  min-height: 0;
}

.memory-table :deep(.el-table__row) {
  cursor: pointer;
}

.memory-table :deep(.el-table__row.is-selected-row td) {
  background: rgba(219, 234, 254, 0.52);
}

.cell-title {
  color: #17324c;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
}

.cell-subtitle {
  margin-top: 4px;
  color: #6b7f91;
  font-size: 11px;
}
</style>
