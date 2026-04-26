<template>
  <div class="preview-card">
    <template v-if="selectedNode">
      <div class="preview-head">
        <span class="preview-type">{{ previewEntityType }}</span>
        <span class="preview-count">{{ entityDetail?.degree ?? selectedNode.degree }} 条关联</span>
      </div>

      <div class="preview-title">{{ previewTitle }}</div>
      <div v-if="previewSummary" class="preview-summary">{{ previewSummary }}</div>
      <div v-if="previewInvolving" class="preview-involving">涉及：{{ previewInvolving }}</div>
      <div v-if="previewContext" class="preview-context">背景：{{ previewContext }}</div>

      <div v-if="factsLoading && !hasInstantPreview" class="preview-loading">
        <el-skeleton :rows="4" animated />
      </div>

      <template v-else>
        <div v-if="previewMeta.length" class="preview-meta">
          <div v-for="item in previewMeta" :key="item.label" class="preview-meta-row">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>

        <div v-if="previewTags.length" class="preview-tags">
          <span v-for="item in previewTags" :key="item" class="preview-chip">{{ item }}</span>
        </div>

        <div v-if="previewRawId" class="preview-id">{{ previewRawId }}</div>
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

const asRecord = (value: unknown) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const asString = (value: unknown) => String(value ?? '').trim()

const asStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
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
const rawNodeMetadata = computed(() => {
  const localRaw = asRecord(nodeMetadata.value.raw)
  if (Object.keys(localRaw).length) return localRaw
  const detailRaw = asRecord(asRecord(detailMetadata.value.graphNodeMetadata).raw)
  return detailRaw
})

const formatTimestamp = (value: unknown) => {
  const normalized = asString(value)
  return normalized ? normalized.slice(0, 16).replace('T', ' ') : ''
}

const previewEntityType = computed(() => {
  const localType = asString(rawNodeMetadata.value.fact_type || rawNodeMetadata.value.type).toUpperCase()
  return entityTypeLabel(localType || props.entityDetail?.entityType || props.selectedNode?.entityType || '内容')
})

const previewTitle = computed(() => {
  const detailLabel = asString(props.entityDetail?.label)
  const localText = asString(rawNodeMetadata.value.text)
  return detailLabel || localText || props.selectedNode?.label || ''
})

const previewSummary = computed(() => {
  const observation = props.entityDetail?.observations?.find((item) => item && item.trim())
  const localSummary = asString(rawNodeMetadata.value.summary || rawNodeMetadata.value.observation)
  const factSummary = asString(firstFact.value?.summary)
  const candidate = observation || localSummary || factSummary
  return candidate && candidate !== previewTitle.value ? candidate : ''
})

const previewContext = computed(() => {
  const context = asString(rawNodeMetadata.value.context || firstFactMetadata.value.context)
  if (!context || context === 'N/A') return ''
  if (context === previewSummary.value || context === previewTitle.value) return ''
  return context
})

const previewMeta = computed(() => {
  const rows: Array<{ label: string; value: string }> = []
  const sourceType = asString(firstFact.value?.sourceType || nodeMetadata.value.sourceType)
  const occurredStart = formatTimestamp(rawNodeMetadata.value.occurred_start)
  const occurredEnd = formatTimestamp(rawNodeMetadata.value.occurred_end)
  const mentionedAt = formatTimestamp(rawNodeMetadata.value.mentioned_at || firstFactMetadata.value.mentioned_at)
  const lastSeenAt = formatTimestamp(detailMetadata.value.lastSeenAt || firstFactMetadata.value.lastSeenAt)
  const proofCount = Number(rawNodeMetadata.value.proof_count || 0)
  const documentLabel = (() => {
    const tags = [...asStringList(rawNodeMetadata.value.tags), ...(firstFact.value?.tags || [])]
    const directoryTag = tags.find((item) => item.startsWith('directory:'))
    if (directoryTag) {
      const directoryId = directoryTag.slice('directory:'.length)
      return props.directoryLabelMap?.[directoryId] || '目录内容'
    }
    const documentId = asString(rawNodeMetadata.value.document_id)
    if (documentId) {
      return `${documentId.slice(0, 12)}...`
    }
    return props.projectName || props.spaceName || ''
  })()

  if (sourceType) {
    rows.push({ label: '来源', value: sourceTypeLabel(sourceType) })
  }
  if (occurredStart) {
    rows.push({ label: '发生时间', value: occurredEnd && occurredEnd !== occurredStart ? `${occurredStart} → ${occurredEnd}` : occurredStart })
  }
  if (mentionedAt) {
    rows.push({ label: '提及时间', value: mentionedAt })
  } else if (lastSeenAt) {
    rows.push({ label: '最近出现', value: lastSeenAt })
  }
  if (proofCount > 1) {
    rows.push({ label: '证据数', value: `${proofCount} 条` })
  } else if (props.selectedNode?.factCount) {
    rows.push({ label: '事实数', value: `${props.selectedNode.factCount}` })
  }
  if (documentLabel) {
    rows.push({ label: '文档', value: documentLabel })
  }
  return rows
})

const previewEntities = computed(() => {
  const values = new Set<string>()
  asStringList(rawNodeMetadata.value.entities).forEach((item) => values.add(item))
  ;(props.entityDetail?.aliases || props.selectedNode?.aliases || []).slice(0, 6).forEach((item) => {
    const normalized = asString(item)
    if (normalized) values.add(normalized)
  })
  return Array.from(values).slice(0, 8)
})

const previewInvolving = computed(() => previewEntities.value.slice(0, 3).join(' | '))

const previewTags = computed(() => {
  const values = new Set<string>()
  for (const tag of [...asStringList(rawNodeMetadata.value.tags), ...(firstFact.value?.tags || [])]) {
    const label = displayTag(tag)
    if (label) values.add(label)
  }
  return Array.from(values).slice(0, 8)
})

const previewRawId = computed(() => {
  const rawEntityId = String(nodeMetadata.value.rawEntityId || '')
  return rawEntityId || props.selectedNode?.id || ''
})

const hasInstantPreview = computed(() =>
  Boolean(
    previewTitle.value
    || previewSummary.value
    || previewInvolving.value
    || previewContext.value
    || previewMeta.value.length
    || previewTags.value.length
  )
)
</script>

<style scoped>
.preview-card {
  width: min(360px, calc(100vw - 48px));
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(228, 232, 239, 0.96);
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.18),
    0 3px 10px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(10px);
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.preview-type {
  color: #60a5fa;
}

.preview-title {
  margin-top: 8px;
  color: #0f172a;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
}

.preview-summary,
.preview-involving,
.preview-context {
  margin-top: 6px;
  color: #1e293b;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.preview-involving {
  color: #111827;
}

.preview-context {
  color: #334155;
}

.preview-meta {
  margin-top: 8px;
  border-top: 1px solid rgba(226, 232, 240, 0.86);
  padding-top: 8px;
}

.preview-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.preview-meta-row + .preview-meta-row {
  margin-top: 6px;
}

.preview-meta-row span {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
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
  gap: 6px;
  margin-top: 8px;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 4px;
  background: rgba(239, 246, 255, 0.9);
  color: #60a5fa;
  font-size: 10px;
}

.preview-id {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 10px;
  font-family: Consolas, 'SFMono-Regular', monospace;
  word-break: break-all;
}

.preview-loading {
  margin-top: 8px;
}
</style>
