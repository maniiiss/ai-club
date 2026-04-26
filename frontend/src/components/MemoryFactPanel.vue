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
          <span>关联数量</span>
          <strong>{{ entityDetail?.degree ?? selectedNode.degree }}</strong>
        </div>
        <div class="panel-meta-item">
          <span>其他叫法数量</span>
          <strong>{{ (entityDetail?.aliases || selectedNode.aliases || []).length }}</strong>
        </div>
      </div>

      <div v-if="(entityDetail?.aliases || selectedNode.aliases || []).length" class="panel-section">
        <div class="panel-section-title">其他叫法</div>
        <div class="chip-list">
          <span v-for="item in entityDetail?.aliases || selectedNode.aliases" :key="item" class="chip">{{ item }}</span>
        </div>
      </div>

      <div v-if="entityDetail?.observations?.length" class="panel-section">
        <div class="panel-section-title">补充说明</div>
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
          <div class="panel-title">{{ relationTypeLabel(selectedEdge.relationType) }}</div>
          <div class="panel-subtitle">{{ selectedEdge.sourceLabel }} → {{ selectedEdge.targetLabel }}</div>
        </div>
        <el-tag type="info">{{ selectedEdge.weight ?? '-' }}</el-tag>
      </div>
    </template>

    <div v-if="factsLoading" class="panel-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="facts.length" class="panel-section">
      <div class="panel-section-title">参考内容</div>
      <div class="fact-list">
        <article v-for="item in facts" :key="item.id" class="fact-card">
          <div class="fact-header">
            <div class="fact-type">{{ factTypeLabel(item.type, item.sourceType) }}</div>
            <div class="fact-date">{{ item.createdAt || '-' }}</div>
          </div>
          <div class="fact-summary">{{ item.summary }}</div>
          <div v-if="item.subject || item.predicate || item.object" class="fact-triple">
            {{ item.subject || '实体' }} · {{ item.predicate || '关联' }} · {{ item.object || '上下文' }}
          </div>
          <div v-if="item.tags.length" class="chip-list">
            <span v-for="tag in displayTags(item.tags)" :key="tag" class="chip muted">{{ tag }}</span>
          </div>
        </article>
      </div>
    </div>

    <div v-else-if="selectedNode || selectedEdge" class="panel-empty">
      <el-empty description="当前内容暂无更多参考信息" />
    </div>

    <div v-if="metadataEntries.length" class="panel-section">
      <div class="panel-section-title">附加信息</div>
      <div class="metadata-list">
        <div v-for="entry in metadataEntries" :key="entry.key" class="metadata-item">
          <span>{{ metadataKeyLabel(entry.key) }}</span>
          <strong>{{ entry.value }}</strong>
        </div>
      </div>
    </div>

    <div v-if="!selectedNode && !selectedEdge && !selectedFact && !factsLoading && !facts.length" class="panel-empty">
      <el-empty description="点击图中的内容后在这里查看详情" />
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
  selectedFact: MemoryFactItem | null
  entityDetail: MemoryFactEntityDetailItem | null
  facts: MemoryFactItem[]
  factsLoading: boolean
  warnings: string[]
  spaceName?: string
  projectName?: string
  directoryLabelMap?: Record<string, string>
  projectLabelMap?: Record<string, string>
}>()

const metadataEntries = computed(() => {
  const raw = props.entityDetail?.metadataJson
    || props.selectedEdge?.metadataJson
    || props.selectedNode?.metadataJson
    || props.selectedFact?.metadataJson
    || ''
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
    FACT: '事实',
    ENTITY: '实体',
    LOCATION: '地点',
    PERSON: '人物',
    ORGANIZATION: '组织',
    DOCUMENT: '文档',
    EVENT: '事件'
  }
  return map[value] || value || '实体'
}

const relationTypeLabel = (value: string) => {
  const normalized = String(value || '').toLowerCase()
  const map: Record<string, string> = {
    semantic: '内容关联',
    entity: '实体关联',
    temporal: '时间关联',
    cause: '因果',
    contain: '包含',
    co_occurrence: '共现',
    relation: '关系',
    reference: '引用',
    mention: '提及'
  }
  return map[normalized] || value || '关系'
}

