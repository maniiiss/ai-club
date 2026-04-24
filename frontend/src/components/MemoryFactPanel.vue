<template>
  <div class="memory-fact-panel">
    <div v-if="warnings.length" class="panel-warning-list">
      <el-alert
        v-for="item in warnings"
        :key="item"
        :title="item"
        type="warning"
        :closable="false"
        show-icon
      />
    </div>

    <template v-if="selectedNode">
      <div class="panel-header">
        <div>
          <div class="panel-title">{{ entityDetail?.label || selectedNode.label }}</div>
          <div class="panel-subtitle">{{ entityTypeLabel(entityDetail?.entityType || selectedNode.entityType) }}</div>
        </div>
        <el-tag type="primary">{{ entityDetail?.factCount ?? selectedNode.factCount }} 条事实</el-tag>
      </div>

      <div class="panel-meta-grid">
        <div class="panel-meta-item">
          <span>连接度</span>
          <strong>{{ entityDetail?.degree ?? selectedNode.degree }}</strong>
        </div>
        <div class="panel-meta-item">
          <span>别名数</span>
          <strong>{{ (entityDetail?.aliases || selectedNode.aliases || []).length }}</strong>
        </div>
      </div>

      <div v-if="(entityDetail?.aliases || selectedNode.aliases || []).length" class="panel-section">
        <div class="panel-section-title">别名</div>
        <div class="chip-list">
          <span v-for="item in entityDetail?.aliases || selectedNode.aliases" :key="item" class="chip">{{ item }}</span>
        </div>
      </div>

      <div v-if="entityDetail?.observations?.length" class="panel-section">
        <div class="panel-section-title">观察记录</div>
        <div class="fact-list">
          <article v-for="item in entityDetail.observations" :key="item" class="fact-card compact">
            <div class="fact-summary">{{ item }}</div>
          </article>
        </div>
      </div>
    </template>

    <template v-else-if="selectedEdge">
      <div class="panel-header">
        <div>
          <div class="panel-title">{{ selectedEdge.relationType }}</div>
          <div class="panel-subtitle">{{ selectedEdge.sourceLabel }} → {{ selectedEdge.targetLabel }}</div>
        </div>
        <el-tag type="info">{{ selectedEdge.weight ?? '-' }}</el-tag>
      </div>
    </template>

    <div v-if="factsLoading" class="panel-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="facts.length" class="panel-section">
      <div class="panel-section-title">事实证据</div>
      <div class="fact-list">
        <article v-for="item in facts" :key="item.id" class="fact-card">
          <div class="fact-header">
            <div class="fact-type">{{ item.type || item.sourceType || '事实' }}</div>
            <div class="fact-date">{{ item.createdAt || '-' }}</div>
          </div>
          <div class="fact-summary">{{ item.summary }}</div>
          <div v-if="item.subject || item.predicate || item.object" class="fact-triple">
            {{ item.subject || '实体' }} · {{ item.predicate || '关联' }} · {{ item.object || '上下文' }}
          </div>
          <div v-if="item.tags.length" class="chip-list">
            <span v-for="tag in item.tags" :key="tag" class="chip muted">{{ tag }}</span>
          </div>
        </article>
      </div>
    </div>

    <div v-else-if="selectedNode || selectedEdge" class="panel-empty">
      <el-empty description="当前选择暂无可展示的事实证据" />
    </div>

    <div v-if="metadataEntries.length" class="panel-section">
      <div class="panel-section-title">元数据</div>
      <div class="metadata-list">
        <div v-for="entry in metadataEntries" :key="entry.key" class="metadata-item">
          <span>{{ entry.key }}</span>
          <strong>{{ entry.value }}</strong>
        </div>
      </div>
    </div>

    <div v-if="!selectedNode && !selectedEdge" class="panel-empty">
      <el-empty description="点击节点、边或执行搜索后查看详情" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  MemoryFactEdgeItem,
  MemoryFactEntityDetailItem,
  MemoryFactItem,
  MemoryFactNodeItem
} from '@/types/platform'

interface SelectedEdgeDetail extends MemoryFactEdgeItem {
  sourceLabel: string
  targetLabel: string
}

const props = defineProps<{
  selectedNode: MemoryFactNodeItem | null
  selectedEdge: SelectedEdgeDetail | null
  entityDetail: MemoryFactEntityDetailItem | null
  facts: MemoryFactItem[]
  factsLoading: boolean
  warnings: string[]
}>()

const metadataEntries = computed(() => {
  const raw = props.entityDetail?.metadataJson || props.selectedEdge?.metadataJson || props.selectedNode?.metadataJson || ''
  if (!raw) {
    return []
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    return Object.entries(data)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value)
      }))
  } catch {
    return []
  }
})

const entityTypeLabel = (value: string) => {
  const map: Record<string, string> = {
    ENTITY: '实体',
    LOCATION: '地点',
    PERSON: '人物',
    ORGANIZATION: '组织',
    DOCUMENT: '文档',
    EVENT: '事件'
  }
  return map[value] || value || '实体'
}
</script>

<style scoped>
.memory-fact-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-warning-list,
.fact-list,
.chip-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chip-list {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-header,
.fact-header,
.metadata-item,
.panel-meta-grid {
  display: flex;
}

.panel-header,
.fact-header,
.metadata-item {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-header {
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(247, 250, 252, 0.96) 0%, rgba(239, 245, 248, 0.96) 100%);
  border: 1px solid rgba(214, 226, 234, 0.92);
}

.panel-title {
  color: #17324c;
  font-size: 22px;
  font-weight: 800;
}

.panel-subtitle,
.fact-date,
.fact-triple {
  color: #6b7f91;
  font-size: 12px;
}

.panel-meta-grid {
  gap: 12px;
}

.panel-meta-item,
.fact-card,
.metadata-list {
  border-radius: 16px;
  border: 1px solid rgba(214, 226, 234, 0.92);
  background: rgba(255, 255, 255, 0.94);
}

.panel-meta-item {
  flex: 1 1 0;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.panel-meta-item span {
  color: #7a8fa4;
  font-size: 12px;
}

.panel-meta-item strong {
  color: #17324c;
  font-size: 20px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-section-title,
.fact-type {
  color: #385166;
  font-size: 13px;
  font-weight: 700;
}

.fact-card {
  padding: 14px 16px;
}

.fact-card.compact {
  padding-top: 12px;
  padding-bottom: 12px;
}

.fact-summary {
  color: #21384f;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.fact-triple {
  margin-top: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(236, 244, 247, 0.96);
  color: #315066;
  font-size: 12px;
  font-weight: 700;
}

.chip.muted {
  background: rgba(244, 247, 249, 0.96);
  color: #6b7f91;
}

.metadata-list {
  display: flex;
  flex-direction: column;
}

.metadata-item {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(228, 235, 240, 0.92);
}

.metadata-item:last-child {
  border-bottom: 0;
}

.metadata-item span {
  color: #6b7f91;
  font-size: 12px;
}

.metadata-item strong {
  color: #21384f;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  word-break: break-word;
}

.panel-empty,
.panel-loading {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
