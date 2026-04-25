<template>
  <div class="timeline-view">
    <div class="timeline-tip">
      <span>{{ tipText }}</span>
    </div>

    <div v-if="factsLoading" class="timeline-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else-if="!groups.length" class="timeline-empty">
      <el-empty description="当前内容暂无可展示的时间线" />
    </div>

    <div v-else class="timeline-scroll">
      <section v-for="group in groups" :key="group.date" class="timeline-group">
        <div class="timeline-date">{{ group.date }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="timeline-item"
          :class="{ active: item.active, clickable: item.clickable }"
          @click="handleItemClick(item)"
        >
          <div class="timeline-item-time">{{ item.time }}</div>
          <div class="timeline-item-body">
            <div class="timeline-item-title">{{ item.title }}</div>
            <div v-if="item.subtitle" class="timeline-item-subtitle">{{ item.subtitle }}</div>
          </div>
        </button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MemoryFactEdgeItem, MemoryFactItem, MemoryFactNodeItem } from '@/types/platform'

interface TimelineItem {
  id: string
  date: string
  time: string
  title: string
  subtitle: string
  edgeId?: string
  active: boolean
  clickable: boolean
}

const props = defineProps<{
  nodes: MemoryFactNodeItem[]
  edges: MemoryFactEdgeItem[]
  facts: MemoryFactItem[]
  factsLoading: boolean
  selectedEdgeId: string | null
}>()

const emit = defineEmits<{
  (e: 'select-edge', id: string): void
}>()

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

const nodeLabelMap = computed(() => {
  const map = new Map<string, string>()
  props.nodes.forEach((item) => map.set(item.id, item.label))
  return map
})

const relationTypeLabel = (relationType: string) => {
  const normalized = String(relationType || '').toLowerCase()
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
  return map[normalized] || relationType || '关系'
}

const factTimelineItems = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = []
  props.facts.forEach((item) => {
    const dateValue = item.createdAt ? new Date(item.createdAt) : null
    if (!dateValue || Number.isNaN(dateValue.getTime())) return
    items.push({
      id: item.id,
      date: dateValue.toLocaleDateString('zh-CN'),
      time: dateValue.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: item.summary || `${item.subject || '内容'} · ${item.predicate || '关联'} · ${item.object || '上下文'}`,
      subtitle: [item.subject, item.predicate, item.object].filter(Boolean).join(' · '),
      active: false,
      clickable: false
    })
  })
  return items.sort((left, right) => `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`))
})

const edgeTimelineItems = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = []
  props.edges.forEach((item) => {
    const metadata = parseMetadata(item.metadataJson)
    const timestamp = String(metadata.lastSeenAt || '')
    if (!timestamp) return
    const dateValue = new Date(timestamp)
    if (Number.isNaN(dateValue.getTime())) return
    items.push({
      id: item.id,
      date: dateValue.toLocaleDateString('zh-CN'),
      time: dateValue.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      title: `${nodeLabelMap.value.get(item.sourceId) || item.sourceId} → ${nodeLabelMap.value.get(item.targetId) || item.targetId}`,
      subtitle: relationTypeLabel(item.relationType),
      edgeId: item.id,
      active: item.id === props.selectedEdgeId,
      clickable: true
    })
  })
  return items.sort((left, right) => `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`))
})

const timelineItems = computed(() => factTimelineItems.value.length ? factTimelineItems.value : edgeTimelineItems.value)

const groups = computed(() => {
  const map = new Map<string, TimelineItem[]>()
  timelineItems.value.forEach((item) => {
    if (!map.has(item.date)) map.set(item.date, [])
    map.get(item.date)!.push(item)
  })
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
})

const tipText = computed(() =>
  factTimelineItems.value.length
    ? '当前优先展示右侧已选内容的事实时间线。'
    : '当前未选中具体内容，先按关系最近变化时间展示。'
)

const handleItemClick = (item: TimelineItem) => {
  if (item.edgeId) {
    emit('select-edge', item.edgeId)
  }
}
</script>

<style scoped>
.timeline-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timeline-tip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.96);
  color: #64748b;
  font-size: 12px;
}

.timeline-loading,
.timeline-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timeline-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.timeline-group + .timeline-group {
  margin-top: 18px;
}

.timeline-date {
  margin-bottom: 8px;
  color: #17324c;
  font-size: 12px;
  font-weight: 800;
}

.timeline-item {
  width: 100%;
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border: 1px solid rgba(214, 226, 234, 0.92);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  text-align: left;
}

.timeline-item + .timeline-item {
  margin-top: 8px;
}

.timeline-item.clickable {
  cursor: pointer;
}

.timeline-item.active {
  border-color: rgba(59, 130, 246, 0.42);
  background: rgba(239, 246, 255, 0.92);
}

.timeline-item-time {
  color: #6b7f91;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.6;
}

.timeline-item-title {
  color: #17324c;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.timeline-item-subtitle {
  margin-top: 4px;
  color: #6b7f91;
  font-size: 11px;
  line-height: 1.55;
}
</style>