const sourceTypeLabel = (value: string) => {
  const normalized = String(value || '').toUpperCase()
  const map: Record<string, string> = {
    WIKI: '知识库',
    WIKI_SPACE: '空间知识库',
    MEMORY: '记忆'
  }
  return map[normalized] || value
}

const factTypeLabel = (type?: string, sourceType?: string) => {
  if (type) {
    const normalized = String(type || '').toUpperCase()
    const map: Record<string, string> = {
      FACT: '事实',
      WORLD: '事实',
      OBSERVATION: '观察',
      MEMORY: '记忆',
      EVENT: '事件',
      ENTITY: '实体'
    }
    return map[normalized] || type
  }
  if (sourceType) {
    return sourceTypeLabel(sourceType)
  }
  return '事实'
}

const metadataKeyLabel = (key: string) => {
  const map: Record<string, string> = {
    bankId: '存储库',
    rawEntityId: '原始实体 ID',
    rawEdgeId: '原始关系 ID',
    rawSourceId: '原始起点 ID',
    rawTargetId: '原始终点 ID',
    mentionCount: '提及次数',
    color: '颜色',
    sourceType: '来源',
    raw: '原始数据',
    graphNodeMetadata: '图谱节点元数据',
    entityDetail: '实体详情',
    firstSeenAt: '首次出现时间',
    lastSeenAt: '最近出现时间'
  }
  return map[key] || key
}

const displayTag = (tag: string) => {
  const value = String(tag || '').trim()
  if (!value) return ''
  if (value === 'wiki') return '知识库'
  if (value.startsWith('source:')) {
    return `来源：${sourceTypeLabel(value.slice('source:'.length).toUpperCase())}`
  }
  if (value.startsWith('space:')) {
    return props.spaceName ? `空间：${props.spaceName}` : '空间'
  }
  if (value.startsWith('directory:')) {
    const directoryId = value.slice('directory:'.length)
    const label = props.directoryLabelMap?.[directoryId]
    return label ? `目录：${label}` : '目录'
  }
  if (value.startsWith('project:')) {
    const projectId = value.slice('project:'.length)
    const label = props.projectLabelMap?.[projectId] || props.projectName
    return label ? `项目：${label}` : '项目'
  }
  if (value.startsWith('visibility:')) {
    const scope = value.slice('visibility:'.length)
    const visibilityMap: Record<string, string> = {
      ALL_LOGGED_IN: '可见范围：登录可见',
      MEMBERS_ONLY: '可见范围：成员可见'
    }
    return visibilityMap[scope] || `可见范围：${scope}`
  }
  return value
}

const displayTags = (tags: string[]) => {
  const values = new Set<string>()
  for (const tag of tags || []) {
    const label = displayTag(tag)
    if (label) values.add(label)
  }
  return Array.from(values)
}
</script>

<style scoped>
.memory-fact-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-warning-list,
.fact-list,
.chip-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  padding: 12px 14px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(247, 250, 252, 0.96) 0%, rgba(239, 245, 248, 0.96) 100%);
  border: 1px solid rgba(214, 226, 234, 0.92);
}

.panel-title {
  color: #17324c;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.5;
}

.panel-subtitle,
.fact-date,
.fact-triple {
  color: #6b7f91;
  font-size: 11px;
}

.panel-meta-grid {
  gap: 8px;
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
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel-meta-item span {
  color: #7a8fa4;
  font-size: 12px;
}

.panel-meta-item strong {
  color: #17324c;
  font-size: 16px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.panel-section-title,
.fact-type {
  color: #637789;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.fact-card {
  padding: 10px 12px;
}

.fact-card.compact {
  padding-top: 8px;
  padding-bottom: 8px;
}

.fact-summary {
  color: #21384f;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.fact-triple {
  margin-top: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(236, 244, 247, 0.96);
  color: #315066;
  font-size: 11px;
  font-weight: 600;
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
  padding: 10px 12px;
  border-bottom: 1px solid rgba(228, 235, 240, 0.92);
}

.metadata-item:last-child {
  border-bottom: 0;
}

.metadata-item span {
  color: #6b7f91;
  font-size: 11px;
}

.metadata-item strong {
  color: #21384f;
  font-size: 11px;
  font-weight: 600;
  text-align: right;
  word-break: break-word;
}

.panel-empty,
.panel-loading {
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
