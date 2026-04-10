<template>
  <div class="markdown-editor-wrapper">
    <MdEditor
      v-model="currentValue"
      language="zh-CN"
      theme="light"
      preview-theme="github"
      code-theme="atom"
      :placeholder="placeholder"
      :style="{ height: normalizedHeight }"
      :toolbars="toolbars"
      :footers="[]"
      :show-toolbar-name="false"
      :on-upload-img="handleUploadImg"
      no-mermaid
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MdEditor, type ToolbarNames } from 'md-editor-v3'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    height?: string | number
    uploadImage?: (file: File) => Promise<string>
  }>(),
  {
    placeholder: '请填写内容，支持 Markdown 语法',
    height: 360,
    uploadImage: undefined
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const currentValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

const normalizedHeight = computed(() =>
  typeof props.height === 'number' ? `${props.height}px` : props.height
)

const handleUploadImg = async (files: File[], callback: (urls: string[]) => void) => {
  if (!props.uploadImage || !files.length) {
    return
  }
  const urls = await Promise.all(files.map((file) => props.uploadImage!(file)))
  callback(urls)
}

const toolbars: ToolbarNames[] = [
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
  'preview',
  'previewOnly',
  'fullscreen'
]
</script>

<style scoped>
.markdown-editor-wrapper {
  width: 100%;
}

.markdown-editor-wrapper :deep(.md-editor) {
  border-radius: 22px;
  overflow: hidden;
  border: 0;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: inset 0 0 0 1px rgba(137, 115, 98, 0.14);
}

.markdown-editor-wrapper :deep(.md-editor-toolbar) {
  padding: 12px 14px;
  background: rgba(243, 244, 245, 0.92);
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
</style>
