<template>
  <div
    ref="rootRef"
    class="markdown-editor-wrapper"
    :class="{ 'is-preview-mode': showPreviewMode, 'is-edit-mode': !showPreviewMode, 'preview-auto-height': props.previewAutoHeight }"
    :style="{ height: resolvedHeight }"
  >
    <div
      v-if="showPreviewMode"
      class="markdown-preview-shell"
      tabindex="0"
      role="button"
      aria-label="Markdown 预览，双击进入编辑态"
      @dblclick="enterEditMode"
      @keydown.enter.prevent="enterEditMode"
      @keydown.space.prevent="enterEditMode"
    >
      <div v-if="isEmpty" class="markdown-preview-placeholder">{{ placeholder }}</div>
      <MdPreview
        v-else
        :id="previewId"
        :model-value="currentValue"
        language="zh-CN"
        theme="light"
        preview-theme="github"
        code-theme="atom"
        no-mermaid
      />
    </div>
    <div v-else class="markdown-editor-shell">
      <MdEditor
        ref="editorRef"
        v-model="currentValue"
        class="markdown-editor-instance"
        language="zh-CN"
        theme="light"
        preview-theme="github"
        code-theme="atom"
        :placeholder="placeholder"
        :preview="false"
        :html-preview="false"
        input-box-width="100%"
        :style="{ height: '100%' }"
        :toolbars="editingToolbars"
        :footers="[]"
        :show-toolbar-name="false"
        :on-upload-img="handleUploadImg"
        no-mermaid
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MdEditor, MdPreview, type ExposeParam, type ToolbarNames } from 'md-editor-v3'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    height?: string | number
    preview?: boolean
    startInEditMode?: boolean
    previewAutoHeight?: boolean
    uploadImage?: (file: File) => Promise<string>
  }>(),
  {
    placeholder: '请填写内容，支持 Markdown 语法',
    height: 360,
    preview: true,
    startInEditMode: false,
    previewAutoHeight: false,
    uploadImage: undefined
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'edit-state-change': [editing: boolean]
}>()

const editorRef = ref<ExposeParam>()
const rootRef = ref<HTMLElement | null>(null)
const previewId = `markdown-preview-${Math.random().toString(36).slice(2, 10)}`

const currentValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

// 支持“可预览但首次直接进入编辑态”的场景，例如新建工作项时先输入再决定是否预览。
const isEditing = ref(!props.preview || props.startInEditMode)

const normalizedHeight = computed(() =>
  typeof props.height === 'number' ? `${props.height}px` : props.height
)

const resolvedHeight = computed(() =>
  showPreviewMode.value && props.previewAutoHeight ? 'auto' : normalizedHeight.value
)

const showPreviewMode = computed(() => props.preview && !isEditing.value)

const isEmpty = computed(() => !currentValue.value.trim())

const handleUploadImg = async (files: File[], callback: (urls: string[]) => void) => {
  if (!props.uploadImage || !files.length) {
    return
  }
  const urls = await Promise.all(files.map((file) => props.uploadImage!(file)))
  callback(urls)
}

const setEditingState = (editing: boolean) => {
  if (isEditing.value === editing) {
    return
  }
  isEditing.value = editing
  emit('edit-state-change', editing)
}

const enterEditMode = async () => {
  if (!props.preview || isEditing.value) {
    return
  }
  setEditingState(true)
  await nextTick()
  editorRef.value?.focus('end')
}

const exitEditMode = () => {
  if (!props.preview || !isEditing.value) {
    return
  }
  setEditingState(false)
}

const handleDocumentDoubleClick = (event: MouseEvent) => {
  if (!props.preview || !isEditing.value) {
    return
  }
  if (!(event.target instanceof Node)) {
    return
  }
  if (rootRef.value?.contains(event.target)) {
    return
  }
  exitEditMode()
}

