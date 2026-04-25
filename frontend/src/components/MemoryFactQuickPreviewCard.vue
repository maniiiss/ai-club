<template>
  <div class="preview-card">
    <template v-if="selectedNode">
      <div class="preview-head">
        <span class="preview-type">{{ entityTypeLabel(entityDetail?.entityType || selectedNode.entityType) }}</span>
        <span class="preview-count">{{ entityDetail?.degree ?? selectedNode.degree }} 条关联</span>
      </div>

      <div class="preview-title">{{ entityDetail?.label || selectedNode.label }}</div>
      <div class="preview-summary">{{ previewSummary }}</div>

      <div v-if="previewTriple" class="preview-involving">涉及：{{ previewTriple }}</div>

      <div v-if="factsLoading" class="preview-loading">
        <el-skeleton :rows="4" animated />
      </div>

      <template v-else>
        <div class="preview-meta">
          <div v-for="item in previewMeta" :key="item.label" class="preview-meta-row">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>

        <div v-if="previewTags.length" class="preview-tags">
          <span v-for="item in previewTags" :key="item" class="preview-chip">{{ item }}</span>
        </div>

        <div class="preview-id">{{ previewRawId }}</div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  MemoryFactEntityDetailItem,
  MemoryFactItem,
  MemoryFactNodeItem
} from '@/types/platform'

const props = defineProps<{
  selectedNode: MemoryFactNodeItem | null
  entityDetail: MemoryFactEntityDetailItem | null
  facts: MemoryFactItem[]
  factsLoading: boolean
  spaceName?: string
  projectName?: string
  directoryLabelMap?: Record<string, string>
  projectLabelMap?: Record<string, string>
}>()

const parseMetadata = (value?: string) => {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

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
  return map[value] || value || '内容'
}

const sourceTypeLabel = (value: string) => {
  const normalized = String(value || '').toUpperCase()
  const map: Record<string, string> = {
    WIKI: '知识库',
    WIKI_SPACE: '空间知识库',
    MEMORY: '记忆'
  }
  return map[normalized] || value || '-'
}

const displayTag = (tag: string) => {
  const value = String(tag || '').trim()
  if (!value) return ''
  if (value === 'wiki') return '知识库'
  if (value.startsWith('source:')) {
    return `来源：${sourceTypeLabel(value.slice('source:'.length))}`
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
  return value
}

const nodeMetadata = computed(() => parseMetadata(props.selectedNode?.metadataJson))
const detailMetadata = computed(() => parseMetadata(props.entityDetail?.metadataJson))
const firstFact = computed(() => props.facts[0] || null)
const firstFactMetadata = computed(() => parseMetadata(firstFact.value?.metadataJson))

const previewSummary = computed(() => {
  const observation = props.entityDetail?.observations?.find((item) => item && item.trim())
  if (observation) return observation
  if (firstFact.value?.summary) return firstFact.value.summary
  return props.selectedNode?.label || ''
})

const previewTriple = computed(() => {
  if (firstFact.value && (firstFact.value.subject || firstFact.value.predicate || firstFact.value.object)) {
    return [firstFact.value.subject, firstFact.value.predicate, firstFact.value.object].filter(Boolean).join(' | ')
  }
  const aliases = props.entityDetail?.aliases || props.selectedNode?.aliases || []
  return aliases.length ? aliases.slice(0, 3).join(' | ') : ''
})

const previewMeta = computed(() => {
  const sourceType = String(firstFact.value?.sourceType || nodeMetadata.value.sourceType || '')
  const lastSeenAt = String(detailMetadata.value.lastSeenAt || firstFactMetadata.value.lastSeenAt || '')
  const createdAt = String(firstFact.value?.createdAt || detailMetadata.value.firstSeenAt || '')
  const documentLabel = (() => {
    const tags = firstFact.value?.tags || []
    const directoryTag = tags.find((item) => item.startsWith('directory:'))
    if (directoryTag) {
      const directoryId = directoryTag.slice('directory:'.length)
      return props.directoryLabelMap?.[directoryId] || '目录内容'
    }
    return props.projectName || props.spaceName || '-'
  })()
  return [
    { label: '来源', value: sourceTypeLabel(sourceType) },
    { label: '最近出现', value: lastSeenAt || '-' },
    { label: '创建时间', value: createdAt || '-' },
    { label: '文档', value: documentLabel }
  ]
})

const previewTags = computed(() => {
  const values = new Set<string>()
  for (const tag of firstFact.value?.tags || []) {
    const label = displayTag(tag)
    if (label) values.add(label)
  }
  return Array.from(values).slice(0, 8)
})

const previewRawId = computed(() => {
  const rawEntityId = String(nodeMetadata.value.rawEntityId || '')
  return rawEntityId || props.selectedNode?.id || ''
})
</script>

<style scoped>
.preview-card {
  width: min(480px, calc(100vw - 64px));
  padding: 20px 20px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.92);
  box-shadow:
    0 28px 72px rgba(15, 23, 42, 0.18),
    0 8px 24px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.preview-type {
  color: #60a5fa;
}

.preview-title {
  margin-top: 10px;
  color: #0f172a;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.55;
}

.preview-summary,
.preview-involving {
  margin-top: 10px;
  color: #1e293b;
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.preview-involving {
  color: #334155;
}

.preview-meta {
  margin-top: 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.86);
  padding-top: 14px;
}

.preview-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
}

.preview-meta-row + .preview-meta-row {
  margin-top: 10px;
}

.preview-meta-row span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

.preview-meta-row strong {
  color: #0f172a;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  word-break: break-word;
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.92);
  color: #3b82f6;
  font-size: 12px;
}

.preview-id {
  margin-top: 16px;
  color: #94a3b8;
  font-size: 12px;
  font-family: Consolas, 'SFMono-Regular', monospace;
  word-break: break-all;
}

.preview-loading {
  margin-top: 16px;
}
</style>