onMounted(() => {
  document.addEventListener('dblclick', handleDocumentDoubleClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('dblclick', handleDocumentDoubleClick, true)
})

watch(
  [() => props.preview, () => props.startInEditMode],
  ([preview, startInEditMode]) => {
    isEditing.value = !preview || startInEditMode
  }
)

const editingToolbars: ToolbarNames[] = [
  'bold',
  'italic',
  'title',
  'strikeThrough',
  '-',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'link',
  'image',
  'table',
  'code',
  'codeRow',
  '-',
  'revoke',
  'next',
  '=',
  'fullscreen'
]
</script>

<style scoped>
.markdown-editor-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.markdown-editor-wrapper :deep(.md-editor) {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
  box-shadow: none;
}

.markdown-editor-wrapper :deep(.md-editor-toolbar-wrapper) {
  order: 0;
  flex: 0 0 auto;
}

.markdown-editor-wrapper :deep(.md-editor-content) {
  order: 1;
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}

.markdown-editor-wrapper :deep(.md-editor-toolbar) {
  padding: 0 0 12px;
  background: transparent;
  border-bottom: 1px solid rgba(137, 115, 98, 0.12);
}

.markdown-editor-wrapper :deep(.md-editor-content) {
  font-size: 14px;
}

.markdown-editor-wrapper :deep(.md-editor-input-wrapper),
.markdown-editor-wrapper :deep(.md-editor-preview-wrapper) {
  background: transparent;
}

.markdown-editor-wrapper :deep(.md-editor-toolbar-item:hover),
.markdown-editor-wrapper :deep(.md-editor-toolbar-item.active) {
  color: var(--app-primary, #904d00);
}

.markdown-preview-shell,
.markdown-editor-shell {
  flex: 1 1 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.markdown-editor-shell {
  display: flex;
  position: relative;
}

.markdown-editor-shell :deep(.md-editor) {
  flex: 1 1 auto;
  width: 100% !important;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 1px rgba(137, 115, 98, 0.14);
}

.markdown-editor-shell :deep(.md-editor-toolbar-wrapper) {
  width: 100%;
}

.markdown-editor-shell :deep(.md-editor-toolbar) {
  padding: 12px 14px;
  background: rgba(243, 244, 245, 0.92);
}

.markdown-editor-shell :deep(.md-editor-content) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.markdown-editor-shell :deep(.md-editor-content-wrapper) {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 0 !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  overflow: hidden;
}

.markdown-editor-shell :deep(.md-editor-content-wrapper > .md-editor-custom-scrollbar:first-child) {
  display: block !important;
  grid-column: 1;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  height: 100% !important;
}

.markdown-editor-shell :deep(.md-editor-input-wrapper) {
  width: 100% !important;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.markdown-editor-shell :deep(.md-editor-content-wrapper > .md-editor-custom-scrollbar:last-child) {
  display: block !important;
  grid-column: 2;
  width: 0 !important;
  max-width: 0 !important;
  min-width: 0 !important;
  overflow: hidden !important;
  pointer-events: none;
  visibility: hidden;
}

.markdown-editor-shell :deep(.md-editor-preview-wrapper),
.markdown-editor-shell :deep(.md-editor-resize-operate) {
  display: none !important;
}

.markdown-editor-shell :deep(.cm-editor),
.markdown-editor-shell :deep(.cm-scroller) {
  height: 100%;
  min-height: 0;
}

.markdown-preview-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 0;
  overflow: visible;
  border: 0;
  background: transparent;
  box-shadow: none;
  cursor: text;
}

.markdown-preview-shell:focus-visible {
  outline: 2px solid rgba(144, 77, 0, 0.28);
  outline-offset: 2px;
}

.markdown-preview-placeholder {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 12px 0;
  color: rgba(94, 74, 57, 0.56);
  font-size: 14px;
  text-align: left;
  background: transparent;
}

.markdown-preview-shell :deep(.md-editor-previewOnly) {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: auto;
  background: transparent;
}

.markdown-preview-shell :deep(.md-editor-preview) {
  min-height: 100%;
  padding: 8px 0 0;
  box-sizing: border-box;
}

.markdown-editor-wrapper.is-preview-mode.preview-auto-height,
.markdown-editor-wrapper.is-preview-mode.preview-auto-height .markdown-preview-shell,
.markdown-editor-wrapper.is-preview-mode.preview-auto-height :deep(.md-editor-previewOnly) {
  flex: 0 0 auto;
  height: auto !important;
  min-height: 0;
}

.markdown-editor-wrapper.is-preview-mode.preview-auto-height :deep(.md-editor-previewOnly) {
  overflow: visible;
}

.markdown-editor-wrapper.is-preview-mode.preview-auto-height :deep(.md-editor-preview) {
  min-height: 0;
  padding-top: 0;
}
</style>
